import type { DispatchCatalogEntry, DispatchConfig } from '../protocols'

/** 浠?keywords 鐢熸垚榛樿 `/鍏抽敭璇峘锛堝紑鍙戜繚搴曪紝鏃犻渶閲嶅惎 Ackem锛?*/
export function buildSlashAliasesFromKeywords(keywords: string[]): string[] {
  const out: string[] = []
  for (const kw of keywords) {
    const t = kw.trim()
    if (!t || t.length > 32) continue
    out.push(`/${t}`)
  }
  return [...new Set(out)]
}

/** 鎵╁睍鍙敤鐨?slash 鍛戒护锛坢anifest.dispatch.slash 浼樺厛锛屽惁鍒欑敱 keywords 鎺ㄥ锛?*/
export function getSlashCommandsForEntry(entry: DispatchCatalogEntry): string[] {
  const explicit = entry.dispatch.slash?.map((s) => normalizeSlashToken(s)).filter(Boolean) as string[]
  if (explicit?.length) return [...new Set(explicit)]
  return buildSlashAliasesFromKeywords(entry.dispatch.keywords)
}

function normalizeSlashToken(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return t.startsWith('/') ? t : `/${t}`
}

/**
 * 鍖归厤鐢ㄦ埛杈撳叆 `/鐣寗閽焋 鎴?`/娌欑鎺㈤拡`锛堝彲甯﹀悗缁鏄庯細`/鐣寗閽?寮€濮嬪惂`锛?
 * 杩斿洖鍛戒腑鐨?catalog 鏉＄洰锛涗笉渚濊禆 LLM銆佷笉渚濊禆銆屽紑濮?鎵撳紑銆嶅墠缂€銆?
 */
export function matchSlashInvoke(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  const trimmed = message.trim()
  const m = trimmed.match(/^\/([^\s/]{1,32})(?:\s+([\s\S]*))?$/)
  if (!m) return undefined

  const cmd = m[1].toLowerCase()

  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    if (entry.rejectedInSession) continue
    if (entry.dispatch.mode !== 'dispatched') continue

    const aliases = getSlashCommandsForEntry(entry).map((s) => s.slice(1).toLowerCase())
    if (aliases.includes(cmd)) return entry
  }

  return undefined
}

/**
 * 鐢ㄦ埛鍙戜簡 `/鍏抽敭璇峘锛屼絾瀵瑰簲鎵╁睍鏈?active锛堟湭鍚敤 / error / installed锛夋椂鍛戒腑銆?
 * 鐢ㄤ簬娉ㄥ叆銆岃鍒版墿灞曚腑蹇冨惎鐢ㄣ€嶇被鎻愮ず锛岄伩鍏嶅彧璧颁汉璁鹃棽鑱娿€?
 */
export function matchSlashInvokeDisabled(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  const trimmed = message.trim()
  const m = trimmed.match(/^\/([^\s/]{1,32})(?:\s+([\s\S]*))?$/)
  if (!m) return undefined

  const cmd = m[1].toLowerCase()

  for (const entry of catalog) {
    if (entry.status === 'active') continue
    if (entry.dispatch.mode !== 'dispatched') continue

    const aliases = getSlashCommandsForEntry(entry).map((s) => s.slice(1).toLowerCase())
    if (aliases.includes(cmd)) return entry
  }

  return undefined
}

/** Plan 鐢熸垚 dispatch 鏃跺啓鍏?slash 鍒楄〃 */
export function attachSlashToDispatch(config: DispatchConfig): DispatchConfig {
  const slash = buildSlashAliasesFromKeywords(config.keywords)
  return slash.length ? { ...config, slash } : config
}

/** 閮ㄧ讲鎴愬姛 / 鎵╁睍涓績灞曠ず鐢?*/
export function formatSlashInvokeHint(dispatch: DispatchConfig): string {
  const slash = dispatch.slash?.length
    ? dispatch.slash
    : buildSlashAliasesFromKeywords(dispatch.keywords)
  if (!slash.length) return ''
  const shown = slash.slice(0, 4).map((s) => `\`${s}\``).join(' 路 ')
  return `- 淇濆簳瑙﹀彂锛堜富鑱婂ぉ锛夛細${shown} 鈥?鍛戒腑鍗宠皟鐢紝涓嶄緷璧栬嚜鐒惰瑷€`
}
