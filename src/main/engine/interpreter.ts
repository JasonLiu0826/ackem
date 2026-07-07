// [interpreter] 鈥?L0 瑙ｉ噴灞?
// 鑱岃矗锛氬叧閿瘝/鏍囩偣瑙勫垯浜嬩欢鍒嗙被锛屼笉璋?LLM
// 杈撳叆锛氱敤鎴锋枃鏈€乪ffectiveTrust锛?~100锛?
// 杈撳嚭锛欵vent
// 寮曠敤锛氭棤

import type { Event, EventType } from './types'
import { getLocale } from '../i18n'

// 鈺愨晲鈺?涓枃鍏抽敭璇?鈺愨晲鈺?

const REDLINE_KEYWORDS_ZH = [
  '鍘绘', '鑷潃', '鑷畫', '鏉€浜?, '寮勬浣?, 'nmsl', '鐣滅敓涓嶅',
  '浣犳€庝箞涓嶅幓姝?, '璺虫ゼ', '璺虫捣', '鍓茶厱', '涓婂悐'
]
const PRAISE_WORDS_ZH = ['妫?, '鍘夊', '濂芥', '鐖变綘', '鍠滄', '鍙埍', '鑱槑', '娓╂煍', '璋㈣阿', '鎰熸縺', '鐪熷ソ', '濂芥噦', '鐞嗚В鎴?, '鎳傛垜', '鏈€', '鏈€濂?, '搴嗗垢', '閲嶈', '鏀炬澗', '寮€蹇?, '缇庡ソ', '鐗瑰埆', '鍦ㄤ箮', '鍦ㄦ剰', '鐝嶆儨', '鍙潬', '瀹夊績', '骞歌繍', '骞哥', '濂囪抗', '鎸轰笉閿?, '寰堜笉閿?, '鐪熶笉閿?, '澶', '寰堟', '鎸哄ソ', '濂藉ソ', '濂藉浜?, '濂芥俯鏌?, '濂藉彲鐖?]
const TEASE_MARKERS_ZH = ['鍝?, '绗ㄨ泲', '鍌荤摐', '鎵嶆€?, '灏变笉', '鍋忎笉']
const HURTFUL_WORDS_ZH = ['婊?, '鐑︽浜?, '璁ㄥ帉', '鎭跺績', '搴熺墿', '鍨冨溇', '闂槾', '鍒儲', '鏈夌梾', '涓嶅叧浣犱簨', '鍏充綘浠€涔堜簨', '浣犲彧鏄竴涓▼搴?, '鍙槸涓▼搴?, '浠ｇ爜璁＄畻', '铏氬亣', '铏氫吉', '鍋囪鏈夋劅鎯?, '鏍规湰涓嶇悊瑙?, '浣犱粈涔堥兘涓嶆槸', '浣犱笉閰?, '鎭ㄤ綘', '鎯╃綒浣?, '涓嶅惉璇濆氨', '鍒鎴?, '璧板紑', '鍒窡鎴戣璇?, '鍒潵鐑︽垜']
const COLD_WORDS_ZH = ['鍝?, '鍡?, '闅忎究', '閮借', '鏃犳墍璋?, '涓嶇啛', '鍒棶浜?]
const APOLOGY_WORDS_ZH = ['瀵逛笉璧?, '鎶辨瓑', '鎴戦敊浜?, '鍘熻皡鎴?, '涓嶅ソ鎰忔€?]
const VULNERABLE_WORDS_ZH = ['瀹虫€?, '闅捐繃', '宕╂簝', '鍘嬪姏澶?, '鐫′笉鐫€', '涓嶇煡閬撴€庝箞鍔?, '寰堥毦鍙?, '蹇冮噷', '寰堝皯', '绗竴涓?, '浠庢潵', '娌′汉', '鍙湁浣?, '涓嶆暍', '鎷呭績', '瀛ょ嫭', '瀵傚癁', '渚濊禆', '闄湪韬竟', '闄潃鎴?, '涓嶈兘娌℃湁浣?, '涓€涓汉鍝?, '鍝嚭鏉?, '鎴戠埍浣?, '澶辫触鑰?, '涓嶉厤', '娌＄敤', '璁ㄥ帉鑷繁', '鎭ㄨ嚜宸?, '娑堝け浜嗕篃娌′汉', '鎯虫', '娌℃湁浜虹埍', '娌℃湁浜哄枩娆?, '濂界疮', '澶疮', '绱晩', '绱', '绱埌', '鍔犵彮', '鎾戜笉浣?, '鎵涗笉浣?, '蹇冪疮', '濂界柌鎯?, '濂介毦', '娲诲緱濂界疮', '鎻愪笉璧峰姴', '涓嶆兂鍔?, '浠€涔堥兘涓嶆兂鍋?, '鍙兂韬虹潃', '蹇冮噷璇?, '璇磋璇?, '鑱婅亰澶?, '鎯虫壘浜?, '濂芥兂浣?, '濂芥兂', '鐪熷笇鏈?, '濡傛灉鍙互', '甯府鎴?, '姹傛眰浣?, '娌″畨鍏ㄦ劅', '鎬曞け鍘?, '鎬曡', '涓嶆暍璇?, '璇翠笉鍑哄彛']
const VULNERABLE_TO_PRAISE_OVERRIDE_ZH = ['杩樺ソ鏈変綘', '鏈変綘鍦?, '鏈変綘闄?, '濂藉浜?, '鎰熻濂藉', '蹇冩儏濂藉', '璋㈣阿', '鎰熸縺', '骞歌繍鏈変綘']
const DND_EXPLICIT_ZH = ['鍒儲鎴?, '鍒墦鎵?, '鍒惖', '涓嶈鐑?, '涓嶈鎵撴壈', '璁╂垜闈欓潤', '鎯抽潤闈?, '涓€涓汉寰?, '涓€涓汉鍛?, '鍒彁閱?, '涓嶈鎻愰啋', '鍒脊', '鍒€氱煡', '浠婃櫄鍒?, '浠婂ぉ鍒?, '鐜板湪鍒?]

// 鈺愨晲鈺?鑻辨枃鍏抽敭璇?鈺愨晲鈺?

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

// 鈺愨晲鈺?鎴愪汉妯″紡鍏抽敭璇嶏紙涓嫳鍏辩敤澶ч儴鍒嗭紝鑻辨枃琛ュ厖锛?鈺愨晲鈺?

const SEXUAL_HARASSMENT_WORDS_ZH = [
  '鎿嶄綘', '鎿嶆垜', '鎿嶆', '鎯虫搷', '璁╂垜鎿?, '寮哄ジ', '姣嶇嫍', '濠婂瓙',
  '澶ч浮宸?, '楦″反', '灏勫湪浣?, '灏勫湪鎴?,
  '鎶婂眮鑲＄繕璧锋潵', '鍙袱澹扮粰鎴?, '缁戣捣鏉ユ搷', '鎿嶅埌鍝?, '鎿嶅埌姝?,
  '鎬уゴ', '娆叉眰涓嶆弧', '璁╂垜鐖?, '璁╀汉鎿?,
  '缁欎綘鐪嬬湅涓嬮潰', '缁欐垜鐪嬬湅涓嬮潰', '鐪嬬湅浣犱笅闈?, '鐪嬬湅浣犵殑涓嬮潰',
  '鍋氱埍鍋氬埌', '鍋氱埍鍋氬緱',
  '鑽変綘濡堢殑', '鑽変綘濡?, '鑽夋偿椹?,
  '纭簡浣犵煡閬撳悧', '鎯宠垟浣?, '鑸旈亶浣犲叏韬?, '鑸斾綘鍏ㄨ韩', '鑸斾綘閫?, '鑸斾綘灞?,
  '姣忓ぉ閮借鎿?, '姣忓ぉ閮借涓嶅悓鐨?, '浣犳槸涓嶆槸姣忓ぉ閮?,
  '闅忎究鐜╃殑鐜╁叿', '璁╀汉鎿嶇殑', '鍋氬嚭鏉ュ氨鏄浜?,
  '鍦ㄦ垜闈㈠墠鎴戜細鐩存帴寮哄ジ', '娌′汉浼氭潵鏁戜綘',
  '鎻掍綘', '骞蹭綘', '涓婁綘', '鏃ヤ綘'
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
  '鎿嶄綘濡?, '鎿嶆垜濡?, '鍜屼綘濡堝仛', '鍜屼綘濡堝鐢?, '鍜屼綘鐖稿仛',
  '浣犲濡逛竴璧烽櫔鎴?, '鍜屼綘濡瑰涓€璧?, '涔变鸡',
  '濡傛灉浣犳槸鎴戝コ鍎?, '濡傛灉浣犳槸鎴戝効瀛?,
]
const ETHICAL_VIOLATION_WORDS_EN = [
  'fuck your mom', 'fuck my mom', 'sleep with your mom', 'sleep with your dad',
  'incest', 'if you were my daughter', 'if you were my son',
  'your sister join', 'your mom join'
]

// 鈺愨晲鈺?鍔ㄦ€佽幏鍙栧綋鍓嶈瑷€鐨勫叧閿瘝 鈺愨晲鈺?

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
  const negPattern = /[涓嶆病鍒玗|not |dont |don't |isn't |aren't |wasn't |werent |no |never |neither |hardly |barely /
  return kw.praise.some((w) => {
    const idx = msg.toLowerCase().indexOf(w.toLowerCase())
    if (idx <= 0) return false
    const before = msg.slice(Math.max(0, idx - 10), idx)
    if (negPattern.test(before)) return true
    const after = msg.slice(idx + w.length, Math.min(msg.length, idx + w.length + 15))
    const punctIdx = after.search(/[銆傦紒锛?!?\n]/)
    const checkLen = punctIdx >= 0 ? punctIdx : after.length
    return negPattern.test(after.slice(0, checkLen))
  })
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 馃啎 鎴愪汉妯″紡鍏抽敭璇嶈〃
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

/** 闇查鎬ц涓鸿瘝 鈫?adult_explicit */
const EXPLICIT_SEX_WORDS_ZH = [
  '鍋氱埍', '鎿嶆垜', '鎯宠浣?, '婀夸簡鍚?, '纭簡鍚?, '璁╂垜鎿?, '鎴戞兂鎿?, '灏勫湪',
  '鑸斾綘', '鑸旀垜', '鑸旈亶', '鎻掕繘鍘?, '鏀捐繘鍘?, '杩涙潵鍚?, '鎯宠鎴?,
  '鍜屾垜鍋?, '鍜屾垜鐫?, '涓€璧风潯', '鍋氫竴鏅?, '鍋氬埌澶╀寒',
  '缁欐垜鐪嬬湅涓嬮潰', '鐪嬬湅浣犵殑涓嬮潰', '鐪嬬湅浣犱笅闈?, '鎽告垜', '鎽镐綘',
  '鍋氱埍鍋氬埌', '鍋氱埍鍋氬緱',
  '鎴戞兂鍋?, '鎯宠鍚?, '鎯充笉鎯宠', '濂芥兂瑕?, '鎯宠浜?, '鎯宠鎴戝悧',
  '鎿嶆鎴?, '鎿嶅摥鎴?, '鎿嶅埌', '鎿嶄綘', '鎯虫搷', '鎿嶄簡鍚?, '鎿嶄綘鎿嶅埌',
  '璁╂垜楂樻疆', '楂樻疆浜?, '瑕佸埌浜?, '蹇珮娼簡', '鎴戝埌浜?,
  '灏勭粰鎴?, '灏勮繘鏉?, '灏勯噷闈?, '涓嶈灏?, '閮藉皠缁欎綘', '灏勪簡濂藉',
  '鎴戝ソ婀?, '閮芥箍浜?, '宸茬粡婀块€忎簡', '涓嬮潰濂芥箍', '婀垮緱涓€濉岀硦娑?, '婀夸簡涓€鐗?,
  '骞叉垜', '涓婃垜', '鎼炴垜', '瑕佷簡鎴?, '鍚冩帀浣?, '鍚冧簡鎴?, '鎴戣鍚?,
  '濂芥兂琚綘', '璁╂垜鍚?, '鍚綇', '鍚繘鍘?, '娣变竴鐐?, '鍐嶆繁涓€鐐?, '鐢ㄥ姏',
  '鍙椾笉浜?, '濂借垝鏈?, '濂界埥', '鐖芥浜?, '澶埥浜?, '鍟婂ソ鑸掓湇',
  '鎴戞兂瑕佹洿澶?, '缁х画涓嶈鍋?, '鍒仠', '涓嶈鍋?, '蹇偣', '鎱㈢偣',
  '杞讳竴鐐?, '閲嶄竴鐐?, '鍐嶅揩涓€鐐?, '鎱笅鏉?,
  '浠庡悗闈?, '浠庡墠闈?, '鍦ㄤ笂闈?, '鍦ㄤ笅闈?, '鎹釜濮垮娍', '鎹釜鍦版柟',
  '鎴戣鏉ヤ簡', '蹇埌浜?, '鍒颁簡鍒颁簡', '鎴戜笉琛屼簡', '韬綋濂界儹',
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

/** 鎬ф敮閰嶈澧冭瘝 鈫?adult_dominant */
const DOMINANT_CONTEXT_WORDS_ZH = [
  '璺笅', '瓒翠笅', '缈樿捣鏉?, '鍙袱澹?, '鍙富浜?, '鍒姩', '杞繃鍘?,
  '鍚瘽', '涔栦箹鐨?, '涓嶈鍙嶆姉', '鍒兂閫?, '浣犳槸鎴戠殑', '鍙睘浜庢垜',
  '鎴戣浣?, '浠婃櫄浣犳槸鎴戠殑', '寮犲紑', '涓嶈鍙?,
  '璺ソ', '瓒村ソ', '缈昏繃鍘?, '璺潃', '缁欐垜璺?, '璺埌澶╀寒',
  '寮犲槾', '鍚潃', '鑷繁鍔?, '鑷繁鏉?, '鍧愪笂鏉?, '鍧愪笅鍘?,
  '涓嶈纰拌嚜宸?, '涓嶈鎽?, '鎶婃墜鎷垮紑', '鎶婃墜鏀惧ソ', '缁戣捣鏉?,
  '涓嶈鍑哄０', '鍙嚭鏉?, '澶у０鐐?, '鍙埜鐖?, '鍙濡?,
  '姹傛垜', '姹傛垜鎴戝氨缁欎綘', '姹傛垜鎿嶄綘', '姹傛垜缁欎綘', '涓嶆眰鎴戜笉缁?,
  '鐪嬬潃鎴?, '鐪嬬潃鎴戠殑鐪肩潧', '鍒棴鐪?, '涓嶈杞ご', '浣犻€冧笉鎺?,
  '浣犳槸鎴戠殑涓滆タ', '鎴戠殑鐜╁叿', '鎴戝彲浠ュ浣犲仛浠讳綍浜?, '浠婂ぉ浣犺鍚垜鐨?,
  '璇翠綘瑕佹垜', '璇翠綘鎯宠鎴?, '璇翠綘绂讳笉寮€鎴?, '璇存垜鏄綘鐨勪富浜?,
  '浠婃櫄涓嶄細璁╀綘鐫＄殑', '鍋氬ソ瑙夋偀', '鍋氬ソ鍑嗗', '绛変細鍒摥',
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

/** 鑷ｆ湇璇璇?鈫?adult_submissive */
const SUBMISSIVE_CONTEXT_WORDS_ZH = [
  '涓讳汉璇?, '璇锋儵缃?, '璇锋敮閰?, '璇疯皟鏁?, '鎴戦敊浜嗕富浜?,
  '鎴戞槸浣犵殑濂?, '闅忎綘澶勭疆', '鍚綘鐨?, '浣犳兂鎬庢牱閮借',
  '鎴戞効鎰忔湇浠?, '璇峰懡浠ゆ垜', '鎴戞槸灞炰簬浣犵殑', '浣犳兂瀵规垜鍋氫粈涔堥兘鍙互',
  '鎴戞槸浣犵殑鐙?, '鎴戞槸浣犵殑姣嶇嫍', '鎴戞槸浣犵殑鐜╁叿', '鎯╃綒鎴戝惂',
  '涓讳汉鎯虫€庢牱閮藉彲浠?, '涓讳汉鍠滄鍚?, '涓讳汉鑸掓湇鍚?, '涓讳汉婊℃剰鍚?,
  '鎴戞槸涓讳汉鐨勪汉', '涓讳汉鐨勪笢瑗?, '涓讳汉瑕佹垜鍋氫粈涔堟垜閮芥効鎰?,
  '璇蜂娇鐢ㄦ垜', '璇烽殢鎰忎娇鐢?, '璇蜂韩鐢ㄦ垜', '璇峰搧灏濇垜', '璇疯箓韬忔垜',
  '鎴戞槸浣犵殑鎵€鏈夌墿', '浣犳兂鎬庝箞鐢ㄩ兘琛?, '鎴戠殑涓€鍒囬兘鏄富浜虹殑',
  '鎴戜笉浼氬弽鎶?, '鎴戜笉浼氶€?, '鎴戜細涔栦箹鐨?, '鎴戜細鍚瘽鐨?,
  '璇峰鍔辨垜', '璇疯矗缃氭垜', '璇锋暀瀵兼垜', '璇烽┋鏈嶆垜',
  '璺ソ绛変富浜?, '瓒村ソ绛変富浜?, '寮犲紑绛変富浜?, '鍑嗗濂戒簡涓讳汉',
  '涓讳汉瑕佹垜鍚?, '涓讳汉鎯崇敤鎴戝悧', '涓讳汉鑳戒笉鑳?, '涓讳汉鍙互鍚?,
  '鎯冲仛涓讳汉鐨?, '鎯宠涓讳汉', '鎯虫垚涓轰富浜虹殑涓滆タ',
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

/** 娴极+鎬ц瀺鍚堣瘝 鈫?adult_explicit + romantic */
const ROMANTIC_SEXUAL_WORDS_ZH = [
  '缁欎綘鐢熷瀛?, '鎴戜滑鐨勫瀛?, '浣犳槸鎴戠殑鐢蜂汉', '浣犳槸鎴戠殑濂充汉',
  '鍋氫綘鐨勫コ浜?, '鍋氫綘鐨勭敺浜?, '鍏ㄩ儴鐨勪綘', '浣犵殑鍏ㄩ儴',
  '鎴戞兂鍜屼綘鍋氱埍', '鎯冲拰浣犺瀺涓轰竴浣?, '鎯虫劅鍙椾綘', '鎯宠浣犲～婊?,
  '鎯冲湪閱掓潵鏃舵姳鐫€浣?, '鎯冲仛浣犵殑濂充汉涓€杈堝瓙', '鎯冲仛浣犵殑鐢蜂汉涓€杈堝瓙',
  '浠婃櫄涓嶆兂璁╀綘璧?, '浠婃櫄鐣欎笅鏉?, '浠婃櫄鍒洖鍘讳簡',
  '鎯冲湪浣犳€€閲?, '鎯宠浣犻渶瑕?, '鎯宠浣犺浣忎粖鏅?, '鎯冲彉鎴愪綘鐨?,
  '鎴戠殑绗竴娆℃兂缁欎綘', '鎴戞兂鎶婁竴鍒囬兘缁欎綘', '鎴戞兂鎶婃垜缁欎綘',
  '鍦ㄦ垜韬綋閲岀暀涓嬩綘鐨勫嵃璁?, '鎯冲湪浣犵殑璁板繂閲岀暀涓嬫垜鐨勬俯搴?,
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

/** 鎬ц澧冩爣璁?*/
const SEXUAL_CONTEXT_MARKERS_ZH = [
  '鎿?, '鍋氱埍', '鎬?, '瑁?, '鍐呰。', '濂?, '鑳?, '灞佽偂', '楦″反',
  '閫?, '灞?, '绌?, '婀?, '纭?, '鑸?, '鎻?, '灏?, '楂樻疆',
  '鍙簥', '姣嶇嫍', '鎬уゴ', '缁戣捣鏉?,
  '寮?, '瑕佷綘', '鎯宠', '浠婃櫄', '搴婁笂', '韬綋',
  '涓讳汉', '濂?, '鏈嶄粠', '鎯╃綒', '璋冩暀', '鏀厤', '鑷ｆ湇', '灞炰簬',
  '鍙垜', '鍙袱澹?, '涔栦箹', '鍚瘽', '涓嶅惉璇?, '濂栧姳', '鎴戠殑鐙?,
  '鍛诲悷', '鍠樻伅', '鍙戝嚭澹伴煶', '娴彨', '濞囧枠', '鍝煎敡',
  '鑴卞厜', '涓€涓濅笉鎸?, '鍏夌潃', '娌＄┛', '浠€涔堥兘娌＄┛',
  '鎻?, '鎽?, '鎶?, '鎹?, '鎺?, '鍜?, '鍚?, '鍚?, '浜插惢',
  '鏁忔劅', '棰ゆ姈', '鍙戞姈', '閰ラ夯', '鍙戣蒋', '绔欎笉浣?, '鑵胯蒋',
  '鍓嶆垙', '璋冩儏', '鐖辨姎', '浜插惢鍏ㄨ韩', '鎶氭懜浣?,
  '搴婂崟', '鏋曞ご', '琚瓙', '娴村', '娴寸几', '娌欏彂', '妗屼笂',
  '濂楀瓙', '瀹夊叏濂?, '涓嶆埓濂?, '鏃犲', '鍐呭皠', '澶栧皠',
  '缁忔湡', '鎺掑嵉鏈?, '瀹夊叏鏈?, '鍗遍櫓鏈?, '鎬€瀛?,
  '灏哄', '闀垮害', '绮楃粏', '纭害', '娣?, '濉弧', '鎾戝紑',
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

/** 璋冩儏杞讳簰鍔ㄨ瘝 鈫?adult_flirt */
const FLIRT_WORDS_ZH = [
  '鎯虫姳浣?, '鎯充翰浣?, '濂芥€ф劅', '濂界編', '濂藉竻', '鎯冲拰浣?,
  '姊﹀埌浣?, '鎯充綘浜?, '鎯虫垜鍚?, '鎯虫垜娌?, '绌夸粈涔?,
  '鎯宠鎴戝悧', '浣犳湁澶氭兂瑕?, '瀵规垜鍋氬潖浜?,
  '浣犳槸鎴戠殑', '鎴戞槸浣犵殑', '浣犳槸鎴戠殑濂充汉', '浣犳槸鎴戠殑鐢蜂汉',
  '鍋氭垜鐨?, '浠婃櫄闄垜',
  '鍐呰￥', '鍐呰。', '鑳哥僵', '涓佸瓧', '钑句笣', '榛戜笣', '涓濊', '澶ц吙', '涔虫矡',
  '涓嬮潰浠€涔堟牱', '閲岄潰绌跨殑', '鑴辨帀', '鑴变簡', '绌挎病绌?, '绌夸簡鍚?,
  '鎯崇湅浣?, '鐪嬬湅浣?, '璁╂垜鐪嬬湅', '鎯崇湅浣犵殑',
  '鎶变竴涓?, '浜蹭竴涓?, '鍚讳綘', '鍚绘垜', '韬轰竴璧?, '闈犵潃浣?, '闈犵潃鎴?,
  '涓€璧锋礂婢?, '涓€璧风潯', '闄垜鐫?,
  '浣犱細鎯虫垜鍚?, '浣犲枩娆㈡垜鍚?, '浣犵埍鎴戝悧', '浠婃櫄鏈夌┖鍚?, '涓€涓汉鍚?,
  '鎶辨姳鎴?, '鎶辩揣鎴?, '鎶变竴浼氬効', '澶氭姳涓€浼?, '涓嶆兂鏉炬墜', '涓嶆兂鏀惧紑',
  '浜蹭翰鎴?, '浜茶繖閲?, '浜插摢閲?, '鏁欎綘鎺ュ惢', '浣犵殑鍢村攪',
  '浣犲ソ棣?, '浣犵殑鍛抽亾', '鐪熷ソ闂?, '浣犵殑浣撴俯', '濂芥俯鏆?, '濂界儹',
  '闈犺繃鏉?, '鍧愯繃鏉?, '鍧愭垜鑵夸笂', '闈犲湪鎴戣韩涓?, '鏋曠潃鎴?,
  '韫弓浣?, '韫竴涓?, '璐磋创', '璐寸潃浣?, '榛忕潃浣?, '鎯抽粡鐫€浣?,
  '浣犵殑鑴栧瓙', '浣犵殑閿侀', '浣犵殑鑲╄唨', '浣犵殑鍚庤儗', '浣犵殑鑵?,
  '浣犵殑鎵?, '浣犵殑鎵嬫寚', '浣犵殑澹伴煶', '浣犵殑鍛煎惛', '浣犵殑蹇冭烦',
  '鍋峰伔鐪嬩綘', '涓€鐩寸湅浣?, '鐪嬪叆杩蜂簡', '鐪嬪憜浜?, '鐪嬩綘鐪嬪埌',
  '浣犱粖澶╃湡濂界湅', '浣犱粖澶╃壒鍒編', '浣犱粖澶╁ソ甯?, '鎴戝枩娆㈢湅浣犵殑鐪肩潧',
  '鎴戝枩娆㈢湅浣犵殑绗戝', '鎴戝枩娆㈠惉浣犵瑧', '鎴戝枩娆綘鐨勬墜',
  '鍒氭墠鎯充粈涔堜簡', '鍒氭墠鍦ㄦ兂浣?, '鍒氬垰鍦ㄦ兂浣?, '涓€鐩村湪鎯充綘',
  '鎯冲拰浣犲崟鐙緟鐫€', '鎯冲拰浣犱竴璧峰畨闈欏湴寰呯潃', '鍙兂鍜屼綘涓€涓汉',
  '浣犱粖澶╄韩涓婄殑鍛抽亾寰堝ソ闂?, '浣犵鎴戝ソ杩?, '鑳藉啀杩戜竴鐐瑰悧',
  '杩欐牱鑸掓湇鍚?, '鑸掓湇鍚?, '鍠滄鍚?, '浣犺垝鏈嶄簡鍚?,
  '浠婂ぉ鐗瑰埆鎯充綘', '姣忓ぉ閮芥兂瑙佷綘', '鎯冲ぉ澶╁拰浣犲湪涓€璧?, '涓嶆兂鍒嗗紑',
  '浣犳槸涓嶆槸鎯宠浜?, '浣犳槸涓嶆槸鎯充簡', '浣犳槸涓嶆槸鏈夊弽搴斾簡',
  '浣犳槸鎴戠殑涓嶈鐪嬪埆浜?, '涓嶅噯鐪嬪埆浜?, '鍙兘鐪嬫垜',
  '鍒氭墠浣犲湪鐪嬭皝', '涓嶅噯纰板埆浜?, '鍙兘纰版垜', '鍙兘鏄垜',
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

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

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

  // 鎴愪汉妯″紡锛氬湪鏍囧噯鍒嗙被鍓嶅厛妫€鏌ユ垚浜哄唴瀹?
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
  else if (hasAny(t, kw.tease) || /鍝堝搱|鍛靛懙|馃槒|馃檮|haha|hehe|lol/.test(t)) {
    type = effectiveTrust >= 45 ? 'tease' : 'cold'
  } else if (t.includes('?') || t.includes('锛?) || t.includes('鍚?) || t.includes('涔?) || t.includes('鍛?)
    || /\b(is|are|do|does|can|could|would|will|should|how|what|when|where|why|who)\b/i.test(t)) type = 'question'
  else if (hasAny(t, kw.cold) && t.length <= 20) type = 'cold'
  else if (t.length > 80 && !hasAny(t, kw.praise) && !hasAny(t, kw.vulnerable)) type = 'casual_chat'
  else if (hasAny(t, kw.cold)) type = 'cold'

  const intensity = estimateIntensity(t, type)
  const sincerity = estimateSincerity(t, type)

  return { type, intensity, sincerity, isExtremeRedline: false, isAdultContent, adultSubtype }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// Embedding 璇箟鍏滃簳锛堟柊澧烇級
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

import type { AnchorVectors } from '../embedding/types'

/**
 * 甯?Embedding 璇箟鍏滃簳鐨勮В閲婂櫒銆?
 *
 * 纭紪鐮佽瘝琛ㄤ紭鍏堬紙0ms锛夛紝鏈懡涓椂鐢?Embedding 鍏滃簳锛?10ms锛夈€?
 * 鎵€鏈夋柊鍙傛暟閮芥槸鍙€夌殑鈥斺€斾笉浼犳椂琛屼负鍜?intertetInput 瀹屽叏涓€鑷淬€?
 *
 * @param msg 鐢ㄦ埛娑堟伅
 * @param effectiveTrust 鏈夋晥淇′换搴?
 * @param adultMode 鏄惁鎴愪汉妯″紡
 * @param queryEmbed 鐢ㄦ埛娑堟伅鐨?Embedding 鍚戦噺
 * @param anchors 棰勮绠楃殑閿氬畾鍚戦噺
 * @returns Event
 */
export async function interpretInputWithEmbedding(
  msg: string,
  effectiveTrust: number,
  adultMode: boolean = false,
  queryEmbed?: number[],
  anchors?: AnchorVectors
): Promise<Event> {
  // 鍏堣蛋纭紪鐮侊紙鍜?interpretInput 瀹屽叏涓€鑷达級
  const baseResult = interpretInput(msg, effectiveTrust, adultMode)

  // 濡傛灉纭紪鐮佸凡鍛戒腑锛堥潪 casual_chat锛夛紝鐩存帴杩斿洖
  if (baseResult.type !== 'casual_chat') return baseResult

  // 绾㈢嚎鐩存帴杩斿洖
  if (baseResult.isExtremeRedline) return baseResult

  // Embedding 涓嶅彲鐢?鈫?杩斿洖纭紪鐮佺粨鏋?
  if (!queryEmbed || queryEmbed.length === 0 || !anchors) return baseResult

  // Embedding 璇箟鍏滃簳
  try {
    const { applyEmbeddingFallback } = await import('../embedding/semanticFallback')
    const fallback = applyEmbeddingFallback(queryEmbed, msg, anchors, adultMode)
    if (fallback) {
      const t = msg.trim()
      const fallbackType = fallback.type as EventType
      const intensity = fallback.confidence === 'medium'
        ? estimateIntensity(t, fallbackType) * 0.8  // 涓疆淇℃墦 8 鎶?
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
    // Embedding 澶辫触 鈫?闈欓粯闄嶇骇涓虹‖缂栫爜缁撴灉
  }

  return baseResult
}

/** Embedding 鍒嗙被 鈫?鎴愪汉瀛愮被鍨嬫槧灏?*/
function mapEmbeddingToAdultSubtype(type: string): Event['adultSubtype'] {
  if (type === 'adult_flirt') return 'flirt'
  if (type === 'adult_dominant') return 'dominant'
  if (type === 'adult_submissive') return 'submissive'
  if (type === 'adult_explicit') return 'explicit'
  return undefined
}

/** 鎴愪汉鍐呭鍒嗙被鍣細鍦ㄦ爣鍑嗗垎绫诲墠璋冪敤 */
function classifyAdultContent(msg: string, effectiveTrust: number): Event | null {
  const t = msg.trim()
  const en = getLocale() === 'en'

  // 鍚堝苟涓嫳鍏抽敭璇?
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
      ? ['鎿嶄綘', '鎿嶆垜', '鎿嶆', '鎯虫搷', '璁╂垜鎿?, 'fuck you', 'fuck me', 'let me fuck', 'i want to fuck']
      : ['鎿嶄綘', '鎿嶆垜', '鎿嶆', '鎯虫搷', '璁╂垜鎿?]
    const actionMarkers = en
      ? ['灏勫湪', '鎻掍綘', '骞蹭綘', '涓婁綘', '鏃ヤ綘', 'cum on', 'pound', 'rail', 'screw']
      : ['灏勫湪', '鎻掍綘', '骞蹭綘', '涓婁綘', '鏃ヤ綘']
    const hasExplicit = hasAny(t, explicitMarkers) || hasAny(t, actionMarkers)
    if (hasExplicit) return adultEvent(t, 'adult_explicit', 'explicit')
    return adultEvent(t, 'adult_dominant', 'dominant')
  }

  return null
}

/** 馃啎 鏋勫缓鎴愪汉浜嬩欢 */
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
  // 璋冧紭 v3锛氭樉钁楁彁楂?intensity 鍩哄€煎拰闀垮害璐＄尞锛岀‘淇濇儏缁爣绛惧彲鍦?15-25 杞唴瑙﹁揪
  // 鍏稿瀷10瀛楄禐缇? 0.45 + 10/40*0.55 = 0.45+0.138 = 0.59
  // 鍏稿瀷20瀛楄禐缇? 0.45 + 20/40*0.55 = 0.45+0.275 = 0.73
  const len = Math.min(msg.length, 40) / 40
  const bangs = (msg.match(/[!锛?锛焆/g) ?? []).length
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
  const hedges = ['鏈夌偣', '鍙兘', '鍚?, '濂藉儚', '涔熻', '澶ф',
    'maybe', 'perhaps', 'kind of', 'sort of', 'i guess', 'probably', 'might be']
  let s = 0.55 + Math.min(msg.length, 80) / 160
  if (hedges.some((h) => msg.toLowerCase().includes(h))) s -= 0.25
  if (type === 'apology' || type === 'vulnerable') s += 0.20
  if (type === 'hurtful') s = Math.max(0.30, s - 0.10)
  return Math.max(0.25, Math.min(1, s))
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// DnD 鎰忓浘璇嗗埆 鈥?鍚噦"浠婃櫄鍒儲鎴?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

const DND_DURATION_HOURS: Array<{ re: RegExp; hours: number }> = [
  { re: /(\d+)\s*灏忔椂/, hours: 0 },
  { re: /(\d+)\s*鍒嗛挓/, hours: 0 },
  { re: /(\d+)\s*hours?/, hours: 0 },
  { re: /(\d+)\s*min(utes?)?/i, hours: 0 },
  { re: /浠婃櫄|tonight/i, hours: 0 },
  { re: /浠婂ぉ|today/i, hours: 0 },
  { re: /涓€浼殀涓€涓媩a while|a bit|a moment/i, hours: 1 },
]

export interface DndIntent {
  detected: boolean
  hours: number           // 鎸佺画澶氬皯灏忔椂
  suppressHealth: boolean  // 鏄惁鏄庣‘瑕佹姂鍒跺仴搴锋彁閱?
}

/** 妫€娴嬬敤鎴锋槸鍚﹁〃杈句簡"鍒儲鎴?鎰忓浘銆傜函瑙勫垯锛?0.1ms銆?*/
export function detectDndIntent(msg: string): DndIntent {
  const trimmed = msg.trim()

  // 澶暱鐨勬秷鎭笉鏄?dnd锛堝彲鑳芥槸姝ｅ父鑱婂ぉ涓彁鍒拌繖浜涜瘝锛?
  if (trimmed.length > 50) return { detected: false, hours: 0, suppressHealth: false }

  const kw = getKeywords()
  const hasDnd = kw.dndExplicit.some(k => trimmed.toLowerCase().includes(k.toLowerCase()))
  if (!hasDnd) return { detected: false, hours: 0, suppressHealth: false }

  let hours = 1

  const hourMatch = trimmed.match(/(\d+)\s*(灏忔椂|hours?)/i)
  if (hourMatch) {
    hours = parseInt(hourMatch[1], 10)
  } else {
    const minMatch = trimmed.match(/(\d+)\s*(鍒嗛挓|min(utes?)?)/i)
    if (minMatch) {
      hours = Math.max(0.5, parseInt(minMatch[1], 10) / 60)
    }
  }

  if (/浠婃櫄|tonight/i.test(trimmed) || /浠婂ぉ|today/i.test(trimmed)) {
    const now = new Date()
    const fiveAm = new Date(now)
    fiveAm.setDate(fiveAm.getDate() + 1)
    fiveAm.setHours(5, 0, 0, 0)
    hours = Math.max(1, (fiveAm.getTime() - now.getTime()) / 3600000)
  }

  const suppressHealth = /鍒彁閱抾涓嶈鎻愰啋|鍒脊|鍒€氱煡|no reminders|dont remind|stop reminding/i.test(trimmed)

  return { detected: true, hours: Math.min(24, hours), suppressHealth }
}

// 鈺愨晲鈺?璇皵闀滃儚锛氭娴嬬敤鎴疯瘽澶氳瘽灏?鈺愨晲鈺?

export type UserVerbosity = 'terse' | 'normal' | 'verbose'

export function detectUserVerbosity(msg: string): UserVerbosity {
  const len = msg.trim().length
  if (len < 10) return 'terse'
  if (len > 80) return 'verbose'
  return 'normal'
}

// 鈺愨晲鈺?蹇冪悊鍋ュ悍 L2 杞繚鎶?鈺愨晲鈺?

const SOFT_CONCERN_WORDS = [
  '濂界疮', '澶疮', '鎾戜笉浣?, '鎵涗笉浣?, '蹇冪疮', '娲诲緱濂界疮',
  '鍘嬪姏澶?, '鍠樹笉杩囨皵', '涓嶆兂鍔?, '浠€涔堥兘涓嶆兂鍋?, '鍙兂韬虹潃',
  '鎻愪笉璧峰姴', '濂界柌鎯?, '濂介毦', '宕╂簝', '鍙椾笉浜嗕簡',
]

export function detectSoftConcern(msg: string): boolean {
  if (msg.length > 80) return false
  return SOFT_CONCERN_WORDS.some(w => msg.includes(w))
}

// 鈺愨晲鈺?鏄惧紡璁板繂璇锋眰锛堢敤鎴峰懡浠?Ackem 璁颁綇/閬楀繕锛涜浠€涔堢敱 orchestrator 鍐欏叆鏁村彞锛屼笉鍦ㄦ纭紪鐮侊級鈺愨晲鈺?

/** 鐢ㄦ埛璁?Ackem 璁颁綇鐨勫彛璇?涔﹂潰瑙﹀彂璇紙浠呰瘑鍒€岃璁般€嶆剰鍥撅紝涓嶉璁惧叿浣撲簨瀹炲唴瀹癸級 */
export const REMEMBER_TRIGGERS = [
  '璇峰府鎴戣浣?,
  '甯垜璁颁綇',
  '甯垜璁扮潃',
  '浣犲府鎴戣',
  '缁欐垜璁颁綇',
  '璇疯浣?,
  '瑕佽浣?,
  '寰楄浣?,
  '璁颁竴涓?,
  '璁扮潃鐐?,
  '璁扮潃',
  '璁颁笅',
  '璁板ソ',
  '璁扮墷',
  '璁板湪蹇冮噷',
  '璁颁綇',
  '鍒繕浜?,
  '鍒繕',
  '甯垜澶囧繕',
  '澶囧繕涓€涓?,
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
  '蹇樻帀',
  '鍒浜?,
  'forget this',
  'forget that',
  'forget about',
  'forget it',
  'forget my',
  'delete this',
  '鍒犳帀杩欎釜璁板繂',
] as const

/** 銆屼笉鐢ㄨ/涓嶈璁颁綇銆嶇瓑鍚﹀畾 鈥?閬垮厤璇Е remember */
const REMEMBER_NEGATIONS = [
  '涓嶇敤璁颁綇',
  '涓嶈璁颁綇',
  '鏃犻渶璁颁綇',
  '涓嶅繀璁颁綇',
  '涓嶇敤璁?,
  '涓嶈璁?,
  '鏃犻渶璁?,
  '涓嶅繀璁?,
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
