import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync,realpathSync } from 'node:fs'
import { dirname,relative,isAbsolute,resolve } from 'node:path'

export type HostTaskContext = {
  taskId: string
  goalRevision: number
  controlEpoch: number
  fencingToken: number
  /** Host inspection contract; independent of the user permission mode. */
  readOnly?: boolean
  allowedReadPaths?: string[]
  allowedResourcePaths?:string[]
  readOnlyResourcePaths?:string[]
  excludedResourcePaths?:string[]
  deadline?:number;maxContextTokens?:number;maxModelCalls?:number
}
export type HostTaskState = { permissionMode?:string;mode?:string;hostTask?: HostTaskContext; hostTaskStopped?: boolean; hostProcessPending?: number; hostProcessUnknown?: boolean; hostTaskHeld?: boolean; hostTaskHoldUnknown?: boolean }
export const TASK_PROTOCOL = {
  protocolVersion: 3,
  capabilities: { taskBinding: true, goalRevisionFence: true, toolBoundary: true, stopSettlement: true, processTreeCancel: true, taskBudgets:true,scopedInspection:true,executionOptions:true,fullMachineAccess:true }
} as const

export function parseHostTask(raw: unknown): HostTaskContext | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const v = raw as Record<string, unknown>
  if (typeof v.taskId !== 'string' || !v.taskId.trim() || v.taskId.length > 200) return undefined
  for (const key of ['goalRevision', 'controlEpoch', 'fencingToken']) {
    if (typeof v[key] !== 'number' || !Number.isSafeInteger(v[key]) || (v[key] as number) < (key === 'controlEpoch' ? 0 : 1)) return undefined
  }
  if (v.readOnly !== undefined && typeof v.readOnly !== 'boolean') return undefined
  if(v.allowedReadPaths!==undefined&&(!Array.isArray(v.allowedReadPaths)||v.allowedReadPaths.length>30||v.allowedReadPaths.some(p=>typeof p!=='string')))return undefined
  for(const key of ['allowedResourcePaths','readOnlyResourcePaths','excludedResourcePaths'])if(v[key]!==undefined&&(!Array.isArray(v[key])||(v[key] as unknown[]).length>100||(v[key] as unknown[]).some(p=>typeof p!=='string'||!isAbsolute(p))))return undefined
  const budget:Pick<HostTaskContext,'deadline'|'maxContextTokens'|'maxModelCalls'>={}
  for(const key of ['deadline','maxContextTokens','maxModelCalls'] as const){if(v[key]!==undefined){if(typeof v[key]!=='number'||!Number.isFinite(v[key])||Number(v[key])<=0)return undefined;budget[key]=v[key] as number}}
  return { ...budget,...(v.allowedResourcePaths?{allowedResourcePaths:v.allowedResourcePaths as string[]}:{}),...(v.readOnlyResourcePaths?{readOnlyResourcePaths:v.readOnlyResourcePaths as string[]}:{}),...(v.excludedResourcePaths?{excludedResourcePaths:v.excludedResourcePaths as string[]}:{}),...(v.readOnly !== undefined ? { readOnly: v.readOnly as boolean } : {}),...(v.allowedReadPaths?{allowedReadPaths:v.allowedReadPaths as string[]}:{}), taskId: v.taskId.trim(), goalRevision: v.goalRevision as number, controlEpoch: v.controlEpoch as number, fencingToken: v.fencingToken as number }
}
export function sameHostTask(a: HostTaskContext, b: HostTaskContext): boolean {
  return a.taskId === b.taskId && a.goalRevision === b.goalRevision && a.controlEpoch === b.controlEpoch && a.fencingToken === b.fencingToken && Boolean(a.readOnly) === Boolean(b.readOnly)&&JSON.stringify(a.allowedReadPaths)===JSON.stringify(b.allowedReadPaths)&&JSON.stringify(a.allowedResourcePaths)===JSON.stringify(b.allowedResourcePaths)&&JSON.stringify(a.readOnlyResourcePaths)===JSON.stringify(b.readOnlyResourcePaths)&&JSON.stringify(a.excludedResourcePaths)===JSON.stringify(b.excludedResourcePaths)
}
export function assertHostReadScope(tool:string,input:Record<string,unknown>,cwd:string):void {
  const state=scope.getStore()?.state,binding=state?.hostTask
  // Permission comes from the live host-owned session, never a tool argument.
  // A cwd is a starting location under full access, not a filesystem allowlist.
  const fullMachineAccess=isFullMachineAccess()
  if(binding?.allowedResourcePaths||binding?.excludedResourcePaths?.length||binding?.readOnlyResourcePaths?.length){
    const actualPath=(path:string):string=>{let existing=resolve(cwd,path);const suffix:string[]=[];while(!existsSync(existing)){const parent=dirname(existing);if(parent===existing)throw Error('host_task_path_out_of_scope');suffix.unshift(relative(parent,existing));existing=parent}const actual=resolve(realpathSync(existing),...suffix);return process.platform==='win32'?actual.toLowerCase():actual}
    const within=(root:string,target:string)=>{const rel=relative(root,target);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel))}
    const roots=(binding.allowedResourcePaths??[]).map(actualPath),excluded=(binding.excludedResourcePaths??[]).map(actualPath)
    const readOnly=(binding.readOnlyResourcePaths??[]).map(actualPath)
    const readable=['read_file','list_dir','glob','grep','attachment_read'].includes(tool)
    const allowed=readable?roots:roots.filter(root=>!readOnly.includes(root))
    const check=(path:string)=>{const target=actualPath(path);if(!fullMachineAccess&&binding.allowedResourcePaths&&!allowed.some(root=>within(root,target))||excluded.some(root=>within(root,target))||!readable&&readOnly.some(root=>within(root,target)))throw Error('host_task_path_out_of_scope')}
    const keys=['file_path','path','notebook_path','cwd','source_path','destination_path','output_path']
    for(const key of keys)if(typeof input[key]==='string')check(input[key] as string)
    if(['read_file','list_dir','glob','grep'].includes(tool)&&!keys.some(key=>typeof input[key]==='string'))check(cwd)
    if(['list_dir','glob','grep'].includes(tool)){
      const scan=actualPath(String(input.path??input.cwd??cwd))
      if(excluded.some(path=>within(scan,path)))throw Error('host_task_scope_traversal_not_provable')
    }
    if(['bash','powershell','shell'].includes(tool.toLowerCase())){
      // A free executable cannot prove compliance with a narrowed resource set.
      if(excluded.length||readOnly.length||!fullMachineAccess&&binding.allowedResourcePaths&&!roots.some(root=>within(root,actualPath(cwd))))throw Error('host_task_shell_scope_not_provable')
      const command=String(input.command??'')
      for(const match of command.matchAll(/[A-Za-z]:[\\/][^\s"'`;|<>]+/g))check(match[0])
      if(!fullMachineAccess&&/(?:^|[\s"'])\.\.[\\/]/.test(command))throw Error('host_task_path_out_of_scope')
    }
  }
  if(!binding?.readOnly||!binding.allowedReadPaths)return
  if(tool==='web_search'||tool==='web_fetch')return
  // Bounded inspection tasks receive concrete files, never broad filesystem traversal.
  if(tool!=='read_file')throw Error('host_inspection_path_out_of_scope')
  const value=input.file_path??input.path
  if(typeof value!=='string')throw Error('host_inspection_path_out_of_scope')
  const normalize=(path:string)=>{const actual=realpathSync(resolve(cwd,path));return process.platform==='win32'?actual.toLowerCase():actual}
  const actual=normalize(value)
  if(!binding.allowedReadPaths.some(path=>normalize(path)===actual))throw Error('host_inspection_path_out_of_scope')
}
export function updateHostTask(state: HostTaskState, next: HostTaskContext, stopped = false): void {
  const old = state.hostTask
  if (old && (old.taskId !== next.taskId || next.goalRevision < old.goalRevision || next.controlEpoch < old.controlEpoch || next.fencingToken < old.fencingToken)) throw new Error('host_task_stale')
  if (old && Boolean(old.readOnly) !== Boolean(next.readOnly) && old.goalRevision === next.goalRevision && old.controlEpoch === next.controlEpoch && old.fencingToken === next.fencingToken) throw new Error('host_task_stale')
  if (old && state.hostTaskStopped && sameHostTask(old, next) && !stopped) throw new Error('host_task_stopped')
  if (!old || !sameHostTask(old, next) || stopped) releaseHostTaskHold(state)
  state.hostTask = { ...next }
  state.hostTaskStopped = stopped
}
const scope = new AsyncLocalStorage<{ captured?: HostTaskContext; state: HostTaskState;modelCalls?:number }>()
/** Live session policy, inherited by descendants; tool input cannot enable it. */
export function isFullMachineAccess():boolean {
  const state=scope.getStore()?.state
  return (state?.permissionMode??state?.mode)==='bypassPermissions'&&!state?.hostTask?.readOnly
}
export function withHostTaskFence<T>(state: HostTaskState, run: () => T): T {
  return scope.run({ state, captured: state.hostTask ? { ...state.hostTask } : undefined }, run)
}
/** Executes at the actual tool boundary, after permission awaits, including child tools. */
const INSPECTION_READ_TOOLS = new Set(['read_file', 'list_dir', 'glob', 'grep', 'web_search', 'web_fetch'])
export function assertHostToolAllowed(tool?: string): void {
  const active = scope.getStore()
  if (!active) return // standalone CLI remains unchanged
  if(active.state.hostTask?.deadline&&Date.now()>=active.state.hostTask.deadline)throw Error('task_budget_exhausted:time')
  if (active.state.hostTaskStopped) throw new Error('host_task_stopped')
  if (active.state.hostTask && (!active.captured || !sameHostTask(active.captured, active.state.hostTask))) throw new Error('host_task_stale')
  if (tool && active.state.hostTask?.readOnly && !INSPECTION_READ_TOOLS.has(tool)) throw new Error('host_task_read_only')
}
export function consumeHostModelBudget(contextTokens:number):void{
  const active=scope.getStore();if(!active?.state.hostTask)return
  assertHostToolAllowed()
  const binding=active.state.hostTask
  if(binding.maxContextTokens&&contextTokens>binding.maxContextTokens)throw Error('task_budget_exhausted:context_tokens')
  if(binding.maxModelCalls&&(active.modelCalls??0)>=binding.maxModelCalls)throw Error('task_budget_exhausted:model_calls')
  active.modelCalls=(active.modelCalls??0)+1
}

/** Descendant shell ownership follows the same async scope as the tool fence. */
export function trackHostProcess(): (confirmed: boolean) => void {
  const state = scope.getStore()?.state
  if (!state?.hostTask) return () => {}
  state.hostProcessPending = (state.hostProcessPending ?? 0) + 1
  let released = false
  return confirmed => {
    if (released) return
    released = true
    state.hostProcessPending = Math.max(0, (state.hostProcessPending ?? 1) - 1)
    if (!confirmed) state.hostProcessUnknown = true
  }
}

const inspectionSessions = new Set<string>()
export function setHostInspectionSession(sessionId: string, readOnly: boolean): void {
  if (readOnly) inspectionSessions.add(sessionId)
  else inspectionSessions.delete(sessionId)
}
export function isHostInspection(sessionId?: string): boolean {
  return scope.getStore()?.state.hostTask?.readOnly === true || (sessionId !== undefined && inspectionSessions.has(sessionId))
}

const holdWaiters = new WeakMap<HostTaskState, Set<() => void>>()
export function releaseHostTaskHold(state: HostTaskState): void {
  state.hostTaskHeld = false
  const waiters = holdWaiters.get(state)
  if (waiters) for (const wake of [...waiters]) wake()
}
/** Only local, proven quiescence can settle an interpretation timeout, never a lost process. */
export function settleHostTaskHold(state:HostTaskState,quiescent:boolean):boolean {
  if(!state.hostTaskHoldUnknown||!quiescent||state.hostProcessPending||state.hostProcessUnknown)return false
  state.hostTaskHoldUnknown=false
  return true
}
export function setHostTaskHeld(state: HostTaskState, context: HostTaskContext, held: boolean): void {
  if (!state.hostTask || !sameHostTask(state.hostTask, context)) throw new Error('host_task_stale')
  if (state.hostTaskStopped || state.hostTaskHoldUnknown) throw new Error('host_task_stopped')
  if (held) state.hostTaskHeld = true
  else releaseHostTaskHold(state)
}
/** A transient input interpretation hold has no permission or goal-change semantics. */
export async function awaitHostTaskReady(tool: string, signal?: AbortSignal, timeoutMs = 15_000): Promise<void> {
  const state = scope.getStore()?.state
  assertHostToolAllowed(tool)
  if (signal?.aborted) throw new Error('aborted')
  if (!state?.hostTaskHeld) return
  await new Promise<void>((resolve, reject) => {
    const waiters = holdWaiters.get(state) ?? new Set<() => void>()
    holdWaiters.set(state, waiters)
    const cleanup = () => { clearTimeout(timer); waiters.delete(wake); signal?.removeEventListener('abort', aborted) }
    const wake = () => { cleanup(); resolve() }
    const aborted = () => { cleanup(); reject(new Error('aborted')) }
    const timer = setTimeout(() => {
      state.hostTaskHoldUnknown = true
      state.hostTaskStopped = true
      cleanup()
      releaseHostTaskHold(state)
      reject(new Error('host_task_hold_timeout'))
    }, Math.min(15_000, Math.max(1, timeoutMs)))
    waiters.add(wake)
    signal?.addEventListener('abort', aborted, { once:true })
    if (signal?.aborted) aborted()
    else if (!state.hostTaskHeld) wake()
  })
  if (signal?.aborted) throw new Error('aborted')
  assertHostToolAllowed(tool)
}
