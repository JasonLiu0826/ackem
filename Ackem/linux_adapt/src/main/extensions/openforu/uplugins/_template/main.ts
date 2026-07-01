// [openforu/uplugins/_template] Plugin 入口文件
//
// 这是编译后的入口。你的源码在 src/ 目录中。
// Plugin 运行在受限沙箱中，通过 PluginSandboxApi 与引擎交互。
//
// 实现要求：
//   1. 导出一个默认类或工厂函数，接收 PluginSandboxApi 参数
//   2. 实现 ExtensionLifecycleHooks（onLoad、onUnload、onEngineUpdate 等）
//   3. 不要直接 import engine/ 或 memory/ 下的任何文件
//   4. 网络请求必须通过 manifest 中声明的白名单 URL 前缀
//   5. 文件写入限制在 getDataDir() 返回的目录内

import type { ExtensionLifecycleHooks, EngineSnapshot, ExtensionEvent } from '../../../../protocols'
import type { PluginSandboxApi } from '../../../../plugins/types'

// 你的实现从这里开始
// import { MyPlugin } from './src/index'

interface PluginFactory {
  (api: PluginSandboxApi): ExtensionLifecycleHooks
}

// 默认导出：插件工厂函数
const factory: PluginFactory = (api: PluginSandboxApi): ExtensionLifecycleHooks => {
  api.log('info', `[u/my-plugin] 初始化完成，数据目录: ${api.getDataDir()}`)

  return {
    onLoad: async (snapshot: EngineSnapshot) => {
      api.log('info', `[u/my-plugin] 加载完成，当前轮次: ${snapshot.totalTurns}`)
      return { ok: true }
    },

    onUnload: async () => {
      api.log('info', '[u/my-plugin] 卸载')
      return { ok: true }
    },

    onEngineUpdate: async (snapshot: EngineSnapshot) => {
      // 每轮对话后引擎状态更新时调用
      // 只读快照，不可修改引擎状态
      return { ok: true }
    },

    beforeUserMessage: async (userMessage: string, snapshot: EngineSnapshot) => {
      // 用户消息发送前调用，可返回额外的上下文注入
      return { contextInjections: [] }
    },

    afterAssistantMessage: async (assistantMessage: string, snapshot: EngineSnapshot) => {
      // LLM 回复后调用，可用于后处理
      return { ok: true }
    }
  }
}

export default factory
