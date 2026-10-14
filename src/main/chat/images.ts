import { randomUUID } from 'node:crypto'
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ChatImage, ImagePart } from '../../shared/chatImages'
export async function loadChatImages(paths: unknown): Promise<ChatImage[]> {
  if (paths===undefined) return []
  if (!Array.isArray(paths)||paths.length>4||paths.some(p=>typeof p!=='string'))throw new Error('每次最多添加 4 张图片')
  let total=0
  return Promise.all(paths.map(async path=>{
    const info=await stat(path);total+=info.size
    if(!info.isFile()||info.size>8*1024*1024||total>20*1024*1024)throw new Error('图片单张不超过 8MB，总计不超过 20MB')
    const b=await readFile(path)
    const mime=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':/^GIF8[79]a$/.test(b.subarray(0,6).toString())?'image/gif':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':null
    if(!mime)throw new Error('只支持 PNG、JPEG、GIF、WebP 图片')
    return {path,name:basename(path),preview:`data:${mime};base64,${b.toString('base64')}`}
  }))
}
export const imageParts=(images:ChatImage[]):ImagePart[]=>images.map(i=>({type:'image_url',image_url:{url:i.preview}}))

/** Snapshot explicitly selected images so future turns never read changed originals. */
export async function snapshotChatImages(paths:string[],root:string):Promise<ChatImage[]> {
  const images=await loadChatImages(paths)
  const dir=join(root,'attachments','chat-images');await mkdir(dir,{recursive:true})
  return Promise.all(images.map(async image=>{
    const mime=image.preview.slice(5,image.preview.indexOf(';'))
    const ext={ 'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp' }[mime]!
    const path=join(dir,`${randomUUID()}.${ext}`)
    await writeFile(path,Buffer.from(image.preview.slice(image.preview.indexOf(',')+1),'base64'),{flag:'wx'})
    return {...image,path}
  }))
}
