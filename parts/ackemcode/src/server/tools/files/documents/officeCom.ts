/**
 * Windows Word / WPS / Excel COM mutate + SaveAs convert.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export type ComEditOp =
  | { op: 'replace'; find: string; replace: string; all?: boolean }
  | { op: 'append'; text: string }
  | { op: 'rewrite'; text: string }
  | { op: 'set_cell'; cell: string; value: string; sheet?: string }

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

async function runPs(script: string): Promise<string> {
  const tmp = path.join(
    os.tmpdir(),
    `ackem-office-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`
  )
  await fs.writeFile(tmp, script, 'utf8')
  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp],
      { windowsHide: true, timeout: 90_000 }
    )
    const out = `${stdout}\n${stderr}`.trim()
    if (/COM_FAIL/i.test(out)) {
      throw new Error(out.replace(/\s+/g, ' ').slice(0, 400))
    }
    return out
  } finally {
    await fs.unlink(tmp).catch(() => undefined)
  }
}

function wordScript(abs: string, op: ComEditOp): string {
  const file = psQuote(abs)
  const body =
    op.op === 'replace'
      ? `
$findText = ${psQuote(op.find)}
$replText = ${psQuote(op.replace)}
$wdReplace = ${op.all === false ? 1 : 2}
$r = $doc.Content.Find.Execute($findText, $false, $false, $false, $false, $false, $true, 1, $false, $replText, $wdReplace)
if (-not $r) { Write-Output 'COM_FAIL find-not-found' ; exit 1 }
`
      : op.op === 'append'
        ? `
$end = $doc.Content
$end.Collapse(0)
$end.InsertAfter([Environment]::NewLine + ${psQuote(op.text)})
`
        : op.op === 'rewrite'
          ? `$doc.Content.Text = ${psQuote(op.text)}`
          : `Write-Output 'COM_FAIL set_cell-not-word'; exit 1`
  return `
$ErrorActionPreference = 'Stop'
$path = ${file}
$app = $null
foreach ($prog in @('Kwps.Application','Word.Application','wps.Application')) {
  try { $app = New-Object -ComObject $prog; break } catch {}
}
if (-not $app) { Write-Output 'COM_FAIL no-word'; exit 1 }
try {
  $app.Visible = $false
  $doc = $app.Documents.Open($path)
  ${body}
  $doc.Save()
  $doc.Close()
  Write-Output 'COM_OK'
} catch {
  Write-Output ("COM_FAIL " + $_.Exception.Message)
  exit 1
} finally {
  try { $app.Quit() } catch {}
  [GC]::Collect()
}
`
}

function excelScript(abs: string, op: ComEditOp): string {
  const file = psQuote(abs)
  const body =
    op.op === 'set_cell'
      ? `
$ws = if (${psQuote(op.sheet ?? '')} -ne '') { $wb.Worksheets.Item(${psQuote(op.sheet!)}) } else { $wb.Worksheets.Item(1) }
$ws.Range(${psQuote(op.cell)}).Value2 = ${psQuote(op.value)}
`
      : op.op === 'replace'
        ? `
$ws = $wb.Worksheets.Item(1)
$ok = $ws.Cells.Replace(${psQuote(op.find)}, ${psQuote(op.replace)})
if (-not $ok) { Write-Output 'COM_FAIL find-not-found'; exit 1 }
`
        : `Write-Output 'COM_FAIL unsupported-excel-op'; exit 1`
  return `
$ErrorActionPreference = 'Stop'
$path = ${file}
$app = $null
foreach ($prog in @('Ket.Application','Excel.Application','et.Application')) {
  try { $app = New-Object -ComObject $prog; break } catch {}
}
if (-not $app) { Write-Output 'COM_FAIL no-excel'; exit 1 }
try {
  $app.Visible = $false
  $app.DisplayAlerts = $false
  $wb = $app.Workbooks.Open($path)
  ${body}
  $wb.Save()
  $wb.Close()
  Write-Output 'COM_OK'
} catch {
  Write-Output ("COM_FAIL " + $_.Exception.Message)
  exit 1
} finally {
  try { $app.Quit() } catch {}
  [GC]::Collect()
}
`
}

export async function comEditOffice(
  abs: string,
  op: ComEditOp
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'COM is Windows-only' }
  }
  const ext = path.extname(abs).toLowerCase()
  try {
    if (ext === '.xlsx' || ext === '.xls') {
      const out = await runPs(excelScript(abs, op))
      return { ok: true, message: `com-excel ${op.op} ${out.includes('COM_OK') ? 'ok' : out}` }
    }
    if (ext === '.docx' || ext === '.doc' || ext === '.pptx' || ext === '.ppt') {
      if (ext.startsWith('.ppt')) {
        return { ok: false, message: 'COM PPT edit not implemented; use zip-xml replace' }
      }
      const out = await runPs(wordScript(abs, op))
      return { ok: true, message: `com-word ${op.op} ${out.includes('COM_OK') ? 'ok' : out}` }
    }
    return { ok: false, message: `COM cannot edit ${ext}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Word/WPS SaveAs: 16=docx, 17=pdf. */
export async function comConvert(
  src: string,
  dest: string,
  format: 'docx' | 'pdf'
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'COM convert is Windows-only' }
  }
  const wd = format === 'pdf' ? 17 : 16
  const script = `
$ErrorActionPreference = 'Stop'
$src = ${psQuote(src)}
$dest = ${psQuote(dest)}
$app = $null
foreach ($prog in @('Kwps.Application','Word.Application','wps.Application')) {
  try { $app = New-Object -ComObject $prog; break } catch {}
}
if (-not $app) { Write-Output 'COM_FAIL no-word'; exit 1 }
try {
  $app.Visible = $false
  $doc = $app.Documents.Open($src)
  $doc.SaveAs([ref]$dest, [ref]${wd})
  $doc.Close()
  Write-Output 'COM_OK'
} catch {
  try {
    $doc.SaveAs($dest, ${wd})
    $doc.Close()
    Write-Output 'COM_OK'
  } catch {
    Write-Output ("COM_FAIL " + $_.Exception.Message)
    exit 1
  }
} finally {
  try { $app.Quit() } catch {}
  [GC]::Collect()
}
`
  try {
    const out = await runPs(script)
    return { ok: /COM_OK/.test(out), message: out.includes('COM_OK') ? `com-convert ${format}` : out }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
