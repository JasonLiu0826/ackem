// [plan-document/skillBridge] — 规则层 / chat 调用计划书 Skill 并呈现纸面卡

import type { WebContents } from 'electron'
import type { AppSettings } from '../../../../../settings'
import { getExtensionsCoordinator } from '../../../../runtime'
import { skillToolActivityLabel } from '../../../../../chatStatusLabels'
import {
  toPlanCardPayload,
  type PlanAnswerInput,
  type PlanAnswerOutput
} from '../../../../../planDocument/planAnswer'
import { PLAN_DOCUMENT_MANIFEST } from './manifest'

export async function runPlanDocumentViaSkill(
  webContents: WebContents,
  _settings: AppSettings,
  contextMessages: Array<{ role: string; content: unknown }>,
  input: PlanAnswerInput,
  onStatus?: (text: string) => void
): Promise<string> {
  const label = skillToolActivityLabel('generate_plan')
  onStatus?.(label)
  webContents.send('chat:status', label)

  const coordinator = getExtensionsCoordinator()
  const invocation = coordinator?.skills.createInvocation(
    PLAN_DOCUMENT_MANIFEST.id,
    'keyword',
    'plan_document_intent',
    {
      topic: input.topic,
      userQuestion: input.userQuestion,
      contextMessages
    },
    input.userQuestion
  )

  if (!invocation) {
    throw new Error('计划书 Skill 不可用（扩展未就绪）')
  }

  const result = await coordinator!.skills.execute(invocation)
  if (!result.ok) {
    throw new Error(result.error ?? '计划书生成失败')
  }

  const data = result.data as PlanAnswerOutput & { topic?: string }
  const topic = data.topic ?? input.topic
  webContents.send(
    'chat:searchCard',
    toPlanCardPayload(topic, {
      cardBody: data.cardBody,
      companionReply: data.companionReply,
      copyText: data.copyText
    })
  )

  return data.companionReply || result.output
}
