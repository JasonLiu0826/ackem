/**
 * Gate3 — 运行 interactionScript 验证 Widget 行为（主进程 IR，无需真实点击 DOM）
 */
import type { InteractionStep } from '../../../../shared/openforuInteraction'
import { stateMatchesExpect } from '../../../../shared/openforuInteraction'
import {
  getSurfaceWidgetState,
  invokeSurfaceWidget,
  registerSurfaceWidgetSession
} from './surfaceWidgetRuntime'

export type InteractionVerifyResult = {
  ok: boolean
  errors: string[]
  stepsRun: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runInteractionScript(
  extensionId: string,
  widgetId: string,
  widgetConfig: Record<string, unknown>,
  script: InteractionStep[]
): Promise<InteractionVerifyResult> {
  const errors: string[] = []
  if (!script.length) {
    return { ok: false, errors: ['interactionScript 为空'], stepsRun: 0 }
  }

  registerSurfaceWidgetSession(extensionId, widgetId, widgetConfig)

  let stepsRun = 0
  for (const step of script) {
    stepsRun++
    if (step.op === 'wait') {
      await sleep(step.waitMs ?? 50)
      continue
    }
    if (step.op === 'invoke' || step.op === 'click') {
      const target = step.target?.trim()
      if (!target) {
        errors.push(`步骤 ${stepsRun}: invoke 缺少 target`)
        break
      }
      const result = invokeSurfaceWidget(extensionId, target)
      if (!result.ok) {
        errors.push(`步骤 ${stepsRun}: invoke「${target}」失败 — ${result.error ?? 'unknown'}`)
        break
      }
      continue
    }
    if (step.op === 'assertState') {
      const state = getSurfaceWidgetState(extensionId)
      const expect = step.expect ?? {}
      if (!stateMatchesExpect(state, expect)) {
        errors.push(
          `步骤 ${stepsRun}: assertState 失败 — 期望 ${JSON.stringify(expect)}，实际 ${JSON.stringify(state)}`
        )
        break
      }
      continue
    }
    errors.push(`步骤 ${stepsRun}: 未知 op ${step.op}`)
    break
  }

  return { ok: errors.length === 0, errors, stepsRun }
}
