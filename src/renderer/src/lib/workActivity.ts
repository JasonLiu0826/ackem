import type {TurnBlock,WorkActivity} from '../store/workbenchStore'

/** Keep human commentary, model waiting and raw operation records separate. */
export function projectWorkActivity(turn:TurnBlock,event:Record<string,unknown>,now=Date.now()):TurnBlock {
 const activities=[...(turn.activities??[])],kind=event.type
 const replace=(id:string,update:(activity:WorkActivity)=>WorkActivity)=>{const index=activities.findIndex(a=>a.id===id);if(index>=0)activities[index]=update(activities[index])}
 if(kind==='thinking'){
  let active=[...activities].reverse().find(a=>a.kind==='thought'&&!a.endedAt)
  if(event.phase==='start'){
   if(active)replace(active.id,a=>({...a,endedAt:now}))
   active={id:'thought:'+now+':'+activities.length,kind:'thought',text:'分析下一步',startedAt:now};activities.push(active)
  }
  if(event.phase==='end'&&active)replace(active.id,a=>({...a,endedAt:now}))
  return{...turn,activities,thoughtSeconds:typeof event.elapsedSec==='number'?event.elapsedSec:turn.thoughtSeconds,processSummary:event.phase==='end'?'': '正在分析下一步…'}
 }
 if(kind==='tool_start'){
  activities.push({id:String(event.id),kind:'tool',text:String(event.name??'工具操作'),input:event.input,startedAt:now})
  return{...turn,activities,processSummary:'正在执行操作…'}
 }
 if(kind==='tool_result'){
  const id=String(event.id);if(!activities.some(a=>a.id===id))activities.push({id,kind:'tool',text:String(event.name??'工具操作'),startedAt:now})
  replace(id,a=>({...a,endedAt:now,ok:event.ok===true,output:String(event.output??event.content??'')}))
  return{...turn,activities,processSummary:event.ok===true?'已收到操作结果，继续核对…':'操作未成功，正在检查…'}
 }
 if(kind==='assistant_delta')return{...turn,assistantText:turn.assistantText+String(event.text??''),assistantTextKind:'partial',processSummary:'正在回复…'}
 if(kind==='assistant_message'){
  const text=String(event.text??'')
  if(event.incomplete===true)return{...turn,assistantText:text,assistantTextKind:'partial',processSummary:'回复尚未完整，正在尝试继续…'}
  if(event.final===false){if(text.trim())activities.push({id:'feedback:'+now+':'+activities.length,kind:'feedback',text,startedAt:now,endedAt:now});return{...turn,activities,assistantText:'',assistantTextKind:undefined,processSummary:'继续执行…'}}
  return{...turn,activities,assistantText:text,assistantTextKind:'final',processSummary:'正在核对执行结果…'}
 }
 if(kind==='attachments_loaded'){activities.push({id:'attachments:'+now,kind:'event',text:'已读取附件',startedAt:now,endedAt:now,output:JSON.stringify(event.items??[],null,2)});return{...turn,activities}}
 return turn
}
