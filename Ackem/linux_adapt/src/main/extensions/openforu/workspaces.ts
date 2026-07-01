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
  '我是 Ackem Agent。请描述你想做的能力：用途、触发方式、需要的权限。\n\n我会先帮你判断适合 **Skill（uskill）** 还是 **Plugin（uplugin）**，再整理 dispatch 方案。\n- **Skill**：主聊天触发后注入行为 — **可部署**\n- **Plugin**：系统/界面钩子 — **可部署**（v1：上下文注入，非真系统钩子）'

export type OpenForUWorkspace = {
  id: string
  name: string
  sessionId: string
  createdAt: string
  updatedAt: string
  /** 用户点击「新建工作区」时为 true */
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
      .map((w) => w.name.match(/^工作区\s*(\d+)$/)?.[1])
      .filter(Boolean)
      .map((n) => Number(n))
  )
  let n = 1
  while (used.has(n)) n++
  return `工作区 ${n}`
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
  // 旧数据：仅保留用户真正聊过的 session，空的自动 session 不展示
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
    if (!ws) throw new Error('工作区不存在')
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
    if (!ws) throw new Error('工作区不存在')
    index.workspaces = index.workspaces.filter((w) => w.id !== workspaceId)
    if (index.activeWorkspaceId === workspaceId) {
      index.activeWorkspaceId = index.workspaces[0]?.id ?? null
    }
    deleteSessionArtifacts(this.dataRoot, ws.sessionId)
    this.writeIndex(index)
    return ws
  }
}
