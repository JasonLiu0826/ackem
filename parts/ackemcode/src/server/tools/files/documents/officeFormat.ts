/**
 * OOXML style fingerprints — used to verify replace does not strip layout.
 */
import fs from 'node:fs/promises'
import { unzipAll } from './zipXml.js'

export type FormatFingerprint = {
  heading1: number
  pStyle: number
  bold: number
  italic: number
  underline: number
  color: number
  fonts: number
  tables: number
  sectPr: number
}

function count(xml: string, re: RegExp): number {
  return (xml.match(re) ?? []).length
}

export function formatFingerprint(xml: string): FormatFingerprint {
  return {
    heading1: count(xml, /w:pStyle[^>]*Heading1/g),
    pStyle: count(xml, /<(?:[\w.-]+:)?pStyle\b/g),
    bold: count(xml, /<(?:[\w.-]+:)?b[\s/>]/g),
    italic: count(xml, /<(?:[\w.-]+:)?i[\s/>]/g),
    underline: count(xml, /<(?:[\w.-]+:)?u\b/g),
    color: count(xml, /<(?:[\w.-]+:)?color\b/g),
    fonts: count(xml, /<(?:[\w.-]+:)?rFonts\b/g),
    tables: count(xml, /<(?:[\w.-]+:)?tbl[\s>]/g),
    sectPr: count(xml, /<(?:[\w.-]+:)?sectPr\b/g)
  }
}

export function fingerprintsEqual(a: FormatFingerprint, b: FormatFingerprint): boolean {
  return (Object.keys(a) as (keyof FormatFingerprint)[]).every((k) => a[k] === b[k])
}

export function fingerprintDiff(
  before: FormatFingerprint,
  after: FormatFingerprint
): string {
  return (Object.keys(before) as (keyof FormatFingerprint)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => `${k}:${before[k]}→${after[k]}`)
    .join(',')
}

export async function docxDocumentXml(abs: string): Promise<string> {
  const files = unzipAll(await fs.readFile(abs))
  return files.get('word/document.xml')?.toString('utf8') ?? ''
}
