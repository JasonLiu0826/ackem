import type { McpStdioManager } from './stdioManager-mcp'

let manager: McpStdioManager | null = null

export function setMcpStdioManager(next: McpStdioManager | null): void {
  manager = next
}

export function getMcpStdioManager(): McpStdioManager | null {
  return manager
}
