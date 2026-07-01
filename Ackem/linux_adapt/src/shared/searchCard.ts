export interface WebSearchHit { title: string; url: string; snippet: string }
export interface SearchCardPayload {
  query: string
  /** UI 展示用短标题；缺省时用 query */
  displayTitle?: string
  sources: WebSearchHit[]
  cardBody: string
  copyText: string
  mode?: 'knowledge' | 'plan' | 'search'
  error?: string
}
