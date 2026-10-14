import { app, ipcMain, shell } from 'electron'
import { ensureDefaultWorkDirectory } from '../ackemcode/workDirectory'
import { join } from 'node:path'
import { getTaskRuntime } from '../tasks/runtime'
import { resolveDataRoot } from '../paths'
import { loadSettings } from '../settings'
import { getHostSystem, refreshHostManifest, registerSystemInspectionScheduler } from '../system/host'
import type { TaskSubmitRequest } from '../../shared/tasks'
import { randomUUID } from 'node:crypto'
import { closeWorkbenchTaskClis } from './workbenchTerminal'
import {issueLongTermUserCommand} from '../tasks/longTerm'
import type {GoalGrantInput,RuleGrantInput} from '../../shared/longTerm'
import {clearManagedWorkspace} from '../tasks/clearManagedWorkspace'
import {supervisorFor} from '../ackemcode/workSupervisorService'

export function registerTaskIpc(): void {
  const runtime=()=>getTaskRuntime(resolveDataRoot(loadSettings()))
  // This channel belongs to the fixed Ackem area. Independent work uses workbench:send.
  ipcMain.handle('tasks:submit',(_event,input:TaskSubmitRequest)=>runtime().coordinator.submit({...input,origin:'workbench'}))
  ipcMain.handle('tasks:cancel',(_event,requestId:string)=>runtime().coordinator.cancel(requestId))
  // Explicit local user commands alone issue confirmation capabilities; no model routing or quoted text grants rules.
  ipcMain.handle('tasks:goal-grant',(_event,input:GoalGrantInput)=>runtime().longTerm.grantGoal(issueLongTermUserCommand(),input))
  ipcMain.handle('tasks:goal-revoke',(_event,id:string)=>runtime().longTerm.revokeGoal(issueLongTermUserCommand(),id))
  ipcMain.handle('tasks:goal-state',(_event,input:{id:string;state:'paused'|'active'|'cancelled'|'abandoned'})=>runtime().longTerm.changeGoalState(issueLongTermUserCommand(),input.id,input.state))
  ipcMain.handle('tasks:goals',()=>runtime().longTerm.goals())
  ipcMain.handle('tasks:decisions',(_event,id:string)=>runtime().longTerm.decisions(id))
  ipcMain.handle('tasks:decision-correct',(_event,input:{id:string;basis:string})=>runtime().longTerm.correctDecision(issueLongTermUserCommand(),input.id,input.basis))
  ipcMain.handle('tasks:rule-grant',(_event,input:RuleGrantInput)=>runtime().longTerm.grantRule(issueLongTermUserCommand(),input))
  ipcMain.handle('tasks:rule-revoke',(_event,id:string)=>runtime().longTerm.revokeRule(issueLongTermUserCommand(),id))
  ipcMain.handle('tasks:rules',()=>runtime().longTerm.rules())
  ipcMain.handle('tasks:world-state',(_event,ids:string[])=>runtime().longTerm.worldState(ids))
  ipcMain.handle('tasks:stop',(_event,id:string)=>runtime().coordinator.stop(id))
  ipcMain.handle('tasks:run-queued-now',(_event,id:string)=>{runtime().coordinator.runQueuedNow(id);return {ok:true}})
  ipcMain.handle('tasks:list',()=>runtime().repository.visibleList().filter(task=>runtime().repository.canAccess(task.id,'ackem')))
  ipcMain.handle('tasks:clear-managed',async(_event,projectionIds:string[]=[] )=>{
    const root=resolveDataRoot(loadSettings()),rt=getTaskRuntime(root)
    if(!Array.isArray(projectionIds)||projectionIds.length>10000||projectionIds.some(id=>typeof id!=='string'))throw Error('无效任务记录')
    const staleTaskIds=projectionIds.filter(id=>{const task=rt.repository.get(id)?.snapshot;return !task||rt.repository.isArchived(id)||task.ownerPrincipalId==='user'&&task.supervisionPolicy==='user_only'&&task.deliverySurface==='chat'&&['completed','failed','paused'].includes(task.state)&&task.executionQuiescent!==false})
    const result=await clearManagedWorkspace({repository:rt.repository,stop:id=>{rt.coordinator.stop(id)},revokeRules:async ids=>{
      for(const rule of rt.longTerm.rules())if(ids.includes(rule.taskId)&&!rule.revokedAt)await rt.longTerm.revokeRule(issueLongTermUserCommand(),rule.id)
    },suppress:id=>rt.notifications.suppressTask(id,true),forgetSupervision:ids=>supervisorFor(root).forgetTasks(ids),removed:id=>rt.coordinator.publish(id,'removed')})
    return {...result,staleTaskIds}
  })
  ipcMain.handle('tasks:snapshot',(_event,id:string)=>runtime().repository.canAccess(id,'ackem')?runtime().repository.get(id)?.snapshot??null:null)
  ipcMain.handle('tasks:remove',async(_event,id:string)=>{
    const rt=runtime()
    if(!rt.repository.get(id))return {ok:true,missing:true}
    // This IPC is an explicit local-user action, not an Ackem authority grant.
    if(rt.repository.get(id)?.snapshot.ownerPrincipalId!=='user')throw Error('没有删除该任务记录的授权')
    if(rt.repository.isArchived(id))return {ok:true}
    const current=rt.repository.require(id).snapshot
    if(!rt.repository.canAccess(id,'ackem')){
      if(!['completed','failed','paused'].includes(current.state)||current.executionQuiescent===false)throw Error('请先在独立任务中停止执行，再删除记录')
      await closeWorkbenchTaskClis(id);rt.repository.archive(id);return {ok:true}
    }
    if(!['completed','failed','paused'].includes(current.state))await rt.coordinator.stop(id)
    const deadline=Date.now()+8000
    while(Date.now()<deadline){
      const task=rt.repository.require(id).snapshot
      if(['completed','failed','paused'].includes(task.state)&&task.executionQuiescent!==false){await closeWorkbenchTaskClis(id);rt.repository.archive(id);rt.notifications.suppressTask(id,true);rt.coordinator.publish(id,'removed');return {ok:true}}
      await new Promise(resolve=>setTimeout(resolve,100))
    }
    throw Error('尚未确认任务停止，已保留记录；确认停止后可再次删除')
  })
  ipcMain.handle('system:manifest',()=>refreshHostManifest(resolveDataRoot(loadSettings())))
  ipcMain.handle('workbench:open-default-directory',async()=>{
    const error=await shell.openPath(ensureDefaultWorkDirectory(resolveDataRoot(loadSettings())))
    if(error)throw Error(error)
    return {ok:true}
  })
  ipcMain.handle('system:inspect',(_event,input:{scope:string;reason:string})=>getHostSystem(resolveDataRoot(loadSettings())).inspect(input))
  const root=resolveDataRoot(loadSettings())
  registerSystemInspectionScheduler(root,request=>{
    const paths=request.manifest.moduleEntrypoints.map(entry=>join(app.getAppPath(),entry))
    return runtime().coordinator.submit({requestId:randomUUID(),origin:'ackem',conversationId:'system-inspection',cwd:app.getAppPath(),attachments:paths.map(path=>({path,kind:'file'})),inspectionPaths:paths,inspectionFingerprint:request.manifest,text:`仅做只读自我审视。范围：${request.scope}。目的：${request.reason}。根据附加的真实代码/诊断证据报告已实现、已配置、验证与未知。不得修改自身、安装、删除或执行变更。\n实时系统清单：${JSON.stringify(request.manifest)}`,inspectionScope:request.scope} as TaskSubmitRequest,true)
  })
  void refreshHostManifest(root).catch(()=>{})
}
