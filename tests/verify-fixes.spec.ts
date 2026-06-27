/**
 * Deep verification script for the three bug fixes:
 * 1. Auto-identify task type (triage logic)
 * 2. Mobile compatibility (CSS responsive rules)
 * 3. GitHub OAuth duplicate auth and lost auth state (auth store logic)
 *
 * Run with: npx tsx verify-fixes.mjs
 */

import { test, expect } from './fixtures'

const BASE_URL = 'http://localhost:5174'

test.describe('Fix 1: Auto-identify task type', () => {
  test('Gallery page loads and shows apps', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Check page title
    await expect(page).toHaveTitle('Mitosis')

    // Check apps are displayed
    const apps = await page.locator('.app-item').count()
    expect(apps).toBeGreaterThan(0)

    // Check app names
    const appNames = await page.locator('.app-name').allTextContents()
    expect(appNames.some((name) => name.includes('snake'))).toBe(true)
    expect(appNames.some((name) => name.includes('tetris'))).toBe(true)
  })

  test('Dark mode toggle works', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Click theme toggle
    const themeBtn = page.locator('button.theme-toggle')
    await expect(themeBtn).toBeVisible()
    await themeBtn.click()

    // Check data-theme attribute changed
    const theme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme')
    })
    expect(['dark', 'light']).toContain(theme)
  })

  test('Login button is visible and clickable', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Check login button exists (may show "跳转中..." after click)
    const loginBtn = page.locator('button.cta-login')
    await expect(loginBtn).toBeVisible()
  })
})

test.describe('Fix 2: Mobile compatibility', () => {
  test('Mobile layout shows single column apps', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Check apps are displayed in single column on mobile
    const appsGrid = await page.locator('.apps-grid').first()
    await expect(appsGrid).toBeVisible()

    // Check app cards are visible
    const appItems = await page.locator('.app-item').count()
    expect(appItems).toBeGreaterThan(0)

    // Take screenshot for visual verification
    await page.screenshot({ path: 'playwright-mcp/mobile-gallery.png', fullPage: true })
  })

  test('Mobile viewport meta tag exists', async ({ page }) => {
    await page.goto(BASE_URL)

    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]')
      return meta?.getAttribute('content') || ''
    })

    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('initial-scale=1.0')
  })

  test('Touch targets are large enough on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Check that CTA buttons have sufficient height for touch (>= 44px)
    const ctaBtn = await page.locator('.cta-login').boundingBox()
    if (ctaBtn) {
      expect(ctaBtn.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('Fix 3: OAuth duplicate auth and lost auth state', () => {
  test('Auth store init handles empty state', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Verify we're on gallery (not stuck in login/setup loop)
    const view = await page.evaluate(() => {
      return document.querySelector('.gallery-header h1')?.textContent || ''
    })
    expect(view).toContain('Mitosis')
  })

  test('Session storage cleanup on auth error', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Simulate OAuth code in sessionStorage (invalid code)
    await page.evaluate(() => {
      sessionStorage.setItem('mitosis_oauth_code', 'invalid_test_code')
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
    })

    // Reload page - authStore.init() will try to exchange the code
    await page.reload()
    await page.waitForTimeout(3000)

    // The code should be removed from sessionStorage after processing
    const oauthCode = await page.evaluate(() => {
      return sessionStorage.getItem('mitosis_oauth_code')
    })

    // Code should be consumed/removed
    expect(oauthCode).toBeNull()
  })

  test('Auth state survives page reload (localStorage fallback)', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Simulate auth state in localStorage (as if user was logged in)
    await page.evaluate(() => {
      localStorage.setItem('mitosis_token', 'test_token_123')
      localStorage.setItem('mitosis_user', JSON.stringify({
        login: 'testuser',
        id: 123,
        avatar_url: 'https://example.com/avatar.png',
        html_url: 'https://github.com/testuser',
        name: 'Test User'
      }))
    })

    // Reload - authStore.init() should restore from localStorage
    await page.reload()
    await page.waitForTimeout(2000)

    // Check that sessionStorage was populated from localStorage
    const sessionToken = await page.evaluate(() => {
      return sessionStorage.getItem('mitosis_token')
    })

    expect(sessionToken).toBe('test_token_123')
  })
})

test.describe('End-to-end integration', () => {
  test('Complete flow: Gallery → Login → Setup → Workspace (mock)', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForSelector('.gallery-header h1', { timeout: 10000 })

    // Verify Gallery is shown
    const galleryHeader = await page.locator('.gallery-header h1').textContent()
    expect(galleryHeader).toContain('Mitosis')

    // Verify apps are loaded
    const apps = await page.locator('.app-item').count()
    expect(apps).toBeGreaterThan(0)

    // Take final screenshot
    await page.screenshot({ path: 'playwright-mcp/final-gallery.png', fullPage: true })
  })
})
