import {useEffect,useState} from 'react'
import type {Goal,StandingRule,DecisionRecord} from '../../../../shared/longTerm'
import {WbModal} from './ui/WbModal'

/** One explicit user-command entry point. Ordinary conversation and quoted rules never submit grants. */
export function LongTermControls({taskId,open,onClose}:{taskId:string;open:boolean;onClose:()=>void}):JSX.Element {
 const [mode,setMode]=useState<'goal'|'rule'|'decisions'|'goal_state'>('goal')
 const [goalId,setGoalId]=useState(''),[goalState,setGoalState]=useState<'paused'|'active'|'cancelled'|'abandoned'>('paused')
 const [basis,setBasis]=useState(''),[outcome,setOutcome]=useState(''),[constraints,setConstraints]=useState('')
 const [runs,setRuns]=useState(1),[hours,setHours]=useState(24),[minutes,setMinutes]=useState(10),[tokens,setTokens]=useState(10000)
 const [source,setSource]=useState<'time'|'task'|'system'>('time'),[goals,setGoals]=useState<Goal[]>([]),[rules,setRules]=useState<StandingRule[]>([]),[decisions,setDecisions]=useState<DecisionRecord[]>([]),[decisionId,setDecisionId]=useState('')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const refresh=async()=>{const [g,r,d]=await Promise.all([window.ackem.tasks.goals(),window.ackem.tasks.rules(),window.ackem.tasks.decisions(taskId)]);setGoals(g.filter(v=>v.taskIds.includes(taskId)));setRules(r.filter(v=>v.taskId===taskId));setDecisions(d);setDecisionId(current=>d.some(v=>v.id===current)?current:d[0]?.id??'')}
 useEffect(()=>{if(open)void refresh().catch(e=>setMessage(String(e)))},[open,taskId])
 const apply=async(action:()=>Promise<unknown>)=>{setBusy(true);setMessage('');try{await action();await refresh();setMessage('已保存。重启后会先核对状态，原任务与文件会保留。')}catch(e){setMessage(String(e))}finally{setBusy(false)}}
 const confirm=()=>apply(async()=>{
  if(mode==='goal')return window.ackem.tasks.grantGoal({originalUserBasis:basis,expectedOutcome:outcome,constraints:constraints.split('\n').map(v=>v.trim()).filter(Boolean),taskIds:[taskId],budget:{maxRuns:runs,expiresAt:Date.now()+hours*3600000}})
  if(mode==='rule')return window.ackem.tasks.grantRule({taskId,purpose:basis,originalUserBasis:basis,source,filter:source==='time'?{kind:'time.tick'}:source==='task'?{kind:'task.state',value:'paused'}:{kind:'system.kernelHealth',value:'connected'},allowedActions:['resume_task'],maxRuns:runs,maxDurationMs:minutes*60000,maxContextTokens:tokens,maxModelCalls:10,expiresAt:Date.now()+hours*3600000,cooldownMs:Math.max(1000,minutes*60000)})
  if(mode==='goal_state')return window.ackem.tasks.changeGoalState({id:goalId||goals[0]?.id||'',state:goalState})
  return window.ackem.tasks.correctDecision({id:decisionId,basis})
 })
 return <>{open?<WbModal title="长期安排" hint="仅管理当前已授权的 Ackem 任务。长期目标保存后会暂停任务；持续规则只有在任务已停止、连接有效且预算允许时才能继续。停止任务会撤销它的持续规则。" onClose={onClose} footer={<><button type="button" className="wb-btn" onClick={onClose}>关闭</button><button type="button" className="wb-btn primary" disabled={busy||(mode==='goal_state'?!goals.length:!basis.trim())||(mode==='goal'&&!outcome.trim())||(mode==='decisions'&&!decisionId)} onClick={()=>void confirm()}>{busy?'保存中…':mode==='goal'?'确认保存目标':mode==='rule'?'确认授权持续规则':mode==='goal_state'?'确认目标状态':'确认更正依据'}</button></>}>
  <div className="wb-field"><label>安排类型</label><select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setBasis('')}}><option value="goal">长期目标</option><option value="rule">受限持续规则</option><option value="decisions">查看与更正决策</option><option value="goal_state">调整目标状态</option></select></div>
  {mode==='decisions'?<div className="wb-field"><label>当前适用决策</label><select value={decisionId} onChange={e=>setDecisionId(e.target.value)}>{decisions.map(d=><option key={d.id} value={d.id}>{d.choice} · {d.basis}</option>)}</select></div>:null}
  {mode==='goal_state'?<><div className="wb-field"><label>目标</label><select value={goalId||goals[0]?.id||''} onChange={e=>setGoalId(e.target.value)}>{goals.map(g=><option key={g.id} value={g.id}>{g.expectedOutcome}</option>)}</select></div><div className="wb-field"><label>目标状态</label><select value={goalState} onChange={e=>setGoalState(e.target.value as typeof goalState)}><option value="paused">暂停并停止关联工作</option><option value="active">恢复目标（继续执行仍需明确授权）</option><option value="cancelled">取消目标</option><option value="abandoned">放弃目标</option></select></div></>:null}
  {mode!=='goal_state'?<div className="wb-field"><label>{mode==='decisions'?'更正后的简短依据':'你的明确要求与授权依据'}</label><textarea value={basis} onChange={e=>setBasis(e.target.value)} maxLength={1000}/></div>:null}
  {mode==='goal'?<><div className="wb-field"><label>预期成果</label><textarea value={outcome} onChange={e=>setOutcome(e.target.value)} maxLength={10000}/></div><div className="wb-field"><label>约束（每行一项，纳入任务验收）</label><textarea value={constraints} onChange={e=>setConstraints(e.target.value)}/></div></>:null}
  {mode!=='decisions'&&mode!=='goal_state'?<div className="wb-field-row"><label>最多继续次数<input type="number" min={1} max={100} value={runs} onChange={e=>setRuns(Number(e.target.value))}/></label><label>有效小时<input type="number" min={1} max={720} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label></div>:null}
  {mode==='rule'?<><div className="wb-field"><label>事实来源</label><select value={source} onChange={e=>setSource(e.target.value as typeof source)}><option value="time">宿主时间</option><option value="task">当前任务停止状态</option><option value="system">内核连接状态</option></select></div><div className="wb-field-row"><label>单次分钟 / 冷却分钟<input type="number" min={1} max={1440} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><label>单次上下文 token 上限<input type="number" min={1} max={1000000} value={tokens} onChange={e=>setTokens(Number(e.target.value))}/></label></div><p className="wb-muted">单次内核执行最多 10 次模型调用，验收另有独立上限。尚未接入可核对的费用计量；屏幕、CI 与硬件观察未接入。</p></>:null}
  {goals.filter(g=>g.state!=='revoked').map(g=><p key={g.id}>{g.expectedOutcome} · {g.state}<button type="button" className="wb-btn" disabled={busy} onClick={()=>void apply(()=>window.ackem.tasks.revokeGoal(g.id))}>撤销目标</button></p>)}
  {rules.filter(r=>!r.revokedAt).map(r=><p key={r.id}>{r.purpose} · {r.expiresAt>Date.now()?'已授权':'已过期'}<button type="button" className="wb-btn" disabled={busy} onClick={()=>void apply(()=>window.ackem.tasks.revokeRule(r.id))}>撤销规则并停止</button></p>)}
  {message?<p role="status" className="wb-muted">{message}</p>:null}
 </WbModal>:null}</>
}
