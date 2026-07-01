// [markdown-table/skillBridge] — 表格交付阶段 Skill 活动与状态

import type { WebContents } from 'electron'
import { getExtensionsCoordinator } from '../../../../runtime'
import { skillToolActivityLabel } from '../../../../../chatStatusLabels'
import { publishExtensionTriggeredById } from '../../../../../extensionTriggerBus'
import { MARKDOWN_TABLE_MANIFEST } from './manifest'

/** 检索/整理进入 Markdown 表格正文阶段时调用 */
export async function beginMarkdownTableSkillActivity(
  webContents: WebContents | undefined,
  topic: string,
  onStatus?: (text: string) => void,
  triggerDetail = 'search_synthesis_table'
): Promise<void> {
  const label = skillToolActivityLabel('draw_markdown_table')
  onStatus?.(label)
  webContents?.send('chat:status', label)
  publishExtensionTriggeredById(MARKDOWN_TABLE_MANIFEST.id)

  const coordinator = getExtensionsCoordinator()
  const invocation = coordinator?.skills.createInvocation(
    MARKDOWN_TABLE_MANIFEST.id,
    'keyword',
    triggerDetail,
    { topic },
    topic
  )
  if (invocation) {
    await coordinator!.skills.execute(invocation)
  }
}
