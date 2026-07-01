import type { ExtensionsCoordinator } from '../../coordinator'
import { openExtensionSurface } from '../../../extensionSurfaceHost'
import { readUpluginSurfaceConfig, resolveSurfaceHtml } from './surfaceMeta'
import { registerSurfaceWidgetSession } from './surfaceWidgetRuntime'

export type OpenSurfaceResult = {
  ok: boolean
  extensionId: string
  message: string
}

/** JE-3d：打开 uplugin Surface 窗口 */
export function executeOpenExtensionSurface(
  coordinator: ExtensionsCoordinator,
  extensionId: string
): OpenSurfaceResult {
  const dataRoot = coordinator.getDataRoot()
  const surface = readUpluginSurfaceConfig(dataRoot, extensionId)
  if (!surface) {
    return {
      ok: false,
      extensionId,
      message: `❌ 扩展 \`${extensionId}\` 未声明 Surface（plugin.meta.json · surface.enabled）`
    }
  }

  const uplugin = coordinator.openforu.getUplugin(extensionId)
  const title = surface.title?.trim() || uplugin?.manifest.name || extensionId
  const html = resolveSurfaceHtml(dataRoot, extensionId, title, surface)

  if (surface.widget) {
    registerSurfaceWidgetSession(extensionId, surface.widget, surface.widgetConfig ?? {})
  }

  const opened = openExtensionSurface({ extensionId, title, html })
  if (!opened.ok) {
    return {
      ok: false,
      extensionId,
      message: `❌ 无法打开 Surface：${opened.error ?? '未知错误'}`
    }
  }

  return {
    ok: true,
    extensionId,
    message: `✅ **已打开**「${title}」独立窗口（Surface · \`${extensionId}\`）`
  }
}
