import type { TaskSnapshot, TaskState, TaskEvent, WorkScheduling } from '../../../shared/tasks'
import {executionResultText,isTaskExecutionSettled} from '../../../shared/tasks'
import { create } from 'zustand'
import { useAppStore } from './appStore'
import {projectWorkActivity} from '../lib/workActivity'
import {canStopWorkbenchTask} from '../lib/workPresentation'

export type CoarseStatus = 'draft' | 'running' | 'waiting' | 'paused' | 'done' | 'failed' | 'unknown'
export type TrustLevel = 'ask' | 'session' | 'full'
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type RailTab = 'changes' | 'browser' | 'terminal' | 'files' | 'doc'

export const PINNED_TASK_ID = 'pinned-ackem'
const earlyPinnedEvents = new Map<string, Array<{ taskId: string; turnId: string; event: unknown }>>()
type RuntimeWorkEvent={taskId:string;turnId:string;event:unknown;goalRevision?:number;controlEpoch?:number}
const earlyTaskEvents = new Map<string, RuntimeWorkEvent[]>()
const STORAGE_KEY = 'ackem-workbench-v6'

export type Attachment =
  | { kind: 'image'; id: string; name: string; path?: string; dataUrl: string; size: number }
  | { kind: 'doc'; id: string; name: string; path: string }
  | { kind:'video';id:string;name:string;path:string;size:number;thumbnail?:string;note?:string }
  | { kind: 'folder'; id: string; name: string; path: string }

export type ThoughtLine = { id: string; text: string; path?: string }
export type WorkActivity = {id:string;kind:'thought'|'tool'|'feedback'|'event';text:string;startedAt:number;endedAt?:number;input?:unknown;output?:string;ok?:boolean}

export type FilesChanged = {
  count: number
  added: number
  removed: number
  files: Array<{ path: string; added: number; removed: number; diff: string }>
}

export type Approval = {
  kind?: 'permission' | 'plan' | 'question'
  requestId?: string
  toolName?: string
  questions?: Array<{ question: string; options: Array<{ label: string }> }>
  title: string
  detail: string
  path?: string
  resolved?: 'allow' | 'deny' | 'expired'
}

export type TurnBlock = {
  id: string
  ownerTaskId?: string
  goalRevision?:number
  actor?: 'ackem' | 'user'
  supervisionNotes?: Array<{text:string;at:number;actor:string}>
  userText: string
  attachments: Attachment[]
  processSummary: string
  thoughtSeconds: number
  thoughtLines: ThoughtLine[]
  thoughtOpen: boolean
  thoughtCancelled?: boolean
  assistantText: string
  assistantTextKind?:'final'|'partial'
  stopReason?:string
  activities?:WorkActivity[]
  executionEndedAt?:number
  approval?: Approval
  filesChanged?: FilesChanged
  createdAt: number
  inputSequence?:number
  inputState?: 'sending'|'received'|'queued'|'settled'|'failed'|'cancelled'
  generationState?:'incomplete'
}

export type WorkbenchTask = {
  id: string
  ackemArea?: boolean
  pendingSubmit?: { requestId: string; signature: string; candidateTaskIds?:string[];submittedAt?:number;inputSequence?:number;scheduling?:WorkScheduling }
  policyRevision?:number
  permissionMutationSerial?:number
  desiredPermissionMutationId?:string
  displayChildId?:string
  coordinatorTaskId?: string
  taskState?: TaskState
  queueOrder?:number
  controlEpoch?: number
  goalRevision?: number
  deliverySurface?: 'chat' | 'workbench'
  deliveryConversationId?:string
  executionSettled?:boolean
  runtimeSessionId?: string
  runtimeRunId?: string
  title: string
  workspaceId: string | null
  pinned: boolean
  status: CoarseStatus
  cwd?: string
  updatedAt: number
  /** Authoritative task projection time; UI edits must not supersede server state. */
  projectionUpdatedAt?: number
  queuedFollow: string[]
  runtimeQueue?: Array<{ id: string; text: string }>
  queuedJobs: number
  effort: EffortLevel
  executionMode?: 'agent' | 'plan'
  trust: TrustLevel
  modelLabel: string
  turns: TurnBlock[]
  composerDraft: string
  composerAttachments: Attachment[]
  editingTurnId: string | null
  editDraft: string
  editAttachments: Attachment[]
  pane: TaskPane
}

export type BrowserRecent = { title: string; url: string }
export type FileRecent = { name: string; folder: string; path: string }
export type TerminalLine = { id: string; text: string; kind: 'in' | 'out' | 'cwd' }

export type TaskPane = {
  railOpen: boolean
  railTab: RailTab
  railTabs: RailTab[]
  changeFilePath: string
  docPath: string
  docSource: string
  docMode: 'preview' | 'source'
  browserUrl: string
  browserInput: string
  browserHistory: string[]
  browserIndex: number
  browserRecents: BrowserRecent[]
  fileRecents: FileRecent[]
  fileQuery: string
  terminalCwd: string
  terminalLines: TerminalLine[]
  terminalInput: string
}

export type UserWorkspace = {
  id: string
  name: string
  folderPath: string
  expanded: boolean
  fileRecents: FileRecent[]
}

type PersistShape = {
  removedTaskIds?: string[]
  workspaces: UserWorkspace[]
  tasks: WorkbenchTask[]
  selectedTaskId: string
}

type WorkbenchState = PersistShape & {
  navigationTarget?: string
  focusTask: (id?:string) => void
  searchQuery: string
  sidebarCollapsed: boolean
  railWidth: number
  newWorkspaceOpen: boolean
  newTaskOpen: boolean
  plusMenuOpen: boolean
  trustConfirmOpen: boolean
  editSendConfirmOpen: boolean
  selectTask: (id: string) => void
  selectWorkspace: (id: string) => void
  setSearchQuery: (q: string) => void
  setSidebarCollapsed: (v: boolean) => void
  toggleWorkspace: (id: string) => void
  addWorkspace: (name: string, folderPath: string) => void
  removeWorkspace: (id: string) => void
  addTask: (workspaceId: string | null) => string
  removeTask: (id: string) => Promise<void>
  clearAckemArea: () => Promise<void>
  setComposerDraft: (taskId: string, text: string) => void
  setEditDraft: (taskId: string, text: string) => void
  sendEdit: (taskId: string) => void
  addAttachment: (taskId: string, att: Attachment) => string | null
  removeAttachment: (taskId: string, attId: string) => void
  setEffort: (taskId: string, effort: EffortLevel) => void
  setExecutionMode: (taskId: string, mode: 'agent' | 'plan') => void
  setTrust: (taskId: string, trust: TrustLevel) => void
  setModelLabel: (taskId: string, label: string) => void
  send: (taskId: string,scheduling?:WorkScheduling) => void
  runQueuedNow: (taskId:string,itemId?:string)=>Promise<void>
  /** 聊天派工注入: 智慧路由把 work 任务放进固定 Ackem 任务的管线 (2026-10-04)。 */
  injectChatDispatch: (input: { taskId?: string; turnId: string; text: string; cwd: string; sessionId: string; runId?: string; queued?: boolean }) => void
  abort: (taskId: string) => void
  beginEditLastTurn: (taskId: string) => void
  cancelEdit: (taskId: string) => void
  confirmEditSend: (taskId: string) => void
  setEditSendConfirmOpen: (v: boolean) => void
  toggleThought: (taskId: string, turnId: string) => void
  resolveApproval: (taskId: string, turnId: string, resolved: 'allow' | 'deny') => void
  answerQuestion: (taskId: string, turnId: string, answers: Record<string, string>, cancelled?: boolean) => void
  openRail: (tab: RailTab) => void
  closeRail: () => void
  closeRailTab: (tab: RailTab) => void
  setRailWidth: (w: number) => void
  addRailTab: (tab: RailTab) => void
  openPath: (path: string) => void
  openChange: (path?: string) => void
  openDoc: (path: string, source?: string) => void
  setDocMode: (mode: 'preview' | 'source') => void
  setBrowserInput: (v: string) => void
  goBrowser: (url?: string) => void
  browserBack: () => void
  browserForward: () => void
  setFileQuery: (q: string) => void
  browseFiles: (files: File[]) => void
  newFile: (name: string, cwd: string) => void
  openFileRecent: (path: string) => void
  setTerminalInput: (v: string) => void
  submitTerminal: () => void
  setNewWorkspaceOpen: (v: boolean) => void
  setNewTaskOpen: (v: boolean) => void
  setPlusMenuOpen: (v: boolean) => void
  setTrustConfirmOpen: (v: boolean) => void
  openSettings: () => void
  applyTaskSnapshot: (snapshot: TaskSnapshot) => void
  applyTaskEvent: (event: TaskEvent) => void
  hydrateRuntime: () => Promise<void>
  applyRuntimeEvent: (payload: RuntimeWorkEvent) => void
  removeQueued: (taskId: string, itemId: string) => Promise<void>
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function emptyPane(cwd = '~'): TaskPane {
  const dir = cwd || '~'
  return {
    railOpen: false,
    railTab: 'changes',
    railTabs: ['changes'],
    changeFilePath: '',
    docPath: '',
    docSource: '',
    docMode: 'preview',
    browserUrl: '',
    browserInput: '',
    browserHistory: [],
    browserIndex: -1,
    browserRecents: [],
    fileRecents: [],
    fileQuery: '',
    terminalCwd: dir,
    terminalLines: [{ id: nid(), text: dir, kind: 'cwd' }],
    terminalInput: ''
  }
}

export function selectedTaskOf(s: Pick<PersistShape, 'tasks' | 'selectedTaskId'>): WorkbenchTask | undefined {
  return s.tasks.find((t) => t.id === s.selectedTaskId)
}

async function saveCatalogImmediately(state:PersistShape):Promise<void> {
  window.clearTimeout(catalogTimer)
  const saved=await window.ackem.workbench.saveCatalog({workspaces:state.workspaces,tasks:state.tasks,selectedTaskId:state.selectedTaskId,removedTaskIds:state.removedTaskIds??[]})
  if(!saved.ok)throw Error('任务记录保存失败，请重试。')
}
async function verifyLocalRecordStopped(task:WorkbenchTask,closeCli=true):Promise<void> {
  if(task.runtimeSessionId){
    let snapshot=await window.ackem.workbench.snapshot(task.runtimeSessionId)
    if(closeCli&&snapshot.executionQuiescent!==true&&!snapshot.hostTask){
      await window.ackem.workbench.abort(task.runtimeSessionId)
      for(let attempt=0;attempt<30;attempt++){
        snapshot=await window.ackem.workbench.snapshot(task.runtimeSessionId)
        if(snapshot.executionQuiescent===true)break
        await new Promise(resolve=>window.setTimeout(resolve,100))
      }
    }
    if(snapshot.executionQuiescent!==true)throw Error('尚未确认旧任务停止，已保留记录；请先停止执行再清除或删除。')
  }else if(!task.coordinatorTaskId&&['running','waiting','unknown'].includes(task.status)){
    throw Error('尚未确认旧任务停止，已保留记录。')
  }
  if(closeCli){const closed=await window.ackem.workbench.cliCloseTask(task.id);if(!closed.ok)throw Error('尚未确认 CLI 停止，已保留任务记录')}
}

export const inAckemArea=(task:WorkbenchTask)=>task.id===PINNED_TASK_ID||task.deliverySurface==='chat'||task.ackemArea===true
export function ackemCurrentTask(tasks:WorkbenchTask[],fallbackId?:string):WorkbenchTask|undefined {
  const entries=tasks.filter(t=>t.id!==PINNED_TASK_ID&&inAckemArea(t))
  const selected=tasks.find(t=>t.id===PINNED_TASK_ID)?.displayChildId??fallbackId
  const active=entries.filter(t=>t.taskState!=='queued'&&canStopWorkbenchTask(t))
  if(selected&&entries.some(t=>t.id===selected)&&(active.some(t=>t.id===selected)||!active.length))return entries.find(t=>t.id===selected)
  if(active.length)return active.sort((a,b)=>b.updatedAt-a.updatedAt)[0]
  return [...entries].sort((a,b)=>Number(['running','waiting','unknown'].includes(b.status))-Number(['running','waiting','unknown'].includes(a.status))||b.updatedAt-a.updatedAt)[0]
}
const pinnedSources=new WeakMap<WorkbenchTask,string>()
let displayCache:{tasks:WorkbenchTask[];selected:string;value:WorkbenchTask|undefined}|undefined
export function selectedDisplayTaskOf(s:Pick<PersistShape,'tasks'|'selectedTaskId'>):WorkbenchTask|undefined {
  if(displayCache?.tasks===s.tasks&&displayCache.selected===s.selectedTaskId)return displayCache.value
  const raw=selectedTaskOf(s)
  const selected=raw&&inAckemArea(raw)?s.tasks.find(t=>t.id===PINNED_TASK_ID)??raw:raw
  const current=ackemCurrentTask(s.tasks,selected&&pinnedSources.get(selected))
  if(selected&&current)pinnedSources.set(selected,current.id)
  const value=selected?.id===PINNED_TASK_ID?{...selected,title:'Ackem 工作',cwd:current?.cwd??selected.cwd,coordinatorTaskId:current?.coordinatorTaskId,displayChildId:current?.id,status:current?.status??selected.status,taskState:current?.taskState,executionSettled:current?.executionSettled,runtimeRunId:current?.runtimeRunId,trust:current?.trust??selected.trust,runtimeSessionId:current?.runtimeSessionId,effort:current?.effort??selected.effort,executionMode:current?.executionMode??selected.executionMode,
    turns:s.tasks.filter(inAckemArea).flatMap(task=>task.turns.map(turn=>({...turn,ownerTaskId:task.id}))).sort((a,b)=>a.createdAt-b.createdAt),updatedAt:current?.updatedAt??selected.updatedAt}:selected
  displayCache={tasks:s.tasks,selected:s.selectedTaskId,value};return value
}

export function taskIdForWorkspace(
  tasks: WorkbenchTask[],
  workspaceId: string,
  selectedTaskId: string
): string | undefined {
  const children = tasks.filter((t) => t.workspaceId === workspaceId)
  return children.find((t) => t.id === selectedTaskId)?.id ?? children[0]?.id
}

export function fileRecentsForTask(task: WorkbenchTask, workspaces: UserWorkspace[]): FileRecent[] {
  if (task.workspaceId) {
    const ws = workspaces.find((w) => w.id === task.workspaceId)
    if (ws) return ws.fileRecents
  }
  return task.pane.fileRecents
}

function withPane(task: WorkbenchTask, pane: Partial<TaskPane>): WorkbenchTask {
  return { ...task, pane: { ...task.pane, ...pane } }
}

function patchSelectedPane(s: PersistShape, pane: Partial<TaskPane>): PersistShape {
  return {
    ...s,
    tasks: patchTask(s.tasks, s.selectedTaskId, (t) => withPane(t, pane))
  }
}

function ensureLoaded(parsed: PersistShape): PersistShape {
  const workspaces = parsed.workspaces.map((w) => ({
    ...w,
    fileRecents: w.fileRecents ?? []
  }))
  const tasks = parsed.tasks.map((t) => {
    const cwd = t.cwd || workspaces.find((w) => w.id === t.workspaceId)?.folderPath || '~'
    return {
      ...t,
      desiredPermissionMutationId:undefined,
      editingTurnId: t.editingTurnId ?? null,
      editDraft: t.editDraft ?? '',
      editAttachments: t.editAttachments ?? [],
      pane: { ...emptyPane(cwd), ...(t.pane ?? {}) }
    }
  })
  return { ...parsed, workspaces, tasks }
}

function folderName(path: string): string {
  if (!path) return '本机'
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

export function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

export function isMarkdownPath(path: string): boolean {
  return /\.md$/i.test(path.trim())
}

export function splitAssistantParts(text: string): string[] {
  return text.split(/(`[^`]+`|[\p{L}\p{N}./\\_-]+\.md)/gu)
}

export function sourceFromDiff(diff: string): string {
  const out: string[] = []
  for (const raw of diff.replace(/\r\n/g, '\n').split('\n')) {
    if (
      raw.startsWith('+++') ||
      raw.startsWith('---') ||
      raw.startsWith('diff ') ||
      raw.startsWith('index ') ||
      raw.startsWith('@@') ||
      raw.startsWith('\\')
    ) {
      continue
    }
    if (raw.startsWith('+')) out.push(raw.slice(1))
    else if (raw.startsWith('-')) continue
    else out.push(raw.startsWith(' ') ? raw.slice(1) : raw)
  }
  return out.join('\n').replace(/\n+$/, '')
}

export function lastChangedFiles(task: WorkbenchTask): FilesChanged | undefined {
  return [...task.turns].reverse().find((t) => t.filesChanged)?.filesChanged
}

export type OpenRoute = { kind: 'doc'; path: string } | { kind: 'changes'; path: string } | { kind: 'files' }

export function routeOpenPath(task: WorkbenchTask, path: string): OpenRoute {
  const trimmed = path.trim()
  if (!trimmed) return { kind: 'files' }
  if (isMarkdownPath(trimmed)) return { kind: 'doc', path: trimmed }
  const hit = lastChangedFiles(task)?.files.find(
    (f) => f.path === trimmed || fileNameOf(f.path) === fileNameOf(trimmed)
  )
  if (hit) return { kind: 'changes', path: hit.path }
  return { kind: 'files' }
}

export function resolveDocSource(task: WorkbenchTask, path: string, source?: string): string {
  if (source) return source
  if (task.pane.docPath === path && task.pane.docSource) return task.pane.docSource
  for (const turn of [...task.turns].reverse()) {
    const file = turn.filesChanged?.files.find(
      (f) => f.path === path || fileNameOf(f.path) === fileNameOf(path)
    )
    if (file?.diff) {
      const fromDiff = sourceFromDiff(file.diff)
      if (fromDiff) return fromDiff
    }
  }
  return `# ${fileNameOf(path).replace(/\.md$/i, '')}\n\n这条任务还没有这份文件的正文。\n`
}

function fileRecentOf(file: File): FileRecent {
  let path = file.name
  try {
    path = window.ackem?.getPathForFile?.(file) || file.name
  } catch {
    path = file.name
  }
  return {
    name: file.name,
    folder: folderName(path.replace(/[/\\][^/\\]+$/, '')),
    path
  }
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '1m'
  if (min < 60) return `${min}m`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}h`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day}d`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function autoTitleFromText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return '新任务'
  return t.length > 22 ? `${t.slice(0, 22)}…` : t
}

function seed(): PersistShape {
  return {
    selectedTaskId: PINNED_TASK_ID,
    workspaces: [],
    tasks: [{
      id: PINNED_TASK_ID, title: '新任务', workspaceId: null, pinned: true,
      status: 'draft', updatedAt: Date.now(), queuedFollow: [], queuedJobs: 0,
      effort: 'medium', trust: 'ask', modelLabel: '默认模型', turns: [],
      composerDraft: '', composerAttachments: [], editingTurnId: null,
      editDraft: '', editAttachments: [], pane: emptyPane('')
    }]
  }
}

function loadPersist(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as PersistShape
    if (!parsed?.tasks?.some((t) => t.id === PINNED_TASK_ID)) return seed()
    return ensureLoaded(parsed)
  } catch {
    return seed()
  }
}

function persist(s: PersistShape): void {
  try {
    const catalog = {
      workspaces: s.workspaces, tasks: s.tasks, selectedTaskId: s.selectedTaskId, removedTaskIds:s.removedTaskIds??[]
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(catalog)
    )
    if (typeof window !== 'undefined' && window.ackem?.workbench) {
      window.clearTimeout(catalogTimer)
      catalogTimer = window.setTimeout(() => {
        void window.ackem.workbench.saveCatalog(catalog).catch((error) =>
          useAppStore.getState().pushToast(`任务保存失败：${String(error)}`))
      }, 400)
    }
  } catch {
    /* ignore */
  }
}

let catalogTimer: number | undefined
let catalogHydrated = false

function patchTask(
  tasks: WorkbenchTask[],
  id: string,
  fn: (t: WorkbenchTask) => WorkbenchTask
): WorkbenchTask[] {
  return tasks.map((t) => (t.id === id ? fn(t) : t))
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => {
  const loaded = loadPersist()
  return {
    ...loaded,
    searchQuery: '',
    sidebarCollapsed: false,
    railWidth: 420,
    newWorkspaceOpen: false,
    newTaskOpen: false,
    plusMenuOpen: false,
    trustConfirmOpen: false,
    editSendConfirmOpen: false,

    selectTask: (id) =>
      set((s) => {
        if (!s.tasks.some((t) => t.id === id)) return s
        const managed=id!==PINNED_TASK_ID&&inAckemArea(s.tasks.find(t=>t.id===id)!)
        const next = { ...s,tasks:managed?s.tasks.map(t=>t.id===PINNED_TASK_ID?{...t,displayChildId:id}:t):s.tasks, selectedTaskId: inAckemArea(s.tasks.find(t=>t.id===id)!)?PINNED_TASK_ID:id, plusMenuOpen: false }
        persist(next)
        return next
      }),
    focusTask:(id)=>{
      const task=get().tasks.find(t=>t.id===id||t.coordinatorTaskId===id||t.runtimeRunId===id||t.turns.some(turn=>turn.id===id))
      if(task&&task.id!==PINNED_TASK_ID&&inAckemArea(task))saveTask(PINNED_TASK_ID,pin=>({...pin,displayChildId:task.id}))
      set({selectedTaskId:!task||inAckemArea(task)?PINNED_TASK_ID:task.id,navigationTarget:task?.id})
      useAppStore.getState().setTab('code')
      if(id&&!task&&window.ackem?.tasks)void window.ackem.tasks.snapshot(id).then(snapshot=>{if(snapshot){get().applyTaskSnapshot(snapshot);const found=get().tasks.find(t=>t.coordinatorTaskId===id);if(found){get().selectTask(found.id);set({navigationTarget:found.id})}}else useAppStore.getState().pushToast('这项任务记录已删除或暂不可用')}).catch(()=>useAppStore.getState().pushToast('暂时无法定位这项任务'))
    },

    selectWorkspace: (id) =>
      set((s) => {
        const next = {
          ...s,
          plusMenuOpen: false,
          workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, expanded: true } : w)),
          selectedTaskId: taskIdForWorkspace(s.tasks, id, s.selectedTaskId) ?? s.selectedTaskId
        }
        persist(next)
        return next
      }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

    toggleWorkspace: (id) =>
      set((s) => {
        const next = {
          ...s,
          workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, expanded: !w.expanded } : w))
        }
        persist(next)
        return next
      }),

    addWorkspace: (name, folderPath) =>
      set((s) => {
        const next = {
          ...s,
          workspaces: [
            ...s.workspaces,
            { id: nid(), name: name.trim() || '未命名工作区', folderPath, expanded: true, fileRecents: [] }
          ],
          newWorkspaceOpen: false
        }
        persist(next)
        return next
      }),

    removeWorkspace: (id) =>
      set((s) => {
        const next = {
          ...s,
          workspaces: s.workspaces.filter((w) => w.id !== id),
          tasks: s.tasks.map(t=>t.workspaceId===id?{...t,workspaceId:null}:t),
          selectedTaskId:
            s.tasks.find((t) => t.id === s.selectedTaskId)?.workspaceId === id
              ? PINNED_TASK_ID
              : s.selectedTaskId
        }
        persist(next)
        return next
      }),

    addTask: (workspaceId) => {
      const id = nid()
      const ws = get().workspaces.find((w) => w.id === workspaceId)
      set((s) => {
        const task: WorkbenchTask = {
          id,
          title: '新任务',
          workspaceId,
          pinned: false,
          status: 'draft',
          cwd: ws?.folderPath,
          updatedAt: Date.now(),
          queuedFollow: [],
          queuedJobs: 0,
          effort: 'medium',
          trust: 'ask',
          modelLabel: '快速',
          turns: [],
          composerDraft: '',
          composerAttachments: [],
          editingTurnId: null,
          editDraft: '',
          editAttachments: [],
          pane: emptyPane(ws?.folderPath || '~')
        }
        const next = {
          ...s,
          tasks: [...s.tasks, task],
          selectedTaskId: id,
          newTaskOpen: false,
          workspaces: s.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, expanded: true } : w
          )
        }
        persist(next)
        return next
      })
      return id
    },

    clearAckemArea: async () => {
      const captured=get().tasks.filter(inAckemArea)
      const result=await window.ackem.tasks.clearManaged(captured.flatMap(t=>t.coordinatorTaskId?[t.coordinatorTaskId]:[]))
      const staleIds=new Set(result.staleTaskIds??[])
      for(const task of captured.filter(t=>staleIds.has(t.coordinatorTaskId??t.id)||!t.coordinatorTaskId))await verifyLocalRecordStopped(task,false)
      const ids=new Set([...result.taskIds,...staleIds])
      if(captured.some(t=>t.id!==PINNED_TASK_ID&&t.coordinatorTaskId&&!ids.has(t.coordinatorTaskId)))throw Error('仍有旧任务未确认停止或不属于托管区，记录已保留；请先停止该任务。')
      const localIds=captured.filter(t=>t.id!==PINNED_TASK_ID&&!t.coordinatorTaskId).map(t=>t.id)
      const pin=captured.find(t=>t.id===PINNED_TASK_ID)
      const oldTurns=new Set(pin?.turns.map(t=>t.id)??[])
      set(state=>{
        const removed=state.tasks.filter(t=>t.id!==PINNED_TASK_ID&&(ids.has(t.coordinatorTaskId??t.id)||localIds.includes(t.id)&&captured.find(old=>old.id===t.id)?.updatedAt===t.updatedAt)).map(t=>t.id)
        const clearedLocalIds=captured.filter(t=>ids.has(t.coordinatorTaskId??t.id)).map(t=>t.id)
        const next={...state,tasks:state.tasks.filter(t=>!removed.includes(t.id)).map(t=>{
          if(t.id!==PINNED_TASK_ID)return t
          const displayChildId=t.displayChildId&&(!state.tasks.some(child=>child.id===t.displayChildId)||removed.includes(t.displayChildId)||clearedLocalIds.includes(t.displayChildId))?undefined:t.displayChildId
          const turns=t.turns.filter(turn=>!oldTurns.has(turn.id))
          const empty=!displayChildId&&!turns.length
          return {...t,displayChildId,turns,status:empty?'draft' as const:t.status,runtimeSessionId:empty?undefined:t.runtimeSessionId,runtimeRunId:empty?undefined:t.runtimeRunId,pane:empty?emptyPane(t.cwd??'~'):t.pane,queuedFollow:empty?[]:t.queuedFollow,queuedJobs:empty?0:t.queuedJobs,runtimeQueue:empty?[]:t.runtimeQueue,editingTurnId:empty?null:t.editingTurnId,editDraft:empty?'':t.editDraft,editAttachments:empty?[]:t.editAttachments,composerDraft:t.composerDraft===pin?.composerDraft?'':t.composerDraft,composerAttachments:t.composerAttachments===pin?.composerAttachments?[]:t.composerAttachments}
        }),removedTaskIds:[...new Set([...(state.removedTaskIds??[]),...ids,...removed])],selectedTaskId:removed.includes(state.selectedTaskId)?PINNED_TASK_ID:state.selectedTaskId}
        persist(next);return next
      })
      await saveCatalogImmediately(get())
    },
    removeTask: async (id) => {
      if(id===PINNED_TASK_ID)return
      const task=get().tasks.find(t=>t.id===id);if(!task)return
      try{
        if(task.coordinatorTaskId){const result=await window.ackem.tasks.remove(task.coordinatorTaskId);if(!result.ok)throw Error('任务未删除');if(result.missing)await verifyLocalRecordStopped(task)}
        else {
          if(window.ackem.workbench.cancelTaskQueue)await window.ackem.workbench.cancelTaskQueue(task.id)
          await verifyLocalRecordStopped(task)
        }
        set((s) => {
        const next = {
          ...s,
          removedTaskIds:[...new Set([...(s.removedTaskIds??[]),id,...task.coordinatorTaskId?[task.coordinatorTaskId]:[]])],
          tasks: s.tasks.filter((t) => t.id !== id).map(t=>t.displayChildId===id?{...t,displayChildId:undefined}:t),
          selectedTaskId: s.selectedTaskId === id ? PINNED_TASK_ID : s.selectedTaskId
        }
        persist(next)
        return next
        })
        await saveCatalogImmediately(get())
      }catch(error){useAppStore.getState().pushToast(String(error))}
    },

    setComposerDraft: (taskId, text) =>
      set((s) => ({
        tasks: patchTask(s.tasks, taskId, (t) => ({ ...t, composerDraft: text }))
      })),

    setEditDraft: (taskId, text) =>
      set((s) => ({
        tasks: patchTask(s.tasks, taskId, (t) => ({ ...t, editDraft: text }))
      })),

    addAttachment: (taskId, att) => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task) return '找不到任务'
      const images = task.composerAttachments.filter((a) => a.kind === 'image')
      const others = task.composerAttachments.filter((a) => a.kind !== 'image')
      if (att.kind === 'image') {
        if (images.length >= 4) return '图片最多 4 张'
        if (att.size > 8 * 1024 * 1024) return '单张图不超过 8MB'
      } else if (others.length >= 10) {
        return '文档和文件夹合计最多 10 个'
      }
      set((s) => {
        const next = {
          ...s,
          tasks: patchTask(s.tasks, taskId, (t) => ({
            ...t,
            composerAttachments: [...t.composerAttachments, att]
          }))
        }
        persist(next)
        return next
      })
      return null
    },

    removeAttachment: (taskId, attId) =>
      set((s) => {
        const next = {
          ...s,
          tasks: patchTask(s.tasks, taskId, (t) => ({
            ...t,
            composerAttachments: t.composerAttachments.filter((a) => a.id !== attId)
          }))
        }
        persist(next)
        return next
      }),

    setEffort: (taskId, effort) => {
      saveTask(taskId, t => ({ ...t, effort }))
      if(taskId===PINNED_TASK_ID){const current=ackemCurrentTask(get().tasks);if(current)saveTask(current.id,t=>({...t,effort}))}
    },

    setExecutionMode: (taskId, executionMode) => {
      saveTask(taskId, t => ({ ...t, executionMode }))
      if(taskId===PINNED_TASK_ID){const current=ackemCurrentTask(get().tasks);if(current)saveTask(current.id,t=>({...t,executionMode}))}
    },

    setTrust: (taskId, trust) => {
      if(taskId===PINNED_TASK_ID){const current=ackemCurrentTask(get().tasks);if(current){get().setTrust(current.id,trust)}else{saveTask(taskId,t=>({...t,trust}));set({trustConfirmOpen:false})}return}
      const mutationId=crypto.randomUUID()
      saveTask(taskId,t=>({...t,desiredPermissionMutationId:mutationId,permissionMutationSerial:(t.permissionMutationSerial??0)+1}))
      void (async () => {
        try {
          const { sessionId } = await ensureRuntimeSession(taskId)
          const task=get().tasks.find(t=>t.id===taskId)
          if(task?.desiredPermissionMutationId!==mutationId)return
          const mode = trust === 'full' ? 'bypassPermissions' : trust === 'session' ? 'acceptEdits' : 'default'
          const result = await window.ackem.workbench.mode({ sessionId, mode,mutationId,expectedPolicyRevision:task.policyRevision })
          if (!result.ok) throw new Error('权限模式未生效')
          saveTask(taskId, task=>task.desiredPermissionMutationId!==mutationId?task:result.policyRevision!==undefined&&result.policyRevision<(task.policyRevision??0)?({...task,desiredPermissionMutationId:undefined}):({...task,trust,policyRevision:Math.max(task.policyRevision??0,result.policyRevision??0),desiredPermissionMutationId:undefined}))
          set({ trustConfirmOpen: false })
        } catch (error) {saveTask(taskId,t=>t.desiredPermissionMutationId===mutationId?{...t,desiredPermissionMutationId:undefined}:t);useAppStore.getState().pushToast(String(error))}
      })()
    },

    setModelLabel: (taskId, label) =>
      set((s) => {
        const next = { ...s, tasks: patchTask(s.tasks, taskId, (t) => ({ ...t, modelLabel: label })) }
        persist(next)
        return next
      }),

    send: (taskId,scheduling) => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task) return
      const text = task.composerDraft.trim()
      if (!text && task.composerAttachments.length === 0) return
      if (task.editingTurnId) {
        get().cancelEdit(taskId)
      }
      if (taskId === PINNED_TASK_ID) {
        const current=ackemCurrentTask(get().tasks)
        const retry=get().tasks.find(t=>inAckemArea(t)&&t.pendingSubmit&&t.composerDraft.trim()===text&&JSON.stringify(t.composerAttachments)===JSON.stringify(task.composerAttachments))
        scheduling??=retry?retry.pendingSubmit?.scheduling:current&&canStopWorkbenchTask(current)?'enqueue':undefined
        const newId=retry?.id??(scheduling?get().addTask(null):current?.id??get().addTask(null))
        saveTask(newId, child => ({ ...child, ackemArea:true,composerDraft: task.composerDraft, composerAttachments: task.composerAttachments, trust: current?.trust??task.trust, effort:current?.effort??task.effort,executionMode:current?.executionMode??task.executionMode??'agent',cwd: child.cwd??task.cwd }))
        saveTask(taskId, pin => ({ ...pin,displayChildId:scheduling&&current&&canStopWorkbenchTask(current)?current.id:newId, composerDraft: '', composerAttachments: [] }))
        get().selectTask(PINNED_TASK_ID)
        void submitTaskRequest(newId,true,scheduling)
      } else {
        const pending=task.turns.find(turn=>turn.id===task.pendingSubmit?.requestId)
        const retry=pending?.userText.trim()===text&&JSON.stringify(pending?.attachments)===JSON.stringify(task.composerAttachments)
        void submitTaskRequest(taskId,false,scheduling!==undefined?scheduling:retry?task.pendingSubmit?.scheduling:canStopWorkbenchTask(task)||task.runtimeQueue?.length?'enqueue':undefined)
      }
    },

    injectChatDispatch: (input) => {
      const taskId = input.taskId ? get().tasks.find(t => t.coordinatorTaskId === input.taskId)?.id ?? input.taskId : PINNED_TASK_ID
      const existing = get().tasks.find((t) => t.id === taskId)
      if (!existing) {
        if (input.taskId) void window.ackem.tasks.snapshot(input.taskId).then(snapshot => { if(snapshot){get().applyTaskSnapshot(snapshot);get().injectChatDispatch(input)} }).catch(() => {})
        return
      }
      if (existing.turns.some((turn) => turn.id === input.turnId)) {
        saveTask(taskId,current=>({...current,runtimeSessionId:input.sessionId,runtimeRunId:input.queued?current.runtimeRunId:input.runId,cwd:input.cwd,status:current.coordinatorTaskId?current.status:'running',turns:current.turns.map(turn=>turn.id===input.turnId?{...turn,actor:'user',userText:input.text}:turn)}))
        return
      }
      set((s) => {
        const next = { ...s, selectedTaskId: s.selectedTaskId, tasks: patchTask(s.tasks, taskId, (current) => ({
          ...current,
          cwd: input.cwd,
          runtimeSessionId: input.sessionId,
          runtimeRunId: input.queued ? current.runtimeRunId : input.runId,
          title: current.title === '新任务' ? autoTitleFromText(input.text) : current.title,
          status: current.coordinatorTaskId ? current.status : input.queued ? (current.status === 'draft' ? 'running' : current.status) : 'running',
          updatedAt: Date.now(),
          queuedFollow: input.queued ? [...current.queuedFollow, input.text] : current.queuedFollow,
          turns: [...current.turns, {
            id: input.turnId, userText: input.text, attachments: [],
            processSummary: current.coordinatorTaskId ? '' : input.queued ? '已进入内核队列' : '连接 AckemCode…',
            thoughtSeconds: 0, thoughtLines: [], thoughtOpen: false,
            assistantText: '', createdAt: Date.now()
          }]
        })) }
        persist(next)
        return next
      })
      const pending = earlyPinnedEvents.get(input.turnId) ?? []
      earlyPinnedEvents.delete(input.turnId)
      for (const event of pending) get().applyRuntimeEvent(event)
    },

    sendEdit: (taskId) => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task?.editingTurnId) return
      if (!task.editDraft.trim() && task.editAttachments.length === 0) return
      set({ editSendConfirmOpen: true })
    },

    abort: (taskId) => {
      if(taskId===PINNED_TASK_ID){const current=ackemCurrentTask(get().tasks);if(current)get().abort(current.id);return}
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task) return
      const pending=task.turns.filter(t=>t.inputState==='sending'||t.inputState==='received'||!task.coordinatorTaskId&&task.status==='unknown'&&t.id===task.turns.at(-1)?.id)
      for(const turn of pending){markTurn(taskId,turn.id,t=>({...t,inputState:'cancelled',thoughtCancelled:true,processSummary:'正在停止这条输入…'}));void (inAckemArea(task)?window.ackem.tasks.cancel(turn.id):window.ackem.workbench.cancelInput(turn.id)).then(()=>saveTask(taskId,current=>({...current,status:current.turns.at(-1)?.id===turn.id&&!current.turns.some(t=>t.inputState==='sending'||t.inputState==='received')?'waiting':current.status,turns:current.turns.map(t=>t.id===turn.id?{...t,processSummary:'这条输入已停止'}:t)}))).catch(error=>{saveTask(taskId,current=>({...current,status:current.turns.at(-1)?.id===turn.id?'unknown':current.status}));useAppStore.getState().pushToast(String(error))})}
      if(!task.coordinatorTaskId){if(!pending.length&&task.runtimeSessionId)void window.ackem.workbench.abort(task.runtimeSessionId).then(()=>get().hydrateRuntime()).catch(error=>useAppStore.getState().pushToast(String(error)));return}
      void window.ackem.tasks.stop(task.coordinatorTaskId).then(async () => {
        const snapshot = await window.ackem.tasks.snapshot(task.coordinatorTaskId!)
        if (snapshot) get().applyTaskSnapshot(snapshot)
      }).catch((error) => useAppStore.getState().pushToast(String(error)))
      const last = task.turns[task.turns.length - 1]
      if (last) markTurn(taskId, last.id, (turn) => ({ ...turn, processSummary: '正在请求停止…' }))
    },

    beginEditLastTurn: (taskId) => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task || task.status === 'running' || task.status === 'waiting') return
      const last = task.turns[task.turns.length - 1]
      if (!last) return
      set((s) => {
        const next = {
          ...s,
          editSendConfirmOpen: false,
          tasks: patchTask(s.tasks, taskId, (t) => ({
            ...t,
            editingTurnId: last.id,
            editDraft: last.userText,
            editAttachments: last.attachments
          }))
        }
        persist(next)
        return next
      })
    },

    cancelEdit: (taskId) => {
      set((s) => {
        const next = {
          ...s,
          editSendConfirmOpen: false,
          tasks: patchTask(s.tasks, taskId, (t) => ({
            ...t,
            editingTurnId: null,
            editDraft: '',
            editAttachments: []
          }))
        }
        persist(next)
        return next
      })
    },

    confirmEditSend: (taskId) => {
      set({ editSendConfirmOpen: false })
      const task = get().tasks.find(t => t.id === taskId)
      if (!task?.editingTurnId) return
      saveTask(taskId, current => ({ ...current, composerDraft: current.editDraft, composerAttachments: current.editAttachments, editingTurnId: null, editDraft: '', editAttachments: [] }))
      get().send(taskId)
    },

    setEditSendConfirmOpen: (editSendConfirmOpen) => set({ editSendConfirmOpen }),

    toggleThought: (taskId, turnId) =>
      set((s) => {
        const next = {
          ...s,
          tasks: patchTask(s.tasks, taskId, (t) => ({
            ...t,
            turns: t.turns.map((turn) =>
              turn.id === turnId ? { ...turn, thoughtOpen: !turn.thoughtOpen } : turn
            )
          }))
        }
        persist(next)
        return next
      }),

    resolveApproval: (taskId, turnId, resolved) => {
      const task = get().tasks.find((t) => t.id === taskId)
      const approval = task?.turns.find((x) => x.id === turnId)?.approval
      if (!task?.runtimeSessionId || !approval?.requestId) return
      const request = approval.kind === 'plan'
        ? window.ackem.workbench.planDecision({ sessionId: task.runtimeSessionId, requestId: approval.requestId,
            decision: resolved === 'allow' ? 'approve' : 'reject' })
        : window.ackem.workbench.permission({ sessionId: task.runtimeSessionId, requestId: approval.requestId,
            decision: resolved === 'allow' ? 'allow' : 'deny', toolName: approval.toolName })
      void request.then((result) => {
        if (!result.ok) throw new Error('权限请求已失效')
        markTurn(taskId, turnId, (turn) => ({
          ...turn, approval: turn.approval ? { ...turn.approval, resolved } : undefined
        }), resolved === 'allow' ? 'running' : 'waiting')
      }).catch((error) => useAppStore.getState().pushToast(String(error)))
    },
    answerQuestion: (taskId, turnId, answers, cancelled = false) => {
      const task = get().tasks.find((item) => item.id === taskId)
      const approval = task?.turns.find((item) => item.id === turnId)?.approval
      if (!task?.runtimeSessionId || !approval?.requestId) return
      void window.ackem.workbench.answer({ sessionId: task.runtimeSessionId,
        requestId: approval.requestId, answers, cancelled }).then((result) => {
        if (!result.ok) throw new Error('问题已经失效')
        markTurn(taskId, turnId, (turn) => ({ ...turn,
          approval: turn.approval ? { ...turn.approval, resolved: cancelled ? 'deny' : 'allow' } : undefined
        }), 'running')
      }).catch((error) => useAppStore.getState().pushToast(String(error)))
    },

    openRail: (tab) =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task) return s
        const railTabs = task.pane.railTabs.includes(tab) ? task.pane.railTabs : [...task.pane.railTabs, tab]
        const next = patchSelectedPane(s, { railOpen: true, railTab: tab, railTabs })
        persist(next)
        return { ...s, ...next }
      }),
    closeRail: () =>
      set((s) => {
        const next = patchSelectedPane(s, { railOpen: false })
        persist(next)
        return { ...s, ...next }
      }),
    closeRailTab: (tab) =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task) return s
        const railTabs = task.pane.railTabs.filter((id) => id !== tab)
        const pane: Partial<TaskPane> =
          railTabs.length === 0
            ? { railOpen: false, railTabs, railTab: 'changes' }
            : { railTabs, railTab: task.pane.railTab === tab ? railTabs[railTabs.length - 1] : task.pane.railTab }
        const next = patchSelectedPane(s, pane)
        persist(next)
        return { ...s, ...next }
      }),
    setRailWidth: (railWidth) => set({ railWidth: Math.max(320, Math.min(640, railWidth)) }),
    addRailTab: (tab) => get().openRail(tab),

    openPath: (path) => {
      const task = selectedTaskOf(get())
      if (!task) return
      const route = routeOpenPath(task, path)
      if (route.kind === 'doc') get().openDoc(route.path)
      else if (route.kind === 'changes') get().openChange(route.path)
      else get().openRail('files')
    },
    openChange: (path) =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task) return s
        const railTabs: RailTab[] = task.pane.railTabs.includes('changes')
          ? task.pane.railTabs
          : [...task.pane.railTabs, 'changes']
        const next = patchSelectedPane(s, {
          railOpen: true,
          railTab: 'changes',
          railTabs,
          changeFilePath: path ?? task.pane.changeFilePath
        })
        persist(next)
        return { ...s, ...next }
      }),

    openDoc: (path, source) =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task) return s
        const railTabs: RailTab[] = task.pane.railTabs.includes('doc') ? task.pane.railTabs : [...task.pane.railTabs, 'doc']
        const next = patchSelectedPane(s, {
          railOpen: true,
          railTab: 'doc',
          railTabs,
          docPath: path,
          docSource: resolveDocSource(task, path, source),
          docMode: 'preview'
        })
        persist(next)
        if (!source && task.cwd) {
          void window.ackem.workbench.readFile({ cwd: task.cwd, path }).then((content) => {
            saveTask(task.id, (current) => withPane(current, { docSource: content }))
          }).catch((error) => useAppStore.getState().pushToast(String(error)))
        }
        return { ...s, ...next }
      }),
    setDocMode: (docMode) =>
      set((s) => {
        const next = patchSelectedPane(s, { docMode })
        persist(next)
        return { ...s, ...next }
      }),

    setBrowserInput: (browserInput) =>
      set((s) => {
        const next = patchSelectedPane(s, { browserInput })
        persist(next)
        return { ...s, ...next }
      }),
    goBrowser: (url) =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task) return s
        if (url === '') {
          const next = patchSelectedPane(s, { browserUrl: '', browserInput: '' })
          persist(next)
          return { ...s, ...next }
        }
        let nextUrl = (url ?? task.pane.browserInput).trim()
        if (!nextUrl) return s
        if (!/^https?:\/\//i.test(nextUrl)) nextUrl = `https://${nextUrl}`
        const title = nextUrl.replace(/^https?:\/\//, '').split('/')[0] || nextUrl
        const browserRecents = [{ title, url: nextUrl }, ...task.pane.browserRecents.filter((r) => r.url !== nextUrl)].slice(0, 8)
        const truncated = task.pane.browserHistory.slice(0, task.pane.browserIndex + 1)
        const browserHistory = truncated[truncated.length - 1] === nextUrl ? truncated : [...truncated, nextUrl]
        const railTabs: RailTab[] = task.pane.railTabs.includes('browser') ? task.pane.railTabs : [...task.pane.railTabs, 'browser']
        const next = patchSelectedPane(s, {
          browserUrl: nextUrl,
          browserInput: nextUrl,
          browserHistory,
          browserIndex: browserHistory.length - 1,
          browserRecents,
          railOpen: true,
          railTab: 'browser',
          railTabs
        })
        persist(next)
        return { ...s, ...next }
      }),
    browserBack: () =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task || task.pane.browserIndex <= 0) return s
        const browserIndex = task.pane.browserIndex - 1
        const browserUrl = task.pane.browserHistory[browserIndex]
        const next = patchSelectedPane(s, { browserIndex, browserUrl, browserInput: browserUrl })
        persist(next)
        return { ...s, ...next }
      }),
    browserForward: () =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task || task.pane.browserIndex >= task.pane.browserHistory.length - 1) return s
        const browserIndex = task.pane.browserIndex + 1
        const browserUrl = task.pane.browserHistory[browserIndex]
        const next = patchSelectedPane(s, { browserIndex, browserUrl, browserInput: browserUrl })
        persist(next)
        return { ...s, ...next }
      }),

    setFileQuery: (fileQuery) =>
      set((s) => {
        const next = patchSelectedPane(s, { fileQuery })
        persist(next)
        return { ...s, ...next }
      }),
    browseFiles: (files) =>
      set((s) => {
        const task = selectedTaskOf(s)
        if (!task || files.length === 0) return s
        const added = files.map((file) => fileRecentOf(file))
        const current = fileRecentsForTask(task, s.workspaces)
        const fileRecents = [...added, ...current.filter((r) => !added.some((a) => a.path === r.path))].slice(0, 20)
        const md = added.find((f) => isMarkdownPath(f.path))
        const pane: Partial<TaskPane> = md
          ? {
              railOpen: true,
              railTab: 'doc' as const,
              railTabs: task.pane.railTabs.includes('doc') ? task.pane.railTabs : [...task.pane.railTabs, 'doc'],
              docPath: md.path,
              docSource: resolveDocSource(task, md.path),
              docMode: 'preview' as const,
              fileRecents: task.workspaceId ? task.pane.fileRecents : fileRecents
            }
          : {
              railOpen: true,
              railTab: 'files' as const,
              railTabs: task.pane.railTabs.includes('files') ? task.pane.railTabs : [...task.pane.railTabs, 'files'],
              fileRecents: task.workspaceId ? task.pane.fileRecents : fileRecents
            }
        let next = patchSelectedPane(s, pane)
        if (task.workspaceId) {
          next = {
            ...next,
            workspaces: next.workspaces.map((w) => (w.id === task.workspaceId ? { ...w, fileRecents } : w))
          }
        }
        persist(next)
        return { ...s, ...next }
      }),
    newFile: (name, cwd) => {
      if (!cwd) { useAppStore.getState().pushToast('请先选择工作区'); return }
      void window.ackem.workbench.createFile({ cwd, name }).then((path) => {
        get().openDoc(path, '')
        saveTask(get().selectedTaskId, (task) => withPane(task, {
          fileRecents: [{ name, folder: folderName(cwd), path }, ...task.pane.fileRecents]
        }))
      }).catch((error) => useAppStore.getState().pushToast(String(error)))
    },
    openFileRecent: (path) => get().openPath(path),
    setTerminalInput: (terminalInput) =>
      set((s) => {
        const next = patchSelectedPane(s, { terminalInput })
        return { ...s, ...next }
      }),
    submitTerminal: () => {
      const task = selectedDisplayTaskOf(get())
      if (!task) return
      const command = task.pane.terminalInput.trim()
      if (!command) return
      const cwd = task.pane.terminalCwd === '~' ? task.cwd : task.pane.terminalCwd
      if (!cwd) { useAppStore.getState().pushToast('请先选择工作区'); return }
      saveTask(task.id, (current) => withPane(current, {
        terminalInput: '', terminalLines: [...current.pane.terminalLines, {
          id: nid(), text: `${cwd}> ${command}`, kind: 'in'
        }]
      }))
      void window.ackem.workbench.terminalExec({ cwd, command }).then((result) => {
        saveTask(task.id, (current) => withPane(current, {
          terminalLines: [...current.pane.terminalLines, {
            id: nid(), text: result.output || '命令已执行', kind: 'out'
          }]
        }))
      }).catch((error) => useAppStore.getState().pushToast(String(error)))
    },
    setNewWorkspaceOpen: (newWorkspaceOpen) => set({ newWorkspaceOpen }),
    setNewTaskOpen: (newTaskOpen) => set({ newTaskOpen }),
    setPlusMenuOpen: (plusMenuOpen) => set({ plusMenuOpen }),
    setTrustConfirmOpen: (trustConfirmOpen) => set({ trustConfirmOpen }),
    openSettings: () => useAppStore.getState().openSettingsAt('settings-models'),
    applyTaskSnapshot: (snapshot) => {
      set((state) => {
        if(state.removedTaskIds?.includes(snapshot.id))return state
        let current = state.tasks.find(t => t.coordinatorTaskId === snapshot.id || t.id === snapshot.id) ?? state.tasks.find(t => t.id === snapshot.originConversationId && t.id !== PINNED_TASK_ID && !t.coordinatorTaskId)
        if (current?.goalRevision && snapshot.goalRevision < current.goalRevision) return state
        if (current?.controlEpoch !== undefined && snapshot.controlEpoch < current.controlEpoch) return state
        if (current?.projectionUpdatedAt !== undefined && snapshot.updatedAt < current.projectionUpdatedAt && current.goalRevision === snapshot.goalRevision) return state
        const newlyProjected=!current
        if (!current) {
          const template = state.tasks.find(t => t.id === PINNED_TASK_ID) ?? state.tasks[0]
          if (!template) return state
          current = { ...template, id: snapshot.id, pinned: false, workspaceId: null, effort:snapshot.effort??'medium',executionMode:snapshot.executionMode??'agent',turns: [], composerDraft: '', composerAttachments: [], editingTurnId: null, editDraft: '', editAttachments: [], pane: emptyPane(snapshot.cwd) }
        }
        const resultBody=executionResultText(snapshot)
        const resultTurnId=snapshot.currentRunId??'result:'+snapshot.id
        let turns=current.turns.map(turn=>{
          if(turn.inputState==='queued'&&snapshot.state!=='queued')turn={...turn,inputState:'settled',processSummary:snapshot.state==='paused'?'已取消排队':''}
          const closed=['paused','failed','completed','cancelling'].includes(snapshot.state)||!!snapshot.reviewIssue
          const approval=closed&&turn.approval&&!turn.approval.resolved?{...turn.approval,resolved:'expired' as const}:turn.approval
          if(turn.id!==resultTurnId)return approval===turn.approval?turn:{...turn,approval}
          return{...turn,goalRevision:snapshot.goalRevision,approval,...(resultBody?{assistantText:resultBody,assistantTextKind:snapshot.executionResult?.kind??(snapshot.execution?.state==='succeeded'||snapshot.state==='completed'?'final' as const:turn.assistantTextKind),executionEndedAt:turn.executionEndedAt??snapshot.updatedAt,processSummary:snapshot.state==='paused'?(snapshot.userSummary||'已停止'):snapshot.state==='reviewing'?'正在核对执行结果…':'执行已结束'}:snapshot.state==='paused'&&snapshot.executionQuiescent!==false?{executionEndedAt:turn.executionEndedAt??snapshot.updatedAt,processSummary:snapshot.userSummary||'已停止'}:snapshot.state==='reviewing'?{processSummary:'正在核对执行结果…'}:{})}
        })
        if(resultBody&&!turns.some(turn=>turn.id===resultTurnId))turns=[...turns,{id:resultTurnId,goalRevision:snapshot.goalRevision,actor:'ackem',userText:snapshot.goal,attachments:[],assistantText:resultBody,assistantTextKind:snapshot.executionResult?.kind??(snapshot.execution?.state==='succeeded'||snapshot.state==='completed'?'final':undefined),processSummary:'执行已结束',executionEndedAt:snapshot.updatedAt,createdAt:snapshot.createdAt,thoughtSeconds:0,thoughtLines:[],thoughtOpen:false}]
        const projected: WorkbenchTask = { ...current,ackemArea:snapshot.supervisionPolicy==='ackem_managed'||current.ackemArea, coordinatorTaskId: snapshot.id, taskState: snapshot.state,queueOrder:snapshot.queueOrder, goalRevision: snapshot.goalRevision, controlEpoch: snapshot.controlEpoch,
          trust:(snapshot.policyRevision??1)>=(current.policyRevision??0)&&!current.desiredPermissionMutationId?trustFromRuntimeMode(snapshot.permissionMode):current.trust,policyRevision:Math.max(current.policyRevision??0,snapshot.policyRevision??1),
          deliverySurface: snapshot.deliverySurface,deliveryConversationId:snapshot.deliveryConversationId??snapshot.originConversationId,executionSettled:isTaskExecutionSettled(snapshot), title: autoTitleFromText(snapshot.goal), cwd: snapshot.cwd,
          runtimeSessionId: snapshot.codeSessionId, runtimeRunId: snapshot.currentRunId, updatedAt: snapshot.updatedAt,projectionUpdatedAt:snapshot.updatedAt,
          turns,
          status: isTaskExecutionSettled(snapshot)&&['unknown','reviewing'].includes(snapshot.state)?'done':taskStatus(snapshot.state) }
        const next = { ...state, tasks: state.tasks.some(t => t.id === current!.id) ? state.tasks.map(t => t.id === current!.id ? projected : t) : [...state.tasks, projected] }
        if(inAckemArea(projected))next.tasks=next.tasks.map(t=>t.id===PINNED_TASK_ID&&(!t.displayChildId||newlyProjected&&snapshot.deliverySurface==='chat')?{...t,displayChildId:projected.id}:t)
        persist(next)
        return next
      })
      const pending = earlyTaskEvents.get(snapshot.id) ?? []
      earlyTaskEvents.delete(snapshot.id)
      for (const event of pending) get().applyRuntimeEvent(event)
    },
    applyTaskEvent: (event) => {
      if(event.type==='received'&&event.requestId){for(const task of get().tasks.filter(t=>t.turns.some(turn=>turn.id===event.requestId)))markTurn(task.id,event.requestId,turn=>({...turn,inputState:turn.inputState==='cancelled'?'cancelled':'received',processSummary:turn.inputState==='cancelled'?'已请求停止':'要求已持久接收，正在理解…'}));return}
      if(event.type==='removed'){
        set(state=>{const owned=state.tasks.filter(t=>t.coordinatorTaskId===event.taskId||t.id===event.taskId);const ids=[event.taskId,...owned.map(t=>t.id)];const next={...state,tasks:state.tasks.filter(t=>!ids.includes(t.id)).map(t=>t.displayChildId&&ids.includes(t.displayChildId)?{...t,displayChildId:undefined}:t),removedTaskIds:[...new Set([...(state.removedTaskIds??[]),...ids])],selectedTaskId:ids.includes(state.selectedTaskId)?PINNED_TASK_ID:state.selectedTaskId};persist(next);return next});return
      }
      if (event.snapshot) get().applyTaskSnapshot(event.snapshot)
      else void window.ackem.tasks.snapshot(event.taskId).then(snapshot => { if(snapshot)get().applyTaskSnapshot(snapshot) }).catch(() => {})
      const task = get().tasks.find(t => t.coordinatorTaskId === event.taskId)
      const turn = task?.turns.find(t => t.id === event.requestId)
      if (task && turn && event.message) markTurn(task.id, turn.id, t => ({ ...t, thoughtLines: [...t.thoughtLines, { id: nid(), text: event.message! }] }))
    },
    hydrateRuntime: async () => {
      if (!catalogHydrated) {
        catalogHydrated = true
        try {
          const disk = await window.ackem.workbench.loadCatalog()
          if (disk && typeof disk === 'object' &&
            Array.isArray((disk as PersistShape).tasks) &&
            (disk as PersistShape).tasks.some((task) => task.id === PINNED_TASK_ID)) {
            const restored = ensureLoaded(disk as PersistShape)
            set((state) => ({ ...state, ...restored }))
            localStorage.setItem(STORAGE_KEY, JSON.stringify(restored))
          }
        } catch (error) { useAppStore.getState().pushToast(`任务目录读取失败：${String(error)}`) }
      }
      if (window.ackem.tasks) {
        try { for (const snapshot of await window.ackem.tasks.list()) get().applyTaskSnapshot(snapshot) }
        catch(error) { useAppStore.getState().pushToast(`任务状态读取失败：${String(error)}`) }
      }
      for (const task of get().tasks) {
        if (task.coordinatorTaskId) continue
        if(window.ackem.workbench.inputQueue)try{const queue=await window.ackem.workbench.inputQueue(task.id);saveTask(task.id,t=>({...t,runtimeQueue:queue.items,queuedFollow:queue.items.map(item=>item.text)}))}catch{/* Keep the last durable queue projection on a disconnected runtime. */}
        if (!task.runtimeSessionId) continue
        try {
          const [snapshot, queue] = await Promise.all([
            window.ackem.workbench.snapshot(task.runtimeSessionId),
            window.ackem.workbench.inputQueue?window.ackem.workbench.inputQueue(task.id):window.ackem.workbench.queue(task.runtimeSessionId)
          ])
          saveTask(task.id, (current) => ({
            ...current,
            status:snapshot.standaloneReceipt?.requestId===(current.runtimeRunId??current.turns.filter(turn=>turn.inputState!=='queued').at(-1)?.id)?statusFromReceipt(snapshot.standaloneReceipt?.state,current.status):snapshot.supervisionState === 'reviewing' ? 'running' : snapshot.supervisionState === 'waiting_user' || snapshot.supervisionState === 'blocked' ? 'waiting' : snapshot.supervisionState === 'interrupted' ? 'unknown' : !current.runtimeRunId || snapshot.hostTurnReceipt?.hostRunId === current.runtimeRunId
              ? statusFromReceipt(snapshot.hostTurnReceipt?.state, current.status) : current.status,
            trust:current.permissionMutationSerial!==task.permissionMutationSerial||current.desiredPermissionMutationId||(snapshot.policyRevision??0)<(current.policyRevision??0)?current.trust:snapshot.mode==='plan'&&!snapshot.permissionMode?current.trust:trustFromRuntimeMode(snapshot.permissionMode??snapshot.mode),
            policyRevision:Math.max(current.policyRevision??0,snapshot.policyRevision??0),
            turns: current.turns.map((turn, index) => {
              if (turn.assistantText ||(snapshot.standaloneReceipt?turn.id!==snapshot.standaloneReceipt.requestId: index !== current.turns.length - 1)||
                !(snapshot.standaloneReceipt?.requestId===turn.id&&snapshot.standaloneReceipt.state==='succeeded')&&(snapshot.hostTurnReceipt?.hostRunId !== current.runtimeRunId ||snapshot.hostTurnReceipt?.state !== 'succeeded')) return turn
              const last = [...(snapshot.history ?? [])].reverse().find((row) => row.role === 'assistant' && typeof row.content === 'string')
              return last && typeof last.content === 'string' ? { ...turn, assistantText: last.content,processSummary:'任务完成' } : turn
            }),
            queuedFollow: queue.items.map((item) => item.text),
            runtimeQueue: queue.items
          }))
        } catch(error) {
          saveTask(task.id, (current) => ({ ...current, status: 'unknown',turns:current.turns.map((turn,index)=>index===current.turns.length-1?{...turn,processSummary:`无法连接或核对 AckemCode：${String(error)}`} :turn) }))
        }
      }
    },
    applyRuntimeEvent: ({ taskId, turnId, event,goalRevision,controlEpoch }) => {
      if(get().removedTaskIds?.includes(taskId))return
      if (!get().tasks.some(t => t.coordinatorTaskId === taskId || t.id === taskId)) {
        if (earlyTaskEvents.size >= 32 && !earlyTaskEvents.has(taskId)) earlyTaskEvents.delete(earlyTaskEvents.keys().next().value!)
        const pending = earlyTaskEvents.get(taskId) ?? []
        if (pending.length < 2000) pending.push({ taskId, turnId, event,goalRevision,controlEpoch })
        earlyTaskEvents.set(taskId, pending)
        return
      }
      const coordinated = get().tasks.find(t => t.coordinatorTaskId === taskId)
      if(coordinated){
        if(goalRevision!==undefined&&goalRevision!==coordinated.goalRevision||controlEpoch!==undefined&&controlEpoch!==coordinated.controlEpoch)return
        const kind=event&&typeof event==='object'?String((event as Record<string,unknown>).type):''
        if(['assistant_delta','assistant_message','thinking','tool_start','tool_result','session_state'].includes(kind)&&(coordinated.runtimeRunId&&turnId!==coordinated.runtimeRunId||coordinated.executionSettled||['cancelling','paused','completed','failed'].includes(coordinated.taskState??'')))return
      }
      if (coordinated) {
        taskId = coordinated.id
        if (!coordinated.turns.some(t => t.id === turnId)) saveTask(taskId, task => ({ ...task, turns: [...task.turns, {
          id: turnId,goalRevision:coordinated.goalRevision, actor: 'ackem', userText: '', attachments: [], processSummary: '', thoughtSeconds: 0,
          thoughtLines: [], thoughtOpen: false, assistantText: '', createdAt: Date.now()
        }] }))
      }

      const supervisionEvent = event as Record<string, unknown> | null
      if (supervisionEvent?.type === 'supervisor_turn' && coordinated) {
        markTurn(taskId, turnId, turn => ({ ...turn, actor: 'ackem', userText: String(supervisionEvent.text ?? ''), attachments: Array.isArray(supervisionEvent.attachments) ? supervisionEvent.attachments as Attachment[] : [] }))
        return
      }
      if (supervisionEvent?.type === 'supervisor_turn') {
        get().injectChatDispatch({turnId,text:String(supervisionEvent.text),cwd:String(supervisionEvent.cwd),sessionId:String(supervisionEvent.sessionId),runId:String(supervisionEvent.runId)})
        markTurn(taskId,turnId,turn=>({...turn,actor:'ackem',attachments:Array.isArray(supervisionEvent.attachments)?supervisionEvent.attachments as typeof turn.attachments:turn.attachments}))
        return
      }
      if (taskId === PINNED_TASK_ID && !get().tasks.find(t => t.id === taskId)?.turns.some(t => t.id === turnId)) {
        if (earlyPinnedEvents.size >= 16 && !earlyPinnedEvents.has(turnId)) earlyPinnedEvents.delete(earlyPinnedEvents.keys().next().value!)
        const pending = earlyPinnedEvents.get(turnId) ?? []
        if (pending.length < 2000) pending.push({ taskId, turnId, event })
        earlyPinnedEvents.set(turnId, pending)
        return
      }
      if (!event || typeof event !== 'object') return
      const ev = event as Record<string, unknown>
      const type = ev.type
      if(type==='input_queue'){const items=Array.isArray(ev.items)?ev.items as Array<{id:string;text:string}>:[];saveTask(taskId,t=>({...t,runtimeQueue:items,queuedFollow:items.map(item=>item.text)}));return}
      if(type==='input_queued'){markTurn(taskId,turnId,turn=>({...turn,inputState:'queued',processSummary:'已进入等待队列'}));return}
      if(type==='queue_blocked'){markTurn(taskId,turnId,turn=>({...turn,processSummary:'等待停止核实，仍保留在队列'}));useAppStore.getState().pushToast('下一项仍在等待队列：'+String(ev.message??'停止尚未确认'));return}
      const local=get().tasks.find(t=>t.id===taskId)
      if(!coordinated&&local?.runtimeRunId&&local.turns.some(turn=>turn.id===local.runtimeRunId)&&turnId!==local.runtimeRunId&&['thinking','assistant_delta','assistant_message','tool_start','tool_result','session_state','attachments_loaded','error','transport_error','transport_disconnected','permission_request','plan_approval','enter_plan_approval','ask_user','abort_ack'].includes(String(type)))return
      if(['thinking','assistant_delta','assistant_message','tool_start','tool_result','attachments_loaded'].includes(String(type))){markTurn(taskId,turnId,turn=>projectWorkActivity(turn,ev));return}
      if(type==='work_reply'){
        const reply=ev.reply as {type:string;text?:string;generationState?:'incomplete'}
        markTurn(taskId,turnId,turn=>turn.inputState==='cancelled'?turn:({...turn,assistantText:reply.type==='delta'?turn.assistantText+(reply.text??''):reply.type==='replace'||reply.type==='completed'?reply.text??turn.assistantText:turn.assistantText,thoughtLines:reply.type==='reasoning'?[...turn.thoughtLines,{id:nid(),text:reply.text??''}]:turn.thoughtLines,processSummary:reply.type==='failed'?reply.text??'回复未完成':reply.type==='completed'?(reply.generationState==='incomplete'?'回复尚未完整':''):'正在回复…',generationState:reply.generationState}))
        return
      }else if(type==='mode_changed'){
        saveTask(taskId,task=>Number(ev.policyRevision??0)<(task.policyRevision??0)||task.desiredPermissionMutationId?task:({...task,trust:ev.mode==='plan'?task.trust:trustFromRuntimeMode(String(ev.permissionMode??ev.mode)),policyRevision:Number(ev.policyRevision??task.policyRevision??0),executionMode:ev.mode==='plan'?'plan':'agent'}))
        const current=get().tasks.find(t=>t.id===taskId)
        if(current&&inAckemArea(current))saveTask(PINNED_TASK_ID,task=>({...task,executionMode:ev.mode==='plan'?'plan':'agent'}))
      } else if(type==='input_received'){
        markTurn(taskId,turnId,turn=>({...turn,inputState:turn.inputState==='cancelled'?'cancelled':'received',processSummary:'输入已持久接收…'}))
      } else if(type==='standalone_session'){
        saveTask(taskId,task=>({...task,status:'running',runtimeRunId:turnId,runtimeSessionId:String(ev.sessionId),cwd:String(ev.cwd),runtimeQueue:task.runtimeQueue?.filter(item=>item.id!==turnId),turns:task.turns.map(turn=>turn.id===turnId?{...turn,inputState:'received',processSummary:'正在执行'}:turn),...(!task.desiredPermissionMutationId&&Number(ev.policyRevision??0)>=(task.policyRevision??0)?{policyRevision:Number(ev.policyRevision??task.policyRevision??0),trust:ev.permissionMode?trustFromRuntimeMode(String(ev.permissionMode)):task.trust}: {})}))
      } else if(type==='session_state'){
        const labels:Record<string,string>={running:'AckemCode 正在执行',requires_action:'等待批准或补充信息',idle:'AckemCode 已连接'}
        markTurn(taskId,turnId,turn=>({...turn,processSummary:labels[String(ev.state)]??'AckemCode 已连接'}))
      } else if(type==='attachments_loaded'){
        markTurn(taskId,turnId,turn=>({...turn,processSummary:'AckemCode 已读取附件',thoughtLines:[...turn.thoughtLines,{id:nid(),text:JSON.stringify(ev.items??[])}]}))
      } else if(type==='error'){
        markTurn(taskId,turnId,turn=>({...turn,processSummary:String(ev.message??'AckemCode 执行出错')}),'failed')
      } else if (type === 'supervisor_note') {
        markTurn(taskId,turnId,turn=>({...turn,supervisionNotes:[...(turn.supervisionNotes??[]),{text:String(ev.text),at:Number(ev.at),actor:String(ev.actor)}]}),ev.state==='completed'?'done':ev.state==='reviewing'||ev.state==='running'?'running':ev.state==='waiting_user'||ev.state==='blocked'||ev.state==='user_control'?'waiting':ev.state==='interrupted'?'unknown':undefined)
      } else if (type === 'supervisor_permission_resolved') {
        markTurn(taskId,turnId,turn=>({...turn,approval:turn.approval && turn.approval.requestId===ev.requestId?{...turn.approval,resolved:ev.decision==='deny'?'deny':'allow'}:turn.approval}))
      } else if (type === 'assistant_delta'  && typeof ev.text === 'string') {
        markTurn(taskId, turnId, (turn) => ({ ...turn, processSummary: 'AckemCode 正在回复', assistantText: turn.assistantText + ev.text }))
      } else if (type === 'assistant_message' && typeof ev.text === 'string') {
        markTurn(taskId, turnId, (turn) => ({ ...turn, processSummary: '已收到 AckemCode 回复', assistantText: ev.text as string }))
      } else if (type === 'status' && typeof ev.message === 'string') {
        if(ev.code==='permission_timeout'){markTurn(taskId,turnId,turn=>({...turn,stopReason:String(ev.message),processSummary:String(ev.message)}));return}
        const message=String(ev.message)
        const label=/thinking|continue \(turn/i.test(message)?'正在分析下一步…':/parallel tools|streaming tools/i.test(message)?'正在准备工具操作…':/compact/i.test(message)?'正在整理上下文…':/正在准备任务/.test(message)?message:undefined
        if(label)markTurn(taskId, turnId, (turn) => ({ ...turn, processSummary:label }))
      } else if (type === 'thinking') {
        markTurn(taskId, turnId, (turn) => ({
          ...turn, processSummary:'AckemCode 正在思考', thoughtSeconds: typeof ev.elapsedSec === 'number' ? ev.elapsedSec : turn.thoughtSeconds,
          thoughtLines: typeof ev.text === 'string' && ev.text ? [...turn.thoughtLines, { id: nid(), text: ev.text as string }] : turn.thoughtLines
        }))
      } else if (type === 'tool_start' && typeof ev.name === 'string') {
        markTurn(taskId, turnId, (turn) => ({
          ...turn, processSummary: `正在执行 ${ev.name}`,
          thoughtLines: [...turn.thoughtLines, { id: nid(), text: `调用 ${ev.name}` }]
        }))
      } else if (type === 'tool_result' && typeof ev.name === 'string') {
        markTurn(taskId, turnId, (turn) => ({
          ...turn, processSummary: `${ev.name} ${ev.ok === true ? '完成' : '失败'}`,
          thoughtLines: [...turn.thoughtLines, { id: nid(), text: `${ev.name} ${ev.ok === true ? '完成' : '失败'}${typeof ev.output === 'string' && ev.output ? `\n${ev.output.slice(0, 4000)}` : ''}` }]
        }))
      } else if (type === 'file_changed' && typeof ev.path === 'string') {
        markTurn(taskId, turnId, (turn) => {
          const path = ev.path as string
          const diff = typeof ev.diff === 'string' ? ev.diff : ''
          const files = [...(turn.filesChanged?.files ?? []).filter((file) => file.path !== path), {
            path, diff, added: diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
            removed: diff.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')).length
          }]
          return { ...turn, filesChanged: {
            count: files.length, added: files.reduce((sum, file) => sum + file.added, 0),
            removed: files.reduce((sum, file) => sum + file.removed, 0), files
          } }
        })
      } else if (type === 'permission_request' && typeof ev.requestId === 'string') {
        markTurn(taskId, turnId, (turn) => ({ ...turn, approval: {
          kind: 'permission',
          requestId: ev.requestId as string, toolName: String(ev.toolName ?? ''),
          title: `允许 ${String(ev.toolName ?? '工具')}？`, detail: String(ev.reason ?? ''),
          path: typeof ev.input === 'object' && ev.input ? String((ev.input as Record<string, unknown>).file_path ?? '') : undefined
        } }), 'waiting')
      } else if ((type === 'plan_approval' || type === 'enter_plan_approval') && typeof ev.requestId === 'string') {
        markTurn(taskId, turnId, (turn) => ({ ...turn, approval: {
          kind: 'plan', requestId: ev.requestId as string,
          title: type === 'plan_approval' ? '审批执行计划' : '允许进入计划模式？',
          detail: typeof ev.plan === 'string' ? ev.plan : 'AckemCode 请求进入计划模式'
        } }), 'waiting')
      } else if (type === 'ask_user' && typeof ev.requestId === 'string') {
        const questions = Array.isArray(ev.questions) ? ev.questions.filter((item): item is { question: string; options: Array<{ label: string }> } =>
          !!item && typeof item === 'object' && typeof (item as { question?: unknown }).question === 'string').map((item) => ({
            question: item.question, options: Array.isArray(item.options) ? item.options : []
          })) : []
        markTurn(taskId, turnId, (turn) => ({ ...turn, approval: {
          kind: 'question', requestId: ev.requestId as string, title: 'AckemCode 需要你的回答',
          detail: '', questions
        } }), 'waiting')
      } else if (type === 'message_dequeued') {
        saveTask(taskId, (task) => ({ ...task, turns: task.turns.some((turn) => turn.id === turnId)
          ? task.turns.map((turn) => turn.id === turnId ? { ...turn, processSummary: '内核正在处理排队消息' } : turn)
          : [...task.turns, { id: turnId, userText: String(ev.text ?? ''), attachments: [],
              processSummary: '内核正在处理排队消息', thoughtSeconds: 0, thoughtLines: [], thoughtOpen: false,
              assistantText: '', createdAt: Date.now() }]
        }))
        void get().hydrateRuntime()
      } else if (type === 'message_queued' || type === 'queue_updated') {
        const task = get().tasks.find((item) => item.id === taskId)
        if (task?.runtimeSessionId) void get().hydrateRuntime()
      } else if (type === 'done') {
        const receipt = ev.hostTurnReceipt as { hostRunId?: string; state?: string } | undefined
        const current = get().tasks.find((item) => item.id === taskId)
        const trusted = receipt?.hostRunId === current?.runtimeRunId
        const standalone=ev.standaloneReceipt as {requestId?:string;state?:string}|undefined
        const standaloneTrusted=!current?.coordinatorTaskId&&standalone?.requestId===turnId
        const status: CoarseStatus = (standaloneTrusted&&standalone?.state==='succeeded'||trusted && receipt?.state === 'succeeded') && ev.ok === true
          ? 'done' : standaloneTrusted&&standalone?.state==='aborted'?'paused':standaloneTrusted&&standalone?.state==='failed'||trusted && (receipt?.state === 'failed' || receipt?.state === 'aborted') ? 'failed' : 'unknown'
        markTurn(taskId, turnId, (turn) => ({
          ...turn,executionEndedAt:Date.now(),activities:turn.activities?.map(a=>a.endedAt?a:{...a,endedAt:Date.now()}),approval:turn.approval&&!turn.approval.resolved?{...turn.approval,resolved:'expired'}:turn.approval,inputState:turn.inputState==='cancelled'||standaloneTrusted&&standalone?.state==='aborted'?'cancelled':'settled', processSummary:turn.stopReason|| (status === 'unknown' ? '终态回执未核实，请稍后对账' : status === 'done' ? (current?.coordinatorTaskId ? '本轮执行已结束，正在核对任务' : '任务完成') :standaloneTrusted&&standalone?.state==='aborted'?'已停止': String(ev.error ?? '任务失败'))
        }), !current?.coordinatorTaskId&&current?.runtimeRunId&&current.turns.some(turn=>turn.id===current.runtimeRunId)&&current.runtimeRunId!==turnId?undefined:status)
         // 阶段 5 准确单轮变更: 终态后从内核文件历史快照取权威文件清单。
         if (status === 'done' && current && current.runtimeSessionId && current.cwd && current.cwd !== '~' && typeof window !== 'undefined') {
           void window.ackem.workbench.fileHistory(current.runtimeSessionId).then((history) => {
             const snapshots = (history as { snapshots?: Array<{ files?: string[] }> }).snapshots
             const last = Array.isArray(snapshots) ? snapshots[snapshots.length - 1] : undefined
             if (last && Array.isArray(last.files) && last.files.length > 0) {
               const fc = { count: last.files.length, added: last.files.length, removed: 0,
                 files: last.files.map((f) => ({ path: f, added: 0, removed: 0, diff: '' })) }
               useWorkbenchStore.setState((st) => ({ ...st, tasks: patchTask(st.tasks, taskId, (t) => ({
                 ...t, filesChanged: fc
               })) }))
             }
           }).catch(() => { /* file-history 为增强显示, 失败保留 tool_result 卡 */ })
         }      } else if (type === 'transport_disconnected' || type === 'transport_error') {
        markTurn(taskId, turnId, (turn) => ({
          ...turn, processSummary: type === 'transport_error' ? String(ev.message ?? '连接出错') : '连接中断，正在核对状态'
        }), 'unknown')
        void get().hydrateRuntime()
      } else if (type === 'abort_ack') {
        const receipt = ev.hostTurnReceipt as { state?: string } | undefined
        if (receipt?.state === 'aborted') markTurn(taskId, turnId, (turn) => ({ ...turn, thoughtCancelled: true, processSummary: '已停止' }), 'failed')
      }
    },
    runQueuedNow:async(taskId,itemId)=>{
      const task=get().tasks.find(t=>t.id===taskId);if(!task)return
      try{if(task.coordinatorTaskId)await window.ackem.tasks.runQueuedNow(task.coordinatorTaskId);else if(itemId)await window.ackem.workbench.promoteInput(itemId);await get().hydrateRuntime()}catch(error){useAppStore.getState().pushToast(String(error))}
    },
    removeQueued: async (taskId, itemId) => {
      const task=get().tasks.find(t=>t.id===taskId)
      if(task?.coordinatorTaskId){try{get().applyTaskSnapshot(await window.ackem.tasks.stop(task.coordinatorTaskId))}catch(error){useAppStore.getState().pushToast(String(error))}return}
      if(task?.turns.some(turn=>turn.id===itemId)){
        try{await window.ackem.workbench.cancelInput(itemId);saveTask(taskId,t=>({...t,runtimeQueue:t.runtimeQueue?.filter(item=>item.id!==itemId),turns:t.turns.map(turn=>turn.id===itemId?{...turn,inputState:'cancelled',processSummary:'已取消排队'}:turn)}))}catch(error){useAppStore.getState().pushToast(String(error))}return
      }
      const sessionId = get().tasks.find((task) => task.id === taskId)?.runtimeSessionId
      if (!sessionId) return
      try {
        await window.ackem.workbench.removeQueued({ sessionId, itemId })
        markTurn(taskId, `queued-${itemId}`, (turn) => ({ ...turn, processSummary: '已从队列移除' }))
        await get().hydrateRuntime()
      } catch (error) { useAppStore.getState().pushToast(String(error)) }
    }
  }
})

function statusFromReceipt(state: string | undefined, fallback: CoarseStatus): CoarseStatus {
  if (state === 'succeeded') return 'done'
  if (state === 'failed') return 'failed'
  if (state === 'aborted'||state==='cancelled')return 'paused'
  if (state === 'requires_action') return 'waiting'
  if (state === 'running') return 'running'
  return fallback === 'running' || fallback === 'waiting' ? 'unknown' : fallback
}

function trustFromRuntimeMode(mode: string | undefined): TrustLevel {
  if (mode === 'bypassPermissions') return 'full'
  if (mode === 'acceptEdits') return 'session'
  return 'ask'
}

function saveTask(taskId: string, update: (task: WorkbenchTask) => WorkbenchTask): void {
  useWorkbenchStore.setState((state) => {
    const next = { ...state, tasks: patchTask(state.tasks, taskId, update) }
    persist(next)
    return next
  })
}

function markTurn(taskId: string, turnId: string, update: (turn: TurnBlock) => TurnBlock, status?: CoarseStatus): void {
  saveTask(taskId, (task) => ({
    ...task, status: task.coordinatorTaskId ? task.status : status ?? task.status, updatedAt: task.coordinatorTaskId ? task.updatedAt : Date.now(),
    turns: task.turns.map((turn) => turn.id === turnId ? update(turn) : turn)
  }))
}

async function ensureRuntimeSession(taskId: string): Promise<{ sessionId: string; cwd: string }> {
  const state = useWorkbenchStore.getState()
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error('任务已删除')
  let cwd = task.cwd || state.workspaces.find((item) => item.id === task.workspaceId)?.folderPath
  // An omitted folder delegates to the same managed workspace as chat dispatch.
  const session = await window.ackem.workbench.open({ cwd: cwd === '~' ? undefined : cwd, sessionId: task.runtimeSessionId })
  cwd = session.cwd || cwd
  if (!cwd || cwd === '~') throw new Error('AckemCode 未返回有效工作目录')
  saveTask(taskId, (current) => ({ ...current, cwd, runtimeSessionId: session.sessionId,trust:current.desiredPermissionMutationId||session.mode==='plan'&&!session.permissionMode?current.trust:trustFromRuntimeMode(session.permissionMode??session.mode),policyRevision:Math.max(current.policyRevision??0,session.policyRevision??0) }))
  return { sessionId: session.sessionId, cwd }
}

export function taskStatus(state: TaskState): CoarseStatus {
  return state === 'completed' ? 'done' : state === 'failed' ? 'failed' : state === 'paused'?'paused': state === 'unknown' ? 'unknown' : state === 'running' || state === 'reviewing' || state === 'cancelling' ? 'running' : 'waiting'
}
const submittingTasks = new Set<string>()
let inputSequence=0
async function submitTaskRequest(localId: string,pinnedScope=false,scheduling?:WorkScheduling): Promise<void> {
  const store=useWorkbenchStore.getState(),task=store.tasks.find(t=>t.id===localId)
  if(!task)return
  const text=task.composerDraft.trim(),attachments=[...task.composerAttachments]
  if(!text&&!attachments.length)return
  if(attachments.some(a=>!a.path)){useAppStore.getState().pushToast('附件路径不可用，请重新选择附件');return}
  const signature=JSON.stringify({text,attachments,cwd:task.cwd,trust:task.trust,effort:task.effort,executionMode:task.executionMode??'agent',scheduling})
  const retry=task.pendingSubmit?.signature===signature?task.pendingSubmit:undefined
  const requestId=retry?.requestId??crypto.randomUUID(),submittedAt=retry?.submittedAt??Date.now(),sequence=retry?.inputSequence??++inputSequence
  if(submittingTasks.has(requestId))return
  const candidateTaskIds=task.ackemArea?(retry?.candidateTaskIds??[...new Set([...(task.coordinatorTaskId?[task.coordinatorTaskId]:[]),...store.tasks.filter(t=>inAckemArea(t)&&t.coordinatorTaskId).slice(-11).map(t=>t.coordinatorTaskId!)])]):undefined
  saveTask(localId,current=>({...current,status:!inAckemArea(task)&&scheduling&&current.runtimeRunId&&current.runtimeRunId!==requestId?current.status:'running',pendingSubmit:{requestId,signature,candidateTaskIds,submittedAt,inputSequence:sequence,scheduling},composerDraft:'',composerAttachments:[],turns:current.turns.some(t=>t.id===requestId)?current.turns.map(t=>t.id===requestId?{...t,inputState:'sending',processSummary:'正在发送要求…'}:t):[...current.turns,{id:requestId,actor:'user',userText:text,attachments,createdAt:submittedAt,inputSequence:sequence,inputState:'sending',processSummary:'正在发送要求…',thoughtSeconds:0,thoughtLines:[],thoughtOpen:false,assistantText:''}]}))
  submittingTasks.add(requestId)
  try{
    if(!inAckemArea(task)){
      const result=await window.ackem.workbench.send({taskId:localId,turnId:requestId,sessionId:task.runtimeSessionId,text,cwd:task.cwd,submittedAt,inputSequence:sequence,scheduling,permissionMode:task.trust==='full'?'bypassPermissions':task.trust==='session'?'acceptEdits':'default',effort:task.effort,executionMode:task.executionMode??'agent',attachments:attachments.map(a=>({kind:a.kind,path:a.path!,name:a.name}))})
      saveTask(localId,current=>({...current,runtimeSessionId:result.sessionId??current.runtimeSessionId,pendingSubmit:current.pendingSubmit?.requestId===requestId?undefined:current.pendingSubmit,turns:current.turns.map(turn=>turn.id===requestId&&result.queued&&current.runtimeRunId!==requestId?{...turn,inputState:'queued',processSummary:'已进入等待队列'}:turn)}))
      return
    }
    const result=await window.ackem.tasks.submit({requestId,origin:'workbench',conversationId:localId,taskId:task.ackemArea?undefined:task.coordinatorTaskId,candidateTaskIds,text,cwd:task.cwd,submittedAt,inputSequence:sequence,scheduling,permissionMode:task.trust==='full'?'bypassPermissions':task.trust==='session'?'acceptEdits':'default',effort:task.effort,executionMode:task.executionMode??'agent',attachments:attachments.map(a=>({path:a.path!,kind:a.kind==='folder'?'dir':a.kind==='image'?'image':'file',name:a.name}))})
    let targetLocalId=localId
    if(result.taskId&&task.coordinatorTaskId&&result.taskId!==task.coordinatorTaskId){
      const snapshot=await window.ackem.tasks.snapshot(result.taskId);if(snapshot)useWorkbenchStore.getState().applyTaskSnapshot(snapshot)
      const target=useWorkbenchStore.getState().tasks.find(t=>t.coordinatorTaskId===result.taskId)
      if(!target)throw Error('新任务已接收，暂时无法核对记录；可重试同一请求')
      targetLocalId=target.id
      const originalTurn=useWorkbenchStore.getState().tasks.find(t=>t.id===localId)?.turns.find(t=>t.id===requestId)
      saveTask(localId,t=>({...t,pendingSubmit:t.pendingSubmit?.requestId===requestId?undefined:t.pendingSubmit,turns:t.turns.filter(turn=>turn.id!==requestId)}))
      if(originalTurn)saveTask(targetLocalId,t=>({...t,ackemArea:true,turns:t.turns.some(turn=>turn.id===requestId)?t.turns:[...t.turns,originalTurn]}))
      if(pinnedScope)saveTask(PINNED_TASK_ID,t=>({...t,displayChildId:targetLocalId}));else useWorkbenchStore.getState().selectTask(targetLocalId)
    }
    const nowTask=useWorkbenchStore.getState().tasks.find(t=>t.id===localId)
    const cancelled=nowTask?.turns.find(t=>t.id===requestId)?.inputState==='cancelled'||result.disposition==='cancelled'
    saveTask(targetLocalId,current=>({...current,pendingSubmit:current.pendingSubmit?.requestId===requestId?undefined:current.pendingSubmit,coordinatorTaskId:result.taskId??current.coordinatorTaskId,status:!(result.taskId??current.coordinatorTaskId)&&(result.disposition==='responded'||result.disposition==='needs_clarification'||cancelled)?'done':current.status,turns:current.turns.map(turn=>turn.id!==requestId?turn:{...turn,inputState:cancelled?'cancelled':'settled',processSummary:cancelled?'这条输入已停止':turn.generationState==='incomplete'?'回复尚未完整，可继续要求补全':'',assistantText:cancelled?turn.assistantText:(result.disposition==='responded'||result.disposition==='needs_clarification'?result.message??'':turn.assistantText),thoughtLines:!cancelled&&result.message&&result.disposition!=='responded'&&result.disposition!=='needs_clarification'?[...turn.thoughtLines,{id:nid(),text:result.message}]:turn.thoughtLines})}))
    if(cancelled){if(result.taskId)await window.ackem.tasks.stop(result.taskId);return}
    if(result.taskId){const snapshot=await window.ackem.tasks.snapshot(result.taskId);if(snapshot){useWorkbenchStore.getState().applyTaskSnapshot(snapshot);if(snapshot.state==='queued')markTurn(targetLocalId,requestId,turn=>({...turn,inputState:'queued',processSummary:'已进入等待队列'}))}}
  }catch(error){
    const active=useWorkbenchStore.getState().tasks.find(task=>task.id===localId)?.runtimeRunId
    markTurn(localId,requestId,turn=>({...turn,inputState:turn.inputState==='cancelled'?'cancelled':'failed',processSummary:'要求发送失败，可在输入框重试'}),task.coordinatorTaskId||active&&active!==requestId?undefined:'failed')
    const current=useWorkbenchStore.getState(),source=task.ackemArea&&current.selectedTaskId===PINNED_TASK_ID?PINNED_TASK_ID:localId
    if(source!==localId)saveTask(localId,t=>({...t,composerDraft:t.composerDraft||text,composerAttachments:t.composerAttachments.length?t.composerAttachments:attachments}))
    saveTask(source,t=>({...t,composerDraft:t.composerDraft||text,composerAttachments:t.composerAttachments.length?t.composerAttachments:attachments}))
    useAppStore.getState().pushToast('要求发送失败：'+String(error))
  }finally{submittingTasks.delete(requestId)}
}
