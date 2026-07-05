#!/usr/bin/env python3
"""
claude-stream-log.py — claude -p stream-json 事件流的 CI 日志过滤器

用法: claude -p ... --output-format stream-json --verbose | python3 claude-stream-log.py

职责:
1. 实时把 NDJSON 事件转成人类可读的单行日志（turn 计数、工具调用、文本摘要）
2. result 事件输出统计行（turns / 耗时 / 成本），供 workflow 解析:
   RESULT: subtype=<subtype> turns=<n> duration_ms=<ms> cost_usd=<cost>
3. 透传解析失败的行（claude 的非 JSON 输出不丢失）
4. 退出码: result.subtype == success 时 0，error_* 时 2，无 result 事件时 3
   （上层仍以 claude 进程自身退出码为准，本码用于日志侧交叉校验）
"""
import json
import sys

MAX_TEXT = 200


def snippet(text: str) -> str:
    text = ' '.join(text.split())
    return text[:MAX_TEXT] + ('…' if len(text) > MAX_TEXT else '')


def tool_summary(block: dict) -> str:
    name = block.get('name', '?')
    inp = block.get('input') or {}
    if name == 'Bash':
        detail = snippet(str(inp.get('command', '')))
    elif name in ('Read', 'Write', 'Edit'):
        detail = str(inp.get('file_path', ''))
    elif name in ('Glob', 'Grep'):
        detail = snippet(str(inp.get('pattern', '')))
    elif name == 'Skill':
        detail = str(inp.get('skill', ''))
    else:
        detail = snippet(json.dumps(inp, ensure_ascii=False))
    return f'{name}: {detail}'


def main() -> int:
    turn = 0
    saw_result = False
    result_ok = False

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            print(raw, flush=True)
            continue

        etype = ev.get('type')
        if etype == 'system':
            sub = ev.get('subtype')
            if sub == 'init':
                model = ev.get('model', '?')
                tools = ev.get('tools', [])
                plugins = [p.get('name') for p in ev.get('plugins', [])]
                errors = ev.get('plugin_errors', [])
                print(f'[INIT] model={model} tools={len(tools)} plugins={plugins}', flush=True)
                if errors:
                    print(f'[INIT] plugin_errors={errors}', flush=True)
            elif sub == 'api_retry':
                print(f"[RETRY] attempt={ev.get('attempt')}/{ev.get('max_retries')} "
                      f"error={ev.get('error')} delay_ms={ev.get('retry_delay_ms')}", flush=True)
        elif etype == 'assistant':
            turn += 1
            msg = ev.get('message') or {}
            for block in msg.get('content') or []:
                btype = block.get('type')
                if btype == 'tool_use':
                    print(f'[turn {turn}] 🔧 {tool_summary(block)}', flush=True)
                elif btype == 'text' and block.get('text', '').strip():
                    print(f'[turn {turn}] 💬 {snippet(block["text"])}', flush=True)
        elif etype == 'result':
            saw_result = True
            sub = ev.get('subtype', '?')
            result_ok = sub == 'success'
            print(f"RESULT: subtype={sub} turns={ev.get('num_turns', '?')} "
                  f"duration_ms={ev.get('duration_ms', '?')} "
                  f"cost_usd={ev.get('total_cost_usd', '?')}", flush=True)

    if not saw_result:
        print('RESULT: subtype=missing (stream ended without result event)', flush=True)
        return 3
    return 0 if result_ok else 2


if __name__ == '__main__':
    sys.exit(main())
