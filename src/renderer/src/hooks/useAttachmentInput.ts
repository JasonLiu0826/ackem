import {useEffect,useRef,useState} from 'react'
import type {ClipboardEvent,DragEvent} from 'react'
import type {ChatAttachment} from '../../../shared/chatAttachments'
export async function droppedFileEntries(files:File[],getPath:(file:File)=>string):Promise<Array<{path?:string;name?:string;bytes?:ArrayBuffer}>>{
 if(files.length>10)throw Error('每次最多添加 10 个附件')
 return Promise.all(files.map(async file=>{
  let path='';try{path=getPath(file)}catch{ /* Browser-origin file: use its actual bytes. */ }
  if(path)return {path}
  if(file.size>64*1024*1024)throw Error('无本机路径的拖拽内容不能超过 64MB，请用＋选择文件')
  return {name:file.name,bytes:await file.arrayBuffer()}
 }))
}
export function clipboardImageFiles(data:Pick<DataTransfer,'items'|'files'>):File[]{
 const images=Array.from(data.items).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>!!file)
 return images.length?images:Array.from(data.files).filter(file=>file.type.startsWith('image/'))
}
export function useAttachmentInput(onAttachments:(items:ChatAttachment[])=>void,onError:(message:string)=>void,contextKey:string){
 const [dragging,setDragging]=useState(false),[pending,setPending]=useState(false)
 const depth=useRef(0),locked=useRef(false),key=useRef(contextKey),live=useRef(true);key.current=contextKey
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 async function process(job:()=>Promise<ChatAttachment[]>){
  if(locked.current){onError('附件正在添加，请稍候');return}
  locked.current=true;setPending(true);const target=key.current
  try{const items=await job();if(!live.current)return;if(target!==key.current){onError('已切换会话，请重新添加附件');return}if(items.length)onAttachments(items)}catch(e){if(live.current)onError(String(e))}
  finally{locked.current=false;if(live.current)setPending(false)}
 }
 const isFiles=(e:DragEvent)=>Array.from(e.dataTransfer.types).includes('Files')
 const dragProps={
  onPaste:(e:ClipboardEvent)=>{
   const files=clipboardImageFiles(e.clipboardData);if(!files.length)return
   // Preserve normal text insertion when a clipboard contains both text and images.
   if(!e.clipboardData.getData('text/plain'))e.preventDefault()
   e.stopPropagation()
   void process(async()=>window.ackem.captureChatAttachments(await droppedFileEntries(files,file=>window.ackem.getPathForFile(file))))
  },
  onDragEnter:(e:DragEvent)=>{if(!isFiles(e))return;e.preventDefault();depth.current++;setDragging(true)},
  onDragOver:(e:DragEvent)=>{if(!isFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy'},
  onDragLeave:(e:DragEvent)=>{if(!isFiles(e))return;e.preventDefault();depth.current=Math.max(0,depth.current-1);if(!depth.current)setDragging(false)},
  onDragEnd:()=>{depth.current=0;setDragging(false)},
  onDrop:(e:DragEvent)=>{if(!isFiles(e))return;e.preventDefault();e.stopPropagation();depth.current=0;setDragging(false);const files=Array.from(e.dataTransfer.files);void process(async()=>window.ackem.captureChatAttachments(await droppedFileEntries(files,file=>window.ackem.getPathForFile(file))))}
 }
 return {dragProps,dragging,pending,select:(kind?:'image'|'file'|'video'|'folder')=>process(async()=>{if(kind!=='folder')return window.ackem.selectChatAttachments(kind);const {path}=await window.ackem.selectFolder();return path?window.ackem.captureChatAttachments([{path}]):[]})}
}
