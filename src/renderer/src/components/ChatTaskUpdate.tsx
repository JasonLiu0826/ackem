import type { ChatMessageRow } from '../store/appStore'
import { useWorkbenchStore } from '../store/workbenchStore'
import { MarkdownContent } from './MarkdownContent'
import { CopyButton } from './CopyButton'
import { MessageTimestamp } from './MessageTimestamp'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import {canStopTaskExecution,type TaskSnapshot} from '../../../shared/tasks'
import {canStopWorkbenchTask} from '../lib/workPresentation'

export function ChatTaskUpdate({message,history=[],updates=[]}:{message:ChatMessageRow;history?:ChatMessageRow[];updates?:ChatMessageRow[]}):JSX.Element {
  const [snapshot,setSnapshot]=useState<TaskSnapshot|null>(null)
  const local=useWorkbenchStore(s=>s.tasks.find(task=>task.coordinatorTaskId===message.taskId))
  const [stopping,setStopping]=useState(false)
  const requestRevision=useRef(0)
  const [id,setId]=useState(message.taskId)
  useEffect(()=>{
    let live=true
    setId(message.taskId)
    if(!message.taskId&&message.runId)void window.ackem.tasks.list().then(tasks=>{if(live)setId(tasks.find(task=>task.id===message.runId||task.currentRunId===message.runId||task.legacyRunId===message.runId)?.id)}).catch(()=>{})
    return()=>{live=false}
  },[message.taskId,message.runId])
  useEffect(()=>{
    if(!id)return
    let live=true
    setSnapshot(null)
    const refresh=()=>{const revision=++requestRevision.current;void window.ackem.tasks.snapshot(id).then(task=>{if(live&&revision===requestRevision.current)setSnapshot(task??null)}).catch(()=>{})}
    refresh();const off=window.ackem.tasks.onEvent(event=>{if(event.taskId===id)refresh()})
    return()=>{live=false;off()}
  },[id])
  const active=!!id&&(local?canStopWorkbenchTask(local):!!snapshot&&canStopTaskExecution(snapshot))
  const stop=async()=>{
    if(!id||stopping)return
    ++requestRevision.current
    setStopping(true)
    try{const result=await window.ackem.tasks.stop(id);setSnapshot(prior=>prior?{...prior,state:result.state}:null)}catch(error){useAppStore.getState().pushToast(String(error))}finally{setStopping(false)}
  }
  const label=message.origin==='action_ack'?'任务已接收':message.actionStatus==='succeeded'?'任务交付':message.taskDeliveryKind==='result'?'执行结果':message.actionStatus==='failed'?'任务遇到问题':message.actionStatus==='aborted'?'任务已停止':message.taskDeliveryKind==='progress'?'任务进展':message.actionStatus==='waiting_permission'?'需要你确认':'任务进展'
  const earlierUpdates=updates.slice(0,-1).filter(row=>row.origin!=='action_ack')
  const legacyDetails=message.actionStatus!=='succeeded'&&message.content.length>1000&&!/^#{1,3} |^[-*] /m.test(message.content)
  return <section className="chat-task-update" aria-label={label}>
    {history.length>0&&<details className="chat-task-history"><summary>执行过程 · {history.length} 项反馈</summary>{history.map((row,index)=><div className="chat-task-history-item" key={row.replyId??index}><MarkdownContent source={row.content} className="chat-task-update-content"/></div>)}</details>}
    <header><span className="chat-task-update-label">{label}</span><button type="button" className="chat-task-work-link" onClick={()=>useWorkbenchStore.getState().focusTask(id??message.runId)}>查看 Ackem 工作页 ↗</button></header>
    {earlierUpdates.length>0&&<details className="chat-task-progress-history"><summary>之前的进展 · {earlierUpdates.length} 条</summary>{earlierUpdates.map((row,index)=><div className="chat-task-progress-item" key={row.replyId??index}><MarkdownContent source={row.content} className="chat-task-update-content"/></div>)}</details>}
    {legacyDetails?<><MarkdownContent source={message.content.split('\n\n')[0]} className="chat-task-update-content"/><details className="chat-task-update-details"><summary>查看详细执行说明</summary><MarkdownContent source={message.content} className="chat-task-update-content"/></details></>:<MarkdownContent source={message.content} className="chat-task-update-content"/>}
    <div className="chat-task-update-meta"><CopyButton text={message.content} iconOnly/>{active&&<button type="button" className="chat-task-stop" title="停止该任务" aria-label="停止该任务" disabled={stopping} onClick={()=>void stop()}><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg></button>}<MessageTimestamp createdAt={message.createdAt}/></div>
  </section>
}
