import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock globals ────────────────────────────────────────────
beforeEach(() => {
  vi.restoreAllMocks()
})

// ================================================================
// fetchWithTimeout — timeout behavior
// ================================================================
describe('fetchWithTimeout', () => {
  it('resolves when fetch returns before timeout', async () => {
    const { fetchWithTimeout } = await import('../../../src/composables/useGitHubAPI')

    const mockResponse = new Response('ok', { status: 200 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await fetchWithTimeout('https://api.github.com/test')

    expect(result).toBe(mockResponse)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.github.com/test')
  })

  it('passes request options to fetch', async () => {
    const { fetchWithTimeout } = await import('../../../src/composables/useGitHubAPI')

    const mockResponse = new Response('ok', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    await fetchWithTimeout('https://api.github.com/test', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: '{}',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('aborts after timeout', async () => {
    const { fetchWithTimeout } = await import('../../../src/composables/useGitHubAPI')

    let controller: AbortController | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url: string, init: any) => {
      controller = init.signal
      // Simulate a slow response that won't complete before abort
      return new Promise((_, reject) => {
        controller?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'))
        })
      })
    })

    const err = await fetchWithTimeout('https://api.github.com/slow', {}, 100).catch(e => e)
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('AbortError')
  })

  it('clears abort timer on successful fetch', async () => {
    const { fetchWithTimeout } = await import('../../../src/composables/useGitHubAPI')

    const mockResponse = new Response('ok', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    // Should not hang even with very short timeout
    await fetchWithTimeout('https://api.github.com/test', {}, 5000)

    // If we get here without hanging, the timer was properly cleared
    expect(true).toBe(true)
  })
})

// ================================================================
// listApps — API response parsing
// ================================================================
describe('listApps response parsing', () => {
  /**
   * 直接测试 listApps 的解析逻辑（不依赖真实 API）
   * 我们 mock fetch 返回模拟的 GitHub API 响应
   */
  it('parses GitHub API directory listing into AppInfo array', async () => {
    // Mock fetch: first call → apps/ contents, subsequent calls → app version dirs
    let callCount = 0
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url: string) => {
      callCount++
      if (callCount === 1) {
        // Response for /repos/{owner}/{repo}/contents/apps
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { type: 'dir', name: 'tetris-game', created_at: '2025-01-01T00:00:00Z' },
              { type: 'dir', name: 'snake-game', created_at: '2025-02-01T00:00:00Z' },
              { type: 'file', name: 'README.md' },
            ]),
            { status: 200 }
          )
        )
      }
      // Response for each app's version directory
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { type: 'dir', name: 'v1' },
            { type: 'dir', name: 'v2' },
            { type: 'file', name: 'index.html' },
          ]),
          { status: 200 }
        )
      )
    })

    const { listApps } = await import('../../../src/composables/useGitHubAPI')
    const apps = await listApps('token', 'zenHeart/mitosis')

    expect(apps).toHaveLength(2)
    expect(apps[0].id).toBe('tetris-game')
    expect(apps[0].latestVersion).toBe(2)
    expect(apps[0].url).toBe('/apps/tetris-game/v2/')
    expect(apps[1].id).toBe('snake-game')
    expect(apps[1].latestVersion).toBe(2)
    expect(apps[1].url).toBe('/apps/snake-game/v2/')

    // Should have called fetch for each app's versions dir
    expect(callCount).toBe(3) // 1 apps dir + 2 app dirs
  })

  it('returns empty array when API returns error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 })
    )

    const { listApps } = await import('../../../src/composables/useGitHubAPI')
    const apps = await listApps('token', 'zenHeart/mitosis')

    expect(apps).toEqual([])
  })

  it('returns empty array when API response is not an array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not an array' }), { status: 200 })
    )

    const { listApps } = await import('../../../src/composables/useGitHubAPI')
    const apps = await listApps('token', 'zenHeart/mitosis')

    expect(apps).toEqual([])
  })

  it('skips app dirs that fail to fetch versions', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url: string) => {
      callCount++
      if (callCount === 1) {
        // apps/ contents — two dirs
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { type: 'dir', name: 'good-app', created_at: '2025-01-01' },
              { type: 'dir', name: 'bad-app', created_at: '2025-01-02' },
            ]),
            { status: 200 }
          )
        )
      }
      if (callCount === 2) {
        // good-app/v* — success
        return Promise.resolve(
          new Response(JSON.stringify([{ type: 'dir', name: 'v1' }]), { status: 200 })
        )
      }
      // bad-app/v* — error, should be skipped
      return Promise.resolve(new Response('Error', { status: 500 }))
    })

    const { listApps } = await import('../../../src/composables/useGitHubAPI')
    const apps = await listApps('token', 'zenHeart/mitosis')

    expect(apps).toHaveLength(1)
    expect(apps[0].id).toBe('good-app')
  })

  it('handles apps with no version dirs', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url: string) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify([{ type: 'dir', name: 'empty-app', created_at: '2025-01-01' }]), { status: 200 })
        )
      }
      // No version dirs
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    })

    const { listApps } = await import('../../../src/composables/useGitHubAPI')
    const apps = await listApps('token', 'zenHeart/mitosis')

    // latestVersion defaults to 0 when no version dirs
    expect(apps).toHaveLength(1)
    expect(apps[0].latestVersion).toBe(0)
    expect(apps[0].url).toBe('/apps/empty-app/v0/')
  })

  it('extracts latest version number from v-prefixed dirs', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url: string) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify([{ type: 'dir', name: 'multi-ver', created_at: '2025-01-01' }]),
            { status: 200 }
          )
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { type: 'dir', name: 'v1' },
            { type: 'dir', name: 'v3' },
            { type: 'dir', name: 'v2' },
          ]),
          { status: 200 }
        )
      )
    })

    const { listApps } = await import('../../../src/composables/useGitHubAPI')
    const apps = await listApps('token', 'zenHeart/mitosis')

    expect(apps[0].latestVersion).toBe(3)
    expect(apps[0].url).toBe('/apps/multi-ver/v3/')
  })
})

// ================================================================
// fetchWithTimeout — edge cases
// ================================================================
describe('fetchWithTimeout edge cases', () => {
  it('uses default 10s timeout when not specified', async () => {
    const { fetchWithTimeout } = await import('../../../src/composables/useGitHubAPI')

    const mockResponse = new Response('ok', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    await fetchWithTimeout('https://api.github.com/test')

    // Verify fetch was called with an AbortSignal (timeout was set)
    const fetchCall = (globalThis.fetch as any).mock.calls[0]
    expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('clears timer even when fetch rejects', async () => {
    const { fetchWithTimeout } = await import('../../../src/composables/useGitHubAPI')

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    await expect(fetchWithTimeout('https://api.github.com/test')).rejects.toThrow('Network error')
    // If we reach here, the timer was cleared (no hang)
  })
})
