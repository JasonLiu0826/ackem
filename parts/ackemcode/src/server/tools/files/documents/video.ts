import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { tmpdir } from 'node:os'
import type { FileToolResult } from '../types.js'
const run=promisify(execFile)
export const isVideoExtension=(ext:string)=>['.mp4','.mov','.webm','.mkv','.avi','.m4v'].includes(ext.toLowerCase())
/** Portable vision: bounded, timestamped frame sampling; never pretend to decode audio. */
export async function extractVideoFile(path:string,vision:boolean):Promise<FileToolResult> {
  if(!isVideoExtension(extname(path)))return {ok:false,output:'Unsupported video type'}
  const info=await stat(path)
  if(!info.isFile()||info.size>512*1024*1024)return {ok:false,output:'视频需为本机文件且不超过 512MB'}
  let duration:number
  try{
    const probe=await run(process.env.ACKEM_FFPROBE||'ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{windowsHide:true,timeout:15000,maxBuffer:1024*1024})
    duration=Number(JSON.parse(probe.stdout).format?.duration)
    if(!Number.isFinite(duration)||duration<=0)throw Error('无法读取视频时长')
  }catch{return {ok:true,output:`视频附件：${basename(path)}（${info.size} 字节）。当前未能读取视频画面或时长；需要可用的 ffprobe/ffmpeg 和有效视频。不能据此描述画面或音轨。`}}
  const header=`视频附件：${basename(path)}；时长 ${duration.toFixed(2)} 秒；${info.size} 字节。`
  if(!vision)return {ok:true,output:header+' 当前模型未启用识图，未提交画面。'}
  const dir=await mkdtemp(join(tmpdir(),'ackem-video-'))
  try{
    const timestamps=Array.from({length:6},(_,i)=>duration*(i+.5)/6)
    const frames=await Promise.all(timestamps.map(async(second,i)=>{
      const output=join(dir,`${i}.jpg`)
      try{
        await run(process.env.ACKEM_FFMPEG||'ffmpeg',['-nostdin','-loglevel','error','-ss',second.toFixed(3),'-i',path,'-frames:v','1','-vf',"scale='min(1024,iw)':-2",'-q:v','4','-y',output],{windowsHide:true,timeout:15000,maxBuffer:1024*1024})
        return {kind:'image' as const,mime:'image/jpeg',base64:(await readFile(output)).toString('base64'),label:`${basename(path)} @ ${second.toFixed(2)}s`}
      }catch{return null}
    }))
    const media=frames.filter((f):f is NonNullable<typeof f>=>f!==null)
    return {ok:true,output:header+(media.length?` 已抽样 ${media.length} 帧，按顺序位于：${media.map(f=>f.label).join('；')}。仅根据这些抽样画面回答，不声称观看了整段视频；尚未提取或听取音轨。`:' 当前无法提取画面，请检查 ffmpeg；不能描述未读取的画面或音轨。'),media:media.length?media:undefined}
  }finally{await rm(dir,{recursive:true,force:true})}
}
