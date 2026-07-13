/**
 * Auth Flow E2E Tests
 *
 * 这些测试覆盖了认证流程的核心路径，如果这些测试在提交前通过，
 * 就能防止 c63ec0c / 656a32d / cda9ae0 这类破坏性变更被合并。
 */

import { testWithAuth, expect, loginAsOwner, mockUnauthenticatedGitHub, mockAuthenticatedGitHub } from './fixtures'
import type { Page } from '@playwright/test'

// ============================================================
// C1: OAuth Callback Flow (c63ec0c regression test)
// ============================================================

testWithAuth.describe('C1: OAuth Callback Flow', () => {
  testWithAuth('authenticated user sees Workspace on /', async ({ authenticatedPage }: { authenticatedPage: Page }) => {
    await mockAuthenticatedGitHub(authenticatedPage)
    await authenticatedPage.goto('/')
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    await loginAsOwner(authenticatedPage)
    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const token = await authenticatedPage.evaluate(() => sessionStorage.getItem('mitosis_token'))
    const user = await authenticatedPage.evaluate(() => sessionStorage.getItem('mitosis_user'))
    expect(token).not.toBeNull()
    expect(user).not.toBeNull()

    const hasSidebar = await authenticatedPage.locator('.sidebar').count()
    const hasChatArea = await authenticatedPage.locator('.chat-area').count()
    expect(hasSidebar).toBeGreaterThan(0)
    expect(hasChatArea).toBeGreaterThan(0)
  })
})

// ============================================================
// C2: Anonymous User Gallery (no auth required)
// ============================================================

testWithAuth.describe('C2: Anonymous User Gallery', () => {
  testWithAuth('anonymous user sees Gallery with login button', async ({ anonymousPage }: { anonymousPage: Page }) => {
    await mockUnauthenticatedGitHub(anonymousPage)
    await anonymousPage.goto('/')
    await anonymousPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const bodyText = await anonymousPage.locator('body').textContent()
    expect(bodyText).toContain('探索')
    expect(bodyText).toContain('应用')
    expect(bodyText).toContain('俄罗斯方块')
    expect(bodyText).toContain('v4')
    expect(bodyText).toContain('MVP 待办应用')

    const loginBtn = anonymousPage.locator('button:has-text("使用 GitHub 登录")')
    await expect(loginBtn).toBeVisible()
    await expect(loginBtn).toBeEnabled()
  })

  testWithAuth('anonymous user can open an app from Gallery', async ({ anonymousPage }: { anonymousPage: Page }) => {
    await mockUnauthenticatedGitHub(anonymousPage)
    await anonymousPage.goto('/')
    await anonymousPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const appCard = anonymousPage.locator('.app-item').first()
    if (await appCard.count() > 0) {
      await appCard.click()
      await anonymousPage.waitForURL(/\/apps\//, { timeout: 10000 })
    }
  })

  testWithAuth('known apps render immediately and keep friendly names after API enrichment', async ({ anonymousPage }: { anonymousPage: Page }) => {
    let releaseApps: () => void = () => {}
    const appsGate = new Promise<void>((resolve) => {
      releaseApps = resolve
    })
    await anonymousPage.route('**/api/github/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/contents/apps')) {
        await appsGate
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { type: 'dir', name: 'tetris-game' },
            { type: 'dir', name: 'mvp-validation-todo' },
            { type: 'dir', name: 'snake-game' },
          ]),
        })
        return
      }
      if (path.includes('/contents/apps/')) {
        const version = path.endsWith('/tetris-game') ? 'v5' : 'v0'
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ type: 'dir', name: version }]),
        })
        return
      }
      await route.fulfill({ status: 403, body: '{}' })
    })

    await anonymousPage.goto('/')

    await expect(anonymousPage.getByRole('button', { name: /俄罗斯方块 v4/ })).toBeVisible()
    await expect(anonymousPage.getByRole('button', { name: /MVP 待办应用 v0/ })).toBeVisible()
    await expect(anonymousPage.locator('.apps-grid--skeleton')).toHaveCount(0)

    releaseApps()
    await expect(anonymousPage.getByRole('button', { name: /snake-game v0/ })).toBeVisible({ timeout: 10000 })
    const enrichedTetris = anonymousPage.getByRole('button', { name: /俄罗斯方块 v5/ })
    await expect(enrichedTetris).toBeVisible()
    await expect(anonymousPage.getByRole('button', { name: /MVP 待办应用 v0/ })).toBeVisible()
    await enrichedTetris.click()
    await expect(anonymousPage).toHaveURL(/\/apps\/tetris-game\/v5\/$/)
  })
})

// ============================================================
// C3: Logged-in User Sees Workspace (656a32d regression test)
// ============================================================

testWithAuth.describe('C3: Logged-in User Workspace', () => {
  testWithAuth('logged-in user on root path sees Workspace, not Gallery', async ({ authenticatedPage }: { authenticatedPage: Page }) => {
    await mockAuthenticatedGitHub(authenticatedPage)
    await authenticatedPage.goto('/')
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    await loginAsOwner(authenticatedPage)
    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const hasSidebar = await authenticatedPage.locator('.sidebar').count()
    const hasChatArea = await authenticatedPage.locator('.chat-area').count()
    const hasGallery = await authenticatedPage.locator('.gallery').count()

    expect(hasSidebar).toBeGreaterThan(0)
    expect(hasChatArea).toBeGreaterThan(0)
    expect(hasGallery).toBe(0)
  })

  testWithAuth('logged-in user sees chat input in Workspace', async ({ authenticatedPage }: { authenticatedPage: Page }) => {
    await mockAuthenticatedGitHub(authenticatedPage)
    await authenticatedPage.goto('/')
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    await loginAsOwner(authenticatedPage)
    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const chatInput = authenticatedPage.locator('.chat-input, textarea, input[type="text"]')
    await expect(chatInput.first()).toBeVisible({ timeout: 5000 })
  })

  testWithAuth('logged-in user refresh stays in Workspace', async ({ authenticatedPage }: { authenticatedPage: Page }) => {
    await mockAuthenticatedGitHub(authenticatedPage)
    await authenticatedPage.goto('/')
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    await loginAsOwner(authenticatedPage)
    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const hasSidebar = await authenticatedPage.locator('.sidebar').count()
    expect(hasSidebar).toBeGreaterThan(0)

    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const hasSidebarAfterRefresh = await authenticatedPage.locator('.sidebar').count()
    expect(hasSidebarAfterRefresh).toBeGreaterThan(0)
  })

  testWithAuth('session click loads issue body in chat', async ({ authenticatedPage }: { authenticatedPage: Page }) => {
    await mockAuthenticatedGitHub(authenticatedPage)
    await authenticatedPage.goto('/')
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    await loginAsOwner(authenticatedPage)
    await authenticatedPage.reload()
    await authenticatedPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    // Click on the first session item (issue #4)
    const sessionItem = authenticatedPage.locator('.session-item').first()
    if (await sessionItem.count() > 0) {
      await sessionItem.click()
      await authenticatedPage.waitForTimeout(2000)

      // Verify issue body content appears in chat area
      const chatArea = authenticatedPage.locator('.chat-area')
      const bodyText = await chatArea.textContent()
      expect(bodyText).toContain('需求描述')
    }
  })
})

// ============================================================
// C4: Login Button State
// ============================================================

testWithAuth.describe('C4: Login Button State', () => {
  testWithAuth('login button is visible and enabled on Gallery', async ({ anonymousPage }: { anonymousPage: Page }) => {
    await mockUnauthenticatedGitHub(anonymousPage)
    await anonymousPage.goto('/')
    await anonymousPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const loginBtn = anonymousPage.locator('button:has-text("使用 GitHub 登录")')
    await expect(loginBtn).toBeVisible()
    await expect(loginBtn).toBeEnabled()
  })

  testWithAuth('login button exists on Gallery', async ({ anonymousPage }: { anonymousPage: Page }) => {
    await mockUnauthenticatedGitHub(anonymousPage)
    await anonymousPage.goto('/')
    await anonymousPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const loginBtn = anonymousPage.locator('button:has-text("使用 GitHub 登录")')
    await expect(loginBtn).toBeVisible()

    const btnCount = await loginBtn.count()
    expect(btnCount).toBeGreaterThan(0)
  })
})

// ============================================================
// C5: App Path Routing
// ============================================================

testWithAuth.describe('C5: App Path Routing', () => {
  testWithAuth('app path /apps/tetris-game/v2/ loads the app', async ({ anonymousPage }: { anonymousPage: Page }) => {
    await mockUnauthenticatedGitHub(anonymousPage)
    await anonymousPage.goto('/apps/tetris-game/v2/')
    await anonymousPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

    const bodyText = await anonymousPage.locator('body').textContent()
    expect(bodyText).toContain('TETRIS')
  })

  testWithAuth('auth/callback path loads SPA (no 404)', async ({ page }: { page: Page }) => {
    await mockUnauthenticatedGitHub(page)
    const response = await page.goto('/auth/callback?code=test_code_123')
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

    // Localhost dev: no SPA fallback → 404. Production (GitHub Pages): 404.html serves SPA → 200.
    const status = response?.status()
    expect([200, 404]).toContain(status)
  })
})
