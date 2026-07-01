// [openforu/uplugins/examples/hello-world] 示例 Plugin 实现
//
// HelloWorldPlugin — 记录每轮情绪日志并响应情绪波动

import type { ExtensionLifecycleHooks, EngineSnapshot, ExtensionOpResult } from '../../../../../../../protocols'
import type { PluginSandboxApi } from '../../../../../../../plugins/types'

export class HelloWorldPlugin {
  private api: PluginSandboxApi
  private lastAff: number = 0

  constructor(api: PluginSandboxApi) {
    this.api = api
  }

  getHooks(): ExtensionLifecycleHooks {
    return {
      onLoad: async (snapshot: EngineSnapshot): Promise<ExtensionOpResult> => {
        this.lastAff = snapshot.emotion.aff
        this.api.log('info', `[HelloWorld] 加载完成。初始 aff=${snapshot.emotion.aff}, 轮次=${snapshot.totalTurns}`)

        // 持久化日志文件
        await this.api.writeOwnFile(
          'emotion-log.txt',
          `[${new Date().toISOString()}] Plugin 加载，初始 aff=${snapshot.emotion.aff}\n`
        )

        return { ok: true }
      },

      onUnload: async (): Promise<ExtensionOpResult> => {
        this.api.log('info', '[HelloWorld] 卸载')
        return { ok: true }
      },

      onEngineUpdate: async (snapshot: EngineSnapshot): Promise<ExtensionOpResult> => {
        const currentAff = snapshot.emotion.aff
        const delta = currentAff - this.lastAff

        // 追加情绪日志
        const logLine = `[${new Date().toISOString()}] aff=${currentAff} (${delta >= 0 ? '+' : ''}${delta}) label=${snapshot.emotion.primaryLabel}\n`
        try {
          const existing = await this.api.readOwnFile('emotion-log.txt')
          await this.api.writeOwnFile('emotion-log.txt', existing + logLine)
        } catch {
          await this.api.writeOwnFile('emotion-log.txt', logLine)
        }

        // 检测显著的情绪波动
        if (delta > 15) {
          this.api.log('info', `[HelloWorld] 检测到好感度上升 +${delta}`)
          this.api.emitEvent({
            category: 'plugin',
            sourceId: 'u/hello-world@1.0.0',
            type: 'affection_spike',
            payload: { aff: currentAff, delta },
            emotionHint: { affDelta: 1 },
            injectToContext: true,
            contextInjection: '【HelloWorld 插件】伴侣注意到你对她的好感大幅上升，她心里暖暖的。'
          })
        } else if (delta < -10) {
          this.api.log('warn', `[HelloWorld] 检测到好感度下降 ${delta}`)
          this.api.emitEvent({
            category: 'plugin',
            sourceId: 'u/hello-world@1.0.0',
            type: 'affection_drop',
            payload: { aff: currentAff, delta },
            emotionHint: { affDelta: -0.5 },
            injectToContext: true,
            contextInjection: '【HelloWorld 插件】伴侣注意到气氛有些微妙，她可能会用更温柔的语气说话。'
          })
        }

        this.lastAff = currentAff
        return { ok: true }
      },

      beforeUserMessage: async (_userMessage: string, _snapshot: EngineSnapshot) => {
        return { contextInjections: [] }
      },

      afterAssistantMessage: async (_assistantMessage: string, _snapshot: EngineSnapshot) => {
        return { ok: true }
      }
    }
  }
}
