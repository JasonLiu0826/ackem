import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import type { AppSettings } from '../ackem'
import type { CompanionSkinBinding } from '../../../shared/companionSkin'
import { CompanionAvatar } from './CompanionAvatar'

export function CompanionSkinSection(props: {
  form: AppSettings
  setForm: (f: AppSettings) => void
  pushToast: (t: string) => void
  /** 嵌入设置分组时去掉外层卡片 */
  embedded?: boolean
}): JSX.Element {
  const [skins, setSkins] = useState<CompanionSkinBinding[]>([])

  useEffect(() => {
    void window.ackem.companionSkinList().then(setSkins)
    window.ackem.onCompanionSkinChanged(() => {
      void window.ackem.companionSkinList().then(setSkins)
    })
  }, [])

  const activeId = props.form.activeCompanionSkinPluginId ?? ''

  const body = (
    <>
      {!props.embedded ? (
        <>
          <h2 className="text-sm font-semibold text-ink">伴侣形象</h2>
          <p className="mt-2 text-xs text-ink-muted">
            左下角光球/皮肤位（主面板与桌宠窗同步）。Live2D 插件当前为几何光球预览，非 Cubism 模型。
          </p>
        </>
      ) : null}
      <div className={props.embedded ? 'flex items-end gap-4' : 'mt-4 flex items-end gap-4'}>
        <CompanionAvatar state="idle" size={props.embedded ? 80 : 96} />
        <div className="flex-1 space-y-2">
          {skins.map((s) => (
            <label key={s.pluginId || 'builtin'} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="companionSkin"
                checked={(s.pluginId || '') === activeId}
                onChange={async () => {
                  const id = s.pluginId || null
                  const r = await window.ackem.companionSkinSetActive(id)
                  if (r.ok) {
                    props.setForm({ ...props.form, activeCompanionSkinPluginId: id ?? undefined })
                    props.pushToast(id ? `已切换：${s.pluginName}` : '已恢复默认形象')
                  }
                }}
              />
              <span className="text-ink">{s.pluginName}</span>
              {s.implementationStatus === 'preview' && (
                <span className="exp-muted text-[10px]">（几何预览 · W8 Cubism）</span>
              )}
              {s.implementationStatus === 'stub' && (
                <span className="exp-muted text-[10px]">（Stub 预览）</span>
              )}
            </label>
          ))}
        </div>
      </div>
    </>
  )

  if (props.embedded) return <>{body}</>
  return <section className="glass-panel rounded-2xl p-5">{body}</section>
}
