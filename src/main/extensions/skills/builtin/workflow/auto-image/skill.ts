// [Auto Image] 聊天自动配图 — Workflow Skill

import { createLogger } from '../../../../../logger.js'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types.js'
import { generateImage, getOutputDir } from '../../tool/agnes-image/skill.js'
import { loadSettings } from '../../../../../settings.js'

const log = createLogger('auto-image')

// 从对话内容中提取图片描述
function extractImagePrompt(userMsg: string, assistantReply: string): string | null {
  // 跳过太短的消息
  if (userMsg.length < 5 && assistantReply.length < 10) return null

  // 跳过纯指令性消息
  const skipPatterns = [
    /^(好的?|ok|嗯|哦|知道了|收到|谢谢|感谢|不客气)$/,
    /^(HEARTBEAT_OK|NO_REPLY)$/,
    /^\//
  ]
  if (skipPatterns.some(p => p.test(userMsg.trim()))) return null

  // 基于对话内容生成图片描述
  // 取用户消息和助手回复的关键信息
  const combined = `${userMsg} ${assistantReply}`.slice(0, 200)

  // 提取关键词和场景
  const keywords = extractKeywords(combined)
  if (keywords.length === 0) return null

  // 构建图片描述
  const prompt = buildImagePrompt(keywords, combined)
  return prompt
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = []

  // 场景关键词
  const scenePatterns = [
    /清晨|早晨|早上|早安|日出|sunrise/i,
    /夜晚|深夜|晚安|星空|月亮|night|moon|star/i,
    /海边|海滩|大海|海洋|sea|beach|ocean/i,
    /山|森林|花园|自然|mountain|forest|garden|nature/i,
    /城市|街道|都市|city|street|urban/i,
    /咖啡|茶|书|阅读|coffee|tea|book|reading/i,
    /雨|雪|阳光|微风|rain|snow|sunshine|wind/i,
    /猫|狗|宠物|cat|dog|pet/i,
    /花|樱花|玫瑰|flower|cherry|rose/i,
    /音乐|钢琴|吉他|music|piano|guitar/i
  ]

  for (const pattern of scenePatterns) {
    const match = text.match(pattern)
    if (match) keywords.push(match[0])
  }

  // 情感关键词
  const moodPatterns = [
    /开心|快乐|高兴|happy|joy/i,
    /安静|平静|宁静|peaceful|calm|serene/i,
    /温暖|温馨|warm|cozy/i,
    /孤独|寂寞|alone|lonely/i,
    /思念|想念|miss|memory/i,
    /希望|梦想|hope|dream/i,
    /治愈|疗愈|healing|comfort/i
  ]

  for (const pattern of moodPatterns) {
    const match = text.match(pattern)
    if (match) keywords.push(match[0])
  }

  return keywords.slice(0, 5) // 最多5个关键词
}

function buildImagePrompt(keywords: string[], context: string): string {
  // 基于关键词构建图片描述
  const scene = keywords[0] || '温馨的场景'
  const mood = keywords.find(k => /开心|快乐|安静|平静|温暖|孤独|思念|希望|治愈/.test(k)) || '温馨'

  // 构建一个简洁但有画面感的描述
  const prompt = `${scene}，${mood}的氛围，柔和的光线，细腻的画面，高品质插画风格`
  return prompt
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const { userMsg, assistantReply, auto } = invocation.args as {
    userMsg?: string
    assistantReply?: string
    auto?: boolean
  }

  // 如果是自动模式，需要用户提供消息内容
  if (auto && (!userMsg || !assistantReply)) {
    return {
      ok: false,
      output: '自动配图需要用户消息和助手回复',
      error: 'missing messages',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  // 手动模式：用户直接要求生图
  if (!auto) {
    const prompt = invocation.args?.prompt as string
    if (!prompt) {
      return {
        ok: false,
        output: '请提供图片描述',
        error: 'prompt required',
        injectToContext: false,
        events: [],
        durationMs: Date.now() - start
      }
    }

    try {
      const result = await generateImage(prompt, "1024x1024", loadSettings())
      return {
        ok: true,
        output: `🎨 配图已生成！\n\n描述: ${prompt}\n文件: ${result.path}`,
        data: { path: result.path, prompt },
        injectToContext: true,
        events: [],
        durationMs: Date.now() - start
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        output: `❌ 配图生成失败: ${msg}`,
        error: msg,
        injectToContext: false,
        events: [],
        durationMs: Date.now() - start
      }
    }
  }

  // 自动模式：基于对话内容生成配图
  const prompt = extractImagePrompt(userMsg!, assistantReply!)
  if (!prompt) {
    log.debug('跳过自动配图：消息内容不适合生成图片')
    return {
      ok: true,
      output: '跳过自动配图',
      data: { skipped: true },
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  try {
    log.info('自动生成配图', { prompt, userMsg: userMsg!.slice(0, 50) })
    const result = await generateImage(prompt, "1024x1024", loadSettings())
    return {
      ok: true,
      output: `🎨 自动配图已生成！\n\n描述: ${prompt}\n文件: ${result.path}`,
      data: { path: result.path, prompt, auto: true },
      injectToContext: true,
      events: [],
      durationMs: Date.now() - start
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('自动配图失败', { prompt, error: msg })
    return {
      ok: false,
      output: `自动配图失败: ${msg}`,
      error: msg,
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const autoImageSkill: SkillHandler = {
  manifest: {
    type: 'workflow',
    id: 'ackem/auto-image@1.0.0',
    version: '1.0.0',
    title: '聊天自动配图',
    description: '在每次对话回复后，自动生成一张与聊天内容相关的图片。',
    triggers: [{ event: 'postChatTurn' }]
  },
  execute
}
