export const MAX_REPOSITORY_QUERY_LIMIT = 200

export function clampQueryLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1
  return Math.min(Math.floor(limit), MAX_REPOSITORY_QUERY_LIMIT)
}
