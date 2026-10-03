import type { EffortLevel } from '../../../shared/types.js'
import { getURLMarkdownContent, MAX_MARKDOWN_LENGTH, validateURL } from './fetchUrl.js'
import { extractInstallableLinks, formatExtractedLinks } from './extractLinks.js'

export { validateURL, getURLMarkdownContent, clearWebFetchCache } from './fetchUrl.js'
export { extractInstallableLinks, formatExtractedLinks } from './extractLinks.js'

export type WebFetchLlm = {
  apiBaseUrl: string
  apiKey: string
  model: string
  effort: EffortLevel
}

const JSON_API_MAX_EXCERPT = 12_000

function unwrapJsonFence(text: string): string {
  const m = text.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i)
  return m ? m[1] : text
}

function isJsonApiResponse(contentType: string, content: string): boolean {
  if (contentType.toLowerCase().includes('application/json')) return true
  const t = content.trimStart()
  return t.startsWith('```json') || t.startsWith('{') || t.startsWith('[')
}

/** Avoid a second LLM pass on huge API JSON (e.g. GitHub search) — keeps turns fast. */
function compactJsonApiForAgent(content: string): string {
  const raw = unwrapJsonFence(content)
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const items = data.items
    if (Array.isArray(items)) {
      const total =
        typeof data.total_count === 'number' ? data.total_count : items.length
      const lines = items.slice(0, 20).map((item) => {
        const r = item as Record<string, unknown>
        const name = String(r.full_name ?? r.name ?? r.login ?? '?')
        const desc = String(r.description ?? r.bio ?? '').slice(0, 160)
        const url = String(r.html_url ?? r.url ?? '')
        return url ? `- ${name}: ${desc || '(no description)'} — ${url}` : `- ${name}: ${desc}`
      })
      return [
        `JSON API (${total} total, showing ${lines.length}):`,
        ...lines,
        items.length > 20 ? '…[more items omitted]' : ''
      ]
        .filter(Boolean)
        .join('\n')
    }
    if (typeof data.login === 'string') {
      const login = data.login
      const bio = String(data.bio ?? '').slice(0, 300)
      const url = String(data.html_url ?? '')
      const repos =
        typeof data.public_repos === 'number' ? data.public_repos : undefined
      return [
        `GitHub user: ${login}`,
        url,
        bio ? `Bio: ${bio}` : '',
        repos != null ? `Public repos: ${repos}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    }
  } catch {
    /* fall through to truncate */
  }
  return (
    raw.slice(0, JSON_API_MAX_EXCERPT) +
    (raw.length > JSON_API_MAX_EXCERPT ? '\n…[truncated JSON]' : '')
  )
}

function makeSecondaryPrompt(markdown: string, prompt: string): string {
  return `Web page content:
---
${markdown.slice(0, MAX_MARKDOWN_LENGTH)}
---

${prompt}

Provide a concise response based only on the content above.
- Prefer quoting ≤125 characters when citing.
- Also list any GitHub repos, .zip downloads, or SKILL.md URLs useful for installing an agent skill.`
}

async function applyPromptWithLlm(
  markdown: string,
  prompt: string,
  llm: WebFetchLlm,
  signal?: AbortSignal
): Promise<string> {
  if (!llm.apiKey?.trim()) {
    return (
      markdown.slice(0, 12_000) +
      (markdown.length > 12_000 ? '\n…[truncated — set API key for prompt extraction]' : '')
    )
  }
  const base = llm.apiBaseUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [
        {
          role: 'user',
          content: makeSecondaryPrompt(markdown, prompt)
        }
      ],
      temperature: 0.2,
      max_tokens: 2048
    }),
    signal
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return `Fetch OK but secondary extraction failed (HTTP ${res.status}). Raw excerpt:\n\n${markdown.slice(0, 8000)}\n\n${body.slice(0, 400)}`
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  return data.choices?.[0]?.message?.content?.trim() || markdown.slice(0, 8000)
}

export async function runWebFetch(opts: {
  url: string
  prompt?: string
  llm?: WebFetchLlm
  signal?: AbortSignal
}): Promise<{ ok: boolean; output: string }> {
  const start = Date.now()
  const prompt =
    opts.prompt?.trim() ||
    'Summarize this page. Extract any installable skill sources (GitHub owner/repo, zip, SKILL.md).'

  try {
    const response = await getURLMarkdownContent(opts.url, opts.signal)

    if (response.type === 'redirect') {
      const statusText =
        response.statusCode === 301
          ? 'Moved Permanently'
          : response.statusCode === 308
            ? 'Permanent Redirect'
            : response.statusCode === 307
              ? 'Temporary Redirect'
              : 'Found'
      return {
        ok: true,
        output: [
          'REDIRECT DETECTED: The URL redirects to a different host.',
          '',
          `Original URL: ${response.originalUrl}`,
          `Redirect URL: ${response.redirectUrl}`,
          `Status: ${response.statusCode} ${statusText}`,
          '',
          'Call web_fetch again with the Redirect URL to continue.'
        ].join('\n')
      }
    }

    const links = extractInstallableLinks(response.content, response.finalUrl)
    const jsonApi = isJsonApiResponse(response.contentType, response.content)
    let result: string
    if (jsonApi) {
      result = compactJsonApiForAgent(response.content)
    } else if (opts.llm) {
      result = await applyPromptWithLlm(response.content, prompt, opts.llm, opts.signal)
    } else {
      result = response.content.slice(0, 12_000)
    }

    const durationMs = Date.now() - start
    return {
      ok: true,
      output: [
        `URL: ${response.finalUrl}`,
        `HTTP ${response.code} ${response.codeText} · ${response.bytes} bytes · ${durationMs}ms · ${response.contentType}`,
        '',
        '----- EXTRACTED / SUMMARY -----',
        result,
        '',
        '----- INSTALLABLE LINKS -----',
        formatExtractedLinks(links)
      ].join('\n')
    }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
}

/** Fetch a page and return ranked install candidates for install_skill. */
export async function discoverSkillInstallSpecs(
  pageUrl: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; specs: string[]; markdownExcerpt: string; error?: string }> {
  try {
    const response = await getURLMarkdownContent(pageUrl, signal)
    if (response.type === 'redirect') {
      return {
        ok: false,
        specs: [],
        markdownExcerpt: '',
        error: `Cross-host redirect to ${response.redirectUrl} — web_fetch that URL first`
      }
    }
    const links = extractInstallableLinks(response.content, response.finalUrl)
    const specs = links.map((l) => {
      if (l.kind === 'github') {
        try {
          const u = new URL(l.href)
          const parts = u.pathname.split('/').filter(Boolean)
          if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
        } catch {
          /* fallthrough */
        }
      }
      return l.href
    })
    return {
      ok: true,
      specs: [...new Set(specs)],
      markdownExcerpt: response.content.slice(0, 4000)
    }
  } catch (e) {
    return {
      ok: false,
      specs: [],
      markdownExcerpt: '',
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
