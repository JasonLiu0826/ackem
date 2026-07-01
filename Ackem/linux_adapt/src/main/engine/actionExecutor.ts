// [actionExecutor] — L5 工具执行引擎
// 职责：执行 LLM 工具调用，信任门控，结果格式化，记忆联动
// 引用：./search, ../fsops, ./types
//
// FIX-003: run_command 有 trustGate 阈值但 intentionally 不暴露给 LLM（toolsPayload 不含）。
// 桌面伴侣场景下 shell 执行风险过高；default 分支亦不会执行 run_command。

import { searchWeb, formatSearchResults } from '../extensions/plugins/builtin/knowledge-presentation/presentation/search'
import { readRelFile, appendOrOverwriteAllowed } from '../fsops'
import type { ToolResult, L1State, Emotion4D, EmotionState } from './types'

export interface ActionContext {
  dataRoot: string
  l1: L1State
  l2: EmotionState
}

function trustGate(toolName: string, trust: number): boolean {
  switch (toolName) {
    case 'web_search':    return trust >= 10
    case 'read_file':     return trust >= 20
    case 'append_memory': return trust >= 40
    case 'write_file':    return trust >= 40
    case 'run_command':   return trust >= 60
    default:              return true
  }
}

function toneWrap(l2: Emotion4D, neutralText: string): string {
  const { aff, aro } = l2
  if (aff >= 60) return neutralText.replace(/^/gm, '✨ ')
  if (aff <= -30) return neutralText.replace(/^/gm, '… ')
  if (aro >= 70) return neutralText.replace(/^/gm, '⚡ ')
  return neutralText
}

async function executeSearch(args: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return { toolName: 'web_search', success: false, content: '搜索词为空', summary: '搜索失败：未提供搜索词' }
  }
  try {
    const results = await searchWeb(query)
    const content = formatSearchResults(results)
    const summary = `搜索完成：「${query}」，找到 ${results.length} 条结果`
    const memoryHint = `在 ${new Date().toISOString().slice(0, 10)} 搜索了「${query}」`
    return { toolName: 'web_search', success: true, content, summary, memoryHint }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { toolName: 'web_search', success: false, content: `搜索失败：${msg}`, summary: `搜索失败：${msg}` }
  }
}

async function executeReadFile(
  args: Record<string, unknown>,
  dataRoot: string
): Promise<ToolResult> {
  const path = typeof args.path === 'string' ? args.path.trim() : ''
  const maxLines = typeof args.max_lines === 'number' ? args.max_lines : 200
  if (!path) {
    return { toolName: 'read_file', success: false, content: '文件路径为空', summary: '读取失败：未提供路径' }
  }
  const maxBytes = maxLines * 500 // rough estimate
  const result = readRelFile(dataRoot, path, maxBytes)
  if (!result.ok) {
    return { toolName: 'read_file', success: false, content: `读取失败：${result.error}`, summary: `读取 ${path} 失败：${result.error}` }
  }
  const lines = result.text.split('\n')
  const truncated = lines.slice(0, maxLines).join('\n')
  const suffix = lines.length > maxLines ? `\n...（文件共 ${lines.length} 行，仅显示前 ${maxLines} 行）` : ''
  return {
    toolName: 'read_file',
    success: true,
    content: truncated + suffix,
    summary: `已读取 ${path}（${lines.length} 行）`,
    memoryHint: `读取了文件 ${path}`
  }
}

async function executeAppendMemory(
  args: Record<string, unknown>,
  dataRoot: string
): Promise<ToolResult> {
  const rel = typeof args.path_rel === 'string' ? args.path_rel.trim() : ''
  const content = typeof args.content === 'string' ? args.content : ''
  const mode = args.mode === 'append' || args.mode === 'overwrite' ? args.mode : null
  if (!rel || content === undefined || !mode) {
    return { toolName: 'append_memory', success: false, content: '参数不完整', summary: '写入失败：缺少路径、内容或 mode' }
  }
  const r = appendOrOverwriteAllowed(dataRoot, rel, content, mode)
  if (!r.ok) {
    return { toolName: 'append_memory', success: false, content: `写入失败：${r.error}`, summary: `写入 ${rel} 失败` }
  }
  return {
    toolName: 'append_memory',
    success: true,
    content: `文件 ${rel} 已${mode === 'append' ? '追加' : '覆盖'}`,
    summary: `已${mode === 'append' ? '追加' : '覆盖'} ${rel}`,
    memoryHint: `在 ${rel} ${mode === 'append' ? '追加了' : '写入了'}内容`
  }
}

async function executeWriteFile(
  args: Record<string, unknown>,
  dataRoot: string
): Promise<ToolResult> {
  const rel = typeof args.path_rel === 'string' ? args.path_rel.trim() : ''
  const content = typeof args.content === 'string' ? args.content : ''
  if (!rel || !content) {
    return { toolName: 'write_file', success: false, content: '参数不完整', summary: '写入失败：缺少路径或内容' }
  }
  // write_file 复用 fsops 的 appendOrOverwriteAllowed，但路径限制在 staging/ 下
  const r = appendOrOverwriteAllowed(dataRoot, `staging/${rel}`, content, 'overwrite')
  if (!r.ok) {
    return { toolName: 'write_file', success: false, content: `写入失败：${r.error}`, summary: `写入 ${rel} 失败` }
  }
  return {
    toolName: 'write_file',
    success: true,
    content: `文件 ${rel} 已写入`,
    summary: `已写入 staging/${rel}`,
    memoryHint: `在 staging/${rel} 写入了新内容`
  }
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ActionContext
): Promise<ToolResult> {
  if (!trustGate(toolName, ctx.l1.trust)) {
    return {
      toolName,
      success: false,
      content: `信任不足（当前 ${ctx.l1.trust}），无法执行 ${toolName}`,
      summary: `${toolName} 被信任门控阻止`
    }
  }

  let result: ToolResult

  switch (toolName) {
    case 'web_search':
      result = await executeSearch(args)
      break
    case 'read_file':
      result = await executeReadFile(args, ctx.dataRoot)
      break
    case 'append_memory':
      result = await executeAppendMemory(args, ctx.dataRoot)
      break
    case 'write_file':
      result = await executeWriteFile(args, ctx.dataRoot)
      break
    default:
      // run_command 等未暴露工具走此分支
      result = { toolName, success: false, content: `未知工具: ${toolName}`, summary: `不支持的工具: ${toolName}` }
  }

  // 用情绪调制结果语气
  if (result.success && result.content) {
    result.content = toneWrap(ctx.l2, result.content)
  }

  return result
}

export function collectMemoryHints(results: ToolResult[]): string[] {
  return results.filter(r => r.success && r.memoryHint).map(r => r.memoryHint!)
}
