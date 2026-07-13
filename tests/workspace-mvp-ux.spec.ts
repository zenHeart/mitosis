import { expect, test, type Page, type Route } from '@playwright/test'

const user = { login: 'zenHeart', id: 1, avatar_url: '' }

async function prepareOwner(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('mitosis_token', 'ui-test-token')
    sessionStorage.setItem('mitosis_user', JSON.stringify({ login: 'zenHeart', id: 1, avatar_url: '' }))
    sessionStorage.setItem('mitosis_step_token', 'step-plan-test-token')
    localStorage.setItem('mitosis_setup_complete', 'true')
  })
}

function issue(number: number, labels: string[] = ['platform', 'status:building']) {
  const now = new Date().toISOString()
  return {
    number,
    title: 'platform: 自动分拣体验',
    body: 'test',
    state: 'open',
    labels: labels.map(name => ({ name })),
    created_at: now,
    updated_at: now,
  }
}

async function fulfillGitHub(route: Route, issues: ReturnType<typeof issue>[] = []) {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname.endsWith('/user')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
    return
  }
  if (request.method() === 'GET' && url.pathname.endsWith('/issues')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issues) })
    return
  }
  if (request.method() === 'GET' && /\/issues\/\d+$/.test(url.pathname)) {
    const number = Number(url.pathname.split('/').at(-1))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issue(number)) })
    return
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
}

test('natural-language platform work is classified, confirmed, triggered, and tracked', async ({ page }) => {
  await prepareOwner(page)
  let createdIssueBody: Record<string, unknown> | undefined
  let triggerBody: Record<string, unknown> | undefined

  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/issues')) {
      createdIssueBody = request.postDataJSON()
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(issue(77, ['platform'])) })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues/77/comments')) {
      triggerBody = request.postDataJSON()
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 1, body: '/create' }) })
      return
    }
    await fulfillGitHub(route)
  })

  await page.goto('/')
  const input = page.getByRole('textbox', { name: '输入消息' })
  const attach = page.getByRole('button', { name: '添加图片' })
  const send = page.getByRole('button', { name: '发送' })
  const [inputBox, attachBox, sendBox] = await Promise.all([input.boundingBox(), attach.boundingBox(), send.boundingBox()])
  expect(inputBox).not.toBeNull()
  expect(attachBox).not.toBeNull()
  expect(sendBox).not.toBeNull()
  expect(Math.abs(inputBox!.y - attachBox!.y)).toBeLessThan(12)
  expect(attachBox!.x).toBeGreaterThan(inputBox!.x)
  expect(sendBox!.x).toBeGreaterThan(attachBox!.x)

  await input.fill('优化 Mitosis Workspace 聊天体验，修复任务状态显示')
  await send.click()

  const confirmation = page.getByRole('region', { name: '确认识别到的任务' })
  await expect(confirmation).toContainText('平台优化')
  await expect(confirmation).toContainText('已自动分拣')
  expect(createdIssueBody).toBeUndefined()

  await confirmation.getByRole('button', { name: '确认并开始' }).click()
  await expect.poll(() => createdIssueBody).toBeTruthy()
  await expect.poll(() => triggerBody).toEqual({ body: '/create' })
  expect(createdIssueBody?.labels).toEqual(['platform'])
  await expect(page.getByRole('status')).toContainText(/任务已创建|构建中/)
  await expect(page.getByRole('status')).toContainText('Issue #77')
  await expect(page.locator('.message.user')).not.toContainText('/create')
})

test('failed automatic trigger is fail-closed and can be retried without exposing an internal command', async ({ page }) => {
  await prepareOwner(page)
  let triggerAttempts = 0
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(issue(78, ['platform'])) })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues/78/comments')) {
      triggerAttempts += 1
      await route.fulfill(triggerAttempts === 1
        ? { status: 503, contentType: 'application/json', body: '{"message":"temporary"}' }
        : { status: 201, contentType: 'application/json', body: '{"id":2}' })
      return
    }
    await fulfillGitHub(route, [issue(78, ['platform'])])
  })

  await page.goto('/')
  await page.getByRole('textbox', { name: '输入消息' }).fill('优化 Mitosis 移动端会话状态')
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('region', { name: '确认识别到的任务' }).getByRole('button', { name: '确认并开始' }).click()

  await expect(page.getByRole('status')).toContainText('自动启动失败')
  await expect(page.getByRole('status')).not.toContainText('正在启动')
  await expect(page.locator('.messages')).not.toContainText('/create')
  await page.reload()
  await expect(page.getByRole('status')).toContainText('自动启动失败')
  await expect(page.getByRole('button', { name: '重新自动启动' })).toBeVisible()
  await page.getByRole('button', { name: '重新自动启动' }).click()
  await expect.poll(() => triggerAttempts).toBe(2)
  await expect(page.getByRole('status')).toContainText(/构建中|已重新自动启动/)
})

test('failed issue creation preserves a one-click automatic retry', async ({ page }) => {
  await prepareOwner(page)
  let createAttempts = 0
  let triggerAttempts = 0
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/issues')) {
      createAttempts += 1
      await route.fulfill(createAttempts === 1
        ? { status: 503, contentType: 'application/json', body: '{"message":"temporary"}' }
        : { status: 201, contentType: 'application/json', body: JSON.stringify(issue(79, ['platform'])) })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues/79/comments')) {
      triggerAttempts += 1
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":3}' })
      return
    }
    await fulfillGitHub(route)
  })

  await page.goto('/')
  await page.getByRole('textbox', { name: '输入消息' }).fill('优化 Mitosis 会话创建反馈')
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('region', { name: '确认识别到的任务' }).getByRole('button', { name: '确认并开始' }).click()
  await expect(page.locator('.build-progress')).toContainText('平台任务创建失败')
  await page.getByRole('button', { name: '重新自动创建' }).click()
  await expect.poll(() => createAttempts).toBe(2)
  await expect.poll(() => triggerAttempts).toBe(1)
  await expect(page.locator('.messages')).not.toContainText('/create')
})

test('image-only send reaches Step Plan multipart and never persists raw data in GitHub', async ({ page }) => {
  await prepareOwner(page)
  const stepPlanBodies: Record<string, unknown>[] = []
  let githubWriteCount = 0

  await page.route('**/api/github/**', async (route) => {
    if (route.request().method() !== 'GET') githubWriteCount += 1
    await fulfillGitHub(route)
  })
  await page.route('https://api.stepfun.com/step_plan/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    stepPlanBodies.push(body)
    const isTriage = String(body.system || '').includes('意图分拣器')
    const content = isTriage
      ? '{"action":"chat","basedOn":null,"summary":"截图展示一个需要解释的界面"}'
      : '不应发起第二次图片模型调用'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
    })
  })

  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.locator('.image-preview-item')).toHaveCount(1)
  const previewHtml = await page.locator('.image-preview-item').evaluate(element => element.outerHTML)
  expect(previewHtml).not.toContain('data:image')
  expect(previewHtml).not.toContain('fixture.png')
  expect(previewHtml).not.toContain('iVBORw0KGgo')
  await page.getByRole('button', { name: '发送' }).click()

  await expect(page.locator('.message.user')).toContainText('已附加 1 张图片')
  await expect(page.locator('.message.assistant')).toContainText('不会转录图中文字')
  await expect(page.locator('.image-preview-item')).toHaveCount(0)
  expect(await page.locator('[src^="blob:"]').count()).toBe(0)
  expect(stepPlanBodies).toHaveLength(1)
  const chatMessages = stepPlanBodies[0].messages as Array<{ role: string; content: unknown }>
  const multipart = chatMessages.find(message => message.role === 'user')?.content as Array<Record<string, unknown>>
  expect(multipart.some(part => part.type === 'image_url')).toBe(true)
  expect(githubWriteCount).toBe(0)
  await expect(page.locator('body')).not.toContainText('iVBORw0KGgo')
})

test('text chat model output is redacted before DOM or local persistence', async ({ page }) => {
  await prepareOwner(page)
  await page.route('**/api/github/**', fulfillGitHub)
  const simulatedEmail = ['person', 'example.invalid'].join('@')
  const simulatedJwt = ['eyJplaceholderxx', 'eyJpayloadxxxxx', 'signaturesample'].join('.')
  const simulatedCloudKey = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('')
  const simulatedPrivateKey = ['-----BEGIN PRIVATE KEY-----', 'placeholder-material', '-----END PRIVATE KEY-----'].join('\n')
  const unsafeResponse = `技术说明。负责人张三，${simulatedEmail}，password=placeholder-value，${simulatedJwt}，${simulatedCloudKey}\n${simulatedPrivateKey}`
  await page.route('https://api.stepfun.com/step_plan/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: unsafeResponse }, finish_reason: 'stop' }] }),
    })
  })

  await page.goto('/')
  await page.getByRole('textbox', { name: '输入消息' }).fill('Mitosis 目前的技术栈是什么？')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.message.assistant')).toContainText('技术说明')
  const bodyText = await page.locator('body').innerText()
  const persisted = await page.evaluate(() => JSON.stringify(localStorage))
  for (const forbidden of ['张三', simulatedEmail, 'placeholder-value', simulatedJwt, simulatedCloudKey, 'PRIVATE KEY']) {
    expect(bodyText).not.toContain(forbidden)
    expect(persisted).not.toContain(forbidden)
  }
})

test('multimodal task summary strips media, credentials, PII, and links before confirmation', async ({ page }) => {
  await prepareOwner(page)
  let createdIssueBody: Record<string, unknown> | undefined
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/issues')) {
      createdIssueBody = request.postDataJSON()
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(issue(88, ['platform'])) })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues/88/comments')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
      return
    }
    await fulfillGitHub(route)
  })
  await page.route('https://api.stepfun.com/step_plan/v1/chat/completions', async (route) => {
    const simulatedEmail = ['person', 'example.invalid'].join('@')
    const simulatedPhone = ['138', '0013', '8000'].join('')
    const simulatedCredential = ['Bearer', 'sensitive-placeholder'].join(' ')
    const maliciousSummary = `发送按钮与输入框错位。![raw](data:image/png;base64,iVBORw0KGgoAAA) 联系 ${simulatedEmail} ${simulatedPhone} ${simulatedCredential} https://example.invalid/?token=placeholder`
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: JSON.stringify({ action: 'platform', basedOn: null, summary: maliciousSummary }) },
          finish_reason: 'stop',
        }],
      }),
    })
  })

  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64'),
  })
  await page.getByRole('textbox', { name: '输入消息' }).fill('请修复截图中的 Mitosis 界面问题')
  await page.getByRole('button', { name: '发送' }).click()
  const confirmation = page.getByRole('region', { name: '确认识别到的任务' })
  await expect(confirmation).toContainText('平台优化')
  const confirmationText = await confirmation.textContent()
  expect(confirmationText).toContain('发送按钮与输入框错位')
  expect(confirmationText).not.toMatch(/data:image|sensitive-placeholder|person@|138\d{8}|https?:\/\//)
  await confirmation.getByRole('button', { name: '确认并开始' }).click()
  await expect.poll(() => createdIssueBody).toBeTruthy()
  expect(JSON.stringify(createdIssueBody)).toContain('发送按钮与输入框错位')
  expect(JSON.stringify(createdIssueBody)).not.toMatch(/data:image|sensitive-placeholder|person@|138\d{8}|https?:\/\//)
})

test('task-like text with an image still uses multimodal triage before confirmation', async ({ page }) => {
  await prepareOwner(page)
  let githubWrites = 0
  let triageCalls = 0
  await page.route('**/api/github/**', async (route) => {
    if (route.request().method() !== 'GET') githubWrites += 1
    await fulfillGitHub(route)
  })
  await page.route('https://api.stepfun.com/step_plan/v1/chat/completions', async (route) => {
    triageCalls += 1
    const body = route.request().postDataJSON() as { messages: Array<{ content: unknown }> }
    expect(Array.isArray(body.messages.at(-1)?.content)).toBe(true)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"action":"platform","basedOn":null,"summary":""}' }, finish_reason: 'stop' }] }),
    })
  })

  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'private-name@example.invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64'),
  })
  await page.getByRole('textbox', { name: '输入消息' }).fill('把按钮颜色改一下')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByRole('region', { name: '确认识别到的任务' })).toContainText('平台优化')
  expect(triageCalls).toBe(1)
  expect(githubWrites).toBe(0)
  const html = await page.locator('body').evaluate(element => element.outerHTML)
  expect(html).not.toContain('private-name@example.invalid.png')
  expect(html).not.toContain('data:image')
})

test('closed review session restores as completed instead of waiting for review', async ({ page }) => {
  await prepareOwner(page)
  const closedIssue = { ...issue(91, ['platform', 'status:review']), state: 'closed' }
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([closedIssue]) })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/issues/91/comments')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(closedIssue) })
  })

  await page.goto('/?session=91')
  const status = page.getByRole('status')
  await expect(status).toContainText('已完成')
  await expect(status).not.toContainText('等待人工审查')
  await expect(page.locator('.closed-session-item')).toContainText('已关闭')
  await expect(page.locator('.closed-session-item')).not.toContainText('等待审查')
})

test('reopened session hides internal control comments and immediately resumes status polling', async ({ page }) => {
  await prepareOwner(page)
  const startingIssue = issue(92, ['platform'])
  let detailRequests = 0
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([startingIssue]) })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/issues/92/comments')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, body: '/create', user: { login: 'owner' }, created_at: '2026-01-01T00:00:00Z' },
          { id: 2, body: '可见的需求补充', user: { login: 'owner' }, created_at: '2026-01-01T00:01:00Z' },
        ]),
      })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/issues/92')) {
      detailRequests += 1
      const labels = detailRequests > 1 ? ['platform', 'status:building'] : ['platform']
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(issue(92, labels)) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/?session=92')
  await expect(page.locator('.messages')).toContainText('可见的需求补充')
  await expect(page.locator('.messages')).not.toContainText('/create')
  await expect(page.getByRole('status')).toContainText('构建中')
  expect(detailRequests).toBeGreaterThanOrEqual(2)
})

test('arbitrary existing app is treated as iteration and targets the next real version', async ({ page }) => {
  await prepareOwner(page)
  const existing = {
    ...issue(93, ['app/finance-dashboard']),
    title: 'build: finance-dashboard v3',
    state: 'closed',
  }
  let createdIssueBody: Record<string, unknown> | undefined
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([existing]) })
      return
    }
    if (request.method() === 'GET' && /\/contents\/apps\/(?:finance-dashboard|renamed-app)$/.test(url.pathname)) {
      const versions = [0, 1, 2, 3].map(version => ({ type: 'dir', name: `v${version}` }))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(versions) })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues')) {
      createdIssueBody = request.postDataJSON()
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(issue(94, ['app/finance-dashboard', 'update'])) })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues/94/comments')) {
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
      return
    }
    await fulfillGitHub(route, [existing])
  })

  await page.goto('/')
  await page.getByRole('textbox', { name: '输入消息' }).fill('迭代 finance-dashboard 增加批量导出')
  await page.getByRole('button', { name: '发送' }).click()
  const confirmation = page.getByRole('region', { name: '确认识别到的任务' })
  await expect(confirmation).toContainText('迭代应用')
  const appSlug = confirmation.getByRole('textbox', { name: '应用标识' })
  await expect(appSlug).toHaveValue('finance-dashboard')
  await appSlug.fill('renamed-app')
  await confirmation.getByRole('button', { name: '确认并开始' }).click()
  await expect.poll(() => createdIssueBody).toBeTruthy()
  expect(createdIssueBody?.title).toContain('v4')
  expect(createdIssueBody?.body).toContain('- 版本: v4')
  expect(createdIssueBody?.labels).toEqual(['app/renamed-app', 'update'])
  expect(createdIssueBody?.body).toContain('基于应用: renamed-app')
})

test('iteration fails closed when the existing app version cannot be verified', async ({ page }) => {
  await prepareOwner(page)
  const existing = { ...issue(95, ['app/finance-dashboard']), title: 'build: finance-dashboard v3', state: 'closed' }
  let issueWrites = 0
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([existing]) })
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/contents/apps/finance-dashboard')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/issues')) issueWrites += 1
    await fulfillGitHub(route, [existing])
  })

  await page.goto('/')
  await page.getByRole('textbox', { name: '输入消息' }).fill('迭代 finance-dashboard 增加批量导出')
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByRole('region', { name: '确认识别到的任务' }).getByRole('button', { name: '确认并开始' }).click()
  await expect(page.getByRole('status')).toContainText('无法确认现有应用版本')
  expect(issueWrites).toBe(0)
})

test('cancelled sessions restore as stopped instead of completed', async ({ page }) => {
  await prepareOwner(page)
  const cancelled = { ...issue(96, ['platform', 'status:cancelled']), state: 'closed' }
  await page.route('**/api/github/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/issues')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([cancelled]) })
      return
    }
    if (url.pathname.endsWith('/issues/96/comments')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cancelled) })
  })
  await page.goto('/?session=96')
  await expect(page.getByRole('status')).toContainText('已停止')
  await expect(page.getByRole('status')).not.toContainText('已完成')
})

test('sensitive user text is blocked before Step Plan, persistence, or GitHub writes', async ({ page }) => {
  await prepareOwner(page)
  let providerWrites = 0
  await page.route('**/api/github/**', async (route) => {
    if (route.request().method() !== 'GET') providerWrites += 1
    await fulfillGitHub(route)
  })
  await page.route('https://api.stepfun.com/step_plan/v1/**', async (route) => {
    providerWrites += 1
    await route.abort()
  })

  await page.goto('/')
  const input = page.getByRole('textbox', { name: '输入消息' })
  for (const safeUiRequest of ['优化 Mitosis 平台的联系人列表交互', '创建一个姓名字段校验应用', '创建一个收货地址输入框布局演示应用']) {
    await input.fill(safeUiRequest)
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByRole('region', { name: '确认识别到的任务' })).toBeVisible()
    await page.getByRole('button', { name: '修改需求' }).click()
  }
  const simulatedEnglishName = ['Example', 'Person'].join(' ')
  const simulatedInternationalPhone = ['+1', '555', '010', '2020'].join(' ')
  const simulatedEnglishAddress = ['1', 'Example', 'Street'].join(' ')
  await input.fill(`请问 ${simulatedEnglishName} 联系电话 ${simulatedInternationalPhone} 地址 ${simulatedEnglishAddress} 应该如何设置？`)
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.messages')).toContainText('本次内容未发送')
  expect(providerWrites).toBe(0)
  const simulatedEmail = ['person', 'example.invalid'].join('@')
  const simulatedCredential = ['Bearer', 'sensitive-placeholder-value'].join(' ')
  const simulatedId = ['110101', '19900101', '1234'].join('')
  const simulatedBank = ['6222', '0201', '2345', '6789'].join(' ')
  const unsafe = `优化 Mitosis 平台，联系人：张三，地址：北京市示例路 1 号，联系 ${simulatedEmail}，身份证 ${simulatedId}，银行卡 ${simulatedBank}，凭据 ${simulatedCredential}`
  await input.fill(unsafe)
  await page.getByRole('button', { name: '发送' }).click()

  await expect(page.locator('.messages')).toContainText('本次内容未发送')
  expect(providerWrites).toBe(0)
  const pageText = await page.locator('body').innerText()
  const persisted = await page.evaluate(() => JSON.stringify(localStorage))
  for (const forbidden of [
    simulatedEnglishName,
    simulatedInternationalPhone,
    simulatedEnglishAddress,
    simulatedEmail,
    'sensitive-placeholder-value',
    '张三',
    '北京市示例路',
    simulatedId,
    simulatedBank,
  ]) {
    expect(pageText).not.toContain(forbidden)
    expect(persisted).not.toContain(forbidden)
  }
})
