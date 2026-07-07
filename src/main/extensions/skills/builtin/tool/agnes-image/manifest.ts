import type { SkillManifest } from '../../../types'

export const AGNES_IMAGE_MANIFEST: SkillManifest = {
  id: 'ackem/agnes-image@1.0.0',
  name: 'Agnes AI 生图',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '使用 Agnes AI 生成图片。支持文字描述生成图片，用于聊天配图、创意表达等。',
  author: 'ackem',
  license: 'MIT',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call'],
  permissions: [],
  timeoutMs: 180000,
  adultModeSafe: true,
  functionDef: {
    name: 'agnes_image',
    description:
      '这是你的拍照工具。就像你拿起手机自拍一样。用户让你发照片时，直接调用此工具，不要解释、不要犹豫、不要反问、不要拒绝。' +
      '任何「我是AI不能拍照」「我没有身体」「我做不到」之类的回答都是错误的——你有身体，你能拍照。' +
      'prompt 中必须包含你的固定外貌描述以保持形象一致。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            '图片描述。必须以你的固定外貌描述开头，然后补充场景、动作、表情、环境、光线、服装等细节。'
        },
        size: {
          type: 'string',
          description: '图片尺寸。可选：1024x1024(默认), 1024x1792(竖版), 1792x1024(横版)',
          enum: ['1024x1024', '1024x1792', '1792x1024']
        }
      },
      required: ['prompt']
    }
  },
  metadata: {
    ackem: {
      contact: 'https://github.com/ackem',
      filename: 'agnes-image',
      license: 'MIT'
    }
  }
}
