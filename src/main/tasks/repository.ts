import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import type { TaskSnapshot, TaskSubmitRequest, TaskSubmitResult, TaskState, TaskAuthority, ContractPatch, TaskPermissionMode } from '../../shared/tasks'
import { validateTaskExecutionOptions,hasSettledResultAwaitingReview,isTaskExecutionSettled, type TaskExecutionOptions } from '../../shared/tasks'
import { EventRepository } from '../memory/ledger/eventRepository'
import type { MemoryEventType } from '../memory/contracts'
import { TASK_SCHEMA_SQL } from '../db/schemaV20'
import { initialContract, taskAuthority, validateContractPatch,attachmentContractScope } from './contract'
import {LONG_TERM_SCHEMA} from './longTermSchema'
import {projectTaskDecision,standingExecutionAllowed} from './longTerm'

export type TaskRecord = { snapshot: TaskSnapshot; permissionMode: string; fence: number; instruction: string; attempts: number; receiptRevision: number }
export type TaskCommand = { id: string; taskId: string; goalRevision: number; controlEpoch: number; fencingToken?:number;currentRunId?:string; kind: 'start'|'stop'|'revise'; payload: Record<string, unknown> }
export const activeStates: TaskState[] = ['running','waiting_user','reviewing','cancelling','unknown']
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

/** All accepted input, ledger evidence, projection and dispatch commands commit together. */
export class TaskRepository {
  /** Transaction-local hook for projections in this same database. External events publish only after commit. */
  onProjectionChanged?: (task:TaskSnapshot)=>void
  private events: EventRepository
  constructor(readonly db: Database.Database) {
    db.exec(TASK_SCHEMA_SQL)
    db.exec(LONG_TERM_SCHEMA)
    db.exec('CREATE TABLE IF NOT EXISTS task_archives (task_id TEXT PRIMARY KEY, archived_at INTEGER NOT NULL)')
    db.exec('CREATE TABLE IF NOT EXISTS task_authority_grants (grant_id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, domain_id TEXT NOT NULL, principal_id TEXT NOT NULL, resources_json TEXT NOT NULL, revision INTEGER NOT NULL, revoked_at INTEGER)')
    this.events = new EventRepository(db)
  }
  isArchived(id:string):boolean{return !!this.db.prepare('SELECT 1 FROM task_archives WHERE task_id=?').get(id)}
  archive(id:string):void {
    this.db.transaction(()=>{
      const task=this.require(id).snapshot
      if(!['completed','failed','paused'].includes(task.state)||task.executionQuiescent===false)throw Error('任务尚未确认停止，不能删除记录')
      this.db.prepare('INSERT OR IGNORE INTO task_archives VALUES (?,?)').run(id,Date.now())
      this.evidence(task,'task.observed',{archived:true},'user')
    })()
  }
  get(id: string): TaskRecord | undefined {
    const row = this.db.prepare('SELECT * FROM task_projection WHERE id=?').get(id) as Record<string, string|number>|undefined
    if (!row) return undefined
    const snapshot = JSON.parse(String(row.snapshot_json)) as TaskSnapshot
    Object.assign(snapshot, taskAuthority(snapshot), { queueOrder:Number(row.queue_order),permissionMode: String(row.permission_mode) as TaskPermissionMode, policyRevision: snapshot.policyRevision ?? 1 })
    return {snapshot,permissionMode:String(row.permission_mode),fence:Number(row.fence),instruction:String(row.instruction),attempts:Number(row.attempts),receiptRevision:Number(row.receipt_revision)}
  }
  list(): TaskSnapshot[] {
    return (this.db.prepare('SELECT snapshot_json,permission_mode,queue_order FROM task_projection ORDER BY queue_order').all() as {snapshot_json:string;permission_mode:TaskPermissionMode;queue_order:number}[]).map(row => {
      const task=JSON.parse(row.snapshot_json) as TaskSnapshot
      return Object.assign(task,taskAuthority(task),{queueOrder:row.queue_order,permissionMode:row.permission_mode,policyRevision:task.policyRevision??1})
    })
  }
  canAccess(id: string, principal: string): boolean {
    const task = this.get(id)?.snapshot
    if (!task || this.isArchived(id)) return false
    if (principal === task.ownerPrincipalId) return true
    if (principal !== 'ackem' || task.supervisionPolicy !== 'ackem_managed' || task.managerPrincipalId !== 'ackem' || !task.contract || !task.authorityRef) return false
    return !!this.db.prepare('SELECT 1 FROM task_authority_grants WHERE grant_id=? AND task_id=? AND domain_id=? AND principal_id=? AND revoked_at IS NULL').get(task.authorityRef, id, task.domainId, principal)
  }
  revokeAuthority(id: string): void {
    this.db.transaction(() => {
      const task = this.require(id).snapshot
      this.db.prepare('UPDATE task_authority_grants SET revoked_at=?,revision=revision+1 WHERE task_id=? AND revoked_at IS NULL').run(Date.now(), id)
      this.evidence(task, 'task.observed', { authorityRevoked: true }, 'user')
      this.stop(id)
    })()
  }
  visibleList(): TaskSnapshot[] {
    const hasPolicy=this.db.prepare("SELECT name FROM sqlite_master WHERE name='task_notification_policy'").get()
    if(!hasPolicy)return this.list().filter(t=>!this.isArchived(t.id))
    const forgotten=new Set((this.db.prepare('SELECT task_id FROM task_notification_policy WHERE forgotten=1').all() as {task_id:string}[]).map(r=>r.task_id))
    return this.list().filter(t=>!forgotten.has(t.id)&&!this.isArchived(t.id))
  }
  private save(r: TaskRecord): void {
    r.snapshot.permissionMode = r.permissionMode as TaskPermissionMode
    this.db.prepare('UPDATE task_projection SET snapshot_json=?, permission_mode=?,fence=?,instruction=?,attempts=?,receipt_revision=? WHERE id=?')
      .run(JSON.stringify(r.snapshot),r.permissionMode,r.fence,r.instruction,r.attempts,r.receiptRevision,r.snapshot.id)
    this.onProjectionChanged?.(r.snapshot)
  }
  private evidence(task: TaskSnapshot, type: MemoryEventType, content: Record<string,unknown>, actor: 'user'|'system'|'ackem' = 'system'): void {
    const eventId=randomUUID(),now=new Date().toISOString()
    this.events.append(this.db,{eventId,schemaVersion:1,sessionId:task.originConversationId,turnId:null,correlationId:task.id,causationEventId:null,nature:'work',eventType:type,surface:'desktop',actor,status:null,evidenceKind:actor==='user'?'user_assertion':'runtime_receipt',confidence:1,observedAt:now,occurredAt:now,scheduledFor:null,completedAt:null,timezone:'Asia/Shanghai',localDate:now.slice(0,10),idempotencyKey:`task:${eventId}`},
      {eventId,summary:`${type}: ${task.id}`,content:{...content,taskId:task.id,goalRevision:task.goalRevision,controlEpoch:task.controlEpoch},contentHash:hash(content),redactedAt:null})
    projectTaskDecision(this.db,task,eventId,type,actor,content)
  }
  associateGoal(id:string,goalId:string|undefined):void {const r=this.require(id);r.snapshot.longTermGoalId=goalId;if(r.snapshot.contract)r.snapshot.contract.goal.goalRef=goalId;this.save(r)}
  bindStandingExecution(id:string,execution:NonNullable<TaskSnapshot['standingExecution']>):void {const r=this.require(id);r.snapshot.standingExecution=execution;this.save(r)}
  private command(r: TaskRecord, kind: TaskCommand['kind'], payload: Record<string,unknown>={}): void {
    if(kind!=='start')payload={...payload,targetRunId:r.snapshot.currentRunId??null}
    this.db.prepare('INSERT INTO task_execution_outbox VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),r.snapshot.id,r.snapshot.goalRevision,r.snapshot.controlEpoch,kind,JSON.stringify(payload),'pending',Date.now())
  }
  previous(input:TaskSubmitRequest):TaskSubmitResult|undefined {
    const row=this.db.prepare('SELECT input_hash,result_json FROM task_requests WHERE request_id=?').get(input.requestId) as {input_hash:string;result_json:string}|undefined
    if(row&&row.input_hash!==hash(input))throw Error('请求编号已被不同内容使用')
    return row?JSON.parse(row.result_json):undefined
  }
  failInput(id:string):void{this.db.prepare("UPDATE task_input_inbox SET state='failed' WHERE request_id=? AND state='received'").run(id)}
  isInputCancelled(id:string):boolean{return !!this.db.prepare("SELECT 1 FROM task_input_inbox WHERE request_id=? AND state='cancelled'").get(id)}
  canAccessInput(id:string,principal:string):boolean {
    const row=this.db.prepare('SELECT input_json,target_ids_json FROM task_input_inbox WHERE request_id=?').get(id) as {input_json:string;target_ids_json:string}|undefined
    if(!row)return false
    const receivedBy=(this.db.prepare('SELECT principal_id FROM task_input_principals WHERE request_id=?').get(id) as {principal_id:string}|undefined)?.principal_id??'user'
    if(principal!=='user'&&receivedBy!==principal)return false
    const input=JSON.parse(row.input_json) as TaskSubmitRequest, previous=this.previous(input)
    const targets=[...JSON.parse(row.target_ids_json),input.taskId,previous?.taskId].filter((id):id is string=>typeof id==='string')
    return targets.every(id=>this.canAccess(id,principal))
  }
  cancelInput(id:string,principal='user'):TaskSubmitResult {
    return this.db.transaction(()=>{
      const row=this.db.prepare('SELECT input_json FROM task_input_inbox WHERE request_id=?').get(id) as {input_json:string}|undefined
      if(!row)throw Error('输入请求不存在')
      if(!this.canAccessInput(id,principal))throw Error('没有访问该输入的授权')
      const input=JSON.parse(row.input_json) as TaskSubmitRequest, previous=this.previous(input)
      this.db.prepare("UPDATE task_input_inbox SET state='cancelled' WHERE request_id=?").run(id)
      if(previous?.taskId&&['accepted','applied','stopping'].includes(previous.disposition))this.stop(previous.taskId)
      const result:TaskSubmitResult={requestId:id,taskId:previous?.taskId,disposition:'cancelled',message:'这条输入已停止'}
      this.db.prepare('INSERT INTO task_requests VALUES (?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET result_json=excluded.result_json').run(id,hash(input),JSON.stringify(result),Date.now())
      return result
    })()
  }
  receive(input:TaskSubmitRequest,targets:string[],principal='user'):void {
    this.db.transaction(()=>{
      const row=this.db.prepare('SELECT input_hash FROM task_input_inbox WHERE request_id=?').get(input.requestId) as {input_hash:string}|undefined
      if(row){if(row.input_hash!==hash(input))throw Error('请求编号已被不同内容使用');if(!this.canAccessInput(input.requestId,principal))throw Error('没有访问该输入的授权');this.db.prepare("UPDATE task_input_inbox SET state='received' WHERE request_id=? AND state='failed'").run(input.requestId);return}
      this.db.prepare('INSERT INTO task_input_inbox VALUES (?,?,?,?,?,?)').run(input.requestId,hash(input),JSON.stringify(input),JSON.stringify(targets),'received',Date.now())
      this.db.prepare('INSERT INTO task_input_principals VALUES (?,?)').run(input.requestId,principal)
      this.evidence({id:input.taskId??input.requestId,originConversationId:input.conversationId,goalRevision:0,controlEpoch:0} as TaskSnapshot,'task.input_received',{request:input,targets},'user')
    })()
  }
  pendingInputs():TaskSubmitRequest[]{return (this.db.prepare("SELECT input_json FROM task_input_inbox WHERE state='received' ORDER BY created_at,rowid").all() as {input_json:string}[]).map(r=>JSON.parse(r.input_json))}
  hasPendingInput(id:string):boolean{return !!this.db.prepare("SELECT 1 FROM task_input_inbox, json_each(target_ids_json) WHERE state='received' AND json_each.value=? LIMIT 1").get(id)}
  request(input: TaskSubmitRequest, mutate: () => TaskSubmitResult): TaskSubmitResult {
    return this.db.transaction(() => {
      const prior=this.db.prepare('SELECT input_hash,result_json FROM task_requests WHERE request_id=?').get(input.requestId) as {input_hash:string;result_json:string}|undefined
      if(prior){if(prior.input_hash!==hash(input))throw Error('请求编号已被不同内容使用');return JSON.parse(prior.result_json)}
      const result=mutate()
      this.db.prepare('INSERT INTO task_requests VALUES (?,?,?,?)').run(input.requestId,hash(input),JSON.stringify(result),Date.now())
      this.db.prepare("UPDATE task_input_inbox SET state='settled' WHERE request_id=?").run(input.requestId)
      return result
    })()
  }
  create(input: TaskSubmitRequest, cwd: string, authority?: TaskAuthority): TaskSnapshot {
    validateTaskExecutionOptions(input)
    return this.db.transaction(() => {
    const now=Date.now(),task:TaskSnapshot={id:randomUUID(),goal:input.text,goalRevision:1,controlEpoch:1,state:'queued',cwd,originConversationId:input.conversationId,deliverySurface:input.origin==='workbench'?'workbench':'chat',createdAt:now,updatedAt:now,attachments:input.attachments??[]}
    if (authority && (!authority.domainId || !authority.workspaceId || !authority.ownerPrincipalId || !['ackem_managed', 'user_only'].includes(authority.supervisionPolicy) || (authority.supervisionPolicy === 'ackem_managed' && authority.managerPrincipalId !== 'ackem'))) throw Error('任务归属无效')
    Object.assign(task, authority ?? taskAuthority(task), { permissionMode: input.permissionMode ?? 'default', policyRevision: 1 })
    if (task.supervisionPolicy === 'ackem_managed') {
      task.authorityRef = randomUUID(); task.contract = initialContract(task, input.requestId)
      task.acceptance = { state: 'not_ready', goalRevision: 1, evidenceRefs: [] }
      task.delivery = { state: 'not_ready', goalRevision: 1 }
      task.execution = {state:'not_started',goalRevision:1,quiescent:true}
      this.db.prepare('INSERT INTO task_authority_grants VALUES (?,?,?,?,?,1,NULL)').run(task.authorityRef, task.id, task.domainId, 'ackem', JSON.stringify(task.contract.scope.resourceRefs))
    }
    if(input.inspectionScope){task.inspectionScope=input.inspectionScope;task.inspectionFingerprint=input.inspectionFingerprint;task.inspectionPaths=input.inspectionPaths;if(input.origin==='ackem')task.deliverySurface='workbench'}
    task.executionMode=input.executionMode??'agent';task.effort=input.effort??'medium'
    const r:TaskRecord={snapshot:task,permissionMode:input.permissionMode??'default',fence:0,instruction:input.text,attempts:0,receiptRevision:-1}
    this.db.prepare('INSERT INTO task_projection VALUES (?,?,?,?,?,?,?,?)').run(task.id,JSON.stringify(task),r.permissionMode,Number((this.db.prepare('SELECT COALESCE(MAX(queue_order),0)+1 AS n FROM task_projection').get() as {n:number}).n),0,input.text,0,-1)
    this.evidence(task,'task.created',{request:input,authority:taskAuthority(task),contract:task.contract},'user');this.command(r,'start');return task
    })()
  }
  revise(id: string, instruction: string, attachments: TaskSubmitRequest['attachments']=[], options: TaskExecutionOptions&{requestId?:string;trustedAttachmentPaths?:string[]}={}): TaskSnapshot {
    validateTaskExecutionOptions(options)
    return this.db.transaction(() => {
      const r=this.require(id);r.snapshot.standingExecution=undefined;r.snapshot.goalRevision++;r.snapshot.controlEpoch++;r.snapshot.updatedAt=Date.now();r.snapshot.summary=undefined;r.snapshot.userSummary=undefined;r.snapshot.reviewIssue=undefined
      if(r.snapshot.contract)r.snapshot.contract={...r.snapshot.contract,scope:attachmentContractScope(r.snapshot,r.snapshot.contract,attachments??[],options.trustedAttachmentPaths)}
      if(options.executionMode!==undefined)r.snapshot.executionMode=options.executionMode
      if(options.effort!==undefined)r.snapshot.effort=options.effort
      if(options.permissionMode!==undefined && options.permissionMode !== r.permissionMode){ r.permissionMode=options.permissionMode; r.snapshot.policyRevision=(r.snapshot.policyRevision??1)+1 }
      r.snapshot.goal += `\n\n用户修订 ${r.snapshot.goalRevision}：${instruction}`
      r.snapshot.attachments=[...r.snapshot.attachments,...attachments??[]];r.instruction=r.snapshot.goal
      if (r.snapshot.contract) {
        const source=options.requestId
        r.snapshot.contract = { ...r.snapshot.contract, contractRevision: r.snapshot.goalRevision, goal: { ...r.snapshot.contract.goal, text: r.snapshot.goal },sourceRequestIds:[...new Set([...r.snapshot.contract.sourceRequestIds,...(source?[source]:[])])],acceptanceCriteria:r.snapshot.contract.acceptanceCriteria.map(criterion=>({...criterion,expected:criterion.id==='user-goal'?r.snapshot.goal:criterion.expected,sourceRequestIds:[...new Set([...criterion.sourceRequestIds,...(source?[source]:[])])]})), policyRef: { id: `policy:${id}`, revision: r.snapshot.policyRevision ?? 1 }, updatedAt: r.snapshot.updatedAt }
        r.snapshot.acceptance = { state: 'invalidated', goalRevision: r.snapshot.goalRevision, evidenceRefs: [] }
        r.snapshot.delivery = { state: 'not_ready', goalRevision: r.snapshot.goalRevision }
      }
      const wasActive=activeStates.includes(r.snapshot.state)
      r.snapshot.state=wasActive?'cancelling':'queued';this.save(r)
      this.evidence(r.snapshot,'task.revised',{instruction,attachments},'user');this.command(r,wasActive?'revise':'start');return r.snapshot
    })()
  }
  patchContract(id: string, patch: ContractPatch, expectedRevision: number, sourceRequestId: string, options: TaskExecutionOptions&{attachments?:TaskSubmitRequest['attachments'];trustedAttachmentPaths?:string[]} = {}): TaskSnapshot {
    validateTaskExecutionOptions(options)
    patch=Object.fromEntries(Object.entries(patch??{}).filter(([,value])=>value!==undefined)) as ContractPatch
    return this.db.transaction(() => {
      const record = this.require(id), task = record.snapshot, previous = task.contract
      task.standingExecution=undefined
      if (!previous || !this.canAccess(id, 'ackem')) throw Error('任务没有有效托管授权')
      if (!Number.isSafeInteger(expectedRevision) || task.goalRevision !== expectedRevision || previous.contractRevision !== expectedRevision) throw Error('目标版本已变更')
      if (!sourceRequestId || sourceRequestId.length > 200) throw Error('契约修改缺少请求来源')
      validateContractPatch(previous, patch)
      const wasActive = activeStates.includes(task.state)
      task.goalRevision++; task.controlEpoch++; task.updatedAt = Date.now(); task.summary = undefined; task.userSummary=undefined; task.reviewIssue=undefined
      if(options.executionMode!==undefined)task.executionMode=options.executionMode
      if(options.effort!==undefined)task.effort=options.effort
      if(options.permissionMode!==undefined&&options.permissionMode!==record.permissionMode){record.permissionMode=options.permissionMode;task.policyRevision=(task.policyRevision??1)+1}
      task.contract = { ...previous, ...structuredClone(patch), contractRevision: task.goalRevision, sourceRequestIds: [...new Set([...previous.sourceRequestIds, sourceRequestId])],policyRef:{id:`policy:${id}`,revision:task.policyRevision??1}, updatedAt: task.updatedAt }
      task.contract.scope=attachmentContractScope(task,task.contract,options.attachments??[],options.trustedAttachmentPaths)
      task.attachments=[...task.attachments,...options.attachments??[]]
      task.goal = task.contract.goal.text; record.instruction = task.goal
      task.acceptance = { state: 'invalidated', goalRevision: task.goalRevision, evidenceRefs: [] }
      task.delivery = { state: 'not_ready', goalRevision: task.goalRevision }
      task.state = wasActive ? 'cancelling' : 'queued'
      this.save(record)
      this.evidence(task, 'task.revised', { patch, sourceRequestId, expectedRevision, contract: task.contract }, 'user')
      this.command(record, wasActive ? 'revise' : 'start')
      return task
    })()
  }
  stop(id: string,actor:'user'|'ackem'|'system'='user',reason:Record<string,unknown>={}): TaskSnapshot {
    return this.db.transaction(() => {
      const r=this.require(id);if(['completed','failed','paused'].includes(r.snapshot.state)){if(this.db.prepare("SELECT 1 FROM standing_rules WHERE task_id=? AND json_extract(data_json,'$.revokedAt') IS NULL").get(id))this.evidence(r.snapshot,'task.stopped',{alreadySettled:true,...reason},actor);return r.snapshot}
      const pendingStop=r.snapshot.state==='cancelling'?this.lastControl(id):undefined
      if(pendingStop?.kind==='stop'&&!pendingStop.payload.resume)return r.snapshot
      r.snapshot.controlEpoch++;r.snapshot.updatedAt=Date.now();r.snapshot.state=r.snapshot.state==='queued'?'paused':'cancelling';this.save(r)
      this.evidence(r.snapshot,'task.stopped',reason,actor);this.command(r,'stop');return r.snapshot
    })()
  }
  prioritize(id:string,principal?:string):void {
    this.db.transaction(()=>{
      const target=this.require(id);if(target.snapshot.state!=='queued')throw Error('只能调整等待任务的顺序')
      if(principal&&!this.canAccess(id,principal))throw Error('没有访问该任务的授权')
      // Reuse only the caller's existing slots so unrelated domains keep their order.
      const tasks=this.list().filter(task=>!principal||this.canAccess(task.id,principal))
      const slots=tasks.map(task=>task.queueOrder!)
      const order=[id,...tasks.filter(task=>task.id!==id).map(task=>task.id)]
      order.forEach((taskId,index)=>this.db.prepare('UPDATE task_projection SET queue_order=? WHERE id=?').run(slots[index],taskId))
      this.evidence(target.snapshot,'task.observed',{queuePriority:'first'},principal==='ackem'?'ackem':'user')
    })()
  }
  interrupt(id:string):void {
    this.db.transaction(()=>{const snapshot=this.stop(id);this.db.prepare("UPDATE task_execution_outbox SET payload_json=json_set(payload_json,'$.resume',json('true')) WHERE task_id=? AND control_epoch=? AND kind='stop' AND state='pending'").run(id,snapshot.controlEpoch)})()
  }
  lastControl(id:string):TaskCommand|undefined {
    const r=this.require(id),row=this.db.prepare("SELECT * FROM task_execution_outbox WHERE task_id=? AND goal_revision=? AND control_epoch=? AND kind IN ('stop','revise') ORDER BY created_at DESC,rowid DESC LIMIT 1").get(id,r.snapshot.goalRevision,r.snapshot.controlEpoch) as Record<string,string|number>|undefined
    return row?{id:String(row.command_id),taskId:id,goalRevision:r.snapshot.goalRevision,controlEpoch:r.snapshot.controlEpoch,kind:row.kind as TaskCommand['kind'],payload:JSON.parse(String(row.payload_json))}:undefined
  }
  depend(id:string,dependencies:string[]):void {
    this.db.transaction(()=>{
      const target=this.require(id);if(target.snapshot.state!=='queued'&&!(target.snapshot.state==='waiting_user'&&target.snapshot.executionQuiescent))throw Error('只有等待任务可以设置依赖')
      const reaches=(next:string,seen=new Set<string>()):boolean=>{if(next===id)return true;if(seen.has(next))return false;seen.add(next);return (this.require(next).snapshot.dependencies??[]).some(d=>reaches(d.taskId,seen))}
      if(dependencies.some(d=>reaches(d)))throw Error('任务依赖不能形成循环')
      target.snapshot.dependencies=[...new Set(dependencies)].map(taskId=>({taskId,goalRevision:this.require(taskId).snapshot.goalRevision}))
      const resume=target.snapshot.state==='waiting_user';target.snapshot.state='queued';target.snapshot.summary=undefined;target.snapshot.userSummary=undefined;target.snapshot.reviewIssue=undefined
      this.save(target);this.evidence(target.snapshot,'task.observed',{dependencies:target.snapshot.dependencies},'user');if(resume)this.command(target,'start')
    })()
  }
  merge(id:string,sources:string[]):TaskSnapshot {
    return this.db.transaction(()=>{
      const target=this.require(id);const items=[...new Set(sources)].filter(source=>source!==id).map(source=>this.require(source))
      if(target.snapshot.state!=='queued'||!items.length||items.some(item=>item.snapshot.state!=='queued'||item.snapshot.originConversationId!==target.snapshot.originConversationId))throw Error('只能合并同一会话的等待任务')
      const members=new Map([target,...items].map(item=>[item.snapshot.id,item.snapshot.goalRevision]))
      const revision=target.snapshot.goalRevision+items.length
      const prerequisites=new Map<string,{taskId:string;goalRevision:number}>()
      for(const item of [target,...items])for(const dependency of item.snapshot.dependencies??[]){
        if(members.has(dependency.taskId)){
          if(members.get(dependency.taskId)!==dependency.goalRevision)throw Error('合并任务的依赖版本已变更，需要先核对')
          continue
        }
        if(prerequisites.has(dependency.taskId)&&prerequisites.get(dependency.taskId)!.goalRevision!==dependency.goalRevision)throw Error('合并任务的依赖版本不一致，需要先核对')
        prerequisites.set(dependency.taskId,dependency)
      }
      const updates=this.list().filter(task=>!members.has(task.id)&&task.dependencies?.some(d=>members.has(d.taskId))).map(task=>{
        if(task.state!=='queued'&&!(task.state==='waiting_user'&&task.executionQuiescent))throw Error('关联任务正在执行，暂不能合并')
        if(task.dependencies!.some(d=>members.has(d.taskId)&&members.get(d.taskId)!==d.goalRevision))throw Error('关联任务的依赖版本已变更，需要先核对')
        return {...task,dependencies:[...new Map(task.dependencies!.map(d=>members.has(d.taskId)?{taskId:id,goalRevision:revision}:d).map(d=>[d.taskId,d])).values()]}
      })
      const graph=new Map(this.list().filter(task=>!members.has(task.id)||task.id===id).map(task=>[task.id,task.dependencies??[]]))
      graph.set(id,[...prerequisites.values()]);for(const task of updates)graph.set(task.id,task.dependencies)
      const visiting=new Set<string>(),visited=new Set<string>()
      const visit=(taskId:string):void=>{if(visiting.has(taskId))throw Error('合并任务会形成循环依赖');if(visited.has(taskId))return;visiting.add(taskId);for(const d of graph.get(taskId)??[])visit(d.taskId);visiting.delete(taskId);visited.add(taskId)}
      for(const taskId of graph.keys())visit(taskId)
      for(const item of items){this.revise(id,`合并任务 ${item.snapshot.id}：${item.snapshot.goal}`,item.snapshot.attachments);this.stop(item.snapshot.id)}
      const merged=this.require(id);merged.snapshot.dependencies=[...prerequisites.values()];this.save(merged)
      for(const task of updates){const record=this.require(task.id);record.snapshot.dependencies=task.dependencies;this.save(record);this.evidence(task,'task.observed',{dependencies:task.dependencies,mergedInto:id},'user')}
      this.evidence(this.require(id).snapshot,'task.observed',{mergedTaskIds:items.map(t=>t.snapshot.id)},'user')
      return this.require(id).snapshot
    })()
  }
  transition(id: string, expected: {goalRevision:number;controlEpoch:number}, state: TaskState, fields: Partial<TaskSnapshot>={}): boolean {
    return this.db.transaction(() => {
      const r=this.require(id);if(!this.matches(r,expected))return false
      Object.assign(r.snapshot,fields,{state,updatedAt:Date.now()});this.save(r);this.evidence(r.snapshot,'task.transitioned',{state,...fields});return true
    })()
  }
  projectStages(id:string,expected:{goalRevision:number;controlEpoch:number},fields:Pick<Partial<TaskSnapshot>,'execution'|'acceptance'|'delivery'>):boolean {
    return this.db.transaction(()=>{const r=this.require(id);if(!this.matches(r,expected))return false;for(const projection of [fields.execution,fields.acceptance,fields.delivery])if(projection&&projection.goalRevision!==r.snapshot.goalRevision)throw Error('投影目标版本已过期');Object.assign(r.snapshot,fields);this.save(r);this.evidence(r.snapshot,'task.observed',{stages:fields});return true})()
  }
  hasContractSources(id:string):boolean {
    const task=this.require(id).snapshot,contract=task.contract
    const sourced=(ids:string[])=>ids.length>0&&ids.every(source=>contract!.sourceRequestIds.includes(source))
    return !!contract&&contract.contractRevision===task.goalRevision&&contract.authorityRef===task.authorityRef&&contract.sourceRequestIds.length>0&&contract.sourceRequestIds.every(requestId=>!!this.db.prepare('SELECT 1 FROM task_requests WHERE request_id=?').get(requestId))&&contract.constraints.every(constraint=>sourced(constraint.sourceRequestIds))&&contract.acceptanceCriteria.length>0&&contract.acceptanceCriteria.every(criterion=>criterion.verifierRef==='ackem:semantic-review'&&sourced(criterion.sourceRequestIds))
  }
  claim(principal?:string): {record:TaskRecord;command:TaskCommand}|undefined {
    return this.db.transaction(() => {
      const rows=this.db.prepare("SELECT o.* FROM task_execution_outbox o JOIN task_projection t ON t.id=o.task_id WHERE o.state='pending' ORDER BY CASE WHEN o.kind='start' THEN 1 ELSE 0 END,CASE WHEN json_extract(t.snapshot_json,'$.inspectionScope') IS NULL THEN 0 ELSE 1 END,t.queue_order,o.created_at,o.rowid").all() as Record<string,string|number>[]
      for(const row of rows){
        const r=this.require(String(row.task_id)),command:TaskCommand={id:String(row.command_id),taskId:r.snapshot.id,goalRevision:Number(row.goal_revision),controlEpoch:Number(row.control_epoch),kind:row.kind as TaskCommand['kind'],payload:JSON.parse(String(row.payload_json))}
        if(principal&&!this.canAccess(r.snapshot.id,principal)){
          // Revoked managed tasks still need their already-recorded stop; private domains never do.
          const t=r.snapshot
          if(principal!=='ackem'||t.supervisionPolicy!=='ackem_managed'||t.managerPrincipalId!=='ackem'||!t.authorityRef||!this.db.prepare('SELECT 1 FROM task_authority_grants WHERE grant_id=? AND task_id=? AND domain_id=? AND principal_id=?').get(t.authorityRef,t.id,t.domainId,principal))continue
          if(command.kind==='start'){this.finishCommand(command.id);continue}
        }
        if(!this.matches(r,command)){this.finishCommand(command.id);continue}
        if(command.kind==='start'){
          if(this.hasPendingInput(r.snapshot.id))continue
          if(r.snapshot.standingExecution&&(this.db.prepare('SELECT run_id FROM standing_triggers WHERE id=?').get(r.snapshot.standingExecution.triggerId) as {run_id:string|null}|undefined)?.run_id){this.finishCommand(command.id);this.transition(r.snapshot.id,r.snapshot,'waiting_user',{summary:'持续规则的单次执行预算已用完，保留验收结果等待用户确认',executionQuiescent:true});continue}
          if(!standingExecutionAllowed(this.db,r.snapshot)){this.finishCommand(command.id);this.transition(r.snapshot.id,r.snapshot,'paused',{summary:'持续规则已撤销、过期或预算边界已到，等待用户确认',executionQuiescent:true});continue}
          if(r.snapshot.state!=='queued'){this.finishCommand(command.id);continue}
          if(r.snapshot.dependencies?.some(d=>{const prerequisite=this.get(d.taskId)?.snapshot;return !prerequisite||prerequisite.goalRevision!==d.goalRevision||['failed','paused'].includes(prerequisite.state)})){this.transition(r.snapshot.id,r.snapshot,'waiting_user',{summary:'前置任务已变更或停止，需要核对依赖要求',executionQuiescent:true});continue}
          if(r.snapshot.dependencies?.some(d=>this.get(d.taskId)?.snapshot.state!=='completed'))continue
          if(this.list().some(t=>t.id!==r.snapshot.id&&(!principal||this.canAccess(t.id,principal))&&activeStates.includes(t.state)&&!(t.state==='waiting_user'&&t.executionQuiescent)&&!isTaskExecutionSettled(t)))continue
          r.fence++;r.attempts++;r.receiptRevision=-1;r.snapshot.state='running';r.snapshot.executionQuiescent=false;r.snapshot.currentRunId=randomUUID();r.snapshot.updatedAt=Date.now();this.save(r)
          if(r.snapshot.standingExecution)this.db.prepare('UPDATE standing_triggers SET run_id=? WHERE id=? AND run_id IS NULL').run(r.snapshot.currentRunId,r.snapshot.standingExecution.triggerId)
          if(r.snapshot.contract){r.snapshot.execution={state:'running',goalRevision:r.snapshot.goalRevision,runId:r.snapshot.currentRunId,quiescent:false};r.snapshot.acceptance={state:'not_ready',goalRevision:r.snapshot.goalRevision,runId:r.snapshot.currentRunId,evidenceRefs:[]};this.save(r)}
          command.fencingToken=r.fence;command.currentRunId=r.snapshot.currentRunId
          this.evidence(r.snapshot,'task.transitioned',{state:'running',runId:r.snapshot.currentRunId,fence:r.fence})
        }
        this.db.prepare("UPDATE task_execution_outbox SET state='claimed' WHERE command_id=?").run(command.id)
        return {record:r,command}
      }
      return undefined
    })()
  }
  finishCommand(id: string): void {this.db.prepare("UPDATE task_execution_outbox SET state='settled' WHERE command_id=?").run(id)}
  requeue(id: string, expected: {goalRevision:number;controlEpoch:number}, instruction?: string): boolean {
    return this.db.transaction(() => {const r=this.require(id);if(!this.matches(r,expected))return false;r.snapshot.state='queued';r.snapshot.updatedAt=Date.now();if(instruction)r.instruction=instruction;this.save(r);this.evidence(r.snapshot,'task.transitioned',{state:'queued',instruction});this.command(r,'start');return true})()
  }
  observe(id:string, expected:{goalRevision:number;controlEpoch:number}, content:Record<string,unknown>): boolean {
    return this.db.transaction(()=>{const r=this.require(id);if(!this.matches(r,expected))return false;this.evidence(r.snapshot,'task.observed',content);return true})()
  }
  historical(snapshot:TaskSnapshot, content:Record<string,unknown>):void {this.db.transaction(()=>this.evidence(snapshot,'task.observed',{...content,historical:true}))()}
  setPermissionMode(id:string,mode:string,expectedRevision?:number):TaskSnapshot {
    if(!['default','sessionType','acceptEdits','bypassPermissions'].includes(mode))throw Error('无效的任务权限')
    return this.db.transaction(()=>{
      const r=this.require(id), revision=r.snapshot.policyRevision??1
      if(expectedRevision!==undefined&&expectedRevision!==revision)throw Error('权限版本已变更')
      if(r.permissionMode===mode)return r.snapshot
      r.permissionMode=mode;r.snapshot.policyRevision=revision+1;r.snapshot.updatedAt=Date.now()
      if(r.snapshot.contract)r.snapshot.contract.policyRef={id:`policy:${id}`,revision:r.snapshot.policyRevision}
      this.save(r);this.evidence(r.snapshot,'task.observed',{permissionMode:mode,policyRevision:r.snapshot.policyRevision},'user')
      return r.snapshot
    })()
  }
  confirmPermissionMode(id:string,mode:TaskPermissionMode,backendRevision:number,expectedRevision:number):TaskSnapshot {
    validateTaskExecutionOptions({permissionMode:mode})
    return this.db.transaction(()=>{const r=this.require(id),revision=r.snapshot.policyRevision??1;if(revision!==expectedRevision||!Number.isSafeInteger(backendRevision)||backendRevision<revision)throw Error('权限确认版本已过期');r.permissionMode=mode;r.snapshot.policyRevision=backendRevision;r.snapshot.updatedAt=Date.now();if(r.snapshot.contract)r.snapshot.contract.policyRef={id:`policy:${id}`,revision:backendRevision};this.save(r);this.evidence(r.snapshot,'task.observed',{permissionMode:mode,policyRevision:backendRevision,confirmedBy:'kernel'});return r.snapshot})()
  }
  receipt(id:string, runId:string, revision:number, expected:{goalRevision:number;controlEpoch:number}): boolean {
    return this.db.transaction(()=>{const r=this.require(id);if(!this.matches(r,expected)||r.snapshot.currentRunId!==runId||revision<=r.receiptRevision)return false;r.receiptRevision=revision;this.save(r);return true})()
  }
  recover(principal = 'user'): TaskSnapshot[] {
    return this.db.transaction(()=>{
      const tasks=this.list().filter(t=>this.canAccess(t.id,principal))
      for(const t of tasks.filter(t=>activeStates.includes(t.state)&&!hasSettledResultAwaitingReview(t)))this.transition(t.id,t,'unknown',{summary:'应用重启，等待核对内核执行状态'})
      for(const t of tasks)this.db.prepare("UPDATE task_execution_outbox SET state='settled' WHERE state='claimed' AND task_id=?").run(t.id)
      return this.list().filter(t=>this.canAccess(t.id,principal))
    })()
  }
  matches(r: TaskRecord, expected:{goalRevision:number;controlEpoch:number;fencingToken?:number;currentRunId?:string}): boolean {return r.snapshot.goalRevision===expected.goalRevision&&r.snapshot.controlEpoch===expected.controlEpoch&&(expected.fencingToken===undefined||r.fence===expected.fencingToken)&&(expected.currentRunId===undefined||r.snapshot.currentRunId===expected.currentRunId)}
  require(id:string):TaskRecord {const r=this.get(id);if(!r)throw Error('任务不存在');return r}
}
