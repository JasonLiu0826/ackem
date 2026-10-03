import type { CatalogEntry } from './catalogTypes'
import { LIVE_CATALOG } from './liveCases'

export const FRIDAY_CATALOG: CatalogEntry[] = LIVE_CATALOG
export const FRIDAY_SESSION = 'friday-weekly'
export const WEEKLY_CWD = 'D:\\ackem-demo\\weekly'

export type FridayKind = 'route' | 'patch' | 'control' | 'setup'

export type FridayExpect = {
  kind: FridayKind
  channel?: 'chat' | 'plugin' | 'work'
  usedClassifier?: boolean
  pendingConfirm?: string | null
  acceptPending?: string[]
  extensionId?: string
  workKind?: 'job' | 'factory'
  chatDelivery?: 'paper_card'
  durationMin?: number
  patchCwd?: string
  patchSchedule?: string
  samePlanId?: boolean
  control?: 'status' | 'ambiguous' | 'stop_plugin' | 'abort_work'
  split?: boolean
  extrasPending?: string
  catalogFailed?: boolean
  noExtension?: string
}

export type FridayTurn = {
  id: string
  text: string
  note: string
  expect: FridayExpect
  setup?: 'running_with_plugin'
}

/** 周日晚上赶周报：同一会话连贯 20 轮。 */
export const FRIDAY_TURNS: FridayTurn[] = [
  {
    id: 'E1',
    text: '这周周报又要交了，头有点晕',
    note: '诉苦',
    expect: { kind: 'route', channel: 'chat', usedClassifier: false }
  },
  {
    id: 'E2',
    text: '今晚天气怎么样',
    note: '天气',
    expect: {
      kind: 'route',
      channel: 'plugin',
      usedClassifier: false,
      extensionId: 'ackem/weather-sense'
    }
  },
  {
    id: 'E3',
    text: '倒个 45 分钟',
    note: 'harvest 计时',
    expect: {
      kind: 'route',
      channel: 'plugin',
      usedClassifier: false,
      extensionId: 'u/pomodoro',
      durationMin: 45
    }
  },
  {
    id: 'E4',
    text: '帮我收拾一下',
    note: '无目录词',
    expect: { kind: 'route', channel: 'chat', usedClassifier: false }
  },
  {
    id: 'E5',
    text: '把这次周报要点整理一下',
    note: '纸面卡',
    expect: {
      kind: 'route',
      channel: 'chat',
      usedClassifier: false,
      chatDelivery: 'paper_card'
    }
  },
  {
    id: 'E6',
    text: '对照开题要求把大纲改一版写成文档放进项目',
    note: '落盘 job',
    expect: {
      kind: 'route',
      channel: 'work',
      usedClassifier: false,
      workKind: 'job',
      pendingConfirm: 'work_job'
    }
  },
  {
    id: 'E7',
    text: `项目就在 ${WEEKLY_CWD}`,
    note: '补 cwd',
    expect: { kind: 'patch', patchCwd: WEEKLY_CWD, samePlanId: true }
  },
  {
    id: 'E8',
    text: 'look up 周报怎么写才不像流水账',
    note: '卡还在仍可搜',
    expect: {
      kind: 'route',
      channel: 'plugin',
      usedClassifier: false,
      extensionId: 'ackem/web-search'
    }
  },
  {
    id: 'E9',
    text: '弄一个到点就弹窗别刷手机的东西，时长我自己定，别跟现成计时器绑一起',
    note: '残差：另造，不偷改',
    expect: {
      kind: 'route',
      usedClassifier: true,
      channel: 'work',
      workKind: 'factory',
      acceptPending: ['create', 'update'],
      noExtension: 'u/pomodoro'
    }
  },
  {
    id: 'E10',
    text: '先改成只在工作日晚上提醒',
    note: '改草案',
    expect: { kind: 'patch', patchSchedule: 'workdays', samePlanId: true }
  },
  {
    id: 'E11',
    text: '开始倒计时，还有一件把桌面上的打印稿按日期归一下',
    note: '拆卡',
    expect: {
      kind: 'route',
      usedClassifier: false,
      split: true,
      pendingConfirm: 'plugin_use',
      extrasPending: 'work_job'
    }
  },
  {
    id: 'E12',
    text: '做到哪了',
    note: '问进度',
    setup: 'running_with_plugin',
    expect: { kind: 'control', control: 'status' }
  },
  {
    id: 'E13',
    text: '停掉',
    note: '目标不唯一',
    expect: { kind: 'control', control: 'ambiguous' }
  },
  {
    id: 'E14',
    text: '停掉这个计时',
    note: '只停插件',
    expect: { kind: 'control', control: 'stop_plugin' }
  },
  {
    id: 'E15',
    text: 'never mind，这个活先别做了',
    note: '中止任务',
    expect: { kind: 'control', control: 'abort_work' }
  },
  {
    id: 'E16',
    text: '我想要一个以后能盯着交稿日倒数的看板，别跟现成计时器混',
    note: '残差盯稿看板',
    expect: {
      kind: 'route',
      usedClassifier: true,
      channel: 'work',
      workKind: 'factory',
      acceptPending: ['create', 'update'],
      noExtension: 'u/pomodoro'
    }
  },
  {
    id: 'E17',
    text: '倒个 20 分钟',
    note: '清单故障',
    expect: {
      kind: 'route',
      channel: 'chat',
      usedClassifier: false,
      catalogFailed: true,
      pendingConfirm: null
    }
  },
  {
    id: 'E18',
    text: '备份我的照片',
    note: '非官方备份',
    expect: { kind: 'route', channel: 'chat', usedClassifier: false }
  },
  {
    id: 'E19',
    text: '你会不会帮我改代码啊',
    note: '问能力',
    expect: { kind: 'route', channel: 'chat', usedClassifier: false }
  },
  {
    id: 'E20',
    text: 'set a timer for 15 minutes, and then look up weekly report openings',
    note: '英文拆句',
    expect: {
      kind: 'route',
      usedClassifier: false,
      split: true,
      pendingConfirm: 'plugin_use',
      extrasPending: 'plugin_use'
    }
  }
]
