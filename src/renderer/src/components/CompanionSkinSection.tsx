import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import type { AppSettings } from '../Ackem'
import type { CompanionSkinBinding } from '../../../shared/companionSkin'
import { CompanionAvatar } from './CompanionAvatar'

export function CompanionSkinSection(props: {
  form: AppSettings
  setForm: (f: AppSettings) => void
  pushToast: (t: string) => void
  /** 宓屽叆璁剧疆鍒嗙粍鏃跺幓鎺夊灞傚崱鐗?*/
  embedded?: boolean
}): JSX.Element {
  const [skins, setSkins] = useState<CompanionSkinBinding[]>([])

  useEffect(() => {
    void window.Ackem.companionSkinList().then(setSkins)
    window.Ackem.onCompanionSkinChanged(() => {
      void window.Ackem.companionSkinList().then(setSkins)
    })
  }, [])

  const activeId = props.form.activeCompanionSkinPluginId ?? ''

  const body = (
    <>
      {!props.embedded ? (
        <>
          <h2 className="text-sm font-semibold text-ink">浼翠荆褰㈣薄</h2>
          <p className="mt-2 text-xs text-ink-muted">
            宸︿笅瑙掑厜鐞?鐨偆浣嶏紙涓婚潰鏉夸笌妗屽疇绐楀悓姝ワ級銆侺ive2D 鎻掍欢褰撳墠涓哄嚑浣曞厜鐞冮瑙堬紝闈?Cubism 妯″瀷銆?
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
                  const r = await window.Ackem.companionSkinSetActive(id)
                  if (r.ok) {
                    props.setForm({ ...props.form, activeCompanionSkinPluginId: id ?? undefined })
                    props.pushToast(id ? `宸插垏鎹細${s.pluginName}` : '宸叉仮澶嶉粯璁ゅ舰璞?)
                  }
                }}
              />
              <span className="text-ink">{s.pluginName}</span>
              {s.implementationStatus === 'preview' && (
                <span className="exp-muted text-[10px]">锛堝嚑浣曢瑙?路 W8 Cubism锛?/span>
              )}
              {s.implementationStatus === 'stub' && (
                <span className="exp-muted text-[10px]">锛圫tub 棰勮锛?/span>
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
