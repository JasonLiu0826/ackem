import type {ActionPort} from '../memory/adapters/composeMemorySystem'
import {ActionRepository} from '../memory/actions/actionRepository'
import {TaskRepository} from './repository'
import type {TaskAttachment,TaskSubmitRequest} from '../../shared/tasks'

/** Transfer only old job scheduling ownership. Existing attempts are never replayed. */
export function adoptLegacyTasks(repository:TaskRepository,port:Pick<ActionPort,'record'>):void{
  const actions=new ActionRepository(repository.db)
  const ids=repository.db.prepare("SELECT run_id FROM memory_action_runs WHERE nature='work' AND status IN ('accepted','queued','running','waiting_permission','unknown') ORDER BY queued_at,updated_at,run_id").all() as {run_id:string}[]
  for(const {run_id} of ids){
    const run=actions.getById(run_id),execution=run?.execution
    if(!run||!execution||execution.params?.productTaskId||execution.workKind==='factory'||!execution.cwd)continue
    const params=execution.params??{},attachments:TaskAttachment[]=[]
    for(const [key,kind] of [['filePaths','file'],['imagePaths','image']] as const)if(Array.isArray(params[key]))for(const path of params[key] as unknown[])if(typeof path==='string')attachments.push({path,kind})
    const input:TaskSubmitRequest={requestId:`legacy-adoption:${run.runId}`,origin:params.chatDelivery===true?'chat':'workbench',conversationId:typeof params.chatSessionId==='string'?params.chatSessionId:run.sessionId,text:execution.prompt,cwd:execution.cwd,attachments}
    repository.request(input,()=>{
      // The same database transaction moves the old queue and records the new owner.
      if(run.status==='queued'){const cancelled=port.record({kind:'action.transitioned',transition:{runId:run.runId,fromVersion:run.version,toStatus:'aborted',safeSummary:'等待任务已转交持久化任务协调器；此旧执行尚未启动',errorCode:'task_owner_migrated',occurredAt:new Date().toISOString(),idempotencyKey:`task-owner-migrated:${run.runId}`}});if(!cancelled.ok)throw Error(`旧任务队列迁移未确认：${cancelled.message}`)}
      const task=repository.create(input,execution.cwd!)
      repository.transition(task.id,task,run.status==='queued'?'queued':'unknown',{legacyRunId:run.runId,...(run.status==='queued'?{}:{codeSessionId:run.runtimeId??undefined,currentRunId:run.runId}),summary:run.status==='queued'?'已接续旧版等待任务':'旧版执行待核对，不重复启动'})
      return{requestId:input.requestId,taskId:task.id,disposition:'accepted',goalRevision:1}
    })
  }
}
