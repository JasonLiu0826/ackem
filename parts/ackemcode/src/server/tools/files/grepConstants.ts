/** CC GrepTool default head_limit; 0 = unlimited (soft 50k) */
export const GREP_DEFAULT_HEAD = 250

/** Shared grep ignore globs (P1) — align with CC VCS / build noise, not language. */
export const GREP_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/.bzr/**',
  '**/.jj/**',
  '**/dist/**',
  '**/build/**',
  '**/.ackemcode/tool-results/**'
] as const

/** Node fallback when `type` is set but rg is unavailable (P3). */
export const GREP_TYPE_SUFFIXES: Record<string, readonly string[]> = {
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  ts: ['.ts', '.tsx', '.mts', '.cts'],
  py: ['.py', '.pyi'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  vue: ['.vue'],
  yaml: ['.yaml', '.yml'],
  cpp: ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
  sql: ['.sql'],
  kotlin: ['.kt', '.kts'],
  md: ['.md', '.markdown'],
  html: ['.html', '.htm'],
  css: ['.css'],
  json: ['.json']
}

export const GREP_HINT_MAX = 1500

export function clampToolHint(text: string, max = GREP_HINT_MAX): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 20)}\n… [truncated]`
}
