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

  await page.route('/api/github/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.github+json',
        body: userJson,
      })
    } else if (url.includes('/repos/')) {
      await route.fulfill({ status: 404, body: '[]' })
    } else {
      await route.fulfill({ status: 403, body: '{}' })
    }
  })
}
