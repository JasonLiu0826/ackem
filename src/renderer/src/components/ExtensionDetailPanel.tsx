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
            {item.id} 路 v{item.version} 路 {extensionStatusLabel(item)}
            {needsGrant ? ' 路 寰呮巿鏉? : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {needsGrant && onGrantPermissions ? (
            <button
              type="button"
              onClick={() => void onGrantPermissions(item)}
              className="chat-send-btn px-3 py-1.5 text-xs"
            >
              鎺堜簣骞跺惎鐢?
            </button>
          ) : isCore ? (
            <span className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs text-accent">
              鍩虹鍔熻兘 路 濮嬬粓鍚敤
            </span>
          ) : (
            <button
              type="button"
              disabled={!canToggle}
              title={canToggle ? undefined : '璇ユ墿灞曞皻鍦ㄨ鍒掍腑锛屽皻鏈疄瑁?}
              onClick={() => {
                if (canToggle) void onToggle(item.id, !isActive)
              }}
              className={[
                'chat-send-btn px-3 py-1.5 text-xs',
                !canToggle ? 'cursor-not-allowed opacity-40' : ''
              ].join(' ')}
            >
              {isActive ? '鍏抽棴' : '鍚敤'}
            </button>
          )}
          {canRefine && onRefine ? (
            <button
              type="button"
              onClick={() => onRefine(item)}
              className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
            >
              缁х画浼樺寲
            </button>
          ) : null}
          {canRemove && onRemove ? (
            <button
              type="button"
              onClick={() => void onRemove(item)}
              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:border-red-400/50 hover:bg-red-500/10"
            >
              鍒犻櫎
            </button>
          ) : null}
          {item.hasSurface && item.origin === 'uplugin' && isActive ? (
            <button
              type="button"
              onClick={() => {
                void window.Ackem.openforu.openSurfaceWindow(item.id).then((r) => {
                  if (!r.ok) window.alert(r.message)
                })
              }}
              className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
            >
              鎵撳紑绐楀彛
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:text-ink">
            鏀惰捣
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
          姝や负 Ackem 鍐呯疆鍩虹鑳藉姏锛岄粯璁ゅ紑鍚笖涓嶅彲鍦ㄦ墿灞曚腑蹇冨叧闂€?
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
          姝ゆ墿灞曚粛鍦ㄥ紑鍙戣鍒掍腑锛屽綋鍓嶇増鏈棤娉曞惎鐢ㄣ€傚疄瑁呭悗灏嗗嚭鐜板湪銆屽彲鍚敤銆嶇姸鎬併€?
        </p>
      )}

      {(item.status === 'planned' || item.implementationStatus === 'planned') && (
        <p className="mt-3 rounded-lg border border-surface-inset/80 bg-surface-inset/40 px-3 py-2 text-xs text-ink-muted">
          鐩綍鍗犱綅椤癸細婧愮爜楠ㄦ灦宸插瓨鍦紝浣嗗皻鏈帴鍏ヨ繍琛屾椂銆傛墿灞曚腑蹇冧互銆岃鍒掍腑銆嶇伆鏄撅紝鏃犳硶鍚敤銆?
        </p>
      )}

      {(item.status === 'deprecated' || item.implementationStatus === 'deprecated') && (
        <p className="mt-3 rounded-lg border border-surface-inset/80 bg-surface-inset/40 px-3 py-2 text-xs text-ink-muted">
          姝ゆ墿灞曞凡浜?2026-06-06 涓嬬嚎锛氫笉鍐嶆敞鍐岃繍琛屾椂锛屾墿灞曚腑蹇冧互銆屽凡涓嬬嚎銆嶇伆鏄撅紝鏃犳硶鍚敤銆傚簳灞傛簮鐮佷粛淇濈暀渚涘叾浠栬兘鍔涘鐢ㄣ€?
        </p>
      )}

      {(item.implementationStatus === 'stub' || item.implementationStatus === 'preview') && (
        <p className="exp-callout mt-3 rounded-lg px-3 py-2 text-xs">
          {item.implementationStatus === 'preview'
            ? '姝ゆ潯鐩负棰勮瀹炶锛氶儴鍒嗚兘鍔涘凡鍙敤锛堝 Windows SMTC 璇绘爣棰樸€佸嚑浣曟瀹犲３锛夛紝瀹屾暣浣撻獙灏嗗湪鍚庣画鐗堟湰鍔犳繁銆?
            : '姝ゆ墿灞曚负 Stub 棰勮锛氬綋鍓嶈兘鍔涙湁闄愶紙濡備粎绯荤粺閫氱煡锛夛紝瀹屾暣鍔熻兘灏嗗湪鍚庣画鐗堟湰瀹炶銆傚惎鐢ㄤ笉浼氭挱鏀剧湡璇煶鎴栧畬鏁寸壒鏁堛€?}
        </p>
      )}

      {item.status === 'error' && item.lastError && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
          涓婃杩愯寮傚父锛歿item.lastError}
          <br />
          鍙偣鍑汇€屽惎鐢ㄣ€嶄粠纾佺洏閲嶈浇骞堕噸璇曪紙鏃犻渶閲嶅惎 Ackem锛夈€?
        </p>
      )}

      {(item.origin === 'uskill' || item.origin === 'uplugin') && (
        <p className="extension-openforu-meta mt-3 truncate rounded-lg px-3 py-2 text-[10px]">
          OpenForU 路 {item.origin}
          {item.dirPath ? ` 路 ${item.dirPath}` : ''}
        </p>
      )}

      {item.dispatch && (
        <div className="mt-4 rounded-xl border border-surface-inset/60 bg-surface-inset/20 p-3 text-xs">
          <div className="mb-2 font-medium text-ink">璋冨害閰嶇疆</div>
          <dl className="space-y-1.5 text-ink-muted">
            <div className="flex gap-2">
              <dt className="shrink-0 text-ink-muted/80">妯″紡</dt>
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
          鍒犻櫎浼氱Щ闄?`data/openforu/` 涓嬪搴旂洰褰曪紝涓斾笉鍙仮澶嶃€?
        </p>
      )}
      {item.builtin && canToggle && (
        <p className="mt-3 text-[11px] text-ink-muted">鍐呯疆璧勬簮涓嶅彲鍒犻櫎銆?/p>
      )}
    </div>
  )
}
