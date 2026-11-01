// Ackem Code 派工权限单测：
// 权限优先级（env > 设置页 > 默认）、远程渠道必须显式开启。
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => process.cwd() } }))

import { isPermissionMode, remoteChannelsAllowed, resolvePermissionMode } from './dispatch'

describe('ackemcode dispatch 权限', () => {
  afterEach(() => {
    delete process.env.ACKEMCODE_PERMISSION_MODE
  })

  it('环境变量优先于设置页', () => {
    process.env.ACKEMCODE_PERMISSION_MODE = 'default'
    expect(resolvePermissionMode({ ackemcodePermissionMode: 'bypassPermissions' })).toBe('default')
  })

  it('环境变量非法时回落到设置页', () => {
    process.env.ACKEMCODE_PERMISSION_MODE = 'bogus'
    expect(resolvePermissionMode({ ackemcodePermissionMode: 'plan' })).toBe('plan')
  })

  it('都没配置时默认全自动（保持原有设计）', () => {
    expect(resolvePermissionMode({})).toBe('bypassPermissions')
  })

  it('远程渠道必须显式开启电脑助手远程开关', () => {
    expect(remoteChannelsAllowed('ui', {})).toBe(true)
    expect(remoteChannelsAllowed('qq', {})).toBe(false)
    expect(remoteChannelsAllowed('weixin', {})).toBe(false)
    expect(remoteChannelsAllowed('qq', { desktopAgentRemoteChannelsEnabled: true })).toBe(true)
  })

  it('isPermissionMode 只接受已知模式', () => {
    expect(isPermissionMode('dontAsk')).toBe(true)
    expect(isPermissionMode('bypassPermissions')).toBe(true)
    expect(isPermissionMode('nope')).toBe(false)
    expect(isPermissionMode(undefined)).toBe(false)
  })
})
