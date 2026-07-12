import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chatWithStepFun,
  STEP_PLAN_CHAT_COMPLETIONS_URL,
  STEP_PLAN_IMAGE_GENERATION_URL,
} from '../../../src/composables/useStepFun'

const EXPECTED_CHAT_URL = 'https://api.stepfun.com/step_plan/v1/chat/completions'
const EXPECTED_IMAGE_URL = 'https://api.stepfun.com/step_plan/v1/images/generations'

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
    expect(STEP_PLAN_CHAT_COMPLETIONS_URL).toBe(EXPECTED_CHAT_URL)
    expect(url).toBe(EXPECTED_CHAT_URL)
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-step-token',
      },
    })
  })

  it('pins image generation to the Step Plan endpoint', () => {
    expect(STEP_PLAN_IMAGE_GENERATION_URL).toBe(EXPECTED_IMAGE_URL)
  })

  it('does not call StepFun when token is empty', async () => {
    await expect(chatWithStepFun('', [
      { role: 'user', content: 'hello' },
    ])).rejects.toThrow('StepFun token required')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
