/** JE-3：uplugin 独立 Surface 配置（存 plugin.meta.json） */

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
  /** 内联 HTML（W1 最小）；或相对插件目录的 entry 路径 */
  html?: string
  entry?: string
  /** OID：宿主 Widget 模板 id（优先于静态 html） */
  widget?: OpenForUWidgetId
  widgetConfig?: Record<string, unknown>
  /** Gate3 交互验收剧本 */
  interactionScript?: InteractionStep[]
  requiredLevel?: InteractionRequiredLevel
  /** OFU-Surface：slash / 关键词触发时的宿主行为 */
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

/** W2-D 标杆页：演示 surfacePreload · ackem.extension.getContext / close */
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
    <span class="badge">Ackem Extension Surface · W2-D</span>
    <h1>${safeTitle}</h1>
    <p class="hint">独立窗口已就绪。下方信息来自 <code>ackem.extension.getContext()</code>（surfacePreload 窄 API）。</p>
    <div class="card">
      <div class="label">extensionId</div>
      <div class="value" id="ext-id">加载中…</div>
    </div>
    <div class="card">
      <div class="label">title</div>
      <div class="value" id="ext-title">—</div>
    </div>
    <button type="button" id="btn-close">关闭窗口</button>
  </main>
  <script>
    (async function () {
      var extApi = window.ackem && window.ackem.extension;
      if (!extApi) {
        document.getElementById('ext-id').textContent = '（preload 未加载）';
        return;
      }
      try {
        var ctx = await extApi.getContext();
        document.getElementById('ext-id').textContent = (ctx && ctx.extensionId) || '—';
        document.getElementById('ext-title').textContent = (ctx && ctx.title) || '—';
      } catch (e) {
        document.getElementById('ext-id').textContent = '读取失败';
      }
      document.getElementById('btn-close').addEventListener('click', function () {
        extApi.close();
      });
    })();
  </script>
</body>
</html>`
}
