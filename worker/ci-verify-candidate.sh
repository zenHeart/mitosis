#!/usr/bin/env bash
# Immutable verifier executed from the authorized base commit in a fresh job.
# The job has contents:read only and receives neither StepFun nor GitHub write credentials.
set -Eeuo pipefail

MANIFEST=${1:?candidate manifest is required}
ROOT=${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}
BASE_SHA=${BASE_SHA:?BASE_SHA is required}
HELPER=${BASE_ARTIFACT_HELPER:?BASE_ARTIFACT_HELPER is required}
PREVIEW_PID=''
NETWORK_NAMESPACE=''

fail() {
  printf 'VERIFY: FAIL — %s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
  if [[ -n "$NETWORK_NAMESPACE" ]]; then
    while read -r pid; do
      [[ "$pid" =~ ^[0-9]+$ ]] && sudo kill -KILL "$pid" 2>/dev/null || true
    done < <(sudo ip netns pids "$NETWORK_NAMESPACE" 2>/dev/null || true)
    sudo ip netns delete "$NETWORK_NAMESPACE" 2>/dev/null || true
  fi
}
trap cleanup EXIT

show_log_diagnostics() {
  local path=$1
  local bytes=0
  local failure_class=unknown
  local present=false
  if [[ -f "$path" ]]; then
    present=true
    bytes=$(wc -c < "$path" | tr -d ' ')
    if grep -q 'EACCES' "$path"; then failure_class=filesystem_permission; fi
    if grep -q 'ETIMEDOUT' "$path"; then failure_class=network_timeout; fi
    if grep -q 'ENETUNREACH' "$path"; then failure_class=network_unreachable; fi
    if grep -qE '(^|[^0-9])429([^0-9]|$)' "$path"; then failure_class=rate_limited; fi
  fi
  printf 'UNTRUSTED_LOG: present=%s bytes=%s failure_class=%s\n' \
    "$present" "$bytes" "$failure_class" >&2
}

cd "$ROOT"

# Remove every credential-like variable before any candidate-controlled source is
# parsed, bundled, or opened in a browser. The checkout did not persist credentials.
unset STEP_TOKEN ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN GH_TOKEN GITHUB_TOKEN
unset ACTIONS_ID_TOKEN_REQUEST_TOKEN ACTIONS_ID_TOKEN_REQUEST_URL ACTIONS_RUNTIME_TOKEN
git config --local --unset-all http.https://github.com/.extraheader 2>/dev/null || true

for name in STEP_TOKEN ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN GH_TOKEN GITHUB_TOKEN; do
  [[ -z ${!name:-} ]] || fail "credential environment was not scrubbed"
done

KIND=$(ruby -rjson -e 'print JSON.parse(File.read(ARGV[0])).fetch("kind")' "$MANIFEST")
TARGET_PREFIX=$(ruby -rjson -e 'print JSON.parse(File.read(ARGV[0])).fetch("target_prefix")' "$MANIFEST")
APP_NAME=$(ruby -rjson -e 'print JSON.parse(File.read(ARGV[0])).fetch("app_name")' "$MANIFEST")

[[ "$KIND" == platform || "$KIND" == app ]] || fail "unknown candidate kind"
[[ "$BASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "invalid base SHA"

# These files are the trusted verification boundary. The candidate allowlist
# already rejects them; the blob checks are a second, fail-closed assertion.
TRUSTED_FILES=(
  .github/workflows/mitosis.yml
  .github/claude-ci-settings.json
  worker/ci-system-prompt.txt
  worker/ci-artifact.rb
  worker/ci-verify-candidate.sh
  worker/verify-build.sh
  scripts/verify/main-pipeline.sh
  scripts/verify/e2e-golden.mjs
  scripts/verify/production-sha.sh
  scripts/verify/production-sha.test.sh
  scripts/verify/step-plan-endpoints.sh
  scripts/verify/step-plan-endpoints.test.sh
  package.json
  package-lock.json
)
for path in "${TRUSTED_FILES[@]}"; do
  current=$(git hash-object "$path")
  expected=$(git rev-parse "$BASE_SHA:$path")
  [[ "$current" == "$expected" ]] || fail "trusted verifier or dependency policy changed: $path"
done

bash scripts/verify/step-plan-endpoints.sh

export CI=true
export NODE_ENV=test
export PLAYWRIGHT_BROWSERS_PATH="$RUNNER_TEMP/ms-playwright"

prepare_unprivileged_runtime() {
  local root_parent
  if ! id mitosis-verifier >/dev/null 2>&1; then
    sudo useradd --user-group --create-home --shell /usr/sbin/nologin mitosis-verifier
  fi
  [[ $(id -gn mitosis-verifier) == mitosis-verifier ]] || fail "verifier primary group is invalid"
  sudo install -d -o root -g root -m 0700 "$RUNNER_TEMP/base-verifier"
  sudo chown -R root:root "$ROOT" "$RUNNER_TEMP/base-verifier"
  sudo chmod -R go-w "$ROOT" "$RUNNER_TEMP/base-verifier"
  sudo setfacl -m u:mitosis-verifier:r-x "$ROOT"
  root_parent=$(dirname "$ROOT")
  for parent in "$root_parent" "$(dirname "$root_parent")" "$HOME"; do
    sudo setfacl -m u:mitosis-verifier:--x "$parent"
  done
  sudo install -d -o mitosis-verifier -g mitosis-verifier -m 0700 /home/mitosis-verifier
  sudo install -d -o root -g mitosis-verifier -m 0750 /opt/mitosis-verifier
  for writable in "$@"; do
    sudo install -d -o mitosis-verifier -g mitosis-verifier -m 0755 "$writable"
  done
}

prepare_network_namespace() {
  NETWORK_NAMESPACE="mitosis-${GITHUB_RUN_ID:-0}-$$"
  [[ "$NETWORK_NAMESPACE" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "invalid verifier network namespace"
  sudo ip netns add "$NETWORK_NAMESPACE"
  sudo ip -n "$NETWORK_NAMESPACE" link set lo up
  [[ $(sudo ip -n "$NETWORK_NAMESPACE" -o link show | wc -l | tr -d ' ') == 1 ]] \
    || fail "verifier network namespace has an unexpected interface"
}

run_untrusted() {
  [[ -n "$NETWORK_NAMESPACE" ]] || fail "verifier network namespace is unavailable"
  sudo ip netns exec "$NETWORK_NAMESPACE" sudo -u mitosis-verifier env -i \
    HOME=/home/mitosis-verifier \
    PATH="$PATH" \
    CI=true \
    NODE_ENV=test \
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
    "$@"
}

run_checked_untrusted() {
  local label=$1
  local log_path
  shift
  [[ "$label" =~ ^[a-z0-9-]+$ ]] || fail "invalid untrusted check label"
  log_path="$RUNNER_TEMP/untrusted-$label.log"
  # pipefail turns output beyond 1 MiB into a failed check when head closes the pipe.
  if run_untrusted "$@" 2>&1 | head -c 1048576 > "$log_path"; then
    rm -f "$log_path"
    printf 'UNTRUSTED_CHECK: %s PASS\n' "$label"
  else
    show_log_diagnostics "$log_path"
    rm -f "$log_path"
    fail "$label failed"
  fi
}

start_untrusted_preview() {
  local label=$1
  local log_path
  shift
  [[ "$label" =~ ^[a-z0-9-]+$ ]] || fail "invalid preview label"
  log_path="$RUNNER_TEMP/$label.log"
  (
    set -o pipefail
    run_untrusted "$@" 2>&1 | head -c 1048576 > "$log_path"
  ) &
  PREVIEW_PID=$!
}

if [[ "$KIND" == platform ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
  npx playwright install --with-deps chromium
  prepare_unprivileged_runtime \
    "$ROOT/dist" \
    "$ROOT/node_modules/.vite" \
    "$ROOT/node_modules/.vite-temp" \
    "$ROOT/node_modules/.cache"
  prepare_network_namespace
  sudo touch "$ROOT/tsconfig.tsbuildinfo"
  sudo chown mitosis-verifier:mitosis-verifier "$ROOT/tsconfig.tsbuildinfo"

  run_checked_untrusted platform-typecheck npm run typecheck
  run_checked_untrusted platform-build npm run build
  run_checked_untrusted platform-tests npm test -- --reporter=verbose
  run_checked_untrusted platform-main-pipeline env RUN_BUILD=1 bash scripts/verify/main-pipeline.sh

  start_untrusted_preview platform-preview npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
  for _ in $(seq 1 60); do
    kill -0 "$PREVIEW_PID" 2>/dev/null || {
      show_log_diagnostics "$RUNNER_TEMP/platform-preview.log"
      fail "platform preview exited early"
    }
    if run_untrusted curl --fail --silent --show-error --output /dev/null http://127.0.0.1:5173/; then
      break
    fi
    sleep 0.5
  done
  run_untrusted curl --fail --silent --show-error --output /dev/null http://127.0.0.1:5173/ \
    || {
      show_log_diagnostics "$RUNNER_TEMP/platform-preview.log"
      fail "platform preview did not become ready"
    }
  run_checked_untrusted platform-browser env BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs
else
  [[ "$TARGET_PREFIX" =~ ^apps/${APP_NAME}/v[0-9]+/$ ]] \
    || fail "app target does not match trusted metadata"

  # Root dependencies supply the immutable Playwright harness. Candidate app
  # dependencies are separately constrained by ci-artifact.rb.
  npm ci --ignore-scripts --no-audit --no-fund
  npx playwright install --with-deps chromium

  APP_DIR="$ROOT/${TARGET_PREFIX%/}"
  cd "$APP_DIR"
  [[ ! -e node_modules ]] || fail "generated app contains an unexpected node_modules path"
  sudo ln -s "$ROOT/node_modules" "$APP_DIR/node_modules"
  prepare_unprivileged_runtime \
    "$APP_DIR/dist" \
    "$APP_DIR/node_modules/.vite" \
    "$APP_DIR/node_modules/.vite-temp" \
    "$APP_DIR/node_modules/.cache"
  prepare_network_namespace
  sudo touch "$APP_DIR/tsconfig.tsbuildinfo"
  sudo chown mitosis-verifier:mitosis-verifier "$APP_DIR/tsconfig.tsbuildinfo"
  run_checked_untrusted app-build npm run build
  run_checked_untrusted app-structure bash "$ROOT/worker/verify-build.sh"

  if ! PORT=$(run_untrusted node -e 'const n=require("node:net"),s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})' \
      2> "$RUNNER_TEMP/port-probe.log"); then
    show_log_diagnostics "$RUNNER_TEMP/port-probe.log"
    rm -f "$RUNNER_TEMP/port-probe.log"
    fail "isolated port probe failed"
  fi
  rm -f "$RUNNER_TEMP/port-probe.log"
  [[ "$PORT" =~ ^[1-9][0-9]{1,4}$ ]] && (( PORT <= 65535 )) || fail "isolated port probe returned invalid output"
  start_untrusted_preview app-preview npm run preview -- --host 127.0.0.1 --port "$PORT" --strictPort
  for _ in $(seq 1 60); do
    kill -0 "$PREVIEW_PID" 2>/dev/null || {
      show_log_diagnostics "$RUNNER_TEMP/app-preview.log"
      fail "app preview exited early"
    }
    if run_untrusted curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:$PORT/"; then
      break
    fi
    sleep 0.5
  done
  run_untrusted curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:$PORT/" \
    || {
      show_log_diagnostics "$RUNNER_TEMP/app-preview.log"
      fail "app preview did not become ready"
    }

  sudo tee /opt/mitosis-verifier/app-smoke.cjs >/dev/null <<'NODE'
  const crypto = require('node:crypto')
  const { chromium } = require(process.env.ROOT + '/node_modules/playwright')

  const baseURL = process.env.BASE_URL
  const appName = process.env.APP_NAME
  const allowedOrigin = new URL(baseURL).origin

  function hash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
  }

  function isAllowedRequest(url) {
    try {
      const parsed = new URL(url)
      return parsed.origin === allowedOrigin || parsed.protocol === 'data:' || parsed.protocol === 'blob:'
    } catch {
      return false
    }
  }

  async function securePage(context) {
    const errors = []
    const networkViolations = []
    context.on('serviceworker', () => networkViolations.push('service-worker'))
    await context.route('**/*', async (route) => {
      if (isAllowedRequest(route.request().url())) {
        await route.continue()
      } else {
        networkViolations.push('http')
        await route.abort('blockedbyclient')
      }
    })
    if (typeof context.routeWebSocket !== 'function') throw new Error('WebSocket routing is unavailable')
    await context.routeWebSocket('**/*', async (webSocket) => {
      networkViolations.push('websocket')
      await webSocket.close({ code: 1008, reason: 'External network is disabled' })
    })

    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('console')
    })
    page.on('pageerror', () => errors.push('pageerror'))
    return { page, errors, networkViolations }
  }

  ;(async () => {
    const confusedOrigin = `${allowedOrigin}@example.invalid/blocked`
    if (!isAllowedRequest(`${allowedOrigin}/`) ||
        !isAllowedRequest('data:text/plain,ok') ||
        !isAllowedRequest('blob:null/00000000-0000-0000-0000-000000000000') ||
        isAllowedRequest(confusedOrigin) ||
        isAllowedRequest('https://example.invalid/blocked')) {
      throw new Error('network origin policy self-test failed')
    }

    const browser = await chromium.launch()
    try {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
        const { page, errors, networkViolations } = await securePage(context)
        const response = await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 20_000 })
        if (!response || !response.ok()) throw new Error('page load failed')
        if (!(await page.locator('body').isVisible())) throw new Error('body is not visible')
        const bodyText = ((await page.locator('body').innerText()) || '').trim()
        const interactive = page.locator('button, input, textarea, select, canvas, [role="button"], a[href]')
        if (bodyText.length < 10 || await interactive.count() === 0) throw new Error('no substantive interactive content')

        if (viewport.width === 390) {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          if (overflow > 2) throw new Error('mobile horizontal overflow')
          const undersized = await page.locator('button:visible, [role="button"]:visible, a[href]:visible').evaluateAll((elements) =>
            elements.filter((element) => {
              const rect = element.getBoundingClientRect()
              const style = window.getComputedStyle(element)
              const textContainer = element.closest('p, li')
              const textOnly = textContainer?.cloneNode(true)
              textOnly?.querySelectorAll('a').forEach((link) => link.remove())
              const hasSurroundingText = (textOnly?.textContent?.trim().length || 0) > 0
              if (element.tagName === 'A' && style.display === 'inline' && hasSurroundingText) return false
              return rect.width < 44 || rect.height < 44
            }).length)
          if (undersized > 0) throw new Error('mobile touch target below 44px')
        }

        const before = hash(await page.screenshot())
        const button = page.locator('button:visible:enabled, [role="button"]:visible').first()
        const input = page.locator([
          'textarea:visible:enabled',
          'input:not([type]):visible:enabled',
          'input[type="text"]:visible:enabled',
          'input[type="search"]:visible:enabled',
          'input[type="email"]:visible:enabled',
          'input[type="url"]:visible:enabled',
          'input[type="tel"]:visible:enabled'
        ].join(', ')).first()
        if (await input.count()) {
          await input.fill('Mitosis interaction check')
          if (await button.count()) await button.click()
        } else if (await button.count()) {
          await button.click()
        } else {
          await page.keyboard.press('ArrowRight')
        }
        await page.waitForTimeout(600)
        const after = hash(await page.screenshot())
        if (before === after) throw new Error('primary interaction produced no visible response')
        if (errors.length) throw new Error('runtime console or page error')
        if (networkViolations.length) throw new Error('unexpected network destination')
        if (context.serviceWorkers().length) throw new Error('service worker was not blocked')

        const iteration = page.locator(`a[href="https://mitosis.zenheart.site?ref=${appName}"]:visible`)
        if (await iteration.count() === 0) throw new Error('missing Mitosis iteration entry')
        if (viewport.width === 390) {
          const undersizedIteration = await iteration.evaluateAll((elements) => elements.some((element) => {
            const rect = element.getBoundingClientRect()
            return rect.width < 44 || rect.height < 44
          }))
          if (undersizedIteration) {
            throw new Error('Mitosis iteration entry is below 44px')
          }
        }
        await context.close()
      }
    } finally {
      await browser.close()
    }
  })().catch(() => process.exit(1))
NODE
  sudo chown root:mitosis-verifier /opt/mitosis-verifier/app-smoke.cjs
  sudo chmod 0440 /opt/mitosis-verifier/app-smoke.cjs
  run_untrusted test -r /opt/mitosis-verifier/app-smoke.cjs
  if run_untrusted test -w /opt/mitosis-verifier/app-smoke.cjs; then
    fail "immutable app browser verifier is writable"
  fi
  run_untrusted node --check /opt/mitosis-verifier/app-smoke.cjs

  run_checked_untrusted app-browser \
    env ROOT="$ROOT" BASE_URL="http://127.0.0.1:$PORT/" APP_NAME="$APP_NAME" \
    node /opt/mitosis-verifier/app-smoke.cjs
fi

git diff --cached --check
printf 'VERIFY: PASS\n'
