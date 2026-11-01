import { describe, expect, it } from 'vitest'
import {
  isActionableDesktopAgentTask,
  isMultiStepDesktopAgentTask
} from './desktopAgentTaskPlan'

describe('电脑助手派工判定（防止正常聊天被当成任务）', () => {
  // 真实翻车样本：语音占位文案里带「里面」，旧逻辑判成多步任务，
  // 于是普通聊天突然回「已在下方电脑助手面板开始执行」。
  it('占位/表情/寒暄一律不派工', () => {
    expect(isActionableDesktopAgentTask('[他发来一条语音，你听不到里面的内容]')).toBe(false)
    expect(isActionableDesktopAgentTask('[图:[好]]')).toBe(false)
    expect(isActionableDesktopAgentTask('晚上好呀，你在干嘛呢？')).toBe(false)
    expect(isActionableDesktopAgentTask('给我发这些干什么')).toBe(false)
    expect(isActionableDesktopAgentTask('我学习呢')).toBe(false)
    expect(isActionableDesktopAgentTask('哈哈里面好可爱')).toBe(false)
  })

  it('只有动作词、没有电脑对象，不算任务', () => {
    expect(isActionableDesktopAgentTask('你看看这个')).toBe(false)
    expect(isActionableDesktopAgentTask('打开心扉说说话')).toBe(false)
    expect(isActionableDesktopAgentTask('写一首诗给我')).toBe(false)
    expect(isActionableDesktopAgentTask('搜索一下人生意义')).toBe(false)
  })

  it('疑问句不派工', () => {
    expect(isActionableDesktopAgentTask('这个文件重要吗？')).toBe(false)
    expect(isActionableDesktopAgentTask('桌面那个文件是啥呢')).toBe(false)
  })

  it('真正的电脑任务仍然派工', () => {
    expect(isActionableDesktopAgentTask('帮我看看桌面上有什么文件')).toBe(true)
    expect(isActionableDesktopAgentTask('把下载里的 pdf 整理到桌面文件夹')).toBe(true)
    expect(isActionableDesktopAgentTask('帮我把这个压缩包删了')).toBe(true)
    expect(isActionableDesktopAgentTask('读取 ~/Documents/report.md')).toBe(true)
  })

  it('多步判定需要电脑对象 + 多个动作', () => {
    expect(isMultiStepDesktopAgentTask('先把文件复制到桌面，然后重命名')).toBe(true)
    expect(isMultiStepDesktopAgentTask('里面然后再说吧')).toBe(false)
  })
})
