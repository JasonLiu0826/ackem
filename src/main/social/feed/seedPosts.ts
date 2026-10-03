import { listPosts, createPost } from '../../db/repos/friendCircleRepo'
import { getDatabase } from '../../db/database'
import { socialId } from '../types'

export function seedPosts(root: string, agents: Array<{ id: string; name: string }>): number {
  if (!getDatabase(root)) return 0
  if (listPosts(root, undefined, 1).length) return 0
  const now = new Date().toISOString()
  for (const a of agents) {
    createPost(root, {
      id: socialId('seed'),
      author_id: a.id,
      content: `我是${a.name}，很高兴在这里认识你。`,
      created_at: now,
      offline_generated: 0,
      content_source: 'template',
    })
  }
  return agents.length
}
