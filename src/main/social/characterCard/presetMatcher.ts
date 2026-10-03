/**
 * presetMatcher.ts — 预设关键词推荐
 * 根据角色名与人设文本，返回 Top3 人格预设建议
 * 供创建向导第二步展示；最终选择须用户确认
 */

import { PERSONALITY_PRESETS, type PersonalityPreset } from '../../personalityPresets'

export type PresetRecommendation = {
  presetId: string
  label: string
  score: number
}

const KEYWORDS: Record<string, string[]> = {
  tsundere: ['傲娇', 'tsundere', '嘴硬', '才不是', '哼'],
  yandere: ['病娇', 'yandere', '占有', '嫉妒', '疯狂'],
  oneesan: ['御姐', 'oneesan', '成熟', '姐姐', '包容'],
  genki: ['元气', 'genki', '活泼', '开朗', '能量'],
  kuudere: ['三无', 'kuudere', '冷淡', '寡言', '面无表情'],
  deredere: ['温柔', 'deredere', '体贴', '暖', '柔软'],
  shitakiri: ['毒舌', '吐槽', '犀利', '刻薄'],
  bokke: ['天然', '呆萌', '迷糊', 'bokke'],
  ice_queen: ['冷艳', '威严', '冰山', '高贵', '将军', '神明'],
  girl_next_door: ['邻家', '普通', '日常', '亲切'],
  ceo_dom: ['总裁', '霸道', '强势', '支配', 'ceo'],
  gentle_warmth: ['暖男', '温柔男', '体贴男'],
  puppy: ['奶狗', '年下', '撒娇', '黏人'],
  iceberg: ['冷酷', '冰山男', '沉默'],
  schemer: ['腹黑', '谋士', '算计'],
  loyal_knight: ['骑士', '忠诚', '守护'],
  bad_boy: ['痞', '坏男孩', '浪子'],
  artistic: ['文艺', '诗人', '艺术'],
  innocent_boy: ['天然少年', '纯真'],
  boy_next_door: ['邻家哥哥', '哥哥'],
  submissive: ['顺从', 'sub', '乖巧', '服从'],
  dominatrix: ['女王', 'dom', '支配女'],
  loyal_pup: ['忠犬', '小狗', '服从男'],
  tamer: ['调教', 'tamer', '驯服'],
  mommy: ['妈妈', '母性', '宠溺', 'mommy'],
  mesugaki: ['雌小鬼', '挑衅', '嘴欠', 'brat'],
  gap_moe_f: ['反差', '乖巧', '隐藏'],
  daddy: ['爸爸', '父性', 'daddy', '保护'],
  gap_moe_m: ['绅士', '反差男', '表面正经'],
}

function scorePreset(preset: PersonalityPreset, corpus: string): number {
  const keys = KEYWORDS[preset.id] ?? []
  let score = 0
  const lower = corpus.toLowerCase()
  for (const kw of keys) {
    if (lower.includes(kw.toLowerCase())) score += kw.length >= 3 ? 3 : 2
  }
  if (lower.includes(preset.label.toLowerCase())) score += 2
  if (lower.includes(preset.id)) score += 4
  return score
}

/** 返回指定性别的 Top N 预设推荐（默认 3） */
export function recommendPresets(
  name: string,
  persona: string,
  gender: 'female' | 'male',
  limit = 3
): PresetRecommendation[] {
  const corpus = `${name}\n${persona}`
  const candidates = PERSONALITY_PRESETS.filter((p) => p.gender === gender)
  const scored = candidates
    .map((p) => ({
      presetId: p.id,
      label: p.label,
      score: scorePreset(p, corpus),
    }))
    .sort((a, b) => b.score - a.score)

  const withSignal = scored.filter((s) => s.score > 0)
  const pool = withSignal.length >= limit ? withSignal : scored
  return pool.slice(0, limit)
}
