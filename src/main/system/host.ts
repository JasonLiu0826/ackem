import { createHash,randomUUID } from 'node:crypto'
import { existsSync,readFileSync,statSync,realpathSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { app } from 'electron'
import { getDatabase } from '../db/database'
import { loadSettings } from '../settings'
import { ackemCodeBaseUrl,resolveCodeRoot } from '../ackemcode/ensureDaemon'
import { SystemIntrospection,configurationFingerprint,type EvidenceRef,type SystemManifest } from './introspection'

type InspectionRequest={scope:string;reason:string;readOnly:true;priority:'background';manifest:SystemManifest}
type Scheduler=(request:InspectionRequest)=>unknown
type HostState={system:SystemIntrospection;health:SystemManifest['kernelHealth'];search:{enabled:boolean;configured:boolean};evidence:Map<string,EvidenceRef>;scheduler?:Scheduler;refresh?:Promise<SystemManifest>}
const hosts=new Map<string,HostState>()
const fileHashes=new Map<string,{stamp:string;hash:string}>()
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex')
const safeId=(value:string)=> /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value) ? value : `metadata:${hash(value)}`
function fileHash(path:string):string {
  const stat=statSync(path),stamp=`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
  const cached=fileHashes.get(path)
  if(cached?.stamp===stamp)return cached.hash
  const value=hash(readFileSync(path));fileHashes.set(path,{stamp,hash:value});return value
}

function buildMetadata(): Pick<SystemManifest,'appBuildId'|'codeBuildId'|'moduleEntrypoints'|'sourceAvailable'> {
  const appPath=app.getAppPath(),codeRoot=resolveCodeRoot()
  const entries=['out/main/index.js','src/main/index.ts','src/main/channel/routeChannel.ts','src/main/chat/images.ts','src/main/system/host.ts','src/main/system/introspection.ts','src/main/tasks/runtime.ts','src/main/tasks/coordinator.ts','src/main/tasks/repository.ts','src/main/ackemcode/client.ts','src/main/ackemcode/ensureDaemon.ts']
  const found=entries.filter(p=>existsSync(join(appPath,p)))
  const runtimeEntries=['dist/server/index.js','src/server/index.ts'].filter(p=>!!codeRoot && existsSync(join(codeRoot,p)))
  return {appBuildId:`${safeId(app.getVersion())}:${found.length ? hash(found.map(p=>`${p}:${fileHash(join(appPath,p))}`).join('\n')) : 'artifact-unavailable'}`,
    codeBuildId:runtimeEntries.length ? hash(runtimeEntries.map(p=>`${p}:${fileHash(join(codeRoot!,p))}`).join('\n')) : 'unavailable',
    moduleEntrypoints:found,sourceAvailable:found.some(p=>p.startsWith('src/'))}
}
function manifest(state:HostState):SystemManifest {
  const s=loadSettings(),configured=!!s.model?.trim() && !!s.openaiApiKey?.trim() && s.openaiApiKey!=='[encrypted]'
  const metadata={provider:safeId(s.llmProvider ?? 'openai'),model:safeId(s.model ?? ''),modelConfigured:configured,
    independentModel:!!s.ackemcodeIndependentLlm,independentModelId:safeId(s.ackemcodeModel ?? ''),
    independentConfigured:!!s.ackemcodeApiKey?.trim(),chatToolsEnabled:!s.disableChatTools,
    searchEnabled:state.search.enabled,searchConfigured:state.search.configured}
  return {...buildMetadata(),configFingerprint:configurationFingerprint(metadata),channels:['chat','plugin','work'],
    permissionMode:'per-task-runtime',kernelHealth:state.health,
    capabilities:[{capabilityId:'model',enabled:true,configured},
      {capabilityId:'vision',enabled:true,configured:false},
      {capabilityId:'web-search',enabled:state.search.enabled,configured:state.search.configured},
      {capabilityId:'kernel-health',enabled:true,configured:state.health==='connected'}]}
}

export function getHostSystem(dataRoot:string):SystemIntrospection {
  const key=resolve(dataRoot),existing=hosts.get(key)
  if(existing)return existing.system
  const db=getDatabase(key);if(!db)throw new Error('SYSTEM_KNOWLEDGE_DATABASE_UNAVAILABLE')
  const state={} as HostState
  Object.assign(state,{health:'unknown',search:{enabled:false,configured:false},evidence:new Map()})
  state.system=new SystemIntrospection(db,()=>manifest(state),request=>{
    if(!state.scheduler)throw new Error('SYSTEM_INSPECTION_COORDINATOR_UNAVAILABLE')
    return state.scheduler(request)
  },Date.now,e=>{
    const canonical=state.evidence.get(e.evidenceId)
    if(canonical)return JSON.stringify(canonical)===JSON.stringify(e)
    if(e.type==='source' || e.type==='artifact') {
      const metadata=buildMetadata()
      if(!metadata.moduleEntrypoints.includes(e.reference))return false
      if(e.type==='source' && !e.reference.startsWith('src/'))return false
      if(e.type==='artifact' && !e.reference.startsWith('out/'))return false
      return e.hash===fileHash(join(app.getAppPath(),e.reference))
    }
    return false
  })
  hosts.set(key,state);return state.system
}
export function registerSystemInspectionScheduler(dataRoot:string,scheduler:Scheduler):void {
  getHostSystem(dataRoot);hosts.get(resolve(dataRoot))!.scheduler=scheduler
}

/** Only read live endpoint metadata; never starts a daemon or changes its configuration. */
export async function refreshHostManifest(dataRoot:string):Promise<SystemManifest> {
  getHostSystem(dataRoot);const state=hosts.get(resolve(dataRoot))!
  if(state.refresh)return state.refresh
  const run=async()=>{
    const results=await Promise.allSettled(['/api/health','/api/web-search/config'].map(async path=>{
      const response=await fetch(`${ackemCodeBaseUrl()}${path}`,{signal:AbortSignal.timeout(3000)})
      if(!response.ok)throw new Error('ENDPOINT_UNAVAILABLE')
      return await response.json() as Record<string,unknown>
    }))
    const health=results[0],search=results[1]
    state.health=health.status==='fulfilled' ? 'connected':'disconnected'
    state.search=search.status==='fulfilled' ? {enabled:search.value.enabled===true,configured:search.value.ready===true} : {enabled:false,configured:false}
    const current=state.system.exportManifest(),now=Date.now()
    const observation={reachable:state.health==='connected',searchEnabled:state.search.enabled,searchConfigured:state.search.configured,
      protocolVersion:health.status==='fulfilled' && typeof health.value.protocolVersion==='number' ? health.value.protocolVersion : null}
    const e:EvidenceRef={evidenceId:randomUUID(),type:'diagnostic',reference:`host-health:${randomUUID()}`,hash:hash(JSON.stringify(observation)),
      observedAt:now,method:'Read-only GET /api/health and /api/web-search/config; sanitized metadata only',
      result:JSON.stringify(observation),scope:'runtime-endpoint-health'}
    state.evidence.set(e.evidenceId,e)
    state.system.commitVerifiedReport({snapshotId:randomUUID(),appBuildId:current.appBuildId,codeBuildId:current.codeBuildId,
      configFingerprint:current.configFingerprint,generatedAt:now,evidenceRefs:[e],knownIssues:[],capabilities:[{
        capabilityId:'kernel-health',summary:state.health==='connected' ? 'Runtime health endpoint responded; this does not verify tool execution.' : 'Runtime health endpoint did not respond successfully.',
        implementationState:'implemented',runtimeState:state.health==='connected' ? 'verified':'unavailable',scope:e.scope,
        checkedAt:now,expiresAt:now+60_000,evidenceRefs:[e.evidenceId],confidence:1}]})
    // Evidence needed for later reports is bounded; committed evidence remains in the ledger.
    if(state.evidence.size>100)state.evidence.delete(state.evidence.keys().next().value!)
    return current
  }
  state.refresh=run().finally(()=>{state.refresh=undefined});return state.refresh
}

export interface HostInspectionCommit {
  scope:string; summary:string; readPaths:string[]; taskId:string; runId:string; manifestAtStart:SystemManifest
}
/** Called only after the parent validates actual read receipts and accepts the inspection task.
 * File hashes prove the inspected observation scope, never general runtime success.
 */
export function commitHostInspection(dataRoot:string,input:HostInspectionCommit):void {
  const system=getHostSystem(dataRoot),current=system.exportManifest()
  if(!input.taskId || !input.runId || !input.scope.trim() || input.scope.length>200 || input.summary.length>2000 || input.readPaths.length>30)throw Error('INVALID_HOST_INSPECTION')
  if(['appBuildId','codeBuildId','configFingerprint'].some(key=>current[key as keyof SystemManifest]!==input.manifestAtStart[key as keyof SystemManifest]))throw Error('STALE_HOST_INSPECTION')
  const appPath=app.getAppPath(),now=Date.now(),evidence:EvidenceRef[]=[]
  for(const path of [...new Set(input.readPaths)]) {
    const reference=current.moduleEntrypoints.find(entry=>{
      const expected=resolve(appPath,entry),given=resolve(appPath,path)
      return process.platform==='win32' ? expected.toLowerCase()===given.toLowerCase() : expected===given
    })
    if(!reference)throw Error('HOST_INSPECTION_PATH_OUT_OF_SCOPE')
    const actual=join(appPath,reference)
    if(!statSync(actual).isFile() || realpathSync(actual)!==realpathSync(resolve(appPath,path)))throw Error('HOST_INSPECTION_PATH_OUT_OF_SCOPE')
    evidence.push({evidenceId:randomUUID(),type:reference.startsWith('src/')?'source':'artifact',reference,
      hash:fileHash(actual),observedAt:now,method:'Parent-confirmed read receipt; allowlisted current file SHA256',
      result:`Read scope observation for task=${input.taskId}; run=${input.runId}`,scope:input.scope})
  }
  if(!evidence.length)throw Error('HOST_INSPECTION_HAS_NO_FILE_EVIDENCE')
  // Do not accept a model's broad capability claim as a verified fact.
  system.commitVerifiedReport({snapshotId:randomUUID(),appBuildId:current.appBuildId,codeBuildId:current.codeBuildId,
    configFingerprint:current.configFingerprint,generatedAt:now,evidenceRefs:evidence,knownIssues:[],capabilities:[{
      capabilityId:`inspection:${input.scope}`,scope:input.scope,summary:`已核对 ${evidence.length} 个当前允许调查的文件：${evidence.map(e=>e.reference).join(', ')}。此观察只确认文件范围与指纹，能力实现和运行结果仍待独立验证。`,
      implementationState:'unknown',runtimeState:'unknown',checkedAt:now,expiresAt:now+24*60*60*1000,
      evidenceRefs:evidence.map(e=>e.evidenceId),confidence:1}]})
}

export function systemContext(dataRoot:string,userText=''):string {
  if(!getDatabase(dataRoot))return '本轮系统运行证据不可用；不得把旧自述当作当前可用能力。'
  const system=getHostSystem(dataRoot),m=system.exportManifest()
  const capabilities=m.capabilities.map(c=>`${c.capabilityId}: ${c.capabilityId==='vision' ? '当前模型视觉能力尚未核实' : !c.enabled ? '未启用' : !c.configured ? '未配置或状态未知' : '配置就绪（不代表运行验证）'}`).join('; ')
  const baseline=system.contextSummary({capabilityIds:m.capabilities.map(c=>c.capabilityId),limit:6})
  const scoped=userText ? system.getFacts({limit:20}).filter(f=>f.capabilityId.startsWith('inspection:') && userText.includes(f.scope)).slice(0,2)
    .map(f=>`${f.summary} [scope=${f.scope}; implementation=${f.implementationState}; runtime=${f.runtimeState}]`).join('\n') : ''
  const facts=[baseline,scoped].filter(Boolean).join('\n')
  return `当前系统元信息：app=${m.appBuildId}; runtime=${m.codeBuildId}; 内核=${m.kernelHealth}; 源码调查范围=${m.sourceAvailable ? '仅列出的可访问入口' : '发布构件与运行元信息'}。能力：${capabilities}。${facts ? `\n已核对的限定事实：\n${facts}` : ''}`.slice(0,4000)
}
