/**
 * /web-set — pick a SERP provider and paste a key (CLI overlay).
 */
import React from 'react'
import { Box, Text } from 'ink'
import { l } from './language.js'
import { theme } from './theme.js'
import { SetupInputLine } from './PromptLine.js'

export const WEB_SEARCH_PROVIDERS = ['tavily', 'serpapi', 'brave'] as const
export type WebSearchProviderPick = (typeof WEB_SEARCH_PROVIDERS)[number]

export type WebSearchSettingsHint = {
  provider?: string
  apiKey?: string
  customUrl?: string
}

const TUTORIAL: Record<
  WebSearchProviderPick,
  { zh: string[]; en: string[] }
> = {
  tavily: {
    zh: [
      '推荐：专为 Agent 检索设计，每月 1000 次免费额度，不需要绑卡。',
      '1. 打开 https://app.tavily.com 用 GitHub / Google / 邮箱注册并登录',
      '2. 在 Dashboard 复制一把 tvly- 开头的 API Key（可再点 + 新建）',
      '3. 把密钥粘贴到下方输入框，回车保存'
    ],
    en: [
      'Recommended for agents. 1,000 free credits / month, no credit card.',
      '1. Open https://app.tavily.com and sign up (GitHub / Google / email)',
      '2. From the Dashboard, copy a key that starts with tvly- (or click + to create one)',
      '3. Paste it below and press Enter to save'
    ]
  },
  serpapi: {
    zh: [
      '返回 Google 等搜索引擎的结构化结果，免费档有次数限制。',
      '1. 打开 https://serpapi.com/users/sign_up 注册并验证邮箱',
      '2. 登录后打开 https://serpapi.com/manage-api-key 复制 API key',
      '3. 把密钥粘贴到下方，回车保存'
    ],
    en: [
      'Structured Google (and other) SERP results. Free tier is rate-limited.',
      '1. Sign up at https://serpapi.com/users/sign_up and verify email',
      '2. Copy the key from https://serpapi.com/manage-api-key',
      '3. Paste it below and press Enter to save'
    ]
  },
  brave: {
    zh: [
      'Brave 自有索引。免费额度约 $5/月，但注册仍要绑卡（防滥用，免费档不扣费）。',
      '1. 打开 https://api-dashboard.search.brave.com/register 注册并验证邮箱',
      '2. 在 Dashboard 订阅 Search 方案 → API Keys → Add API Key',
      '3. 复制 Subscription Token，粘贴到下方回车保存'
    ],
    en: [
      'Brave’s own index. ~$5/mo free credits; a card is required (anti-fraud, not charged on free).',
      '1. Register at https://api-dashboard.search.brave.com/register',
      '2. Subscribe to Search → API Keys → Add API Key',
      '3. Paste the subscription token below and press Enter'
    ]
  }
}

export function webSearchProviderLabel(id: WebSearchProviderPick): string {
  switch (id) {
    case 'tavily':
      return 'Tavily'
    case 'serpapi':
      return 'SerpAPI'
    case 'brave':
      return 'Brave'
  }
}

export function isWebSearchConfigured(
  settings?: WebSearchSettingsHint | null
): boolean {
  if (process.env.ACKEM_WEB_SEARCH_USE_MOCK === '1') return true
  if (process.env.TAVILY_API_KEY?.trim()) return true
  if (process.env.SERPAPI_API_KEY?.trim()) return true
  if (process.env.BRAVE_API_KEY?.trim()) return true
  const key = settings?.apiKey?.trim() ?? ''
  if (key) return true
  if (settings?.customUrl?.trim()) return true
  if (settings?.provider === 'mock') return true
  return false
}

export function webSearchStatusLabel(ready: boolean, _cols: number): string {
  if (ready) {
    return l('网页搜索已就绪', 'Web search ready')
  }
  return l(
    '网页搜索请通过 /web-set 设置密钥',
    'Web search: set key with /web-set'
  )
}

export function webSearchTutorial(id: WebSearchProviderPick): string[] {
  const pack = TUTORIAL[id]
  return l(pack.zh.join('\n'), pack.en.join('\n')).split('\n')
}

export function maskWebSearchKey(raw: string): string {
  if (!raw) return ''
  return '•'.repeat(Math.min(raw.length, 32))
}

export function WebSetPanel(props: {
  index: number
  apiKey: string
  error: string
  busy: boolean
  pulse: number
  termRows: number
  chromeH: number
}): React.ReactElement {
  const id = WEB_SEARCH_PROVIDERS[props.index] ?? 'tavily'
  const lines = webSearchTutorial(id)
  const shown = maskWebSearchKey(props.apiKey)
  const errorLine = props.error ? 1 : 0
  const boxHeight = 8 + lines.length + errorLine
  const inputOffset = 5 + lines.length
  const cursorY = Math.max(
    0,
    props.termRows - props.chromeH - boxHeight + inputOffset
  )
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      flexShrink={0}
    >
      <Text color={theme.accent}>
        {l('配置网页搜索 · /web-set', 'Configure web search · /web-set')}
      </Text>
      <Text>
        {WEB_SEARCH_PROVIDERS.map((p, i) => {
          const on = i === props.index
          return (
            <Text
              key={p}
              color={on ? theme.fg : theme.fgMuted}
              backgroundColor={on ? theme.accent : undefined}
            >
              {i === 0 ? '' : ' '}
              {on ? '›' : ' '}
              {webSearchProviderLabel(p)}
              {on ? '‹' : ' '}
            </Text>
          )
        })}
      </Text>
      <Text color={theme.fgMuted}>
        {l('← → 选择引擎', '← → choose provider')}
      </Text>
      {lines.map((line) => (
        <Text key={line} color={theme.fg}>
          {line}
        </Text>
      ))}
      <Text color={theme.fgMuted}>
        {l('密钥', 'API key')}
        {id === 'tavily' ? ' (tvly-…)' : ''}
        :
      </Text>
      {props.busy ? (
        <Text color={theme.cyan}>{l('保存中…', 'Saving…')}</Text>
      ) : (
        <SetupInputLine
          value={shown}
          display={shown}
          placeholder={l('在此粘贴密钥', 'Paste key here')}
          rows={props.termRows}
          cursorY={cursorY}
          pulseTick={props.pulse}
          active
        />
      )}
      {props.error ? <Text color={theme.warning}>{props.error}</Text> : null}
      <Text color={theme.fgMuted}>
        {l(
          '回车保存 · Esc 取消 · 可拖选复制链接 · 密钥只显示圆点',
          'Enter save · Esc cancel · drag to copy URLs · key is masked'
        )}
      </Text>
    </Box>
  )
}
