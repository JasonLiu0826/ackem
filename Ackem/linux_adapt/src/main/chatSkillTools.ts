// [chatSkillTools] — 将 Skill function calling 接入 OpenAI / Anthropic 聊天工具链

import { createLogger } from './logger'
import { notifyExtensionInvoke } from './extensions/extensionInvokeToast'
import { getExtensionsCoordinator } from './extensions/runtime'
import type { SkillFunctionDef } from './extensions/skills/types'
import type { SkillResult } from './extensions/skills/types'

const log = createLogger('chat-skill')

export function skillDefsToOpenAiTools(defs: SkillFunctionDef[]): unknown[] {
  return defs.map(def => ({
    type: 'function' as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters
    }
  }))
}

export function skillDefsToAnthropicTools(defs: SkillFunctionDef[]): Array<{
  name: string
  description: string
  input_schema: Record<string, unknown>
}> {
  return defs.map(def => ({
    name: def.name,
    description: def.description,
    input_schema: def.parameters
  }))
}

export function getActiveSkillToolDefs(): SkillFunctionDef[] {
  return getExtensionsCoordinator()?.getAvailableTools() ?? []
}

export function isSkillToolName(name: string): boolean {
  return getActiveSkillToolDefs().some(def => def.name === name)
}

export async function executeSkillToolCallDetailed(
  toolName: string,
  args: Record<string, unknown>,
  userMessage?: string
): Promise<SkillResult | null> {
  const coordinator = getExtensionsCoordinator()
  if (!coordinator) return null

  const handler = coordinator.skills.findByFunctionName(toolName)
  if (!handler) {
    if (toolName === 'web_search') {
      log.warn('web_search 未被调用（Skill 未注册或未激活）', { called: false })
    }
    return null
  }

  if (toolName === 'web_search') {
    const q = typeof args.query === 'string' ? args.query.trim() : ''
    log.info('web_search 被 LLM 触发', { called: true, query: q || '(空)' })
  }

  const invocation = coordinator.skills.createInvocation(
    handler.manifest.id,
    'llm_function_call',
    toolName,
    args,
    userMessage
  )
  if (!invocation) return null

  const result = await coordinator.skills.execute(invocation)
  if (result.ok) {
    notifyExtensionInvoke(handler.manifest.id, handler.manifest.name)
  }
  return result
}

export async function executeSkillToolCall(
  toolName: string,
  args: Record<string, unknown>,
  userMessage?: string
): Promise<string | null> {
  const result = await executeSkillToolCallDetailed(toolName, args, userMessage)
  if (!result) return null
  if (!result.ok) {
    return result.error ? `搜索失败：${result.error}` : `Skill「${toolName}」执行失败`
  }
  return result.output
}
