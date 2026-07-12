#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT=$PWD
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

WORKSPACE="$TMP_ROOT/workspace"
mkdir -p "$WORKSPACE/apps/tetris-game/v3"
printf '{}\n' > "$WORKSPACE/package.json"
printf '<template>v3</template>\n' > "$WORKSPACE/apps/tetris-game/v3/App.vue"

git -C "$WORKSPACE" init -q -b master
git -C "$WORKSPACE" add -A
git -C "$WORKSPACE" -c user.name=test -c user.email=test.invalid commit -qm base
BASE_SHA=$(git -C "$WORKSPACE" rev-parse HEAD)

ISSUE_JSON="$TMP_ROOT/issue.json"
METADATA="$TMP_ROOT/metadata.json"
PLAN_PROMPT="$TMP_ROOT/plan-prompt.txt"
printf '%s\n' \
  '{"number":40,"state":"open","title":"iterate tetris","body":"add a pause hint","labels":[{"name":"app/tetris-game"}]}' \
  > "$ISSUE_JSON"

ruby "$ROOT/worker/ci-artifact.rb" prepare \
  --workspace "$WORKSPACE" \
  --base-sha "$BASE_SHA" \
  --base-branch master \
  --repository zenHeart/mitosis \
  --issue-number 40 \
  --issue-json "$ISSUE_JSON" \
  --metadata "$METADATA" \
  --plan-prompt "$PLAN_PROMPT"

ruby -rjson -e '
  metadata = JSON.parse(File.read(ARGV.fetch(0)))
  abort "wrong target" unless metadata.fetch("target_prefix") == "apps/tetris-game/v4/"
  abort "missing source" unless metadata.fetch("source_prefix") == "apps/tetris-game/v3/"
' "$METADATA"

PLAN_RESULT="$TMP_ROOT/plan-result.json"
PLAN="$TMP_ROOT/plan.json"
EXECUTION_PROMPT="$TMP_ROOT/execution-prompt.txt"
printf '%s\n' \
  '{"type":"result","subtype":"success","is_error":false,"structured_output":{"tasks":[{"title":"Pause hint","detail":"Preserve v3 and add the requested hint.","verification":"The hint is visible."}],"complexity":"simple"}}' \
  > "$PLAN_RESULT"
ruby "$ROOT/worker/ci-artifact.rb" normalize-plan --result "$PLAN_RESULT" --output "$PLAN"
ruby "$ROOT/worker/ci-artifact.rb" execution-prompt \
  --issue-json "$ISSUE_JSON" \
  --metadata "$METADATA" \
  --plan "$PLAN" \
  --output "$EXECUTION_PROMPT"
grep -qF 'apps/tetris-game/v3/' "$EXECUTION_PROMPT"
grep -qF 'src/assets/main.css' "$EXECUTION_PROMPT"

SUCCESS_RESULT="$TMP_ROOT/success.json"
printf '%s\n' \
  '{"type":"result","subtype":"success","is_error":false,"permission_denials":[]}' \
  > "$SUCCESS_RESULT"
ruby "$ROOT/worker/ci-artifact.rb" assert-result --result "$SUCCESS_RESULT"

expect_result_failure() {
  local result=$1
  if ruby "$ROOT/worker/ci-artifact.rb" assert-result --result "$result" >/dev/null 2>&1; then
    printf 'CI_ARTIFACT_TEST: FAIL — accepted %s\n' "$(basename "$result")" >&2
    exit 1
  fi
}

MAX_TURNS_RESULT="$TMP_ROOT/max-turns.json"
printf '%s\n' \
  '{"type":"result","subtype":"error_max_turns","is_error":true,"permission_denials":[]}' \
  > "$MAX_TURNS_RESULT"
expect_result_failure "$MAX_TURNS_RESULT"

DENIED_RESULT="$TMP_ROOT/denied.json"
printf '%s\n' \
  '{"type":"result","subtype":"success","is_error":false,"permission_denials":[{"tool_name":"Edit"}]}' \
  > "$DENIED_RESULT"
expect_result_failure "$DENIED_RESULT"

PLAN_DENIED_RESULT="$TMP_ROOT/plan-denied.json"
printf '%s\n' \
  '{"type":"result","subtype":"success","is_error":false,"permission_denials":[{"tool_name":"Bash"}],"structured_output":{"tasks":[{"title":"Pause hint","detail":"Preserve v3 and add the requested hint.","verification":"The hint is visible."}],"complexity":"simple"}}' \
  > "$PLAN_DENIED_RESULT"
if ruby "$ROOT/worker/ci-artifact.rb" normalize-plan \
  --result "$PLAN_DENIED_RESULT" --output "$TMP_ROOT/denied-plan.json" >/dev/null 2>&1; then
  echo 'CI_ARTIFACT_TEST: FAIL — accepted a planning permission denial' >&2
  exit 1
fi

printf 'CI_ARTIFACT_TEST: PASS (offline; no provider request)\n'
