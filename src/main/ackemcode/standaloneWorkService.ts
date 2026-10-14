import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { stat } from 'node:fs/promises'
import { getDatabase } from '../db/database'
import { ensureDefaultWorkDirectory } from './workDirectory'
import { startChatStream, type KernelAttachment } from './client'
import { emit, runtime, pathFor, type EventSink } from './workRuntimeService'
import type { StandaloneWorkInput } from '../../shared/tasks'
import { validateTaskExecutionOptions } from '../../shared/tasks'

export type StandaloneInput=StandaloneWorkInput
function database(root:string){const db=getDatabase(root);if(!db)throw Error('独立工作输入数据库不可用');db.exec(`CREATE TABLE IF NOT EXISTS standalone_work_inputs(request_id TEXT PRIMARY KEY,input_hash TEXT NOT NULL,input_json TEXT NOT NULL,session_id TEXT,state TEXT NOT NULL,received_at INTEGER NOT NULL);`);const columns=db.prepare('PRAGMA table_info(standalone_work_inputs)').all() as Array<{name:string}>;if(!columns.some(column=>column.name==='queue_priority'))db.exec('ALTER TABLE standalone_work_inputs ADD COLUMN queue_priority INTEGER NOT NULL DEFAULT 0');if(!columns.some(column=>column.name==='started_at')){db.exec('ALTER TABLE standalone_work_inputs ADD COLUMN started_at INTEGER');db.exec("UPDATE standalone_work_inputs SET started_at=received_at WHERE session_id IS NOT NULL AND state NOT IN ('queued','received','launch_failed')")};return db}
const digest=(input:StandaloneInput)=>createHash('sha256').update(JSON.stringify(input)).digest('hex')
const active=new Map<string,{requestId:string;cancel:()=>void}>()
const receiving=new Set<string>()
const pumping=new Set<string>()
const blockedStates="'received','running','unknown','cancelling','cancel_unknown'"
/** Queued or removed inputs do not replace the receipt for the actually started turn. */
export function standaloneExecutionReceipt(root:string,sessionId:string):{requestId:string;state:string}|undefined {
 const row=database(root).prepare('SELECT request_id,state FROM standalone_work_inputs WHERE session_id=? AND started_at IS NOT NULL ORDER BY started_at DESC,rowid DESC LIMIT 1').get(sessionId) as {request_id:string;state:string}|undefined
 return row?{requestId:row.request_id,state:row.state}:undefined
}
export function listStandaloneQueue(root:string,taskId:string):{items:Array<{id:string;text:string}>}{
 const rows=database(root).prepare("SELECT request_id,input_json FROM standalone_work_inputs WHERE state='queued' AND json_extract(input_json,'$.taskId')=? ORDER BY queue_priority DESC,received_at,rowid").all(taskId) as Array<{request_id:string;input_json:string}>
 return {items:rows.map(row=>({id:row.request_id,text:(JSON.parse(row.input_json) as StandaloneInput).text}))}
}
/** Cancel the whole private queue atomically before a task record is removed. */
export function cancelStandaloneQueue(root:string,taskId:string):{ok:true}{
 if(!getDatabase(root))return{ok:true}
 database(root).prepare("UPDATE standalone_work_inputs SET state='cancelled' WHERE state='queued' AND json_extract(input_json,'$.taskId')=?").run(taskId)
 emitQueue(root,taskId);return{ok:true}
}
function emitQueue(root:string,taskId:string):void {emit(null,taskId,'queue',{type:'input_queue',...listStandaloneQueue(root,taskId)})}
function scheduleQueue(root:string,taskId:string):void {const timer=setTimeout(()=>void pumpStandaloneQueue(root,taskId).catch(()=>{}),100);timer.unref()}
/** The independent durable inbox is drained by the main process, even with the work page hidden. */
export async function pumpStandaloneQueue(root:string,taskId:string):Promise<void>{
 const key=root+':'+taskId;if(pumping.has(key))return;pumping.add(key)
 try{
  const db=database(root)
  if(db.prepare(`SELECT 1 FROM standalone_work_inputs WHERE json_extract(input_json,'$.taskId')=? AND state IN (${blockedStates}) LIMIT 1`).get(taskId))return
  const row=db.prepare("SELECT input_json FROM standalone_work_inputs WHERE state='queued' AND json_extract(input_json,'$.taskId')=? ORDER BY queue_priority DESC,received_at,rowid LIMIT 1").get(taskId) as {input_json:string}|undefined
  if(row){
   const input=JSON.parse(row.input_json) as StandaloneInput
   const last=db.prepare("SELECT session_id FROM standalone_work_inputs WHERE json_extract(input_json,'$.taskId')=? AND session_id IS NOT NULL ORDER BY received_at DESC,rowid DESC LIMIT 1").get(taskId) as {session_id?:string}|undefined
   const sessionId=input.sessionId??last?.session_id
   if(sessionId){
    let settled=false
    for(let attempt=0;attempt<10;attempt++){
     const snapshot=await runtime(pathFor(sessionId)) as {turnRunning?:boolean;executionQuiescent?:boolean;stopState?:string}
     if(snapshot.stopState==='unknown')break
     if(snapshot.turnRunning!==true&&snapshot.executionQuiescent===true){settled=true;break}
     await new Promise(resolve=>setTimeout(resolve,100))
    }
    if(!settled){emit(null,taskId,input.turnId,{type:'queue_blocked',message:'当前执行尚未停止确认'});return}
   }
   await submitStandaloneWork(root,null,input,true)
  }
 }finally{pumping.delete(key)}
}
export async function promoteStandaloneInput(root:string,requestId:string):Promise<{ok:true}>{
 const db=database(root),row=db.prepare("SELECT input_json FROM standalone_work_inputs WHERE request_id=? AND state='queued'").get(requestId) as {input_json:string}|undefined
 if(!row)throw Error('这项要求已不在等待队列')
 const input=JSON.parse(row.input_json) as StandaloneInput
 db.prepare('UPDATE standalone_work_inputs SET queue_priority=(SELECT COALESCE(MAX(queue_priority),0)+1 FROM standalone_work_inputs) WHERE request_id=?').run(requestId)
 emitQueue(root,input.taskId)
 const blockers=db.prepare(`SELECT request_id FROM standalone_work_inputs WHERE request_id!=? AND json_extract(input_json,'$.taskId')=? AND state IN (${blockedStates})`).all(requestId,input.taskId) as Array<{request_id:string}>
 for(const blocker of blockers)await cancelStandaloneInput(root,blocker.request_id)
 await pumpStandaloneQueue(root,input.taskId)
 return {ok:true}
}

/** A standalone input owns its private session and durable inbox. No managed ledger or supervisor. */
export async function submitStandaloneWork(root:string,sender:EventSink,input:StandaloneInput,dequeue=false):Promise<{requestId:string;sessionId?:string;cancelled?:boolean;queued?:boolean}> {
  validateTaskExecutionOptions(input)
  if(input.scheduling&&!['enqueue','immediate'].includes(input.scheduling))throw Error('任务排队选择无效')
  if(!input.turnId||!input.taskId||input.text.length>50_000||(!input.text.trim()&&!input.attachments?.length))throw Error('独立工作输入无效')
  const db=database(root),hash=digest(input)
  const prior=db.prepare('SELECT input_hash,session_id,state FROM standalone_work_inputs WHERE request_id=?').get(input.turnId) as {input_hash:string;session_id?:string;state:string}|undefined
  const key=`${root}:${input.turnId}`
  if(prior&&prior.input_hash!==hash)throw Error('请求编号已被不同内容使用')
  if(prior&&(receiving.has(key)||!['received','launch_failed',...(dequeue?['queued']:[])].includes(prior.state))){
    emit(sender,input.taskId,input.turnId,{type:'input_received',requestId:input.turnId})
    if(['succeeded','failed','cancelled'].includes(prior.state))emit(sender,input.taskId,input.turnId,{type:'done',ok:prior.state==='succeeded',standaloneReceipt:{requestId:input.turnId,state:prior.state==='cancelled'?'aborted':prior.state}})
    return{requestId:input.turnId,sessionId:prior.session_id,...(prior.state==='cancelled'?{cancelled:true}: {}),...(prior.state==='queued'?{queued:true}: {})}
  }
  if(!prior)db.prepare('INSERT INTO standalone_work_inputs (request_id,input_hash,input_json,session_id,state,received_at) VALUES (?,?,?,NULL,?,?)').run(input.turnId,hash,JSON.stringify(input),'received',Date.now())
  else db.prepare("UPDATE standalone_work_inputs SET state='received' WHERE request_id=?").run(input.turnId)
  if(dequeue)emitQueue(root,input.taskId)
  const blocker=db.prepare(`SELECT session_id FROM standalone_work_inputs WHERE request_id!=? AND json_extract(input_json,'$.taskId')=? AND state IN (${blockedStates}) LIMIT 1`).get(input.turnId,input.taskId) as {session_id?:string}|undefined
  if(!dequeue&&input.scheduling&&(blocker||listStandaloneQueue(root,input.taskId).items.length)){
    db.prepare("UPDATE standalone_work_inputs SET state='queued',session_id=? WHERE request_id=?").run(input.sessionId??blocker?.session_id??null,input.turnId)
    emit(sender,input.taskId,input.turnId,{type:'input_queued',requestId:input.turnId});emitQueue(root,input.taskId)
    if(input.scheduling==='immediate')await promoteStandaloneInput(root,input.turnId).catch(error=>emit(sender,input.taskId,input.turnId,{type:'queue_blocked',message:String(error)}))
    else scheduleQueue(root,input.taskId)
    return{requestId:input.turnId,sessionId:input.sessionId??blocker?.session_id,queued:true}
  }
  receiving.add(key)
  emit(sender,input.taskId,input.turnId,{type:'input_received',requestId:input.turnId})
  const cancelled=()=>!!db.prepare("SELECT 1 FROM standalone_work_inputs WHERE request_id=? AND state IN ('cancelled','cancelling','cancel_unknown')").get(input.turnId)
  try{
    const cwd=input.cwd||ensureDefaultWorkDirectory(root)
    if(!isAbsolute(cwd)||!(await stat(cwd)).isDirectory())throw Error('工作目录不存在或不是绝对路径')
    if(cancelled())return{requestId:input.turnId,cancelled:true}
    const preceding=db.prepare("SELECT session_id FROM standalone_work_inputs WHERE request_id!=? AND json_extract(input_json,'$.taskId')=? AND session_id IS NOT NULL ORDER BY received_at DESC,rowid DESC LIMIT 1").get(input.turnId,input.taskId) as {session_id?:string}|undefined
    const resumedSession=prior?.session_id??input.sessionId??(dequeue?preceding?.session_id:undefined)
    const session=resumedSession?await runtime(pathFor(resumedSession)) as {sessionId:string;hostTask?:unknown;mode:string;turnRunning?:boolean;stopState?:string;policyRevision?:number}:await runtime('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cwd})}) as {sessionId:string;hostTask?:unknown;mode:string;turnRunning?:boolean;stopState?:string;policyRevision?:number}
    if(!session.sessionId||input.sessionId&&session.sessionId!==input.sessionId)throw Error('内核没有确认正确的独立会话')
    if(session.hostTask)throw Error('托管会话不能作为独立工作会话执行')
    if(session.turnRunning||session.stopState==='unknown'||active.has(session.sessionId))throw Error('会话执行尚未停止确认')
    if(db.prepare("SELECT 1 FROM standalone_work_inputs WHERE session_id=? AND request_id!=? AND state IN ('running','unknown','cancelling','cancel_unknown') LIMIT 1").get(session.sessionId,input.turnId))throw Error('旧输入执行状态尚未核对，请先停止旧输入')
    db.prepare('UPDATE standalone_work_inputs SET session_id=? WHERE request_id=?').run(session.sessionId,input.turnId)
    if(cancelled())return{requestId:input.turnId,sessionId:session.sessionId,cancelled:true}
    const mode=input.permissionMode??'default'
    let confirmed=await runtime(pathFor(session.sessionId,'/mode'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,expectedPolicyRevision:session.policyRevision,preservePlan:session.mode==='plan'})}) as {permissionMode?:string;policyRevision?:number}
    if(input.executionMode==='plan')confirmed=await runtime(pathFor(session.sessionId,'/mode'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'plan',expectedPolicyRevision:confirmed.policyRevision})}) as typeof confirmed
    if(cancelled())return{requestId:input.turnId,sessionId:session.sessionId,cancelled:true}
    const attachments:KernelAttachment[]=(input.attachments??[]).map(a=>{if(!isAbsolute(a.path))throw Error('附件必须使用绝对路径');return{path:a.path,kind:a.kind==='image'?'image':a.kind==='folder'?'dir':'file',source:'workbench_chip'}})
    if(active.has(session.sessionId))throw Error('会话已有另一条输入执行，请等待或停止')
    db.prepare("UPDATE standalone_work_inputs SET state='running',started_at=? WHERE request_id=? AND state='received'").run(Date.now(),input.turnId)
    emit(sender,input.taskId,input.turnId,{type:'standalone_session',sessionId:session.sessionId,cwd,requestId:input.turnId,...confirmed})
    const settle=(state:string)=>{try{db.prepare("UPDATE standalone_work_inputs SET state=? WHERE request_id=? AND state='running'").run(state,input.turnId);return true}catch(error){emit(sender,input.taskId,input.turnId,{type:'transport_error',message:'独立执行终态无法持久化：'+String(error)});return false}finally{if(active.get(session.sessionId)?.requestId===input.turnId)active.delete(session.sessionId);scheduleQueue(root,input.taskId)}}
    const controller=new AbortController()
    active.set(session.sessionId,{requestId:input.turnId,cancel:()=>controller.abort()})
    startChatStream({sessionId:session.sessionId,text:input.text,effort:input.effort,attachments,signal:controller.signal,retryLastTurn:input.retryLastTurn,
      onEvent:event=>{if(cancelled()&&event.type!=='done'&&event.type!=='abort_ack')return;if(event.type==='done'){const state=cancelled()||event.error==='aborted'||event.error==='aborted_tools'?'aborted':event.ok===true?'succeeded':'failed';if(settle(state))emit(sender,input.taskId,input.turnId,{...event,standaloneReceipt:{requestId:input.turnId,state}})}else emit(sender,input.taskId,input.turnId,event)},
      onError:error=>{settle('unknown');if(!cancelled())emit(sender,input.taskId,input.turnId,{type:'transport_error',message:error.message})},
      onDisconnect:()=>{settle('unknown');if(!cancelled())emit(sender,input.taskId,input.turnId,{type:'transport_disconnected'})}})
    return{requestId:input.turnId,sessionId:session.sessionId}
  }catch(error){db.prepare("UPDATE standalone_work_inputs SET state=CASE WHEN state='running' THEN 'unknown' ELSE ? END WHERE request_id=? AND state!='cancelled'").run(dequeue?'queued':'launch_failed',input.turnId);if(dequeue){emitQueue(root,input.taskId);emit(sender,input.taskId,input.turnId,{type:'queue_blocked',message:String(error)})}throw error}
  finally{receiving.delete(key)}
}
export async function cancelStandaloneInput(root:string,requestId:string):Promise<{ok:true}> {
  const db=database(root),row=db.prepare('SELECT session_id,state,input_json FROM standalone_work_inputs WHERE request_id=?').get(requestId) as {session_id?:string;state:string;input_json:string}|undefined
  if(!row)throw Error('输入请求不存在')
  if(['succeeded','failed','cancelled'].includes(row.state))return{ok:true}
  if(row.state==='queued'){
    db.prepare("UPDATE standalone_work_inputs SET state='cancelled' WHERE request_id=?").run(requestId)
    const input=JSON.parse((db.prepare('SELECT input_json FROM standalone_work_inputs WHERE request_id=?').get(requestId) as {input_json:string}).input_json) as StandaloneInput
    if(input.taskId){emitQueue(root,input.taskId);scheduleQueue(root,input.taskId)}
    return{ok:true}
  }
  const current=row.session_id?active.get(row.session_id):undefined
  if(current&&current.requestId!==requestId)throw Error('这条输入已不是当前执行，未停止另一条输入')
  if(row.session_id&&db.prepare("SELECT 1 FROM standalone_work_inputs WHERE session_id=? AND request_id!=? AND state IN ('running','unknown','cancelling','cancel_unknown') LIMIT 1").get(row.session_id,requestId))throw Error('会话当前执行属于另一条输入')
  if(['received','launch_failed'].includes(row.state)&&!current){db.prepare("UPDATE standalone_work_inputs SET state='cancelled' WHERE request_id=?").run(requestId);const input=JSON.parse(row.input_json) as StandaloneInput;if(input.taskId)scheduleQueue(root,input.taskId);return{ok:true}}
  db.prepare("UPDATE standalone_work_inputs SET state=? WHERE request_id=?").run(row.session_id?'cancelling':'cancelled',requestId)
  if(row.session_id){
    try{
      await runtime(pathFor(row.session_id,'/abort'),{method:'POST'})
      if(active.get(row.session_id)?.requestId===requestId)active.get(row.session_id)?.cancel()
      for(let attempt=0;attempt<30;attempt++){
        const snapshot=await runtime(pathFor(row.session_id)) as {executionQuiescent?:boolean}
        if(snapshot.executionQuiescent===true){db.prepare("UPDATE standalone_work_inputs SET state='cancelled' WHERE request_id=?").run(requestId);if(active.get(row.session_id)?.requestId===requestId)active.delete(row.session_id);const input=JSON.parse(row.input_json) as StandaloneInput;if(input.taskId)scheduleQueue(root,input.taskId);return{ok:true}}
        await new Promise(resolve=>setTimeout(resolve,100))
      }
      throw Error('旧输入停止状态尚未核实')
    }catch(error){db.prepare("UPDATE standalone_work_inputs SET state='cancel_unknown' WHERE request_id=?").run(requestId);throw error}
    finally{if(active.get(row.session_id)?.requestId===requestId)active.get(row.session_id)?.cancel()}
  }
  return{ok:true}
}
