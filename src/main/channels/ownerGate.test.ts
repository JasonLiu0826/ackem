// 机主绑定安全模型单测：
// 首个私聊者只进入待确认，桌面确认前一律不放行（防抢绑）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { store } = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))

vi.mock('../settings', () => ({
  loadSettings: () => ({ ...store }),
  saveSettings: (patch: Record<string, unknown>) => {
    Object.assign(store, patch)
    return { ...store }
  }
}))

import {
  confirmChannelOwner,
  dismissPendingChannelOwner,
  getChannelOwner,
  getPendingChannelOwner,
  isChannelOwner,
  resetChannelOwner
} from './ownerGate'

describe('ownerGate 机主绑定', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
  })

  it('首个私聊者不会自动成为机主，只进入待确认', () => {
    expect(isChannelOwner('qq', '10001')).toBe(false)
    expect(getChannelOwner('qq')).toBe('')
    expect(getPendingChannelOwner('qq')).toBe('10001')
  })

  it('待确认期间重复消息不会放行', () => {
    expect(isChannelOwner('qq', '10001')).toBe(false)
    expect(isChannelOwner('qq', '10001')).toBe(false)
    expect(getPendingChannelOwner('qq')).toBe('10001')
    expect(getChannelOwner('qq')).toBe('')
  })

  it('桌面确认后才授予机主权限并清空候选', () => {
    isChannelOwner('qq', '10001')
    expect(confirmChannelOwner('qq')).toBe(true)
    expect(getChannelOwner('qq')).toBe('10001')
    expect(getPendingChannelOwner('qq')).toBe('')
    expect(isChannelOwner('qq', '10001')).toBe(true)
  })

  it('非机主消息被拦截', () => {
    isChannelOwner('qq', '10001')
    confirmChannelOwner('qq')
    expect(isChannelOwner('qq', '20002')).toBe(false)
  })

  it('拒绝后保持未绑定，且不会自动放行', () => {
    isChannelOwner('qq', '10001')
    dismissPendingChannelOwner('qq')
    expect(getPendingChannelOwner('qq')).toBe('')
    expect(getChannelOwner('qq')).toBe('')
    expect(isChannelOwner('qq', '10001')).toBe(false)
  })

  it('解绑后重新进入待确认', () => {
    isChannelOwner('qq', '10001')
    confirmChannelOwner('qq')
    resetChannelOwner('qq')
    expect(getChannelOwner('qq')).toBe('')
    expect(isChannelOwner('qq', '10001')).toBe(false)
    expect(getPendingChannelOwner('qq')).toBe('10001')
  })

  it('微信与 QQ 的绑定互不影响', () => {
    isChannelOwner('weixin', 'wx_1')
    expect(getPendingChannelOwner('weixin')).toBe('wx_1')
    expect(getPendingChannelOwner('qq')).toBe('')
  })

  it('空 peerId 直接拒绝', () => {
    expect(isChannelOwner('qq', '   ')).toBe(false)
    expect(getPendingChannelOwner('qq')).toBe('')
  })
})
