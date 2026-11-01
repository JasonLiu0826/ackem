export {
  SHELL_DEFAULT_TIMEOUT_MS,
  SHELL_MAX_TIMEOUT_MS,
  SHELL_MAX_OUTPUT_CHARS,
  resolveShellTimeoutMs,
  truncateShellOutput,
  destructiveShellWarning,
  isBenignNonZeroExit
} from './limits.js'
export { runShellTool } from './runShell.js'
