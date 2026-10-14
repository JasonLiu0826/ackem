export function MessageTimestamp({ createdAt }: { createdAt?: number }): JSX.Element {
  if (!createdAt || !Number.isFinite(createdAt)) return <span className="chat-message-time">时间未记录</span>
  const date = new Date(createdAt)
  return <time className="chat-message-time" dateTime={date.toISOString()} title={date.toLocaleString('zh-CN')}>
    {date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
  </time>
}
