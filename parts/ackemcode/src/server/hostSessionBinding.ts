import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const HOST_SESSION_BINDING_HEADER = 'x-ackem-host-binding'
export type HostSessionOwnership = { hostSessionBindingHash?: string; hostTask?: unknown }
export function validHostBinding(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}
export function newHostBinding(): string { return randomBytes(32).toString('hex') }
export function hashHostBinding(binding: string): string {
  if (!validHostBinding(binding)) throw Error('invalid_host_session_binding')
  return createHash('sha256').update(binding).digest('hex')
}
export function isManagedSession(session: HostSessionOwnership): boolean {
  return Boolean(session.hostSessionBindingHash || session.hostTask)
}
export function ownsHostSession(session: HostSessionOwnership, binding: unknown): boolean {
  if (!validHostBinding(binding) || !session.hostSessionBindingHash || !/^[a-f0-9]{64}$/.test(session.hostSessionBindingHash)) return false
  return timingSafeEqual(Buffer.from(session.hostSessionBindingHash, 'hex'), Buffer.from(hashHostBinding(binding), 'hex'))
}
