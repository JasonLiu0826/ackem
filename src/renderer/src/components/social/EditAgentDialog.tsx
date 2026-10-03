import { useEffect, useState } from 'react'
import type { SocialAgentSummary, SocialPresetOption } from '../../ackem'
import { AvatarCropModal, type AvatarCropResult } from './AvatarCropModal'

type Props = {
  open: boolean
  agent: SocialAgentSummary
  onClose: () => void
  onSaved: () => void
}

export function EditAgentDialog({ open, agent, onClose, onSaved }: Props): JSX.Element | null {
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState('')
  const [persona, setPersona] = useState('')
  const [presetId, setPresetId] = useState(agent.presetId)
  const [presetConfirmed, setPresetConfirmed] = useState(false)
  const [se, setSe] = useState(agent.se)
  const [sp, setSp] = useState(agent.sp)
  const [so, setSo] = useState(agent.so)
  const [presets, setPresets] = useState<SocialPresetOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [avatarUpload, setAvatarUpload] = useState<AvatarCropResult | null>(null)
  const [baselinePersona, setBaselinePersona] = useState('')
  const [baselineRole, setBaselineRole] = useState('')

  useEffect(() => {
    if (!open) return
    setName(agent.name)
    setPresetId(agent.presetId)
    setSe(agent.se)
    setSp(agent.sp)
    setSo(agent.so)
    setPresetConfirmed(false)
    setError(null)
    setAvatarUpload(null)
    setBaselinePersona('')
    setBaselineRole('')
    void window.ackem.social.listPresetsForGender(agent.gender).then(setPresets)
    void window.ackem.readRel(`agents/${agent.id}/card/persona.md`, 25000).then((r) => {
      if (r.ok && r.text) {
        setPersona(r.text)
        setBaselinePersona(r.text)
      }
    })
    void window.ackem.social.getAgentCard(agent.id).then((res) => {
      if (res.ok && res.card) {
        const card = res.card as { identity?: { role?: string } }
        const roleText = card.identity?.role ?? ''
        setRole(roleText)
        setBaselineRole(roleText)
      }
    })
  }, [open, agent])

  const presetChanging = presetId !== agent.presetId

  const isDirty =
    name.trim() !== agent.name.trim() ||
    role.trim() !== baselineRole.trim() ||
    persona !== baselinePersona ||
    presetId !== agent.presetId ||
    se !== agent.se ||
    sp !== agent.sp ||
    so !== agent.so ||
    avatarUpload != null

  const requestClose = () => {
    if (busy) return
    if (isDirty && !window.confirm('内容尚未保存，确定关闭？未保存的编辑将丢失。')) return
    onClose()
  }

  useEffect(() => {
    if (!open || cropFile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (busy) return
      if (isDirty && !window.confirm('内容尚未保存，确定关闭？未保存的编辑将丢失。')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, cropFile, busy, isDirty, onClose])

  const handleSave = async () => {
    if (presetChanging && !presetConfirmed) {
      setError('更换预设须勾选确认框')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await window.ackem.social.updateAgent({
        agentId: agent.id,
        identity: { name: name.trim(), role: role.trim() },
        personality: {
          presetId,
          ...(presetChanging ? { presetMatchConfirmed: true } : {}),
        },
        social3D: { se, sp, so },
        personaMarkdown: persona.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      if (avatarUpload) {
        const av = await window.ackem.social.setAgentAvatar({
          agentId: agent.id,
          ...avatarUpload,
        })
        if (!av.ok) {
          setError(av.message)
          return
        }
      }
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-agent-dialog-title"
      >
        <div className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl">
          <h3 id="edit-agent-dialog-title" className="mb-4 text-base font-semibold text-ink">
            编辑角色
          </h3>
          <div className="space-y-3">
            <label className="block text-xs text-ink-muted">
              显示名
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              身份简述
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              人设正文（Markdown）
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              人格预设
              <select
                value={presetId}
                onChange={(e) => {
                  setPresetId(e.target.value)
                  const p = presets.find((x) => x.id === e.target.value)
                  if (p) {
                    setSe(p.social3D.se)
                    setSp(p.social3D.sp)
                    setSo(p.social3D.so)
                  }
                }}
                className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {presetChanging && (
              <label className="flex items-start gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={presetConfirmed}
                  onChange={(e) => setPresetConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                我确认新预设与该角色气质匹配
              </label>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(['se', 'sp', 'so'] as const).map((k, i) => {
                const labels = ['社交能量 SE', '社交边界 SP', '社交开放 SO']
                const val = k === 'se' ? se : k === 'sp' ? sp : so
                const set = k === 'se' ? setSe : k === 'sp' ? setSp : setSo
                return (
                  <label key={k} className="text-[10px] text-ink-muted">
                    {labels[i]}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => set(Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                    <span className="text-ink">{val}</span>
                  </label>
                )
              })}
            </div>
            <label className="block text-xs text-ink-muted">
              更换头像
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="mt-1 w-full text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setCropFile(f)
                }}
              />
            </label>
          </div>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={requestClose}
              className="flex-1 rounded-xl border border-surface-inset px-4 py-2.5 text-sm text-ink-muted"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
              className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white disabled:opacity-50"
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
      <AvatarCropModal
        open={cropFile != null}
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onConfirm={(r) => {
          setAvatarUpload(r)
          setCropFile(null)
        }}
      />
    </>
  )
}
