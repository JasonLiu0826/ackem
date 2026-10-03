import { jealousTemplate } from './jealousTemplates'
import { postTemplate } from './postTemplates'
import type { ContentMode } from '../types'
export type PostContext={name:string;aff:number;aro:number;jealous?:boolean;favoriteName?:string}
export type LlmPostGenerator=(ctx:PostContext)=>Promise<string>
let llm:LlmPostGenerator|undefined
export const setSocialLlmGenerator=(fn:LlmPostGenerator|undefined)=>{llm=fn}
export async function generatePost(ctx:PostContext,mode:ContentMode='template'){if(mode==='llm'&&llm)try{const text=await Promise.race([llm(ctx),new Promise<string>((_,reject)=>setTimeout(()=>reject(new Error('timeout')),2000))]);if(text.trim())return {content:text,source:'llm' as const}}catch{}return {content:ctx.jealous?jealousTemplate(ctx.name,ctx.favoriteName??'她'):postTemplate(ctx.name,ctx.aff,ctx.aro),source:'template' as const}}
