import type { WebContents } from 'electron'
import type { TaskSnapshot,TaskSubmitRequest } from '../../shared/tasks'
import { createReplyTransport } from '../chat/replyTransport'
import { streamChatCompletion } from '../chat'
import { loadSettings } from '../settings'
import { buildSelectedPersonalityVoice } from '../personalityVoice'
import { emit } from '../ackemcode/workRuntimeService'
import {getTaskRuntime} from './runtime'

const controllers=new Map<string,AbortController>()
export function cancelWorkReply(requestId:string):void{controllers.get(requestId)?.abort()}
/** Shares the ordinary reply lifecycle, personality and provider token budget. */
export async function respondInWork(root:string,input:TaskSubmitRequest,tasks:TaskSnapshot[]):Promise<string>{
  const controller=new AbortController();controllers.set(input.requestId,controller)
  const settings={...loadSettings(),disableChatTools:true}
  let answer='',failure:string|undefined
  const transport=createReplyTransport((channel,...args)=>{
    if(channel==='chat:reply'){const reply=args[0] as {type:string;text?:string};if(reply.type==='failed')failure=reply.text??'回复未完成';emit(null,input.taskId??input.conversationId,input.requestId,{type:'work_reply',reply:args[0]})}
    if(channel==='chat:done')answer=String((args[0] as {assistantText?:string}).assistantText??'')
  },{sessionId:input.conversationId,turnId:input.requestId,replyId:`work-reply:${input.requestId}`},{origin:'answer',style:'assistant',status:'not_executed'})
  const surface={send:transport.send,isDestroyed:()=>false} as unknown as WebContents
  let taskFence=()=>true
  if(tasks.length){
    try{
      const runtime=getTaskRuntime(root),sources=runtime.longTerm.captureContext(tasks.map(t=>t.id))
      taskFence=()=>sources.isCurrent()&&tasks.every(expected=>{
        const current=runtime.repository.get(expected.id)?.snapshot
        return !!current&&runtime.repository.canAccess(current.id,'ackem')&&runtime.repository.visibleList().some(t=>t.id===current.id)&&current.goalRevision===expected.goalRevision&&current.controlEpoch===expected.controlEpoch&&(current.policyRevision??1)===(expected.policyRevision??1)
      })
    }catch{taskFence=()=>false}
  }
  const cancel=()=>transport.cancel();controller.signal.addEventListener('abort',cancel,{once:true})
  try{
    await streamChatCompletion(surface,{settings,sessionId:input.conversationId,turnId:input.requestId,trustedContextFence:taskFence,messages:[{role:'system',content:`你是 Ackem，在固定工作区自然回应用户。根据已授权的当前任务事实作答；执行进展只能引用事实，等待或运行不能说成完成。${buildSelectedPersonalityVoice(settings)}`},{role:'user',content:JSON.stringify({message:input.text,taskFacts:tasks.map(task=>({id:task.id,goal:task.goal,state:task.state,summary:task.summary}))})}]},root,controller.signal)
    if(!controller.signal.aborted)transport.finish()
    if(failure&&!controller.signal.aborted)throw Error(failure)
    return answer
  }finally{controller.signal.removeEventListener('abort',cancel);if(controller.signal.aborted)transport.cancel();else transport.finish();if(controllers.get(input.requestId)===controller)controllers.delete(input.requestId)}
}
