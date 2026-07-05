/**
 * Owner UC Verification — Mock authenticated owner in isolated Chrome
 */
import { chromium } from '@playwright/test'

const WS_URL = 'ws://127.0.0.1:9223/devtools/browser/4ecd8d3f-44c3-4abb-9944-c26dd63130af'
const TARGET_URL = 'https://mitosis.zenheart.site'
const SCREENSHOT_DIR = '/Users/zenheart/code/github/mitosis/screenshots'

import fs from 'fs'
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

async function screenshot(page, name) {
  const fp = `${SCREENSHOT_DIR}/${name}.png`
  await page.screenshot({ path: fp, fullPage: false })
  console.log(`  📸 ${fp}`)
}

const MOCK_USER = {
  login: 'zenheart', id: 123456,
  avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
  html_url: 'https://github.com/zenheart',
  name: 'Zen Heart',
}

const MOCK_SESSIONS = [
  {
    issueNumber: 1, title: '[platform] 优化 Workspace 聊天体验',
    body: '优化聊天输入框的性能和用户体验',
    labels: [{ name: 'platform' }, { name: 'status:verifying' }],
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    messageCount: 3, appLabel: null,
  },
  {
    issueNumber: 2, title: '[build] tetris-game v1',
    body: '俄罗斯方块游戏',
    labels: [{ name: 'app:tetris-game' }],
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    messageCount: 5, appLabel: 'tetris-game',
  },
]

const MOCK_MESSAGES = [
  { id: 'msg-1', role: 'user', content: '做一个俄罗斯方块游戏', createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: 'msg-2', role: 'assistant', content: '好的，我来为你创建一个俄罗斯方块游戏...\n\n已完成！', createdAt: new Date(Date.now() - 172700000).toISOString() },
  { id: 'msg-3', role: 'user', content: '优化游戏体验', createdAt: new Date(Date.now() - 86400000).toISOString() },
]

let createdIssues = []

async function main() {
  console.log('🚀 Owner UC Verification (Mock Auth)')
  console.log(`📍 ${TARGET_URL}`)
  
  const browser = await chromium.connectOverCDP(WS_URL)
  console.log('✅ Connected to isolated Chrome')
  
  const context = browser.contexts()[0]
  const pages = context.pages()
  let page = pages.find(p => p.url().includes('mitosis'))
  if (!page) page = await context.newPage()
  
  // ─── Mock GitHub API ──────────────────────────────────
  await page.route('**/api.github.com/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    console.log(`  [API] ${method} ${path}`)
    
    // Mock user info
    if (path === '/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
      return
    }
    
    // Mock create issue (POST /issues)
    if (path === '/issues' && method === 'POST') {
      const body = route.request().postDataJSON()
      const newIssue = {
        number: createdIssues.length + 10,
        title: body.title || 'New App',
        body: body.body || '',
        labels: (body.labels || []).map((l) => ({ name: l })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        state: 'open',
        user: MOCK_USER,
      }
      createdIssues.push(newIssue)
      console.log(`    → Created issue #${newIssue.number}: ${newIssue.title}`)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newIssue) })
      return
    }
    
    // Mock list issues (GET /issues)
    if (path === '/issues' && method === 'GET') {
      const allIssues = [...MOCK_SESSIONS.map(s => ({...s, user: MOCK_USER, state: 'open'})), ...createdIssues]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allIssues) })
      return
    }
    
    // Mock get issue (GET /issues/{number})
    if (path.match(/^\/issues\/\d+$/) && method === 'GET') {
      const issueNum = parseInt(path.split('/')[2])
      const allIssues = [...MOCK_SESSIONS.map(s => ({...s, user: MOCK_USER, state: 'open'})), ...createdIssues]
      const issue = allIssues.find(i => i.issueNumber === issueNum || i.number === issueNum) || allIssues[0]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issue) })
      return
    }
    
    // Mock list comments (GET /issues/{number}/comments)
    if (path.match(/^\/issues\/\d+\/comments$/) && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MESSAGES) })
      return
    }
    
    // Mock create comment (POST /issues/{number}/comments)
    if (path.match(/^\/issues\/\d+\/comments$/) && method === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ id: Date.now(), body: body.body, user: MOCK_USER, created_at: new Date().toISOString() }),
      })
      return
    }
    
    // Mock get repo contents
    if (path.includes('/contents/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'tetris-game', type: 'dir', path: 'apps/tetris-game' },
          { name: 'snake-game', type: 'dir', path: 'apps/snake-game' },
        ]),
      })
      return
    }
    
    // Default
    await route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not mocked: ' + path }) })
  })
  
  // ─── Auth state BEFORE page loads ──────────────────────
  await page.addInitScript(() => {
    sessionStorage.setItem('mitosis_token', 'mock_token_for_testing')
    sessionStorage.setItem('mitosis_user', JSON.stringify({
      login: 'zenheart', id: 123456,
      avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
      html_url: 'https://github.com/zenheart', name: 'Zen Heart',
    }))
    localStorage.setItem('mitosis_setup_complete', 'true')
    localStorage.setItem('mitosis_sessions_cache', JSON.stringify([
      { issueNumber: 1, title: '[platform] 优化', labels: ['platform', 'status:verifying'], updatedAt: new Date(Date.now() - 86400000).toISOString(), messageCount: 3, appLabel: null },
      { issueNumber: 2, title: '[build] tetris-game v1', labels: ['app:tetris-game'], updatedAt: new Date(Date.now() - 172800000).toISOString(), messageCount: 5, appLabel: 'tetris-game' },
    ]))
  })
  
  // ─── Navigate ─────────────────────────────────────────
  console.log('\n📱 Loading as authenticated owner...')
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await screenshot(page, 'owner-0-authed')
  
  const viewCheck = await page.evaluate(() => ({
    hasWorkspace: !!document.querySelector('[class*="workspace"]'),
    hasChatInput: !!document.querySelector('textarea.chat-input'),
    hasSendBtn: !!document.querySelector('.send-btn'),
    hasSidebar: !!document.querySelector('.sidebar'),
    bodyText: document.body.innerText.slice(0, 200),
  }))
  console.log(`  Workspace: ${viewCheck.hasWorkspace ? '✅' : '❌'} | Chat: ${viewCheck.hasChatInput ? '✅' : '❌'} | Sidebar: ${viewCheck.hasSidebar ? '✅' : '❌'}`)
  console.log(`  Text: ${viewCheck.bodyText.slice(0, 80)}`)
  
  // ─── Desktop diagnostics ──────────────────────────────
  console.log('\n📊 Desktop Diagnostics')
  const overflow = await page.evaluate(() => {
    const b = document.body
    return { sw: b.scrollWidth, cw: b.clientWidth, overflow: b.scrollWidth > b.clientWidth }
  })
  console.log(`  横向溢出: ${overflow.overflow ? '❌' : '✅'} (${overflow.sw}px / ${overflow.cw}px)`)
  
  const cErrors = []
  page.on('console', msg => { if (/error|Error|404|500/.test(msg.text())) cErrors.push(msg.text()) })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log(`  控制台错误: ${cErrors.length > 0 ? '❌ ' + cErrors.slice(0,3).join('; ') : '✅ None'}`)
  
  // ─── Mobile diagnostics ────────────────────────────────
  console.log('\n📱 Mobile (390x844)')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await screenshot(page, 'owner-1-mobile')
  
  const mOverflow = await page.evaluate(() => {
    const b = document.body
    return { sw: b.scrollWidth, cw: b.clientWidth, overflow: b.scrollWidth > b.clientWidth }
  })
  console.log(`  横向溢出: ${mOverflow.overflow ? '❌' : '✅'} (${mOverflow.sw}px / ${mOverflow.cw}px)`)
  
  const touchTargets = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    const small = btns.filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)
    })
    return { total: btns.length, small: small.length, samples: small.slice(0,5).map(e => `${e.textContent?.slice(0,15)} (${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}px)`) }
  })
  console.log(`  <44px 触控目标: ${touchTargets.small > 0 ? '❌ ' + touchTargets.small + '个' : '✅ None'}`)
  if (touchTargets.small > 0) touchTargets.samples.forEach(s => console.log(`    - ${s}`))
  await screenshot(page, 'owner-2-mobile-final')
  
  // ─── UC1: Platform iteration ───────────────────────────
  console.log('\n━━━ [UC1] 平台迭代: 优化聊天输入框性能')
  await page.setViewportSize({ width: 1280, height: 800 })
  const chatInput = page.locator('textarea.chat-input')
  if (await chatInput.count() > 0) {
    await chatInput.fill('优化聊天输入框的性能')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-3-uc1-sent.png`, fullPage: false })
    console.log('  📸 owner-3-uc1-sent.png')
    await chatInput.press('Enter')
    try {
      await page.locator('.message.assistant, .message.system').last().waitFor({ state: 'visible', timeout: 20000 })
      await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-4-uc1-response.png`, fullPage: false })
      console.log('  📸 owner-4-uc1-response.png')
      const rb = await page.locator('.recovery-bar').count()
      console.log(`  ✅ UC1: AI 回复 | 恢复栏: ${rb > 0 ? '⚠️' : '✅'}`)
    } catch (e) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-4-uc1-timeout.png`, fullPage: false })
      console.log(`  ⚠️ UC1: 超时 — ${e.message}`)
    }
  } else {
    console.log('  ❌ UC1: 无聊天输入框')
    await screenshot(page, 'owner-4-uc1-noinput')
  }
  
  // ─── UC2: Create app ───────────────────────────────────
  console.log('\n━━━ [UC2] 创建应用: 做一个 todo 应用')
  const newChatBtn = page.locator('button:has-text("新建"), .new-chat-btn, [aria-label*="新建"]').first()
  if (await newChatBtn.count() > 0) { await newChatBtn.click(); await page.waitForTimeout(500) }
  
  if (await chatInput.count() > 0) {
    await chatInput.fill('帮我做一个 todo 应用')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-5-uc2-sent.png`, fullPage: false })
    console.log('  📸 owner-5-uc2-sent.png')
    await chatInput.press('Enter')
    try {
      await page.locator('.message.assistant, .message.system').last().waitFor({ state: 'visible', timeout: 20000 })
      await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-6-uc2-response.png`, fullPage: false })
      console.log('  📸 owner-6-uc2-response.png')
      console.log('  ✅ UC2: AI 回复')
    } catch (e) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-6-uc2-timeout.png`, fullPage: false })
      console.log(`  ⚠️ UC2: 超时 — ${e.message}`)
    }
  } else {
    console.log('  ❌ UC2: 无聊天输入框')
  }
  
  // ─── UC3: Iterate app ──────────────────────────────────
  console.log('\n━━━ [UC3] 迭代应用: 在 tetris-game 基础上加关卡')
  if (await newChatBtn.count() > 0) { await newChatBtn.click(); await page.waitForTimeout(500) }
  
  if (await chatInput.count() > 0) {
    await chatInput.fill('在 tetris-game 的基础上加一个关卡系统')
    await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-7-uc3-sent.png`, fullPage: false })
    console.log('  📸 owner-7-uc3-sent.png')
    await chatInput.press('Enter')
    try {
      await page.locator('.message.assistant, .message.system').last().waitFor({ state: 'visible', timeout: 20000 })
      await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-8-uc3-response.png`, fullPage: false })
      console.log('  📸 owner-8-uc3-response.png')
      console.log('  ✅ UC3: AI 回复')
    } catch (e) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/owner-8-uc3-timeout.png`, fullPage: false })
      console.log(`  ⚠️ UC3: 超时 — ${e.message}`)
    }
  } else {
    console.log('  ❌ UC3: 无聊天输入框')
  }
  
  console.log('\n✅ Verification complete!')
  await browser.close()
  console.log('🔌 Disconnected (Chrome remains open)')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
