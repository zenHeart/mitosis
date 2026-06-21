import { test as base, type Page } from '@playwright/test'

// Re-export everything from base test
export const test = base
export const expect = base.expect

// Test types
export type AuthTestFixtures = {
  authenticatedPage: Page
  anonymousPage: Page
}

// Custom test with auth fixtures
export const testWithAuth = base.extend<AuthTestFixtures>({
  // Page with clean anonymous session (default)
  anonymousPage: async ({ page }, use) => {
    await page.context().addInitScript(() => {
      sessionStorage.clear()
      localStorage.clear()
    })
    await use(page)
  },

  // Page with pre-authenticated session (simulated)
  authenticatedPage: async ({ page }, use) => {
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mitosis_token', 'test_token_direct')
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: 'test-owner',
        id: 12345,
        avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
        html_url: 'https://github.com/test-owner',
        name: 'Test Owner',
      }))
      localStorage.setItem('mitosis_setup_complete', 'true')
    })
    await use(page)
  },
})

// ── 辅助函数 ──────────────────────────────────────────────────────

export async function loginAsOwner(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.setItem('mitosis_token', 'test_token_direct')
    sessionStorage.setItem('mitosis_user', JSON.stringify({
      login: 'test-owner',
      id: 12345,
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
      html_url: 'https://github.com/test-owner',
      name: 'Test Owner',
    }))
    localStorage.setItem('mitosis_setup_complete', 'true')
  })
}

/**
 * 拦截所有 GitHub API 请求，返回未认证响应（403）。
 * 应用会据此判断用户未登录，展示 Gallery。
 */
export async function mockUnauthenticatedGitHub(page: Page): Promise<void> {
  // Vite dev proxy 路径：/api/github/*
  await page.route('/api/github/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/user')) {
      await route.fulfill({ status: 403, body: '{}' })
    } else if (url.includes('/repos/')) {
      // repos 请求也返回空，避免触发其他逻辑
      await route.fulfill({ status: 404, body: '[]' })
    } else {
      await route.fulfill({ status: 403, body: '{}' })
    }
  })
}

/**
 * 拦截 GitHub API 请求，返回模拟 owner 用户数据。
 * 应用会据此判断用户已登录。
 */
export async function mockAuthenticatedGitHub(page: Page): Promise<void> {
  const userJson = JSON.stringify({
    login: 'zenHeart',
    id: 12345,
    avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
    html_url: 'https://github.com/zenHeart',
    name: 'zenHeart',
  })

  const issue4Body = '## 需求描述\n\n是的 mitosis 平台本身\n\n## AI 分析\n\n本次修改属于Mitosis平台核心代码变更。'
  const issue4Json = JSON.stringify({
    number: 4,
    title: 'platform: 是的 mitosis 平台本身',
    state: 'open',
    body: issue4Body,
    labels: [
      { name: 'platform' },
      { name: 'needs-review' },
    ],
    created_at: '2026-06-20T14:14:04Z',
    updated_at: '2026-06-20T14:14:20Z',
  })
  const issuesListJson = JSON.stringify([
    {
      number: 4,
      title: 'platform: 是的 mitosis 平台本身',
      state: 'open',
      labels: [{ name: 'platform' }, { name: 'needs-review' }],
      created_at: '2026-06-20T14:14:04Z',
      updated_at: '2026-06-20T14:14:20Z',
      appLabel: undefined,
    },
  ])
  const commentsJson = JSON.stringify([
    { id: 4706977707, body: '第一条评论内容', user: { login: 'zenHeart' }, created_at: '2026-06-20T14:15:00Z' },
  ])

  await page.route('/api/github/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.github+json',
        body: userJson,
      })
    } else if (url.includes('/issues/') && !url.includes('/issues?')) {
      // Single issue or comments: /issues/{number} or /issues/{number}/comments
      if (url.includes('/comments')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: commentsJson,
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: issue4Json,
        })
      }
    } else if (url.includes('/issues?')) {
      // Issue list
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.github+json',
        body: issuesListJson,
      })
    } else if (url.includes('/repos/')) {
      await route.fulfill({ status: 404, body: '[]' })
    } else {
      await route.fulfill({ status: 403, body: '{}' })
    }
  })
}
