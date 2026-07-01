import {
  fetchBotQrcode,
  fetchQrcodeStatus,
  notifyWeixinStart,
  notifyWeixinStop
} from './api'
import { toWeixinQrDataUrl } from './qrImage'
import {
  clearWeixinAccount,
  loadWeixinAccount,
  saveWeixinAccount
} from './store'
import type { QrcodeStatusResponse, WeixinAccount } from './types'
import { ILINK_DEFAULT_BASE } from './types'

export type LoginPollResult =
  | { ok: true; status: string; account?: WeixinAccount }
  | { ok: false; status: string; needVerifyCode?: boolean; error?: string }

export async function startWeixinLogin(dataRoot: string): Promise<{
  qrcode: string
  qrcodeImgContent: string
  qrcodeScanUrl: string
}> {
  const existing = loadWeixinAccount(dataRoot)
  const localTokenList = existing?.token ? [existing.token] : []
  const res = await fetchBotQrcode(localTokenList)
  const qrcodeScanUrl = res.qrcode_img_content
  const qrcodeImgContent = await toWeixinQrDataUrl(qrcodeScanUrl)
  return { qrcode: res.qrcode, qrcodeImgContent, qrcodeScanUrl }
}

export async function pollWeixinLogin(
  dataRoot: string,
  qrcode: string,
  verifyCode?: string,
  baseUrl = ILINK_DEFAULT_BASE
): Promise<LoginPollResult> {
  const res = await fetchQrcodeStatus(qrcode, verifyCode, baseUrl)
  return mapLoginStatus(dataRoot, res, baseUrl)
}

function mapLoginStatus(
  dataRoot: string,
  res: QrcodeStatusResponse,
  baseUrl: string
): LoginPollResult {
  if (res.status === 'confirmed' && res.bot_token && res.ilink_bot_id) {
    const account: WeixinAccount = {
      accountId: res.ilink_bot_id,
      token: res.bot_token,
      baseUrl: res.baseurl ?? baseUrl,
      userId: res.ilink_user_id
    }
    saveWeixinAccount(dataRoot, account)
    return { ok: true, status: res.status, account }
  }
  if (res.status === 'need_verifycode') {
    return { ok: false, status: res.status, needVerifyCode: true }
  }
  if (res.status === 'binded_redirect' && res.bot_token && res.ilink_bot_id) {
    const account: WeixinAccount = {
      accountId: res.ilink_bot_id,
      token: res.bot_token,
      baseUrl: res.baseurl ?? baseUrl,
      userId: res.ilink_user_id
    }
    saveWeixinAccount(dataRoot, account)
    return { ok: true, status: res.status, account }
  }
  return { ok: false, status: res.status }
}

export function disconnectWeixin(dataRoot: string): void {
  clearWeixinAccount(dataRoot)
}
