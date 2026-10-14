import type {TurnBlock,WorkActivity,WorkbenchTask} from '../store/workbenchStore'

/** Suppress only the old, provable progress concatenation; keep both original records and real prose. */
export function workTurnBody(turn:TurnBlock):string {
 const stages=turn.activities?.filter(activity=>activity.kind==='feedback')??[]
 return turn.executionEndedAt&&turn.assistantTextKind!=='final'&&stages.length>1&&stages.map(stage=>stage.text).join('')===turn.assistantText?'':turn.assistantText
}

export function canStopWorkbenchTask(task:WorkbenchTask):boolean {
 return task.taskState==='queued'||task.taskState==='cancelling'||!task.executionSettled&&['running','waiting','unknown'].includes(task.status)
}

/** A submitted input and its execution are one visible turn; preserve both persisted records. */
export function visibleWorkTurns(turns:TurnBlock[]):TurnBlock[] {
 const visible:TurnBlock[]=[]
 for(const turn of turns){
  const prior=visible.at(-1)
  if(prior&&prior.ownerTaskId===turn.ownerTaskId&&prior.actor!=='ackem'&&turn.actor==='ackem'&&prior.userText.trim()&&prior.userText.trim()===turn.userText.trim()&&!prior.assistantText&&!prior.activities?.length&&!prior.executionEndedAt&&prior.inputState!=='cancelled'&&prior.inputState!=='failed'){
   visible[visible.length-1]={...turn,actor:prior.actor,userText:prior.userText,attachments:prior.attachments.length?prior.attachments:turn.attachments,createdAt:prior.createdAt}
  }else visible.push(turn)
 }
 return visible
}

/** Feedback is a stage boundary. Thought/tool cycles within a stage form one expandable group. */
export function groupWorkActivities(activities:WorkActivity[]):WorkActivity[][] {
 const groups:WorkActivity[][]=[]
 for(const item of activities){
  if(item.kind==='feedback'||groups.at(-1)?.at(-1)?.kind==='feedback'||!groups.length)groups.push([item])
  else groups[groups.length-1].push(item)
 }
 return groups
}
