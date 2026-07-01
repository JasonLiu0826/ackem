const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern:
      /require\s*\(\s*['"](?:fs|child_process|net|dgram|cluster|worker_threads|vm|v8|inspector|repl|os|path|crypto)['"]\s*\)/,
    message: '禁止使用 Node.js built-in 模块 (require)'
  },
  {
    pattern:
      /import\s+.*\s+from\s+['"](?:node:)?(?:fs|child_process|net|dgram|cluster|worker_threads|vm|v8|os|path|crypto)['"]/,
    message: '禁止 import Node.js built-in'
  },
  { pattern: /process\s*\.\s*exit/, message: '禁止 process.exit()' },
  { pattern: /process\s*\.\s*kill/, message: '禁止 process.kill()' },
  { pattern: /process\s*\.\s*binding/, message: '禁止 process.binding()' },
  { pattern: /\beval\s*\(/, message: '禁止 eval()' },
  { pattern: /\bnew\s+Function\s*\(/, message: '禁止 new Function()' },
  { pattern: /__proto__/, message: '禁止 __proto__' },
  { pattern: /globalThis/, message: '禁止 globalThis（使用 PluginSandboxApi）' },
  { pattern: /\bglobal\b/, message: '禁止 global（使用 PluginSandboxApi）' }
]

/** Layer-4 静态扫描：返回人类可读错误列表，空数组表示通过 */
export function staticScan(source: string): string[] {
  const errors: string[] = []
  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) {
      errors.push(message)
    }
  }
  return errors
}

export function staticScanFile(relativePath: string, source: string): string[] {
  if (!relativePath.endsWith('.ts') && !relativePath.endsWith('.js')) {
    return []
  }
  return staticScan(source).map((e) => `${relativePath}: ${e}`)
}

export function staticScanFiles(files: Record<string, string>): string[] {
  const all: string[] = []
  for (const [path, content] of Object.entries(files)) {
    all.push(...staticScanFile(path, content))
  }
  return all
}
