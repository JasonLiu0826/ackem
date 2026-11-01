import { existsSync } from 'node:fs'
import path from 'node:path'

function isWslStub(exe: string): boolean {
  const n = exe.replace(/\//g, '\\').toLowerCase()
  return (
    n.endsWith('\\system32\\bash.exe') ||
    n.endsWith('\\sysnative\\bash.exe') ||
    n.includes('\\windowsapps\\bash.exe') ||
    n.endsWith('\\system32\\wsl.exe')
  )
}

function gitBashCandidates(): string[] {
  const extra = process.env.ACKEM_GIT_BASH?.trim()
  return [
    extra,
    process.env.ProgramW6432 &&
      path.join(process.env.ProgramW6432, 'Git', 'bin', 'bash.exe'),
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)'] &&
      path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe')
  ].filter((p): p is string => Boolean(p))
}

/** Real bash only. Windows WSL stub (System32\\bash.exe) is not Git Bash. */
export function resolveBashExecutable(): string | null {
  if (process.platform !== 'win32') return 'bash'
  for (const candidate of gitBashCandidates()) {
    if (existsSync(candidate) && !isWslStub(candidate)) return candidate
  }
  return null
}

export const WINDOWS_BASH_UNAVAILABLE =
  'bash is not available on this Windows PC (no Git Bash). Use the powershell tool. Do not retry bash or WSL.'
