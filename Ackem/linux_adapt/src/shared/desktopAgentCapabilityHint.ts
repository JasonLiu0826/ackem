import type { DesktopAgentSettingsSlice } from './desktopAgent'
import { buildDesktopAgentModeRulesBlock } from './desktopAgentModePolicy'

export type DesktopAgentCapabilityLine = {
  /** 用户向表述的分组名 */
  label: string
  /** 当前设置下是否可用 */
  enabled: boolean
  /** 具体能做什么 / 如何开启 */
  detail: string
}

function on(settings: DesktopAgentSettingsSlice, key: keyof DesktopAgentSettingsSlice): boolean {
  return settings[key] === true
}

/** 按用户设置生成电脑助手能力条目（主进程与提示注入共用） */
export function listDesktopAgentCapabilities(
  settings: DesktopAgentSettingsSlice
): DesktopAgentCapabilityLine[] {
  const fileWrite = on(settings, 'desktopAgentAllowFileWrite')
  const fileWriteDetail = fileWrite
    ? [
        '复制/移动/重命名',
        '新建文件夹',
        '写入文本',
        on(settings, 'desktopAgentAllowDelete') ? '删除' : '删除（未在设置中允许）'
      ].join('、')
    : '需在设置 → 模型与连接 → 电脑助手中开启「允许写入文件」'

  const download = on(settings, 'desktopAgentAllowDownload')
  const downloadDetail = download
    ? [
        '从 HTTPS 下载到默认或指定目录',
        on(settings, 'desktopAgentAllowInstall')
          ? '下载并运行安装包（需用户确认）'
          : '运行安装包（未在设置中允许）'
      ].join('；')
    : '需在设置中开启「允许下载」'

  return [
    {
      label: '浏览与查找',
      enabled: true,
      detail: '列出文件夹内容、按名称搜索文件、查看文件信息、在目录内搜索文字、读取纯文本'
    },
    {
      label: '打开与查看',
      enabled: true,
      detail: '打开文件夹、用系统默认程序打开文件'
    },
    {
      label: '读取文档与图片',
      enabled: on(settings, 'desktopAgentAllowDocumentRead'),
      detail: on(settings, 'desktopAgentAllowDocumentRead')
        ? '读取 Office/PDF 等文档与图片，用于理解内容后回答用户'
        : '需在设置中开启「允许读取文档/图片」'
    },
    {
      label: '应用程序',
      enabled: on(settings, 'desktopAgentAllowAppControl'),
      detail: on(settings, 'desktopAgentAllowAppControl')
        ? '打开/关闭软件、将窗口带到前台'
        : '需在设置中开启「允许控制应用程序」'
    },
    {
      label: '整理与修改文件',
      enabled: fileWrite,
      detail: fileWriteDetail
    },
    {
      label: '下载与安装',
      enabled: download,
      detail: downloadDetail
    },
    {
      label: '导入 Ackem',
      enabled: true,
      detail: '将本地文件导入 Ackem 知识库'
    }
  ]
}

function formatCapabilityLines(lines: DesktopAgentCapabilityLine[]): string {
  return lines
    .map((line) =>
      line.enabled
        ? `- ${line.label}：${line.detail}`
        : `- ${line.label}（当前未开）：${line.detail}`
    )
    .join('\n')
}

/** 电脑助手模式开启时，每轮注入的系统提示 */
export function buildDesktopAgentModeSystemHint(settings: DesktopAgentSettingsSlice): string {
  const capabilities = formatCapabilityLines(listDesktopAgentCapabilities(settings))
  const rules = buildDesktopAgentModeRulesBlock('zh')
  return [
    '【电脑助手模式 · 已开启】',
    '用户在本会话开启了实验性电脑助手。此模式下只处理本机文件与应用，不调用联网搜索或其它扩展技能；与用户的对话记忆（embedding）仍可使用。',
    '',
    '模式规则：',
    rules,
    '',
    '你可通过工具 use_computer 在用户 Windows 电脑上执行下列操作。',
    '交互规则：',
    '1) 保持 Ackem 伴侣语气；用户问「能做什么/你会什么」时，用自然中文概括下列已开放能力并给 1~2 个例子，不要堆路径、命令名或 action 枚举。',
    '2) 用户提出具体任务时，先澄清缺失信息（路径、文件名、要打开的应用等），再调用 use_computer；每次实际操作前用户会在弹窗中确认（可选「允许本轮全部」跳过后续只读操作确认）。',
    '3) 问「电脑里有哪些游戏/文档」时，优先依据本机查找结果回答，不要编造未扫描到的条目，不要改用联网搜索。',
    '4) 标注「当前未开」的能力不要假称可用；可提示用户到设置里开启对应权限。',
    '5) 禁止操作 Windows 系统目录；关闭 explorer 等系统进程会被拦截；敏感路径用户会看到额外警告。',
    '6) 复杂任务（如找游戏、整理文件夹）应连续多步调用 use_computer 自行探索，汇总后再回答，不要每查一个目录就停下来问用户。',
    '',
    '当前可用能力：',
    capabilities,
    '',
    '举例（勿照抄）：「帮我把桌面上的 PDF 找出来」「读一下这份 Word 的大纲」「打开 Chrome」「把这个文件夹里的 txt 合并」'
  ].join('\n')
}

/** 能力清单类问题专用：嵌入扩展 catalog 块的电脑助手小节 */
export function buildDesktopAgentCatalogSection(settings: DesktopAgentSettingsSlice): string {
  const capabilities = formatCapabilityLines(listDesktopAgentCapabilities(settings))
  return [
    '【电脑助手 · 本会话已开启】',
    '除下列扩展外，本轮用户还开启了实验性电脑助手（use_computer）。介绍能力时务必包含电脑助手，并按「当前可用能力」如实说明；未开放项说明需在设置中开启。',
    '',
    capabilities
  ].join('\n')
}
