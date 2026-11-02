// [ackemcode/dispatch] — 三端统一入口：识别到代码任务就交给 Ackem Code
// 桌面聊天、QQ、微信都调用这里，保证"在哪端提问，结果只回哪端"。

import { createLogger } from '../logger'
import { loadSettings } from '../settings'
import { detectCodeIntent } from './intent'
import { resolveCodeRoot } from './daemon'
import { runCodeTurn, type CodeEvent, type PermissionMode } from './index'

const log = createLogger('ackemcode')

export type CodeDispatchChannel = 'ui' | 'qq' | 'weixin' | string

export type CodeDispatchResult =
  | { handled: false; reason?: string }
  | { handled: true; ok: boolean; text: string; error?: string }

/** 工具名 → 给用户看的进度文案（渠道里会一闪而过） */
const TOOL_LABELS: Record<string, string> = {
  read_file: '在翻文件',
  write_file: '在写文件',
  search_replace: '在改文件',
  glob: '在找文件',
  grep: '在搜代码',
  bash: '在跑命令',
  powershell: '在跑命令',
  list_dir: '在看目录',
  web_fetch: '在查网页',
  web_search: '在搜资料',
  git_snapshot: '在看仓库状态',
  todo_write: '在拆步骤'
}

function labelForTool(name: string): string {
  return TOOL_LABELS[name] ?? `在做 ${name}`
}

const PERMISSION_MODES: PermissionMode[] = [
  'default',
  'plan',
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'dontAsk'
]

export function isPermissionMode(v: unknown): v is PermissionMode {
  return typeof v === 'string' && (PERMISSION_MODES as string[]).includes(v)
}

/**
 * 派工权限优先级：环境变量 > 设置页（ackemcodePermissionMode）> 默认全自动。
 * 设置页里把权限收紧后，新任务会按新模式执行；会话层还会在权限变化时重建会话，
 * 保证旧会话不会继续沿用宽松权限（见 index.ts resolveCodeSession）。
 */
export function resolvePermissionMode(settings: { ackemcodePermissionMode?: string }): PermissionMode {
  const fromEnv = process.env.ACKEMCODE_PERMISSION_MODE
  if (isPermissionMode(fromEnv)) return fromEnv
  if (isPermissionMode(settings.ackemcodePermissionMode)) return settings.ackemcodePermissionMode
  return 'bypassPermissions'
}

/**
 * 远程渠道（QQ / 微信）的代码派工属于「远端可驱动本机」的敏感能力，
 * 必须显式打开「允许 QQ / 微信远程派工」开关才执行；桌面端（ui）不受此限。
 */
export function remoteChannelsAllowed(
  channel: string,
  settings: { workRemoteChannelsEnabled?: boolean }
): boolean {
  if (channel === 'ui') return true
  return settings.workRemoteChannelsEnabled === true
}

export type MaybeRunCodeTaskInput = {
  chatSessionId: string
  text: string
  channel?: CodeDispatchChannel
  cwd?: string
  signal?: AbortSignal
  /** 进度回调：渠道层可以推「正在跑命令…」这类状态 */
  onProgress?: (label: string) => void
}

/**
 * 命中代码任务就执行并返回最终文本；没命中返回 handled:false，
 * 调用方继续走原来的陪伴对话流程。
 */
export async function maybeRunCodeTask(input: MaybeRunCodeTaskInput): Promise<CodeDispatchResult> {
  if (process.env.ACKEMCODE_DISABLE === '1') return { handled: false, reason: 'disabled' }

  const channel = input.channel ?? 'ui'
  const settings = loadSettings()
  if (!remoteChannelsAllowed(channel, settings)) {
    log.warn('远程渠道代码派工未开启，回落为普通对话', { channel })
    return { handled: false, reason: 'remote_channels_disabled' }
  }

  const intent = detectCodeIntent(input.text)
  if (!intent.matched) return { handled: false }
  // 安全降级：只认显式 /code，不做意图推断
  if (process.env.ACKEMCODE_REQUIRE_EXPLICIT === '1' && intent.mode !== 'explicit') {
    return { handled: false, reason: 'explicit_only' }
  }
  // 运行时没随包分发（比如精简版安装包）时，回落到普通对话
  if (!resolveCodeRoot()) {
    log.warn('未找到 parts/ackemcode，代码任务回落为普通对话')
    return { handled: false, reason: 'code_runtime_missing' }
  }

  log.info('识别到代码任务', {
    channel,
    mode: intent.mode,
    chars: intent.prompt.length
  })

  const result = await runCodeTurn({
    chatSessionId: input.chatSessionId,
    text: intent.prompt,
    cwd: input.cwd,
    permissionMode: resolvePermissionMode(settings),
    signal: input.signal,
    onEvent: (ev: CodeEvent) => {
      if (ev.type === 'tool_start' && typeof ev.name === 'string') {
        input.onProgress?.(labelForTool(ev.name))
      } else if (ev.type === 'status' && typeof ev.message === 'string') {
        input.onProgress?.(ev.message)
      }
    }
  })

  if (!result.ok) {
    return {
      handled: true,
      ok: false,
      text: result.text,
      error: result.error ?? 'code_task_failed'
    }
  }
  if (!result.text) {
    return { handled: true, ok: false, text: '', error: 'code_task_empty' }
  }
  return { handled: true, ok: true, text: result.text }
}
