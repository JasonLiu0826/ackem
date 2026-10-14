import {resolve} from 'node:path'
type Guard=()=>boolean
const messagesGuards=new WeakMap<object,Guard>()
const prepared=new Map<string,{guard:Guard;expiresAt:number}>()
const key=(root:string,turnId:string)=>JSON.stringify([resolve(root),turnId])
export function bindContextPublicationFence(messages:object,guard:Guard):void{messagesGuards.set(messages,guard)}
export function registerPreparedContextFence(root:string,turnId:string,messages:object):void{
 const guard=messagesGuards.get(messages);if(!guard)return
 for(const [id,entry] of prepared)if(entry.expiresAt<Date.now())prepared.delete(id)
 if(prepared.size>=4096)prepared.delete(prepared.keys().next().value!)
 prepared.set(key(root,turnId),{guard,expiresAt:Date.now()+30*60_000})
}
export function contextPublicationFence(root:string,body:{messages?:unknown;turnId?:unknown;trustedContextFence?:unknown}):Guard|undefined{
 // A function cannot arrive over structured-clone IPC; this is an in-process adapter only.
 if(typeof body.trustedContextFence==='function')return body.trustedContextFence as Guard
 if(body.messages&&typeof body.messages==='object'){
  const local=messagesGuards.get(body.messages);if(local)return local
 }
 const entry=typeof body.turnId==='string'?prepared.get(key(root,body.turnId)):undefined
 if(entry)return()=>Date.now()<entry.expiresAt&&entry.guard()
 // A dropped/expired preparation must not turn serialized task context into an unchecked prompt.
 if(Array.isArray(body.messages)&&body.messages.some(m=>m?.role==='system'&&typeof m.content==='string'&&m.content.includes('授权任务事实：')))return()=>false
}
