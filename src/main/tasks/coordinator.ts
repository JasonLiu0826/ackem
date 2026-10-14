import type { TaskSnapshot, TaskSubmitRequest, TaskSubmitResult, TaskEvent, TaskAuthority,ContractPatch } from '../../shared/tasks'
import { validateTaskExecutionOptions,hasSettledResultAwaitingReview,executionResultText,canStopTaskExecution,isTaskExecutionSettled } from '../../shared/tasks'
import { TaskRepository, type TaskRecord, type TaskCommand } from './repository'
import {attachmentContractScope} from './contract'
import {standingExecutionAllowed} from './longTerm'

export type TaskInputIntent = {kind:'query'|'chat'|'amend'|'stop'|'new'|'mute'|'forget'|'prioritize'|'merge'|'depend'|'unclear';taskId?:string;relatedTaskIds?:string[];contractPatch?:ContractPatch}
export interface TaskDriver {
  hold?(record:TaskRecord,held:boolean):Promise<void>
  start(record:TaskRecord, command:TaskCommand):Promise<void>
  control(record:TaskRecord, command:TaskCommand):Promise<'settled'|'unknown'>
  reconcile(record:TaskRecord):Promise<'settled'|'running'|'unknown'>
}
export type TaskCoordinatorPorts = {
  principal?: 'user'|'ackem'
  authority?: (input:TaskSubmitRequest)=>TaskAuthority
  cwd(input:TaskSubmitRequest):Promise<string>
  classify?(input:TaskSubmitRequest,tasks:TaskSnapshot[]):Promise<TaskInputIntent>
  respond?(input:TaskSubmitRequest,tasks:TaskSnapshot[]):Promise<string>
  cancelInput?(requestId:string):void
  attachmentSources?(input:TaskSubmitRequest):string[]
  delivery?(input:TaskSubmitRequest):{deliverySurface:'chat'|'workbench';deliveryConversationId:string}|undefined
  emit(event:TaskEvent):void
  supersede?(id:string,revision:number):void
  queried?(task:TaskSnapshot):void
  suppress?(id:string,forget:boolean):void
}
/** Scheduling interprets task relationships; channel selection remains owned by ChannelRouter. */
export class TaskCoordinator {
  private pumping=false
  resumeFromStandingRule(id:string):void {
    const t=this.repository.require(id).snapshot
    if(t.state!=='paused'||t.executionQuiescent===false||!this.repository.canAccess(id,'ackem')||!t.standingExecution||!standingExecutionAllowed(this.repository.db,t))throw Error('持续规则不能启动当前任务')
    this.repository.requeue(id,t)
  }
  private rerun=false
  private operations=Promise.resolve()
  private closing=false
  private executions=new Set<Promise<void>>()
  private submissions=new Map<string,Promise<TaskSubmitResult>>()
  constructor(readonly repository:TaskRepository,private driver:TaskDriver,private ports:TaskCoordinatorPorts){}
  async submit(input:TaskSubmitRequest, routedNew=false, resolvedIntent?:TaskInputIntent, delegateNewToRouter=false, onIntent?:(intent:TaskInputIntent)=>void):Promise<TaskSubmitResult> {
    if(this.closing)throw Error('任务协调器正在停止，暂不能接收新任务')
    if(input.origin!=='ackem')input={...input,inspectionScope:undefined,inspectionPaths:undefined,inspectionFingerprint:undefined}
    validateTaskExecutionOptions(input)
    if(input.scheduling&&(input.origin!=='workbench'||!['enqueue','immediate'].includes(input.scheduling)))throw Error('任务排队选择无效')
    if(!input.requestId||input.requestId.length>200||!input.conversationId||input.text.length>50_000||(!input.text.trim()&&!input.attachments?.length))throw Error('任务输入无效')
    if(input.candidateTaskIds&&(!Array.isArray(input.candidateTaskIds)||input.candidateTaskIds.length>12||input.candidateTaskIds.some(id=>typeof id!=='string'||id.length>200)))throw Error('任务关联范围无效')
    const principal=this.ports.principal??'user'
    const prior=this.repository.previous(input);if(prior){if(!this.repository.canAccessInput(input.requestId,principal))throw Error('没有访问该输入的授权');return prior}
    const accessible=(id:string)=>this.repository.canAccess(id,principal)
    if(input.taskId&&!accessible(input.taskId))throw Error('没有访问该任务的授权')
    const matchesInput=(t:TaskSnapshot)=>accessible(t.id)&&(input.taskId?t.id===input.taskId:input.candidateTaskIds?input.candidateTaskIds.includes(t.id):t.originConversationId===input.conversationId)
    const addressed=input.scheduling?[]:this.repository.visibleList().filter(matchesInput)
    const affected=addressed.filter(t=>['running','waiting_user','reviewing','cancelling','unknown'].includes(t.state))
    // Paused/queued tasks still have pending user intent; a standing rule cannot race its interpretation.
    this.repository.receive(input,addressed.map(t=>t.id),principal)
    this.ports.emit({taskId:input.taskId??input.requestId,requestId:input.requestId,type:'received',at:Date.now()})
    const pending=this.submissions.get(input.requestId);if(pending)return pending
    // Serialize interpretation and acceptance, so subsequent requests see the last accepted goal.
    let resolveResult!:(r:TaskSubmitResult)=>void,rejectResult!:(e:unknown)=>void
    const result=new Promise<TaskSubmitResult>((resolve,reject)=>{resolveResult=resolve;rejectResult=reject})
    this.submissions.set(input.requestId,result)
    void result.then(()=>this.submissions.delete(input.requestId),()=>this.submissions.delete(input.requestId))
    this.operations=this.operations.catch(()=>{}).then(async()=>{
      try{
        const replay=this.repository.previous(input);if(replay){resolveResult(replay);return}
        for(const t of affected)await this.driver.hold?.(this.repository.require(t.id),true)
        if(input.taskId&&this.repository.isArchived(input.taskId))throw Error('任务记录已删除，请创建新任务')
        const candidates=this.repository.visibleList().filter(t=>matchesInput(t)&&(input.taskId||input.candidateTaskIds||t.state!=='completed')).slice(-12)
        let intent=input.scheduling?{kind:'new' as const}:resolvedIntent??(routedNew?{kind:'new' as const}:this.ports.classify?await this.ports.classify(input,candidates):!candidates.length?{kind:'new' as const}:{kind:'unclear' as const})
        const cancelled=this.repository.previous(input);if(cancelled){resolveResult(cancelled);return}
        const inheritedTarget=intent.taskId??input.taskId??(candidates.length===1?candidates[0].id:undefined)
        const migrationSource=intent.kind==='amend'&&!input.inspectionScope?candidates.find(t=>t.id===inheritedTarget&&t.inspectionScope):undefined
        if(migrationSource)intent={kind:'new'}
        const delegatingNew=delegateNewToRouter&&!migrationSource
        const target=intent.taskId??input.taskId??(candidates.length===1?candidates[0].id:undefined)
        if(target&&(!candidates.some(t=>t.id===target)||!accessible(target)))throw Error('解释结果超出授权任务范围')
        if(intent.relatedTaskIds?.some(id=>!candidates.some(t=>t.id===id)||!accessible(id)))throw Error('关联任务超出授权范围')
        const cwd=intent.kind==='new'&&!delegatingNew?await this.ports.cwd(input):''
        if(this.repository.isInputCancelled(input.requestId)){resolveResult(this.repository.previous(input)!);return}
        // Ordinary response generation runs outside the operation queue. Its inbox stays
        // pending until the answer settles, preserving cancellation and request replay.
        if(intent.kind==='chat'&&input.origin==='workbench'){
          for(const task of affected)await this.driver.hold?.(this.repository.require(task.id),false)
          const reply=this.ports.respond?.(input,candidates)??Promise.resolve('')
          void reply.then(response=>{const cancelled=this.repository.previous(input);if(cancelled){resolveResult(cancelled);return}resolveResult(this.repository.request(input,()=>({requestId:input.requestId,taskId:target,disposition:'responded',message:response})));void this.pump()},error=>{this.repository.failInput(input.requestId);rejectResult(error);void this.pump()})
          return
        }
        onIntent?.(intent)
        const trustedOptions={...input,...(migrationSource?{text:input.text+'\n\n关联的旧用户目标（仅用于理解指代，按最新要求执行，不继承旧权限限制）：'+JSON.stringify(migrationSource.goal)}:{}),trustedAttachmentPaths:this.ports.attachmentSources?.(input)??[]}
        const accepted=this.repository.request(input,()=>{
          if(intent.kind==='new'&&delegatingNew)return{requestId:input.requestId,disposition:'responded',message:''}
          if(intent.kind==='new'){const authority=this.ports.authority?.(input);if(authority?.supervisionPolicy==='ackem_managed')attachmentContractScope({cwd,attachments:[]},{scope:{domainId:authority.domainId,resourceRefs:[cwd],exclusions:[]}},input.attachments??[],trustedOptions.trustedAttachmentPaths);const task=this.repository.create(trustedOptions,cwd,authority);const delivery=this.ports.delivery?.(input);if(delivery){this.repository.transition(task.id,task,task.state,delivery);Object.assign(task,delivery)}return {requestId:input.requestId,taskId:task.id,disposition:'accepted',goalRevision:task.goalRevision,message:'任务已接收'}}
          if(intent.kind==='chat')return {requestId:input.requestId,taskId:target,disposition:'responded',message:''}
          if(!target)return {requestId:input.requestId,disposition:'needs_clarification',message:'这条要求针对哪个任务？'}
          const t=this.repository.require(target).snapshot
          if(intent.kind==='query'){this.ports.queried?.(t);return {requestId:input.requestId,taskId:target,disposition:'responded',message:this.status(t),goalRevision:t.goalRevision}}
          if(['prioritize','merge','depend'].includes(intent.kind)){
            try{
              if(intent.kind==='prioritize'){
                this.repository.prioritize(target,principal)
                for(const active of this.repository.list().filter(a=>accessible(a.id)&&a.id!==target&&['running','reviewing','waiting_user','unknown'].includes(a.state)))this.repository.interrupt(active.id)
              }
              if(intent.kind==='merge')this.repository.merge(target,intent.relatedTaskIds??[])
              if(intent.kind==='depend')this.repository.depend(target,intent.relatedTaskIds??[])
              return{requestId:input.requestId,taskId:target,disposition:'applied',message:'已更新任务安排',goalRevision:this.repository.require(target).snapshot.goalRevision}
            }catch(error){return{requestId:input.requestId,taskId:target,disposition:'needs_clarification',message:String((error as Error).message)}}
          }
          if(intent.kind==='mute'||intent.kind==='forget'){this.ports.suppress?.(target,intent.kind==='forget');return{requestId:input.requestId,taskId:target,disposition:'applied',message:'已更新这个任务的汇报偏好'}}
          if(intent.kind==='amend'){const patch=intent.contractPatch;const task=patch&&t.contract?this.repository.patchContract(target,{...patch,...(patch.constraints!==undefined?{constraints:patch.constraints.map(item=>({...item,sourceRequestIds:[input.requestId]}))}:{}),...(patch.acceptanceCriteria!==undefined?{acceptanceCriteria:patch.acceptanceCriteria.map(item=>({...item,verifierRef:'ackem:semantic-review',sourceRequestIds:[input.requestId]}))}:{})},t.goalRevision,input.requestId,trustedOptions):this.repository.revise(target,input.text,input.attachments,trustedOptions);this.ports.supersede?.(target,task.goalRevision);return{requestId:input.requestId,taskId:target,disposition:'applied',goalRevision:task.goalRevision,message:'已记录新要求，正在调整执行'}}
          if(intent.kind==='stop'){const task=this.repository.stop(target);return{requestId:input.requestId,taskId:target,disposition:'stopping',goalRevision:task.goalRevision,message:task.state==='paused'?'任务已停止':'已发出停止请求，正在确认执行状态'}}
          return {requestId:input.requestId,taskId:target,disposition:'needs_clarification',message:'这条要求是补充当前任务，还是另开一个任务？'}
        })
        if(input.scheduling==='immediate'&&accepted.taskId)this.runQueuedNow(accepted.taskId)
        if(accepted.taskId)this.publish(accepted.taskId,'request',input.requestId,accepted.message)
        resolveResult(accepted);void this.pump()
      }catch(e){this.repository.failInput(input.requestId);rejectResult(e)}
      finally{for(const t of affected){if(!this.repository.hasPendingInput(t.id))try{await this.driver.hold?.(this.repository.require(t.id),false)}catch{/* Unknown hold is not permission to execute. */}}}
    })
    return result
  }
  cancel(requestId:string):TaskSubmitResult {const result=this.repository.cancelInput(requestId,this.ports.principal??'user');this.ports.cancelInput?.(requestId);if(result.taskId)this.publish(result.taskId,'stop',requestId);void this.pump();return result}
  stop(id:string):TaskSnapshot {if(!this.repository.canAccess(id,this.ports.principal??'user'))throw Error('没有访问该任务的授权');const t=this.repository.stop(id);this.publish(id,'stop');void this.pump();return t}
  runQueuedNow(id:string):void {
    const principal=this.ports.principal??'user'
    if(!this.repository.canAccess(id,principal))throw Error('没有访问该任务的授权')
    this.repository.prioritize(id,principal)
    for(const task of this.repository.list().filter(task=>task.id!==id&&this.repository.canAccess(task.id,principal)&&task.state!=='queued'&&canStopTaskExecution(task))){this.repository.stop(task.id);this.publish(task.id,'stop')}
    this.publish(id,'queue_priority');void this.pump()
  }
  publish(id:string,type:string,requestId?:string,message?:string):void {const snapshot=this.repository.require(id).snapshot;this.ports.emit({taskId:id,type,at:Date.now(),snapshot,requestId,message});if(!this.closing&&isTaskExecutionSettled(snapshot))void this.pump()}
  status(t:TaskSnapshot):string {const labels={queued:'等待执行',running:'正在执行',waiting_user:'等待确认或补充信息',reviewing:'正在验收',cancelling:'正在停止旧执行',paused:'已停止',completed:'已完成',failed:'执行失败',unknown:'执行状态待核对'};return `${labels[t.state]}。${t.summary??''}`}
  async pump():Promise<void> {
    if(this.pumping){this.rerun=true;return}this.pumping=true
    try{
      do{
        this.rerun=false
        let claim:ReturnType<TaskRepository['claim']>
        while((claim=this.repository.claim(this.ports.principal))){
          const {record,command}=claim
          this.publish(command.taskId,command.kind)
          if(command.kind==='start'){
            // Never block controls or the chat process on a long execution.
            const execution=this.driver.start(record,command).catch(e=>{
              this.repository.transition(record.snapshot.id,record.snapshot,'unknown',{summary:`执行连接未确认：${String(e).slice(0,300)}`})
              this.publish(command.taskId,'unknown')
            }).finally(()=>{this.repository.finishCommand(command.id);this.executions.delete(execution);void this.pump()})
            this.executions.add(execution)
          }else{
            const result=await this.driver.control(record,command).catch(()=> 'unknown' as const)
            if(result==='settled'){
              this.repository.transition(command.taskId,command,record.snapshot.state,{executionQuiescent:true})
              if(command.kind==='revise'||command.payload.resume)this.repository.requeue(command.taskId,command)
              else this.repository.transition(command.taskId,command,'paused',{summary:executionResultText(record.snapshot)??'已确认内核停止；任务记录已保留',executionQuiescent:true})
            }else this.repository.transition(command.taskId,command,'unknown',{summary:'停止结果尚未核实，保留执行占用，不重复开工'})
            this.repository.finishCommand(command.id);this.publish(command.taskId,'control_settlement')
          }
        }
      }while(this.rerun)
    }finally{this.pumping=false}
  }
  async recover():Promise<void> {
    const tasks=this.repository.recover(this.ports.principal??'user')
    for(const t of tasks.filter(t=>this.repository.canAccess(t.id,this.ports.principal??'user')&&t.state==='unknown')){
      if(hasSettledResultAwaitingReview(t))continue
      const result=await this.driver.reconcile(this.repository.require(t.id)).catch(()=> 'unknown' as const)
      if(result==='settled')this.repository.transition(t.id,t,'paused',{summary:executionResultText(t)??'重启后已核对停止状态；可发送新要求继续',executionQuiescent:true})
      // Running without the original stream stays unknown until a trusted terminal receipt arrives.
      this.publish(t.id,'recovery')
    }
    for(const input of this.repository.pendingInputs().filter(input=>this.repository.canAccessInput(input.requestId,this.ports.principal??'user')))await this.submit(input).catch(()=>{})
    await this.pump()
  }
  private reconciling=false
  async reconcileUnknown():Promise<void>{
    if(this.closing||this.reconciling||this.pumping)return;this.reconciling=true
    try{
      for(const t of this.repository.list().filter(task=>this.repository.canAccess(task.id,this.ports.principal??'user')&&task.state==='unknown'&&!this.repository.hasPendingInput(task.id))){
        if(hasSettledResultAwaitingReview(t))continue
        const result=await this.driver.reconcile(this.repository.require(t.id)).catch(()=> 'unknown' as const)
        if(result!=='settled')continue
        const control=this.repository.lastControl(t.id)
        if(control&&control.payload.targetRunId===t.currentRunId&&(control.kind==='revise'||control.payload.resume))this.repository.requeue(t.id,t)
        else this.repository.transition(t.id,t,'paused',{summary:executionResultText(t)??'已核对执行停止，记录保留；完成状态仍需验收',executionQuiescent:true})
        this.publish(t.id,'reconciled')
      }
      await this.pump()
    }finally{this.reconciling=false}
  }
  async shutdown(timeoutMs=30_000):Promise<void>{
    this.closing=true
    let timer:ReturnType<typeof setTimeout>|undefined
    try{await Promise.race([this.operations,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('仍有未解析输入，未清空任务记忆')),timeoutMs)})])}catch(error){this.closing=false;throw error}finally{clearTimeout(timer)}
    for(const t of this.repository.list().filter(task=>this.repository.canAccess(task.id,this.ports.principal??'user')&&['queued','running','reviewing','waiting_user','cancelling','unknown'].includes(task.state)))this.stop(t.id)
    const deadline=Date.now()+timeoutMs
    while(Date.now()<deadline){
      if(!this.pumping&&!this.reconciling&&!this.executions.size&&!this.repository.list().some(t=>this.repository.canAccess(t.id,this.ports.principal??'user')&&['running','reviewing','waiting_user','cancelling','unknown'].includes(t.state)))return
      await new Promise(r=>setTimeout(r,50))
    }
    this.closing=false
    throw Error('尚未确认全部工作停止，保留任务与记忆，避免清空后继续执行')
  }
}
