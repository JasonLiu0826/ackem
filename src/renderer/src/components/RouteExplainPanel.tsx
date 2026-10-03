type RouteExplain = NonNullable<
  import('../ackem.d.ts').BuildContextResult['routeExplain']
>

/**
 * 阶段 1「判决可见」前端收口 (Codex 验收项 2): the context drawer's routing
 * verdict section. Pure presentational — the data comes from
 * `context:build`'s `routeExplain` (ledger read-back). A missing verdict is
 * shown EXPLICITLY as unavailable; this component never fabricates an
 * explanation.
 */

const CHANNEL_LABEL: Record<string, string> = {
  chat: '陪聊：不伸手，本轮没有调用任何能力',
  plugin: '插件调用：调用了口袋里已装好的能力',
  work: '任务：需要动手改磁盘/造插件，已交任务运行时'
}

export function routeExplainUnavailableText(): string {
  return '本轮路由判决不可用（未落账或统计窗口外）。'
}

export function RouteExplainPanel({ explain }: { explain: RouteExplain | null | undefined }) {
  if (!explain || !explain.found) {
    return (
      <div className="mb-3 rounded-xl bg-surface-inset/30 p-3 text-[11px] text-ink-muted">
        <div className="mb-1 font-medium text-ink">本轮路由判决</div>
        <div data-testid="route-explain-unavailable">{routeExplainUnavailableText()}</div>
      </div>
    )
  }
  const channelText = explain.channelText ?? CHANNEL_LABEL[explain.finalChannel ?? ''] ?? explain.finalChannel
  return (
    <div className="mb-3 rounded-xl bg-surface-inset/30 p-3 text-[11px] text-ink-muted">
      <div className="mb-1 font-medium text-ink">本轮路由判决</div>
      <div data-testid="route-explain-channel">{channelText}</div>
      {explain.layers && explain.layers.length > 0 && (
        <ol className="mt-2 list-none space-y-1" data-testid="route-explain-layers">
          {explain.layers.map((l: { ruleId: string; text: string }, i: number) => (
            <li key={`${l.ruleId}-${i}`} className="flex items-baseline gap-2">
              <span className="text-ink-muted/70">{i + 1}.</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
