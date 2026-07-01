// [knowledge-presentation/register] — 注册内置插件到 PluginRegistry

import type { PluginRegistry } from '../../registry'
import { KNOWLEDGE_PRESENTATION_MANIFEST } from './manifest'
import { KNOWLEDGE_PRESENTATION_PLUGIN_ID } from './plugin'

export async function registerBuiltinKnowledgePresentation(
  registry: PluginRegistry
): Promise<void> {
  const reg = await registry.registerBuiltin(KNOWLEDGE_PRESENTATION_MANIFEST, {
    onLoad: async () => ({ ok: true }),
    onUnload: async () => ({ ok: true as const })
  })

  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '知识整理插件注册失败')
  }

  if (registry.get(KNOWLEDGE_PRESENTATION_PLUGIN_ID)?.status !== 'active') {
    const act = await registry.activate(KNOWLEDGE_PRESENTATION_PLUGIN_ID)
    if (!act.ok) throw new Error(act.error ?? '知识整理插件激活失败')
  }
}
