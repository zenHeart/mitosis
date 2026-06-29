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
// 真实登录态模式：设置 REAL_TOKEN（+可选 REAL_LOGIN）后，使用真实 GitHub token、
// 不再 mock GitHub API。配合 BASE_URL=https://mitosis.zenheart.site 可对线上做真实验证。
// （本沙箱无外网，需在有网络的本机或 CI runner 上运行。）
const REAL = !!process.env.REAL_TOKEN
const REAL_STEPFUN = !!process.env.REAL_STEPFUN // 真实 StepFun（观测真实配额错误）
const results = []
const rec = (name, pass, detail = '') => results.push({ name, pass, detail })

const OWNER = { login: process.env.REAL_LOGIN || 'zenHeart', id: 12345, avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4', html_url: 'https://github.com/zenHeart', name: process.env.REAL_LOGIN || 'zenHeart' }

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
  if (REAL_STEPFUN) return // 真实模式：直连真实 StepFun（观测真实配额/故障）
  await page.route('https://api.stepfun.com/**', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details', type: 'insufficient_quota' } }) }))
}

async function run() {
  const browser = await chromium.launch()

  // ── G1: 匿名 Gallery 渲染 + 登录按钮可见 ──
  try {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await mockGitHub(page, { authed: false })
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)
    const loginBtn = page.locator('button:has-text("使用 GitHub 登录")')
    await page.screenshot({ path: '/tmp/shot-gallery.png', fullPage: true }).catch(() => {})
    rec('G1 匿名 Gallery + 登录按钮', await loginBtn.count() > 0)
    await ctx.close()
  } catch (e) { rec('G1 匿名 Gallery + 登录按钮', false, String(e).slice(0, 120)) }

  // ── G3: Owner Workspace 渲染（侧边栏 + 输入框）──
  try {
    const ctx = await browser.newContext(); await seedOwner(ctx)
    const page = await ctx.newPage(); await mockGitHub(page, { authed: true })
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)
    const ok = (await page.locator('.sidebar').count()) > 0 && (await page.locator('textarea.chat-input').count()) > 0
    await page.screenshot({ path: '/tmp/shot-workspace.png' }).catch(() => {})
    rec('G3 Owner Workspace 渲染', ok)
    await ctx.close()
  } catch (e) { rec('G3 Owner Workspace 渲染', false, String(e).slice(0, 120)) }

  // ── G4: 截图 bug —— 配额错误时不死胡同（无原始英文泄露 + 有恢复出口）──
  try {
    const ctx = await browser.newContext(); await seedOwner(ctx)
    const page = await ctx.newPage()
    await mockGitHub(page, { authed: true }); await mockStepFunQuota(page)
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1200)
    await page.locator('textarea.chat-input').fill('优化 mitosis 支持发送渲染图片')
    await page.locator('button.send-btn').click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: '/tmp/shot-quota-deadend.png' }).catch(() => {})
    const body = (await page.locator('.chat-area, .messages, body').first().textContent()) || ''
    const rawLeak = /exceeded your current quota/i.test(body)
    const hasRecovery =
      (await page.locator('button:has-text("重试"), button:has-text("更新"), button:has-text("建任务"), button:has-text("创建平台"), button:has-text("直接")').count()) > 0 ||
      /已创建平台|平台变更任务|平台构建任务|额度|配额已用尽|请更新.*token|稍后重试/i.test(body)
    rec('G4 配额错误不死胡同（截图 bug）', !rawLeak && hasRecovery,
      `rawLeak=${rawLeak} hasRecovery=${hasRecovery}`)
    await ctx.close()
  } catch (e) { rec('G4 配额错误不死胡同（截图 bug）', false, String(e).slice(0, 120)) }

  await browser.close()

  // ── 静态黄金指标（行为外的目标）──
  const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8') } catch { return '' } }
  const setupSrc = read('src/components/SetupPage.vue') + read('src/components/Workspace.vue')
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
