export type TaskApproval = {
  taskId: string; requestId: string; codeSessionId: string; chatSessionId: string
  eventType?: string; questions?: Array<{question:string;options:Array<{label:string}>}>;
  title: string; detail: string; toolName: string; createdAt: number
  /** Plain-language operation and reason for asking; raw payload stays in detail. */
  summary?: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  operationDigest?:string; resolvedBy?:'user'|'ackem'|'runtime_policy'; authorizedScope?:string
}

export function approvalExplanation(approval: Pick<TaskApproval,'summary'|'detail'|'eventType'>): string {
  const plain = (value: string | undefined) => {
    const line = value?.split(/\r?\n/)[0]?.trim()
    if (!line || /[{}]|```|\$[\w(]|"(?:command|file_path)"\s*:/.test(line)) return undefined
    return line.length > 140 ? line.slice(0,139) + '…' : line
  }
  return plain(approval.summary) ?? plain(approval.detail) ??
    (approval.eventType === 'ask_user' ? '需要你补充信息，才能继续这项任务。' : '这项操作需要你确认后才能继续，具体执行记录保留在工作页。')
}
export type SupervisedTask = {
  id: string; codeSessionId: string; chatSessionId: string; cwd: string; goal: string
  currentRunId: string; currentTurnId: string; epoch: number; rounds: number
  state: 'running' | 'reviewing' | 'waiting_user' | 'user_control' | 'completed' | 'blocked' | 'interrupted'
  artifacts?: string[]; progressFingerprint?: string; stalledRounds?: number;
  nextStep?: string; updatedAt: number; approvals: TaskApproval[]
  log: Array<{turnId?:string;runId?:string;at:number; actor:'ackem'|'user'|'runtime'; kind:string; text:string}>
}
