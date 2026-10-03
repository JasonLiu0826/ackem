/**
 * withAgentContext — 当前引擎身份（AsyncLocalStorage）
 * ingest / 检索靠 getCurrentAgentId 填 owner_agent_id；
 * 可选 interactionSurface 供 fact / retriever 显式溯源
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { InteractionSurface } from '../../memory/provenance'
import { PRIMARY_AGENT_ID } from './agentPaths'

type AgentStore = {
  agentId: string
  interactionSurface?: InteractionSurface
}

export type AgentContextOpts = {
  interactionSurface?: InteractionSurface
}

const als = new AsyncLocalStorage<AgentStore>()

export async function withAgentContext<T>(
  agentId: string,
  fn: () => Promise<T>,
  opts?: AgentContextOpts
): Promise<T> {
  return als.run({ agentId, interactionSurface: opts?.interactionSurface }, fn)
}

export function getCurrentAgentId(): string {
  return als.getStore()?.agentId ?? PRIMARY_AGENT_ID
}

export function getCurrentInteractionSurface(): InteractionSurface | undefined {
  return als.getStore()?.interactionSurface
}

export function runWithAgentContextSync<T>(
  agentId: string,
  fn: () => T,
  opts?: AgentContextOpts
): T {
  return als.run({ agentId, interactionSurface: opts?.interactionSurface }, fn)
}
