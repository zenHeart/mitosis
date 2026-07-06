import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatWithStepFun, STEP_PLAN_CHAT_COMPLETIONS_URL } from '../../../src/composables/useStepFun'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    choices: [{
      message: { role: 'assistant', content: 'ok' },
      finish_reason: 'stop',
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('chatWithStepFun', () => {
  it('uses the Step Plan chat completions endpoint', async () => {
    const result = await chatWithStepFun('test-step-token', [
      { role: 'user', content: 'hello' },
    ])

    expect(result).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(STEP_PLAN_CHAT_COMPLETIONS_URL)
    expect(String(url)).not.toBe('https://api.stepfun.com/v1/chat/completions')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-step-token',
      },
    })
  })

  it('does not call StepFun when token is empty', async () => {
    await expect(chatWithStepFun('', [
      { role: 'user', content: 'hello' },
    ])).rejects.toThrow('StepFun token required')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
