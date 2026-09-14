/**
 * Memory type taxonomy — Claude Code memdir/memoryTypes.ts (individual mode).
 */

export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== 'string') return undefined
  return MEMORY_TYPES.find((t) => t === raw)
}

export const WHAT_NOT_TO_SAVE_SECTION = [
  '## What NOT to save',
  '- Code patterns, architecture, or file structure you can re-derive with grep/git/CLAUDE.md',
  '- Git history / blame facts',
  '- Debugging recipes already fixed in code',
  '- Anything already documented in project instructions',
  '- Ephemeral task/session state (current todos, temporary plans)',
  '- Secrets, API keys, tokens, passwords, private keys — never write these'
].join('\n')

export const TYPES_SECTION_INDIVIDUAL = [
  '## Types of memory',
  '',
  'Use exactly one of these `type:` values in frontmatter:',
  '',
  '- **user** — role, goals, preferences, knowledge level (private)',
  '- **feedback** — corrections and validated approaches; include **Why:** and **How to apply:**',
  '- **project** — non-code project context (deadlines, decisions, stakeholders); prefer absolute dates',
  '- **reference** — pointers to external systems (Linear, Slack, dashboards)',
  '',
  WHAT_NOT_TO_SAVE_SECTION
].join('\n')

export const MEMORY_FRONTMATTER_EXAMPLE = [
  '```markdown',
  '---',
  'name: {{memory name}}',
  'description: {{one-line description — used for relevance}}',
  `type: {{${MEMORY_TYPES.join(', ')}}}`,
  '---',
  '',
  '{{content — for feedback/project: fact, then **Why:** and **How to apply:**}}',
  '```'
].join('\n')

export const WHEN_TO_ACCESS_SECTION = [
  '## When to access memories',
  '- When memories seem relevant, or the user references prior-conversation work.',
  '- You MUST access memory when the user explicitly asks you to check, recall, or remember.',
  '- If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty.',
  '- Memory can become stale. Verify file/function claims with tools before acting on them.'
].join('\n')
