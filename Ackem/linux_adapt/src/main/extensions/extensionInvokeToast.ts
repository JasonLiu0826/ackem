import { broadcastToRenderers } from '../rendererBroadcast'

export function notifyExtensionInvoke(extensionId: string, extensionName: string): void {
  const name = extensionName.trim() || extensionId
  broadcastToRenderers('ui:extensionToast', {
    text: `${name} 已触发`,
    extensionId
  })
}
