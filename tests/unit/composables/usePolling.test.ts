import { describe, expect, it, vi } from 'vitest'
import { usePolling } from '../../../src/composables/usePolling'

describe('usePolling cancellation', () => {
  it('ignores an in-flight response after polling is stopped', async () => {
    let resolveFetch!: (value: any) => void
    const fetchIssue = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const onUpdate = vi.fn()
    const { start, stop } = usePolling({ defaultIntervalMs: 60_000 })

    start(41, fetchIssue, onUpdate)
    expect(fetchIssue).toHaveBeenCalledTimes(1)
    stop(41)
    resolveFetch({ number: 41, state: 'open', labels: [] })
    await Promise.resolve()
    await Promise.resolve()

    expect(onUpdate).not.toHaveBeenCalled()
  })
})
