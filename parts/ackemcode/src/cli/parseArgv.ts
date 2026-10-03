export type CliCommand =
  | { kind: 'repl'; sessionId?: string; cwd?: string; url?: string }
  | { kind: 'daemon'; port?: number; stop?: boolean }
  | { kind: 'attach'; sessionId?: string; url?: string }
  | { kind: 'print'; prompt: string; json: boolean; permissionMode?: string }

export function defaultAckemUrl(): string {
  return (
    process.env.ACKEM_URL ||
    process.env.ACKEMCODE_URL ||
    `http://127.0.0.1:${process.env.ACKEM_PORT || process.env.ACKEMCODE_PORT || 8787}`
  )
}

export function parseArgv(argv: string[]): CliCommand {
  const args = argv.slice(2)
  if (args[0] === 'daemon') {
    const stop = args.includes('--stop')
    const pi = args.indexOf('--port')
    const port = pi >= 0 ? Number(args[pi + 1]) : undefined
    return { kind: 'daemon', port, stop }
  }
  if (args[0] === 'attach') {
    const si = args.indexOf('--session')
    const sessionId = si >= 0 ? args[si + 1] : undefined
    const ui = args.indexOf('--url')
    const url = ui >= 0 ? args[ui + 1] : undefined
    return { kind: 'attach', sessionId, url }
  }

  let json = false
  let print = false
  let permissionMode: string | undefined
  let cwd: string | undefined
  let sessionId: string | undefined
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '-p' || a === '--print') {
      print = true
      continue
    }
    if (a === '--json') {
      json = true
      continue
    }
    if (a === '--permission-mode') {
      permissionMode = args[++i]
      continue
    }
    if (a === '--cwd') {
      cwd = args[++i]
      continue
    }
    if (a === '--session') {
      sessionId = args[++i]
      continue
    }
    if (a === '--url') {
      process.env.ACKEM_URL = args[++i]
      continue
    }
    if (a === '--help' || a === '-h') {
      rest.push(a)
      continue
    }
    rest.push(a)
  }

  if (print) {
    let prompt = rest.filter((x) => x !== '-h' && x !== '--help').join(' ')
    return { kind: 'print', prompt, json, permissionMode }
  }

  return { kind: 'repl', sessionId, cwd }
}
