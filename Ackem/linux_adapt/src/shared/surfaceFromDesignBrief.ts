import type { PlanUiDesignBrief } from './planDesignSpec'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 由 Design Brief 确定性生成 Surface HTML（Ackem 暗色主题） */
export function buildSurfaceHtmlFromDesignBrief(
  title: string,
  brief: PlanUiDesignBrief,
  primaryActions: string[]
): string {
  const safeTitle = escapeHtml(title)
  const goal = escapeHtml(brief.userGoal)
  const buttons = primaryActions
    .map(
      (label, i) =>
        `<button type="button" class="action-btn" data-action="${escapeHtml(label)}" id="btn-${i}">${escapeHtml(label)}</button>`
    )
    .join('\n        ')
  const sections = brief.sections
    .map(
      (s) =>
        `<div class="card"><div class="label">${escapeHtml(s.label)}</div><div class="value">${escapeHtml(s.content)}</div></div>`
    )
    .join('\n      ')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }
    main { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 1.35rem; margin: 0 0 6px; }
    .goal { font-size: 13px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5; }
    .card { background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
    .label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
    .value { font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .action-btn { padding: 10px 18px; border: none; border-radius: 8px; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; min-width: 72px; min-height: 40px; }
    .action-btn:hover { background: #2563eb; }
    .action-btn.is-active { background: #16a34a; }
    #status { margin-top: 16px; font-size: 13px; color: #94a3b8; min-height: 1.2em; }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p class="goal">${goal}</p>
    ${sections}
    <div class="actions">${buttons}</div>
    <p id="status">就绪</p>
  </main>
  <script>
    (function () {
      var status = document.getElementById('status');
      document.querySelectorAll('.action-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.action-btn').forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          if (status) status.textContent = '已执行：' + (btn.getAttribute('data-action') || btn.textContent);
        });
      });
    })();
  </script>
</body>
</html>`
}

/** 校验 Surface HTML 是否包含 designBrief 中的主操作 */
export function surfaceHtmlContainsPrimaryActions(html: string, actions: string[]): string[] {
  const missing: string[] = []
  for (const action of actions) {
    if (!action.trim()) continue
    if (!html.includes(action)) missing.push(action)
  }
  return missing
}
