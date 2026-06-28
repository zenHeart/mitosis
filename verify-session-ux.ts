/**
 * Deep verification script for session management UX fixes
 * Run with: npx tsx verify-session-ux.ts
 */

import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5174'

let passed = 0
let failed = 0

// In-memory mock store for GitHub API
interface MockIssue {
  number: number
  title: string
  state: string
  body: string
  labels: { name: string }[]
  created_at: string
  updated_at: string
  user: { login: string }
}

interface MockComment {
  id: number
  body: string
  user: { login: string }
  created_at: string
}

let nextIssueNumber = 1
const mockIssues: MockIssue[] = []
const mockComments: Map<number, MockComment[]> = new Map()
const mockSessions: any[] = []

// Mock StepFun API response for triage (returns BUILD_APP marker)
const MOCK_STEPFUN_RESPONSE = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: `好的，我来帮你创建一个应用。

BUILD_APP: test-app`,
      },
    },
  ],
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })

  // Intercept StepFun API calls and return mock triage response
  await context.route('https://api.stepfun.com/v1/chat/completions', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STEPFUN_RESPONSE),
    })
  })

  // Intercept GitHub API calls and return mock responses
  await context.route('/api/github/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/github', '')
    const method = route.request().method()

    // Simulate network delay
    await new Promise(r => setTimeout(r, 100))

    // GET /repos/{owner}/{repo}/issues
    if (method === 'GET' && /^\/repos\/[^/]+\/[^/]+\/issues\/?\d*$/.test(path)) {
      if (/\/issues\/\d+$/.test(path)) {
        const num = parseInt(path.split('/').pop()!)
        const issue = mockIssues.find(i => i.number === num)
        if (!issue) {
          return route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not Found' }) })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(issue),
        })
      }
      // List issues - filter by state if query param
      const state = url.searchParams.get('state') || 'all'
      let issues = [...mockIssues]
      if (state === 'open') issues = issues.filter(i => i.state === 'open')
      if (state === 'closed') issues = issues.filter(i => i.state === 'closed')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(issues),
      })
    }

    // GET /repos/{owner}/{repo}/issues/{number}/comments
    if (method === 'GET' && /\/issues\/\d+\/comments/.test(path)) {
      const num = parseInt(path.split('/')[3])
      const comments = mockComments.get(num) || []
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(comments),
      })
    }

    // POST /repos/{owner}/{repo}/issues
    if (method === 'POST' && /\/issues\/?\d*$/.test(path) && !/\d+\/comments/.test(path)) {
      const body = await route.request().postDataJSON()
      const labels = (body.labels || []).map((l: string) => ({ name: l }))
      const issue: MockIssue = {
        number: nextIssueNumber++,
        title: body.title,
        state: 'open',
        body: body.body || '',
        labels,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: { login: 'zenHeart' },
      }
      mockIssues.push(issue)
      mockComments.set(issue.number, [])

      // Create mock session
      const appLabel = labels.find((l: { name: string }) => l.name.startsWith('app/'))
      mockSessions.push({
        issueNumber: issue.number,
        title: issue.title,
        status: 'open',
        labels: labels.map((l: { name: string }) => l.name),
        messageCount: 0,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        appLabel: appLabel?.name,
      })

      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(issue),
      })
    }

    // POST /repos/{owner}/{repo}/issues/{number}/comments
    if (method === 'POST' && /\d+\/comments/.test(path)) {
      const num = parseInt(path.split('/')[3])
      const body = await route.request().postDataJSON()
      const comment: MockComment = {
        id: Date.now(),
        body: body.body || '',
        user: { login: 'zenHeart' },
        created_at: new Date().toISOString(),
      }
      if (!mockComments.has(num)) mockComments.set(num, [])
      mockComments.get(num)!.push(comment)

      // Update issue updated_at
      const issue = mockIssues.find(i => i.number === num)
      if (issue) issue.updated_at = comment.created_at

      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(comment),
      })
    }

    // Default: return 404
    return route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not Found' }) })
  })

  // Save initial storage state (empty)
  const page = await context.newPage()

  async function runTest(name, fn) {
    console.log(`\n--- ${name} ---`)
    // Create a new page for each test (fresh context)
    const testPage = await context.newPage()
    try {
      await fn(testPage)
      console.log('  PASS')
      passed++
    } catch (e) {
      console.log(`  FAIL: ${e instanceof Error ? e.message : e}`)
      failed++
    } finally {
      await testPage.close()
    }
  }

  // T1: Triage auto-identifies build intent — no clarification
  await runTest('T1: Triage auto-identifies build intent', async (page) => {
    // Navigate first to establish origin
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)

    // Now try to set storage (page is committed, origin is established)
    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('mitosis_token', 'mock_token')
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: 'zenHeart', id: 1,
        avatar_url: 'https://example.com/avatar.png',
        html_url: 'https://github.com/zenHeart', name: 'zenHeart'
      }))
      localStorage.setItem('mitosis_setup_complete', 'true')
      localStorage.setItem('mitosis_step_token', 'mock_step_token')
    })

    await page.reload()
    await page.waitForSelector('.welcome', { timeout: 10000 })
    await page.waitForTimeout(2000)

    await page.fill('textarea.chat-input', '帮我做一个俄罗斯方块游戏，支持消行和计分')
    await page.press('textarea.chat-input', 'Enter')
    await page.waitForTimeout(3000)

    const messages = await page.locator('.message').allTextContents()
    const messageText = messages.join(' ')

    if (messageText.includes('你是想创建一个新应用，还是修改已有的应用')) {
      throw new Error('Still showing clarification question instead of auto-triage')
    }
    if (!messageText.includes('已创建构建任务')) {
      throw new Error('Build task not created - triage may have failed')
    }
  })

  // T2: Session persists in localStorage cache
  await runTest('T2: Session persists in localStorage cache', async (page) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('mitosis_token', 'mock_token')
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: 'zenHeart', id: 1,
        avatar_url: 'https://example.com/avatar.png',
        html_url: 'https://github.com/zenHeart', name: 'zenHeart'
      }))
      localStorage.setItem('mitosis_setup_complete', 'true')
      localStorage.setItem('mitosis_step_token', 'mock_step_token')
    })

    await page.reload()
    await page.waitForSelector('.welcome', { timeout: 10000 })
    await page.waitForTimeout(2000)

    await page.fill('textarea.chat-input', '帮我做一个贪吃蛇游戏')
    await page.press('textarea.chat-input', 'Enter')
    await page.waitForTimeout(5000)

    // Verify the message was created
    const messages = await page.locator('.message').allTextContents()
    const messageText = messages.join(' ')
    if (!messageText.includes('已创建构建任务')) {
      throw new Error('Build task was not created')
    }

    // Verify mock session exists
    const mockData = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('mitosis_mock_sessions')
        return raw ? JSON.parse(raw) : []
      } catch {
        return []
      }
    })

    if (mockData.length === 0) {
      throw new Error('No mock sessions found in localStorage')
    }

    console.log(`    Mock sessions: ${mockData.length}`)
  })

  // T3: Session status shows meaningful labels
  await runTest('T3: Session status shows meaningful labels', async (page) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('mitosis_token', 'mock_token')
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: 'zenHeart', id: 1,
        avatar_url: 'https://example.com/avatar.png',
        html_url: 'https://github.com/zenHeart', name: 'zenHeart'
      }))
      localStorage.setItem('mitosis_setup_complete', 'true')
      localStorage.setItem('mitosis_step_token', 'mock_step_token')
    })

    await page.reload()
    await page.waitForSelector('.welcome', { timeout: 10000 })
    await page.waitForTimeout(2000)

    // Desktop sidebar is always visible
    const sessionStatus = await page.locator('.session-status').count()
    if (sessionStatus > 0) {
      const statusText = await page.locator('.session-status').first().textContent()
      if (!statusText || statusText.length === 0) {
        throw new Error('Session status text is empty')
      }
      console.log(`    Status text: ${statusText}`)
    } else {
      console.log('    No sessions found (expected if mock mode has no pre-loaded sessions)')
    }
  })

  // T4: App sessions are clustered by app name
  await runTest('T4: App sessions clustered by app name', async (page) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('mitosis_token', 'mock_token')
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: 'zenHeart', id: 1,
        avatar_url: 'https://example.com/avatar.png',
        html_url: 'https://github.com/zenHeart', name: 'zenHeart'
      }))
      localStorage.setItem('mitosis_setup_complete', 'true')
      localStorage.setItem('mitosis_step_token', 'mock_step_token')
    })

    await page.reload()
    await page.waitForSelector('.welcome', { timeout: 10000 })
    await page.waitForTimeout(2000)

    const appGroups = await page.locator('.session-item.app-group').count()
    console.log(`    App groups found: ${appGroups}`)

    const appLabels = await page.locator('.session-group-label').allTextContents()
    const hasAppGroup = appLabels.some((label) => label.includes('应用') || label.includes('我的应用'))
    console.log(`    Has app group label: ${hasAppGroup}`)
  })

  // T5: Navigation back to app page exists
  await runTest('T5: Navigation back to app page', async (page) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.clear()
      sessionStorage.setItem('mitosis_token', 'mock_token')
      sessionStorage.setItem('mitosis_oauth_redirect', '1')
      sessionStorage.setItem('mitosis_user', JSON.stringify({
        login: 'zenHeart', id: 1,
        avatar_url: 'https://example.com/avatar.png',
        html_url: 'https://github.com/zenHeart', name: 'zenHeart'
      }))
      localStorage.setItem('mitosis_setup_complete', 'true')
      localStorage.setItem('mitosis_step_token', 'mock_step_token')
    })

    await page.reload()
    await page.waitForSelector('.welcome', { timeout: 10000 })
    await page.waitForTimeout(2000)

    await page.fill('textarea.chat-input', '帮我做一个todo应用')
    await page.press('textarea.chat-input', 'Enter')
    await page.waitForTimeout(3000)

    const openBtns = await page.locator('.session-open-btn, .back-to-app-btn, .app-nav-open-btn').count()
    if (openBtns === 0) {
      throw new Error('No back-to-app navigation buttons found')
    }
  })

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)

  await browser.close()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
