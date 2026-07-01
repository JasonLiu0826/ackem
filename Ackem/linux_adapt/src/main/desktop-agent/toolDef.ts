import type { SkillFunctionDef } from '../extensions/skills/types'

export const USE_COMPUTER_TOOL_NAME = 'use_computer'

const useComputerParameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description:
        '动作：list_folder, search_files, stat_file, grep_text, read_text, read_document, read_image, open_folder, open_file, open_app, close_file, close_app, copy_path, move_path, mkdir, write_text, delete_path, download_file, download_and_install, run_installer, import_to_ackem, focus_app'
    },
    path: { type: 'string', description: '本机路径（绝对或相对用户目录）' },
    path_to: { type: 'string', description: '目标路径（复制/移动）' },
    target: { type: 'string', description: '应用名、窗口名或关闭对象' },
    query: { type: 'string', description: '搜索关键词' },
    url: { type: 'string', description: 'HTTPS 下载地址' },
    options: {
      type: 'object',
      description: '额外选项，如 write_text 的 content',
      properties: {
        content: { type: 'string' }
      }
    }
  },
  required: ['action']
} as const

export function useComputerToolDef(): SkillFunctionDef {
  return {
    name: USE_COMPUTER_TOOL_NAME,
    description:
      '对本机文件或应用程序执行操作（浏览/搜索/读取/打开/整理/下载/导入等，详见系统提示中的电脑助手能力清单）。每次执行前需用户在弹窗中确认。仅在电脑助手模式开启时使用。',
    parameters: { ...useComputerParameters, required: [...useComputerParameters.required] }
  }
}

export function useComputerOpenAiTool(): unknown {
  const def = useComputerToolDef()
  return {
    type: 'function' as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters
    }
  }
}

export function useComputerAnthropicTool(): {
  name: string
  description: string
  input_schema: Record<string, unknown>
} {
  const def = useComputerToolDef()
  return {
    name: def.name,
    description: def.description,
    input_schema: def.parameters as Record<string, unknown>
  }
}

export function parseUseComputerArgs(raw: Record<string, unknown>): import('../../shared/desktopAgent').UseComputerArgs | null {
  const action = typeof raw.action === 'string' ? raw.action.trim() : ''
  if (!action) return null
  return {
    action: action as import('../../shared/desktopAgent').DesktopAgentAction,
    path: typeof raw.path === 'string' ? raw.path : undefined,
    path_to: typeof raw.path_to === 'string' ? raw.path_to : undefined,
    target: typeof raw.target === 'string' ? raw.target : undefined,
    query: typeof raw.query === 'string' ? raw.query : undefined,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    options:
      raw.options && typeof raw.options === 'object'
        ? (raw.options as Record<string, unknown>)
        : undefined
  }
}
