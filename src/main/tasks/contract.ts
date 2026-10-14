import type { ContractPatch, TaskAuthority, TaskSnapshot, WorkContract,TaskAttachment } from '../../shared/tasks'
import {realpathSync,statSync} from 'node:fs'
import {dirname,basename,isAbsolute,relative,resolve} from 'node:path'

function canonicalResource(path:string):string {
  if(!isAbsolute(path))throw Error('附件必须在当前授权范围内使用绝对路径')
  let existing=resolve(path);const suffix:string[]=[]
  for(;;){try{return resolve(realpathSync.native(existing),...suffix)}catch(error){if(!['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code??''))throw error;const parent=dirname(existing);if(parent===existing)throw error;suffix.unshift(basename(existing));existing=parent}}
}
const contained=(path:string,root:string)=>{const rel=relative(root,path);return rel===''||(!rel.startsWith('../')&&!rel.startsWith('..\\')&&rel!=='..'&&!isAbsolute(rel))}
/** Human attachments identify resources already covered by this grant; they do not grant new roots. */
export function attachmentContractScope(task:Pick<TaskSnapshot,'cwd'|'attachments'>,contract:Pick<WorkContract,'scope'>,attachments:TaskAttachment[],trustedPaths:string[]=[]):WorkContract['scope'] {
  const roots=contract.scope.resourceRefs.map(ref=>({ref,path:canonicalResource(ref),directory:ref===task.cwd||task.attachments.some(a=>a.path===ref&&a.kind==='dir')||(()=>{try{return statSync(ref).isDirectory()}catch{return false}})()}))
  const excluded=contract.scope.exclusions.map(canonicalResource)
  const readOnly=[...contract.scope.readOnlyResourceRefs??[]]
  for(const attachment of attachments){const path=canonicalResource(attachment.path),covered=roots.some(root=>path===root.path||root.directory&&contained(path,root.path));if(excluded.some(root=>contained(path,root))||!covered&&!trustedPaths.includes(attachment.path))throw Error('附件超出当前任务授权范围');if(!covered)readOnly.push(attachment.path)}
  return {...contract.scope,resourceRefs:[...new Set([...contract.scope.resourceRefs,...attachments.map(a=>a.path)])],...(readOnly.length?{readOnlyResourceRefs:[...new Set(readOnly)]}:{})}
}

export function taskAuthority(task: TaskSnapshot): TaskAuthority {
  // Legacy navigation and message origins do not establish a management grant.
  return {
    domainId: task.domainId ?? `user:task:${task.id}`, workspaceId: task.workspaceId ?? task.id,
    ownerPrincipalId: task.ownerPrincipalId ?? 'user',
    supervisionPolicy: task.supervisionPolicy ?? 'user_only',
    ...(task.supervisionPolicy === 'ackem_managed' && task.managerPrincipalId === 'ackem' ? { managerPrincipalId: 'ackem' as const } : {})
  }
}

export function initialContract(task: TaskSnapshot, sourceRequestId: string): WorkContract {
  if (!task.authorityRef || task.supervisionPolicy !== 'ackem_managed') throw Error('任务没有托管授权')
  return {
    taskId: task.id, contractRevision: task.goalRevision, goal: { text: task.goal },
    scope: { domainId: task.domainId!, resourceRefs: [...new Set([task.cwd, ...task.attachments.map(a => a.path)])], exclusions: [],readOnlyResourceRefs:task.attachments.filter(a=>!contained(canonicalResource(a.path),canonicalResource(task.cwd))).map(a=>a.path) },
    constraints: [], acceptanceCriteria: [{ id: 'user-goal', expected: task.goal, evidenceKind: 'runtime_receipt_and_review', verifierRef:'ackem:semantic-review',sourceRequestIds: [sourceRequestId] }],
    authorityRef: task.authorityRef, policyRef: { id: `policy:${task.id}`, revision: task.policyRevision ?? 1 },
    sourceRequestIds: [sourceRequestId], createdAt: task.createdAt, updatedAt: task.updatedAt
  }
}

export function validateContractPatch(contract: WorkContract, patch: ContractPatch): void {
  if (!patch || typeof patch !== 'object' || Object.keys(patch).some(key => !['goal', 'scope', 'constraints', 'acceptanceCriteria'].includes(key))) throw Error('契约修改包含不可更改的字段')
  if (patch.goal !== undefined && (!patch.goal || typeof patch.goal.text !== 'string' || !patch.goal.text.trim() || patch.goal.text.length > 50_000)) throw Error('目标文本无效')
  if (patch.scope !== undefined && !patch.scope) throw Error('契约范围无效')
  if (patch.scope && (patch.scope.domainId !== contract.scope.domainId || !Array.isArray(patch.scope.resourceRefs) || patch.scope.resourceRefs.some(ref => !contract.scope.resourceRefs.includes(ref)) || !Array.isArray(patch.scope.exclusions) || patch.scope.exclusions.some(ref => typeof ref !== 'string') || contract.scope.exclusions.some(ref => !patch.scope!.exclusions.includes(ref)))) throw Error('契约修改不能扩大授权范围')
  if(patch.scope&&JSON.stringify(patch.scope.readOnlyResourceRefs??[])!==JSON.stringify(contract.scope.readOnlyResourceRefs??[]))throw Error('契约修改不能改变附件只读授权')
  for (const [kind, items] of [['constraints', patch.constraints], ['acceptanceCriteria', patch.acceptanceCriteria]] as const) {
    if (items === undefined) continue
    if (!Array.isArray(items) || items.length > 100 || new Set(items.map(item => item.id)).size !== items.length) throw Error('契约条目无效')
    for (const item of items) {
      if (!item.id || item.id.length > 200 || !Array.isArray(item.sourceRequestIds) || !item.sourceRequestIds.length || item.sourceRequestIds.some(id => typeof id !== 'string' || !id || id.length > 200)) throw Error('契约条目缺少来源')
      if (kind === 'constraints') {
        const constraint = item as WorkContract['constraints'][number]
        // Runtime guards and registered verifiers must be installed by trusted services, not model patches.
        if (typeof constraint.text !== 'string' || !constraint.text.trim() || constraint.text.length > 10_000 || constraint.enforcement !== 'semantic_review') throw Error('自然语言约束必须经过语义验收')
      } else {
        const criterion = item as WorkContract['acceptanceCriteria'][number]
        if (typeof criterion.expected !== 'string' || !criterion.expected.trim() || criterion.expected.length > 10_000 || typeof criterion.evidenceKind !== 'string' || !criterion.evidenceKind || criterion.verifierRef&&criterion.verifierRef!=='ackem:semantic-review') throw Error('验收条件无效或验证器未注册')
      }
    }
  }
}
