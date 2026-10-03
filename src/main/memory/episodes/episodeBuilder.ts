import type { Episode } from './types.js'

export type EpisodeExtractResult = {
  summary: string
  emotionalIntensity: number
  dominantEmotion: string
  keywords: string[]
}

export function buildEpisodeRecord(
  extract: EpisodeExtractResult,
  args: {
    episodeId: string
    prevEpisodeId: string | null
    sourceSessionId: string
    startTurn: number
    endTurn: number
    createdAt: string
  }
): Episode {
  return {
    id: args.episodeId,
    summary: extract.summary,
    emotionalIntensity: extract.emotionalIntensity,
    dominantEmotion: extract.dominantEmotion,
    keywords: extract.keywords,
    prevEpisodeId: args.prevEpisodeId,
    sourceSessionId: args.sourceSessionId,
    startTurn: args.startTurn,
    endTurn: args.endTurn,
    createdAt: args.createdAt
  }
}
