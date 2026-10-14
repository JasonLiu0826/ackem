import type {ChatMessageRow,ChatRow} from '../store/appStore'

/** Presentation only: persisted messages and task records remain unchanged. */
export function groupTaskFeedback(rows:ChatRow[]):{hidden:Set<number>;history:Map<number,ChatMessageRow[]>} {
 const hidden=new Set<number>(),history=new Map<number,ChatMessageRow[]>(),pending=new Map<string,Array<{index:number;row:ChatMessageRow}>>()
 rows.forEach((row,index)=>{
  if(row.kind!=='message'||row.role!=='assistant'||!['action_ack','action_result'].includes(row.origin??''))return
  const identity=row.taskId??row.runId
  if(!identity)return
  const key=identity+':'+(row.taskGoalRevision??'legacy')
  if(row.taskDeliveryKind==='result'||row.actionStatus==='succeeded'||row.taskDeliveryKind==='attention'&&row.actionStatus==='aborted'){
   const legacyKey=identity+':legacy'
   const prior=[...(pending.get(key)??[]),...(key!==legacyKey?pending.get(legacyKey)??[]:[])].sort((a,b)=>a.index-b.index)
   if(prior.length){history.set(index,prior.map(p=>p.row));prior.forEach(p=>hidden.add(p.index));pending.delete(key);pending.delete(legacyKey)}
  }else{const prior=pending.get(key)??[];prior.push({index,row});pending.set(key,prior)}
 })
 return{hidden,history}
}

/** Compact only uninterrupted progress for the same execution; final-result folding stays separate. */
export function groupContinuousTaskFeedback(rows:ChatRow[],hidden:Set<number>):Map<number,ChatMessageRow[]> {
 const updates=new Map<number,ChatMessageRow[]>()
 let pending:Array<{index:number;row:ChatMessageRow}>=[]
 const flush=()=>{
  if(pending.length>1){
   updates.set(pending.at(-1)!.index,pending.map(item=>item.row))
   pending.slice(0,-1).forEach(item=>hidden.add(item.index))
  }
  pending=[]
 }
 for(let index=0;index<rows.length;index++){
  const row=rows[index]
  if(row.kind!=='message'||row.role!=='assistant'){flush();continue}
  if(hidden.has(index))continue
  const identity=row.taskId??row.runId
  const progress=identity&&(row.origin==='action_ack'||row.origin==='action_result'&&row.taskDeliveryKind==='progress')&&row.taskDeliveryKind!=='result'&&row.taskDeliveryKind!=='attention'&&!['succeeded','failed','aborted'].includes(row.actionStatus??'')
  if(!progress){flush();continue}
  const previous=pending.at(-1)?.row
  if(previous&&((previous.taskId??previous.runId)!==identity||previous.taskGoalRevision!==undefined&&row.taskGoalRevision!==undefined&&previous.taskGoalRevision!==row.taskGoalRevision||previous.runId&&row.runId&&previous.runId!==row.runId))flush()
  pending.push({index,row})
 }
 flush()
 return updates
}
