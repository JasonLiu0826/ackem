import {formatTaskDelivery} from './delivery'
import { respondInWork,cancelWorkReply } from './workConversation'
import {verifiedWorkAttachmentSources} from '../ackemcode/workAttachmentGrants'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { TaskRepository, type TaskRecord, type TaskCommand } from './repository'
import { TaskCoordinator, type TaskDriver, type TaskInputIntent } from './coordinator'
import { TaskNotificationOutbox } from './communication'
import { getDatabase } from '../db/database'
import { loadSettings } from '../settings'
import { ensureDefaultWorkDirectory } from '../ackemcode/workDirectory'
import { ensureDaemon, ackemCodeBaseUrl } from '../ackemcode/ensureDaemon'
import { createCodeSession, getCodeSessionSnapshot, getKernelTaskCapabilities, setHostTask, setHostTaskHold, startChatStream, stopHostTask } from '../ackemcode/client'
import { codeSessionHeaders } from '../ackemcode/hostSessionBindings'
import { createLlmJsonClient } from '../llmClient'
import { supervisorFor } from '../ackemcode/workSupervisorService'
import { emit } from '../ackemcode/workRuntimeService'
import { broadcastToRenderers } from '../rendererBroadcast'
import { openActionPort } from '../memory/adapters/composeMemorySystem'
import { withPersistedAction } from '../memory/adapters/actionExecution'
import { toReceiptEvent, trustedFrom } from '../ackemcode/receiptProjection'
import { isChatStreaming } from '../chat/streamState'
import { appendUnifiedChatMessage } from '../chat/unifiedChatHistory'
import { setCompanionTaskBusy } from '../companion/initiativeState'
import type { TaskSubmitRequest, TaskSnapshot } from '../../shared/tasks'
import {canStopTaskExecution,executionResultText,hasFinalExecutionResult} from '../../shared/tasks'
import { engineSessionId } from '../session/canonical'
import { resolveIntent } from '../extensions/dispatch/intentResolver'
import { buildSelectedPersonalityVoice, personalityResultLead } from '../personalityVoice'
import { guardReplyText } from '../channel/outputGuard'
import { commitHostInspection, getHostSystem, refreshHostManifest } from '../system/host'
import { adoptLegacyTasks } from './legacy'
import {LongTermControl,standingExecutionAllowed} from './longTerm'

const contexts=new Map<string,ReturnType<typeof makeRuntime>>()
const contextFor=(r:TaskRecord)=>{
  const policy=loadSettings().taskPolicy??{}
  const positive=(value:number|undefined,fallback:number)=>Number.isFinite(value)&&value!>0?value!:fallback
  const configuredTokens=positive(policy.maxContextTokens,0)
  const contextTokens=r.snapshot.standingExecution?Math.min(r.snapshot.standingExecution.maxContextTokens,configuredTokens||Infinity):configuredTokens
  return{taskId:r.snapshot.id,goalRevision:r.snapshot.goalRevision,controlEpoch:r.snapshot.controlEpoch,fencingToken:Math.max(1,r.fence),deadline:Math.min(r.snapshot.standingExecution?.deadline??Infinity,r.snapshot.createdAt+positive(policy.maxDurationMs,24*60*60*1000)),maxModelCalls:Math.min(r.snapshot.standingExecution?.maxModelCalls??Infinity,positive(policy.maxModelCallsPerAttempt,80)),...(r.snapshot.contract?{...(r.snapshot.inspectionScope?{allowedResourcePaths:r.snapshot.contract.scope.resourceRefs}:{}),readOnlyResourcePaths:r.snapshot.contract.scope.readOnlyResourceRefs,excludedResourcePaths:r.snapshot.contract.scope.exclusions}:{}),...(contextTokens?{maxContextTokens:contextTokens}:{}),...(r.snapshot.inspectionScope?{readOnly:true,allowedReadPaths:r.snapshot.inspectionPaths}:{})}
}
const shell=(name:string)=>/^(bash|powershell|shell)$/i.test(name)

async function classify(input:TaskSubmitRequest,tasks:TaskSnapshot[]):Promise<TaskInputIntent>{
  const result=await resolveIntent(input.text,input.conversationId,createLlmJsonClient(loadSettings()),tasks)
  return result.taskIntent??{kind:'unclear'}
}
function makeRuntime(root:string){
  const db=getDatabase(root);if(!db)throw Error('任务数据库不可用，未启动执行')
  const policy=loadSettings().taskPolicy??{}
  const positive=(value:number|undefined,fallback:number)=>Number.isFinite(value)&&value!>0?value!:fallback
  const repository=new TaskRepository(db),notifications=new TaskNotificationOutbox(db,positive(policy.notificationIntervalMs,30_000))
  const legacyPort=openActionPort(root);if(legacyPort)adoptLegacyTasks(repository,legacyPort)
  repository.onProjectionChanged=task=>{
    notifications.supersedeTask(task.id,task.goalRevision)
    const retainedResult=task.state==='paused'&&hasFinalExecutionResult(task)
    const kind=task.state==='completed'||retainedResult?'result':task.state==='failed'?'failure':task.state==='paused'?'stopped':undefined
    if(retainedResult&&task.delivery?.state==='published')return
    if(kind&&repository.canAccess(task.id,'ackem')){
      const notificationId=notifications.enqueue({taskId:task.id,goalRevision:task.goalRevision,deliverySurface:task.deliverySurface,sourceConversationId:task.deliveryConversationId??task.originConversationId,kind,eventId:task.currentRunId??task.id,factFingerprint:task.summary??task.state})
      if(task.acceptance?.state==='accepted'&&notificationId&&!task.delivery?.notificationId){task.delivery={state:'pending',goalRevision:task.goalRevision,notificationId};db.prepare('UPDATE task_projection SET snapshot_json=? WHERE id=?').run(JSON.stringify(task),task.id)}
      else if(task.acceptance?.state==='accepted'&&!notificationId&&task.delivery?.state!=='published'){task.delivery={state:'suppressed',goalRevision:task.goalRevision};db.prepare('UPDATE task_projection SET snapshot_json=? WHERE id=?').run(JSON.stringify(task),task.id)}
    }
  }
  let coordinator:TaskCoordinator
  const inFlight=new Map<string,{external:boolean;finished:boolean;feedbackAt:number;phase:string;operations:number}>()
  const notify=(task:TaskSnapshot,kind:'progress'|'result'|'failure'|'stopped',fact:string)=>{
    if(!repository.canAccess(task.id,'ackem'))return
    db.transaction(()=>{repository.observe(task.id,task,{kind,fact});notifications.enqueue({taskId:task.id,goalRevision:task.goalRevision,deliverySurface:task.deliverySurface,sourceConversationId:task.deliveryConversationId??task.originConversationId,kind,eventId:task.currentRunId??task.id,factFingerprint:fact})})()
  }
  const publish=(id:string,type:string,message?:string)=>{coordinator.publish(id,type,undefined,message);const task=repository.require(id).snapshot;setCompanionTaskBusy(id,task.state!=='queued'&&canStopTaskExecution(task))}
  const driver:TaskDriver={
    async hold(record,held){if(record.snapshot.codeSessionId&&['running','waiting_user','reviewing'].includes(record.snapshot.state))await setHostTaskHold(record.snapshot.codeSessionId,contextFor(record),held)},
    async start(record,command){
      const t=record.snapshot,runId=t.currentRunId!
      if(!repository.canAccess(t.id,'ackem')||!standingExecutionAllowed(db,t))throw Error('任务没有有效托管授权')
      if(!t.contract||t.contract.contractRevision!==t.goalRevision)throw Error('当前目标没有匹配的有效工作契约')
      const attemptInstruction=JSON.stringify({contract:t.contract,filesystemAccess:t.inspectionScope?'workspace':t.permissionMode==='bypassPermissions'?'full_machine':'permission_checked',filesystemAccessExplanation:!t.inspectionScope?'cwd 是起始目录，resourceRefs 是任务相关资源而非电脑访问白名单。可以按目标检查外部文件、已安装应用、系统状态及调用终端；每次询问/自动允许编辑仍按实际工具审批，完全放开直接执行。遵守明确排除范围、只读限制与任务要求。':undefined,attemptInstruction:record.instruction})
      const current=()=>repository.canAccess(t.id,'ackem')&&standingExecutionAllowed(db,repository.require(t.id).snapshot)&&repository.matches(repository.require(t.id),command)
      const awaitInputBoundary=async():Promise<boolean>=>{
        let waited=false
        while(current()&&repository.hasPendingInput(t.id)){waited=true;await new Promise(resolve=>setTimeout(resolve,25))}
        if(!current())return false
        const session=repository.require(t.id).snapshot.codeSessionId
        if(waited&&session){await setHostTaskHold(session,contextFor(repository.require(t.id)),false);if(!current())return false;if(repository.hasPendingInput(t.id))return awaitInputBoundary()}
        return !repository.hasPendingInput(t.id)
      }
      const ready=await ensureDaemon();if(!ready.ok)throw Error(ready.reason)
      const caps=await getKernelTaskCapabilities()
      if(!caps.capabilities.taskBinding||!caps.capabilities.goalRevisionFence||!caps.capabilities.toolBoundary||!caps.capabilities.stopSettlement)throw Error('内核版本不支持可靠任务协调，请更新 AckemCode')
      if(!caps.capabilities.taskBudgets||(t.inspectionScope&&!caps.capabilities.scopedInspection))throw Error('当前内核尚未支持任务预算或限定调查范围，请重启并更新 AckemCode')
      if(t.permissionMode==='bypassPermissions'&&!caps.capabilities.fullMachineAccess)throw Error('当前内核尚未加载全机访问更新，请重启 AckemCode 后继续')
      if((t.effort||t.executionMode==='plan')&&!caps.capabilities.executionOptions)throw Error('当前 AckemCode 内核尚未加载模式与思考等级更新，请重启 AckemCode 后继续')
      if(!await awaitInputBoundary())return
      if(record.attempts>positive(policy.maxAttempts,8)||Date.now()-t.createdAt>positive(policy.maxDurationMs,24*60*60*1000)){repository.transition(t.id,command,'waiting_user',{summary:'自动执行预算已到，保留结果等待用户调整目标',executionQuiescent:true});publish(t.id,'budget');return}
      if(policy.maxCostUsd&&policy.maxCostUsd>0){repository.transition(t.id,command,'waiting_user',{summary:'设置了费用上限，但服务商未提供可核对的费用计量，暂未执行；可调整预算设置',executionQuiescent:true});publish(t.id,'budget');return}
      let session=t.codeSessionId
      if(!session){session=(await createCodeSession({cwd:t.cwd,ackemTask:{kind:'work.job',summary:t.goal.slice(0,200),tag:null},hostTask:contextFor(record)})).sessionId;if(!current())return;repository.transition(t.id,command,'running',{codeSessionId:session});t.codeSessionId=session}
      await setHostTask(session,contextFor(record))
      if(!await awaitInputBoundary())return
      const backend=await fetch(`${ackemCodeBaseUrl()}/api/session/${session}`,{headers:codeSessionHeaders(session)}).then(async response=>{if(!response.ok)throw Error('无法核对任务权限');return await response.json() as {policyRevision:number}})
      const response=await fetch(`${ackemCodeBaseUrl()}/api/session/${session}/mode`,{method:'POST',headers:codeSessionHeaders(session),body:JSON.stringify({mode:record.permissionMode,expectedPolicyRevision:backend.policyRevision,expectedControlEpoch:t.controlEpoch})})
      if(!response.ok)throw Error('无法同步任务权限模式')
      const confirmed=await response.json() as {permissionMode:TaskSnapshot['permissionMode'];policyRevision:number}
      if(!current())return
      repository.confirmPermissionMode(t.id,confirmed.permissionMode!,confirmed.policyRevision,repository.require(t.id).snapshot.policyRevision??1)
      if(t.executionMode==='plan'){
        const planned=await fetch(`${ackemCodeBaseUrl()}/api/session/${session}/mode`,{method:'POST',headers:codeSessionHeaders(session),body:JSON.stringify({mode:'plan',expectedPolicyRevision:confirmed.policyRevision,expectedControlEpoch:t.controlEpoch})})
        if(!planned.ok)throw Error('无法切换到 Plan 模式')
        const planConfirmed=await planned.json() as typeof confirmed
        if(!current())return
        repository.confirmPermissionMode(t.id,planConfirmed.permissionMode!,planConfirmed.policyRevision,repository.require(t.id).snapshot.policyRevision??1)
      }
      if(!current())return
      const port=openActionPort(root);if(!port)throw Error('记忆行动账本不可用')
      const supervisor=supervisorFor(root)
      supervisor.updateGoal(t.id,t.goal)
      supervisor.begin({id:t.id,codeSessionId:session,chatSessionId:t.deliveryConversationId??t.originConversationId,cwd:t.cwd,goal:t.goal,currentRunId:runId,currentTurnId:runId,instruction:record.instruction},supervisor.get(t.id)?t.id:undefined)
      const live={external:false,finished:false,feedbackAt:Date.now(),phase:'正在分析任务并准备操作',operations:0};inFlight.set(t.id,live)
      const files=new Set<string>(),toolNames=new Map<string,string>(),paths=new Map<string,string>(),checks:Array<{command:string;ok:boolean;required?:boolean}>=[],commands=new Map<string,string>(),evidence:Array<{tool:string;ok:boolean;output:string}>=[]
      let summary='',stopMessage='',finalReply=false,terminal=false,budgetExceeded=false
      const inspectionReads=new Set<string>()
      publish(t.id,'running');emit(null,t.id,runId,{type:'supervisor_turn',text:record.instruction,createdAt:Date.now(),attachments:t.attachments},{goalRevision:t.goalRevision,controlEpoch:t.controlEpoch})
      const fail=(message:string)=>{if(terminal)return;terminal=true;if(current()){repository.transition(t.id,command,'unknown',{summary:message});notify(repository.require(t.id).snapshot,'failure',message);publish(t.id,'unknown')}emit(null,t.id,runId,{type:'transport_error',message})}
      await new Promise<void>((resolveDone,reject)=>{
        void withPersistedAction(port,{runId,parentRunId:null,nature:'work',sessionId:t.originConversationId,turnId:runId,correlationId:t.id,planId:null,targetId:'work.job',initialStatus:'accepted',requestSummary:t.goal.slice(0,1000),execution:{prompt:record.instruction,cwd:t.cwd,targetId:'work.job',workKind:'job',hostRunId:runId,params:{productTaskId:t.id,goalRevision:t.goalRevision,controlEpoch:t.controlEpoch,codeSessionId:session}}},async()=>{
          if(!await awaitInputBoundary()){resolveDone();return}
          port.bindRuntime(runId,session!)
          startChatStream({sessionId:session!,text:attemptInstruction,effort:t.effort,hostRunId:runId,hostTask:contextFor(record),attachments:t.attachments,
            onEvent:event=>{
              if(event.type==='tool_start'){
                const name=String(event.name??'');toolNames.set(String(event.id),name)
                if(current()&&repository.require(t.id).snapshot.state==='waiting_user'){repository.transition(t.id,command,'running');publish(t.id,'tool_execution')}
                if(shell(name)){live.external=true;commands.set(String(event.id),String((event.input as Record<string,unknown>)?.command??''))}
                const p=(event.input as Record<string,unknown>)?.path??(event.input as Record<string,unknown>)?.file_path
                if(typeof p==='string'&&/write|edit|replace/i.test(name))paths.set(String(event.id),resolve(t.cwd,p))
              }
              if(!current()){
                if(['tool_result','attachments_loaded','done'].includes(event.type))repository.historical(t,{runId,event:{...event,text:undefined},stale:true})
                if(event.hostTurnReceipt?.hostRunId===runId)port.record({kind:'runtime.received',receipt:{source:'ackemcode',runId,codeSessionId:session!,hostRunId:runId,at:new Date().toISOString(),event:toReceiptEvent(event),trustedReceipt:trustedFrom(event.hostTurnReceipt)}})
                if(event.type==='done'){live.finished=true;resolveDone()}return
              }
              emit(null,t.id,runId,event,{goalRevision:t.goalRevision,controlEpoch:t.controlEpoch})
              supervisor.recordRuntimeEvent(t.id,runId,event)
              let validReceipt=!event.hostTurnReceipt
              if(event.hostTurnReceipt){
                if(repository.receipt(t.id,event.hostTurnReceipt.hostRunId,event.hostTurnReceipt.revision,command)){
                  validReceipt=true
                  const result=port.record({kind:'runtime.received',receipt:{source:'ackemcode',runId,codeSessionId:session!,hostRunId:runId,at:new Date().toISOString(),event:toReceiptEvent(event),trustedReceipt:trustedFrom(event.hostTurnReceipt)}})
                  if(!result.ok){fail(`执行回执无法记账：${result.message}`);resolveDone();return}
                }
              }
              if(event.type==='assistant_delta')summary+=String(event.text??'')
              if(event.type==='mode_changed'&&event.mode!=='plan'&&t.executionMode==='plan'){
                t.executionMode='agent'
                repository.transition(t.id,command,'running',{executionMode:'agent'});publish(t.id,'plan_approved')
              }
              if(event.type==='mode_changed'&&event.mode==='bypassPermissions'&&Number(event.policyRevision??0)>=(repository.require(t.id).snapshot.policyRevision??1)){supervisor.recordRuntimePolicy(session!);const policySnapshot=repository.require(t.id).snapshot;repository.confirmPermissionMode(t.id,'bypassPermissions',Number(event.policyRevision),policySnapshot.policyRevision??1);if(repository.require(t.id).snapshot.state==='waiting_user'&&supervisor.get(t.id)?.state==='running'){repository.transition(t.id,command,'running');publish(t.id,'runtime_policy')}}
              if(event.type==='error'&&String(event.message??'').includes('task_budget_exhausted:'))budgetExceeded=true
              if(event.type==='thinking'&&event.phase!=='end')live.phase=live.operations?'正在核对已收到的结果并准备下一步':'正在分析任务并准备操作'
              if(event.type==='assistant_message'){
                if(event.final===false&&event.incomplete===true){summary=String(event.text??'');finalReply=false}
                else if(event.final===false){summary='';finalReply=false;const feedback=String(event.text??'').trim();if(feedback){live.feedbackAt=Date.now();notify(repository.require(t.id).snapshot,'progress',feedback)}}
                else {summary=String(event.text??'');finalReply=true}
              }
              if(event.type==='attachments_loaded'){
                for(const item of event.items as Array<{path:string;kind:string;omitted?:string;body?:string;mediaCount?:number}>??[]){const proof={tool:'attachment_read',ok:!item.omitted,output:JSON.stringify(item).slice(0,3000)};if(!item.omitted&&item.kind==='file')inspectionReads.add(item.path);evidence.push(proof);repository.observe(t.id,command,{evidence:proof});supervisor.recordEvidence(t.id,runId,proof)}
              }
              if(event.type==='tool_result'){
                const proof={tool:toolNames.get(String(event.id))??'tool',ok:event.ok===true,output:String(event.output??event.content??'').slice(0,3000)};evidence.push(proof);repository.observe(t.id,command,{evidence:proof});supervisor.recordEvidence(t.id,runId,proof)
                live.operations++;live.phase='正在整理执行结果'
                if(commands.has(String(event.id)))checks.push({command:commands.get(String(event.id))!,ok:event.ok===true,required:false})
                if(event.ok===true&&paths.has(String(event.id))){const path=paths.get(String(event.id))!;files.add(path);const fact=`已保存产物：${basename(path)}，继续核对任务要求`;repository.transition(t.id,command,repository.require(t.id).snapshot.state,{summary:fact});notify(repository.require(t.id).snapshot,'progress',fact)}
              }
              if(['permission_request','plan_approval','enter_plan_approval','ask_user'].includes(event.type)){
                repository.transition(t.id,command,'waiting_user');publish(t.id,'approval')
                void supervisor.permission(t.id,event.type==='permission_request'?event:{...event,toolName:event.type==='ask_user'?'补充任务信息':'执行计划',input:event.type==='ask_user'?{questions:event.questions}:{plan:event.plan}}).then(()=>{
                  if(current()&&supervisor.get(t.id)?.state==='running'){repository.transition(t.id,command,'running');publish(t.id,'approved')}
                }).catch(e=>emit(null,t.id,runId,{type:'status',message:String(e)}))
              }
              if(event.type==='status'){
                if(event.code==='permission_timeout')stopMessage='审批等待已超时，任务已停止；当前操作未执行，可重新发送要求继续。'
                const fact=String(event.message??'').slice(0,300)
                if(fact)repository.observe(t.id,command,{internalStatus:fact})
              }
              if(event.type==='done'){
                live.finished=true
                void (async()=>{
                  if(terminal)return;terminal=true
                  const receipt=event.hostTurnReceipt
                  if(!validReceipt||!receipt||receipt.hostRunId!==runId||!['succeeded','failed','aborted'].includes(receipt.state)){repository.transition(t.id,command,'unknown',{summary:'缺少与当前执行匹配的最新终态回执'});publish(t.id,'unknown');return}
                  let quiet=false
                  for(let i=0;i<30;i++){const snap=await getCodeSessionSnapshot(session!);if(snap?.executionQuiescent){quiet=true;break}if(snap?.stopState==='unknown')break;await new Promise(r=>setTimeout(r,100))}
                  if(!quiet){repository.transition(t.id,command,'unknown',{summary:'执行轮已返回，仍需核对后台进程是否结束'});publish(t.id,'unknown');return}
                  if(!current())return
                  repository.transition(t.id,command,repository.require(t.id).snapshot.state,{executionQuiescent:true,...(summary.trim()?{executionResult:{text:summary,goalRevision:t.goalRevision,runId,kind:finalReply?'final' as const:'partial' as const}}:{}),execution:{state:receipt.state as 'succeeded'|'failed'|'aborted',goalRevision:t.goalRevision,runId,receiptRevision:receipt.revision,quiescent:true},acceptance:{state:receipt.state==='succeeded'?'delivery_ready':'not_ready',goalRevision:t.goalRevision,runId,evidenceRefs:evidence.map((_,index)=>`${runId}:evidence:${index}`)}})
                  if(budgetExceeded){repository.transition(t.id,command,'waiting_user',{summary:'执行预算已到，产物与证据已保留，等待调整任务或预算',executionQuiescent:true});publish(t.id,'budget');return}
                  if(receipt.state==='aborted'){supervisor.interrupted(t.id,stopMessage||'内核执行已停止，未完成的门禁已失效');repository.transition(t.id,command,'paused',{summary:stopMessage||'内核执行已停止',userSummary:stopMessage||'任务已停止，尚未生成最终答复；已有阶段反馈和操作记录已保留。',executionQuiescent:true});publish(t.id,'stopped');return}
                  if(t.executionMode==='plan'){
                    repository.transition(t.id,command,'waiting_user',{summary:summary||'计划已生成，等待你确认后执行',executionQuiescent:true});publish(t.id,'plan_ready');return
                  }
                  if(!repository.hasContractSources(t.id)){repository.transition(t.id,command,'waiting_user',{summary:'契约缺少可查询的来源或注册验收验证器',executionQuiescent:true});publish(t.id,'contract_blocked');return}
                  repository.transition(t.id,command,'reviewing',{summary,acceptance:{state:'reviewing',goalRevision:t.goalRevision,runId,evidenceRefs:evidence.map((_,index)=>`${runId}:evidence:${index}`)}});publish(t.id,'reviewing')
                  const review=await supervisor.finish(t.id,runId,{ok:receipt.state==='succeeded',contract:t.contract,summary,files:[...files],checks,evidence})
                  for(let i=0;repository.hasPendingInput(t.id)&&i<160;i++)await new Promise(r=>setTimeout(r,100))
                  if(repository.hasPendingInput(t.id)){repository.transition(t.id,command,'unknown',{summary:'正在等待未处理的用户输入，验收结果暂不交付'});publish(t.id,'unknown');return}
                  if(!current())return
                  repository.observe(t.id,command,{review,files:[...files],checks})
                  if(review.instruction&&review.state==='reviewing'){repository.projectStages(t.id,command,{acceptance:{state:'rework',goalRevision:t.goalRevision,runId,evidenceRefs:evidence.map((_,index)=>`${runId}:evidence:${index}`),reason:review.reason}});repository.requeue(t.id,command,`当前完整目标：${t.goal}\n\n验收要求：${review.instruction}`);publish(t.id,'rework');return}
                  const unavailable=review.reviewUnavailable&&receipt.state==='succeeded'&&!!summary.trim()
                  const state=review.state==='completed'?'completed':unavailable?'unknown':'waiting_user'
                  if(state==='completed'&&t.inspectionScope&&t.inspectionFingerprint)commitHostInspection(root,{scope:t.inspectionScope,summary:summary.slice(0,2000),readPaths:[...inspectionReads],taskId:t.id,runId,manifestAtStart:{...getHostSystem(root).exportManifest(),...t.inspectionFingerprint}})
                  repository.transition(t.id,command,state,{summary:state==='completed'||unavailable?summary:`尚未通过验收：${review.reason}`,userSummary:review.userSummary,reviewIssue:unavailable?'unavailable':undefined,artifacts:[...files],executionQuiescent:true,acceptance:{state:state==='completed'?'accepted':'not_ready',goalRevision:t.goalRevision,runId,evidenceRefs:evidence.map((_,index)=>`${runId}:evidence:${index}`),reason:review.reason},delivery:{state:state==='completed'||unavailable?'pending':'not_ready',goalRevision:t.goalRevision}})
                  notify(repository.require(t.id).snapshot,state==='completed'||unavailable?'result':'failure',repository.require(t.id).snapshot.summary??'')
                  publish(t.id,'review_result')
                })().catch(e=>{repository.transition(t.id,command,'unknown',{summary:`验收未确认：${String(e)}`});publish(t.id,'unknown')}).finally(resolveDone)
              }
            },onError:e=>{fail(e.message);resolveDone()},onDisconnect:()=>{fail('工作连接中断，等待核对执行回执');resolveDone()},onProtocolWarning:warning=>repository.observe(t.id,command,{protocolWarning:warning})})
        }).then(outcome=>{if(!outcome.executed){reject(Error('执行记录未持久化或已经运行'))}}).catch(reject)
      })
    },
    async control(record,command){
      const session=record.snapshot.codeSessionId
      if(!session)return record.attempts===0&&!record.snapshot.currentRunId?'settled':'unknown'
      supervisorFor(root).takeover(session,'用户更新任务要求，旧审批与验收已失效')
      await setHostTask(session,contextFor(record),true)
      const stop=await stopHostTask(session)
      const external=inFlight.get(record.snapshot.id)?.external
      const caps=await getKernelTaskCapabilities()
      if(external&&!caps.capabilities.processTreeCancel)return 'unknown'
      if(stop.stopState==='settled')return 'settled'
      for(let i=0;i<Math.ceil(positive(policy.stopConfirmationMs,5000)/250);i++){
        await new Promise(resolveWait=>setTimeout(resolveWait,250))
        const snap=await getCodeSessionSnapshot(session)
        if(snap?.hostTask?.taskId!==record.snapshot.id)return 'unknown'
        if(snap.stopState==='settled'&&snap.executionQuiescent)return 'settled'
      }
      return 'unknown'
    },
    async reconcile(record){
      if(!record.snapshot.codeSessionId)return 'unknown'
      const ready=await ensureDaemon();if(!ready.ok)return 'unknown'
      const snap=await getCodeSessionSnapshot(record.snapshot.codeSessionId)
      if(!snap)return 'unknown'
      if(!snap.hostTask&&record.snapshot.legacyRunId){return snap.hostTurnReceipt?.hostRunId===record.snapshot.legacyRunId&&['succeeded','failed','aborted'].includes(snap.hostTurnReceipt.state)&&snap.executionQuiescent?'settled':'unknown'}
      if(snap.hostTask?.taskId!==record.snapshot.id)return 'unknown'
      const receipt=snap.hostTurnReceipt
      if(receipt && receipt.hostRunId===record.snapshot.currentRunId&&['succeeded','failed','aborted'].includes(receipt.state)&&snap.executionQuiescent)return 'settled'
      if(snap.stopState==='settled'&&snap.executionQuiescent)return 'settled'
      return 'unknown'
    }
  }
  coordinator=new TaskCoordinator(repository,driver,{principal:'ackem',delivery:input=>input.origin==='workbench'?{deliverySurface:'chat',deliveryConversationId:engineSessionId()}:undefined,attachmentSources:input=>verifiedWorkAttachmentSources(root,(input.attachments??[]).map(a=>a.path)),authority:input=>({domainId:'ackem:managed',workspaceId:'pinned-ackem',ownerPrincipalId:'user',managerPrincipalId:'ackem',supervisionPolicy:'ackem_managed'}),cwd:async input=>{
    const path=input.cwd||ensureDefaultWorkDirectory(root);if(!isAbsolute(path))throw Error('工作目录必须为本机绝对路径')
    if(!(await stat(path)).isDirectory())throw Error('工作目录不存在');return realpath(path)
  },classify,cancelInput:cancelWorkReply,respond:(input,tasks)=>respondInWork(root,input,tasks),emit:event=>broadcastToRenderers('tasks:event',event),supersede:(id,revision)=>notifications.supersedeTask(id,revision),queried:t=>{notifications.reportQueried(t.id,t.summary??coordinator.status(t));if(t.acceptance?.state==='accepted'&&['pending','failed'].includes(t.delivery?.state??''))repository.projectStages(t.id,t,{delivery:{state:'suppressed',goalRevision:t.goalRevision,notificationId:t.delivery?.notificationId}})},suppress:(id,forget)=>{notifications.suppressTask(id,forget);const task=repository.require(id).snapshot;if(forget&&task.acceptance?.state==='accepted'&&['pending','failed'].includes(task.delivery?.state??''))repository.projectStages(id,task,{delivery:{state:'suppressed',goalRevision:task.goalRevision,notificationId:task.delivery?.notificationId}})}})
  const longTerm=new LongTermControl(repository,coordinator,Date.now,()=>{const system=getHostSystem(root);return {manifest:system.exportManifest(),capabilities:system.getFacts({limit:20})}})
  const recoveredResults=new Map<string,number>(),recoveringResults=new Set<string>()
  const lostStoppedBody=(task:TaskSnapshot)=>task.state==='paused'&&!task.executionResult&&['已确认内核停止；任务记录已保留','已核对执行停止，记录保留；完成状态仍需验收','重启后已核对停止状态；可发送新要求继续'].includes(task.summary??'')
  const recoverExecutionResults=async()=>{
    for(const task of repository.visibleList().filter(t=>(lostStoppedBody(t)||['waiting_user','unknown'].includes(t.state)&&!t.reviewIssue&&t.acceptance?.reason==='验收连接失败，保留任务记录，尚未确认完成')&&t.execution?.state==='succeeded'&&t.executionQuiescent&&t.codeSessionId&&repository.canAccess(t.id,'ackem')&&!repository.hasPendingInput(t.id))){
      const stopped=lostStoppedBody(task)
      const key=`${task.id}:${task.goalRevision}:${task.controlEpoch}:${task.currentRunId}`
      if(recoveringResults.has(key)||(recoveredResults.get(key)??0)>=3)continue
      recoveredResults.set(key,(recoveredResults.get(key)??0)+1);recoveringResults.add(key)
      const snapshot=await getCodeSessionSnapshot(task.codeSessionId!,AbortSignal.timeout(5000)).catch(()=>null).finally(()=>recoveringResults.delete(key))
      if(!snapshot)continue;recoveredResults.set(key,3)
      const binding=snapshot?.hostTask,receipt=snapshot?.hostTurnReceipt
      if(!receipt||!binding||binding.taskId!==task.id||binding.goalRevision!==task.goalRevision||binding.controlEpoch!==task.controlEpoch||receipt.hostRunId!==task.currentRunId||receipt.state!=='succeeded'||receipt.hostTask?.taskId!==task.id||receipt.hostTask.goalRevision!==task.goalRevision||(!stopped&&receipt.hostTask.controlEpoch!==task.controlEpoch)||stopped&&(receipt.hostTask.controlEpoch>task.controlEpoch||receipt.revision!==task.execution?.receiptRevision||snapshot.stopState!=='settled')||!snapshot.executionQuiescent||snapshot.turnRunning||!stopped&&snapshot.hostTaskStopped)continue
      const last=snapshot.history?.at(-1),summary=last?.role==='assistant'?last.content:undefined
      const current=repository.get(task.id)?.snapshot
      if(!summary?.trim()||!current||current.state!==task.state||!repository.canAccess(task.id,'ackem')||repository.hasPendingInput(task.id)||!repository.matches(repository.require(task.id),task))continue
      if(repository.transition(task.id,task,stopped?'paused':'unknown',{summary,executionResult:{text:summary,goalRevision:task.goalRevision,runId:task.currentRunId!},...(!stopped?{reviewIssue:'unavailable' as const,userSummary:'执行结果已保留，自动验收暂时不可用。',delivery:{state:'pending' as const,goalRevision:task.goalRevision}}:{})})){if(!stopped||task.delivery?.state!=='published')notify(repository.require(task.id).snapshot,'result',summary);publish(task.id,'recovered_result')}
    }
  }
  const flush=()=>{
    const conversationId=engineSessionId()
    for(const n of notifications.pending({conversationId,includeInactiveResults:true,unrelatedTopic:Date.now()-(lastTaskInteraction.get(conversationId)??0)>10*60_000})){
      if(n.deliverySurface==='chat'&&isChatStreaming(n.sourceConversationId))continue
      const t=repository.get(n.taskId)?.snapshot
      if(!t||!repository.canAccess(t.id,'ackem')||t.goalRevision!==n.goalRevision){notifications.supersedeTask(n.taskId,t?.goalRevision??n.goalRevision+1);continue}
      if(repository.hasPendingInput(t.id))continue
      if(n.kind==='progress'&&['completed','failed','paused'].includes(t.state)){notifications.markDelivered(n.notificationId);continue}
      try{if(n.deliverySurface==='chat'){
        const terminalStatus=t.state==='completed'?'succeeded':t.state==='failed'?'failed':t.state==='paused'?'aborted':'unknown'
        const status=t.state==='waiting_user'?'waiting_permission':n.kind==='progress'?'running':terminalStatus
        const body=formatTaskDelivery(n.kind==='progress'?{...t,userSummary:n.factFingerprint}:t,n.kind==='progress'?'阶段进展。':personalityResultLead(loadSettings(),terminalStatus),n.kind==='progress')
        const content=n.kind==='result'||n.kind==='progress'?body:guardReplyText(body,{origin:'action_result',style:'assistant',status:t.reviewIssue==='unavailable'?'succeeded':status,runId:t.currentRunId,receipt:{files:t.artifacts??[]}})
        appendUnifiedChatMessage(root,{role:'assistant',content,taskId:t.id,taskGoalRevision:t.goalRevision,taskDeliveryKind:n.kind==='progress'?'progress':n.kind==='result'?'result':'attention',actionStatus:status,replyId:n.notificationId,runId:t.currentRunId,origin:'action_result',sourceLabel:n.kind==='progress'?'任务进展 · Ackem':'任务结果 · Ackem',createdAt:Date.now()},n.sourceConversationId)
      }
      db.transaction(()=>{if(notifications.markDelivered(n.notificationId)&&n.kind==='result')repository.projectStages(t.id,t,{delivery:{state:n.deliverySurface==='chat'?'published':'suppressed',goalRevision:t.goalRevision,notificationId:n.notificationId,...(n.deliverySurface==='chat'?{publishedAt:Date.now()}: {})}})})()
      }catch(error){repository.projectStages(t.id,t,{delivery:{state:'failed',goalRevision:t.goalRevision,notificationId:n.notificationId}});repository.observe(t.id,t,{deliveryFailure:String(error).slice(0,500)})}
    }
  }
  let tick=0
  const timer=setInterval(()=>{try{
    for(const [id,live] of inFlight){const task=repository.get(id)?.snapshot;if(!task||live.finished||task.state!=='running'||repository.hasPendingInput(id)||Date.now()-live.feedbackAt<30_000)continue;live.feedbackAt=Date.now();notify(task,'progress',live.operations?`已收到 ${live.operations} 项操作回执。${live.phase}。`:`${live.phase}，尚未收到操作结果。`)}
    flush();if(++tick%5===0){void recoverExecutionResults().then(()=>coordinator.reconcileUnknown()).catch(()=>{});void refreshHostManifest(root).then(manifest=>longTerm.setConnectivity(manifest.kernelHealth)).catch(()=>longTerm.setConnectivity('unknown'))}for(const rule of longTerm.rules().filter(r=>!r.revokedAt&&r.expiresAt>Date.now())){if(rule.source==='task')longTerm.observeTask(rule.taskId);if(rule.source==='time')longTerm.observeTime(rule.taskId);if(rule.source==='system')longTerm.observeSystem(rule.taskId,getHostSystem(root).exportManifest().kernelHealth)}void longTerm.evaluate().catch(()=>{})}catch{/* Persistent outbox retries on the next tick. */}},1000);timer.unref()
  return {coordinator,repository,notifications,longTerm,flush,recoverExecutionResults,dispose:()=>clearInterval(timer)}
}
export function getTaskRuntime(root:string){let runtime=contexts.get(root);if(!runtime){runtime=makeRuntime(root);contexts.set(root,runtime)}return runtime}
export async function stopTasksBeforeMemoryClear(root:string):Promise<void>{const runtime=contexts.get(root);if(!runtime)return;await runtime.coordinator.shutdown();runtime.dispose();contexts.delete(root)}
export function captureTaskContext(root:string,conversationId=engineSessionId()):{text:string;isCurrent:()=>boolean}{
  try{
    const runtime=getTaskRuntime(root),tasks=runtime.repository.visibleList().filter(t=>runtime.repository.canAccess(t.id,'ackem')&&(t.deliveryConversationId??t.originConversationId)===conversationId&&t.deliverySurface==='chat').slice(-8)
    const revisions=tasks.map(t=>({id:t.id,goal:t.goalRevision,control:t.controlEpoch,policy:t.policyRevision??1,authority:t.authorityRef,goalId:t.longTermGoalId,grant:JSON.stringify(runtime.repository.db.prepare('SELECT revision,resources_json FROM task_authority_grants WHERE grant_id=?').get(t.authorityRef))}))
    const longTerm=runtime.longTerm.captureContext(tasks.map(t=>t.id))
    const text='授权任务事实：\n'+tasks.map(t=>JSON.stringify({id:t.id,goal:t.goal.slice(-1000),revision:t.goalRevision,state:t.state,summary:t.summary?.slice(0,1200)})).join('\n')+'\n长期目标与适用决策：'+longTerm.text
    return {text,isCurrent:()=>revisions.every(expected=>{const current=runtime.repository.get(expected.id)?.snapshot;return !!current&&runtime.repository.canAccess(current.id,'ackem')&&runtime.repository.visibleList().some(t=>t.id===current.id)&&current.goalRevision===expected.goal&&current.controlEpoch===expected.control&&(current.policyRevision??1)===expected.policy&&current.authorityRef===expected.authority&&current.longTermGoalId===expected.goalId&&JSON.stringify(runtime.repository.db.prepare('SELECT revision,resources_json FROM task_authority_grants WHERE grant_id=?').get(current.authorityRef))===expected.grant})&&longTerm.isCurrent()}
  }catch{return {text:'',isCurrent:()=>true}}
}
export function taskContext(root:string):string{return captureTaskContext(root).text}
export async function submitChatTask(root:string,input:TaskSubmitRequest){lastTaskInteraction.set(input.conversationId,Date.now());return getTaskRuntime(root).coordinator.submit(input,true)}
/** Existing object layer resolves task relation before the normal ChannelRouter. */
const lastTaskInteraction=new Map<string,number>()
export function chatTaskCandidates(root:string,conversationId:string){if(!getDatabase(root))return [];const runtime=getTaskRuntime(root);return runtime.repository.visibleList().filter(t=>runtime.repository.canAccess(t.id,'ackem')&&t.deliverySurface==='chat'&&(t.deliveryConversationId??t.originConversationId)===conversationId&&t.state!=='completed').slice(-8)}
export async function handleChatTaskInput(root:string,input:TaskSubmitRequest,onStatus?:(text:string)=>void,beforeApply?:()=>void){
  const runtime=getTaskRuntime(root)
  const tasks=chatTaskCandidates(root,input.conversationId)
  if(!tasks.length)return null
  const result=await runtime.coordinator.submit({...input,requestId:input.requestId+':object'},false,undefined,true,intent=>{
    if(intent.kind==='chat'||intent.kind==='new')return
    lastTaskInteraction.set(input.conversationId,Date.now());beforeApply?.()
    onStatus?.(intent.kind==='query'?'正在核对任务进展':intent.kind==='amend'?'正在更新任务要求':intent.kind==='stop'?'正在停止任务':'正在确认任务指向')
  })
  return result.disposition==='responded'&&!result.message?null:result
}
