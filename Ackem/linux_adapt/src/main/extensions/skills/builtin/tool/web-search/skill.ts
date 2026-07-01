// [S-15] 网页搜索 — Bing Skill

import { createLogger } from '../../../../../logger.js'
import { formatSearchResults, searchWebWithMeta } from '../../../../plugins/builtin/knowledge-presentation/presentation/search.js'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types.js'
import { enrichQueryForRecency } from '../../../../plugins/builtin/knowledge-presentation/presentation/recencyContext.js'
import { WEB_SEARCH_MANIFEST } from './manifest.js'

const log = createLogger('web-search')

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const rawQuery = typeof invocation.args?.query === 'string' ? invocation.args.query.trim() : ''
  const query = enrichQueryForRecency(rawQuery)

  if (!query) {
    log.warn('web_search 调用但 query 为空', { called: true, resultCount: 0 })
    return {
      ok: false,
      output: '未提供搜索关键词',
      error: 'query 为空',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  log.info('web_search 开始搜索', { called: true, query, engine: 'bing' })

  try {
    const { results, engine } = await searchWebWithMeta(query)
    const durationMs = Date.now() - start
    log.info('web_search 搜索完成', {
      called: true,
      query,
      resultCount: results.length,
      engine,
      ok: true,
      durationMs
    })

    const formatted = formatSearchResults(results)
    const output =
      results.length === 0
        ? `【${engine}】未找到与「${query}」相关的结果，请换关键词重试。`
        : `【${engine} 搜索「${query}」】共 ${results.length} 条\n\n${formatted}`

    return {
      ok: true,
      output,
      data: { query, engine, resultCount: results.length, results },
      injectToContext: true,
      events: [],
      durationMs
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('web_search 搜索失败', {
      called: true,
      query,
      resultCount: 0,
      ok: false,
      error: msg,
      durationMs: Date.now() - start
    })
    return {
      ok: false,
      output: '',
      error: msg,
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const webSearchSkill: SkillHandler = {
  manifest: WEB_SEARCH_MANIFEST,
  execute
}
