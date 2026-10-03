import { createLogger } from '../../logger.js'
import { isValidIanaTimezone, systemIanaTimezone } from './zonedDate.js'

const log = createLogger('timezone-policy')

export type ResolvedTimezone = {
  timezone: string
  settingsError?: string
  usedOverride: boolean
}

let lastTimezoneSettingsError: string | null = null

export function consumeTimezoneSettingsError(): string | null {
  const err = lastTimezoneSettingsError
  lastTimezoneSettingsError = null
  return err
}

export function peekTimezoneSettingsError(): string | null {
  return lastTimezoneSettingsError
}

/** Resolve effective IANA zone: valid override → system. Invalid override records settingsError. */
export function resolveUserTimezone(override?: string | null): ResolvedTimezone {
  const trimmed = override?.trim()
  if (!trimmed) {
    return { timezone: systemIanaTimezone(), usedOverride: false }
  }
  if (isValidIanaTimezone(trimmed)) {
    lastTimezoneSettingsError = null
    return { timezone: trimmed, usedOverride: true }
  }
  const message = `INVALID_TIMEZONE_OVERRIDE:${trimmed}`
  lastTimezoneSettingsError = message
  const fallback = systemIanaTimezone()
  log.warn('Invalid AppSettings.timezone override; using system IANA', {
    override: trimmed,
    fallback,
    code: message,
  })
  return { timezone: fallback, settingsError: message, usedOverride: false }
}
