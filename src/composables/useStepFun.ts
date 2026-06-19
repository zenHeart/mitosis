const DEFAULT_MODEL = 'step-2-16k'

export interface StepFunMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StepFunResponse {
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export async function chatWithStepFun(
  token: string,
  messages: StepFunMessage[],
  model = DEFAULT_MODEL
): Promise<string> {
  const res = await fetch('https://api.stepfun.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    let errMsg = `StepFun API error: ${res.status}`
    try {
      const errJson = JSON.parse(errText)
      errMsg = errJson.error?.message || errMsg
    } catch {
      errMsg = `${errMsg} — ${errText.slice(0, 200)}`
    }
    throw new Error(errMsg)
  }

  const data: StepFunResponse = await res.json()
  return data.choices?.[0]?.message?.content || '(empty response)'
}
