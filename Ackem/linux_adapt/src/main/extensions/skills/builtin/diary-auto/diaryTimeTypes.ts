export type DiaryWriteMode = 'full_day' | 'partial_day' | 'backfill'
export type DiaryTrigger = 'scheduled' | 'manual' | 'snapshot'

export type DiaryTimeContext = {
  targetDate: string
  generatedAt: Date
  mode: DiaryWriteMode
  trigger: DiaryTrigger
}

export type DiaryMetaEntry = {
  writeMode: DiaryWriteMode
  trigger: DiaryTrigger
  generatedAt: string
  type?: 'daily' | 'reunion'
  tier?: string
  gapHours?: number
}
