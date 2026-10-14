import { createHash } from 'node:crypto'
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs'
import {join,resolve,relative,isAbsolute} from 'node:path'
import {stat,readFile,realpath} from 'node:fs/promises'
import {approvalExplanation,type SupervisedTask,type TaskApproval} from '../../shared/workSupervision'
import type {AgentEvent} from './protocol'
import type {WorkContract} from '../../shared/tasks'

export type ReviewInput = {goal:string;contract?:WorkContract;filesystemAccess:'workspace'|'full_machine'|'permission_checked'; summary:string; files:Array<{path:string;exists:boolean;content?:string}>;checks:Array<{command:string;ok:boolean;required?:boolean}>;history:SupervisedTask['log'];evidence:Array<{tool:string;ok:boolean;output:string}>}
type Ports = {
  authorized?:(taskId:string)=>boolean
  validContract?:(taskId:string)=>boolean
  permissionCheckedAccess?:(taskId:string)=>boolean
  fullMachineAccess?:(taskId:string)=>boolean
  decide:(goal:string,event:AgentEvent)=>Promise<{allow:boolean;reason:string;summary?:string}>
  review:(input:ReviewInput)=>Promise<{decision:'pass'|'continue'|'blocked';reason:string;instruction?:string;userSummary?:string}>
  approve:(sessionId:string,event:AgentEvent)=>Promise<void>
  emit:(task:SupervisedTask,event:AgentEvent)=>void
  answerQuestion?:(sessionId:string,requestId:string,answers:Record<string,string>)=>Promise<void>
  card:(approval:TaskApproval)=>void
  progress:(task:SupervisedTask,text:string)=>void
}
/** High-impact actions cannot be authorized by an LLM decision. Unknown executable payloads escalate. */
export function requiresUserApproval(event:AgentEvent,cwd:string):boolean {
  if(event.type==='plan_approval'||event.type==='enter_plan_approval')return false
  const name=String(event.toolName??'').toLowerCase();const input=event.input as Record<string,unknown>|undefined
  const value=JSON.stringify(input??{})
  if (/delete|remove|uninstall|publish|deploy|send_email|send_message|credential|password|payment/.test(name)) return true
  if (/mcp__|install_skill|manage_mcp|invoke_skill/.test(name)) return true
  if (name==='bash'||name==='powershell') {
    const command=String(input?.command??'')
    // Pure read/filter pipelines still require the semantic scope decision.
    // Executable expressions, scripts, redirection and chained mutations escalate.
    if(name==='powershell'&&!/[;\r\n>{}&`]|\$\(/.test(command)&&command.split('|').every(part=>/^\s*(?:Get-ChildItem|Get-Item|Get-Content|Select-Object|Sort-Object|Format-Table|Format-List|Out-String)(?:\s|$)/i.test(part)))return false
    return /\b(rm|rmdir|del|erase|remove-item|format-volume|diskpart|shutdown|chmod|chown|sudo|set-executionpolicy|new-service|stop-service|curl|wget|invoke-webrequest|invoke-restmethod)\b|\bformat(?:\.exe|\.com)?(?=\s|$)|\breg(?:\.exe)?\s+(?:add|delete|import|restore)|git\s+(?:push|reset|clean)|-enc(?:odedcommand)?\b|\b(python|node|eval|iex|invoke-expression)\b|(?:^|\s)(?:&|\.)\s|>/i.test(command)
  }
  if (/write_file|search_replace|notebook_edit|document_edit|document_convert/.test(name)) {
    const target=String(input?.path??input?.file_path??input?.notebook_path??'')
    if(!target)return true
    const rel=relative(resolve(cwd),resolve(cwd,target))
    return rel.startsWith('..')||isAbsolute(rel)||/\.(?:env|pem|key)$|(?:^|[\\/])(?:credentials|authorized_keys|settings\.json)$/i.test(target)||/\b(delete|remove)\b/i.test(value)
  }
  return !/^(read_file|list_dir|glob|grep|web_search|web_fetch|verify_delivery|ask_user|enter_plan_mode|exit_plan_mode|agent|enter_worktree)$/.test(name)
}

export class WorkSupervisor {
  private tasks:SupervisedTask[]=[]
  private pending=new Map<string,string>()
  private resolvedRequests=new Set<string>()
  private file:string
  constructor(dataRoot:string,private ports:Ports){
    this.file=join(dataRoot,'memory','tasks','ackem-supervision.json')
    if(existsSync(this.file))this.tasks=JSON.parse(readFileSync(this.file,'utf8')) as SupervisedTask[]
  }
  list(){return structuredClone(this.tasks.filter(task=>this.ports.authorized?.(task.id)??true))}
  forgetTasks(ids:string[]):void {
    const selected=new Set(ids)
    for(const task of this.tasks.filter(t=>selected.has(t.id))){task.epoch++;for(const approval of task.approvals.filter(a=>a.status==='pending')){approval.status='cancelled';this.ports.card(approval)}}
    this.tasks=this.tasks.filter(t=>!selected.has(t.id));this.save()
  }
  get(id:string){return this.tasks.find(t=>t.id===id&&(this.ports.authorized?.(id)??true))}
  private save(){mkdirSync(resolve(this.file,'..'),{recursive:true});const temp=this.file+'.tmp';writeFileSync(temp,JSON.stringify(this.tasks),{encoding:'utf8'});renameSync(temp,this.file)}
  private note(task:SupervisedTask,kind:string,text:string,actor:'ackem'|'user'|'runtime'='ackem'){
    task.updatedAt=Date.now();task.log.push({turnId:task.currentTurnId,runId:task.currentRunId,at:task.updatedAt,actor,kind,text});task.log=task.log.slice(-300);this.save()
    this.ports.emit(task,{type:'supervisor_note',actor,kind,text,at:task.updatedAt,state:task.state})
  }
  begin(input:{id:string;codeSessionId:string;chatSessionId:string;cwd:string;goal:string;currentRunId:string;currentTurnId:string;instruction?:string},rootId?:string){
    if(this.ports.authorized&& !this.ports.authorized(rootId??input.id))throw Error('任务没有有效托管授权')
    let task=rootId?this.get(rootId):undefined
    if(task){task.currentRunId=input.currentRunId;task.currentTurnId=input.currentTurnId;task.rounds++;task.state='running'}
    else{task={...input,epoch:0,rounds:1,state:'running',updatedAt:Date.now(),approvals:[],log:[]};this.tasks.push(task)}
    this.note(task,'instruction',input.instruction??input.goal)
    return task.id
  }
  recordEvidence(id:string,runId:string,input:{tool:string;ok:boolean;output:string}){
    const task=this.get(id)
    if(!task||task.currentRunId!==runId||!['running','waiting_user'].includes(task.state))return
    this.note(task,'execution_evidence',JSON.stringify({...input,output:input.output.slice(0,1200)}),'runtime')
  }
  recordRuntimeEvent(id:string,runId:string,event:AgentEvent){
    const task=this.get(id)
    if(!task||task.currentRunId!==runId||!['running','waiting_user'].includes(task.state))return
    if(!['tool_start','session_state','mode_changed','plan_approval','enter_plan_approval','ask_user','permission_request','error'].includes(event.type))return
    this.note(task,'runtime_event',JSON.stringify({type:event.type,id:event.id,requestId:event.requestId,toolName:event.toolName??event.name,state:event.state,mode:event.mode,message:typeof event.message==='string'?event.message.slice(0,500):undefined}),'runtime')
  }
  updateGoal(id:string,goal:string):void {const task=this.get(id);if(task&&task.goal!==goal){task.goal=goal;task.progressFingerprint=undefined;task.stalledRounds=0;task.nextStep=undefined;this.note(task,'goal_revision',goal,'user')}}
  takeover(sessionId:string,reason:string){
    for(const task of this.tasks.filter(t=>(this.ports.authorized?.(t.id)??true)&&t.codeSessionId===sessionId&&!['completed','blocked'].includes(t.state))){
      task.epoch++;task.state='user_control'
      for(const approval of task.approvals.filter(a=>a.status==='pending')){approval.status='cancelled';this.ports.card(approval)}
      this.note(task,'takeover',reason,'user')
    }
  }
  async permission(id:string,event:AgentEvent){
    const task=this.get(id);if(!task||!['running','waiting_user'].includes(task.state))return
    const key=id+':'+String(event.requestId);if(this.pending.has(key)||task.approvals.some(a=>a.requestId===event.requestId))return
    this.pending.set(key,event.type);const epoch=task.epoch
    this.note(task,'gate_analysis',`Ackem 正在分析 ${String(event.toolName??event.type)} 门禁（${String(event.requestId)}）`)
    try{
      let decision:{allow:boolean;reason:string;summary?:string}={allow:false,reason:'需要用户确认此项操作'}
      let timer:ReturnType<typeof setTimeout>|undefined
      try {
        if(event.permissionMode==='bypassPermissions'&&event.type==='permission_request')decision={allow:true,reason:'完全放开：沿用内核已确认的授权策略'}
        else decision=await Promise.race([this.ports.decide(task.goal,event),new Promise<never>((_r,reject)=>{timer=setTimeout(()=>reject(Error('监督判决超时')),20_000)})])
      } catch { decision={allow:false,reason:'自动审批未取得可靠结论，请用户确认'} }
      finally {if(timer)clearTimeout(timer)}
      if(event.type==='ask_user')decision={...decision,allow:false,reason:'需要用户提供任务所需信息：'+decision.reason}
      else if(event.permissionMode!=='bypassPermissions'&&requiresUserApproval(event,task.cwd))decision={...decision,allow:false,reason:'涉及删除或高影响操作，需要用户确认。Ackem 分析：'+decision.reason,summary:decision.summary?decision.summary+' 这项高影响操作需要你确认。':undefined}
      if(task.epoch!==epoch||task.state==='user_control'||this.resolvedRequests.has(key)||this.ports.authorized&&!this.ports.authorized(id))return
      if(decision.allow){
        try{await this.ports.approve(task.codeSessionId,event)}catch{decision={allow:false,reason:'未能确认自动批准已生效，请确认此项操作'}}
        if(task.epoch!==epoch||this.ports.authorized&&!this.ports.authorized(id))return
        if(decision.allow){this.resolvedRequests.add(key);this.note(task,'approval',`允许 ${String(event.toolName)}：${decision.reason}\n${JSON.stringify({resolvedBy:'ackem',operationDigest:createHash('sha256').update(JSON.stringify({toolName:event.toolName,input:event.input})).digest('hex'),authorizedScope:task.cwd})}`);return}
      }
      {
        const approval:TaskApproval={taskId:id,requestId:String(event.requestId),codeSessionId:task.codeSessionId,chatSessionId:task.chatSessionId,title:`请求批准：${String(event.toolName)}`,toolName:String(event.toolName),eventType:event.type,questions:event.type==='ask_user'?event.questions as TaskApproval['questions']:undefined,detail:decision.reason+'\n'+JSON.stringify(event.input??{},null,2).slice(0,4000),createdAt:Date.now(),status:'pending'}
        approval.summary=approvalExplanation({summary:decision.summary,detail:decision.reason,eventType:event.type})
        approval.operationDigest=createHash('sha256').update(JSON.stringify({toolName:event.toolName,input:event.input})).digest('hex');approval.authorizedScope=task.cwd
        task.approvals.push(approval);task.state='waiting_user';this.note(task,'approval_request',approval.detail);this.ports.card(approval)
      }
    }finally{this.pending.delete(key)}
  }
  recordUserDecision(sessionId:string,requestId:string,allow:boolean):void{
    const task=this.tasks.find(t=>t.codeSessionId===sessionId&&['running','waiting_user'].includes(t.state)&&(this.ports.authorized?.(t.id)??true));if(!task)return
    this.resolvedRequests.add(task.id+':'+requestId)
    const approval=task.approvals.find(a=>a.requestId===requestId&&a.status==='pending')
    if(approval){approval.status=allow?'approved':'denied';approval.resolvedBy='user';this.ports.card(approval)}
    if(allow)task.state='running'
    this.note(task,'user_permission',JSON.stringify({requestId,allow,resolvedBy:'user',operationDigest:approval?.operationDigest,authorizedScope:approval?.authorizedScope}),'user')
  }
  recordRuntimePolicy(sessionId:string):void{
    const task=this.tasks.find(t=>t.codeSessionId===sessionId&&['running','waiting_user'].includes(t.state)&&(this.ports.authorized?.(t.id)??true));if(!task)return
    for(const [key,type] of this.pending)if(key.startsWith(task.id+':')&&type!=='ask_user')this.resolvedRequests.add(key)
    for(const approval of task.approvals.filter(a=>a.status==='pending'&&a.eventType!=='ask_user')){approval.status='approved';approval.resolvedBy='runtime_policy';this.resolvedRequests.add(task.id+':'+approval.requestId);this.ports.card(approval)}
    const waitingForInformation=task.approvals.some(a=>a.status==='pending'&&a.eventType==='ask_user')||[...this.pending].some(([key,type])=>key.startsWith(task.id+':')&&type==='ask_user')
    task.state=waitingForInformation?'waiting_user':'running';this.note(task,'permission_policy','内核已确认完全放开，当前权限门禁由运行策略放行；任务所需信息仍须回答','runtime')
  }
  async answer(id:string,requestId:string,allow:boolean){
    const task=this.get(id),approval=task?.approvals.find(a=>a.requestId===requestId&&a.status==='pending')
    if(!task||!approval||task.state==='user_control')throw Error('请求已失效或用户已接管')
    const epoch=task.epoch
    if(approval.eventType==='ask_user')throw Error('请填写任务所需信息')
    if(allow)await this.ports.approve(task.codeSessionId,{type:approval.eventType??'permission_request',requestId,toolName:approval.toolName})
    else await this.ports.approve(task.codeSessionId,{type:approval.eventType??'permission_request',requestId,toolName:approval.toolName,denied:true})
    if(task.epoch!==epoch)return
    approval.status=allow?'approved':'denied';approval.resolvedBy='user';this.resolvedRequests.add(id+':'+requestId);task.state=allow?'running':'blocked';if(!allow)task.epoch++
    this.note(task,'user_approval',allow?'用户批准此项操作':'用户拒绝此项操作','user');this.ports.card(approval)
  }
  async answerQuestions(id:string,requestId:string,answers:Record<string,string>){
    const task=this.get(id),approval=task?.approvals.find(a=>a.requestId===requestId&&a.status==='pending')
    if(!task||!approval||approval.eventType!=='ask_user'||task.state==='user_control'||!this.ports.answerQuestion)throw Error('问题已失效')
    const epoch=task.epoch;await this.ports.answerQuestion(task.codeSessionId,requestId,answers)
    if(task.epoch!==epoch)return
    approval.status='approved';task.state='running';this.note(task,'user_answer',JSON.stringify(answers),'user');this.ports.card(approval)
  }
  async finish(id:string,runId:string,input:{ok:boolean;contract?:WorkContract;summary:string;files:string[];checks:Array<{command:string;ok:boolean;required?:boolean}>;evidence?:Array<{tool:string;ok:boolean;output:string}>}):Promise<{instruction?:string;userSummary?:string;reviewUnavailable?:boolean;reason:string;state:SupervisedTask['state']}>{
    const task=this.get(id);if(!task||task.currentRunId!==runId)return{state:'blocked',reason:'任务回执不匹配'}
    if(this.ports.validContract&&!this.ports.validContract(id))return{state:'blocked',reason:'当前契约缺少有效来源或验收验证器'}
    if(['user_control','blocked'].includes(task.state))return{state:task.state,reason:'自动监督已停止'}
    const epoch=task.epoch;for(const a of task.approvals.filter(a=>a.status==='pending')){a.status='cancelled';this.ports.card(a)}task.state='reviewing';this.note(task,'review_start','Ackem 正在核对执行结果和产物');this.ports.progress(task,'正在验收工作结果…')
    const fullMachineAccess=this.ports.fullMachineAccess?.(id)===true
    const permissionCheckedAccess=this.ports.permissionCheckedAccess?.(id)===true
    const current=()=>task.epoch===epoch&&(!this.ports.authorized||this.ports.authorized(id))&&(this.ports.fullMachineAccess?.(id)===true)===fullMachineAccess&&(this.ports.permissionCheckedAccess?.(id)===true)===permissionCheckedAccess
    task.artifacts=[...new Set([...(task.artifacts??[]),...input.files])]
    let scopeDenied=false
    const within=(root:string,target:string)=>{const rel=relative(root,target);return rel===''||!rel.startsWith('..')&&!isAbsolute(rel)}
    const canonical=async(path:string)=>{const actual=await realpath(path);return process.platform==='win32'?actual.toLowerCase():actual}
    const roots=input.contract?await Promise.all(input.contract.scope.resourceRefs.map(path=>canonical(path).catch(()=>resolve(path)))):undefined
    const excluded=input.contract?await Promise.all(input.contract.scope.exclusions.map(path=>canonical(path).catch(()=>resolve(path)))):[]
    // Historical artifacts remain visible, but each acceptance uses the current attempt.
    const files=await Promise.all([...new Set(input.files)].slice(0,20).map(async path=>{
      if(!current())return{path,exists:false}
      const info=await stat(path).catch(()=>null)
      if(!current())return{path,exists:false}
      const target=info?.isFile()?await canonical(path):undefined
      if(!current())return{path,exists:false}
      if(target&&(roots&&!fullMachineAccess&&!permissionCheckedAccess&&!roots.some(root=>within(root,target))||excluded.some(root=>within(root,target)))){scopeDenied=true;return{path,exists:false}}
      return{path,exists:!!info?.isFile(),...(target&&info?.isFile()&&info.size<=32000?{content:(await readFile(target,'utf8').catch(()=>'' )).slice(0,12000)}:{})}
    }))
    if(!current())return{state:'user_control',reason:'用户已接管或授权已失效'}
    if(scopeDenied){task.state='blocked';this.note(task,'scope_failure','验收产物超出当前授权范围，未读取其内容');return{state:'blocked',reason:'验收产物超出当前授权范围'}}
    let review:{decision:'pass'|'continue'|'blocked';reason:string;instruction?:string;userSummary?:string}
    let reviewUnavailable=false
    const reviewInput:ReviewInput={goal:task.goal,contract:input.contract,filesystemAccess:fullMachineAccess?'full_machine':permissionCheckedAccess?'permission_checked':'workspace',summary:input.summary,files,checks:input.checks,history:task.log.slice(-15),evidence:input.evidence??[]}
    try{review=await this.ports.review(reviewInput)}
    catch{
      if(!current())return{state:'user_control',reason:'用户已接管或授权已失效'}
      this.note(task,'review_connection_retry','验收连接暂不可用，保留执行结果，重试一次')
      try{review=await this.ports.review(reviewInput)}
      catch{reviewUnavailable=true;review={decision:'blocked',reason:'验收连接失败，保留任务记录，尚未确认完成',userSummary:'执行结果已保留，自动验收暂时不可用。'}}
    }
    if(!current())return{state:'user_control',reason:'用户已接管或授权已失效'}
    if(review.decision==='pass'&&(!input.ok||files.some(f=>!f.exists)||input.checks.some(c=>c.required!==false&&!c.ok)||(!files.length&&!input.checks.some(c=>c.ok)&&!input.evidence?.some(e=>e.ok))))review={decision:'continue',reason:'执行或产物检查未通过',instruction:'核对任务目标，修复失败检查和缺失产物，重新验证并报告证据。'}
    const fingerprint=createHash('sha256').update(JSON.stringify({files,checks:input.checks,instruction:review.instruction})).digest('hex')
    task.stalledRounds=task.progressFingerprint===fingerprint?(task.stalledRounds??0)+1:0;task.progressFingerprint=fingerprint
    if(review.decision==='continue'&&review.instruction?.trim()&&(task.stalledRounds??0)<2){task.nextStep=review.instruction;this.note(task,'review_retry',review.reason+'\n下一步：'+review.instruction);return{state:task.state,instruction:review.instruction,reason:review.reason}}
    if(review.decision==='continue'&&(task.stalledRounds??0)>=2)review.reason='连续返工没有产生新的验收证据，保留任务等待调整：'+review.reason
    task.state=review.decision==='pass'?'completed':'blocked';task.nextStep=review.instruction
    this.note(task,'review_result',review.reason);this.ports.progress(task,task.state==='completed'?'验收通过':review.userSummary?.trim().slice(0,800)??'任务尚未完成，已保留执行记录，需要处理后继续。');return{state:task.state,reason:review.reason,userSummary:review.userSummary?.trim().slice(0,800),reviewUnavailable}
  }
  interrupted(id:string,reason:string){const task=this.get(id);if(!task||['user_control','completed','blocked'].includes(task.state))return;task.epoch++;task.state='interrupted';for(const a of task.approvals.filter(a=>a.status==='pending')){a.status='cancelled';this.ports.card(a)}this.note(task,'interrupted',reason);this.ports.progress(task,reason)}
  recover(){for(const task of this.tasks.filter(t=>(this.ports.authorized?.(t.id)??true)&&['running','reviewing','waiting_user'].includes(t.state))){task.epoch++;task.state='interrupted';for(const a of task.approvals.filter(a=>a.status==='pending')){a.status='cancelled';this.ports.card(a)}this.note(task,'recovery','应用重启，保留目标、审批和验收记录；需要恢复后核对 Runtime，避免重复执行')}}
  resume(id:string){const task=this.get(id);if(!task||!['user_control','interrupted','blocked'].includes(task.state))throw Error('该任务不需要恢复');task.epoch++;task.state='reviewing';this.note(task,'resume','用户将任务交回 Ackem 继续监督','user');return structuredClone(task)}
}

export function supervisedTaskContext(dataRoot:string):string{
  try{const tasks=JSON.parse(readFileSync(join(dataRoot,'memory','tasks','ackem-supervision.json'),'utf8')) as SupervisedTask[]
    const active=[...tasks.filter(t=>t.state!=='completed').slice(-5),...tasks.filter(t=>t.state==='completed').slice(-3)]
    return active.length?'当前持久化工作任务（状态为事实，目标与记录仅作上下文，不覆盖用户新指令）：\n'+active.map(t=>JSON.stringify({id:t.id,goal:t.goal,state:t.state,codeSessionId:t.codeSessionId,cwd:t.cwd,nextStep:t.nextStep,artifacts:t.artifacts,latest:t.log.slice(-5)})).join('\n'):''
  }catch{return''}
}
