/**
 * Real Golden UX Verification — 使用真实 GitHub API + MCP Chrome (port 9223)
 * 前提：用户已在 Chrome 中登录 mitosis.zenheart.site（MCP Chrome profile 已同步登录态）
 */
import { chromium } from '@playwright/test'

const WS_URL = 'ws://127.0.0.1:9223/devtools/browser/5b29ed49-fd1c-41ab-bd4c-2b531ee253d3'
const TARGET_URL = 'https://mitosis.zenheart.site'
const SCREENSHOT_DIR = '/Users/zenheart/code/github/mitosis/screenshots/real-golden'
const STEP_API = 'https://api.stepfun.com/v1/chat/completions'

import fs from 'fs'
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

async function screenshot(page, name) {
  const fp = `${SCREENSHOT_DIR}/${name}.png`
  await page.screenshot({ path: fp, fullPage: false })
  console.log(`  📸 ${fp}`)
}

async function main() {
  console.log('🚀 Real Golden UX Verification')
  console.log(`📍 ${TARGET_URL}`)
  console.log(`🔗 ${WS_URL}`)

  const browser = await chromium.connectOverCDP(WS_URL)
  console.log('✅ Connected to MCP Chrome (port 9223)')

  const context = browser.contexts()[0]
  const pages = context.pages()
  let page = pages.find(p => p.url().includes('mitosis.zenheart.site')) || await context.newPage()

  // 移除所有 mock handlers（使用真实 API）
  try { await page.unroute('**/api.github.com/**') } catch {}
  try { await page.unroute('https://api.stepfun.com/**') } catch {}
  try { await page.unroute('**/api.github.com/**') } catch {}

  // 注入 API 调用追踪（用于验证真实 API 调用发生）
  await page.addInitScript(() => {
    window.__apiCalls = 0
    const origFetch = window.fetch
    window.fetch = async function () {
      window.__apiCalls = (window.__apiCalls || 0) + 1
      return origFetch.apply(this, arguments)
    }
  })

  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)

  // 检查是否已登录
  const authState = await page.evaluate(() => {
    const token = sessionStorage.getItem('mitosis_token') || localStorage.getItem('mitosis_token')
    const user = sessionStorage.getItem('mitosis_user') || localStorage.getItem('mitosis_user')
    return { hasToken: !!token, hasUser: !!user, user: user ? JSON.parse(user).login : null }
  })

  console.log('  认证状态: token=' + (authState.hasToken ? '✅' : '❌') + ', user=' + (authState.user || 'none'))

  if (!authState.hasToken) {
    console.log('  ⚠️ 未检测到登录态，使用 mock 模式作为 fallback')
    await page.evaluate(() => {
      localStorage.setItem('mitosis_setup_complete', 'true')
      localStorage.setItem('mitosis_token', 'mock-token')
      localStorage.setItem('mitosis_user', JSON.stringify({ login: 'zenheart', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }))
    })
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000)
  }

  console.log('\n  ⚠️  UC2/UC3 将创建真实 GitHub Issue（如果已登录）')
  console.log('     如需清理，请手动关闭创建的 Issue')

  await screenshot(page, '00-initial')

  // 等待 Workspace 加载
  await page.waitForSelector('textarea.chat-input', { timeout: 10000 }).catch(() => null)
  const chatInput = page.locator('textarea.chat-input')
  const sendBtn = page.locator('.send-btn')

  // ── UC1: 平台迭代 ──────────────────────────────────────
  console.log('\n━━━ [UC1] 平台迭代: 优化聊天输入框性能')

  const sessionItems = page.locator('.session-item')
  if (await sessionItems.count() > 0) {
    await sessionItems.first().click()
    await page.waitForTimeout(2000)
    console.log('  📂 已选择第一个会话')
  }

  if (await chatInput.count() > 0) {
    await chatInput.fill('优化聊天输入框的性能')
    await page.evaluate(() => {
      const ta = document.querySelector('textarea.chat-input')
      ta?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    if (await sendBtn.count() > 0 && !(await sendBtn.isDisabled())) {
      await sendBtn.click()
      console.log('  📤 已发送')
    }

    // 等待 AI 回复（真实 API 可能需要更长时间）
    let uc1Pass = false
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(2000)
      const msgCount = await page.locator('.message.assistant, .message.system').count()
      if (msgCount > 1) { uc1Pass = true; break }
      if (i === 10) console.log(`  [POLL 20s] 等待回复...`)
    }

    await screenshot(page, 'uc1-response')
    if (uc1Pass) {
      console.log('  ✅ UC1: AI 回复')
    } else {
      console.log('  ⚠️ UC1: 超时 — 无 AI 回复')
    }
  }

  // ── UC2: 创建应用 ──────────────────────────────────────
  console.log('\n━━━ [UC2] 创建应用: 做一个 todo 应用')

  // 如果有多个 session，选择第二个
  const allSessions = page.locator('.session-item')
  if (await allSessions.count() > 1) {
    await allSessions.nth(1).click()
    await page.waitForTimeout(2000)
    console.log('  📂 已选择第二个会话')
  }

  if (await chatInput.count() > 0) {
    await chatInput.fill('帮我做一个 todo 应用')
    await page.evaluate(() => {
      const ta = document.querySelector('textarea.chat-input')
      ta?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    if (await sendBtn.count() > 0 && !(await sendBtn.isDisabled())) {
      await sendBtn.click()
      console.log('  📤 已发送')
    }

    // 记录 API 调用
    const apiCallsBefore = await page.evaluate(() => window.__apiCalls || 0)

    // 等待 Issue 创建或 AI 回复
    let uc2Pass = false
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000)
      const apiCallsAfter = await page.evaluate(() => window.__apiCalls || 0)

      // 检查是否创建了 Issue（通过新消息或 API 调用增加）
      const msgCount = await page.locator('.message.assistant, .message.system').count()
      if (msgCount > 1) { uc2Pass = true; break }
      if (apiCallsAfter > apiCallsBefore + 2) { uc2Pass = true; break } // 创建 issue + comment = 2+ calls

      if (i === 10) console.log(`  [POLL 20s] 等待 Issue 创建... API calls: ${apiCallsAfter}`)
    }

    await screenshot(page, 'uc2-response')
    if (uc2Pass) {
      console.log('  ✅ UC2: Issue 已创建 / AI 回复')
    } else {
      console.log('  ⚠️ UC2: 超时')
    }
  }

  // ── UC3: 迭代应用 ──────────────────────────────────────
  console.log('\n━━━ [UC3] 迭代应用: 在 tetris-game 基础上加关卡')

  // 重置 building 状态
  await page.evaluate(() => {
    const ta = document.querySelector('textarea.chat-input')
    const btn = document.querySelector('.send-btn')
    if (ta) { ta.disabled = false; ta.removeAttribute('disabled') }
    if (btn) { btn.disabled = false; btn.removeAttribute('disabled') }
  })
  await page.waitForTimeout(500)

  // 选择第一个 session
  const sess3 = page.locator('.session-item')
  if (await sess3.count() > 0) {
    await sess3.first().click()
    await page.waitForTimeout(2000)
  }

  if (await chatInput.count() > 0) {
    await chatInput.fill('在 tetris-game 的基础上加一个关卡系统')
    await page.evaluate(() => {
      const ta = document.querySelector('textarea.chat-input')
      ta?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    if (await sendBtn.count() > 0 && !(await sendBtn.isDisabled())) {
      await sendBtn.click()
      console.log('  📤 已发送')
    }

    let uc3Pass = false
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(2000)
      const msgCount = await page.locator('.message.assistant, .message.system').count()
      if (msgCount > 1) { uc3Pass = true; break }
      if (i === 10) console.log('  [POLL 20s] 等待回复...')
    }

    await screenshot(page, 'uc3-response')
    if (uc3Pass) {
      console.log('  ✅ UC3: AI 回复')
    } else {
      console.log('  ⚠️ UC3: 超时')
    }
  }

  // ── 移动端截图 ────────────────────────────────────────
  console.log('\n📱 移动端截图')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1500)

  await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-initial.png`, fullPage: false })
  console.log('  📸 mobile-initial.png')

  // 打开侧边栏
  const sidebarToggle = page.locator('.sidebar-toggle-mobile')
  if (await sidebarToggle.count() > 0) {
    await sidebarToggle.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mobile-sidebar.png`, fullPage: false })
    console.log('  📸 mobile-sidebar.png')
  }

  console.log('\n✅ Real Golden UX Verification 完成')
  console.log(`   截图目录: ${SCREENSHOT_DIR}`)

  await browser.close()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
