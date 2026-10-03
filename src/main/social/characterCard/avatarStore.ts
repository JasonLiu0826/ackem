/**
 * avatarStore.ts — 头像落盘与清除
 * 写入 card/avatar.webp（及可选原图）；同步 agents.avatar_url
 */

import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { updateAgent as updateAgentRow } from '../../db/repos/agentsRepo'
import { agentCardDir } from '../agents/agentPaths'
import type { AgentCard, CreateAgentInput } from './types'
import { loadAgentCard, saveAgentCard } from './agentCardStore'

const AVATAR_FILE = 'avatar.webp'
const AVATAR_REL = `card/${AVATAR_FILE}`

type AvatarUpload = NonNullable<CreateAgentInput['avatarUpload']>

function extFromMime(mime: string): string {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/webp') return '.webp'
  return extname(mime) || '.bin'
}

export function writeAgentAvatar(
  dataRoot: string,
  agentId: string,
  upload: AvatarUpload
): void {
  const dir = agentCardDir(dataRoot, agentId)
  const outName = upload.mime === 'image/png' ? 'avatar.png' : AVATAR_FILE
  const outPath = join(dir, outName)
  writeFileSync(outPath, Buffer.from(upload.croppedBytes))

  if (upload.sourceBytes && upload.sourceMime) {
    const srcExt = extFromMime(upload.sourceMime)
    writeFileSync(join(dir, `avatar.source${srcExt}`), Buffer.from(upload.sourceBytes))
  }

  const relPath = `card/${outName}`
  const now = new Date().toISOString()

  let card: AgentCard | null = null
  try {
    card = loadAgentCard(dataRoot, agentId)
  } catch {
    card = null
  }

  if (card) {
    card.avatar = {
      file: relPath,
      sourceFile: upload.sourceBytes ? `card/avatar.source${extFromMime(upload.sourceMime ?? '')}` : undefined,
      crop: upload.crop,
      updatedAt: now,
    }
    saveAgentCard(dataRoot, agentId, card)
  }

  updateAgentRow(dataRoot, agentId, { avatar_url: relPath, updated_at: now })
}

export function clearAgentAvatar(dataRoot: string, agentId: string): void {
  const dir = agentCardDir(dataRoot, agentId)
  for (const name of ['avatar.webp', 'avatar.png']) {
    const p = join(dir, name)
    if (existsSync(p)) unlinkSync(p)
  }

  try {
    const card = loadAgentCard(dataRoot, agentId)
    delete card.avatar
    saveAgentCard(dataRoot, agentId, card)
  } catch {
    /* 卡尚未落盘时仅清 DB */
  }

  updateAgentRow(dataRoot, agentId, {
    avatar_url: null,
    updated_at: new Date().toISOString(),
  })
}
