#!/usr/bin/env python3
"""
claude-timeout.py — claude -p 的硬超时包装器
解决 timeout 无法有效杀掉 claude 子进程的问题

原理:
1. 用 subprocess.Popen(start_new_session=True) 启动 claude
   → 创建新进程组，所有子进程都属于该组
2. 后台线程作为 watchdog：超时后先 SIGTERM 整个进程组，再 SIGKILL
3. 主线程等待 claude 完成，返回其退出码

用法: python3 scripts/claude-timeout.py <seconds> -- <claude args...>
"""
import subprocess
import sys
import os
import signal
import threading
import time

def kill_process_group(pgid, sig=signal.SIGTERM):
    """向整个进程组发送信号"""
    try:
        os.killpg(pgid, sig)
    except ProcessLookupError:
        pass
    except PermissionError:
        pass

def watchdog_thread(pgid, timeout, grace=10):
    """Watchdog 线程：超时后杀掉进程组"""
    time.sleep(timeout)
    # 先 SIGTERM（优雅退出）
    kill_process_group(pgid, signal.SIGTERM)
    time.sleep(grace)
    # 再 SIGKILL（强制退出）
    kill_process_group(pgid, signal.SIGKILL)

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

    # 启动 claude 在新进程组中
    proc = subprocess.Popen(
        claude_args,
        start_new_session=True,  # 创建新 session → 新进程组
        stdout=sys.stdout,
        stderr=sys.stderr,
    )

    pgid = os.getpgid(proc.pid)
    print(f"[timeout] claude started: pid={proc.pid}, pgid={pgid}", file=sys.stderr)
    print(f"[timeout] watchdog: {timeout}s + {10}s grace", file=sys.stderr)

    # 启动 watchdog 线程
    wd = threading.Thread(target=watchdog_thread, args=(pgid, timeout), daemon=True)
    wd.start()

    # 等待 claude 完成
    exit_code = proc.wait()

    # claude 正常退出，取消 watchdog
    print(f"[timeout] claude exited: code={exit_code}", file=sys.stderr)

    sys.exit(exit_code)

if __name__ == '__main__':
    main()
