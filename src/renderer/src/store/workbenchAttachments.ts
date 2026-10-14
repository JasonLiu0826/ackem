import type {ChatAttachment} from '../../../shared/chatAttachments'
import {useWorkbenchStore} from './workbenchStore'
import {useAppStore} from './appStore'
export function addWorkbenchAttachments(taskId:string,items:ChatAttachment[]):void{
 for(const item of items){
  const id=Math.random().toString(36).slice(2)
  const attachment=item.kind==='image'?{kind:'image' as const,id,name:item.name,path:item.path,dataUrl:item.preview,size:item.size}:item.kind==='video'?{...item,id,kind:'video' as const}:item.kind==='folder'?{kind:'folder' as const,id,name:item.name,path:item.path}:{kind:'doc' as const,id,name:item.name,path:item.path}
  const error=useWorkbenchStore.getState().addAttachment(taskId,attachment)
  if(error)useAppStore.getState().pushToast(error)
 }
}
