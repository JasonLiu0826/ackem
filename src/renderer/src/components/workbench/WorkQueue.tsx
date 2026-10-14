import {useState} from 'react'
import {inAckemArea,useWorkbenchStore,type WorkbenchTask} from '../../store/workbenchStore'

export function WorkQueue({task}:{task:WorkbenchTask}):JSX.Element|null {
 const tasks=useWorkbenchStore(state=>state.tasks)
 const [pending,setPending]=useState<string|null>(null)
 const items=inAckemArea(task)?tasks.filter(item=>item.id!=='pinned-ackem'&&inAckemArea(item)&&item.coordinatorTaskId&&item.taskState==='queued').sort((a,b)=>(a.queueOrder??a.updatedAt)-(b.queueOrder??b.updatedAt)).map(item=>({id:item.coordinatorTaskId!,taskId:item.id,text:item.turns.find(turn=>turn.inputState==='queued')?.userText??item.title,attachments:item.turns.find(turn=>turn.inputState==='queued')?.attachments.length??0})):(task.runtimeQueue??[]).map(item=>({...item,taskId:task.id,attachments:task.turns.find(turn=>turn.id===item.id)?.attachments.length??0}))
 if(!items.length)return null
 const act=async(item:typeof items[number],now:boolean)=>{setPending(item.id);try{const store=useWorkbenchStore.getState();if(now)await store.runQueuedNow(item.taskId,item.id);else await store.removeQueued(item.taskId,item.id)}finally{setPending(null)}}
 return <section className="wb-work-queue" aria-label="等待队列">
  <header><span>等待队列 · {items.length}</span><small>当前执行结束后依次处理</small></header>
  <ol>{items.map(item=><li key={item.id}><div><span title={item.text}>{item.text||'附件任务'}</span>{item.attachments>0&&<small>{item.attachments} 个附件</small>}</div><button type="button" disabled={pending!==null} onClick={()=>void act(item,true)}>立即执行</button><button type="button" aria-label="取消排队" title="取消排队" disabled={pending!==null} onClick={()=>void act(item,false)}>×</button></li>)}</ol>
 </section>
}
