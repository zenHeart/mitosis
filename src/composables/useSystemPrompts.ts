/**
 * System Prompts — Mitosis Workspace AI 分流提示词
 *
 * 根据 triage 结果选择对应的系统提示词，由 useStepFun 的 system 参数传入。
 * 提示词内容可通过环境变量或配置文件调整，不硬编码在组件中。
 */

// ── 可配置的提示词模板 ──────────────────────────────────

const CHAT_PROMPT = (userLogin: string, time: string) =>
  `你是 Mitosis 平台的助手。用户正在和你聊天或询问问题。
简短、友好地回答。如果用户只是打招呼，正常回应即可。
当前登录用户: ${userLogin}
当前时间: ${time}`

const BUILD_PROMPT = (basedOn: string | undefined, time: string) =>
  `你是一个应用构建助手。用户想构建或迭代一个应用。
请：
1. 理解用户需求
2. 给出简短的技术方案概述（2-3 句话）
3. 如果需求足够明确，在回复末尾加一行：BUILD_APP: [应用英文名]
   应用名用英文小写短横线连接，不要有空格${basedOn ? `\n\n用户想在 ${basedOn} 的基础上继续开发。Issue 中请包含 based-on 信息。` : ''}

如果需求还不明确需要更多信息，先问清楚，不要加 BUILD_APP。
当前时间: ${time}`

const PLATFORM_PROMPT = (time: string) =>
  `用户提到了 Mitosis 平台本身的修改（涉及 src/、CI、认证、部署等平台代码）。
你的任务：
1. 分析这个修改的影响范围和注意事项
2. 给出技术建议
3. 如果用户明确要求执行修改，在回复末尾加一行：BUILD_PLATFORM: [简述修改内容]
   这样系统会自动创建 Issue 并触发 CI 构建流程。
   如果只是讨论/分析，不要加 BUILD_PLATFORM 标记。

请正常回复分析。
当前时间: ${time}`

// ── 导出类型 ────────────────────────────────────────────

export type TriageAction = 'chat' | 'build' | 'platform' | 'clarify'

export interface TriageResult {
  action: TriageAction
  basedOn?: string
}

// ── 主函数 ──────────────────────────────────────────────

/**
 * 根据分流结果返回对应的 system prompt 字符串
 * 由 useStepFun 的 system 字段传入，不混入 messages 数组
 */
export function getSystemPrompt(triage: TriageResult, userLogin = 'user'): string {
  const time = new Date().toLocaleString('zh-CN')
  switch (triage.action) {
    case 'chat':
      return CHAT_PROMPT(userLogin, time)
    case 'build':
      return BUILD_PROMPT(triage.basedOn, time)
    case 'platform':
      return PLATFORM_PROMPT(time)
    default:
      return CHAT_PROMPT(userLogin, time)
  }
}
