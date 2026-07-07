/** JE-3锛歶plugin 鐙珛 Surface 閰嶇疆锛堝瓨 plugin.meta.json锛?*/

import type { InteractionRequiredLevel, InteractionStep } from './openforuInteraction'
import type { OpenForUWidgetId } from './openforuWidgets'
import type { SurfaceInvokePolicy } from './surfaceInvoke'
import { DEFAULT_SURFACE_INVOKE } from './surfaceInvoke'

export type SurfaceInvokeDispatchMeta = {
  mode: 'open' | 'open_and_inject'
  skipMainChatLlm?: boolean
}

export type ExtensionSurfaceConfig = {
  enabled: boolean
  title?: string
  /** 鍐呰仈 HTML锛圵1 鏈€灏忥級锛涙垨鐩稿鎻掍欢鐩綍鐨?entry 璺緞 */
  html?: string
  entry?: string
  /** OID锛氬涓?Widget 妯℃澘 id锛堜紭鍏堜簬闈欐€?html锛?*/
  widget?: OpenForUWidgetId
  widgetConfig?: Record<string, unknown>
  /** Gate3 浜や簰楠屾敹鍓ф湰 */
  interactionScript?: InteractionStep[]
  requiredLevel?: InteractionRequiredLevel
  /** OFU-Surface锛歴lash / 鍏抽敭璇嶈Е鍙戞椂鐨勫涓昏涓?*/
  invoke?: SurfaceInvokePolicy
}

export function withSurfaceInvokeDefaults(
  surface: ExtensionSurfaceConfig
): ExtensionSurfaceConfig {
  return {
    ...surface,
    invoke: { ...DEFAULT_SURFACE_INVOKE, ...surface.invoke }
  }
}

export function isSurfaceEnabled(surface?: ExtensionSurfaceConfig | null): boolean {
  return Boolean(surface?.enabled)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** W2-D 鏍囨潌椤碉細婕旂ず surfacePreload 路 Ackem.extension.getContext / close */
export function defaultSurfaceHtml(title: string): string {
  const safeTitle = escapeHtml(title)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }
    main { max-width: 560px; margin: 0 auto; padding: 40px 28px; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    .badge { display: inline-block; font-size: 12px; padding: 4px 10px; border-radius: 999px; background: #334155; color: #94a3b8; margin-bottom: 20px; }
    .card { background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 12px; padding: 16px 18px; margin: 16px 0; }
    .label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .value { font-family: ui-monospace, monospace; font-size: 13px; word-break: break-all; }
    button { margin-top: 20px; padding: 10px 18px; border: none; border-radius: 8px; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; }
    button:hover { background: #2563eb; }
    .hint { font-size: 13px; color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <span class="badge">Ackem Extension Surface 路 W2-D</span>
    <h1>${safeTitle}</h1>
    <p class="hint">鐙珛绐楀彛宸插氨缁€備笅鏂逛俊鎭潵鑷?<code>Ackem.extension.getContext()</code>锛坰urfacePreload 绐?API锛夈€?/p>
    <div class="card">
      <div class="label">extensionId</div>
      <div class="value" id="ext-id">鍔犺浇涓€?/div>
    </div>
    <div class="card">
      <div class="label">title</div>
      <div class="value" id="ext-title">鈥?/div>
    </div>
    <button type="button" id="btn-close">鍏抽棴绐楀彛</button>
  </main>
  <script>
    (async function () {
      var extApi = window.Ackem && window.Ackem.extension;
      if (!extApi) {
        document.getElementById('ext-id').textContent = '锛坧reload 鏈姞杞斤級';
        return;
      }
      try {
        var ctx = await extApi.getContext();
        document.getElementById('ext-id').textContent = (ctx && ctx.extensionId) || '鈥?;
        document.getElementById('ext-title').textContent = (ctx && ctx.title) || '鈥?;
      } catch (e) {
        document.getElementById('ext-id').textContent = '璇诲彇澶辫触';
      }
      document.getElementById('btn-close').addEventListener('click', function () {
        extApi.close();
      });
    })();
  </script>
</body>
</html>`
}
