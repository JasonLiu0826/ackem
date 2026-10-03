import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentEvent,
  EffortLevel,
  PermissionMode,
  SessionUiState
} from '../shared/types'
import { getNextPermissionMode } from '../shared/types'
import { groupToolSteps, pathFromToolInput } from '../shared/thoughtCollapse'
import {
  explainPermissionAsk,
  summarizePermissionOperation
} from '../shared/permissionAsk'
import { ASK_USER_OTHER_LABEL, buildPlanExitOptions } from '../shared/planInterview'

type Tab = 'chat' | 'settings'

/** G-05: workbench chip paths sent with POST /chat (body loaded server-side). */
type AttachmentChip = {
  path: string
  kind: 'file' | 'dir' | 'image'
}

function chatRequestBody(
  text: string,
  chips: AttachmentChip[]
): { text: string; attachments?: Array<AttachmentChip & { source: 'workbench_chip' }> } {
  const body: {
    text: string
    attachments?: Array<AttachmentChip & { source: 'workbench_chip' }>
  } = { text }
  if (chips.length > 0) {
    body.attachments = chips.map((c) => ({
      ...c,
      source: 'workbench_chip' as const
    }))
  }
  return body
}

type PermissionRulesUi = {
  allow: string[]
  deny: string[]
  ask: string[]
}

type UiSettings = {
  apiBaseUrl: string
  apiKey: string
  hasApiKey: boolean
  model: string
  effort: EffortLevel
  permissionMode: PermissionMode
  maxTurns: number
  cwd: string
  /** S08: default command for verify_delivery */
  verifyCommand?: string
  useClaudeSkills: boolean
  extraSkillDirs: string[]
  mcpServers?: Record<string, unknown>
  permissionRules: PermissionRulesUi
  /** Auto-mode classifier bullets (CC autoMode spirit). */
  autoMode?: {
    allow?: string[]
    softDeny?: string[]
    environment?: string[]
    model?: string
  }
  webSearch?: {
    provider?: 'tavily' | 'serpapi' | 'brave' | 'custom' | 'mock' | 'auto'
    apiKey?: string
    customUrl?: string
    maxResults?: number
  }
}

type SkillRow = {
  name: string
  folderName?: string
  description: string
  whenToUse?: string
  source: string
  dir: string
  disableModelInvocation: boolean
  uninstallable?: boolean
}

type ToolStep = {
  id: string
  toolId: string
  name: string
  input: unknown
  output?: string
  ok?: boolean
  phase: 'running' | 'awaiting_permission' | 'done'
  elapsedSec?: number
}

type TimelineItem =
  | { id: string; kind: 'user'; text: string }
  | {
      id: string
      kind: 'turn'
      thinkingLive: boolean
      thinkingSec: number
      understanding: string
      understandingLog: string[]
      steps: ToolStep[]
      reply?: string
      error?: string
    }

const SESSION_LS_KEY = 'ackemcode.sessionId'
const SANDBOX_ONBOARD_SESSION_KEY = 'ackemcode.sandbox.skipPromptSession'

type SandboxOnboardingOption = {
  id: 'install' | 'never' | 'continue' | 'exit'
  label: string
  description?: string
}

type SandboxOnboardingInfo = {
  showPrompt: boolean
  platform: string
  supported: boolean
  canInstallWindows: boolean
  dependencyErrors: string[]
  installHint?: string
  title: string
  body: string
  options: SandboxOnboardingOption[]
}

/** Rebuild a lightweight timeline from persisted ChatMessage history (M06). */
function historyToTimeline(
  history: Array<{
    role: string
    content?: string | null
    tool_calls?: unknown[]
  }>
): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const m of history) {
    if (m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
      if (m.content.startsWith('[Context compacted]')) {
        items.push({
          id: crypto.randomUUID(),
          kind: 'turn',
          thinkingLive: false,
          thinkingSec: 0,
          understanding: '（会话已恢复 · 含压缩摘要）',
          understandingLog: [],
          steps: [],
          reply: m.content.slice(0, 1600)
        })
        continue
      }
      items.push({ id: crypto.randomUUID(), kind: 'user', text: m.content })
    }
    if (
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      m.content.trim() &&
      !(m.tool_calls && m.tool_calls.length)
    ) {
      items.push({
        id: crypto.randomUUID(),
        kind: 'turn',
        thinkingLive: false,
        thinkingSec: 0,
        understanding: '',
        understandingLog: [],
        steps: [],
        reply: m.content
      })
    }
  }
  return items
}

type PendingPermission = {
  requestId: string
  toolName: string
  input: unknown
  reason: string
  toolId?: string
  toolUseId?: string
  feedback: string
}

type PendingAsk = {
  requestId: string
  questions: Array<{
    question: string
    header?: string
    options: Array<{ label: string; description?: string; preview?: string }>
    multiSelect?: boolean
  }>
  selections: Record<string, string[]>
}

type PendingPlan = {
  requestId: string
  /** Empty when entering plan mode (CC EnterPlanMode confirm). */
  plan: string
  /** Original plan for edit detection (exit only). */
  initialPlan: string
  planFilePath?: string
  kind: 'enter' | 'exit'
  /** Post-approve mode (exit only). */
  exitMode: PermissionMode
  rejectFeedback: string
}

const MAX_SEPARATE_TOOLS = 5
const EFFORTS: EffortLevel[] = ['low', 'medium', 'high']
const MODES: PermissionMode[] = [
  'default',
  'plan',
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'dontAsk'
]

async function fetchSettings(): Promise<UiSettings> {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error('Failed to load settings')
  const data = (await res.json()) as UiSettings
  return {
    ...data,
    permissionRules: data.permissionRules ?? { allow: [], deny: [], ask: [] }
  }
}

function summarizeTool(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return name
  const o = input as Record<string, unknown>
  if (typeof o.path === 'string') return `${name} · ${o.path}`
  if (typeof o.command === 'string') {
    const c = String(o.command).replace(/\s+/g, ' ')
    return `${name} · ${c.length > 64 ? c.slice(0, 64) + '…' : c}`
  }
  if (typeof o.pattern === 'string') return `${name} · ${o.pattern}`
  if (typeof o.url === 'string') {
    try {
      return `${name} · ${new URL(String(o.url)).hostname}`
    } catch {
      return `${name} · ${o.url}`
    }
  }
  if (typeof o.skill === 'string') return `${name} · ${o.skill}`
  if (typeof o.spec === 'string') {
    const sn = typeof o.skillName === 'string' ? `/${o.skillName}` : ''
    return `${name} · ${o.spec}${sn}`
  }
  return name
}

function mark(step: ToolStep): string {
  if (step.phase === 'awaiting_permission') return '!'
  if (step.phase === 'running') return '…'
  if (step.ok === false) return '✗'
  return '✓'
}

/** Split tools: overflow merged, last ≤5 separate */
function splitTools(steps: ToolStep[]): { merged: ToolStep[]; separate: ToolStep[] } {
  if (steps.length <= MAX_SEPARATE_TOOLS) return { merged: [], separate: steps }
  const overflow = steps.length - MAX_SEPARATE_TOOLS
  return {
    merged: steps.slice(0, overflow),
    separate: steps.slice(overflow)
  }
}

function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/)
  return (
    <div className="md">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const first = lines[0] ?? ''
        if (first.startsWith('## ')) {
          return (
            <div key={i} className="md-section">
              <h3>{first.slice(3)}</h3>
              <ul>
                {lines.slice(1).filter(Boolean).map((l, j) => (
                  <li key={j}>{l.replace(/^[-*•]\s*/, '')}</li>
                ))}
              </ul>
            </div>
          )
        }
        if (lines.every((l) => /^[-*•]\s+/.test(l) || l.trim() === '')) {
          return (
            <ul key={i}>
              {lines.filter((l) => l.trim()).map((l, j) => (
                <li key={j}>{l.replace(/^[-*•]\s*/, '')}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function ToolDetails({ step }: { step: ToolStep }) {
  return (
    <details className={`op-item ${step.phase}`}>
      <summary>
        <span className="op-mark">{mark(step)}</span>
        <span className="op-title">{summarizeTool(step.name, step.input)}</span>
        {step.phase === 'running' && step.elapsedSec != null ? (
          <span className="think-hint"> · {step.elapsedSec}s</span>
        ) : null}
        {step.phase === 'awaiting_permission' ? (
          <span className="think-hint"> · 等待许可</span>
        ) : null}
      </summary>
      <div className="op-body">
        <div className="op-label">input</div>
        <pre>{JSON.stringify(step.input, null, 2)}</pre>
        {step.output != null && (
          <>
            <div className="op-label">output</div>
            <pre>{step.output}</pre>
          </>
        )}
      </div>
    </details>
  )
}

export function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [settings, setSettings] = useState<UiSettings | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [draft, setDraft] = useState('')
  const [attachmentChips, setAttachmentChips] = useState<AttachmentChip[]>([])
  /** G-06: editing the last completed turn (retry-last-turn). */
  const [retryingLastTurn, setRetryingLastTurn] = useState(false)
  const [items, setItems] = useState<TimelineItem[]>([])
  const [busy, setBusy] = useState(false)
  /** S07: mid-turn queued user prompts (CC message queue UI). */
  const [queuedMessages, setQueuedMessages] = useState<
    Array<{ id: string; text: string }>
  >([])
  const [status, setStatus] = useState('idle')
  const [pending, setPending] = useState<PendingPermission | null>(null)
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null)
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [sessionList, setSessionList] = useState<
    Array<{
      id: string
      updatedAt: string
      mode: string
      historyLength: number
      preview: string
    }>
  >([])
  const [sessionMode, setSessionMode] = useState<PermissionMode | null>(null)
  const [uiState, setUiState] = useState<SessionUiState>('idle')
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({})
  const [askNotes, setAskNotes] = useState<Record<string, string>>({})
  const [todos, setTodos] = useState<
    Array<{ content: string; status: string; activeForm: string }>
  >([])
  const [tasks, setTasks] = useState<
    Array<{
      id: string
      subject: string
      status: string
      owner?: string
      blockedBy: string[]
    }>
  >([])
  const [saveMsg, setSaveMsg] = useState('')
  const [tick, setTick] = useState(0)
  const [sandboxOnboarding, setSandboxOnboarding] = useState<SandboxOnboardingInfo | null>(
    null
  )
  const [sandboxOnboardBusy, setSandboxOnboardBusy] = useState(false)
  const [sandboxOnboardMsg, setSandboxOnboardMsg] = useState('')
  const [sandboxExited, setSandboxExited] = useState(false)
  const [sandboxChoice, setSandboxChoice] = useState<SandboxOnboardingOption['id'] | null>(
    null
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<UiSettings | null>(null)
  const lastToolIdRef = useRef<string | undefined>(undefined)
  const turnIdRef = useRef<string | null>(null)
  const thinkStartedRef = useRef<number>(0)

  useEffect(() => {
    ;(async () => {
      const s = await fetchSettings()
      setSettings(s)
      formRef.current = s
      const saved =
        typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_LS_KEY) || '' : ''
      const sess = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saved ? { sessionId: saved } : {})
      }).then((r) => r.json())
      setSessionId(sess.sessionId)
      try {
        localStorage.setItem(SESSION_LS_KEY, sess.sessionId)
      } catch {
        /* ignore */
      }
      if (sess.historyLength > 0) {
        const full = await fetch(`/api/session/${sess.sessionId}`).then((r) => r.json())
        setItems(historyToTimeline(full.history || []))
        setTodos(full.todos || [])
        setTasks(full.tasks || [])
        if (full.mode) setSessionMode(full.mode)
        setStatus(`restored · ${full.history?.length ?? 0} msgs`)
      }

      // Only auto-prompt if user already enabled sandbox but OS setup is incomplete.
      // Default product posture: sandbox off — no install nag on first launch.
      try {
        const sessionSkip =
          typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem(SANDBOX_ONBOARD_SESSION_KEY) === '1'
        if (!sessionSkip) {
          const onboard = (await fetch('/api/sandbox/onboarding').then((r) =>
            r.json()
          )) as SandboxOnboardingInfo
          if (onboard?.showPrompt) {
            setSandboxOnboarding(onboard)
            setSandboxChoice('continue')
          }
        }
      } catch {
        /* non-fatal */
      }
    })().catch((e) => setStatus(String(e)))
  }, [])

  const openSandboxOffer = async () => {
    setSandboxOnboardMsg('')
    try {
      const onboard = (await fetch('/api/sandbox/onboarding').then((r) =>
        r.json()
      )) as SandboxOnboardingInfo
      setSandboxOnboarding(onboard)
      setSandboxChoice('continue')
    } catch (e) {
      setSandboxOnboardMsg(String(e))
    }
  }

  const submitSandboxOnboarding = async (decision: SandboxOnboardingOption['id']) => {
    if (sandboxOnboardBusy) return
    setSandboxOnboardBusy(true)
    setSandboxOnboardMsg('')
    try {
      if (decision === 'continue') {
        try {
          sessionStorage.setItem(SANDBOX_ONBOARD_SESSION_KEY, '1')
        } catch {
          /* ignore */
        }
        await fetch('/api/sandbox/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'continue' })
        })
        setSandboxOnboarding(null)
        return
      }
      if (decision === 'exit') {
        await fetch('/api/sandbox/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'exit' })
        })
        setSandboxExited(true)
        setSandboxOnboarding(null)
        try {
          window.close()
        } catch {
          /* browsers often block */
        }
        return
      }
      const res = await fetch('/api/sandbox/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        stillNeedsSetup?: boolean
        onboarding?: SandboxOnboardingInfo
      }
      if (!res.ok || !data.ok) {
        setSandboxOnboardMsg(data.error || 'onboarding failed')
        if (data.onboarding?.showPrompt) setSandboxOnboarding(data.onboarding)
        return
      }
      if (decision === 'install' && data.stillNeedsSetup && data.onboarding) {
        setSandboxOnboarding(data.onboarding)
        setSandboxOnboardMsg(
          'Install finished but sandbox is still not ready. Check UAC / dependency errors below, or continue without.'
        )
        return
      }
      setSandboxOnboarding(null)
      if (decision === 'never') {
        try {
          sessionStorage.setItem(SANDBOX_ONBOARD_SESSION_KEY, '1')
        } catch {
          /* ignore */
        }
      }
      setStatus(decision === 'install' ? 'sandbox: installed & enabled' : 'sandbox: skipped')
    } catch (e) {
      setSandboxOnboardMsg(String(e))
    } finally {
      setSandboxOnboardBusy(false)
    }
  }

  useEffect(() => {
    if (!busy) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items, pending, pendingAsk, pendingPlan, busy, tick])

  const updateTurn = useCallback((patch: Partial<Extract<TimelineItem, { kind: 'turn' }>>) => {
    const tid = turnIdRef.current
    if (!tid) return
    setItems((prev) =>
      prev.map((it) => (it.kind === 'turn' && it.id === tid ? { ...it, ...patch } : it))
    )
  }, [])

  const patchStep = useCallback((toolId: string, patch: Partial<ToolStep>) => {
    const tid = turnIdRef.current
    if (!tid) return
    setItems((prev) =>
      prev.map((it) => {
        if (it.kind !== 'turn' || it.id !== tid) return it
        return {
          ...it,
          steps: it.steps.map((s) => (s.toolId === toolId ? { ...s, ...patch } : s))
        }
      })
    )
  }, [])

  const sendPermission = async (
    decision: 'allow' | 'deny' | 'allow_session' | 'allow_always'
  ) => {
    if (!pending || !sessionId) return
    const message = pending.feedback.trim() || undefined
    await fetch(`/api/session/${sessionId}/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: pending.requestId,
        decision,
        toolName: pending.toolName,
        input: pending.input,
        message
      })
    })
    if (pending.toolId) {
      patchStep(pending.toolId, {
        phase: decision === 'deny' ? 'done' : 'running',
        ok: decision === 'deny' ? false : undefined,
        output: decision === 'deny' ? message || 'User denied' : undefined
      })
    }
    setPending(null)
  }

  const submitAsk = async (cancelled = false) => {
    if (!pendingAsk || !sessionId) return
    if (cancelled) {
      await fetch(`/api/session/${sessionId}/ask-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: pendingAsk.requestId, cancelled: true })
      })
      setPendingAsk(null)
      setOtherTexts({})
      setAskNotes({})
      return
    }
    const answers: Record<string, string> = {}
    const annotations: Record<string, { notes?: string; preview?: string }> = {}
    for (const q of pendingAsk.questions) {
      const sel = [...(pendingAsk.selections[q.question] || [])]
      const other = (otherTexts[q.question] || '').trim()
      if (other) sel.push(`${ASK_USER_OTHER_LABEL}: ${other}`)
      answers[q.question] = sel.join(', ')
      const notes = (askNotes[q.question] || '').trim()
      const preview = q.options.find((o) => sel.includes(o.label))?.preview
      if (notes || preview) {
        annotations[q.question] = {
          ...(notes ? { notes } : {}),
          ...(preview ? { preview } : {})
        }
      }
    }
    await fetch(`/api/session/${sessionId}/ask-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: pendingAsk.requestId,
        answers,
        annotations: Object.keys(annotations).length ? annotations : undefined
      })
    })
    setPendingAsk(null)
    setOtherTexts({})
    setAskNotes({})
  }

  const submitPlan = async (
    decision: 'approve' | 'reject',
    rejectAction?: 'keep_planning' | 'exit_to_default',
    opts?: { mode?: PermissionMode; withFeedback?: boolean }
  ) => {
    if (!pendingPlan || !sessionId) return
    const editedPlan = pendingPlan.plan.trim()
    const planWasEdited =
      pendingPlan.kind === 'exit' && pendingPlan.initialPlan !== editedPlan
    const feedback = pendingPlan.rejectFeedback.trim()
    if (decision === 'reject' && rejectAction === 'keep_planning' && !feedback) {
      return
    }
    await fetch(`/api/session/${sessionId}/plan-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: pendingPlan.requestId,
        decision,
        mode:
          decision === 'approve'
            ? opts?.mode ?? pendingPlan.exitMode
            : undefined,
        plan: pendingPlan.kind === 'exit' ? editedPlan : undefined,
        planWasEdited: planWasEdited || undefined,
        message:
          decision === 'reject' || opts?.withFeedback
            ? feedback || undefined
            : undefined,
        rejectAction: decision === 'reject' ? rejectAction : undefined
      })
    })
    setPendingPlan(null)
  }

  const cycleMode = async () => {
    if (!sessionId || busy) return
    const res = await fetch(`/api/session/${sessionId}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle: true })
    })
    const data = (await res.json()) as { mode?: PermissionMode }
    if (data.mode) {
      setSessionMode(data.mode)
      setStatus(`mode · ${data.mode}`)
    }
  }

  const clearChat = async () => {
    if (!sessionId) return
    await fetch(`/api/session/${sessionId}/clear`, { method: 'POST' })
    setSessionMode(null)
    setTodos([])
    setTasks([])
    setItems([])
    setQueuedMessages([])
    setPending(null)
    setPendingAsk(null)
    setPendingPlan(null)
    setOtherTexts({})
    setAskNotes({})
    setUiState('idle')
    turnIdRef.current = null
    setStatus('cleared')
  }

  const abortRun = async () => {
    if (!sessionId) return
    const res = await fetch(`/api/session/${sessionId}/abort`, { method: 'POST' })
    const data = (await res.json()) as {
      abort_ack?: { cancelledPermissions: number; cancelledInteractions: number }
    }
    setPending(null)
    setPendingAsk(null)
    setPendingPlan(null)
    setBusy(false)
    setUiState('idle')
    updateTurn({ thinkingLive: false })
    // Queue kept server-side for next chat fold-in; clear local panel noise
    const ack = data.abort_ack
    setStatus(
      ack
        ? `aborted · perm ${ack.cancelledPermissions} · ix ${ack.cancelledInteractions}`
        : 'aborted'
    )
  }

  /** S06: rewind to latest turn checkpoint (CC fileHistoryRewind). */
  const rewindFiles = async () => {
    if (!sessionId || busy) return
    const res = await fetch(`/api/session/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    const data = (await res.json()) as {
      ok?: boolean
      messageId?: string
      filesChanged?: string[]
      dryRun?: boolean
      error?: string
      message?: string
    }
    if (!res.ok || data.ok === false) {
      setStatus(
        `rewind failed · ${data.error || data.message || `HTTP ${res.status}`}`
      )
      return
    }
    const n = data.filesChanged?.length ?? 0
    setStatus(
      n > 0
        ? `files rewound · ${n} file(s) · ${data.messageId ?? ''}`
        : `files rewound · no changes · ${data.messageId ?? ''}`
    )
  }

  const addAttachmentChip = () => {
    const path = window.prompt('附件路径（相对 cwd 或绝对路径）')?.trim()
    if (!path) return
    setAttachmentChips((prev) => {
      if (prev.some((c) => c.path === path)) return prev
      return [...prev, { path, kind: 'file' }]
    })
  }

  const lastUserItemIndex = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]!.kind === 'user') return i
    }
    return -1
  }, [items])

  const beginRetryLastTurn = () => {
    if (busy || lastUserItemIndex < 0) return
    const user = items[lastUserItemIndex]!
    if (user.kind !== 'user') return
    setDraft(user.text)
    setRetryingLastTurn(true)
    setItems(items.slice(0, lastUserItemIndex))
    setStatus('编辑最近一轮 — 发送将回退并重跑')
  }

  const sendChat = async () => {
    if (!sessionId || !draft.trim()) return
    const text = draft.trim()
    const chips = attachmentChips
    const isRetry = retryingLastTurn
    setDraft('')
    setAttachmentChips([])
    setRetryingLastTurn(false)

    // S07: while a turn is running, enqueue (do not open a second SSE / abort)
    if (busy) {
      const res = await fetch(`/api/session/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...chatRequestBody(text, chips), priority: 'next' })
      })
      const data = (await res.json()) as {
        ok?: boolean
        queued?: boolean
        id?: string
        text?: string
        queueLength?: number
        interrupted?: boolean
        error?: string
      }
      if (!res.ok || !data.queued || !data.id) {
        setStatus(`queue failed · ${data.error || `HTTP ${res.status}`}`)
        setDraft(text)
        return
      }
      setQueuedMessages((prev) => {
        if (prev.some((q) => q.id === data.id)) return prev
        return [...prev, { id: data.id!, text: data.text || text }]
      })
      setStatus(`queued · ${data.queueLength ?? 1} waiting`)
      return
    }

    const turnId = crypto.randomUUID()
    turnIdRef.current = turnId
    thinkStartedRef.current = Date.now()
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: 'user', text },
      {
        id: turnId,
        kind: 'turn',
        thinkingLive: true,
        thinkingSec: 0,
        understanding: '理解任务并规划下一步…',
        understandingLog: [],
        steps: []
      }
    ])
    setBusy(true)
    setStatus('thinking')
    setPending(null)

    const chatUrl = isRetry
      ? `/api/session/${sessionId}/retry-last-turn`
      : `/api/session/${sessionId}/chat`
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatRequestBody(text, chips))
    })

    if (!res.ok || !res.body) {
      updateTurn({ error: `HTTP ${res.status}`, thinkingLive: false })
      setBusy(false)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (ev: AgentEvent) => {
      if (ev.type === 'status') {
        setStatus(ev.message)
        return
      }
      if (ev.type === 'thinking') {
        const sec =
          ev.elapsedSec ??
          Math.max(1, Math.round((Date.now() - thinkStartedRef.current) / 1000))
        if (ev.phase === 'end') {
          updateTurn({ thinkingLive: false, thinkingSec: sec })
          return
        }
        setItems((prev) =>
          prev.map((it) => {
            if (it.kind !== 'turn' || it.id !== turnIdRef.current) return it
            const log = [...it.understandingLog]
            if (ev.text && log[log.length - 1] !== ev.text) log.push(ev.text)
            return {
              ...it,
              thinkingLive: true,
              thinkingSec: sec,
              understanding: ev.text || it.understanding,
              understandingLog: log.slice(-8)
            }
          })
        )
        return
      }
      if (ev.type === 'assistant_message') {
        updateTurn({ reply: ev.text, thinkingLive: false })
        return
      }
      if (ev.type === 'tool_start') {
        lastToolIdRef.current = ev.id
        const label = ev.agentId
          ? `${ev.name || 'tool'} · sub:${ev.agentId.slice(0, 6)}`
          : ev.name || 'tool'
        setItems((prev) =>
          prev.map((it) => {
            if (it.kind !== 'turn' || it.id !== turnIdRef.current) return it
            return {
              ...it,
              steps: [
                ...it.steps,
                {
                  id: crypto.randomUUID(),
                  toolId: ev.id,
                  name: label,
                  input: ev.input,
                  phase: 'running' as const
                }
              ]
            }
          })
        )
        return
      }
      if (ev.type === 'agent_started') {
        setStatus(`sub-agent · ${ev.subagentType} · ${ev.description}`)
        updateTurn({
          understanding: `子代理 ${ev.subagentType}: ${ev.description}`
        })
        return
      }
      if (ev.type === 'agent_progress') {
        setStatus(`sub-agent turn ${ev.turn}/${ev.maxTurns}`)
        if (ev.text) {
          updateTurn({ understanding: ev.text })
        }
        return
      }
      if (ev.type === 'agent_finished') {
        setStatus(
          ev.ok
            ? `sub-agent done · ${ev.turns} turns`
            : `sub-agent failed · ${ev.turns} turns`
        )
        return
      }
      if (ev.type === 'tool_progress') {
        patchStep(ev.id, { elapsedSec: ev.elapsedSec, phase: 'running' })
        if (ev.text) setStatus(ev.text)
        else setStatus(`tool · ${ev.name} · ${ev.elapsedSec}s`)
        return
      }
      if (ev.type === 'tool_result') {
        patchStep(ev.id, { ok: ev.ok, output: ev.output, phase: 'done' })
        return
      }
      if (ev.type === 'session_state') {
        setUiState(ev.state)
        if (ev.detail) setStatus(`${ev.state} · ${ev.detail}`)
        else setStatus(ev.state)
        return
      }
      if (ev.type === 'permission_request') {
        const toolId = ev.toolUseId || lastToolIdRef.current
        if (toolId) patchStep(toolId, { phase: 'awaiting_permission' })
        setPending({
          requestId: ev.requestId,
          toolName: ev.toolName,
          input: ev.input,
          reason: ev.reason,
          toolId,
          toolUseId: ev.toolUseId,
          feedback: ''
        })
        setStatus(`waiting permission · ${ev.toolName}`)
        return
      }
      if (ev.type === 'ask_user') {
        const selections: Record<string, string[]> = {}
        for (const q of ev.questions) selections[q.question] = []
        setPendingAsk({ requestId: ev.requestId, questions: ev.questions, selections })
        setOtherTexts({})
        setStatus('waiting for your answers…')
        return
      }
      if (ev.type === 'enter_plan_approval') {
        setPendingPlan({
          requestId: ev.requestId,
          plan: '',
          initialPlan: '',
          kind: 'enter',
          exitMode: 'default',
          rejectFeedback: ''
        })
        setStatus('waiting to enter plan mode…')
        return
      }
      if (ev.type === 'plan_approval') {
        setPendingPlan({
          requestId: ev.requestId,
          plan: ev.plan,
          initialPlan: ev.plan,
          planFilePath: ev.planFilePath,
          kind: 'exit',
          exitMode: 'default',
          rejectFeedback: ''
        })
        setStatus('waiting for plan approval…')
        return
      }
      if (ev.type === 'mode_changed') {
        setSessionMode(ev.mode)
        setStatus(`mode · ${ev.mode}`)
        return
      }
      if (ev.type === 'cwd_changed') {
        setStatus(
          ev.reason
            ? `cwd · ${ev.cwd} (${ev.reason})`
            : `cwd · ${ev.cwd}`
        )
        return
      }
      if (ev.type === 'cron_due') {
        setStatus(`cron due · ${ev.jobs.length} job(s)`)
        return
      }
      if (ev.type === 'w3_summary') {
        setStatus(`w3 · ${ev.summary.status} · ${ev.summary.task.slice(0, 40)}`)
        return
      }
      if (ev.type === 'todos_updated') {
        setTodos(ev.todos)
        return
      }
      if (ev.type === 'tasks_updated') {
        setTasks(ev.tasks)
        return
      }
      if (ev.type === 'mcp_elicitation') {
        setStatus(
          `MCP elicitation · ${ev.serverName}: ${ev.message.slice(0, 80)}`
        )
        return
      }
      if (ev.type === 'context_compacted') {
        const via = ev.summaryVia ? ` · ${ev.summaryVia}` : ''
        setStatus(
          ev.kind === 'full'
            ? `已压缩上下文 · ~${ev.beforeTokens}→${ev.afterTokens} tok${via}`
            : `已压缩工具输出 · ${ev.truncatedToolResults ?? 0} 条`
        )
        return
      }
      if (ev.type === 'abort_ack') {
        setStatus(
          `aborted · perm ${ev.cancelledPermissions} · ix ${ev.cancelledInteractions}`
        )
        setPending(null)
        setPendingAsk(null)
        setPendingPlan(null)
        setUiState('idle')
        return
      }
      if (ev.type === 'files_rewound') {
        const n = ev.filesChanged.length
        setStatus(
          ev.dryRun
            ? `rewind dry-run · ${n} file(s)`
            : n > 0
              ? `files rewound · ${n} file(s)`
              : 'files rewound · no changes'
        )
        return
      }
      if (ev.type === 'message_queued') {
        setQueuedMessages((prev) => {
          if (prev.some((q) => q.id === ev.id)) return prev
          return [...prev, { id: ev.id, text: ev.text }]
        })
        setStatus(
          ev.interrupted
            ? `interrupt · queued ${ev.queueLength}`
            : `queued · ${ev.queueLength} waiting`
        )
        return
      }
      if (ev.type === 'message_dequeued') {
        setQueuedMessages((prev) => prev.filter((q) => q.id !== ev.id))
        setItems((prev) => [
          ...prev,
          { id: ev.id, kind: 'user', text: ev.text }
        ])
        setStatus(
          ev.remaining > 0
            ? `dequeued · ${ev.remaining} still waiting`
            : 'dequeued · queue empty'
        )
        return
      }
      if (ev.type === 'queue_updated') {
        setQueuedMessages(ev.items.map((i) => ({ id: i.id, text: i.text })))
        return
      }
      if (ev.type === 'error') {
        updateTurn({ error: ev.message })
        return
      }
      if (ev.type === 'done') {
        updateTurn({
          thinkingLive: false,
          thinkingSec: Math.max(
            1,
            Math.round((Date.now() - thinkStartedRef.current) / 1000)
          )
        })
        setUiState('idle')
        setStatus(ev.ok ? 'done' : `done (${ev.error || 'error'})`)
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        try {
          handleEvent(JSON.parse(line.slice(6)) as AgentEvent)
        } catch {
          /* ignore */
        }
      }
    }

    setBusy(false)
  }

  const saveSettings = async () => {
    if (!formRef.current) return
    setSaveMsg('saving…')
    const body = { ...formRef.current }
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      setSaveMsg('save failed')
      return
    }
    const next = (await res.json()) as UiSettings
    setSettings(next)
    formRef.current = { ...next, apiKey: body.apiKey.includes('••••') ? body.apiKey : body.apiKey }
    setSaveMsg('saved')
  }

  const liveSec = busy
    ? Math.max(1, Math.round((Date.now() - thinkStartedRef.current) / 1000))
    : 0

  const headerPills = useMemo(() => {
    if (!settings) return null
    const liveMode = sessionMode || settings.permissionMode
    return (
      <div className="pills">
        <span className="pill">
          model <strong>{settings.model}</strong>
        </span>
        <span className="pill">
          effort <strong>{settings.effort}</strong>
        </span>
        <span className="pill">
          mode <strong>{liveMode}</strong>
        </span>
        <span className="pill">
          ui <strong>{uiState}</strong>
        </span>
      </div>
    )
  }, [settings, sessionMode, uiState])

  if (sandboxExited) {
    return (
      <div className="main boot onboard-exit">
        <h1>AckemCode</h1>
        <p>已退出。关闭此标签页即可；需要时再重新打开 AckemCode。</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          重新打开
        </button>
      </div>
    )
  }

  if (!settings) {
    return <div className="main boot">Loading AckemCode…</div>
  }

  return (
    <div className="app">
      {sandboxOnboarding ? (
        <div className="onboard-overlay" role="dialog" aria-modal="true">
          <div className="onboard-card">
            <div className="onboard-rule" />
            <h2 className="onboard-title">{sandboxOnboarding.title}</h2>
            <p className="onboard-body">{sandboxOnboarding.body}</p>
            {sandboxOnboarding.dependencyErrors.length ? (
              <pre className="onboard-errors">
                {sandboxOnboarding.dependencyErrors.join('\n')}
              </pre>
            ) : null}
            {sandboxOnboarding.installHint ? (
              <p className="hint">{sandboxOnboarding.installHint}</p>
            ) : null}
            <div className="onboard-choices" role="listbox">
              {sandboxOnboarding.options.map((opt, i) => {
                const selected = (sandboxChoice || sandboxOnboarding.options[0]?.id) === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`onboard-choice${selected ? ' selected' : ''}`}
                    disabled={sandboxOnboardBusy}
                    onClick={() => setSandboxChoice(opt.id)}
                  >
                    <span className="onboard-choice-index">
                      {selected ? '>' : ' '} {i + 1}.
                    </span>
                    <span>
                      <strong>{opt.label}</strong>
                      {opt.description ? (
                        <span className="hint" style={{ display: 'block' }}>
                          {opt.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
            {sandboxOnboardMsg ? <p className="hint">{sandboxOnboardMsg}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                disabled={sandboxOnboardBusy}
                onClick={() => void submitSandboxOnboarding('continue')}
              >
                保持不装
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={sandboxOnboardBusy}
                onClick={() => void submitSandboxOnboarding('exit')}
              >
                退出
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={sandboxOnboardBusy || !sandboxChoice}
                onClick={() =>
                  void submitSandboxOnboarding(sandboxChoice || 'continue')
                }
              >
                {sandboxOnboardBusy ? '处理中…' : '确认选择'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <aside className="sidebar">
        <div className="brand">
          <h1>AckemCode</h1>
        </div>
        <nav className="nav">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
            工作台
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            设置 · API / Model / Effort
          </button>
        </nav>
        <div className="side-meta">
          <div>status: {status}</div>
          <div>ui: {uiState}</div>
          <div>cwd: {settings.cwd || '(unset)'}</div>
          <div>key: {settings.hasApiKey ? 'configured' : 'missing'}</div>
          <div>
            session mode: {sessionMode || settings.permissionMode}
            <button
              type="button"
              className="btn"
              style={{ fontSize: 11, padding: '2px 6px', marginLeft: 6 }}
              disabled={!sessionId || busy}
              title={`Cycle → ${getNextPermissionMode(sessionMode || settings.permissionMode)} (CC Shift+Tab)`}
              onClick={() => void cycleMode()}
            >
              切换模式
            </button>
          </div>
          <div className="hint-inline">session: {sessionId.slice(0, 10)}…</div>
        </div>
        <div className="todo-side">
          <div className="todo-side-title">
            Sessions{' '}
            <button
              type="button"
              className="btn"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => {
                void fetch('/api/sessions')
                  .then((r) => r.json())
                  .then((d) => setSessionList(d.sessions || []))
              }}
            >
              刷新
            </button>
          </div>
          {sessionList.length === 0 ? (
            <p className="hint">点刷新列出落盘会话</p>
          ) : (
            <ul className="todo-side-list">
              {sessionList.slice(0, 12).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 11, width: '100%', textAlign: 'left' }}
                    disabled={busy}
                    onClick={() => {
                      localStorage.setItem('ackemcode.sessionId', s.id)
                      window.location.reload()
                    }}
                  >
                    {s.id.slice(0, 8)} · {s.historyLength} msgs
                    {s.preview ? ` · ${s.preview}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="todo-side">
          <div className="todo-side-title">Todos</div>
          {todos.length === 0 ? (
            <p className="hint">短清单用 todo_write（全完成会清空）</p>
          ) : (
            <ul className="todo-side-list">
              {todos.map((t, i) => (
                <li key={`${i}-${t.content}`} className={`todo-${t.status}`}>
                  <span className="todo-mark">
                    {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '…' : '○'}
                  </span>
                  <span>
                    {t.content}
                    {t.status === 'in_progress' ? (
                      <span className="hint-inline"> · {t.activeForm}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="todo-side">
          <div className="todo-side-title">Tasks</div>
          {tasks.length === 0 ? (
            <p className="hint">长期任务用 task_create（全完成不清空）</p>
          ) : (
            <ul className="todo-side-list">
              {tasks.map((t) => (
                <li key={t.id} className={`todo-${t.status}`}>
                  <span className="todo-mark">
                    {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '…' : '○'}
                  </span>
                  <span>
                    #{t.id} {t.subject}
                    {t.blockedBy.length ? (
                      <span className="hint-inline"> · blockedBy {t.blockedBy.join(',')}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          {headerPills}
          <div className="topbar-actions">
            <button
              className="btn"
              onClick={() => void rewindFiles()}
              disabled={busy || !sessionId}
              title="Restore files to the latest turn checkpoint (S06)"
            >
              撤销上次编辑
            </button>
            <button className="btn" onClick={() => void clearChat()} disabled={busy}>
              清空会话
            </button>
            <button className="btn danger" onClick={() => void abortRun()} disabled={!busy && !pending}>
              中止
            </button>
          </div>
        </div>

        {tab === 'chat' ? (
          <div className="panel">
            <div className="chat-log">
              {items.length === 0 && (
                <div className="bubble status">
                  下任务后会显示 Thinking、可折叠操作（最多 5 条分开，超出合并），以及结构化最终回复。
                </div>
              )}

              {items.map((item, itemIndex) => {
                if (item.kind === 'user') {
                  const isLastUser =
                    !busy && itemIndex === lastUserItemIndex && lastUserItemIndex >= 0
                  return (
                    <div className="user-line" key={item.id}>
                      <span className="prompt">&gt;</span> {item.text}
                      {isLastUser ? (
                        <button
                          type="button"
                          className="btn user-edit-btn"
                          title="编辑并重跑此轮 (G-06)"
                          onClick={beginRetryLastTurn}
                        >
                          编辑
                        </button>
                      ) : null}
                    </div>
                  )
                }

                const sec = item.thinkingLive ? liveSec || item.thinkingSec : item.thinkingSec
                const { merged, separate } = splitTools(item.steps)
                const stepById = new Map(item.steps.map((s) => [s.id, s]))
                const grouped = groupToolSteps(
                  item.steps.map((s) => ({
                    id: s.id,
                    name: s.name,
                    path: pathFromToolInput(s.name, s.input),
                    input: s.input
                  }))
                )
                const activity = item.thinkingLive
                  ? item.steps.some((s) => s.phase === 'running' || s.phase === 'awaiting_permission')
                    ? 'working'
                    : 'thinking'
                  : 'done'

                return (
                  <div className="turn" key={item.id}>
                    <details className={`think ${item.thinkingLive ? 'live' : ''}`} open={item.thinkingLive}>
                      <summary>
                        {item.thinkingLive ? (
                          <>
                            <span className={`think-spin ${activity}`} />
                            Thinking for {sec}s…
                            <span className="think-hint">点击展开理解</span>
                          </>
                        ) : (
                          <>
                            Thought for {sec}s
                            <span className="think-hint">点击展开</span>
                          </>
                        )}
                      </summary>
                      <div className="think-body">
                        <div className="think-now">{item.understanding}</div>
                        {item.understandingLog.length > 1 && (
                          <ul className="think-log">
                            {item.understandingLog.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </details>

                    {(merged.length > 0 || separate.length > 0) && (
                      <div className="ops">
                        {merged.length > 0 && (
                          <details className="op-merged">
                            <summary>
                              ▸ 更早的操作 · {merged.length} 步（已合并）
                            </summary>
                            <div className="op-merged-list">
                              {merged.map((s) => (
                                <ToolDetails key={s.id} step={s} />
                              ))}
                            </div>
                          </details>
                        )}
                        {grouped.map((g, gi) =>
                          g.kind === 'collapsed' ? (
                            <details key={`g-${gi}`} className="op-collapsed">
                              <summary>
                                <span className="op-mark">✓</span>
                                <span className="op-title">· {g.label}</span>
                              </summary>
                              <div className="op-collapsed-list">
                                {g.steps.map((s, si) => {
                                  const step = s.id ? stepById.get(s.id) : separate[si]
                                  if (!step) return null
                                  return <ToolDetails key={step.id} step={step} />
                                })}
                              </div>
                            </details>
                          ) : (
                            (() => {
                              const step =
                                g.step.id != null
                                  ? stepById.get(g.step.id)
                                  : undefined
                              return step ? (
                                <ToolDetails key={step.id} step={step} />
                              ) : null
                            })()
                          )
                        )}
                      </div>
                    )}

                    {item.reply && (
                      <div className="final-reply">
                        <SimpleMarkdown text={item.reply} />
                      </div>
                    )}

                    {item.error && <div className="bubble error">{item.error}</div>}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {pendingAsk && (
              <div className="perm-dock">
                <div className="perm-dock-title">需要你的选择</div>
                {pendingAsk.questions.map((q) => (
                  <div key={q.question} className="ask-block">
                    <div className="perm-dock-reason">
                      {q.header ? <strong>{q.header} · </strong> : null}
                      {q.question}
                    </div>
                    <div className="ask-options">
                      {q.options.map((opt) => {
                        const selected = (pendingAsk.selections[q.question] || []).includes(opt.label)
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            className={`btn ${selected ? 'primary' : ''}`}
                            onClick={() => {
                              setPendingAsk((prev) => {
                                if (!prev) return prev
                                const cur = prev.selections[q.question] || []
                                let next: string[]
                                if (q.multiSelect) {
                                  next = selected
                                    ? cur.filter((x) => x !== opt.label)
                                    : [...cur, opt.label]
                                } else {
                                  next = [opt.label]
                                }
                                return {
                                  ...prev,
                                  selections: { ...prev.selections, [q.question]: next }
                                }
                              })
                            }}
                          >
                            {opt.label}
                            {opt.description ? ` — ${opt.description}` : ''}
                          </button>
                        )
                      })}
                    </div>
                    {q.options
                      .filter((opt) => (pendingAsk.selections[q.question] || []).includes(opt.label) && opt.preview)
                      .map((opt) => (
                        <pre key={`${opt.label}-preview`} className="hint" style={{ whiteSpace: 'pre-wrap' }}>
                          {opt.preview}
                        </pre>
                      ))}
                    <label className="hint" style={{ display: 'block', marginTop: 8 }}>
                      Other（自由填写，CC 自动提供）
                      <input
                        type="text"
                        style={{ width: '100%', marginTop: 4 }}
                        value={otherTexts[q.question] || ''}
                        onChange={(e) =>
                          setOtherTexts((prev) => ({ ...prev, [q.question]: e.target.value }))
                        }
                        placeholder="可选：自定义回答"
                      />
                    </label>
                    <label className="hint" style={{ display: 'block', marginTop: 8 }}>
                      备注（可选）
                      <input
                        type="text"
                        style={{ width: '100%', marginTop: 4 }}
                        value={askNotes[q.question] || ''}
                        onChange={(e) =>
                          setAskNotes((prev) => ({ ...prev, [q.question]: e.target.value }))
                        }
                        placeholder="补充给模型的说明"
                      />
                    </label>
                  </div>
                ))}
                <div className="modal-actions">
                  <button className="btn danger" onClick={() => void submitAsk(true)}>
                    取消
                  </button>
                  <button className="btn primary" onClick={() => void submitAsk(false)}>
                    提交回答
                  </button>
                </div>
              </div>
            )}

            {pendingPlan && (
              <div className="perm-dock">
                <div className="perm-dock-title">
                  {pendingPlan.kind === 'enter'
                    ? '进入 Plan Mode？'
                    : '计划批准 · Plan Mode'}
                </div>
                {pendingPlan.kind === 'enter' ? (
                  <p className="hint">
                    进入后写/执行工具将被拦截，直到你批准退出计划。
                  </p>
                ) : (
                  <>
                    {pendingPlan.planFilePath && (
                      <p className="hint">Plan file: {pendingPlan.planFilePath}</p>
                    )}
                    <textarea
                      className="plan-pre"
                      rows={14}
                      style={{ width: '100%', fontFamily: 'inherit' }}
                      value={pendingPlan.plan}
                      onChange={(e) =>
                        setPendingPlan((prev) =>
                          prev ? { ...prev, plan: e.target.value } : prev
                        )
                      }
                    />
                    <label className="hint" style={{ display: 'block', marginTop: 8 }}>
                      不批准时告诉模型改什么 / Shift+Tab 批准时附带这段话
                      <textarea
                        rows={2}
                        style={{ width: '100%', marginTop: 4 }}
                        value={pendingPlan.rejectFeedback}
                        onChange={(e) =>
                          setPendingPlan((prev) =>
                            prev ? { ...prev, rejectFeedback: e.target.value } : prev
                          )
                        }
                        placeholder="例如：缺了错误处理步骤… 或 先做最小可跑版本"
                      />
                    </label>
                    <div className="ask-options" style={{ marginTop: 8 }}>
                      {buildPlanExitOptions({ autoAvailable: true }).map((row) => {
                        if (row.kind === 'input') {
                          return (
                            <button
                              key={row.id}
                              type="button"
                              className="btn"
                              onClick={() => void submitPlan('reject', 'keep_planning')}
                            >
                              {row.labelZh}
                            </button>
                          )
                        }
                        return (
                          <button
                            key={row.id}
                            type="button"
                            className="btn primary"
                            onClick={() =>
                              void submitPlan('approve', undefined, { mode: row.mode })
                            }
                          >
                            {row.labelZh}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          void submitPlan('approve', undefined, {
                            mode: 'acceptEdits',
                            withFeedback: true
                          })
                        }
                      >
                        带着上面的批注批准（Shift+Tab）
                      </button>
                    </div>
                  </>
                )}
                <div className="modal-actions">
                  {pendingPlan.kind === 'enter' ? (
                    <>
                      <button
                        className="btn"
                        onClick={() => void submitPlan('reject', 'keep_planning')}
                      >
                        取消
                      </button>
                      <button className="btn primary" onClick={() => void submitPlan('approve')}>
                        进入 Plan Mode
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn danger"
                      onClick={() => void submitPlan('reject', 'exit_to_default')}
                    >
                      拒绝并退出 plan
                    </button>
                  )}
                </div>
              </div>
            )}

            {pending && (
              <div className="perm-dock">
                <div className="perm-dock-title">权限请求 · {pending.toolName}</div>
                <div className="perm-dock-reason">
                  {summarizePermissionOperation(pending.toolName, pending.input).zh}
                </div>
                <div className="perm-dock-reason">
                  {explainPermissionAsk(pending.reason, pending.toolName).zh}
                </div>
                {pending.toolUseId ? (
                  <div className="hint">toolUseId: {pending.toolUseId}</div>
                ) : null}
                <pre>{JSON.stringify(pending.input, null, 2)}</pre>
                <label className="hint" style={{ display: 'block', marginTop: 8 }}>
                  反馈（拒绝时注入 tool_result）
                  <input
                    type="text"
                    style={{ width: '100%', marginTop: 4 }}
                    value={pending.feedback}
                    onChange={(e) =>
                      setPending((prev) =>
                        prev ? { ...prev, feedback: e.target.value } : prev
                      )
                    }
                    placeholder="可选：说明拒绝原因"
                  />
                </label>
                <div className="modal-actions">
                  <button className="btn danger" onClick={() => void sendPermission('deny')}>
                    拒绝
                  </button>
                  <button className="btn" onClick={() => void sendPermission('allow')}>
                    仅允许本次
                  </button>
                  <button className="btn primary" onClick={() => void sendPermission('allow_session')}>
                    允许本类型（同类不再问）
                  </button>
                  <button className="btn" onClick={() => void sendPermission('allow_always')}>
                    允许本窗口（删除仍问）
                  </button>
                </div>
              </div>
            )}

            {queuedMessages.length > 0 ? (
              <div className="queue-panel" aria-label="queued messages">
                <div className="queue-panel-title">
                  排队中 · {queuedMessages.length}
                </div>
                <ul className="queue-list">
                  {queuedMessages.map((q) => (
                    <li key={q.id} className="queue-item">
                      <span className="queue-mark">⋯</span>
                      <span>{q.text}</span>
                      <button
                        type="button"
                        className="btn queue-remove"
                        title="Remove from queue"
                        onClick={() => {
                          if (!sessionId) return
                          void fetch(
                            `/api/session/${sessionId}/queue/${q.id}`,
                            { method: 'DELETE' }
                          ).then((r) => {
                            if (r.ok) {
                              setQueuedMessages((prev) =>
                                prev.filter((x) => x.id !== q.id)
                              )
                            }
                          })
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="composer">
              {attachmentChips.length > 0 ? (
                <div className="attachment-chips" aria-label="attachments">
                  {attachmentChips.map((c) => (
                    <span key={c.path} className="attachment-chip">
                      <span className="attachment-chip-label">{c.path}</span>
                      <button
                        type="button"
                        className="attachment-chip-remove"
                        title="Remove attachment"
                        onClick={() =>
                          setAttachmentChips((prev) =>
                            prev.filter((x) => x.path !== c.path)
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <textarea
                value={draft}
                placeholder={
                  busy ? '运行中也可插话（将排队，下一工具批前注入）…' : '描述任务…'
                }
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void sendChat()
                  }
                }}
              />
              <div className="composer-actions">
                <span className="hint-inline">
                  {busy
                    ? `运行中 · Thinking ${liveSec}s · 发送=排队 · 中止可停`
                    : 'Ctrl/⌘ + Enter 发送'}
                </span>
                <button
                  type="button"
                  className="btn"
                  title="Attach file path (G-05 chip)"
                  onClick={addAttachmentChip}
                >
                  + 附件
                </button>
                {busy ? (
                  <button
                    className="btn danger"
                    disabled={!draft.trim()}
                    title="priority=now — abort current turn and run this next (CC interrupt)"
                    onClick={() => {
                      const text = draft.trim()
                      const chips = attachmentChips
                      if (!sessionId || !text) return
                      setDraft('')
                      setAttachmentChips([])
                      void fetch(`/api/session/${sessionId}/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...chatRequestBody(text, chips),
                          priority: 'now'
                        })
                      })
                        .then((r) => r.json())
                        .then((data: { id?: string; text?: string; interrupted?: boolean; queueLength?: number; error?: string }) => {
                          if (!data.id) {
                            setStatus(`interrupt failed · ${data.error || 'unknown'}`)
                            setDraft(text)
                            return
                          }
                          setQueuedMessages((prev) => {
                            if (prev.some((q) => q.id === data.id)) return prev
                            return [...prev, { id: data.id!, text: data.text || text }]
                          })
                          setStatus(
                            data.interrupted
                              ? `interrupt · ${data.queueLength ?? 1} queued`
                              : `queued now · ${data.queueLength ?? 1}`
                          )
                        })
                    }}
                  >
                    插队打断
                  </button>
                ) : null}
                <button
                  className="btn primary"
                  disabled={!draft.trim()}
                  onClick={() => void sendChat()}
                >
                  {busy ? '排队' : '发送'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="settings">
            <h2>模型与连接</h2>
            <p className="hint">兼容 OpenAI Chat Completions。Key 存本机 data/settings.json。</p>
            <SettingsForm initial={settings} onChange={(s) => { formRef.current = s }} />
            <div className="composer-actions settings-actions">
              <button className="btn primary" onClick={() => void saveSettings()}>
                保存设置
              </button>
              <span className="hint-inline">{saveMsg}</span>
            </div>
            <SkillsPanel cwd={settings.cwd} />
            <SandboxPanel onOfferInstall={() => void openSandboxOffer()} />
            <McpPanel />
          </div>
        )}
      </main>
    </div>
  )
}

function SandboxPanel(props: { onOfferInstall: () => void }) {
  const [status, setStatus] = useState<{
    enabledInSettings?: boolean
    active?: boolean
    supported?: boolean
    unavailableReason?: string
    dependencies?: { errors?: string[]; warnings?: string[] }
  } | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const data = await fetch('/api/sandbox/status').then((r) => r.json())
    setStatus(data)
  }

  useEffect(() => {
    void refresh().catch((e) => setMsg(String(e)))
  }, [])

  const setEnabled = async (enabled: boolean) => {
    setBusy(true)
    setMsg(enabled ? 'enabling…' : 'disabling…')
    try {
      const cur = await fetch('/api/settings').then((r) => r.json())
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox: {
            ...(cur.sandbox || {}),
            enabled,
            skipInstallPrompt: enabled ? false : cur.sandbox?.skipInstallPrompt
          }
        })
      })
      if (!res.ok) throw new Error('save failed')
      await refresh()
      setMsg(enabled ? '已启用（若本机未装组件，请点下方安装）' : '已关闭（默认）')
      if (enabled) props.onOfferInstall()
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="skills-panel" style={{ marginTop: 24 }}>
      <h3>OS 沙箱（可选）</h3>
      <p className="hint">
        默认不装、不启用。不装也能正常使用 AckemCode；需要更强 shell
        隔离时再手动安装（Windows 会有一次 UAC）。
      </p>
      <div className="hint" style={{ marginBottom: 8 }}>
        状态:{' '}
        {status
          ? `enabled=${Boolean(status.enabledInSettings)} · active=${Boolean(status.active)} · supported=${Boolean(status.supported)}`
          : '…'}
      </div>
      {status?.dependencies?.errors?.length ? (
        <pre className="onboard-errors">{status.dependencies.errors.join('\n')}</pre>
      ) : null}
      {status?.unavailableReason ? (
        <p className="hint">{status.unavailableReason}</p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || Boolean(status?.enabledInSettings)}
          onClick={() => void setEnabled(true)}
        >
          启用（仍可稍后装）
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => props.onOfferInstall()}
        >
          选择是否安装…
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !status?.enabledInSettings}
          onClick={() => void setEnabled(false)}
        >
          关闭沙箱
        </button>
      </div>
      {msg ? <span className="hint">{msg}</span> : null}
    </div>
  )
}

function McpPanel() {
  const [servers, setServers] = useState<
    Array<{
      name: string
      transport: string
      state: string
      error?: string
      toolCount: number
      resourceCount: number
      authUrl?: string
    }>
  >([])
  const [tools, setTools] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const [elicit, setElicit] = useState<
    Array<{
      id: string
      serverName: string
      message: string
      mode: string
      url?: string
    }>
  >([])

  const refresh = async () => {
    const data = await fetch('/api/mcp/status').then((r) => r.json())
    setServers(data.servers || [])
    setTools(data.tools || [])
    setElicit(data.elicitationPending || [])
  }

  useEffect(() => {
    void refresh().catch((e) => setMsg(String(e)))
    const id = window.setInterval(() => {
      void fetch('/api/mcp/elicitation/pending')
        .then((r) => r.json())
        .then((d) => setElicit(d.pending || []))
        .catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const reconnect = async () => {
    setMsg('reconnect…')
    const data = await fetch('/api/mcp/reconnect', { method: 'POST' }).then((r) => r.json())
    setServers(data.servers || [])
    setTools(data.tools || [])
    setMsg(data.ok ? 'synced' : data.error || 'failed')
  }

  const authorize = async (name: string) => {
    setMsg(`oauth ${name}…`)
    const data = await fetch(`/api/mcp/${encodeURIComponent(name)}/auth/start`, {
      method: 'POST'
    }).then((r) => r.json())
    if (data.authUrl) {
      window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      setMsg('Opened auth URL — complete login, then Refresh')
    } else {
      setMsg(data.message || 'auth failed')
    }
    await refresh()
  }

  const respondElicit = async (id: string, action: 'accept' | 'decline' | 'cancel') => {
    await fetch(`/api/mcp/elicitation/${encodeURIComponent(id)}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, content: action === 'accept' ? {} : undefined })
    })
    await refresh()
  }

  return (
    <div className="skills-panel" style={{ marginTop: 24 }}>
      <h3>MCP servers</h3>
      <p className="hint">
        stdio / http / sse。远程需登录时点 Authorize（OAuth）。工具名 mcp__server__tool。
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Refresh
        </button>
        <button type="button" className="btn primary" onClick={() => void reconnect()}>
          Reconnect
        </button>
        {msg ? <span className="hint">{msg}</span> : null}
      </div>
      {elicit.length > 0 ? (
        <div className="hint" style={{ marginBottom: 12, border: '1px solid #ccc', padding: 8 }}>
          <strong>MCP elicitation</strong>
          {elicit.map((e) => (
            <div key={e.id} style={{ marginTop: 8 }}>
              <div>
                [{e.serverName}] {e.message}
              </div>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer">
                  Open URL
                </a>
              ) : null}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button type="button" className="btn primary" onClick={() => void respondElicit(e.id, 'accept')}>
                  Accept
                </button>
                <button type="button" className="btn" onClick={() => void respondElicit(e.id, 'decline')}>
                  Decline
                </button>
                <button type="button" className="btn" onClick={() => void respondElicit(e.id, 'cancel')}>
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!servers.length ? (
        <p className="hint">未配置或未连接。</p>
      ) : (
        <ul className="skill-list">
          {servers.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> · {s.transport} · {s.state}
              {` · tools ${s.toolCount} · resources ${s.resourceCount}`}
              {s.error ? <div className="hint">error: {s.error}</div> : null}
              {s.state === 'needs_auth' || s.authUrl ? (
                <div style={{ marginTop: 4 }}>
                  <button type="button" className="btn primary" onClick={() => void authorize(s.name)}>
                    Authorize
                  </button>
                  {s.authUrl ? (
                    <div className="hint" style={{ wordBreak: 'break-all' }}>
                      {s.authUrl}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {s.state === 'connected' || s.state === 'error' ? (
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 4 }}
                  onClick={() =>
                    void fetch(`/api/mcp/${encodeURIComponent(s.name)}/reconnect`, {
                      method: 'POST'
                    }).then(() => refresh())
                  }
                >
                  Reconnect server
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {tools.length ? (
        <p className="hint" style={{ marginTop: 8 }}>
          tools: {tools.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function SettingsForm({
  initial,
  onChange
}: {
  initial: UiSettings
  onChange: (s: UiSettings) => void
}) {
  const [form, setForm] = useState<UiSettings>({
    ...initial,
    apiKey: initial.hasApiKey ? initial.apiKey : '',
    useClaudeSkills: initial.useClaudeSkills ?? false,
    extraSkillDirs: initial.extraSkillDirs ?? [],
    mcpServers: initial.mcpServers ?? {},
    permissionRules: initial.permissionRules ?? { allow: [], deny: [], ask: [] },
    autoMode: initial.autoMode ?? { allow: [], softDeny: [], environment: [] },
    webSearch: {
      provider: initial.webSearch?.provider ?? 'auto',
      apiKey: initial.webSearch?.apiKey ?? '',
      customUrl: initial.webSearch?.customUrl ?? '',
      maxResults: initial.webSearch?.maxResults ?? 8
    }
  })
  const [mcpJson, setMcpJson] = useState(
    JSON.stringify(initial.mcpServers ?? {}, null, 2)
  )
  const [mcpErr, setMcpErr] = useState('')
  const linesOf = (arr: string[]) => (arr ?? []).join('\n')
  const parseLines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

  useEffect(() => {
    onChange(form)
  }, [form, onChange])

  const set = <K extends keyof UiSettings>(key: K, value: UiSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const applyMcpJson = (text: string) => {
    setMcpJson(text)
    try {
      const parsed = JSON.parse(text || '{}') as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setMcpErr('mcpServers must be a JSON object')
        return
      }
      setMcpErr('')
      set('mcpServers', parsed)
    } catch (e) {
      setMcpErr(e instanceof Error ? e.message : 'invalid JSON')
    }
  }

  return (
    <>
      <div className="field">
        <label>API Base URL</label>
        <input value={form.apiBaseUrl} onChange={(e) => set('apiBaseUrl', e.target.value)} />
      </div>
      <div className="field">
        <label>API Key</label>
        <input
          type="password"
          value={form.apiKey}
          onChange={(e) => set('apiKey', e.target.value)}
          placeholder={initial.hasApiKey ? '已保存（可改写）' : 'sk-...'}
        />
      </div>
      <div className="field">
        <label>Model</label>
        <input value={form.model} onChange={(e) => set('model', e.target.value)} />
      </div>
      <div className="field">
        <label>Web search 引擎</label>
        <select
          value={form.webSearch?.provider ?? 'auto'}
          onChange={(e) =>
            set('webSearch', {
              ...(form.webSearch ?? {}),
              provider: e.target.value as NonNullable<UiSettings['webSearch']>['provider']
            })
          }
        >
          <option value="auto">auto（有 key 就用：Tavily → SerpAPI → Brave）</option>
          <option value="tavily">Tavily（Agent 检索，推荐）</option>
          <option value="serpapi">SerpAPI（Google 结果）</option>
          <option value="brave">Brave Search</option>
          <option value="custom">custom URL</option>
          <option value="mock">mock（离线测试）</option>
        </select>
      </div>
      <div className="field">
        <label>Web search API Key</label>
        <input
          type="password"
          value={form.webSearch?.apiKey ?? ''}
          onChange={(e) =>
            set('webSearch', { ...(form.webSearch ?? {}), apiKey: e.target.value })
          }
          placeholder="Tavily: tvly-… 或 SerpAPI key"
        />
        <p className="hint">
          本机 LLM（DeepSeek 等）没有托管搜索。Tavily 每月有免费额度：
          <a href="https://app.tavily.com" target="_blank" rel="noreferrer">
            app.tavily.com
          </a>
          。也可设环境变量 <code>TAVILY_API_KEY</code> / <code>SERPAPI_API_KEY</code>。
        </p>
      </div>
      {(form.webSearch?.provider ?? 'auto') === 'custom' ? (
        <div className="field">
          <label>Web search custom URL</label>
          <input
            value={form.webSearch?.customUrl ?? ''}
            onChange={(e) =>
              set('webSearch', {
                ...(form.webSearch ?? {}),
                customUrl: e.target.value
              })
            }
            placeholder="https://host/search?q={query}"
          />
        </div>
      ) : null}
      <div className="field">
        <label>Effort</label>
        <select value={form.effort} onChange={(e) => set('effort', e.target.value as EffortLevel)}>
          {EFFORTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Permission mode</label>
        <select
          value={form.permissionMode}
          onChange={(e) => set('permissionMode', e.target.value as PermissionMode)}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p className="hint">
          <code>auto</code>：灰区工具走侧路 LLM 分类器（S13 规则之上；失败则询问，不静默放行）。
          可用 <code>ACKEM_AUTO_MODE_CLASSIFIER=0</code> 关闭 LLM。
        </p>
      </div>
      <div className="field">
        <label>Auto-mode · allow 提示（每行一条）</label>
        <textarea
          rows={3}
          value={linesOf(form.autoMode?.allow ?? [])}
          onChange={(e) =>
            set('autoMode', {
              ...(form.autoMode ?? {}),
              allow: parseLines(e.target.value)
            })
          }
          placeholder="例如：本仓库允许 npm test / git commit"
        />
      </div>
      <div className="field">
        <label>Auto-mode · soft-deny 提示</label>
        <textarea
          rows={2}
          value={linesOf(form.autoMode?.softDeny ?? [])}
          onChange={(e) =>
            set('autoMode', {
              ...(form.autoMode ?? {}),
              softDeny: parseLines(e.target.value)
            })
          }
          placeholder="例如：禁止推送到 main；禁止改生产密钥"
        />
      </div>
      <div className="field">
        <label>Auto-mode · environment 说明</label>
        <textarea
          rows={2}
          value={linesOf(form.autoMode?.environment ?? [])}
          onChange={(e) =>
            set('autoMode', {
              ...(form.autoMode ?? {}),
              environment: parseLines(e.target.value)
            })
          }
          placeholder="例如：本地 Node monorepo；无生产凭证"
        />
      </div>
      <div className="field">
        <label>永久允许规则（每行一条：tool 或 tool(content)，如 bash(git status)、Bash(git:*)）</label>
        <textarea
          rows={4}
          value={linesOf(form.permissionRules?.allow ?? [])}
          onChange={(e) =>
            set('permissionRules', {
              ...(form.permissionRules ?? { allow: [], deny: [], ask: [] }),
              allow: parseLines(e.target.value)
            })
          }
        />
      </div>
      <div className="field">
        <label>永久拒绝规则</label>
        <textarea
          rows={3}
          value={linesOf(form.permissionRules?.deny ?? [])}
          onChange={(e) =>
            set('permissionRules', {
              ...(form.permissionRules ?? { allow: [], deny: [], ask: [] }),
              deny: parseLines(e.target.value)
            })
          }
        />
      </div>
      <div className="field">
        <label>强制询问规则（匹配时必须弹窗）</label>
        <textarea
          rows={3}
          value={linesOf(form.permissionRules?.ask ?? [])}
          onChange={(e) =>
            set('permissionRules', {
              ...(form.permissionRules ?? { allow: [], deny: [], ask: [] }),
              ask: parseLines(e.target.value)
            })
          }
        />
      </div>
      <div className="field">
        <label>Working directory (cwd)</label>
        <input value={form.cwd} onChange={(e) => set('cwd', e.target.value)} />
      </div>
      <div className="field">
        <label>Verify command（S08 · verify_delivery 默认，如 npm test）</label>
        <input
          value={form.verifyCommand ?? ''}
          onChange={(e) => set('verifyCommand', e.target.value)}
          placeholder="npm test"
        />
      </div>
      <div className="field">
        <label>Max agent turns</label>
        <input
          type="number"
          min={1}
          max={100}
          value={form.maxTurns}
          onChange={(e) => set('maxTurns', Number(e.target.value) || 40)}
        />
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={form.useClaudeSkills}
            onChange={(e) => set('useClaudeSkills', e.target.checked)}
          />{' '}
          额外导入 ~/.claude/skills（可选；默认关闭，Ackem 自己下载安装）
        </label>
      </div>
      <div className="field">
        <label>额外 skills 目录（每行一个绝对路径）</label>
        <textarea
          value={(form.extraSkillDirs ?? []).join('\n')}
          onChange={(e) =>
            set(
              'extraSkillDirs',
              e.target.value
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
            )
          }
          rows={3}
          placeholder="C:\path\to\more\skills"
        />
      </div>
      <div className="field">
        <label>MCP servers (JSON)</label>
        <textarea
          value={mcpJson}
          onChange={(e) => applyMcpJson(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={`{\n  "demo": {\n    "command": "npx",\n    "args": ["-y", "some-mcp-server"]\n  }\n}`}
        />
        {mcpErr ? <p className="hint">{mcpErr}</p> : null}
      </div>
    </>
  )
}

function SkillsPanel({ cwd }: { cwd: string }) {
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [roots, setRoots] = useState<{ path: string; source: string }[]>([])
  const [home, setHome] = useState('')
  const [catalog, setCatalog] = useState<
    { id: string; title: string; spec: string; skillName?: string; note: string }[]
  >([])
  const [msg, setMsg] = useState('')
  const [spec, setSpec] = useState('anthropics/skills')
  const [skillName, setSkillName] = useState('')
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [candidates, setCandidates] = useState<string[]>([])

  const refresh = useCallback(async () => {
    const res = await fetch('/api/skills')
    if (!res.ok) {
      setMsg('加载 skills 失败')
      return
    }
    const data = (await res.json()) as {
      skills: SkillRow[]
      roots: { path: string; source: string }[]
      ackemSkillsHome: string
      count: number
      catalog?: {
        id: string
        title: string
        spec: string
        skillName?: string
        note: string
      }[]
    }
    setSkills(data.skills)
    setRoots(data.roots)
    setHome(data.ackemSkillsHome)
    setCatalog(data.catalog ?? [])
    setMsg(`已安装 ${data.count} 个 · 目录 ${data.ackemSkillsHome}`)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, cwd])

  const install = async (opts?: { discover?: boolean; overrideSpec?: string }) => {
    const useSpec = (opts?.overrideSpec ?? spec).trim()
    if (!useSpec) return
    setMsg(opts?.discover ? '介绍页发现并安装中…' : '下载并安装中…')
    setCandidates([])
    const res = await fetch('/api/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: useSpec,
        skillName: skillName.trim() || undefined,
        scope,
        discover: opts?.discover === true
      })
    })
    const data = (await res.json()) as {
      ok: boolean
      name?: string
      installed?: { name: string; invokeName?: string; targetDir: string }[]
      error?: string
      needsChoice?: boolean
      candidates?: string[]
      message?: string
    }
    if (data.needsChoice && data.candidates?.length) {
      setCandidates(data.candidates)
      setMsg(data.message || '多个候选，请点选其一')
      return
    }
    if (!data.ok) {
      setMsg(data.error || '安装失败')
      return
    }
    const names =
      (data.installed ?? [])
        .map((s) => s.invokeName || s.name)
        .join(', ') || data.name
    setMsg(`已安装 ${names}`)
    setCandidates([])
    await refresh()
  }

  const uninstall = async (row: SkillRow) => {
    const key = row.folderName || row.name
    if (!window.confirm(`卸载 skill「${row.name}」？`)) return
    setMsg('卸载中…')
    const qs =
      row.source === 'project'
        ? '?scope=project'
        : row.source === 'user'
          ? '?scope=user'
          : '?scope=auto'
    const res = await fetch(`/api/skills/${encodeURIComponent(key)}${qs}`, {
      method: 'DELETE'
    })
    const data = (await res.json()) as { ok: boolean; error?: string; name?: string }
    if (!data.ok) {
      setMsg(data.error || '卸载失败')
      return
    }
    setMsg(`已卸载 ${data.name || key}`)
    await refresh()
  }

  return (
    <div className="skills-panel">
      <h2>Skills · 下载与使用</h2>
      <p className="hint">
        从 GitHub / URL <strong>下载安装</strong>到{' '}
        <code>{home || '~/.ackemcode/skills'}</code>，再用 <code>invoke_skill</code> 调用。
        格式 <code>skill-name/SKILL.md</code>。对话里也可说「安装 anthropics/skills 里的 docx」。
        介绍页可点「发现并安装」抽链。
      </p>
      <div className="field">
        <label>安装源（GitHub owner/repo、URL、zip、介绍页、或本地路径）</label>
        <input
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="anthropics/skills 或 https://docs…/intro"
        />
      </div>
      <div className="field">
        <label>skillName（多技能仓库必填，例如 docx）</label>
        <input
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          placeholder="docx"
        />
      </div>
      <div className="field">
        <label>安装范围</label>
        <select value={scope} onChange={(e) => setScope(e.target.value as 'user' | 'project')}>
          <option value="user">user · ~/.ackemcode/skills</option>
          <option value="project">project · {'{cwd}'}/.ackemcode/skills</option>
        </select>
      </div>
      <div className="composer-actions settings-actions">
        <button className="btn primary" onClick={() => void install()} disabled={!spec.trim()}>
          下载并安装
        </button>
        <button
          className="btn"
          onClick={() => void install({ discover: true })}
          disabled={!spec.trim() || !/^https?:\/\//i.test(spec.trim())}
          title="仅对 http(s) 介绍页有效"
        >
          发现并安装
        </button>
        <button className="btn" onClick={() => void refresh()}>
          刷新已安装
        </button>
        <span className="hint-inline">{msg}</span>
      </div>
      {candidates.length > 0 && (
        <details className="skills-roots" open>
          <summary>安装候选（点选）</summary>
          <ul>
            {candidates.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSpec(c)
                    void install({ overrideSpec: c })
                  }}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {catalog.length > 0 && (
        <details className="skills-roots" open>
          <summary>快捷目录（点选用）</summary>
          <ul>
            {catalog.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSpec(c.spec)
                    setSkillName(c.skillName || '')
                  }}
                >
                  {c.title}
                </button>
                <span className="hint-inline"> {c.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="skills-roots">
        <summary>扫描根目录（{roots.length}）</summary>
        <ul>
          {roots.map((r) => (
            <li key={`${r.source}:${r.path}`}>
              <code>{r.source}</code> · {r.path}
            </li>
          ))}
        </ul>
      </details>
      <div className="skills-list">
        <h3>已安装</h3>
        {skills.length === 0 ? (
          <p className="hint">
            还没有 skills。填 GitHub 源点「下载并安装」，或在对话里让 Agent 调用 install_skill。
          </p>
        ) : (
          <ul>
            {skills.map((s) => (
              <li key={`${s.source}:${s.dir || s.name}`}>
                <strong>{s.name}</strong>{' '}
                {s.folderName && s.folderName !== s.name ? (
                  <span className="hint-inline">(folder: {s.folderName})</span>
                ) : null}{' '}
                <span className="hint-inline">[{s.source}]</span>
                {s.disableModelInvocation ? (
                  <span className="hint-inline"> · user-only</span>
                ) : null}
                <div className="hint">{s.description}</div>
                {s.uninstallable ? (
                  <button type="button" className="btn" onClick={() => void uninstall(s)}>
                    卸载
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
