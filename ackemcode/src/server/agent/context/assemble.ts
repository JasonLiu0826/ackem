import { loadProjectInstructions, type InstructionSource } from './projectInstructions.js'
import { getGitStatusBlock } from './gitStatus.js'
import {
  buildMemorySystemPromptSection,
  isAutoMemoryEnabled,
  loadMemoryPrompt,
  wrapMemoryIndexForContext
} from '../../memdir/index.js'

export type AssembledContext = {
  /** CLAUDE.md / AGENTS.md block, or null */
  projectInstructions: string | null
  instructionSources: InstructionSource[]
  /** Git snapshot, or null if not a repo / git failed */
  gitStatus: string | null
  /**
   * Persona / Ackem companion voice slot (M21).
   * Empty string = no injection. Host may pass non-empty later.
   */
  personaSlot: string
  /** M22: auto-memory system section (instructions), or empty */
  memoryPromptSection: string
  /** M22: truncated MEMORY.md wrapped for context, or empty */
  memoryIndexBlock: string
  memoryDir: string | null
}

export type AssembleContextOpts = {
  cwd: string
  /** Skip git (tests / bare mode) */
  includeGit?: boolean
  /** M21: companion persona text; default empty */
  personaSlot?: string
  /** M22: settings.autoMemoryEnabled */
  autoMemoryEnabled?: boolean
  /** Skip loading memdir (unit tests) */
  includeMemory?: boolean
  /** GM-HOOK: fire InstructionsLoaded for each loaded file */
  hooks?: import('../../hooks/types.js').HooksConfig
  disableAllHooks?: boolean
  sessionId?: string
}

/**
 * Assemble M04 system context pieces (not the full system prompt).
 */
export async function assembleContext(
  opts: AssembleContextOpts
): Promise<AssembledContext> {
  const includeGit = opts.includeGit !== false
  const includeMemory = opts.includeMemory !== false
  const memoryOn = isAutoMemoryEnabled({
    autoMemoryEnabled: opts.autoMemoryEnabled
  })

  const [instructions, gitStatus, mem] = await Promise.all([
    loadProjectInstructions(opts.cwd),
    includeGit ? getGitStatusBlock(opts.cwd) : Promise.resolve(null),
    includeMemory && memoryOn
      ? loadMemoryPrompt(opts.cwd)
      : Promise.resolve(null)
  ])

  if (opts.hooks && instructions.sources.length) {
    const { emitInstructionsLoadedHooks } = await import(
      '../../hooks/instructionsLoaded.js'
    )
    void emitInstructionsLoadedHooks({
      sources: instructions.sources,
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      config: opts.hooks,
      disabled: opts.disableAllHooks,
      loadReason: 'session_start'
    })
  }

  let memoryPromptSection = ''
  let memoryIndexBlock = ''
  let memoryDir: string | null = null
  if (mem) {
    memoryDir = mem.memoryDir
    memoryPromptSection = buildMemorySystemPromptSection({
      memoryDir: mem.memoryDir,
      entrypointPath: mem.entrypointPath,
      hasIndexContent: Boolean(mem.content.trim())
    })
    memoryIndexBlock = wrapMemoryIndexForContext(mem.content)
  }

  return {
    projectInstructions: instructions.block,
    instructionSources: instructions.sources,
    gitStatus,
    personaSlot: (opts.personaSlot ?? '').trim(),
    memoryPromptSection,
    memoryIndexBlock,
    memoryDir
  }
}

/**
 * Format optional sections.
 * Order: Persona → Grounding (overrides persona) → project/git → memory index.
 */
export function formatContextSections(ctx: AssembledContext): string {
  const parts: string[] = []

  if (ctx.personaSlot) {
    parts.push(`## Persona (host)\n\n${ctx.personaSlot}`)
    parts.push(
      [
        '## Grounding (overrides persona)',
        '',
        'These rules always win over persona tone:',
        '- Never invent file contents, tool results, or “done” without tool evidence.',
        '- Prefer tools over guessing. Paths and commands must match tool output.',
        '- Do not let companion voice override safety, permissions, or accuracy.'
      ].join('\n')
    )
  }

  if (ctx.projectInstructions) {
    parts.push(`## Project instructions\n\n${ctx.projectInstructions}`)
  }

  if (ctx.gitStatus) {
    parts.push(`## Git status\n\n${ctx.gitStatus}`)
  }

  if (ctx.memoryPromptSection) {
    parts.push(ctx.memoryPromptSection.trim())
  }

  if (ctx.memoryIndexBlock) {
    parts.push(ctx.memoryIndexBlock)
  }

  return parts.length ? '\n\n' + parts.join('\n\n') : ''
}
