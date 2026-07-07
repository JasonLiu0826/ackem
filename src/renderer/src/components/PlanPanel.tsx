import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'

import { LightCore } from './LightCore'

import { useUiStore } from '../store/uiStore'

import { useAppStore } from '../store/appStore'

import { isOpenForUConfigured, OPENFORU_NOT_CONFIGURED_MSG } from '../../../shared/openforuConfig'

import { renderMarkdown, renderInline } from './md'

import { PlanStatusCompact } from './PlanStatusCompact'

import { PlanArtifactPreview } from './PlanArtifactPreview'

import { PlanChoiceCards } from './PlanChoiceCards'

import { PlanDispatchDraftPanel } from './PlanDispatchDraftPanel'

import { PlanDesignSpecPanel } from './PlanDesignSpecPanel'

import { PlanNextStepsPanel } from './PlanNextStepsPanel'

import { PlanSummaryCard } from './PlanSummaryCard'

import { ChatTypingIndicator } from './ChatTypingIndicator'

import {
  countPlanUserTurns,
  findLatestPlanSummary,
  formatChoiceReply,
  inferPlanStage,
  isDispatchDraftComplete,
  isPlanConfirmChoice,
  isPlanPostCancelComposerHint,
  isPlanRedeployIntent,
  isPlanSummaryReady,
  parsePlanChoices,
  parsePlanConfirmedLine,
  stripPlanAssistantForDisplay,
  isPlanIntroMessage,
  type PlanChoiceOption
} from '../../../shared/planUi'

import type { OpenForUWorkspace, PlanDispatchDraft, PlanSummary } from '../Ackem'
import type { PlanDesignSpec, DesignSpecGateResult } from '../../../shared/planDesignSpec'
import { evaluateDesignSpecGate } from '../../../shared/planDesignSpec'
import { getPlanArtifactDeployStatus } from '../../../shared/planArtifact'
import { buildPlanNextSteps } from '../../../shared/planNextSteps'
import { sanitizePlanAssistantDisplay } from '../../../shared/planAssistantPostValidator'
import { buildPlanSessionView } from '../../../shared/planSession'
import { resolvePlanWorkspaceProgress } from '../../../shared/planDeploySteps'
import type { AgentRunMeta } from '../../../shared/openforuAgentTypes'



type PlanMsg = { role: 'user' | 'assistant'; content: string }



function PlanMessageBody({ role, content }: { role: PlanMsg['role']; content: string }): JSX.Element {

  const html = useMemo(

    () => (role === 'assistant' ? renderMarkdown(content) : ''),

    [role, content]

  )



  if (role === 'user') {
    return (
      <div
        className="font-sans text-[13px] leading-relaxed text-ink [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: renderInline(content) }}
      />
    )
  }



  return (

    <div

      className="plan-md-content font-sans text-ink [&_code]:text-accent/90 [&_h3:first-child]:mt-0 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre_code]:text-ink"

      dangerouslySetInnerHTML={{ __html: html }}

    />

  )

}



function formatWorkspaceTime(iso: string): string {

  try {

    return new Date(iso).toLocaleString('zh-CN', {

      month: 'numeric',

      day: 'numeric',

      hour: '2-digit',

      minute: '2-digit'

    })

  } catch {

    return ''

  }

}



export function PlanPanel(): JSX.Element | null {

  const open = useUiStore((s) => s.planOpen)
  const planReloadNonce = useUiStore((s) => s.planReloadNonce)

  const setOpen = useUiStore((s) => s.setPlanOpen)

  const settings = useAppStore((s) => s.settings)

  const pushToast = useAppStore((s) => s.pushToast)

  const [workspaces, setWorkspaces] = useState<OpenForUWorkspace[]>([])

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  const [workspaceMax, setWorkspaceMax] = useState(6)

  const [sessionId, setSessionId] = useState<string | null>(null)

  const [messages, setMessages] = useState<PlanMsg[]>([])

  const [input, setInput] = useState('')

  const [busy, setBusy] = useState(false)

  const [wsBusy, setWsBusy] = useState(false)

  const [dispatchDraft, setDispatchDraft] = useState<PlanDispatchDraft>({})

  const [planSummary, setPlanSummary] = useState<PlanSummary | null>(null)

  const [planConfirmed, setPlanConfirmed] = useState(false)

  const [planConfirmedAt, setPlanConfirmedAt] = useState<string | undefined>()

  const [deployedUskillId, setDeployedUskillId] = useState<string | undefined>()

  const [deployedAt, setDeployedAt] = useState<string | undefined>()

  const [agentRun, setAgentRun] = useState<AgentRunMeta | null>(null)

  const [designSpec, setDesignSpec] = useState<PlanDesignSpec | null>(null)

  const [designSpecGate, setDesignSpecGate] = useState<DesignSpecGateResult | null>(null)

  const [refineMode, setRefineMode] = useState(false)

  const [linkedExtensionId, setLinkedExtensionId] = useState<string | null>(null)

  const chatScrollRef = useRef<HTMLDivElement>(null)



  const configured = isOpenForUConfigured(settings)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  const planStage = useMemo(
    () => inferPlanStage(messages, { planConfirmed, dispatchDraft, deployedUskillId }),
    [messages, planConfirmed, dispatchDraft, deployedUskillId]
  )

  const planUserTurns = useMemo(() => countPlanUserTurns(messages), [messages])

  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].content
    }
    return ''
  }, [messages])

  const planChoices = useMemo(() => parsePlanChoices(lastAssistantMsg), [lastAssistantMsg])

  const effectivePlanSummary = useMemo(
    () => planSummary ?? findLatestPlanSummary(messages),
    [planSummary, messages]
  )

  const planSessionView = useMemo(
    () =>
      buildPlanSessionView({
        id: sessionId ?? '',
        messages,
        dispatchDraft,
        planSummary: effectivePlanSummary,
        planConfirmed,
        planConfirmedAt,
        deployedUskillId,
        deployedAt,
        designSpec,
        refineMode,
        linkedExtensionId: linkedExtensionId ?? undefined
      }),
    [
      sessionId,
      messages,
      dispatchDraft,
      effectivePlanSummary,
      planConfirmed,
      planConfirmedAt,
      deployedUskillId,
      deployedAt,
      designSpec,
      refineMode,
      linkedExtensionId
    ]
  )

  const artifactStatus = useMemo(
    () =>
      getPlanArtifactDeployStatus({
        planSummary: effectivePlanSummary,
        dispatchDraft
      }),
    [effectivePlanSummary, dispatchDraft]
  )

  const planNextSteps = useMemo(
    () =>
      buildPlanNextSteps(planSessionView, {
        agentPhase: agentRun?.phase ?? null,
        agentBusy: busy || agentRun?.status === 'running'
      }),
    [planSessionView, agentRun, busy]
  )

  const refreshAgentRun = useCallback(async (sid: string | null) => {
    if (!sid) {
      setAgentRun(null)
      return
    }
    try {
      const r = await window.Ackem.openforu.agent.getStatus(sid)
      if (r.ok) setAgentRun(r.run)
    } catch {
      setAgentRun(null)
    }
  }, [])

  useEffect(() => {
    if (!open || !sessionId) {
      setAgentRun(null)
      return
    }
    void refreshAgentRun(sessionId)
    const off = window.Ackem.openforu.agent.onEvent((e) => {
      if (e.sessionId === sessionId) void refreshAgentRun(sessionId)
    })
    return off
  }, [open, sessionId, refreshAgentRun])

  const workspaceProgress = useMemo(
    () =>
      resolvePlanWorkspaceProgress({
        planStage,
        planConfirmed,
        deployedUskillId,
        busy,
        artifactKind: artifactStatus.kind,
        lastAssistantMsg,
        agentRun
      }),
    [
      planStage,
      planConfirmed,
      deployedUskillId,
      busy,
      artifactStatus.kind,
      lastAssistantMsg,
      agentRun
    ]
  )

  const planSummaryReady =
    isDispatchDraftComplete(dispatchDraft) || isPlanSummaryReady(effectivePlanSummary)

  const canPreviewArtifact =
    artifactStatus.kind !== 'undecided' &&
    (planSummaryReady || planConfirmed || Boolean(deployedUskillId))

  const canConfirmPlan = planSummaryReady && artifactStatus.kind !== 'undecided'

  const showPlanChoices = planChoices.length >= 2 && !busy

  /** 閫夐」鍗″睍寮€鏃讹細鍙鏈?馃搵 鎽樿灏辨樉绀哄湪閫夐」鍖轰笂鏂癸紙涓嶉檺浜庛€屾寜鏂规寮€濮嬨€嶇被 A/B锛?*/
  const showSummaryInChoiceSheet = useMemo(
    () => showPlanChoices && isPlanSummaryReady(effectivePlanSummary),
    [showPlanChoices, effectivePlanSummary]
  )

  const showSidebarSummary = false

  const planConfirmedLine = useMemo(
    () => parsePlanConfirmedLine(lastAssistantMsg),
    [lastAssistantMsg]
  )

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  }, [messages])

  const displayMessageContent = useCallback(
    (m: PlanMsg, index: number): string => {
      if (m.role !== 'assistant') return m.content
      let text =
        index === lastAssistantIndex
          ? stripPlanAssistantForDisplay(m.content, {
              hideChoices: showPlanChoices,
              hideConfirmedLine: Boolean(planConfirmedLine),
              hideSummaryBlock: showSummaryInChoiceSheet || showSidebarSummary
            })
          : stripPlanAssistantForDisplay(m.content, { hideChoices: false })
      const sanitized = sanitizePlanAssistantDisplay(text, {
        session: planSessionView,
        agentPhase: agentRun?.phase ?? null
      })
      return sanitized.content
    },
    [
      lastAssistantIndex,
      showPlanChoices,
      planConfirmedLine,
      showSummaryInChoiceSheet,
      showSidebarSummary,
      planSessionView,
      agentRun
    ]
  )

  const hasUserMessages = planUserTurns > 0

  const visibleMessages = useMemo(() => {
    return messages
      .map((m, i) => ({ m, i, content: displayMessageContent(m, i) }))
      .filter(({ m, i, content }) => {
        if (m.role === 'assistant' && !content.trim()) return false
        if (m.role === 'assistant' && hasUserMessages && isPlanIntroMessage(m.content)) return false
        return true
      })
  }, [messages, displayMessageContent, hasUserMessages])

  useEffect(() => {
    if (!showPlanChoices && !busy) return
    const el = chatScrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [showPlanChoices, planChoices.length, busy])



  const applyWorkspacePayload = useCallback(

    (payload: {

      workspaces?: OpenForUWorkspace[]

      activeWorkspaceId?: string | null

      max?: number

      sessionId?: string

      messages?: PlanMsg[]

      dispatchDraft?: PlanDispatchDraft

      planSummary?: PlanSummary | null

      planConfirmed?: boolean

      planConfirmedAt?: string

      deployedUskillId?: string

      deployedAt?: string

      designSpec?: PlanDesignSpec | null

      designSpecGate?: DesignSpecGateResult

      refineMode?: boolean

      linkedExtensionId?: string | null

      composerPrefill?: string

    }) => {

      if (payload.workspaces) setWorkspaces(payload.workspaces)

      if (payload.activeWorkspaceId !== undefined) setActiveWorkspaceId(payload.activeWorkspaceId)

      if (payload.max !== undefined) setWorkspaceMax(payload.max)

      if ('sessionId' in payload) {
        setSessionId(payload.sessionId || null)
        if (!payload.sessionId) {
          setDeployedUskillId(undefined)
          setDeployedAt(undefined)
          setPlanConfirmed(false)
          setPlanConfirmedAt(undefined)
          setAgentRun(null)
        }
      }

      if ('messages' in payload) setMessages((payload.messages ?? []) as PlanMsg[])

      if (payload.dispatchDraft) setDispatchDraft(payload.dispatchDraft)

      if ('planSummary' in payload) setPlanSummary(payload.planSummary ?? null)

      if ('planConfirmed' in payload) setPlanConfirmed(payload.planConfirmed ?? false)

      if ('planConfirmedAt' in payload) setPlanConfirmedAt(payload.planConfirmedAt ?? undefined)

      if ('deployedUskillId' in payload) setDeployedUskillId(payload.deployedUskillId ?? undefined)

      if ('deployedAt' in payload) setDeployedAt(payload.deployedAt ?? undefined)

      if ('designSpec' in payload) setDesignSpec(payload.designSpec ?? null)

      if ('refineMode' in payload) setRefineMode(payload.refineMode ?? false)

      if ('linkedExtensionId' in payload) setLinkedExtensionId(payload.linkedExtensionId ?? null)

      if (payload.composerPrefill) setInput(payload.composerPrefill)

      if (payload.designSpecGate) {
        setDesignSpecGate(payload.designSpecGate)
      } else if ('designSpec' in payload) {
        setDesignSpecGate(evaluateDesignSpecGate(payload.designSpec ?? null))
      }

    },

    []

  )



  useEffect(() => {

    if (!open || !configured) return

    setWsBusy(true)

    void window.Ackem.openforu.workspaces

      .open()

      .then((r) => {

        if (r.ok) {

          applyWorkspacePayload(r)

        } else {

          pushToast(r.error ?? OPENFORU_NOT_CONFIGURED_MSG)

        }

      })

      .finally(() => setWsBusy(false))

  }, [open, configured, pushToast, applyWorkspacePayload, planReloadNonce])

  useEffect(() => {
    const off = window.Ackem.openforu.onPlanSessionUpdated?.((payload) => {
      applyWorkspacePayload(payload as Parameters<typeof applyWorkspacePayload>[0])
      if (payload.sessionId && typeof payload.sessionId === 'string') {
        void refreshAgentRun(payload.sessionId)
      }
    })
    return off
  }, [applyWorkspacePayload, refreshAgentRun])

  const applyPlanMeta = useCallback((r: Partial<{
    messages: PlanMsg[]
    dispatchDraft?: PlanDispatchDraft
    planSummary?: PlanSummary | null
    planConfirmed?: boolean
    planConfirmedAt?: string
    deployedUskillId?: string
    deployedAt?: string
    workspaces?: OpenForUWorkspace[]
    designSpec?: PlanDesignSpec | null
    designSpecGate?: DesignSpecGateResult
    refineMode?: boolean
    linkedExtensionId?: string | null
  }>) => {
    if (r.messages) setMessages(r.messages as PlanMsg[])
    if (r.dispatchDraft) setDispatchDraft(r.dispatchDraft)
    if ('planSummary' in r) setPlanSummary(r.planSummary ?? null)
    if ('planConfirmed' in r) setPlanConfirmed(r.planConfirmed ?? false)
    if ('planConfirmedAt' in r) setPlanConfirmedAt(r.planConfirmedAt ?? undefined)
    if ('deployedUskillId' in r) setDeployedUskillId(r.deployedUskillId ?? undefined)
    if ('deployedAt' in r) setDeployedAt(r.deployedAt ?? undefined)
    if ('designSpec' in r) setDesignSpec(r.designSpec ?? null)
    if ('refineMode' in r) setRefineMode(r.refineMode ?? false)
    if ('linkedExtensionId' in r) setLinkedExtensionId(r.linkedExtensionId ?? null)
    if (r.designSpecGate) setDesignSpecGate(r.designSpecGate)
    else if ('designSpec' in r) setDesignSpecGate(evaluateDesignSpecGate(r.designSpec ?? null))
    if (r.workspaces) setWorkspaces(r.workspaces)
  }, [])

  const runDeploy = async (sid: string) => {
    void refreshAgentRun(sid)
    setBusy(true)
    try {
      const d = await window.Ackem.openforu.planDeploy(sid)
      await refreshAgentRun(sid)
      if (d.ok) {
        applyPlanMeta(d)
        pushToast(d.uskillId ? `宸查儴缃?${d.uskillId}` : '閮ㄧ讲瀹屾垚')
      } else {
        if (d.messages) applyPlanMeta(d)
        pushToast(d.error ?? '閮ㄧ讲澶辫触')
      }
    } finally {
      setBusy(false)
    }
  }

  const cancelAgentRun = async () => {
    if (!sessionId) return
    try {
      const r = await window.Ackem.openforu.agent.cancel(sessionId)
      if (r.ok && r.cancelled) {
        pushToast('宸插彇娑堥儴缃?)
        if (r.messages) applyPlanMeta(r)
        if ('agentRun' in r) setAgentRun(r.agentRun ?? null)
        await refreshAgentRun(sessionId)
      }
    } catch {
      pushToast('鍙栨秷澶辫触')
    } finally {
      setBusy(false)
    }
  }

  const agentPipelineBusy = agentRun?.status === 'running'

  const postCancelComposer = isPlanPostCancelComposerHint({
    planConfirmed,
    deployedUskillId,
    agentRunStatus: agentRun?.status,
    lastAssistantHasCancelNotice: lastAssistantMsg.includes('閮ㄧ讲宸插彇娑?)
  })

  const composerPlaceholder = postCancelComposer
    ? '杈撳叆鏂扮殑淇敼鎯虫硶锛屾垨鍙戦€併€愰噸鏂伴儴缃层€?
    : activeWorkspace
      ? `鍦ㄣ€?{activeWorkspace.name}銆嶆弿杩伴渶姹傛垨杩介棶鈥
      : '鎻忚堪闇€姹傛垨杩介棶鈥?

  const confirmPlan = async () => {
    if (!sessionId || busy) return
    if (designSpecGate && !designSpecGate.ready) {
      pushToast(`璁捐瑙勬牸鏈氨缁細${designSpecGate.missing[0] ?? '璇风户缁璇?}`)
      return
    }
    setBusy(true)
    try {
      const r = await window.Ackem.openforu.planConfirm(sessionId)
      if (r.ok && r.messages) {
        applyPlanMeta(r)
        if (artifactStatus.canDeploy) {
          const label = artifactStatus.kind === 'uplugin' ? 'Plugin' : 'Skill'
          pushToast(`${label} 鏂规宸茬‘璁わ紝姝ｅ湪鐢熸垚鈥)
          await runDeploy(sessionId)
        } else {
          pushToast('璇峰厛涓?Agent 鏄庣‘浜х墿绫诲瀷锛歶skill 鎴?uplugin')
        }
      } else {
        pushToast(r.error ?? '纭澶辫触')
      }
    } finally {
      setBusy(false)
    }
  }

  const approveWireframe = async () => {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      const r = await window.Ackem.openforu.planApproveWireframe(sessionId)
      if (r.ok) {
        applyPlanMeta(r)
        pushToast('鐣岄潰鏂规宸茬‘璁?)
      } else {
        pushToast(r.error ?? '纭澶辫触')
      }
    } finally {
      setBusy(false)
    }
  }

  const send = async (textOverride?: string) => {
    const t = (textOverride ?? input).trim()
    if (!t || !sessionId || busy) return
    if (!textOverride) setInput('')

    if (isPlanRedeployIntent(t)) {
      if (!planConfirmed) {
        pushToast('璇峰厛纭鏂规鍐嶉儴缃?)
        return
      }
      if (agentPipelineBusy) {
        pushToast('閮ㄧ讲杩涜涓紝璇风◢鍊?)
        return
      }
      setBusy(true)
      void refreshAgentRun(sessionId)
      try {
        const r = await window.Ackem.openforu.planRedeploy(sessionId, t)
        await refreshAgentRun(sessionId)
        if (r.ok) {
          applyPlanMeta(r)
          pushToast(r.uskillId ? `宸查儴缃?${r.uskillId}` : '閲嶆柊閮ㄧ讲瀹屾垚')
        } else {
          if (r.messages) applyPlanMeta(r)
          pushToast(r.error ?? '閲嶆柊閮ㄧ讲澶辫触')
        }
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    setMessages((m) => [...m, { role: 'user', content: t }])
    try {
      const r = await window.Ackem.openforu.planSend(sessionId, t)
      if (r.ok) {
        applyPlanMeta(r)
      } else {
        pushToast(r.error ?? 'Plan 璇锋眰澶辫触')
        setMessages((m) => m.slice(0, -1))
      }
    } finally {
      setBusy(false)
    }
  }

  const pickChoice = (option: PlanChoiceOption, customText?: string) => {
    if (isPlanConfirmChoice(option) && !option.isCustom) {
      void confirmPlan()
      return
    }
    void send(formatChoiceReply(option, customText))
  }

  const switchWorkspace = async (workspaceId: string) => {

    if (workspaceId === activeWorkspaceId || wsBusy) return

    setWsBusy(true)

    try {

      const r = await window.Ackem.openforu.workspaces.switch(workspaceId)

      if (r.ok) {

        applyWorkspacePayload(r)

        setInput('')

      } else {

        pushToast(r.error ?? '鍒囨崲宸ヤ綔鍖哄け璐?)

      }

    } finally {

      setWsBusy(false)

    }

  }



  const createWorkspace = async () => {

    if (wsBusy) return

    setWsBusy(true)

    try {

      const r = await window.Ackem.openforu.workspaces.create()

      if (r.ok) {

        applyWorkspacePayload(r)

        setInput('')

        if (r.evicted) {

          pushToast(`宸茶揪 ${workspaceMax} 涓伐浣滃尯涓婇檺锛屽凡绉婚櫎鏈€鏃х殑銆?{r.evicted.name}銆峘)

        } else {

          pushToast(`宸叉柊寤恒€?{r.workspace?.name ?? '宸ヤ綔鍖?}銆峘)

        }

      } else {

        pushToast(r.error ?? '鏂板缓宸ヤ綔鍖哄け璐?)

      }

    } finally {

      setWsBusy(false)

    }

  }



  const deleteActiveWorkspace = async () => {

    if (!activeWorkspaceId || wsBusy) return

    if (!window.confirm(`纭畾鍒犻櫎宸ヤ綔鍖恒€?{activeWorkspace?.name ?? ''}銆嶏紵瀵硅瘽璁板綍灏嗘棤娉曟仮澶嶃€俙)) return

    setWsBusy(true)

    try {

      const r = await window.Ackem.openforu.workspaces.delete(activeWorkspaceId)

      if (r.ok) {

        setWorkspaces(r.workspaces)

        setActiveWorkspaceId(r.activeWorkspaceId)

        if (r.activeWorkspaceId) {

          const opened = await window.Ackem.openforu.workspaces.switch(r.activeWorkspaceId)

          if (opened.ok) applyWorkspacePayload(opened)

        } else {

          applyWorkspacePayload({ sessionId: '', messages: [] })

        }

        pushToast('宸ヤ綔鍖哄凡鍒犻櫎')

      } else {

        pushToast(r.error ?? '鍒犻櫎澶辫触')

      }

    } finally {

      setWsBusy(false)

    }

  }



  if (!open) return null

  return (

    <>

      <button

        type="button"

        className="fixed inset-0 z-[80] bg-black/15"

        aria-label="鍏抽棴 Plan"

        onClick={() => setOpen(false)}

      />

      <aside className="plan-panel glass-panel fixed right-0 top-0 z-[81] flex h-full w-[min(920px,58vw)] min-w-[680px] max-w-[920px] flex-col border-l border-surface-inset/60 shadow-glow-lg">

        <header className="shrink-0 border-b border-surface-inset/50 px-4 py-2.5">

          <div className="flex items-center gap-2">

            <LightCore />

            <div className="min-w-0 flex-1">

              <p className="font-display text-sm font-medium text-ink">Ackem Agent 姝ｅ湪涓轰綘宸ヤ綔</p>

              <p className="text-[10px] text-ink-muted">Plan 妯″紡 路 涓嶅啓鍏ヤ富鑱婂ぉ璁板繂</p>

            </div>

            <button

              type="button"

              className="text-xs text-ink-muted hover:text-ink"

              onClick={() => setOpen(false)}

            >

              鍏抽棴

            </button>

          </div>

        </header>



        {!configured ? (

          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-ink-muted">

            <p>{OPENFORU_NOT_CONFIGURED_MSG}</p>

            <p className="text-xs">淇濆瓨璁剧疆鍚庨噸鏂版墦寮€ Plan 鍗冲彲銆?/p>

          </div>

        ) : !sessionId || workspaces.length === 0 ? (

          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-ink-muted">

            <p>杩樻病鏈夊伐浣滃尯銆?/p>

            <p className="text-xs">鏂板缓涓€涓伐浣滃尯鍚庯紝鍗冲彲涓?Agent 涓€璧疯璁℃墿灞曘€?/p>

            <button

              type="button"

              className="chat-send-btn px-4 py-2 text-sm disabled:opacity-50"

              disabled={wsBusy}

              onClick={() => void createWorkspace()}

            >

              + 鏂板缓宸ヤ綔鍖?

            </button>

          </div>

        ) : (

          <div className="plan-panel-body flex min-h-0 flex-1 flex-row">

            <div className="plan-panel-sidebar flex w-[38%] min-w-[220px] max-w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-surface-inset/50 p-3">

              <div className="space-y-2">

                <label className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">

                  宸ヤ綔鍖?

                </label>

                <select

                  className="field-input w-full py-1.5 text-xs"

                  value={activeWorkspaceId ?? ''}

                  disabled={wsBusy || workspaces.length === 0}

                  onChange={(e) => void switchWorkspace(e.target.value)}

                  aria-label="閫夋嫨宸ヤ綔鍖?

                >

                  {workspaces.map((w) => (

                    <option key={w.id} value={w.id}>

                      {w.name} 路 {formatWorkspaceTime(w.updatedAt)}

                    </option>

                  ))}

                </select>

                <div className="flex gap-2">

                  <button

                    type="button"

                    className="flex-1 rounded-lg border border-glass-border px-2 py-1.5 text-xs text-ink hover:border-accent/40"

                    disabled={wsBusy}

                    onClick={() => void createWorkspace()}

                  >

                    + 鏂板缓

                  </button>

                  {workspaces.length > 1 && (

                    <button

                      type="button"

                      className="rounded-lg border border-red-500/30 px-2 py-1.5 text-xs text-red-300 hover:border-red-400/50"

                      disabled={wsBusy}

                      onClick={() => void deleteActiveWorkspace()}

                    >

                      鍒犻櫎

                    </button>

                  )}

                </div>

                <p className="text-[10px] text-ink-muted">

                  {workspaces.length}/{workspaceMax} 涓伐浣滃尯

                </p>

              </div>

              <PlanStatusCompact
                stage={planStage}
                progress={workspaceProgress}
                workspaceName={activeWorkspace?.name}
              />

              {(planConfirmed || workspaceProgress.showDeployPipeline || deployedUskillId) && (
              <PlanArtifactPreview
                sessionId={sessionId}
                deployedExtensionId={deployedUskillId}
                canPreview={canPreviewArtifact}
                artifactKind={artifactStatus.kind}
              />
              )}

              <PlanDispatchDraftPanel draft={dispatchDraft} variant="sidebar" />

              <PlanNextStepsPanel
                steps={planNextSteps}
                busy={busy || wsBusy}
                onConfirmPlan={() => void confirmPlan()}
              />

              <PlanDesignSpecPanel
                spec={designSpec}
                gate={designSpecGate}
                busy={busy}
                showWireframeButton={planNextSteps.showWireframeButton}
                onApproveWireframe={() => void approveWireframe()}
              />

              {planConfirmedLine && (

                <p className="rounded-lg border border-surface-inset/40 bg-surface-inset/15 px-2.5 py-2 text-[11px] leading-relaxed text-ink-muted">

                  宸茬‘璁わ細{planConfirmedLine}

                </p>

              )}

            </div>

            <div className="plan-panel-chat flex min-h-0 min-w-0 flex-1 flex-col">

              <div
                ref={chatScrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
              >

                {visibleMessages.length === 0 && !busy && (

                  <p className="text-center text-xs text-ink-muted">

                    鍦ㄤ笅鏂规弿杩颁綘鎯冲仛鐨?Skill 鎴?Plugin锛孉gent 浼氬厛甯綘鍒ゆ柇绫诲瀷鍐嶆暣鐞嗘柟妗堛€?

                  </p>

                )}

                {visibleMessages.map(({ m, i, content }) => (

                  <div

                    key={i}

                    className={

                      m.role === 'user'

                        ? 'ml-6 rounded-xl bg-accent/10 px-3 py-2 text-right'

                        : 'mr-2 border-l-2 border-accent pl-3'

                    }

                  >

                    <PlanMessageBody role={m.role} content={content} />

                  </div>

                ))}

                {busy && (

                  <div className="mr-2 border-l-2 border-accent/30 pl-3 py-0.5">

                    <ChatTypingIndicator label="姝ｅ湪鎬濊€? />

                  </div>

                )}

              </div>

              <div className="plan-composer shrink-0 px-3 pb-3 pt-1">

                <div

                  className={`plan-choice-sheet ${showPlanChoices ? 'plan-choice-sheet--open' : ''}`}

                  aria-hidden={!showPlanChoices}

                >

                  <div
                    className={`plan-choice-sheet__inner ${showSummaryInChoiceSheet ? 'plan-choice-sheet__inner--with-summary' : ''}`}
                  >

                    {showSummaryInChoiceSheet && effectivePlanSummary && (
                      <div className="mb-3 shrink-0">
                        <PlanSummaryCard
                          variant="preview"
                          summary={effectivePlanSummary}
                          artifactStatus={artifactStatus}
                          confirmed={planConfirmed}
                          confirmedAt={planConfirmedAt}
                          canConfirm={canConfirmPlan}
                          busy={busy}
                          onConfirm={() => void confirmPlan()}
                          onRevise={() => void send('鎴戞兂淇敼鏂规锛岃鍛婅瘔鎴戦渶瑕佽皟鏁村摢涓€椤?)}
                        />
                      </div>
                    )}

                    <PlanChoiceCards

                      options={planChoices}

                      disabled={busy || wsBusy}

                      confirmGateMissing={
                        designSpecGate && !designSpecGate.ready ? designSpecGate.missing[0] ?? null : null
                      }

                      onSelect={pickChoice}

                    />

                  </div>

                </div>

                <div className="plan-composer-bar chat-input-wrap flex gap-2 p-1.5">

                  <textarea

                    value={input}

                    onChange={(e) => setInput(e.target.value)}

                    rows={2}

                    placeholder={composerPlaceholder}

                    className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted/70"

                    disabled={wsBusy || !sessionId}

                    onKeyDown={(e) => {

                      if (e.key === 'Enter' && !e.shiftKey) {

                        e.preventDefault()

                        void send()

                      }

                    }}

                  />

                  {(agentPipelineBusy || (busy && planConfirmed)) && (
                    <button
                      type="button"
                      disabled={wsBusy || !sessionId}
                      onClick={() => void cancelAgentRun()}
                      className="shrink-0 rounded-lg border border-rose-500/40 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      鍙栨秷
                    </button>
                  )}

                  <button

                    type="button"

                    disabled={busy || wsBusy || !sessionId}

                    onClick={() => void send()}

                    className="chat-send-btn shrink-0 px-3 py-2 text-sm disabled:opacity-50"

                  >

                    鈫?

                  </button>

                </div>

              </div>

            </div>

          </div>

        )}

      </aside>

    </>

  )

}


