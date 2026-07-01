// [extensions/plugins/companionSkin] — 解析当前应展示的伴侣交互形象皮肤

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow } from 'electron'
import type { CompanionSkinBinding, CompanionSkinManifest } from '../../../shared/companionSkin'
import { loadSettings, saveSettings } from '../../settings'
import type { PluginRegistry } from './registry'
import type { PluginInstance } from './types'

const BUILTIN_CANVAS: CompanionSkinBinding = {
  pluginId: '',
  pluginName: '默认几何形象',
  renderer: 'builtin-canvas',
  entry: ''
}

function bindingFromInstance(
  instance: PluginInstance,
  registry: PluginRegistry
): CompanionSkinBinding | null {
  const skin = instance.manifest.companionSkin as CompanionSkinManifest | undefined
  if (!skin?.renderer || !skin.entry) return null

  if (skin.renderer === 'html') {
    const abs = join(registry.getPluginDir(instance.manifest.id), skin.entry)
    if (!existsSync(abs)) return null
    return {
      pluginId: instance.manifest.id,
      pluginName: instance.manifest.name,
      renderer: 'html',
      entry: pathToFileURL(abs).href,
      statusLabels: skin.statusLabels,
      implementationStatus: instance.manifest.implementationStatus
    }
  }

  if (skin.renderer === 'react-builtin') {
    return {
      pluginId: instance.manifest.id,
      pluginName: instance.manifest.name,
      renderer: 'react-builtin',
      entry: skin.entry,
      statusLabels: skin.statusLabels,
      implementationStatus: instance.manifest.implementationStatus
    }
  }

  return null
}

/** 当前应渲染的伴侣形象（无有效皮肤插件时回退内置 Canvas） */
export function resolveActiveCompanionSkin(registry: PluginRegistry): CompanionSkinBinding {
  const settings = loadSettings()
  const activeId = settings.activeCompanionSkinPluginId
  if (!activeId) return BUILTIN_CANVAS

  const instance = registry.get(activeId)
  if (!instance || instance.status !== 'active') return BUILTIN_CANVAS

  const bound = bindingFromInstance(instance, registry)
  return bound ?? BUILTIN_CANVAS
}

/** 列出可被选为伴侣形象的 skin 插件（已安装且声明了 companionSkin） */
export function listCompanionSkinCandidates(registry: PluginRegistry): CompanionSkinBinding[] {
  const out: CompanionSkinBinding[] = [BUILTIN_CANVAS]
  for (const instance of registry.listInstalled()) {
    if (instance.manifest.pluginType !== 'skin') continue
    const bound = bindingFromInstance(instance, registry)
    if (bound) out.push(bound)
  }
  return out
}

export function notifyCompanionSkinChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('companionSkin:changed')
  }
}

export function syncCompanionSkinOnPluginActivate(pluginId: string, registry: PluginRegistry): void {
  const instance = registry.get(pluginId)
  if (!instance?.manifest.companionSkin) return
  saveSettings({ activeCompanionSkinPluginId: pluginId })
  notifyCompanionSkinChanged()
  if (pluginId.includes('desktop-float')) {
    void import('../../petWindow.js').then(({ showPetWindow }) => showPetWindow())
  }
}

export function syncCompanionSkinOnPluginDeactivate(pluginId: string): void {
  const settings = loadSettings()
  if (settings.activeCompanionSkinPluginId === pluginId) {
    saveSettings({ activeCompanionSkinPluginId: undefined })
    notifyCompanionSkinChanged()
  }
}

export function setActiveCompanionSkinPlugin(pluginId: string | undefined): void {
  saveSettings({ activeCompanionSkinPluginId: pluginId })
  notifyCompanionSkinChanged()
}
