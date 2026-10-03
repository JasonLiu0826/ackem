import type { AppSettings } from '../../settings'
import { createLlmJsonClient } from '../../llmClient'
import { setSocialLlmGenerator, type PostContext } from './contentService'

/** Wire LLM Moments generator (2s race already in generatePost). Safe no-op without API key. */
export function wireSocialLlmGenerator(settings: AppSettings): void {
  const key = (settings.openaiApiKey ?? '').trim()
  if (!key && (settings.llmProvider ?? 'openai') !== 'anthropic') {
    setSocialLlmGenerator(undefined)
    return
  }

  const client = createLlmJsonClient(settings)
  setSocialLlmGenerator(async (ctx: PostContext) => {
    const mood =
      ctx.jealous
        ? `语气略酸，隐约在意用户更亲近${ctx.favoriteName ?? '别人'}，但不要直说吃醋。`
        : ctx.aff < -0.3
          ? '语气安静、低落一点。'
          : ctx.aff > 0.35
            ? '语气轻松开心。'
            : '语气平常、生活感。'
    const text = await client.chatCompletionJson({
      messages: [
        {
          role: 'system',
          content:
            '你在写一条短朋友圈动态。只输出正文，不要引号、不要标签、不要解释。1–2句中文，像真人随手发的。',
        },
        {
          role: 'user',
          content: `角色名：${ctx.name}。${mood}写一条动态。`,
        },
      ],
      temperature: 0.85,
      max_tokens: 80,
    })
    return text.replace(/^["「]|["」]$/g, '').trim()
  })
}
