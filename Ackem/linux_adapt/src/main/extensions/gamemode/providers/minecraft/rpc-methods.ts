/** Minecraft GameProvider 对外 RPC 方法名 */
export const MINECRAFT_RPC_METHODS = [
  'react',
  'parseLog',
  'getWsStatus',
  'syncEngineState',
  'botStart',
  'botStop',
  'botStatus',
  'botDebug',
  'logStart',
  'logStop',
  'logStatus'
] as const

export type MinecraftRpcMethod = (typeof MINECRAFT_RPC_METHODS)[number]
