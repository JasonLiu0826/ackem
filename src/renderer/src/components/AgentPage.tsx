import { useCallback, useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import { emotionLightColor } from '../lib/emotionColors'

/** 浼翠荆鐘舵€佹憳瑕?*/
type CompanionSnapshot = {
  name: string
  emotionLabel: string
  aff: number
  lastActive: string
  sessionId: string
}

export function AgentPage(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setTab = useAppStore((s) => s.setTab)
  const pushToast = useAppStore((s) => s.pushToast)
  const chatRows = useAppStore((s) => s.chatRows)

  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!settings) return
    const name = settings.companionName || '浼翠荆'
    const sessionId = settings.activeSessionId || 'default'

    void window.Ackem.getState().then((raw) => {
      const s = raw as { emotion?: { primaryLabel?: string; aff?: number }; lastActive?: string }
      setSnapshot({
        name,
        emotionLabel: s?.emotion?.primaryLabel || 'CALM_RATIONAL',
        aff: s?.emotion?.aff ?? 0,
        lastActive: s?.lastActive || '',
        sessionId
      })
      setLoading(false)
    }).catch(() => {
      setSnapshot({ name, emotionLabel: 'CALM_RATIONAL', aff: 0, lastActive: '', sessionId })
      setLoading(false)
    })
  }, [settings])

  const goToChat = useCallback(() => setTab('chat'), [setTab])
  const goToMemory = useCallback(() => setTab('memory'), [setTab])
  const goToDiary = useCallback(() => setTab('diary'), [setTab])
  const goToSettings = useCallback(() => setTab('settings'), [setTab])

  const userMsgCount = chatRows.filter(r => r.kind === 'message' && r.role === 'user').length
  const assistantMsgCount = chatRows.filter(r => r.kind === 'message' && r.role === 'assistant').length
  const threadColor = snapshot ? emotionLightColor(snapshot.emotionLabel) : 'var(--color-accent)'

  if (loading || !settings) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface text-sm text-ink-muted">
        姝ｅ湪鍔犺浇鈥?      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface overflow-y-auto">
      {/* Header */}
      <header className="glass-panel flex items-center justify-between border-b border-surface-inset/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: `${threadColor}20`, boxShadow: `0 0 12px ${threadColor}30` }}
          >
            鉁?          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">{snapshot?.name || '鍔╂墜'}</h1>
            <p className="text-xs text-ink-muted mt-0.5">Ackem 鏅鸿兘浼翠荆</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
            style={{ background: `${threadColor}15`, color: threadColor }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: threadColor }} />
            鍦ㄧ嚎
          </span>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-5 max-w-[720px] mx-auto w-full">

        {/* 鐘舵€佸崱鐗?*/}
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">馃搳 鐘舵€佹瑙?/h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface-inset/30 px-3.5 py-3 text-center">
              <p className="text-2xl font-display font-bold text-ink">{userMsgCount}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">浣犵殑娑堟伅</p>
            </div>
            <div className="rounded-xl bg-surface-inset/30 px-3.5 py-3 text-center">
              <p className="text-2xl font-display font-bold text-ink">{assistantMsgCount}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">鍥炲娑堟伅</p>
            </div>
            <div className="rounded-xl bg-surface-inset/30 px-3.5 py-3 text-center">
              <p className="text-2xl font-display font-bold" style={{ color: threadColor }}>
                {snapshot?.aff ?? 0}
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">濂芥劅搴?/p>
            </div>
          </div>
        </div>

        {/* 鎯呯华鐘舵€?*/}
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">馃挱 褰撳墠鎯呯华</h2>
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
              style={{ background: `${threadColor}18` }}
            >
              {snapshot?.emotionLabel === 'WARM_AFFECTION' ? '馃グ' :
               snapshot?.emotionLabel === 'EXCITED_ENGAGED' ? '馃槃' :
               snapshot?.emotionLabel === 'CALM_RATIONAL' ? '馃槍' :
               snapshot?.emotionLabel === 'MELANCHOLIC' ? '馃様' :
               snapshot?.emotionLabel === 'ANXIOUS_WORRIED' ? '馃槦' : '馃檪'}
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                {snapshot?.emotionLabel?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) || '骞抽潤'}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {snapshot?.lastActive
                  ? `涓婃娲昏穬 ${new Date(snapshot.lastActive).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : '鍒氬垰'}
              </p>
            </div>
          </div>
        </div>

        {/* 蹇嵎鎿嶄綔 */}
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">鈿?蹇嵎鎿嶄綔</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={goToChat}
              className="flex items-center gap-3 rounded-xl bg-surface-inset/30 px-4 py-3.5 text-left hover:bg-surface-inset/50 transition-colors"
            >
              <span className="text-xl">馃挰</span>
              <div>
                <p className="text-sm font-medium text-ink">寮€濮嬪璇?/p>
                <p className="text-[11px] text-ink-muted">鍥炲埌鑱婂ぉ椤甸潰</p>
              </div>
            </button>
            <button
              type="button"
              onClick={goToDiary}
              className="flex items-center gap-3 rounded-xl bg-surface-inset/30 px-4 py-3.5 text-left hover:bg-surface-inset/50 transition-colors"
            >
              <span className="text-xl">馃摂</span>
              <div>
                <p className="text-sm font-medium text-ink">鏌ョ湅鏃ヨ</p>
                <p className="text-[11px] text-ink-muted">娴忚姣忔棩璁板綍</p>
              </div>
            </button>
            <button
              type="button"
              onClick={goToMemory}
              className="flex items-center gap-3 rounded-xl bg-surface-inset/30 px-4 py-3.5 text-left hover:bg-surface-inset/50 transition-colors"
            >
              <span className="text-xl">馃</span>
              <div>
                <p className="text-sm font-medium text-ink">璁板繂绠＄悊</p>
                <p className="text-[11px] text-ink-muted">鏌ョ湅涓庢暣鐞嗚蹇?/p>
              </div>
            </button>
            <button
              type="button"
              onClick={goToSettings}
              className="flex items-center gap-3 rounded-xl bg-surface-inset/30 px-4 py-3.5 text-left hover:bg-surface-inset/50 transition-colors"
            >
              <span className="text-xl">鈿?/span>
              <div>
                <p className="text-sm font-medium text-ink">璁剧疆</p>
                <p className="text-[11px] text-ink-muted">妯″瀷涓庡亸濂介厤缃?/p>
              </div>
            </button>
          </div>
        </div>

        {/* 鑳藉姏璇存槑 */}
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">馃幆 鎴戣兘鍋氫粈涔?/h2>
          <div className="space-y-2.5">
            {[
              { icon: '馃挰', title: '鏅鸿兘瀵硅瘽', desc: '鍩轰簬璁板繂鐨勬繁搴︿氦娴侊紝瓒婅亰瓒婃噦浣? },
              { icon: '馃帹', title: 'AI 鐢熷浘', desc: '杈撳叆銆岀敾涓€寮?..銆嶅嵆鍙敓鎴愮簿缇庡浘鐗? },
              { icon: '馃', title: '璁板繂绯荤粺', desc: '鑷姩璁颁綇閲嶈浜嬮」锛岄暱鏈熼櫔浼? },
              { icon: '馃摂', title: '鏃ヨ鐢熸垚', desc: '姣忔棩鑷姩鐢熸垚鐢熸椿鏃ヨ' },
              { icon: '馃攳', title: '鐭ヨ瘑妫€绱?, desc: '璇箟鎼滅储浣犵殑璁板繂搴? },
              { icon: '馃挱', title: '鎯呯华鎰熺煡', desc: '鐞嗚В浣犵殑鎯呯华骞惰皟鏁村洖搴旀柟寮? }
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
                <span className="text-base mt-0.5">{icon}</span>
                <div>
                  <p className="text-xs font-medium text-ink">{title}</p>
                  <p className="text-[11px] text-ink-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 浠婃棩瀵硅瘽棰勮 */}
        {chatRows.length > 0 && (
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink">馃挰 鏈€杩戝璇?/h2>
              <button
                type="button"
                onClick={goToChat}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                鏌ョ湅鍏ㄩ儴 鈫?              </button>
            </div>
            <div className="space-y-2">
              {chatRows
                .filter(r => r.kind === 'message')
                .slice(-3)
                .reverse()
                .map((r, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-surface-inset/20 px-3 py-2 text-xs text-ink-muted line-clamp-2"
                  >
                    <span className="font-medium text-ink-muted/80">
                      {r.kind === 'message' && r.role === 'user' ? '浣? : snapshot?.name}锛?                    </span>
                    {r.kind === 'message' ? r.content.slice(0, 80) : ''}
                    {r.kind === 'message' && r.content.length > 80 ? '鈥? : ''}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
