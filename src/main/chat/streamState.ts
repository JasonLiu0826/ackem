/** Shared by chat delivery, managed work and companion initiative. */
const streaming = new Set<string>()
export function markChatStreamStart(sessionId: string): void { streaming.add(sessionId) }
export function markChatStreamEnd(sessionId: string): void { streaming.delete(sessionId) }
export function isChatStreaming(sessionId: string): boolean { return streaming.has(sessionId) }
