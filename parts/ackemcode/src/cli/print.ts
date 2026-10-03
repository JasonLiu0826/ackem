import type { AgentEvent } from '../shared/types.js'
import { abortTurn, createSession } from './client/api.js'
import { postChat } from './client/sse.js'
import { ensureDaemon } from './daemon/ensureDaemon.js'
import type { CliCommand } from './parseArgv.js'

export async function runPrintMode(
  cmd: Extract<CliCommand, { kind: 'print' }>
): Promise<number> {
  let prompt = cmd.prompt.trim()
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const c of process.stdin) chunks.push(c as Buffer)
    const stdinText = Buffer.concat(chunks).toString('utf8').trim()
    if (stdinText) prompt = prompt ? `${prompt}\n${stdinText}` : stdinText
  }
  if (!prompt) {
    console.error('ackem -p requires a prompt (or stdin)')
    return 2
  }

  await ensureDaemon({ spawnIfMissing: true })
  const session = await createSession({
    cwd: process.cwd(),
    permissionMode:
      cmd.permissionMode === 'bypassPermissions' ||
      cmd.permissionMode === 'dontAsk' ||
      cmd.permissionMode === 'acceptEdits' ||
      cmd.permissionMode === 'default' ||
      cmd.permissionMode === 'auto' ||
      cmd.permissionMode === 'plan'
        ? cmd.permissionMode
        : 'acceptEdits'
  })

  let finalText = ''
  let ok = true
  let error: string | undefined
  await postChat({
    sessionId: session.sessionId,
    text: prompt,
    onEvent: (ev: AgentEvent) => {
      if (ev.type === 'assistant_message' && ev.text) finalText = ev.text
      if (ev.type === 'assistant_delta' && ev.text) finalText += ev.text
      if (ev.type === 'done') {
        ok = ev.ok
        error = ev.error
      }
      if (ev.type === 'error') {
        ok = false
        error = ev.message
      }
      if (ev.type === 'permission_request') {
        void abortTurn(session.sessionId, {})
      }
    }
  })

  if (cmd.json) {
    process.stdout.write(
      JSON.stringify({
        ok,
        text: finalText,
        sessionId: session.sessionId,
        error
      }) + '\n'
    )
  } else {
    if (finalText) process.stdout.write(finalText.endsWith('\n') ? finalText : `${finalText}\n`)
    if (!ok && error) process.stderr.write(`${error}\n`)
  }
  return ok ? 0 : 1
}
