import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { EventRepository } from '../memory/ledger/eventRepository'
import type { MemoryEventType } from '../memory/contracts'

export type ImplementationState = 'designed' | 'implemented' | 'unknown'
export type RuntimeState = 'configured' | 'verified' | 'degraded' | 'unavailable' | 'unknown'
export interface SystemManifest {
  appBuildId: string; codeBuildId: string; configFingerprint: string
  channels: string[]; permissionMode: string; kernelHealth: 'connected' | 'disconnected' | 'unknown'
  capabilities: { capabilityId: string; enabled: boolean; configured: boolean; vision?: boolean }[]
  moduleEntrypoints: string[]; sourceAvailable: boolean
}
export interface EvidenceRef {
  evidenceId: string; type: 'manifest' | 'source' | 'artifact' | 'diagnostic' | 'runtime_receipt' | 'document'
  reference: string; hash: string; observedAt: number; method: string; result: string; scope: string
}
export interface CapabilityFact {
  capabilityId: string; summary: string; implementationState: ImplementationState; runtimeState: RuntimeState
  scope: string; checkedAt: number; expiresAt: number; evidenceRefs: string[]; confidence: number
}
export interface VerifiedSystemReport {
  snapshotId: string; appBuildId: string; codeBuildId: string; configFingerprint: string
  generatedAt: number; capabilities: CapabilityFact[]; evidenceRefs: EvidenceRef[]; knownIssues: string[]
}
export const SYSTEM_KNOWLEDGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS system_knowledge (
 snapshot_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, app_build_id TEXT NOT NULL,
 code_build_id TEXT NOT NULL, config_fingerprint TEXT NOT NULL, generated_at INTEGER NOT NULL,
 report_json TEXT NOT NULL, invalidated_at INTEGER, invalidation_reason TEXT);
`
export function configurationFingerprint(metadata: Record<string, boolean | number | string>): string {
  // Callers supply only non-secret state such as configured booleans, model IDs and enabled flags.
  return createHash('sha256').update(JSON.stringify(Object.keys(metadata).sort().map(k => [k,metadata[k]]))).digest('hex')
}
const states = ['configured','verified','degraded','unavailable','unknown']
const sensitive = /(?:Bearer\s+[A-Za-z0-9._-]+|\bsk-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|password|token|secret)\s*[:=]\s*\S+)/i
export class SystemIntrospection {
  constructor(private readonly db: Database.Database, private readonly manifest: () => SystemManifest,
    private readonly scheduleInspection?: (request: { scope:string; reason:string; readOnly:true; priority:'background'; manifest:SystemManifest }) => unknown,
    private readonly now: () => number = Date.now,
    private readonly evidenceVerifier?: (evidence: EvidenceRef) => boolean) { db.exec(SYSTEM_KNOWLEDGE_SCHEMA) }

  exportManifest(): SystemManifest {
    const m = this.manifest()
    // Explicit reconstruction excludes arbitrary configuration objects, URLs and credentials.
    const result: SystemManifest = {appBuildId:m.appBuildId,codeBuildId:m.codeBuildId,configFingerprint:m.configFingerprint,
      channels:[...m.channels],permissionMode:m.permissionMode,kernelHealth:m.kernelHealth,
      capabilities:m.capabilities.map(c => ({capabilityId:c.capabilityId,enabled:c.enabled,configured:c.configured,vision:c.vision})),
      moduleEntrypoints:[...m.moduleEntrypoints],sourceAvailable:m.sourceAvailable}
    if (sensitive.test(JSON.stringify(result))) throw new Error('SYSTEM_MANIFEST_CONTAINS_SECRET')
    return result
  }
  inspect(request: {scope:string; reason:string}): unknown {
    if (!request.scope.trim() || request.scope.length>200 || request.reason.length>1000) throw new Error('INVALID_INSPECTION_SCOPE')
    if (!this.scheduleInspection) throw new Error('SYSTEM_INSPECTION_COORDINATOR_UNAVAILABLE')
    return this.scheduleInspection({...request,readOnly:true,priority:'background',manifest:this.exportManifest()})
  }
  commitVerifiedReport(report: VerifiedSystemReport): void {
    const m = this.exportManifest()
    if (report.appBuildId!==m.appBuildId || report.codeBuildId!==m.codeBuildId || report.configFingerprint!==m.configFingerprint) throw new Error('STALE_SYSTEM_REPORT')
    const json = JSON.stringify(report)
    if (json.length>100_000 || sensitive.test(json) || !report.snapshotId || report.snapshotId.length>200 || !Number.isFinite(report.generatedAt) || report.generatedAt>this.now()) throw new Error('INVALID_SYSTEM_REPORT')
    if (report.capabilities.length>100 || report.evidenceRefs.length>300 || report.knownIssues.length>100) throw new Error('SYSTEM_REPORT_TOO_LARGE')
    const evidence = new Map(report.evidenceRefs.map(e=>[e.evidenceId,e]))
    if (evidence.size!==report.evidenceRefs.length) throw new Error('DUPLICATE_SYSTEM_EVIDENCE')
    for (const e of report.evidenceRefs) {
      if (!['manifest','source','artifact','diagnostic','runtime_receipt','document'].includes(e.type) || !e.reference || !e.hash || !e.scope || !e.method || !e.result || !Number.isFinite(e.observedAt) || e.observedAt>this.now() || (!m.sourceAvailable && e.type==='source')) throw new Error('INVALID_SYSTEM_EVIDENCE')
      if (['diagnostic','runtime_receipt','source','artifact'].includes(e.type) && !this.evidenceVerifier?.(e)) throw new Error('UNCONFIRMED_SYSTEM_EVIDENCE')
    }
    for (const f of report.capabilities) {
      if (!f.capabilityId || !f.summary || f.summary.length>2000 || !f.scope || !['designed','implemented','unknown'].includes(f.implementationState) || !states.includes(f.runtimeState) || !Number.isFinite(f.confidence) || f.confidence<0 || f.confidence>1 || !Number.isFinite(f.checkedAt) || f.checkedAt>this.now() || !Number.isFinite(f.expiresAt) || f.expiresAt<=f.checkedAt || !f.evidenceRefs.length || f.evidenceRefs.some(id=>!evidence.has(id))) throw new Error('INVALID_SYSTEM_FACT')
      if (f.runtimeState==='verified' && !f.evidenceRefs.some(id=>{ const e=evidence.get(id)!; return ['diagnostic','runtime_receipt'].includes(e.type) && e.scope===f.scope })) throw new Error('UNSCOPED_VERIFICATION')
    }
    this.db.transaction(() => {
      const existing = this.db.prepare('SELECT report_json FROM system_knowledge WHERE snapshot_id=?').get(report.snapshotId) as {report_json:string} | undefined
      if (existing) { if (existing.report_json!==json) throw new Error('SYSTEM_REPORT_ID_CONFLICT'); return }
      const eventId = randomUUID(), date = new Date(this.now()).toISOString()
      new EventRepository(this.db).append(this.db, {eventId,schemaVersion:1,sessionId:'system',turnId:null,
        correlationId:report.snapshotId,causationEventId:null,nature:'work',eventType:'system.inspection_committed' as MemoryEventType,
        surface:'system',actor:'system',status:null,evidenceKind:'deterministic_rule',confidence:1,
        observedAt:date,occurredAt:date,scheduledFor:null,completedAt:date,timezone:'UTC',localDate:date.slice(0,10),idempotencyKey:`system:${report.snapshotId}`},
        {eventId,summary:'Scoped system inspection report committed',content:report as unknown as Record<string,unknown>,contentHash:createHash('sha256').update(json).digest('hex'),redactedAt:null})
      this.db.prepare('INSERT INTO system_knowledge VALUES (?,?,?,?,?,?,?,NULL,NULL)').run(report.snapshotId,eventId,report.appBuildId,report.codeBuildId,report.configFingerprint,report.generatedAt,json)
    })()
  }
  invalidate(reason:string): void { this.db.prepare('UPDATE system_knowledge SET invalidated_at=?,invalidation_reason=? WHERE invalidated_at IS NULL').run(this.now(),reason.slice(0,1000)) }
  getFacts(query: {capabilityIds?:string[]; scope?:string; limit?:number} = {}): CapabilityFact[] {
    const m = this.exportManifest()
    const rows=this.db.prepare(`SELECT k.report_json FROM system_knowledge k JOIN memory_event_payloads p ON p.event_id=k.event_id
      WHERE k.invalidated_at IS NULL AND k.app_build_id=? AND k.code_build_id=? AND k.config_fingerprint=? AND p.redacted_at IS NULL
      ORDER BY k.generated_at DESC,k.rowid DESC LIMIT 100`).all(m.appBuildId,m.codeBuildId,m.configFingerprint) as {report_json:string}[]
    const seen=new Set<string>(), facts:CapabilityFact[]=[]
    for (const row of rows) for (const f of (JSON.parse(row.report_json) as VerifiedSystemReport).capabilities) {
      const key=`${f.capabilityId}:${f.scope}`
      if (seen.has(key)) continue
      seen.add(key)
      if (f.expiresAt<=this.now() || (query.capabilityIds && !query.capabilityIds.includes(f.capabilityId)) || (query.scope && f.scope!==query.scope)) continue
      const current=m.capabilities.find(c=>c.capabilityId===f.capabilityId)
      facts.push(current && (!current.enabled || !current.configured || m.kernelHealth==='disconnected') ? {...f,runtimeState: !current.enabled || !current.configured ? 'unavailable' : 'degraded'} : f)
    }
    return facts.slice(0,Math.min(20,Math.max(1,query.limit ?? 8)))
  }
  contextSummary(query: {capabilityIds?:string[]; scope?:string; limit?:number}): string {
    if (!query.capabilityIds?.length && !query.scope) return ''
    return this.getFacts(query).map(f=>`${f.capabilityId}: ${f.summary} [${f.implementationState}; ${f.runtimeState}; scope=${f.scope}]`).join('\n').slice(0,6000)
  }
}
