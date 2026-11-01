// [qq] — 表情包库
//
// 参考大肥鱼 meme_manager 的做法：表情包不是每条都发，而是按概率「触发」，
// 由情绪与人格倾向决定命中率（约三条回复一张图是它的出厂值）。
//
// QQ 相比微信的关键优势：OneBot 支持直接发本地图片 / base64，
// 不需要先上传到任何 CDN，所以这里可以做得比微信渠道简单得多。
//
// 图片有两个来源：
//   ① 随程序分发的内置包 assets/qq-memes（开箱即用的可爱 / 撒娇热梗包）；
//   ② 用户目录 {dataRoot}/qq-memes，可随时丢图或整包导入，优先级更高。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { app } from 'electron'
import { createLogger } from '../../logger'

const log = createLogger('qq-memes')

/** 单张图上限：base64 会膨胀约 1.37 倍，控制在 NapCat 能稳定处理的范围内 */
const MAX_MEME_BYTES = 4 * 1024 * 1024
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

export type MemeMood =
  | 'playful'
  | 'tease'
  | 'warm'
  | 'shy'
  | 'annoyed'
  | 'cold'
  | 'hype'
  | 'sad'
  | 'love'
  | 'neutral'

export type MemeEntry = {
  id: string
  mood: MemeMood
  path: string
  bytes: number
}

type Library = {
  root: string
  bundled: string | null
  entries: MemeEntry[]
  loadedAt: number
}

let cache: Library | null = null
/** 目录扫描结果缓存时长：用户可能随时往里丢图，不做长期缓存 */
const CACHE_TTL_MS = 60_000

const MOODS = new Set<string>([
  'playful',
  'tease',
  'warm',
  'shy',
  'annoyed',
  'cold',
  'hype',
  'sad',
  'love',
  'neutral'
])

/** 目录名是否本身就是合法情绪标签 */
function isMoodName(name: string): boolean {
  return MOODS.has(name.trim().toLowerCase())
}

/**
 * 从文件名猜情绪。
 * 中文表情包文件名普遍带语义（「笑死」「无语」「生气」），
 * 而用户整包导入时目录名往往只是合集名（如 chinesebqb），
 * 这时靠文件名分类，比全部塞进 neutral 强得多。
 */
export function inferMoodFromName(name: string): MemeMood {
  const n = name.toLowerCase()
  if (/哭|难过|委屈|泪|丧|累|崩|唉/.test(n)) return 'sad'
  if (/爱|亲|抱|心|喜欢|么么|比心|馋/.test(n)) return 'love'
  if (/气|怒|滚|打|揍|凶|不爽|鄙视|不屑/.test(n)) return 'annoyed'
  if (/羞|脸红|害|乖|可爱|萌/.test(n)) return 'shy'
  if (/笑|哈哈|草|乐|逗|沙雕|emmm|hhh|吐舌/.test(n)) return 'playful'
  if (/无语|冷漠|黑|静|盯|白眼|拒绝/.test(n)) return 'cold'
  if (/燃|冲|牛|强|赞|胜利|起飞|加油/.test(n)) return 'hype'
  if (/撩|坏|色|勾|诱惑|坏笑/.test(n)) return 'tease'
  if (/暖|贴|温柔|摸头|安/.test(n)) return 'warm'
  return 'neutral'
}

function normalizeMood(raw: string): MemeMood {
  const key = raw.trim().toLowerCase()
  return (MOODS.has(key) ? key : 'neutral') as MemeMood
}

/** 表情包根目录：{dataRoot}/qq-memes，按情绪分子目录 */
export function memesRoot(dataRoot: string): string {
  return join(dataRoot, 'qq-memes')
}

/**
 * 内置表情包目录：随程序分发的 assets/qq-memes。
 * 打包后走 process.resourcesPath，开发态走工作目录，找不到返回 null。
 */
export function bundledMemesRoot(): string | null {
  const candidates: string[] = []
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'assets', 'qq-memes'))
  }
  if (typeof app?.getAppPath === 'function') {
    candidates.push(join(app.getAppPath(), 'assets', 'qq-memes'))
  }
  candidates.push(join(process.cwd(), 'assets', 'qq-memes'))

  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return null
}

function scanDir(dir: string, mood: MemeMood | 'infer', out: MemeEntry[]): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }

  for (const name of names) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(full)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      // 第二层目录名当作情绪标签：qq-memes/happy/xx.png
      // 但整包导入的合集名（如 chinesebqb）不是情绪，这时把标签交给文件名
      scanDir(full, isMoodName(name) ? normalizeMood(name) : 'infer', out)
      continue
    }

    if (!IMAGE_EXTS.has(extname(name).toLowerCase())) continue
    if (stat.size > MAX_MEME_BYTES) {
      log.warn('meme too large, skipped', { name, bytes: stat.size })
      continue
    }
    const stem = basename(name, extname(name))
    const resolvedMood: MemeMood = mood === 'infer' ? inferMoodFromName(stem) : mood
    out.push({
      id: `${resolvedMood}/${stem}`,
      mood: resolvedMood,
      path: full,
      bytes: stat.size
    })
  }
}

/**
 * 按顺序扫描多个根目录并合并。
 * 先出现的目录优先：同情绪同名（id 相同）的图只保留第一份，
 * 所以「用户目录」放在最前面，就能覆盖内置包里的同一张。
 */
export function scanMemeRoots(roots: string[]): MemeEntry[] {
  const entries: MemeEntry[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    const found: MemeEntry[] = []
    // 根目录下的图片按 neutral 收纳，子目录按目录名归类
    scanDir(root, 'neutral', found)
    for (const e of found) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      entries.push(e)
    }
  }
  return entries
}

/**
 * 扫描并缓存表情包库。
 * 用户目录优先（同名图以用户自己的为准），内置包补足剩余数量；
 * 两个目录都不存在时返回空数组（渠道照常工作，只是不发图）。
 */
export function loadMemeLibrary(dataRoot: string): MemeEntry[] {
  const root = memesRoot(dataRoot)
  const bundled = bundledMemesRoot()
  const now = Date.now()
  if (
    cache &&
    cache.root === root &&
    cache.bundled === bundled &&
    now - cache.loadedAt < CACHE_TTL_MS
  ) {
    return cache.entries
  }

  const entries = scanMemeRoots(bundled ? [root, bundled] : [root])

  cache = { root, bundled, entries, loadedAt: now }
  return entries
}

export function clearMemeCache(): void {
  cache = null
}

/**
 * 按情绪挑一张图。
 * 优先同情绪池；没有则退回 neutral；再没有则全库随机（避免明明有图却永不发）。
 */
/**
 * 情绪邻近关系。
 * 精确池空了不该直接掉进 neutral（那等于放弃了语境），
 * 而是先找语义相邻的情绪——比如想撒娇但 love 池空，就退到 warm/shy。
 */
const MOOD_NEIGHBORS: Record<MemeMood, MemeMood[]> = {
  playful: ['hype', 'tease', 'warm'],
  tease: ['playful', 'annoyed'],
  warm: ['love', 'shy', 'playful'],
  shy: ['warm', 'love'],
  annoyed: ['cold', 'tease', 'sad'],
  cold: ['annoyed', 'neutral'],
  hype: ['playful', 'love'],
  sad: ['annoyed', 'cold'],
  love: ['warm', 'shy'],
  neutral: ['playful', 'warm']
}

function candidatePool(all: MemeEntry[], mood: MemeMood): MemeEntry[] {
  const same = all.filter((e) => e.mood === mood)
  if (same.length > 0) return same
  for (const near of MOOD_NEIGHBORS[mood] ?? []) {
    const pool = all.filter((e) => e.mood === near)
    if (pool.length > 0) return pool
  }
  const neutral = all.filter((e) => e.mood === 'neutral')
  return neutral.length > 0 ? neutral : all
}

export function pickMeme(args: {
  dataRoot: string
  mood: MemeMood
  rng?: () => number
  /** 本轮已发过的图 id，避免短时间内重复同一张 */
  exclude?: string[]
  /** 直接传入库存（跳过目录扫描），单测与批量挑选时用 */
  entries?: MemeEntry[]
}): MemeEntry | null {
  const rng = args.rng ?? Math.random
  const all = args.entries ?? loadMemeLibrary(args.dataRoot)
  if (all.length === 0) return null

  let pool = candidatePool(all, args.mood)
  if (args.exclude && args.exclude.length > 0) {
    const filtered = pool.filter((e) => !args.exclude!.includes(e.id))
    if (filtered.length > 0) pool = filtered
  }

  return pool[Math.floor(rng() * pool.length)] ?? null
}

/** 读文件转 data URI；失败返回 null（调用方跳过这张图，不影响文字） */
export function memeToDataUri(entry: MemeEntry): string | null {
  try {
    const buf = readFileSync(entry.path)
    if (buf.byteLength > MAX_MEME_BYTES) return null
    const ext = extname(entry.path).toLowerCase()
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg'
    return `base64://${buf.toString('base64')}`
  } catch (e) {
    log.warn('meme read failed', { path: entry.path, error: String(e) })
    return null
  }
}

/** 库存统计，供设置页显示「她手上有几张表情包」 */
export function memeLibraryStats(dataRoot: string): {
  total: number
  byMood: Record<string, number>
} {
  const all = loadMemeLibrary(dataRoot)
  const byMood: Record<string, number> = {}
  for (const e of all) byMood[e.mood] = (byMood[e.mood] ?? 0) + 1
  return { total: all.length, byMood }
}

/**
 * 用户这一轮是不是在明确要表情包。
 *
 * 「发个表情包」「来张图」这类请求不能靠概率撞，
 * 否则她会回一句「我发不了」——她其实库里有几百张，只是触发是随机的。
 */
export function isStickerRequest(userText: string): boolean {
  const t = (userText ?? '').trim()
  if (!t) return false
  if (/斗图/u.test(t)) return true
  // 「你发的表情包好好笑」是在评价，不是在要
  if (/(发|来|给|要|整|甩|找|看看)的/u.test(t)) return false
  // 「发 / 来 / 给 / 要 …」+ 可选数量词 + 「表情 / 图」，中间允许夹修饰语
  if (/(发|来|给|要|整|甩|找|有没有|看看)(个|张|一个|一张|点|几个|几张)?[^，。！？\n]{0,3}(表情包?|图)/u.test(t))
    return true
  if (/(表情包|梗图|贴图)/u.test(t) && /(发|来|给|要|整|甩|找)/u.test(t)) return true
  // 「发个委屈的」这类省掉了名词的口语说法
  if (/(发|来|给|要)(个|张|一个|一张)[^，。！？\n]{0,3}的$/u.test(t)) return true
  return false
}

/**
 * 用户点名要的是哪种情绪的表情包（「发个生气的」「来个可爱的」）。
 * 没点名返回 null，交给情绪状态机决定。
 */
export function requestedMemeMood(userText: string): MemeMood | null {
  const t = userText ?? ''
  if (!isStickerRequest(t)) return null
  if (/生气|凶|气死|烦死|炸毛|不爽/u.test(t)) return 'annoyed'
  if (/委屈|难过|伤心|哭|呜呜/u.test(t)) return 'sad'
  if (/无语|冷漠|白眼|嫌弃/u.test(t)) return 'cold'
  if (/搞笑|沙雕|抽象|离谱|笑死|哈哈/u.test(t)) return 'playful'
  if (/害羞|羞|脸红|乖/u.test(t)) return 'shy'
  if (/可爱|萌|软|甜/u.test(t)) return 'shy'
  if (/撒娇|亲|抱|贴|么么|喜欢|爱/u.test(t)) return 'love'
  if (/暖|温柔|贴心/u.test(t)) return 'warm'
  if (/加油|厉害|冲|牛/u.test(t)) return 'hype'
  return null
}

/**
 * 情绪状态 → 表情包情绪池。
 * aro 是唤醒度（激动程度），aff 是亲和度，两者来自 ACKM 已有的情绪状态机。
 */
export function emotionToMemeMood(
  aro: number,
  aff: number,
  userText?: string,
  replyText?: string
): MemeMood {
  const mine = replyText ?? ''
  const mineLow = mine.toLowerCase()
  const theirs = userText ?? ''

  // ① 对方在诉苦：绝对不能甩开心图
  if (/难过|伤心|委屈|哭|崩溃|撑不住|想死|抑郁/u.test(theirs)) return 'sad'
  if (/生气|烦死|滚|讨厌你|不理你|哼/u.test(theirs)) return 'annoyed'
  if (/想你了|喜欢你|爱你|抱抱|亲亲|么么|晚安/u.test(theirs)) return 'love'
  if (/哈哈|笑死|hhh|草|乐死|绷不住/ui.test(theirs)) return 'playful'

  // ② 看我自己在说什么——图是配我的话，不是配他的话
  if (/哈哈哈|笑死|我靠|绝了|绷不住|离谱|哈哈/ui.test(mine)) return 'playful'
  if (/不要|拒绝了|哼|才不|讨厌|不理你/ui.test(mine)) return 'tease'
  if (/抱抱|亲亲|想你|喜欢|爱你|乖|摸摸|在我这/ui.test(mine)) return 'love'
  if (/难过|累|委屈|算了|没事|唉/ui.test(mine)) return 'sad'
  if (/好吧|随便|哦|嗯|无语|懒得/ui.test(mine)) return 'cold'
  if (/我在这|不怕|陪你|别担心|慢慢来/ui.test(mine)) return 'warm'
  if (/太棒|牛|冲|赢|可以啊|好耶/ui.test(mine)) return 'hype'
  if (/(?<![a-z])baby|kiss|love you|miss you/i.test(mineLow)) return 'shy'

  // ③ 退回情绪数值
  if (aff > 0.6) return 'love'
  if (aff > 0.2) return aro > 0.3 ? 'warm' : 'shy'
  if (aro > 0.5) return 'hype'
  if (aff < -0.3) return 'annoyed'
  if (aro > 0.2) return 'playful'
  return 'neutral'
}
