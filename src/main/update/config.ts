import type { UpdateChannel } from '../../shared/updateTypes'

export const UPDATE_USER_AGENT = 'Britney-Desktop-Updater/1.0'

export const GITHUB = {
  owner: 'JasonLiu0826',
  repo: 'Britney',
  apiLatest: 'https://api.github.com/repos/JasonLiu0826/Britney/releases/latest',
  releasePage: 'https://github.com/JasonLiu0826/Britney/releases/latest'
} as const

export const GITEE = {
  owner: 'jason_2005',
  repo: 'britney',
  apiLatest: 'https://gitee.com/api/v5/repos/jason_2005/britney/releases/latest',
  releasePage: 'https://gitee.com/jason_2005/britney/releases'
} as const

export function zipAssetName(version: string): string {
  const v = version.replace(/^v/i, '')
  return `Britney-${v}-win-x64.zip`
}

export function greenFolderName(version: string): string {
  const v = version.replace(/^v/i, '')
  return `Britney-${v}-win-x64`
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^v/i, '')
}

export type ResolvedChannel = Exclude<UpdateChannel, 'auto'>

export const CHANNEL_ORDER_AUTO: ResolvedChannel[] = ['gitee', 'github']
