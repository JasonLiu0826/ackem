import { useEffect, useState } from 'react'
import type { SocialPresetOption } from '../../ackem'
import { AvatarCropModal, type AvatarCropResult } from './AvatarCropModal'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (agentId: string) => void
}

type Step = 1 | 2 | 3

export function AddAgentWizard({ open, onClose, onCreated }: Props): JSX.Element | null {
  const [step, setStep] = useState<Step>(1)
  const [displayName, setDisplayName] = useState('')
  const [gender, setGender] = useState<'female' | 'male'>('female')
  const [roleOrTagline, setRoleOrTagline] = useState('')
  const [personaMarkdown, setPersonaMarkdown] = useState('')
  const [fileFormat, setFileFormat] = useState<'form' | 'md' | 'txt'>('form')
  const [top3, setTop3] = useState<Array<{ presetId: string; label: string; score: number }>>([])
  const [presetId, setPresetId] = useState('')
  const [presetConfirmed, setPresetConfirmed] = useState(false)
  const [allPresets, setAllPresets] = useState<SocialPresetOption[]>([])
  const [se, setSe] = useState(50)
  const [sp, setSp] = useState(50)
  const [so, setSo] = useState(50)
  const [seedText, setSeedText] = useState('')
  const [avatarUpload, setAvatarUpload] = useState<AvatarCropResult | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep(1)
    setDisplayName('')
    setGender('female')
    setRoleOrTagline('')
    setPersonaMarkdown('')
    setFileFormat('form')
    setTop3([])
    setPresetId('')
    setPresetConfirmed(false)
    setSe(50)
    setSp(50)
    setSo(50)
    setSeedText('')
    setAvatarUpload(null)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    void window.ackem.social.listPresetsForGender(gender).then(setAllPresets)
  }, [open, gender])

  const parseUpload = async (format: 'md' | 'txt', content: string) => {
    const res = await window.ackem.social.parseCharacterCard({
      format,
      content,
      displayName,
      roleOrTagline,
      gender,
    })
    if (!res.ok) {
      setError(res.message)
      return
    }
    setDisplayName(res.parsed.displayName)
    setRoleOrTagline(res.parsed.roleOrTagline)
    setPersonaMarkdown(res.parsed.personaMarkdown)
    setGender(res.parsed.gender)
    setTop3(res.top3Presets)
    if (res.top3Presets[0]) {
      setPresetId(res.top3Presets[0].presetId)
      const p = await window.ackem.social.listPresetsForGender(res.parsed.gender)
      const hit = p.find((x) => x.id === res.top3Presets[0].presetId)
      if (hit) {
        setSe(hit.social3D.se)
        setSp(hit.social3D.sp)
        setSo(hit.social3D.so)
      }
    }
    setFileFormat(format)
    setError(null)
  }

  const goStep2 = async () => {
    if (!displayName.trim()) {
      setError('请填写显示名')
      return
    }
    if (!roleOrTagline.trim() && !personaMarkdown.trim()) {
      setError('身份简述或人设正文至少填一项')
      return
    }
    if (fileFormat === 'form') {
      const corpus = `${displayName}\n${roleOrTagline}\n${personaMarkdown}`
      void window.ackem.social
        .parseCharacterCard({
          format: 'txt',
          content: corpus,
          displayName,
          roleOrTagline,
          gender,
        })
        .then((res) => {
          if (res.ok) {
            setTop3(res.top3Presets)
            if (res.top3Presets[0] && !presetId) {
              setPresetId(res.top3Presets[0].presetId)
            }
          }
        })
    }
    setError(null)
    setStep(2)
  }

  const goStep3 = () => {
    if (!presetId) {
      setError('请选择人格预设')
      return
    }
    if (!presetConfirmed) {
      setError('须勾选确认预设与人设气质匹配')
      return
    }
    setError(null)
    setStep(3)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const seeds = seedText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((content) => ({ domain: '背景', content }))
      const res = await window.ackem.social.createAgent({
        format: fileFormat,
        displayName: displayName.trim(),
        gender,
        roleOrTagline: roleOrTagline.trim(),
        personaMarkdown: personaMarkdown.trim() || undefined,
        presetId,
        presetMatchConfirmed: true,
        social3D: { se, sp, so },
        seedMemories: seeds.length > 0 ? seeds : undefined,
        avatarUpload: avatarUpload ?? undefined,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      onCreated(res.agentId)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const isDirty =
    step > 1 ||
    Boolean(displayName.trim()) ||
    Boolean(roleOrTagline.trim()) ||
    Boolean(personaMarkdown.trim()) ||
    Boolean(seedText.trim()) ||
    Boolean(presetId) ||
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

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-agent-wizard-title"
      >
        <div className="glass-panel max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 id="add-agent-wizard-title" className="text-base font-semibold text-ink">
              添加社会成员
            </h3>
            <span className="text-xs text-ink-muted">步骤 {step} / 3</span>
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <label className="block text-xs text-ink-muted">
                显示名 *
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
                />
              </label>
              <div className="flex gap-3 text-xs text-ink-muted">
                性别
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={gender === 'female'}
                    onChange={() => setGender('female')}
                  />
                  女
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={gender === 'male'}
                    onChange={() => setGender('male')}
                  />
                  男
                </label>
              </div>
              <label className="block text-xs text-ink-muted">
                身份简述
                <input
                  value={roleOrTagline}
                  onChange={(e) => setRoleOrTagline(e.target.value)}
                  placeholder="例：邻班的元气少女"
                  className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-ink-muted">
                人设正文（可选）
                <textarea
                  value={personaMarkdown}
                  onChange={(e) => {
                    setPersonaMarkdown(e.target.value)
                    setFileFormat('form')
                  }}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-ink-muted">
                或上传 md / txt
                <input
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  className="mt-1 w-full text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const ext = f.name.toLowerCase().endsWith('.md') ? 'md' : 'txt'
                    void f.text().then((text) => parseUpload(ext, text))
                  }}
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted">根据人设推荐 Top3 预设，请选择并确认匹配。</p>
              {top3.length > 0 && (
                <div className="rounded-lg border border-surface-inset p-2">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-ink-muted">推荐</p>
                  <div className="flex flex-wrap gap-2">
                    {top3.map((p) => (
                      <button
                        key={p.presetId}
                        type="button"
                        onClick={() => {
                          setPresetId(p.presetId)
                          const hit = allPresets.find((x) => x.id === p.presetId)
                          if (hit) {
                            setSe(hit.social3D.se)
                            setSp(hit.social3D.sp)
                            setSo(hit.social3D.so)
                          }
                        }}
                        className={[
                          'rounded-lg px-3 py-1.5 text-xs',
                          presetId === p.presetId
                            ? 'bg-accent text-white'
                            : 'bg-surface-inset text-ink-muted hover:text-ink',
                        ].join(' ')}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="block text-xs text-ink-muted">
                全部预设
                <select
                  value={presetId}
                  onChange={(e) => {
                    setPresetId(e.target.value)
                    const hit = allPresets.find((x) => x.id === e.target.value)
                    if (hit) {
                      setSe(hit.social3D.se)
                      setSp(hit.social3D.sp)
                      setSo(hit.social3D.so)
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
                >
                  <option value="">请选择…</option>
                  {allPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={presetConfirmed}
                  onChange={(e) => setPresetConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                我确认所选预设与该角色气质匹配（必选）
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['SE 社交能量', se, setSe],
                  ['SP 社交边界', sp, setSp],
                  ['SO 社交开放', so, setSo],
                ] as const).map(([label, val, set]) => (
                  <label key={label} className="text-[10px] text-ink-muted">
                    {label}
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
                ))}
              </div>
              <label className="block text-xs text-ink-muted">
                种子记忆（每行一条，可选）
                <textarea
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  rows={3}
                  placeholder="例：我们在社团第一次见面"
                  className="mt-1 w-full rounded-lg border border-surface-inset bg-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-ink-muted">
                头像（可选）
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-1 w-full text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setCropFile(f)
                  }}
                />
                {avatarUpload && <span className="mt-1 block text-[10px] text-green-400">已裁剪</span>}
              </label>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={step === 1 ? requestClose : () => setStep((step - 1) as Step)}
              className="flex-1 rounded-xl border border-surface-inset px-4 py-2.5 text-sm text-ink-muted"
            >
              {step === 1 ? '取消' : '上一步'}
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => void (step === 1 ? goStep2() : goStep3())}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white"
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white disabled:opacity-50"
              >
                {busy ? '创建中…' : '创建角色'}
              </button>
            )}
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
