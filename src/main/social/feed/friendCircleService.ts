import { createPost, listPosts, type FriendCirclePost } from '../../db/repos/friendCircleRepo'
import { getBlock } from '../../db/repos/userBlocksRepo'

export type FeedMode = 'friends' | 'plaza'

export function getFeed(
  root: string,
  friendIds: string[],
  limit = 50
): { posts: FriendCirclePost[]; mode: FeedMode } {
  const raw = listPosts(root, undefined, limit * 3)
  const notMuted = (authorId: string) => getBlock(root, authorId)?.block_type !== 'mute'

  if (friendIds.length === 0) {
    // Cold start: plaza preview so seed / offline posts are visible before friending
    return {
      mode: 'plaza',
      posts: raw.filter((p) => notMuted(p.author_id)).slice(0, limit),
    }
  }

  return {
    mode: 'friends',
    posts: raw
      .filter((p) => friendIds.includes(p.author_id) && notMuted(p.author_id))
      .slice(0, limit),
  }
}

export { createPost, listPosts }
