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
  // Page with pre-authenticated session (simulated)
  authenticatedPage: async ({ page }, use) => {
    // Intercept OAuth proxy and GitHub API for simulated auth
    await page.route('**/mitosis-oauth-proxy.workers.dev/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'test_token_' + Date.now() }),
      })
    })

    await page.route('**/api.github.com/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'test-owner',
          id: 12345,
          avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
          html_url: 'https://github.com/test-owner',
          name: 'Test Owner',
        }),
      })
    })

    // Set OAuth code in sessionStorage (simulating 404.html behavior)
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mitosis_oauth_code', 'test_code_' + Date.now())
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
    })

    await use(page)
  },

  // Page with clean anonymous session
  anonymousPage: async ({ page }, use) => {
    await page.context().addInitScript(() => {
      sessionStorage.clear()
      localStorage.clear()
    })
    await use(page)
  },
})
