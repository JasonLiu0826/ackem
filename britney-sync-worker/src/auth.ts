import { Env } from './types'

// Simple device authentication using pair code
export async function authenticateDevice(
  env: Env,
  request: Request
): Promise<string | null> {
  const deviceId = request.headers.get('X-Device-Id')
  if (!deviceId) return null
  
  // Check if device is paired
  const device = await env.DB.prepare(
    'SELECT device_id FROM sync_devices WHERE device_id = ?'
  ).bind(deviceId).first()
  
  return device ? deviceId : null
}

// Validate pair code and register device
export async function pairDevice(
  env: Env,
  pairCode: string,
  deviceId: string,
  deviceName: string
): Promise<{ ok: boolean; error?: string }> {
  // Verify pair code
  const codeRow = await env.DB.prepare(
    'SELECT * FROM pair_codes WHERE code = ? AND used = 0 AND expires_at > ?'
  ).bind(pairCode, Date.now()).first()
  
  if (!codeRow) {
    return { ok: false, error: 'Invalid or expired pair code' }
  }
  
  // Mark code as used
  await env.DB.prepare(
    'UPDATE pair_codes SET used = 1 WHERE code = ?'
  ).bind(pairCode).run()
  
  // Register device
  await env.DB.prepare(
    `INSERT OR REPLACE INTO sync_devices (device_id, device_name, paired_at, last_sync_ts)
     VALUES (?, ?, ?, 0)`
  ).bind(deviceId, deviceName, Date.now()).run()
  
  return { ok: true }
}

// Generate a 6-digit pair code
export async function generatePairCode(
  env: Env,
  deviceId: string
): Promise<string> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()
  const now = Date.now()
  
  await env.DB.prepare(
    `INSERT INTO pair_codes (code, device_id, created_at, expires_at, used)
     VALUES (?, ?, ?, ?, 0)`
  ).bind(code, deviceId, now, now + 10 * 60 * 1000).run() // 10 min expiry
  
  return code
}
