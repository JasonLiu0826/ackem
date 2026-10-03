import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import type { AgentEvent, EffortLevel, PermissionMode } from '../../shared/types.js'
import {
  abortTurn,
  clearQueue,
  getSession,
  getSettings,
  getSlashCommands,
  getStandalone,
  getRegisteredModels,
  getSessionPlan,
  getBackgroundAgents,
  getSessionTodos,
  listSessions,
  listMemory,
  readMemory,
  writeMemory,
  deleteMemory,
  type MemoryFileInfo,
  getFileHistory,
  rewindSession,
  respondElicitation,
  openBrowserOnboardingStore,
  respondBrowserOnboarding,
  type FileHistorySnapshot,
  putSessionPlan,
  type SessionListItem,
  putSettings,
  putStandalone,
  sendAskAnswer,
  sendPermission,
  sendPlanDecision,
  setMode,
  setSessionModel,
  testLlm
} from '../client/api.js'
import { postChat } from '../client/sse.js'
import {
  buildAskAnswerPayload,
  createCliAskState,
  currentAskQuestion,
  displayedAskOptions,
  isOtherLabel,
  planExitChoice,
  planExitRows,
  type CliAskState
} from './planAskState.js'
import { loadCliPrefs, saveCliPrefs } from '../prefs/cliPrefs.js'
import { isCwdTrusted, trustCwdPersist } from '../trust/trustStore.js'
import {
  applyTheme,
  contextPressureColor,
  currentThemeId,
  effortColor,
  normalizeThemeId,
  lerpHex,
  modeColor,
  theme,
  THEME_IDS,
  THEME_LABELS
} from './theme.js'
import { EffortBar } from './EffortBar.js'
import {
  AckemCodeTitle,
  formatThoughtDuration,
  formatTokenCount,
  PixelAckemLogo,
  PulseBarsGlyph,
  PULSE_FRAMES
} from './logo.js'
import { extractAtPaths } from '../../shared/atMentions.js'
import { collapseReadToolsForCli } from '../../shared/thoughtCollapse.js'
import {
  setToolGroupExpanded,
  toolGroupExpanded,
  withCollapsedToolGroups
} from './collapseToolRows.js'
import { formatChromePills, type BgAgentPill, type TodoPill } from './chromePills.js'
import {
  isWebSearchConfigured,
  WEB_SEARCH_PROVIDERS,
  webSearchStatusLabel,
  WebSetPanel,
  type WebSearchSettingsHint
} from './webSearchSetup.js'
import { chatHistoryToCliItems } from './historyFromServer.js'
import {
  applyLanguage,
  CLI_LANGUAGES,
  CLI_LANGUAGE_LABELS,
  currentLanguage,
  isCliLanguage,
  l
} from './language.js'
import { TerminalMarkdown, terminalMarkdownLineCount, type StyledMarkdownLine } from './TerminalMarkdown.js'
import { hitTestOpenTarget } from './openHitTest.js'
import { openTarget } from '../../shared/openExternal.js'
import { historyToTranscript } from './transcript.js'
import {
  findTranscriptMatches,
  scrollToTranscriptLine,
  splitTranscriptHighlight
} from './transcriptSearch.js'
import { HistoryScrollbar } from './historyScrollbar.js'
import {
  chatMouseEnableSequence,
  DISABLE_MOUSE_TRACKING,
  parseTerminalMouse
} from './terminalMouse.js'
import { writeClipboard } from '../ink/clipboard.js'
import {
  clearSelection,
  createSelectionState,
  endSelection,
  getSelectedText,
  hasSelection,
  startSelection,
  updateSelection,
  type SelectionState
} from '../ink/selection.js'
import {
  buildVisibleViewportStyledLines,
  historyContentOriginRow1,
  lineCountForHistoryItem,
  pointerFromMouse
} from '../ink/viewportModel.js'
import { SelectableLine } from './SelectableLine.js'
import type {
  FoldBlock,
  HistoryItem,
  ToolEntry,
  ToolLine,
  Thought,
  Steps,
  Feedback
} from './historyTypes.js'
import { isFoldable } from './historyTypes.js'
import { formatMiniDiff, isEditTool } from './editDiff.js'
import {
  explainPermissionAsk,
  summarizePermissionOperation
} from '../../shared/permissionAsk.js'
import {
  isDeleteOperation,
  permissionClass,
  permissionClassLabel
} from '../../shared/permissionClass.js'
import { PromptFrame, PromptLine, SetupInputLine } from './PromptLine.js'
import {
  caretToWrap,
  clampCaret,
  inputUnits,
  moveCaretWrapLine,
  padToDisplayWidth,
  PROMPT_PREFIX,
  promptWrapWidth,
  stringDisplayWidth,
  wrapPromptLines
} from './textWidth.js'

type Overlay =
  | 'none'
  | 'slash'
  | 'at'
  | 'effort'
  | 'agents'
  | 'model'
  | 'mode'
  | 'clear'
  | 'permission'
  | 'planEnter'
  | 'plan'
  | 'modelConfirm'
  | 'ask'
  | 'setup'
  | 'trust'
  | 'theme'
  | 'language'
  | 'planPreview'
  | 'transcript'
  | 'resume'
  | 'memory'
  | 'memoryEdit'
  | 'rewind'
  | 'elicitation'
  | 'browserOnboard'
  | 'cron'
  | 'webset'

function newFold(): FoldBlock {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    startedAt: Date.now(),
    expanded: false
  }
}

const SLASH_FALLBACK = [
  'help',
  'effort',
  'model',
  'mode',
  'agents',
  'plan',
  'setup',
  'web-set',
  'clear',
  'context',
  'compact',
  'status',
  'mcp',
  'diff',
  'doctor',
  'skills',
  'hooks',
  'memory',
  'sandbox',
  'plugins',
  'cost',
  'pr',
  'commit',
  'theme',
  'language',
  'resume',
  'rewind'
]

const SLASH_HINT: Record<'zh' | 'en', Record<string, string>> = {
  zh: {
    help: '命令列表', effort: '思考强度', model: '切换模型', mode: '权限模式',
    agents: '代理策略', plan: '进入计划模式（已在则预览）', setup: '配置 AI', 'web-set': '网页搜索密钥',
    clear: '清空会话',
    context: '上下文占用', compact: '压缩上下文', status: '会话快照', mcp: 'MCP 开关',
    diff: 'Git 摘要', doctor: '环境检查', skills: '已装技能', hooks: '钩子',
    memory: '自动记忆', sandbox: '沙箱', plugins: '本地插件', cost: '用量摘要',
    pr: '创建 PR', commit: '提交', theme: '终端主题', language: '界面语言',
    resume: '恢复会话', rewind: '还原文件快照'
  },
  en: {
    help: 'Command list', effort: 'Thinking effort', model: 'Switch model',
    mode: 'Permission mode', agents: 'Agent strategy', plan: 'Enter plan mode (preview if already in)',
    setup: 'Configure AI', 'web-set': 'Web search key', clear: 'Clear session', context: 'Context usage',
    compact: 'Compact context', status: 'Session status', mcp: 'MCP controls',
    diff: 'Git summary', doctor: 'Environment check', skills: 'Installed skills',
    hooks: 'Hooks', memory: 'Auto memory', sandbox: 'Sandbox', plugins: 'Local plugins',
    cost: 'Usage summary', pr: 'Create PR', commit: 'Commit', theme: 'Terminal theme',
    language: 'Interface language', resume: 'Resume session', rewind: 'Restore snapshot'
  }
}

const SLASH_VISIBLE = 5

const SETUP_FIELDS = ['apiBaseUrl', 'model', 'apiKey', 'contextWindow'] as const
type SetupField = (typeof SETUP_FIELDS)[number]
const SETUP_STEPS: Array<{
  key: SetupField
  title: string
  short: string
  hint: string
  placeholder: string
}> = [
  {
    key: 'apiBaseUrl',
    title: '接口地址',
    short: '地址',
    hint: 'OpenAI 官方直接回车；中转 / DeepSeek / 通义就改地址。',
    placeholder: 'https://api.openai.com/v1'
  },
  {
    key: 'model',
    title: '模型名称',
    short: '模型',
    hint: '填模型 id，例如 gpt-4.1 或 deepseek-chat。',
    placeholder: 'gpt-4.1'
  },
  {
    key: 'apiKey',
    title: 'API Key',
    short: 'Key',
    hint: '粘贴密钥，屏幕上只显示圆点。',
    placeholder: 'sk-...'
  },
  {
    key: 'contextWindow',
    title: '上下文窗口',
    short: '窗口',
    hint: '↑↓ 在 128k / 1M / 自定义 间选择；选手动时可输入 token 数。',
    placeholder: '128000'
  }
]

const CONTEXT_WINDOW_PRESETS = [
  { label: '128k', value: 128_000, note: '多数模型的常见默认' },
  { label: '1M', value: 1_000_000, note: '长上下文（如 Claude [1m]）' },
  { label: '自定义', value: 0, note: '手动输入 4096–20M' }
] as const

function contextPickFromValue(v: string): number {
  const n = Number(v.replace(/_/g, ''))
  if (n === 128_000) return 0
  if (n === 1_000_000) return 1
  return 2
}

const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'max']
const AGENTS = ['solo', 'auto', 'team'] as const
const MODES: PermissionMode[] = [
  'default',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions'
]

function toolPath(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const o = input as Record<string, unknown>
  const p = o.path ?? o.file_path ?? o.filePath ?? o.pattern ?? o.glob
  return typeof p === 'string' ? p : undefined
}

function toolSummary(name: string, input: unknown): string {
  const path = toolPath(input)
  if (path) {
    const parts = path.replace(/\\/g, '/').split('/')
    return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : path
  }
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    const raw = o.command ?? o.query ?? o.description ?? o.content
    if (typeof raw === 'string') {
      const one = raw.replace(/\s+/g, ' ').trim()
      return one.length > 52 ? `${one.slice(0, 49)}…` : one
    }
  }
  return ''
}

function estimateTokens(items: HistoryItem[]): number {
  let n = 0
  for (const it of items) {
    if (it.kind === 'you' || it.kind === 'assistant') n += Math.ceil(it.text.length / 4)
    if (it.kind === 'tool') n += Math.ceil(it.tool.output.length / 4)
    if (it.kind === 'feedback') n += Math.ceil(it.feedback.output.length / 4)
    if (it.kind === 'thought') n += Math.ceil(it.thought.thinking.length / 4)
  }
  return n
}

function modeDisplay(mode: PermissionMode): string {
  if (mode === 'default') return l('默认', 'default')
  if (mode === 'plan') return l('计划', 'plan')
  if (mode === 'auto') return l('自动', 'auto')
  if (mode === 'dontAsk') return l('不询问', 'dont ask')
  if (mode === 'acceptEdits') return l('接受编辑', 'accept edits')
  if (mode === 'bypassPermissions') return l('完全放开', 'bypass')
  return String(mode)
}

function themeDisplay(id: (typeof THEME_IDS)[number]): string {
  const english = {
    blue: 'Blue',
    yellow: 'Yellow',
    green: 'Green',
    purple: 'Purple'
  } as const
  return l(THEME_LABELS[id], english[id])
}

export function App(props: {
  sessionId: string
  cwd: string
  ensureDaemon: boolean
  /** D-05+: `ackem attach` without --session → resume picker on start. */
  attachPickSession?: boolean
}): React.ReactElement {
  const [sessionId, setSessionId] = useState(props.sessionId)
  const { exit } = useApp()
  const { stdout } = useStdout()
  const cols = stdout.columns || 80
  const rows = stdout.rows || 24

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [input, setInput] = useState('')
  const [inputCaret, setInputCaret] = useState(0)
  const [flash, setFlash] = useState<{ text: string; color: string } | null>(null)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [inputHistoryIdx, setInputHistoryIdx] = useState(-1)
  const [screenCut, setScreenCut] = useState(0)
  const [histScroll, setHistScroll] = useState(0)
  const histScrollRef = useRef(0)
  histScrollRef.current = histScroll
  const [textSelection, setTextSelection] = useState<SelectionState>(() =>
    createSelectionState()
  )
  const textSelectionRef = useRef(textSelection)
  textSelectionRef.current = textSelection
  const viewportLinesRef = useRef<string[]>([])
  const viewportStyledRef = useRef<StyledMarkdownLine[]>([])
  const originRow1Ref = useRef(1)
  const contentColsRef = useRef(80)
  const [thoughtFocus, setThoughtFocus] = useState(-1)
  const liveDraft = useRef('')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [uiState, setUiState] = useState<'idle' | 'running' | 'requires_action'>('idle')
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [overlayIndex, setOverlayIndex] = useState(0)
  const [overlaySubmitting, setOverlaySubmitting] = useState(false)
  const overlaySubmittingRef = useRef(false)
  const [slashCmds, setSlashCmds] = useState<string[]>(SLASH_FALLBACK)
  const [atFiles, setAtFiles] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<EffortLevel>('medium')
  const [agent, setAgent] = useState('auto')
  const [mode, setModeState] = useState<PermissionMode>('default')
  const [windowTokens, setWindowTokens] = useState(128_000)
  const [serverUsage, setServerUsage] = useState<{
    tokens: number
    contextWindow: number
    source: 'api' | 'estimate'
  } | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [webSearchReady, setWebSearchReady] = useState(false)
  const [webSetIndex, setWebSetIndex] = useState(0)
  const [webSetKey, setWebSetKey] = useState('')
  const [webSetError, setWebSetError] = useState('')
  const [webSetBusy, setWebSetBusy] = useState(false)
  const [queued, setQueued] = useState<Array<{ text: string }>>([])
  const [pulse, setPulse] = useState(0)
  const [perm, setPerm] = useState<{
    requestId: string
    toolName: string
    input: unknown
    reason: string
  } | null>(null)
  const allowedTypesRef = useRef(new Set<string>())
  const windowAllowRef = useRef(false)
  const [planEnter, setPlanEnter] = useState<{ requestId: string } | null>(null)
  const [plan, setPlan] = useState<{
    requestId: string
    plan: string
    initialPlan: string
  } | null>(null)
  const [planEditing, setPlanEditing] = useState(false)
  const [planFeedback, setPlanFeedback] = useState('')
  const [pendingModel, setPendingModel] = useState<{
    id: string
    persist: boolean
  } | null>(null)
  const [ask, setAsk] = useState<CliAskState | null>(null)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [sessionOnlyModel, setSessionOnlyModel] = useState<string | null>(null)
  const [setupStep, setSetupStep] = useState(0)
  const [setupContextPick, setSetupContextPick] = useState(0)
  const [setupDraft, setSetupDraft] = useState({
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    apiKey: '',
    contextWindow: '128000'
  })
  const [setupError, setSetupError] = useState('')
  const [setupBusy, setSetupBusy] = useState(false)
  const [cwdTrusted, setCwdTrusted] = useState(false)
  const trustOnceRef = useRef(false)
  const [planPreview, setPlanPreview] = useState<{
    path: string
    content: string
    initial: string
    editing: boolean
  } | null>(null)
  const [themeRevision, setThemeRevision] = useState(0)
  const [languageRevision, setLanguageRevision] = useState(0)
  const [todos, setTodos] = useState<TodoPill[]>([])
  const [bgAgents, setBgAgents] = useState<BgAgentPill[]>([])
  const [transcriptScroll, setTranscriptScroll] = useState(0)
  const [transcriptSearchActive, setTranscriptSearchActive] = useState(false)
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState('')
  const [transcriptMatchIdx, setTranscriptMatchIdx] = useState(0)
  const histBudgetRef = useRef(4)
  const transcriptLinesRef = useRef<string[]>([])
  const [resumeSessions, setResumeSessions] = useState<SessionListItem[]>([])
  const [memoryDir, setMemoryDir] = useState('')
  const [memoryFiles, setMemoryFiles] = useState<MemoryFileInfo[]>([])
  const [memoryEdit, setMemoryEdit] = useState<{
    rel: string
    content: string
    initial: string
    editing: boolean
  } | null>(null)
  const [rewindSnapshots, setRewindSnapshots] = useState<FileHistorySnapshot[]>([])
  const [elicitation, setElicitation] = useState<{
    requestId: string
    serverName: string
    message: string
    url?: string
    mode: 'form' | 'url'
  } | null>(null)
  const [browserOnboard, setBrowserOnboard] = useState<{
    requestId: string
    storeUrl: string
    titleZh: string
    titleEn: string
    bodyZh: string
    bodyEn: string
    stepsZh: string[]
    stepsEn: string[]
    noteZh: string
    noteEn: string
    options: Array<{ id: string; labelZh: string; labelEn: string }>
  } | null>(null)
  const [cronDue, setCronDue] = useState<
    Array<{ id: string; prompt: string; humanSchedule: string }>
  >([])
  const [attachResumeDone, setAttachResumeDone] = useState(!props.attachPickSession)
  const attachResumePending = useRef(Boolean(props.attachPickSession))
  const openedSetup = useRef(false)
  const lastCtrlC = useRef(0)
  const inputRef = useRef('')
  const thinkRef = useRef<Thought | null>(null)
  const toolRef = useRef<ToolEntry | null>(null)
  const runningRef = useRef(false)
  const histPinnedRef = useRef(true)
  const histMaxScrollRef = useRef(0)
  const [unseenBelow, setUnseenBelow] = useState(0)
  const turnStartedAt = useRef(0)

  const patchTextSelection = useCallback((mutate: (s: SelectionState) => void) => {
    setTextSelection((prev) => {
      const s: SelectionState = {
        anchor: prev.anchor ? { ...prev.anchor } : null,
        focus: prev.focus ? { ...prev.focus } : null,
        isDragging: prev.isDragging
      }
      mutate(s)
      return s
    })
  }, [])

  // SGR mouse: wheel + in-app drag selection (ink-lite; full CC uses forked Ink screen buffer).
  useEffect(() => {
    if (!stdout.isTTY) return
    const nativeSelect = overlay === 'webset' || overlay === 'setup'
    stdout.write(nativeSelect ? DISABLE_MOUSE_TRACKING : chatMouseEnableSequence())
    return () => {
      stdout.write(DISABLE_MOUSE_TRACKING)
    }
  }, [stdout, overlay])

  const refreshSettings = useCallback(async () => {
    try {
      const s = await getSettings()
      setModel(s.model)
      setEffort(s.effort)
      setAgent(s.agentTier || 'auto')
      setModeState(s.permissionMode)
      if (s.contextWindow) setWindowTokens(s.contextWindow)
      setHasKey(Boolean(s.hasApiKey))
      setWebSearchReady(isWebSearchConfigured(s.webSearch as WebSearchSettingsHint | undefined))
    } catch {
      /* ignore */
    }
    try {
      const st = await getStandalone()
      setHasKey(Boolean(st.hasApiKey))
      if (st.model) setModel(st.model)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadCliPrefs().then((prefs) => {
      const themeId = prefs.theme ? normalizeThemeId(prefs.theme) : null
      if (themeId) {
        applyTheme(themeId)
        setThemeRevision((n) => n + 1)
        if (prefs.theme !== themeId) void saveCliPrefs({ theme: themeId })
      }
      if (prefs.language && isCliLanguage(prefs.language)) {
        applyLanguage(prefs.language)
        setLanguageRevision((n) => n + 1)
      }
    })
    void refreshSettings()
    void getSlashCommands()
      .then((cmds) => {
        const extra = cmds.filter((c) => !SLASH_FALLBACK.includes(c))
        setSlashCmds([...SLASH_FALLBACK, ...extra])
      })
      .catch(() => undefined)
  }, [refreshSettings])

  /** D-06: first-run trust for working directory. */
  useEffect(() => {
    void (async () => {
      if (trustOnceRef.current) {
        setCwdTrusted(true)
        return
      }
      const ok = await isCwdTrusted(props.cwd)
      if (ok) {
        setCwdTrusted(true)
      } else {
        setOverlay('trust')
        setOverlayIndex(0)
      }
    })()
  }, [props.cwd])

  /** D-05+: after trust, open session picker for bare `ackem attach`. */
  useEffect(() => {
    if (!cwdTrusted || !attachResumePending.current) return
    attachResumePending.current = false
    void listSessions()
      .then((list) => {
        setResumeSessions(list)
        setOverlay('resume')
        setOverlayIndex(0)
      })
      .catch(() => {
        setAttachResumeDone(true)
      })
  }, [cwdTrusted])

  useEffect(() => {
    if (!cwdTrusted || !attachResumeDone || hasKey || openedSetup.current) return
    openedSetup.current = true
    setOverlay('setup')
    setSetupStep(0)
    setSetupError('')
    void getStandalone()
      .then((st) => {
        const cw = st.contextWindow ? String(st.contextWindow) : '128000'
        setSetupDraft((d) => ({
          apiBaseUrl: st.apiBaseUrl || d.apiBaseUrl,
          model: st.model || d.model,
          apiKey: d.apiKey,
          contextWindow: cw
        }))
        setSetupContextPick(contextPickFromValue(cw))
      })
      .catch(() => undefined)
  }, [hasKey, cwdTrusted, attachResumeDone])

  useEffect(() => {
    const ms = overlay === 'effort' ? 50 : 90
    const t = setInterval(() => setPulse((p) => p + 1), ms)
    return () => clearInterval(t)
  }, [overlay])

  const flashMsg = (msg: string, ms = 1200, color: string = theme.cyan) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash({ text: msg, color })
    flashTimer.current = setTimeout(() => setFlash(null), ms)
  }

  const copyTextSelection = useCallback((): boolean => {
    const text = getSelectedText(viewportLinesRef.current, textSelectionRef.current)
    if (!text.trim()) return false
    const ok = writeClipboard(text)
    patchTextSelection((s) => clearSelection(s))
    flashMsg(
      ok
        ? l(`已复制 ${text.length} 字符`, `Copied ${text.length} chars`)
        : l('复制失败', 'Copy failed'),
      1200
    )
    return true
  }, [patchTextSelection])

  const hydrateFromServer = useCallback(
    async (id: string, flash = false) => {
      const snap = await getSession(id)
      const restored = chatHistoryToCliItems(snap.history || [])
      if (restored.length) {
        setHistory(restored)
        setInputHistory(
          restored
            .filter((x): x is { kind: 'you'; text: string } => x.kind === 'you')
            .map((x) => x.text)
        )
        if (flash) flashMsg(l(`已恢复 · ${restored.length} 条消息`, `resumed · ${restored.length} messages`), 1600, theme.fgMuted)
      } else {
        setHistory([])
        setInputHistory([])
      }
      if (snap.mode) setModeState(snap.mode)
      if (snap.todos?.length) setTodos(snap.todos)
      else void getSessionTodos(id).then((r) => setTodos(r.todos)).catch(() => undefined)
      void getBackgroundAgents(id)
        .then((r) => setBgAgents(r.agents))
        .catch(() => undefined)
    },
    []
  )

  /** D-05: restore timeline when attaching to a persisted session. */
  useEffect(() => {
    void hydrateFromServer(sessionId, true).catch(() => undefined)
  }, [sessionId, hydrateFromServer])

  useEffect(() => {
    setSessionId(props.sessionId)
    allowedTypesRef.current = new Set()
    windowAllowRef.current = false
  }, [props.sessionId])

  const bgRunning = useMemo(
    () => bgAgents.some((a) => a.status === 'running'),
    [bgAgents]
  )

  /** D-07: poll background agents while any are running. */
  useEffect(() => {
    const ms = bgRunning ? 2000 : 12000
    const tick = () => {
      void getBackgroundAgents(sessionId)
        .then((r) => setBgAgents(r.agents))
        .catch(() => undefined)
    }
    tick()
    const t = setInterval(tick, ms)
    return () => clearInterval(t)
  }, [sessionId, bgRunning])

  const openPlanPreview = useCallback(async () => {
    try {
      const p = await getSessionPlan(sessionId)
      setPlanPreview({
        path: p.path,
        content: p.content,
        initial: p.content,
        editing: false
      })
      setOverlay('planPreview')
      setOverlayIndex(0)
    } catch (e) {
      flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
    }
  }, [sessionId])

  const openMemoryList = useCallback(async () => {
    try {
      const r = await listMemory(props.cwd)
      setMemoryDir(r.dir)
      setMemoryFiles(r.files)
      setMemoryEdit(null)
      setOverlay('memory')
      setOverlayIndex(0)
    } catch (e) {
      flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
    }
  }, [props.cwd])

  const openRewindList = useCallback(async () => {
    try {
      const r = await getFileHistory(sessionId)
      setRewindSnapshots(r.snapshots.slice().reverse())
      setOverlay('rewind')
      setOverlayIndex(0)
    } catch (e) {
      flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
    }
  }, [sessionId])

  const handleCtrlC = useCallback(
    (shift = false) => {
      const now = Date.now()
      // Same physical key may emit both Ink \x03 and Node SIGINT.
      if (lastCtrlC.current > 0 && now - lastCtrlC.current < 80) return
      if (lastCtrlC.current > 0 && now - lastCtrlC.current < 1500) {
        exit()
        return
      }
      lastCtrlC.current = now
      if (runningRef.current) {
        void abortTurn(sessionId, {
          restoreInput: true,
          rewind: shift
        })
        flashMsg(l('已暂停 · 再按一次 Ctrl+C 退出', 'paused · press Ctrl+C again to exit'), 1500)
        return
      }
      if (inputRef.current) {
        setInput('')
        setInputCaret(0)
      }
      flashMsg(l('再按一次 Ctrl+C 退出', 'Press Ctrl+C again to exit'), 1500)
    },
    [exit, sessionId]
  )

  useEffect(() => {
    inputRef.current = input
  }, [input])

  useEffect(() => {
    if (histPinnedRef.current) {
      setHistScroll(0)
      setUnseenBelow(0)
    } else {
      setUnseenBelow((n) => n + 1)
    }
  }, [history.length])

  useEffect(() => {
    const onSigint = () => handleCtrlC(false)
    process.on('SIGINT', onSigint)
    return () => {
      process.off('SIGINT', onSigint)
    }
  }, [handleCtrlC])

  const applyEvent = useCallback((ev: AgentEvent) => {
    const bump = () => setHistory((h) => [...h])
    const sealThink = () => {
      if (thinkRef.current && !thinkRef.current.endedAt) thinkRef.current.endedAt = Date.now()
      thinkRef.current = null
    }
    const sealTool = () => {
      if (toolRef.current && !toolRef.current.endedAt) toolRef.current.endedAt = Date.now()
      toolRef.current = null
    }
    const markToolWaiting = (toolUseId?: string) => {
      setHistory((h) => {
        const copy = h.map((x) =>
          x.kind === 'tool' ? { kind: 'tool' as const, tool: { ...x.tool } } : x
        )
        for (let i = copy.length - 1; i >= 0; i--) {
          const it = copy[i]
          if (it?.kind === 'tool' && it.tool.state === 'running') {
            if (toolUseId && it.tool.id !== toolUseId) continue
            it.tool.state = 'waiting'
            toolRef.current = it.tool
            break
          }
        }
        return copy
      })
    }
    const pauseTurnBlocks = (toolUseId?: string) => {
      sealThink()
      markToolWaiting(toolUseId)
      bump()
    }
    const openThink = () => {
      if (thinkRef.current && !thinkRef.current.endedAt) return thinkRef.current
      const th: Thought = { ...newFold(), thinking: '' }
      thinkRef.current = th
      setHistory((h) => [...h, { kind: 'thought', thought: th }])
      return th
    }
    const openTool = (id: string, name: string, input: unknown) => {
      sealThink()
      if (toolRef.current?.id === id && !toolRef.current.endedAt) {
        return toolRef.current
      }
      const te: ToolEntry = {
        ...newFold(),
        id,
        name,
        summary: toolSummary(name, input),
        state: 'running',
        output: '',
        editInput: isEditTool(name) ? input : undefined
      }
      toolRef.current = te
      setHistory((h) => {
        if (h.some((x) => x.kind === 'tool' && x.tool.id === id)) return h
        return [...h, { kind: 'tool', tool: te }]
      })
      return te
    }

    if (ev.type === 'session_state') {
      if (ev.state === 'running') {
        turnStartedAt.current = Date.now()
        runningRef.current = true
      }
      setUiState(ev.state)
    }
    if (ev.type === 'mode_changed') setModeState(ev.mode)
    if (ev.type === 'settings_changed') {
      if (ev.settings.model) setModel(ev.settings.model)
      if (ev.settings.effort) setEffort(ev.settings.effort)
      if (ev.settings.agentTier) setAgent(ev.settings.agentTier)
      if (ev.settings.permissionMode) setModeState(ev.settings.permissionMode)
      if (ev.settings.contextWindow) setWindowTokens(ev.settings.contextWindow)
    }
    if (ev.type === 'thinking') {
      if (ev.phase === 'end') {
        sealThink()
        bump()
      } else if (ev.text && !isThinkNoise(ev.text)) {
        const th = openThink()
        th.thinking += ev.text
        if (th.expanded) bump()
      }
    }
    if (ev.type === 'tool_start') {
      openTool(ev.id, ev.name, ev.input)
    }
    if (ev.type === 'agent_started') {
      const te = openTool(ev.agentId, 'agent', {
        description: `${ev.subagentType} · ${ev.description}`
      })
      te.summary = `${ev.subagentType} · ${ev.description}`
    }
    if (ev.type === 'tool_result') {
      sealThink()
      setHistory((h) => {
        const copy = h.map((x) =>
          x.kind === 'tool' ? { kind: 'tool' as const, tool: { ...x.tool } } : x
        )
        for (let i = copy.length - 1; i >= 0; i--) {
          const it = copy[i]
          if (
            it?.kind === 'tool' &&
            (it.tool.id === ev.id ||
              (it.tool.name === ev.name && it.tool.state !== 'done' && it.tool.state !== 'error'))
          ) {
            it.tool.state = ev.ok ? 'done' : 'error'
            it.tool.output = sanitizeToolOutput(ev.output)
            it.tool.endedAt = Date.now()
            if (toolRef.current?.id === it.tool.id) toolRef.current = null
            break
          }
        }
        return copy
      })
    }
    if (ev.type === 'assistant_delta') {
      sealThink()
      sealTool()
      setHistory((h) => {
        const last = h[h.length - 1]
        if (last?.kind === 'assistant') {
          return [...h.slice(0, -1), { kind: 'assistant', text: last.text + ev.text }]
        }
        return [...h, { kind: 'assistant', text: ev.text }]
      })
    }
    if (ev.type === 'assistant_message' && ev.final) {
      sealThink()
      sealTool()
      setHistory((h) => {
        for (let i = h.length - 1; i >= 0; i--) {
          if (h[i]!.kind === 'assistant') {
            return [...h.slice(0, i), { kind: 'assistant', text: ev.text }, ...h.slice(i + 1)]
          }
        }
        return [...h, { kind: 'assistant', text: ev.text }]
      })
    }
    if (ev.type === 'status') {
      const text = formatStatusText(ev.message)
      if (text) {
        setHistory((h) => {
          const last = h[h.length - 1]
          if (last?.kind === 'status' && last.text === text) return h
          return [...h, { kind: 'status', text }]
        })
      }
    }
    if (ev.type === 'context_compacted') {
      setServerUsage((u) => ({
        tokens: ev.afterTokens,
        contextWindow: u?.contextWindow ?? windowTokens,
        source: 'estimate'
      }))
      setHistory((h) => [
        ...h,
        { kind: 'status', text: `${l('已压缩', 'compacted')}  ${formatTokenCount(ev.beforeTokens)} → ${formatTokenCount(ev.afterTokens)}` }
      ])
    }
    if (ev.type === 'token_usage') {
      setServerUsage({
        tokens: ev.tokens,
        contextWindow: ev.contextWindow,
        source: ev.source
      })
      if (ev.contextWindow) setWindowTokens(ev.contextWindow)
    }
    if (ev.type === 'todos_updated') {
      setTodos(ev.todos)
    }
    if (ev.type === 'agent_finished') {
      void getBackgroundAgents(sessionId)
        .then((r) => setBgAgents(r.agents))
        .catch(() => undefined)
    }
    if (ev.type === 'message_queued') {
      setQueued((q) => [...q, { text: ev.text }])
    }
    if (ev.type === 'queue_updated') {
      setQueued(ev.items.map((i) => ({ text: i.text })))
    }
    if (ev.type === 'permission_request') {
      const sameType = allowedTypesRef.current.has(permissionClass(ev.toolName))
      const windowOk =
        windowAllowRef.current && !isDeleteOperation(ev.toolName, ev.input)
      if (sameType || windowOk) {
        void sendPermission(sessionId, {
          requestId: ev.requestId,
          decision: 'allow',
          toolName: ev.toolName,
          input: ev.input
        })
        return
      }
      pauseTurnBlocks(ev.toolUseId)
      setUiState('requires_action')
      setPerm({
        requestId: ev.requestId,
        toolName: ev.toolName,
        input: ev.input,
        reason: ev.reason
      })
      setOverlay('permission')
      setOverlayIndex(0)
      flashMsg(
        l(
          `需要确认 ${ev.toolName} · Enter 允许`,
          `Confirm ${ev.toolName} · Enter to allow`
        ),
        4000,
        theme.warning
      )
    }
    if (ev.type === 'enter_plan_approval') {
      pauseTurnBlocks()
      setPlanEnter({ requestId: ev.requestId })
      setOverlay('planEnter')
      setOverlayIndex(0)
      setUiState('requires_action')
    }
    if (ev.type === 'plan_approval') {
      pauseTurnBlocks()
      setPlan({ requestId: ev.requestId, plan: ev.plan, initialPlan: ev.plan })
      setPlanEditing(false)
      setPlanFeedback('')
      setOverlay('plan')
      setOverlayIndex(0)
      setUiState('requires_action')
    }
    if (ev.type === 'ask_user') {
      if (ev.questions[0]) {
        pauseTurnBlocks()
        setAsk(createCliAskState(ev.requestId, ev.questions))
        setOverlay('ask')
        setOverlayIndex(0)
        setUiState('requires_action')
      }
    }
    if (ev.type === 'mcp_elicitation') {
      pauseTurnBlocks()
      setElicitation({
        requestId: ev.requestId,
        serverName: ev.serverName,
        message: ev.message,
        url: ev.url,
        mode: ev.mode
      })
      setOverlay('elicitation')
      setOverlayIndex(0)
      setUiState('requires_action')
    }
    if (ev.type === 'browser_onboarding') {
      pauseTurnBlocks()
      setBrowserOnboard({
        requestId: ev.requestId,
        storeUrl: ev.storeUrl,
        titleZh: ev.titleZh,
        titleEn: ev.titleEn,
        bodyZh: ev.bodyZh,
        bodyEn: ev.bodyEn,
        stepsZh: ev.stepsZh,
        stepsEn: ev.stepsEn,
        noteZh: ev.noteZh,
        noteEn: ev.noteEn,
        options: ev.options
      })
      setOverlay('browserOnboard')
      setOverlayIndex(0)
      setUiState('requires_action')
    }
    if (ev.type === 'cron_due' && ev.jobs.length) {
      setCronDue(
        ev.jobs.map((j) => ({
          id: j.id,
          prompt: j.prompt,
          humanSchedule: j.humanSchedule
        }))
      )
      setOverlay('cron')
      setOverlayIndex(0)
    }
    if (ev.type === 'files_rewound' && !ev.dryRun) {
      flashMsg(
        ev.filesChanged.length
          ? l(`已回退 · ${ev.filesChanged.length} 个文件`, `rewind · ${ev.filesChanged.length} files`)
          : l('已回退 · 无文件变化', 'rewind · no file changes'),
        1600,
        theme.cyan
      )
    }
    if (ev.type === 'abort_ack') {
      const th = thinkRef.current
      if (th) {
        th.endedAt = Date.now()
        th.cancelled = true
        th.rolledBack = ev.rewound
      }
      const te = toolRef.current
      if (te) {
        te.endedAt = Date.now()
        te.cancelled = true
        te.rolledBack = ev.rewound
        if (te.state === 'running' || te.state === 'waiting') te.state = 'error'
      }
      thinkRef.current = null
      toolRef.current = null
      setHistory((h) => {
        if (h.length && h[h.length - 1]?.kind === 'assistant') return h.slice(0, -1)
        return h
      })
      if (ev.restoredUserText) {
        setInput(ev.restoredUserText)
        setInputCaret(inputUnits(ev.restoredUserText).length)
      }
      flashMsg(
        ev.rewound
          ? ev.filesChanged?.length
            ? l(`已回退 · ${ev.filesChanged.length} 个文件`, `rewind · ${ev.filesChanged.length} files`)
            : l('已暂停 · 无需回退', 'paused · nothing to rewind')
          : l('已暂停 · 输入内容已恢复', 'paused · message restored')
      )
      setUiState('idle')
      runningRef.current = false
    }
    if (ev.type === 'done' || ev.type === 'error') {
      if (thinkRef.current && !thinkRef.current.endedAt) thinkRef.current.endedAt = Date.now()
      if (toolRef.current && !toolRef.current.endedAt) toolRef.current.endedAt = Date.now()
      thinkRef.current = null
      toolRef.current = null
      setUiState('idle')
      runningRef.current = false
      if (ev.type === 'error') {
        setHistory((h) => [...h, { kind: 'status', text: formatAgentError(ev.message) }])
      }
      void refreshSettings()
    }
  }, [refreshSettings])

  const writeInput = (text: string, caret?: number) => {
    setInput(text)
    setInputCaret(clampCaret(text, caret ?? inputUnits(text).length))
  }

  const send = async (text: string, priority?: 'now' | 'next') => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!cwdTrusted && overlay === 'trust') return
    if (trimmed === '/help') {
      writeInput('')
      setHistory((h) => [
        ...h,
        {
          kind: 'assistant',
          text: l(
            '## 常用命令\n- `/language`：切换中文 / English\n- `/model`：切换模型\n- `/effort`：调整思考强度\n- `/mode`：切换权限模式\n- `/agents`：选择代理策略\n- `/setup`：配置 AI 连接\n- `/web-set`：配置网页搜索密钥\n- `/resume`：恢复会话\n- `/memory`：管理自动记忆\n- `/theme`：切换终端主题\n\n输入 `/` 可查看全部命令。',
            '## Common commands\n- `/language`: switch 中文 / English\n- `/model`: switch model\n- `/effort`: adjust thinking effort\n- `/mode`: change permission mode\n- `/agents`: select agent strategy\n- `/setup`: configure AI connection\n- `/web-set`: configure web search key\n- `/resume`: resume a session\n- `/memory`: manage auto memory\n- `/theme`: change terminal theme\n\nType `/` to browse all commands.'
          )
        }
      ])
      return
    }
    if (trimmed === '/web-set' || trimmed.startsWith('/web-set ')) {
      setOverlay('webset')
      setWebSetIndex(0)
      setWebSetKey('')
      setWebSetError('')
      setWebSetBusy(false)
      writeInput('')
      return
    }
    if (trimmed === '/setup') {
      setOverlay('setup')
      setSetupStep(0)
      setSetupError('')
      setSetupBusy(false)
      writeInput('')
      void getStandalone()
        .then((st) => {
          setSetupDraft((d) => {
            const cw = st.contextWindow ? String(st.contextWindow) : d.contextWindow
            return {
              apiBaseUrl: st.apiBaseUrl || d.apiBaseUrl,
              model: st.model || d.model,
              apiKey: d.apiKey,
              contextWindow: cw
            }
          })
          setSetupContextPick((pick) =>
            contextPickFromValue(
              st.contextWindow ? String(st.contextWindow) : '128000'
            )
          )
        })
        .catch(() => undefined)
      return
    }
    if (trimmed === '/clear' || trimmed.startsWith('/clear ')) {
      setOverlay('clear')
      setOverlayIndex(0)
      return
    }
    if (trimmed === '/effort') {
      setOverlay('effort')
      setOverlayIndex(EFFORTS.indexOf(effort))
      writeInput('')
      return
    }
    if (trimmed === '/agents') {
      setOverlay('agents')
      setOverlayIndex(Math.max(0, AGENTS.indexOf(agent as (typeof AGENTS)[number])))
      writeInput('')
      return
    }
    if (trimmed === '/resume') {
      writeInput('')
      void listSessions()
        .then((list) => {
          setResumeSessions(list)
          setOverlay('resume')
          setOverlayIndex(0)
        })
        .catch((e) => {
          flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
        })
      return
    }
    if (trimmed === '/memory') {
      writeInput('')
      await openMemoryList()
      return
    }
    if (trimmed === '/rewind') {
      writeInput('')
      await openRewindList()
      return
    }
    if (trimmed === '/vim' || trimmed.startsWith('/vim ')) {
      writeInput('')
      flashMsg(l('vim 完整模式尚未实现 · 请使用 $EDITOR 或 IDE', 'Full vim mode is not implemented · use $EDITOR or an IDE'), 2000, theme.fgMuted)
      return
    }
    if (trimmed === '/theme') {
      setOverlay('theme')
      setOverlayIndex(Math.max(0, THEME_IDS.indexOf(currentThemeId())))
      writeInput('')
      return
    }
    if (trimmed.startsWith('/theme ')) {
      const raw = trimmed.slice(7).trim()
      writeInput('')
      const id =
        normalizeThemeId(raw) ??
        THEME_IDS.find((t) => THEME_LABELS[t] === raw) ??
        null
      if (id) {
        applyTheme(id)
        setThemeRevision((n) => n + 1)
        void saveCliPrefs({ theme: id })
        flashMsg(`${l('终端主题', 'theme')} → ${themeDisplay(id)}`, 1200, theme.cyan)
      }
      return
    }
    if (trimmed === '/language') {
      setOverlay('language')
      setOverlayIndex(Math.max(0, CLI_LANGUAGES.indexOf(currentLanguage())))
      writeInput('')
      return
    }
    if (trimmed.startsWith('/language ')) {
      const value = trimmed.slice(10).trim().toLowerCase()
      const language =
        value === '中' || value === '中文' || value === 'cn'
          ? 'zh'
          : value === '英' || value === '英文' || value === 'english'
            ? 'en'
            : value
      writeInput('')
      if (isCliLanguage(language)) {
        applyLanguage(language)
        setLanguageRevision((n) => n + 1)
        void saveCliPrefs({ language })
        flashMsg(l('界面语言 → 中文', 'Language → English'), 1200, theme.cyan)
      }
      return
    }
    if (/^\/\s*plan(?:\s|$)/i.test(trimmed)) {
      const arg = trimmed.replace(/^\/\s*plan\s*/i, '').trim()
      writeInput('')
      const enter =
        arg === 'enter' ||
        arg === 'mode' ||
        (!arg && mode !== 'plan')
      if (enter) {
        const r = await setMode(sessionId, { mode: 'plan' })
        setModeState(r.mode)
        flashMsg(
          l('已进入计划模式', 'Enabled plan mode') + ` → <${modeDisplay(r.mode)}>`,
          1400,
          modeColor(r.mode)
        )
        return
      }
      if (!arg || arg === 'open' || arg === 'show') {
        await openPlanPreview()
        return
      }
      return
    }
    if (trimmed === '/model') {
      void openModelPicker()
      return
    }
    if (trimmed.startsWith('/model ')) {
      const id = trimmed.slice(7).trim()
      if (id) {
        writeInput('')
        await requestModelChange(id, true)
        return
      }
    }
    if (trimmed === '/mode') {
      setOverlay('mode')
      setOverlayIndex(Math.max(0, MODES.indexOf(mode)))
      writeInput('')
      return
    }

    const isServerSlash = trimmed.startsWith('/')
    if (isServerSlash) {
      setHistory((h) => [...h, { kind: 'you', text: trimmed }])
      setInputHistory((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed]))
      setInputHistoryIdx(-1)
      setThoughtFocus(-1)
      liveDraft.current = ''
      writeInput('')
      setHistScroll(0)
      try {
        await postChat({
          sessionId: sessionId,
          text: trimmed,
          priority: runningRef.current && priority ? priority : undefined,
          mode: 'slash',
          onEvent: applyEvent
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setHistory((h) => [...h, { kind: 'status', text: msg }])
      } finally {
        if (!thinkRef.current && !toolRef.current) {
          runningRef.current = false
          setUiState('idle')
        }
      }
      return
    }

    setHistory((h) => {
      const th: Thought = { ...newFold(), thinking: '' }
      thinkRef.current = th
      toolRef.current = null
      turnStartedAt.current = Date.now()
      return [...h, { kind: 'you', text: trimmed }, { kind: 'thought', thought: th }]
    })
    setInputHistory((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed]))
    setInputHistoryIdx(-1)
    setThoughtFocus(-1)
    liveDraft.current = ''
    writeInput('')
    histPinnedRef.current = true
    setHistScroll(0)
    setUnseenBelow(0)
    runningRef.current = true
    setUiState('running')
    const atPaths = extractAtPaths(trimmed)
    const attachments = atPaths.length
      ? atPaths.map((p) => ({ path: p, kind: 'file' as const }))
      : undefined
    try {
      await postChat({
        sessionId: sessionId,
        text: trimmed,
        attachments,
        priority: runningRef.current && priority ? priority : undefined,
        mode: 'prompt',
        onEvent: applyEvent
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const code = (e as { code?: string }).code
      if (code === 'llm_not_configured') {
        setHasKey(false)
        setOverlay('setup')
        setHistory((h) => h.slice(0, -2))
      } else {
        setHistory((h) => [...h, { kind: 'status', text: msg }])
      }
      setUiState('idle')
      runningRef.current = false
    }
  }

  const closeOverlay = () => {
    overlaySubmittingRef.current = false
    setOverlaySubmitting(false)
    setOverlay('none')
    setOverlayIndex(0)
    setPlanEditing(false)
    setPlanPreview(null)
    setPendingModel(null)
    setTranscriptScroll(0)
    setResumeSessions([])
    setRewindSnapshots([])
    setElicitation(null)
    setCronDue([])
  }

  const thoughtOrdinals = useCallback((items: HistoryItem[]) => {
    const idxs: number[] = []
    items.forEach((it, i) => {
      if (isFoldable(it)) idxs.push(i)
    })
    return idxs
  }, [])

  const toggleFocusedThought = () => {
    setHistory((h) => {
      const visible = withCollapsedToolGroups(h.slice(screenCut))
      const idxs = thoughtOrdinals(visible)
      const pick =
        thoughtFocus >= 0 && thoughtFocus < idxs.length
          ? idxs[thoughtFocus]
          : idxs[idxs.length - 1]
      if (pick !== undefined) {
        const it = visible[pick]
        if (it?.kind === 'thought') it.thought.expanded = !it.thought.expanded
        if (it?.kind === 'tool') it.tool.expanded = !it.tool.expanded
        if (it?.kind === 'tool_group') {
          setToolGroupExpanded(it.tools, !toolGroupExpanded(it.tools))
        }
        if (it?.kind === 'steps') it.steps.expanded = !it.steps.expanded
        if (it?.kind === 'feedback') it.feedback.expanded = !it.feedback.expanded
      }
      return [...h]
    })
  }

  const moveThoughtFocus = (dir: -1 | 1) => {
    const idxs = thoughtOrdinals(withCollapsedToolGroups(history.slice(screenCut)))
    if (!idxs.length) return
    setThoughtFocus((cur) => {
      if (cur < 0) return dir < 0 ? idxs.length - 1 : 0
      return Math.max(0, Math.min(idxs.length - 1, cur + dir))
    })
  }

  const scrollHistBy = (delta: number) => {
    setHistScroll((s) => {
      const next = Math.max(0, Math.min(histMaxScrollRef.current, s + delta))
      histPinnedRef.current = next === 0
      if (next === 0) setUnseenBelow(0)
      return next
    })
  }

  const recallInput = (dir: -1 | 1) => {
    if (inputHistory.length === 0) return
    if (inputHistoryIdx < 0) liveDraft.current = input
    const next =
      inputHistoryIdx < 0
        ? dir < 0
          ? inputHistory.length - 1
          : -1
        : inputHistoryIdx + dir
    if (next < 0 || next >= inputHistory.length) {
      setInputHistoryIdx(-1)
      writeInput(liveDraft.current)
      return
    }
    setInputHistoryIdx(next)
    writeInput(inputHistory[next] ?? '')
  }

  const slashFilter = useMemo(() => {
    const q = input.startsWith('/') ? input.slice(1).split(/\s/)[0] ?? '' : ''
    return slashCmds.filter((c) => c.startsWith(q))
  }, [input, slashCmds])

  const displayHistory = useMemo(
    () => withCollapsedToolGroups(history.slice(screenCut)),
    [history, screenCut]
  )

  const scrollTranscriptToMatch = useCallback((line: number) => {
    setTranscriptScroll((s) =>
      scrollToTranscriptLine(line, histBudgetRef.current, s)
    )
  }, [])

  const stepTranscriptMatch = useCallback(
    (delta: number) => {
      const matches = findTranscriptMatches(
        transcriptLinesRef.current,
        transcriptSearchQuery
      )
      if (!matches.length) return
      setTranscriptMatchIdx((i) => {
        const next = (i + delta + matches.length) % matches.length
        scrollTranscriptToMatch(matches[next]!)
        return next
      })
    },
    [transcriptSearchQuery, scrollTranscriptToMatch]
  )

  const applyTranscriptSearchQuery = useCallback(
    (query: string) => {
      setTranscriptSearchQuery(query)
      setTranscriptMatchIdx(0)
      const matches = findTranscriptMatches(transcriptLinesRef.current, query)
      if (matches[0] !== undefined) scrollTranscriptToMatch(matches[0])
    },
    [scrollTranscriptToMatch]
  )

  const closeTranscript = useCallback(() => {
    setOverlay('none')
    setTranscriptScroll(0)
    setTranscriptSearchActive(false)
    setTranscriptSearchQuery('')
    setTranscriptMatchIdx(0)
  }, [])

  useInput((ch, key) => {
    const mouse = parseTerminalMouse(ch)
    if (mouse) {
      if (mouse.kind === 'wheel') {
        const step = 3
        if (overlay === 'transcript') {
          setTranscriptScroll((s) =>
            Math.max(0, s + (mouse.direction === 'up' ? -step : step))
          )
        } else {
          scrollHistBy(mouse.direction === 'up' ? step : -step)
        }
      } else if (
        overlay === 'none' &&
        process.env.ACKEM_DISABLE_MOUSE !== '1' &&
        process.env.ACKEM_ALTERNATE_SCROLL !== '1'
      ) {
        const mapPointer = (row: number, col: number) =>
          pointerFromMouse({
            originRow1: originRow1Ref.current,
            row1: row,
            col1: col,
            lineCount: viewportLinesRef.current.length,
            contentCols: contentColsRef.current
          })
        if (mouse.kind === 'left-press') {
          if (
            hasSelection(textSelectionRef.current) &&
            !textSelectionRef.current.isDragging
          ) {
            patchTextSelection((s) => clearSelection(s))
            return
          }
          const pt = mapPointer(mouse.row, mouse.col)
          if (pt) patchTextSelection((s) => startSelection(s, pt.line, pt.col))
        } else if (mouse.kind === 'left-drag') {
          const pt = mapPointer(mouse.row, mouse.col)
          if (pt) patchTextSelection((s) => updateSelection(s, pt.line, pt.col))
        } else if (mouse.kind === 'left-release') {
          const sel = textSelectionRef.current
          const clicked =
            sel.anchor &&
            sel.focus &&
            sel.anchor.line === sel.focus.line &&
            Math.abs(sel.anchor.col - sel.focus.col) <= 1
          const lineIdx = sel.anchor?.line
          const col = sel.anchor?.col ?? 0
          patchTextSelection((s) => endSelection(s))
          if (clicked && lineIdx != null) {
            const styled = viewportStyledRef.current[lineIdx]
            const target = hitTestOpenTarget(styled?.text ?? viewportLinesRef.current[lineIdx] ?? '', col, styled?.spans)
            if (target) {
              patchTextSelection((s) => clearSelection(s))
              void openTarget(target).then((result) => {
                flashMsg(
                  result.ok
                    ? l(`已打开 ${result.message.replace(/^Opened /, '')}`, result.message)
                    : result.message,
                  1800,
                  result.ok ? theme.success : theme.danger
                )
              })
            }
          }
        }
      } else if (mouse.kind === 'left-press' && mouse.col >= cols) {
        if (
          hasSelection(textSelectionRef.current) &&
          !textSelectionRef.current.isDragging
        ) {
          patchTextSelection((s) => clearSelection(s))
        }
        if (histMaxScrollRef.current > 0 && overlay !== 'transcript') {
          const trackTop = Math.max(1, rows - histBudgetRef.current - 4)
          const y = Math.max(0, Math.min(histBudgetRef.current - 1, mouse.row - trackTop))
          const ratio = histBudgetRef.current <= 1 ? 0 : y / (histBudgetRef.current - 1)
          const next = Math.round((1 - ratio) * histMaxScrollRef.current)
          setHistScroll(next)
          histPinnedRef.current = next === 0
          if (next === 0) setUnseenBelow(0)
        }
      }
      return
    }

    if (overlay === 'transcript') {
      if (transcriptSearchActive) {
        if (key.escape) {
          setTranscriptSearchActive(false)
          setTranscriptSearchQuery('')
          setTranscriptMatchIdx(0)
          return
        }
        if (key.backspace || key.delete) {
          applyTranscriptSearchQuery(transcriptSearchQuery.slice(0, -1))
          return
        }
        if (key.return || (key.ctrl && ch === 'r' && !key.shift)) {
          stepTranscriptMatch(1)
          return
        }
        if ((key.ctrl && ch === 'r' && key.shift) || key.pageUp) {
          stepTranscriptMatch(-1)
          return
        }
        if (key.downArrow || key.pageDown) {
          stepTranscriptMatch(1)
          return
        }
        if (key.upArrow) {
          stepTranscriptMatch(-1)
          return
        }
        if (ch && !key.ctrl && !key.meta && ch.length === 1) {
          applyTranscriptSearchQuery(transcriptSearchQuery + ch)
          return
        }
        return
      }

      if (key.escape || (key.ctrl && ch === 'o')) {
        closeTranscript()
        return
      }
      if (key.ctrl && ch === 'r') {
        setTranscriptSearchActive(true)
        setTranscriptSearchQuery('')
        setTranscriptMatchIdx(0)
        return
      }
      const step = key.pageUp || key.pageDown ? 12 : 1
      if (key.upArrow || key.pageUp) {
        setTranscriptScroll((s) => Math.max(0, s - step))
        return
      }
      if (key.downArrow || key.pageDown) {
        setTranscriptScroll((s) => s + step)
        return
      }
      return
    }

    if (key.ctrl && ch === 'o' && overlay !== 'setup' && overlay !== 'webset' && overlay !== 'trust') {
      setTranscriptScroll(0)
      setTranscriptSearchActive(false)
      setTranscriptSearchQuery('')
      setTranscriptMatchIdx(0)
      setOverlay('transcript')
      return
    }

    if (overlay === 'trust') {
      if (overlaySubmittingRef.current) return
      if (key.upArrow || key.downArrow) {
        setOverlayIndex((i) =>
          Math.max(0, Math.min(2, i + (key.upArrow ? -1 : key.downArrow ? 1 : 0)))
        )
        return
      }
      if (key.return) {
        void confirmOverlay()
        return
      }
      if (key.escape) {
        exit()
        return
      }
      return
    }

    if (key.ctrl && ch === 'c') {
      if (hasSelection(textSelectionRef.current) && copyTextSelection()) return
      handleCtrlC(Boolean(key.shift))
      return
    }

    if (
      overlay === 'none' &&
      key.escape &&
      hasSelection(textSelectionRef.current)
    ) {
      patchTextSelection((s) => clearSelection(s))
      return
    }

    // History scroll must work even while permission/plan overlays are open (CC-style).
    if (key.pageUp || key.pageDown) {
      const step = Math.max(8, Math.floor(rows / 3))
      setHistScroll((s) => {
        const next = Math.max(0, s + (key.pageUp ? step : -step))
        histPinnedRef.current = next === 0
        if (next === 0) setUnseenBelow(0)
        else if (key.pageUp) histPinnedRef.current = false
        return next
      })
      return
    }
    if (key.ctrl && (key.upArrow || key.downArrow)) {
      setHistScroll((s) => {
        const next = Math.max(0, s + (key.upArrow ? 8 : -8))
        histPinnedRef.current = next === 0
        if (next === 0) setUnseenBelow(0)
        return next
      })
      return
    }
    if (key.ctrl && key.home) {
      histPinnedRef.current = false
      setHistScroll(histMaxScrollRef.current)
      return
    }
    if (key.ctrl && key.end) {
      histPinnedRef.current = true
      setHistScroll(0)
      setUnseenBelow(0)
      return
    }

    if (overlay !== 'none' && overlay !== 'setup' && overlay !== 'webset' && overlay !== 'slash' && overlay !== 'at') {
      if (overlaySubmittingRef.current) return
      if (overlay === 'planPreview' && planPreview) {
        const toggleEdit = key.tab || ch === 'e' || ch === 'E'
        if (planPreview.editing) {
          if (key.escape || key.tab) {
            setPlanPreview((p) => (p ? { ...p, editing: false } : p))
            return
          }
          if (key.return) {
            setPlanPreview((p) => (p ? { ...p, content: `${p.content}\n` } : p))
            return
          }
          if (key.backspace || key.delete) {
            setPlanPreview((p) => (p ? { ...p, content: p.content.slice(0, -1) } : p))
            return
          }
          if (ch && !key.ctrl) {
            setPlanPreview((p) => (p ? { ...p, content: p.content + ch } : p))
            return
          }
          return
        }
        if (toggleEdit) {
          setPlanPreview((p) => (p ? { ...p, editing: true } : p))
          return
        }
      }
      if (overlay === 'memoryEdit' && memoryEdit) {
        const toggleEdit = key.tab || ch === 'e' || ch === 'E'
        if (memoryEdit.editing) {
          if (key.escape || key.tab) {
            setMemoryEdit((m) => (m ? { ...m, editing: false } : m))
            return
          }
          if (key.return) {
            setMemoryEdit((m) => (m ? { ...m, content: `${m.content}\n` } : m))
            return
          }
          if (key.backspace || key.delete) {
            setMemoryEdit((m) => (m ? { ...m, content: m.content.slice(0, -1) } : m))
            return
          }
          if (ch && !key.ctrl) {
            setMemoryEdit((m) => (m ? { ...m, content: m.content + ch } : m))
            return
          }
          return
        }
        if (toggleEdit) {
          setMemoryEdit((m) => (m ? { ...m, editing: true } : m))
          return
        }
      }
      if (overlay === 'plan' && plan) {
        const exitRows = planExitRows()
        const keepIdx = exitRows.findIndex((r) => r.id === 'no-keep')
        const onKeep = overlayIndex === keepIdx
        if (key.shift && key.tab) {
          void confirmOverlay(0, { acceptWithFeedback: true })
          return
        }
        if (!planEditing && onKeep) {
          if (key.backspace || key.delete) {
            setPlanFeedback((t) => t.slice(0, -1))
            return
          }
          if (ch && !key.ctrl && !key.tab) {
            setPlanFeedback((t) => t + ch)
            return
          }
        }
        const toggleEdit = key.tab || ch === 'e' || ch === 'E' || (key.ctrl && ch === 'g')
        if (planEditing) {
          if (key.escape || key.tab) {
            setPlanEditing(false)
            return
          }
          if (key.return) {
            setPlan((p) => (p ? { ...p, plan: `${p.plan}\n` } : p))
            return
          }
          if (key.backspace || key.delete) {
            setPlan((p) => (p ? { ...p, plan: p.plan.slice(0, -1) } : p))
            return
          }
          if (ch && !key.ctrl) {
            setPlan((p) => (p ? { ...p, plan: p.plan + ch } : p))
            return
          }
          return
        }
        if (toggleEdit && !onKeep) {
          setPlanEditing(true)
          return
        }
      }
      if (overlay === 'ask' && ask) {
        const q = currentAskQuestion(ask)
        const opts = displayedAskOptions(ask)
        const focused = opts[overlayIndex]
        const onOther = focused ? isOtherLabel(focused.label) : false
        if (key.leftArrow || key.rightArrow || ch === '[' || ch === ']') {
          const dir = key.leftArrow || ch === '[' ? -1 : 1
          setAsk((a) => {
            if (!a) return a
            const n = a.questions.length
            return {
              ...a,
              qIndex: (a.qIndex + dir + n) % n,
              otherEditing: false
            }
          })
          setOverlayIndex(0)
          return
        }
        if (ask.otherEditing || onOther) {
          if (key.escape || key.tab) {
            setAsk((a) => (a ? { ...a, otherEditing: false } : a))
            return
          }
          if (key.backspace || key.delete) {
            setAsk((a) => {
              if (!a || !q) return a
              const cur = a.otherText[q.question] || ''
              return {
                ...a,
                otherEditing: true,
                otherText: { ...a.otherText, [q.question]: cur.slice(0, -1) }
              }
            })
            return
          }
          if (ch && !key.ctrl && !key.return) {
            setAsk((a) => {
              if (!a || !q) return a
              return {
                ...a,
                otherEditing: true,
                otherText: {
                  ...a.otherText,
                  [q.question]: (a.otherText[q.question] || '') + ch
                }
              }
            })
            return
          }
        }
      }
      if (key.escape) {
        if (overlay === 'permission') {
          if (perm) {
            void sendPermission(sessionId, {
              requestId: perm.requestId,
              decision: 'deny',
              toolName: perm.toolName,
              input: perm.input
            })
          }
          setPerm(null)
        }
        if (overlay === 'planEnter' && planEnter) {
          void sendPlanDecision(sessionId, {
            requestId: planEnter.requestId,
            decision: 'reject'
          })
          setPlanEnter(null)
        }
        if (overlay === 'plan' && plan) {
          void sendPlanDecision(sessionId, {
            requestId: plan.requestId,
            decision: 'reject',
            rejectAction: 'keep_planning',
            message: planFeedback.trim() || undefined,
            plan: plan.plan,
            planWasEdited: plan.plan !== plan.initialPlan
          })
          setPlan(null)
          setPlanFeedback('')
        }
        if (overlay === 'planPreview') {
          setPlanPreview(null)
        }
        if (overlay === 'memory') {
          setMemoryFiles([])
          setMemoryDir('')
        }
        if (overlay === 'memoryEdit') {
          setMemoryEdit(null)
        }
        if (overlay === 'rewind') {
          setRewindSnapshots([])
        }
        if (overlay === 'elicitation' && elicitation) {
          void respondElicitation(elicitation.requestId, 'cancel').catch(() => undefined)
          setElicitation(null)
          setUiState('idle')
        }
        if (overlay === 'browserOnboard' && browserOnboard) {
          void respondBrowserOnboarding(browserOnboard.requestId, 'later').catch(
            () => undefined
          )
          setBrowserOnboard(null)
          setUiState('idle')
        }
        if (overlay === 'cron') {
          setCronDue([])
        }
        if (overlay === 'modelConfirm') {
          setPendingModel(null)
          closeOverlay()
          return
        }
        if (overlay === 'ask' && ask) {
          void sendAskAnswer(sessionId, {
            requestId: ask.requestId,
            cancelled: true
          })
          setAsk(null)
        }
        if (overlay === 'resume') {
          setAttachResumeDone(true)
          setResumeSessions([])
        }
        closeOverlay()
        return
      }
      const max =
        overlay === 'effort'
          ? EFFORTS.length
          : overlay === 'agents'
            ? AGENTS.length
            : overlay === 'mode'
              ? MODES.length
              : overlay === 'model'
                ? Math.max(1, modelOptions.length)
                : overlay === 'clear'
                ? 2
                : overlay === 'permission'
                  ? 4
                  : overlay === 'planEnter'
                    ? 2
                    : overlay === 'plan'
                      ? planExitRows().length
                      : overlay === 'planPreview'
                        ? 2
                        : overlay === 'memoryEdit'
                          ? 3
                          : overlay === 'memory'
                            ? Math.max(1, memoryFiles.length)
                            : overlay === 'rewind'
                              ? Math.max(1, rewindSnapshots.length)
                              : overlay === 'elicitation'
                                ? 3
                                : overlay === 'browserOnboard'
                                  ? Math.max(1, browserOnboard?.options.length ?? 5)
                                : overlay === 'cron'
                                  ? Math.max(1, cronDue.length)
                                  : overlay === 'theme'
                              ? THEME_IDS.length
                              : overlay === 'language'
                                ? CLI_LANGUAGES.length
                              : overlay === 'resume'
                                ? Math.max(
                                    1,
                                    resumeSessions.length + (props.attachPickSession ? 1 : 0)
                                  )
                                : overlay === 'modelConfirm'
                        ? 2
                        : overlay === 'ask'
                        ? ask
                          ? displayedAskOptions(ask).length
                          : 1
                        : 1
      if (overlay === 'effort' && (key.leftArrow || key.rightArrow)) {
        setOverlayIndex((i) => {
          const n = key.leftArrow ? i - 1 : i + 1
          return (n + EFFORTS.length) % EFFORTS.length
        })
        return
      }
      if (key.upArrow || key.downArrow) {
        setOverlayIndex((i) => {
          const n = key.upArrow ? i - 1 : i + 1
          return (n + Math.max(1, max)) % Math.max(1, max)
        })
        return
      }
      if (overlay === 'permission' && ch) {
        const map: Record<string, number> = { y: 0, s: 1, a: 2, n: 3 }
        const idx = map[ch.toLowerCase()]
        if (idx !== undefined) {
          setOverlayIndex(idx)
          void confirmOverlay(idx)
          return
        }
      }
      if (overlay === 'elicitation' && elicitation && ch) {
        const map: Record<string, number> = { y: 0, a: 0, n: 1, c: 2 }
        const idx = map[ch.toLowerCase()]
        if (idx !== undefined) {
          setOverlayIndex(idx)
          void confirmOverlay(idx)
          return
        }
      }
      if (overlay === 'model' && (ch === 's' || ch === 'S')) {
        void confirmOverlay(overlayIndex, { sessionOnly: true })
        return
      }
      if (overlay === 'ask' && ask && ch === ' ') {
        const q = currentAskQuestion(ask)
        const opt = displayedAskOptions(ask)[overlayIndex]
        if (q?.multiSelect && opt && !isOtherLabel(opt.label)) {
          setAsk((a) => {
            if (!a) return a
            const cur = a.picked[q.question] || []
            const next = cur.includes(opt.label)
              ? cur.filter((x) => x !== opt.label)
              : [...cur, opt.label]
            return { ...a, picked: { ...a.picked, [q.question]: next } }
          })
        }
        return
      }
      if (overlay === 'ask' && ask && ch >= '1' && ch <= '9' && !ask.otherEditing) {
        const idx = Number(ch) - 1
        const opts = displayedAskOptions(ask)
        if (idx >= 0 && idx < opts.length) {
          setOverlayIndex(idx)
          if (!currentAskQuestion(ask)?.multiSelect) void confirmOverlay(idx)
        }
        return
      }
      if (key.return) {
        void confirmOverlay()
      }
      return
    }

    if (overlay === 'webset') {
      if (webSetBusy) return
      if (key.escape) {
        closeOverlay()
        setWebSetError('')
        setWebSetKey('')
        return
      }
      if (key.leftArrow || key.rightArrow) {
        setWebSetIndex((i) => {
          const n = WEB_SEARCH_PROVIDERS.length
          return key.leftArrow ? (i - 1 + n) % n : (i + 1) % n
        })
        setWebSetError('')
        return
      }
      if (key.return) {
        const provider = WEB_SEARCH_PROVIDERS[webSetIndex] ?? 'tavily'
        const keyValue = webSetKey.trim()
        if (!keyValue) {
          setWebSetError(
            l('请先粘贴 API 密钥', 'Paste an API key first')
          )
          return
        }
        setWebSetBusy(true)
        void putSettings({
          webSearch: { provider, apiKey: keyValue, maxResults: 8 }
        })
          .then(() => {
            setWebSearchReady(true)
            setWebSetBusy(false)
            closeOverlay()
            setWebSetKey('')
            flashMsg(
              l('网页搜索已就绪', 'Web search ready'),
              1600,
              theme.success
            )
            void refreshSettings()
          })
          .catch((e) => {
            setWebSetBusy(false)
            setWebSetError(e instanceof Error ? e.message : String(e))
          })
        return
      }
      if (key.backspace || key.delete) {
        setWebSetError('')
        setWebSetKey((k) => k.slice(0, -1))
        return
      }
      if (ch && !key.ctrl && !key.upArrow && !key.downArrow) {
        setWebSetError('')
        setWebSetKey((k) => k + ch)
      }
      return
    }

    if (overlay === 'setup') {
      if (setupBusy) return
      if (key.escape) {
        closeOverlay()
        setSetupError('')
        return
      }
      if (key.tab && key.shift) {
        setSetupError('')
        setSetupStep((s) => Math.max(0, s - 1))
        return
      }
      const onContextStep = setupField() === 'contextWindow'
      if (onContextStep && (key.upArrow || key.downArrow)) {
        setSetupContextPick((i) => {
          const n = key.upArrow ? i - 1 : i + 1
          const next = (n + CONTEXT_WINDOW_PRESETS.length) % CONTEXT_WINDOW_PRESETS.length
          const preset = CONTEXT_WINDOW_PRESETS[next]!
          if (preset.value > 0) {
            setSetupDraft((d) => ({ ...d, contextWindow: String(preset.value) }))
          }
          return next
        })
        setSetupError('')
        return
      }
      if (key.return) {
        void advanceSetup()
        return
      }
      if (onContextStep && setupContextPick !== 2) return
      if (key.backspace || key.delete) {
        const field = setupField()
        setSetupError('')
        setSetupDraft((d) => ({ ...d, [field]: d[field].slice(0, -1) }))
        return
      }
      if (ch && !key.ctrl) {
        const field = setupField()
        if (field === 'contextWindow' && !/^\d$/.test(ch)) return
        setSetupError('')
        setSetupDraft((d) => ({ ...d, [field]: d[field] + ch }))
      }
      return
    }

    if (uiState === 'requires_action') return

    if (key.tab && key.shift) {
      void setMode(sessionId, { cycle: true }).then((r) => {
        setModeState(r.mode)
        flashMsg(`mode → <${modeDisplay(r.mode)}>`, 1200, modeColor(r.mode))
      })
      return
    }
    if (key.ctrl && ch === 'e') {
      setOverlay('effort')
      setOverlayIndex(EFFORTS.indexOf(effort))
      return
    }
    if (key.ctrl && ch === 'g') {
      setOverlay('agents')
      setOverlayIndex(Math.max(0, AGENTS.indexOf(agent as (typeof AGENTS)[number])))
      return
    }
    if (key.ctrl && ch === 'l' && overlay === 'none') {
      setScreenCut(history.length)
      setHistScroll(0)
      return
    }
    if (
      key.escape &&
      key.ctrl &&
      key.shift &&
      uiState === 'idle' &&
      overlay === 'none'
    ) {
      void clearQueue(sessionId)
        .then((r) => {
          setQueued([])
          flashMsg(r.removed ? `queue cleared · ${r.removed}` : 'queue empty')
        })
        .catch((e) => {
          flashMsg(e instanceof Error ? e.message : String(e), 1200, theme.danger)
        })
      return
    }

    if (key.escape) {
      if (uiState === 'running') {
        void abortTurn(sessionId, { restoreInput: true })
        return
      }
      writeInput('')
      setInputHistoryIdx(-1)
      return
    }

    if (
      overlay === 'none' ||
      overlay === 'slash' ||
      overlay === 'at'
    ) {
      if (key.leftArrow) {
        setInputCaret((c) => Math.max(0, c - 1))
        return
      }
      if (key.rightArrow) {
        setInputCaret((c) => Math.min(inputUnits(input).length, c + 1))
        return
      }
      if (key.home) {
        setInputCaret(0)
        return
      }
      if (key.end) {
        setInputCaret(inputUnits(input).length)
        return
      }
    }

    if (overlay === 'none' && (key.upArrow || key.downArrow)) {
      // Alternate-scroll wheel (mode 1007) → arrow keys; scroll when viewing history or empty input.
      if (
        histMaxScrollRef.current > 0 &&
        (!input.trim() || histScrollRef.current > 0)
      ) {
        scrollHistBy(key.upArrow ? 3 : -3)
        return
      }
      if (!input.trim()) {
        moveThoughtFocus(key.upArrow ? -1 : 1)
        return
      }
      // D-04: single-line input — ↑↓ recall history (not wrap).
      if (!input.includes('\n')) {
        recallInput(key.upArrow ? -1 : 1)
        return
      }
      const wrapCaret = moveCaretWrapLine(
        PROMPT_PREFIX,
        input,
        inputCaret,
        cols,
        key.upArrow ? -1 : 1
      )
      if (wrapCaret !== null) {
        setInputCaret(wrapCaret)
        return
      }
      recallInput(key.upArrow ? -1 : 1)
      return
    }

    if (key.return) {
      if (!input.trim()) {
        toggleFocusedThought()
        return
      }
      const priority = key.ctrl ? 'now' : uiState === 'running' ? 'next' : undefined
      void send(input, priority)
      return
    }
    if (key.backspace || key.delete) {
      const units = inputUnits(input)
      // Windows Backspace is \x7f → Ink reports key.delete, not key.backspace.
      // Delete-at-caret would no-op when the caret is at the end (normal typing).
      if (inputCaret > 0) {
        units.splice(inputCaret - 1, 1)
        writeInput(units.join(''), inputCaret - 1)
      }
      if (units.length <= 1) closeOverlay()
      return
    }
    if (key.tab && (overlay === 'slash' || overlay === 'at')) {
      if (overlay === 'slash' && slashFilter[overlayIndex]) {
        writeInput(`/${slashFilter[overlayIndex]} `)
        closeOverlay()
        return
      }
      if (overlay === 'at' && atFiles[overlayIndex]) {
        writeInput(input.replace(/@[^@]*$/, `@${atFiles[overlayIndex]}`))
        closeOverlay()
        return
      }
    }
    if (overlay === 'slash' && (key.upArrow || key.downArrow)) {
      setOverlayIndex((i) => {
        const n = key.upArrow ? i - 1 : i + 1
        const max = Math.max(1, slashFilter.length)
        return (n + max) % max
      })
      return
    }
    if (overlay === 'at' && (key.upArrow || key.downArrow)) {
      setOverlayIndex((i) => {
        const n = key.upArrow ? i - 1 : i + 1
        const max = Math.max(1, atFiles.length)
        return (n + max) % max
      })
      return
    }
    if (ch && !key.ctrl) {
      const units = inputUnits(input)
      const insert = inputUnits(ch)
      units.splice(inputCaret, 0, ...insert)
      const next = units.join('')
      writeInput(next, inputCaret + insert.length)
      if (next === '/') {
        setOverlay('slash')
        setOverlayIndex(0)
      } else if (next.endsWith('@')) {
        void loadAtFiles().then((files) => {
          setAtFiles(files)
          setOverlay('at')
          setOverlayIndex(0)
        })
      } else if (overlay === 'slash' && !next.startsWith('/')) {
        closeOverlay()
      }
    }
  })

  function setupField(): SetupField {
    return SETUP_FIELDS[setupStep] ?? 'apiBaseUrl'
  }

  async function advanceSetup() {
    const field = setupField()
    let contextWindow: number | undefined
    if (field === 'contextWindow') {
      const preset = CONTEXT_WINDOW_PRESETS[setupContextPick]!
      if (preset.value > 0) {
        contextWindow = preset.value
      } else {
        contextWindow = Number(setupDraft.contextWindow.replace(/_/g, ''))
        if (!contextWindow || contextWindow < 4096 || contextWindow > 20_000_000) {
          setSetupError(l('自定义窗口请填写 4096–20000000 之间的整数', 'Enter an integer between 4096 and 20000000'))
          return
        }
      }
    } else {
      const value = setupDraft[field].trim()
      if (!value) {
        setSetupError(l(`请先填写「${SETUP_STEPS[setupStep]!.title}」`, 'This field cannot be empty'))
        return
      }
    }
    if (setupStep < SETUP_STEPS.length - 1) {
      setSetupError('')
      const nextStep = setupStep + 1
      if (SETUP_STEPS[nextStep]?.key === 'contextWindow') {
        setSetupContextPick(contextPickFromValue(setupDraft.contextWindow))
      }
      setSetupStep(nextStep)
      return
    }
    setSetupBusy(true)
    setSetupError('')
    try {
      const test = await testLlm({
        apiBaseUrl: setupDraft.apiBaseUrl,
        apiKey: setupDraft.apiKey,
        model: setupDraft.model
      })
      if (!test.ok) {
        setSetupError(l(`连接失败：${test.message}。修改后按 Enter 重试。`, `Connection failed: ${test.message}. Edit and press Enter to retry.`))
        return
      }
      await putStandalone({
        apiBaseUrl: setupDraft.apiBaseUrl,
        apiKey: setupDraft.apiKey,
        model: setupDraft.model,
        contextWindow,
        llmSetupComplete: true
      })
      setHasKey(true)
      setModel(setupDraft.model)
      setSetupBusy(false)
      closeOverlay()
      flashMsg(l('配置已保存，现在可以直接提问', 'Configuration saved; you can start prompting'))
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e))
    } finally {
      setSetupBusy(false)
    }
  }

  async function applyModel(id: string, writeSettings: boolean) {
    const previousModel = model
    const previousSessionOnlyModel = sessionOnlyModel
    setModel(id)
    setSessionOnlyModel(writeSettings ? null : id)
    flashMsg(
      writeSettings ? `${l('模型', 'model')} → ${id}` : `${l('模型', 'model')} → ${id} ${l('（仅本会话）', '(session)')}`,
      1200,
      theme.accent
    )
    try {
      await setSessionModel(sessionId, { model: id, persist: writeSettings })
    } catch (e) {
      setModel(previousModel)
      setSessionOnlyModel(previousSessionOnlyModel)
      const msg = e instanceof Error ? e.message : String(e)
      flashMsg(`${l('模型切换失败', 'Model switch failed')}：${msg}`, 2000, theme.danger)
      throw e
    }
  }

  function currentModelId(): string {
    return sessionOnlyModel || model
  }

  function hasAssistantOutput(): boolean {
    return history.some((it) => it.kind === 'assistant' && it.text.trim())
  }

  async function requestModelChange(id: string, writeSettings: boolean) {
    if (!id || id === currentModelId()) {
      closeOverlay()
      return
    }
    try {
      if (hasAssistantOutput()) {
        setPendingModel({ id, persist: writeSettings })
        setOverlay('modelConfirm')
        setOverlayIndex(0)
        return
      }
      closeOverlay()
      await applyModel(id, writeSettings)
    } catch {
      closeOverlay()
    }
  }

  async function openModelPicker() {
    try {
      const { models } = await getRegisteredModels()
      if (!models.length) {
        flashMsg(l('尚无注册模型，请先通过 /setup 添加', 'No registered models; add one through /setup'), 2000, theme.warning)
        return
      }
      const ids = models.map((m) => m.model)
      const current = sessionOnlyModel || model
      setModelOptions([...ids, '__setup__'])
      setOverlay('model')
      setOverlayIndex(Math.max(0, ids.indexOf(current)))
      writeInput('')
    } catch (e) {
      flashMsg(e instanceof Error ? e.message : String(e), 1500, theme.danger)
    }
  }

  async function loadAtFiles(): Promise<string[]> {
    const { glob } = await import('glob')
    const files = await glob('**/*', {
      cwd: props.cwd,
      nodir: true,
      ignore: ['node_modules/**', '.git/**', 'dist/**'],
      maxDepth: 4
    })
    return files.slice(0, 40)
  }

  async function confirmOverlay(
    forcedIndex?: number,
    opts?: { sessionOnly?: boolean; acceptWithFeedback?: boolean }
  ) {
    const idx = forcedIndex ?? overlayIndex
    const requiresAck =
      overlay === 'permission' ||
      overlay === 'planEnter' ||
      overlay === 'plan' ||
      overlay === 'trust' ||
      overlay === 'planPreview' ||
      overlay === 'memory' ||
      overlay === 'memoryEdit' ||
      overlay === 'rewind' ||
      overlay === 'elicitation' ||
      overlay === 'browserOnboard' ||
      overlay === 'resume' ||
      overlay === 'ask'
    if (requiresAck) {
      if (overlaySubmittingRef.current) return
      overlaySubmittingRef.current = true
      setOverlaySubmitting(true)
    }
    try {
    if (overlay === 'slash' && slashFilter[idx]) {
      const cmd = slashFilter[idx]!
      writeInput(`/${cmd}`)
      closeOverlay()
      return
    }
    if (overlay === 'at' && atFiles[idx]) {
      writeInput(input.replace(/@[^@]*$/, `@${atFiles[idx]}`))
      closeOverlay()
      return
    }
    if (overlay === 'effort') {
      const next = EFFORTS[idx]!
      const previous = effort
      setEffort(next)
      flashMsg(`${l('思考强度', 'effort')} → ${next}`, 1200, effortColor(next))
      closeOverlay()
      try {
        await putSettings({ effort: next })
      } catch (e) {
        setEffort(previous)
        flashMsg(
          `${l('思考强度保存失败', 'Effort save failed')}：${e instanceof Error ? e.message : String(e)}`,
          2000,
          theme.danger
        )
      }
      return
    }
    if (overlay === 'agents') {
      const next = AGENTS[idx]!
      const previous = agent
      setAgent(next)
      flashMsg(`${l('代理策略', 'agent')} → ${next}`)
      closeOverlay()
      try {
        await putSettings({ agentTier: next })
      } catch (e) {
        setAgent(previous)
        flashMsg(
          `${l('代理策略保存失败', 'Agent setting save failed')}：${e instanceof Error ? e.message : String(e)}`,
          2000,
          theme.danger
        )
      }
      return
    }
    if (overlay === 'mode') {
      const next = MODES[idx]!
      const previous = mode
      setModeState(next)
      flashMsg(`${l('权限模式', 'mode')} → <${modeDisplay(next)}>`, 1200, modeColor(next))
      closeOverlay()
      try {
        const r = await setMode(sessionId, { mode: next })
        if (r.mode !== next) setModeState(r.mode)
      } catch (e) {
        setModeState(previous)
        flashMsg(
          `${l('权限模式切换失败', 'Mode switch failed')}：${e instanceof Error ? e.message : String(e)}`,
          2000,
          theme.danger
        )
      }
      return
    }
    if (overlay === 'model') {
      const picked = modelOptions[idx]
      if (!picked) return
      if (picked === '__setup__') {
        closeOverlay()
        setOverlay('setup')
        setSetupStep(0)
        setSetupError('')
        return
      }
      await requestModelChange(picked, !opts?.sessionOnly)
      return
    }
    if (overlay === 'modelConfirm') {
      const pending = pendingModel
      setPendingModel(null)
      closeOverlay()
      if (idx === 0 && pending) {
        try {
          await applyModel(pending.id, pending.persist)
        } catch {
          /* applyModel already rolled back and reported the failure */
        }
      }
      return
    }
    if (overlay === 'clear') {
      closeOverlay()
      writeInput('')
      if (idx === 0) {
        allowedTypesRef.current = new Set()
        windowAllowRef.current = false
        setHistory([])
        setServerUsage(null)
        setScreenCut(0)
        setThoughtFocus(-1)
        thinkRef.current = null
        toolRef.current = null
        void postChat({
          sessionId: sessionId,
          text: '/clear',
          mode: 'slash',
          onEvent: applyEvent
        })
      }
      return
    }
    if (overlay === 'permission' && perm) {
      const decisions = ['allow', 'allow_session', 'allow_always', 'deny'] as const
      const decision = decisions[idx]!
      if (decision !== 'deny') {
        setHistory((h) => {
          const copy = h.map((x) =>
            x.kind === 'tool' ? { kind: 'tool' as const, tool: { ...x.tool } } : x
          )
          for (let i = copy.length - 1; i >= 0; i--) {
            const it = copy[i]
            if (it?.kind === 'tool' && it.tool.state === 'waiting') {
              it.tool.state = 'running'
              toolRef.current = it.tool
              break
            }
          }
          return copy
        })
      }
      if (decision === 'allow_session') {
        allowedTypesRef.current.add(permissionClass(perm.toolName))
      } else if (decision === 'allow_always') {
        windowAllowRef.current = true
      }
      await sendPermission(sessionId, {
        requestId: perm.requestId,
        decision,
        toolName: perm.toolName,
        input: perm.input
      })
      setPerm(null)
      closeOverlay()
      if (decision === 'allow_session') {
        flashMsg(
          l(
            `本类型已放行（同类不再问）`,
            `This operation type allowed (same type will not ask again)`
          ),
          1800,
          theme.success
        )
      } else if (decision === 'allow_always') {
        flashMsg(
          l(
            `本窗口已放行（仅删除操作仍会询问）`,
            `This window allowed (only delete operations will still ask)`
          ),
          2000,
          theme.success
        )
      }
      return
    }
    if (overlay === 'planEnter' && planEnter) {
      await sendPlanDecision(sessionId, {
        requestId: planEnter.requestId,
        decision: idx === 0 ? 'approve' : 'reject'
      })
      setPlanEnter(null)
      closeOverlay()
      return
    }
    if (overlay === 'plan' && plan) {
      const rows = planExitRows()
      if (opts?.acceptWithFeedback) {
        await sendPlanDecision(sessionId, {
          requestId: plan.requestId,
          decision: 'approve',
          mode: 'acceptEdits',
          message: planFeedback.trim() || undefined,
          plan: plan.plan,
          planWasEdited: plan.plan !== plan.initialPlan
        })
        setPlan(null)
        setPlanFeedback('')
        closeOverlay()
        return
      }
      const row = rows[idx] ?? rows[0]
      if (!row) return
      if (row.id === 'no-keep') {
        const feedback = planFeedback.trim()
        if (!feedback) {
          overlaySubmittingRef.current = false
          setOverlaySubmitting(false)
          return
        }
        await sendPlanDecision(sessionId, {
          requestId: plan.requestId,
          decision: 'reject',
          rejectAction: 'keep_planning',
          message: feedback,
          plan: plan.plan,
          planWasEdited: plan.plan !== plan.initialPlan
        })
        setPlan(null)
        setPlanFeedback('')
        closeOverlay()
        return
      }
      const choice = planExitChoice(row.id)
      await sendPlanDecision(sessionId, {
        requestId: plan.requestId,
        decision: choice.decision,
        mode: choice.mode,
        message: planFeedback.trim() || undefined,
        plan: plan.plan,
        planWasEdited: plan.plan !== plan.initialPlan
      })
      setPlan(null)
      setPlanFeedback('')
      closeOverlay()
      return
    }
    if (overlay === 'trust') {
      if (idx === 0) {
        await trustCwdPersist(props.cwd)
        setCwdTrusted(true)
        closeOverlay()
      } else if (idx === 1) {
        trustOnceRef.current = true
        setCwdTrusted(true)
        closeOverlay()
      } else {
        exit()
      }
      return
    }
    if (overlay === 'theme') {
      const id = THEME_IDS[idx]!
      applyTheme(id)
      setThemeRevision((n) => n + 1)
      void saveCliPrefs({ theme: id })
      flashMsg(`${l('终端主题', 'theme')} → ${themeDisplay(id)}`, 1200, theme.cyan)
      closeOverlay()
      return
    }
    if (overlay === 'language') {
      const language = CLI_LANGUAGES[idx]!
      applyLanguage(language)
      setLanguageRevision((n) => n + 1)
      void saveCliPrefs({ language })
      flashMsg(l('界面语言 → 中文', 'Language → English'), 1200, theme.cyan)
      closeOverlay()
      return
    }
    if (overlay === 'planPreview' && planPreview) {
      if (idx === 0) {
        try {
          await putSessionPlan(sessionId, planPreview.content)
          flashMsg(l('计划已保存', 'plan saved'), 1200, theme.success)
        } catch (e) {
          flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
          return
        }
      }
      setPlanPreview(null)
      closeOverlay()
      return
    }
    if (overlay === 'memory') {
      const pick = memoryFiles[idx]
      if (!pick) {
        closeOverlay()
        return
      }
      try {
        const r = await readMemory(pick.rel, props.cwd)
        setMemoryEdit({
          rel: r.rel,
          content: r.content,
          initial: r.content,
          editing: false
        })
        setOverlay('memoryEdit')
        setOverlayIndex(0)
      } catch (e) {
        flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
      }
      return
    }
    if (overlay === 'memoryEdit' && memoryEdit) {
      if (idx === 0) {
        try {
          await writeMemory(memoryEdit.rel, memoryEdit.content, props.cwd)
          flashMsg(l('记忆已保存', 'memory saved'), 1200, theme.success)
        } catch (e) {
          flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
          return
        }
      } else if (idx === 1) {
        try {
          await deleteMemory(memoryEdit.rel, props.cwd)
          flashMsg(l('记忆已删除', 'memory deleted'), 1200, theme.fgMuted)
          setMemoryEdit(null)
          await openMemoryList()
        } catch (e) {
          flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
        }
        return
      }
      setMemoryEdit(null)
      closeOverlay()
      return
    }
    if (overlay === 'rewind') {
      const pick = rewindSnapshots[idx]
      if (!pick) {
        closeOverlay()
        return
      }
      try {
        const r = await rewindSession(sessionId, { messageId: pick.messageId })
        if (!r.ok) {
          flashMsg(r.error || 'rewind failed', 2000, theme.danger)
          return
        }
        flashMsg(
          r.filesChanged?.length
            ? l(`已回退 · ${r.filesChanged.length} 个文件`, `rewind · ${r.filesChanged.length} files`)
            : l('已回退 · 无文件变化', 'rewind · no file changes'),
          1600,
          theme.cyan
        )
      } catch (e) {
        flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
        return
      }
      setRewindSnapshots([])
      closeOverlay()
      return
    }
    if (overlay === 'elicitation' && elicitation) {
      const actions: Array<'accept' | 'decline' | 'cancel'> = [
        'accept',
        'decline',
        'cancel'
      ]
      const action = actions[idx] ?? 'cancel'
      try {
        await respondElicitation(elicitation.requestId, action)
        flashMsg(`${l('MCP 输入请求', 'elicitation')} → ${action}`, 1200, theme.fgMuted)
      } catch (e) {
        flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
        return
      }
      setElicitation(null)
      setUiState('idle')
      closeOverlay()
      return
    }
    if (overlay === 'browserOnboard' && browserOnboard) {
      const opt = browserOnboard.options[idx] ?? browserOnboard.options[0]
      const choice = (opt?.id ?? 'later') as
        | 'open_store'
        | 'installed'
        | 'isolated'
        | 'later'
        | 'never'
      try {
        if (choice === 'open_store') {
          await openBrowserOnboardingStore()
          flashMsg(l('已打开扩展商店', 'Opened extension store'), 1400, theme.cyan)
          return
        }
        await respondBrowserOnboarding(browserOnboard.requestId, choice)
        flashMsg(
          l('浏览器引导', 'browser setup') +
            ' → ' +
            l(opt?.labelZh ?? '', opt?.labelEn ?? ''),
          1400,
          theme.fgMuted
        )
      } catch (e) {
        flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
        return
      }
      setBrowserOnboard(null)
      setUiState('idle')
      closeOverlay()
      return
    }
    if (overlay === 'cron') {
      flashMsg(
        cronDue.length
          ? l(`定时任务 · ${cronDue.length} 项已入队`, `cron · ${cronDue.length} job(s) queued`)
          : l('定时任务已关闭', 'cron dismissed'),
        1400,
        theme.fgMuted
      )
      setCronDue([])
      closeOverlay()
      return
    }
    if (overlay === 'resume') {
      const newRow = props.attachPickSession && idx === resumeSessions.length
      if (newRow) {
        flashMsg(l('新建会话', 'new session'), 1200, theme.fgMuted)
      } else {
        const pick = resumeSessions[idx]
        if (pick) {
          setSessionId(pick.id)
          await hydrateFromServer(pick.id, true)
          flashMsg(`session ${pick.id.slice(0, 8)}…`, 1200, theme.cyan)
        }
      }
      setResumeSessions([])
      setAttachResumeDone(true)
      closeOverlay()
      return
    }
    if (overlay === 'ask' && ask) {
      const q = currentAskQuestion(ask)
      const opt = displayedAskOptions(ask)[idx]
      let next = ask
      if (q && opt && !isOtherLabel(opt.label)) {
        const picked = q.multiSelect
          ? [...new Set([...(ask.picked[q.question] || []), opt.label])]
          : [opt.label]
        next = {
          ...ask,
          picked: { ...ask.picked, [q.question]: picked },
          otherEditing: false
        }
        setAsk(next)
      }
      const last = next.qIndex >= next.questions.length - 1
      if (!last) {
        setAsk({ ...next, qIndex: next.qIndex + 1, otherEditing: false })
        setOverlayIndex(0)
        overlaySubmittingRef.current = false
        setOverlaySubmitting(false)
        return
      }
      const payload = buildAskAnswerPayload(next)
      const hasAny = Object.values(payload.answers).some((a) => a.trim())
      if (!hasAny) {
        overlaySubmittingRef.current = false
        setOverlaySubmitting(false)
        return
      }
      await sendAskAnswer(sessionId, {
        requestId: ask.requestId,
        ...payload
      })
      setAsk(null)
      closeOverlay()
    }
    } catch (e) {
      flashMsg(e instanceof Error ? e.message : String(e), 2000, theme.danger)
    } finally {
      if (requiresAck) {
        overlaySubmittingRef.current = false
        setOverlaySubmitting(false)
      }
    }
  }

  const tokens = serverUsage?.tokens ?? estimateTokens(history)
  const usageWindow = serverUsage?.contextWindow ?? windowTokens
  const contextPct = Math.max(
    0,
    Math.min(100, Math.round((tokens / Math.max(1, usageWindow)) * 100))
  )
  const dashH = cols < 72 ? 2 : 1
  const promptLines = caretToWrap(
    PROMPT_PREFIX,
    input,
    inputUnits(input).length,
    cols
  ).lines
  const chromeH = 2 + promptLines + dashH
  const overlayReserve =
    overlay === 'setup'
        ? 15
        : overlay === 'webset'
        ? 16
        : overlay === 'effort'
        ? 10
        : overlay === 'slash'
          ? 8
          : overlay === 'plan' || overlay === 'ask' || overlay === 'browserOnboard'
            ? 22
            : overlay === 'planPreview' ||
              overlay === 'memoryEdit'
            ? 16
            : overlay === 'memory'
              ? 10
              : overlay === 'rewind' || overlay === 'elicitation' || overlay === 'cron'
                ? 10
                : overlay === 'trust'
              ? 9
              : overlay === 'modelConfirm'
              ? 7
              : overlay !== 'none'
                ? 8
                : 0
  const histH = Math.max(
    overlay === 'setup' || overlay === 'webset' ? 7 : 6,
    rows - chromeH - (queued.length ? 1 : 0) - (flash ? 1 : 0) - overlayReserve
  )
  const empty = displayHistory.length === 0
  const showLogo = empty && history.length === 0 && cols >= 48
  const histBudget = Math.max(4, histH - (showLogo ? 6 : 3))
  const histReserveScrollbar =
    overlay !== 'transcript' && displayHistory.length > 0 && !showLogo
  const contentCols = histReserveScrollbar ? Math.max(16, cols - 1) : cols
  const histWin = sliceHistoryWindow(displayHistory, histBudget, histScroll, contentCols)
  histMaxScrollRef.current = histWin.maxScroll
  const showHistScrollbar = histReserveScrollbar && histWin.maxScroll > 0
  const histView = histWin.view
  const showScrollHint = overlay !== 'transcript' && histWin.maxScroll > 0
  const showUnseenHint = overlay !== 'transcript' && unseenBelow > 0 && histScroll > 0
  const viewportStyledLines = useMemo(() => {
    if (overlay === 'transcript' || showLogo) return []
    return buildVisibleViewportStyledLines(histView, contentCols, (itemIndex) => {
      const it = displayHistory[itemIndex]
      const prev = itemIndex > 0 ? displayHistory[itemIndex - 1] : undefined
      return it?.kind === 'you' && prev?.kind !== undefined
    })
  }, [overlay, showLogo, histView, contentCols, displayHistory])
  viewportStyledRef.current = viewportStyledLines
  viewportLinesRef.current = viewportStyledLines.map((line) => line.text)
  contentColsRef.current = contentCols
  originRow1Ref.current = historyContentOriginRow1({
    showLogo,
    showEmptyCwd: empty && history.length === 0,
    showScrollHint,
    showUnseenHint
  })
  const pulseCh = PULSE_FRAMES[pulse % PULSE_FRAMES.length]
  const blocked = uiState === 'requires_action'
  const lastHist = history[history.length - 1]
  const showRunningLine =
    uiState === 'running' && overlay === 'none' && lastHist?.kind !== 'assistant'
  const chromePills = useMemo(
    () => formatChromePills(todos, bgAgents, cols),
    [todos, bgAgents, cols, languageRevision]
  )
  const canTypeMain = overlay !== 'setup' && overlay !== 'webset' && !blocked && cwdTrusted
  const transcriptLines = useMemo(
    () => historyToTranscript(history),
    [history, languageRevision]
  )
  transcriptLinesRef.current = transcriptLines
  histBudgetRef.current = histBudget
  const transcriptMatches = useMemo(
    () => findTranscriptMatches(transcriptLines, transcriptSearchQuery),
    [transcriptLines, transcriptSearchQuery]
  )
  const transcriptWin = useMemo(() => {
    const budget = Math.max(4, histBudget)
    const maxScroll = Math.max(0, transcriptLines.length - budget)
    const scroll = Math.max(0, Math.min(transcriptScroll, maxScroll))
    return {
      lines: transcriptLines.slice(scroll, scroll + budget),
      lineOffset: scroll,
      maxScroll,
      scroll
    }
  }, [transcriptLines, transcriptScroll, histBudget])
  const currentMatchLine =
    transcriptMatches.length > 0
      ? transcriptMatches[Math.min(transcriptMatchIdx, transcriptMatches.length - 1)]
      : undefined

  return (
    <Box
      key={`theme-${themeRevision}-language-${languageRevision}`}
      flexDirection="column"
      width={cols}
      height={rows}
      backgroundColor={theme.bg}
    >
      <Box flexDirection="column" height={histH} overflow="hidden" flexGrow={1}>
        {showLogo ? (
          <PixelAckemLogo />
        ) : (
          <AckemCodeTitle
            suffix={
              <>
                {' '}
                <Text color={theme.fgMuted}>{props.cwd}</Text>
              </>
            }
          />
        )}
        {empty && history.length === 0 ? <Text color={theme.fgMuted}>{props.cwd}</Text> : null}
        {overlay === 'transcript' ? (
          <>
            <Text color={theme.cyan}>
              {transcriptSearchActive
                ? `${l('搜索', 'Search')}: ${transcriptSearchQuery}_ · ${l('Enter/Ctrl+R 下一个 · ↑↓ 上/下 · Esc 取消', 'Enter/Ctrl+R next · ↑↓ previous/next · Esc cancel')}${
                    transcriptSearchQuery.trim()
                      ? transcriptMatches.length
                        ? `  (${transcriptMatchIdx + 1}/${transcriptMatches.length})`
                        : l('  （无匹配）', '  (no matches)')
                      : ''
                  }`
                : `${l('记录', 'Transcript')} · ${l('Ctrl+O 关闭 · Ctrl+R 搜索 · 滚轮滚动', 'Ctrl+O close · Ctrl+R search · mouse wheel scroll')}${
                    transcriptWin.maxScroll > 0
                      ? `  (${transcriptWin.scroll}/${transcriptWin.maxScroll})`
                      : ''
                  }`}
            </Text>
            {transcriptWin.lines.map((ln, i) => {
              const absLine = transcriptWin.lineOffset + i
              const isYou = ln.startsWith(l('你', 'you'))
              const hl =
                transcriptSearchActive && transcriptSearchQuery.trim()
                  ? splitTranscriptHighlight(ln, transcriptSearchQuery)
                  : null
              const isCurrent = absLine === currentMatchLine
              if (hl) {
                return (
                  <Text
                    key={`tr-${i}`}
                    color={isYou ? theme.fg : theme.fgMuted}
                    backgroundColor={isCurrent ? theme.border : undefined}
                  >
                    {hl.before}
                    <Text backgroundColor={theme.cyan} color={theme.bg}>
                      {hl.match}
                    </Text>
                    {hl.after || (hl.before || hl.match ? '' : ' ')}
                  </Text>
                )
              }
              return (
                <Text
                  key={`tr-${i}`}
                  color={isYou ? theme.fg : theme.fgMuted}
                  backgroundColor={isCurrent ? theme.border : undefined}
                >
                  {ln || ' '}
                </Text>
              )
            })}
          </>
        ) : null}
        {overlay !== 'transcript' && unseenBelow > 0 && histScroll > 0 ? (
          <Text color={theme.cyan}>↓ {unseenBelow} {l('条新内容 · 滚轮向下回到底部', 'new · scroll down to latest')}</Text>
        ) : overlay !== 'transcript' && histWin.maxScroll > 0 ? (
          <Text color={theme.fgMuted}>
            {l('滚轮翻看历史', 'Mouse wheel to browse history')}
            {histWin.hiddenAbove > 0 ? l(` · 上方还有 ${histWin.hiddenAbove} 行`, ` · ${histWin.hiddenAbove} lines above`) : ''}
            {process.env.ACKEM_DISABLE_MOUSE === '1'
              ? l(' · 拖选复制 · 滚轮用 PgUp/PgDn', ' · drag to copy · PgUp/PgDn to scroll')
              : l(' · 拖选复制 · Ctrl+C', ' · drag to copy · Ctrl+C')}
            {histScroll > 0 ? l(' · Ctrl+End 回到底部', ' · Ctrl+End latest') : ''}
          </Text>
        ) : null}
        {overlay !== 'transcript' ? (
          <Box flexDirection="row" width={cols} flexGrow={1}>
            <Box flexDirection="column" width={contentCols} flexGrow={1}>
              {viewportStyledLines.map((ln, i) => (
                <Box key={`hist-${i}`} height={1} flexShrink={0}>
                  <SelectableLine
                    text={ln.text}
                    spans={ln.spans}
                    lineIndex={i}
                    selection={textSelection}
                    color={theme.fg}
                    backgroundColor={
                      ln.bar === 'user' ? theme.userMessageBg : undefined
                    }
                  />
                </Box>
              ))}
            </Box>
            {showHistScrollbar ? (
              <HistoryScrollbar
                trackHeight={histBudget}
                scroll={histWin.scroll}
                maxScroll={histWin.maxScroll}
              />
            ) : null}
          </Box>
        ) : null}
      </Box>

      {chromePills && overlay === 'none' ? (
        <Text color={theme.cyan}>{chromePills}</Text>
      ) : null}
      {queued.length > 0 ? (
        <Text color={theme.fgMuted}>
          {l('排队', 'queued')} {queued.length} · {l('下一条', 'next')}: {queued[0]!.text.slice(0, 40)}
        </Text>
      ) : null}
      {flash ? <Text color={flash.color}>{flash.text}</Text> : null}

      {overlay !== 'none' && overlay !== 'transcript' ? (
        <Box flexShrink={0}>
          <OverlayBox
            overlay={overlay}
            index={overlayIndex}
            slashFilter={slashFilter}
            atFiles={atFiles.slice(0, 5)}
            effort={effort}
            modelOptions={modelOptions}
            currentModel={sessionOnlyModel || model}
            perm={perm}
            plan={plan}
            planEditing={planEditing}
            planPreview={planPreview}
            memoryDir={memoryDir}
            memoryFiles={memoryFiles}
            memoryEdit={memoryEdit}
            rewindSnapshots={rewindSnapshots}
            elicitation={elicitation}
            browserOnboard={browserOnboard}
            cronDue={cronDue}
            cwd={props.cwd}
            pendingModel={pendingModel}
            planEnter={planEnter}
            ask={ask}
            planFeedback={planFeedback}
            setupStep={setupStep}
            setupContextPick={setupContextPick}
            setupDraft={setupDraft}
            setupError={setupError}
            setupBusy={setupBusy}
            webSetIndex={webSetIndex}
            webSetKey={webSetKey}
            webSetError={webSetError}
            webSetBusy={webSetBusy}
            resumeSessions={resumeSessions}
            attachPickSession={Boolean(props.attachPickSession)}
            pulse={pulse}
            termRows={rows}
            chromeH={chromeH}
          />
          {overlaySubmitting ? <Text color={theme.cyan}>{l('处理中，请稍候…', 'Working, please wait…')}</Text> : null}
        </Box>
      ) : null}

      {showRunningLine ? (
        <RunningStatusLine startedAt={turnStartedAt.current} pulseTick={pulse} />
      ) : null}

      <Box flexDirection="column" flexShrink={0}>
        {overlay === 'setup' || overlay === 'webset' ? (
          <>
            <Text color={theme.promptBorder}>{'─'.repeat(Math.max(8, cols - 1))}</Text>
            <Text color={theme.fgMuted}>{l('请在上方蓝框中输入', 'Type in the blue box above')}</Text>
            <Text color={theme.promptBorder}>{'─'.repeat(Math.max(8, cols - 1))}</Text>
          </>
        ) : (
          <PromptFrame cols={cols}>
            {blocked ? (
              <Text>
                <Text color={theme.fg}>{PROMPT_PREFIX}</Text>
                <Text color={theme.fgMuted}>{l('请先处理上方对话框', 'Complete the dialog above first')}</Text>
              </Text>
            ) : (
              <PromptLine
                input={input}
                caret={inputCaret}
                hasKey={hasKey}
                cols={cols}
                rows={rows}
                pulseTick={pulse}
                active={canTypeMain}
              />
            )}
          </PromptFrame>
        )}
        <StatusBar
          cols={cols}
          model={sessionOnlyModel || model}
          modelConfigured={hasKey}
          sessionOnly={Boolean(sessionOnlyModel)}
          effort={effort}
          agent={agent}
          mode={mode}
          tokens={tokens}
          contextPct={contextPct}
          usageSource={serverUsage?.source}
          foldHint={thoughtFocus >= 0 && overlay === 'none'}
          webSearchReady={webSearchReady}
        />
      </Box>
    </Box>
  )
}

function RunningStatusLine(props: { startedAt: number; pulseTick: number }): React.ReactElement {
  const sec = Math.max(1, Math.round((Date.now() - props.startedAt) / 1000))
  return (
    <Text color={theme.fgMuted}>
      <PulseBarsGlyph pulse={props.pulseTick} startedAt={props.startedAt} />
      {l(` 执行中… ${sec}s`, ` Working… ${sec}s`)}
    </Text>
  )
}

function StatusBar(props: {
  cols: number
  model: string
  modelConfigured?: boolean
  sessionOnly?: boolean
  effort: EffortLevel
  agent: string
  mode: PermissionMode
  tokens: number
  contextPct: number
  usageSource?: 'api' | 'estimate'
  foldHint?: boolean
  webSearchReady?: boolean
}): React.ReactElement {
  const unset = l('暂未配置', 'Not configured')
  const raw = !props.modelConfigured
    ? unset
    : props.sessionOnly
      ? `${props.model}(session)`
      : props.model || unset
  const model = raw.length > 20 ? `${raw.slice(0, 19)}…` : raw
  const gap = '  '
  const left = (
    <>
      <Text color={theme.fg}>{l('模型', 'model')}:{model}{gap}</Text>
      <Text color={theme.fg}>{l('强度', 'effort')}:{props.effort}{gap}</Text>
      <Text color={theme.fg}>{l('代理', 'agent')}:{props.agent}{gap}</Text>
      <Text color={modeColor(props.mode)}>&lt;{modeDisplay(props.mode)}&gt;</Text>
    </>
  )
  const right = (
    <>
      <Text color={theme.fg}>
        token:{props.usageSource === 'estimate' ? '~' : ''}
        {formatTokenCount(props.tokens)}
        {gap}
      </Text>
      <Text color={theme.fg}>
        {l('上下文', 'context')}:
        <Text color={contextPressureColor(props.contextPct)}>{props.contextPct}%</Text>
      </Text>
      {props.foldHint ? (
        <Text color={theme.fgMuted}>
          {gap}
          {l('Enter 展开  Ctrl+O 全文', 'Enter expand  Ctrl+O transcript')}
        </Text>
      ) : null}
    </>
  )
  const search = (
    <Text color={props.webSearchReady ? theme.success : theme.warning}>
      {webSearchStatusLabel(Boolean(props.webSearchReady), props.cols)}
    </Text>
  )
  if (props.cols < 72) {
    return (
      <Box flexDirection="column" width={Math.max(8, props.cols - 1)} flexShrink={0}>
        <Text>{left}</Text>
        <Text>{right}</Text>
        <Box justifyContent="flex-end">{search}</Box>
      </Box>
    )
  }
  return (
    <Box
      width={Math.max(8, props.cols - 1)}
      justifyContent="space-between"
      flexShrink={0}
    >
      <Box flexShrink={1} marginRight={1}>
        <Text wrap="truncate">
          {left}
          <Text>{gap}</Text>
          {right}
        </Text>
      </Box>
      <Box flexShrink={0}>{search}</Box>
    </Box>
  )
}

function itemLineCount(it: HistoryItem, cols: number): number {
  const w = Math.max(16, cols - 2)
  if (it.kind === 'you') {
    return Math.max(1, wrapPromptLines(PROMPT_PREFIX + it.text, cols).length)
  }
  if (it.kind === 'assistant') {
    return Math.max(1, terminalMarkdownLineCount(it.text, cols))
  }
  if (it.kind === 'status') {
    return Math.max(
      1,
      it.text.split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(stringDisplayWidth(ln || ' ') / w)), 0)
    )
  }
  if (it.kind === 'tool') {
    return toolLineCount(it.tool, cols, it.tool.expanded)
  }
  if (it.kind === 'feedback') {
    return feedbackLineCount(it.feedback, cols, it.feedback.expanded)
  }
  if (it.kind === 'steps') {
    let n = 1
    if (it.steps.expanded) {
      n += collapseReadTools(it.steps.tools).length
      if (it.steps.changed.length) n += 1
    }
    return n
  }
  if (it.kind === 'tool_group') {
    if (!toolGroupExpanded(it.tools)) return 1
    return 1 + it.tools.length
  }
  const th = it.thought
  let n = 1
  if (th.expanded) n += thoughtBodyLineCount(th.thinking, cols)
  return n
}

function sliceHistoryWindow(
  items: HistoryItem[],
  maxLines: number,
  scrollFromBottom: number,
  cols: number
): {
  view: Array<{
    item: HistoryItem
    itemIndex: number
    skipTop: number
    visibleLines: number
  }>
  hiddenAbove: number
  scroll: number
  maxScroll: number
} {
  const counts = items.map((it, index) => lineCountForHistoryItem(it, cols, index))
  const total = counts.reduce((a, b) => a + b, 0)
  const maxScroll = Math.max(0, total - maxLines)
  const scroll = Math.max(0, Math.min(scrollFromBottom, maxScroll))
  const end = total - scroll
  const start = Math.max(0, end - maxLines)
  const view: Array<{
    item: HistoryItem
    itemIndex: number
    skipTop: number
    visibleLines: number
  }> = []
  let acc = 0
  for (let i = 0; i < items.length; i++) {
    const next = acc + counts[i]!
    if (next > start && acc < end) {
      const overlapStart = Math.max(start, acc)
      const overlapEnd = Math.min(end, next)
      view.push({
        item: items[i]!,
        itemIndex: i,
        skipTop: overlapStart - acc,
        visibleLines: Math.max(1, overlapEnd - overlapStart)
      })
    }
    acc = next
  }
  return { view, hiddenAbove: start > 0 ? start : 0, scroll, maxScroll }
}

function isThinkNoise(text: string): boolean {
  return /^(理解任务|正在调用模型|继续执行|准备执行工具|执行\s|thinking)/i.test(
    text.trim()
  )
}

const WSL_NOISE =
  /execvpe\(\/bin\/bash\)|WSL.*ERROR|Relay.*ERROR|CreateProcessCommon|localhost.*WSL|�hKm0R/i

function formatAgentError(message: string): string {
  const t = message.trim()
  if (/^(terminated|aborted)$/i.test(t) || /operation was aborted/i.test(t)) {
    return l('模型连接中断，请再试一次。', 'Model connection dropped — try again.')
  }
  return message
}

function sanitizeToolOutput(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((ln) => ln.trimEnd())
    .filter((ln) => ln.trim() && !WSL_NOISE.test(ln))
    .map((ln) =>
      /^terminated$/i.test(ln.trim())
        ? l('命令被中止。', 'Command was terminated.')
        : ln
    )
  return lines.join('\n').trim()
}

function toolOutputPreview(te: ToolEntry): { lineCount: number; preview: string } {
  const lines = sanitizeToolOutput(te.output).split('\n').filter(Boolean)
  if (!lines.length) return { lineCount: 0, preview: '' }
  return { lineCount: lines.length, preview: lines[0]! }
}

function toolLineCount(te: ToolEntry, _cols: number, expanded: boolean): number {
  const { lineCount, preview } = toolOutputPreview(te)
  if (!expanded) return preview ? 2 : 1
  const cap = 6
  return 1 + Math.min(lineCount, cap) + (lineCount > cap ? 1 : 0)
}

function feedbackLineCount(fb: Feedback, cols: number, expanded: boolean): number {
  if (!expanded) return 1
  const lines = sanitizeToolOutput(fb.output).split('\n').filter(Boolean)
  const cap = 6
  return 1 + Math.min(lines.length, cap) + (lines.length > cap ? 1 : 0)
}

function feedbackPreview(fb: Feedback): { lineCount: number; preview: string } {
  const lines = sanitizeToolOutput(fb.output).split('\n').filter(Boolean)
  if (!lines.length) return { lineCount: 0, preview: '' }
  return { lineCount: lines.length, preview: lines[0]! }
}

function formatStatusText(message: string): string | null {
  const raw = message.replace(/\r\n/g, '\n').trimEnd()
  if (!raw.trim()) return null
  if (
    /^(thinking[.…]+|continue \(turn|SessionStart hook|hook blocked|hook denied|api fallback|streaming )/i.test(
      raw
    )
  ) {
    return null
  }
  const lines = raw.split('\n')
  if (lines.length > 40) {
    return `${lines.slice(0, 40).join('\n')}\n… (+${lines.length - 40} lines)`
  }
  return raw
}

function collapseReadTools(tools: ToolLine[]): Array<{ label: string; last: boolean }> {
  return collapseReadToolsForCli(
    tools.map((t) => ({ name: t.name, path: t.path, input: undefined }))
  )
}

const THINKING_MAX_LINES = 40
const THINKING_SHIMMER_DELAY_MS = 3000

function wrapDisplayLines(text: string, width: number, maxLines: number): { lines: string[]; clipped: boolean } {
  const lines: string[] = []
  const w = Math.max(8, width)
  const paras = text.replace(/\r\n/g, '\n').split('\n')
  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi]!
    if (!para) {
      lines.push('')
      if (lines.length >= maxLines) return { lines, clipped: pi < paras.length - 1 }
      continue
    }
    let buf = ''
    let bufW = 0
    const chars = [...para]
    for (let ci = 0; ci < chars.length; ci++) {
      const ch = chars[ci]!
      const cw = stringDisplayWidth(ch)
      if (buf && bufW + cw > w) {
        lines.push(buf)
        if (lines.length >= maxLines) {
          return { lines, clipped: ci < chars.length || pi < paras.length - 1 }
        }
        buf = ch
        bufW = cw
      } else {
        buf += ch
        bufW += cw
      }
    }
    lines.push(buf)
    if (lines.length >= maxLines) return { lines, clipped: pi < paras.length - 1 }
  }
  return { lines, clipped: false }
}

function thoughtBodyLineCount(thinking: string, cols: number): number {
  if (!thinking) return 0
  const wrapped = wrapDisplayLines(thinking, Math.max(16, cols - 4), THINKING_MAX_LINES)
  return wrapped.lines.length + (wrapped.clipped ? 1 : 0)
}

function thinkingShimmerColor(startedAt: number, pulseTick: number): string {
  const elapsed = Date.now() - startedAt
  if (elapsed < THINKING_SHIMMER_DELAY_MS) return theme.fgMuted
  const phase = ((pulseTick * 90) / 1000 - THINKING_SHIMMER_DELAY_MS / 1000) * Math.PI
  const t = (Math.sin(phase) + 1) / 2
  return lerpHex(theme.fgDim, theme.fgMuted, t)
}

function UserMessageBar(props: {
  text: string
  cols: number
  leadBlank?: boolean
}): React.ReactElement {
  const w = promptWrapWidth(props.cols)
  const lines = wrapPromptLines(PROMPT_PREFIX + props.text, props.cols)
  return (
    <Box flexDirection="column">
      {props.leadBlank ? <Text> </Text> : null}
      {lines.map((ln, i) => {
        const filled = padToDisplayWidth(ln, w)
        if (i === 0 && filled.startsWith(PROMPT_PREFIX)) {
          return (
            <Text key={i} backgroundColor={theme.userMessageBg}>
              <Text color={theme.fgMuted} backgroundColor={theme.userMessageBg}>
                {PROMPT_PREFIX}
              </Text>
              <Text color={theme.fg} backgroundColor={theme.userMessageBg}>
                {filled.slice(PROMPT_PREFIX.length)}
              </Text>
            </Text>
          )
        }
        return (
          <Text key={i} backgroundColor={theme.userMessageBg} color={theme.fg}>
            {filled}
          </Text>
        )
      })}
    </Box>
  )
}

function FoldPulse(props: {
  expanded: boolean
  running: boolean
  pulseTick?: number
  startedAt?: number
  idleColor: string
}): React.ReactElement {
  if (props.expanded) return <Text color={props.idleColor}>▾</Text>
  if (props.running) {
    return (
      <PulseBarsGlyph pulse={props.pulseTick ?? 0} startedAt={props.startedAt ?? Date.now()} />
    )
  }
  return <Text color={props.idleColor}>›</Text>
}

function HistoryLine(props: {
  item: HistoryItem
  cols: number
  pulse: string
  pulseTick?: number
  running: boolean
  focused?: boolean
  leadBlank?: boolean
  turnStartedAt?: number
}): React.ReactElement {
  const it = props.item
  if (it.kind === 'you') {
    return <UserMessageBar text={it.text} cols={props.cols} leadBlank={props.leadBlank} />
  }
  if (it.kind === 'assistant') {
    return <TerminalMarkdown text={it.text} />
  }
  if (it.kind === 'status') {
    const lines = it.text.split('\n')
    return (
      <Box flexDirection="column">
        {lines.map((ln, i) => (
          <Text key={i} color={theme.fgMuted}>
            {ln || ' '}
          </Text>
        ))}
      </Box>
    )
  }
  if (it.kind === 'tool') {
    const te = it.tool
    const running = te.state === 'running' && props.running
    const waiting = te.state === 'waiting'
    const titleColor = theme.fgMuted
    const dotColor =
      te.state === 'done'
        ? theme.success
        : te.state === 'error'
          ? theme.warning
          : waiting
            ? theme.warning
            : theme.cyan
    const { lineCount, preview } = toolOutputPreview(te)
    const head = `${te.name}${te.summary ? `  ${te.summary}` : ''}`
    const extra =
      !te.expanded && lineCount > 1
        ? l(` · 另有 ${lineCount - 1} 行`, ` · +${lineCount - 1} lines`)
        : !te.expanded && !preview && te.state === 'error'
          ? l(' · 失败', ' · failed')
          : ''
    const suffix = te.rolledBack
      ? l(' · 已回滚', ' · rolled back')
      : te.cancelled
        ? l(' · 已取消', ' · cancelled')
        : ''
    const bodyLines = te.expanded
      ? sanitizeToolOutput(te.output)
          .split('\n')
          .filter(Boolean)
          .slice(0, 6)
      : []
    return (
      <Box flexDirection="column">
        <Text color={titleColor} backgroundColor={props.focused ? theme.accent : undefined}>
          <Text color={dotColor}>{'● '}</Text>
          {head}
          {waiting ? <Text dimColor>{l(' 等待确认…', ' waiting…')}</Text> : null}
          {suffix ? <Text dimColor>{suffix}</Text> : null}
          {!te.expanded ? <Text dimColor>{extra}</Text> : null}
          {' '}
          <FoldPulse
            expanded={te.expanded}
            running={running}
            pulseTick={props.pulseTick}
            startedAt={props.turnStartedAt}
            idleColor={titleColor}
          />
        </Text>
        {!te.expanded && preview ? (
          <Text color={theme.fgDim}>
            {`  ${preview.slice(0, Math.max(20, props.cols - 16))}`}
            {lineCount > 1 ? <Text color={theme.fgDim}>{l(` … 另有 ${lineCount - 1} 行`, ` … +${lineCount - 1} lines`)}</Text> : null}
          </Text>
        ) : null}
        {te.expanded
          ? bodyLines.map((ln, i) => (
              <Text key={i} color={theme.fgDim}>
                {`  ${ln}`}
              </Text>
            ))
          : null}
        {te.expanded && lineCount > bodyLines.length ? (
          <Text dimColor>{l(`  …（另有 ${lineCount - bodyLines.length} 行）`, `  … (+${lineCount - bodyLines.length} lines)`)}</Text>
        ) : null}
        {te.expanded && te.editInput ? (
          <EditDiffView input={te.editInput} cols={props.cols} />
        ) : null}
      </Box>
    )
  }
  if (it.kind === 'feedback') {
    const fb = it.feedback
    const mark = fb.expanded ? '▾' : '›'
    const titleColor = props.focused ? theme.fg : theme.fgMuted
    const { lineCount, preview } = feedbackPreview(fb)
    const head = `${fb.toolName}${fb.path ? `  ${fb.path}` : ''}`
    const extra =
      lineCount > 1
        ? l(` · 另有 ${lineCount - 1} 行`, ` · +${lineCount - 1} lines`)
        : preview
          ? ''
          : l(' ·（空）', ' · (empty)')
    const bodyLines = fb.expanded
      ? sanitizeToolOutput(fb.output)
          .split('\n')
          .filter(Boolean)
          .slice(0, 6)
      : []
    return (
      <Box flexDirection="column">
        <Text color={titleColor} backgroundColor={props.focused ? theme.accent : undefined}>
          <Text color={fb.ok ? theme.success : theme.warning}>{'● '}</Text>
          {head}
          {!fb.ok ? <Text color={theme.warning}>{l(' 失败', ' failed')}</Text> : null}
          {fb.expanded ? null : (
            <Text dimColor>
              {preview ? `  ${preview.slice(0, Math.max(16, props.cols - 24))}` : ''}
              {extra}
            </Text>
          )}
          {' '}
          <Text color={titleColor}>{mark}</Text>
        </Text>
        {fb.expanded
          ? bodyLines.map((ln, i) => (
              <Text key={i} color={theme.fgDim}>
                {`  ${ln}`}
              </Text>
            ))
          : null}
        {fb.expanded && lineCount > bodyLines.length ? (
          <Text dimColor>{l(`  …（另有 ${lineCount - bodyLines.length} 行）`, `  … (+${lineCount - bodyLines.length} lines)`)}</Text>
        ) : null}
      </Box>
    )
  }
  if (it.kind === 'steps') {
    const st = it.steps
    const running = props.running && !st.endedAt
    const titleColor = props.focused ? theme.fg : theme.fgMuted
    const toolRows = collapseReadTools(st.tools)
    const suffix = st.rolledBack
      ? l(' · 已回滚', ' · rolled back')
      : st.cancelled
        ? l(' · 已取消', ' · cancelled')
        : ''
    return (
      <Box flexDirection="column">
        <Text color={titleColor} backgroundColor={props.focused ? theme.accent : undefined}>
          {`${l('步骤', 'Steps')}  ${st.tools.length || 1}${suffix} `}
          <FoldPulse
            expanded={st.expanded}
            running={running}
            pulseTick={props.pulseTick}
            startedAt={props.turnStartedAt}
            idleColor={titleColor}
          />
        </Text>
        {st.expanded ? (
          <>
            {toolRows.map((row, i) => (
              <Text key={i} color={theme.cyan}>
                {`${row.label}${running && row.last ? ` ${props.pulse}` : ''}`}
              </Text>
            ))}
            {st.changed.length ? (
              <Text color={theme.success}>{`  ${l('已修改', 'Changed')}：${st.changed.join(', ')}`}</Text>
            ) : null}
          </>
        ) : null}
      </Box>
    )
  }
  if (it.kind === 'tool_group') {
    const expanded = toolGroupExpanded(it.tools)
    const running = props.running && it.tools.some((t) => t.state === 'running' || t.state === 'waiting')
    const titleColor = props.focused ? theme.fg : theme.fgMuted
    const suffix = it.tools.some((t) => t.rolledBack)
      ? l(' · 已回滚', ' · rolled back')
      : it.tools.some((t) => t.cancelled)
        ? l(' · 已取消', ' · cancelled')
        : ''
    return (
      <Box flexDirection="column">
        <Text color={titleColor} backgroundColor={props.focused ? theme.accent : undefined}>
          <Text color={theme.cyan}>{'● '}</Text>
          {`· ${it.label}${suffix} `}
          <FoldPulse
            expanded={expanded}
            running={running}
            pulseTick={props.pulseTick}
            startedAt={props.turnStartedAt}
            idleColor={titleColor}
          />
        </Text>
        {expanded
          ? it.tools.map((te) => (
              <Text key={te.id} color={theme.fgDim}>
                {`  · ${te.name}${te.summary ? `   ${te.summary}` : ''}`}
              </Text>
            ))
          : null}
      </Box>
    )
  }
  const th = it.thought
  const sec = Math.max(1, Math.round(((th.endedAt ?? Date.now()) - th.startedAt) / 1000))
  const suffix = th.rolledBack
    ? l(' · 已回滚', ' · rolled back')
    : th.cancelled
      ? l(' · 已取消', ' · cancelled')
      : ''
  const running = props.running && !th.endedAt
  const titleColor = theme.fgMuted
  const body = th.expanded && th.thinking
    ? wrapDisplayLines(th.thinking, Math.max(16, props.cols - 4), THINKING_MAX_LINES)
    : null
  const duration = l(`思考了 ${formatThoughtDuration(sec)}`, `thought for ${formatThoughtDuration(sec)}`)
  return (
    <Box flexDirection="column">
      <Text italic color={titleColor} backgroundColor={props.focused ? theme.accent : undefined}>
        {th.expanded ? l('∴ 思考中…', '∴ Thinking…') : l('∴ 思考', '∴ Thinking')}
        {running && !th.expanded ? (
          <Text italic={false} color={thinkingShimmerColor(th.startedAt, props.pulseTick ?? 0)}>
            {l('（思考中）', '  (thinking) ')}
          </Text>
        ) : null}
        {!running ? (
          <Text italic={false} color={titleColor}>
            {`  ${duration}${suffix} `}
          </Text>
        ) : th.expanded ? (
          <Text italic={false} color={titleColor}>
            {`  ${formatThoughtDuration(sec)} `}
          </Text>
        ) : null}
        <FoldPulse
          expanded={th.expanded}
          running={running}
          pulseTick={props.pulseTick}
          startedAt={th.startedAt}
          idleColor={titleColor}
        />
      </Text>
      {th.expanded && body ? (
        <>
          {body.lines.map((ln, i) => (
            <Text key={`t-${i}`} color={theme.fgDim}>
              {`  ${ln || ' '}`}
            </Text>
          ))}
          {body.clipped ? <Text color={theme.fgDim}>{'  …'}</Text> : null}
        </>
      ) : null}
    </Box>
  )
}

function OverlayBox(props: {
  overlay: Overlay
  index: number
  slashFilter: string[]
  atFiles: string[]
  effort: EffortLevel
  modelOptions: string[]
  currentModel: string
  perm: { toolName: string; input: unknown; reason: string } | null
  plan: { plan: string; initialPlan: string } | null
  planEditing: boolean
  planPreview: {
    path: string
    content: string
    initial: string
    editing: boolean
  } | null
  memoryDir: string
  memoryFiles: MemoryFileInfo[]
  memoryEdit: {
    rel: string
    content: string
    initial: string
    editing: boolean
  } | null
  rewindSnapshots: FileHistorySnapshot[]
  elicitation: {
    requestId: string
    serverName: string
    message: string
    url?: string
    mode: 'form' | 'url'
  } | null
  browserOnboard: {
    requestId: string
    storeUrl: string
    titleZh: string
    titleEn: string
    bodyZh: string
    bodyEn: string
    stepsZh: string[]
    stepsEn: string[]
    noteZh: string
    noteEn: string
    options: Array<{ id: string; labelZh: string; labelEn: string }>
  } | null
  cronDue: Array<{ id: string; prompt: string; humanSchedule: string }>
  cwd: string
  pendingModel: { id: string; persist: boolean } | null
  planEnter: { requestId: string } | null
  ask: CliAskState | null
  planFeedback: string
  setupStep: number
  setupContextPick: number
  setupDraft: { apiBaseUrl: string; model: string; apiKey: string; contextWindow: string }
  setupError: string
  setupBusy: boolean
  webSetIndex: number
  webSetKey: string
  webSetError: string
  webSetBusy: boolean
  resumeSessions: SessionListItem[]
  attachPickSession: boolean
  pulse: number
  termRows: number
  chromeH: number
}): React.ReactElement {
  const highlight = (i: number, label: string) => (
    <Text key={label} color={i === props.index ? theme.fg : theme.fgMuted} backgroundColor={i === props.index ? theme.accent : undefined}>
      {i === props.index ? '→ ' : '  '}
      {label}
    </Text>
  )

  if (props.overlay === 'webset') {
    return (
      <WebSetPanel
        index={props.webSetIndex}
        apiKey={props.webSetKey}
        error={props.webSetError}
        busy={props.webSetBusy}
        pulse={props.pulse}
        termRows={props.termRows}
        chromeH={props.chromeH}
      />
    )
  }

  if (props.overlay === 'resume') {
    const list = props.resumeSessions.slice(0, 8)
    const newIdx = props.attachPickSession ? list.length : -1
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>
          {props.attachPickSession
            ? l('ackem attach · 选择会话', 'ackem attach · Select session')
            : l('恢复会话 · /resume', 'Resume session · /resume')}
        </Text>
        {list.length === 0 && !props.attachPickSession ? (
          <Text color={theme.fgMuted}>{l('（无已保存会话）', '(No saved sessions)')}</Text>
        ) : (
          list.map((s, i) => (
            <Text
              key={s.id}
              color={i === props.index ? theme.fg : theme.fgMuted}
              backgroundColor={i === props.index ? theme.accent : undefined}
            >
              {i === props.index ? '→ ' : '  '}
              {`${s.id.slice(0, 8)}…  ${s.preview.slice(0, 36) || l('（空）', '(empty)')}`}
            </Text>
          ))
        )}
        {props.attachPickSession ? (
          <Text
            color={props.index === newIdx ? theme.fg : theme.fgMuted}
            backgroundColor={props.index === newIdx ? theme.accent : undefined}
          >
            {props.index === newIdx ? '→ ' : '  '}
            {l('+ 新建会话（保持当前会话）', '+ New session (keep current session)')}
          </Text>
        ) : null}
        <Text color={theme.fgMuted}>{l('Enter 确认 · Esc 取消', 'Enter confirm · Esc cancel')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'trust') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.warning} paddingX={1}>
        <Text color={theme.fg}>{l('信任此工作目录？', 'Trust this working directory?')}</Text>
        <Text color={theme.fgMuted}>{props.cwd}</Text>
        {highlight(0, l('始终信任（记住选择）', 'Trust always (remember)'))}
        {highlight(1, l('仅信任本次会话', 'Trust once (this session only)'))}
        {highlight(2, l('退出 ackem', 'Exit ackem'))}
        <Text color={theme.fgMuted}>{l('↑↓ 选择 · Enter 确认 · Esc 退出', '↑↓ select · Enter confirm · Esc exit')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'theme') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>{l('终端主题 · /theme', 'Terminal theme · /theme')}</Text>
        {THEME_IDS.map((id, i) => highlight(i, themeDisplay(id)))}
        <Text color={theme.fgMuted}>{l('Enter 应用 · Esc 取消', 'Enter apply · Esc cancel')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'language') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>{l('界面语言 · /language', 'Interface language · /language')}</Text>
        {CLI_LANGUAGES.map((language, i) =>
          highlight(i, `${CLI_LANGUAGE_LABELS[language]}${language === currentLanguage() ? l('（当前）', ' (current)') : ''}`)
        )}
        <Text color={theme.fgMuted}>{l('Enter 应用 · Esc 取消', 'Enter apply · Esc cancel')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'planPreview' && props.planPreview) {
    const pp = props.planPreview
    const dirty = pp.content !== pp.initial
    const all = pp.content.split('\n')
    const window = 18
    const start = pp.editing ? Math.max(0, all.length - window) : 0
    const lines = all.slice(start, start + window)
    const extraTop = start
    const extraBottom = all.length - start - lines.length
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent}>
          {l('计划预览', 'Plan preview')}
          {dirty ? <Text color={theme.warning}>{l('  · 未保存', '  · unsaved')}</Text> : null}
          {pp.editing ? <Text color={theme.cyan}>{l('  · 编辑中', '  · editing')}</Text> : null}
        </Text>
        <Text color={theme.fgMuted}>{pp.path}</Text>
        {extraTop > 0 ? <Text color={theme.fgMuted}>{`… +${extraTop} lines`}</Text> : null}
        {lines.map((ln, i) => (
          <Text key={`${start + i}`} color={theme.fg}>
            {ln || ' '}
            {pp.editing && i === lines.length - 1 ? <Text color={theme.cyan}>█</Text> : null}
          </Text>
        ))}
        {extraBottom > 0 ? <Text color={theme.fgMuted}>{`… +${extraBottom} lines`}</Text> : null}
        {!pp.content.trim() ? (
          <Text color={theme.fgMuted}>{l('（空）· 已在计划模式，写完计划后会停在这里', '(Empty) · already in plan mode; the plan appears here once written')}</Text>
        ) : null}
        {highlight(0, l('保存并关闭', 'Save & close'))}
        {highlight(1, l('不保存并关闭', 'Close without saving'))}
        <Text color={theme.fgMuted}>
          {pp.editing
            ? l('Tab/Esc 结束编辑 · Enter 换行', 'Tab/Esc finish editing · Enter newline')
            : l('Tab/e 编辑 · ↑↓ 选择 · Enter 确认', 'Tab/e edit · ↑↓ select · Enter confirm')}
        </Text>
      </Box>
    )
  }

  if (props.overlay === 'rewind') {
    const list = props.rewindSnapshots.slice(0, 8)
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>{l('文件快照 · /rewind · Ctrl+Shift+C 回滚最近一轮', 'File snapshots · /rewind · Ctrl+Shift+C rewind last turn')}</Text>
        {list.length === 0 ? (
          <Text color={theme.fgMuted}>{l('（无检查点）', '(No checkpoints)')}</Text>
        ) : (
          list.map((s, i) => (
            <Text
              key={s.messageId}
              color={i === props.index ? theme.fg : theme.fgMuted}
              backgroundColor={i === props.index ? theme.accent : undefined}
            >
              {i === props.index ? '→ ' : '  '}
              {`${s.messageId.slice(0, 8)}…  ${s.fileCount} ${l('个文件', 'files')}  ${s.timestamp.slice(0, 19)}`}
            </Text>
          ))
        )}
        <Text color={theme.fgMuted}>{l('↑↓ 选择 · Enter 还原磁盘 · Esc 取消', '↑↓ select · Enter restore files · Esc cancel')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'browserOnboard' && props.browserOnboard) {
    const card = props.browserOnboard
    const steps = currentLanguage() === 'en' ? card.stepsEn : card.stepsZh
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.warning} paddingX={1}>
        <Text color={theme.fg} bold>
          {l(card.titleZh, card.titleEn)}
        </Text>
        <Text color={theme.fgMuted}>{l(card.bodyZh, card.bodyEn)}</Text>
        {steps.map((s, i) => (
          <Text key={i} color={theme.fgMuted}>
            {`${i + 1}. ${s}`}
          </Text>
        ))}
        <Text color={theme.cyan}>{card.storeUrl}</Text>
        <Text color={theme.fgMuted}>{l(card.noteZh, card.noteEn)}</Text>
        {card.options.map((opt, i) =>
          highlight(i, l(opt.labelZh, opt.labelEn))
        )}
        <Text color={theme.fgMuted}>
          {l('↑↓ 选择 · Enter 确认 · Esc 稍后', '↑↓ select · Enter confirm · Esc later')}
        </Text>
      </Box>
    )
  }

  if (props.overlay === 'elicitation' && props.elicitation) {
    const el = props.elicitation
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.warning} paddingX={1}>
        <Text color={theme.fg}>{l('MCP 请求输入', 'MCP elicitation')} · {el.serverName}</Text>
        <Text color={theme.fgMuted}>{el.message}</Text>
        {el.url ? <Text color={theme.cyan}>{el.url}</Text> : null}
        {highlight(0, l('接受 (y)', 'Accept (y)'))}
        {highlight(1, l('拒绝 (n)', 'Decline (n)'))}
        {highlight(2, l('取消 (c)', 'Cancel (c)'))}
        <Text color={theme.fgMuted}>{l('↑↓ 选择 · Enter 确认 · Esc 取消', '↑↓ select · Enter confirm · Esc cancel')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'cron') {
    const list = props.cronDue.slice(0, 6)
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>{l('定时任务到期 · 已加入队列', 'Cron due · queued')}</Text>
        {list.map((j, i) => (
          <Text
            key={j.id}
            color={i === props.index ? theme.fg : theme.fgMuted}
            backgroundColor={i === props.index ? theme.accent : undefined}
          >
            {i === props.index ? '→ ' : '  '}
            {`${j.humanSchedule}  ${j.prompt.slice(0, 40)}`}
          </Text>
        ))}
        <Text color={theme.fgMuted}>{l('Enter 确认 · Esc 关闭', 'Enter confirm · Esc close')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'memory') {
    const list = props.memoryFiles.slice(0, 8)
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>{l('自动记忆 · /memory', 'Auto memory · /memory')}</Text>
        <Text color={theme.fgMuted}>{props.memoryDir || props.cwd}</Text>
        {list.length === 0 ? (
          <Text color={theme.fgMuted}>{l('（无记忆文件）', '(No memory files)')}</Text>
        ) : (
          list.map((f, i) => (
            <Text
              key={f.rel}
              color={i === props.index ? theme.fg : theme.fgMuted}
              backgroundColor={i === props.index ? theme.accent : undefined}
            >
              {i === props.index ? '→ ' : '  '}
              {`${f.rel}  ${f.bytes}B`}
            </Text>
          ))
        )}
        {props.memoryFiles.length > list.length ? (
          <Text color={theme.fgMuted}>{l(`  … 还有 ${props.memoryFiles.length - list.length} 个`, `  … ${props.memoryFiles.length - list.length} more`)}</Text>
        ) : null}
        <Text color={theme.fgMuted}>{l('↑↓ 选择 · Enter 编辑 · Esc 关闭', '↑↓ select · Enter edit · Esc close')}</Text>
      </Box>
    )
  }

  if (props.overlay === 'memoryEdit' && props.memoryEdit) {
    const me = props.memoryEdit
    const dirty = me.content !== me.initial
    const all = me.content.split('\n')
    const window = 18
    const start = me.editing ? Math.max(0, all.length - window) : 0
    const lines = all.slice(start, start + window)
    const extraTop = start
    const extraBottom = all.length - start - lines.length
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent}>
          {l('记忆', 'Memory')}
          {dirty ? <Text color={theme.warning}>{l('  · 未保存', '  · unsaved')}</Text> : null}
          {me.editing ? <Text color={theme.cyan}>{l('  · 编辑中', '  · editing')}</Text> : null}
        </Text>
        <Text color={theme.fgMuted}>{me.rel}</Text>
        {extraTop > 0 ? <Text color={theme.fgMuted}>{`… +${extraTop} lines`}</Text> : null}
        {lines.map((ln, i) => (
          <Text key={`${start + i}`} color={theme.fg}>
            {ln || ' '}
            {me.editing && i === lines.length - 1 ? <Text color={theme.cyan}>█</Text> : null}
          </Text>
        ))}
        {extraBottom > 0 ? <Text color={theme.fgMuted}>{`… +${extraBottom} lines`}</Text> : null}
        {highlight(0, l('保存并关闭', 'Save & close'))}
        {highlight(1, l('删除文件', 'Delete file'))}
        {highlight(2, l('不保存并关闭', 'Close without saving'))}
        <Text color={theme.fgMuted}>
          {me.editing
            ? l('Tab/Esc 结束编辑 · Enter 换行', 'Tab/Esc finish editing · Enter newline')
            : l('Tab/e 编辑 · ↑↓ 选择 · Enter 确认', 'Tab/e edit · ↑↓ select · Enter confirm')}
        </Text>
      </Box>
    )
  }

  if (props.overlay === 'slash') {
    const total = props.slashFilter.length
    const offset =
      total <= SLASH_VISIBLE ? 0 : Math.max(0, Math.min(props.index - 2, total - SLASH_VISIBLE))
    const view = props.slashFilter.slice(offset, offset + SLASH_VISIBLE)
    const hidden = total - offset - view.length
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1} flexShrink={0}>
        {view.map((c, i) => {
          const on = offset + i === props.index
          const hint = SLASH_HINT[currentLanguage()][c] ?? ''
          return (
            <Text
              key={c}
              color={on ? theme.fg : theme.fgMuted}
              backgroundColor={on ? theme.accent : undefined}
            >
              {on ? '→ ' : '  '}
              {`/${c}`.padEnd(12)}
              {hint}
            </Text>
          )
        })}
        {hidden > 0 ? <Text color={theme.fgMuted}>{l(`  ↓ 还有 ${hidden} 条`, `  ↓ ${hidden} more`)}</Text> : null}
      </Box>
    )
  }
  if (props.overlay === 'at') {
    const rows = props.atFiles.length ? props.atFiles : [l('（无文件）', '(no files)')]
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        {rows.map((c, i) =>
          highlight(i, c.startsWith('(') || c.startsWith('（') ? c : `+ ${c}`)
        )}
      </Box>
    )
  }
  if (props.overlay === 'model') {
    const total = props.modelOptions.length
    const vis = 8
    const offset =
      total <= vis ? 0 : Math.max(0, Math.min(props.index - 2, total - vis))
    const view = props.modelOptions.slice(offset, offset + vis)
    const empty = total <= 1 && props.modelOptions[0] === '__setup__'
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fgMuted}>{l('选择已注册模型（通过 /setup 添加）', 'Select a registered model (add via /setup)')}</Text>
        {empty ? (
          <Text color={theme.warning}>{l('尚无注册模型', 'No registered models')}</Text>
        ) : (
          view.map((id, i) => {
            const abs = offset + i
            const on = abs === props.index
            const label = id === '__setup__' ? l('→ /setup 注册新模型…', '→ /setup register a model…') : id
            const mark = id === props.currentModel ? l('当前', 'current') : ''
            return (
              <Text
                key={id}
                color={on ? theme.fg : theme.fgMuted}
                backgroundColor={on ? theme.accent : undefined}
              >
                {on ? '→ ' : '  '}
                {label.padEnd(28)}
                {mark}
              </Text>
            )
          })
        )}
        <Text color={theme.fgMuted}>{l('Enter 保存为默认 · s 仅本会话 · Esc 取消', 'Enter save as default · s session only · Esc cancel')}</Text>
      </Box>
    )
  }
  if (props.overlay === 'effort') {
    return <EffortBar index={props.index} pulse={props.pulse} />
  }
  if (props.overlay === 'agents') {
    const rows = [
      { glyph: '┃', label: 'solo', hint: l('不派子代理', 'No subagents'), glyphColor: theme.fgMuted },
      { glyph: '┃ ┃', label: 'auto', hint: l('默认，需要时派遣', 'Dispatch when needed'), glyphColor: theme.fg },
      { glyph: '┃ ┃ ┃', label: 'team', hint: l('鼓励并行探索', 'Encourage parallel exploration'), glyphColor: theme.cyan }
    ] as const
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        {rows.map((row, i) => {
          const on = i === props.index
          return (
            <Text
              key={row.label}
              color={on ? theme.fg : theme.fgMuted}
              backgroundColor={on ? theme.accent : undefined}
            >
              {on ? '→ ' : '  '}
              <Text color={on ? theme.fg : row.glyphColor}>{row.glyph.padEnd(6)}</Text>
              {row.label.padEnd(6)}
              {row.hint}
            </Text>
          )
        })}
      </Box>
    )
  }
  if (props.overlay === 'mode') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
        {MODES.map((m, i) => highlight(i, modeDisplay(m)))}
      </Box>
    )
  }
  if (props.overlay === 'clear') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
        <Text color={theme.fg}>{l('清空会话历史？', 'Clear session history?')}</Text>
        {highlight(0, l('清空历史', 'Clear history'))}
        {highlight(1, l('取消', 'Cancel'))}
      </Box>
    )
  }
  if (props.overlay === 'permission' && props.perm) {
    const tool = props.perm.toolName
    const op = summarizePermissionOperation(tool, props.perm.input)
    const why = explainPermissionAsk(props.perm.reason, tool)
    const typeLabel = permissionClassLabel(tool)
    const opts = [
      { label: l('y  仅允许本次', 'y  Allow this time only'), color: theme.accent },
      {
        label: l(
          `s  允许本类型（${typeLabel.zh}），同类不再问`,
          `s  Allow this type (${typeLabel.en}); same type will not ask again`
        ),
        color: theme.success
      },
      {
        label: l(
          'a  允许本窗口，本进程不再问（删除仍问）',
          'a  Allow this window; this process will not ask (deletes still ask)'
        ),
        color: theme.warning
      },
      { label: l('n  取消本次', 'n  Deny this operation'), color: theme.danger }
    ]
    const { lines: diff, extra } = formatMiniDiff(props.perm.input)
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fg}>
          {tool}
          <Text color={theme.accent}>{l('  等待确认', '  waiting')}</Text>
        </Text>
        <Text color={theme.fg}>{l(op.zh, op.en)}</Text>
        <Text color={theme.warning}>{l(why.zh, why.en)}</Text>
        {diff.map((line) => (
          <Text
            key={line}
            color={
              line.startsWith('+')
                ? theme.cyan
                : line.startsWith('-')
                  ? theme.danger
                  : theme.fgMuted
            }
          >
            {line}
          </Text>
        ))}
        {extra > 0 ? <Text color={theme.fgMuted}>{`… +${extra} lines`}</Text> : null}
        {opts.map((o, i) => {
          const on = i === props.index
          return (
            <Text
              key={o.label}
              color={on ? theme.fg : o.color}
              backgroundColor={on ? theme.accent : undefined}
            >
              {on ? '→ ' : '  '}
              {o.label}
            </Text>
          )
        })}
        <Text color={theme.fgMuted}>
          {l(
            'y / s / a / n · ↑↓ 选择 · Enter 确认 · Esc 取消',
            'y / s / a / n · ↑↓ select · Enter confirm · Esc cancel'
          )}
        </Text>
      </Box>
    )
  }
  if (props.overlay === 'planEnter') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fg}>{l('进入计划模式？', 'Enter plan mode?')}</Text>
        <Text color={theme.fgMuted}>{l('先只读探索，不修改项目文件。', 'Explore read-only before changing project files.')}</Text>
        {highlight(0, l('进入计划模式', 'Enter plan mode'))}
        {highlight(1, l('取消', 'Cancel'))}
        <Text color={theme.fgMuted}>{l('Enter 确认 · Esc 取消', 'Enter confirm · Esc cancel')}</Text>
      </Box>
    )
  }
  if (props.overlay === 'modelConfirm' && props.pendingModel) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.fg}>{l('切换到', 'Switch to')} {props.pendingModel.id}</Text>
        <Text color={theme.warning}>{l('下一轮将重新读取完整历史，无法复用缓存。', 'The next turn will reread full history without cache.')}</Text>
        <Text color={theme.fgMuted}>
          {props.pendingModel.persist ? l('设为默认模型', 'Set as default model') : l('仅本会话', 'This session only')}
        </Text>
        {highlight(0, l('确认切换', 'Confirm switch'))}
        {highlight(1, l('取消', 'Cancel'))}
        <Text color={theme.fgMuted}>{l('↑↓ 选择 · Enter 确认 · Esc 取消', '↑↓ select · Enter confirm · Esc cancel')}</Text>
      </Box>
    )
  }
  if (props.overlay === 'plan' && props.plan) {
    const all = props.plan.plan.split('\n')
    const window = 16
    const start = props.planEditing ? Math.max(0, all.length - window) : 0
    const lines = all.slice(start, start + window)
    const extraTop = start
    const extraBottom = Math.max(0, all.length - start - window)
    const dirty = props.plan.plan !== props.plan.initialPlan
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent}>
          {l('计划', 'Plan')}
          {dirty ? <Text color={theme.warning}>{l('  · 已修改', '  · modified')}</Text> : null}
          {props.planEditing ? <Text color={theme.cyan}>{l('  · 编辑中', '  · editing')}</Text> : null}
        </Text>
        {extraTop > 0 ? <Text color={theme.fgMuted}>{`… +${extraTop} lines`}</Text> : null}
        {lines.map((l, i) => (
          <Text key={`${start + i}`} color={theme.fg}>
            {l || ' '}
            {props.planEditing && i === lines.length - 1 ? (
              <Text color={theme.cyan}>█</Text>
            ) : null}
          </Text>
        ))}
        {extraBottom > 0 ? (
          <Text color={theme.fgMuted}>{`… +${extraBottom} lines`}</Text>
        ) : null}
        {planExitRows().map((row, i) => {
          const label = l(row.labelZh, row.labelEn)
          if (row.kind === 'input') {
            const shown = props.planFeedback || l('告诉模型改什么', 'Tell the model what to change')
            return highlight(i, `${label}  ·  ${shown}${i === props.index ? '█' : ''}`)
          }
          return highlight(i, label)
        })}
        <Text color={theme.fgMuted}>
          {props.planEditing
            ? l('打字编辑 · Enter 换行 · Tab/Esc 返回选项', 'Type to edit · Enter newline · Tab/Esc return')
            : l(
                'e 编辑正文 · ↑↓ 选择 · Enter 确认 · Shift+Tab 带着批注批准 · Esc 留下规划',
                'e edit · ↑↓ select · Enter confirm · Shift+Tab approve with notes · Esc keep planning'
              )}
        </Text>
      </Box>
    )
  }
  if (props.overlay === 'ask' && props.ask) {
    const ask = props.ask
    const q = currentAskQuestion(ask)
    const opts = displayedAskOptions(ask)
    const qn = ask.questions.length
    const header = q?.header ? `${q.header} · ` : ''
    const otherVal = q ? ask.otherText[q.question] || '' : ''
    const focused = opts[props.index]
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.accent}>
          {l('需要你的选择', 'Choose')}
          {qn > 1 ? `  ${ask.qIndex + 1}/${qn}` : ''}
        </Text>
        <Text color={theme.fg}>
          {header}
          {q?.question || ''}
        </Text>
        {opts.map((o, i) => {
          const on = i === props.index
          const selected = q ? (ask.picked[q.question] || []).includes(o.label) : false
          const mark = q?.multiSelect ? (selected ? '[x] ' : '[ ] ') : `${i + 1}  `
          const extra =
            isOtherLabel(o.label) && (on || otherVal)
              ? `  ${otherVal || l('自己输入', 'type your answer')}${on ? '█' : ''}`
              : o.description
                ? `  — ${o.description}`
                : ''
          return (
            <Text
              key={o.label}
              color={on ? theme.fg : theme.fgMuted}
              backgroundColor={on ? theme.accent : undefined}
            >
              {on ? '→ ' : '  '}
              {mark}
              {o.label}
              {extra}
            </Text>
          )
        })}
        {focused?.preview ? (
          <Text color={theme.fgDim}>{focused.preview.split('\n').slice(0, 4).join(' | ')}</Text>
        ) : null}
        <Text color={theme.fgMuted}>
          {qn > 1
            ? l(
                '←→ 换题 · 空格多选 · Enter 下一题/提交 · Esc 取消',
                '←→ questions · Space multi · Enter next/submit · Esc cancel'
              )
            : q?.multiSelect
              ? l('空格勾选 · Enter 提交 · Other 可输入 · Esc 取消', 'Space select · Enter submit · Other types · Esc cancel')
              : l('1-9 或 ↑↓ 选择 · Other 可输入 · Enter 确认 · Esc 取消', '1-9 or ↑↓ · Other types · Enter · Esc')}
        </Text>
      </Box>
    )
  }
  if (props.overlay === 'setup') {
    const step = SETUP_STEPS[props.setupStep]!
    const englishSteps = [
      { title: 'API endpoint', short: 'Endpoint', hint: 'Press Enter for OpenAI; edit for proxies or other providers.' },
      { title: 'Model ID', short: 'Model', hint: 'Enter a model ID such as gpt-4.1 or deepseek-chat.' },
      { title: 'API Key', short: 'Key', hint: 'Paste your key; only dots are shown on screen.' },
      { title: 'Context window', short: 'Context', hint: 'Choose 128k / 1M / Custom, then enter tokens if custom.' }
    ] as const
    const englishStep = englishSteps[props.setupStep]!
    const last = props.setupStep === SETUP_STEPS.length - 1
    const onContext = step.key === 'contextWindow'
    const raw = props.setupDraft[step.key]
    const customContext = onContext && props.setupContextPick === 2
    const errorLine = props.setupError ? 1 : 0
    const setupHeight = (onContext ? (customContext ? 9 : 6) : 6) + errorLine + 2
    const shown =
      step.key === 'apiKey'
        ? raw
          ? '•'.repeat(Math.min(raw.length, 24))
          : ''
        : raw
    const showSetupInput = !props.setupBusy && (!onContext || customContext)
    const setupInputOffset = onContext ? (customContext ? 7 : 4) : 4
    const setupCursorY = Math.max(
      0,
      props.termRows - props.chromeH - setupHeight + setupInputOffset
    )
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1} flexShrink={0}>
        <Text color={theme.accent}>
          {l('配置 AI 连接', 'Configure AI connection')}  ·  {l('第', 'Step')} {props.setupStep + 1}/{SETUP_STEPS.length}
        </Text>
        <Text>
          {SETUP_STEPS.map((s, i) => {
            const cur = i === props.setupStep
            const done = i < props.setupStep
            return (
              <Text key={s.key} color={cur ? theme.cyan : done ? theme.success : theme.fgMuted}>
                {i === 0 ? '' : '   '}
                {cur ? '→' : done ? '✓' : '·'}
                {i + 1} {l(s.short, englishSteps[i]!.short)}
              </Text>
            )
          })}
        </Text>
        <Text color={theme.fg}>{l(step.title, englishStep.title)}</Text>
        {onContext ? (
          <>
            {CONTEXT_WINDOW_PRESETS.map((opt, i) => {
              const on = i === props.setupContextPick
              return (
                <Text
                  key={opt.label}
                  color={on ? theme.fg : theme.fgMuted}
                  backgroundColor={on ? theme.accent : undefined}
                >
                  {on ? '→ ' : '  '}
                  {opt.value === 0 ? l(opt.label, 'Custom') : opt.label}
                  {opt.value > 0 ? `  (${opt.value.toLocaleString('en-US')})` : ''}
                  {'  '}
                  {l(
                    opt.note,
                    i === 0
                      ? 'Common default for most models'
                      : i === 1
                        ? 'Long context (for example Claude [1m])'
                        : 'Enter 4096–20M manually'
                  )}
                </Text>
              )
            })}
            {customContext ? (
              <SetupInputLine
                value={raw}
                display={shown}
                placeholder={l('例如 200000', 'For example 200000')}
                rows={props.termRows}
                cursorY={setupCursorY}
                pulseTick={props.pulse}
                active={showSetupInput}
              />
            ) : null}
          </>
        ) : (
          <SetupInputLine
            value={raw}
            display={shown}
            placeholder={step.placeholder}
            rows={props.termRows}
            cursorY={setupCursorY}
            pulseTick={props.pulse}
            active={showSetupInput}
          />
        )}
        <Text color={theme.fgMuted}>{l(step.hint, englishStep.hint)}</Text>
        {props.setupError ? <Text color={theme.danger}>{props.setupError}</Text> : null}
        <Text color={theme.fgMuted}>
          {props.setupBusy
            ? l('正在测试连接，请稍等…', 'Testing connection, please wait…')
            : last
              ? onContext && props.setupContextPick === 2
                ? l('输入 token 数 · Enter 测试并保存 · Shift+Tab 上一步 · Esc 取消', 'Enter token count · Enter test and save · Shift+Tab back · Esc cancel')
                : l('↑↓ 选择 · Enter 测试并保存 · Shift+Tab 上一步 · Esc 取消', '↑↓ select · Enter test and save · Shift+Tab back · Esc cancel')
              : l('输入内容 · Enter 下一步 · Shift+Tab 上一步 · Esc 取消', 'Type value · Enter next · Shift+Tab back · Esc cancel')}
        </Text>
      </Box>
    )
  }
  return <Box />
}

function EditDiffView(props: { input: unknown; cols: number }): React.ReactElement | null {
  const { lines, extra } = formatMiniDiff(props.input)
  if (!lines.length) return null
  return (
    <Box flexDirection="column" marginTop={0}>
      {lines.map((line, i) => {
        const color = line.startsWith('+')
          ? theme.cyan
          : line.startsWith('-')
            ? theme.danger
            : theme.fgMuted
        return (
          <Text key={i} color={color}>
            {`  ${line}`}
          </Text>
        )
      })}
      {extra > 0 ? <Text color={theme.fgMuted}>{`  … +${extra} lines`}</Text> : null}
    </Box>
  )
}
