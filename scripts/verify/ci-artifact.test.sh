#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT=$PWD
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

WORKSPACE="$TMP_ROOT/workspace"
mkdir -p "$WORKSPACE/apps/tetris-game/v3/src/assets"
printf '%s\n' '{"dependencies":{"vue":"^3.5.0"},"devDependencies":{"@vitejs/plugin-vue":"^5.2.0","typescript":"~5.7.0","vite":"^6.0.0","vue-tsc":"^2.2.0"}}' > "$WORKSPACE/package.json"
printf '<div id="app"></div>\n' > "$WORKSPACE/apps/tetris-game/v3/index.html"
printf 'export default {}\n' > "$WORKSPACE/apps/tetris-game/v3/vite.config.ts"
printf '{}\n' > "$WORKSPACE/apps/tetris-game/v3/tsconfig.json"
printf '%s\n' '{"private":true,"scripts":{"dev":"vite","build":"vue-tsc -b && vite build","preview":"vite preview","typecheck":"vue-tsc -b --noEmit"}}' > "$WORKSPACE/apps/tetris-game/v3/package.json"
printf 'export {}\n' > "$WORKSPACE/apps/tetris-game/v3/src/main.ts"
printf '<template>v3</template>\n' > "$WORKSPACE/apps/tetris-game/v3/src/App.vue"
printf ':root {}\n' > "$WORKSPACE/apps/tetris-game/v3/src/assets/main.css"

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

ruby "$ROOT/worker/ci-artifact.rb" grant \
  --workspace "$WORKSPACE" \
  --metadata "$METADATA" \
  --user "$(id -un)" \
  --group "$(id -gn)"
for relative in index.html vite.config.ts tsconfig.json src/main.ts src/App.vue src/assets/main.css; do
  cmp "$WORKSPACE/apps/tetris-game/v3/$relative" "$WORKSPACE/apps/tetris-game/v4/$relative"
done
ruby -rjson -e '
  package = JSON.parse(File.read(ARGV.fetch(0)))
  abort "non-canonical scripts" unless package.fetch("scripts").keys.sort == %w[build dev preview]
  abort "wrong version" unless package.fetch("version") == "4.0.0"
' "$WORKSPACE/apps/tetris-game/v4/package.json"

expect_package_failure() {
  local workspace=$1
  local base_sha=$2
  local metadata=$3
  local output_dir=$4
  if ruby "$ROOT/worker/ci-artifact.rb" package \
    --workspace "$workspace" \
    --base-sha "$base_sha" \
    --metadata "$metadata" \
    --run-id 1 \
    --run-attempt 1 \
    --output-dir "$output_dir" >/dev/null 2>&1; then
    echo 'CI_ARTIFACT_TEST: FAIL — accepted an unchanged trusted scaffold' >&2
    exit 1
  fi
}

expect_package_failure "$WORKSPACE" "$BASE_SHA" "$METADATA" "$TMP_ROOT/unchanged-iteration"
printf 'not imported\n' > "$WORKSPACE/apps/tetris-game/v4/src/notes.txt"
expect_package_failure "$WORKSPACE" "$BASE_SHA" "$METADATA" "$TMP_ROOT/unreachable-iteration"
rm "$WORKSPACE/apps/tetris-game/v4/src/notes.txt"
printf '<template><p>Press P to pause</p></template>\n' > "$WORKSPACE/apps/tetris-game/v4/src/App.vue"
ruby "$ROOT/worker/ci-artifact.rb" package \
  --workspace "$WORKSPACE" \
  --base-sha "$BASE_SHA" \
  --metadata "$METADATA" \
  --run-id 1 \
  --run-attempt 1 \
  --output-dir "$TMP_ROOT/changed-iteration"

CREATE_WORKSPACE="$TMP_ROOT/create-workspace"
mkdir -p "$CREATE_WORKSPACE/apps"
cp "$WORKSPACE/package.json" "$CREATE_WORKSPACE/package.json"
touch "$CREATE_WORKSPACE/apps/.gitkeep"
git -C "$CREATE_WORKSPACE" init -q -b master
git -C "$CREATE_WORKSPACE" add -A
git -C "$CREATE_WORKSPACE" -c user.name=test -c user.email=test.invalid commit -qm base
CREATE_BASE_SHA=$(git -C "$CREATE_WORKSPACE" rev-parse HEAD)
CREATE_ISSUE_JSON="$TMP_ROOT/create-issue.json"
CREATE_METADATA="$TMP_ROOT/create-metadata.json"
printf '%s\n' \
  '{"number":39,"state":"open","title":"build todo","body":"create a useful todo app","labels":[{"name":"app/mvp-validation-todo"}]}' \
  > "$CREATE_ISSUE_JSON"
ruby "$ROOT/worker/ci-artifact.rb" prepare \
  --workspace "$CREATE_WORKSPACE" \
  --base-sha "$CREATE_BASE_SHA" \
  --base-branch master \
  --repository zenHeart/mitosis \
  --issue-number 39 \
  --issue-json "$CREATE_ISSUE_JSON" \
  --metadata "$CREATE_METADATA" \
  --plan-prompt "$TMP_ROOT/create-plan-prompt.txt"
ruby "$ROOT/worker/ci-artifact.rb" grant \
  --workspace "$CREATE_WORKSPACE" \
  --metadata "$CREATE_METADATA" \
  --user "$(id -un)" \
  --group "$(id -gn)"
for relative in index.html vite.config.ts tsconfig.json package.json src/main.ts src/App.vue src/assets/main.css; do
  test -f "$CREATE_WORKSPACE/apps/mvp-validation-todo/v0/$relative"
done
expect_package_failure "$CREATE_WORKSPACE" "$CREATE_BASE_SHA" "$CREATE_METADATA" "$TMP_ROOT/unchanged-creation"
printf '<template><main><h1>Todo</h1><button>Add task</button></main></template>\n' \
  > "$CREATE_WORKSPACE/apps/mvp-validation-todo/v0/src/App.vue"
ruby "$ROOT/worker/ci-artifact.rb" package \
  --workspace "$CREATE_WORKSPACE" \
  --base-sha "$CREATE_BASE_SHA" \
  --metadata "$CREATE_METADATA" \
  --run-id 2 \
  --run-attempt 1 \
  --output-dir "$TMP_ROOT/changed-creation"

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
grep -qF 'already initialized by the trusted platform' "$EXECUTION_PROMPT"
if grep -qF 'create every required file' "$EXECUTION_PROMPT"; then
  echo 'CI_ARTIFACT_TEST: FAIL — execution prompt still asks the Agent to rebuild the scaffold' >&2
  exit 1
fi

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
