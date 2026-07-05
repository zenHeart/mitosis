/**
 * Golden Use Case Verification — 三个黄金用例真实验证
 * 通过 CDP 直接连接用户已打开的 Chrome 会话（port 9222）
 * 不启动新浏览器，保留用户登录态 + cookies + 扩展
 */
import { chromium, devices } from '@playwright/test'

const LIVE_URL = 'https://mitosis.zenheart.site'
const SCREENSHOT_DIR = '/Users/zenheart/code/github/mitosis/screenshots'
const STEP_TOKEN = process.env.STEP_TOKEN || ''

// 从 Chrome 的 DevToolsActivePort 文件读取 WebSocket 端点
import fs from 'fs'
import path from 'path'

const chromeProfileDir = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome')
const devToolsPortFile = path.join(chromeProfileDir, 'DevToolsActivePort')

let WS_ENDPOINT = ''

try {
  const content = fs.readFileSync(devToolsPortFile, 'utf8').trim()
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  const port = lines[0]
  const browserPath = lines[1]
  if (port && browserPath) {
    WS_ENDPOINT = `ws://127.0.0.1:${port}${browserPath}`
    console.log(`🔗 Chrome DevTools 端点: ${WS_ENDPOINT}`)
  }
} catch (e) {
  console.error('❌ 无法读取 DevToolsActivePort:', e.message)
  console.error('   请确认 Chrome 已开启远程调试：chrome://inspect/#remote-debugging')
  process.exit(1)
}

async function screenshot(page, name) {
  const filePath = `${SCREENSHOT_DIR}/${name}.png`
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`📸 ${filePath}`)
}

async function waitForAssistantMessage(page, timeout = 30000) {
  const last = page.locator('.message.assistant, .message.system').last()
  await last.waitFor({ state: 'visible', timeout })
  return last
}

async function sendMessage(page, text) {
  const input = page.locator('textarea.chat-input, textarea[aria-label="输入消息"]')
  await input.fill(text)
  await input.press('Enter')
}

async function main() {
  console.log('🚀 Golden Use Case Verification (CDP 模式)')
  console.log(`📍 ${LIVE_URL}`)
  console.log(`🔑 Token: ${STEP_TOKEN ? 'provided' : 'NOT provided'}`)
  console.log('')

  const browser = await chromium.connectOverCDP(WS_ENDPOINT)
  console.log('✅ 已连接到用户 Chrome 会话')

  const contexts = browser.contexts()
  const context = contexts[0]
  const pages = context.pages()

  let page = pages.find(p => p.url().startsWith('https://mitosis.zenheart.site'))
  if (!page) {
    page = await context.newPage()
  }

  const consoleLogs = []
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() })
  })

  const networkErrors = []
  page.on('response', (response) => {
    if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`)
  })

  try {
    // ── 前置：访问站点 ──
    console.log('📱 [PRE] Loading live site...')
    await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await screenshot(page, 'golden-0-initial')
    console.log('✅ Initial page loaded\n')

    // ── 用例 1：platform 迭代 ──
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔧 [UC1] Platform: 优化 Workspace 聊天输入框性能')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    await sendMessage(page, '优化 Workspace 的聊天输入框性能')
    await screenshot(page, 'golden-1-uc1-sent')
    try {
      await waitForAssistantMessage(page, 20000)
      await screenshot(page, 'golden-1-uc1-response')
      console.log('✅ UC1: 收到 AI 回复')
    } catch (e) {
      console.log(`⚠️ UC1: 超时 (${e.message})`)
      await screenshot(page, 'golden-1-uc1-timeout')
    }
    const rb1 = page.locator('.recovery-bar').count()
    console.log(`   恢复栏: ${rb1 > 0 ? '⚠️ 可见' : '✅ 不可见'}\n`)

    // ── 用例 2：创建新应用 ──
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🆕 [UC2] Build: 帮我做一个 todo 应用')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const newChat = page.locator('button:has-text("新建对话"), .new-chat-btn').first()
    if (await newChat.count() > 0) { await newChat.click(); await page.waitForTimeout(1000) }
    await sendMessage(page, '帮我做一个 todo 应用')
    await screenshot(page, 'golden-2-uc2-sent')
    try {
      await waitForAssistantMessage(page, 20000)
      await screenshot(page, 'golden-2-uc2-response')
      console.log('✅ UC2: 收到 AI 回复')
    } catch (e) {
      console.log(`⚠️ UC2: 超时 (${e.message})`)
      await screenshot(page, 'golden-2-uc2-timeout')
    }
    console.log('')

    // ── 用例 3：迭代已有应用 ──
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔄 [UC3] Iterate: 在 tetris-game 基础上加关卡')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (await newChat.count() > 0) { await newChat.click(); await page.waitForTimeout(1000) }
    await sendMessage(page, '在 tetris-game 的基础上加一个关卡系统')
    await screenshot(page, 'golden-3-uc3-sent')
    try {
      await waitForAssistantMessage(page, 20000)
      await screenshot(page, 'golden-3-uc3-response')
      console.log('✅ UC3: 收到 AI 回复')
    } catch (e) {
      console.log(`⚠️ UC3: 超时 (${e.message})`)
      await screenshot(page, 'golden-3-uc3-timeout')
    }
    console.log('')

    // ── UI 诊断 ──
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 UI 诊断 (Desktop)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const overflow = await page.evaluate(() => {
      const b = document.body
      return { sw: b.scrollWidth, cw: b.clientWidth, overflow: b.scrollWidth > b.clientWidth }
    })
    console.log(`  横向溢出: ${overflow.overflow ? '❌' : '✅'} (${overflow.sw}px / ${overflow.cw}px)`)

    const cErrors = consoleLogs.filter(l => /error|Error|404|500/i.test(l.text))
    console.log(`  控制台错误: ${cErrors.length > 0 ? '❌ ' + cErrors.slice(0,3).map(e=>e.text).join('; ') : '✅ None'}`)

    const elems = await page.evaluate(() => ({
      chatInput: !!document.querySelector('textarea.chat-input'),
      sendBtn: !!document.querySelector('.send-btn'),
      sidebar: !!document.querySelector('.sidebar'),
      msgs: document.querySelectorAll('.message').length,
      recBar: !!document.querySelector('.recovery-bar'),
    }))
    console.log(`  输入框: ${elems.chatInput ? '✅' : '❌'} | 发送按钮: ${elems.sendBtn ? '✅' : '❌'} | 侧边栏: ${elems.sidebar ? '✅' : '❌'}`)
    console.log(`  消息数: ${elems.msgs} | 恢复栏: ${elems.recBar ? '⚠️' : '✅'}`)

    // ── 移动端 ──
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📱 UI 诊断 (Mobile 390x844)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await screenshot(page, 'golden-mobile-initial')

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
      return { total: btns.length, small: small.length, samples: small.slice(0,3).map(e => e.textContent?.slice(0,15)) }
    })
    console.log(`  <44px 触控目标: ${touchTargets.small > 0 ? '❌ ' + touchTargets.small + '个' : '✅ None'} (总按钮: ${touchTargets.total})`)

    await screenshot(page, 'golden-mobile-final')
    console.log('')
    console.log('✅ Verification complete!')

  } catch (error) {
    console.error('❌ Failed:', error)
    await screenshot(page, 'golden-error')
  } finally {
    await browser.close()
    console.log('🔌 CDP 连接已关闭（Chrome 保持运行）')
  }
}

main()
