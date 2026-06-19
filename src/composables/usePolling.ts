import type { BuildIssue } from '../types/app'

export function usePolling() {
  const intervals: Map<number, ReturnType<typeof setInterval>> = new Map()

  function start(
    issueNumber: number,
    fetchFn: () => Promise<BuildIssue>,
    onUpdate: (issue: BuildIssue) => void,
    intervalMs = 5000
  ): void {
    if (intervals.has(issueNumber)) return

    let count = 0
    const maxPolls = 120 // 10 minutes at 5s interval

    const id = setInterval(async () => {
      count++
      try {
        const issue = await fetchFn()
        onUpdate(issue)
        if (issue.state === 'closed' || count >= maxPolls) {
          stop(issueNumber)
        }
      } catch (e) {
        console.error(`Polling error for issue #${issueNumber}:`, e)
        if (count >= maxPolls) stop(issueNumber)
      }
    }, intervalMs)

    intervals.set(issueNumber, id)
  }

  function stop(issueNumber: number): void {
    const id = intervals.get(issueNumber)
    if (id) {
      clearInterval(id)
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
