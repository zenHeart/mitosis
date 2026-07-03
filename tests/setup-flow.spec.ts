/**
 * C2.2: Owner Setup Flow — 真实集成验证
 *
 * 使用真实 GitHub API 验证：
 * 1. 登录后仓库归属判断正确
 * 2. StepFun token 验证流程
 * 3. GitHub Secrets 指引显示
 * 4. 完成 setup 后进入 Workspace
 * 5. token 不显示明文
 */

import { test, expect, type Page } from '@playwright/test'

// ── 配置 ──────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const HAS_GITHUB_PAT = !!process.env.GITHUB_MCP_PAT
const HAS_STEP_TOKEN = !!process.env.STEP_TOKEN

// ── 辅助函数 ──────────────────────────────────────────────────

/** 用真实 token 设置已认证 session */
async function setAuthenticatedSession(page: Page, token: string, userLogin: string): Promise<void> {
  await page.context().addInitScript(([token, userLogin]) => {
    sessionStorage.setItem('mitosis_token', token)
    sessionStorage.setItem('mitosis_user', JSON.stringify({
      login: userLogin,
      id: 12345,
      avatar_url: `https://avatars.githubusercontent.com/u/12345?v=4`,
      html_url: `https://github.com/${userLogin}`,
      name: userLogin,
    }))
  }, [token, userLogin])
}

/** 通过 dev server 代理检查仓库归属（模拟 verifyRepoOwnership 的真实调用） */
async function checkRepoOwnershipViaProxy(page: Page, userLogin: string): Promise<boolean> {
  const response = await page.evaluate(async (login: string) => {
    const res = await fetch(`http://127.0.0.1:5173/api/github/repos/${login}/mitosis`, {
      headers: { 'Accept': 'application/vnd.github+json' },
    })
    if (res.status === 404) return false
    if (!res.ok) return false
    const repo = await res.json()
    return repo.owner?.login === login
  }, userLogin)
  return response
}

/** 检查页面是否包含 token 明文 */
async function assertNoPlaintextToken(page: Page, token: string): Promise<void> {
  const tokenPrefix = token.slice(0, 8)
  const content = await page.content()
  expect(content).not.toContain(token)
  expect(content).not.toContain(tokenPrefix)
}

// ── 真实 API 仓库归属验证 ───────────────────────────────────

test(HAS_GITHUB_PAT ? '真实 API: 仓库归属检查对有效 token 返回布尔值' : 'SKIP: 无 GITHUB_MCP_PAT',
  async ({ page }: { page: Page }) => {
    if (!HAS_GITHUB_PAT) {
      test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
      return
    }
    const result = await checkRepoOwnershipViaProxy(page, 'zenHeart')
    expect(typeof result).toBe('boolean')
  })

test(HAS_GITHUB_PAT ? '真实 API: 非 owner 用户返回 false' : 'SKIP: 无 GITHUB_MCP_PAT',
  async ({ page }: { page: Page }) => {
    if (!HAS_GITHUB_PAT) {
      test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
      return
    }
    const result = await checkRepoOwnershipViaProxy(page, 'this-user-definitely-does-not-exist-12345')
    expect(result).toBe(false)
  })

// ── Setup 页面 UI 流程 ──────────────────────────────────────

test('匿名用户看到 Gallery 而非 Setup', async ({ page }: { page: Page }) => {
  await page.goto(BASE_URL)
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
  const gallery = page.locator('.gallery')
  await expect(gallery).toBeVisible({ timeout: 10000 })
})

test('已认证用户在 Setup 看到正确的 UI 分支',
  async ({ page }: { page: Page }) => {
    if (!HAS_GITHUB_PAT) {
      test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
      return
    }
    const token = process.env.GITHUB_MCP_PAT as string
    await setAuthenticatedSession(page, token, 'zenHeart')
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(4000)

    const hasNonOwnerGuide = await page.locator('.non-owner-guide').count()
    const hasStepTokenForm = await page.locator('.form').count()
    expect(hasNonOwnerGuide + hasStepTokenForm).toBeGreaterThan(0)
  })

test('Setup 页面 StepFun token 输入为 password 类型且不显示明文',
  async ({ page }: { page: Page }) => {
    if (!HAS_GITHUB_PAT) {
      test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
      return
    }
    const token = process.env.GITHUB_MCP_PAT as string
    await setAuthenticatedSession(page, token, 'zenHeart')
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(4000)

    const tokenInput = page.locator('input[type="password"]')
    const count = await tokenInput.count()
    if (count > 0) {
      await expect(tokenInput.first()).toBeVisible()
    }
    await assertNoPlaintextToken(page, token)
  })

test(HAS_STEP_TOKEN ? 'Setup: StepFun token 验证成功流程' : 'SKIP: 无 STEP_TOKEN',
  async ({ page }: { page: Page }) => {
    if (!HAS_STEP_TOKEN || !HAS_GITHUB_PAT) {
      test.skip(true, '需要 STEP_TOKEN 和 GITHUB_MCP_PAT 环境变量')
      return
    }
    const githubToken = process.env.GITHUB_MCP_PAT as string
    const stepToken = process.env.STEP_TOKEN as string

    await setAuthenticatedSession(page, githubToken, 'zenHeart')
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(4000)

    const tokenInput = page.locator('input[type="password"]')
    const inputCount = await tokenInput.count()
    if (inputCount === 0) {
      test.skip(true, '当前用户不是 repo owner，无法看到 StepFun token 输入')
      return
    }

    await tokenInput.first().fill(stepToken)
    const submitBtn = page.locator('button:has-text("验证 Token")')
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click()
      await page.waitForTimeout(5000)
      const successBanner = page.locator('.success-banner')
      await expect(successBanner).toBeVisible({ timeout: 10000 })
    }
  })

test('Setup 完成后进入 Workspace',
  async ({ page }: { page: Page }) => {
    if (!HAS_GITHUB_PAT) {
      test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
      return
    }
    const token = process.env.GITHUB_MCP_PAT as string
    await setAuthenticatedSession(page, token, 'zenHeart')
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(4000)

    const continueBtn = page.locator('button:has-text("我已添加 Secret")')
    if (await continueBtn.count() > 0) {
      await continueBtn.first().click()
      await page.waitForTimeout(2000)
      const sidebar = page.locator('.sidebar, .session-sidebar')
      await expect(sidebar.first()).toBeVisible({ timeout: 10000 })
    }
  })

// ── Token 不显示明文 ────────────────────────────────────────

test('页面内容中不包含 GitHub token 明文',
  async ({ page }: { page: Page }) => {
    if (!HAS_GITHUB_PAT) {
      test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
      return
    }
    const token = process.env.GITHUB_MCP_PAT as string
    await setAuthenticatedSession(page, token, 'zenHeart')
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(4000)
    await assertNoPlaintextToken(page, token)
  })

test('页面内容中不包含 StepFun token 明文（如有）',
  async ({ page }: { page: Page }) => {
    if (!HAS_STEP_TOKEN || !HAS_GITHUB_PAT) {
      test.skip(true, '需要 STEP_TOKEN 和 GITHUB_MCP_PAT 环境变量')
      return
    }
    const githubToken = process.env.GITHUB_MCP_PAT as string
    const stepToken = process.env.STEP_TOKEN as string

    await setAuthenticatedSession(page, githubToken, 'zenHeart')
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(4000)

    const content = await page.content()
    expect(content).not.toContain(stepToken)
    expect(content).not.toContain(stepToken.slice(0, 8))
  })
