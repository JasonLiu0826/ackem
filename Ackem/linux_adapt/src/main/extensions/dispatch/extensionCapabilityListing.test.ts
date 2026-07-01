import { describe, expect, it } from 'vitest'
import type { DispatchCatalogEntry } from '../protocols'
import { buildDesktopAgentCatalogSection } from '../../../shared/desktopAgentCapabilityHint'
import {
  buildExtensionCatalogListingBlock,
  buildPlatformFeaturesSection,
  isExtensionCapabilityListingQuery
} from './extensionCapabilityListing'

describe('isExtensionCapabilityListingQuery', () => {
  it('detects capability listing questions', () => {
    expect(isExtensionCapabilityListingQuery('你会干什么')).toBe(true)
    expect(isExtensionCapabilityListingQuery('你有什么功能')).toBe(true)
    expect(isExtensionCapabilityListingQuery('你都有什么功能')).toBe(true)
    expect(isExtensionCapabilityListingQuery('Ackem 能帮我做什么')).toBe(true)
    expect(isExtensionCapabilityListingQuery('你能做什么')).toBe(true)
    expect(isExtensionCapabilityListingQuery('介绍一下你的功能')).toBe(true)
    expect(isExtensionCapabilityListingQuery('有哪些插件')).toBe(true)
  })

  it('ignores relationship or emotional questions', () => {
    expect(isExtensionCapabilityListingQuery('你会想我吗')).toBe(false)
    expect(isExtensionCapabilityListingQuery('你会离开我吗')).toBe(false)
    expect(isExtensionCapabilityListingQuery('你喜欢我吗')).toBe(false)
  })

  it('ignores concrete task requests', () => {
    expect(isExtensionCapabilityListingQuery('帮我做一个番茄钟')).toBe(false)
    expect(isExtensionCapabilityListingQuery('明天天气怎么样')).toBe(false)
  })
})

describe('buildPlatformFeaturesSection', () => {
  it('marks desktop agent as not open in grayscale preview', () => {
    const section = buildPlatformFeaturesSection({})
    expect(section).toContain('【暂未开放】电脑助手')
  })
})

describe('buildExtensionCatalogListingBlock', () => {
  const sample: DispatchCatalogEntry[] = [
    {
      id: 'ackem/web-search@1.0.0',
      name: '网页搜索',
      category: 'skill',
      status: 'active',
      dispatch: {
        mode: 'dispatched',
        summary: '搜索互联网获取最新信息',
        habits: [],
        scenarios: ['查新闻', '查资料'],
        keywords: ['搜索', '查一下'],
        slash: ['/搜索']
      }
    },
    {
      id: 'u/pomodoro@1.0.0',
      name: '番茄钟',
      category: 'skill',
      status: 'disabled',
      dispatch: {
        mode: 'manual',
        summary: '专注计时',
        habits: [],
        scenarios: ['专注'],
        keywords: ['番茄钟']
      }
    }
  ]

  it('separates usable and unavailable extensions', () => {
    const block = buildExtensionCatalogListingBlock(sample)
    expect(block).toContain('扩展能力清单')
    expect(block).toContain('【可用】网页搜索')
    expect(block).toContain('【不可用】番茄钟')
    expect(block).toContain('扩展库 · 当前可用（1）')
    expect(block).toContain('扩展库 · 暂不可用（1）')
    expect(block).toContain('【暂未开放】电脑助手')
  })

  it('includes desktop agent section when provided', () => {
    const section = buildDesktopAgentCatalogSection({
      desktopAgentEnabled: true,
      desktopAgentRiskAccepted: true,
      desktopAgentAllowAppControl: true
    })
    const block = buildExtensionCatalogListingBlock(sample, { desktopAgentSection: section })
    expect(block).toContain('电脑助手 · 本会话已开启')
  })
})
