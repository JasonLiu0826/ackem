// [qq] — 入站图片转 data URI（供多模态消息使用）
//
// OneBot 的 image 段地址形态很杂：http(s) 链接、base64://、本地 file://、裸路径。
// 统一收敛成 data URI 交给上层，模型那边只认 data:image/... 或 https 链接。

import { existsSync, readFileSync } from 'node:fs'
import { createLogger } from '../../logger'

const log = createLogger('qq-image')

/** 单张上限：base64 膨胀 1.37 倍，4MB 原图约 5.5MB 载荷，多数模型能吃下 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** 一轮最多带几张，避免把上下文挤爆 */
const MAX_IMAGES = 3

/** 靠魔数判类型，不信任扩展名（QQ 图片经常没后缀） */
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 6 && buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

function bufferToDataUri(buf: Buffer): string | null {
  if (buf.byteLength === 0) return null
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    log.warn('inbound image too large, skipped', { bytes: buf.byteLength })
    return null
  }
  const mime = sniffMime(buf)
  if (!mime) {
    log.warn('inbound image format unsupported, skipped', { bytes: buf.byteLength })
    return null
  }
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * 把一组图片引用解析成 data URI。
 * 解析失败的条目直接丢弃——宁可少一张图，也不要让整轮对话崩掉。
 */
export async function resolveInboundImages(refs: string[]): Promise<string[]> {
  const out: string[] = []
  const picked = refs.filter((r) => typeof r === 'string' && r.trim().length > 0).slice(0, MAX_IMAGES)

  for (const raw of picked) {
    const ref = raw.trim()
    try {
      if (ref.startsWith('data:image/')) {
        out.push(ref)
        continue
      }
      if (ref.startsWith('base64://')) {
        const uri = bufferToDataUri(Buffer.from(ref.slice('base64://'.length), 'base64'))
        if (uri) out.push(uri)
        continue
      }
      if (ref.startsWith('file://')) {
        const p = decodeURIComponent(ref.slice('file://'.length))
        if (existsSync(p)) {
          const uri = bufferToDataUri(readFileSync(p))
          if (uri) out.push(uri)
        }
        continue
      }
      if (ref.startsWith('/') && existsSync(ref)) {
        const uri = bufferToDataUri(readFileSync(ref))
        if (uri) out.push(uri)
        continue
      }
      if (/^https?:\/\//i.test(ref)) {
        const res = await fetch(ref)
        if (!res.ok) {
          log.warn('inbound image fetch failed', { status: res.status, url: ref.slice(0, 100) })
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const uri = bufferToDataUri(buf)
        if (uri) out.push(uri)
        continue
      }
      log.warn('inbound image ref unrecognized', { ref: ref.slice(0, 100) })
    } catch (e) {
      log.warn('inbound image resolve failed', { ref: ref.slice(0, 100), error: String(e) })
    }
  }

  if (out.length > 0) log.info('inbound images resolved', { count: out.length })
  return out
}
