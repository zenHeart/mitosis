#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
OUTPUT=$(printf '%s\n' \
  '{"type":"system","subtype":"init","model":"test-model","tools":["Read","Edit"],"plugins":[],"plugin_errors":[]}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"sensitive-prompt-value"},{"type":"tool_use","name":"Edit","input":{"file_path":"/private/customer-name.vue","new_string":"private-contact-value"}}]}}' \
  'malformed-sensitive-line' \
  '{"type":"result","subtype":"success","num_turns":1,"duration_ms":10}' \
  | python3 scripts/ci/claude-stream-log.py)

printf '%s\n' "$OUTPUT" | grep -qF 'tool=Edit'
printf '%s\n' "$OUTPUT" | grep -qF '"Edit":1'
if printf '%s\n' "$OUTPUT" | grep -qE 'sensitive-prompt-value|customer-name|private-contact-value|malformed-sensitive-line|test-model'; then
  echo 'CLAUDE_STREAM_LOG_TEST: FAIL — untrusted model content reached logs' >&2
  exit 1
fi

printf 'CLAUDE_STREAM_LOG_TEST: PASS (no untrusted content logged)\n'
