import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const MAX_OPENFORU_WORKSPACES = 6

export const PLAN_WELCOME_MESSAGE =
  '鎴戞槸 Ackem Agent銆傝鎻忚堪浣犳兂鍋氱殑鑳藉姏锛氱敤閫斻€佽Е鍙戞柟寮忋€侀渶瑕佺殑鏉冮檺銆俓n\n鎴戜細鍏堝府浣犲垽鏂€傚悎 **Skill锛坲skill锛?* 杩樻槸 **Plugin锛坲plugin锛?*锛屽啀鏁寸悊 dispatch 鏂规銆俓n- **Skill**锛氫富鑱婂ぉ瑙﹀彂鍚庢敞鍏ヨ涓?鈥?**鍙儴缃?*\n- **Plugin**锛氱郴缁?鐣岄潰閽╁瓙 鈥?**鍙儴缃?*锛坴1锛氫笂涓嬫枃娉ㄥ叆锛岄潪鐪熺郴缁熼挬瀛愶級'

export type OpenForUWorkspace = {
  id: string
  name: string
  sessionId: string
  createdAt: string
  updatedAt: string
  /** 鐢ㄦ埛鐐瑰嚮銆屾柊寤哄伐浣滃尯銆嶆椂涓?true */
  userCreated?: boolean
}

export type OpenForUWorkspaceIndex = {
  version: '1.0.0'
  activeWorkspaceId: string | null
  workspaces: OpenForUWorkspace[]
}

function openforuDir(dataRoot: string): string {
  const d = join(dataRoot, 'openforu')
  mkdirSync(d, { recursive: true })
  mkdirSync(join(d, 'sessions'), { recursive: true })
  mkdirSync(join(d, 'staging'), { recursive: true })
  return d
}

function indexPath(dataRoot: string): string {
  return join(openforuDir(dataRoot), 'workspaces.json')
}

function sessionPath(dataRoot: string, id: string): string {
  return join(openforuDir(dataRoot), 'sessions', `${id}.json`)
}

function stagingPath(dataRoot: string, sessionId: string): string {
  return join(openforuDir(dataRoot), 'staging', `${sessionId}.md`)
}

function nextWorkspaceName(workspaces: OpenForUWorkspace[]): string {
  const used = new Set(
    workspaces
      .map((w) => w.name.match(/^宸ヤ綔鍖篭s*(\d+)$/)?.[1])
      .filter(Boolean)
      .map((n) => Number(n))
  )
  let n = 1
  while (used.has(n)) n++
  return `宸ヤ綔鍖?${n}`
}

function deleteSessionArtifacts(dataRoot: string, sessionId: string): void {
  const sp = sessionPath(dataRoot, sessionId)
  const st = stagingPath(dataRoot, sessionId)
  if (existsSync(sp)) rmSync(sp, { force: true })
  if (existsSync(st)) rmSync(st, { force: true })
}

function sessionHasUserMessages(dataRoot: string, sessionId: string): boolean {
  const p = sessionPath(dataRoot, sessionId)
  if (!existsSync(p)) return false
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as {
      messages?: Array<{ role?: string }>
    }
    return Array.isArray(raw.messages) && raw.messages.some((m) => m.role === 'user')
  } catch {
    return false
  }
}

function shouldKeepWorkspace(dataRoot: string, w: OpenForUWorkspace): boolean {
  if (w.userCreated === true) return true
  // 鏃ф暟鎹細浠呬繚鐣欑敤鎴风湡姝ｈ亰杩囩殑 session锛岀┖鐨勮嚜鍔?session 涓嶅睍绀?
  return sessionHasUserMessages(dataRoot, w.sessionId)
}

function emptyIndex(): OpenForUWorkspaceIndex {
  return { version: '1.0.0', activeWorkspaceId: null, workspaces: [] }
}

import { getDatabase } from '../../db/database'
import { loadWorkspaceIndexFromDb, saveWorkspaceIndexToDb } from '../../db/repos/openforu'
import { createEmptyPlanSession, type PlanSession } from '../../../shared/planSession'

export class OpenForUWorkspaceStore {
  constructor(private dataRoot: string) {}

  private normalizeIndex(index: OpenForUWorkspaceIndex): OpenForUWorkspaceIndex {
    const before = index.workspaces.length
    index.workspaces = index.workspaces
      .filter((w) => shouldKeepWorkspace(this.dataRoot, w))
      .map((w) => (w.userCreated === true ? w : { ...w, userCreated: true }))
    if (
      index.activeWorkspaceId &&
      !index.workspaces.some((w) => w.id === index.activeWorkspaceId)
    ) {
      index.activeWorkspaceId = index.workspaces[0]?.id ?? null
    }
    if (before !== index.workspaces.length) {
      this.writeIndex(index)
    }
    return index
  }

  private readIndex(): OpenForUWorkspaceIndex {
    if (getDatabase(this.dataRoot)) {
      const fromDb = loadWorkspaceIndexFromDb(this.dataRoot)
      if (fromDb && fromDb.workspaces.length > 0) {
        return this.normalizeIndex(fromDb)
      }
    }
    const p = indexPath(this.dataRoot)
    if (!existsSync(p)) {
      const empty = emptyIndex()
      this.writeIndex(empty)
      return empty
    }
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as OpenForUWorkspaceIndex
      if (raw.version !== '1.0.0' || !Array.isArray(raw.workspaces)) {
        const empty = emptyIndex()
        this.writeIndex(empty)
        return empty
      }
      const normalized = this.normalizeIndex(raw)
      if (getDatabase(this.dataRoot)) {
        saveWorkspaceIndexToDb(this.dataRoot, normalized)
      }
      return normalized
    } catch {
      const empty = emptyIndex()
      this.writeIndex(empty)
      return empty
    }
  }

  private writeIndex(index: OpenForUWorkspaceIndex): void {
    writeFileSync(indexPath(this.dataRoot), JSON.stringify(index, null, 2), 'utf-8')
    if (getDatabase(this.dataRoot)) {
      saveWorkspaceIndexToDb(this.dataRoot, index)
    }
  }

  list(): { workspaces: OpenForUWorkspace[]; activeWorkspaceId: string | null; max: number } {
    const index = this.readIndex()
    const workspaces = [...index.workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return {
      workspaces,
      activeWorkspaceId: index.activeWorkspaceId,
      max: MAX_OPENFORU_WORKSPACES
    }
  }

  getActive(): OpenForUWorkspace | null {
    const index = this.readIndex()
    if (!index.activeWorkspaceId) return null
    return index.workspaces.find((w) => w.id === index.activeWorkspaceId) ?? null
  }

  getById(id: string): OpenForUWorkspace | null {
    return this.readIndex().workspaces.find((w) => w.id === id) ?? null
  }

  createSessionFile(sessionId: string): void {
    const session = createEmptyPlanSession(sessionId, PLAN_WELCOME_MESSAGE)
    writeFileSync(
      sessionPath(this.dataRoot, sessionId),
      JSON.stringify(session, null, 2),
      'utf-8'
    )
  }

  createWorkspace(name?: string): [OpenForUWorkspace, OpenForUWorkspace | null] {
    const index = this.readIndex()
    let evicted: OpenForUWorkspace | null = null

    if (index.workspaces.length >= MAX_OPENFORU_WORKSPACES) {
      const sorted = [...index.workspaces].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      evicted = sorted[0]
      index.workspaces = index.workspaces.filter((w) => w.id !== evicted!.id)
      if (index.activeWorkspaceId === evicted.id) {
        index.activeWorkspaceId = null
      }
      deleteSessionArtifacts(this.dataRoot, evicted.sessionId)
    }

    const now = new Date().toISOString()
    const sessionId = randomUUID()
    this.createSessionFile(sessionId)

    const workspace: OpenForUWorkspace = {
      id: randomUUID(),
      name: name?.trim() || nextWorkspaceName(index.workspaces),
      sessionId,
      createdAt: now,
      updatedAt: now,
      userCreated: true
    }

    index.workspaces.unshift(workspace)
    index.activeWorkspaceId = workspace.id
    this.writeIndex(index)
    return [workspace, evicted]
  }

  switchActive(workspaceId: string): OpenForUWorkspace {
    const index = this.readIndex()
    const ws = index.workspaces.find((w) => w.id === workspaceId)
    if (!ws) throw new Error('宸ヤ綔鍖轰笉瀛樺湪')
    index.activeWorkspaceId = workspaceId
    this.writeIndex(index)
    return ws
  }

  touchSession(sessionId: string): void {
    const index = this.readIndex()
    const ws = index.workspaces.find((w) => w.sessionId === sessionId)
    if (!ws) return
    ws.updatedAt = new Date().toISOString()
    this.writeIndex(index)
  }

  deleteWorkspace(workspaceId: string): OpenForUWorkspace {
    const index = this.readIndex()
    const ws = index.workspaces.find((w) => w.id === workspaceId)
    if (!ws) throw new Error('宸ヤ綔鍖轰笉瀛樺湪')
    index.workspaces = index.workspaces.filter((w) => w.id !== workspaceId)
    if (index.activeWorkspaceId === workspaceId) {
      index.activeWorkspaceId = index.workspaces[0]?.id ?? null
    }
    deleteSessionArtifacts(this.dataRoot, ws.sessionId)
    this.writeIndex(index)
    return ws
  }
}
