import type { CatalogEntry } from './catalogTypes'

export const LIVE_CATALOG: CatalogEntry[] = [
  {
    id: 'ackem/web-search',
    name: '网页搜索',
    status: 'active',
    aliases: ['搜一下', '搜索'],
    slash: ['/search'],
    capabilityTag: 'search'
  },
  {
    id: 'ackem/weather-sense',
    name: '天气',
    status: 'active',
    aliases: ['天气'],
    slash: ['/weather'],
    capabilityTag: 'weather'
  },
  {
    id: 'ackem/file-ops',
    name: '备份',
    status: 'active',
    aliases: ['备份'],
    slash: [],
    capabilityTag: 'file'
  },
  {
    id: 'u/pomodoro',
    name: '番茄钟',
    status: 'active',
    aliases: ['倒计时', '番茄钟'],
    slash: ['/pomodoro'],
    capabilityTag: 'time',
    isUserPlugin: true
  }
]

export const LIVE_CATALOG_NO_USER = LIVE_CATALOG.filter((e) => !e.isUserPlugin)

export type LiveGot = {
  channel: string
  usedClassifier: boolean
  pendingConfirm?: string
  extensionId?: string
  workKind?: string
  chatDelivery?: string
}

export type LiveExpect = {
  channel?: 'chat' | 'plugin' | 'work'
  usedClassifier: boolean
  pendingConfirm?: string | null
  extensionId?: string
  workKind?: 'job' | 'factory'
  chatDelivery?: 'paper_card'
  acceptPending?: string[]
}

export type LiveCase = {
  id: string
  text: string
  catalog?: CatalogEntry[]
  recent?: Array<{ role: string; content: string }>
  expect: LiveExpect
  note: string
}

/** 确定性：即使接上 LLM 也不得发残差请求 */
export const DETERMINISTIC_CASES: LiveCase[] = [
  { id: 'D1', text: '今天好累', expect: { channel: 'chat', usedClassifier: false }, note: '闲聊' },
  { id: 'D2', text: '你会倒计时吗', expect: { channel: 'chat', usedClassifier: false }, note: '询问能力' },
  { id: 'D3', text: '你能不能倒计时', expect: { channel: 'chat', usedClassifier: false }, note: '询问' },
  {
    id: 'D4',
    text: '整理一下 React',
    expect: { channel: 'chat', usedClassifier: false, chatDelivery: 'paper_card' },
    note: '纸面卡'
  },
  {
    id: 'D5',
    text: '搜一下 React',
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'ackem/web-search' },
    note: '官方搜索'
  },
  {
    id: 'D6',
    text: '北京今天天气',
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'ackem/weather-sense' },
    note: '天气别名高分'
  },
  {
    id: 'D7',
    text: '备份一下 Ackem',
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'ackem/file-ops' },
    note: '官方备份'
  },
  {
    id: 'D8',
    text: '开始倒计时',
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'u/pomodoro' },
    note: '已有番茄钟'
  },
  {
    id: 'D9',
    text: '做一个番茄钟',
    catalog: LIVE_CATALOG_NO_USER,
    expect: { channel: 'work', usedClassifier: false, workKind: 'factory', pendingConfirm: 'create' },
    note: '无近邻则造'
  },
  {
    id: 'D10',
    text: '帮我看看这个 README',
    expect: { channel: 'work', usedClassifier: false, workKind: 'job', pendingConfirm: 'work_job' },
    note: '读路径'
  },
  {
    id: 'D11',
    text: '把 Downloads 按日期归档',
    expect: { channel: 'work', usedClassifier: false, workKind: 'job', pendingConfirm: 'work_job' },
    note: '目录+落盘'
  },
  {
    id: 'D12',
    text: '对比三个库写成文档放进项目',
    expect: { channel: 'work', usedClassifier: false, workKind: 'job', pendingConfirm: 'work_job' },
    note: '落盘'
  },
  {
    id: 'D13',
    text: '倒个 25 分钟',
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'u/pomodoro' },
    note: 'harvest time 调用式'
  },
  {
    id: 'D14',
    text: 'give me 25 minutes',
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'u/pomodoro' },
    note: 'harvest 英文 time'
  },
  {
    id: 'D15',
    text: "how's the weather",
    expect: { channel: 'plugin', usedClassifier: false, extensionId: 'ackem/weather-sense' },
    note: 'harvest weather'
  }
]

/** 残差：必须打 DeepSeek，再经 normalize */
export const RESIDUAL_CASES: LiveCase[] = [
  {
    id: 'R1',
    text: '给我弄个能自定义时长的小闹钟',
    expect: {
      usedClassifier: true,
      acceptPending: ['create', 'update']
    },
    note: '改已有番茄钟还是另造'
  },
  {
    id: 'R2',
    text: '我想要一个以后可以提醒我喝水的东西',
    expect: {
      usedClassifier: true,
      acceptPending: ['create', 'update', 'use_missing']
    },
    note: '制造但 tag 绑不死'
  },
  {
    id: 'R3',
    text: '给刚才那个加个暂停',
    recent: [
      { role: 'user', content: '做一个番茄钟' },
      { role: 'assistant', content: '还没有，要先造一只。' }
    ],
    expect: {
      usedClassifier: true,
      acceptPending: ['create', 'update']
    },
    note: '话题栈绑不死时改版'
  }
]

export function checkLiveExpect(got: LiveGot, exp: LiveExpect): string | null {
  if (got.usedClassifier !== exp.usedClassifier) {
    return `classifier ${got.usedClassifier} ≠ ${exp.usedClassifier}`
  }
  if (exp.channel && got.channel !== exp.channel) return `channel ${got.channel} ≠ ${exp.channel}`
  if (exp.pendingConfirm !== undefined) {
    const pending = got.pendingConfirm ?? null
    if (pending !== exp.pendingConfirm) return `pending ${pending} ≠ ${exp.pendingConfirm}`
  }
  if (exp.acceptPending) {
    const pending = got.pendingConfirm ?? ''
    if (!exp.acceptPending.includes(pending)) {
      return `pending ${pending || '(none)'} 不在 ${exp.acceptPending.join('|')}`
    }
  }
  if (exp.extensionId && got.extensionId !== exp.extensionId) {
    return `extensionId ${got.extensionId} ≠ ${exp.extensionId}`
  }
  if (exp.workKind && got.workKind !== exp.workKind) {
    return `workKind ${got.workKind} ≠ ${exp.workKind}`
  }
  if (exp.chatDelivery && got.chatDelivery !== exp.chatDelivery) {
    return `delivery ${got.chatDelivery} ≠ ${exp.chatDelivery}`
  }
  return null
}
