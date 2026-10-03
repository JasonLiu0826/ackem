/**
 * Route v2 阶段 3-2 — 二次探针 (设计 §5 层1.5 / §9 不对称严格性).
 *
 * 门0 判 chat 且句子含"动作动词+宾语"信号时, 花一次残差分类确认 (频控:
 * per-session 每分钟 ≤ 2 次, 与伴随流无关)。结果仍过 normalizeChannel 硬改,
 * **只许升格**: chat → work 卡 / 插件候选 / 纸面卡之外的行动出口;
 * 分类器再次判 chat 时维持 chat (禁止降格在此天然成立——入口就是 chat)。
 */

const ACTION_PROBE_RE =
  /(处理|整理|归档|下载|安装|生成|同步|导出|导入|备份|转换|批量|抓取|汇总)[^\s，。！？]{0,16}/

const PROBE_WINDOW_MS = 60_000
const PROBE_MAX_PER_WINDOW = 2

const probeHits = new Map<string, number[]>()
let probeAcceptedCount = 0
let probeTotalCount = 0

export function resetProbeStateForTests(): void {
  probeHits.clear()
  probeAcceptedCount = 0
  probeTotalCount = 0
}

export function probeStatsForTests(): { accepted: number; total: number } {
  return { accepted: probeAcceptedCount, total: probeTotalCount }
}

export function shouldProbe(text: string, sessionId: string, now = Date.now()): boolean {
  if (!ACTION_PROBE_RE.test(text)) return false
  const hits = (probeHits.get(sessionId) ?? []).filter((t) => now - t < PROBE_WINDOW_MS)
  if (hits.length >= PROBE_MAX_PER_WINDOW) {
    probeHits.set(sessionId, hits)
    return false
  }
  hits.push(now)
  probeHits.set(sessionId, hits)
  return true
}

export function recordProbeOutcome(upgraded: boolean): void {
  probeTotalCount += 1
  if (upgraded) probeAcceptedCount += 1
}

export function probeEffectiveRate(): number | null {
  if (probeTotalCount === 0) return null
  return probeAcceptedCount / probeTotalCount
}
