export const CLI_LANGUAGES = ['zh', 'en'] as const
export type CliLanguage = (typeof CLI_LANGUAGES)[number]

export const CLI_LANGUAGE_LABELS: Record<CliLanguage, string> = {
  zh: '中文',
  en: 'English'
}

let activeLanguage: CliLanguage = 'zh'

export function currentLanguage(): CliLanguage {
  return activeLanguage
}

export function applyLanguage(language: CliLanguage): void {
  activeLanguage = language
}

export function isCliLanguage(value: string): value is CliLanguage {
  return (CLI_LANGUAGES as readonly string[]).includes(value)
}

export function l(zh: string, en: string): string {
  return activeLanguage === 'zh' ? zh : en
}
