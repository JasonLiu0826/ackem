import { resolve } from 'node:path'
import type { MemorySystem } from './memorySystem.js'

export const MEMORY_SYSTEM_FACTORY_NOT_REGISTERED = 'MEMORY_SYSTEM_FACTORY_NOT_REGISTERED'

export class MemorySystemFactoryNotRegisteredError extends Error {
  readonly code = MEMORY_SYSTEM_FACTORY_NOT_REGISTERED
  constructor() {
    super(MEMORY_SYSTEM_FACTORY_NOT_REGISTERED)
    this.name = 'MemorySystemFactoryNotRegisteredError'
  }
}

export type MemorySystemFactory = (dataRoot: string) => MemorySystem

/** Cache key only — factory still receives the caller's original dataRoot string. */
export function normalizeDataRootCacheKey(dataRoot: string): string {
  const resolved = resolve(dataRoot)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

let registeredFactory: MemorySystemFactory | null = null
const instances = new Map<string, MemorySystem>()

export function registerMemorySystemFactory(factory: MemorySystemFactory): void {
  registeredFactory = factory
  instances.clear()
}

export function getMemorySystem(dataRoot: string): MemorySystem {
  if (!registeredFactory) {
    throw new MemorySystemFactoryNotRegisteredError()
  }
  const cacheKey = normalizeDataRootCacheKey(dataRoot)
  const existing = instances.get(cacheKey)
  if (existing) return existing
  const created = registeredFactory(dataRoot)
  instances.set(cacheKey, created)
  return created
}

export function resetMemorySystemForTests(): void {
  instances.clear()
  registeredFactory = null
}
