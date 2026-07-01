import type { DesktopAgentSettingsSlice } from './desktopAgent'

/** 电脑助手能力处理器 — 匹配后如何执行 */
export type DesktopAgentCapabilityHandler =
  | 'investigate_games'
  | 'investigate_documents'
  | 'use_computer'
  | 'capability_help'

export type DesktopAgentCapabilityDef = {
  id: string
  label: string
  uiGroup: string
  handler: DesktopAgentCapabilityHandler
  /** Embedding 路由用例（用户可能说的话） */
  exampleQueries: string[]
  /** 匹配成功后注入 LLM 的执行提示 */
  routingHint: string
  /** 需要设置项开启才可用；省略表示默认可用 */
  requiresSetting?: keyof DesktopAgentSettingsSlice
}

export type DesktopAgentCapabilityMatch = {
  capabilityId: string
  label: string
  handler: DesktopAgentCapabilityHandler
  score: number
  matchedQuery: string
  routingHint: string
  source: 'embedding' | 'regex_fallback'
}

/**
 * 电脑助手模式能力目录（Embedding 路由表 + 设置页说明的唯一来源）
 * 新增能力：只在此追加条目，并写好 exampleQueries。
 */
export const DESKTOP_AGENT_CAPABILITY_CATALOG: DesktopAgentCapabilityDef[] = [
  {
    id: 'investigate_games',
    label: '查找本机游戏',
    uiGroup: '本机查找',
    handler: 'investigate_games',
    exampleQueries: [
      '我电脑里有哪些游戏',
      '帮我查查装了什么游戏',
      'steam库里有什么',
      'epic上有哪些游戏',
      '仔细查找我的游戏',
      '游戏列表',
      '本地安装了哪些游戏'
    ],
    routingHint:
      '用户要本机游戏清单。先读 MachineMap / Investigation，只列扫描证据中的游戏，禁止联网搜索或编造。'
  },
  {
    id: 'investigate_documents',
    label: '查找本机文档',
    uiGroup: '本机查找',
    handler: 'investigate_documents',
    exampleQueries: [
      '桌面有哪些pdf',
      '文档文件夹里有什么word',
      '列出下载里的文档',
      '帮我找一下pdf文件',
      '我有哪些文档'
    ],
    routingHint:
      '用户要本机文档清单。走 Investigation 文档模板或 use_computer 搜索，只引用真实路径。'
  },
  {
    id: 'browse_search',
    label: '浏览与查找',
    uiGroup: '文件操作',
    handler: 'use_computer',
    exampleQueries: [
      '列出这个文件夹里有什么',
      '搜索文件名包含',
      '找一下桌面上的文件',
      '看看某个目录',
      'grep搜索文件内容'
    ],
    routingHint: '用 use_computer 列出/搜索/读取，多步探索后再汇总回答。'
  },
  {
    id: 'read_content',
    label: '读取内容',
    uiGroup: '文件操作',
    handler: 'use_computer',
    exampleQueries: [
      '读一下这个文件',
      '打开看看内容',
      '这份pdf说了什么',
      '总结一下这个word',
      '图片里是什么'
    ],
    routingHint: '用 use_computer 读取文本/文档/图片，基于真实内容回答。',
    requiresSetting: 'desktopAgentAllowDocumentRead'
  },
  {
    id: 'organize_files',
    label: '整理与修改文件',
    uiGroup: '文件操作',
    handler: 'use_computer',
    exampleQueries: [
      '复制到',
      '移动到',
      '重命名',
      '新建文件夹',
      '写入文件',
      '删除这个文件',
      '清理桌面文件',
      '帮我清理下载文件夹',
      '清空这个目录里的临时文件'
    ],
    routingHint: '用 use_computer 执行复制/移动/写入/删除；每次写操作需用户确认。',
    requiresSetting: 'desktopAgentAllowFileWrite'
  },
  {
    id: 'app_control',
    label: '控制应用程序',
    uiGroup: '应用',
    handler: 'use_computer',
    exampleQueries: [
      '打开chrome',
      '启动微信',
      '关闭某个软件',
      '把窗口切到前面',
      '聚焦应用'
    ],
    routingHint: '用 use_computer 打开/关闭/聚焦应用；需用户在弹窗确认。',
    requiresSetting: 'desktopAgentAllowAppControl'
  },
  {
    id: 'download_install',
    label: '下载与安装',
    uiGroup: '应用',
    handler: 'use_computer',
    exampleQueries: ['下载文件', '从链接下载', '安装这个软件', '运行安装包'],
    routingHint: '用 use_computer 下载或运行安装包；必须 HTTPS 且用户确认。',
    requiresSetting: 'desktopAgentAllowDownload'
  },
  {
    id: 'import_ackem',
    label: '导入 Ackem',
    uiGroup: '知识库',
    handler: 'use_computer',
    exampleQueries: ['导入到ackem', '把这个文件加入知识库', '导入本地文档'],
    routingHint: '用 use_computer import_to_ackem 或先确认路径再导入。'
  },
  {
    id: 'capability_help',
    label: '能力说明',
    uiGroup: '帮助',
    handler: 'capability_help',
    exampleQueries: [
      '电脑助手能做什么',
      '你会什么',
      '你能帮我操作电脑吗',
      '有哪些功能',
      '可以做什么'
    ],
    routingHint: '用自然中文介绍当前已开放的电脑助手能力，给 1~2 个例子，不要堆技术名词。'
  }
]

export function getDesktopAgentCapabilityDef(id: string): DesktopAgentCapabilityDef | undefined {
  return DESKTOP_AGENT_CAPABILITY_CATALOG.find((c) => c.id === id)
}

function settingEnabled(
  settings: DesktopAgentSettingsSlice,
  key?: keyof DesktopAgentSettingsSlice
): boolean {
  if (!key) return true
  return settings[key] === true
}

/** 当前用户设置下可用于 Embedding 路由的能力条目 */
export function listRoutableDesktopAgentCapabilities(
  settings: DesktopAgentSettingsSlice
): DesktopAgentCapabilityDef[] {
  return DESKTOP_AGENT_CAPABILITY_CATALOG.filter((c) => settingEnabled(settings, c.requiresSetting))
}

/** 设置页展示：按 uiGroup 分组 */
export function groupDesktopAgentCapabilitiesByUi(
  settings: DesktopAgentSettingsSlice
): Array<{ group: string; items: Array<{ label: string; enabled: boolean; detail: string }> }> {
  const map = new Map<string, Array<{ label: string; enabled: boolean; detail: string }>>()
  for (const cap of DESKTOP_AGENT_CAPABILITY_CATALOG) {
    const enabled = settingEnabled(settings, cap.requiresSetting)
    const detail =
      cap.handler === 'investigate_games' || cap.handler === 'investigate_documents'
        ? 'Embedding 匹配后自动本机查找，再由大模型整理一条回复'
        : cap.handler === 'capability_help'
          ? 'Embedding 匹配后直接由大模型介绍能力'
          : enabled
            ? 'Embedding 匹配后由大模型调用 use_computer 多步完成'
            : '需在上方权限中开启对应开关'
    const row = { label: cap.label, enabled, detail }
    const list = map.get(cap.uiGroup) ?? []
    list.push(row)
    map.set(cap.uiGroup, list)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
}

export function buildCapabilityRoutingSystemHint(match: DesktopAgentCapabilityMatch): string {
  return [
    `【电脑助手 · 能力路由】已匹配：${match.label}（${match.source}，相似度 ${(match.score * 100).toFixed(0)}%）`,
    `参考例句：${match.matchedQuery}`,
    match.routingHint
  ].join('\n')
}
