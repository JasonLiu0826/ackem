import { recordDispatchReject } from './dispatchSession'
import { recordExtensionAllow, recordExtensionReject } from '../policy/userProfile'

export function rejectDispatchExtension(
  sessionId: string,
  extensionId: string,
  options?: { dataRoot?: string; remember?: boolean }
): void {
  recordDispatchReject(sessionId, extensionId)
  if (options?.dataRoot) {
    recordExtensionReject(options.dataRoot, extensionId, { remember: options.remember })
  }
}

export function acceptDispatchExtension(
  dataRoot: string,
  extensionId: string,
  remember?: boolean
): void {
  recordExtensionAllow(dataRoot, extensionId, remember)
}
