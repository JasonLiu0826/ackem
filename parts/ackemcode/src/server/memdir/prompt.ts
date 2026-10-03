/**
 * System-prompt memory section — Claude Code memdir/memdir.ts buildMemoryPrompt spirit.
 */
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TYPES_SECTION_INDIVIDUAL,
  WHEN_TO_ACCESS_SECTION
} from './memoryTypes.js'
import { ENTRYPOINT_NAME } from './paths.js'

export function buildMemorySystemPromptSection(params: {
  memoryDir: string
  entrypointPath: string
  hasIndexContent: boolean
}): string {
  const { memoryDir, entrypointPath, hasIndexContent } = params
  const lines = [
    '# Auto memory',
    '',
    `You have a persistent memory directory at \`${memoryDir}\`.`,
    `The index file is \`${ENTRYPOINT_NAME}\` at \`${entrypointPath}\`.`,
    '',
    '## How memory works',
    `- \`${ENTRYPOINT_NAME}\` is a short index (≤200 lines / 25KB). Keep only titles + one-line pointers to topic files.`,
    '- Topic memories are separate `.md` files in the same directory with YAML frontmatter.',
    '- Use the Write / Edit / Read tools on paths under the memory directory (they are allowed outside the project cwd for this purpose).',
    '- After creating/updating a topic file, update the index line in MEMORY.md.',
    '- Prefer updating an existing topic over creating duplicates.',
    '',
    TYPES_SECTION_INDIVIDUAL,
    '',
    '## Frontmatter format',
    MEMORY_FRONTMATTER_EXAMPLE,
    '',
    WHEN_TO_ACCESS_SECTION,
    ''
  ]
  if (hasIndexContent) {
    lines.push(
      '## Current MEMORY.md',
      'The truncated index is also injected into the user context as `<memory_index>`. Read topic files when a link looks relevant.',
      ''
    )
  } else {
    lines.push(
      '## Current MEMORY.md',
      'The index is empty. Create topic files when you learn durable preferences, feedback, or project decisions worth keeping across sessions.',
      ''
    )
  }
  return lines.join('\n')
}

export function wrapMemoryIndexForContext(content: string): string {
  if (!content.trim()) return ''
  return [
    '<memory_index>',
    '<!-- Auto-loaded MEMORY.md (truncated). Use Read on topic paths for full content. -->',
    content.trimEnd(),
    '</memory_index>'
  ].join('\n')
}
