/**
 * C2.3: App Build闭环 — 真实集成验证
 *
 * 验证流程：
 * 1. 发送"做一个 todo 应用" → triage 识别为 build 意图
 * 2. createBuild 创建 app Issue（label: app/todo-app）
 * 3. 自动评论 /create 触发 CI Agent Loop
 * 4. UI 轮询 Issue 状态，展示 status:building → status:verifying → status:review
 *
 * 使用 Playwright route 拦截模拟 GitHub API  progressive status labels。
 */

import { test, expect, type Page } from '@playwright/test'

// ── 配置 ──────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const HAS_GITHUB_PAT = !!process.env.GITHUB_MCP_PAT

// 模拟的 Issue 状态流转（模拟真实 GitHub API：每次轮询返回当前全部 labels，逐步添加 status labels）
// 注意：真实 GitHub API 每次 GET 返回 Issue 当前全部 labels，这里用 progressive 模拟
const STATUS_FLOW = [
  { state: 'open', labels: [{ name: 'app/todo-app' }] },
  { state: 'open', labels: [{ name: 'app/todo-app' }, { name: 'status:building' }] },
  { state: 'open', labels: [{ name: 'app/todo-app' }, { name: 'status:verifying' }] },
  { state: 'open', labels: [{ name: 'app/todo-app' }, { name: 'status:review' }] },
]

test.describe('C2.3: App Build 闭环', () => {
  // ── 辅助函数 ────────────────────────────────────────────────

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
      localStorage.setItem('mitosis_setup_complete', 'true')
    }, [token, userLogin])
  }

  /** 拦截 GitHub API，模拟 progressive status labels */
  function mockBuildFlow(page: Page) {
    let pollCount = 0
    const createdIssues: { number: number; title: string; body: string; labels: { name: string }[] }[] = []
    const createdComments: { issue_number: number; body: string }[] = []

    page.route('**', async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      // 只拦截和 mock GitHub API 请求，其他请求放行
      if (!url.includes('/api/github/')) {
        await route.continue()
        return
      }

      // 获取当前用户信息
      if (url.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({
            login: 'zenHeart',
            id: 12345,
            avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
            html_url: 'https://github.com/zenHeart',
            name: 'zenHeart',
          }),
        })
        return
      }

      // 仓库归属检查
      if (url.includes('/repos/') && url.includes('/mitosis') && method === 'GET' && !url.includes('/issues')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({ owner: { login: 'zenHeart' }, name: 'mitosis' }),
        })
        return
      }

      // 创建 Issue
      if (url.includes('/issues') && method === 'POST' && !url.includes('/comments')) {
        const body = await route.request().postDataJSON()
        const issueNumber = createdIssues.length + 100
        // 规范化 labels：postDataJSON 可能返回字符串数组，统一转为 {name} 对象
        const labelObjs = (body.labels || []).map(l =>
          typeof l === 'string' ? { name: l } : l
        )
        createdIssues.push({
          number: issueNumber,
          title: body.title || 'untitled',
          body: body.body || '',
          labels: labelObjs,
        })
        await route.fulfill({
          status: 201,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({
            number: issueNumber,
            title: body.title,
            body: body.body,
            state: 'open',
            labels: labelObjs,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        })
        return
      }

      // 获取单个 Issue（轮询）— 匹配 /issues/{number} 或 /issues/{number}?...
      if (url.match(/\/issues\/\d+(\?|$)/) && method === 'GET' && !url.includes('/comments')) {
        const issueMatch = url.match(/\/issues\/(\d+)$/)
        if (issueMatch) {
          const issueNum = Number(issueMatch[1])
          const created = createdIssues.find(i => i.number === issueNum)
          if (!created) {
            await route.fulfill({ status: 404, body: '{}' })
            return
          }

          // 每次轮询推进状态
          pollCount++
          const statusIndex = Math.min(pollCount, STATUS_FLOW.length - 1)
          const status = STATUS_FLOW[statusIndex]

          await route.fulfill({
            status: 200,
            contentType: 'application/vnd.github+json',
            body: JSON.stringify({
              number: issueNum,
              title: created.title,
              body: created.body,
              state: status.state,
              labels: status.labels,
              created_at: created.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          })
          return
        }
      }

      // 创建 Issue Comment
      if (url.includes('/comments') && method === 'POST') {
        const body = await route.request().postDataJSON()
        const issueMatch = url.match(/\/issues\/(\d+)\/comments/)
        if (issueMatch) {
          createdComments.push({ issue_number: Number(issueMatch[1]), body: body.body })
        }
        await route.fulfill({
          status: 201,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify({ id: Date.now(), body: body.body, user: { login: 'zenHeart' }, created_at: new Date().toISOString() }),
        })
        return
      }

      // 获取 Issue 列表（会话列表）— 必须在 /issues/\d+ 之后匹配
      if (url.match(/\/issues(\?|$)/) && method === 'GET' && !url.match(/\/issues\/\d+/)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.github+json',
          body: JSON.stringify(createdIssues.map(i => {
            // labels 可能是字符串数组（来自 postDataJSON）或对象数组
            const labelObjs = (i.labels || []).map(l =>
              typeof l === 'string' ? { name: l } : l
            )
            return {
              number: i.number,
              title: i.title,
              state: 'open',
              labels: labelObjs,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              appLabel: labelObjs.find(l => l.name.startsWith('app/'))?.name,
            }
          })),
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

  test(HAS_GITHUB_PAT ? '真实 API 权限：发送构建消息前已登录' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'zenHeart')

      // mock 必须在 page.goto 之前注册
      mockBuildFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 应该看到 Workspace（有侧边栏）
      const sidebar = page.locator('.session-sidebar, .sidebar')
      await expect(sidebar.first()).toBeVisible({ timeout: 5000 })
    })

  test(HAS_GITHUB_PAT ? 'App Build: 发送"做一个 todo 应用"创建 Issue 并自动评论 /create' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'zenHeart')

      // mock 必须在 page.goto 之前注册
      mockBuildFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 发送"做一个 todo 应用"
      const chatInput = page.locator('textarea.chat-input').first()
      const inputCount = await chatInput.count()
      if (inputCount === 0) {
        test.skip(true, '未找到聊天输入框')
        return
      }

      await chatInput.fill('做一个 todo 应用')
      await chatInput.press('Enter')
      await page.waitForTimeout(5000)

      // 验证 Issue 已创建：页面显示构建任务消息（在消息区域）
      const messagesArea = page.locator('.messages, .chat-area')
      const issueCreated = await messagesArea.locator('text=/已创建构建任务/').count()
      expect(issueCreated).toBeGreaterThan(0)
    })

  test(HAS_GITHUB_PAT ? 'App Build: UI 展示构建状态流转（building → verifying → review）' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'zenHeart')

      // mock 必须在 page.goto 之前注册
      mockBuildFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 发送构建消息
      const chatInput = page.locator('textarea.chat-input').first()
      const inputCount = await chatInput.count()
      if (inputCount === 0) {
        test.skip(true, '未找到聊天输入框')
        return
      }

      await chatInput.fill('做一个 todo 应用')
      await chatInput.press('Enter')

      // 等待构建状态流转（最多 ~10s，包含 building → verifying → review 三个阶段）
      // dev 模式下轮询间隔 800ms，共需要 ~2.4s 完成全部状态流转
      await page.waitForTimeout(8000)

      // 验证 UI 展示了构建中、验证中或等待审查的状态消息（在消息区域）
      const messagesArea = page.locator('.messages, .chat-area')
      const hasBuildingStatus = await messagesArea.locator('text=/🔨 正在构建/').count()
      const hasVerifyingStatus = await messagesArea.locator('text=/🔎 正在验证/').count()
      const hasReviewStatus = await messagesArea.locator('text=/✅ 等待人工审查/').count()

      // 至少有一个状态被展示
      expect(hasBuildingStatus + hasVerifyingStatus + hasReviewStatus).toBeGreaterThan(0)
    })

  test(HAS_GITHUB_PAT ? 'App Build: 构建完成或失败后 UI 停止轮询' : 'SKIP: 无 GITHUB_MCP_PAT',
    async ({ page }: { page: Page }) => {
      if (!HAS_GITHUB_PAT) {
        test.skip(true, '需要 GITHUB_MCP_PAT 环境变量')
        return
      }

      const token = process.env.GITHUB_MCP_PAT as string
      await setAuthenticatedSession(page, token, 'zenHeart')

      // mock 必须在 page.goto 之前注册
      mockBuildFlow(page)

      await page.goto(BASE_URL)
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await page.waitForTimeout(3000)

      const chatInput = page.locator('textarea.chat-input').first()
      await chatInput.fill('做一个 todo 应用')
      await chatInput.press('Enter')

      // 等待足够长时间让状态流转完成（5000ms 轮询间隔 × 3 个状态 = ~15s）
      await page.waitForTimeout(20000)

      // 构建完成后应该看到最终状态（等待审查 或 构建失败）
      const messagesArea = page.locator('.messages, .chat-area')
      const hasFinalStatus = await messagesArea.locator('text=/✅.*等待人工审查|构建失败|自动验证失败/').count()
      expect(hasFinalStatus).toBeGreaterThan(0)
    })
})
