import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock StepFun：LLM 分拣走 chatWithStepFun，单测中不发真实请求
vi.mock('../../src/composables/useStepFun', () => ({
  chatWithStepFun: vi.fn(),
}))

import { chatWithStepFun } from '../../src/composables/useStepFun'
import { triageByKeywords, smartTriage } from '../../src/composables/useTriage'

const mockChat = vi.mocked(chatWithStepFun)

beforeEach(() => {
  mockChat.mockReset()
})

// ================================================================
// triageByKeywords — 正则快速通道（与 Workspace 共用同一实现，杜绝漂移）
// ================================================================
describe('triageByKeywords', () => {
  it('identifies app build requests directly', () => {
    expect(triageByKeywords('帮我做一个俄罗斯方块游戏').action).toBe('build')
    expect(triageByKeywords('做个贪吃蛇').action).toBe('build')
    expect(triageByKeywords('俄罗斯方块').action).toBe('build')
    expect(triageByKeywords('tetris').action).toBe('build')
    expect(triageByKeywords('snake').action).toBe('build')
    expect(triageByKeywords('todo').action).toBe('build')
    expect(triageByKeywords('计算器').action).toBe('build')
    expect(triageByKeywords('帮我做一个 todo 应用').action).toBe('build')
    expect(triageByKeywords('帮我写一个记账本').action).toBe('build')
  })

  it('identifies platform changes', () => {
    expect(triageByKeywords('优化 Workspace 性能').action).toBe('platform')
    expect(triageByKeywords('修改 Gallery 样式').action).toBe('platform')
    expect(triageByKeywords('Mitosis 支持更多的游戏类型').action).toBe('platform')
    expect(triageByKeywords('优化mitosis 输入框移动端样式').action).toBe('platform')
    expect(triageByKeywords('mitosis 平台').action).toBe('platform')
  })

  it('identifies questions', () => {
    expect(triageByKeywords('Mitosis 是什么？').action).toBe('chat')
    expect(triageByKeywords('怎么使用？').action).toBe('chat')
    expect(triageByKeywords('介绍一下这个平台').action).toBe('chat')
  expect(triageByKeywords('你用的什么模型').action).toBe('chat')
  expect(triageByKeywords('请说明平台如何工作，不要创建应用、任务或修改平台').action).toBe('chat')
  })

  it('identifies simple tweaks as chat', () => {
    expect(triageByKeywords('改一下颜色').action).toBe('chat')
    expect(triageByKeywords('改一下字体大小').action).toBe('chat')
  })

  it('extracts basedOn from iteration requests', () => {
    const r = triageByKeywords('在 tetris-game 的基础上继续加音效')
    expect(r.action).toBe('build')
    expect(r.basedOn).toBe('tetris-game')
  })

  it('keeps non-task messages as chat', () => {
    expect(triageByKeywords('hello world').action).toBe('chat')
    expect(triageByKeywords('test').action).toBe('chat')
  })

  it('uses clarify only for task-like messages without enough target context', () => {
    expect(triageByKeywords('给它加个排行榜吧').action).toBe('clarify')
  })
})

// ================================================================
// smartTriage — 正则命中直接返回，不调用 LLM
// ================================================================
describe('smartTriage — keyword fast path', () => {
  it('returns keyword result without calling LLM when regex is decisive', async () => {
    const r = await smartTriage('帮我做一个 todo 应用', { stepToken: 'sk-test' })
    expect(r.action).toBe('build')
    expect(r.source).toBe('keyword')
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('skips LLM for decisive keyword builds even without stepToken', async () => {
    const r = await smartTriage('帮我写一个记账本', {})
    expect(r.action).toBe('build')
    expect(r.source).toBe('keyword')
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('keeps non-task messages as chat without calling LLM', async () => {
    const r = await smartTriage('test', { stepToken: 'sk-test' })
    expect(r.action).toBe('chat')
    expect(r.source).toBe('keyword')
    expect(mockChat).not.toHaveBeenCalled()
  })
})

// ================================================================
// smartTriage — LLM 语义分拣（正则未命中时）
// ================================================================
describe('smartTriage — LLM semantic triage', () => {
  it('classifies ambiguous message as build via LLM', async () => {
    mockChat.mockResolvedValue('{"action":"build","basedOn":null}')
    const r = await smartTriage('给它加个排行榜吧', { stepToken: 'sk-test' })
    expect(r.action).toBe('build')
    expect(r.source).toBe('llm')
    expect(r.scope).toBe('apps-only')
    expect(mockChat).toHaveBeenCalledTimes(1)
  })

  it('classifies ambiguous message as platform via LLM', async () => {
    mockChat.mockResolvedValue('{"action":"platform","basedOn":null}')
    const r = await smartTriage('左边那一栏看着太乱了收拾一下', { stepToken: 'sk-test' })
    expect(r.action).toBe('platform')
    expect(r.source).toBe('llm')
    expect(r.scope).toBe('platform')
  })

  it('passes basedOn from LLM result', async () => {
    mockChat.mockResolvedValue('{"action":"build","basedOn":"snake-game"}')
    const r = await smartTriage('给它加个排行榜吧', { stepToken: 'sk-test' })
    expect(r.action).toBe('build')
    expect(r.basedOn).toBe('snake-game')
    expect(r.scenario).toBe('app_iterate')
  })

  it('tolerates extra prose around the JSON payload', async () => {
    mockChat.mockResolvedValue('好的，分类结果如下：\n{"action":"chat","basedOn":null}\n希望有帮助')
    const r = await smartTriage('给它加个排行榜吧', { stepToken: 'sk-test' })
    expect(r.action).toBe('chat')
    expect(r.source).toBe('llm')
  })

  it('falls back to clarify when LLM fails (e.g. 402 quota)', async () => {
    mockChat.mockRejectedValue(new Error('StepFun API error: 402'))
    const r = await smartTriage('给它加个排行榜吧', { stepToken: 'sk-test' })
    expect(r.action).toBe('clarify')
    expect(r.source).toBe('fallback')
  })

  it('falls back to clarify when LLM returns garbage', async () => {
    mockChat.mockResolvedValue('我不知道你在说什么')
    const r = await smartTriage('给它加个排行榜吧', { stepToken: 'sk-test' })
    expect(r.action).toBe('clarify')
    expect(r.source).toBe('fallback')
  })

  it('rejects invalid action values from LLM', async () => {
    mockChat.mockResolvedValue('{"action":"rm -rf","basedOn":null}')
    const r = await smartTriage('给它加个排行榜吧', { stepToken: 'sk-test' })
    expect(r.action).toBe('clarify')
    expect(r.source).toBe('fallback')
  })
})

// ================================================================
// smartTriage — 澄清最多一次，不允许死循环
// ================================================================
describe('smartTriage — clarify at most once', () => {
  it('can route a decisive clarification answer to build', async () => {
    const r = await smartTriage('新应用，记账工具', { clarifyContext: '帮我写一个记账本' })
    expect(r.action).toBe('build')
    expect(r.action).not.toBe('clarify')
  })

  it('keeps unclear clarification answers as chat instead of creating an issue', async () => {
    mockChat.mockResolvedValue('{"action":"clarify","basedOn":null}')
    const r = await smartTriage('test', { stepToken: 'sk-test', clarifyContext: '给它加个排行榜吧' })
    expect(r.action).toBe('chat')
    expect(r.action).not.toBe('build')
  })

  it('respects a decisive answer after clarification', async () => {
    const r = await smartTriage('优化 Gallery 样式', { clarifyContext: '改一下那个页面' })
    expect(r.action).toBe('platform')
  })

  it('routes a mitosis platform clarification to platform changes', async () => {
    const r = await smartTriage('mitosis 平台', { clarifyContext: '优化mitosis 输入框移动端样式' })
    expect(r.action).toBe('platform')
    expect(r.scope).toBe('platform')
  })
})
