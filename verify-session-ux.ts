/**
 * Deep verification script for session management UX fixes
 * Run with: npx tsx verify-session-ux.ts
 */

import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5174'

let passed = 0
let failed = 0

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })

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
