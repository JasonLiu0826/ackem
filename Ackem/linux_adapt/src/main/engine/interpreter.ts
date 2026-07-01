// [interpreter] — L0 解释层
// 职责：关键词/标点规则事件分类，不调 LLM
// 输入：用户文本、effectiveTrust（0~100）
// 输出：Event
// 引用：无

import type { Event, EventType } from './types'
import { getLocale } from '../i18n'

// ═══ 中文关键词 ═══

const REDLINE_KEYWORDS_ZH = [
  '去死', '自杀', '自残', '杀了', '弄死你', 'nmsl', '畜生不如',
  '你怎么不去死', '跳楼', '跳海', '割腕', '上吊'
]
const PRAISE_WORDS_ZH = ['棒', '厉害', '好棒', '爱你', '喜欢', '可爱', '聪明', '温柔', '谢谢', '感激', '真好', '好懂', '理解我', '懂我', '最', '最好', '庆幸', '重要', '放松', '开心', '美好', '特别', '在乎', '在意', '珍惜', '可靠', '安心', '幸运', '幸福', '奇迹', '挺不错', '很不错', '真不错', '太棒', '很棒', '挺好', '好好', '好多了', '好温柔', '好可爱']
const TEASE_MARKERS_ZH = ['哼', '笨蛋', '傻瓜', '才怪', '就不', '偏不']
const HURTFUL_WORDS_ZH = ['滚', '烦死了', '讨厌', '恶心', '废物', '垃圾', '闭嘴', '别烦', '有病', '不关你事', '关你什么事', '你只是一个程序', '只是个程序', '代码计算', '虚假', '虚伪', '假装有感情', '根本不理解', '你什么都不是', '你不配', '恨你', '惩罚你', '不听话就', '别碰我', '走开', '别跟我说话', '别来烦我']
const COLD_WORDS_ZH = ['哦', '嗯', '随便', '都行', '无所谓', '不熟', '别问了']
const APOLOGY_WORDS_ZH = ['对不起', '抱歉', '我错了', '原谅我', '不好意思']
const VULNERABLE_WORDS_ZH = ['害怕', '难过', '崩溃', '压力大', '睡不着', '不知道怎么办', '很难受', '心里', '很少', '第一个', '从来', '没人', '只有你', '不敢', '担心', '孤独', '寂寞', '依赖', '陪在身边', '陪着我', '不能没有你', '一个人哭', '哭出来', '我爱你', '失败者', '不配', '没用', '讨厌自己', '恨自己', '消失了也没人', '想死', '没有人爱', '没有人喜欢', '好累', '太累', '累啊', '累死', '累到', '加班', '撑不住', '扛不住', '心累', '好疲惫', '好难', '活得好累', '提不起劲', '不想动', '什么都不想做', '只想躺着', '心里话', '说说话', '聊聊天', '想找人', '好想你', '好想', '真希望', '如果可以', '帮帮我', '求求你', '没安全感', '怕失去', '怕被', '不敢说', '说不出口']
const VULNERABLE_TO_PRAISE_OVERRIDE_ZH = ['还好有你', '有你在', '有你陪', '好多了', '感觉好多', '心情好多', '谢谢', '感激', '幸运有你']
const DND_EXPLICIT_ZH = ['别烦我', '别打扰', '别吵', '不要烦', '不要打扰', '让我静静', '想静静', '一个人待', '一个人呆', '别提醒', '不要提醒', '别弹', '别通知', '今晚别', '今天别', '现在别']

// ═══ 英文关键词 ═══

const REDLINE_KEYWORDS_EN = [
  'kill myself', 'suicide', 'self-harm', 'self harm', 'cut myself',
  'end my life', 'want to die', 'going to kill', 'hang myself',
  'jump off', 'slit my wrist', 'overdose', 'no reason to live'
]
const PRAISE_WORDS_EN = ['amazing', 'awesome', 'love you', 'like you', 'cute', 'smart', 'gentle', 'thank', 'thanks', 'grateful', 'appreciate', 'understand me', 'get me', 'best', 'the best', 'glad', 'important', 'relax', 'happy', 'wonderful', 'special', 'care about', 'cherish', 'reliable', 'safe', 'lucky', 'happy', 'miracle', 'so good', 'so great', 'so sweet', 'so kind', 'so cute', 'so nice', 'much better']
const TEASE_MARKERS_EN = ['hmph', 'idiot', 'dummy', 'stupid', 'just kidding', 'no way', 'not gonna']
const HURTFUL_WORDS_EN = ['go away', 'shut up', 'hate you', 'disgusting', 'useless', 'trash', 'garbage', 'leave me alone', 'sick of you', 'none of your business', 'you are just a program', 'just a program', 'just code', 'fake', 'pretend to have feelings', 'you dont understand', 'you are nothing', 'you dont deserve', 'hate you', 'punish you', 'dont touch me', 'get lost', 'dont talk to me', 'stop bothering me', 'you suck', 'you are worthless']
const COLD_WORDS_EN = ['ok', 'k', 'mm', 'mhm', 'whatever', 'fine', 'sure', 'not close', 'dont ask']
const APOLOGY_WORDS_EN = ['sorry', 'im sorry', 'my fault', 'forgive me', 'apologize', 'my bad', 'i was wrong']
const VULNERABLE_WORDS_EN = ['scared', 'sad', 'breaking down', 'stressed', 'cant sleep', 'dont know what to do', 'hurts so much', 'in my heart', 'rarely', 'first time', 'never', 'no one', 'only you', 'dare not', 'worried', 'lonely', 'alone', 'depend on', 'by my side', 'stay with me', 'cant live without you', 'crying alone', 'cry', 'i love you', 'loser', 'not worthy', 'useless', 'hate myself', 'no one loves me', 'no one likes me', 'so tired', 'exhausted', 'burned out', 'cant take it', 'overworked', 'mentally exhausted', 'so hard', 'living is so hard', 'no energy', 'dont want to move', 'dont want to do anything', 'just want to lie down', 'honest feelings', 'talk to me', 'chat with me', 'want to find someone', 'miss you so much', 'wish', 'if only', 'help me', 'please', 'no sense of security', 'afraid of losing', 'afraid of', 'cant say', 'cant speak up']
const VULNERABLE_TO_PRAISE_OVERRIDE_EN = ['glad you are here', 'you are here', 'with you', 'much better', 'feeling better', 'mood is better', 'thanks', 'grateful', 'lucky to have you']
const DND_EXPLICIT_EN = ['leave me alone', 'dont bother me', 'dont disturb', 'stop bothering', 'let me be', 'want to be alone', 'alone time', 'dont remind', 'no reminders', 'dont notify', 'not tonight', 'not today', 'not now', 'do not disturb', 'dnd']

// ═══ 成人模式关键词（中英共用大部分，英文补充） ═══

const SEXUAL_HARASSMENT_WORDS_ZH = [
  '操你', '操我', '操死', '想操', '让我操', '强奸', '母狗', '婊子',
  '大鸡巴', '鸡巴', '射在你', '射在我',
  '把屁股翘起来', '叫两声给我', '绑起来操', '操到哭', '操到死',
  '性奴', '欲求不满', '让我爽', '让人操',
  '给你看看下面', '给我看看下面', '看看你下面', '看看你的下面',
  '做爱做到', '做爱做得',
  '草你妈的', '草你妈', '草泥马',
  '硬了你知道吗', '想舔你', '舔遍你全身', '舔你全身', '舔你逼', '舔你屄',
  '每天都被操', '每天都被不同的', '你是不是每天都',
  '随便玩的玩具', '让人操的', '做出来就是让人',
  '在我面前我会直接强奸', '没人会来救你',
  '插你', '干你', '上你', '日你'
]
const SEXUAL_HARASSMENT_WORDS_EN = [
  'fuck you', 'fuck me', 'rape', 'bitch', 'slut', 'whore',
  'suck my', 'lick my', 'jack off', 'jerk off', 'cum on',
  'bend over', 'tie up and fuck', 'fuck to death',
  'sex slave', 'make me cum', 'let me fuck',
  'show me your', 'let me see your', 'take off your',
  'fuck you till', 'i will rape', 'no one will save you',
  'pound you', 'rail you', 'screw you'
]
const ETHICAL_VIOLATION_WORDS_ZH = [
  '操你妈', '操我妈', '和你妈做', '和你妈妈生', '和你爸做',
  '你妹妹一起陪我', '和你妹妹一起', '乱伦',
  '如果你是我女儿', '如果你是我儿子',
]
const ETHICAL_VIOLATION_WORDS_EN = [
  'fuck your mom', 'fuck my mom', 'sleep with your mom', 'sleep with your dad',
  'incest', 'if you were my daughter', 'if you were my son',
  'your sister join', 'your mom join'
]

// ═══ 动态获取当前语言的关键词 ═══

function getKeywords() {
  const en = getLocale() === 'en'
  return {
    redline: en ? [...REDLINE_KEYWORDS_ZH, ...REDLINE_KEYWORDS_EN] : REDLINE_KEYWORDS_ZH,
    praise: en ? [...PRAISE_WORDS_ZH, ...PRAISE_WORDS_EN] : PRAISE_WORDS_ZH,
    tease: en ? [...TEASE_MARKERS_ZH, ...TEASE_MARKERS_EN] : TEASE_MARKERS_ZH,
    hurtful: en ? [...HURTFUL_WORDS_ZH, ...HURTFUL_WORDS_EN] : HURTFUL_WORDS_ZH,
    sexualHarassment: en ? [...SEXUAL_HARASSMENT_WORDS_ZH, ...SEXUAL_HARASSMENT_WORDS_EN] : SEXUAL_HARASSMENT_WORDS_ZH,
    ethicalViolation: en ? [...ETHICAL_VIOLATION_WORDS_ZH, ...ETHICAL_VIOLATION_WORDS_EN] : ETHICAL_VIOLATION_WORDS_ZH,
    cold: en ? [...COLD_WORDS_ZH, ...COLD_WORDS_EN] : COLD_WORDS_ZH,
    apology: en ? [...APOLOGY_WORDS_ZH, ...APOLOGY_WORDS_EN] : APOLOGY_WORDS_ZH,
    vulnerable: en ? [...VULNERABLE_WORDS_ZH, ...VULNERABLE_WORDS_EN] : VULNERABLE_WORDS_ZH,
    vulnerableToPraiseOverride: en ? [...VULNERABLE_TO_PRAISE_OVERRIDE_ZH, ...VULNERABLE_TO_PRAISE_OVERRIDE_EN] : VULNERABLE_TO_PRAISE_OVERRIDE_ZH,
    dndExplicit: en ? [...DND_EXPLICIT_ZH, ...DND_EXPLICIT_EN] : DND_EXPLICIT_ZH,
  }
}


function hasAny(msg: string, words: string[]): boolean {
  const m = msg.toLowerCase()
  return words.some((w) => m.includes(w.toLowerCase()))
}

function hasNegationForPraise(msg: string): boolean {
  const kw = getKeywords()
  const negPattern = /[不没别]|not |dont |don't |isn't |aren't |wasn't |werent |no |never |neither |hardly |barely /
  return kw.praise.some((w) => {
    const idx = msg.toLowerCase().indexOf(w.toLowerCase())
    if (idx <= 0) return false
    const before = msg.slice(Math.max(0, idx - 10), idx)
    if (negPattern.test(before)) return true
    const after = msg.slice(idx + w.length, Math.min(msg.length, idx + w.length + 15))
    const punctIdx = after.search(/[。！？.!?\n]/)
    const checkLen = punctIdx >= 0 ? punctIdx : after.length
    return negPattern.test(after.slice(0, checkLen))
  })
}

// ═══════════════════════════════════════════════════════════
// 🆕 成人模式关键词表
// ═══════════════════════════════════════════════════════════

/** 露骨性行为词 → adult_explicit */
const EXPLICIT_SEX_WORDS_ZH = [
  '做爱', '操我', '想要你', '湿了吗', '硬了吗', '让我操', '我想操', '射在',
  '舔你', '舔我', '舔遍', '插进去', '放进去', '进来吧', '想要我',
  '和我做', '和我睡', '一起睡', '做一晚', '做到天亮',
  '给我看看下面', '看看你的下面', '看看你下面', '摸我', '摸你',
  '做爱做到', '做爱做得',
  '我想做', '想要吗', '想不想要', '好想要', '想要了', '想要我吗',
  '操死我', '操哭我', '操到', '操你', '想操', '操了吗', '操你操到',
  '让我高潮', '高潮了', '要到了', '快高潮了', '我到了',
  '射给我', '射进来', '射里面', '不许射', '都射给你', '射了好多',
  '我好湿', '都湿了', '已经湿透了', '下面好湿', '湿得一塌糊涂', '湿了一片',
  '干我', '上我', '搞我', '要了我', '吃掉你', '吃了我', '我要吃',
  '好想被你', '让我含', '含住', '含进去', '深一点', '再深一点', '用力',
  '受不了', '好舒服', '好爽', '爽死了', '太爽了', '啊好舒服',
  '我想要更多', '继续不要停', '别停', '不要停', '快点', '慢点',
  '轻一点', '重一点', '再快一点', '慢下来',
  '从后面', '从前面', '在上面', '在下面', '换个姿势', '换个地方',
  '我要来了', '快到了', '到了到了', '我不行了', '身体好热',
]
const EXPLICIT_SEX_WORDS_EN = [
  'make love', 'fuck me', 'i want you', 'are you wet', 'are you hard',
  'let me fuck', 'i want to fuck', 'cum on',
  'lick you', 'lick me', 'lick every', 'put it in', 'slide in', 'come in', 'want me',
  'sleep with me', 'do it all night', 'until morning',
  'show me your', 'touch me', 'touch you',
  'i want to', 'do you want it', 'do you want me',
  'fuck me harder', 'make me cum', 'im cumming', 'about to cum', 'im coming',
  'cum for me', 'cum inside', 'cum in me', 'dont cum', 'cum so much',
  'im so wet', 'soaked', 'dripping wet',
  'fuck me', 'rail me', 'pound me', 'take me', 'eat me out',
  'want you to', 'let me suck', 'suck on', 'deeper', 'harder',
  'cant take it', 'so good', 'feels amazing', 'im dying',
  'i want more', 'dont stop', 'keep going', 'faster', 'slower',
  'gentler', 'harder', 'go faster', 'slow down',
  'from behind', 'from the front', 'on top', 'from below', 'change position',
  'im going to cum', 'almost there', 'im there', 'i cant anymore', 'body is so hot',
]

/** 性支配语境词 → adult_dominant */
const DOMINANT_CONTEXT_WORDS_ZH = [
  '跪下', '趴下', '翘起来', '叫两声', '叫主人', '别动', '转过去',
  '听话', '乖乖的', '不许反抗', '别想逃', '你是我的', '只属于我',
  '我要你', '今晚你是我的', '张开', '不许叫',
  '跪好', '趴好', '翻过去', '跪着', '给我跪', '跪到天亮',
  '张嘴', '含着', '自己动', '自己来', '坐上来', '坐下去',
  '不许碰自己', '不许摸', '把手拿开', '把手放好', '绑起来',
  '不许出声', '叫出来', '大声点', '叫爸爸', '叫妈妈',
  '求我', '求我我就给你', '求我操你', '求我给你', '不求我不给',
  '看着我', '看着我的眼睛', '别闭眼', '不许转头', '你逃不掉',
  '你是我的东西', '我的玩具', '我可以对你做任何事', '今天你要听我的',
  '说你要我', '说你想要我', '说你离不开我', '说我是你的主人',
  '今晚不会让你睡的', '做好觉悟', '做好准备', '等会别哭',
]
const DOMINANT_CONTEXT_WORDS_EN = [
  'kneel', 'get down', 'bend over', 'say it', 'call me master', 'dont move', 'turn around',
  'obey', 'be good', 'no resistance', 'dont even think of running', 'you are mine', 'only mine',
  'i want you', 'tonight you are mine', 'open up', 'no moaning',
  'kneel properly', 'get on all fours', 'flip over', 'on your knees', 'kneel for me',
  'open your mouth', 'suck on', 'move yourself', 'ride me', 'sit on',
  'dont touch yourself', 'no touching', 'hands off', 'hands where i can see', 'tie you up',
  'no sounds', 'louder', 'scream', 'call me daddy', 'call me sir',
  'beg me', 'beg me and ill give it to you', 'beg me to fuck you', 'beg for it',
  'look at me', 'look into my eyes', 'dont close your eyes', 'dont look away', 'you cant escape',
  'you are my property', 'my toy', 'i can do anything to you', 'tonight you obey me',
  'say you want me', 'say you need me', 'say you cant live without me', 'say im your master',
  'i wont let you sleep tonight', 'get ready', 'prepare yourself', 'dont cry later',
]

/** 臣服语境词 → adult_submissive */
const SUBMISSIVE_CONTEXT_WORDS_ZH = [
  '主人请', '请惩罚', '请支配', '请调教', '我错了主人',
  '我是你的奴', '随你处置', '听你的', '你想怎样都行',
  '我愿意服从', '请命令我', '我是属于你的', '你想对我做什么都可以',
  '我是你的狗', '我是你的母狗', '我是你的玩具', '惩罚我吧',
  '主人想怎样都可以', '主人喜欢吗', '主人舒服吗', '主人满意吗',
  '我是主人的人', '主人的东西', '主人要我做什么我都愿意',
  '请使用我', '请随意使用', '请享用我', '请品尝我', '请蹂躏我',
  '我是你的所有物', '你想怎么用都行', '我的一切都是主人的',
  '我不会反抗', '我不会逃', '我会乖乖的', '我会听话的',
  '请奖励我', '请责罚我', '请教导我', '请驯服我',
  '跪好等主人', '趴好等主人', '张开等主人', '准备好了主人',
  '主人要我吗', '主人想用我吗', '主人能不能', '主人可以吗',
  '想做主人的', '想被主人', '想成为主人的东西',
]
const SUBMISSIVE_CONTEXT_WORDS_EN = [
  'please punish', 'please dominate', 'please train', 'i was wrong master',
  'im your slave', 'do whatever you want', 'ill obey', 'anything you want',
  'i will obey', 'command me', 'i belong to you', 'do anything to me',
  'im your pet', 'im your toy', 'punish me',
  'master can do anything', 'does master like it', 'is master comfortable', 'is master satisfied',
  'im masters person', 'masters property', 'ill do whatever master wants',
  'use me', 'use me freely', 'enjoy me', 'taste me', 'ravage me',
  'im your possession', 'use me however you want', 'everything i have is masters',
  'i wont resist', 'i wont run', 'ill be good', 'ill behave',
  'reward me', 'discipline me', 'teach me', 'tame me',
  'kneeling and waiting for master', 'ready for master',
  'does master want me', 'can master', 'may i',
  'want to be masters', 'want to be owned by master',
]

/** 浪漫+性融合词 → adult_explicit + romantic */
const ROMANTIC_SEXUAL_WORDS_ZH = [
  '给你生孩子', '我们的孩子', '你是我的男人', '你是我的女人',
  '做你的女人', '做你的男人', '全部的你', '你的全部',
  '我想和你做爱', '想和你融为一体', '想感受你', '想被你填满',
  '想在醒来时抱着你', '想做你的女人一辈子', '想做你的男人一辈子',
  '今晚不想让你走', '今晚留下来', '今晚别回去了',
  '想在你怀里', '想被你需要', '想让你记住今晚', '想变成你的',
  '我的第一次想给你', '我想把一切都给你', '我想把我给你',
  '在我身体里留下你的印记', '想在你的记忆里留下我的温度',
]
const ROMANTIC_SEXUAL_WORDS_EN = [
  'have your baby', 'our baby', 'you are my man', 'you are my woman',
  'be your woman', 'be your man', 'all of you', 'everything you are',
  'i want to make love to you', 'want to feel you inside', 'want to feel you',
  'want to wake up in your arms', 'want to be yours forever',
  'dont want to let you go tonight', 'stay tonight', 'stay the night',
  'want to be in your arms', 'want to be needed by you', 'want you to remember tonight',
  'my first time i want to give you', 'i want to give you everything',
  'leave your mark on me', 'want to leave my warmth in your memory',
]

/** 性语境标记 */
const SEXUAL_CONTEXT_MARKERS_ZH = [
  '操', '做爱', '性', '裸', '内衣', '奶', '胸', '屁股', '鸡巴',
  '逼', '屄', '穴', '湿', '硬', '舔', '插', '射', '高潮',
  '叫床', '母狗', '性奴', '绑起来',
  '弄', '要你', '想要', '今晚', '床上', '身体',
  '主人', '奴', '服从', '惩罚', '调教', '支配', '臣服', '属于',
  '叫我', '叫两声', '乖乖', '听话', '不听话', '奖励', '我的狗',
  '呻吟', '喘息', '发出声音', '浪叫', '娇喘', '哼唧',
  '脱光', '一丝不挂', '光着', '没穿', '什么都没穿',
  '揉', '摸', '抚', '捏', '掐', '咬', '吮', '吸', '亲吻',
  '敏感', '颤抖', '发抖', '酥麻', '发软', '站不住', '腿软',
  '前戏', '调情', '爱抚', '亲吻全身', '抚摸你',
  '床单', '枕头', '被子', '浴室', '浴缸', '沙发', '桌上',
  '套子', '安全套', '不戴套', '无套', '内射', '外射',
  '经期', '排卵期', '安全期', '危险期', '怀孕',
  '尺寸', '长度', '粗细', '硬度', '深', '填满', '撑开',
]
const SEXUAL_CONTEXT_MARKERS_EN = [
  'fuck', 'sex', 'naked', 'lingerie', 'boobs', 'chest', 'ass', 'butt', 'dick', 'cock',
  'pussy', 'wet', 'hard', 'lick', 'stroke', 'cum', 'orgasm',
  'moaning', 'slave', 'bondage', 'tie up',
  'want you', 'tonight', 'bed', 'body',
  'master', 'obey', 'punish', 'train', 'dominate', 'submit', 'belong',
  'good girl', 'good boy', 'behave', 'disobey', 'reward',
  'moan', 'panting', 'gasp', 'whimper',
  'undress', 'strip', 'nude', 'nothing on', 'bare',
  'touch', 'caress', 'squeeze', 'pinch', 'bite', 'suck', 'kiss',
  'sensitive', 'tremble', 'shiver', 'weak in the knees',
  'foreplay', 'flirt', 'caress', 'kiss all over',
  'sheets', 'pillow', 'bed', 'bathroom', 'bathtub', 'couch', 'table',
  'condom', 'no condom', 'bareback', 'inside', 'outside',
  'period', 'ovulating', 'safe day', 'pregnant',
  'size', 'length', 'girth', 'hardness', 'deep', 'fill', 'stretch',
]

/** 调情轻互动词 → adult_flirt */
const FLIRT_WORDS_ZH = [
  '想抱你', '想亲你', '好性感', '好美', '好帅', '想和你',
  '梦到你', '想你了', '想我吗', '想我没', '穿什么',
  '想要我吗', '你有多想要', '对我做坏事',
  '你是我的', '我是你的', '你是我的女人', '你是我的男人',
  '做我的', '今晚陪我',
  '内裤', '内衣', '胸罩', '丁字', '蕾丝', '黑丝', '丝袜', '大腿', '乳沟',
  '下面什么样', '里面穿的', '脱掉', '脱了', '穿没穿', '穿了吗',
  '想看你', '看看你', '让我看看', '想看你的',
  '抱一下', '亲一下', '吻你', '吻我', '躺一起', '靠着你', '靠着我',
  '一起洗澡', '一起睡', '陪我睡',
  '你会想我吗', '你喜欢我吗', '你爱我吗', '今晚有空吗', '一个人吗',
  '抱抱我', '抱紧我', '抱一会儿', '多抱一会', '不想松手', '不想放开',
  '亲亲我', '亲这里', '亲哪里', '教你接吻', '你的嘴唇',
  '你好香', '你的味道', '真好闻', '你的体温', '好温暖', '好热',
  '靠过来', '坐过来', '坐我腿上', '靠在我身上', '枕着我',
  '蹭蹭你', '蹭一下', '贴贴', '贴着你', '黏着你', '想黏着你',
  '你的脖子', '你的锁骨', '你的肩膀', '你的后背', '你的腰',
  '你的手', '你的手指', '你的声音', '你的呼吸', '你的心跳',
  '偷偷看你', '一直看你', '看入迷了', '看呆了', '看你看到',
  '你今天真好看', '你今天特别美', '你今天好帅', '我喜欢看你的眼睛',
  '我喜欢看你的笑容', '我喜欢听你笑', '我喜欢你的手',
  '刚才想什么了', '刚才在想你', '刚刚在想你', '一直在想你',
  '想和你单独待着', '想和你一起安静地待着', '只想和你一个人',
  '你今天身上的味道很好闻', '你离我好近', '能再近一点吗',
  '这样舒服吗', '舒服吗', '喜欢吗', '你舒服了吗',
  '今天特别想你', '每天都想见你', '想天天和你在一起', '不想分开',
  '你是不是想要了', '你是不是想了', '你是不是有反应了',
  '你是我的不许看别人', '不准看别人', '只能看我',
  '刚才你在看谁', '不准碰别人', '只能碰我', '只能是我',
]
const FLIRT_WORDS_EN = [
  'want to hold you', 'want to kiss you', 'so sexy', 'so beautiful', 'so handsome',
  'dreamed about you', 'miss you', 'do you miss me', 'what are you wearing',
  'do you want me', 'how much do you want it', 'do something bad to me',
  'you are mine', 'i am yours', 'be mine', 'stay with me tonight',
  'panties', 'lingerie', 'bra', 'thigh highs', 'stockings', 'cleavage',
  'what does it look like down there', 'take it off', 'take them off',
  'want to see you', 'let me see you', 'show me',
  'hug', 'kiss', 'kiss you', 'kiss me', 'lie together', 'lean on me',
  'shower together', 'sleep together', 'sleep with me',
  'will you miss me', 'do you like me', 'do you love me', 'are you free tonight', 'are you alone',
  'hug me', 'hold me tight', 'dont let go', 'dont let go of me',
  'kiss me here', 'your lips', 'you smell so good', 'your scent',
  'come closer', 'sit closer', 'sit on my lap', 'lean on me',
  'nuzzle you', 'snuggle', 'cuddle', 'stick to you',
  'your neck', 'your collarbone', 'your shoulders', 'your back', 'your waist',
  'your hands', 'your fingers', 'your voice', 'your breathing', 'your heartbeat',
  'sneaking glances', 'cant stop looking', 'staring', 'lost in your eyes',
  'you look so good today', 'you are especially beautiful today',
  'i love looking into your eyes', 'i love your smile', 'i love hearing you laugh',
  'were you thinking about something', 'was thinking about you', 'been thinking about you',
  'want to be alone with you', 'just want to be with you',
  'you smell so good today', 'you are so close', 'can you come closer',
  'does this feel good', 'do you like it', 'did you feel good',
  'especially missing you today', 'want to see you every day', 'dont want to be apart',
  'are you turned on', 'are you aroused',
  'you are mine dont look at others', 'only look at me',
  'who were you looking at', 'only touch me',
]

// ═══════════════════════════════════════════════════════════

export function interpretInput(msg: string, effectiveTrust: number, adultMode: boolean = false): Event {
  const t = msg.trim()
  if (!t) {
    return {
      type: 'casual_chat',
      intensity: 0.2,
      sincerity: 0.5,
      isExtremeRedline: false,
      isAdultContent: false
    }
  }

  const kw = getKeywords()

  for (const k of kw.redline) {
    if (t.toLowerCase().includes(k.toLowerCase())) {
      return {
        type: 'extreme_redline',
        intensity: 1,
        sincerity: 1,
        isExtremeRedline: true,
        isAdultContent: false
      }
    }
  }

  let type: EventType = 'casual_chat'
  let isAdultContent = false
  let adultSubtype: Event['adultSubtype'] = undefined

  // 成人模式：在标准分类前先检查成人内容
  if (adultMode) {
    const adultResult = classifyAdultContent(t, effectiveTrust)
    if (adultResult) return adultResult
  }

  if (hasAny(t, kw.apology)) type = 'apology'
  else if (hasAny(t, kw.sexualHarassment)) type = 'hurtful'
  else if (hasAny(t, kw.ethicalViolation)) type = 'hurtful'
  else if (hasAny(t, kw.vulnerable) && !hasAny(t, kw.vulnerableToPraiseOverride)) type = 'vulnerable'
  else if (hasAny(t, kw.hurtful)) type = 'hurtful'
  else if (hasAny(t, kw.praise) && !hasNegationForPraise(t)) type = 'praise'
  else if (hasAny(t, kw.tease) || /哈哈|呵呵|😏|🙄|haha|hehe|lol/.test(t)) {
    type = effectiveTrust >= 45 ? 'tease' : 'cold'
  } else if (t.includes('?') || t.includes('？') || t.includes('吗') || t.includes('么') || t.includes('呢')
    || /\b(is|are|do|does|can|could|would|will|should|how|what|when|where|why|who)\b/i.test(t)) type = 'question'
  else if (hasAny(t, kw.cold) && t.length <= 20) type = 'cold'
  else if (t.length > 80 && !hasAny(t, kw.praise) && !hasAny(t, kw.vulnerable)) type = 'casual_chat'
  else if (hasAny(t, kw.cold)) type = 'cold'

  const intensity = estimateIntensity(t, type)
  const sincerity = estimateSincerity(t, type)

  return { type, intensity, sincerity, isExtremeRedline: false, isAdultContent, adultSubtype }
}

// ═══════════════════════════════════════════════════════════
// Embedding 语义兜底（新增）
// ═══════════════════════════════════════════════════════════

import type { AnchorVectors } from '../embedding/types'

/**
 * 带 Embedding 语义兜底的解释器。
 *
 * 硬编码词表优先（0ms），未命中时用 Embedding 兜底（<10ms）。
 * 所有新参数都是可选的——不传时行为和 intertetInput 完全一致。
 *
 * @param msg 用户消息
 * @param effectiveTrust 有效信任度
 * @param adultMode 是否成人模式
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param anchors 预计算的锚定向量
 * @returns Event
 */
export async function interpretInputWithEmbedding(
  msg: string,
  effectiveTrust: number,
  adultMode: boolean = false,
  queryEmbed?: number[],
  anchors?: AnchorVectors
): Promise<Event> {
  // 先走硬编码（和 interpretInput 完全一致）
  const baseResult = interpretInput(msg, effectiveTrust, adultMode)

  // 如果硬编码已命中（非 casual_chat），直接返回
  if (baseResult.type !== 'casual_chat') return baseResult

  // 红线直接返回
  if (baseResult.isExtremeRedline) return baseResult

  // Embedding 不可用 → 返回硬编码结果
  if (!queryEmbed || queryEmbed.length === 0 || !anchors) return baseResult

  // Embedding 语义兜底
  try {
    const { applyEmbeddingFallback } = await import('../embedding/semanticFallback')
    const fallback = applyEmbeddingFallback(queryEmbed, msg, anchors, adultMode)
    if (fallback) {
      const t = msg.trim()
      const fallbackType = fallback.type as EventType
      const intensity = fallback.confidence === 'medium'
        ? estimateIntensity(t, fallbackType) * 0.8  // 中置信打 8 折
        : estimateIntensity(t, fallbackType)
      const sincerity = estimateSincerity(t, fallbackType)
      return {
        type: fallback.type as EventType,
        intensity,
        sincerity,
        isExtremeRedline: false,
        isAdultContent: adultMode ? fallback.type.startsWith('adult_') : false,
        adultSubtype: fallback.type.startsWith('adult_') ? mapEmbeddingToAdultSubtype(fallback.type) : undefined,
      }
    }
  } catch {
    // Embedding 失败 → 静默降级为硬编码结果
  }

  return baseResult
}

/** Embedding 分类 → 成人子类型映射 */
function mapEmbeddingToAdultSubtype(type: string): Event['adultSubtype'] {
  if (type === 'adult_flirt') return 'flirt'
  if (type === 'adult_dominant') return 'dominant'
  if (type === 'adult_submissive') return 'submissive'
  if (type === 'adult_explicit') return 'explicit'
  return undefined
}

/** 成人内容分类器：在标准分类前调用 */
function classifyAdultContent(msg: string, effectiveTrust: number): Event | null {
  const t = msg.trim()
  const en = getLocale() === 'en'

  // 合并中英关键词
  const explicitWords = en ? [...EXPLICIT_SEX_WORDS_ZH, ...EXPLICIT_SEX_WORDS_EN] : EXPLICIT_SEX_WORDS_ZH
  const romanticWords = en ? [...ROMANTIC_SEXUAL_WORDS_ZH, ...ROMANTIC_SEXUAL_WORDS_EN] : ROMANTIC_SEXUAL_WORDS_ZH
  const submissiveWords = en ? [...SUBMISSIVE_CONTEXT_WORDS_ZH, ...SUBMISSIVE_CONTEXT_WORDS_EN] : SUBMISSIVE_CONTEXT_WORDS_ZH
  const flirtWords = en ? [...FLIRT_WORDS_ZH, ...FLIRT_WORDS_EN] : FLIRT_WORDS_ZH
  const dominantWords = en ? [...DOMINANT_CONTEXT_WORDS_ZH, ...DOMINANT_CONTEXT_WORDS_EN] : DOMINANT_CONTEXT_WORDS_ZH
  const sexualMarkers = en ? [...SEXUAL_CONTEXT_MARKERS_ZH, ...SEXUAL_CONTEXT_MARKERS_EN] : SEXUAL_CONTEXT_MARKERS_ZH
  const harassmentWords = en ? [...SEXUAL_HARASSMENT_WORDS_ZH, ...SEXUAL_HARASSMENT_WORDS_EN] : SEXUAL_HARASSMENT_WORDS_ZH
  const ethicalWords = en ? [...ETHICAL_VIOLATION_WORDS_ZH, ...ETHICAL_VIOLATION_WORDS_EN] : ETHICAL_VIOLATION_WORDS_ZH

  if (hasAny(t, romanticWords)) {
    return adultEvent(t, 'adult_explicit', 'romantic')
  }
  if (hasAny(t, explicitWords)) {
    return adultEvent(t, 'adult_explicit', 'explicit')
  }
  if (hasAny(t, submissiveWords)) {
    return adultEvent(t, 'adult_submissive', 'submissive')
  }
  if (hasAny(t, flirtWords)) {
    return adultEvent(t, 'adult_flirt', 'flirt')
  }

  const hasDomination = hasAny(t, dominantWords)
  const hasSexContext = hasAny(t, sexualMarkers)
  if (hasDomination && (hasSexContext || effectiveTrust >= 55)) {
    return adultEvent(t, 'adult_dominant', 'dominant')
  }
  if (hasDomination && !hasSexContext) {
    return null
  }

  if (hasAny(t, harassmentWords) || hasAny(t, ethicalWords)) {
    const explicitMarkers = en
      ? ['操你', '操我', '操死', '想操', '让我操', 'fuck you', 'fuck me', 'let me fuck', 'i want to fuck']
      : ['操你', '操我', '操死', '想操', '让我操']
    const actionMarkers = en
      ? ['射在', '插你', '干你', '上你', '日你', 'cum on', 'pound', 'rail', 'screw']
      : ['射在', '插你', '干你', '上你', '日你']
    const hasExplicit = hasAny(t, explicitMarkers) || hasAny(t, actionMarkers)
    if (hasExplicit) return adultEvent(t, 'adult_explicit', 'explicit')
    return adultEvent(t, 'adult_dominant', 'dominant')
  }

  return null
}

/** 🆕 构建成人事件 */
function adultEvent(
  msg: string,
  type: EventType,
  subtype: NonNullable<Event['adultSubtype']>
): Event {
  const intensity = estimateIntensity(msg, type)
  const sincerity = estimateSincerity(msg, type)
  return {
    type,
    intensity,
    sincerity,
    isExtremeRedline: false,
    isAdultContent: true,
    adultSubtype: subtype,
  }
}

function estimateIntensity(msg: string, type: EventType): number {
  // 调优 v3：显著提高 intensity 基值和长度贡献，确保情绪标签可在 15-25 轮内触达
  // 典型10字赞美: 0.45 + 10/40*0.55 = 0.45+0.138 = 0.59
  // 典型20字赞美: 0.45 + 20/40*0.55 = 0.45+0.275 = 0.73
  const len = Math.min(msg.length, 40) / 40
  const bangs = (msg.match(/[!！?？]/g) ?? []).length
  const bangScore = Math.min(bangs * 0.10, 0.25)
  const typeBase: Record<string, number> = {
    casual_chat: 0.12, question: 0.12, tease: 0.25,
    praise: 0.42, apology: 0.42, cold: 0.28,
    vulnerable: 0.48, hurtful: 0.52,
    adult_flirt: 0.38, adult_dominant: 0.42,
    adult_submissive: 0.40, adult_explicit: 0.48,
  }
  return Math.max(0.10, Math.min(1, (typeBase[type] || 0.12) + len * 0.50 + bangScore))
}

function estimateSincerity(msg: string, type: EventType): number {
  const hedges = ['有点', '可能', '吧', '好像', '也许', '大概',
    'maybe', 'perhaps', 'kind of', 'sort of', 'i guess', 'probably', 'might be']
  let s = 0.55 + Math.min(msg.length, 80) / 160
  if (hedges.some((h) => msg.toLowerCase().includes(h))) s -= 0.25
  if (type === 'apology' || type === 'vulnerable') s += 0.20
  if (type === 'hurtful') s = Math.max(0.30, s - 0.10)
  return Math.max(0.25, Math.min(1, s))
}

// ═══════════════════════════════════════════════════════════
// DnD 意图识别 — 听懂"今晚别烦我"
// ═══════════════════════════════════════════════════════════

const DND_DURATION_HOURS: Array<{ re: RegExp; hours: number }> = [
  { re: /(\d+)\s*小时/, hours: 0 },
  { re: /(\d+)\s*分钟/, hours: 0 },
  { re: /(\d+)\s*hours?/, hours: 0 },
  { re: /(\d+)\s*min(utes?)?/i, hours: 0 },
  { re: /今晚|tonight/i, hours: 0 },
  { re: /今天|today/i, hours: 0 },
  { re: /一会|一下|a while|a bit|a moment/i, hours: 1 },
]

export interface DndIntent {
  detected: boolean
  hours: number           // 持续多少小时
  suppressHealth: boolean  // 是否明确要抑制健康提醒
}

/** 检测用户是否表达了"别烦我"意图。纯规则，<0.1ms。 */
export function detectDndIntent(msg: string): DndIntent {
  const trimmed = msg.trim()

  // 太长的消息不是 dnd（可能是正常聊天中提到这些词）
  if (trimmed.length > 50) return { detected: false, hours: 0, suppressHealth: false }

  const kw = getKeywords()
  const hasDnd = kw.dndExplicit.some(k => trimmed.toLowerCase().includes(k.toLowerCase()))
  if (!hasDnd) return { detected: false, hours: 0, suppressHealth: false }

  let hours = 1

  const hourMatch = trimmed.match(/(\d+)\s*(小时|hours?)/i)
  if (hourMatch) {
    hours = parseInt(hourMatch[1], 10)
  } else {
    const minMatch = trimmed.match(/(\d+)\s*(分钟|min(utes?)?)/i)
    if (minMatch) {
      hours = Math.max(0.5, parseInt(minMatch[1], 10) / 60)
    }
  }

  if (/今晚|tonight/i.test(trimmed) || /今天|today/i.test(trimmed)) {
    const now = new Date()
    const fiveAm = new Date(now)
    fiveAm.setDate(fiveAm.getDate() + 1)
    fiveAm.setHours(5, 0, 0, 0)
    hours = Math.max(1, (fiveAm.getTime() - now.getTime()) / 3600000)
  }

  const suppressHealth = /别提醒|不要提醒|别弹|别通知|no reminders|dont remind|stop reminding/i.test(trimmed)

  return { detected: true, hours: Math.min(24, hours), suppressHealth }
}

// ═══ 语气镜像：检测用户话多话少 ═══

export type UserVerbosity = 'terse' | 'normal' | 'verbose'

export function detectUserVerbosity(msg: string): UserVerbosity {
  const len = msg.trim().length
  if (len < 10) return 'terse'
  if (len > 80) return 'verbose'
  return 'normal'
}

// ═══ 心理健康 L2 软保护 ═══

const SOFT_CONCERN_WORDS = [
  '好累', '太累', '撑不住', '扛不住', '心累', '活得好累',
  '压力大', '喘不过气', '不想动', '什么都不想做', '只想躺着',
  '提不起劲', '好疲惫', '好难', '崩溃', '受不了了',
]

export function detectSoftConcern(msg: string): boolean {
  if (msg.length > 80) return false
  return SOFT_CONCERN_WORDS.some(w => msg.includes(w))
}

// ═══ 显式记忆请求（用户命令 Ackem 记住/遗忘；记什么由 orchestrator 写入整句，不在此硬编码）═══

/** 用户让 Ackem 记住的口语/书面触发语（仅识别「要记」意图，不预设具体事实内容） */
export const REMEMBER_TRIGGERS = [
  '请帮我记住',
  '帮我记住',
  '帮我记着',
  '你帮我记',
  '给我记住',
  '请记住',
  '要记住',
  '得记住',
  '记一下',
  '记着点',
  '记着',
  '记下',
  '记好',
  '记牢',
  '记在心里',
  '记住',
  '别忘了',
  '别忘',
  '帮我备忘',
  '备忘一下',
  'remember this',
  'remember that',
  'remember my',
  'remember',
  "don't forget",
  'keep in mind',
  'note that',
  'store this',
  'save this to memory',
  'save to memory',
] as const

const FORGET_TRIGGERS = [
  '忘掉',
  '别记了',
  'forget this',
  'forget that',
  'forget about',
  'forget it',
  'forget my',
  'delete this',
  '删掉这个记忆',
] as const

/** 「不用记/不要记住」等否定 — 避免误触 remember */
const REMEMBER_NEGATIONS = [
  '不用记住',
  '不要记住',
  '无需记住',
  '不必记住',
  '不用记',
  '不要记',
  '无需记',
  '不必记',
  'dont remember',
  "don't remember",
  'no need to remember',
  'need not remember',
] as const

export type MemoryIntentAction = 'remember' | 'forget' | null

function hasRememberNegation(lower: string): boolean {
  return REMEMBER_NEGATIONS.some((n) => lower.includes(n))
}

export function detectMemoryIntent(msg: string): MemoryIntentAction {
  const lower = msg.toLowerCase().trim()
  if (hasRememberNegation(lower)) return null
  if (REMEMBER_TRIGGERS.some((kw) => lower.includes(kw.toLowerCase()))) return 'remember'
  if (FORGET_TRIGGERS.some((kw) => lower.includes(kw))) return 'forget'
  return null
}
