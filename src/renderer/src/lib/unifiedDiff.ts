export type DiffRow =
  | { kind: 'hunk'; text: string }
  | { kind: 'skip'; count: number }
  | { kind: 'add'; oldNo: number | null; newNo: number | null; text: string }
  | { kind: 'del'; oldNo: number | null; newNo: number | null; text: string }
  | { kind: 'ctx'; oldNo: number | null; newNo: number | null; text: string }

const HUNK = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/

export function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  let prevOldEnd = 0
  let inHunk = false

  for (const raw of diff.replace(/\r\n/g, '\n').split('\n')) {
    if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('diff ') || raw.startsWith('index ')) {
      continue
    }
    const hunk = HUNK.exec(raw)
    if (hunk) {
      const startOld = Number(hunk[1])
      if (inHunk && startOld > prevOldEnd + 1) {
        rows.push({ kind: 'skip', count: startOld - prevOldEnd - 1 })
      }
      oldNo = startOld
      newNo = Number(hunk[2])
      inHunk = true
      rows.push({ kind: 'hunk', text: raw })
      continue
    }
    if (!inHunk) continue
    if (raw.startsWith('\\')) continue
    if (raw.startsWith('+')) {
      rows.push({ kind: 'add', oldNo: null, newNo, text: raw.slice(1) })
      newNo += 1
    } else if (raw.startsWith('-')) {
      rows.push({ kind: 'del', oldNo, newNo: null, text: raw.slice(1) })
      oldNo += 1
    } else {
      const text = raw.startsWith(' ') ? raw.slice(1) : raw
      rows.push({ kind: 'ctx', oldNo, newNo, text })
      oldNo += 1
      newNo += 1
    }
    prevOldEnd = Math.max(prevOldEnd, oldNo - 1)
  }
  return rows
}
