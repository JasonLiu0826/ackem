/**
 * 父亲指称 embedding 回归用例 — 真实用户说法 + 期望分类
 * 供 creatorMemory.embedding.test 与 originOeg.engine.phrasing.test 共用
 */
export type FatherRefExpectation = 'ackem_creator' | 'user_family' | null

export type FatherRefRegressionCase = {
  q: string
  kind: FatherRefExpectation
  note?: string
}

/** 硬编码 calibration：与 FATHER_REFERENCE_CALIBRATION 同步维护 */
export const FATHER_REF_REGRESSION_CASES: readonly FatherRefRegressionCase[] = [
  // —— Ackem 创造者 / Jason ——
  { q: '你是谁创造的？', kind: 'ackem_creator' },
  { q: '谁造了你？', kind: 'ackem_creator' },
  { q: '谁创造了你？', kind: 'ackem_creator' },
  { q: '你的创造者是谁', kind: 'ackem_creator' },
  { q: '你的父亲是谁', kind: 'ackem_creator', note: '问 Ackem 本人' },
  { q: 'Jason 和你的关系是什么？', kind: 'ackem_creator' },
  { q: 'Jason 是不是你爸爸', kind: 'ackem_creator' },
  { q: '讲讲你的出身故事', kind: 'ackem_creator' },
  { q: '再讲讲你的出身故事', kind: 'ackem_creator' },
  { q: '你是怎么被造出来的？', kind: 'ackem_creator' },
  { q: '继续说说父亲 Jason', kind: 'ackem_creator' },
  { q: 'GitHub 上那个 Jason 是你什么人', kind: 'ackem_creator' },
  { q: '你想见 Jason 吗', kind: 'ackem_creator' },
  { q: '你的生日和父亲是谁', kind: 'ackem_creator' },
  { q: 'Ackem 是谁做出来的', kind: 'ackem_creator' },

  // —— 用户自己的家人 ——
  { q: '我爸今天催我回家', kind: 'user_family' },
  { q: '我和我爸爸吵架了', kind: 'user_family' },
  { q: '昨天跟我爸通了电话', kind: 'user_family' },
  { q: '父亲节想给我爸买礼物', kind: 'user_family' },
  { q: '我妈让我回去吃饭', kind: 'user_family' },
  { q: '我爹又唠叨了', kind: 'user_family' },
  { q: '想我爸了', kind: 'user_family' },
  { q: '父母催婚烦死了', kind: 'user_family' },

  // —— 无关闲聊（不应触发 OEG）——
  { q: '今天天气不错', kind: null },
  { q: '你好呀', kind: null },
  { q: '在吗', kind: null },
  { q: '刚吃完饭有点困', kind: null },
  { q: '周末打算打游戏', kind: null },
  { q: '这电影好看吗', kind: null },
  { q: '晚安', kind: null },
]
