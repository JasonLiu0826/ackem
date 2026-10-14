import type {ChatMessageRow,ChatRow} from '../store/appStore'
import type {WorkbenchTask} from '../store/workbenchStore'
import {groupTaskFeedback,groupContinuousTaskFeedback} from './taskFeedback'
import {workTurnBody} from './workPresentation'

const oldReviewNotice='> 执行已结束，以下结果来自工作页；自动验收暂时不可用，尚未确认验收通过。'
export function cleanTaskBody(text:string):string {return text.replace(oldReviewNotice,'').trimEnd()}

/** Both surfaces consume the same turn body. Live rows are presentation-only, never saved as chat history. */
export function projectTaskBodyFeedback(persisted:ChatRow[],tasks:WorkbenchTask[],conversationId:string){
 let rows=persisted.map(row=>row.kind==='message'&&row.origin==='action_result'?{...row,content:cleanTaskBody(row.content)}:row)
 const additions=new Map<number,ChatMessageRow[]>(),duplicates=new Set<number>()
 const liveStages=new Set<ChatMessageRow>(),liveBodies=new Set<ChatMessageRow>()
 for(const task of tasks){
  if(!task.coordinatorTaskId||!task.ackemArea||task.deliverySurface!=='chat'||task.deliveryConversationId!==conversationId||!task.runtimeRunId)continue
  const turn=task.turns.find(turn=>turn.id===task.runtimeRunId)
  if(!turn||turn.goalRevision!==undefined&&turn.goalRevision!==task.goalRevision)continue
  const bodyText=workTurnBody(turn),stopped=task.taskState==='paused',stopNotice=turn.stopReason||'任务已停止，尚未生成最终答复；已有阶段反馈和操作记录已保留。'
  const stoppedWithoutFinal=(stopped||task.taskState==='failed')&&turn.assistantTextKind==='partial'||stopped&&!!turn.assistantText&&!bodyText
  const matches=(row:ChatRow):row is ChatMessageRow=>row.kind==='message'&&row.taskId===task.coordinatorTaskId&&row.taskGoalRevision===task.goalRevision&&(!row.runId||row.runId===task.runtimeRunId)
  const base={kind:'message' as const,role:'assistant' as const,origin:'action_result' as const,taskId:task.coordinatorTaskId,taskGoalRevision:task.goalRevision,runId:task.runtimeRunId}
  const feedback=(turn.activities??[]).filter(item=>item.kind==='feedback').map(item=>({...base,replyId:'live:'+task.coordinatorTaskId+':'+item.id,taskDeliveryKind:'progress' as const,actionStatus:'running' as const,content:item.text,createdAt:item.startedAt}))
  let finalIndex=-1
  rows.forEach((row,index)=>{if(matches(row)&&(row.taskDeliveryKind==='result'||row.actionStatus==='succeeded'||stopped&&row.taskDeliveryKind==='attention'&&row.actionStatus==='aborted'))finalIndex=index})
  if(finalIndex>=0){
   if(stoppedWithoutFinal)rows[finalIndex]={...rows[finalIndex] as ChatMessageRow,content:bodyText||stopNotice,taskDeliveryKind:'attention',actionStatus:stopped?'aborted':'failed'}
   else if(turn.executionEndedAt&&bodyText)rows[finalIndex]={...rows[finalIndex] as ChatMessageRow,content:bodyText}
   additions.set(finalIndex,feedback.filter(stage=>!rows.some(row=>matches(row)&&row.content===stage.content)))
   continue
  }
  for(const stage of feedback){if(!rows.some(row=>matches(row)&&row.content===stage.content)){rows.push(stage);liveStages.add(stage)}}
  if(bodyText||stopped&&turn.executionEndedAt){
   rows.forEach((row,index)=>{if(matches(row)&&row.taskDeliveryKind==='progress'&&row.content===bodyText)duplicates.add(index)})
   const body:ChatMessageRow={...base,replyId:'live:'+task.coordinatorTaskId+':'+turn.id,taskDeliveryKind:stoppedWithoutFinal||stopped&&!bodyText?'attention':turn.executionEndedAt?'result':'progress',actionStatus:task.taskState==='completed'?'succeeded':stopped?'aborted':task.taskState==='failed'?'failed':'running',content:bodyText||stopNotice,createdAt:turn.createdAt}
   rows.push(body);liveBodies.add(body)
  }
 }
 // A late projection must keep stages before the user messages that followed them.
 // Durable history keeps its order; only unsaved stages are inserted by their event time.
 if(liveStages.size){
  const original=rows
  rows=rows.filter(row=>!liveStages.has(row as ChatMessageRow))
  for(const stage of [...liveStages].sort((a,b)=>(a.createdAt??0)-(b.createdAt??0))){
   const index=rows.findIndex(row=>liveBodies.has(row as ChatMessageRow)||row.kind==='message'&&row.createdAt!==undefined&&stage.createdAt!==undefined&&row.createdAt>stage.createdAt)
   rows.splice(index<0?rows.length:index,0,stage)
  }
  const indices=new Map(rows.map((row,index)=>[row,index]))
  const remappedAdditions=[...additions].map(([index,feedback])=>[indices.get(original[index])!,feedback] as const)
  const remappedDuplicates=[...duplicates].map(index=>indices.get(original[index])!)
  additions.clear();remappedAdditions.forEach(([index,feedback])=>additions.set(index,feedback))
  duplicates.clear();remappedDuplicates.forEach(index=>duplicates.add(index))
 }
 const grouped=groupTaskFeedback(rows)
 duplicates.forEach(index=>grouped.hidden.add(index))
 additions.forEach((feedback,index)=>{if(feedback.length)grouped.history.set(index,[...(grouped.history.get(index)??[]),...feedback].sort((a,b)=>(a.createdAt??0)-(b.createdAt??0)))})
 const updates=groupContinuousTaskFeedback(rows,grouped.hidden)
 return {rows,...grouped,updates}
}
