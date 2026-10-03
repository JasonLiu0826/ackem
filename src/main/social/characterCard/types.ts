/**
 * types.ts — 角色卡核心类型
 * 定义 AgentCard 与创建/编辑输入契约（对齐说明书 §12）
 * 供 parse / validate / import / update / IPC 共享
 */

export type AgentCard = {
  $schema: 'ackem-agent-card/1.0'
  identity: {
    name: string
    gender: 'female' | 'male'
    apparentAge?: string
    species?: string
    world?: string
    role: string
    tagline?: string
    appearance?: string
    voiceSample?: string
  }
  personality: {
    presetId: string
    customTISOR: null
    coreConflict?: string
    speechQuirks?: string[]
    speakingStyle?: string
    prohibitions?: string[]
  }
  social3D: { se: number; sp: number; so: number }
  relationship?: {
    initialStage?: 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
    initialTrust?: number
    relationshipDescription?: string
  }
  seedMemories?: { domain: string; content: string }[]
  source: {
    format: 'local-form' | 'local-md' | 'local-txt' | 'ackem-card.zip'
    originalManifest?: unknown
    importedAt: string
  }
  avatar?: {
    file: string
    sourceFile?: string
    crop?: { x: number; y: number; width: number; height: number }
    updatedAt?: string
  }
}

export type CreateAgentInput = {
  format: 'form' | 'md' | 'txt'
  displayName: string
  gender: 'female' | 'male'
  roleOrTagline: string
  personaMarkdown?: string
  formExtras?: {
    speakingStyle?: string
    coreConflict?: string
    speechQuirks?: string[]
    prohibitions?: string[]
    world?: string
    appearance?: string
    voiceSample?: string
  }
  presetId: string
  presetMatchConfirmed: true
  social3D?: { se: number; sp: number; so: number }
  seedMemories?: { domain: string; content: string }[]
  relationship?: AgentCard['relationship']
  avatarUpload?: {
    croppedBytes: Uint8Array
    mime: 'image/webp' | 'image/png'
    sourceBytes?: Uint8Array
    sourceMime?: string
    crop?: { x: number; y: number; width: number; height: number }
  }
}

export type UpdateAgentInput = {
  agentId: string
  identity?: Partial<AgentCard['identity']>
  personality?: Partial<Omit<AgentCard['personality'], 'customTISOR'>> & {
    presetId?: string
    presetMatchConfirmed?: boolean
  }
  social3D?: { se: number; sp: number; so: number }
  personaMarkdown?: string
  seedMemories?: { domain: string; content: string }[]
}

export type ParsedIntermediate = {
  displayName: string
  gender: 'female' | 'male'
  roleOrTagline: string
  personaMarkdown: string
  formExtras?: CreateAgentInput['formExtras']
  sourceFormat: 'local-form' | 'local-md' | 'local-txt'
}

export type CharacterCardErrorCode =
  | 'PLATFORM_ZIP_NOT_OPEN'
  | 'VALIDATION_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PRESET_MISMATCH'
  | 'PRESET_NOT_CONFIRMED'
  | 'ADULT_NOT_CONFIRMED'

export class CharacterCardError extends Error {
  constructor(
    public readonly code: CharacterCardErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'CharacterCardError'
  }
}
