import { useEffect, useState } from 'react'
import type { AppSettings } from '../Ackem'
import type { MachineMapProgressPayload, MachineMapStatus } from '../../../shared/machineMap'
import { isDesktopAgentSettingsReady } from '../../../shared/desktopAgent'
import {
  DESKTOP_AGENT_GRAYSCALE_BANNER_ZH,
  isDesktopAgentGrayscalePreview
} from '../../../shared/desktopAgentFeature'
import { listDesktopAgentModeRules } from '../../../shared/desktopAgentModePolicy'
import { groupDesktopAgentCapabilitiesByUi } from '../../../shared/desktopAgentCapabilities'

type Props = {
  form: AppSettings
  setForm: (patch: Partial<AppSettings>) => void
}

export function DesktopAgentSettings({ form, setForm }: Props): JSX.Element {
  const previewOnly = isDesktopAgentGrayscalePreview()
  const masterOn = form.desktopAgentEnabled === true
  const canSaveMaster = !masterOn || form.desktopAgentRiskAccepted === true
  const settingsReady = isDesktopAgentSettingsReady(form)
  const [mapStatus, setMapStatus] = useState<MachineMapStatus | null>(null)
  const [mapProgress, setMapProgress] = useState<MachineMapProgressPayload | null>(null)

  useEffect(() => {
    if (!settingsReady) {
      setMapStatus(null)
      setMapProgress(null)
      return
    }

    void window.Ackem.machineMap.status().then(setMapStatus)
    window.Ackem.machineMap.onProgress((payload) => {
      setMapProgress(payload)
      if (payload?.status === 'complete' || payload?.status === 'error') {
        void window.Ackem.machineMap.status().then(setMapStatus)
      }
    })
  }, [settingsReady])

  const indexing =
    mapProgress?.status === 'running' || mapStatus?.status === 'running'
  const mapLabel =
    mapProgress?.label ??
    (mapStatus?.status === 'complete'
      ? `鏈満鍦板浘宸插氨缁?路 ${mapStatus.gameCount} 娆炬父鎴?路 ${mapStatus.documentCount} 涓枃妗
      : indexing
        ? '姝ｅ湪鍔姏鐞嗚В浣犵殑鐢佃剳涓€?
        : null)

  return (
    <div className="exp-panel space-y-3 rounded-xl p-4">
      <div className="exp-title text-xs font-medium">
        {previewOnly ? '鏆傛湭寮€鏀?路 鐢佃剳鍔╂墜' : '瀹為獙鍔熻兘 路 鐢佃剳鍔╂墜'}
      </div>
      {previewOnly ? (
        <p className="settings-callout-warn rounded-lg px-3 py-2 text-xs leading-relaxed">
          {DESKTOP_AGENT_GRAYSCALE_BANNER_ZH}
        </p>
      ) : null}
      <fieldset
        disabled={previewOnly}
        className={previewOnly ? 'pointer-events-none space-y-3 opacity-55' : 'space-y-3'}
      >
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          checked={masterOn}
          onChange={(e) =>
            setForm({
              desktopAgentEnabled: e.target.checked,
              ...(e.target.checked
                ? {}
                : {
                    desktopAgentRiskAccepted: false
                  })
            })
          }
        />
        <span>
          鍚敤鐢佃剳鍔╂墜锛堝疄楠岋級
          <span className="mt-1 block text-xs text-ink-muted">
            寮€鍚悗锛屽彲鍦ㄨ亰澶╅〉杩涘叆鐢佃剳鍔╂墜妯″紡锛岃 Ackem 鏍规嵁瀵硅瘽鎿嶄綔鏈満鏂囦欢涓庡簲鐢ㄣ€傛瘡娆℃搷浣滃墠閮戒細寮圭獥纭銆?
          </span>
        </span>
      </label>

      {masterOn && (
        <div className="ml-6 space-y-2 border-l border-surface-inset/60 pl-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowAppControl === true}
              onChange={(e) => setForm({ desktopAgentAllowAppControl: e.target.checked })}
            />
            鍏佽鎵撳紑 / 鍏抽棴 / 鑱氱劍搴旂敤绋嬪簭
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowFileWrite === true}
              onChange={(e) => setForm({ desktopAgentAllowFileWrite: e.target.checked })}
            />
            鍏佽澶嶅埗銆佺Щ鍔ㄣ€佸啓鍏ユ枃浠?
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowDelete === true}
              onChange={(e) => setForm({ desktopAgentAllowDelete: e.target.checked })}
            />
            鍏佽鍒犻櫎鏂囦欢锛堜粛姣忔纭锛涗紭鍏堣繘鍥炴敹绔欙級
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowDownload === true}
              onChange={(e) => setForm({ desktopAgentAllowDownload: e.target.checked })}
            />
            鍏佽浠?HTTPS 涓嬭浇鏂囦欢
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowInstall === true}
              onChange={(e) => setForm({ desktopAgentAllowInstall: e.target.checked })}
            />
            鍏佽涓嬭浇鍚庤繍琛屽畨瑁呭寘锛堥潪闈欓粯锛?
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowDocumentRead === true}
              onChange={(e) => setForm({ desktopAgentAllowDocumentRead: e.target.checked })}
            />
            鍏佽璇诲彇鏂囨。 / 鍥剧墖锛堝疄楠岋級
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            榛樿涓嬭浇鐩綍锛堢暀绌哄垯浣跨敤銆屼笅杞?AckemDownloads銆嶏級
            <input
              className="field-input mt-1"
              value={form.desktopAgentDownloadDir ?? ''}
              onChange={(e) => setForm({ desktopAgentDownloadDir: e.target.value })}
              placeholder="渚嬪 D:\Downloads\AckemDownloads"
            />
          </label>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          disabled={!masterOn}
          checked={form.desktopAgentRiskAccepted === true}
          onChange={(e) => setForm({ desktopAgentRiskAccepted: e.target.checked })}
        />
        <span className={!masterOn ? 'opacity-50' : undefined}>
          鎴戝凡闃呰骞剁悊瑙ｏ細鐢佃剳鍔╂墜鍙闂湰鏈鸿矾寰勶紱璇峰嬁瀵逛笉鏄庢搷浣滅偣銆屽厑璁搞€嶃€?
        </span>
      </label>

      {!canSaveMaster && masterOn && (
        <p className="exp-body text-xs">淇濆瓨鍓嶈鍕鹃€夐闄╃‘璁ゃ€?/p>
      )}

      {settingsReady && (
        <div className="space-y-2 rounded-lg border border-surface-inset/40 bg-surface/30 px-3 py-2">
          <div className="text-xs font-medium text-ink-muted">鑱婂ぉ椤靛紑鍚€岀數鑴戝姪鎵嬨€嶅悗锛屾湰浼氳瘽瑙勫垯锛?/div>
          <ul className="list-inside list-disc space-y-1 text-xs text-ink-muted">
            {listDesktopAgentModeRules('zh').map((rule) => (
              <li key={rule.id}>
                <span className="text-ink">{rule.title}</span>锛歿rule.detail}
              </li>
            ))}
          </ul>
          <div className="text-xs font-medium text-ink-muted">鑳藉姏娓呭崟锛圗mbedding 鍖归厤 鈫?澶фā鍨嬫墽琛岋級锛?/div>
          {groupDesktopAgentCapabilitiesByUi(form).map((section) => (
            <div key={section.group} className="space-y-1">
              <div className="text-xs text-ink">{section.group}</div>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-muted">
                {section.items.map((item) => (
                  <li key={item.label}>
                    <span className={item.enabled ? 'text-ink' : 'opacity-60'}>{item.label}</span>
                    {item.enabled ? '' : '锛堟湭寮€锛?} 鈥?{item.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="text-xs text-ink-muted">鑱婂ぉ椤靛彲寮€鍚€岀數鑴戝姪鎵嬨€嶆ā寮忎娇鐢ㄣ€?/div>
          {mapLabel && (
            <div className="exp-body text-xs">
              {indexing && mapProgress ? (
                <>
                  {mapLabel}
                  <span className="ml-2 text-ink-muted">
                    {mapProgress.done}/{mapProgress.total}
                  </span>
                </>
              ) : (
                mapLabel
              )}
            </div>
          )}
          {mapStatus?.isStale && mapStatus.status === 'complete' && (
            <p className="text-xs text-ink-muted">鏈満鍦板浘宸茶秴杩?24 灏忔椂锛屽皢鍦ㄤ笅娆′娇鐢ㄦ椂鍚庡彴鏇存柊銆?/p>
          )}
        </div>
      )}
      </fieldset>
    </div>
  )
}

export function desktopAgentSettingsSaveBlocked(form: AppSettings): string | null {
  if (isDesktopAgentGrayscalePreview()) {
    if (
      form.desktopAgentEnabled ||
      form.desktopAgentRiskAccepted ||
      form.desktopAgentAllowAppControl ||
      form.desktopAgentAllowFileWrite ||
      form.desktopAgentAllowDownload ||
      form.desktopAgentAllowInstall ||
      form.desktopAgentAllowDocumentRead ||
      form.desktopAgentAllowDelete
    ) {
      return '鐢佃剳鍔╂墜灏氭湭寮€鏀撅紝璇蜂繚鎸侀粯璁ゅ叧闂?
    }
    return null
  }
  if (form.desktopAgentEnabled && !form.desktopAgentRiskAccepted) {
    return '鍚敤鐢佃剳鍔╂墜鍓嶈鍕鹃€夐闄╃‘璁?
  }
  return null
}
