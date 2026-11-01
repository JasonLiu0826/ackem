import { describe, expect, it } from 'vitest'
import { flattenMessageContent } from './messageContent'

describe('flattenMessageContent', () => {
  it('字符串原样返回', () => {
    expect(flattenMessageContent('在吗')).toBe('在吗')
  })

  it('多模态片段只留文字与图片占位，绝不带 base64', () => {
    const parts = [
      { type: 'text', text: '[图]' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/AAAA' } }
    ]
    const out = flattenMessageContent(parts)
    expect(out).toContain('[图]')
    expect(out).toContain('[图片]')
    expect(out).not.toContain('base64')
    expect(out).not.toContain('image_url')
  })

  it('空值与畸形输入不抛错', () => {
    expect(flattenMessageContent(null)).toBe('')
    expect(flattenMessageContent(undefined)).toBe('')
    expect(flattenMessageContent([{ foo: 1 }])).toBe('')
  })
})
