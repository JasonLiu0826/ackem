/** 完整控制 tag（分条 / emoji / 贴纸） */
const COMPLETE_CONTROL_TAG_RE = /\[(?:SPLIT|emoji:[^\]]+|sticker:[a-zA-Z0-9_-]+)\]/gi

/** 末尾写了一半、未闭合的控制 tag（如 LLM 被 max_tokens 截断） */
const TRAILING_PARTIAL_TAG_RE =
  /\[(?:SPLIT|SPLI|SPL|SP|S|emoji(?::[^\]]*)?|sticker(?::[a-zA-Z0-9_-]*)?)?$/i

/** 去掉末尾未写完的 [SPL… / [emoji:… 等残片 */
export function stripTrailingPartialControlTags(raw: string): string {
  return raw.replace(TRAILING_PARTIAL_TAG_RE, '').trimEnd()
}

/** 去掉全部完整控制 tag，并清掉末尾残片 */
export function stripChannelControlTags(raw: string): string {
  return stripTrailingPartialControlTags(raw.replace(COMPLETE_CONTROL_TAG_RE, '').trim())
}
