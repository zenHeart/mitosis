#!/usr/bin/env bash
# Verify that the production origin itself serves the exact deployed source SHA.
set -euo pipefail

BASE_URL=${1:?production base URL is required}
EXPECTED_SHA=${2:?expected source SHA is required}
CACHE_KEY=${3:-manual}

[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'PRODUCTION_SHA: FAIL — invalid expected SHA\n' >&2
  exit 1
}
[[ "$CACHE_KEY" =~ ^[A-Za-z0-9_.-]+$ ]] || {
  printf 'PRODUCTION_SHA: FAIL — invalid cache key\n' >&2
  exit 1
}
[[ "$BASE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] || {
  printf 'PRODUCTION_SHA: FAIL — production URL must be an HTTPS origin\n' >&2
  exit 1
}

body_file=$(mktemp)
expected_file=$(mktemp)
cleanup() { rm -f "$body_file" "$expected_file"; }
trap cleanup EXIT

marker_url="${BASE_URL%/}/mitosis-source-sha.txt?verify=$CACHE_KEY"
curl_metadata=$(curl --silent --show-error \
  --proto '=https' --tlsv1.2 \
  --connect-timeout 5 --max-time 20 --max-redirs 0 --max-filesize 256 \
  --header 'Cache-Control: no-cache' \
  --output "$body_file" \
  --write-out '%{http_code} %{num_redirects} %{url_effective}' \
  "$marker_url")
read -r http_status redirect_count effective_url <<< "$curl_metadata"

if [[ "$http_status" != 200 || "$redirect_count" != 0 || "$effective_url" != "$marker_url" ]]; then
  printf 'PRODUCTION_SHA: FAIL — marker must return HTTP 200 without redirects\n' >&2
  exit 1
fi

printf '%s\n' "$EXPECTED_SHA" > "$expected_file"
if ! cmp -s "$expected_file" "$body_file"; then
  printf 'PRODUCTION_SHA: FAIL — deployed SHA mismatch\n' >&2
  exit 1
fi

printf 'PRODUCTION_SHA: PASS\n'
