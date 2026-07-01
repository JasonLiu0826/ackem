import { EMOTION_LABEL_ZH, emotionLightColor } from '../lib/emotionColors'
import { t } from '../lib/i18n'

export type PlanCreateChatCardProps = {
  askMessage: string
  planTopic?: string
  emotionLabel: string
  status: 'pending' | 'accepted' | 'rejected'
  disabled?: boolean
  onAccept: () => void
  onReject: () => void
}

export function PlanCreateChatCard({
  askMessage,
  planTopic,
  emotionLabel,
  status,
  disabled,
  onAccept,
  onReject
}: PlanCreateChatCardProps): JSX.Element {
  const threadColor = emotionLightColor(emotionLabel)
  const emotionZh = EMOTION_LABEL_ZH[emotionLabel] ?? emotionLabel
  const settled = status !== 'pending'

  return (
    <div className="plan-create-chat-card max-w-[820px]">
      <div
        className="message-her plan-create-chat-card__bubble"
        style={{ ['--thread-color' as string]: threadColor }}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{askMessage}</p>
        <div className="plan-create-chat-card__meta mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          <span
            className="plan-create-chat-card__emotion-pill rounded-full px-2 py-0.5"
            style={{
              color: threadColor,
              backgroundColor: `color-mix(in srgb, ${threadColor} 14%, transparent)`
            }}
          >
            {emotionZh}
          </span>
          {planTopic && (
            <span className="truncate" title={planTopic}>
              主题 · {planTopic}
            </span>
          )}
        </div>
      </div>

      {!settled ? (
        <div className="plan-create-chat-card__actions mt-3 flex gap-2 pl-[14px]">
          <button
            type="button"
            disabled={disabled}
            onClick={onReject}
            className="plan-create-chat-card__btn plan-create-chat-card__btn--ghost flex-1 rounded-xl border border-surface-inset px-4 py-2 text-sm text-ink-muted transition hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          >
            不用
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onAccept}
            className="plan-create-chat-card__btn plan-create-chat-card__btn--primary flex-1 rounded-xl bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent-hover disabled:opacity-40"
          >
            好
          </button>
        </div>
      ) : (
        <p className="plan-create-chat-card__settled mt-2 pl-[14px] text-[11px] text-ink-muted">
          {status === 'accepted' ? '已同意 · 打开 Plan 设计' : '已跳过'}
        </p>
      )}
    </div>
  )
}
