// [desktop-agent/adapters] — 平台执行器分发
// macOS 走 darwin 适配器，其余平台走 win 适配器（当前仅这两套实现）。
import type { DesktopAgentAction, UseComputerArgs } from '../../../shared/desktopAgent'
import type { ExecuteResult } from './win/executor'
import { executeDesktopAgentAction as winExecute } from './win/executor'
import { executeDesktopAgentAction as darwinExecute } from './darwin/executor'

export type { ExecuteResult }

export async function executeDesktopAgentAction(
  action: DesktopAgentAction,
  args: UseComputerArgs,
  ctx: { dataRoot: string; downloadDir?: string; cwd: string }
): Promise<ExecuteResult> {
  if (process.platform === 'darwin') return darwinExecute(action, args, ctx)
  return winExecute(action, args, ctx)
}
