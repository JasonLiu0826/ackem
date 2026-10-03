export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT' as const

  constructor(idempotencyKey: string) {
    super(`Idempotency key conflict: ${idempotencyKey}`)
    this.name = 'IdempotencyConflictError'
  }
}

export class PayloadEventIdMismatchError extends Error {
  readonly code = 'PAYLOAD_EVENT_ID_MISMATCH' as const

  constructor(eventId: string, payloadEventId: string) {
    super(`Event id mismatch: meta=${eventId} payload=${payloadEventId}`)
    this.name = 'PayloadEventIdMismatchError'
  }
}

export class JobIdConflictError extends Error {
  readonly code = 'JOB_ID_CONFLICT' as const

  constructor(jobId: string) {
    super(`Job id conflict: ${jobId}`)
    this.name = 'JobIdConflictError'
  }
}

export class TombstoneIdConflictError extends Error {
  readonly code = 'TOMBSTONE_ID_CONFLICT' as const

  constructor(tombstoneId: string) {
    super(`Tombstone id conflict: ${tombstoneId}`)
    this.name = 'TombstoneIdConflictError'
  }
}
