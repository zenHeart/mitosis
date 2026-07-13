#!/usr/bin/env bash
# main-pipeline.sh — Mitosis 主链路回归守卫（CI-runnable，不依赖本地 .claude runtime）
#
# 只校验"必须永不回归"的不变量；尚未完成的黄金指标由 scripts/verify/e2e-golden.mjs 跟踪。
# 用法: RUN_BUILD=1 bash scripts/verify/main-pipeline.sh   末行: MAIN_PIPELINE: PASS / FAIL
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
FAIL=0
note() { printf '  %s\n' "$1"; }

echo "== 0. StepFun 只能使用 Step Plan 端点（纯静态、无网络）=="
if bash scripts/verify/step-plan-endpoints.sh && bash scripts/verify/step-plan-endpoints.test.sh; then
  note "PASS"
else
  note "FAIL: 发现普通计费或非 Step Plan 端点"
  FAIL=1
fi

echo "== 0b. 线上版本标记校验器离线负向测试 =="
if bash scripts/verify/production-sha.test.sh; then
  note "PASS"
else
  note "FAIL: production SHA 校验器存在假绿"
  FAIL=1
fi

echo "== 0c. Claude CI 保留受限文件工具且不降级写入模式 =="
SAFE_MODE_COUNT=$(grep -c -- '--safe-mode' .github/workflows/mitosis.yml 2>/dev/null || true)
if [ "$SAFE_MODE_COUNT" = "2" ] &&
   ! grep -q -- '--bare' .github/workflows/mitosis.yml 2>/dev/null &&
   grep -qF '"CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "0"' .github/claude-ci-settings.json 2>/dev/null &&
   [ "$(grep -cF -- '--permission-mode dontAsk' .github/workflows/mitosis.yml 2>/dev/null || true)" = "1" ] &&
   [ "$(grep -cF -- '--permission-mode acceptEdits' .github/workflows/mitosis.yml 2>/dev/null || true)" = "1" ] &&
   [ "$(grep -cF -- '--tools "Read,Glob,Grep"' .github/workflows/mitosis.yml 2>/dev/null || true)" = "1" ] &&
   [ "$(grep -cF -- '--allowedTools "Read,Glob,Grep"' .github/workflows/mitosis.yml 2>/dev/null || true)" = "1" ] &&
   [ "$(grep -cF -- '--tools "Read,Write,Edit,Glob,Grep"' .github/workflows/mitosis.yml 2>/dev/null || true)" = "1" ] &&
   [ "$(grep -cF -- '--allowedTools "Read,Write,Edit,Glob,Grep"' .github/workflows/mitosis.yml 2>/dev/null || true)" = "1" ] &&
   [ "$(grep -cF -- '--disallowed-tools "Bash,WebFetch,WebSearch,Task,Agent,Skill,NotebookEdit"' .github/workflows/mitosis.yml 2>/dev/null || true)" = "2" ]; then
  note "PASS"
else
  note "FAIL: Claude CI 工具集、禁止项或写入权限模式发生漂移"
  FAIL=1
fi

echo "== 0d. 候选元数据与失败关闭契约离线测试 =="
if bash scripts/verify/ci-artifact.test.sh; then
  note "PASS"
else
  note "FAIL: 候选元数据或 Claude 结果门控存在回归"
  FAIL=1
fi

echo "== 0e. Claude 事件日志隐私负向测试 =="
if bash scripts/verify/claude-stream-log.test.sh; then
  note "PASS"
else
  note "FAIL: Claude 日志可能泄露 Issue、模型文本或工具输入"
  FAIL=1
fi

echo "== 0f. 独立 verifier 可读边界与日志隐私守卫 =="
if grep -qF 'setfacl -m u:mitosis-verifier:r-x "$ROOT"' worker/ci-verify-candidate.sh 2>/dev/null &&
   grep -qF 'failure_class=' worker/ci-verify-candidate.sh 2>/dev/null &&
   ! grep -qF '[preview-base64]' worker/ci-verify-candidate.sh 2>/dev/null &&
   grep -qF 'acl iproute2' .github/workflows/mitosis.yml 2>/dev/null; then
  note "PASS"
else
  note "FAIL: verifier 可能无法读取 checkout 或泄露候选日志原文"
  FAIL=1
fi

echo "== 1. 无硬编码 token/secret（仅扫描发往浏览器的 app 代码）=="
# 仅扫 src/ 与 worker/src/（真正会打包/运行的代码）；排除文档与 detection 脚本本身
if grep -rniE "(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})" \
     src/ worker/src/ 2>/dev/null; then
  note "FAIL: app 代码中发现疑似硬编码密钥"; FAIL=1
else note "PASS"; fi

echo "== 2. CI Owner 门控未被破坏 =="
if grep -qF 'github.actor == github.repository_owner' .github/workflows/mitosis.yml 2>/dev/null &&
   grep -qF "authorized = body.strip == '/create'" .github/workflows/mitosis.yml 2>/dev/null; then
  note "PASS"
else
  note "FAIL: mitosis.yml 缺少仓库 Owner 门控或精确 /create 命令校验"; FAIL=1
fi

echo "== 3. DOMPurify ALLOWED_ATTR 白名单内无 on* 事件 =="
# 仅提取 ALLOWED_ATTR = [...] 数组本体，避免误伤同文件的 FORBID_ATTR
ALLOWED_BLOCK=$(awk '/ALLOWED_ATTR *= *\[/{f=1} f{print} /\]/{if(f)f=0}' src/composables/useSanitize.ts 2>/dev/null)
if printf '%s' "$ALLOWED_BLOCK" | grep -qiE "on(click|error|load|mouse|focus|blur|change|submit)"; then
  note "FAIL: ALLOWED_ATTR 含 on* 事件"; FAIL=1
else note "PASS"; fi

echo "== 3b. 前端创建 Issue 后自动评论 /create 触发 CI =="
# 对每条 Issue 创建路径逐一断言后续存在对应触发；兼容 macOS 自带 Bash 3。
if ruby -e '
  lines = File.readlines(ARGV.fetch(0))
  creates = lines.each_index.select { |index| lines[index].include?("const issue = await createIssue(") }
  triggers = lines.each_index.select { |index| lines[index].include?("await createIssueComment(token, repo.value, issue.number, '\''/create'\'')") }
  valid = !creates.empty? && creates.length == triggers.length && creates.zip(triggers).all? { |create, trigger| trigger > create }
  exit(valid ? 0 : 1)
' src/components/Workspace.vue; then
  note "PASS"
else
  note "FAIL: createIssue 与自动 /create 触发路径数量或顺序不一致"; FAIL=1
fi

echo "== 4. 消息渲染经过 sanitize =="
if grep -rnE 'v-html="[^"]*\b(msg|message)\.(text|content|body)\b' src/ 2>/dev/null | grep -qvE 'sanitize'; then
  note "FAIL: 存在未 sanitize 的 v-html 用户内容"; FAIL=1
else note "PASS"; fi

echo "== 4b. Token 不写入 localStorage（仅允许 sessionStorage）=="
# 检查代码中是否有 localStorage.setItem 写入 token/secret/password/api_key
if grep -rniE "localStorage\.setItem.*(token|secret|password|api_key|access_token)" src/ 2>/dev/null | grep -v "// "; then
  note "FAIL: 发现 localStorage 写入敏感字段"; FAIL=1
else note "PASS"; fi

echo "== 4c. Token 不渲染到 DOM =="
if grep -rniE "(v-html|innerHTML|document\.write).*(token|secret|password|api_key|access_token)" src/ 2>/dev/null | grep -v "// "; then
  note "FAIL: 发现敏感字段渲染到 DOM"; FAIL=1
else note "PASS"; fi

if [ "${RUN_BUILD:-0}" = "1" ]; then
  echo "== 5. typecheck + build =="
  if npm run typecheck >/tmp/mp-tc.log 2>&1 && npm run build >/tmp/mp-build.log 2>&1; then
    if STEP_PLAN_SCAN_PATHS=dist bash scripts/verify/step-plan-endpoints.sh; then
      note "PASS"
    else
      note "FAIL: 构建产物含非 Step Plan 地址"
      FAIL=1
    fi
  else note "FAIL: typecheck/build（见 /tmp/mp-*.log）"; FAIL=1; fi
fi

echo
if [ "$FAIL" = "0" ]; then echo "MAIN_PIPELINE: PASS"; exit 0; else echo "MAIN_PIPELINE: FAIL"; exit 1; fi
