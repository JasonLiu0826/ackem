import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { ExtensionCard } from './ExtensionCard'
import { ExtensionDetailPanel } from './ExtensionDetailPanel'
import { type ExtensionItem, isCoreExtensionItem } from './extensionTypes'
import { useUiStore } from '../store/uiStore'
import { useAppStore } from '../store/appStore'
import { isOpenForUConfigured, OPENFORU_NOT_CONFIGURED_MSG } from '../../../shared/openforuConfig'
import type { OpenForUExtensionRow, OpenForUWorkspace } from '../Ackem'
import { isUserExtensionId, guessUserExtensionDirPath } from '../../../shared/openforuExtensions'
import { PermissionRequestModal } from './PermissionRequestModal'
import {
  inferCapabilityTier,
  type OpenForUPermissionId,
  type PermissionRequestPayload
} from '../../../shared/openforuPermissions'
import { ExperimentalFeatureBadge, ExperimentalFeatureNotice } from './settings/settingsUi'

type Tab = 'plugins' | 'skills' | 'user-plugins' | 'user-skills' | 'workspace'

type DispatchConfig = {
  mode: string
  summary: string
  habits?: string[]
  keywords?: string[]
}

type ExtRow = {
  manifest: {
    id: string
    name: string
    description: string
    version: string
    tags?: string[]
    implementationStatus?: ExtensionItem['implementationStatus']
    dispatch?: DispatchConfig
  }
  status: ExtensionItem['status']
  runnable: boolean
}

function mapRow(row: ExtRow, builtinDefault: boolean): ExtensionItem {
  return {
    id: row.manifest.id,
    name: row.manifest.name,
    description: row.manifest.description,
    version: row.manifest.version,
    status: row.status,
    implementationStatus: row.manifest.implementationStatus,
    runnable: row.runnable,
    builtin: row.manifest.tags?.includes('builtin') ?? builtinDefault,
    tags: row.manifest.tags,
    dispatch: row.manifest.dispatch
  }
}

function mapOpenForURow(row: OpenForUExtensionRow): ExtensionItem {
  return {
    id: row.manifest.id,
    name: row.manifest.name,
    description:
      row.manifest.description?.trim() ||
      row.manifest.dispatch?.summary?.trim() ||
      'OpenForU 鐢ㄦ埛鑷垱鎵╁睍',
    version: row.manifest.version,
    status: row.status,
    runnable: row.runnable && !(row.pendingPermissions?.length ?? 0),
    origin: row.kind,
    tags: row.manifest.tags,
    dispatch: row.manifest.dispatch,
    dirPath: row.dirPath,
    pendingPermissions: row.pendingPermissions,
    lastError: row.lastError,
    hasSurface: row.hasSurface
  }
}

function mapRegistryRowAsUser(row: ExtRow, kind: 'uskill' | 'uplugin'): ExtensionItem {
  return {
    id: row.manifest.id,
    name: row.manifest.name,
    description:
      row.manifest.description?.trim() ||
      row.manifest.dispatch?.summary?.trim() ||
      'OpenForU 鐢ㄦ埛鑷垱鎵╁睍',
    version: row.manifest.version,
    status: row.status,
    runnable: row.runnable,
    origin: kind,
    tags: row.manifest.tags,
    dispatch: row.manifest.dispatch,
    dirPath: guessUserExtensionDirPath(row.manifest.id, kind)
  }
}

async function loadUserExtensions(sk: ExtRow[], pl: ExtRow[]): Promise<{
  userSkills: ExtensionItem[]
  userPlugins: ExtensionItem[]
}> {
  try {
    const ofuExt = await window.Ackem.openforu.listExtensions()
    const fromOpenForU = {
      userSkills: sortExtensions(ofuExt.uskills.map(mapOpenForURow)),
      userPlugins: sortExtensions(ofuExt.uplugins.map(mapOpenForURow))
    }
    if (fromOpenForU.userSkills.length > 0 || fromOpenForU.userPlugins.length > 0) {
      return fromOpenForU
    }
  } catch {
    // IPC 鏈氨缁垨涓昏繘绋嬪皻鏈敞鍐?handler 鏃惰蛋 registry 鍥為€€
  }

  return {
    userSkills: sortExtensions(
      sk.filter((s) => isUserExtensionId(s.manifest.id)).map((s) => mapRegistryRowAsUser(s, 'uskill'))
    ),
    userPlugins: sortExtensions(
      pl.filter((p) => isUserExtensionId(p.manifest.id)).map((p) => mapRegistryRowAsUser(p, 'uplugin'))
    )
  }
}

function sortExtensions(items: ExtensionItem[]): ExtensionItem[] {
  return [...items].sort((a, b) => {
    const inactive = (i: ExtensionItem) =>
      i.runnable === false || i.status === 'planned' || i.status === 'deprecated'
    const ar = inactive(a) ? 1 : 0
    const br = inactive(b) ? 1 : 0
    if (ar !== br) return ar - br
    return a.name.localeCompare(b.name, 'zh')
  })
}

function tabCounts(items: ExtensionItem[]) {
  const core = items.filter((i) => i.runnable !== false && isCoreExtensionItem(i)).length
  const runnable = items.filter(
    (i) =>
      i.runnable !== false &&
      i.status !== 'planned' &&
      i.status !== 'deprecated' &&
      !isCoreExtensionItem(i)
  ).length
  return {
    total: items.length,
    core,
    runnable,
    planned: items.length - core - runnable
  }
}

function ExtensionGrid({
  items,
  selectedId,
  onSelect,
  onToggle,
  onRemove,
  onGrantPermissions,
  onRefine
}: {
  items: ExtensionItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onToggle: (id: string, active: boolean) => void | Promise<void>
  onRemove?: (item: ExtensionItem) => void | Promise<void>
  onGrantPermissions?: (item: ExtensionItem) => void | Promise<void>
  onRefine?: (item: ExtensionItem) => void
}): JSX.Element {
  if (items.length === 0) {
    return <p className="text-xs text-ink-muted">鏆傛棤鏉＄洰</p>
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => {
        const isSelected = selectedId === item.id
        return (
          <div key={item.id} className={isSelected ? 'sm:col-span-2' : undefined}>
            <ExtensionCard
              item={item}
              selected={isSelected}
              onClick={() => onSelect(isSelected ? null : item.id)}
            />
            {isSelected && (
              <ExtensionDetailPanel
                item={item}
                onClose={() => onSelect(null)}
                onToggle={onToggle}
                onRemove={onRemove}
                onGrantPermissions={onGrantPermissions}
                onRefine={onRefine}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function UserExtensionEmpty({
  kind,
  openforuReady,
  onOpenPlan,
  onGoSettings
}: {
  kind: 'uskill' | 'uplugin'
  openforuReady: boolean
  onOpenPlan: () => void
  onGoSettings: () => void
}): JSX.Element {
  const label = kind === 'uskill' ? 'Skill锛坲skill锛? : '鎻掍欢锛坲plugin锛?
  return (
    <div className="glass-panel rounded-2xl border border-dashed border-surface-inset/80 px-4 py-10 text-center">
      <p className="text-sm text-ink-muted">杩樻病鏈夎嚜鍒泏label}銆?/p>
      <p className="mt-1 text-xs text-ink-muted">鍦?Plan 涓璁″苟閮ㄧ讲鍚庯紝浼氬嚭鐜板湪鏈〉銆?/p>
      {!openforuReady && (
        <p className="exp-body mt-3 text-xs">
          {OPENFORU_NOT_CONFIGURED_MSG}
          <button type="button" className="exp-title ml-2 underline" onClick={onGoSettings}>
            鍘昏缃?
          </button>
        </p>
      )}
      {openforuReady && (
        <button type="button" className="mt-4 chat-send-btn px-4 py-2 text-sm" onClick={onOpenPlan}>
          鎵撳紑 Plan 鍒涘缓
        </button>
      )}
    </div>
  )
}

export function ExtensionCenterPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('plugins')
  const [plugins, setPlugins] = useState<ExtensionItem[]>([])
  const [skills, setSkills] = useState<ExtensionItem[]>([])
  const [userSkills, setUserSkills] = useState<ExtensionItem[]>([])
  const [userPlugins, setUserPlugins] = useState<ExtensionItem[]>([])
  const [workspaces, setWorkspaces] = useState<OpenForUWorkspace[]>([])
  const [workspaceMax, setWorkspaceMax] = useState(6)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedUserPluginId, setSelectedUserPluginId] = useState<string | null>(null)
  const [selectedUserSkillId, setSelectedUserSkillId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [grantItem, setGrantItem] = useState<ExtensionItem | null>(null)
  const setPlanOpen = useUiStore((s) => s.setPlanOpen)
  const bumpPlanReload = useUiStore((s) => s.bumpPlanReload)
  const settings = useAppStore((s) => s.settings)
  const setAppTab = useAppStore((s) => s.setTab)
  const pushToast = useAppStore((s) => s.pushToast)
  const openforuReady = isOpenForUConfigured(settings)

  const grantPayload: PermissionRequestPayload | null = useMemo(() => {
    if (!grantItem?.pendingPermissions?.length) return null
    const perms = grantItem.pendingPermissions as OpenForUPermissionId[]
    return {
      requestId: 'extension-center-local',
      pluginId: grantItem.id,
      pluginName: grantItem.name,
      permissions: perms,
      tier: inferCapabilityTier(perms),
      source: 'extension_center'
    }
  }, [grantItem])

  const handleGrantPermissions = useCallback((item: ExtensionItem) => {
    setGrantItem(item)
  }, [])

  const handleRefineInPlan = useCallback(
    async (item: ExtensionItem) => {
      if (!openforuReady) {
        pushToast(OPENFORU_NOT_CONFIGURED_MSG)
        setAppTab('settings')
        return
      }
      try {
        const r = await window.Ackem.openforu.planRefineOpen(item.id, { displayName: item.name })
        if (r.ok) {
          bumpPlanReload()
          setPlanOpen(true)
          pushToast(`宸叉墦寮€ Plan 路 ${item.name}`)
        } else {
          pushToast(r.error ?? '鏃犳硶鎵撳紑 Plan 宸ヤ綔鍖?)
        }
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e))
      }
    },
    [openforuReady, pushToast, setAppTab, bumpPlanReload, setPlanOpen]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setToggleError(null)
    try {
      const pl = (await window.Ackem.ext.plugins.list()) as ExtRow[]
      setPlugins(
        sortExtensions(
          pl.filter((p) => !isUserExtensionId(p.manifest.id)).map((p) => mapRow(p, false))
        )
      )
      const sk = (await window.Ackem.ext.skills.list()) as ExtRow[]
      setSkills(
        sortExtensions(
          sk.filter((s) => !isUserExtensionId(s.manifest.id)).map((s) => mapRow(s, true))
        )
      )

      const userExt = await loadUserExtensions(sk, pl)
      setUserSkills(userExt.userSkills)
      setUserPlugins(userExt.userPlugins)

      if (openforuReady && window.Ackem.openforu.workspaces?.list) {
        const ws = await window.Ackem.openforu.workspaces.list()
        if (ws.ok) {
          setWorkspaces(ws.workspaces)
          setWorkspaceMax(ws.max)
          setActiveWorkspaceId(ws.activeWorkspaceId)
        }
      } else {
        setWorkspaces([])
        setActiveWorkspaceId(null)
      }
    } finally {
      setLoading(false)
    }
  }, [openforuReady])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab === 'user-skills' || tab === 'user-plugins') {
      void load()
    }
  }, [tab, load])

  useEffect(() => {
    const unsubscribe = window.Ackem.openforu.onNotify(() => {
      void load()
    })
    return unsubscribe
  }, [load])

  const togglePlugin = async (id: string, active: boolean) => {
    setToggleError(null)
    const res = (await (active
      ? window.Ackem.ext.plugins.activate(id)
      : window.Ackem.ext.plugins.deactivate(id))) as { ok: boolean; error?: string }
    if (!res.ok) {
      setToggleError(res.error ?? '鎿嶄綔澶辫触')
      return
    }
    await load()
  }

  const toggleSkill = async (id: string, active: boolean) => {
    setToggleError(null)
    const res = (await (active
      ? window.Ackem.ext.skills.activate(id)
      : window.Ackem.ext.skills.deactivate(id))) as { ok: boolean; error?: string }
    if (!res.ok) {
      setToggleError((res as { error?: string }).error ?? '鎿嶄綔澶辫触')
      return
    }
    await load()
  }

  const removeUserExtension = async (item: ExtensionItem) => {
    if (!item.origin || (item.origin !== 'uskill' && item.origin !== 'uplugin')) return
    const label = item.origin === 'uskill' ? 'Skill' : '鎻掍欢'
    if (!window.confirm(`纭畾鍒犻櫎鑷垱${label}銆?{item.name}銆嶏紵\n\n灏嗗垹闄ょ鐩樻枃浠朵笖涓嶅彲鎭㈠銆俙)) return
    setToggleError(null)
    const res = await window.Ackem.openforu.removeExtension(item.origin, item.id)
    if (!res.ok) {
      setToggleError(res.error ?? '鍒犻櫎澶辫触')
      return
    }
    if (tab === 'user-skills' && selectedUserSkillId === item.id) setSelectedUserSkillId(null)
    if (tab === 'user-plugins' && selectedUserPluginId === item.id) setSelectedUserPluginId(null)
    pushToast(`宸插垹闄?${item.name}`)
    await load()
  }

  const selection = useMemo(() => {
    switch (tab) {
      case 'plugins':
        return { selectedId: selectedPluginId, setSelectedId: setSelectedPluginId, toggle: togglePlugin }
      case 'skills':
        return { selectedId: selectedSkillId, setSelectedId: setSelectedSkillId, toggle: toggleSkill }
      case 'user-plugins':
        return {
          selectedId: selectedUserPluginId,
          setSelectedId: setSelectedUserPluginId,
          toggle: togglePlugin
        }
      case 'user-skills':
        return { selectedId: selectedUserSkillId, setSelectedId: setSelectedUserSkillId, toggle: toggleSkill }
      default:
        return { selectedId: null, setSelectedId: () => {}, toggle: toggleSkill }
    }
  }, [
    tab,
    selectedPluginId,
    selectedSkillId,
    selectedUserPluginId,
    selectedUserSkillId
  ])

  const tabCls = (t: Tab) =>
    `shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap ${
      tab === t ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink'
    }`

  const listForTab = useMemo((): ExtensionItem[] => {
    switch (tab) {
      case 'plugins':
        return plugins
      case 'skills':
        return skills
      case 'user-plugins':
        return userPlugins
      case 'user-skills':
        return userSkills
      default:
        return []
    }
  }, [tab, plugins, skills, userPlugins, userSkills])

  const counts = useMemo(() => tabCounts(listForTab), [listForTab])

  const tabs: { id: Tab; label: string; badge?: number; experimental?: boolean }[] = [
    { id: 'plugins', label: '鎻掍欢搴? },
    { id: 'skills', label: 'Skill 搴? },
    { id: 'user-plugins', label: '鑷垱鎻掍欢', badge: userPlugins.length || undefined },
    { id: 'user-skills', label: '鑷垱 Skill', badge: userSkills.length || undefined },
    {
      id: 'workspace',
      label: '宸ヤ綔鍖?,
      badge: workspaces.length || undefined,
      experimental: true
    }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="glass-panel border-b border-surface-inset/60 px-6 py-4">
        <h1 className="font-display text-base font-semibold text-ink">鎵╁睍涓績</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          瀹樻柟鎵╁睍 路 OpenForU 鑷垱 路 Plan 宸ヤ綔鍖?
        </p>
      </header>
      <div className="flex overflow-x-auto border-b border-surface-inset/60 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tabCls(t.id)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.experimental ? (
              <ExperimentalFeatureBadge className="ml-1.5 align-middle" />
            ) : null}
            {t.badge !== undefined && t.badge > 0 ? (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {loading && <p className="text-sm text-ink-muted">{t("settings.loading")}</p>}
        {toggleError && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{toggleError}</p>
        )}

        {tab === 'workspace' && (
          <div className="space-y-4">
            <ExperimentalFeatureNotice
              titleKey="extensions.workspaceExperimentalTitle"
              bodyKey="extensions.workspaceExperimentalDesc"
            />
            <p className="text-sm text-ink-muted">
              Plan 宸ヤ綔鍖猴紙鏈€澶?{workspaceMax} 涓級锛屾瘡涓嫭绔嬩繚鐣欏璇濆巻鍙层€?
            </p>
            {!openforuReady && (
              <p className="exp-callout rounded-lg px-3 py-2 text-xs">
                {OPENFORU_NOT_CONFIGURED_MSG}
                <button
                  type="button"
                  className="exp-title ml-2 underline"
                  onClick={() => setAppTab('settings')}
                >
                  鍘昏缃?
                </button>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="chat-send-btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!openforuReady}
                onClick={() => {
                  if (!openforuReady) {
                    pushToast(OPENFORU_NOT_CONFIGURED_MSG)
                    return
                  }
                  setPlanOpen(true)
                }}
              >
                鎵撳紑 Plan 闈㈡澘
              </button>
              {openforuReady && (
                <button
                  type="button"
                  className="rounded-lg border border-glass-border px-4 py-2 text-sm text-ink hover:border-accent/40"
                  onClick={async () => {
                    const r = await window.Ackem.openforu.workspaces.create()
                    if (r.ok) {
                      setWorkspaces(r.workspaces)
                      setActiveWorkspaceId(r.activeWorkspaceId)
                      if (r.evicted) {
                        pushToast(`宸茶揪涓婇檺锛屽凡绉婚櫎銆?{r.evicted.name}銆峘)
                      }
                      setPlanOpen(true)
                    }
                  }}
                >
                  + 鏂板缓宸ヤ綔鍖?
                </button>
              )}
            </div>
            {openforuReady && workspaces.length > 0 ? (
              <ul className="space-y-2">
                {workspaces.map((w) => (
                  <li key={w.id} className="glass-panel flex items-center gap-3 rounded-xl px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {w.name}
                        {w.id === activeWorkspaceId && (
                          <span className="ml-2 text-[10px] text-accent">褰撳墠</span>
                        )}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        鏇存柊浜?{new Date(w.updatedAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-glass-border px-3 py-1.5 text-xs text-ink hover:border-accent/40"
                      onClick={async () => {
                        const r = await window.Ackem.openforu.workspaces.switch(w.id)
                        if (r.ok) {
                          setActiveWorkspaceId(r.activeWorkspaceId)
                          setWorkspaces(r.workspaces)
                          setPlanOpen(true)
                        }
                      }}
                    >
                      缁х画
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:border-red-400/50"
                      onClick={async () => {
                        if (!window.confirm(`鍒犻櫎宸ヤ綔鍖恒€?{w.name}銆嶏紵`)) return
                        const r = await window.Ackem.openforu.workspaces.delete(w.id)
                        if (r.ok) {
                          setWorkspaces(r.workspaces)
                          setActiveWorkspaceId(r.activeWorkspaceId)
                          pushToast('宸插垹闄?)
                          void load()
                        }
                      }}
                    >
                      鍒犻櫎
                    </button>
                  </li>
                ))}
              </ul>
            ) : openforuReady ? (
              <p className="text-xs text-ink-muted">鏆傛棤宸ヤ綔鍖猴紝鐐瑰嚮銆屾柊寤哄伐浣滃尯銆嶅紑濮嬨€?/p>
            ) : null}
          </div>
        )}

        {tab !== 'workspace' && !loading && (
          <>
            <p className="mb-4 text-xs text-ink-muted">
              {tab === 'user-plugins' || tab === 'user-skills' ? (
                <>
                  鍏?{counts.total} 椤?路 宸插惎鐢▄' '}
                  {listForTab.filter((i) => i.status === 'active').length}
                </>
              ) : (
                <>
                  鍏?{counts.total} 椤?路 鍩虹鍔熻兘 {counts.core} 路 鍙惎鐢?{counts.runnable} 路 瑙勫垝涓瓄' '}
                  {counts.planned}
                </>
              )}
            </p>

            {tab === 'user-plugins' && userPlugins.length === 0 ? (
              <UserExtensionEmpty
                kind="uplugin"
                openforuReady={openforuReady}
                onOpenPlan={() => setPlanOpen(true)}
                onGoSettings={() => setAppTab('settings')}
              />
            ) : tab === 'user-skills' && userSkills.length === 0 ? (
              <UserExtensionEmpty
                kind="uskill"
                openforuReady={openforuReady}
                onOpenPlan={() => setPlanOpen(true)}
                onGoSettings={() => setAppTab('settings')}
              />
            ) : (
              <>
                {(tab === 'user-plugins' || tab === 'user-skills') &&
                  !selection.selectedId &&
                  listForTab.length > 0 && (
                    <p className="mb-4 text-xs text-ink-muted">
                      鐐瑰嚮鎵╁睍鍗＄墖灞曞紑璇︽儏锛屽彲浣跨敤銆屾墦寮€绐楀彛銆嶃€岀户缁紭鍖栥€嶇瓑鎿嶄綔銆?
                    </p>
                  )}
                <ExtensionGrid
                items={listForTab}
                selectedId={selection.selectedId}
                onSelect={selection.setSelectedId}
                onToggle={selection.toggle}
                onRemove={
                  tab === 'user-skills' || tab === 'user-plugins' ? removeUserExtension : undefined
                }
                onGrantPermissions={
                  tab === 'user-plugins' ? handleGrantPermissions : undefined
                }
                onRefine={
                  tab === 'user-plugins' || tab === 'user-skills'
                    ? (item) => void handleRefineInPlan(item)
                    : undefined
                }
              />
              </>
            )}
          </>
        )}
      </div>
      <PermissionRequestModal
        open={grantPayload != null}
        payload={grantPayload}
        onApprove={() => {
          if (!grantItem) return
          void window.Ackem.openforu.permissions.approveAndActivate(grantItem.id).then((r) => {
            setGrantItem(null)
            if (r.ok) {
              pushToast('宸叉巿浜堟潈闄愬苟鍚敤')
              void load()
            } else {
              setToggleError(r.error ?? '鎺堟潈澶辫触')
            }
          })
        }}
        onDeny={() => setGrantItem(null)}
      />
    </div>
  )
}
