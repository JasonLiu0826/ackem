import React from 'react'
import { render } from 'ink'
import { createSession } from './client/api.js'
import { ensureDaemon } from './daemon/ensureDaemon.js'
import { runDaemonForeground } from './daemon.js'
import { parseArgv } from './parseArgv.js'
import { runPrintMode } from './print.js'
import { App } from './app/App.js'

async function main(): Promise<void> {
  const cmd = parseArgv(process.argv)
  if (cmd.kind === 'daemon') {
    if (cmd.stop) {
      console.error('ackem daemon --stop is P2 (leave the process running)')
      process.exit(2)
    }
    runDaemonForeground(cmd.port)
    return
  }

  if (cmd.kind === 'print') {
    const code = await runPrintMode(cmd)
    process.exit(code)
  }

  const spawnIfMissing = process.env.ACKEM_DEV !== '1' && process.env.npm_lifecycle_event !== 'cli'
  const devCli =
    process.env.npm_lifecycle_event === 'cli' ||
    process.env.npm_lifecycle_event === 'dev:cli'
  try {
    await ensureDaemon({ spawnIfMissing: !devCli && spawnIfMissing })
  } catch (e) {
    if (devCli) {
      console.error(
        e instanceof Error ? e.message : String(e),
        '\nDev tip: npm run daemon   (or npm run dev:server) in another terminal'
      )
    } else {
      console.error(e instanceof Error ? e.message : String(e))
    }
    process.exit(1)
  }

  const cwd = cmd.kind === 'repl' ? cmd.cwd || process.cwd() : process.cwd()
  const attachPickSession = cmd.kind === 'attach' && !cmd.sessionId
  const sessionId =
    cmd.kind === 'attach'
      ? cmd.sessionId
      : cmd.kind === 'repl'
        ? cmd.sessionId
        : undefined
  const session = await createSession({
    sessionId,
    cwd
  })

  const stdout = process.stdout
  const showCursor = '\x1b[?25h'
  const hideCursor = '\x1b[?25l'
  const originalWrite = stdout.write

  // Ink appends SHOW_CURSOR after the IME positioning sequence. Filter only
  // that command so the native caret stays parked but invisible, like CC.
  if (stdout.isTTY) {
    stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      const text = Buffer.from(chunk).toString().replaceAll(showCursor, '')
      return Reflect.apply(originalWrite, stdout, [text, ...args]) as boolean
    }) as typeof stdout.write
    stdout.write(hideCursor)
  }

  const instance = render(
    <App
      sessionId={session.sessionId}
      cwd={cwd}
      ensureDaemon={!devCli}
      attachPickSession={attachPickSession}
    />,
    {
      exitOnCtrlC: false,
      stdout
    }
  )

  try {
    await instance.waitUntilExit()
  } finally {
    if (stdout.isTTY) {
      stdout.write = originalWrite
      stdout.write(showCursor)
    }
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
