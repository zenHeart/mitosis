#!/usr/bin/env bash
# Fail closed when a tracked file can address StepFun outside Step Plan.
# This check is static: it never reads credentials and never performs network I/O.
set -Eeuo pipefail

ROOT=${1:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$ROOT"

python3 - <<'PY'
from pathlib import Path
from urllib.parse import unquote, urlsplit
import os
import re
import subprocess
import sys

host = '.'.join(('api', 'stepfun', 'com'))
origin = f'https://{host}'
anthropic_base = f'{origin}/step_plan'
openai_base = f'{origin}/step_plan/v1'
host_pattern = re.compile(re.escape(host), re.IGNORECASE)
url_pattern = re.compile(rf'https?://{re.escape(host)}[^\s\"\'`<>)\],}}]*', re.IGNORECASE)
text_suffixes = {
    '.cjs', '.css', '.env', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
    '.mts', '.rb', '.sh', '.ts', '.tsx', '.txt', '.vue', '.yaml', '.yml',
}

tracked = subprocess.run(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    check=True,
    stdout=subprocess.PIPE,
).stdout.split(b'\0')

failures = []
anthropic_assignments = {}

def record_urls(path, text):
    for line_number, line in enumerate(text.splitlines(), 1):
        if 'ANTHROPIC_BASE_URL' in line:
            assignments = re.findall(r'ANTHROPIC_BASE_URL\s*=\s*([^\s\\`]+)', line)
            for value in assignments:
                anthropic_assignments[str(path)] = anthropic_assignments.get(str(path), 0) + 1
                if value.strip('\"\'') != anthropic_base:
                    failures.append((str(path), line_number, 'Anthropic base must resolve to Step Plan /v1/messages'))

        matches = list(url_pattern.finditer(line))
        for host_match in host_pattern.finditer(line):
            covered = any(match.start() <= host_match.start() < match.end() for match in matches)
            host_allowlist = (
                str(path) == '.github/claude-ci-settings.json'
                and line.strip().rstrip(',') == f'"{host}"'
            )
            if not covered and not host_allowlist:
                failures.append((str(path), line_number, 'StepFun host must not be protocol-relative, bare, or dynamically addressed'))

        for match in matches:
            value = match.group(0).rstrip('.,;:')
            parsed = urlsplit(value)
            raw_path = parsed.path
            decoded_path = unquote(raw_path)
            path_segments = decoded_path.split('/')
            unsafe_path = (
                '\\' in decoded_path
                or '//' in decoded_path
                or any(segment in {'.', '..'} for segment in path_segments)
                or raw_path != decoded_path
            )
            if parsed.scheme != 'https' or parsed.netloc.lower() != host or unsafe_path:
                failures.append((str(path), line_number, 'StepFun URL must use the canonical HTTPS Step Plan host and path'))
                continue

            endpoint_ok = decoded_path.startswith('/step_plan/v1/') and decoded_path != '/step_plan/v1/'
            anthropic_ok = value == anthropic_base and 'ANTHROPIC_BASE_URL' in line
            openai_ok = value == openai_base and 'OPENAI_BASE_URL' in line
            if not (endpoint_ok or anthropic_ok or openai_ok):
                failures.append((str(path), line_number, 'StepFun URL is outside /step_plan/v1/...'))

for raw_path in tracked:
    if not raw_path:
        continue
    path = Path(raw_path.decode('utf-8'))
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError) as error:
        if path.suffix.lower() in text_suffixes or path.name.startswith('.'):
            failures.append((str(path), 1, f'text policy input is unreadable: {type(error).__name__}'))
        continue
    record_urls(path, text)

workflow_path = '.github/workflows/mitosis.yml'
if anthropic_assignments.get(workflow_path, 0) != 2:
    failures.append((workflow_path, 1, 'exactly two Claude Code calls must set the Step Plan Anthropic base'))

for raw_scan_path in filter(None, os.environ.get('STEP_PLAN_SCAN_PATHS', '').split(':')):
    scan_root = Path(raw_scan_path)
    if not scan_root.exists():
        failures.append((raw_scan_path, 1, 'requested build output does not exist'))
        continue
    for path in scan_root.rglob('*'):
        if not path.is_file() or path.is_symlink():
            continue
        data = path.read_bytes()
        if host_pattern.search(data.decode('utf-8', errors='ignore')):
            record_urls(path, data.decode('utf-8', errors='ignore'))

if failures:
    for path, line, reason in failures:
        print(f'STEP_PLAN_ENDPOINTS: FAIL {path}:{line}: {reason}', file=sys.stderr)
    raise SystemExit(1)

print(f'STEP_PLAN_ENDPOINTS: PASS ({len(tracked)} tracked files; no network request)')
PY
