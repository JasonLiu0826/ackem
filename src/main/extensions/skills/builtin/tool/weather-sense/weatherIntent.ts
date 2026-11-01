/** 中文等可直接子串移除的噪声词 */
const CJK_GEOCODE_NOISE = [
  '今天', '明天', '后天', '今晚', '早上', '下午', '现在', '当前',
  '天气', '怎么样', '如何', '呢', '吗', '多少度', '冷不冷', '热不热',
  '下雨', '下雪', '带伞', '请问', '帮我', '查一下', '查询', '一下',
  '当地', '那边', '那里'
] as const

/** 英文等需整词匹配，避免误伤 Paris 等地名 */
const WORD_GEOCODE_NOISE = [
  'weather', 'tomorrow', 'today', 'tonight', 'forecast',
  'what', 'is', 'the', 'in', 'at', 'for', 'a', 'an'
] as const

export function buildGeocodeSearchQuery(text: string): string | null {
  let q = text.trim()
  if (!q) return null

  for (const word of CJK_GEOCODE_NOISE) {
    q = q.split(word).join(' ')
  }
  for (const word of WORD_GEOCODE_NOISE) {
    q = q.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ')
  }
  q = q.replace(/[，。！？、?!\s]+/g, ' ').trim()
  return q.length >= 2 ? q : null
}

/**
 * 粗判是否在问天气预报（仅通用词，不识别具体地名）。
 * 具体地点由 LLM tool 参数或 buildGeocodeSearchQuery + 地理编码 API 处理。
 */
export function isWeatherQuery(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false

  const hasWeatherWord =
    /天气|气温|温度|weather|forecast|temperature|rain|snow|下雨|下雪|冷不冷|热不热|带伞|humid|wind/i.test(t)
  if (!hasWeatherWord) return false

  // 排除"天气真好""天气不错"这类感叹（除非同时是提问/查询动作）
  if (
    /天气.{0,2}(?:真|很)?好|天气不错|lovely weather/i.test(t) &&
    !/[？?呢吗如何怎么样]|how|what|will|查|看|预报|问/i.test(t)
  ) {
    return false
  }

  return (
    /[？?呢吗如何怎么样]|how|what|will/i.test(t) ||
    /(?:今天|明天|后天|今晚|today|tomorrow|tonight)/i.test(t) ||
    /(?:多少度|冷不冷|热不热|下不下雨|下雨|下雪|带伞|humid|wind|气温|温度)/i.test(t) ||
    // 祈使句：查/看/问/报/说/告诉/播报/想知道 + 天气类词
    /(?:查|看|问|报|说|告诉|播报|知道|想看|想知道)[^，。！？]{0,6}(?:天气|气温|温度|weather)/i.test(t) ||
    // 天气 + 查询类后缀：天气预报 / 天气情况 / 天气如何
    /(?:天气|气温|温度)(?:预报|查询|情况|怎么样|如何|多少)/.test(t) ||
    /weather\s+(?:report|forecast|today|tomorrow)/i.test(t)
  )
}

/** 解析本次查询用的地点：tool 参数优先，否则从用户原句去噪，未指定则 null（由调用方回退默认位置） */
export function resolveWeatherLocationInput(
  args: Record<string, unknown> | undefined,
  userMessage: string | undefined,
  options: { allowMessageFallback: boolean }
): string | null {
  const city = typeof args?.city === 'string' ? args.city.trim() : ''
  if (city) return city

  const query = typeof args?.query === 'string' ? args.query.trim() : ''
  if (query) return query

  if (options.allowMessageFallback && userMessage) {
    return buildGeocodeSearchQuery(userMessage)
  }

  return null
}
