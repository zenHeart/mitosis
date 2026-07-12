#!/usr/bin/env bash
# Offline regression fixtures for production-sha.sh. No network is permitted.
set -Eeuo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT/bin"

cat > "$TMP_ROOT/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
output=''
url=''
while (($#)); do
  case "$1" in
    --output)
      output=$2
      shift 2
      ;;
    --write-out|--proto|--tlsv1.2|--connect-timeout|--max-time|--max-redirs|--max-filesize|--header)
      if [[ "$1" == --tlsv1.2 ]]; then shift; else shift 2; fi
      ;;
    --silent|--show-error)
      shift
      ;;
    *)
      url=$1
      shift
      ;;
  esac
done

case ${MOCK_CURL_MODE:?} in
  pass)
    printf '%s\n' "$MOCK_EXPECTED_SHA" > "$output"
    printf '200 0 %s' "$url"
    ;;
  redirect-chain)
    printf '%s\n' "$MOCK_EXPECTED_SHA" > "$output"
    printf '200 2 %s' "$url"
    ;;
  embedded-newline)
    printf '%s\n%s\n' "${MOCK_EXPECTED_SHA:0:20}" "${MOCK_EXPECTED_SHA:20}" > "$output"
    printf '200 0 %s' "$url"
    ;;
  wrong-status)
    printf '%s\n' "$MOCK_EXPECTED_SHA" > "$output"
    printf '404 0 %s' "$url"
    ;;
  *) exit 2 ;;
esac
MOCK_CURL
chmod 0700 "$TMP_ROOT/bin/curl"

sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
run_helper() {
  MOCK_CURL_MODE=$1 MOCK_EXPECTED_SHA=$sha PATH="$TMP_ROOT/bin:$PATH" \
    bash "$ROOT/scripts/verify/production-sha.sh" https://example.com "$sha" offline
}

run_helper pass >/dev/null
for mode in redirect-chain embedded-newline wrong-status; do
  if run_helper "$mode" >/dev/null 2>&1; then
    printf 'PRODUCTION_SHA_TEST: FAIL — accepted %s\n' "$mode" >&2
    exit 1
  fi
done

printf 'PRODUCTION_SHA_TEST: PASS (offline; no network request)\n'
