import type {TaskRepository} from './repository'
import type {TaskSnapshot} from '../../shared/tasks'

type Ports = {
  repository: TaskRepository
  stop(id:string):void
  revokeRules(ids:string[]):Promise<void>
  suppress(id:string):void
  forgetSupervision(ids:string[]):void
  removed(id:string):void
}

/** User-only record cleanup. Files, independent domains and CLI sessions are untouched. */
export async function clearManagedWorkspace(ports:Ports,timeoutMs=8000):Promise<{ok:true;taskIds:string[]}> {
  const targets=ports.repository.visibleList().filter(t=>t.ownerPrincipalId==='user'&&t.supervisionPolicy==='ackem_managed'&&t.workspaceId==='pinned-ackem'&&t.domainId==='ackem:managed')
  const ids=targets.map(t=>t.id)
  await ports.revokeRules(ids)
  const settled=(t:TaskSnapshot)=>['completed','failed','paused'].includes(t.state)&&t.executionQuiescent!==false
  for(const task of targets)if(!settled(task))ports.stop(task.id)
  const deadline=Date.now()+timeoutMs
  while(targets.some(t=>!settled(ports.repository.require(t.id).snapshot))){
    if(Date.now()>=deadline)throw Error('尚未确认 Ackem 工作任务停止，记录已保留；确认停止后再清除。')
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  // No records disappear until every captured execution is known to be quiet.
  ports.repository.db.transaction(()=>{
    for(const id of ids){ports.suppress(id);ports.repository.archive(id)}
  })()
  ports.forgetSupervision(ids)
  for(const id of ids)ports.removed(id)
  return {ok:true,taskIds:ids}
}
