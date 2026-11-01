// afterPack 运行时落点单测：macOS 走 .app/Contents/Resources，Windows 走 resources/。
// 以前写死 macOS 布局，Windows 打包时找不到编码运行时。
import { describe, expect, it } from 'vitest'
import { resolveAckemcodeDest } from './after-pack-ackemcode.cjs'

function ctx(platform: string, appOutDir: string): Parameters<typeof resolveAckemcodeDest>[0] {
  return {
    electronPlatformName: platform,
    appOutDir,
    packager: { appInfo: { productFilename: 'Ackem' } }
  } as Parameters<typeof resolveAckemcodeDest>[0]
}

describe('afterPack 运行时落点', () => {
  it('macOS 使用 <Product>.app/Contents/Resources/ackemcode', () => {
    const dest = resolveAckemcodeDest(ctx('darwin', '/tmp/out/mac-arm64'))
    expect(dest).toBe('/tmp/out/mac-arm64/Ackem.app/Contents/Resources/ackemcode')
  })

  it('Windows 使用 <appOutDir>/resources/ackemcode', () => {
    const dest = resolveAckemcodeDest(ctx('win32', 'C:/out/win-unpacked'))
    expect(dest).toBe('C:/out/win-unpacked/resources/ackemcode')
  })

  it('Linux 同样使用 resources 目录', () => {
    const dest = resolveAckemcodeDest(ctx('linux', '/tmp/out/linux-unpacked'))
    expect(dest.endsWith('/resources/ackemcode')).toBe(true)
    expect(dest).not.toContain('.app')
  })
})
