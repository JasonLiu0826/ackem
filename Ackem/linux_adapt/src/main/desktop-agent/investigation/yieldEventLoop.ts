/** 让出主进程事件循环，避免 Investigation 长时间 sync 阻塞 UI */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
