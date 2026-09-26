import { Env, SyncChange, ChatMessage, MemoryFact } from './types'

// Pull changes since last sync
export async function pullChanges(
  env: Env,
  deviceId: string,
  since: number
): Promise<SyncChange[]> {
  const changes: SyncChange[] = []
  
  // Get chat messages from other devices
  const chats = await env.DB.prepare(
    'SELECT * FROM chat_messages WHERE synced_at > ? AND device_id != ?'
  ).bind(since, deviceId).all<ChatMessage>()
  
  for (const chat of chats.results) {
    changes.push({
      id: chat.id,
      table: 'chat_messages',
      operation: 'insert',
      data: chat as any,
      timestamp: chat.synced_at,
      deviceId: chat.device_id
    })
  }
  
  // Get memory facts from other devices
  const facts = await env.DB.prepare(
    'SELECT * FROM memory_facts WHERE updated_at > ? AND device_id != ?'
  ).bind(since, deviceId).all<MemoryFact>()
  
  for (const fact of facts.results) {
    changes.push({
      id: fact.id,
      table: 'memory_facts',
      operation: 'insert',
      data: fact as any,
      timestamp: fact.updated_at,
      deviceId: fact.device_id
    })
  }
  
  // Get settings from other devices
  const settings = await env.DB.prepare(
    'SELECT * FROM settings_kv WHERE updated_at > ? AND device_id != ?'
  ).bind(since, deviceId).all()
  
  for (const setting of settings.results) {
    changes.push({
      id: setting.key as string,
      table: 'settings_kv',
      operation: 'insert',
      data: setting as any,
      timestamp: setting.updated_at as number,
      deviceId: setting.device_id as string
    })
  }
  
  return changes.sort((a, b) => a.timestamp - b.timestamp)
}

// Push changes to server
export async function pushChanges(
  env: Env,
  deviceId: string,
  changes: SyncChange[]
): Promise<void> {
  for (const change of changes) {
    switch (change.table) {
      case 'chat_messages':
        await upsertChatMessage(env, change.data as ChatMessage)
        break
      case 'memory_facts':
        await upsertMemoryFact(env, change.data as MemoryFact)
        break
      case 'settings_kv':
        await upsertSetting(env, change.data as any, deviceId)
        break
      case 'images':
        await upsertImage(env, change.data as any)
        break
    }
  }
  
  // Update last sync timestamp
  await env.DB.prepare(
    'UPDATE sync_devices SET last_sync_ts = ? WHERE device_id = ?'
  ).bind(Date.now(), deviceId).run()
}

async function upsertChatMessage(env: Env, msg: ChatMessage): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO chat_messages (id, session_id, role, content, image_path, created_at, device_id, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(msg.id, msg.session_id, msg.role, msg.content, msg.image_path || null, msg.created_at, msg.device_id, Date.now()).run()
}

async function upsertMemoryFact(env: Env, fact: MemoryFact): Promise<void> {
  // LWW: only update if newer
  const existing = await env.DB.prepare(
    'SELECT updated_at FROM memory_facts WHERE id = ?'
  ).bind(fact.id).first()
  
  if (!existing || (existing.updated_at as number) < fact.updated_at) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO memory_facts (id, content, confidence, created_at, updated_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(fact.id, fact.content, fact.confidence, fact.created_at, fact.updated_at, fact.device_id).run()
  }
}

async function upsertSetting(env: Env, setting: { key: string; value: string; updated_at: number }, deviceId: string): Promise<void> {
  const existing = await env.DB.prepare(
    'SELECT updated_at FROM settings_kv WHERE key = ?'
  ).bind(setting.key).first()
  
  if (!existing || (existing.updated_at as number) < setting.updated_at) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO settings_kv (key, value, updated_at, device_id)
       VALUES (?, ?, ?, ?)`
    ).bind(setting.key, setting.value, setting.updated_at, deviceId).run()
  }
}

async function upsertImage(env: Env, img: { id: string; r2_key: string; prompt: string; created_at: number; device_id: string }): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO images (id, r2_key, prompt, created_at, device_id)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(img.id, img.r2_key, img.prompt, img.created_at, img.device_id).run()
}
