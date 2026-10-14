import type Database from 'better-sqlite3'
import {createHash,randomUUID} from 'node:crypto'
import type {Goal,GoalGrantInput,DecisionRecord,Observation,StandingRule,RuleGrantInput} from '../../shared/longTerm'
import type {TaskSnapshot} from '../../shared/tasks'
import {EventRepository} from '../memory/ledger/eventRepository'
import type {MemoryEventType} from '../memory/contracts'
import {canReadMemorySources} from '../memory/accessScope'
import {LONG_TERM_SCHEMA} from './longTermSchema'
import type {TaskRepository} from './repository'
import type {TaskCoordinator} from './coordinator'
import type {CapabilityFact,SystemManifest} from '../system/introspection'
type SystemView={manifest:Pick<SystemManifest,'appBuildId'|'codeBuildId'|'configFingerprint'|'kernelHealth'>;capabilities:CapabilityFact[]}

const userCommands=new WeakSet<object>()
type UserCommand={readonly principal:'user'}
/** Only trusted host user-command adapters issue this capability. Never deserialize it from model/renderer data. */
export function issueLongTermUserCommand():UserCommand {const command={principal:'user' as const};userCommands.add(command);return command}
type HostSource={readonly source:Observation['source']}
const hostSources=new WeakMap<object,{db:Database.Database;source:Observation['source']}>()
/** Registration is in-process; a JSON source name is never an observation credential. */
export function registerHostObservationSource(db:Database.Database,source:Observation['source']):HostSource {
 if(!['task','system','time'].includes(source))throw Error('Observation source not installed')
 const capability={source};hostSources.set(capability,{db,source});return capability
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0
function user(command:UserCommand):void {if(!command||!userCommands.has(command))throw Error('Explicit host user confirmation required')}
function bounded(value:string,limit=2000):boolean{return typeof value==='string'&&!!value.trim()&&value.length<=limit}
function ledger(db:Database.Database,task:TaskSnapshot,type:string,content:Record<string,unknown>,actor:'user'|'ackem'|'system'='system'):string {
 const id=randomUUID(),at=new Date().toISOString(),payload={...content,taskId:task.id,domainId:task.domainId,goalRevision:task.goalRevision}
 new EventRepository(db).append(db,{eventId:id,schemaVersion:1,sessionId:task.originConversationId,turnId:null,correlationId:task.id,causationEventId:null,nature:'work',eventType:type as MemoryEventType,surface:'system',actor,status:null,evidenceKind:actor==='user'?'user_assertion':'deterministic_rule',confidence:1,observedAt:at,occurredAt:at,scheduledFor:null,completedAt:null,timezone:'UTC',localDate:at.slice(0,10),idempotencyKey:`long-term:${id}`},{eventId:id,summary:type,content:payload,contentHash:digest(payload),redactedAt:null})
 return id
}
function sourceVersions(db:Database.Database,ids:string[]):Record<string,string>{
 return Object.fromEntries(ids.map(id=>{const row=db.prepare('SELECT content_hash FROM memory_event_payloads WHERE event_id=? AND redacted_at IS NULL').get(id) as {content_hash:string}|undefined;if(!row)throw Error('Missing source evidence');return [id,row.content_hash]}))
}
function sourcesCurrent(db:Database.Database,versions:Record<string,string>,ref?:string):boolean {
 const ids=Object.keys(versions);if(!ids.length||!canReadMemorySources(db,ids,ref))return false
 return ids.every(id=>(db.prepare('SELECT content_hash FROM memory_event_payloads WHERE event_id=? AND redacted_at IS NULL').get(id) as {content_hash:string}|undefined)?.content_hash===versions[id])
}
/** Called inside the existing repository transaction after the corresponding ledger append. */
export function projectTaskDecision(db:Database.Database,task:TaskSnapshot,eventId:string,type:string,actor:'user'|'ackem'|'system',content:Record<string,unknown>):void {
 if(!task.authorityRef||!task.domainId||!task.contract)return
 const stages=content.stages as {acceptance?:{state?:string;reason?:string}}|undefined
 if(!['task.created','task.revised','task.stopped','task.transitioned'].includes(type)&&!stages?.acceptance&&!content.permissionMode&&!content.authorityRevoked&&!content.dependencies&&!content.queuePriority)return
 const basis=String(stages?.acceptance?.reason??content.reason??content.summary??(stages?.acceptance?`Acceptance: ${stages.acceptance.state}`:content.state?`Task state: ${content.state}`:`Committed ${type}`)).slice(0,1000)
 const decision:DecisionRecord={id:eventId,actor,choice:type,basis,evidenceIds:[eventId],taskId:task.id,goalId:task.longTermGoalId??task.contract.goal.goalRef,domainId:task.domainId,goalRevision:task.goalRevision,policyRevision:task.policyRevision??1,sourceVersions:sourceVersions(db,[eventId]),applicability:'Current task goal, policy and required source versions only'}
 db.prepare('INSERT INTO task_decisions VALUES (?,?,?,?)').run(decision.id,task.id,JSON.stringify(decision),eventId)
 if(type==='task.stopped'&&actor==='user'){
  for(const row of db.prepare('SELECT id,data_json FROM standing_rules WHERE task_id=?').all(task.id) as {id:string;data_json:string}[]){const rule=JSON.parse(row.data_json) as StandingRule;if(!rule.revokedAt){rule.revokedAt=Date.now();db.prepare('UPDATE standing_rules SET data_json=? WHERE id=?').run(JSON.stringify(rule),row.id)}}
  db.prepare("UPDATE standing_triggers SET state='revoked' WHERE task_id=? AND state IN ('reserved','dispatched')").run(task.id)
 }
}
/** Hard execution gate used both before claiming and before/after asynchronous production boundaries. */
export function standingExecutionAllowed(db:Database.Database,task:TaskSnapshot,now=Date.now()):boolean {
 const execution=task.standingExecution;if(!execution)return true
 const row=db.prepare('SELECT data_json FROM standing_rules WHERE id=?').get(execution.ruleId) as {data_json:string}|undefined
 const trigger=db.prepare('SELECT state,run_id,source_versions_json,goal_id,created_at FROM standing_triggers WHERE id=?').get(execution.triggerId) as {state:string;run_id:string|null;source_versions_json:string;goal_id:string|null;created_at:number}|undefined
 if(!row||!trigger||now<trigger.created_at||trigger.goal_id!==(task.longTermGoalId??null)||!['reserved','dispatched'].includes(trigger.state)||(trigger.run_id&&trigger.run_id!==task.currentRunId))return false
 const rule=JSON.parse(row.data_json) as StandingRule
 if(!sourcesCurrent(db,JSON.parse(trigger.source_versions_json) as Record<string,string>))return false
 if(task.longTermGoalId){const goalRow=db.prepare('SELECT data_json FROM task_goals WHERE id=?').get(task.longTermGoalId) as {data_json:string}|undefined;if(!goalRow)return false;const goal=JSON.parse(goalRow.data_json) as Goal;if(goal.state!=='active'||goal.budget.expiresAt<=now||!sourcesCurrent(db,goal.sourceVersions))return false}
 return !rule.revokedAt&&now<rule.expiresAt&&now<execution.deadline&&rule.goalRevision===task.goalRevision&&rule.policyRevision===(task.policyRevision??1)&&rule.authorityRef===task.authorityRef&&sourcesCurrent(db,rule.sourceVersions)
}

export class LongTermControl {
 private evaluating=false
 private connected=false
 private latestClock=0
 private clockCurrent():boolean {const now=this.now(),observed=(this.db.prepare('SELECT COALESCE(MAX(observed_at),0) at FROM observation_cursors').get() as {at:number}).at;const valid=now>=Math.max(this.latestClock,observed);this.latestClock=Math.max(this.latestClock,now,observed);return valid}
 setConnectivity(health:'connected'|'disconnected'|'unknown'):void {this.connected=health==='connected'}
 private readonly taskSource:HostSource
 private readonly timeSource:HostSource
 private readonly systemSource:HostSource
 constructor(private readonly repository:TaskRepository,private readonly coordinator:TaskCoordinator,private readonly now:()=>number=Date.now,private readonly systemView?:()=>SystemView){
  repository.db.exec(LONG_TERM_SCHEMA);this.taskSource=registerHostObservationSource(repository.db,'task');this.timeSource=registerHostObservationSource(repository.db,'time');this.systemSource=registerHostObservationSource(repository.db,'system')
  // Crash recovery retains the reservation and spent budget, but never retries an unconfirmed effect.
  repository.db.prepare("UPDATE standing_triggers SET state='interrupted' WHERE state IN ('reserved','dispatched')").run()
 }
 private get db(){return this.repository.db}
 private managed(id:string):TaskSnapshot {const t=this.repository.require(id).snapshot;if(!this.repository.canAccess(id,'ackem')||t.supervisionPolicy!=='ackem_managed')throw Error('Current managed domain grant required');return t}
 private eventIds(id:string):string[]{return (this.db.prepare("SELECT e.event_id FROM memory_events e JOIN memory_event_payloads p ON p.event_id=e.event_id WHERE json_extract(p.content_json,'$.taskId')=? AND p.redacted_at IS NULL ORDER BY e.rowid DESC LIMIT 1").all(id) as {event_id:string}[]).map(row=>row.event_id)}
 grantGoal(command:UserCommand,input:GoalGrantInput):Goal {
  user(command)
  if(!bounded(input.originalUserBasis)||!bounded(input.expectedOutcome,10000)||!Array.isArray(input.constraints)||input.constraints.length>30||input.constraints.some(v=>!bounded(v))||!Array.isArray(input.taskIds)||!input.taskIds.length||input.taskIds.length>30||new Set(input.taskIds).size!==input.taskIds.length||!positive(input.budget?.maxRuns)||input.budget.maxRuns>100||!Number.isFinite(input.budget.expiresAt)||input.budget.expiresAt<=this.now()||(input.nextCheckAt!==undefined&&(!Number.isFinite(input.nextCheckAt)||input.nextCheckAt<this.now())))throw Error('Invalid goal grant')
  const tasks=input.taskIds.map(id=>this.managed(id)),domainId=tasks[0].domainId!
  if(tasks.some(t=>t.longTermGoalId))throw Error('任务已关联长期目标；请先明确撤销原目标，避免丢失仍有效的约束')
  if((this.db.prepare("SELECT count(*) n FROM task_goals WHERE json_extract(data_json,'$.state') NOT IN ('revoked','cancelled','abandoned')").get() as {n:number}).n>=20)throw Error('长期目标容量已到，请先撤销现有目标')
  if(tasks.some(t=>t.domainId!==domainId))throw Error('Goal sources must share a managed domain')
  return this.db.transaction(()=>{
   const evidenceIds=tasks.map(t=>ledger(this.db,t,'goal.user_confirmed',{grant:{originalUserBasis:input.originalUserBasis,expectedOutcome:input.expectedOutcome,constraints:input.constraints,taskIds:input.taskIds,budget:input.budget,nextCheckAt:input.nextCheckAt}},'user'))
   const goal:Goal={...input,id:randomUUID(),domainId,taskIds:[...input.taskIds],constraints:[...input.constraints],state:'active',version:1,authorityRefs:tasks.map(t=>t.authorityRef!),evidenceIds,sourceVersions:sourceVersions(this.db,evidenceIds),updatedAt:this.now()}
   this.db.prepare('INSERT INTO task_goals VALUES (?,?,?)').run(goal.id,JSON.stringify(goal),evidenceIds[0])
   for(const t of tasks){
    const request={requestId:`goal:${goal.id}:${t.id}`,origin:'workbench' as const,conversationId:t.originConversationId,taskId:t.id,text:input.originalUserBasis}
    this.repository.request(request,()=>{
     const constraints=[...t.contract!.constraints.filter(c=>!c.id.startsWith('long-goal:')),...input.constraints.map((text,index)=>({id:`long-goal:${goal.id}:${index}`,text,enforcement:'semantic_review' as const,sourceRequestIds:[request.requestId]}))]
     const taskGoal=tasks.length===1?input.expectedOutcome:`${t.contract!.goal.text}\n长期目标预期成果：${input.expectedOutcome}`
     const acceptanceCriteria=[...t.contract!.acceptanceCriteria.map(c=>({...c,expected:c.id==='user-goal'?taskGoal:c.expected,sourceRequestIds:c.id==='user-goal'?[...c.sourceRequestIds,request.requestId]:c.sourceRequestIds})),{id:`long-goal:${goal.id}:outcome`,expected:input.expectedOutcome,evidenceKind:'runtime_receipt_and_review',verifierRef:'ackem:semantic-review',sourceRequestIds:[request.requestId]}]
     this.repository.patchContract(t.id,{goal:{text:taskGoal,goalRef:goal.id},constraints,acceptanceCriteria},t.goalRevision,request.requestId)
     this.repository.stop(t.id);this.repository.associateGoal(t.id,goal.id)
     return {requestId:request.requestId,taskId:t.id,disposition:'applied',goalRevision:this.repository.require(t.id).snapshot.goalRevision}
    })
   }
   return goal
  })()
 }
 goals(ref?:string):Goal[]{return (this.db.prepare("SELECT data_json FROM task_goals ORDER BY CASE WHEN json_extract(data_json,'$.state') IN ('revoked','cancelled','abandoned') THEN 1 ELSE 0 END,rowid DESC LIMIT 100").all() as {data_json:string}[]).map(r=>JSON.parse(r.data_json) as Goal).filter(g=>sourcesCurrent(this.db,g.sourceVersions,ref)).slice(0,20).map(g=>({...g,state:g.state!=='active'?g.state:g.taskIds.some(id=>{const task=this.repository.get(id)?.snapshot;return !task||['unknown','failed'].includes(task.state)||task.state==='completed'&&task.acceptance?.state!=='accepted'})?'evidence_insufficient':g.taskIds.every(id=>{const t=this.repository.get(id)?.snapshot;return t?.contract?.goal.goalRef===g.id&&t.contract.acceptanceCriteria.some(c=>c.id==="long-goal:"+g.id+":outcome"&&c.expected===g.expectedOutcome)&&t.acceptance?.state==='accepted'&&t.acceptance.goalRevision===t.goalRevision})?'completed':'active'}))}
 async revokeGoal(command:UserCommand,id:string):Promise<void>{
  user(command);const row=this.db.prepare('SELECT data_json FROM task_goals WHERE id=?').get(id) as {data_json:string}|undefined;if(!row)throw Error('Unknown goal')
  const goal=JSON.parse(row.data_json) as Goal
  const linkedIds=goal.taskIds.filter(taskId=>this.repository.get(taskId)?.snapshot.longTermGoalId===id)
  this.db.transaction(()=>{
   goal.state='revoked';goal.version++;goal.updatedAt=this.now();this.db.prepare('UPDATE task_goals SET data_json=? WHERE id=?').run(JSON.stringify(goal),id)
   for(const taskId of linkedIds){
    const t=this.repository.require(taskId).snapshot;ledger(this.db,t,'goal.user_revoked',{goalId:id},'user')
    if(this.repository.canAccess(taskId,'ackem')&&t.contract){
     const request={requestId:`goal-revoke:${id}:${goal.version}:${taskId}`,origin:'workbench' as const,conversationId:t.originConversationId,taskId,text:`撤销长期目标 ${id}`}
     this.repository.request(request,()=>{this.repository.patchContract(taskId,{goal:{text:t.contract!.goal.text},constraints:t.contract!.constraints.filter(c=>!c.id.startsWith(`long-goal:${id}:`)),acceptanceCriteria:t.contract!.acceptanceCriteria.filter(c=>!c.id.startsWith(`long-goal:${id}:`))},t.goalRevision,request.requestId);this.repository.stop(taskId);return {requestId:request.requestId,taskId,disposition:'applied'}})
    }else if(t.standingExecution)this.repository.stop(taskId)
    this.repository.associateGoal(taskId,undefined)
   }
  })()
  for(const row of this.db.prepare('SELECT id FROM standing_rules WHERE task_id IN (SELECT value FROM json_each(?))').all(JSON.stringify(linkedIds)) as {id:string}[])await this.revokeRule(command,row.id)
  await this.coordinator.pump()
 }
 async changeGoalState(command:UserCommand,id:string,state:'paused'|'active'|'cancelled'|'abandoned'):Promise<Goal>{
  user(command);if(!['paused','active','cancelled','abandoned'].includes(state))throw Error('Invalid goal lifecycle state')
  const row=this.db.prepare('SELECT data_json FROM task_goals WHERE id=?').get(id) as {data_json:string}|undefined;if(!row)throw Error('Unknown goal')
  const goal=JSON.parse(row.data_json) as Goal
  if(['revoked','cancelled','abandoned'].includes(goal.state))throw Error('终止的目标保留历史；请重新明确授权新的目标')
  const linked=goal.taskIds.filter(taskId=>this.repository.get(taskId)?.snapshot.longTermGoalId===id)
  this.db.transaction(()=>{goal.state=state;goal.version++;goal.updatedAt=this.now();const events=linked.map(taskId=>ledger(this.db,this.repository.require(taskId).snapshot,'goal.user_state_changed',{goalId:id,state,goalVersion:goal.version},'user'));goal.evidenceIds=[...goal.evidenceIds,...events];goal.sourceVersions=sourceVersions(this.db,goal.evidenceIds);this.db.prepare('UPDATE task_goals SET data_json=? WHERE id=?').run(JSON.stringify(goal),id);if(state!=='active')for(const taskId of linked)this.repository.stop(taskId,'user',{source:'goal.user_state_changed',goalId:id,goalState:state})})()
  if(state!=='active'){for(const row of this.db.prepare('SELECT id FROM standing_rules WHERE task_id IN (SELECT value FROM json_each(?))').all(JSON.stringify(linked)) as {id:string}[])await this.revokeRule(command,row.id);await this.coordinator.pump()}
  return goal
 }
 decisions(taskId:string,ref?:string):DecisionRecord[]{
  const task=this.repository.get(taskId)?.snapshot;if(!task)return []
  return (this.db.prepare('SELECT data_json FROM task_decisions WHERE task_id=? ORDER BY rowid DESC LIMIT 100').all(taskId) as {data_json:string}[]).map(r=>JSON.parse(r.data_json) as DecisionRecord).filter(d=>!d.invalidatedAt&&d.goalId===task.longTermGoalId&&d.goalRevision===task.goalRevision&&d.policyRevision===(task.policyRevision??1)&&sourcesCurrent(this.db,d.sourceVersions,ref)).slice(0,20)
 }
 correctDecision(command:UserCommand,id:string,basis:string):DecisionRecord {
  user(command);if(!bounded(basis,1000))throw Error('Invalid decision correction')
  return this.db.transaction(()=>{const row=this.db.prepare('SELECT data_json FROM task_decisions WHERE id=?').get(id) as {data_json:string}|undefined;if(!row)throw Error('Unknown decision');const prior=JSON.parse(row.data_json) as DecisionRecord,t=this.managed(prior.taskId);const eventId=ledger(this.db,t,'decision.user_corrected',{supersedes:id,basis},'user');prior.invalidatedAt=this.now();this.db.prepare('UPDATE task_decisions SET data_json=? WHERE id=?').run(JSON.stringify(prior),id);const current:DecisionRecord={...prior,id:eventId,actor:'user',basis,supersedes:id,invalidatedAt:undefined,evidenceIds:[...prior.evidenceIds,eventId],sourceVersions:sourceVersions(this.db,[...prior.evidenceIds,eventId]),goalRevision:t.goalRevision,policyRevision:t.policyRevision??1};this.db.prepare('INSERT INTO task_decisions VALUES (?,?,?,?)').run(eventId,t.id,JSON.stringify(current),eventId);return current})()
 }
 grantRule(command:UserCommand,input:RuleGrantInput):StandingRule {
  user(command)
  if(input.maxCostUsd!==undefined)throw Error('费用计量未接入，无法确认费用上限；请使用运行次数、时间和 token 预算')
  if(!bounded(input.originalUserBasis)||!bounded(input.purpose)||!['task','time','system'].includes(input.source)||!input.filter||!bounded(input.filter.kind,100)||(input.filter.value!==undefined&&!bounded(input.filter.value,200))||JSON.stringify(input.allowedActions)!=='["resume_task"]'||!positive(input.maxRuns)||input.maxRuns>100||!positive(input.maxDurationMs)||input.maxDurationMs>24*60*60*1000||!positive(input.maxContextTokens)||input.maxContextTokens>1000000||!positive(input.maxModelCalls)||input.maxModelCalls>100||!Number.isFinite(input.expiresAt)||input.expiresAt<=this.now()||!positive(input.cooldownMs)||input.cooldownMs<1000||(input.maxCostUsd!==undefined&&(!Number.isFinite(input.maxCostUsd)||input.maxCostUsd<=0)))throw Error('Invalid standing rule grant')
  const t=this.managed(input.taskId)
  if(t.longTermGoalId){const goal=this.goals().find(g=>g.id===t.longTermGoalId);if(!goal||goal.state!=='active'||goal.budget.expiresAt<=this.now())throw Error('当前目标未开放持续推进，请先核对目标状态、证据与预算')}
  if((this.db.prepare("SELECT count(*) n FROM standing_rules WHERE json_extract(data_json,'$.revokedAt') IS NULL AND json_extract(data_json,'$.expiresAt')>?").get(this.now()) as {n:number}).n>=30)throw Error('持续规则容量已到，请先撤销现有规则')
  return this.db.transaction(()=>{const id=randomUUID(),eventId=ledger(this.db,t,'standing_rule.user_confirmed',{ruleId:id,purpose:input.purpose,originalUserBasis:input.originalUserBasis,allowedActions:input.allowedActions},'user');const rule:StandingRule={taskId:t.id,purpose:input.purpose,originalUserBasis:input.originalUserBasis,source:input.source,filter:{...input.filter},allowedActions:['resume_task'],maxRuns:input.maxRuns,maxDurationMs:input.maxDurationMs,maxContextTokens:input.maxContextTokens,maxModelCalls:input.maxModelCalls,maxCostUsd:input.maxCostUsd,expiresAt:input.expiresAt,cooldownMs:input.cooldownMs,id,domainId:t.domainId!,authorityRef:t.authorityRef!,goalRevision:t.goalRevision,policyRevision:t.policyRevision??1,evidenceIds:[eventId],sourceVersions:sourceVersions(this.db,[eventId])};this.db.prepare('INSERT INTO standing_rules VALUES (?,?,?,?,0,NULL)').run(id,t.id,JSON.stringify(rule),eventId);return rule})()
 }
 rules(ref?:string):StandingRule[]{return (this.db.prepare("SELECT data_json FROM standing_rules ORDER BY CASE WHEN json_extract(data_json,'$.revokedAt') IS NULL AND json_extract(data_json,'$.expiresAt')>? THEN 0 ELSE 1 END,rowid DESC LIMIT 100").all(this.now()) as {data_json:string}[]).map(r=>JSON.parse(r.data_json) as StandingRule).filter(r=>sourcesCurrent(this.db,r.sourceVersions,ref)).slice(0,30)}
 async revokeRule(command:UserCommand,id:string):Promise<void>{
  user(command);const row=this.db.prepare('SELECT data_json FROM standing_rules WHERE id=?').get(id) as {data_json:string}|undefined;if(!row)throw Error('Unknown standing rule')
  const rule=JSON.parse(row.data_json) as StandingRule
  this.db.transaction(()=>{rule.revokedAt=this.now();this.db.prepare('UPDATE standing_rules SET data_json=? WHERE id=?').run(JSON.stringify(rule),id);ledger(this.db,this.repository.require(rule.taskId).snapshot,'standing_rule.user_revoked',{ruleId:id},'user');this.db.prepare("UPDATE standing_triggers SET state='revoked' WHERE rule_id=? AND state IN ('reserved','dispatched')").run(id)})()
  const t=this.repository.require(rule.taskId).snapshot;if(t.standingExecution?.ruleId===id){this.repository.stop(t.id);this.coordinator.publish(t.id,'standing_rule_revoked');await this.coordinator.pump()}
 }
 observe(source:HostSource,input:Omit<Observation,'id'|'source'|'domainId'|'trust'|'evidenceIds'|'sourceVersions'>):Observation|undefined {
  const registered=hostSources.get(source);if(!registered||registered.db!==this.db)throw Error('Unregistered host observation source')
  const now=this.now();if(!positive(input.sequence)||!Number.isFinite(input.observedAt)||input.observedAt>now||input.observedAt<now-60000||!Number.isFinite(input.expiresAt)||input.expiresAt<=now||input.expiresAt>now+60000||!bounded(input.kind,100)||!bounded(input.value,200))return
  const t=this.managed(input.taskId),cursor=this.db.prepare('SELECT sequence,observed_at FROM observation_cursors WHERE source=? AND task_id=?').get(registered.source,t.id) as {sequence:number;observed_at:number}|undefined
  if(cursor&&(input.sequence<=cursor.sequence||input.observedAt<cursor.observed_at))return
  return this.db.transaction(()=>{const required=this.eventIds(t.id),id=digest([registered.source,t.id,input.sequence]),eventId=ledger(this.db,t,'world.observed',{observationId:id,source:registered.source,kind:input.kind,value:input.value,observedAt:input.observedAt,expiresAt:input.expiresAt});const observation:Observation={...input,id,source:registered.source,domainId:t.domainId!,trust:'observed',evidenceIds:[...required,eventId],sourceVersions:sourceVersions(this.db,[...required,eventId])};this.db.prepare('INSERT INTO world_observations VALUES (?,?,?,?,?,?)').run(id,t.id,observation.source,input.sequence,JSON.stringify(observation),eventId);this.db.prepare('INSERT INTO observation_cursors VALUES (?,?,?,?) ON CONFLICT(source,task_id) DO UPDATE SET sequence=excluded.sequence,observed_at=excluded.observed_at').run(observation.source,t.id,input.sequence,input.observedAt);this.db.prepare('DELETE FROM world_observations WHERE id IN (SELECT id FROM world_observations WHERE task_id=? AND source=? ORDER BY sequence DESC LIMIT -1 OFFSET 8)').run(t.id,observation.source);return observation})()
 }
 observeTask(id:string):void {
  const t=this.managed(id),row=this.db.prepare("SELECT COALESCE(MAX(e.rowid),0) sequence FROM memory_events e JOIN memory_event_payloads p ON p.event_id=e.event_id WHERE json_extract(p.content_json,'$.taskId')=? AND e.event_type NOT IN ('world.observed','standing_rule.trigger_reserved')").get(id) as {sequence:number}
  this.observe(this.taskSource,{taskId:id,sequence:row.sequence,observedAt:this.now(),expiresAt:this.now()+10000,kind:'task.state',value:t.state})
 }
 observeTime(id:string):void {const now=this.now();this.observe(this.timeSource,{taskId:id,sequence:now,observedAt:now,expiresAt:now+10000,kind:'time.tick',value:new Date(now).toISOString()})}
 observeSystem(id:string,health:'connected'|'disconnected'|'unknown'):void {const now=this.now();this.observe(this.systemSource,{taskId:id,sequence:now,observedAt:now,expiresAt:now+10000,kind:'system.kernelHealth',value:health})}
 worldState(taskIds:string[],ref?:string):{tasks:TaskSnapshot[];observations:Observation[];system?:SystemView;artifactFacts:Array<{taskId:string;path:string;trust:'observed'|'claim';currentState:'unknown';observedAt:number}>} {
  if(!Array.isArray(taskIds)||taskIds.length>20)throw Error('Bounded world query requires selected tasks')
  const tasks=taskIds.flatMap(id=>{const t=this.repository.get(id)?.snapshot;return t&&canReadMemorySources(this.db,this.eventIds(id),ref)&&this.repository.canAccess(id,'ackem')?[t]:[]})
  const observations=tasks.flatMap(t=>(this.db.prepare('SELECT data_json FROM world_observations WHERE task_id=? ORDER BY rowid DESC LIMIT 24').all(t.id) as {data_json:string}[]).map(r=>JSON.parse(r.data_json) as Observation)).filter(o=>o.observedAt<=this.now()&&o.expiresAt>this.now()&&sourcesCurrent(this.db,o.sourceVersions,ref))
  const system=tasks.length?this.systemView?.():undefined
  return {tasks,observations,system:system?{manifest:{appBuildId:system.manifest.appBuildId,codeBuildId:system.manifest.codeBuildId,configFingerprint:system.manifest.configFingerprint,kernelHealth:system.manifest.kernelHealth},capabilities:system.capabilities.slice(0,20)}:undefined,artifactFacts:tasks.flatMap(t=>(t.artifacts??[]).slice(0,20).map(path=>({taskId:t.id,path,trust:t.acceptance?.state==='accepted'?'observed' as const:'claim' as const,currentState:'unknown' as const,observedAt:t.updatedAt})))}
 }
 reserve():void {
  if(!this.connected||!this.clockCurrent())return
  this.db.transaction(()=>{
   for(const rule of this.rules()){
    const t=this.repository.require(rule.taskId).snapshot,row=this.db.prepare('SELECT runs,last_trigger_at FROM standing_rules WHERE id=?').get(rule.id) as {runs:number;last_trigger_at:number|null},now=this.now()
    if(rule.revokedAt||rule.expiresAt<=now||rule.maxCostUsd||row.runs>=rule.maxRuns||(row.last_trigger_at!==null&&now-row.last_trigger_at<rule.cooldownMs)||rule.goalRevision!==t.goalRevision||rule.policyRevision!==(t.policyRevision??1)||rule.authorityRef!==t.authorityRef||t.state!=='paused'||t.executionQuiescent===false||!this.repository.canAccess(t.id,'ackem')||this.repository.hasPendingInput(t.id))continue
    let goalDeadline=Infinity;if(t.longTermGoalId){const goal=this.goals().find(g=>g.id===t.longTermGoalId);if(!goal||goal.state!=='active'||goal.budget.expiresAt<=now||goal.nextCheckAt!==undefined&&goal.nextCheckAt>now)continue;goalDeadline=goal.budget.expiresAt;const used=(this.db.prepare('SELECT count(*) n FROM standing_triggers WHERE goal_id=?').get(goal.id) as {n:number}).n;if(used>=goal.budget.maxRuns)continue}
    const observation=this.worldState([t.id]).observations.find(o=>o.source===rule.source&&o.trust==='observed'&&o.kind===rule.filter.kind&&(rule.filter.value===undefined||o.value===rule.filter.value))
    if(!observation||observation.domainId!==rule.domainId)continue
    const id=digest([rule.id,observation.id]);if(this.db.prepare('SELECT 1 FROM standing_triggers WHERE id=?').get(id))continue
    const deadline=Math.min(rule.expiresAt,goalDeadline,now+rule.maxDurationMs)
    if(this.db.prepare("SELECT 1 FROM standing_triggers WHERE task_id=? AND state IN ('reserved','dispatched')").get(t.id))continue
    this.db.prepare('INSERT INTO standing_triggers VALUES (?,?,?,?,?,?,?,?,NULL,?,?)').run(id,rule.id,t.id,observation.id,'reserved',deadline,rule.maxContextTokens,now,JSON.stringify(observation.sourceVersions),t.longTermGoalId??null)
    this.db.prepare('UPDATE standing_rules SET runs=runs+1,last_trigger_at=? WHERE id=?').run(now,rule.id)
    ledger(this.db,t,'standing_rule.trigger_reserved',{ruleId:rule.id,triggerId:id,observationId:observation.id,reservedTokens:rule.maxContextTokens,deadline})
   }
  })()
 }
 async evaluate():Promise<void>{
  if(this.evaluating)return;this.evaluating=true
  try{
   await this.enforceCurrentAuthority()
   this.reserve()
   const rows=this.db.prepare("SELECT * FROM standing_triggers WHERE state='reserved' ORDER BY created_at LIMIT 30").all() as {id:string;rule_id:string;task_id:string;deadline:number}[]
   for(const row of rows){
    const rule=this.rules().find(r=>r.id===row.rule_id),t=this.repository.get(row.task_id)?.snapshot
    const required=this.db.prepare('SELECT source_versions_json,observation_id FROM standing_triggers WHERE id=?').get(row.id) as {source_versions_json:string;observation_id:string}
    const observed=this.db.prepare('SELECT data_json FROM world_observations WHERE id=?').get(required.observation_id) as {data_json:string}|undefined
    if(row.deadline<=this.now()){this.db.prepare("UPDATE standing_triggers SET state='expired' WHERE id=?").run(row.id);continue}
    if(!observed||(JSON.parse(observed.data_json) as Observation).expiresAt<=this.now()||!sourcesCurrent(this.db,JSON.parse(required.source_versions_json) as Record<string,string>)){this.db.prepare("UPDATE standing_triggers SET state='invalidated' WHERE id=?").run(row.id);continue}
    if(!this.connected||!this.clockCurrent()||!rule||!t||t.state!=='paused'||rule.revokedAt||rule.goalRevision!==t.goalRevision||rule.policyRevision!==(t.policyRevision??1)||rule.authorityRef!==t.authorityRef||row.deadline<=this.now()||rule.expiresAt<=this.now()||!this.repository.canAccess(t.id,'ackem')){this.db.prepare("UPDATE standing_triggers SET state='invalidated' WHERE id=?").run(row.id);continue}
    try{this.db.transaction(()=>{this.repository.bindStandingExecution(t.id,{ruleId:rule.id,triggerId:row.id,deadline:row.deadline,maxContextTokens:rule.maxContextTokens,maxModelCalls:rule.maxModelCalls});if(!standingExecutionAllowed(this.db,this.repository.require(t.id).snapshot,this.now()))throw Error('Standing rule no longer applicable');this.coordinator.resumeFromStandingRule(t.id);this.db.prepare("UPDATE standing_triggers SET state='dispatched' WHERE id=?").run(row.id)})()}catch{this.db.prepare("UPDATE standing_triggers SET state='invalidated' WHERE id=? AND state='reserved'").run(row.id)}
   }
   if(rows.length)await this.coordinator.pump()
  }finally{this.evaluating=false}
 }
 async enforceCurrentAuthority():Promise<void>{
  let stopped=false;const clockCurrent=this.clockCurrent()
  for(const t of this.repository.list().filter(t=>t.standingExecution&&['queued','running','reviewing','waiting_user','unknown'].includes(t.state))){
   if(clockCurrent&&this.connected&&standingExecutionAllowed(this.db,t,this.now())&&this.repository.canAccess(t.id,'ackem'))continue
   // Stop remains permitted after management revocation; the existing control command carries the new fence.
   this.db.transaction(()=>{this.db.prepare("UPDATE standing_triggers SET state='expired' WHERE id=? AND state IN ('reserved','dispatched')").run(t.standingExecution!.triggerId);this.repository.stop(t.id,'system',{source:'standing_rule_guard',reason:!clockCurrent?'host_clock_unconfirmed':!this.connected?'host_connection_unconfirmed':!this.repository.canAccess(t.id,'ackem')?'current_grant_revoked':'rule_expired_or_source_invalidated',ruleId:t.standingExecution!.ruleId,triggerId:t.standingExecution!.triggerId})})();this.coordinator.publish(t.id,'standing_rule_stopped');stopped=true
  }
  if(stopped)await this.coordinator.pump()
 }
 context(taskIds:string[],ref?:string):string {
  const allowed=new Set(this.worldState(taskIds,ref).tasks.map(t=>t.id))
  const goals=this.goals(ref).filter(g=>g.taskIds.every(id=>allowed.has(id))&&g.taskIds.some(id=>this.repository.get(id)?.snapshot.longTermGoalId===g.id)).map(g=>({id:g.id,outcome:g.expectedOutcome,constraints:g.constraints,state:g.state,version:g.version}))
  const decisions=[...allowed].flatMap(id=>this.decisions(id,ref).slice(0,3))
  return JSON.stringify({goals,decisions}).slice(0,10000)
 }
 captureContext(taskIds:string[],ref?:string):{text:string;isCurrent:()=>boolean} {
  const text=this.context(taskIds,ref),allowed=new Set(this.worldState(taskIds,ref).tasks.map(t=>t.id))
  const goals=this.goals(ref).filter(g=>g.taskIds.every(id=>allowed.has(id))&&g.taskIds.some(id=>this.repository.get(id)?.snapshot.longTermGoalId===g.id))
  const decisions=[...allowed].flatMap(id=>this.decisions(id,ref).slice(0,3))
  const versions=Object.assign({},...goals.map(g=>g.sourceVersions),...decisions.map(d=>d.sourceVersions)) as Record<string,string>
  return {text,isCurrent:()=>{
   if(Object.keys(versions).length&&!sourcesCurrent(this.db,versions,ref))return false
   if(goals.some(g=>{const row=this.db.prepare('SELECT data_json FROM task_goals WHERE id=?').get(g.id) as {data_json:string}|undefined;if(!row)return true;const current=JSON.parse(row.data_json) as Goal;return current.version!==g.version||current.state==='revoked'||current.taskIds.some(id=>this.repository.get(id)?.snapshot.longTermGoalId!==current.id)}))return false
   if(decisions.some(d=>{const row=this.db.prepare('SELECT data_json FROM task_decisions WHERE id=?').get(d.id) as {data_json:string}|undefined;if(!row)return true;const current=JSON.parse(row.data_json) as DecisionRecord;return !!current.invalidatedAt||current.basis!==d.basis||!sourcesCurrent(this.db,current.sourceVersions,ref)}))return false
   return true
  }}
 }
}
