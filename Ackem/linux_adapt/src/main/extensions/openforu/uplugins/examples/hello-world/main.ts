// [openforu/uplugins/examples/hello-world] 示例 Plugin 入口
//
// 演示：
//   1. 使用 PluginSandboxApi 与引擎交互
//   2. 在 onEngineUpdate 中检测情绪变化
//   3. 通过 emitEvent 产出上下文注入
//   4. 使用 api.log 记录日志
//   5. 使用 api.writeOwnFile 持久化数据

import type { ExtensionLifecycleHooks, EngineSnapshot } from '../../../../../../protocols'
import type { PluginSandboxApi } from '../../../../../../plugins/types'
import { HelloWorldPlugin } from './src/index'

const factory = (api: PluginSandboxApi): ExtensionLifecycleHooks => {
  const plugin = new HelloWorldPlugin(api)
  return plugin.getHooks()
}

export default factory
