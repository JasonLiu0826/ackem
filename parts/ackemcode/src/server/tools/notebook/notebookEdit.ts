/**
 * NotebookEdit — Claude Code NotebookEditTool logic (replace/insert/delete).
 * No Anthropic source paste; behavior/error strings aligned.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveFileToolPath } from '../files/pathUtils.js'
import type { ReadFileState } from '../files/readFileState.js'
import type { FileToolResult } from '../files/types.js'

export type NotebookEditMode = 'replace' | 'insert' | 'delete'
export type NotebookCellType = 'code' | 'markdown'

type NotebookCell = {
  cell_type: string
  id?: string
  source?: string | string[]
  metadata?: Record<string, unknown>
  execution_count?: number | null
  outputs?: unknown[]
}

type NotebookContent = {
  cells: NotebookCell[]
  metadata?: {
    language_info?: { name?: string }
    [k: string]: unknown
  }
  nbformat?: number
  nbformat_minor?: number
}

/** CC parseCellId: `cell-N` → index N */
export function parseCellId(cellId: string): number | undefined {
  const match = cellId.match(/^cell-(\d+)$/)
  if (!match?.[1]) return undefined
  const index = parseInt(match[1], 10)
  return Number.isNaN(index) ? undefined : index
}

function resolveCellIndex(
  notebook: NotebookContent,
  cellId: string | undefined,
  editMode: NotebookEditMode
): { index: number; error?: string } {
  if (!cellId) {
    if (editMode !== 'insert') {
      return {
        index: -1,
        error: 'Cell ID must be specified when not inserting a new cell.'
      }
    }
    return { index: 0 }
  }

  let cellIndex = notebook.cells.findIndex((c) => c.id === cellId)
  if (cellIndex === -1) {
    const parsed = parseCellId(cellId)
    if (parsed !== undefined) {
      if (!notebook.cells[parsed]) {
        return {
          index: -1,
          error: `Cell with index ${parsed} does not exist in notebook.`
        }
      }
      cellIndex = parsed
    } else {
      return {
        index: -1,
        error: `Cell with ID "${cellId}" not found in notebook.`
      }
    }
  }

  if (editMode === 'insert') cellIndex += 1
  return { index: cellIndex }
}

function formatSuccess(
  editMode: NotebookEditMode,
  cellId: string | undefined,
  newSource: string
): string {
  switch (editMode) {
    case 'replace':
      return `Updated cell ${cellId} with ${newSource}`
    case 'insert':
      return `Inserted cell ${cellId} with ${newSource}`
    case 'delete':
      return `Deleted cell ${cellId}`
    default:
      return 'Unknown edit mode'
  }
}

export async function notebookEditTool(
  cwd: string,
  input: Record<string, unknown>,
  readState?: ReadFileState,
  opts?: {
    additionalWorkingDirectories?: readonly string[]
    trackFileEdit?: (absPath: string) => void | Promise<void>
  }
): Promise<FileToolResult> {
  const notebookPath = String(input.notebook_path ?? input.path ?? '')
  const newSource = String(input.new_source ?? '')
  const cellIdRaw = input.cell_id != null ? String(input.cell_id) : undefined
  const cellTypeIn = input.cell_type != null ? String(input.cell_type) : undefined
  let editMode = (String(input.edit_mode ?? 'replace') || 'replace') as NotebookEditMode

  if (editMode !== 'replace' && editMode !== 'insert' && editMode !== 'delete') {
    return { ok: false, output: 'Edit mode must be replace, insert, or delete.' }
  }
  if (editMode === 'insert' && cellTypeIn !== 'code' && cellTypeIn !== 'markdown') {
    return {
      ok: false,
      output: 'Cell type is required when using edit_mode=insert.'
    }
  }

  let abs: string
  try {
    abs = resolveFileToolPath(cwd, notebookPath, {
      additionalWorkingDirectories: opts?.additionalWorkingDirectories
    })
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }

  if (path.extname(abs).toLowerCase() !== '.ipynb') {
    return {
      ok: false,
      output:
        'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the search_replace or write_file tool.'
    }
  }

  let st: Awaited<ReturnType<typeof fs.stat>>
  try {
    st = await fs.stat(abs)
  } catch {
    return { ok: false, output: 'Notebook file does not exist.' }
  }
  if (st.isDirectory()) {
    return { ok: false, output: 'Notebook path is a directory.' }
  }

  if (readState) {
    const entry = readState.get(abs)
    if (!entry) {
      return {
        ok: false,
        output: 'File has not been read yet. Read it first before writing to it.'
      }
    }
    if (!entry.complete) {
      return {
        ok: false,
        output:
          'File has not been read yet. Read it first before writing to it. (Previous read used offset/limit — read the full file.)'
      }
    }
    if (Math.abs(st.mtimeMs - entry.mtimeMs) > 1) {
      return {
        ok: false,
        output:
          'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.'
      }
    }
  }

  let content: string
  try {
    content = await fs.readFile(abs, 'utf8')
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }

  let notebook: NotebookContent
  try {
    notebook = JSON.parse(content) as NotebookContent
  } catch {
    return { ok: false, output: 'Notebook is not valid JSON.' }
  }
  if (!Array.isArray(notebook.cells)) {
    return { ok: false, output: 'Notebook is not valid JSON.' }
  }

  const resolved = resolveCellIndex(notebook, cellIdRaw, editMode)
  if (resolved.error) return { ok: false, output: resolved.error }
  let cellIndex = resolved.index

  let cellType = cellTypeIn as NotebookCellType | undefined
  if (editMode === 'replace' && cellIndex === notebook.cells.length) {
    editMode = 'insert'
    if (!cellType) cellType = 'code'
  }

  const language = notebook.metadata?.language_info?.name ?? 'python'
  const needsId =
    (notebook.nbformat ?? 4) > 4 ||
    ((notebook.nbformat ?? 4) === 4 && (notebook.nbformat_minor ?? 0) >= 5)

  let newCellId: string | undefined
  if (needsId) {
    if (editMode === 'insert') {
      newCellId = Math.random().toString(36).substring(2, 15)
    } else if (cellIdRaw) {
      newCellId = cellIdRaw
    }
  }

  if (editMode === 'delete') {
    if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { ok: false, output: `Cell with index ${cellIndex} does not exist in notebook.` }
    }
    notebook.cells.splice(cellIndex, 1)
  } else if (editMode === 'insert') {
    const ct: NotebookCellType = cellType === 'markdown' ? 'markdown' : 'code'
    const newCell: NotebookCell =
      ct === 'markdown'
        ? { cell_type: 'markdown', id: newCellId, source: newSource, metadata: {} }
        : {
            cell_type: 'code',
            id: newCellId,
            source: newSource,
            metadata: {},
            execution_count: null,
            outputs: []
          }
    notebook.cells.splice(cellIndex, 0, newCell)
  } else {
    const target = notebook.cells[cellIndex]
    if (!target) {
      return { ok: false, output: `Cell with index ${cellIndex} does not exist in notebook.` }
    }
    target.source = newSource
    if (target.cell_type === 'code') {
      target.execution_count = null
      target.outputs = []
    }
    if (cellType && cellType !== target.cell_type) {
      target.cell_type = cellType
    }
    newCellId = target.id || newCellId || cellIdRaw
  }

  const updated = JSON.stringify(notebook, null, 1)
  try {
    await opts?.trackFileEdit?.(abs)
  } catch {
    /* checkpoint best-effort */
  }
  await fs.writeFile(abs, updated, 'utf8')
  const st2 = await fs.stat(abs)
  readState?.remember(abs, st2.mtimeMs, true)

  const outId = newCellId || cellIdRaw
  return {
    ok: true,
    output: [
      formatSuccess(editMode, outId, newSource),
      `language=${language}`,
      `edit_mode=${editMode}`
    ].join('\n')
  }
}
