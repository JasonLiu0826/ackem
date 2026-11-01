import { extractVideoFile, isVideoExtension } from '../../tools/files/documents/video.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DIR_CHILD_CAP,
  FILE_CHAR_CAP,
  type Attachment,
  type AttachmentKind,
  type AttachmentSource
} from './types.js'
import {
  extractDocumentFile,
  isDocumentExtension
} from '../../tools/files/documents/index.js'
import type { ModelMediaCaps } from '../../llm/capabilities.js'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024

export function normalizeAttachmentPath(cwd: string, relOrAbs: string): string {
  const abs = path.resolve(cwd, relOrAbs)
  const root = path.resolve(cwd)
  if (abs === root) return '.'
  if (abs.startsWith(root + path.sep)) {
    return path.relative(root, abs).split(path.sep).join('/')
  }
  return relOrAbs.replace(/\\/g, '/')
}

export function isInsideCwd(abs: string, cwd: string): boolean {
  const root = path.resolve(cwd)
  const target = path.resolve(abs)
  return target === root || target.startsWith(root + path.sep)
}

export async function loadPathAsAttachment(opts: {
  relOrAbs: string
  cwd: string
  source: AttachmentSource
  kind?: AttachmentKind
  charBudget: number
  /** Only explicit host attachments may be outside the workspace. */
  allowOutsideCwd?: boolean
  mediaCaps?: ModelMediaCaps
}): Promise<Attachment | null> {
  const abs = path.resolve(opts.cwd, opts.relOrAbs)
  if (!opts.allowOutsideCwd && !isInsideCwd(abs, opts.cwd)) return null
  const normPath = normalizeAttachmentPath(opts.cwd, opts.relOrAbs)

  try {
    const st = await fs.stat(abs)
    if (st.isDirectory()) {
      const names:string[]=[]
      const directory=await fs.opendir(abs)
      for await(const entry of directory){names.push(entry.name);if(names.length>=DIR_CHILD_CAP)break}
      const body = `${normPath}\n目录路径引用，仅列出最多 ${DIR_CHILD_CAP} 个直接子项；不递归读取，后续按任务需要使用工具查看。\n${names.join('\n')}`
      return {
        kind: 'dir',
        source: opts.source,
        path: normPath,
        label: path.basename(normPath.replace(/[\\/]+$/, '')) || normPath,
        body,
        omitted: false
      }
    }

    const ext = path.extname(abs).toLowerCase()
    const asImage = opts.kind === 'image' || IMAGE_EXT.has(ext)

    if (asImage) {
      if (opts.mediaCaps?.vision && st.size <= MAX_VISION_IMAGE_BYTES) {
        const buf = await fs.readFile(abs)
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.webp'
                ? 'image/webp'
                : 'image/jpeg'
        return {
          kind: 'image',
          source: opts.source,
          path: normPath,
          label: path.basename(normPath),
          body: `[Image attached at ${normPath}. Look at the attached image.]`,
          omitted: false,
          media: [
            {
              kind: 'image',
              mime,
              base64: buf.toString('base64'),
              label: path.basename(abs)
            }
          ]
        }
      }
      return {
        kind: 'image',
        source: opts.source,
        path: normPath,
        label: path.basename(normPath),
        body: `[Image attached at ${normPath}; current model is text-only — switch to a vision model (DeepSeek: deepseek-flash) or set settings.multimodal to "vision".]`,
        omitted: false
      }
    }

    if (isVideoExtension(ext)) {
      const result=await extractVideoFile(abs,!!opts.mediaCaps?.vision)
      return {kind:'file',source:opts.source,path:normPath,label:path.basename(abs),body:result.output,omitted:!result.ok,media:result.media}
    }
    if (isDocumentExtension(ext)) {
      const extracted = await extractDocumentFile(abs, {}, opts.mediaCaps)
      const raw = extracted.ok ? extracted.output : extracted.output
      const omitted = !extracted.ok || raw.length > FILE_CHAR_CAP || raw.length > opts.charBudget
      const body = omitted
        ? `Document attached (${normPath}); ${extracted.ok ? 'too large to inline — ' : ''}use read_file (PDF: pages="1-5") on ${normPath}`
        : raw
      return {
        kind: 'file',
        source: opts.source,
        path: normPath,
        label: path.basename(normPath),
        body,
        omitted,
        media: extracted.media
      }
    }

    if(st.size>2*1024*1024)return {kind:'file',source:opts.source,path:normPath,label:path.basename(abs),body:`File attached (${st.size} bytes); use read_file or an appropriate tool to process ${normPath}`,omitted:true}
    const buffer=await fs.readFile(abs)
    const raw=buffer.toString('utf8')
    if(buffer.includes(0)||raw.includes('\uFFFD'))return {kind:'file',source:opts.source,path:normPath,label:path.basename(abs),body:`Binary file attached (${st.size} bytes): ${normPath}. Contents have not been parsed; do not infer contents from the filename.`,omitted:false}
    const omitted =
      raw.length > FILE_CHAR_CAP || raw.length > opts.charBudget
    const body = omitted
      ? `File too large to attach; use read_file on ${normPath}`
      : raw
    return {
      kind: 'file',
      source: opts.source,
      path: normPath,
      label: path.basename(normPath),
      body,
      omitted
    }
  } catch {
    return null
  }
}
