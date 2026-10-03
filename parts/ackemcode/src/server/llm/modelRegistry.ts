export type RegisteredModelEntry = {
  model: string
  apiBaseUrl: string
  apiKey: string
  contextWindow?: number
  registeredAt: string
}

export type RegisteredModelPublic = {
  model: string
  apiBaseUrl: string
  contextWindow?: number
  registeredAt: string
}

export function normalizeRegisteredModels(raw: unknown): RegisteredModelEntry[] {
  if (!Array.isArray(raw)) return []
  const out: RegisteredModelEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const model = typeof o.model === 'string' ? o.model.trim() : ''
    const apiBaseUrl = typeof o.apiBaseUrl === 'string' ? o.apiBaseUrl.trim() : ''
    const apiKey = typeof o.apiKey === 'string' ? o.apiKey : ''
    const registeredAt =
      typeof o.registeredAt === 'string' && o.registeredAt
        ? o.registeredAt
        : new Date().toISOString()
    const contextWindow =
      typeof o.contextWindow === 'number' && Number.isFinite(o.contextWindow)
        ? o.contextWindow
        : undefined
    if (!model || !apiBaseUrl || !apiKey) continue
    out.push({ model, apiBaseUrl, apiKey, contextWindow, registeredAt })
  }
  return out
}

export function upsertRegisteredModel(
  list: RegisteredModelEntry[] | undefined,
  entry: Omit<RegisteredModelEntry, 'registeredAt'> & { registeredAt?: string }
): RegisteredModelEntry[] {
  const full: RegisteredModelEntry = {
    ...entry,
    registeredAt: entry.registeredAt ?? new Date().toISOString()
  }
  const next = [...(list ?? [])]
  const idx = next.findIndex(
    (m) => m.model === full.model && m.apiBaseUrl === full.apiBaseUrl
  )
  if (idx >= 0) next[idx] = full
  else next.push(full)
  return next.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
}

export function findRegisteredModel(
  list: RegisteredModelEntry[] | undefined,
  model: string
): RegisteredModelEntry | undefined {
  if (!list?.length) return undefined
  return list.find((m) => m.model === model)
}

export function listRegisteredModelsPublic(
  list: RegisteredModelEntry[] | undefined
): RegisteredModelPublic[] {
  return (list ?? []).map(({ model, apiBaseUrl, contextWindow, registeredAt }) => ({
    model,
    apiBaseUrl,
    contextWindow,
    registeredAt
  }))
}

export function migrateLegacyStandalone(
  s: {
    model: string
    apiBaseUrl: string
    apiKey: string
    contextWindow?: number
    llmSetupComplete?: boolean
    registeredModels?: RegisteredModelEntry[]
  }
): RegisteredModelEntry[] {
  let models = s.registeredModels ?? []
  if (
    models.length === 0 &&
    s.llmSetupComplete &&
    s.apiKey.trim() &&
    s.model.trim() &&
    s.apiBaseUrl.trim()
  ) {
    models = upsertRegisteredModel(models, {
      model: s.model,
      apiBaseUrl: s.apiBaseUrl,
      apiKey: s.apiKey,
      contextWindow: s.contextWindow
    })
  }
  return models
}
