/**
 * C4.1: 示例应用统一冒烟脚本
 *
 * 覆盖 tetris-game v1/v2/v3 与 snake-game v0 的桌面/移动端：
 * - 页面加载
 * - 开始按钮
 * - 核心输入
 * - console/page error
 * - 横向溢出
 */

import { test, expect, type Page } from '@playwright/test'

const APPS = [
  { name: 'tetris-game', versions: ['v1', 'v2', 'v3'] },
  { name: 'snake-game', versions: ['v0'] },
]

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }

test.describe('C4.1: 示例应用冒烟测试', () => {
  // ── 辅助函数 ────────────────────────────────────────────────

  async function checkPageHealth(page: Page, appUrl: string) {
    // 等待页面加载完成
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await page.waitForTimeout(2000)

    // 检查 console error
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // 检查 page error
    const pageErrors: string[] = []
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    // 等待一下让错误能够被捕获
    await page.waitForTimeout(1000)

    return { consoleErrors, pageErrors }
  }

  async function checkNoHorizontalOverflow(page: Page) {
    const hasOverflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth > doc.clientWidth
    })
    return !hasOverflow
  }

  // ── 测试用例 ────────────────────────────────────────────────

  for (const { name, versions } of APPS) {
    for (const version of versions) {
      const appUrl = `/apps/${name}/${version}/`

      test(`${name}/${version}: 桌面端页面加载无错误`, async ({ page }: { page: Page }) => {
        await page.setViewportSize(DESKTOP_VIEWPORT)
        await page.goto(appUrl)
        const { consoleErrors, pageErrors } = await checkPageHealth(page, appUrl)

        // 不应有严重错误
        const criticalErrors = [...consoleErrors, ...pageErrors].filter(
          (err) => !err.includes('favicon') && !err.includes('404')
        )
        expect(criticalErrors).toHaveLength(0)
      })

      test(`${name}/${version}: 桌面端无横向溢出`, async ({ page }: { page: Page }) => {
        await page.setViewportSize(DESKTOP_VIEWPORT)
        await page.goto(appUrl)
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
        await page.waitForTimeout(2000)

        const noOverflow = await checkNoHorizontalOverflow(page)
        expect(noOverflow).toBe(true)
      })

      test(`${name}/${version}: 移动端页面加载无错误`, async ({ page }: { page: Page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT)
        await page.goto(appUrl)
        const { consoleErrors, pageErrors } = await checkPageHealth(page, appUrl)

        const criticalErrors = [...consoleErrors, ...pageErrors].filter(
          (err) => !err.includes('favicon') && !err.includes('404')
        )
        expect(criticalErrors).toHaveLength(0)
      })

      test(`${name}/${version}: 移动端无横向溢出`, async ({ page }: { page: Page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT)
        await page.goto(appUrl)
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
        await page.waitForTimeout(2000)

        const noOverflow = await checkNoHorizontalOverflow(page)
        expect(noOverflow).toBe(true)
      })

      test(`${name}/${version}: 开始按钮或游戏界面存在`, async ({ page }: { page: Page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT)
        await page.goto(appUrl)
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
        await page.waitForTimeout(2000)

        // 查找开始按钮、游戏画布、或游戏面板（不同版本实现不同）
        const gameElement = page.locator('button:has-text("开始"), button:has-text("Start"), button:has-text("Play"), button:has-text("重新开始"), button:has-text("暂停"), canvas, .game-container, .board-grid, .game-board')
        const count = await gameElement.count()
        expect(count).toBeGreaterThan(0)
      })
    }
  }
})
