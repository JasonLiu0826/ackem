/**
 * D-06 — CLI local trusted working directories (~/.ackemcode/cli-trusted-cwds.json).
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const TRUST_FILE = path.join(os.homedir(), '.ackemcode', 'cli-trusted-cwds.json')

type TrustFile = { paths: string[] }

function normCwd(cwd: string): string {
  return path.resolve(cwd).replace(/\\/g, '/').toLowerCase()
}

async function readTrust(): Promise<TrustFile> {
  try {
    const raw = await fs.readFile(TRUST_FILE, 'utf8')
    const data = JSON.parse(raw) as TrustFile
    return { paths: Array.isArray(data.paths) ? data.paths.map(normCwd) : [] }
  } catch {
    return { paths: [] }
  }
}

async function writeTrust(data: TrustFile): Promise<void> {
  await fs.mkdir(path.dirname(TRUST_FILE), { recursive: true })
  await fs.writeFile(TRUST_FILE, JSON.stringify(data, null, 2), 'utf8')
}

export async function isCwdTrusted(cwd: string): Promise<boolean> {
  const n = normCwd(cwd)
  const { paths } = await readTrust()
  return paths.includes(n)
}

export async function trustCwdPersist(cwd: string): Promise<void> {
  const n = normCwd(cwd)
  const data = await readTrust()
  if (!data.paths.includes(n)) {
    data.paths.push(n)
    await writeTrust(data)
  }
}

export function trustFilePath(): string {
  return TRUST_FILE
}
