import type { BuildIssue } from '../types/app'

export function usePolling(options?: { defaultIntervalMs?: number }) {
  const defaultInterval = options?.defaultIntervalMs ?? 5000
  const intervals = new Map<number, { timer: ReturnType<typeof setInterval>; cancelled: boolean }>()

  function start(
    issueNumber: number,
    fetchFn: () => Promise<BuildIssue>,
    onUpdate: (issue: BuildIssue) => void,
    intervalMs?: number,
    onTimeout?: () => void,
  ): void {
    if (intervals.has(issueNumber)) return

    let count = 0
    let inFlight = false
    const maxPolls = 120 // 10 minutes at 5s interval
    const actualInterval = intervalMs ?? defaultInterval
    const state = { timer: undefined as unknown as ReturnType<typeof setInterval>, cancelled: false }

    const poll = async () => {
      if (inFlight) return
      inFlight = true
      count++
      try {
        const issue = await fetchFn()
        if (state.cancelled || intervals.get(issueNumber) !== state) return
        await onUpdate(issue)
        if (state.cancelled || intervals.get(issueNumber) !== state) return
        if (issue.state === 'closed') {
          stop(issueNumber)
        } else if (count >= maxPolls) {
          onTimeout?.()
          stop(issueNumber)
        }
      } catch {
        console.error('[POLLING] issue update failed', { issueNumber })
        if (count >= maxPolls) {
          onTimeout?.()
          stop(issueNumber)
        }
      } finally {
        inFlight = false
      }
    }

    state.timer = setInterval(poll, actualInterval)
    intervals.set(issueNumber, state)
    void poll()
  }

  function stop(issueNumber: number): void {
    const state = intervals.get(issueNumber)
    if (state) {
      state.cancelled = true
      clearInterval(state.timer)
      intervals.delete(issueNumber)
    }
  }

  function stopAll(): void {
    for (const [num] of intervals) {
      stop(num)
    }
  }

  return { start, stop, stopAll }
}
