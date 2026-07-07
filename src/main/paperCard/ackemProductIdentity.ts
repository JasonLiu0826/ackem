// [paperCard/AckemProductIdentity] 鈥?绾搁潰鍗?妫€绱細Ackem 浜у搧韬唤锛屼笉鏆撮湶搴曞眰妯″瀷

/** 鐢ㄦ埛鏄惁鍦ㄦ嬁銆屼綘/Ackem銆嶄笌鍏朵粬浜у搧瀵规瘮鎴栭棶鑷韩鑳藉姏 */
export function userRefersToAckemSelf(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/浣犻兘鏈夊暐|浣犳湁浠€涔堝姛鑳絴浣犳槸鍟浣犲彨浠€涔坾Ackem/u.test(t)) return true
  if (/瀵规瘮|姣旇緝|鍖哄埆|宸埆|vs/i.test(t) && /(?:浣爘鎮▅Ackem|杩欒竟)/u.test(t)) return true
  if (/(?:浣爘Ackem).{0,16}(?:鍜寍涓巪璺焲杩樻槸).{0,24}(?:Codex|Cursor|Claude|Copilot|ChatGPT)/iu.test(t)) {
    return true
  }
  return false
}

const KNOWN_COMPARE_PRODUCTS =
  /Codex|Claude\s*Code|Cursor|Copilot|ChatGPT|Windsurf|Cline|Devin|Gemini\s*Code/gi

export function extractCompareTargetProducts(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(KNOWN_COMPARE_PRODUCTS)) {
    const v = m[0].trim()
    if (v) found.add(v.replace(/\s+/g, ' '))
  }
  return [...found]
}

export const Ackem_PRODUCT_IDENTITY_GUARD =
  '\n\n銆愯韩浠?路 纭€?路 Ackem銆慭n' +
  '- 浣犲氨鏄?**Ackem**锛堟闈?AI 浼翠荆搴旂敤锛夛紝鐢ㄣ€屾垜 / Ackem銆嶆寚浠ｈ嚜宸便€俓n' +
  '- **绂佹**鑷О鎴栨殫绀鸿嚜宸辨槸搴曞眰澶фā鍨?API 鍚嶇О锛圖eepSeek銆丟PT銆丆laude銆丟emini銆丵wen銆侀€氫箟绛夛級銆俓n' +
  '- **涓嶇煡閬?*鐢ㄦ埛璁剧疆閲屾帴鐨勬槸鍝 API锛涗笉寰楁妸 API 鎻愪緵鍟嗗綋鎴愩€屼綘銆嶃€俓n' +
  '- 鐢ㄦ埛闂€屼綘銆嶇殑鍔熻兘銆佹垨鎷裤€屼綘銆嶄笌鍏朵粬宸ュ叿瀵规瘮鏃讹細鍐?**Ackem 浜у搧鑳藉姏**锛堥暱鏈熻蹇嗕笌浜烘牸鎯呯华銆佺煡璇嗘暣鐞?璁″垝涔?瀵规瘮琛ㄣ€佽仈缃戞悳绱€佸井淇¤繛鍙戙€佹墿灞?Skill銆佹父鎴忔ā寮忕瓑锛夛紝涓嶆槸鏌愪釜鍩哄骇妯″瀷鐨勫弬鏁版鍗曘€俓n' +
  '- 妫€绱㈢粨鏋滆嫢鍦ㄥぇ璋堟煇寮€婧?闂簮妯″瀷锛氶偅鏄涓夋柟淇℃伅锛?*涓嶅緱**鎶婅妯″瀷鍐欐垚銆屾垜銆嶆垨 Ackem 鐨勪唬绉般€俓n'

export function buildAckemCompareCardBlock(userQuestion: string): string {
  if (!userRefersToAckemSelf(userQuestion)) return ''
  const others = extractCompareTargetProducts(userQuestion)
  const otherHint = others.length ? `鐢ㄦ埛鐐瑰悕鐨勫姣旀柟鍖呮嫭锛?{others.join('銆?)}銆俙 : ''
  return (
    '\n\n銆愬姣斾换鍔?路 Ackem 蹇呴』鍦ㄥ満銆慭n' +
    '鐢ㄦ埛姝ｅ湪鎷?**Ackem锛堜綘锛?* 涓庡叾浠栦骇鍝佹瘮杈冦€傝〃鏍?姝ｆ枃閲屼唬琛ㄣ€屼綘銆嶇殑涓€鏂?**蹇呴』鍐?Ackem**锛屾弿杩?Ackem 搴旂敤鑳藉姏銆俓n' +
    '**绂佹**鐢?DeepSeek / GPT / Claude 绛夋ā鍨嬪悕鏇夸唬 Ackem銆俓n' +
    otherHint +
    '鍏朵粬鍒楁寜鐢ㄦ埛鐐瑰悕鐨勪骇鍝佸瀹炲～鍐欙紱鎼滃埌鐨勬ā鍨?API 璧勬枡鍙兘鎻忚堪瀵规柟鎴栬涓氳儗鏅紝涓嶈兘褰撴垚銆屾垜銆嶃€俓n'
  )
}

export function buildAckemAwareSearchQueries(
  userMessage: string,
  queries: Array<string | undefined | null>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (q: string | undefined | null) => {
    if (typeof q !== 'string') return
    const t = q.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  if (userRefersToAckemSelf(userMessage)) {
    const targets = extractCompareTargetProducts(userMessage)
    const tail = targets.length ? ` vs ${targets.join(' vs ')} comparison` : ' features capabilities'
    push(`Ackem AI companion desktop app${tail}`)
    push('Ackem 浼翠荆 璁板繂 浜烘牸 鍔熻兘')
  }

  for (const q of queries) push(q)
  push(userMessage.trim())

  return out
}

const WRONG_SELF_MODEL_RE =
  /DeepSeek(?:\s*\([^)]*\))?|GPT-?[\d.o]+|Claude(?:\s*\d+)?(?:\s*Code)?|Gemini(?:\s*\d+)?|Qwen|閫氫箟鍗冮棶|鏂囧績涓€瑷€/gi

/** 瀵规瘮浠诲姟鍚庡鐞嗭細鎶婅鍐欐垚搴曞眰妯″瀷鐨勩€屽繁鏂广€嶆敼鍥?Ackem */
export function sanitizeAckemIdentityInMarkdown(body: string, userQuestion: string): string {
  if (!userRefersToAckemSelf(userQuestion) || !body.trim()) return body

  let out = body

  out = out.replace(/銆愬姣擺锛?]\s*([^銆慭n]+)銆?gu, (match, inner: string) => {
    const parts = inner.split(/\s+vs\s+/i)
    if (parts.length >= 2 && WRONG_SELF_MODEL_RE.test(parts[0])) {
      parts[0] = 'Ackem'
      return `銆愬姣旓細${parts.join(' vs ')}銆慲
    }
    return match
  })

  out = out.replace(/^鈻嶾s*DeepSeek[^\n]*/gim, '鈻嶣ritney')
  out = out.replace(/^#{1,3}\s+DeepSeek[^\n]*/gim, '## Ackem')
  out = out.replace(/\|\s*DeepSeek[^|\n]*\|/gi, '| Ackem |')

  out = out.replace(
    /(鈻嶾s*)(DeepSeek(?:\s*\([^)]*\))?)(\s*[\r\n])/gi,
    '$1Ackem$3'
  )

  return out
}
