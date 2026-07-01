import type { PlanSession } from '../../../../shared/planSession'
import type { ExtensionsCoordinator } from '../../coordinator'
import type { DispatchCatalogEntry } from '../../protocols'
import { executeDispatchedExtension } from '../../dispatch/dispatchExecutor'
import { minimalProbeSnapshot } from '../sandbox/sandboxApiBridge'
import { executeOpenExtensionSurface } from '../surface/executeOpenSurface'
import { readUpluginSurfaceConfig, upluginHasSurface } from '../surface/surfaceMeta'
import { runInteractionScript } from '../surface/verifyInteraction'
import { getExtensionSurfaceWindow } from '../../../extensionSurfaceHost'
import { resolveSurfaceDispatch } from '../../../../shared/surfaceInvoke'

export const VERIFY_SMOKE_TIMEOUT_MS = 5000

export interface VerifyAgentInput {
  extensionId: string
  session: PlanSession
  coordinator: ExtensionsCoordinator
}

export interface VerifyAgentOutput {
  ok: boolean
  skipped?: boolean
  contextInjectionPreview?: string
  errors: string[]
  warnings: string[]
  smokeMessage: string
}

const SHORTCUT_HINT =
  /(?:快捷键|热键|hotkey|global\s*shortcut|组合键|ctrl\s*\+|shift\s*\+|alt\s*\+|meta\s*\+)/i

export function isTextSmokeKeyword(raw: string): boolean {
  const k = raw.trim()
  if (!k || k.length < 2) return false
  if (SHORTCUT_HINT.test(k)) return false
  const compact = k.replace(/\s+/g, '')
  if (/^(?:ctrl|shift|alt|meta|cmd|win)(?:\+(?:ctrl|shift|alt|meta|cmd|win|[a-z0-9]))+$/i.test(compact)) {
    return false
  }
  return true
}

function pushUnique(out: string[], raw: string | undefined): void {
  const t = raw?.trim()
  if (!t || out.includes(t)) return
  out.push(t)
}

function extractChineseTokens(text: string): string[] {
  return text.match(/[\u4e00-\u9fff]{2,16}/g) ?? []
}

export function collectSmokeKeywordCandidates(
  session: PlanSession,
  catalogEntry?: DispatchCatalogEntry
): string[] {
  const out: string[] = []

  for (const k of catalogEntry?.dispatch.keywords ?? []) pushUnique(out, k)
  for (const s of catalogEntry?.dispatch.slash ?? []) {
    pushUnique(out, s.replace(/^\//, ''))
  }

  const draft = session.dispatchDraft
  for (const k of draft?.keywords ?? []) pushUnique(out, k)

  const trigger = session.planSummary?.trigger?.trim() ?? ''
  if (trigger && isTextSmokeKeyword(trigger)) {
    pushUnique(out, trigger)
    for (const t of extractChineseTokens(trigger)) pushUnique(out, t)
  } else if (trigger) {
    for (const t of extractChineseTokens(trigger)) pushUnique(out, t)
  }

  const modeHint = String(draft?.mode ?? '').trim()
  const dispatchModeNames = new Set(['dispatched', 'autonomous', 'manual', 'always_on'])
  if (
    modeHint &&
    !dispatchModeNames.has(modeHint.toLowerCase()) &&
    isTextSmokeKeyword(modeHint)
  ) {
    pushUnique(out, modeHint)
    for (const t of extractChineseTokens(modeHint)) pushUnique(out, t)
  }

  for (const h of draft?.habits ?? []) {
    if (isTextSmokeKeyword(h)) pushUnique(out, h)
    for (const t of extractChineseTokens(h)) pushUnique(out, t)
  }

  return out
}

export function pickSmokeKeywordFromCandidates(candidates: string[]): string | undefined {
  for (const k of candidates) {
    if (isTextSmokeKeyword(k)) return k.trim()
  }
  return undefined
}

export function planUsesShortcutOnlyTrigger(
  session: PlanSession,
  candidates: string[]
): boolean {
  const trigger = session.planSummary?.trigger ?? ''
  const modeHint = String(session.dispatchDraft?.mode ?? '')
  const blob = [trigger, modeHint, ...candidates].join(' ')
  if (SHORTCUT_HINT.test(blob)) return true
  if (candidates.length > 0 && !pickSmokeKeywordFromCandidates(candidates)) return true
  return false
}

export type SmokeVerifyPlan =
  | { action: 'smoke'; keyword: string; smokeMessage: string }
  | { action: 'skip'; smokeMessage: string; warnings: string[] }

export function resolveSmokeVerifyPlan(
  session: PlanSession,
  extensionId: string,
  coordinator: ExtensionsCoordinator
): SmokeVerifyPlan {
  const catalogEntry = coordinator.getDispatchCatalog(session.id).find((e) => e.id === extensionId)
  const candidates = collectSmokeKeywordCandidates(session, catalogEntry)
  const keyword = pickSmokeKeywordFromCandidates(candidates)

  if (keyword) {
    return { action: 'smoke', keyword, smokeMessage: `${keyword} 测试` }
  }

  if (planUsesShortcutOnlyTrigger(session, candidates)) {
    const shortcutLabel =
      session.planSummary?.trigger?.trim() ||
      String(session.dispatchDraft?.mode ?? '') ||
      candidates.find((c) => SHORTCUT_HINT.test(c) || !isTextSmokeKeyword(c)) ||
      '快捷键'
    return {
      action: 'skip',
      smokeMessage: `(skipped: ${shortcutLabel})`,
      warnings: [
        `触发方式为「${shortcutLabel}」，无法通过聊天文本 smoke 验证。`,
        '扩展已保持启用；请在实机按快捷键验证，或在方案/manifest 中补充文本 keywords 后重新部署以启用 smoke。'
      ]
    }
  }

  return {
    action: 'skip',
    smokeMessage: '(skipped: no text keyword)',
    warnings: [
      '未找到可用于 smoke 的文本触发词（manifest/dispatchDraft 均为空或仅含快捷键）。',
      '扩展已保持启用；请补充 dispatch.keywords 或在主聊天用 slash/关键词实测。'
    ]
  }
}

/** P2：uskill 注入内容与 Design Spec 关键词/摘要对齐 */
export function validateUskillInjectionAgainstSpec(
  injection: string,
  session: PlanSession
): string[] {
  const spec = session.designSpec
  if (!spec?.acceptance.expectContextInjection) return []
  const errors: string[] = []
  const blob = injection.toLowerCase()
  const tokens = [
    ...spec.trigger.keywords,
    spec.displayName,
    spec.purpose.slice(0, 24)
  ]
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)

  if (!tokens.length) return errors

  const hit = tokens.some((t) => blob.includes(t.toLowerCase()))
  if (!hit && injection.length < 12) {
    errors.push('smoke 注入过短且未包含方案关键词/摘要')
  }
  return errors
}

async function verifySurfaceDeployedExtension(
  input: VerifyAgentInput,
  smokeMessage: string
): Promise<VerifyAgentOutput> {
  const { extensionId, session, coordinator } = input
  const dataRoot = coordinator.getDataRoot()

  try {
    const result = await Promise.race([
      (async () => {
        const open = executeOpenExtensionSurface(coordinator, extensionId)
        const win = getExtensionSurfaceWindow(extensionId)
        if (!open.ok || !win) {
          return {
            ok: false as const,
            errors: [open.ok ? 'Surface 窗口未创建' : open.message],
            smokeMessage
          }
        }

        const surface = readUpluginSurfaceConfig(dataRoot, extensionId)
        const dispatch = resolveSurfaceDispatch(surface, 'keyword')
        let injectionPreview: string | undefined
        if (dispatch?.mode === 'open_and_inject') {
          const exec = await executeDispatchedExtension(
            coordinator,
            extensionId,
            smokeMessage || `${extensionId} 测试`,
            session.id,
            minimalProbeSnapshot()
          )
          injectionPreview = exec.contextInjection?.trim()?.slice(0, 240)
        }

        if (surface?.widget && surface.interactionScript?.length) {
          const interaction = await runInteractionScript(
            extensionId,
            surface.widget,
            surface.widgetConfig ?? {},
            surface.interactionScript
          )
          if (!interaction.ok) {
            return {
              ok: false as const,
              errors: interaction.errors.map((e) => `Gate3 交互验收：${e}`),
              smokeMessage
            }
          }
        }

        return {
          ok: true as const,
          contextInjectionPreview: injectionPreview,
          smokeMessage: open.message,
          errors: [] as string[]
        }
      })(),
      new Promise<{ ok: false; errors: string[]; smokeMessage: string }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              errors: [`Surface smoke 超时（${VERIFY_SMOKE_TIMEOUT_MS / 1000}s）`],
              smokeMessage
            }),
          VERIFY_SMOKE_TIMEOUT_MS
        )
      )
    ])

    if (!result.ok) {
      return { ok: false, errors: result.errors, warnings: [], smokeMessage: result.smokeMessage }
    }

    return {
      ok: true,
      contextInjectionPreview: result.contextInjectionPreview,
      errors: [],
      warnings: [],
      smokeMessage: result.smokeMessage
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, errors: [message], warnings: [], smokeMessage }
  }
}

export async function verifyDeployedExtension(
  input: VerifyAgentInput
): Promise<VerifyAgentOutput> {
  const { extensionId, session, coordinator } = input
  const dataRoot = coordinator.getDataRoot?.()

  if (dataRoot && upluginHasSurface(dataRoot, extensionId)) {
    const plan = resolveSmokeVerifyPlan(session, extensionId, coordinator)
    const smokeMessage =
      plan.action === 'smoke' ? plan.smokeMessage : '(surface window open)'
    return verifySurfaceDeployedExtension(input, smokeMessage)
  }

  const plan = resolveSmokeVerifyPlan(session, extensionId, coordinator)

  if (plan.action === 'skip') {
    return {
      ok: true,
      skipped: true,
      errors: [],
      warnings: plan.warnings,
      smokeMessage: plan.smokeMessage
    }
  }

  const { smokeMessage } = plan

  try {
    const result = await Promise.race([
      executeDispatchedExtension(
        coordinator,
        extensionId,
        smokeMessage,
        session.id,
        minimalProbeSnapshot()
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Verify smoke 超时（${VERIFY_SMOKE_TIMEOUT_MS / 1000}s）`)),
          VERIFY_SMOKE_TIMEOUT_MS
        )
      )
    ])

    const injection = result.contextInjection?.trim()
    if (injection) {
      const specErrors = validateUskillInjectionAgainstSpec(injection, session)
      if (specErrors.length) {
        return {
          ok: false,
          contextInjectionPreview: injection.slice(0, 240),
          errors: specErrors,
          warnings: [],
          smokeMessage
        }
      }
      return {
        ok: true,
        contextInjectionPreview: injection.slice(0, 240),
        errors: [],
        warnings: [],
        smokeMessage
      }
    }

    return {
      ok: false,
      errors: [
        `smoke invoke 未返回 contextInjection（探针：\`${smokeMessage}\`；请核对 keywords 与 manifest.dispatch.keywords 一致）`
      ],
      warnings: [],
      smokeMessage
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, errors: [message], warnings: [], smokeMessage }
  }
}
