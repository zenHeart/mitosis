#!/usr/bin/env python3
"""
claude-timeout.py — claude -p 的硬超时包装器（CI 兼容版）

原理:
1. 用 subprocess.Popen(start_new_session=True) 启动 claude
   → 创建新 session，claude 及其子进程属于独立进程组
2. 通过 stdin pipe 传递 prompt，避免 claude 等待交互输入
3. 后台 watchdog 线程：超时后用 os.killpg(SIGKILL) 杀掉整个进程组
   → 不依赖 timeout/setsid（它们无法杀掉 claude 子进程）
   → 不依赖 os.killpg(SIGTERM)（CI 环境中 SIGTERM 被阻止）
   → SIGKILL 不可被捕获/忽略，确保超时必杀
4. 主线程等待 claude 完成，返回其退出码
5. 支持 KeyboardInterrupt（CI runner 取消 job 时）

用法: python3 scripts/claude-timeout.py <seconds> -- <claude args...>
"""
import subprocess
import sys
import os
import signal
import threading
import time


def watchdog_thread(proc, pgid, timeout):
    """Watchdog 线程：超时后 SIGKILL 整个进程组"""
    time.sleep(timeout)
    try:
        # 先杀主进程
        os.kill(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    # 再杀整个进程组（清理子进程）
    try:
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def main():
    if len(sys.argv) < 3 or sys.argv[1] == '--help':
        print("Usage: python3 claude-timeout.py <seconds> -- <claude args...>")
        sys.exit(1)

    timeout = int(sys.argv[1])

    # 找到 -- 分隔符
    try:
        dash_dash = sys.argv.index('--')
        claude_args = sys.argv[dash_dash + 1:]
    except ValueError:
        claude_args = sys.argv[2:]

    if not claude_args:
        print("Error: no claude args provided after --")
        sys.exit(1)

    # 启动 claude：新 session（独立进程组）+ stdin pipe（传递 prompt）
    try:
        proc = subprocess.Popen(
            claude_args,
            start_new_session=True,
            stdin=subprocess.PIPE,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
    except Exception as e:
        print(f"[timeout] Failed to start claude: {e}", file=sys.stderr)
        sys.exit(1)

    pgid = os.getpgid(proc.pid)
    print(f"[timeout] claude started: pid={proc.pid}, pgid={pgid}", file=sys.stderr)
    print(f"[timeout] watchdog: {timeout}s (SIGKILL)", file=sys.stderr)

    # 通过 stdin 传递 prompt（如果 claude_args 末尾是 prompt 文本）
    # 最后一个参数可能是 prompt 文本 → 写入 stdin
    prompt_text = claude_args[-1] if claude_args else ""
    # 如果最后一个参数不是以 - 开头，视为 prompt 文本
    if prompt_text and not prompt_text.startswith('-'):
        claude_args = claude_args[:-1]  # 从参数列表移除 prompt
        try:
            proc.stdin.write(prompt_text.encode('utf-8'))
            proc.stdin.close()
        except Exception as e:
            print(f"[timeout] stdin write warning: {e}", file=sys.stderr)

    # 启动 watchdog 线程
    wd = threading.Thread(
        target=watchdog_thread,
        args=(proc, pgid, timeout),
        daemon=True,
    )
    wd.start()

    try:
        # 等待 claude 完成
        exit_code = proc.wait()
    except KeyboardInterrupt:
        # CI runner 取消 job 时清理
        print(f"[timeout] KeyboardInterrupt, killing pgid={pgid}", file=sys.stderr)
        try:
            os.killpg(pgid, signal.SIGKILL)
        except Exception:
            pass
        sys.exit(124)

    # claude 正常退出，cancel watchdog（daemon thread 随主线程退出）
    print(f"[timeout] claude exited: code={exit_code}", file=sys.stderr)

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
