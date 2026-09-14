import { ipcMain } from 'electron'
import type { McpStdioManager } from '../mcp/stdioManager-mcp'
import type { McpCallToolPayload, McpStdioTestPayload } from '../../shared/mcp'

export function registerMcpIpc(manager: McpStdioManager): void {
  ipcMain.handle('mcp:openConfigFile', () => manager.openConfigFile())
  ipcMain.handle('mcp:applyAndRestart', () => manager.applyAndRestart())
  ipcMain.handle('mcp:getRuntimeStatus', () => manager.getRuntimeStatus())
  ipcMain.handle('mcp:listTools', () => manager.listTools())
  ipcMain.handle('mcp:callTool', (_event, payload: McpCallToolPayload) => manager.callTool(payload))
  ipcMain.handle('mcp:readConfigText', () => manager.readConfigText())
  ipcMain.handle('mcp:writeConfigText', (_event, text: string) => manager.writeConfigText(text))
  ipcMain.handle('mcp:testServer', (_event, payload: McpStdioTestPayload) => manager.testServer(payload))
}
