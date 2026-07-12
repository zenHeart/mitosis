#!/usr/bin/env node
/**
 * e2e-golden.mjs — Mitosis MVP 黄金指标跟踪器（真实 Chromium，驱动 localhost）
 *
 * 这是"目标门"：当前应为 RED（暴露主链路问题），随各 Stage 落地逐步转 GREEN。
 * 与 main-pipeline.sh（回归守卫，必须永远 GREEN）职责不同。
 *
 * 用法:
 *   1) npm run dev    （另一终端，或脚本会假设 BASE_URL 已就绪）
 *   2) node scripts/verify/e2e-golden.mjs
 *   环境变量: BASE_URL（默认 http://localhost:5173）
 *
 * 退出码: 全部 PASS=0，否则=1（loop 据此判断是否到达 MVP 完成）
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
const EXPECTED_SHA = process.env.EXPECTED_SHA || ''
// 真实登录态模式：设置 REAL_TOKEN（+可选 REAL_LOGIN）后，使用真实 GitHub token、
// 不再 mock GitHub API。配合 BASE_URL=https://mitosis.zenheart.site 可对线上做真实验证。
// （本沙箱无外网，需在有网络的本机或 CI runner 上运行。）
const REAL = !!process.env.REAL_TOKEN
const REAL_STEPFUN = process.env.REAL_STEPFUN === '1' // 仅显式 1 才允许真实 Step Plan
const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/step_plan/v1/chat/completions'
const STEP_PLAN_ORIGIN = new URL(STEP_PLAN_CHAT_COMPLETIONS_URL).origin
const results = []
const rec = (name, pass, detail = '') => results.push({ name, pass, detail })

const OWNER = { login: process.env.REAL_LOGIN || 'zenHeart', id: 12345, avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4', html_url: 'https://github.com/zenHeart', name: process.env.REAL_LOGIN || 'zenHeart' }

async function verifyPageRevision(page) {
  if (!EXPECTED_SHA) return
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) throw new Error('EXPECTED_SHA is invalid')
  const actual = await page.locator('meta[name="mitosis-source-sha"]').getAttribute('content')
  if (actual !== EXPECTED_SHA) {
    throw new Error(`Loaded page revision mismatch: expected ${EXPECTED_SHA}, received ${actual || 'missing'}`)
  }
}

async function seedOwner(ctx) {
  await ctx.addInitScript(([u, real, tok]) => {
    sessionStorage.setItem('mitosis_token', real ? tok : 'test_token_direct')
    sessionStorage.setItem('mitosis_user', JSON.stringify(u))
    localStorage.setItem('mitosis_setup_complete', 'true')
    if (!real) sessionStorage.setItem('mitosis_step_token', 'sk-dummy-quota-test')
  }, [OWNER, REAL, process.env.REAL_TOKEN || ''])
}
async function mockGitHub(page, { authed }) {
  if (REAL) return // 真实模式：直连真实 GitHub API，不拦截
  await page.route('**/api/github/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/user')) return route.fulfill({ status: authed ? 200 : 403, contentType: 'application/json', body: authed ? JSON.stringify(OWNER) : '{}' })
    if (url.includes('/issues?') || /\/issues($|\?)/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    if (url.includes('/repos/')) return route.fulfill({ status: 404, body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}
async function mockStepFunQuota(page) {
  const observed = { exactCalls: 0, unexpected: [] }
  await page.route(`${STEP_PLAN_ORIGIN}/**`, (route) => {
    if (route.request().url() !== STEP_PLAN_CHAT_COMPLETIONS_URL) {
      observed.unexpected.push(route.request().url())
      return route.abort('blockedbyclient')
    }
    observed.exactCalls += 1
    if (REAL_STEPFUN) return route.continue()
    return route.fulfill({ status: 402, contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'You exceeded your current Step Plan credit', type: 'insufficient_quota' } }) })
  })
  return observed
}

async function run() {
  const browser = await chromium.launch()

  // ── G1: 匿名 Gallery 渲染 + 登录按钮可见 ──
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await mockGitHub(page, { authed: false })
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await verifyPageRevision(page)
    await page.waitForTimeout(1500)
    const loginBtn = page.locator('button:has-text("使用 GitHub 登录")')
    await page.screenshot({ path: '/tmp/shot-gallery.png', fullPage: true }).catch(() => {})
    rec('G1 匿名 Gallery + 登录按钮', await loginBtn.count() > 0)
    await ctx.close()
  } catch (e) { rec('G1 匿名 Gallery + 登录按钮', false, String(e).slice(0, 120)) }

  // ── G3: Owner Workspace 渲染（侧边栏 + 输入框）──
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); await seedOwner(ctx)
    const page = await ctx.newPage(); await mockGitHub(page, { authed: true })
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await verifyPageRevision(page)
    await page.waitForTimeout(1500)
    const ok = (await page.locator('.sidebar').count()) > 0 && (await page.locator('textarea.chat-input').count()) > 0
    await page.screenshot({ path: '/tmp/shot-workspace.png' }).catch(() => {})
    rec('G3 Owner Workspace 渲染', ok)
    await ctx.close()
  } catch (e) { rec('G3 Owner Workspace 渲染', false, String(e).slice(0, 120)) }

  // ── G4: 截图 bug —— 配额错误时不死胡同（无原始英文泄露 + 有恢复出口）──
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); await seedOwner(ctx)
    const page = await ctx.newPage()
    await mockGitHub(page, { authed: true }); const stepPlan = await mockStepFunQuota(page)
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await verifyPageRevision(page)
    await page.waitForTimeout(1200)
    const input = page.locator('textarea.chat-input')
    const send = page.locator('button.send-btn')
    await input.fill('请问 Mitosis 如何帮助我澄清需求？')
    await page.waitForTimeout(300)
    if (!(await send.isEnabled())) throw new Error('G4 send button remained disabled after input')
    await send.click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: '/tmp/shot-quota-deadend.png' }).catch(() => {})
    const body = (await page.locator('.chat-area, .messages, body').first().textContent()) || ''
    const rawLeak = /exceeded your current quota/i.test(body)
    const hasRecovery =
      (await page.locator('button:has-text("重试"), button:has-text("更新"), button:has-text("建任务"), button:has-text("创建平台"), button:has-text("直接")').count()) > 0 ||
      /已创建平台|平台变更任务|平台构建任务|额度|配额已用尽|请更新.*token|稍后重试/i.test(body)
    const endpointSafe = stepPlan.unexpected.length === 0 && stepPlan.exactCalls === 1
    rec('G4 配额错误不死胡同（截图 bug）', !rawLeak && hasRecovery && endpointSafe,
      `rawLeak=${rawLeak} hasRecovery=${hasRecovery} stepPlanCalls=${stepPlan.exactCalls} unexpected=${stepPlan.unexpected.length}`)
    await ctx.close()
  } catch (e) { rec('G4 配额错误不死胡同（截图 bug）', false, String(e).slice(0, 120)) }

  // ── G5: 移动端 Workspace + 侧边栏开关 + 触控目标 ──
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); await seedOwner(ctx)
    const page = await ctx.newPage(); await mockGitHub(page, { authed: true })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await verifyPageRevision(page)
    await page.waitForTimeout(1500)
    // Workspace 侧边栏切换按钮可见（移动端）
    const toggleVisible = (await page.locator('.sidebar-toggle-mobile').count()) > 0
    // 触控目标 ≥44px：sidebar-toggle-mobile 的 computed dimensions
    const dims = await page.locator('.sidebar-toggle-mobile').evaluate(el => ({
      w: el.offsetWidth, h: el.offsetHeight, mw: parseInt(getComputedStyle(el).minWidth) || 0, mh: parseInt(getComputedStyle(el).minHeight) || 0
    })).catch(() => ({ w: 0, h: 0, mw: 0, mh: 0 }))
    const minDim = Math.min(dims.w, dims.h)
    await page.screenshot({ path: '/tmp/shot-mobile-workspace.png' }).catch(() => {})
    rec('G5 移动端 Workspace + 触控目标 ≥44px', toggleVisible && minDim >= 44, `toggle=${toggleVisible} dims=${JSON.stringify(dims)} min=${minDim}`)
    await ctx.close()
  } catch (e) { rec('G5 移动端 Workspace + 触控目标 ≥44px', false, String(e).slice(0, 120)) }

  await browser.close()

  // ── 静态黄金指标（行为外的目标）──
  const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8') } catch { return '' } }
  const gallerySrc = read('src/components/Gallery.vue')
  const setupSrc = read('src/components/SetupPage.vue') + read('src/components/Workspace.vue')
  rec('G7.1 应用名不截断（3行 clamp + word-break）',
    /-webkit-line-clamp:\s*3/.test(gallerySrc) && /word-break:\s*break-word/.test(gallerySrc))
  rec('G7.2 移动端侧边栏（≥44px 触控目标 + 安全区）',
    /width:\s*85vw/.test(gallerySrc) && /min-height:\s*44px/.test(gallerySrc))
  rec('G7.3 卡片可点击导航到 /apps/{name}/v{n}/',
    /openApp\(app\)/.test(gallerySrc) && /app\.url/.test(gallerySrc))
  rec('G5 StepFun token 不再明文存 localStorage（B3）',
    !/localStorage\.setItem\(\s*['"]mitosis_step_token/.test(setupSrc))
  const chatInput = read('src/components/ChatInput.vue')
  rec('G6 ChatInput 支持发送图片（B5）',
    /type=["']file["']|accept=["'][^"']*image|@paste|FileReader|image\//i.test(chatInput))

  // ── 汇总 ──
  let fail = 0
  console.log(`\nMVP 黄金指标（BASE_URL=${BASE_URL}）`)
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`)
    if (!r.pass) fail++
  }
  console.log(`\nGOLDEN: ${fail === 0 ? 'PASS' : `FAIL (${fail}/${results.length} 未达标)`}`)
  process.exit(fail === 0 ? 0 : 1)
}
run().catch((e) => { console.error('e2e-golden crashed:', e); process.exit(2) })
