export type ToolMediaPart = {
  kind: 'image' | 'pdf'
  mime: string
  base64: string
  label?: string
}

export type FileToolResult = {
  ok: boolean
  output: string
  media?: ToolMediaPart[]
}
