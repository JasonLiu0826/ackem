import { nanoid } from 'nanoid'
import type { BrowserOnboardingOptionId } from './browserOnboarding.js'

type Waiter = {
  resolve: (choice: BrowserOnboardingOptionId) => void
  reject: (e: Error) => void
}

const waiters = new Map<string, Waiter>()

export function createBrowserOnboardingRequestId(): string {
  return nanoid(10)
}

export function waitBrowserOnboardingChoice(
  requestId: string,
  signal?: AbortSignal
): Promise<BrowserOnboardingOptionId> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('browser onboarding aborted'))
      return
    }
    const onAbort = () => {
      waiters.delete(requestId)
      reject(new Error('browser onboarding aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    waiters.set(requestId, {
      resolve: (c) => {
        signal?.removeEventListener('abort', onAbort)
        resolve(c)
      },
      reject
    })
  })
}

export function respondBrowserOnboarding(
  requestId: string,
  choice: BrowserOnboardingOptionId
): boolean {
  const w = waiters.get(requestId)
  if (!w) return false
  waiters.delete(requestId)
  w.resolve(choice)
  return true
}

export function cancelBrowserOnboarding(requestId: string): void {
  const w = waiters.get(requestId)
  if (!w) return
  waiters.delete(requestId)
  w.reject(new Error('browser onboarding cancelled'))
}
