/**
 * MCP Chrome Verification — 使用 mcp-chrome-ensure.sh 管理的 Chrome (port 9223)
 * Mock: GitHub API + StepFun API，验证完整用户流程
 */
import { chromium } from '@playwright/test'

const WS_URL = 'ws://127.0.0.1:9223/devtools/browser/5b29ed49-fd1c-41ab-bd4c-2b531ee253d3'
const TARGET_URL = 'https://mitosis.zenheart.site'
const SCREENSHOT_DIR = '/Users/zenheart/code/github/mitosis/screenshots'
const STEP_API = 'https://api.stepfun.com/step_plan/v1/chat/completions'
const STEP_ORIGIN = new URL(STEP_API).origin

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
    number: 1, title: '[platform] 优化聊天输入框性能',
    body: '优化聊天输入框的性能和用户体验',
    state: 'open', user: MOCK_USER,
    labels: ['platform', 'status:verifying'],  // 字符串数组（与 ChatSession.labels 类型一致）
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    comments: 3,
  },
  {
    number: 2, title: '[build] tetris-game v1',
    body: '俄罗斯方块游戏',
    state: 'open', user: MOCK_USER,
    labels: ['app:tetris-game'],  // app 标签用于分组
    updated_at: new Date(Date.now() - 172800000).toISOString(),
    comments: 5,
    appLabel: 'tetris-game',  // 显式声明，确保 app 分组正确
  },
]

const MOCK_MESSAGES = [
  { id: 101, user: MOCK_USER, body: '做一个俄罗斯方块游戏', created_at: new Date(Date.now() - 172800000).toISOString() },
  { id: 102, user: { ...MOCK_USER, login: 'ai-agent' }, body: '好的，我来为你创建一个俄罗斯方块游戏...\n\n已完成！', created_at: new Date(Date.now() - 172700000).toISOString() },
]

// StepFun mock responses keyed by last user message content
const STEPFUN_RESPONSES = {
  '优化聊天输入框的性能': '好的，我来分析一下聊天输入框的性能优化方案...\n\n主要优化点：\n1. 输入防抖处理\n2. 消息渲染虚拟滚动\n3. 减少不必要的 re-render\n\n已完成优化！',
  '帮我做一个 todo 应用': '好的，我来为你创建一个 Todo 应用...\n\n应用结构：\n- 添加任务\n- 标记完成\n- 删除任务\n\n已完成！应用已创建在 /apps/todo-app/v1/',
  '在 tetris-game 的基础上加一个关卡系统': '好的，我来为 tetris-game 添加关卡系统...\n\n新增功能：\n- 关卡进度\n- 难度递增\n- 关卡选择界面\n\n已完成升级！',
}

async function main() {
  console.log('🚀 MCP Chrome Verification')
  console.log(`📍 ${TARGET_URL}`)
  console.log(`🔗 ${WS_URL}`)

  const browser = await chromium.connectOverCDP(WS_URL)
  console.log('✅ Connected to MCP Chrome (port 9223)')

  const context = browser.contexts()[0]
  const page = context.pages()[0]

  // ─── Mock GitHub API ──────────────────────────────────
  // unroute 防止重复注册（Chrome 会话跨脚本持久化）
  try { await page.unroute('**/api.github.com/**') } catch {}
  try { await page.unroute(`${STEP_ORIGIN}/**`) } catch {}

  await page.route('**/api.github.com/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()

    // GitHub REST API paths include /repos/{owner}/{repo} prefix
    const isIssuesList = path.match(/^\/repos\/[^/]+\/[^/]+\/issues$/)
    const isIssueDetail = path.match(/^\/repos\/[^/]+\/[^/]+\/issues\/\d+$/)
    const isComments = path.match(/^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/)

    // Log all GitHub API calls for debugging
    if (!isIssuesList && !isIssueDetail && !isComments && path !== '/user') {
      console.log(`  [GH API] ${method} ${path}`)
    }

    if (path === '/user' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
      return
    }
    if (isIssuesList && method === 'GET') {
      const resp = MOCK_SESSIONS.map(s => ({...s, user: MOCK_USER, state: 'open'}))
      console.log(`  [GH API] GET /issues → ${resp.length} sessions: ${resp.map(s => s.title).join(', ')}`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) })
      return
    }
    if (isIssueDetail && method === 'GET') {
      const n = parseInt(path.split('/').pop() || '1')
      const s = MOCK_SESSIONS.find(x => x.number === n) || MOCK_SESSIONS[0]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({...s, user: MOCK_USER, state: 'open'}) })
      return
    }
    if (isComments && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MESSAGES) })
      return
    }
    if (isComments && method === 'POST') {
      const body = route.request().postDataJSON()
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: Date.now(), body: body.body, user: MOCK_USER, created_at: new Date().toISOString() }) })
      return
    }
    if (isIssuesList && method === 'POST') {
      const body = route.request().postDataJSON()
      const issue = { number: Date.now() % 1000 + 100, title: body.title, body: body.body, labels: body.labels || [], state: 'open', user: MOCK_USER, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(issue) })
      return
    }
    if (path.includes('/contents/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { name: 'tetris-game', type: 'dir', path: 'apps/tetris-game' },
        { name: 'snake-game', type: 'dir', path: 'apps/snake-game' },
      ])})
      return
    }
    // Log unmocked requests for debugging
    console.log(`  [UNMOCKED] ${method} ${path}`)
    await route.fulfill({ status: 404, body: JSON.stringify({ message: 'Not mocked: ' + path }) })
  })

  // Mock /api/github/user is covered by the main handler above (Vite proxy → api.github.com/user)

  // ─── Mock StepFun API ─────────────────────────────────
  await page.route(`${STEP_ORIGIN}/**`, async (route) => {
    if (route.request().url() !== STEP_API) {
      await route.abort('blockedbyclient')
      throw new Error('Blocked a non-Step-Plan StepFun request in mock verification')
    }
    const body = route.request().postDataJSON()
    const userMsgs = (body?.messages || []).filter((m) => m.role === 'user')
    const userMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : ''
    const response = STEPFUN_RESPONSES[userMsg] || '收到！我来帮你处理这个问题。'
    console.log(`  [StepFun] "${userMsg.slice(0, 30)}" → "${response.slice(0, 30)}..."`)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { role: 'assistant', content: response } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    })
  })

  // ─── Inject auth state ────────────────────────────────
  await page.addInitScript(() => {
    // 先清除旧数据，避免之前的测试残留
    localStorage.clear()
    sessionStorage.clear()
    sessionStorage.setItem('mitosis_token', 'mock_token_for_testing')
    sessionStorage.setItem('mitosis_user', JSON.stringify({
      login: 'zenheart', id: 123456,
      avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
      html_url: 'https://github.com/zenheart', name: 'Zen Heart',
    }))
    localStorage.setItem('mitosis_setup_complete', 'true')
    // sessions_cache 使用 ChatSession 格式（与 _readCache 期望一致）
    localStorage.setItem('mitosis_sessions_cache', JSON.stringify([
      { issueNumber: 1, title: '[platform] 优化聊天输入框性能', labels: ['platform', 'status:verifying'], updatedAt: new Date(Date.now() - 86400000).toISOString(), messageCount: 3, appLabel: null, status: 'open', scenario: 'platform' },
      { issueNumber: 2, title: '[build] tetris-game v1', labels: ['app:tetris-game'], updatedAt: new Date(Date.now() - 172800000).toISOString(), messageCount: 5, appLabel: 'tetris-game', status: 'open', scenario: 'app_create' },
    ]))
  })

  // ─── Navigate ─────────────────────────────────────────
  console.log('\n📱 Loading site...')
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await screenshot(page, 'mcp-0-authed')

  // Watch session list and keydown events
  var debugResult = await page.evaluate(() => {
    var results = []
    try {
      // Check if Vue is accessible
      var appEl = document.querySelector('#app')
      results.push('appEl:', !!appEl)

      // Try Playwright-specific Vue access
      if (appEl) {
        // In Vue 3, component instances are stored in __vueParentComponent
        var walker = document.createTreeWalker(appEl, NodeFilter.SHOW_ELEMENT)
        var node
        var chatInputs = []
        while (node = walker.nextNode()) {
          if (node.tagName === 'TEXTAREA' && node.classList.contains('chat-input')) {
            chatInputs.push({
              tag: node.tagName,
              cls: node.className,
              val: node.value,
              disabled: node.disabled,
              vueComponent: !!node.__vueParentComponent,
              vueComponentCtx: node.__vueParentComponent ? !!node.__vueParentComponent.ctx : false,
            })
          }
        }
        results.push('chatInputs:', JSON.stringify(chatInputs))

        // Check send button
        var sendBtn = document.querySelector('.send-btn')
        if (sendBtn) {
          results.push('sendBtn disabled:', sendBtn.disabled)
          results.push('sendBtn classes:', sendBtn.className)
        }

        // Check Vue parent component on textarea
        var textarea = document.querySelector('textarea.chat-input')
        if (textarea && textarea.__vueParentComponent) {
          var ctx = textarea.__vueParentComponent.ctx
          results.push('ctx has handleSend:', !!ctx.handleSend)
          results.push('ctx isOwner:', typeof ctx.isOwner)
          results.push('ctx inputText:', !!ctx.inputText)
          results.push('ctx thinking:', !!ctx.thinking)
          results.push('ctx building:', !!ctx.building)
          results.push('ctx localInput:', ctx.localInput ? ctx.localInput.value?.slice(0, 20) : 'n/a')
        }

        // Check if we can find Workspace component via child traversal
        var workspaceEl = document.querySelector('[class*="workspace"]')
        results.push('workspaceEl:', !!workspaceEl)
      }
    } catch (e) {
      results.push('error:', e.message)
    }
    return results.join(' | ')
  })

  const viewCheck = await page.evaluate(() => ({
    hasWorkspace: !!document.querySelector('[class*="workspace"]'),
    hasChatInput: !!document.querySelector('textarea.chat-input'),
    hasSendBtn: !!document.querySelector('.send-btn'),
    hasSidebar: !!document.querySelector('.sidebar'),
    bodyText: document.body.innerText.slice(0, 150),
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

  // Collect console logs
  const consoleLogs = []
  const cErrors = []
  page.on('console', msg => {
    const text = msg.text()
    if (/handleSend|TRIAGE|BUILD|createBuild|isOwner|activeSession|StepFun/.test(text)) {
      consoleLogs.push(text)
    }
    if (/error|Error|404|500/.test(text)) {
      cErrors.push(text)
    }
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  console.log(`  控制台错误: ${cErrors.length > 0 ? '❌ ' + cErrors.slice(0,3).join('; ') : '✅ None'}`)

  // ─── Mobile diagnostics ────────────────────────────────
  console.log('\n📱 Mobile (390x844)')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await screenshot(page, 'mcp-1-mobile')

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
  await screenshot(page, 'mcp-2-mobile-final')

  // ─── UC1: Platform iteration ───────────────────────────
  console.log('\n━━━ [UC1] 平台迭代: 优化聊天输入框性能')
  await page.setViewportSize({ width: 1280, height: 800 })

  // 诊断：检查当前状态
  const preState = await page.evaluate(() => {
    const sessionEls = document.querySelectorAll('.session-item')
    const welcome = document.querySelector('[class*="welcome"]')
    const input = document.querySelector('textarea.chat-input')
    return {
      sessionCount: sessionEls.length,
      hasWelcome: !!welcome,
      inputValue: input?.value || '',
      bodySnippet: document.body.innerText.slice(0, 100),
    }
  })

  // 选择第一个 session（没有 activeSession 时 handleSend 无法工作）
  const sessionItems = page.locator('.session-item').first()
  if (await sessionItems.count() > 0) {
    await sessionItems.click()
    await page.waitForTimeout(2000)
    console.log('  📂 已选择第一个会话')
  }

  // 诊断：选择 session 后的状态
  const postSessionState = await page.evaluate(() => {
    const msgs = document.querySelectorAll('.message.user, .message.assistant, .message.system')
    const input = document.querySelector('textarea.chat-input')
    return {
      msgCount: msgs.length,
      inputValue: input?.value || '',
      inputDisabled: input?.disabled,
    }
  })

  const chatInput = page.locator('textarea.chat-input')
  if (await chatInput.count() > 0) {
    await chatInput.fill('优化聊天输入框的性能')
    await page.waitForTimeout(300)
    await chatInput.press('Enter')
    console.log('  📤 消息已发送')

    // 监听控制台错误
    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // Poll for assistant message
    let uc1Pass = false
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000)
      const assistantCount = await page.locator('.message.assistant').count()
      const sysCount = await page.locator('.message.system').count()
      if (assistantCount > 0 || sysCount > 0) { uc1Pass = true; break }
      // Log progress every 4s
      if ((i + 1) % 2 === 0) {
        const inputVal = await chatInput.inputValue()
        console.log(`  [POLL ${(i+1)*2}s] asst=0 input="${inputVal.slice(0,20)}" errors=${consoleErrors.length}`)
      }
    }

    if (uc1Pass) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-4-uc1-response.png`, fullPage: false })
      const rb = await page.locator('.recovery-bar').count()
      console.log(`  ✅ UC1: AI 回复 | 恢复栏: ${rb > 0 ? '⚠️' : '✅'}`)
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-4-uc1-timeout.png`, fullPage: false })
      console.log(`  ⚠️ UC1: 超时 — 无 AI 回复`)
      if (consoleErrors.length > 0) console.log(`  错误: ${consoleErrors.slice(0,3).join('; ')}`)
    }
  } else {
    console.log('  ❌ UC1: 无聊天输入框')
  }

  // ─── UC2: Create app ───────────────────────────────────
  console.log('\n━━━ [UC2] 创建应用: 做一个 todo 应用')

  // 选择第二个 session（不同消息流）
  const allSessions = page.locator('.session-item')
  const session2 = allSessions.nth(1)
  if (await session2.count() > 0) {
    await session2.click()
    await page.waitForTimeout(2000)
    console.log('  📂 已选择第二个会话')
  } else if (await allSessions.count() > 0) {
    // fallback: reuse first session
    await allSessions.first().click()
    await page.waitForTimeout(2000)
  }

  // 诊断：session 选择后状态
  const uc2PreDiag = await page.evaluate(() => {
    const msgs = document.querySelectorAll('.message.assistant, .message.system, .message.user')
    const input = document.querySelector('textarea.chat-input')
    const activeSession = document.querySelector('.session-item.active, .session-item[class*="active"]')
    const allSess = document.querySelectorAll('.session-item')
    const titles = Array.from(allSess).map(el => el.textContent?.slice(0, 40).trim())
    return {
      sessionCount: allSess.length,
      sessionTitles: titles,
      activeSessionTitle: activeSession?.textContent?.slice(0, 40) || 'none',
      msgCount: msgs.length,
      msgRoles: Array.from(msgs).map(m => m.className),
      inputValue: input?.value || '',
      inputDisabled: input?.disabled,
      bodyText: document.body.innerText.slice(0, 200),
    }
  })

  if (await chatInput.count() > 0) {
    await chatInput.fill('帮我做一个 todo 应用')
    // fill() 不触发 Vue v-model 的 input 事件，需手动触发
    await page.evaluate(() => {
      var textarea = document.querySelector('textarea.chat-input')
      if (textarea && !textarea.dispatchEvent) return
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200) // 等待 debounce watcher 同步
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-5-uc2-sent.png`, fullPage: false })

    // 点击发送按钮（比 Enter 更可靠）
    const sendBtn = page.locator('.send-btn')
    if (await sendBtn.count() > 0 && !(await sendBtn.isDisabled())) {
      await sendBtn.click()
      console.log('  📤 消息已发送（按钮点击）')
    } else {
      await chatInput.press('Enter')
      console.log('  📤 消息已发送（Enter 键）')
    }

    // 等待并检查 API 调用
    await page.waitForTimeout(3000)

    let uc2Pass = false
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000)
      // build 路径生成 system 消息（非 assistant），两者皆可接受
      if (await page.locator('.message.assistant, .message.system').count() > 1) { uc2Pass = true; break }
      if ((i + 1) % 2 === 0) {
        const inputVal = await chatInput.inputValue()
        console.log(`  [POLL ${(i+1)*2}s] msgCount=${await page.locator('.message.assistant, .message.system').count()} input="${inputVal.slice(0,20)}"`)
      }
    }
    if (uc2Pass) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-6-uc2-response.png`, fullPage: false })
      console.log('  ✅ UC2: AI 回复')
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-6-uc2-timeout.png`, fullPage: false })
      console.log(`  ⚠️ UC2: 超时 — 无 AI 回复`)
    }
  } else {
    console.log('  ❌ UC2: 无聊天输入框')
  }

  // 重置 building 状态（UC2 完成后 mock start() 不会自动重置）
  await page.evaluate(() => {
    const textarea = document.querySelector('textarea.chat-input')
    const sendBtn = document.querySelector('.send-btn')
    if (textarea) { textarea.removeAttribute('disabled'); textarea.disabled = false }
    if (sendBtn) { sendBtn.removeAttribute('disabled'); sendBtn.disabled = false }
  })
  await page.waitForTimeout(300)
  console.log('  🔄 已重置 building 状态')

  // ─── UC3: Iterate app ──────────────────────────────────
  console.log('\n━━━ [UC3] 迭代应用: 在 tetris-game 基础上加关卡')

  // 选择第一个 session
  const sessionItems3 = page.locator('.session-item').first()
  if (await sessionItems3.count() > 0) {
    await sessionItems3.click()
    await page.waitForTimeout(2000)
    console.log('  📂 已选择第一个会话')
  }

  if (await chatInput.count() > 0) {
    await chatInput.fill('在 tetris-game 的基础上加一个关卡系统')
    // fill() 不触发 Vue v-model input 事件，需手动触发
    await page.evaluate(() => {
      var textarea = document.querySelector('textarea.chat-input')
      if (!textarea) return
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-7-uc3-sent.png`, fullPage: false })
    await chatInput.press('Enter')
    console.log('  📤 消息已发送')
    let uc3Pass = false
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000)
      // build/iterate 路径生成 system 消息（非 assistant），两者皆可接受
      if (await page.locator('.message.assistant, .message.system').count() > 1) { uc3Pass = true; break }
      if ((i + 1) % 2 === 0) {
        const inputVal = await chatInput.inputValue()
        console.log(`  [POLL ${(i+1)*2}s] msgCount=${await page.locator('.message.assistant, .message.system').count()} input="${inputVal.slice(0,20)}"`)
      }
    }
    if (uc3Pass) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-8-uc3-response.png`, fullPage: false })
      console.log('  ✅ UC3: AI 回复')
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/mcp-8-uc3-timeout.png`, fullPage: false })
      console.log(`  ⚠️ UC3: 超时 — 无 AI 回复`)
    }
  } else {
    console.log('  ❌ UC3: 无聊天输入框')
  }

  console.log('\n✅ Verification complete!')
  await browser.close()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
