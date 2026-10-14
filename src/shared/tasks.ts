export type TaskOrigin = 'chat' | 'workbench' | 'ackem'
export type TaskState = 'queued' | 'running' | 'waiting_user' | 'cancelling' | 'paused' | 'reviewing' | 'completed' | 'failed' | 'unknown'
export type TaskAttachment = { path: string; kind: 'image' | 'file' | 'dir'; name?: string }
export type TaskPermissionMode = 'default' | 'sessionType' | 'acceptEdits' | 'bypassPermissions'
export type TaskExecutionOptions = { executionMode?: 'agent' | 'plan'; effort?: 'low' | 'medium' | 'high' | 'max'; permissionMode?: TaskPermissionMode }
export type WorkScheduling='enqueue'|'immediate'
export type StandaloneWorkInput=TaskExecutionOptions & {taskId:string;turnId:string;sessionId?:string;text:string;cwd?:string;submittedAt?:number;inputSequence?:number;scheduling?:WorkScheduling;retryLastTurn?:boolean;attachments?:Array<{kind:'doc'|'folder'|'image'|'video';path:string;name:string}>}
export type TaskAuthority = {
  domainId: string; workspaceId: string; ownerPrincipalId: string
  managerPrincipalId?: 'ackem'; supervisionPolicy: 'ackem_managed' | 'user_only'
}
export type WorkContract = {
  taskId: string; contractRevision: number
  goal: { text: string; goalRef?: string }
  scope: { domainId: string; resourceRefs: string[]; exclusions: string[];readOnlyResourceRefs?:string[] }
  constraints: Array<{ id: string; text: string; enforcement: 'runtime_guard' | 'registered_check' | 'semantic_review'; sourceRequestIds: string[] }>
  acceptanceCriteria: Array<{ id: string; expected: string; evidenceKind: string; verifierRef?: string; sourceRequestIds: string[] }>
  authorityRef: string; policyRef: { id: string; revision: number }
  sourceRequestIds: string[]; createdAt: number; updatedAt: number
}
export type ContractPatch = Partial<Pick<WorkContract, 'goal' | 'scope' | 'constraints' | 'acceptanceCriteria'>>
export function validateTaskExecutionOptions(input: TaskExecutionOptions): void {
  if (input.executionMode !== undefined && !['agent', 'plan'].includes(input.executionMode)) throw Error('无效工作模式')
  if (input.effort !== undefined && !['low', 'medium', 'high', 'max'].includes(input.effort)) throw Error('无效思考等级')
  if (input.permissionMode !== undefined && !['default', 'sessionType', 'acceptEdits', 'bypassPermissions'].includes(input.permissionMode)) throw Error('无效的任务权限')
}
export type TaskSubmitRequest = TaskExecutionOptions & {
  requestId: string; origin: TaskOrigin; conversationId: string; taskId?: string; text: string
  inputSequence?: number; submittedAt?: number
  /** Explicit user choice in the work composer, separate from semantic task amendments. */
  scheduling?:WorkScheduling
  candidateTaskIds?: string[]
  attachments?: TaskAttachment[]; cwd?: string
  /** Host system inspections are enforced read-only by the kernel. */
  inspectionScope?: string
  inspectionFingerprint?: {appBuildId:string;codeBuildId:string;configFingerprint:string}
  inspectionPaths?: string[]
}
export type TaskSubmitResult = {
  requestId: string; taskId?: string
  disposition: 'responded' | 'accepted' | 'applied' | 'stopping' | 'needs_clarification' | 'cancelled'
  message?: string; goalRevision?: number
}
export type TaskSnapshot = TaskExecutionOptions & {
  queueOrder?:number
  longTermGoalId?:string
  standingExecution?:{ruleId:string;triggerId:string;deadline:number;maxContextTokens:number;maxModelCalls:number}
  id: string; goal: string; goalRevision: number; controlEpoch: number; state: TaskState
  codeSessionId?: string; cwd: string; originConversationId: string; deliveryConversationId?:string; deliverySurface: 'chat' | 'workbench'
  currentRunId?: string; createdAt: number; updatedAt: number; attachments: TaskAttachment[]; summary?: string;userSummary?:string;reviewIssue?:'unavailable'
  legacyRunId?:string
  inspectionScope?: string
  inspectionFingerprint?: {appBuildId:string;codeBuildId:string;configFingerprint:string}
  inspectionPaths?: string[]
  artifacts?: string[]
  executionQuiescent?: boolean
  /** Durable execution body, separate from control and acceptance status messages. */
  executionResult?: {text:string;goalRevision:number;runId:string;kind?:'final'|'partial'}
  dependencies?: Array<{taskId:string;goalRevision:number}>
  domainId?: string; workspaceId?: string; ownerPrincipalId?: string; managerPrincipalId?: 'ackem'
  supervisionPolicy?: 'ackem_managed' | 'user_only'; authorityRef?: string
  policyRevision?: number; contract?: WorkContract
  execution?: { state:'not_started'|'running'|'succeeded'|'failed'|'aborted'|'unknown';goalRevision:number;runId?:string;receiptRevision?:number;quiescent:boolean }
  acceptance?: { state: 'not_ready' | 'delivery_ready' | 'reviewing' | 'rework' | 'accepted' | 'invalidated'; goalRevision: number; runId?: string; evidenceRefs: string[]; reason?: string }
  delivery?: { state: 'not_ready' | 'pending' | 'published' | 'suppressed' | 'failed'; goalRevision: number; notificationId?: string; publishedAt?: number }
}
export type TaskEvent = { taskId: string; type: string; at: number; snapshot?: TaskSnapshot; requestId?: string; message?: string }

/** Review service failure does not imply that a settled execution still occupies the kernel. */
export function hasSettledResultAwaitingReview(task:TaskSnapshot):boolean {
 return task.reviewIssue==='unavailable'&&!!task.currentRunId&&task.executionQuiescent===true&&task.execution?.state==='succeeded'&&Number(task.execution.receiptRevision)>0&&task.execution.quiescent===true&&task.execution.goalRevision===task.goalRevision&&task.execution.runId===task.currentRunId
}

export function isTaskExecutionSettled(task:TaskSnapshot):boolean {
 const execution=task.execution
 return task.executionQuiescent===true&&execution?.quiescent===true&&Number(execution.receiptRevision)>0&&['succeeded','failed','aborted'].includes(execution.state)&&execution.goalRevision===task.goalRevision&&!!task.currentRunId&&execution.runId===task.currentRunId
}

export function canStopTaskExecution(task:TaskSnapshot):boolean {
 return !['completed','failed','paused'].includes(task.state)&&!(task.state!=='queued'&&task.state!=='cancelling'&&isTaskExecutionSettled(task))
}

export function executionResultText(task:TaskSnapshot):string|undefined {
 const result=task.executionResult
 if(result&&result.goalRevision===task.goalRevision&&result.runId===task.currentRunId)return result.text
 return task.state==='completed'||hasSettledResultAwaitingReview(task)?task.summary:undefined
}

export function hasFinalExecutionResult(task:TaskSnapshot):boolean {
 const result=task.executionResult
 return !!executionResultText(task)&&result?.kind!=='partial'&&(result?.kind==='final'||task.execution?.state==='succeeded'||task.state==='completed')
}
