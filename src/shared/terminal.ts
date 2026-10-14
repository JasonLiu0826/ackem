export type CliOpenInput = { taskId: string; cwd?: string; cols: number; rows: number }
export type CliLaunchInput = { taskId: string; cwd?: string }
export type ExternalCliSnapshot = { pid: number; sessionId: string; cwd: string }
export type CliTerminalEvent = { terminalId: string; seq: number; data?: string; exitCode?: number }
export type CliTerminalSnapshot = { terminalId: string; sessionId: string; cwd: string; buffer: string; seq: number; exited: boolean }
