import type {TaskSnapshot} from '../../shared/tasks'
import {executionResultText,hasFinalExecutionResult} from '../../shared/tasks'

/** User-facing Markdown; full review reasons stay in execution records. */
export function formatTaskDelivery(task:TaskSnapshot,lead:string,progress=false):string {
 const goal=task.goal.replace(/\s+/g,' ').slice(0,300)
 const completed=task.state==='completed'||task.reviewIssue==='unavailable'&&task.execution?.state==='succeeded'||task.state==='paused'&&hasFinalExecutionResult(task)
 const result=completed?task.summary?.trim():task.userSummary?.trim()
 if(completed)return executionResultText(task)?.trim()||result||'执行已结束。'
 if(task.state==='paused'&&executionResultText(task))return executionResultText(task)!
 const fallback=task.state==='waiting_user'?'任务尚未完成，需要处理工作页中的确认或补充信息后继续。':task.state==='paused'?'任务已停止，已有文件和执行记录已保留。':task.state==='failed'?'这次执行没有完成，已保留记录，可在工作页查看并继续处理。':'正在执行，完成后会在这里交付结果。'
 const files=completed?[...new Set(task.artifacts??[])].slice(0,20):[]
 return progress&&result?result:`${lead}\n\n**任务**：${goal}\n\n### 当前状态\n\n${result||fallback}${files.length?'\n\n### 产物\n\n'+files.map(path=>'- `'+path.replace(/`/g,'')+'`').join('\n'):''}`
}
