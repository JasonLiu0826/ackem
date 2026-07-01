// [openforu/uplugins/_template] Plugin 实现模板
//
// 这是你的 Plugin 核心逻辑所在。
//
// 关键规则：
//   1. 只能通过 PluginSandboxApi 与外部交互
//   2. 不要 import 'fs'、'child_process' 等 Node 内置模块（沙箱禁止）
//   3. 不要 import 任何 engine/ 或 memory/ 路径下的文件
//   4. 使用 api.emitEvent() 产出的 ExtensionEvent 与引擎通信
//   5. 使用 api.readOwnFile() / api.writeOwnFile() 做文件操作
//
// 详见 uplugins/CATALOG.md

import type { ExtensionLifecycleHooks, EngineSnapshot, ExtensionEvent, ExtensionOpResult } from '../../../../../protocols'
import type { PluginSandboxApi } from '../../../../../plugins/types'

export class MyPlugin {
  private api: PluginSandboxApi

  constructor(api: PluginSandboxApi) {
    this.api = api
  }

  getHooks(): ExtensionLifecycleHooks {
    return {
      onLoad: async (snapshot: EngineSnapshot): Promise<ExtensionOpResult> => {
        this.api.log('info', `Plugin 加载，引擎轮次: ${snapshot.totalTurns}`)
        return { ok: true }
      },

      onUnload: async (): Promise<ExtensionOpResult> => {
        this.api.log('info', 'Plugin 卸载')
        return { ok: true }
      },

      onEngineUpdate: async (snapshot: EngineSnapshot): Promise<ExtensionOpResult> => {
        // 在此响应引擎状态变化
        // 例如：检测到用户情绪低落时发送通知
        if (snapshot.emotion.aff < -30) {
          this.api.log('warn', '检测到用户情绪低落')
          // 产出事件（由协调器送入引擎）
          this.api.emitEvent({
            category: 'plugin',
            sourceId: 'u/my-plugin@1.0.0',
            type: 'emotion_alert',
            payload: { aff: snapshot.emotion.aff },
            emotionHint: { affDelta: 0.5 },
            injectToContext: true,
            contextInjection: '【系统提示】伴侣注意到你似乎情绪不太好，她可能会用更温柔的语气回应。'
          })
        }
        return { ok: true }
      },

      beforeUserMessage: async (userMessage: string, snapshot: EngineSnapshot) => {
        return { contextInjections: [] }
      },

      afterAssistantMessage: async (assistantMessage: string, snapshot: EngineSnapshot) => {
        return { ok: true }
      }
    }
  }
}
