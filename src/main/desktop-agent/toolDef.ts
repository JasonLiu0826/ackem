import type { SkillFunctionDef } from '../extensions/skills/types'

export const USE_COMPUTER_TOOL_NAME = 'use_computer'

const useComputerParameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description:
        '鍔ㄤ綔锛歭ist_folder, search_files, stat_file, grep_text, read_text, read_document, read_image, open_folder, open_file, open_app, close_file, close_app, copy_path, move_path, mkdir, write_text, delete_path, download_file, download_and_install, run_installer, import_to_Ackem, focus_app'
    },
    path: { type: 'string', description: '鏈満璺緞锛堢粷瀵规垨鐩稿鐢ㄦ埛鐩綍锛? },
    path_to: { type: 'string', description: '鐩爣璺緞锛堝鍒?绉诲姩锛? },
    target: { type: 'string', description: '搴旂敤鍚嶃€佺獥鍙ｅ悕鎴栧叧闂璞? },
    query: { type: 'string', description: '鎼滅储鍏抽敭璇? },
    url: { type: 'string', description: 'HTTPS 涓嬭浇鍦板潃' },
    options: {
      type: 'object',
      description: '棰濆閫夐」锛屽 write_text 鐨?content',
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
      '瀵规湰鏈烘枃浠舵垨搴旂敤绋嬪簭鎵ц鎿嶄綔锛堟祻瑙?鎼滅储/璇诲彇/鎵撳紑/鏁寸悊/涓嬭浇/瀵煎叆绛夛紝璇﹁绯荤粺鎻愮ず涓殑鐢佃剳鍔╂墜鑳藉姏娓呭崟锛夈€傛瘡娆℃墽琛屽墠闇€鐢ㄦ埛鍦ㄥ脊绐椾腑纭銆備粎鍦ㄧ數鑴戝姪鎵嬫ā寮忓紑鍚椂浣跨敤銆?,
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
