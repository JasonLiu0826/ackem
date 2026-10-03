/**
 * agentCardStore.ts — 磁盘读写 card/
 * 权威目录：{dataRoot}/agents/{agentId}/card/
 * 读写 agentCard.json 与 persona.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentCardDir } from '../agents/agentPaths'
import type { AgentCard } from './types'
import { CharacterCardError } from './types'

const CARD_FILE = 'agentCard.json'
const PERSONA_FILE = 'persona.md'

function ensureCardDir(dataRoot: string, agentId: string): string {
  const dir = agentCardDir(dataRoot, agentId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function loadAgentCard(dataRoot: string, agentId: string): AgentCard {
  const path = join(agentCardDir(dataRoot, agentId), CARD_FILE)
  if (!existsSync(path)) {
    throw new CharacterCardError('NOT_FOUND', `角色卡不存在：${agentId}`)
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as AgentCard
    if (raw.personality) raw.personality.customTISOR = null
    return raw
  } catch {
    throw new CharacterCardError('VALIDATION_FAILED', `agentCard.json 解析失败：${agentId}`)
  }
}

export function saveAgentCard(dataRoot: string, agentId: string, card: AgentCard): void {
  const dir = ensureCardDir(dataRoot, agentId)
  card.personality.customTISOR = null
  writeFileSync(join(dir, CARD_FILE), JSON.stringify(card, null, 2), 'utf-8')
}

export function loadPersonaMarkdown(dataRoot: string, agentId: string): string {
  const path = join(agentCardDir(dataRoot, agentId), PERSONA_FILE)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8')
}

export function savePersonaMarkdown(dataRoot: string, agentId: string, markdown: string): void {
  const dir = ensureCardDir(dataRoot, agentId)
  writeFileSync(join(dir, PERSONA_FILE), markdown, 'utf-8')
}

export function writeCardBundle(
  dataRoot: string,
  agentId: string,
  card: AgentCard,
  personaMarkdown: string
): void {
  saveAgentCard(dataRoot, agentId, card)
  savePersonaMarkdown(dataRoot, agentId, personaMarkdown)
}

export function cardExists(dataRoot: string, agentId: string): boolean {
  return existsSync(join(agentCardDir(dataRoot, agentId), CARD_FILE))
}
