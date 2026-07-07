export type UpdateChannel = 'auto' | 'github' | 'gitee'

export type ReleaseChannelInfo = {
  channel: Exclude<UpdateChannel, 'auto'>
  version: string
  notes: string
  downloadUrl: string
  size: number
  publishedAt: string
  releasePageUrl: string
  error?: string
}

export type UpdateCheckResult = {
  currentVersion: string
  packaged: boolean
  github?: ReleaseChannelInfo
  gitee?: ReleaseChannelInfo
  latest?: ReleaseChannelInfo
  updateAvailable: boolean
  checkedAt: string
}

export type UpdateJob = {
  installDir: string
  currentVersion: string
  targetVersion: string
  channel: Exclude<UpdateChannel, 'auto'>
  downloadUrl: string
  expectedSize: number
  releasePageUrl: string
  zipPath: string
  stagingDir: string
  extractDir: string
  AckemExe: string
}

export type UpdateProgressEvent = {
  phase: 'download' | 'verify' | 'extract' | 'install' | 'done' | 'error'
  message: string
  percent?: number
  downloadedBytes?: number
  totalBytes?: number
  speedBps?: number
  channel?: Exclude<UpdateChannel, 'auto'>
  fromVersion?: string
  toVersion?: string
}

export type UpdateStartRequest = {
  channel: UpdateChannel
  targetVersion: string
  downloadUrl: string
  expectedSize: number
  releasePageUrl: string
}
