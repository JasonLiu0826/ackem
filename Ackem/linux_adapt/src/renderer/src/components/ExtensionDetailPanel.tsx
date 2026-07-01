import { PERMISSION_LABELS } from '../../../shared/openforuPermissions'
import { t } from '../lib/i18n'
import { renderMarkdown } from './md'
import {
  canToggleExtension,
  canRemoveUserExtension,
  dispatchModeLabel,
  extensionStatusLabel,
  isCoreExtensionItem,
  type ExtensionItem
} from './extensionTypes'

export type { ExtensionItem } from './extensionTypes'

type Props = {
  item: ExtensionItem
  onClose: () => void
  onToggle: (id: string, active: boolean) => void | Promise<void>
  onRemove?: (item: ExtensionItem) => void | Promise<void>
  onGrantPermissions?: (item: ExtensionItem) => void | Promise<void>
  onRefine?: (item: ExtensionItem) => void
}

export function ExtensionDetailPanel({
  item,
  onClose,
  onToggle,
  onRemove,
  onGrantPermissions,
  onRefine
}: Props): JSX.Element {
  const isActive = item.status === 'active'
  const canToggle = canToggleExtension(item)
  const canRemove = canRemoveUserExtension(item)
  const isCore = isCoreExtensionItem(item)
  const pending = item.pendingPermissions ?? []
  const needsGrant = pending.length > 0 && item.origin === 'uplugin'
  const canRefine =
    (item.origin === 'uskill' || item.origin === 'uplugin') && item.id.startsWith('u/')

  return (
    <div className="glass-panel mt-4 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">{item.name}</h3>
          <p className="extension-detail-meta mt-1 text-xs text-ink-muted">
            {item.id} · v{item.version} · {extensionStatusLabel(item)}
            {needsGrant ? ' · 待授权' : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {needsGrant && onGrantPermissions ? (
            <button
              type="button"
              onClick={() => void onGrantPermissions(item)}
              className="chat-send-btn px-3 py-1.5 text-xs"
            >
              授予并启用
            </button>
          ) : isCore ? (
            <span className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs text-accent">
              基础功能 · 始终启用
            </span>
          ) : (
            <button
              type="button"
              disabled={!canToggle}
              title={canToggle ? undefined : '该扩展尚在规划中，尚未实装'}
              onClick={() => {
                if (canToggle) void onToggle(item.id, !isActive)
              }}
              className={[
                'chat-send-btn px-3 py-1.5 text-xs',
                !canToggle ? 'cursor-not-allowed opacity-40' : ''
              ].join(' ')}
            >
              {isActive ? '关闭' : '启用'}
            </button>
          )}
          {canRefine && onRefine ? (
            <button
              type="button"
              onClick={() => onRefine(item)}
              className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
            >
              继续优化
            </button>
          ) : null}
          {canRemove && onRemove ? (
            <button
              type="button"
              onClick={() => void onRemove(item)}
              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:border-red-400/50 hover:bg-red-500/10"
            >
              删除
            </button>
          ) : null}
          {item.hasSurface && item.origin === 'uplugin' && isActive ? (
            <button
              type="button"
              onClick={() => {
                void window.ackem.openforu.openSurfaceWindow(item.id).then((r) => {
                  if (!r.ok) window.alert(r.message)
                })
              }}
              className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
            >
              打开窗口
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:text-ink">
            收起
          </button>
        </div>
      </div>
      <p className="extension-detail-desc mt-3 text-sm leading-relaxed text-ink-muted">{item.description}</p>

      {needsGrant ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pending.map((p) => (
            <span
              key={p}
              title={PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS] ?? p}
              className="exp-permission-pill rounded-full px-2.5 py-0.5 text-[11px]"
            >
              {PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS] ?? p}
            </span>
          ))}
        </div>
      ) : null}

      {isCore && (
        <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent/90">
          此为 Ackem 内置基础能力，默认开启且不可在扩展中心关闭。
        </p>
      )}

      {!canToggle &&
        !isCore &&
        !needsGrant &&
        item.status !== 'planned' &&
        item.implementationStatus !== 'planned' &&
        item.status !== 'deprecated' &&
        item.implementationStatus !== 'deprecated' && (
        <p className="mt-3 rounded-lg bg-surface-inset/50 px-3 py-2 text-xs text-ink-muted">
          此扩展仍在开发规划中，当前版本无法启用。实装后将出现在「可启用」状态。
        </p>
      )}

      {(item.status === 'planned' || item.implementationStatus === 'planned') && (
        <p className="mt-3 rounded-lg border border-surface-inset/80 bg-surface-inset/40 px-3 py-2 text-xs text-ink-muted">
          目录占位项：源码骨架已存在，但尚未接入运行时。扩展中心以「规划中」灰显，无法启用。
        </p>
      )}

      {(item.status === 'deprecated' || item.implementationStatus === 'deprecated') && (
        <p className="mt-3 rounded-lg border border-surface-inset/80 bg-surface-inset/40 px-3 py-2 text-xs text-ink-muted">
          此扩展已于 2026-06-06 下线：不再注册运行时，扩展中心以「已下线」灰显，无法启用。底层源码仍保留供其他能力复用。
        </p>
      )}

      {(item.implementationStatus === 'stub' || item.implementationStatus === 'preview') && (
        <p className="exp-callout mt-3 rounded-lg px-3 py-2 text-xs">
          {item.implementationStatus === 'preview'
            ? '此条目为预览实装：部分能力已可用（如 Windows SMTC 读标题、几何桌宠壳），完整体验将在后续版本加深。'
            : '此扩展为 Stub 预览：当前能力有限（如仅系统通知），完整功能将在后续版本实装。启用不会播放真语音或完整特效。'}
        </p>
      )}

      {item.status === 'error' && item.lastError && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
          上次运行异常：{item.lastError}
          <br />
          可点击「启用」从磁盘重载并重试（无需重启 Ackem）。
        </p>
      )}

      {(item.origin === 'uskill' || item.origin === 'uplugin') && (
        <p className="extension-openforu-meta mt-3 truncate rounded-lg px-3 py-2 text-[10px]">
          OpenForU · {item.origin}
          {item.dirPath ? ` · ${item.dirPath}` : ''}
        </p>
      )}

      {item.dispatch && (
        <div className="mt-4 rounded-xl border border-surface-inset/60 bg-surface-inset/20 p-3 text-xs">
          <div className="mb-2 font-medium text-ink">调度配置</div>
          <dl className="space-y-1.5 text-ink-muted">
            <div className="flex gap-2">
              <dt className="shrink-0 text-ink-muted/80">模式</dt>
              <dd>{dispatchModeLabel(item.dispatch.mode)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted/80">{t("archive.summary")}</dt>
              <dd className="mt-0.5 line-clamp-2 leading-relaxed">{item.dispatch.summary}</dd>
            </div>
          </dl>
        </div>
      )}

      {item.readme && (
        <div
          className="prose prose-sm mt-4 max-w-none text-ink"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(item.readme) }}
        />
      )}
      {canRemove && (
        <p className="mt-3 text-[11px] text-ink-muted">
          删除会移除 `data/openforu/` 下对应目录，且不可恢复。
        </p>
      )}
      {item.builtin && canToggle && (
        <p className="mt-3 text-[11px] text-ink-muted">内置资源不可删除。</p>
      )}
    </div>
  )
}
