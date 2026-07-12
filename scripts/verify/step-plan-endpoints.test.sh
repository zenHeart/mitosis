#!/usr/bin/env bash
# Offline regression fixtures for the Step Plan endpoint policy.
set -Eeuo pipefail

SOURCE_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

host='api.'
host+='stepfun.com'
origin="https://$host"
anthropic_key='ANTHROPIC_BASE_'
anthropic_key+='URL'

mkdir -p "$TMP_ROOT/.github/workflows" "$TMP_ROOT/.github" "$TMP_ROOT/scripts/verify" "$TMP_ROOT/src"
cp "$SOURCE_ROOT/scripts/verify/step-plan-endpoints.sh" "$TMP_ROOT/scripts/verify/"
git -C "$TMP_ROOT" init -q

printf '%s\n' \
  '{' \
  '  "permissions": {' \
  '    "allow": [' \
  "      \"$host\"" \
  '    ]' \
  '  }' \
  '}' \
  > "$TMP_ROOT/.github/claude-ci-settings.json"
printf '%s\n' \
  "$anthropic_key=$origin/step_plan" \
  "$anthropic_key=$origin/step_plan" \
  > "$TMP_ROOT/.github/workflows/mitosis.yml"
printf "export const endpoint = '%s/step_plan/v1/chat/completions'\n" "$origin" > "$TMP_ROOT/src/good.ts"
git -C "$TMP_ROOT" add .

bash "$TMP_ROOT/scripts/verify/step-plan-endpoints.sh" "$TMP_ROOT" >/dev/null

expect_fail() {
  local label=$1
  local value=$2
  printf "export const endpoint = '%s'\n" "$value" > "$TMP_ROOT/src/bad.ts"
  if bash "$TMP_ROOT/scripts/verify/step-plan-endpoints.sh" "$TMP_ROOT" >/dev/null 2>&1; then
    printf 'STEP_PLAN_ENDPOINT_TEST: FAIL — accepted %s\n' "$label" >&2
    exit 1
  fi
  rm -f "$TMP_ROOT/src/bad.ts"
}

expect_fail 'ordinary API path' "$origin/v1/chat/completions"
expect_fail 'plain HTTP' "http://$host/step_plan/v1/chat/completions"
expect_fail 'protocol-relative host' "//$host/step_plan/v1/chat/completions"
expect_fail 'path traversal' "$origin/step_plan/v1/../../v1/chat/completions"
expect_fail 'encoded path traversal' "$origin/step_plan/v1/%2e%2e/%2e%2e/v1/chat/completions"
expect_fail 'origin-only URL' "$origin"

head -n 1 "$TMP_ROOT/.github/workflows/mitosis.yml" > "$TMP_ROOT/.github/workflows/mitosis.yml.tmp"
mv "$TMP_ROOT/.github/workflows/mitosis.yml.tmp" "$TMP_ROOT/.github/workflows/mitosis.yml"
if bash "$TMP_ROOT/scripts/verify/step-plan-endpoints.sh" "$TMP_ROOT" >/dev/null 2>&1; then
  printf 'STEP_PLAN_ENDPOINT_TEST: FAIL — accepted a missing Claude Step Plan base\n' >&2
  exit 1
fi

printf '%s\n' \
  "$anthropic_key=$origin/step_plan" \
  "$anthropic_key=$origin/step_plan" \
  > "$TMP_ROOT/.github/workflows/mitosis.yml"
mkdir -p "$TMP_ROOT/artifact"
printf "const endpoint = '%s/v1/models'\n" "$origin" > "$TMP_ROOT/artifact/out.js"
if STEP_PLAN_SCAN_PATHS="$TMP_ROOT/artifact" \
  bash "$TMP_ROOT/scripts/verify/step-plan-endpoints.sh" "$TMP_ROOT" >/dev/null 2>&1; then
  printf 'STEP_PLAN_ENDPOINT_TEST: FAIL — accepted an unsafe deployment artifact\n' >&2
  exit 1
fi

printf 'STEP_PLAN_ENDPOINT_TEST: PASS (offline; no network request)\n'
