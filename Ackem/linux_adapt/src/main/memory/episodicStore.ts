// [episodicStore] — 情节记忆存储
// 职责：episodes.v1.json CRUD、检索
// 对标 MemGPT episodic memory / Character.AI conversation memory
// 引用：../engine/types, ../engine/ackemParams

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EPISODE_MAX_KEYWORDS, EPISODE_INTENSITY_WEIGHT, EPISODE_MIN_SCORE, EPISODE_RECENCY_DECAY, EPISODE_RETRIEVAL_MAX, EPISODE_SUMMARY_MAX_CHARS } from '../engine/ackemParams'
import {
  countEpisodesInDb,
  loadEpisodesFromDb,
  replaceEpisodesInDb,
  insertEpisode,
  deleteAllEpisodesFromDb
} from '../db/repos/episodes'
import { dataRootFromFactsPath } from '../db/paths'
import type { Episode } from '../engine/types'

type EpisodesFile = { version: string; episodes: Episode[] }

export class EpisodicStore {
  private episodes: Episode[] = []
  private readonly path: string
  /** Phase 3: DB 可用时走增量写入 */
  private useDb = false

  constructor(filePath: string) {
    this.path = filePath
  }

  private get dataRoot(): string {
    return dataRootFromFactsPath(this.path)
  }

  load(): void {
    const dataRoot = this.dataRoot
    if (countEpisodesInDb(dataRoot) > 0) {
      this.episodes = loadEpisodesFromDb(dataRoot)
      this.useDb = true
      return
    }
    if (!existsSync(this.path)) {
      this.episodes = []
      return
    }
    try {
      const j = JSON.parse(readFileSync(this.path, 'utf-8')) as EpisodesFile
      this.episodes = Array.isArray(j.episodes) ? j.episodes : []
      if (this.episodes.length > 0) {
        replaceEpisodesInDb(dataRoot, this.episodes)
        this.useDb = true
      }
    } catch {
      this.episodes = []
    }
  }

  /** Phase 3: 仅用于 JSON 回退模式 */
  private persist(): void {
    if (this.useDb) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify({ version: '1.0', episodes: this.episodes }, null, 2), 'utf-8')
    replaceEpisodesInDb(this.dataRoot, this.episodes)
  }

  add(raw: {
    summary: string
    emotionalIntensity: number
    dominantEmotion: string
    keywords: string[]
    prevEpisodeId: string | null
    sourceSessionId: string
    startTurn: number
    endTurn: number
  }): Episode {
    const now = new Date().toISOString()
    const ep: Episode = {
      id: randomUUID(),
      summary: raw.summary.slice(0, EPISODE_SUMMARY_MAX_CHARS),
      emotionalIntensity: Math.max(0, Math.min(1, raw.emotionalIntensity)),
      dominantEmotion: raw.dominantEmotion,
      keywords: raw.keywords.map(k => k.toLowerCase()).slice(0, EPISODE_MAX_KEYWORDS),
      prevEpisodeId: raw.prevEpisodeId,
      sourceSessionId: raw.sourceSessionId,
      startTurn: raw.startTurn,
      endTurn: raw.endTurn,
      createdAt: now
    }
    this.episodes.push(ep)
    if (this.useDb) {
      insertEpisode(this.dataRoot, ep)
    } else {
      this.persist()
    }
    return ep
  }

  /** Get the most recent episode (for linking continuity) */
  latest(): Episode | null {
    if (this.episodes.length === 0) return null
    return this.episodes[this.episodes.length - 1]
  }

  /** Retrieve episodes relevant to a query by keyword + emotional intensity */
  retrieve(query: string, maxResults: number = EPISODE_RETRIEVAL_MAX): Episode[] {
    if (this.episodes.length === 0) return []
    const qLower = query.toLowerCase()

    const scored = this.episodes.map(ep => {
      let score = 0
      // Keyword match
      for (const kw of ep.keywords) {
        if (qLower.includes(kw)) score += 2
      }
      // Emotional intensity bonus (memorable episodes matter more)
      score += ep.emotionalIntensity * EPISODE_INTENSITY_WEIGHT
      // Recency boost (more recent episodes score higher)
      const daysOld = (Date.now() - new Date(ep.createdAt).getTime()) / 86400000
      score *= Math.exp(-EPISODE_RECENCY_DECAY * Math.max(0, daysOld))
      return { ep, score }
    })

    return scored
      .filter(({ score }) => score > EPISODE_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ ep }) => ep)
  }

  /** Build a text block from retrieved episodes for Tier B injection */
  buildRetrievalBlock(episodes: Episode[], charBudget: number): string {
    if (episodes.length === 0) return ''
    const lines: string[] = ['【情节记忆（过往对话片段）】']
    let chars = 0
    for (const ep of episodes) {
      const line = `· ${ep.summary}（${ep.dominantEmotion}）`
      if (chars + line.length + 2 > charBudget) break
      lines.push(line)
      chars += line.length + 2
    }
    return lines.join('\n')
  }

  listAll(): Episode[] {
    return [...this.episodes]
  }

  count(): number {
    return this.episodes.length
  }

  clear(): void {
    this.episodes = []
    if (this.useDb) {
      deleteAllEpisodesFromDb(this.dataRoot)
    } else {
      this.persist()
    }
  }
}

export function defaultEpisodesPath(dataRoot: string): string {
  return join(dataRoot, 'memory', 'episodes', 'episodes.v1.json')
}
