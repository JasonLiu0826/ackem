export interface Episode {
  id: string
  /** 1-3 sentence narrative summary of this conversation segment */
  summary: string
  /** 0-1 emotional intensity of the episode */
  emotionalIntensity: number
  /** dominant emotion label during this episode */
  dominantEmotion: string
  /** retrieval keywords */
  keywords: string[]
  /** links to previous episode for narrative continuity */
  prevEpisodeId: string | null
  sourceSessionId: string
  startTurn: number
  endTurn: number
  createdAt: string
}

export interface EpisodeEvidence {
  episodeId: string
  eventId: string
  createdAt: string
}
