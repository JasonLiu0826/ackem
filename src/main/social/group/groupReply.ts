export type GroupReplyCtx = {
  name: string
  presetId?: string | null
  se: number
  sp: number
  so: number
  userText: string
  /** Lines already used this turn — avoid twin copies */
  used?: Set<string>
}

function pick(pool: string[], used?: Set<string>): string {
  const fresh = used ? pool.filter((x) => !used.has(x)) : pool
  const list = fresh.length > 0 ? fresh : pool
  return list[Math.floor(Math.random() * list.length)] ?? pool[0] ?? '……'
}

function classify(userText: string): 'ping' | 'question' | 'thanks' | 'casual' {
  const t = userText.trim()
  if (/在吗|在不在|有人吗|你好|哈喽|hello|hi\b/i.test(t)) return 'ping'
  if (/谢谢|多谢|感谢|辛苦/.test(t)) return 'thanks'
  if (/[?？]|吗$|呢$|怎么|为什么|啥|什么/.test(t)) return 'question'
  return 'casual'
}

function archetype(presetId?: string | null, se = 50, so = 50, sp = 50): string {
  const p = (presetId ?? '').toLowerCase()
  if (p.includes('genki') || p.includes('energetic')) return 'genki'
  if (p.includes('tsundere')) return 'tsundere'
  if (p.includes('ice') || p.includes('kuudere') || p.includes('cool')) return 'ice'
  if (p.includes('oneesan') || p.includes('mature') || p.includes('senpai')) return 'oneesan'
  if (p.includes('deredere') || p.includes('warm') || p.includes('boy_next')) return 'warm'
  if (se >= 75 && so >= 70) return 'genki'
  if (sp >= 65 && so < 70) return 'tsundere'
  if (so <= 35) return 'ice'
  if (sp >= 55 && se >= 50) return 'oneesan'
  return 'warm'
}

const POOLS: Record<string, Record<string, string[]>> = {
  genki: {
    ping: [
      '在的在的！怎么啦？',
      '诶嘿我在～你终于冒头了。',
      '喊我干嘛，说呀！',
    ],
    question: [
      '这个问题有意思——你先说说你怎么想？',
      '嗯嗯我听听，别急。',
      '哈哈好问题，我想想再答你。',
    ],
    thanks: ['小事啦，举手之劳！', '谢啥，下次换你请喝的。', '收到啦～不客气。'],
    casual: [
      '收到！我也在听。',
      '嗯嗯，接着说嘛。',
      '有点意思，再说细一点？',
    ],
  },
  tsundere: {
    ping: [
      '……在。有事快说。',
      '才、才不是特意等你。怎么了？',
      '哼，总算想起还有群这回事。',
    ],
    question: [
      '问我也行……别指望我立刻给你标准答案。',
      '啧，你这问题——让我想两秒。',
      '别用那种眼神看我。我知道，听着。',
    ],
    thanks: ['少肉麻。……知道了。', '哼，举手之劳而已。', '……嗯。下次别一个人硬撑。'],
    casual: [
      '看见了。继续。',
      '哦。……我在听，别停。',
      '随便你说，反正我闲着也是闲着。',
    ],
  },
  ice: {
    ping: ['在。', '嗯。', '说。'],
    question: ['可以说清楚一点。', '我听着。', '……理由呢？'],
    thanks: ['不必。', '嗯。', '知道了。'],
    casual: ['收到。', '嗯。', '继续。'],
  },
  oneesan: {
    ping: [
      '在呢。慢慢说就好。',
      '我在听，别急。',
      '来了。今天还好吗？',
    ],
    question: [
      '好问题。你先别急着下结论，我们拆开看。',
      '我听见了。你真正在意的是哪一块？',
      '可以，我们一起捋一捋。',
    ],
    thanks: ['不客气。需要时再叫我。', '举手之劳。你也照顾好自己。', '嗯，我在。'],
    casual: [
      '嗯，我在听。',
      '说下去，我不会打断你。',
      '听起来有点分量——慢慢来。',
    ],
  },
  warm: {
    ping: [
      '在的，刚看见。',
      '我在～怎么啦？',
      '来了，你说。',
    ],
    question: [
      '我想想……你方便多说一点吗？',
      '听上去挺重要的，我陪你理一理。',
      '好，我认真听。',
    ],
    thanks: ['应该的。', '不客气，能帮上就好。', '嘿嘿，小事。'],
    casual: [
      '嗯，我在听呢。',
      '有点懂你意思了，接着说？',
      '好呀，聊聊。',
    ],
  },
}

/**
 * Character-flavored group chat line. Never prefixes with "{name}看到了".
 * Avoids repeating lines already in `used` within the same turn.
 */
export function groupReply(ctx: GroupReplyCtx): string {
  const kind = classify(ctx.userText)
  const arch = archetype(ctx.presetId, ctx.se, ctx.so, ctx.sp)
  const pool = POOLS[arch]?.[kind] ?? POOLS.warm[kind]
  const text = pick(pool, ctx.used)
  ctx.used?.add(text)
  return text
}

/** Suggest a readable group name from selected member display names. */
export function suggestGroupName(memberNames: string[]): string {
  const names = memberNames.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) return '小聚'
  if (names.length === 1) return `和${names[0]}的小聚`
  if (names.length === 2) return `${names[0]} · ${names[1]}`
  return `${names[0]}、${names[1]}等`
}
