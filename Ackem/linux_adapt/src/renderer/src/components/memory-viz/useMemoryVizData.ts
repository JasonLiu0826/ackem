// [memory-viz/useMemoryVizData] — 统一取数 Hook

import { useState, useCallback, useEffect } from 'react'
import type { MemoryFact, Triple, Episode, MemoryStats } from './types'

export interface VizData {
  facts: MemoryFact[]
  triples: Triple[]
  associations: Array<{
    id: string
    fact_id_a: string
    fact_id_b: string
    association_type: string
    strength: number
    created_at: string
    last_activated_at: string | null
  }>
  episodes: Episode[]
  stats: MemoryStats | null
  loading: boolean
  reload: () => Promise<void>
}

export function useMemoryVizData(): VizData {
  const [facts, setFacts] = useState<MemoryFact[]>([])
  const [triples, setTriples] = useState<Triple[]>([])
  const [associations, setAssociations] = useState<VizData['associations']>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, t, a, e, s] = await Promise.all([
        window.ackem.memoryList(),
        window.ackem.kgList(),
        window.ackem.associationList(),
        window.ackem.episodeList(),
        window.ackem.memoryStats()
      ])
      setFacts(f as MemoryFact[])
      setTriples(t as Triple[])
      setAssociations(a as VizData['associations'])
      setEpisodes(e as Episode[])
      setStats(s as MemoryStats | null)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const off = window.ackem.onMemoryUpdated?.(() => {
      void load()
    })
    return () => off?.()
  }, [load])

  return { facts, triples, associations, episodes, stats, loading, reload: load }
}
