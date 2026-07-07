/** 瀹夸富 Widget Surface HTML锛圛R 瀹㈡埛绔剼鏈級 */

import type { OpenForUWidgetId } from '../../../../../shared/openforuWidgets'
import { widgetActionManifest } from '../../../../../shared/openforuWidgets'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const IR_BOOT = `
(function () {
  var api = window.Ackem && window.Ackem.surface;
  if (!api) {
    var el = document.getElementById('status');
    if (el) el.textContent = '锛坰urface IR 鏈姞杞斤級';
    return;
  }
  function render(state) {
    if (!state) return;
    var phase = document.getElementById('phase');
    var timer = document.getElementById('timer');
    var count = document.getElementById('count');
    var status = document.getElementById('status');
    if (phase && state.phase) phase.textContent = state.phaseLabel || state.phase;
    if (timer && state.display) timer.textContent = state.display;
    if (count && typeof state.count === 'number') count.textContent = String(state.count);
    if (status && state.statusText) status.textContent = state.statusText;
    document.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.classList.toggle('is-active', state.activeAction === btn.getAttribute('data-action'));
    });
  }
  api.getState().then(render);
  api.subscribeState(render);
  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      api.invoke(btn.getAttribute('data-action') || btn.textContent || '');
    });
  });
})();`

function actionButtons(widgetId: OpenForUWidgetId, primaryActions: string[]): string {
  const labels = widgetActionManifest(widgetId, primaryActions)
  return labels
    .map(
      (label, i) =>
        `<button type="button" class="action-btn" data-action="${escapeHtml(label)}" id="btn-${i}">${escapeHtml(label)}</button>`
    )
    .join('\n        ')
}

const BASE_STYLE = `
    :root { color-scheme: dark; font-family: system-ui, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }
    main { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 1.35rem; margin: 0 0 6px; }
    .badge { display: inline-block; font-size: 11px; padding: 3px 8px; border-radius: 999px; background: #334155; color: #94a3b8; margin-bottom: 12px; }
    .timer { font-size: 2.5rem; font-variant-numeric: tabular-nums; margin: 16px 0 8px; }
    .phase { font-size: 14px; color: #94a3b8; margin-bottom: 16px; }
    .count { font-size: 3rem; font-variant-numeric: tabular-nums; margin: 16px 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .action-btn { padding: 10px 18px; border: none; border-radius: 8px; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; min-width: 72px; min-height: 40px; }
    .action-btn:hover { background: #2563eb; }
    .action-btn.is-active { background: #16a34a; }
    #status { margin-top: 16px; font-size: 13px; color: #64748b; min-height: 1.2em; }
`

export function buildWidgetHtml(
  widgetId: OpenForUWidgetId,
  title: string,
  config: Record<string, unknown>,
  primaryActions: string[]
): string {
  const safeTitle = escapeHtml(title)
  const actions = primaryActions.length ? primaryActions : (config.primaryActions as string[] | undefined) ?? []

  let body = ''
  switch (widgetId) {
    case 'timer.pomodoro':
      body = `
    <span class="badge">OpenForU 路 timer.pomodoro</span>
    <h1>${safeTitle}</h1>
    <div class="timer" id="timer">${String(config.focusMinutes ?? 25).padStart(2, '0')}:00</div>
    <div class="phase" id="phase">灏辩华</div>
    <div class="actions">${actionButtons(widgetId, actions)}</div>
    <p id="status">鐐瑰嚮寮€濮嬩笓娉?/p>`
      break
    case 'timer.countdown':
      body = `
    <span class="badge">OpenForU 路 timer.countdown</span>
    <h1>${safeTitle}</h1>
    <div class="timer" id="timer">${formatSec(Number(config.durationSec ?? 300))}</div>
    <div class="phase" id="phase">${escapeHtml(String(config.label ?? '鍊掕鏃?))}</div>
    <div class="actions">${actionButtons(widgetId, actions)}</div>
    <p id="status">灏辩华</p>`
      break
    case 'counter.simple':
      body = `
    <span class="badge">OpenForU 路 counter.simple</span>
    <h1>${safeTitle}</h1>
    <div class="count" id="count">${String(config.initial ?? 0)}</div>
    <div class="actions">${actionButtons(widgetId, actions)}</div>
    <p id="status">璁℃暟鍣?/p>`
      break
    case 'checklist.basic': {
      const items = (config.items as string[] | undefined) ?? ['绗竴椤?]
      const list = items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')
      body = `
    <span class="badge">OpenForU 路 checklist.basic</span>
    <h1>${safeTitle}</h1>
    <ul>${list}</ul>
    <div class="actions">${actionButtons(widgetId, actions)}</div>
    <p id="status">娓呭崟 ${items.length} 椤?/p>`
      break
    }
    default:
      body = `<h1>${safeTitle}</h1><p id="status">鏈煡 widget</p>`
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>${safeTitle}</title>
  <style>${BASE_STYLE}</style>
</head>
<body>
  <main>${body}
  </main>
  <script>${IR_BOOT}</script>
</body>
</html>`
}

function formatSec(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function widgetHtmlContainsActions(html: string, actions: string[]): string[] {
  const missing: string[] = []
  for (const a of actions) {
    if (!html.includes(a)) missing.push(a)
  }
  return missing
}
