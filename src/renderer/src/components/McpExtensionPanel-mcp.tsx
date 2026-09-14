import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  McpStdioConfigFile,
  McpStdioRuntimeStatus,
  McpStdioServerConfig,
  McpStdioTestResult,
  McpToolDescriptor
} from '../../../shared/mcp'
import { parseMcpConfigText } from '../../../shared/mcp'

type ServerOption = {
  name: string
  config: McpStdioServerConfig
}

function formatArgs(args?: string[]): string {
  return args && args.length > 0 ? args.join(' ') : '无参数'
}

function runtimeTone(state?: string): string {
  if (state === 'running') return 'bg-accent/20 text-accent'
  if (state === 'error') return 'bg-red-500/10 text-red-300'
  return 'bg-surface-inset text-ink-muted'
}

function runtimeLabel(state?: string): string {
  if (state === 'running') return '运行中'
  if (state === 'error') return '异常'
  if (state === 'stopped') return '已停止'
  return '未连接'
}

function enabledTone(enabled: boolean): string {
  return enabled ? 'extension-badge-openforu' : 'bg-surface-inset text-ink-muted'
}

function stringifyConfig(config: McpStdioConfigFile): string {
  return `${JSON.stringify(config, null, 2)}\n`
}

export function McpExtensionPanel(): JSX.Element {
  const [configText, setConfigText] = useState('')
  const [status, setStatus] = useState<McpStdioRuntimeStatus | null>(null)
  const [tools, setTools] = useState<McpToolDescriptor[]>([])
  const [busyServer, setBusyServer] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ name: string; result: McpStdioTestResult } | null>(null)

  const parsed = useMemo((): { config: McpStdioConfigFile | null; error: string | null } => {
    try {
      return { config: parseMcpConfigText(configText), error: null }
    } catch (e) {
      return { config: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [configText])

  const servers = useMemo<ServerOption[]>(() => {
    if (!parsed.config) return []
    return Object.entries(parsed.config.mcpServers)
      .map(([name, config]) => ({ name, config }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [parsed.config])

  const statusByName = useMemo(() => {
    return new Map((status?.servers ?? []).map((server) => [server.name, server]))
  }, [status])

  const toolsByServer = useMemo(() => {
    const map = new Map<string, McpToolDescriptor[]>()
    for (const tool of tools) {
      const list = map.get(tool.serverName) ?? []
      list.push(tool)
      map.set(tool.serverName, list)
    }
    return map
  }, [tools])

  const runningServerCount = useMemo(
    () => (status?.servers ?? []).filter((server) => server.state === 'running').length,
    [status]
  )

  const refresh = useCallback(async () => {
    setError(null)
    const [config, runtime, toolList] = await Promise.all([
      window.ackem.mcp.readConfigText(),
      window.ackem.mcp.getRuntimeStatus(),
      window.ackem.mcp.listTools()
    ])
    setConfigText(config.text)
    setStatus(runtime)
    setTools(toolList)
  }, [])

  useEffect(() => {
    void refresh().catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [refresh])

  const restartAll = async () => {
    setBusyServer('__all__')
    setError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const result = await window.ackem.mcp.applyAndRestart()
      await refresh()
      setNotice(`已重新加载 MCP：启动 ${result.started.length}，跳过 ${result.skipped.length}，失败 ${result.failed.length}。`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyServer(null)
    }
  }

  const setServerEnabled = async (name: string, enabled: boolean) => {
    if (!parsed.config) return
    setBusyServer(name)
    setError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const next: McpStdioConfigFile = {
        mcpServers: {
          ...parsed.config.mcpServers,
          [name]: {
            ...parsed.config.mcpServers[name],
            enabled
          }
        }
      }
      await window.ackem.mcp.writeConfigText(stringifyConfig(next))
      const result = await window.ackem.mcp.applyAndRestart()
      await refresh()
      const failed = result.failed.find((item) => item.name === name)
      setNotice(
        failed
          ? `${name} 已保存，但启动失败：${failed.error}`
          : `${name} 已${enabled ? '启用' : '关闭'}。`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyServer(null)
    }
  }

  const testServer = async (server: ServerOption) => {
    setBusyServer(server.name)
    setError(null)
    setNotice(null)
    setTestResult(null)
    try {
      const result = await window.ackem.mcp.testServer(server)
      setTestResult({ name: server.name, result })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyServer(null)
    }
  }

  const openConfig = async () => {
    setError(null)
    setNotice(null)
    try {
      await window.ackem.mcp.openConfigFile()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      <div className="glass-panel overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-glass-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">MCP 服务</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <span>{servers.length} 个服务</span>
              <span className="text-glass-border">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${runningServerCount > 0 ? 'bg-accent' : 'bg-ink-muted/50'}`} />
                {runningServerCount} 个运行中
              </span>
              <span className="text-glass-border">·</span>
              <span>{tools.length} 个工具</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-lg border border-glass-border px-3 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void refresh()}
              disabled={busyServer != null}
            >
              刷新
            </button>
            <button
              type="button"
              className="h-9 rounded-lg border border-glass-border px-3 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void openConfig()}
              disabled={busyServer != null}
            >
              服务目录
            </button>
            <button
              type="button"
              className="chat-send-btn h-9 px-4 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void restartAll()}
              disabled={busyServer != null || parsed.config == null}
            >
              重载 MCP
            </button>
          </div>
        </div>

        {notice ? <p className="mt-4 rounded-xl border border-accent/15 bg-accent/10 px-3.5 py-2.5 text-xs text-accent/90">{notice}</p> : null}
        {error || parsed.error ? (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error ?? `mcp.json 解析失败：${parsed.error}`}
          </p>
        ) : null}

        {servers.length === 0 && !parsed.error ? (
          <div className="mt-5 rounded-2xl border border-dashed border-surface-inset/80 px-4 py-10 text-center">
            <p className="text-sm text-ink-muted">还没有添加 MCP 服务。</p>
            <p className="mt-1 text-xs text-ink-muted">将服务放入 MCP 服务目录后，还需要在内部服务清单中注册启动命令。</p>
          </div>
        ) : null}

        {servers.length > 0 ? (
          <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
            {servers.map((server) => {
              const runtime = statusByName.get(server.name)
              const enabled = server.config.enabled !== false
              const serverTools = toolsByServer.get(server.name) ?? []
              const testing = testResult?.name === server.name ? testResult.result : null
              const busy = busyServer === server.name || busyServer === '__all__'

              return (
                <div key={server.name} className="rounded-xl border border-glass-border/60 bg-surface-inset/15 p-4 transition-colors hover:border-accent/25">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{server.name}</p>
                      <p className="mt-1 truncate text-[11px] text-ink-muted">
                        {server.config.command} {formatArgs(server.config.args)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${enabledTone(enabled)}`}>
                        {enabled ? '已启用' : '已关闭'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${runtimeTone(runtime?.state)}`}>
                        {runtimeLabel(runtime?.state)}
                      </span>
                    </div>
                  </div>

                  {server.config.cwd ? (
                    <p className="mt-2 truncate text-[11px] text-ink-muted">cwd · {server.config.cwd}</p>
                  ) : null}

                  {runtime?.lastError ? (
                    <p className="mt-3 line-clamp-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                      {runtime.lastError}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                    <span>工具 {serverTools.length}</span>
                    {runtime?.pid ? <span>PID {runtime.pid}</span> : null}
                  </div>

                  {serverTools.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {serverTools.slice(0, 5).map((tool) => (
                        <span key={tool.name} className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] text-ink-muted">
                          {tool.toolName}
                        </span>
                      ))}
                      {serverTools.length > 5 ? (
                        <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] text-ink-muted">
                          +{serverTools.length - 5}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {testing ? (
                    <div className="mt-3 rounded-xl border border-surface-inset/60 bg-surface-inset/20 px-3 py-2 text-xs">
                      <p className={testing.ok ? 'text-accent' : 'text-red-200'}>
                        {testing.ok ? `测试通过 · ${testing.durationMs}ms` : `测试失败 · ${testing.durationMs}ms`}
                      </p>
                      {testing.error ? <p className="mt-1 line-clamp-3 text-red-200">{testing.error}</p> : null}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-glass-border/50 pt-3.5">
                    <button
                      type="button"
                      className="chat-send-btn px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void setServerEnabled(server.name, !enabled)}
                      disabled={busy}
                    >
                      {enabled ? '关闭' : '启用'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void testServer(server)}
                      disabled={busy}
                    >
                      测试
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
