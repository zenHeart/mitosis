import { test, expect } from '@playwright/test'

const sessions = Array.from({ length: 28 }, (_, index) => ({
  number: index + 1,
  title: index % 2 ? `todo 应用迭代 ${index + 1}` : `platform: 优化会话 ${index + 1}`,
  state: index % 4 === 3 ? 'closed' : 'open',
  labels: index % 2 ? [{ name: 'app/todo-app' }] : [{ name: 'platform' }],
  created_at: new Date(Date.now() - index * 3_600_000).toISOString(),
  updated_at: new Date(Date.now() - index * 3_600_000).toISOString(),
}))

test('会话侧栏在桌面端可滚动且分组可折叠', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('mitosis_token', 'ui-test-token')
    sessionStorage.setItem('mitosis_user', JSON.stringify({ login: 'zenHeart', id: 1, avatar_url: '' }))
    localStorage.setItem('mitosis_setup_complete', 'true')
  })
  await page.route('**/api/github/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login: 'zenHeart', id: 1, avatar_url: '' }) })
      return
    }
    if (url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/')
  const sidebar = page.locator('.sidebar')
  const sessionList = page.locator('.sessions-list')
  await expect(sidebar).toBeVisible()

  const metrics = await sessionList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }))
  expect(metrics.clientHeight).toBeGreaterThan(0)
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  expect(metrics.overflowY).toBe('auto')
  const scrollTop = await sessionList.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(scrollTop).toBeGreaterThan(0)

  const platformGroup = sessionList.getByRole('button', { name: /平台/ })
  await expect(platformGroup).toHaveAttribute('aria-expanded', 'true')
  await platformGroup.click()
  await expect(platformGroup).toHaveAttribute('aria-expanded', 'false')

  const todoGroup = sessionList.locator('.app-group-toggle').filter({ hasText: 'todo-app' })
  await expect(todoGroup).toHaveAttribute('aria-expanded', 'false')
  await todoGroup.click()
  await expect(todoGroup).toHaveAttribute('aria-expanded', 'true')
  await expect(sessionList.getByRole('button', { name: /^todo 应用迭代 2 / })).toBeVisible()
})

test('会话侧栏在移动端打开后仍可滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    sessionStorage.setItem('mitosis_token', 'ui-test-token')
    sessionStorage.setItem('mitosis_user', JSON.stringify({ login: 'zenHeart', id: 1, avatar_url: '' }))
    localStorage.setItem('mitosis_setup_complete', 'true')
  })
  await page.route('**/api/github/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login: 'zenHeart', id: 1, avatar_url: '' }) })
      return
    }
    if (url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/')
  const menuButton = page.getByRole('button', { name: '打开菜单', exact: true })
  expect(await menuButton.count()).toBe(1)
  await menuButton.click()
  const sidebar = page.locator('.sidebar')
  await expect(sidebar).toHaveClass(/open/)
  const metrics = await sidebar.locator('.sessions-list').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }))
  expect(metrics.clientHeight).toBeGreaterThan(0)
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  expect(metrics.overflowY).toBe('auto')
  const mobileScrollTop = await sidebar.locator('.sessions-list').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(mobileScrollTop).toBeGreaterThan(0)
})
