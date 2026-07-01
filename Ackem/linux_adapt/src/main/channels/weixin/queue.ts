const chains = new Map<string, Promise<void>>()

/** 同一微信用户串行处理，避免情绪/ingest 乱序 */
export function enqueuePeerTurn(peerId: string, fn: () => Promise<void>): Promise<void> {
  const prev = chains.get(peerId) ?? Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(fn)
    .catch((e) => {
      console.error('[weixin-queue]', peerId, e)
    })
  chains.set(peerId, next)
  void next.finally(() => {
    if (chains.get(peerId) === next) chains.delete(peerId)
  })
  return next
}
