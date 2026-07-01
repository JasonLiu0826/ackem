// 与 manifest.json 同步；打包进 out/main 后不再依赖磁盘上的 json 文件
import type { PluginManifest } from '../../types'
import type { DispatchConfig } from '../../../protocols'

const KNOWLEDGE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: {
    active_hours: '08:00-23:00',
    cooldown_minutes: 10
  },
  habits: [
    "用户说'整理一下''帮我梳理''知识卡'",
    '用户提出需要系统性讲解或整理某个主题'
  ],
  scenarios: [
    '用户希望 companion 整理某主题知识',
    '学习/复习场景下的结构化输出',
    '用户显式要求纸面卡或知识梳理'
  ],
  summary: '大模型知识整理纸面卡 + 伴侣短评（不联网、无参考链接）。',
  keywords: ['整理', '梳理', '知识', '讲解', '科普', '是什么', '介绍一下', '总结'],
  personality_hint: 'gentle_care'
}

export const KNOWLEDGE_PRESENTATION_MANIFEST: PluginManifest = {
  id: 'ackem/knowledge-presentation@1.0.0',
  name: '知识整理',
  version: '1.0.0',
  category: 'plugin',
  pluginType: 'tool',
  description:
    '大模型知识整理纸面卡 + 伴侣短评（不联网、无参考链接）；Ackem 基础能力，始终启用',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'plugin.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['engine_read'],
  fallbackPermissions: ['readonly'],
  tags: ['knowledge', 'builtin', 'llm', 'core'],
  dispatch: KNOWLEDGE_DISPATCH
}
