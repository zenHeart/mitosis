#!/usr/bin/env python3
"""
claude-stream-log.py — claude -p stream-json 事件流的 CI 日志过滤器

用法: claude -p ... --output-format stream-json --verbose | python3 claude-stream-log.py

职责:
1. 实时把 NDJSON 事件转成不含 prompt、assistant 文本、工具输入或结果的统计日志
2. result 事件只输出终止状态、turns、耗时和工具调用计数
3. 解析失败的行只记录布尔标记，不回显原始内容
4. 退出码: result.subtype == success 时 0，error_* 时 2，无 result 事件时 3
   （上层仍以 claude 进程自身退出码为准，本码用于日志侧交叉校验）
"""
from collections import Counter
import json
import sys

SAFE_TOOL_NAMES = {
    'Agent', 'Bash', 'Edit', 'Glob', 'Grep', 'NotebookEdit',
    'Read', 'Skill', 'Task', 'WebFetch', 'WebSearch', 'Write',
}

def failure_class(value: object) -> str:
    text = str(value)
    if 'ETIMEDOUT' in text:
        return 'network_timeout'
    if 'ENETUNREACH' in text:
        return 'network_unreachable'
    if '429' in text:
        return 'rate_limited'
    return 'unknown'


def main() -> int:
    turn = 0
    saw_result = False
    result_ok = False
    tool_counts: Counter[str] = Counter()

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            print('[WARN] invalid_json_line=true', flush=True)
            continue

        etype = ev.get('type')
        if etype == 'system':
            sub = ev.get('subtype')
            if sub == 'init':
                tools = ev.get('tools', [])
                errors = ev.get('plugin_errors', [])
                plugins = ev.get('plugins', [])
                print(f'[INIT] tools={len(tools)} plugins={len(plugins)}', flush=True)
                if errors:
                    print(f'[INIT] plugin_error_count={len(errors)}', flush=True)
            elif sub == 'api_retry':
                print(f"[RETRY] attempt={ev.get('attempt')}/{ev.get('max_retries')} "
                      f"failure_class={failure_class(ev.get('error'))} "
                      f"delay_ms={ev.get('retry_delay_ms')}", flush=True)
        elif etype == 'assistant':
            turn += 1
            msg = ev.get('message') or {}
            emitted_text = False
            for block in msg.get('content') or []:
                btype = block.get('type')
                if btype == 'tool_use':
                    raw_name = str(block.get('name', ''))
                    name = raw_name if raw_name in SAFE_TOOL_NAMES else 'other'
                    tool_counts[name] += 1
                    print(f'[turn {turn}] tool={name}', flush=True)
                elif btype == 'text' and block.get('text', '').strip():
                    emitted_text = True
            if emitted_text:
                print(f'[turn {turn}] assistant_text=true', flush=True)
        elif etype == 'result':
            saw_result = True
            sub = ev.get('subtype', '?')
            result_ok = sub == 'success'
            print(f"RESULT: subtype={sub} turns={ev.get('num_turns', '?')} "
                  f"duration_ms={ev.get('duration_ms', '?')} "
                  f"tool_counts={json.dumps(dict(sorted(tool_counts.items())), separators=(',', ':'))}",
                  flush=True)

    if not saw_result:
        print('RESULT: subtype=missing (stream ended without result event)', flush=True)
        return 3
    return 0 if result_ok else 2


if __name__ == '__main__':
    sys.exit(main())
