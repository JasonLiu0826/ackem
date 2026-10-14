import { submitStandaloneWork, cancelStandaloneInput, listStandaloneQueue, pumpStandaloneQueue, promoteStandaloneInput, standaloneExecutionReceipt, cancelStandaloneQueue, type StandaloneInput } from '../ackemcode/standaloneWorkService'
import { supervisorFor } from '../ackemcode/workSupervisorService'
export { supervisorFor, clearWorkSupervisorCache } from '../ackemcode/workSupervisorService'
import { runtime, pathFor, emit, type EventSink } from '../ackemcode/workRuntimeService'
export { emit } from '../ackemcode/workRuntimeService'
import {recordIndependentWork} from '../ackemcode/independentWork'
import { getTaskRuntime, submitChatTask } from '../tasks/runtime'
import { getHostSystem } from '../system/host'
import { loadChatImages } from '../chat/images'
import { WorkSupervisor } from '../ackemcode/workSupervisor'
import { createLlmJsonClient } from '../llmClient'
import { ensureDefaultWorkDirectory } from '../ackemcode/workDirectory'
import { getDatabase } from '../db/database'
import { ActionRepository } from '../memory/actions/actionRepository'
import { setCompanionTaskBusy } from '../companion/initiativeState'
import { appendUnifiedChatMessage } from '../chat/unifiedChatHistory'
import { broadcastToRenderers } from '../rendererBroadcast'
import { buildTaskDelivery } from '../chat/taskDelivery'
import { engineSessionId } from '../session/canonical'
import { app, BrowserWindow, ipcMain, type WebContents } from 'electron'
import { isAbsolute, join, resolve, basename } from 'node:path'
import { stat, writeFile, rename, mkdir, realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { registerWorkbenchTerminalIpc } from './workbenchTerminal'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { ackemCodeBaseUrl, ensureDaemon } from '../ackemcode/ensureDaemon'
import { codeSessionHeaders, newCodeSessionBinding, rememberCodeSessionBinding } from '../ackemcode/hostSessionBindings'
import { startChatStream, type AgentEvent, type KernelAttachment } from '../ackemcode/client'
import { loadSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import { openActionPort } from '../memory/adapters/composeMemorySystem'
import { stableActionRunId, withPersistedAction } from '../memory/adapters/actionExecution'
import { toReceiptEvent, trustedFrom } from '../ackemcode/receiptProjection'

const streams = new Map<string, string>()
const permissionWrites=new Map<string,{generation:number;tail:Promise<unknown>}>()
const execFileAsync = promisify(execFile)
let catalogWrite = Promise.resolve()

function userTakesControl(sessionId: string, reason: string): void {
  const root=resolveDataRoot(loadSettings())
  if(getDatabase(root)&&getTaskRuntime(root).repository.list().some(t=>t.codeSessionId===sessionId))return
  supervisorFor(root).takeover(sessionId, reason)
}

function catalogPath(): string {
  return resolve(app.getPath('userData'), 'workbench-tasks.json')
}

function changedPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  for (const key of ['file_path', 'path', 'filename']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim() as string
  }
  return null
}

async function actualDiff(cwd: string, relativePath: string): Promise<string> {
  const absolute = resolve(cwd, relativePath)
  if (absolute !== cwd && !absolute.startsWith(`${cwd}\\`) && !absolute.startsWith(`${cwd}/`)) return ''
  try {
    const result = await execFileAsync('git', ['diff', '--no-ext-diff', '--', absolute], { cwd, maxBuffer: 1024 * 1024 })
    if (result.stdout.trim()) return result.stdout
  } catch { /* directory may not be a Git checkout */ }
  const file = await stat(absolute).catch(() => null)
  if (!file?.isFile() || file.size > 128 * 1024) return ''
  const content = await readFile(absolute, 'utf8').catch(() => '')
  if (!content || content.includes('\0')) return ''
  const lines = content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  return `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}`
}

/** 记账观察者: 只记可信边界事件, 写失败发 transport_error。send 与 rerun-last 共用。 */
function observeToLedger(
  sender: EventSink,
  opts: { taskId: string; activeTurnId: string; runId: string; codeSessionId: string },
  port: NonNullable<ReturnType<typeof openActionPort>>,
  agentEvent: AgentEvent | { type: 'disconnected' } | { type: 'http_error'; message: string }
): boolean {
  if (agentEvent.type !== 'permission_request' && agentEvent.type !== 'done' &&
    agentEvent.type !== 'abort_ack' && agentEvent.type !== 'disconnected' &&
    agentEvent.type !== 'http_error' &&
    !('hostTurnReceipt' in agentEvent && agentEvent.hostTurnReceipt)) return true
  try {
    const recorded = port.record({ kind: 'runtime.received', receipt: {
      source: 'ackemcode', runId: opts.runId, codeSessionId: opts.codeSessionId,
      hostRunId: opts.runId, at: new Date().toISOString(), event: toReceiptEvent(agentEvent),
      trustedReceipt: 'hostTurnReceipt' in agentEvent ? trustedFrom(agentEvent.hostTurnReceipt) : undefined
    } })
    if (!recorded.ok) throw new Error(recorded.message)
    return true
  } catch (error) {
    emit(sender, opts.taskId, opts.activeTurnId, { type: 'transport_error', message: `记忆账本写入失败：${String(error)}` })
    return false
  }
}

export function registerWorkbenchIpc(): void {
  registerWorkbenchTerminalIpc()
  ipcMain.handle('workbench:model-info', (_event, sessionId?: string) => runtime(`/api/model-info${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`, sessionId ? { headers: codeSessionHeaders(sessionId) } : undefined))
  ipcMain.handle('workbench:supervision-list', () => supervisorFor(resolveDataRoot(loadSettings())).list())
  ipcMain.handle('workbench:supervision-answer',(_event,input:{taskId:string;requestId:string;answers:Record<string,string>})=>supervisorFor(resolveDataRoot(loadSettings())).answerQuestions(input.taskId,input.requestId,input.answers).then(()=>({ok:true})))
  ipcMain.handle('workbench:supervision-approval', (_event, input: {taskId:string;requestId:string;allow:boolean}) => supervisorFor(resolveDataRoot(loadSettings())).answer(input.taskId,input.requestId,input.allow).then(()=>({ok:true})))
  ipcMain.handle('workbench:supervision-control', async (_event, input: {sessionId:string;resume?:boolean}) => {
    const root=resolveDataRoot(loadSettings()), supervisor=supervisorFor(root)
    const managed=getDatabase(root)?getTaskRuntime(root).repository.list().find(t=>t.codeSessionId===input.sessionId):undefined
    if(managed){if(!input.resume)getTaskRuntime(root).coordinator.stop(managed.id);else await getTaskRuntime(root).coordinator.submit({requestId:randomUUID(),taskId:managed.id,conversationId:managed.originConversationId,origin:'workbench',text:'继续当前任务，核对已经完成的操作和最新要求。'},false,{kind:'amend',taskId:managed.id});return{ok:true}}
    const task=supervisor.list().filter(t=>t.codeSessionId===input.sessionId).at(-1)
    if(!task) throw Error('没有可接管的 Ackem 任务')
    if(!input.resume){supervisor.takeover(input.sessionId,'用户接管任务');await runtime(pathFor(input.sessionId,'/abort'),{method:'POST'});return{ok:true}}
    if(streams.has(input.sessionId))throw Error('请先等待或停止当前执行，再交回 Ackem')
    const snapshot=await runtime(pathFor(input.sessionId)) as {hostTurnReceipt?:{state:string}}
    if(snapshot.hostTurnReceipt?.state==='running'||snapshot.hostTurnReceipt?.state==='requires_action')throw Error('Runtime 仍在执行，请先停止当前轮')
    const resumed=supervisor.resume(task.id)
    await dispatchChatWorkJob({text:`继续原任务：${resumed.goal}\n先检查当前文件和历史，避免重复已经执行的操作。${resumed.nextStep??''}`,dataRoot:root,turnId:randomUUID(),correlationId:task.id,chatSessionId:task.chatSessionId,cwd:task.cwd,supervisorRootId:task.id})
    return{ok:true}
  })
  ipcMain.handle('workbench:catalog-load', async () => {
    try {
      const catalog=JSON.parse(await readFile(catalogPath(),'utf8')) as {tasks:Array<{id:string;turns:Array<Record<string,unknown>>}>}
      const pinned=catalog.tasks.find(t=>t.id===CHAT_PINNED_TASK_ID)
      if(pinned)pinned.turns??=[]
      if(pinned)for(const task of supervisorFor(resolveDataRoot(loadSettings())).list()){
        for(const note of task.log){
          const turnId=note.turnId??task.currentTurnId
          let turn=pinned.turns.find(t=>t.id===turnId)
          if(!turn){turn={id:turnId,userText:note.kind==='instruction'?note.text:task.goal,actor:'ackem',attachments:[],processSummary:'Ackem 监督记录',thoughtSeconds:0,thoughtLines:[],thoughtOpen:false,assistantText:'',createdAt:note.at};pinned.turns.push(turn)}
          const notes=(turn.supervisionNotes??[]) as Array<{text:string;at:number;actor:string}>
          if(!notes.some(n=>n.at===note.at&&n.text===note.text))notes.push({text:note.text,at:note.at,actor:note.actor})
          turn.supervisionNotes=notes
        }
      }
      return catalog
    }
    catch { return null }
  })
  ipcMain.handle('workbench:catalog-save', async (_event, catalog: unknown) => {
    const json = JSON.stringify(catalog)
    if (json.length > 4 * 1024 * 1024) throw new Error('任务目录超过保存上限')
    catalogWrite = catalogWrite.catch(() => undefined).then(async () => {
      const file = catalogPath()
      await mkdir(resolve(file, '..'), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      await writeFile(temp, json, 'utf8')
      await rename(temp, file)
    })
    await catalogWrite
    return { ok: true }
  })
  ipcMain.handle('workbench:open', async (_event, input: { cwd?: string; sessionId?: string }) => {
    const requested = input.cwd?.trim()
    const cwd = !requested || requested === '~' ? ensureDefaultWorkDirectory(resolveDataRoot(loadSettings())) : resolve(requested)
    if ((requested && requested !== '~' && !isAbsolute(requested)) || !(await stat(cwd).catch(() => null))?.isDirectory()) {
      throw new Error('请选择已存在的本机工作目录')
    }
    const ready = await ensureDaemon()
    if (!ready.ok) throw new Error(ready.reason || 'AckemCode 未就绪')
    if (input.sessionId) {
      const existing = await fetch(`${ackemCodeBaseUrl()}${pathFor(input.sessionId)}`, {headers:codeSessionHeaders(input.sessionId)})
      if (existing.ok) {
        const session = await existing.json() as { cwd?: string; sessionId: string }
        if (!session.cwd || resolve(session.cwd) === cwd) return { ...session, cwd }
      }
      if (!existing.ok && existing.status !== 404) throw new Error(`读取会话失败：${existing.status}`)
    }
    const session = await runtime('/api/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd })
    }) as Record<string, unknown>
    return { ...session, cwd }
  })

  ipcMain.handle('workbench:snapshot', async (_event, sessionId: string) => {
    const snapshot=await runtime(pathFor(sessionId)).catch(error=>{if(error?.status===404)return {sessionId,missing:true,executionQuiescent:true};throw error}) as Record<string,unknown>
    const supervised=supervisorFor(resolveDataRoot(loadSettings())).list().filter(t=>t.codeSessionId===sessionId).at(-1)
    const db=getDatabase(resolveDataRoot(loadSettings()))
    const hasInbox=db?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='standalone_work_inputs'").get()
    const standalone=hasInbox?standaloneExecutionReceipt(resolveDataRoot(loadSettings()),sessionId):undefined
    return {...snapshot,supervisionState:supervised?.state,...(standalone?{standaloneReceipt:standalone}:{})}
  })
  ipcMain.handle('workbench:queue', (_event, sessionId: string) => runtime(pathFor(sessionId, '/queue')))
  ipcMain.handle('workbench:queue-remove', (_event, input: { sessionId: string; itemId: string }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(input.itemId)) throw new Error('无效队列 ID')
    return runtime(pathFor(input.sessionId, `/queue/${input.itemId}`), { method: 'DELETE' })
  })
  ipcMain.handle('workbench:permission', async (_event, input: { sessionId: string; requestId: string; decision: 'allow' | 'deny'; toolName?: string }) => {
    userTakesControl(input.sessionId, '用户手动处理门禁')
    const result=await runtime(pathFor(input.sessionId, '/permission'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input)
    })
    if((result as {ok:boolean}).ok)supervisorFor(resolveDataRoot(loadSettings())).recordUserDecision(input.sessionId,input.requestId,input.decision==='allow')
    return result
  })
  ipcMain.handle('workbench:plan-decision', (_event, input: { sessionId: string; requestId: string; decision: 'approve' | 'reject' }) => {
    userTakesControl(input.sessionId, '用户手动处理执行计划')
    const root=resolveDataRoot(loadSettings())
    const taskRuntime=getDatabase(root)?getTaskRuntime(root):undefined
    const managed=taskRuntime?.repository.list().find(t=>t.codeSessionId===input.sessionId)
    return runtime(pathFor(input.sessionId, '/plan-decision'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({...input,...(managed&&input.decision==='approve'?{mode:taskRuntime!.repository.require(managed.id).permissionMode}:{})})
    })
  })
  ipcMain.handle('workbench:answer', (_event, input: { sessionId: string; requestId: string; answers: Record<string, string>; cancelled?: boolean }) => {
    userTakesControl(input.sessionId, '用户修改执行信息')
    return runtime(pathFor(input.sessionId, '/ask-answer'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input)
    })
  })
  ipcMain.handle('workbench:abort', (_event, sessionId: string) => {
    const root=resolveDataRoot(loadSettings())
    const managed=getDatabase(root)?getTaskRuntime(root).repository.list().find(t=>t.codeSessionId===sessionId):undefined
    if(managed)return getTaskRuntime(resolveDataRoot(loadSettings())).coordinator.stop(managed.id)
    userTakesControl(sessionId, '用户停止执行')
    return runtime(pathFor(sessionId, '/abort'), { method: 'POST' })
  })
  ipcMain.handle('workbench:mode', async (_event, input: { sessionId: string; mode: 'default' | 'sessionType' | 'acceptEdits' | 'bypassPermissions';mutationId?:string;expectedPolicyRevision?:number }) => {
    const root=resolveDataRoot(loadSettings()),taskRuntime=getDatabase(root)?getTaskRuntime(root):undefined
    const managed=taskRuntime?.repository.list().find(t=>t.codeSessionId===input.sessionId&&taskRuntime.repository.canAccess(t.id,'ackem'))
    const previous=permissionWrites.get(input.sessionId)??{generation:0,tail:Promise.resolve()},generation=previous.generation+1
    const queued={generation,tail:Promise.resolve() as Promise<unknown>};permissionWrites.set(input.sessionId,queued)
    queued.tail=previous.tail.catch(()=>{}).then(async()=>{
      if(permissionWrites.get(input.sessionId)?.generation!==generation)throw Error('权限选择已被更新的选择取代')
      const snapshot=await runtime(pathFor(input.sessionId)) as {policyRevision:number;mode:string;permissionMode:string}
      if(permissionWrites.get(input.sessionId)?.generation!==generation)throw Error('权限选择已被更新的选择取代')
      if(input.expectedPolicyRevision!==undefined&&input.expectedPolicyRevision!==snapshot.policyRevision)throw Error('权限版本已变更，请重新选择')
      const current=managed?taskRuntime!.repository.require(managed.id).snapshot:undefined
      if(current?.controlEpoch!==managed?.controlEpoch)throw Error('任务控制版本已更新')
      if(managed&&input.mode==='bypassPermissions'){
        const health=await runtime('/api/health') as {capabilities?:{fullMachineAccess?:boolean}}
        if(!health.capabilities?.fullMachineAccess)throw Error('当前内核尚未加载全机访问更新，请重启 AckemCode 后再选择完全放开')
        if(permissionWrites.get(input.sessionId)?.generation!==generation)throw Error('权限选择已被更新的选择取代')
      }
      const result=await runtime(pathFor(input.sessionId,'/mode'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:input.mode,mutationId:input.mutationId,expectedPolicyRevision:input.expectedPolicyRevision??snapshot.policyRevision,expectedControlEpoch:current?.controlEpoch,preservePlan:snapshot.mode==='plan'})}) as {ok:boolean;mode:string;policyRevision:number}
      if(current&&result.ok){taskRuntime!.repository.confirmPermissionMode(current.id,input.mode,result.policyRevision,current.policyRevision??1);taskRuntime!.coordinator.publish(current.id,'permission')}
      return result
    })
    return queued.tail
  })
  ipcMain.handle('workbench:file-history', (_event, sessionId: string) =>
    runtime(pathFor(sessionId, '/file-history')))
  ipcMain.handle('workbench:rewind', (_event, input: { sessionId: string; messageId?: string; dryRun: boolean }) =>
    runtime(pathFor(input.sessionId, '/rewind'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: input.messageId, dryRun: input.dryRun })
    }))
  ipcMain.handle('workbench:file-read', async (_event, input: { cwd: string; path: string }) => {
    const root = await realpath(resolve(input.cwd))
    const target = await realpath(resolve(root, input.path))
    if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) throw new Error('文件超出工作区')
    const info = await stat(target)
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error('文件过大或不是普通文件')
    return readFile(target, 'utf8')
  })
  ipcMain.handle('workbench:file-create', async (_event, input: { cwd: string; name: string }) => {
    if (!input.name || input.name === '.' || input.name === '..' || basename(input.name) !== input.name || /[<>:"|?*\\/]/.test(input.name)) {
      throw new Error('只能在当前工作区新建普通文件')
    }
    const root = resolve(input.cwd)
    if (!(await stat(root)).isDirectory()) throw new Error('工作区不存在')
    const target = resolve(root, input.name)
    await writeFile(target, '', { flag: 'wx' })
    return target
  })
  ipcMain.handle('workbench:terminal', async (_event, input: { cwd: string; command: string }) => {
    const cwd = resolve(input.cwd)
    if (!(await stat(cwd)).isDirectory()) throw new Error('工作区不存在')
    const result = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', input.command], {
      cwd, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true
    }).catch((error: { stdout?: string; stderr?: string; message?: string }) => ({
      stdout: error.stdout || '', stderr: error.stderr || error.message || '命令执行失败'
    }))
    return { stdout: result.stdout, stderr: result.stderr }
  })
  ipcMain.handle('workbench:enqueue', (_event, input: { sessionId: string; text: string }) => {
    userTakesControl(input.sessionId, '用户修改下一步指令')
    return runtime(pathFor(input.sessionId, '/chat'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: input.text, priority: 'next' })
    })
  })
  ipcMain.handle('workbench:send', (event,input:StandaloneInput)=>submitStandaloneWork(resolveDataRoot(loadSettings()),event.sender,input))
  ipcMain.handle('workbench:cancel-input',(_event,requestId:string)=>cancelStandaloneInput(resolveDataRoot(loadSettings()),requestId))
  ipcMain.handle('workbench:input-queue',(_event,taskId:string)=>{const root=resolveDataRoot(loadSettings());void pumpStandaloneQueue(root,taskId).catch(()=>{});return listStandaloneQueue(root,taskId)})
  ipcMain.handle('workbench:promote-input',(_event,requestId:string)=>promoteStandaloneInput(resolveDataRoot(loadSettings()),requestId))
  ipcMain.handle('workbench:cancel-task-queue',(_event,taskId:string)=>cancelStandaloneQueue(resolveDataRoot(loadSettings()),taskId))

  // ── 编辑上一轮并重跑: retry-last-turn = 内核先按 turnStartMessageId 快照
  // 回滚该轮文件, 再以新文本重跑, 返回同一 SSE 流。安全契约: 回滚范围由
  // 内核快照决定, GUI 只展示不决定。 ──
  ipcMain.handle('workbench:rerun-last',(event,input:StandaloneInput)=>submitStandaloneWork(resolveDataRoot(loadSettings()),event.sender,{...input,retryLastTurn:true}))

  // Compatibility commands are isolated processes. Interactive CLI uses the PTY API above.
  ipcMain.handle('workbench:terminal-exec', async (_event, input: { cwd: string; command: string }) => {
    const cwd = resolve(input.cwd)
    if (!(await stat(cwd)).isDirectory()) throw new Error('工作区不存在')
    if (!input.command.trim()) return { output: '' }
    const result = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', input.command], { cwd, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 })
    return { output: `${result.stdout}${result.stderr}` }
  })

  ipcMain.handle('workbench:terminal-dispose', () => ({ ok: true }))
}

// ── 聊天派工管线: 智慧路由把 work 任务直接派进工作台固定 Ackem 任务。 ──
// 聊天不再内联执行内核任务: 主进程在这里建/复用 pinned 会话、记 ActionRun、
// 开 SSE, 事件广播到全部窗口; 聊天页只回「已派工」。这与 workbench:send
// 共用同一套记账与回执规则, 不另造一套终态判定。
export const CHAT_PINNED_TASK_ID = 'pinned-ackem'

type CatalogShape = { workspaces?: unknown[]; tasks?: Array<Record<string, unknown>>; selectedTaskId?: string }

async function ensurePinnedSession(dataRoot: string, requestedCwd?: string): Promise<{ sessionId: string; cwd: string }> {
  const ready = await ensureDaemon()
  if (!ready.ok) throw new Error(ready.reason || 'AckemCode 未就绪')
  let catalog: CatalogShape = {}
  try { catalog = JSON.parse(await readFile(catalogPath(), 'utf8')) as CatalogShape } catch { /* 首次派工还没有目录 */ }
  catalog.tasks = Array.isArray(catalog.tasks) ? catalog.tasks : []
  const pinned = catalog.tasks.find((t) => t && t.id === CHAT_PINNED_TASK_ID)
  const chosen = requestedCwd?.trim() || (typeof pinned?.cwd === 'string' && pinned.cwd !== '~' ? pinned.cwd.trim() : '')
  const cwd = chosen ? resolve(chosen) : ensureDefaultWorkDirectory(dataRoot)
  if (chosen && (!isAbsolute(chosen) || !(await stat(cwd).catch(() => null))?.isDirectory())) throw new Error('请选择已存在的本机工作目录')
  let sessionId = pinned && typeof pinned.runtimeSessionId === 'string' ? pinned.runtimeSessionId : ''
  if (sessionId) {
    const existing = await fetch(`${ackemCodeBaseUrl()}${pathFor(sessionId)}`, {headers:codeSessionHeaders(sessionId)})
    if (!existing.ok) sessionId = ''
    else {
      const snapshot = await existing.json() as { cwd?: string }
      if (snapshot.cwd && resolve(snapshot.cwd) !== cwd) sessionId = ''
    }
  }
  if (!sessionId) {
    const created = await runtime('/api/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd })
    }) as { sessionId?: string }
    if (!created?.sessionId) throw new Error('AckemCode 会话创建失败')
    sessionId = created.sessionId
  }
  if (pinned) {
    pinned.runtimeSessionId = sessionId
    pinned.cwd = cwd
  } else {
    catalog.tasks.push({
      id: CHAT_PINNED_TASK_ID, title: 'Ackem', workspaceId: null, pinned: true,
      cwd, runtimeSessionId: sessionId, status: 'draft', updatedAt: Date.now(), turns: []
    })
  }
  const json = JSON.stringify(catalog)
  if (json.length <= 4 * 1024 * 1024) {
    catalogWrite = catalogWrite.catch(() => undefined).then(async () => {
      const file = catalogPath()
      await mkdir(resolve(file, '..'), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      await writeFile(temp, json, 'utf8')
      await rename(temp, file)
    })
    await catalogWrite
  }
  return { sessionId, cwd }
}

export {dispatchChatWorkJob} from '../tasks/chatWorkDispatch'
export type {ChatWorkDispatch} from '../tasks/chatWorkDispatch'
import {dispatchChatWorkJob,type ChatWorkJobArgs,type ChatWorkDispatch} from '../tasks/chatWorkDispatch'
let lastChatDispatch: {sessionId:string;runId:string}|null=null

async function dispatchLegacyChatWorkJob(args: ChatWorkJobArgs): Promise<ChatWorkDispatch> {
  if (!args.text.trim()) throw new Error('任务内容为空')
  await loadChatImages(args.imagePaths)
  // 账本先行: 记不了账就不建会话不派工 (与 workbench:send 同一纪律)。
  const port = openActionPort(args.dataRoot)
  if (!port) throw new Error('记忆账本不可用，任务没有执行')
  const supervision = supervisorFor(args.dataRoot)
  const expectedEpoch = args.supervisorRootId ? args.supervisorEpoch ?? supervision.get(args.supervisorRootId)?.epoch : undefined
  const assertSupervisionActive = () => {
    if (!args.supervisorRootId) return
    const task = supervision.get(args.supervisorRootId)
    if (!task || task.epoch !== expectedEpoch || task.state !== 'reviewing') throw new Error('监督已被接管或停止，取消自动派工')
  }
  const { sessionId, cwd } = await ensurePinnedSession(args.dataRoot, args.cwd)
  assertSupervisionActive()
  const taskId = CHAT_PINNED_TASK_ID
  const turnId = args.turnId
  const runId = stableActionRunId(['workbench', taskId, turnId])
  const action = { runId, parentRunId: args.supervisorRootId ?? null, nature: 'work' as const, sessionId, turnId, correlationId: args.correlationId, planId: null,
    targetId: cwd, initialStatus: 'accepted' as const, requestSummary: args.text.slice(0, 200),
    execution: { prompt: args.text, cwd, targetId: cwd, hostRunId: runId, params: { chatSessionId: args.chatSessionId ?? engineSessionId(), chatDelivery: true, imagePaths: args.imagePaths ?? [], filePaths: args.filePaths ?? [], supervisorTaskId: args.supervisorRootId ?? runId, supervisorEpoch: expectedEpoch } } }
  if (streams.has(sessionId) && !args.promotedRunId) {
    const created = port.record({ kind: 'action.created', action: { ...action, initialStatus: 'queued' } })
    if (!created.ok) throw new Error(created.message)
    return { taskId, turnId, cwd, sessionId, queued: true, runId }
  }
  let supervisorId = args.supervisorRootId ?? runId
  const files: string[] = []
  let summary = ''
  const checks: Array<{ command: string; ok: boolean }> = []
  const evidence: Array<{tool:string;ok:boolean;output:string}> = []
  const toolNamesById = new Map<string,string>()
  const checkCommands = new Map<string, string>()
  const chatSessionId = args.chatSessionId ?? engineSessionId()
  const deliver = (acceptance?: string) => {
    const run = port.getAction(runId)
    if (!run) return
    const delivery = buildTaskDelivery(run, { settings: loadSettings(), goal: supervision.get(supervisorId)?.goal ?? args.text, files: [...new Set([...(supervision.get(supervisorId)?.artifacts ?? []),...files])], summary: acceptance ? `${summary}\n\nAckem 验收：${acceptance}` : summary, checks })
    if (delivery) appendUnifiedChatMessage(args.dataRoot, { kind: 'message', role: 'assistant', ...delivery } as Parameters<typeof appendUnifiedChatMessage>[1], chatSessionId)
  }
  const advance = () => {
    const head = port.listOpen(sessionId).filter(run => run.status === 'queued').sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0))[0]
    if (head?.execution?.params?.chatDelivery !== true) return
    const promoted = port.promoteNext(sessionId)
    if (promoted.ok && promoted.run?.execution?.params?.chatDelivery === true) {
      const run = promoted.run
      void dispatchChatWorkJob({ text: run.execution!.prompt, cwd: run.execution!.cwd, dataRoot: args.dataRoot, turnId: run.turnId, correlationId: run.correlationId,
        filePaths: run.execution!.params!.filePaths as string[] | undefined, imagePaths: run.execution!.params!.imagePaths as string[] | undefined, chatSessionId: String(run.execution!.params!.chatSessionId), promotedRunId: run.runId, ...(run.parentRunId ? {supervisorRootId:run.parentRunId,supervisorEpoch:run.execution!.params!.supervisorEpoch as number|undefined} : {}) }).catch(error => recordChatLaunchFailure(args.dataRoot, run.runId, error))
    }
  }
  const toolPaths = new Map<string, string>()
  let terminalHandled = false
  const launch = async () => {
    assertSupervisionActive()
    supervisorId = supervision.begin({id:runId,codeSessionId:sessionId,chatSessionId:args.chatSessionId ?? engineSessionId(),cwd,goal:args.supervisorRootId ? supervision.get(args.supervisorRootId)?.goal ?? args.text : args.text,currentRunId:runId,currentTurnId:turnId,instruction:args.text},args.supervisorRootId)
    emit(null,taskId,turnId,{type:'supervisor_turn',text:args.text,attachments:[...(await loadChatImages(args.imagePaths)).map(image=>({kind:'image',id:image.path,path:image.path,name:image.name,dataUrl:image.preview,size:0})),...(await Promise.all((args.filePaths??[]).map(async path=>({kind:(await stat(path)).isDirectory()?'folder':/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(path)?'video':'doc',id:path,path,name:basename(path),size:(await stat(path)).size}))))],sessionId,cwd,runId,createdAt:Date.now()})
    port.bindRuntime(runId, sessionId)
    streams.set(sessionId, runId)
    setCompanionTaskBusy(runId, true)
    startChatStream({
      sessionId, text: `【当前聊天派工 ${runId}】以下是本轮目标。历史中用户在工作页独立发送的指令属于其他轮次，只在与当前目标有关时参考，不重新执行历史任务。\n${args.text}`, hostRunId: runId,
      attachments: [...(args.imagePaths??[]).map(path=>({kind:'image' as const,path,source:'workbench_chip' as const})),...(await Promise.all((args.filePaths??[]).map(async path=>({kind:(await stat(path)).isDirectory()?'dir' as const:'file' as const,path,source:'workbench_chip' as const}))))],
      onEvent: (agentEvent) => {
        if (terminalHandled) return
        if (!observeToLedger(null, { taskId, activeTurnId: turnId, runId, codeSessionId: sessionId }, port, agentEvent)) {
          if (agentEvent.type === 'done' || agentEvent.type === 'abort_ack') { if (streams.get(sessionId) === runId) streams.delete(sessionId); setCompanionTaskBusy(runId, false) }
          return
        }
        emit(null, taskId, turnId, agentEvent)
        if (['permission_request','plan_approval','enter_plan_approval','ask_user'].includes(agentEvent.type)) void supervision.permission(supervisorId,agentEvent.type === 'permission_request' ? agentEvent : {...agentEvent,toolName:agentEvent.type==='ask_user'?'补充任务信息':'执行计划',input:agentEvent.type==='ask_user'?{questions:agentEvent.questions}:{plan:agentEvent.plan}}).catch(error=>emit(null,taskId,turnId,{type:'status',message:`自动审批失败：${String(error)}`}))
        if(agentEvent.type==='attachments_loaded'&&Array.isArray(agentEvent.items)){
          for(const item of agentEvent.items as Array<{path:string;kind:string;omitted:boolean;body:string;mediaCount:number}>){const proof={tool:'attachment_read',ok:!item.omitted,output:JSON.stringify(item)};evidence.push(proof);supervision.recordEvidence(supervisorId,runId,proof)}
        }
        if(agentEvent.type==='tool_start'&&typeof agentEvent.id==='string')toolNamesById.set(agentEvent.id,String(agentEvent.name))
        if(agentEvent.type==='tool_result'&&typeof agentEvent.id==='string'){const proof={tool:toolNamesById.get(agentEvent.id)??String(agentEvent.name??'工具'),ok:agentEvent.ok===true,output:String(agentEvent.output??agentEvent.content??'').slice(0,3000)};evidence.push(proof);supervision.recordEvidence(supervisorId,runId,proof)}
        if (agentEvent.type === 'assistant_delta' && typeof agentEvent.text === 'string') summary = (summary + agentEvent.text).slice(-6000)
        if (agentEvent.type === 'assistant_message' && typeof agentEvent.text === 'string') summary = agentEvent.text.slice(0, 6000)
        if (agentEvent.type === 'tool_start' && typeof agentEvent.id === 'string' && /^(Bash|Shell|PowerShell)$/i.test(String(agentEvent.name))) {
          const input = agentEvent.input as { command?: unknown } | undefined
          if (typeof input?.command === 'string' && /\b(test|vitest|pytest|tsc|typecheck|build)\b/i.test(input.command)) checkCommands.set(agentEvent.id, input.command)
        }
        if (agentEvent.type === 'tool_result' && typeof agentEvent.id === 'string' && checkCommands.has(agentEvent.id)) checks.push({ command: checkCommands.get(agentEvent.id)!, ok: agentEvent.ok === true })
        if (['status', 'tool_start', 'permission_request'].includes(agentEvent.type)) broadcastToRenderers('chat:task-progress', { sessionId: chatSessionId, runId: supervisorId, text: agentEvent.type === 'tool_start' ? `调用 ${String(agentEvent.name ?? '工具')}` : String(agentEvent.message ?? agentEvent.reason ?? '等待权限'), at: Date.now() })
        if (agentEvent.type === 'tool_start' && typeof agentEvent.name === 'string' && /^(Write|Edit|MultiEdit|NotebookEdit|write_file|search_replace|notebook_edit)$/i.test(agentEvent.name)) {
          const path = changedPath(agentEvent.input)
          if (path && typeof agentEvent.id === 'string') toolPaths.set(agentEvent.id, path)
        }
        if (agentEvent.type === 'tool_result' && agentEvent.ok === true && typeof agentEvent.id === 'string' && toolPaths.has(agentEvent.id)) {
          const path = toolPaths.get(agentEvent.id)!
          files.push(resolve(cwd, path))
          void actualDiff(cwd, path).then((diff) => emit(null, taskId, turnId, { type: 'file_changed', path, diff }))
        }
        if (agentEvent.type === 'done' || agentEvent.type === 'abort_ack') {
          terminalHandled = true
          if (streams.get(sessionId) === runId) streams.delete(sessionId)
          if (agentEvent.type === 'abort_ack' || agentEvent.hostTurnReceipt?.state === 'aborted') { supervision.takeover(sessionId,'任务被停止');setCompanionTaskBusy(runId,false);deliver();return }
          void (async()=>{
            const run=port.getAction(runId)
            if(!run||!['succeeded','failed'].includes(run.status)){setCompanionTaskBusy(runId,false);deliver();advance();return}
            const reviewEpoch = supervision.get(supervisorId)?.epoch
            const review=await supervision.finish(supervisorId,runId,{ok:run.status==='succeeded',summary,files,checks,evidence})
            setCompanionTaskBusy(runId,false)
            if(review.instruction){
              await dispatchChatWorkJob({...args,text:review.instruction,turnId:randomUUID(),promotedRunId:undefined,supervisorRootId:supervisorId,supervisorEpoch:reviewEpoch})
            }else if(review.state!=='user_control'){
              if(review.state==='completed')deliver(review.reason)
              else appendUnifiedChatMessage(args.dataRoot,{role:'assistant',content:`任务尚未通过验收：${review.reason}`,origin:'action_result',replyId:`review-${runId}`,runId,turnId,sourceLabel:'Ackem 验收'},chatSessionId)
              advance()
            }
          })().catch(error=>{setCompanionTaskBusy(runId,false);supervision.interrupted(supervisorId,'监督中断，任务记录已保留');emit(null,taskId,turnId,{type:'transport_error',message:`监督中断，记录已保留：${String(error)}`})})
        }
      },
      onError: (err) => {
        if (streams.get(sessionId) === runId) streams.delete(sessionId)
        setCompanionTaskBusy(runId, false)
        observeToLedger(null, { taskId, activeTurnId: turnId, runId, codeSessionId: sessionId }, port, { type: 'http_error', message: err.message })
        supervision.interrupted(supervisorId,'执行连接失败，任务记录已保留')
        emit(null, taskId, turnId, { type: 'transport_error', message: err.message }); deliver()
      },
      onDisconnect: () => {
        if (streams.get(sessionId) === runId) streams.delete(sessionId)
        setCompanionTaskBusy(runId, false)
        observeToLedger(null, { taskId, activeTurnId: turnId, runId, codeSessionId: sessionId }, port, { type: 'disconnected' })
        supervision.interrupted(supervisorId,'执行连接中断，任务记录已保留')
        emit(null, taskId, turnId, { type: 'transport_disconnected' }); deliver()
      },
      onProtocolWarning: (warning) =>
        emit(null, taskId, turnId, { type: 'status', message: `协议警告：${warning.reason}` })
    })
  }
  try {
  const outcome = args.promotedRunId === runId && port.getAction(runId)?.status === 'running' ? (await launch(), { executed: true as const }) : await withPersistedAction(port, action, launch)
  if (!outcome.executed) throw new Error(outcome.reason === 'not_persisted' ? outcome.failure.message : '这轮任务已存在，不会再次执行')
  }catch(error){supervision.interrupted(supervisorId,'任务启动失败，记录已保留');recordChatLaunchFailure(args.dataRoot,runId,error);emit(null,taskId,turnId,{type:'transport_error',message:`任务启动失败：${String(error)}`});throw error}
  lastChatDispatch = { sessionId, runId }
  return { taskId, turnId, cwd, sessionId, queued: false, runId }
}

/** 「停掉」控制: 中止最近一次聊天派工的运行（若有）。 */
export async function abortChatWorkDispatch(): Promise<boolean> {
  if (!lastChatDispatch) return false
  const { sessionId } = lastChatDispatch
  userTakesControl(sessionId,'用户在主聊天停止任务')
  await runtime(pathFor(sessionId, '/abort'), { method: 'POST' })
  return true
}

export async function resumeChatWorkQueue(dataRoot: string, sessionId: string): Promise<void> {
  const port = openActionPort(dataRoot)
  if (!port || streams.has(sessionId)) return
  const head = port.listOpen(sessionId).filter(run => run.status === 'queued').sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0))[0]
  if (head?.execution?.params?.chatDelivery !== true) return
  const promoted = port.promoteNext(sessionId)
  if (!promoted.ok || !promoted.run || promoted.run.execution?.params?.chatDelivery !== true) return
  const run = promoted.run
  try { await dispatchChatWorkJob({ text: run.execution!.prompt, cwd: run.execution!.cwd, filePaths: run.execution!.params!.filePaths as string[] | undefined, imagePaths: run.execution!.params!.imagePaths as string[] | undefined, dataRoot, turnId: run.turnId, correlationId: run.correlationId, chatSessionId: String(run.execution!.params!.chatSessionId), promotedRunId: run.runId, ...(run.parentRunId ? {supervisorRootId:run.parentRunId,supervisorEpoch:run.execution!.params!.supervisorEpoch as number|undefined} : {}) }) }
  catch (error) { recordChatLaunchFailure(dataRoot, run.runId, error) }
}
function recordChatLaunchFailure(dataRoot: string, runId: string, error: unknown): void {
  const port = openActionPort(dataRoot), run = port?.getAction(runId)
  if (!port || !run) return
  const result = port.record({ kind: 'action.transitioned', transition: { runId, fromVersion: run.version, toStatus: 'unknown', safeSummary: '任务启动中断，未取得执行回执', errorCode: 'launch_interrupted', occurredAt: new Date().toISOString(), idempotencyKey: `launch-failure-${runId}-${run.version}` } })
  emit(null, CHAT_PINNED_TASK_ID, run.turnId, { type: 'transport_error', message: String(error) })
  if (!result.ok) return
  const delivery = buildTaskDelivery(port.getAction(runId)!, { settings: loadSettings(), goal: run.execution?.prompt ?? '', files: [] })
  if (delivery) appendUnifiedChatMessage(dataRoot, { role: 'assistant', ...delivery }, String(run.execution?.params?.chatSessionId ?? engineSessionId()))
}
export function recoverChatTaskDeliveries(dataRoot: string): void {
  supervisorFor(dataRoot).recover()
  const db = getDatabase(dataRoot)
  if (!db) return
  const repo = new ActionRepository(db)
  const ids = db.prepare("SELECT run_id FROM memory_action_runs WHERE nature='work' AND status IN ('succeeded','failed','aborted','unknown') ORDER BY updated_at DESC LIMIT 200").all() as Array<{ run_id: string }>
  for (const id of ids) {
    const run = repo.getById(id.run_id)
    if (!run || run.execution?.params?.chatDelivery !== true) continue
    const supervisedId=run.execution.params.supervisorTaskId
    const task=typeof supervisedId==='string'?supervisorFor(dataRoot).get(supervisedId):undefined
    if(task && (task.state!=='completed'||task.currentRunId!==run.runId))continue
    const acceptance=task?.log.filter(note=>note.kind==='review_result').at(-1)?.text
    const delivery = buildTaskDelivery(run, { settings: loadSettings(), goal: task?.goal ?? run.execution.prompt, files: task?.artifacts ?? [], ...(acceptance?{summary:`Ackem 验收：${acceptance}`}:{}) })
    if (delivery) appendUnifiedChatMessage(dataRoot, { role: 'assistant', ...delivery }, String(run.execution.params.chatSessionId))
  }
}
