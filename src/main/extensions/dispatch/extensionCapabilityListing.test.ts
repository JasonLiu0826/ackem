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
    expect(isExtensionCapabilityListingQuery('浣犱細骞蹭粈涔?)).toBe(true)
    expect(isExtensionCapabilityListingQuery('浣犳湁浠€涔堝姛鑳?)).toBe(true)
    expect(isExtensionCapabilityListingQuery('浣犻兘鏈変粈涔堝姛鑳?)).toBe(true)
    expect(isExtensionCapabilityListingQuery('Ackem 鑳藉府鎴戝仛浠€涔?)).toBe(true)
    expect(isExtensionCapabilityListingQuery('浣犺兘鍋氫粈涔?)).toBe(true)
    expect(isExtensionCapabilityListingQuery('浠嬬粛涓€涓嬩綘鐨勫姛鑳?)).toBe(true)
    expect(isExtensionCapabilityListingQuery('鏈夊摢浜涙彃浠?)).toBe(true)
  })

  it('ignores relationship or emotional questions', () => {
    expect(isExtensionCapabilityListingQuery('浣犱細鎯虫垜鍚?)).toBe(false)
    expect(isExtensionCapabilityListingQuery('浣犱細绂诲紑鎴戝悧')).toBe(false)
    expect(isExtensionCapabilityListingQuery('浣犲枩娆㈡垜鍚?)).toBe(false)
  })

  it('ignores concrete task requests', () => {
    expect(isExtensionCapabilityListingQuery('甯垜鍋氫竴涓暘鑼勯挓')).toBe(false)
    expect(isExtensionCapabilityListingQuery('鏄庡ぉ澶╂皵鎬庝箞鏍?)).toBe(false)
  })
})

describe('buildPlatformFeaturesSection', () => {
  it('marks desktop agent as not open in grayscale preview', () => {
    const section = buildPlatformFeaturesSection({})
    expect(section).toContain('銆愭殏鏈紑鏀俱€戠數鑴戝姪鎵?)
  })
})

describe('buildExtensionCatalogListingBlock', () => {
  const sample: DispatchCatalogEntry[] = [
    {
      id: 'Ackem/web-search@1.0.0',
      name: '缃戦〉鎼滅储',
      category: 'skill',
      status: 'active',
      dispatch: {
        mode: 'dispatched',
        summary: '鎼滅储浜掕仈缃戣幏鍙栨渶鏂颁俊鎭?,
        habits: [],
        scenarios: ['鏌ユ柊闂?, '鏌ヨ祫鏂?],
        keywords: ['鎼滅储', '鏌ヤ竴涓?],
        slash: ['/鎼滅储']
      }
    },
    {
      id: 'u/pomodoro@1.0.0',
      name: '鐣寗閽?,
      category: 'skill',
      status: 'disabled',
      dispatch: {
        mode: 'manual',
        summary: '涓撴敞璁℃椂',
        habits: [],
        scenarios: ['涓撴敞'],
        keywords: ['鐣寗閽?]
      }
    }
  ]

  it('separates usable and unavailable extensions', () => {
    const block = buildExtensionCatalogListingBlock(sample)
    expect(block).toContain('鎵╁睍鑳藉姏娓呭崟')
    expect(block).toContain('銆愬彲鐢ㄣ€戠綉椤垫悳绱?)
    expect(block).toContain('銆愪笉鍙敤銆戠暘鑼勯挓')
    expect(block).toContain('鎵╁睍搴?路 褰撳墠鍙敤锛?锛?)
    expect(block).toContain('鎵╁睍搴?路 鏆備笉鍙敤锛?锛?)
    expect(block).toContain('銆愭殏鏈紑鏀俱€戠數鑴戝姪鎵?)
  })

  it('includes desktop agent section when provided', () => {
    const section = buildDesktopAgentCatalogSection({
      desktopAgentEnabled: true,
      desktopAgentRiskAccepted: true,
      desktopAgentAllowAppControl: true
    })
    const block = buildExtensionCatalogListingBlock(sample, { desktopAgentSection: section })
    expect(block).toContain('鐢佃剳鍔╂墜 路 鏈細璇濆凡寮€鍚?)
  })
})
