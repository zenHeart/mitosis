import { chromium } from 'playwright'

async function main() {
  console.log('🔗 连接到 Chrome (port 9223)...')
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
  const ctx = browser.contexts()[0]
  const pages = ctx.pages()
  
  // 打开本地 dev 服务器（避免线上缓存）
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  
  const outDir = '/Users/zenheart/code/github/mitosis/screenshots/real-ux'
  const { mkdirSync } = await import('fs')
  mkdirSync(outDir, { recursive: true })
  
  // 设置 mock 模式（绕过 GitHub OAuth）
  await page.evaluate(() => {
    localStorage.setItem('mitosis_mock_mode', 'true')
    localStorage.setItem('mitosis_setup_complete', 'true')
    localStorage.setItem('mitosis_token', 'mock-token')
    localStorage.setItem('mitosis_user', JSON.stringify({ login: 'zenheart', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }))
    // 预设 mock sessions
    localStorage.setItem('mitosis_mock_sessions', JSON.stringify([
      { issueNumber: 1, title: '[platform] 优化聊天输入框性能', body: '优化聊天输入框的性能和用户体验', status: 'open', user: { login: 'zenheart' }, labels: ['platform', 'status:verifying'], updated_at: new Date(Date.now() - 86400000).toISOString(), comments: 3, appLabel: null },
      { issueNumber: 2, title: '[build] tetris-game v1', body: '俄罗斯方块游戏', status: 'open', user: { login: 'zenheart' }, labels: ['app:tetris-game'], updated_at: new Date(Date.now() - 172800000).toISOString(), comments: 5, appLabel: 'tetris-game' },
    ]))
    localStorage.setItem('mitosis_mock_sessions_messages', JSON.stringify({
      1: [
        { id: 1, role: 'user', body: '优化聊天输入框的性能', user: { login: 'zenheart' }, created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: 2, role: 'assistant', body: '好的，我来分析一下聊天输入框的性能优化方案...\n\n主要优化点：\n1. 输入防抖处理\n2. 消息渲染虚拟滚动\n3. 减少不必要的 re-render\n\n已完成优化！', user: { login: 'mitosis' }, created_at: new Date(Date.now() - 86300000).toISOString() },
      ],
      2: [
        { id: 3, role: 'user', body: '做一个 tetris 游戏', user: { login: 'zenheart' }, created_at: new Date(Date.now() - 172800000).toISOString() },
        { id: 4, role: 'system', body: '已创建构建任务 #1001 — 帮我做一个-tetris-应用 v0\n正在启动构建流程...', user: { login: 'mitosis' }, created_at: new Date(Date.now() - 172700000).toISOString() },
      ]
    }))
  })
  
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  
  // 截图 0: 初始状态（含 mock sessions）
  await page.screenshot({ path: `${outDir}/00-initial.png`, fullPage: false })
  console.log('  📸 00-initial.png')
  
  // 等待 Workspace 加载
  await page.waitForSelector('textarea.chat-input', { timeout: 10000 })
  
  // ── UC1: 平台迭代 ──────────────────────────────────────
  console.log('\n━━━ [UC1] 平台迭代: 优化聊天输入框性能')
  const chatInput = page.locator('textarea.chat-input')
  
  // 选择第一个 session
  const sessionItems = page.locator('.session-item')
  if (await sessionItems.count() > 0) {
    await sessionItems.first().click()
    await page.waitForTimeout(2000)
  }
  
  // 填写并发送
  await chatInput.fill('优化聊天输入框的性能')
  await page.evaluate(() => {
    const ta = document.querySelector('textarea.chat-input')
    ta?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${outDir}/uc1-filled.png`, fullPage: false })
  
  // 点击发送
  const sendBtn = page.locator('.send-btn')
  if (await sendBtn.count() > 0) {
    await sendBtn.click()
    console.log('  📤 已发送')
  }
  
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${outDir}/uc1-response.png`, fullPage: false })
  console.log('  📸 uc1-response.png')
  
  // 检查回复
  const msgCount1 = await page.locator('.message.assistant, .message.system').count()
  console.log(`  消息数: ${msgCount1}`)
  
  // ── UC2: 创建应用 ──────────────────────────────────────
  console.log('\n━━━ [UC2] 创建应用: 做一个 todo 应用')
  
  // 选择第二个 session（tetris）
  const allSessions = page.locator('.session-item')
  if (await allSessions.count() > 1) {
    await allSessions.nth(1).click()
    await page.waitForTimeout(2000)
  }
  
  await chatInput.fill('帮我做一个 todo 应用')
  await page.evaluate(() => {
    const ta = document.querySelector('textarea.chat-input')
    ta?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${outDir}/uc2-filled.png`, fullPage: false })
  
  const sendBtn2 = page.locator('.send-btn')
  if (await sendBtn2.count() > 0) {
    await sendBtn2.click()
    console.log('  📤 已发送')
  }
  
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${outDir}/uc2-response.png`, fullPage: false })
  console.log('  📸 uc2-response.png')
  
  const msgCount2 = await page.locator('.message.assistant, .message.system').count()
  console.log(`  消息数: ${msgCount2}`)
  
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
  
  const allSess3 = page.locator('.session-item')
  if (await allSess3.count() > 0) {
    await allSess3.first().click()
    await page.waitForTimeout(2000)
  }
  
  await chatInput.fill('在 tetris-game 的基础上加一个关卡系统')
  await page.evaluate(() => {
    const ta = document.querySelector('textarea.chat-input')
    ta?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${outDir}/uc3-filled.png`, fullPage: false })
  
  const sendBtn3 = page.locator('.send-btn')
  if (await sendBtn3.count() > 0) {
    await sendBtn3.click()
    console.log('  📤 已发送')
  }
  
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${outDir}/uc3-response.png`, fullPage: false })
  console.log('  📸 uc3-response.png')
  
  const msgCount3 = await page.locator('.message.assistant, .message.system').count()
  console.log(`  消息数: ${msgCount3}`)
  
  // ── 移动端截图 ────────────────────────────────────────
  console.log('\n📱 移动端截图')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1500)
  
  await page.screenshot({ path: `${outDir}/mobile-uc1.png`, fullPage: false })
  console.log('  📸 mobile-uc1.png')
  
  // 滚动到输入框
  await page.locator('.input-area').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${outDir}/mobile-input.png`, fullPage: false })
  console.log('  📸 mobile-input.png')
  
  // 打开侧边栏
  const sidebarToggle = page.locator('.sidebar-toggle-mobile')
  if (await sidebarToggle.count() > 0) {
    await sidebarToggle.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${outDir}/mobile-sidebar.png`, fullPage: false })
    console.log('  📸 mobile-sidebar.png')
  }
  
  // ── 桌面端不同宽度 ────────────────────────────────────
  console.log('\n🖥️  桌面端不同宽度')
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${outDir}/desktop-1024.png`, fullPage: false })
  console.log('  📸 desktop-1024.png')
  
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${outDir}/desktop-768.png`, fullPage: false })
  console.log('  📸 desktop-768.png')
  
  // ── DOM 分析 ──────────────────────────────────────────
  const domInfo = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel)
    const qa = (sel) => Array.from(document.querySelectorAll(sel))
    const input = q('textarea.chat-input')
    const sidebar = q('.sidebar')
    const chatArea = q('.chat-area')
    const messages = q('.messages')
    
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      chatArea: chatArea ? chatArea.getBoundingClientRect() : null,
      messages: messages ? messages.getBoundingClientRect() : null,
      sidebar: sidebar ? { ...sidebar.getBoundingClientRect(), open: sidebar.classList.contains('open') } : null,
      input: input ? { ...input.getBoundingClientRect(), disabled: input.disabled } : null,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      sessionCount: qa('.session-item').length,
      msgCount: qa('.message').length,
    }
  })
  
  console.log('\n📊 最终 DOM 状态:')
  console.log(JSON.stringify(domInfo, null, 2))
  
  console.log('\n✅ 真实 UX 测试完成')
  console.log(`   截图目录: ${outDir}`)
  
  await browser.close()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
