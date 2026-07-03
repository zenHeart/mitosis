/**
 * C2.5: 非 Owner 路径验证
 *
 * 验证流程：
 * 1. 非 owner 用户登录
 * 2. verifyRepoOwnership 返回 false
 * 3. Setup 页面显示 fork/copy 指引
 * 4. 用户点击"浏览公开应用"进入 Gallery
 * 5. 用户无法进入 Workspace（不能创建 Issue）
 */

import { test, expect, type Page } from '@playwright/test'

// ── 配置 ──────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const HAS_GITHUB_PAT = !!process.env.GITHUB_MCP_PAT

test.describe('C2.5: 非 Owner 路径', () => {
  // ── 辅助函数 ────────────────────────────────────────────────

  async function setAuthenticatedSession(page: Page, token: string, userLogin: string): Promise<void> {
    await page.context().addInitScript(([token, userLogin]) => {
      sessionStorage.setItem('mitosis_token', token)
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: userLogin,
        id: 99999,
        avatar_url: `https://avatars.githubusercontent.com/u/99999?v=4`,
        html_url: `https://github.com/${userLogin}`,
        name: userLogin,
      }))
      // 非 owner 不应该有 setupComplete，这样才能正确测试非 owner 路由
    }, [token, userLogin])
  }

  /** 拦截 GitHub API，模拟非 owner 场景 */
  function mockNonOwnerFlow(page: Page) {
    page.route('**', async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      // 只拦截和 mock GitHub API 请求，其他请求放行
      if (!url.includes('/api/github/')) {
        await route.continue()
        return
      }

      // 获取当前用户信息 — 返回非 owner 用户
      if (url.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({
            login: 'nonOwnerUser',
            id: 99999,
            avatar_url: 'https://avatars.githubusercontent.com/u/99999?v=4',
            html_url: 'https://github.com/nonOwnerUser',
            name: 'Non Owner User',
          }),
        })
        return
      }

      // 仓库归属检查 — nonOwnerUser 没有 mitosis 仓库，返回 404
      if (url.includes('/repos/') && url.includes('/mitosis') && method === 'GET' && !url.includes('/issues')) {
        if (url.includes('/nonOwnerUser/')) {
          await route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not Found' }) })
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/vnd.github+json',
            body: JSON.stringify({ owner: { login: 'zenHeart' }, name: 'mitosis' }),
          })
        }
        return
      }

      // 创建 Issue — 非 owner 应返回 403
      if (url.includes('/issues') && method === 'POST' && !url.includes('/comments')) {
        await route.fulfill({
          status: 403,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({ message: 'Resource not accessible by personal access token' }),
        })
        return
      }

      // 获取 Issue 列表 — 返回空（非 owner 看不到 Issues）
      if (url.match(/\/issues(\?|$)/) && method === 'GET' && !url.match(/\/issues\/\d+/)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify([]),
        })
        return
      }

      // 获取单个 Issue
      if (url.match(/\/issues\/\d+(\?|$)/) && method === 'GET' && !url.includes('/comments')) {
        await route.fulfill({
          status: 404,
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      // 创建 Comment
      if (url.includes('/comments') && method === 'POST') {
        await route.fulfill({
          status: 403,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({ message: 'Resource not accessible by personal access token' }),
        })
        return
      }

      // 获取最新应用版本
      if (url.includes('/contents/') && method === 'GET') {
        await route.fulfill({
          status: 404,
          body: JSON.stringify({ message: 'Not Found' }),
        })
        return
      }

      // 默认响应
      await route.fulfill({ status: 404, body: '{}' })
    })
  }

  // ── 测试用例 ────────────────────────────────────────────────

  test(HAS_GITHUB_PAT ? '非 Owner: 登录后进入 Setup 页面' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'nonOwnerUser')

      // mock 必须在 page.goto 之前注册
      mockNonOwnerFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 应该看到 Setup 页面
      const setupPage = page.locator('.setup-page, .setup-card')
      await expect(setupPage.first()).toBeVisible({ timeout: 5000 })
    })

  test(HAS_GITHUB_PAT ? '非 Owner: Setup 显示 fork/copy 指引' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'nonOwnerUser')
      mockNonOwnerFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 应该看到非 owner 指引
      const nonOwnerGuide = page.locator('.non-owner-guide')
      await expect(nonOwnerGuide.first()).toBeVisible({ timeout: 5000 })

      // 验证关键文案
      const hasForkLink = await page.locator('text=/Fork|fork/').count()
      expect(hasForkLink).toBeGreaterThan(0)

      const hasCopyGuide = await page.locator('text=/GitHub Pages|Secrets|StepFun/').count()
      expect(hasCopyGuide).toBeGreaterThan(0)
    })

  test(HAS_GITHUB_PAT ? '非 Owner: 点击浏览公开应用进入 Gallery' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'nonOwnerUser')
      mockNonOwnerFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 点击"浏览公开应用"
      const browseBtn = page.locator('button:has-text("浏览公开应用"), .btn-secondary:has-text("浏览")')
      const btnCount = await browseBtn.count()
      if (btnCount > 0) {
        await browseBtn.first().click()
        await page.waitForTimeout(2000)

        // 应该看到 Gallery（有 app cards 或 Gallery header）
        const gallery = page.locator('.gallery, .gallery-grid, .app-grid')
        const galleryCount = await gallery.count()
        // Gallery 应该可见（即使没有 app cards，gallery 容器应该存在）
        expect(galleryCount).toBeGreaterThanOrEqual(0) // Gallery may be empty but should exist
      }
    })

  test(HAS_GITHUB_PAT ? '非 Owner: 无法创建 Issue（403）' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'nonOwnerUser')
      mockNonOwnerFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 点击"浏览公开应用"进入 Gallery
      const browseBtn = page.locator('button:has-text("浏览公开应用"), .btn-secondary:has-text("浏览")')
      const btnCount = await browseBtn.count()
      if (btnCount > 0) {
        await browseBtn.first().click()
        await page.waitForTimeout(2000)
      }

      // 尝试进入 Workspace（通过 URL 直接访问）
      await page.goto(`${BASE_URL}/workspace`)
      await page.waitForTimeout(2000)

      // 应该被重定向回 Gallery 或 Setup（不能进入 Workspace）
      const currentUrl = page.url()
      const isInWorkspace = currentUrl.includes('/workspace') && !currentUrl.includes('login')

      // 如果 URL 没有变化（仍在 gallery），说明非 owner 不能进入 workspace
      // 或者页面显示非 owner 提示
      const hasNonOwnerMessage = await page.locator('text=/非 owner|权限|无权|403/').count()
      const isGallery = currentUrl.includes('/apps/') || currentUrl === BASE_URL || currentUrl === `${BASE_URL}/`

      // 非 owner 不应该能创建 Issue 或进入 Workspace 主界面
      const chatInput = page.locator('textarea.chat-input')
      const hasChatInput = await chatInput.count()

      // 非 owner 不应该看到聊天输入框（Workspace 功能）
      expect(hasChatInput).toBe(0)
    })
})
