import { describe, it, expect } from 'vitest'

// Inline the triage logic from Workspace.vue for testing
function triageMessage(text: string) {
  const lower = text.toLowerCase()

  const isPlatform =
    /src\//i.test(text) ||
    /mitosis\s*(支持|增加|去掉|删除|修改|优化|改进|加个|加上|升级|重构)/i.test(text) ||
    /(?:给|帮|让)\s*mitosis\s*(加|增加|加个|去掉|删|改|优化|升级|支持)/i.test(text) ||
    /(?:GitHub Actions|workflow|CI|OAuth|认证|deploy|gh-pages|composable|组件库|架构|核心逻辑)/.test(text) ||
    /(?:Workspace|SetupPage|Gallery|ChatInput)/.test(text)

  const isQuestion =
    /^(?:怎么|如何|为什么|是什么|能不能|可以|帮忙|help|how|what|why)/.test(lower) ||
    /[?？]$/.test(text.trim()) ||
    /(?:进度|状态|帮助|介绍|解释|说明|区别|是什么)/.test(text)

  const isAppBuild =
    /(?:做一个|创建.*应用|建.*应用|写.*应用|开发.*应用|实现.*应用|做个|搞个|弄个|做个游戏|做个工具|想做个|想做一个)/.test(text) ||
    /(?:build|create.*app|make.*app|new app)/i.test(lower) ||
    /^(?:俄罗斯方块|贪吃蛇|snake|tetris|todo|计算器|calculator|俄罗斯|打砖块|breakout|flappy|2048).*$/i.test(text.trim())

  const isSimpleTweak =
    /(?:改.*颜色|改.*字体|改.*大小|调.*大|调.*小|加.*文字|改.*样式|换个.*图标|加.*按钮|改.*背景|字体|颜色|间距|圆角|阴影)/.test(text)

  const isContinue = /(?:继续|上次|迭代|在.*基础上|基于.*继续)/.test(text)

  if (isQuestion && !isAppBuild && !isPlatform && !isContinue) {
    return { action: 'chat', scenario: 'app_create', intent: 'question', complexity: 'simple', scope: 'none' }
  }
  if (isPlatform) {
    return { action: 'platform', scenario: 'platform', intent: 'modify_platform', complexity: 'medium', scope: 'platform' }
  }
  if (isSimpleTweak && !isAppBuild && !isContinue) {
    return { action: 'chat', scenario: 'app_iterate', intent: 'create_app', complexity: 'simple', scope: 'apps-only' }
  }
  if (isAppBuild || isContinue) {
    const scenario = 'app_create'
    return {
      action: 'build',
      scenario,
      intent: 'create_app',
      complexity: isContinue ? 'medium' : 'complex',
      scope: 'apps-only',
    }
  }
  return { action: 'clarify', scenario: 'app_create', intent: 'unknown', complexity: 'simple', scope: 'none' }
}

describe('triageMessage', () => {
  it('identifies app build requests directly', () => {
    expect(triageMessage('帮我做一个俄罗斯方块游戏').action).toBe('build')
    expect(triageMessage('做个贪吃蛇').action).toBe('build')
    expect(triageMessage('俄罗斯方块').action).toBe('build')
    expect(triageMessage('tetris').action).toBe('build')
    expect(triageMessage('snake').action).toBe('build')
    expect(triageMessage('todo').action).toBe('build')
    expect(triageMessage('计算器').action).toBe('build')
    expect(triageMessage('帮我做一个 todo 应用').action).toBe('build')
  })

  it('identifies platform changes', () => {
    expect(triageMessage('优化 Workspace 性能').action).toBe('platform')
    expect(triageMessage('修改 Gallery 样式').action).toBe('platform')
    expect(triageMessage('Mitosis 支持更多的游戏类型').action).toBe('platform')
  })

  it('identifies questions', () => {
    expect(triageMessage('Mitosis 是什么？').action).toBe('chat')
    expect(triageMessage('怎么使用？').action).toBe('chat')
    expect(triageMessage('介绍一下这个平台').action).toBe('chat')
  })

  it('identifies simple tweaks as chat', () => {
    expect(triageMessage('改一下颜色').action).toBe('chat')
    expect(triageMessage('换个图标').action).toBe('chat')
  })

  it('falls back to clarify for unknown intent', () => {
    expect(triageMessage('hello world').action).toBe('clarify')
  })
})
