import {stat} from 'node:fs/promises'
import {getTaskRuntime,submitChatTask} from './runtime'
import {loadChatImages} from '../chat/images'
import {engineSessionId} from '../session/canonical'

export type ChatWorkDispatch = { taskId: string; turnId: string; cwd: string; sessionId: string; queued: boolean; runId: string }

/** 智慧路由的自主派工入口: work 任务不再弹确认卡, 直接进工作台固定任务。 */
export type ChatWorkJobArgs = {
  inspectionScope?: string
  filePaths?: string[]
  imagePaths?: string[]
  text: string
  dataRoot: string
  turnId: string
  correlationId: string
  chatSessionId?: string
  promotedRunId?: string
  supervisorRootId?: string
  cwd?: string
  supervisorEpoch?: number
}
export async function dispatchChatWorkJob(args: ChatWorkJobArgs): Promise<ChatWorkDispatch> {
  // Old accepted ledger runs are recovered once through their existing receipt path.
  if(args.promotedRunId || args.supervisorRootId)throw Error('旧版任务没有当前托管授权，请重新明确委托')
  await loadChatImages(args.imagePaths)
  const attachments = [
    ...(args.imagePaths??[]).map(path=>({path,kind:'image' as const})),
    ...await Promise.all((args.filePaths??[]).map(async path=>({path,kind:(await stat(path)).isDirectory()?'dir' as const:'file' as const})))
  ]
  const runtime=getTaskRuntime(args.dataRoot)
  // Router metadata must never turn a human computer task into the host's bounded self-audit.
  // Only the host inspection scheduler issues that privileged execution identity.
  const result=await submitChatTask(args.dataRoot,{requestId:args.turnId,origin:'chat',conversationId:args.chatSessionId??engineSessionId(),text:args.text,attachments,cwd:args.cwd})
  if(!result.taskId)throw Error(result.message??'未创建任务')
  const task=runtime.repository.require(result.taskId).snapshot
  return {taskId:task.id,turnId:args.turnId,cwd:task.cwd,sessionId:task.codeSessionId??'',queued:task.state==='queued',runId:task.currentRunId??args.turnId}
}
