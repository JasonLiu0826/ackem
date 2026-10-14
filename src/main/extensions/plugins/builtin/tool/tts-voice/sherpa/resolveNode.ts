import { execFileSync } from 'child_process'
import { existsSync } from 'fs'

function which(cmd: string): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      windowsHide: true,
      timeout: 4000
    })
      .toString()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return out && existsSync(out) ? out : null
  } catch {
    return null
  }
}

/** Real Node, not Electron. Native sherpa addon is installed against this ABI. */
export function resolveWorkerNode(): string {
  if (process.env.ACKEM_NODE_PATH && existsSync(process.env.ACKEM_NODE_PATH)) {
    return process.env.ACKEM_NODE_PATH
  }
  const node = which('node')
  if (node && !/electron/i.test(node)) return node
  throw new Error('未找到独立 Node。请安装 Node.js 20+，或设置 ACKEM_NODE_PATH。不要用 Electron 进程加载 sherpa-onnx。')
}
