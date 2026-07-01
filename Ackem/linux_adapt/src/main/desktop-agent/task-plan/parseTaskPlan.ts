import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DesktopAgentTaskPlan, TaskPlanStep } from '../../../shared/desktopAgentTaskPlan'
import { isMultiStepDesktopAgentTask } from '../../../shared/desktopAgentTaskPlan'

function desktopRoot(): string {
  return join(homedir(), 'Desktop')
}

function step(
  id: string,
  label: string,
  action: TaskPlanStep['action'],
  path: string,
  verify: TaskPlanStep['verify'],
  options?: Record<string, unknown>
): TaskPlanStep {
  return { id, label, action, path, verify, options, status: 'pending' }
}

/**
 * 规则解析多步骤本机任务（V1：覆盖「桌面建夹 → 写文件 → 打开/查看 → 删除」类句式）
 */
export function parseDesktopAgentTaskPlan(userText: string): DesktopAgentTaskPlan | null {
  const sourceText = userText.trim()
  if (!sourceText || !isMultiStepDesktopAgentTask(sourceText)) return null

  const desktop = desktopRoot()
  const steps: TaskPlanStep[] = []

  const folderMatch = sourceText.match(
    /(?:在)?桌面(?:上)?(?:建|创建|新建)(?:一个|个)?(?:名叫|叫|名为)?\s*[「"'']?([^「"'\s,，。；;]+)[」"'']?\s*(?:的)?\s*文件夹/u
  )
  const folderName = folderMatch?.[1]?.trim()
  const folderPath = folderName ? join(desktop, folderName) : null

  const fileMatch =
    sourceText.match(
      /里面(?:写|创建|建)(?:个|一个|入)?\s*[「"'']?([^「"'\s,，。；;]+)[」"'']?/u
    ) ??
    sourceText.match(/写(?:入|个|一个)?\s*[「"'']?([^「"'\s,，。；;]+\.\w+)[」"'']?/u)
  const fileName = fileMatch?.[1]?.trim()
  const filePath =
    fileName && folderPath
      ? join(folderPath, fileName.includes('.') ? fileName : `${fileName}.txt`)
      : fileName
        ? join(desktop, fileName.includes('.') ? fileName : `${fileName}.txt`)
        : null

  const wantsOpen = /打开|看看|瞧|瞅|读一下|读读|查看内容/u.test(sourceText)
  const wantsDelete = /删掉|删除|移除|清理掉/u.test(sourceText)

  if (folderPath && /建|创建|新建/u.test(sourceText)) {
    steps.push(
      step(
        'mkdir',
        `在桌面创建文件夹 ${folderName}`,
        'mkdir',
        folderPath,
        [
          { type: 'path_exists', path: folderPath },
          { type: 'is_directory', path: folderPath }
        ]
      )
    )
  }

  if (filePath && /写|创建/u.test(sourceText)) {
    steps.push(
      step(
        'write_file',
        `写入文件 ${fileName ?? filePath}`,
        'write_text',
        filePath,
        [
          { type: 'path_exists', path: filePath },
          { type: 'file_min_bytes', path: filePath, minBytes: 1 }
        ],
        { content: 'hello' }
      )
    )
  }

  if (filePath && wantsOpen) {
    steps.push(
      step(
        'inspect_file',
        `打开或读取 ${fileName ?? filePath} 的内容`,
        'read_text',
        filePath,
        [
          {
            type: 'audit_action',
            action: 'read_text',
            path: filePath,
            result: 'allowed'
          }
        ]
      )
    )
    // 若 LLM 选择 open_file 也算验收通过
    steps[steps.length - 1]!.verify.push({
      type: 'audit_action',
      action: 'open_file',
      path: filePath,
      result: 'allowed'
    })
  }

  if (wantsDelete) {
    if (filePath) {
      steps.push(
        step(
          'delete_file',
          `删除文件 ${fileName ?? filePath}`,
          'delete_path',
          filePath,
          [{ type: 'path_absent', path: filePath }]
        )
      )
    }
    if (folderPath) {
      steps.push(
        step(
          'delete_folder',
          `删除文件夹 ${folderName}`,
          'delete_path',
          folderPath,
          [{ type: 'path_absent', path: folderPath }]
        )
      )
    }
  }

  if (steps.length < 2) return null

  return {
    id: randomUUID(),
    sourceText,
    goalSummary: sourceText.slice(0, 120),
    steps,
    createdAt: new Date().toISOString(),
    planner: 'regex'
  }
}
