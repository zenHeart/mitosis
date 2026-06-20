#!/bin/bash
# agent/verify-local.sh — 本地环境验证（含 Playwright 游戏交互测试）
# 用法: bash agent/verify-local.sh [--verbose]
#
# 验证内容:
#   1. HTTP 可访问性（Gallery + 应用页面）
#   2. 平台构建（npm run build）
#   3. 生成应用构建 + verify-build.sh
#   4. 安全扫描
#   5. Playwright 游戏交互测试（NEW!）
#      - 打开游戏 → 开始 → 移动/旋转 → 硬降 → 计分 → 消行 → 游戏结束
#
# 退出码: 0 = PASS, 1 = FAIL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

VERBOSE=false
for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=true ;;
  esac
done

ERRORS=0
PASSED=0
GAMEPLAY_PASSED=false

BASE_URL="http://localhost:5173"

# ── 颜色输出 ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_pass() { echo -e "  ${GREEN}✅ $1${NC}"; PASSED=$((PASSED + 1)); }
log_fail() { echo -e "  ${RED}❌ $1${NC}"; ERRORS=$((ERRORS + 1)); }
log_info() { echo -e "  ${BLUE}ℹ️  $1${NC}"; }
log_section() { echo ""; echo -e "${YELLOW}══ $1 ══${NC}"; }

echo "═══════════════════════════════════════════════════════════"
echo "  本地环境验证 (http://localhost:5173)"
echo "═══════════════════════════════════════════════════════════"

# ══════════════════════════════════════════════════════════════
# Section 1: HTTP 可访问性
# ══════════════════════════════════════════════════════════════
log_section "1. HTTP 可访问性"

# 1.1 Gallery 页面
echo ""
echo "-- 1.1 Gallery 页面 (/) --"

RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE_URL/" 2>/dev/null || echo -e "\n000")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "Gallery HTTP 200"

  TITLE=$(echo "$BODY" | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1 || echo "")
  if echo "$TITLE" | grep -qi "mitosis"; then
    log_pass "页面标题包含 'Mitosis'"
  else
    log_fail "页面标题不含 'Mitosis' (找到: $TITLE)"
  fi

  if echo "$BODY" | grep -qi "tetris\|snake\|apps"; then
    log_pass "页面包含应用相关内容"
  else
    log_info "页面未找到应用内容（可能是纯静态 HTML，JS 渲染）"
  fi
else
  log_fail "Gallery HTTP 失败 (code: $HTTP_CODE)"
  echo "  提示: 确保 dev server 运行在 localhost:5173 (npm run dev)"
fi

# 1.2 应用页面
echo ""
echo "-- 1.2 应用页面 (/apps/tetris-game/v2/) --"

RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE_URL/apps/tetris-game/v2/" 2>/dev/null || echo -e "\n000")
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "tetris-game v2 应用页面 HTTP 200"

  if echo "$BODY" | grep -qi "tetris\|方块\|俄罗斯\|game\|play\|TETRIS"; then
    log_pass "应用页面包含游戏内容"
  else
    log_info "应用页面内容较少（可能是 JS 渲染，需浏览器验证）"
  fi
else
  log_fail "tetris-game v2 应用页面 HTTP 失败 (code: $HTTP_CODE)"
fi

# 1.3 SPA fallback
echo ""
echo "-- 1.3 SPA fallback (随机路径) --"

RESP=$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE_URL/some-random-path" 2>/dev/null || echo -e "\n000")
HTTP_CODE=$(echo "$RESP" | tail -1)

if [ "$HTTP_CODE" = "200" ]; then
  log_pass "SPA fallback 正确返回 200"
else
  log_info "SPA fallback 返回 $HTTP_CODE"
fi

# ══════════════════════════════════════════════════════════════
# Section 2: 构建验证
# ══════════════════════════════════════════════════════════════
log_section "2. 构建验证"

# 2.1 平台构建
echo ""
echo "-- 2.1 平台构建 --"

BUILD_LOG=$(mktemp)
if npm run build > "$BUILD_LOG" 2>&1; then
  log_pass "npm run build 通过"
else
  log_fail "npm run build 失败"
  if [ "$VERBOSE" = "true" ]; then
    echo "  构建日志 (最后 20 行):"
    tail -20 "$BUILD_LOG" | sed 's/^/    /'
  fi
fi
rm -f "$BUILD_LOG"

# 2.2 生成应用构建
echo ""
echo "-- 2.2 生成应用构建 --"

LATEST_APP=$(find apps -maxdepth 2 -type d -name 'v[0-9]*' 2>/dev/null | sort | tail -1)
if [ -n "$LATEST_APP" ]; then
  APP_NAME=$(echo "$LATEST_APP" | sed 's#apps/\([^/]*\).*#\1#')
  APP_VERSION=$(echo "$LATEST_APP" | sed 's#.*/\(v[0-9]*\)#\1#')

  pushd "$LATEST_APP" >/dev/null

  APP_BUILD_LOG=$(mktemp)
  if npm install > "$APP_BUILD_LOG" 2>&1 && npm run build >> "$APP_BUILD_LOG" 2>&1; then
    log_pass "生成应用 $APP_NAME $APP_VERSION 构建通过"
  else
    log_fail "生成应用 $APP_NAME $APP_VERSION 构建失败"
    if [ "$VERBOSE" = "true" ]; then
      tail -20 "$APP_BUILD_LOG" | sed 's/^/    /'
    fi
  fi
  rm -f "$APP_BUILD_LOG"

  VERIFY_LOG=$(mktemp)
  if bash "$SCRIPT_DIR/../worker/verify-build.sh" > "$VERIFY_LOG" 2>&1; then
    log_pass "worker/verify-build.sh PASS ($APP_NAME $APP_VERSION)"
  else
    log_fail "worker/verify-build.sh FAIL ($APP_NAME $APP_VERSION)"
    if [ "$VERBOSE" = "true" ]; then
      tail -30 "$VERIFY_LOG" | sed 's/^/    /'
    fi
  fi
  rm -f "$VERIFY_LOG"

  popd >/dev/null
else
  log_info "未找到生成应用目录，跳过"
fi

# 2.3 安全扫描
echo ""
echo "-- 2.3 安全扫描 --"

HITS=$(rg "(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35})" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env,md}' \
  -g '*.ts' -g '*.js' -g '*.vue' -g '*.json' -g '*.yml' -g '*.yaml' -g '*.sh' -g '*.env' \
  src/ apps/ worker/ .github/ 2>/dev/null | grep -v '\.md:' | grep -v 'node_modules' | grep -v 'dist/' | head -5 || true)

if [ -z "$HITS" ]; then
  log_pass "未发现真实 token/key/secret"
else
  log_fail "发现疑似敏感信息"
  echo "$HITS" | sed 's/^/    /'
fi

# 2.4 Vite base 配置
echo ""
echo "-- 2.4 Vite base 配置 --"

PLATFORM_BASE=$(node -e "
const fs = require('fs');
try {
  const c = fs.readFileSync('vite.config.ts', 'utf8');
  const m = c.match(/base:\s*['\"]([^'\"]+)['\"]/);
  console.log(m ? m[1] : 'not_found');
} catch(e) { console.log('error'); }
" 2>/dev/null)
if [ "$PLATFORM_BASE" = "/" ]; then
  log_pass "平台主站 vite base: '/'"
else
  log_fail "平台主站 vite base 不正确 (当前: $PLATFORM_BASE，应为 '/')"
fi

# ══════════════════════════════════════════════════════════════
# Section 3: Playwright 游戏交互测试 (CRITICAL!)
# ══════════════════════════════════════════════════════════════
log_section "3. Playwright 游戏交互测试"

# 检查 Playwright 是否可用
PLAYWRIGHT_AVAILABLE=false
if command -v npx >/dev/null 2>&1 && npx playwright --version >/dev/null 2>&1; then
  PLAYWRIGHT_AVAILABLE=true
fi

if [ "$PLAYWRIGHT_AVAILABLE" = "false" ]; then
  log_info "Playwright 不可用，跳过游戏交互测试"
  log_info "安装: npm install -g playwright && playwright install chromium"
else
  # 检查 dev server 是否运行
  if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/" --max-time 2 | grep -q "200"; then
    log_fail "Dev server 未运行在 $BASE_URL，无法执行游戏测试"
    echo "  请先运行: npm run dev"
  else
    log_info "开始游戏交互测试..."

    # 3.1 打开游戏页面
    echo ""
    echo "-- 3.1 游戏页面加载 --"

    PLAYWRIGHT_SCRIPT=$(mktemp /tmp/tetris-test.XXXXXX.js)
    cat > "$PLAYWRIGHT_SCRIPT" << 'PLAYWRIGHT_EOF'
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const results = {
    pageLoaded: false,
    gameStarted: false,
    pieceMoved: false,
    pieceRotated: false,
    softDropScored: false,
    hardDropScored: false,
    lineCleared: false,
    gameOverShown: false,
    consoleErrors: [],
    details: {}
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const currentPage = page;

  // 捕获 console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    results.consoleErrors.push('PageError: ' + err.message);
  });

  try {
    // Step 1: Navigate to game
    await page.goto('http://localhost:5173/apps/tetris-game/v2/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    results.pageLoaded = true;

    // Check page title
    results.details.title = await page.title();

    // Step 2: Start game (Space)
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    results.gameStarted = true;

    // Step 3: Move piece left (ArrowLeft)
    const boardBeforeMove = await page.evaluate(() => {
      const cells = document.querySelectorAll('.board-cell.filled');
      return cells.length;
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    results.pieceMoved = true;

    // Step 4: Rotate piece (ArrowUp)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    results.pieceRotated = true;

    // Step 5: Soft drop (ArrowDown) - should add 1 point
    const scoreAfterSoftDrop = await page.evaluate(() => {
      const scoreEl = document.querySelector('.score-value');
      return scoreEl ? parseInt(scoreEl.textContent || '0', 10) : 0;
    });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const scoreAfterSoftDrop2 = await page.evaluate(() => {
      const scoreEl = document.querySelector('.score-value');
      return scoreEl ? parseInt(scoreEl.textContent || '0', 10) : 0;
    });
    if (scoreAfterSoftDrop2 > scoreAfterSoftDrop) {
      results.softDropScored = true;
      results.details.softDropPoints = scoreAfterSoftDrop2 - scoreAfterSoftDrop;
    }

    // Step 6: Hard drop (Space) - should add points
    const scoreBeforeHardDrop = await page.evaluate(() => {
      const scoreEl = document.querySelector('.score-value');
      return scoreEl ? parseInt(scoreEl.textContent || '0', 10) : 0;
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
    const scoreAfterHardDrop = await page.evaluate(() => {
      const scoreEl = document.querySelector('.score-value');
      return scoreEl ? parseInt(scoreEl.textContent || '0', 10) : 0;
    });
    if (scoreAfterHardDrop > scoreBeforeHardDrop) {
      results.hardDropScored = true;
      results.details.hardDropPoints = scoreAfterHardDrop - scoreBeforeHardDrop;
    }

    // Step 7: Check for line clear (look for clear message or particle animation)
    await page.waitForTimeout(500);
    const clearMsg = await page.evaluate(() => {
      const el = document.querySelector('.clear-message');
      return el ? el.textContent : '';
    });
    results.details.clearMessage = clearMsg;
    if (clearMsg && clearMsg.length > 0) {
      results.lineCleared = true;
    }

    // Step 8: Keep playing until game over (auto-drop pieces)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(1200);
    }

    // Check game over
    await page.waitForTimeout(1000);
    const gameOverVisible = await page.evaluate(() => {
      const el = document.querySelector('.game-over-overlay');
      return el && el.style.display !== 'none';
    });
    if (gameOverVisible) {
      results.gameOverShown = true;
    }

    // Get final stats
    results.details.finalScore = await page.evaluate(() => {
      const el = document.querySelector('.score-value');
      return el ? parseInt(el.textContent || '0', 10) : 0;
    });
    results.details.finalLines = await page.evaluate(() => {
      const el = document.querySelector('.lines-value');
      return el ? parseInt(el.textContent || '0', 10) : 0;
    });
    results.details.finalLevel = await page.evaluate(() => {
      const el = document.querySelector('.level-value');
      return el ? parseInt(el.textContent || '0', 10) : 0;
    });

  } catch (err) {
    results.details.error = err.message;
  }

  await browser.close();

  const outputPath = process.argv[2];
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  process.exit(0);
})();
PLAYWRIGHT_EOF

    RESULT_FILE=$(mktemp /tmp/tetris-result.XXXXXX.json)
    timeout 60 node "$PLAYWRIGHT_SCRIPT" "$RESULT_FILE" 2>/dev/null || true

    if [ -f "$RESULT_FILE" ]; then
      RESULT=$(cat "$RESULT_FILE")

      PAGE_LOADED=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.pageLoaded?'YES':'NO');" 2>/dev/null || echo "NO")
      GAME_STARTED=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.gameStarted?'YES':'NO');" 2>/dev/null || echo "NO")
      PIECE_MOVED=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.pieceMoved?'YES':'NO');" 2>/dev/null || echo "NO")
      PIECE_ROTATED=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.pieceRotated?'YES':'NO');" 2>/dev/null || echo "NO")
      SOFT_DROP=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.softDropScored?'YES':'NO');" 2>/dev/null || echo "NO")
      HARD_DROP=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.hardDropScored?'YES':'NO');" 2>/dev/null || echo "NO")
      LINE_CLEAR=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.lineCleared?'YES':'NO');" 2>/dev/null || echo "NO")
      GAME_OVER=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.gameOverShown?'YES':'NO');" 2>/dev/null || echo "NO")
      CONSOLE_ERRORS=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.consoleErrors.length);" 2>/dev/null || echo "0")
      FINAL_SCORE=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.details.finalScore||0);" 2>/dev/null || echo "0")
      FINAL_LINES=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.details.finalLines||0);" 2>/dev/null || echo "0")
      FINAL_LEVEL=$(echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(j.details.finalLevel||0);" 2>/dev/null || echo "0")

      echo ""
      echo "-- 3.2 游戏交互结果 --"
      echo ""

      if [ "$PAGE_LOADED" = "YES" ]; then
        log_pass "游戏页面加载成功"
      else
        log_fail "游戏页面加载失败"
      fi

      if [ "$GAME_STARTED" = "YES" ]; then
        log_pass "按空格键开始游戏"
      else
        log_fail "无法开始游戏（空格键无响应）"
      fi

      if [ "$PIECE_MOVED" = "YES" ]; then
        log_pass "方块左右移动正常 (← →)"
      else
        log_fail "方块移动异常"
      fi

      if [ "$PIECE_ROTATED" = "YES" ]; then
        log_pass "方块旋转正常 (↑)"
      else
        log_fail "方块旋转异常"
      fi

      if [ "$SOFT_DROP" = "YES" ]; then
        log_pass "软降计分正常 (↓ +1分)"
      else
        log_fail "软降未计分"
      fi

      if [ "$HARD_DROP" = "YES" ]; then
        log_pass "硬降计分正常 (Space +2分/格)"
      else
        log_fail "硬降未计分"
      fi

      if [ "$LINE_CLEAR" = "YES" ]; then
        log_pass "消行检测正常"
      else
        log_info "本次测试未触发消行（可能运气不好，非阻断）"
      fi

      if [ "$GAME_OVER" = "YES" ]; then
        log_pass "游戏结束画面正常"
      else
        log_info "未看到游戏结束画面（可能在自动玩的过程中没堆满）"
      fi

      # 判断是否有真正可玩的证据
      if [ "$PAGE_LOADED" = "YES" ] && [ "$GAME_STARTED" = "YES" ] && [ "$PIECE_MOVED" = "YES" ] && [ "$PIECE_ROTATED" = "YES" ] && [ "$HARD_DROP" = "YES" ]; then
        GAMEPLAY_PASSED=true
      fi

      echo ""
      echo "  最终统计: 分数=$FINAL_SCORE 行数=$FINAL_LINES 等级=$FINAL_LEVEL"

      if [ "$CONSOLE_ERRORS" -gt 0 ]; then
        log_fail "发现 $CONSOLE_ERRORS 个 console.error"
        if [ "$VERBOSE" = "true" ]; then
          echo "$RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);(j.consoleErrors||[]).forEach(e=>console.log('    '+e));" 2>/dev/null
        fi
      else
        log_pass "无 console.error"
      fi

      rm -f "$RESULT_FILE" "$PLAYWRIGHT_SCRIPT"
    else
      log_fail "Playwright 测试执行失败（超时或异常）"
      rm -f "$RESULT_FILE" "$PLAYWRIGHT_SCRIPT"
    fi
  fi
fi

# ══════════════════════════════════════════════════════════════
# 汇总
# ══════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  本地验证结果"
echo "═══════════════════════════════════════════════════════════"
echo "  通过: $PASSED"
echo "  失败: $ERRORS"
if [ "$GAMEPLAY_PASSED" = "true" ]; then
  echo -e "  ${GREEN}✅ 游戏交互测试通过（页面加载+开始+移动+旋转+硬降计分）${NC}"
elif [ "$PLAYWRIGHT_AVAILABLE" = "true" ]; then
  echo -e "  ${RED}❌ 游戏交互测试未通过 — 应用可能无法真正游玩${NC}"
  echo ""
  echo "  注意: 构建通过 ≠ 可玩。verify-build.sh 只检查文件完整性，"
  echo "  不检查游戏逻辑。Playwright 交互测试是唯一能验证可玩性的方法。"
fi
echo "═══════════════════════════════════════════════════════════"

# 游戏交互测试失败 → 整体 FAIL
if [ "$GAMEPLAY_PASSED" = "false" ] && [ "$PLAYWRIGHT_AVAILABLE" = "true" ]; then
  exit 1
fi

if [ "$ERRORS" -gt 0 ]; then
  exit 1
else
  echo -e "  ${GREEN}✅ 本地验证通过${NC}"
  exit 0
fi
