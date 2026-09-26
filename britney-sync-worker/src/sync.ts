import { Env, PullRequest, PushRequest, PairRequest } from './types'
import { pullChanges, pushChanges } from './db'
import { pairDevice, generatePairCode, authenticateDevice } from './auth'

export async function handlePull(env: Env, request: Request): Promise<Response> {
  const body = await request.json<PullRequest>()
  
  if (!body.deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  
  const changes = await pullChanges(env, body.deviceId, body.since || 0)
  
  return Response.json({
    ok: true,
    changes,
    serverTs: Date.now()
  })
}

export async function handlePush(env: Env, request: Request): Promise<Response> {
  const body = await request.json<PushRequest>()
  
  if (!body.deviceId || !body.changes) {
    return Response.json({ error: 'Missing deviceId or changes' }, { status: 400 })
  }
  
  await pushChanges(env, body.deviceId, body.changes)
  
  return Response.json({
    ok: true,
    serverTs: Date.now()
  })
}

export async function handlePair(env: Env, request: Request): Promise<Response> {
  const body = await request.json<PairRequest>()
  
  if (!body.pairCode || !body.deviceId || !body.deviceName) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }
  
  const result = await pairDevice(env, body.pairCode, body.deviceId, body.deviceName)
  
  return Response.json(result)
}

export async function handleGeneratePairCode(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{ deviceId: string }>()
  
  if (!body.deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  
  const code = await generatePairCode(env, body.deviceId)
  
  return Response.json({ ok: true, code })
}

export async function handleStatus(env: Env, request: Request): Promise<Response> {
  const deviceId = request.headers.get('X-Device-Id')
  
  if (!deviceId) {
    return Response.json({ error: 'Missing device ID header' }, { status: 400 })
  }
  
  const device = await env.DB.prepare(
    'SELECT * FROM sync_devices WHERE device_id = ?'
  ).bind(deviceId).first()
  
  if (!device) {
    return Response.json({ paired: false })
  }
  
  return Response.json({
    paired: true,
    device,
    serverTs: Date.now()
  })
}

export async function handleDevices(env: Env, request: Request): Promise<Response> {
  const devices = await env.DB.prepare(
    'SELECT device_id, device_name, paired_at, last_sync_ts FROM sync_devices'
  ).all()
  
  return Response.json({ devices: devices.results })
}

export async function handleUnpair(env: Env, request: Request, targetDeviceId: string): Promise<Response> {
  await env.DB.prepare(
    'DELETE FROM sync_devices WHERE device_id = ?'
  ).bind(targetDeviceId).run()
  
  return Response.json({ ok: true })
}
