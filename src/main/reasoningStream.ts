/** Split inline thinking tags before any content is published, across arbitrary token boundaries. */
export function createReasoningStream(content: (text: string) => void, reasoning: (text: string) => void) {
  let pending = '', thinking = false, fenced = false
  const tags = ['<think>', '</think>', '<thinking>', '</thinking>']
  const tokens = [...tags, '```']
  const emit = (text: string) => { if (text) (thinking ? reasoning : content)(text) }
  const drain = (final = false) => {
    while (pending) {
      const lower = pending.toLowerCase()
      let index = pending.length, token = ''
      for (const candidate of tokens) {
        if (fenced && candidate !== '```') continue
        if (thinking && candidate === '```') continue
        const found = lower.indexOf(candidate)
        if (found >= 0 && found < index) { index = found; token = candidate }
      }
      if (token) {
        emit(pending.slice(0, index)); pending = pending.slice(index + token.length)
        if (token === '```') { emit(token); fenced = !fenced }
        else thinking = !token.startsWith('</')
        continue
      }
      let hold = 0
      for (const candidate of tokens) {
        if (fenced && candidate !== '```') continue
        for (let n = 1; n < candidate.length; n++) if (lower.endsWith(candidate.slice(0, n))) hold = Math.max(hold, n)
      }
      if (final) {
        // Do not publish a truncated thinking marker as answer text.
        if (hold && pending.slice(-hold).startsWith('<')) emit(pending.slice(0, -hold))
        else emit(pending)
        pending = ''; return
      }
      emit(pending.slice(0, pending.length - hold)); pending = pending.slice(pending.length - hold); return
    }
  }
  return { push(text: string) { pending += text; drain() }, finish() { drain(true) } }
}
