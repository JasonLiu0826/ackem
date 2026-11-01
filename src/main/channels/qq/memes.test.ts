// 表情包库的合并 / 归类 / 挑选单测
//
// 这里不读真实图片内容：scanDir 只看扩展名和文件大小，
// 所以用几字节的假文件就能覆盖目录合并与情绪归类逻辑。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// memes.ts 会从 electron 取打包后的资源路径；单测里给个空壳即可
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

const { clearMemeCache, inferMoodFromName, isStickerRequest, pickMeme, requestedMemeMood, scanMemeRoots } =
  await import('./memes')

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  clearMemeCache()
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ackem-qq-memes-'))
  tempRoots.push(root)
  return root
}

/** 写一张假表情包：scanDir 只校验扩展名与大小 */
function fakeMeme(dir: string, name: string, bytes = 16): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), Buffer.alloc(bytes, 1))
}

describe('inferMoodFromName', () => {
  it('按文件名里的语义猜情绪', () => {
    expect(inferMoodFromName('撒娇求抱抱')).toBe('love')
    expect(inferMoodFromName('摸摸头')).toBe('warm')
    expect(inferMoodFromName('委屈巴巴')).toBe('sad')
    expect(inferMoodFromName('哈哈哈笑死')).toBe('playful')
    expect(inferMoodFromName('比心')).toBe('love')
    expect(inferMoodFromName('随便吧')).toBe('neutral')
  })
})

describe('scanMemeRoots', () => {
  it('目录名是合法情绪时以目录为准，否则回退到文件名', () => {
    const root = tempRoot()
    fakeMeme(join(root, 'love'), '亲亲.png')
    fakeMeme(join(root, 'packs', '合集'), '生气.jpg')

    const entries = scanMemeRoots([root])
    const byId = new Map(entries.map((e) => [e.id, e]))

    expect(byId.get('love/亲亲')?.mood).toBe('love')
    expect(byId.get('annoyed/生气')?.mood).toBe('annoyed')
  })

  it('多个根目录合并，先出现的优先且同 id 去重', () => {
    const userRoot = tempRoot()
    const bundledRoot = tempRoot()
    fakeMeme(join(bundledRoot, 'love'), '撒娇.png')
    fakeMeme(join(bundledRoot, 'love'), '比心.png')
    fakeMeme(join(userRoot, 'love'), '撒娇.png')

    const entries = scanMemeRoots([userRoot, bundledRoot])
    const hits = entries.filter((e) => e.id === 'love/撒娇')

    expect(hits).toHaveLength(1)
    // 用户目录排在前面，所以命中的是用户那份
    expect(hits[0].path.startsWith(userRoot)).toBe(true)
    expect(entries.some((e) => e.id === 'love/比心')).toBe(true)
  })

  it('跳过隐藏目录、超大文件与非图片', () => {
    const root = tempRoot()
    fakeMeme(join(root, '.cache'), '隐藏.png')
    fakeMeme(join(root, 'love'), '说明.txt')
    fakeMeme(join(root, 'love'), '超大.png', 5 * 1024 * 1024)

    expect(scanMemeRoots([root])).toHaveLength(0)
  })
})

describe('pickMeme', () => {
  it('优先同情绪，池空时退到邻近情绪', () => {
    const root = tempRoot()
    fakeMeme(join(root, 'shy'), '害羞.png')
    const entries = scanMemeRoots([root])

    // shy 池里有图，直接命中
    expect(pickMeme({ dataRoot: root, mood: 'shy', rng: () => 0, entries })?.id).toBe('shy/害羞')
    // love 池为空，按邻近关系退到 shy
    expect(pickMeme({ dataRoot: root, mood: 'love', rng: () => 0, entries })?.id).toBe('shy/害羞')
  })

  it('exclude 里出现过的图不会再被抽到', () => {
    const root = tempRoot()
    fakeMeme(join(root, 'love'), '撒娇.png')
    fakeMeme(join(root, 'love'), '比心.png')
    const entries = scanMemeRoots([root])

    const picked = pickMeme({
      dataRoot: root,
      mood: 'love',
      rng: () => 0,
      exclude: ['love/撒娇'],
      entries
    })
    expect(picked?.id).toBe('love/比心')
  })
})

describe('isStickerRequest', () => {
  it('认得出「要表情包」的各种说法', () => {
    expect(isStickerRequest('给我发个表情包')).toBe(true)
    expect(isStickerRequest('来张图')).toBe(true)
    expect(isStickerRequest('有没有可爱表情包')).toBe(true)
    expect(isStickerRequest('来斗图')).toBe(true)
  })

  it('闲聊里提到表情包不算在要', () => {
    expect(isStickerRequest('你发的表情包好好笑')).toBe(false)
    expect(isStickerRequest('今天好累')).toBe(false)
  })
})

describe('requestedMemeMood', () => {
  it('按点名要的情绪挑池子', () => {
    expect(requestedMemeMood('发个生气的表情包')).toBe('annoyed')
    expect(requestedMemeMood('来个可爱的表情包')).toBe('shy')
    expect(requestedMemeMood('发个委屈的')).toBe('sad')
    expect(requestedMemeMood('发个搞笑的')).toBe('playful')
  })

  it('没点名就交给情绪状态机', () => {
    expect(requestedMemeMood('发个表情包')).toBeNull()
    expect(requestedMemeMood('你发的表情包好好笑')).toBeNull()
  })
})
