import type { ExtensionItem } from './extensionTypes'
import { t } from '../lib/i18n'
import { extensionStatusLabel, isCoreExtensionItem } from './extensionTypes'

type Props = {
  item: ExtensionItem
  selected: boolean
  onClick: () => void
}

/** 卡片上不重复展示与 description 前半段相同的 dispatch.summary */
function normalizeSnippet(text: string): string {
  return text.replace(/[\s，,。.；;：:、]/g, '').slice(0, 28)
}

function shouldShowDispatchSummary(description: string, summary?: string): boolean {
  const s = summary?.trim()
  if (!s) return false
  const d = description.trim()
  const sCore = s.replace(/[。.；;]\s*$/, '')
  if (d.startsWith(sCore) || d.includes(sCore)) return false
  if (sCore.length >= 12 && d.slice(0, sCore.length) === sCore) return false
  const dn = normalizeSnippet(d)
  const sn = normalizeSnippet(s)
  if (sn.length >= 16 && (dn.startsWith(sn) || sn.startsWith(dn))) return false
  return true
}

export function ExtensionCard({ item, selected, onClick }: Props): JSX.Element {
  const planned =
    item.status === 'planned' ||
    item.status === 'deprecated' ||
    item.implementationStatus === 'planned' ||
    item.implementationStatus === 'deprecated' ||
    item.runnable === false
  const stub = item.implementationStatus === 'stub' || item.implementationStatus === 'preview'
  const isCore = isCoreExtensionItem(item)
  const showSummary =
    !planned && shouldShowDispatchSummary(item.description, item.dispatch?.summary)

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'glass-panel w-full rounded-2xl p-4 text-left transition',
        planned ? 'opacity-55 saturate-50' : stub ? 'opacity-90' : '',
        selected ? 'ring-1 ring-accent shadow-glow-md' : planned ? '' : 'hover:shadow-glow'
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={planned ? 'font-medium text-ink-muted' : 'font-medium text-ink'}>
          {item.name}
        </span>
        <span
          className={[
            'rounded-full px-2 py-0.5 text-[10px]',
            planned
              ? 'bg-surface-inset text-ink-muted'
              : stub
                ? 'extension-preview-badge'
                : item.origin === 'uskill' || item.origin === 'uplugin'
                ? item.status === 'active'
                  ? 'extension-badge-openforu'
                  : 'extension-badge-openforu extension-badge-openforu--muted'
                : isCore || item.status === 'active'
                  ? 'bg-accent/20 text-accent'
                  : 'bg-surface-inset text-ink-muted'
          ].join(' ')}
        >
          {extensionStatusLabel(item)}
        </span>
      </div>
      <p className="extension-card-desc mt-2 line-clamp-2 text-xs text-ink-muted">{item.description}</p>
      {showSummary && item.dispatch?.summary && (
        <p className="extension-card-dispatch mt-2 line-clamp-1 text-[11px] text-ink-muted">
          {item.dispatch.summary}
        </p>
      )}
    </button>
  )
}
