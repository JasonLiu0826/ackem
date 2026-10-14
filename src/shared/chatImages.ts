export type ChatImage = { path: string; name: string; preview: string }
export type ImagePart = { type: 'image_url'; image_url: { url: string; detail?: string } }
export function attachImagesToLastUser(messages: Array<{role:string;content:unknown}>, images: ImagePart[]): Array<{role:string;content:unknown}> {
  if (!images.length) return messages
  const index = messages.map(m=>m.role).lastIndexOf('user')
  if (index < 0) throw new Error('图片缺少用户消息')
  return messages.map((m,i)=>i===index ? {...m,content:[...(Array.isArray(m.content)?m.content:[{type:'text',text:String(m.content??'')}]),...images]} : m)
}
export function anthropicImageContent(content: unknown): string | Array<Record<string,unknown>> {
  if (!Array.isArray(content)) return typeof content==='string'?content:JSON.stringify(content??'')
  return content.map(part=>{
    if(part.type==='text')return {type:'text',text:String(part.text??'')}
    if(part.type==='image_url'){
      const url=String(part.image_url?.url??'')
      const data=url.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/)
      if(data)return {type:'image',source:{type:'base64',media_type:data[1],data:data[2]}}
      if(/^https:\/\//.test(url))return {type:'image',source:{type:'url',url}}
      throw new Error('不支持的图片地址')
    }
    throw new Error('不支持的多模态内容类型')
  })
}

/** Text-only consumers (memory, task classification) must never ingest image bytes. */
export function chatContentText(content:unknown):string {
  if(typeof content==='string')return content
  if(Array.isArray(content))return content.filter(p=>p&&p.type==='text'&&!String(p.text??'').startsWith('\n[用户显式提交的附件数据：')).map(p=>String(p.text??'')).join('\n')
  return content==null?'':JSON.stringify(content)
}
