import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// Host-local capabilities never enter task snapshots, renderer IPC, prompts or logs.
const memory = new Map<string, string>()
const valid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function bindingPath(): string | undefined {
  const root = app?.getPath?.('userData')
  return root ? join(root, 'ackemcode-host-bindings.json') : undefined
}
function readBindings(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  let parsed: unknown
  try { parsed = JSON.parse(readFileSync(file, 'utf8')) }
  catch { throw Error('invalid_host_session_bindings') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('invalid_host_session_bindings')
  return Object.fromEntries(Object.entries(parsed).filter(([id, value]) => /^[A-Za-z0-9_-]{8,64}$/.test(id) && valid(value)))
}
export function newCodeSessionBinding(): string { return randomBytes(32).toString('hex') }
export function rememberCodeSessionBinding(sessionId: string, binding: string): void {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId) || !valid(binding)) throw Error('invalid_host_session_binding')
  const file = bindingPath()
  if (file) {
    const values = readBindings(file)
    values[sessionId] = binding
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(values), { encoding: 'utf8', mode: 0o600 })
    renameSync(`${file}.tmp`, file)
  }
  memory.set(`${file ?? ''}:${sessionId}`, binding)
}
export function codeSessionHeaders(sessionId: string): Record<string, string> {
  const file = bindingPath()
  const binding = file ? readBindings(file)[sessionId] : memory.get(`:${sessionId}`)
  return { 'content-type': 'application/json', ...(binding ? { 'x-ackem-host-binding': binding } : {}) }
}
