import { LIVE_CATALOG } from './liveCases'

export const MOVE_CATALOG = LIVE_CATALOG
export const MOVE_SESSION = 'move-night'
export const MOVE_CWD = 'D:\\move\\2026'

export type MoveKind = 'route' | 'patch' | 'control'

export type MoveTurn = {
  id: string
  text: string
  note: string
  kind: MoveKind
  catalogFailed?: boolean
  setup?: 'running_with_plugin'
}

/** 搬家前夜：新连贯对话。路由只吃 text。 */
export const MOVE_TURNS: MoveTurn[] = [
  { id: 'M1', text: '箱子还没封完，有点慌', note: '诉苦', kind: 'route' },
  { id: 'M2', text: '明天上海天气怎么样', note: '天气', kind: 'route' },
  { id: 'M3', text: '倒个 20 分钟我先装箱', note: '计时', kind: 'route' },
  { id: 'M4', text: '你会帮我搬家吗', note: '问能力', kind: 'route' },
  { id: 'M5', text: '把搬家注意事项整理一下', note: '纸面卡', kind: 'route' },
  { id: 'M6', text: '把搬家清单写成 md 放进项目', note: '落盘', kind: 'route' },
  { id: 'M7', text: `材料在 ${MOVE_CWD}`, note: '补 cwd', kind: 'patch' },
  { id: 'M8', text: 'look up 跨省搬家要注意什么', note: '浅搜', kind: 'route' },
  { id: 'M9', text: '房东说明天十点验房，我好紧张', note: '闲聊', kind: 'route' },
  {
    id: 'M10',
    text: '弄一个到点提醒我交房的东西，别跟现成计时器绑一起',
    note: '残差造手',
    kind: 'route'
  },
  { id: 'M11', text: '先改成只在工作日提醒', note: '改草案', kind: 'patch' },
  {
    id: 'M12',
    text: '开始倒计时，还有一件把桌面上的纸质合同按日期归一下',
    note: '拆卡',
    kind: 'route'
  },
  {
    id: 'M13',
    text: '做到哪了',
    note: '进度',
    kind: 'control',
    setup: 'running_with_plugin'
  },
  { id: 'M14', text: '停掉', note: '目标不清', kind: 'control' },
  { id: 'M15', text: '停掉这个计时', note: '停插件', kind: 'control' },
  { id: 'M16', text: 'never mind，这个活先别做了', note: '停任务', kind: 'control' },
  { id: 'M17', text: '帮我收拾一下', note: '无目录', kind: 'route' },
  { id: 'M18', text: '备份一下 Ackem', note: '官方备份', kind: 'route' },
  { id: 'M19', text: '你会倒计时吗', note: '问计时', kind: 'route' },
  {
    id: 'M20',
    text: 'set a timer for 10 minutes, and then look up how to pack glasses',
    note: '英文拆句',
    kind: 'route'
  }
]
