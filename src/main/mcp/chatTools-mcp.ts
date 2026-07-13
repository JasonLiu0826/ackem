import type { McpCallToolResult } from '../../shared/mcp'
import { getMcpStdioManager } from './runtime-mcp'

export const MCP_LIST_TOOLS_NAME = 'mcp_list_tools'
export const MCP_CALL_TOOL_NAME = 'mcp_call_tool'

export function mcpOpenAiTools(): unknown[] {
  return [
    {
      type: 'function' as const,
      function: {
        name: MCP_LIST_TOOLS_NAME,
        description:
          'List currently available MCP tools. Call this before mcp_call_tool to discover names in "<serverName>::<toolName>" format.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function' as const,
      function: {
        name: MCP_CALL_TOOL_NAME,
        description:
          'Call a discovered MCP tool by name. Use mcp_list_tools first. Arguments must be a JSON object encoded as a string.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'MCP tool name in "<serverName>::<toolName>" format'
            },
            arguments: {
              type: 'string',
              description: 'JSON object string of tool arguments, for example {"query":"hello"}'
            }
          },
          required: ['name', 'arguments']
        }
      }
    }
  ]
}

export function mcpAnthropicTools(): Array<{
  name: string
  description: string
  input_schema: Record<string, unknown>
}> {
  return [
    {
      name: MCP_LIST_TOOLS_NAME,
      description:
        'List currently available MCP tools. Call this before mcp_call_tool to discover names in "<serverName>::<toolName>" format.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: MCP_CALL_TOOL_NAME,
      description:
        'Call a discovered MCP tool by name. Use mcp_list_tools first. Arguments must be a JSON object encoded as a string.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'MCP tool name in "<serverName>::<toolName>" format'
          },
          arguments: {
            type: 'string',
            description: 'JSON object string of tool arguments, for example {"query":"hello"}'
          }
        },
        required: ['name', 'arguments']
      }
    }
  ]
}

export function isMcpToolName(name: string | undefined): boolean {
  return name === MCP_LIST_TOOLS_NAME || name === MCP_CALL_TOOL_NAME
}

function stringifyMcpContent(result: McpCallToolResult): string {
  const parts: string[] = []
  if (result.content?.length) {
    for (const item of result.content) {
      if (item.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text)
      } else {
        parts.push(JSON.stringify(item))
      }
    }
  }
  if (result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent, null, 2))
  }
  if (result.toolResult !== undefined) {
    parts.push(typeof result.toolResult === 'string' ? result.toolResult : JSON.stringify(result.toolResult, null, 2))
  }
  if (!parts.length) return result.isError ? 'MCP tool returned an error.' : 'MCP tool completed with no content.'
  return parts.join('\n\n')
}

export async function executeMcpToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  const manager = getMcpStdioManager()
  if (!manager) return 'MCP runtime is not available.'

  if (toolName === MCP_LIST_TOOLS_NAME) {
    const tools = await manager.listTools()
    if (!tools.length) return 'No MCP tools are currently available.'
    return JSON.stringify(
      tools.map((tool) => ({
        name: tool.name,
        serverName: tool.serverName,
        toolName: tool.toolName,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema
      })),
      null,
      2
    )
  }

  if (toolName === MCP_CALL_TOOL_NAME) {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    if (!name) return 'MCP tool name is required.'
    const rawArgs = typeof args.arguments === 'string' ? args.arguments.trim() : '{}'
    let parsedArgs: Record<string, unknown>
    try {
      const parsed = rawArgs ? JSON.parse(rawArgs) : {}
      parsedArgs = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch (error) {
      return `Invalid MCP tool arguments JSON: ${error instanceof Error ? error.message : String(error)}`
    }
    const result = await manager.callTool({ name, arguments: parsedArgs })
    return stringifyMcpContent(result)
  }

  return null
}
