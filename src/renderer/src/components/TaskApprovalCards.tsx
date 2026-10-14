import {useEffect,useState} from 'react'
import {approvalExplanation,type TaskApproval} from '../../../shared/workSupervision'
import {useAppStore} from '../store/appStore'
export function TaskApprovalCards({sessionId}:{sessionId:string}):JSX.Element|null{
  const [answers,setAnswers]=useState<Record<string,string>>({})
  const [cards,setCards]=useState<TaskApproval[]>([]),[pending,setPending]=useState<string|null>(null)
  useEffect(()=>{
    let live=true
    const refresh=()=>void window.ackem.workbench.supervisionList().then(tasks=>{if(live)setCards(prev=>{
      const saved=tasks.flatMap(t=>t.approvals)
      return saved.map(card=>{const current=prev.find(p=>p.taskId===card.taskId&&p.requestId===card.requestId);return current&&current.status!=='pending'&&card.status==='pending'?current:card})
    })}).catch(()=>{})
    refresh()
    const timer=setInterval(refresh,2000)
    const off=window.ackem.workbench.onTaskApproval(card=>setCards(prev=>[...prev.filter(p=>!(p.taskId===card.taskId&&p.requestId===card.requestId)),card]))
    return()=>{live=false;clearInterval(timer);off()}
  },[sessionId])
  const active=cards.filter(c=>c.chatSessionId===sessionId&&c.status==='pending')
  if(!active.length)return null
  async function answer(card:TaskApproval,allow:boolean){setPending(card.requestId);try{if(card.eventType==='ask_user'){await window.ackem.workbench.supervisionAnswer({taskId:card.taskId,requestId:card.requestId,answers:Object.fromEntries((card.questions??[]).map(q=>[q.question,answers[card.requestId+q.question]??'']))})}else{await window.ackem.workbench.supervisionApproval({taskId:card.taskId,requestId:card.requestId,allow})};setCards(prev=>prev.map(c=>c.requestId===card.requestId&&c.taskId===card.taskId?{...c,status:allow?'approved':'denied'}:c))}catch(e){useAppStore.getState().pushToast(String(e))}finally{setPending(null)}}
  return <div className="chat-task-approvals">{active.map(card=><section key={card.taskId+card.requestId} className="chat-task-approval" aria-label="任务操作审批"><strong>{card.eventType==='ask_user'?'需要补充信息':'需要你的确认'}</strong><p>{approvalExplanation(card)}</p>{card.questions?.map(q=><label key={q.question}>{q.question}<input aria-label={q.question} value={answers[card.requestId+q.question]??''} onChange={e=>setAnswers(prev=>({...prev,[card.requestId+q.question]:e.target.value}))}/>{q.options.map(o=><button key={o.label} onClick={()=>setAnswers(prev=>({...prev,[card.requestId+q.question]:o.label}))}>{o.label}</button>)}</label>)}<small>{new Date(card.createdAt).toLocaleString()}</small><div>{card.eventType!=='ask_user'&&<button disabled={pending!==null} onClick={()=>void answer(card,false)}>拒绝</button>}<button disabled={pending!==null} onClick={()=>void answer(card,true)}>{card.eventType==='ask_user'?'提交信息':'批准这次操作'}</button></div></section>)}</div>
}
