import { useEffect, useState } from 'react'
import type { AppSettings } from '../ackem'
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

    void window.ackem.machineMap.status().then(setMapStatus)
    window.ackem.machineMap.onProgress((payload) => {
      setMapProgress(payload)
      if (payload?.status === 'complete' || payload?.status === 'error') {
        void window.ackem.machineMap.status().then(setMapStatus)
      }
    })
  }, [settingsReady])

  const indexing =
    mapProgress?.status === 'running' || mapStatus?.status === 'running'
  const mapLabel =
    mapProgress?.label ??
    (mapStatus?.status === 'complete'
      ? `本机地图已就绪 · ${mapStatus.gameCount} 款游戏 · ${mapStatus.documentCount} 个文档`
      : indexing
        ? '正在努力理解你的电脑中…'
        : null)

  return (
    <div className="exp-panel space-y-3 rounded-xl p-4">
      <div className="exp-title text-xs font-medium">
        {previewOnly ? '暂未开放 · 电脑助手' : '实验功能 · 电脑助手'}
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
          启用电脑助手（实验）
          <span className="mt-1 block text-xs text-ink-muted">
            开启后，可在聊天页进入电脑助手模式，让 Ackem 根据对话操作本机文件与应用。每次操作前都会弹窗确认。
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
            允许打开 / 关闭 / 聚焦应用程序
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowFileWrite === true}
              onChange={(e) => setForm({ desktopAgentAllowFileWrite: e.target.checked })}
            />
            允许复制、移动、写入文件
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowDelete === true}
              onChange={(e) => setForm({ desktopAgentAllowDelete: e.target.checked })}
            />
            允许删除文件（仍每次确认；优先进回收站）
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowDownload === true}
              onChange={(e) => setForm({ desktopAgentAllowDownload: e.target.checked })}
            />
            允许从 HTTPS 下载文件
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowInstall === true}
              onChange={(e) => setForm({ desktopAgentAllowInstall: e.target.checked })}
            />
            允许下载后运行安装包（非静默）
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.desktopAgentAllowDocumentRead === true}
              onChange={(e) => setForm({ desktopAgentAllowDocumentRead: e.target.checked })}
            />
            允许读取文档 / 图片（实验）
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            默认下载目录（留空则使用「下载/AckemDownloads」）
            <input
              className="field-input mt-1"
              value={form.desktopAgentDownloadDir ?? ''}
              onChange={(e) => setForm({ desktopAgentDownloadDir: e.target.value })}
              placeholder="例如 D:\Downloads\AckemDownloads"
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
          我已阅读并理解：电脑助手可访问本机路径；请勿对不明操作点「允许」。
        </span>
      </label>

      {!canSaveMaster && masterOn && (
        <p className="exp-body text-xs">保存前请勾选风险确认。</p>
      )}

      {settingsReady && (
        <div className="space-y-2 rounded-lg border border-surface-inset/40 bg-surface/30 px-3 py-2">
          <div className="text-xs font-medium text-ink-muted">聊天页开启「电脑助手」后，本会话规则：</div>
          <ul className="list-inside list-disc space-y-1 text-xs text-ink-muted">
            {listDesktopAgentModeRules('zh').map((rule) => (
              <li key={rule.id}>
                <span className="text-ink">{rule.title}</span>：{rule.detail}
              </li>
            ))}
          </ul>
          <div className="text-xs font-medium text-ink-muted">能力清单（Embedding 匹配 → 大模型执行）：</div>
          {groupDesktopAgentCapabilitiesByUi(form).map((section) => (
            <div key={section.group} className="space-y-1">
              <div className="text-xs text-ink">{section.group}</div>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-muted">
                {section.items.map((item) => (
                  <li key={item.label}>
                    <span className={item.enabled ? 'text-ink' : 'opacity-60'}>{item.label}</span>
                    {item.enabled ? '' : '（未开）'} — {item.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="text-xs text-ink-muted">聊天页可开启「电脑助手」模式使用。</div>
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
            <p className="text-xs text-ink-muted">本机地图已超过 24 小时，将在下次使用时后台更新。</p>
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
      return '电脑助手尚未开放，请保持默认关闭'
    }
    return null
  }
  if (form.desktopAgentEnabled && !form.desktopAgentRiskAccepted) {
    return '启用电脑助手前请勾选风险确认'
  }
  return null
}
