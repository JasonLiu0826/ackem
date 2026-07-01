import QRCode from 'qrcode'

/** iLink 返回的 qrcode_img_content 是扫码链接，不是图片；转为可在 <img> 使用的 data URL */
export async function toWeixinQrDataUrl(content: string): Promise<string> {
  const raw = content.trim()
  if (!raw) throw new Error('empty qrcode content')

  if (raw.startsWith('data:image/')) return raw

  if (/^iVBOR/i.test(raw) || /^\/9j\//i.test(raw)) {
    const mime = /^\/9j\//i.test(raw) ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${raw}`
  }

  // 常见：https://weixin.qq.com/q/... — 编码成二维码供手机扫描
  return QRCode.toDataURL(raw, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#000000', light: '#ffffff' }
  })
}
