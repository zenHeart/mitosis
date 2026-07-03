#!/usr/bin/env bash
# main-pipeline.sh — Mitosis 主链路回归守卫（CI-runnable，不依赖本地 .claude runtime）
#
# 只校验"必须永不回归"的不变量；尚未完成的黄金指标由 scripts/verify/e2e-golden.mjs 跟踪。
# 用法: RUN_BUILD=1 bash scripts/verify/main-pipeline.sh   末行: MAIN_PIPELINE: PASS / FAIL
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
FAIL=0
note() { printf '  %s\n' "$1"; }

echo "== 1. 无硬编码 token/secret（仅扫描发往浏览器的 app 代码）=="
# 仅扫 src/ 与 worker/src/（真正会打包/运行的代码）；排除文档与 detection 脚本本身
if rg -n -i "(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})" \
     -g '!*.md' src/ worker/src/ 2>/dev/null; then
  note "FAIL: app 代码中发现疑似硬编码密钥"; FAIL=1
else note "PASS"; fi

echo "== 2. CI Owner 门控未被破坏 =="
if rg -q '\$\{\{\s*github\.event\.(issue|comment)\.user\.login|\$ACTOR.*\$REPO_OWNER' .github/workflows/mitosis.yml 2>/dev/null; then
  note "PASS"; else note "FAIL: mitosis.yml owner 门控缺失"; FAIL=1; fi

echo "== 3. DOMPurify ALLOWED_ATTR 白名单内无 on* 事件 =="
# 仅提取 ALLOWED_ATTR = [...] 数组本体，避免误伤同文件的 FORBID_ATTR
ALLOWED_BLOCK=$(awk '/ALLOWED_ATTR *= *\[/{f=1} f{print} /\]/{if(f)f=0}' src/composables/useSanitize.ts 2>/dev/null)
if printf '%s' "$ALLOWED_BLOCK" | rg -qi "on(click|error|load|mouse|focus|blur|change|submit)"; then
  note "FAIL: ALLOWED_ATTR 含 on* 事件"; FAIL=1
else note "PASS"; fi

echo "== 3b. 前端创建 Issue 后自动评论 /create 触发 CI =="
# 验证 Workspace.vue 中 createBuild/createPlatformBuild 在 createIssue 之后调用 createIssueComment('/create')
if rg -q "createIssueComment\(.*,\s*'/create'\)" src/components/Workspace.vue 2>/dev/null; then
  # 进一步验证调用的位置在 createIssue 之后（同函数内）
  if awk '/createIssue\(/,/\}$/' src/components/Workspace.vue 2>/dev/null | rg -q "createIssueComment"; then
    note "PASS"; else note "FAIL: createIssueComment 未在 createIssue 后调用"; FAIL=1; fi
else
  note "FAIL: Workspace.vue 缺少 createIssueComment('/create') 调用"; FAIL=1
fi

echo "== 4. 消息渲染经过 sanitize =="
if rg -n 'v-html="[^"]*\b(msg|message)\.(text|content|body)\b' src/ 2>/dev/null | rg -qv 'sanitize'; then
  note "FAIL: 存在未 sanitize 的 v-html 用户内容"; FAIL=1
else note "PASS"; fi

echo "== 4b. Token 不写入 localStorage（仅允许 sessionStorage）=="
# 检查代码中是否有 localStorage.setItem 写入 token/secret/password/api_key
if rg -n "localStorage\.setItem.*(token|secret|password|api_key|access_token)" src/ -i 2>/dev/null | grep -v "// "; then
  note "FAIL: 发现 localStorage 写入敏感字段"; FAIL=1
else note "PASS"; fi

echo "== 4c. Token 不渲染到 DOM =="
if rg -n "(v-html|innerHTML|document\.write).*(token|secret|password|api_key|access_token)" src/ -i 2>/dev/null | grep -v "// "; then
  note "FAIL: 发现敏感字段渲染到 DOM"; FAIL=1
else note "PASS"; fi

if [ "${RUN_BUILD:-0}" = "1" ]; then
  echo "== 5. typecheck + build =="
  if npm run typecheck >/tmp/mp-tc.log 2>&1 && npm run build >/tmp/mp-build.log 2>&1; then
    note "PASS"; else note "FAIL: typecheck/build（见 /tmp/mp-*.log）"; FAIL=1; fi
fi

echo
if [ "$FAIL" = "0" ]; then echo "MAIN_PIPELINE: PASS"; exit 0; else echo "MAIN_PIPELINE: FAIL"; exit 1; fi
