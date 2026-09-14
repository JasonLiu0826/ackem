/**
 * Memory-extraction mini-agent — Claude Code createAutoMemCanUseTool +
 * runForkedAgent (maxTurns 5) spirit. Writes only under memdir.
 */
import path from 'node:path'
import type { ChatMessage, EffortLevel, ToolDefinition } from '../../shared/types.js'
import { chatCompletion } from '../agent/llm.js'
import { flattenMessageContent } from '../../shared/messageContent.js'
import {
  TOOL_DEFINITIONS,
  executeTool,
  createReadFileState,
  type ToolContext
} from '../tools/index.js'
import { expandPath } from '../tools/files/pathUtils.js'
import { InteractionBroker } from '../agent/interactions.js'
import { PermissionBroker } from '../agent/permissions.js'
import { isPathInside, ENTRYPOINT_NAME } from './paths.js'

const EXTRACT_TOOLS = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  'write_file',
  'search_replace'
])

export const EXTRACT_AGENT_MAX_TURNS = 5

export type ExtractAgentResult = {
  ok: boolean
  turns: number
  writtenPaths: string[]
  report: string
  error?: string
}

function toolDefs(): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((t) => EXTRACT_TOOLS.has(t.function.name))
}

function resolveToolPath(
  cwd: string,
  input: Record<string, unknown>
): string | undefined {
  const raw = String(input.path ?? input.file_path ?? '')
  if (!raw) return undefined
  try {
    return expandPath(cwd, raw)
  } catch {
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, raw)
  }
}

function gateTool(
  name: string,
  input: Record<string, unknown>,
  cwd: string,
  memoryDir: string
): string | null {
  if (name === 'read_file' || name === 'glob' || name === 'grep' || name === 'list_dir') {
    return null
  }
  if (name === 'write_file' || name === 'search_replace') {
    const abs = resolveToolPath(cwd, input)
    if (!abs) return 'path is required for memory writes'
    if (!isPathInside(abs, memoryDir)) {
      return `Only write_file/search_replace inside the memory directory are allowed: ${memoryDir}`
    }
    return null
  }
  return `Tool ${name} is not permitted in memory extraction`
}

/**
 * Run a short tool-using agent that may update topic files + MEMORY.md under memdir.
 */
export async function runMemoryExtractAgent(opts: {
  cwd: string
  memoryDir: string
  userPrompt: string
  llm: {
    apiBaseUrl: string
    apiKey: string
    model: string
    effort: EffortLevel
  }
  signal?: AbortSignal
  maxTurns?: number
}): Promise<ExtractAgentResult> {
  const maxTurns = opts.maxTurns ?? EXTRACT_AGENT_MAX_TURNS
  const tools = toolDefs()
  const readFileState = createReadFileState()
  const writtenPaths: string[] = []

  const system = [
    'You are the memory extraction subagent for AckemCode.',
    `Memory directory (ONLY place you may write): ${opts.memoryDir}`,
    `Project cwd (read-only exploration): ${opts.cwd}`,
    '',
    'Allowed tools: read_file, grep, glob, list_dir, write_file, search_replace.',
    'write_file / search_replace ONLY under the memory directory.',
    'Do not investigate or verify project code — only use the conversation content provided.',
    'Efficient strategy: turn 1 read any topic files you might update; turn 2 write/edit in parallel.',
    `Keep MEMORY.md as an index (one-line links, no frontmatter). Topic files use frontmatter.`,
    'If nothing durable to save, respond with text and no tool calls.',
    `Hard limit: ${maxTurns} turns.`
  ].join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: opts.userPrompt }
  ]

  const interactions = new InteractionBroker()
  const permissions = new PermissionBroker()
  // Auto-allow memdir writes inside this sandbox (gateTool already restricts paths)
  permissions.rememberSession('write_file')
  permissions.rememberSession('search_replace')

  const toolCtx = (): ToolContext => ({
    cwd: opts.cwd,
    setCwd: () => {},
    getWorktree: () => null,
    setWorktree: () => {},
    llm: opts.llm,
    multimodal: 'off',
    signal: opts.signal,
    getMode: () => 'acceptEdits',
    setMode: () => {},
    interactions,
    permissions,
    permissionRules: { allow: [], deny: [], ask: [] },
    readFileState,
    memoryDir: opts.memoryDir,
    emit: () => {},
    getTodos: () => [],
    setTodos: () => {}
  })

  let turns = 0
  let lastText = ''

  try {
    while (turns < maxTurns) {
      if (opts.signal?.aborted) throw new Error('aborted')
      turns += 1

      const { message: assistant } = await chatCompletion({
        apiBaseUrl: opts.llm.apiBaseUrl,
        apiKey: opts.llm.apiKey,
        model: opts.llm.model,
        effort: 'low',
        messages,
        tools,
        signal: opts.signal
      })
      messages.push(assistant)
      const text = flattenMessageContent(assistant.content).trim()
      const calls = assistant.tool_calls ?? []

      if (!calls.length) {
        lastText = text || '(no memory writes)'
        return { ok: true, turns, writtenPaths, report: lastText }
      }

      for (const call of calls) {
        if (opts.signal?.aborted) throw new Error('aborted')
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(call.function.arguments || '{}') as Record<
            string,
            unknown
          >
        } catch {
          /* empty */
        }
        const denied = gateTool(call.function.name, input, opts.cwd, opts.memoryDir)
        if (denied) {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: denied
          })
          continue
        }

        const result = await executeTool(
          call.function.name,
          call.function.arguments,
          toolCtx()
        )
        const out =
          result.output.length > 40_000
            ? result.output.slice(0, 40_000) + '\n…[truncated]'
            : result.output
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: out
        })

        if (
          result.ok &&
          (call.function.name === 'write_file' ||
            call.function.name === 'search_replace')
        ) {
          const abs = resolveToolPath(opts.cwd, input)
          if (abs && isPathInside(abs, opts.memoryDir)) {
            writtenPaths.push(abs)
          }
        }
      }
    }

    return {
      ok: false,
      turns,
      writtenPaths: [...new Set(writtenPaths)],
      report: lastText || `maxTurns ${maxTurns}`,
      error: 'max_turns'
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      turns,
      writtenPaths: [...new Set(writtenPaths)],
      report: msg,
      error: msg
    }
  } finally {
    /* ensure unique */
  }
}

export function topicFilesWritten(writtenPaths: string[]): string[] {
  return [...new Set(writtenPaths)].filter(
    (p) => path.basename(p) !== ENTRYPOINT_NAME
  )
}
