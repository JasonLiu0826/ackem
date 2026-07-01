import type { ChecklistStep } from '../../../shared/investigation'

export type GamesChecklistStepId =
  | 'desktop_shortcuts'
  | 'start_menu'
  | 'program_files'
  | 'program_files_x86'
  | 'local_programs'
  | 'steam_libraries'
  | 'epic_games'

export function createGamesChecklist(): ChecklistStep[] {
  return [
    { id: 'desktop_shortcuts', label: '桌面快捷方式', status: 'pending', hits: 0 },
    { id: 'start_menu', label: '开始菜单', status: 'pending', hits: 0 },
    { id: 'program_files', label: 'Program Files', status: 'pending', hits: 0 },
    { id: 'program_files_x86', label: 'Program Files (x86)', status: 'pending', hits: 0 },
    { id: 'local_programs', label: '本地 Programs', status: 'pending', hits: 0 },
    { id: 'steam_libraries', label: 'Steam 游戏库', status: 'pending', hits: 0 },
    { id: 'epic_games', label: 'Epic 游戏', status: 'pending', hits: 0 }
  ]
}

export function createDocumentsChecklist(): ChecklistStep[] {
  return [
    { id: 'desktop', label: '桌面', status: 'pending', hits: 0 },
    { id: 'documents', label: '文档文件夹', status: 'pending', hits: 0 },
    { id: 'downloads', label: '下载文件夹', status: 'pending', hits: 0 }
  ]
}

export function checklistProgressLabel(steps: ChecklistStep[], currentLabel?: string): string {
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const total = steps.length
  const cur = currentLabel ?? steps.find((s) => s.status === 'running')?.label ?? '准备中'
  return `电脑助手查找中 · ${done}/${total} · ${cur}`
}
