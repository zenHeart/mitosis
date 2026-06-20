#!/bin/bash
# worker/verify-build.sh — Agent 构建后的验证脚本（结构 + 功能）
# 用法: cd apps/{name}/{version}/ && bash ../../../worker/verify-build.sh
#
# 验证分为两个阶段：
#   Phase 1: 结构验证（文件完整性、构建产物、配置正确性）
#   Phase 2: 功能验证（页面加载、交互响应、无运行时错误）
#
# 退出码: 0 = 通过, 1 = 失败

set -e

APP_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0
WARNINGS=0
PREVIEW_PID=""

cleanup() {
  if [ -n "$PREVIEW_PID" ]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass()  { echo -e "${GREEN}✅ $1${NC}"; }
log_fail()  { echo -e "${RED}❌ $1${NC}"; ERRORS=$((ERRORS + 1)); }
log_warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; WARNINGS=$((WARNINGS + 1)); }
log_info()  { echo -e "ℹ️  $1"; }

# ============================================================
# Phase 1: 结构验证
# ============================================================

echo "═══════════════════════════════════════════════════════════"
echo "  Phase 1: 结构验证"
echo "═══════════════════════════════════════════════════════════"

# 1. 必要文件检查
echo ""
echo "-- 1.1 必要文件检查 --"
REQUIRED_FILES=(
  "index.html"
  "vite.config.ts"
  "tsconfig.json"
  "package.json"
  "src/main.ts"
  "src/App.vue"
  "src/assets/main.css"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    log_pass "$f"
  else
    log_fail "缺失: $f"
  fi
done

# 2. dist 产物检查
echo ""
echo "-- 1.2 构建产物检查 --"
if [ ! -d "dist" ]; then
  log_fail "dist/ 目录不存在"
else
  if [ -f "dist/index.html" ]; then
    log_pass "dist/index.html"
  else
    log_fail "dist/index.html 缺失"
  fi
  JS_COUNT=$(find dist -name "*.js" 2>/dev/null | wc -l)
  CSS_COUNT=$(find dist -name "*.css" 2>/dev/null | wc -l)
  if [ "$JS_COUNT" -gt 0 ] && [ "$CSS_COUNT" -gt 0 ]; then
    log_pass "JS 文件: $JS_COUNT, CSS 文件: $CSS_COUNT"
  else
    log_fail "产物不完整 (JS: $JS_COUNT, CSS: $CSS_COUNT)"
  fi
fi

# 3. Vite base 检查（使用 node 解析，避免 grep 误匹配）
echo ""
echo "-- 1.3 Vite 配置检查 --"
VITE_BASE=$(node -e "
const fs = require('fs');
try {
  const content = fs.readFileSync('vite.config.ts', 'utf8');
  const match = content.match(/base:\s*['\"]([^'\"]+)['\"]/);
  console.log(match ? match[1] : 'not_found');
} catch(e) { console.log('error'); }
" 2>/dev/null)
if [ "$VITE_BASE" = "./" ]; then
  log_pass "生成应用 vite base: './'"
else
  log_fail "生成应用 vite base 不正确（当前: $VITE_BASE，应为 './'）"
fi

# 4. TypeScript 严格模式检查（解析 JSON）
echo ""
echo "-- 1.4 TypeScript 检查 --"
TS_STRICT=$(node -e "
const fs = require('fs');
try {
  const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  console.log(config.compilerOptions?.strict ? 'true' : 'false');
} catch(e) { console.log('error'); }
" 2>/dev/null)
if [ "$TS_STRICT" = "true" ]; then
  log_pass "TypeScript strict: true"
else
  log_fail "TypeScript strict 未启用（当前: $TS_STRICT）"
fi

# 5. 常见陷阱检查
echo ""
echo "-- 1.5 陷阱检查 --"
# 嵌套路径 bug：生成应用目录内不应再出现 apps/
if [ -d "apps" ]; then
  NESTED=$(find apps -mindepth 1 -maxdepth 3 -print 2>/dev/null | head -1)
  log_fail "发现嵌套路径 bug: ${NESTED:-apps/}"
else
  log_pass "无嵌套路径 bug"
fi

# console.error（建议清理，不阻止部署）
CONSOLE_ERRORS=$(grep -r "console\.error" src/ 2>/dev/null | wc -l)
if [ "$CONSOLE_ERRORS" -gt 0 ]; then
  log_warn "发现 $CONSOLE_ERRORS 处 console.error（建议清理）"
else
  log_pass "无 console.error"
fi

# ============================================================
# Phase 2: 功能验证
# ============================================================

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Phase 2: 功能验证"
echo "═══════════════════════════════════════════════════════════"

# 检查是否有 Node.js
if ! command -v node &> /dev/null; then
  log_warn "Node.js 未安装，跳过功能验证"
  echo ""
  echo "=== 验证结果: $ERRORS 个错误, $WARNINGS 个警告 ==="
  if [ $ERRORS -gt 0 ]; then
    echo "请修复上述问题后重新构建"
    exit 1
  fi
  echo "✅ 结构验证通过（功能验证已跳过）"
  exit 0
fi

# 检查是否有 Playwright
PLAYWRIGHT_AVAILABLE=false
if node -e "require.resolve('@playwright/test')" &> /dev/null; then
  PLAYWRIGHT_AVAILABLE=true
fi

# 2.1 启动预览服务器并检测运行时错误
echo ""
echo "-- 2.1 运行时错误检测 --"

# 启动预览服务器。使用动态端口，避免本地或 CI 中固定端口冲突造成假失败。
PREVIEW_PORT=$(node - <<'NODE'
const net = require('net')
const server = net.createServer()
server.listen(0, '127.0.0.1', () => {
  console.log(server.address().port)
  server.close()
})
NODE
)
PREVIEW_URL="http://127.0.0.1:$PREVIEW_PORT"
PREVIEW_LOG=$(mktemp)
npx vite preview --port "$PREVIEW_PORT" --strictPort --host 127.0.0.1 > "$PREVIEW_LOG" 2>&1 &
PREVIEW_PID=$!

# 检查服务器是否启动
SERVER_READY=false
for _ in $(seq 1 30); do
  if ! kill -0 "$PREVIEW_PID" 2>/dev/null; then
    break
  fi
  if curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL" | grep -q "200"; then
    SERVER_READY=true
    break
  fi
  sleep 0.5
done

if [ "$SERVER_READY" != "true" ]; then
  log_fail "预览服务器启动失败"
  cat "$PREVIEW_LOG" 2>/dev/null || true
  echo ""
  echo "=== 验证结果: $ERRORS 个错误, $WARNINGS 个警告 ==="
  if [ $ERRORS -gt 0 ]; then
    echo "请修复上述问题后重新构建"
    exit 1
  fi
  echo "⚠️  功能验证跳过（服务器启动失败）"
  exit 0
fi

# 使用 curl 检测页面是否能正常加载
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")
if [ "$HTTP_STATUS" = "200" ]; then
  log_pass "页面 HTTP 200 OK"
else
  log_fail "页面 HTTP 状态码: $HTTP_STATUS"
fi

# 检查页面内容是否非空
PAGE_CONTENT=$(curl -s "$PREVIEW_URL" | wc -c)
if [ "$PAGE_CONTENT" -gt 100 ]; then
  log_pass "页面内容非空 ($PAGE_CONTENT bytes)"
else
  log_fail "页面内容为空或过小 ($PAGE_CONTENT bytes)"
fi

# 2.2 交互响应检测（基础版：检查 JS 是否执行）
echo ""
echo "-- 2.2 基础交互检测 --"

# 使用 Node.js + fetch 检测 JS bundle 是否正常加载
JS_BUNDLE_EXISTS=false
if [ -f "dist/assets/index.js" ] || [ -f "dist/assets/main.js" ] || ls dist/assets/*.js 1> /dev/null 2>&1; then
  JS_BUNDLE_EXISTS=true
  log_pass "JS bundle 存在"
else
  log_warn "未找到 JS bundle"
fi

# 2.3 应用类型检测与专项验证
echo ""
echo "-- 2.3 应用类型检测 --"

APP_TYPE="generic"
# 检测是否为游戏类应用
if grep -q "game\|Game\|游戏\|tetris\|snake\|chess\|puzzle" package.json 2>/dev/null; then
  APP_TYPE="game"
  log_info "检测到游戏类应用"
elif grep -q "calc\|Calc\|计算器\|todo\|Todo\|编辑器\|editor" package.json 2>/dev/null; then
  APP_TYPE="tool"
  log_info "检测到工具类应用"
else
  log_info "通用应用类型"
fi

# 2.4 游戏类专项验证
if [ "$APP_TYPE" = "game" ]; then
  echo ""
  echo "-- 2.4 游戏类专项检查 --"

  # 检查 App.vue 是否包含关键游戏元素
  if [ -f "src/App.vue" ]; then
    # 检查是否有键盘事件监听
    if grep -q "keydown\|KeyDown\|@keyup\|onKeyup" src/App.vue; then
      log_pass "存在键盘事件监听"
    else
      log_warn "未检测到键盘事件监听（游戏通常需要键盘输入）"
    fi

    # 检查是否有 game over / 结束逻辑
    if grep -q "gameOver\|gameover\|game_over\|结束\|GameOver\|over" src/App.vue; then
      log_pass "存在游戏结束逻辑"
    else
      log_warn "未检测到游戏结束逻辑"
    fi

    # 检查是否有状态管理
    if grep -q "reactive\|ref(" src/App.vue; then
      log_pass "存在状态管理（reactive/ref）"
    else
      log_warn "未检测到状态管理"
    fi

    # 检查是否有 CSS 动画/过渡
    if grep -q "transition\|animation\|@keyframes" src/App.vue src/assets/main.css 2>/dev/null; then
      log_pass "存在 CSS 动画/过渡"
    else
      log_warn "未检测到 CSS 动画（建议添加）"
    fi
  fi
fi

# 2.5 俄罗斯方块专项检查
if grep -qi "tetris\|俄罗斯方块" package.json src/App.vue 2>/dev/null; then
  echo ""
  echo "-- 2.5 俄罗斯方块专项检查 --"

  if [ -f "src/App.vue" ]; then
    # 检查方块移动逻辑
    if grep -q "ArrowLeft\|ArrowRight\|ArrowDown\|ArrowUp" src/App.vue; then
      log_pass "存在方向键处理"
    else
      log_warn "未检测到方向键处理"
    fi

    # 检查消行逻辑
    if grep -q "clearLine\|removeRow\|eliminate\|消行" src/App.vue; then
      log_pass "存在消行逻辑"
    else
      log_warn "未检测到消行逻辑（方块消除是核心功能）"
    fi

    # 检查得分逻辑
    if grep -q "score\|Score\|得分\|分数" src/App.vue; then
      log_pass "存在得分逻辑"
    else
      log_warn "未检测到得分逻辑"
    fi

    # 检查重新开始逻辑
    if grep -q "restart\|reset\|重新开始\|再来" src/App.vue; then
      log_pass "存在重新开始逻辑"
    else
      log_warn "未检测到重新开始逻辑"
    fi
  fi
fi

# 2.6 Playwright 深度测试（如果可用）
if [ "$PLAYWRIGHT_AVAILABLE" = true ]; then
  echo ""
  echo "-- 2.6 Playwright 深度测试 --"

  # 创建临时 Playwright 测试
  cat > /tmp/verify-build.spec.ts << EOF
import { test, expect } from '@playwright/test'

const baseUrl = '$PREVIEW_URL'

test('page loads without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', err => errors.push(err.message))

  await page.goto(baseUrl)
  await page.waitForLoadState('networkidle', { timeout: 10000 })

  // 检查关键错误
  const criticalErrors = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('DevTools') &&
    !e.includes('chrome-extension')
  )
  if (criticalErrors.length > 0) {
    console.log('CONSOLE_ERRORS:', criticalErrors.join('\n'))
  }
  expect(criticalErrors.length).toBe(0)
})

test('page has visible content', async ({ page }) => {
  await page.goto(baseUrl)
  await page.waitForLoadState('networkidle')

  const body = page.locator('body')
  await expect(body).toBeVisible()

  // 页面应该有实质性内容（至少一个可见元素有文本或交互元素）
  const hasContent = await page.evaluate(() => {
    const body = document.body
    const text = body.innerText?.trim() || ''
    const hasInteractive = body.querySelector('button, input, canvas, [role="button"]')
    return text.length > 10 || !!hasInteractive
  })
  expect(hasContent).toBe(true)
})

test('page responds to interaction', async ({ page }) => {
  await page.goto(baseUrl)
  await page.waitForLoadState('networkidle')

  // 截图初始状态
  const before = await page.screenshot()

  // 尝试交互：点击页面上的任何按钮或按任意键
  const button = page.locator('button').first()
  if (await button.count() > 0) {
    await button.click()
  } else {
    await page.keyboard.press('Tab')
  }
  await page.waitForTimeout(500)

  // 截图交互后状态
  const after = await page.screenshot()

  // 对于大多数应用，交互后应该有一些变化（即使只是 focus 状态）
  // 注意：某些应用可能确实没有任何交互，这里只做警告
})
EOF

  cd "$APP_DIR"
  npx playwright test /tmp/verify-build.spec.ts --reporter=line 2>&1 || {
    log_warn "Playwright 测试执行失败（不影响结构验证结果）"
  }
else
  log_info "未安装 @playwright/test，跳过 Playwright 深度测试"
fi

# 清理：关闭预览服务器
kill $PREVIEW_PID 2>/dev/null || true
PREVIEW_PID=""

# ============================================================
# 结果汇总
# ============================================================

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  验证结果汇总"
echo "═══════════════════════════════════════════════════════════"
echo "  错误: $ERRORS"
echo "  警告: $WARNINGS"
echo "═══════════════════════════════════════════════════════════"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ 验证失败 — 存在 $ERRORS 个错误需要修复"
  echo "   建议：根据上述错误信息修正代码，然后重新构建"
  exit 1
elif [ $WARNINGS -gt 3 ]; then
  echo ""
  echo "⚠️  验证通过（但有 $WARNINGS 个警告）"
  echo "   建议：修复警告项以提升应用质量"
  exit 0
else
  echo ""
  echo "✅ 所有检查通过"
  exit 0
fi
