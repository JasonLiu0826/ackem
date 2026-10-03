/**
 * platformImport.ts — 平台 zip 导入占位
 * 本期不实现真实解析，固定返回 NOT_IMPLEMENTED
 */

export type PlatformImportResult =
  | { ok: true; agentId: string }
  | { ok: false; code: 'NOT_IMPLEMENTED' | string; message?: string }

export async function parsePlatformCard(
  _dataRoot: string,
  _zipBytes: Uint8Array
): Promise<PlatformImportResult> {
  return {
    ok: false,
    code: 'NOT_IMPLEMENTED',
    message: '平台角色卡导入尚未开放',
  }
}

export async function importPlatformCard(
  _dataRoot: string,
  _zipBytes: Uint8Array
): Promise<PlatformImportResult> {
  return parsePlatformCard(_dataRoot, _zipBytes)
}
