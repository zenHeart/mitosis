#!/usr/bin/env bash
# Immutable verifier executed from the authorized base commit in a fresh job.
# The job has contents:read only and receives neither StepFun nor GitHub write credentials.
set -Eeuo pipefail

MANIFEST=${1:?candidate manifest is required}
ROOT=${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}
BASE_SHA=${BASE_SHA:?BASE_SHA is required}
HELPER=${BASE_ARTIFACT_HELPER:?BASE_ARTIFACT_HELPER is required}
PREVIEW_PID=''

fail() {
  printf 'VERIFY: FAIL — %s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

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
  package.json
  package-lock.json
)
for path in "${TRUSTED_FILES[@]}"; do
  current=$(git hash-object "$path")
  expected=$(git rev-parse "$BASE_SHA:$path")
  [[ "$current" == "$expected" ]] || fail "trusted verifier or dependency policy changed: $path"
done

export CI=true
export NODE_ENV=test
export PLAYWRIGHT_BROWSERS_PATH="$RUNNER_TEMP/ms-playwright"

prepare_unprivileged_runtime() {
  if ! id mitosis-verifier >/dev/null 2>&1; then
    sudo useradd --create-home --shell /usr/sbin/nologin mitosis-verifier
  fi
  sudo chown -R root:root "$ROOT" "$RUNNER_TEMP/base-verifier"
  sudo chmod -R go-w "$ROOT" "$RUNNER_TEMP/base-verifier"
  sudo install -d -o mitosis-verifier -g mitosis-verifier -m 0700 /home/mitosis-verifier
  for writable in "$@"; do
    sudo install -d -o mitosis-verifier -g mitosis-verifier -m 0755 "$writable"
  done
}

run_untrusted() {
  sudo -u mitosis-verifier env -i \
    HOME=/home/mitosis-verifier \
    PATH="$PATH" \
    CI=true \
    NODE_ENV=test \
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
    "$@"
}

if [[ "$KIND" == platform ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
  npx playwright install --with-deps chromium
  prepare_unprivileged_runtime \
    "$ROOT/dist" \
    "$ROOT/node_modules/.vite" \
    "$ROOT/node_modules/.vite-temp" \
    "$ROOT/node_modules/.cache"
  sudo touch "$ROOT/tsconfig.tsbuildinfo"
  sudo chown mitosis-verifier:mitosis-verifier "$ROOT/tsconfig.tsbuildinfo"

  run_untrusted npm run typecheck
  run_untrusted npm run build
  run_untrusted npm test -- --reporter=verbose
  run_untrusted env RUN_BUILD=1 bash scripts/verify/main-pipeline.sh

  run_untrusted npm run dev -- --host 127.0.0.1 --port 5173 --strictPort \
    > "$RUNNER_TEMP/platform-preview.log" 2>&1 &
  PREVIEW_PID=$!
  for _ in $(seq 1 60); do
    kill -0 "$PREVIEW_PID" 2>/dev/null || fail "platform preview exited early"
    if curl --fail --silent --show-error --output /dev/null http://127.0.0.1:5173/; then
      break
    fi
    sleep 0.5
  done
  curl --fail --silent --show-error --output /dev/null http://127.0.0.1:5173/ \
    || fail "platform preview did not become ready"
  run_untrusted env BASE_URL=http://127.0.0.1:5173 node scripts/verify/e2e-golden.mjs
else
  [[ "$TARGET_PREFIX" =~ ^apps/${APP_NAME}/v[0-9]+/$ ]] \
    || fail "app target does not match trusted metadata"

  # Root dependencies supply the immutable Playwright harness. Candidate app
  # dependencies are separately constrained by ci-artifact.rb.
  npm ci --ignore-scripts --no-audit --no-fund
  npx playwright install --with-deps chromium

  APP_DIR="$ROOT/${TARGET_PREFIX%/}"
  cd "$APP_DIR"
  npm install --ignore-scripts --no-audit --no-fund
  prepare_unprivileged_runtime \
    "$APP_DIR/dist" \
    "$APP_DIR/node_modules/.vite" \
    "$APP_DIR/node_modules/.vite-temp" \
    "$APP_DIR/node_modules/.cache"
  sudo touch "$APP_DIR/tsconfig.tsbuildinfo"
  sudo chown mitosis-verifier:mitosis-verifier "$APP_DIR/tsconfig.tsbuildinfo"
  run_untrusted npm run build
  run_untrusted bash "$ROOT/worker/verify-build.sh"

  PORT=$(node -e 'const n=require("node:net"),s=n.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
  run_untrusted npm run preview -- --host 127.0.0.1 --port "$PORT" --strictPort \
    > "$RUNNER_TEMP/app-preview.log" 2>&1 &
  PREVIEW_PID=$!
  for _ in $(seq 1 60); do
    kill -0 "$PREVIEW_PID" 2>/dev/null || fail "app preview exited early"
    if curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:$PORT/"; then
      break
    fi
    sleep 0.5
  done
  curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:$PORT/" \
    || fail "app preview did not become ready"

  cat > "$RUNNER_TEMP/app-smoke.cjs" <<'NODE'
  const crypto = require('node:crypto')
  const { chromium } = require(process.env.ROOT + '/node_modules/playwright')

  const baseURL = process.env.BASE_URL
  const appName = process.env.APP_NAME
  const allowedOrigin = new URL(baseURL).origin

  function hash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
  }

  async function securePage(context) {
    const page = await context.newPage()
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('console')
    })
    page.on('pageerror', () => errors.push('pageerror'))
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (url.startsWith(allowedOrigin) || url.startsWith('data:') || url.startsWith('blob:')) {
        await route.continue()
      } else {
        await route.abort('blockedbyclient')
      }
    })
    return { page, errors }
  }

  ;(async () => {
    const browser = await chromium.launch()
    try {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport })
        const { page, errors } = await securePage(context)
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
              return rect.width < 44 || rect.height < 44
            }).length)
          if (undersized > 0) throw new Error('mobile touch target below 44px')
        }

        const before = hash(await page.screenshot())
        const button = page.locator('button:visible:enabled, [role="button"]:visible').first()
        const input = page.locator('input:visible:enabled, textarea:visible:enabled').first()
        if (await button.count()) {
          await button.click()
        } else if (await input.count()) {
          await input.fill('Mitosis interaction check')
        } else {
          await page.keyboard.press('ArrowRight')
        }
        await page.waitForTimeout(600)
        const after = hash(await page.screenshot())
        if (before === after) throw new Error('primary interaction produced no visible response')
        if (errors.length) throw new Error('runtime console or page error')

        const iteration = page.locator(`a[href="https://mitosis.zenheart.site?ref=${appName}"]`)
        if (await iteration.count() === 0) throw new Error('missing Mitosis iteration entry')
        await context.close()
      }
    } finally {
      await browser.close()
    }
  })().catch(() => process.exit(1))
NODE

  run_untrusted env ROOT="$ROOT" BASE_URL="http://127.0.0.1:$PORT/" APP_NAME="$APP_NAME" \
    node "$RUNNER_TEMP/app-smoke.cjs" || fail "immutable app browser verifier failed"
fi

git diff --cached --check
printf 'VERIFY: PASS\n'
