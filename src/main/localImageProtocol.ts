// [localImageProtocol] 鈥?娉ㄥ唽鑷畾涔夊崗璁紝璁╂覆鏌撹繘绋嬪畨鍏ㄥ姞杞芥湰鍦板浘鐗?// 瑙ｅ喅 Electron contextIsolation 涓?file:// 琚樆姝㈢殑闂

import { protocol } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { extname } from 'node:path'
import { createLogger } from './logger'

const log = createLogger('local-image-protocol')

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp'
}

/**
 * 娉ㄥ唽 ackem-img:// 鍗忚
 * 鐢ㄦ硶锛氬湪娓叉煋杩涚▼涓?<img src="ackem-img://agnes-images/filename.png" />
 * 瀹夊叏闄愬埗锛氫粎鍏佽鍔犺浇 dataRoot 涓嬬殑 agnes-images 鍜?companion 鐩綍
 */
export function registerLocalImageProtocol(dataRoot: string): void {
  protocol.handle('ackem-img', (request) => {
    try {
      // URL 鏍煎紡锛歜ritney-img://agnes-images/filename.png
      const url = request.url
      const pathPart = url.replace('ackem-img://', '')

      // 瀹夊叏鏍￠獙锛氬彧鍏佽鐗瑰畾瀛愮洰褰?      const allowedDirs = ['agnes-images', 'companion']
      const dirName = pathPart.split('/')[0]
      if (!allowedDirs.includes(dirName)) {
        log.warn('blocked access to unauthorized directory', { path: pathPart })
        return new Response('Forbidden', { status: 403 })
      }

      const fullPath = `${dataRoot}/${pathPart.replace(/\\/g, '/')}`

      if (!existsSync(fullPath)) {
        return new Response('Not Found', { status: 404 })
      }

      const buffer = readFileSync(fullPath)
      const ext = extname(fullPath).toLowerCase()
      const mimeType = MIME_MAP[ext] || 'application/octet-stream'

      return new Response(buffer, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'max-age=86400'
        }
      })
    } catch (e) {
      log.error('protocol handler error', e)
      return new Response('Internal Error', { status: 500 })
    }
  })

  log.info('registered ackem-img:// protocol', { dataRoot })
}
