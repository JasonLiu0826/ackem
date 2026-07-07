// [seed-test-data] 鈥?瀹炴満娴嬭瘯鏁版嵁绉嶅瓙 v3锛?00 鏉?+ 鏃堕棿鍒嗗眰锛?
// 妯℃嫙鐢ㄦ埛 6 涓湀浣跨敤锛岃蹇嗘寜鏃堕棿灞傚垎甯冿細鏂伴矞(0-3d) / 杩戞湡(3-14d) / 涓湡(14-60d) / 杩滄湡(60-180d) / 娣辫蹇?180-365d)
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FactStore, defaultFactsPath } from '../memory/factStore.js'
import { EpisodicStore, defaultEpisodesPath } from '../memory/episodicStore.js'
import { KnowledgeGraph, defaultKgPath } from '../memory/knowledgeGraph.js'
import { MemoryRetriever } from '../memory/retriever.js'
import { defaultFullState, saveState } from './state-persistence.js'
import { PERSONALITY_PRESETS } from '../personalityPresets.js'
import { getDatabase, closeAllDatabases } from '../db/database.js'
import type { FullState, EmotionalContext } from './types.js'

const NOW = Date.now()
const TODAY = new Date(NOW).toISOString().slice(0, 10)
const SESSION = `seed-${NOW}`
const YEAR = new Date(NOW).getFullYear()

/** 鍒涘缓绮剧‘鏃堕棿鎴筹細daysAgo 澶╁墠 + hour 鐐?*/
function ts(daysAgo: number, hour = 12): string {
  const ms = NOW - daysAgo * 86400000 - (12 - hour) * 3600000
  return new Date(ms).toISOString()
}

const EC = {
  n:  { valence: 0.3, intensity: 0.5, relStage: 'FAMILIAR' as const, trust: 55, atmosphere: 'neutral' as const },
  p:  { valence: 0.7, intensity: 0.7, relStage: 'FAMILIAR' as const, trust: 60, atmosphere: 'warm' as const },
  neg: { valence: -0.4, intensity: 0.6, relStage: 'FAMILIAR' as const, trust: 45, atmosphere: 'cool' as const },
  v:  { valence: -0.2, intensity: 0.8, relStage: 'FAMILIAR' as const, trust: 58, atmosphere: 'neutral' as const },
  i:  { valence: 0.8, intensity: 0.9, relStage: 'INTIMATE' as const, trust: 70, atmosphere: 'warm' as const },
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 200 鏉′簨瀹?鈥?鎸夋椂闂村眰鍒嗗竷
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

type F = { d:string; sub:string; s:string; sum:string; c:number; t:string[]; ec:EmotionalContext; trn:number; hr:number; age?:{age:number;mmdd:string;yr:number} }

// 鈹€鈹€ 鏂伴矞灞?(0-3澶? ~25鏉? 鈹€鈹€ 楂樺彫鍥炵巼锛岃繎鏈熶簨浠?鈹€鈹€
const FRESH: F[] = [
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鐘舵€佷笉閿欙紝鍑嗘椂涓嬬彮浜?,c:0.7,t:['鍑嗘椂','涓嬬彮','鐘舵€佸ソ'],ec:EC.p,trn:195,hr:18 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ琚皬闆呭じ浜嗭紝璇翠粬浠ｇ爜鍐欏緱濂?,c:0.75,t:['灏忛泤','澶?,'浠ｇ爜'],ec:EC.p,trn:196,hr:14 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ涓€涓汉鍚冧簡鐏攨锛屾湁鐐瑰鐙?,c:0.65,t:['涓€涓汉','鐏攨','瀛ょ嫭'],ec:EC.v,trn:197,hr:21 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ蹇冩儏涓€鑸紝娌′粈涔堢壒鍒殑浜?,c:0.5,t:['蹇冩儏','涓€鑸?],ec:EC.n,trn:198,hr:20 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ浠ｇ爜鍚堝苟鍐茬獊鎼炰簡涓ゅ皬鏃?,c:0.55,t:['鍚堝苟鍐茬獊','浠ｇ爜'],ec:EC.neg,trn:199,hr:16 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鍐欎簡涓€涓嚜鍔ㄥ寲鑴氭湰锛岀渷浜嗗緢澶氶噸澶嶅伐浣?,c:0.7,t:['鑷姩鍖?,'鑴氭湰'],ec:EC.p,trn:200,hr:11 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鍑嗘椂涓嬬彮浜嗭紝闅惧緱',c:0.55,t:['鍑嗘椂','涓嬬彮','闅惧緱'],ec:EC.p,trn:201,hr:18 },
  { d:'HEALTH',sub:'MENTAL',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鎰熻鐘舵€佷笉閿欙紝绮惧姏鍏呮矝',c:0.6,t:['鐘舵€佸ソ','绮惧姏'],ec:EC.p,trn:202,hr:10 },
  { d:'HEALTH',sub:'EXERCISE',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鍋氫簡20涓刊鍗ф拺锛屾槸杩欏懆绗竴娆¤繍鍔?,c:0.5,t:['淇崸鎾?,'杩愬姩'],ec:EC.n,trn:203,hr:20 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'灏忛泤',sum:'灏忔槑浠婂ぉ鍦ㄩ鍫傚伓閬囧皬闆咃紝涓€璧峰悆浜嗗崍楗?,c:0.65,t:['灏忛泤','椋熷爞','鍗堥キ'],ec:EC.p,trn:204,hr:12 },
  { d:'RELATIONSHIP',sub:'PET',s:'鍜挭',sum:'鍜挭浠婂ぉ鐗瑰埆涔栵紝瓒村湪灏忔槑鑵夸笂鐫′簡涓€涓嬪崍',c:0.7,t:['鍜挭','涔?,'鐫¤'],ec:EC.p,trn:205,hr:15 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濡堝',sum:'濡堝浠婂ぉ鎵撶數璇濇潵锛岄棶灏忔槑鍚冧簡娌?,c:0.6,t:['濡堝','鎵撶數璇?],ec:EC.n,trn:206,hr:19 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濂跺ザ',sum:'灏忔槑缁欏ザ濂朵拱浜嗕竴鍙拌鍘嬭瀵勫洖鍘讳簡',c:0.65,t:['濂跺ザ','琛€鍘嬭'],ec:EC.p,trn:207,hr:10 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鐪嬩簡銆婁笁浣撱€嬪ぇ缁撳眬锛屾劅鎱ㄤ竾鍗?,c:0.6,t:['涓変綋','缁撳眬','鎰熸叏'],ec:EC.p,trn:208,hr:23 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉdebug浜嗕竴涓寮傜殑骞跺彂闂',c:0.65,t:['debug','骞跺彂'],ec:EC.p,trn:209,hr:15 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鐨勯」鐩€氳繃浜嗗畨鍏ㄥ璁?,c:0.7,t:['瀹夊叏瀹¤','閫氳繃'],ec:EC.p,trn:210,hr:17 },
  { d:'HEALTH',sub:'SLEEP',s:'鐢ㄦ埛',sum:'灏忔槑鏄ㄥぉ澶辩湢浜嗭紝缈绘潵瑕嗗幓鍒?鐐规墠鐫＄潃',c:0.7,t:['澶辩湢','2鐐?],ec:EC.v,trn:211,hr:3 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ瀛︿細浜嗗脊銆婂皬鏄熸槦銆嬬殑鍚変粬鐗?,c:0.6,t:['鍚変粬','灏忔槦鏄?,'瀛︿細'],ec:EC.p,trn:212,hr:22 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑琚媺杩涗簡涓€涓揣鎬ncall缇?,c:0.5,t:['oncall','绱ф€?],ec:EC.neg,trn:213,hr:9 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ蹇冩儏鐗瑰埆濂斤紝鍥犱负澶╂皵濂?椤圭洰椤哄埄',c:0.8,t:['蹇冩儏濂?,'澶╂皵','椤哄埄'],ec:EC.p,trn:214,hr:11 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'灏忕孩',sum:'灏忕孩鏈€杩戝湪瀛︾敾鐢伙紝缁欏皬鏄庣敾浜嗕竴骞呯尗鐨勭礌鎻?,c:0.6,t:['灏忕孩','鐢荤敾','绱犳弿'],ec:EC.p,trn:215,hr:20 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'灏忛檲',sum:'灏忔槑浠婂ぉ鏁欏皬闄堢敤git rebase',c:0.6,t:['灏忛檲','git','rebase'],ec:EC.p,trn:216,hr:14 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鍜屼骇鍝佺粡鐞嗗惖浜嗕竴鏋讹紝闇€姹傚張鏀逛簡',c:0.6,t:['浜у搧缁忕悊','鍚垫灦','闇€姹?],ec:EC.neg,trn:217,hr:16 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑璁″垝鏄庡勾甯﹀ザ濂跺幓浣撴',c:0.6,t:['濂跺ザ','浣撴','鏄庡勾'],ec:EC.p,trn:218,hr:22 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鏈変釜浜哄彲浠ュ€捐瘔鐪熺殑寰堝垢杩?,c:0.65,t:['鍊捐瘔','骞歌繍'],ec:EC.p,trn:219,hr:1 },
]

// 鈹€鈹€ 杩戞湡灞?(3-14澶? ~40鏉? 鈹€鈹€
const RECENT: F[] = [
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鐨勯」鐩笂绾夸簡锛岀敤鎴峰弽棣堜笉閿?,c:0.8,t:['椤圭洰','涓婄嚎','鍙嶉'],ec:EC.p,trn:170,hr:17 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍜屽皬绾㈠拰濂戒簡锛屼簰鐩搁亾姝変簡',c:0.8,t:['鍜屽ソ','閬撴瓑','灏忕孩'],ec:EC.p,trn:171,hr:20 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ璺戞璺戜簡5鍏噷锛屾槸鑷繁鐨勬柊绾綍',c:0.7,t:['璺戞','5鍏噷','绾綍'],ec:EC.p,trn:172,hr:7 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑琚畨鎺掍笅鍛ㄥ幓涓婃捣鍑哄樊',c:0.5,t:['鍑哄樊','涓婃捣'],ec:EC.n,trn:173,hr:10 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍜孋TO涓€瀵逛竴璋堣瘽锛孋TO寰堢湅濂戒粬',c:0.7,t:['CTO','璋堣瘽','鐪嬪ソ'],ec:EC.p,trn:174,hr:15 },
  { d:'HEALTH',sub:'CONDITION',s:'鐢ㄦ埛',sum:'灏忔槑鐨勮儍鐥呮渶杩戝ソ澶氫簡',c:0.55,t:['鑳冪梾','濂藉浜?],ec:EC.p,trn:175,hr:12 },
  { d:'HEALTH',sub:'MENTAL',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鏈変釜浜哄彲浠ュ€捐瘔鐪熺殑寰堥噸瑕?,c:0.65,t:['鍊捐瘔','閲嶈'],ec:EC.p,trn:176,hr:23 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濂跺ザ',sum:'灏忔槑鐨勫ザ濂朵綇闄簡锛屼粬寰堟媴蹇冧絾璇蜂笉浜嗗亣',c:0.7,t:['濂跺ザ','浣忛櫌','鎷呭績'],ec:EC.v,trn:177,hr:3 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'灏忔潕',sum:'灏忔潕涓嬩釜鏈堣缁撳浜嗭紝灏忔槑瑕佸幓鍖椾含褰撲即閮?,c:0.7,t:['灏忔潕','缁撳','浼撮儙'],ec:EC.p,trn:178,hr:20 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍋氫簡涓€涓櫓姊︼紝姊﹀埌琚拷鐫€璺?,c:0.5,t:['鍣╂ⅵ','姊?],ec:EC.neg,trn:179,hr:4 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑甯悓浜嬭В鍐充簡涓€涓洶鎵颁簡涓夊ぉ鐨刡ug',c:0.7,t:['bug','瑙ｅ喅','鍚屼簨'],ec:EC.p,trn:180,hr:16 },
  { d:'HEALTH',sub:'SLEEP',s:'鐢ㄦ埛',sum:'灏忔槑鍙戠幇鍚櫧鍣煶鏈夊姪浜庡叆鐫?,c:0.55,t:['鐧藉櫔闊?,'鍏ョ潯'],ec:EC.n,trn:181,hr:23 },
  { d:'WORK',sub:'PROJECT',s:'鐢ㄦ埛',sum:'灏忔槑鐨勯」鐩渶瑕佸鎺ラ摱琛岀殑API锛屾枃妗ｅ緢鐑?,c:0.55,t:['閾惰','API','鏂囨。'],ec:EC.neg,trn:182,hr:14 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鏀跺埌浜嗗ぇ瀛﹁仛浼氱殑閭€璇凤紝鏈夌偣鎯冲幓',c:0.5,t:['鑱氫細','澶у','閭€璇?],ec:EC.n,trn:183,hr:19 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'灏忛泤',sum:'灏忔槑鍜屽皬闆呬竴璧峰姞鐝繃鍑犳锛岃亰寰楁尯寮€蹇?,c:0.6,t:['灏忛泤','鍔犵彮','鑱婂ぉ'],ec:EC.p,trn:184,hr:22 },
  { d:'HEALTH',sub:'CONDITION',s:'鐢ㄦ埛',sum:'灏忔槑浣撴鎶ュ憡璇磋鑴傚亸楂?,c:0.65,t:['浣撴','琛€鑴?],ec:EC.neg,trn:185,hr:10 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑琚〃鎵簡锛岃浠栧甫鏂颁汉甯﹀緱濂?,c:0.7,t:['琛ㄦ壃','甯︽柊'],ec:EC.p,trn:186,hr:15 },
  { d:'HEALTH',sub:'EXERCISE',s:'鐢ㄦ埛',sum:'灏忔槑鍛ㄦ湯绾︿簡闃挎澃鍘荤埇灞?,c:0.5,t:['鐖北','闃挎澃'],ec:EC.p,trn:187,hr:9 },
  { d:'MOOD',sub:'PATTERN',s:'鐢ㄦ埛',sum:'灏忔槑鏅氫笂11鐐逛互鍚庣壒鍒鏄揺mo',c:0.6,t:['鏅氫笂','11鐐?,'emo'],ec:EC.v,trn:188,hr:1 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍙戠幇鑷繁鐨勪竴涓棫椤圭洰琚叕鍙稿簾寮冧簡',c:0.55,t:['鏃ч」鐩?,'搴熷純'],ec:EC.neg,trn:189,hr:11 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑鎯虫妸鍚変粬缁冨埌鑳藉脊鍞变竴棣栧畬鏁寸殑姝?,c:0.55,t:['鍚変粬','寮瑰敱'],ec:EC.p,trn:190,hr:22 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'寮犲摜',sum:'寮犲摜涓婃鎵硅瘎灏忔槑鏄洜涓轰唬鐮乺eview娌″仛濂?,c:0.6,t:['寮犲摜','鎵硅瘎','review'],ec:EC.neg,trn:191,hr:16 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'鐜嬪',sum:'鐜嬪鎺ㄨ崘灏忔槑鐪嬨€婅璁℃ā寮忋€嬭繖鏈功',c:0.5,t:['鐜嬪','璁捐妯″紡'],ec:EC.n,trn:192,hr:14 },
  { d:'HEALTH',sub:'DIET',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戝紑濮嬪枬鏋告潪姘村吇鐢熶簡',c:0.5,t:['鏋告潪','鍏荤敓'],ec:EC.n,trn:193,hr:10 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱銆婁笁浣撱€嬫槸涓浗鏈€濂界殑绉戝够灏忚',c:0.55,t:['涓変綋','绉戝够'],ec:EC.p,trn:194,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鐢熸椿瑕佹湁浠紡鎰?,c:0.5,t:['浠紡鎰?,'鐢熸椿'],ec:EC.p,trn:195,hr:20 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戝湪杩姐€婁笁浣撱€嬬數瑙嗗墽',c:0.75,t:['涓変綋','鐢佃鍓?],ec:EC.n,trn:196,hr:21 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鐨勫勾缁堢哗鏁堟嬁浜咮+',c:0.6,t:['缁╂晥','B+'],ec:EC.n,trn:197,hr:15 },
  { d:'HEALTH',sub:'EXERCISE',s:'鐢ㄦ埛',sum:'灏忔槑涔颁簡涓憸浼藉灚锛屾兂鍦ㄥ鍋氭媺浼?,c:0.5,t:['鐟滀冀鍨?,'鎷変几'],ec:EC.n,trn:198,hr:20 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑璁″垝涓嬩釜鏈堝幓涓婃捣鍑哄樊鏃堕『渚胯灏忔潕',c:0.6,t:['涓婃捣','鍑哄樊','灏忔潕'],ec:EC.n,trn:199,hr:10 },
  { d:'HEALTH',sub:'DIET',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戞棭椁愬紑濮嬪悆鐕曢害浜?,c:0.45,t:['鏃╅','鐕曢害'],ec:EC.n,trn:200,hr:8 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鍦伴搧涓婅搴х粰涓€涓€佸ザ濂?,c:0.5,t:['璁╁骇','鍦伴搧'],ec:EC.p,trn:201,hr:8 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濡瑰',sum:'灏忛洦鏆戝亣浼氭潵娣卞湷鎵惧皬鏄庣帺',c:0.65,t:['灏忛洦','鏆戝亣','娣卞湷'],ec:EC.p,trn:202,hr:20 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱杩滅▼鍔炲叕鏄湭鏉ョ殑瓒嬪娍',c:0.5,t:['杩滅▼','鍔炲叕'],ec:EC.n,trn:203,hr:14 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑璁や负姣忎釜浜洪兘鏈夎嚜宸辩殑鑺傚',c:0.6,t:['鑺傚','鑷繁'],ec:EC.p,trn:204,hr:23 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑浠婂ぉ鍜屼骇鍝佺粡鐞嗗惖鏋朵簡',c:0.6,t:['浜у搧缁忕悊','鍚垫灦'],ec:EC.neg,trn:205,hr:16 },
  { d:'RELATIONSHIP',sub:'NEIGHBOR',s:'闅斿鑰佺帇',sum:'灏忔槑闅斿浣忕殑鏄釜绋嬪簭鍛樿€佺帇',c:0.5,t:['闅斿','鑰佺帇','閭诲眳'],ec:EC.n,trn:206,hr:19 },
  { d:'PREFERENCE',sub:'SNACK',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鍚冭荆鏉★紝鍗緳鐨勯偅绉?,c:0.55,t:['杈ｆ潯','鍗緳'],ec:EC.p,trn:207,hr:22 },
  { d:'COMMITMENT',sub:'PROMISE',s:'鐢ㄦ埛',sum:'灏忔槑绛斿簲闃挎澃涓嬩釜鏈堜竴璧峰幓鐖ⅶ妗愬北',c:0.55,t:['闃挎澃','姊ф灞?],ec:EC.p,trn:208,hr:20 },
]

// 鈹€鈹€ 涓湡灞?(14-60澶? ~55鏉? 鈹€鈹€ 鍏崇郴寤虹珛銆佸亸濂界‘璁ゃ€佸伐浣滈噷绋嬬 鈹€鈹€
const MEDIUM: F[] = [
  { d:'IDENTITY',sub:'NAME',s:'鐢ㄦ埛',sum:'鐢ㄦ埛鍚嶅瓧鍙皬鏄?,c:0.95,t:['灏忔槑','鍚嶅瓧','鎴戝彨'],ec:EC.n,trn:1,hr:20 },
  { d:'IDENTITY',sub:'AGE',s:'鐢ㄦ埛',sum:'灏忔槑浠婂勾25宀侊紝1999骞?鏈?5鏃ュ嚭鐢?,c:0.9,t:['骞撮緞','鐢熸棩','鍑虹敓'],ec:EC.n,trn:2,hr:21,age:{age:25,mmdd:'08-15',yr:1999} },
  { d:'IDENTITY',sub:'OCCUPATION',s:'鐢ㄦ埛',sum:'灏忔槑鍦ㄨ吘璁仛鍚庣寮€鍙戝伐绋嬪笀',c:0.95,t:['宸ヤ綔','鑵捐','鍚庣'],ec:EC.n,trn:3,hr:20 },
  { d:'IDENTITY',sub:'LOCATION',s:'鐢ㄦ埛',sum:'灏忔槑浣忓湪娣卞湷鍗楀北鍖虹鎶€鍥檮杩?,c:0.85,t:['浣?,'娣卞湷','鍗楀北'],ec:EC.n,trn:4,hr:22 },
  { d:'IDENTITY',sub:'EDUCATION',s:'鐢ㄦ埛',sum:'灏忔槑鏄崕鍗楃悊宸ュぇ瀛﹁绠楁満绯绘瘯涓氱殑',c:0.8,t:['澶у','姣曚笟','鍗庡伐'],ec:EC.n,trn:5,hr:21 },
  { d:'IDENTITY',sub:'HOMETOWN',s:'鐢ㄦ埛',sum:'灏忔槑鑰佸鍦ㄦ箹鍗楅暱娌?,c:0.85,t:['鑰佸','婀栧崡','闀挎矙'],ec:EC.n,trn:6,hr:20 },
  { d:'IDENTITY',sub:'GENDER',s:'鐢ㄦ埛',sum:'灏忔槑鏄敺鐢?,c:0.95,t:['鐢?,'鎬у埆'],ec:EC.n,trn:7,hr:19 },
  { d:'IDENTITY',sub:'ZODIAC',s:'鐢ㄦ埛',sum:'灏忔槑鏄嫯瀛愬骇',c:0.7,t:['鐙瓙搴?,'鏄熷骇'],ec:EC.n,trn:8,hr:22 },
  { d:'IDENTITY',sub:'PERSONALITY',s:'鐢ㄦ埛',sum:'灏忔槑璇磋嚜宸辨槸INTJ鍨嬩汉鏍?,c:0.6,t:['INTJ','MBTI'],ec:EC.n,trn:9,hr:23 },
  { d:'IDENTITY',sub:'PHONE',s:'鐢ㄦ埛',sum:'灏忔槑鐢ㄧ殑鏄痠Phone 15 Pro',c:0.7,t:['鎵嬫満','iPhone'],ec:EC.n,trn:10,hr:20 },
  { d:'IDENTITY',sub:'HEIGHT',s:'鐢ㄦ埛',sum:'灏忔槑韬珮175cm',c:0.7,t:['韬珮','澶氶珮'],ec:EC.n,trn:11,hr:21 },
  { d:'IDENTITY',sub:'WEIGHT',s:'鐢ㄦ埛',sum:'灏忔槑浣撻噸70kg',c:0.65,t:['浣撻噸','鑳?],ec:EC.n,trn:12,hr:22 },
  { d:'IDENTITY',sub:'DRIVING',s:'鐢ㄦ埛',sum:'灏忔槑鏈夐┚鐓т絾娌′拱杞?,c:0.6,t:['椹剧収','寮€杞?],ec:EC.n,trn:13,hr:20 },
  { d:'IDENTITY',sub:'COMMUTE',s:'鐢ㄦ埛',sum:'灏忔槑姣忓ぉ鍦伴搧閫氬嫟40鍒嗛挓',c:0.65,t:['閫氬嫟','鍦伴搧'],ec:EC.n,trn:14,hr:8 },
  { d:'IDENTITY',sub:'LIVING_ALONE',s:'鐢ㄦ埛',sum:'灏忔槑涓€涓汉浣忥紝鍋跺皵瑙夊緱瀛ょ嫭',c:0.7,t:['鐙眳','瀛ょ嫭'],ec:EC.v,trn:15,hr:1 },
  { d:'PREFERENCE',sub:'FOOD',s:'鐢ㄦ埛',sum:'灏忔槑鏈€鍠滄鍚冪伀閿咃紝灏ゅ叾鏄夯杈ｉ攨搴?,c:0.9,t:['鐏攨','楹昏荆'],ec:EC.p,trn:16,hr:19 },
  { d:'PREFERENCE',sub:'FOOD',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅悆棣欒彍',c:0.85,t:['棣欒彍','涓嶅悆'],ec:EC.neg,trn:17,hr:12 },
  { d:'PREFERENCE',sub:'FOOD',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鍚冭荆锛屾箹鍗椾汉鍢?,c:0.8,t:['杈?,'婀栧崡'],ec:EC.p,trn:18,hr:19 },
  { d:'PREFERENCE',sub:'DRINK',s:'鐢ㄦ埛',sum:'灏忔槑鍠濆挅鍟″彧鍠濈編寮?,c:0.7,t:['鍜栧暋','缇庡紡'],ec:EC.n,trn:19,hr:10 },
  { d:'PREFERENCE',sub:'HOBBY',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鎵撶鐞冿紝姣忓懆鍏笅鍗堜細鍘绘墦',c:0.85,t:['绡悆','鍛ㄥ叚'],ec:EC.p,trn:20,hr:16 },
  { d:'PREFERENCE',sub:'HOBBY',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戝湪瀛﹀悏浠栵紝涔颁簡鎶婇泤椹搱F310',c:0.8,t:['鍚変粬','闆呴┈鍝?],ec:EC.p,trn:21,hr:22 },
  { d:'PREFERENCE',sub:'HOBBY',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鐜┿€婂師绁炪€?,c:0.7,t:['鍘熺','娓告垙'],ec:EC.p,trn:22,hr:23 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鐪嬬骞荤數褰憋紝鏈€鍠滄鏄熼檯绌胯秺',c:0.85,t:['鐢靛奖','绉戝够','鏄熼檯绌胯秺'],ec:EC.p,trn:23,hr:21 },
  { d:'PREFERENCE',sub:'MUSIC',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鍚懆鏉颁鸡鐨勬瓕',c:0.85,t:['鍛ㄦ澃浼?,'闊充箰'],ec:EC.p,trn:24,hr:20 },
  { d:'PREFERENCE',sub:'SPORT',s:'鐢ㄦ埛',sum:'灏忔槑鏄箹浜虹悆杩凤紝鏈€鍠滄瑭瑰鏂?,c:0.7,t:['婀栦汉','瑭瑰鏂?,'NBA'],ec:EC.p,trn:25,hr:22 },
  { d:'PREFERENCE',sub:'TRAVEL',s:'鐢ㄦ埛',sum:'灏忔槑鍘昏繃鏃ユ湰鏃呮父锛岃寰椾含閮藉緢濂?,c:0.7,t:['鏃ユ湰','浜兘'],ec:EC.p,trn:26,hr:20 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'灏忕孩',sum:'灏忕孩鏄皬鏄庢渶濂界殑鏈嬪弸锛屽ぇ瀛﹀悓瀛?,c:0.9,t:['灏忕孩','鏈嬪弸','澶у鍚屽'],ec:EC.p,trn:27,hr:21 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濡堝',sum:'灏忔槑鐨勫濡堝湪鑰佸婀栧崡',c:0.85,t:['濡堝','鑰佸','婀栧崡'],ec:EC.n,trn:28,hr:19 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'鐖哥埜',sum:'灏忔槑鐨勭埜鐖告槸涓鑰佸笀锛屾暀鏁板',c:0.8,t:['鐖哥埜','鑰佸笀','鏁板'],ec:EC.n,trn:29,hr:20 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濡瑰',sum:'灏忔槑鏈変釜濡瑰鍙皬闆紝鍦ㄩ暱娌欏鍖?,c:0.8,t:['濡瑰','灏忛洦','瀛﹀尰'],ec:EC.p,trn:30,hr:21 },
  { d:'RELATIONSHIP',sub:'PET',s:'鍜挭',sum:'灏忔槑鍏讳簡涓€鍙鐚彨鍜挭锛?宀佷簡',c:0.95,t:['鍜挭','姗樼尗','瀹犵墿'],ec:EC.p,trn:31,hr:20 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'寮犲摜',sum:'寮犲摜鏄皬鏄庣殑鐩村睘棰嗗',c:0.7,t:['寮犲摜','棰嗗'],ec:EC.n,trn:32,hr:10 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'鐜嬪',sum:'鐜嬪鏄粍閲岀殑璧勬繁寮€鍙?,c:0.65,t:['鐜嬪','璧勬繁'],ec:EC.n,trn:33,hr:14 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'灏忔潕',sum:'灏忔潕鏄皬鏄庣殑澶у瀹ゅ弸锛屽湪鍖椾含瀛楄妭璺冲姩',c:0.75,t:['灏忔潕','瀹ゅ弸','瀛楄妭'],ec:EC.n,trn:34,hr:20 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'闃挎澃',sum:'闃挎澃鏄皬鏄庢墦绡悆璁よ瘑鐨勬湅鍙?,c:0.7,t:['闃挎澃','绡悆'],ec:EC.n,trn:35,hr:16 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑涓昏鐢℅o璇█寮€鍙?,c:0.8,t:['Go','璇█'],ec:EC.n,trn:36,hr:14 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑鐔熸倝MySQL鍜孯edis',c:0.7,t:['MySQL','Redis'],ec:EC.n,trn:37,hr:15 },
  { d:'WORK',sub:'PROJECT',s:'鐢ㄦ埛',sum:'灏忔槑鍦ㄥ仛涓€涓敮浠樼郴缁熼噸鏋勭殑椤圭洰',c:0.8,t:['鏀粯','閲嶆瀯'],ec:EC.n,trn:38,hr:10 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鑰冭瘯閫氳繃浜哖MP璁よ瘉锛岄潪甯稿紑蹇?,c:0.9,t:['PMP','閫氳繃','寮€蹇?],ec:EC.p,trn:39,hr:17 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑琚瀵兼壒璇勪簡涓€娆★紝蹇冩儏寰堜綆钀?,c:0.85,t:['鎵硅瘎','棰嗗','浣庤惤'],ec:EC.neg,trn:40,hr:16 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鐨勪唬鐮佽閫変负鍥㈤槦鏈€浣冲疄璺?,c:0.8,t:['浠ｇ爜','鏈€浣冲疄璺?],ec:EC.p,trn:41,hr:15 },
  { d:'MOOD',sub:'PATTERN',s:'鐢ㄦ埛',sum:'灏忔槑姣忓埌鍛ㄦ棩鏅氫笂灏变細鏈夌偣鐒﹁檻',c:0.7,t:['鍛ㄦ棩','鐒﹁檻','鍛ㄤ竴'],ec:EC.neg,trn:42,hr:22 },
  { d:'HEALTH',sub:'SLEEP',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戠粡甯稿姞鐝埌11鐐癸紝鐫＄湢涓嶅お濂?,c:0.85,t:['鍔犵彮','鐫＄湢','鐔'],ec:EC.v,trn:43,hr:23 },
  { d:'HEALTH',sub:'CONDITION',s:'鐢ㄦ埛',sum:'灏忔槑棰堟涓嶅お濂斤紝涔呭潗浼氱柤',c:0.7,t:['棰堟','涔呭潗','鐤?],ec:EC.neg,trn:44,hr:15 },
  { d:'HEALTH',sub:'CONDITION',s:'鐢ㄦ埛',sum:'灏忔槑鏈夌偣杩戣锛屾埓350搴︾殑鐪奸暅',c:0.8,t:['杩戣','鐪奸暅'],ec:EC.n,trn:45,hr:20 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑璁″垝浠婂勾鑰傾WS鏋舵瀯甯堣璇?,c:0.75,t:['AWS','鏋舵瀯甯?],ec:EC.n,trn:46,hr:22 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑鎵撶畻鏄ヨ妭甯﹀濡堝幓鏃呮父',c:0.7,t:['鏄ヨ妭','鏃呮父','濡堝'],ec:EC.p,trn:47,hr:21 },
  { d:'IDENTITY',sub:'SALARY',s:'鐢ㄦ埛',sum:'灏忔槑鏈堣柂澶ф25k',c:0.5,t:['宸ヨ祫','鏈堣柂'],ec:EC.n,trn:48,hr:23 },
  { d:'IDENTITY',sub:'WORK_YEARS',s:'鐢ㄦ埛',sum:'灏忔槑宸ヤ綔3骞翠簡',c:0.8,t:['宸ヤ綔骞撮檺','鍑犲勾'],ec:EC.n,trn:49,hr:20 },
  { d:'IDENTITY',sub:'COMPUTER',s:'鐢ㄦ埛',sum:'灏忔槑鐨勭瑪璁版湰鏄疢acBook Pro M3',c:0.7,t:['鐢佃剳','MacBook'],ec:EC.n,trn:50,hr:10 },
  { d:'IDENTITY',sub:'RENT',s:'鐢ㄦ埛',sum:'灏忔槑鎴跨姣忔湀4500',c:0.5,t:['鎴跨','绉熼噾'],ec:EC.n,trn:51,hr:22 },
  { d:'IDENTITY',sub:'COOKING',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅お浼氬仛楗紝鍩烘湰闈犲鍗?,c:0.6,t:['鍋氶キ','澶栧崠'],ec:EC.n,trn:52,hr:19 },
  { d:'IDENTITY',sub:'DIALECT',s:'鐢ㄦ埛',sum:'灏忔槑浼氳闀挎矙璇?,c:0.6,t:['鏂硅█','闀挎矙璇?],ec:EC.n,trn:53,hr:20 },
  { d:'IDENTITY',sub:'BLOOD_TYPE',s:'鐢ㄦ埛',sum:'灏忔槑鏄疧鍨嬭',c:0.65,t:['琛€鍨?,'O鍨?],ec:EC.n,trn:54,hr:21 },
]

// 鈹€鈹€ 杩滄湡灞?(60-180澶? ~50鏉? 鈹€鈹€ 鏃╂湡鍋忓ソ銆佹繁灞傚叧绯汇€佹棫宸ヤ綔浜嬩欢 鈹€鈹€
const DISTANT: F[] = [
  { d:'PREFERENCE',sub:'FOOD',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鍚冪儳鐑わ紝灏ゅ叾鏄儰缇婅倝涓?,c:0.75,t:['鐑х儰','缇婅倝涓?],ec:EC.p,trn:55,hr:20 },
  { d:'PREFERENCE',sub:'FOOD',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅お鍚冪敎椋?,c:0.6,t:['鐢滈','铔嬬硶'],ec:EC.n,trn:56,hr:19 },
  { d:'PREFERENCE',sub:'DRINK',s:'鐢ㄦ埛',sum:'灏忔槑鍋跺皵鍠濆暏閰掞紝鍠滄鐧惧▉',c:0.6,t:['鍟ら厭','鐧惧▉'],ec:EC.n,trn:57,hr:22 },
  { d:'PREFERENCE',sub:'HOBBY',s:'鐢ㄦ埛',sum:'灏忔槑鍋跺皵鎵撹嫳闆勮仈鐩燂紝鍠滄鐜╀腑鍗?,c:0.65,t:['鑻遍泟鑱旂洘','LOL'],ec:EC.p,trn:58,hr:23 },
  { d:'PREFERENCE',sub:'HOBBY',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鐪嬪姩婕紝杩借繃鍜掓湳鍥炴垬',c:0.7,t:['鍔ㄦ极','鍜掓湳鍥炴垬'],ec:EC.p,trn:59,hr:22 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鐪嬭劚鍙ｇ',c:0.6,t:['鑴卞彛绉€'],ec:EC.p,trn:60,hr:21 },
  { d:'PREFERENCE',sub:'MUSIC',s:'鐢ㄦ埛',sum:'灏忔槑涔熷枩娆㈠惉闄堝杩呯殑姝?,c:0.7,t:['闄堝杩?,'鍗佸勾'],ec:EC.p,trn:61,hr:20 },
  { d:'PREFERENCE',sub:'BOOK',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戝湪璇汇€婁汉绫荤畝鍙层€?,c:0.65,t:['浜虹被绠€鍙?,'璇讳功'],ec:EC.p,trn:62,hr:23 },
  { d:'PREFERENCE',sub:'TRAVEL',s:'鐢ㄦ埛',sum:'灏忔槑鎯冲幓鍐板矝鐪嬫瀬鍏?,c:0.6,t:['鍐板矝','鏋佸厜'],ec:EC.p,trn:63,hr:22 },
  { d:'PREFERENCE',sub:'FASHION',s:'鐢ㄦ埛',sum:'灏忔槑绌胯。椋庢牸鍋忎紤闂?,c:0.5,t:['绌胯。','鍗。'],ec:EC.n,trn:64,hr:20 },
  { d:'PREFERENCE',sub:'WEATHER',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄绉嬪ぉ',c:0.55,t:['绉嬪ぉ','澶╂皵'],ec:EC.n,trn:65,hr:15 },
  { d:'PREFERENCE',sub:'SEASON',s:'鐢ㄦ埛',sum:'灏忔槑鏈€璁ㄥ帉澶忓ぉ锛屾繁鍦冲お鐑簡',c:0.5,t:['澶忓ぉ','鐑?],ec:EC.neg,trn:66,hr:14 },
  { d:'PREFERENCE',sub:'TIME',s:'鐢ㄦ埛',sum:'灏忔槑鏄鐚瓙锛屾櫄涓婃晥鐜囨渶楂?,c:0.65,t:['澶滅尗瀛?,'鏅氫笂'],ec:EC.n,trn:67,hr:2 },
  { d:'PREFERENCE',sub:'SOCIAL',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅お鍠滄绀句氦鑱氫細',c:0.6,t:['绀句氦','鑱氫細'],ec:EC.n,trn:68,hr:20 },
  { d:'PREFERENCE',sub:'PET',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鐚杩囩嫍',c:0.7,t:['鐚?,'鐙?],ec:EC.p,trn:69,hr:21 },
  { d:'RELATIONSHIP',sub:'EX',s:'鍓嶅コ鍙?,sum:'灏忔槑澶у鏃舵湁涓コ鏈嬪弸锛屽ぇ涓夊垎鎵嬩簡',c:0.5,t:['鍓嶅コ鍙?,'澶у','鍒嗘墜'],ec:EC.neg,trn:70,hr:23 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濡堝',sum:'濡堝鎬诲偓灏忔槑鎵惧コ鏈嬪弸',c:0.7,t:['濡堝','鍌?,'濂虫湅鍙?],ec:EC.neg,trn:71,hr:20 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'鐖哥埜',sum:'鐖哥埜涓嶅お鍠勪簬琛ㄨ揪锛屼絾灏忔槑鐭ラ亾鐖哥埜寰堢埍浠?,c:0.6,t:['鐖哥埜','琛ㄨ揪'],ec:EC.p,trn:72,hr:21 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'濂跺ザ',sum:'灏忔槑鐨勫ザ濂跺湪涔′笅锛岃韩浣撲笉澶ソ',c:0.75,t:['濂跺ザ','涔′笅','韬綋'],ec:EC.v,trn:73,hr:3 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'灏忛泤',sum:'灏忔槑瀵归殧澹佺粍鐨勫皬闆呮湁濂芥劅',c:0.6,t:['灏忛泤','鍠滄鐨勪汉','鏆楁亱'],ec:EC.p,trn:74,hr:22 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'灏忛泤',sum:'灏忛泤鏄骇鍝佺粍鐨勶紝闀垮彂锛岀瑧璧锋潵寰堝ソ鐪?,c:0.55,t:['灏忛泤','浜у搧缁?,'闀垮彂'],ec:EC.p,trn:75,hr:20 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'灏忛檲',sum:'灏忛檲鏄粖骞存柊鏉ョ殑搴斿眾鐢?,c:0.6,t:['灏忛檲','搴斿眾'],ec:EC.n,trn:76,hr:10 },
  { d:'WORK',sub:'PROJECT',s:'鐢ㄦ埛',sum:'灏忔槑璐熻矗鐨勬敮浠樼郴缁烸PS浠?000浼樺寲鍒颁簡5000',c:0.75,t:['QPS','浼樺寲'],ec:EC.p,trn:77,hr:15 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鐨勪唬鐮乺eview琚紶鍝ユ墦鍥炴潵浜嗕笁娆?,c:0.65,t:['review','鎵撳洖'],ec:EC.neg,trn:78,hr:16 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍙傚姞浜嗕竴娆℃妧鏈垎浜細',c:0.6,t:['鎶€鏈垎浜?,'寰湇鍔?],ec:EC.p,trn:79,hr:14 },
  { d:'WORK',sub:'ASPIRATION',s:'鐢ㄦ埛',sum:'灏忔槑鎯冲湪涓ゅ勾鍐呭崌鍒癟9绾у埆',c:0.6,t:['鍗囪亴','T9'],ec:EC.n,trn:80,hr:22 },
  { d:'WORK',sub:'ASPIRATION',s:'鐢ㄦ埛',sum:'灏忔槑鏈夊垱涓氱殑鎯虫硶',c:0.5,t:['鍒涗笟','鎯虫硶'],ec:EC.n,trn:81,hr:23 },
  { d:'WORK',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍥㈤槦鏉ヤ簡涓柊CTO',c:0.55,t:['CTO','OKR'],ec:EC.n,trn:82,hr:10 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑瀵瑰垎甯冨紡绯荤粺姣旇緝浜嗚В',c:0.6,t:['鍒嗗竷寮?,'DDIA'],ec:EC.n,trn:83,hr:15 },
  { d:'HEALTH',sub:'EXERCISE',s:'鐢ㄦ埛',sum:'灏忔槑姣忓懆鍏墦绡悆锛屽伓灏旇窇姝?,c:0.7,t:['绡悆','璺戞'],ec:EC.n,trn:84,hr:16 },
  { d:'HEALTH',sub:'CONDITION',s:'鐢ㄦ埛',sum:'灏忔槑鎹㈠瀹规槗杩囨晱',c:0.6,t:['杩囨晱','鎹㈠'],ec:EC.neg,trn:85,hr:10 },
  { d:'HEALTH',sub:'MENTAL',s:'鐢ㄦ埛',sum:'灏忔槑鏈夋椂鍊欎細鐒﹁檻锛屼絾涓嶇煡閬撲负浠€涔?,c:0.65,t:['鐒﹁檻','蹇冪悊'],ec:EC.v,trn:86,hr:23 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍔犵彮鍒板噷鏅?鐐癸紝绗簩澶╃簿绁炲緢宸?,c:0.7,t:['鍔犵彮','鍑屾櫒'],ec:EC.neg,trn:87,hr:3 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍛ㄦ湯鍜屾湅鍙嬪幓鍞盞TV',c:0.75,t:['KTV','鍞辨瓕'],ec:EC.p,trn:88,hr:22 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍦ㄧ綉涓婄湅鍒颁竴涓劅浜虹殑瑙嗛鍝簡',c:0.6,t:['鎰熶汉','瑙嗛','鍝?],ec:EC.v,trn:89,hr:1 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍫佃溅杩熷埌浜嗭紝琚墸浜?0鍧楅挶',c:0.6,t:['鍫佃溅','杩熷埌'],ec:EC.neg,trn:90,hr:9 },
  { d:'MOOD',sub:'PATTERN',s:'鐢ㄦ埛',sum:'灏忔槑涓€鍒颁笅闆ㄥぉ灏辩姱鍥?,c:0.5,t:['涓嬮洦','鐘洶'],ec:EC.n,trn:91,hr:14 },
  { d:'MOOD',sub:'PATTERN',s:'鐢ㄦ埛',sum:'灏忔槑鍘嬪姏澶х殑鏃跺€欎細鍜寚鐢?,c:0.55,t:['鍘嬪姏','鍜寚鐢?],ec:EC.neg,trn:92,hr:15 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鍋ュ悍姣旇禋閽遍噸瑕?,c:0.6,t:['鍋ュ悍','璧氶挶'],ec:EC.n,trn:93,hr:22 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑鐩镐俊鍔姏浼氭湁鍥炴姤',c:0.6,t:['鍔姏','鍥炴姤'],ec:EC.p,trn:94,hr:23 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱AI浼氭敼鍙樺緢澶氳涓?,c:0.55,t:['AI','鏀瑰彉'],ec:EC.n,trn:95,hr:14 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱瀹朵汉鏄渶閲嶈鐨?,c:0.7,t:['瀹朵汉','鏈€閲嶈'],ec:EC.p,trn:96,hr:21 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱娣卞湷鑺傚澶揩浜?,c:0.55,t:['娣卞湷','蹇?],ec:EC.neg,trn:97,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑璁や负鐪熻瘹鏄渶閲嶈鐨勫搧璐?,c:0.6,t:['鐪熻瘹','鍝佽川'],ec:EC.p,trn:98,hr:22 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瀵瑰姞鐝枃鍖栧緢鍙嶆劅',c:0.6,t:['鍔犵彮','鍙嶆劅'],ec:EC.neg,trn:99,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鏈嬪弸涓嶅湪澶氾紝鍦ㄤ簬鐪熷績',c:0.6,t:['鏈嬪弸','鐪熷績'],ec:EC.p,trn:100,hr:22 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑鎯冲瓨閽变拱Model 3',c:0.6,t:['涔拌溅','Model 3'],ec:EC.n,trn:101,hr:22 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑璁″垝涓嬪崐骞村React',c:0.6,t:['React','涓汉椤圭洰'],ec:EC.n,trn:102,hr:23 },
  { d:'COMMITMENT',sub:'PROMISE',s:'鐢ㄦ埛',sum:'灏忔槑绛斿簲濡堝浠婂勾涓€瀹氬洖瀹惰繃骞?,c:0.7,t:['鍥炲','杩囧勾','濡堝'],ec:EC.p,trn:103,hr:21 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑鎯冲湪30宀佷箣鍓嶅綋涓婃妧鏈痩eader',c:0.55,t:['30宀?,'leader'],ec:EC.n,trn:104,hr:23 },
]

// 鈹€鈹€ 娣辫蹇嗗眰 (180-365澶? ~30鏉? 鈹€鈹€ 鏃╂湡韬唤銆佺骞村洖蹇嗐€佹繁灞備环鍊艰 鈹€鈹€
const DEEP: F[] = [
  { d:'IDENTITY',sub:'WORK_YEARS',s:'鐢ㄦ埛',sum:'灏忔槑2021骞存瘯涓氬氨杩涗簡鑵捐',c:0.8,t:['姣曚笟','鍏ヨ亴','2021'],ec:EC.n,trn:105,hr:20 },
  { d:'IDENTITY',sub:'WECHAT',s:'鐢ㄦ埛',sum:'灏忔槑寰俊鏄电О鍙?鐮佸啘灏忔槑"',c:0.6,t:['寰俊','鏄电О'],ec:EC.n,trn:106,hr:22 },
  { d:'IDENTITY',sub:'HANDEDNESS',s:'鐢ㄦ埛',sum:'灏忔槑鏄彸鎾囧瓙',c:0.5,t:['鍙虫拠瀛?],ec:EC.n,trn:107,hr:14 },
  { d:'IDENTITY',sub:'SLEEP_SCHEDULE',s:'鐢ㄦ埛',sum:'灏忔槑涓€鑸?2鐐瑰乏鍙崇潯锛?鐐硅捣',c:0.7,t:['浣滄伅','鍑犵偣鐫?],ec:EC.n,trn:108,hr:1 },
  { d:'PREFERENCE',sub:'MUSIC',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅お鍠滄璇村敱',c:0.5,t:['璇村敱','rap'],ec:EC.n,trn:109,hr:22 },
  { d:'PREFERENCE',sub:'BOOK',s:'鐢ㄦ埛',sum:'灏忔槑楂樹腑鏃舵渶鍠滄鐨勪功鏄€婁笁浣撱€?,c:0.7,t:['涓変綋','楂樹腑'],ec:EC.p,trn:110,hr:21 },
  { d:'PREFERENCE',sub:'SPORT',s:'鐢ㄦ埛',sum:'灏忔槑鍋跺皵璺戞锛屼竴鑸窇3-5鍏噷',c:0.6,t:['璺戞','鍏噷'],ec:EC.n,trn:111,hr:7 },
  { d:'PREFERENCE',sub:'FASHION',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅枩娆㈢┛姝ｈ',c:0.5,t:['姝ｈ','瑗胯'],ec:EC.n,trn:112,hr:10 },
  { d:'PREFERENCE',sub:'MOVIE_GENRE',s:'鐢ㄦ埛',sum:'灏忔槑涓嶅枩娆㈢湅鎭愭€栫墖',c:0.6,t:['鎭愭€栫墖','瀹虫€?],ec:EC.neg,trn:113,hr:23 },
  { d:'PREFERENCE',sub:'GAME',s:'鐢ㄦ埛',sum:'灏忔槑灏忔椂鍊欐渶鍠滄鐜┿€婃垜鐨勪笘鐣屻€?,c:0.6,t:['鎴戠殑涓栫晫','Minecraft'],ec:EC.p,trn:114,hr:22 },
  { d:'PREFERENCE',sub:'TV',s:'鐢ㄦ埛',sum:'灏忔槑鍠滄鐪嬨€婅€佸弸璁般€?,c:0.6,t:['鑰佸弸璁?,'缇庡墽'],ec:EC.p,trn:115,hr:21 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑涔熶細Python鍜孞ava',c:0.8,t:['Python','Java'],ec:EC.n,trn:116,hr:14 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戝湪瀛ubernetes',c:0.7,t:['Kubernetes','K8s'],ec:EC.n,trn:117,hr:15 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑姝ｅ湪鍑嗗AWS鏋舵瀯甯堣璇佽€冭瘯',c:0.65,t:['AWS','鏋舵瀯甯?,'璁よ瘉'],ec:EC.n,trn:118,hr:22 },
  { d:'WORK',sub:'SKILL',s:'鐢ㄦ埛',sum:'灏忔槑瀵筊edis缂撳瓨绌块€忓嚮绌块洩宕╁緢娓呮',c:0.6,t:['Redis','绌块€?,'鍑荤┛'],ec:EC.n,trn:119,hr:15 },
  { d:'HEALTH',sub:'DIET',s:'鐢ㄦ埛',sum:'灏忔槑鏈€杩戝湪鎺у埗楗锛屽皯鍚冪⒊姘?,c:0.6,t:['鎺у埗楗','纰虫按'],ec:EC.n,trn:120,hr:12 },
  { d:'HEALTH',sub:'CONDITION',s:'鐢ㄦ埛',sum:'灏忔槑鏈夎交寰殑鑳冪梾',c:0.6,t:['鑳冪梾','杈?],ec:EC.neg,trn:121,hr:19 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'灏忕孩',sum:'灏忕孩鍦ㄤ竴瀹跺垱涓氬叕鍙稿仛浜у搧缁忕悊',c:0.7,t:['灏忕孩','浜у搧缁忕悊'],ec:EC.n,trn:122,hr:14 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'鐜嬪',sum:'鐜嬪鎺ㄨ崘灏忔槑鐪嬨€婅璁℃ā寮忋€?,c:0.5,t:['鐜嬪','璁捐妯″紡'],ec:EC.n,trn:123,hr:14 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍜屽皬绾㈠惖鏋朵簡锛屽洜涓轰竴浠跺皬浜?,c:0.75,t:['鍚垫灦','灏忕孩'],ec:EC.neg,trn:124,hr:20 },
  { d:'MOOD',sub:'EVENT',s:'鐢ㄦ埛',sum:'灏忔槑鍦ㄧ綉涓婄湅鍒颁竴涓劅浜虹殑瑙嗛',c:0.6,t:['鎰熶汉','瑙嗛'],ec:EC.v,trn:125,hr:1 },
  { d:'MOOD',sub:'PATTERN',s:'鐢ㄦ埛',sum:'灏忔槑寮€蹇冪殑鏃跺€欎細鍝兼瓕',c:0.5,t:['寮€蹇?,'鍝兼瓕'],ec:EC.p,trn:126,hr:15 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱绋嬪簭鍛?5宀佷笉涓€瀹氳娣樻卑',c:0.5,t:['35宀?,'绋嬪簭鍛?],ec:EC.n,trn:127,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱闄即姣旂墿璐ㄦ洿閲嶈',c:0.65,t:['闄即','鐗╄川'],ec:EC.p,trn:128,hr:23 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鐜板湪鐨勬暀鑲插お鍗蜂簡',c:0.5,t:['鏁欒偛','鍗?],ec:EC.neg,trn:129,hr:22 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱鍏诲疇鐗╄兘娌绘剤浜哄績',c:0.6,t:['瀹犵墿','娌绘剤'],ec:EC.p,trn:130,hr:21 },
  { d:'WORLD',sub:'VALUE',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱寮€蹇冩渶閲嶈锛岄挶澶熻姳灏辫',c:0.55,t:['寮€蹇?,'閽?],ec:EC.p,trn:131,hr:23 },
  { d:'WORLD',sub:'OPINION',s:'鐢ㄦ埛',sum:'灏忔槑瑙夊緱娣卞湷澶忓ぉ澶儹浣嗗啲澶╄垝鏈?,c:0.5,t:['娣卞湷','澶忓ぉ','鍐ぉ'],ec:EC.n,trn:132,hr:14 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑鎯冲瓨澶?0涓囧氨鍥為暱娌欏彂灞?,c:0.5,t:['瀛橀挶','50涓?,'闀挎矙'],ec:EC.n,trn:133,hr:23 },
  { d:'COMMITMENT',sub:'PLAN',s:'鐢ㄦ埛',sum:'灏忔槑鎯冲湪35宀佷箣鍓嶅疄鐜拌储鍔¤嚜鐢?,c:0.4,t:['璐㈠姟鑷敱','35宀?],ec:EC.n,trn:134,hr:23 },
]

// 姹囨€绘墍鏈変簨瀹烇紝鍒嗛厤绮剧‘鏃堕棿鎴?
const ALL_FACTS: Array<F & { createdAt: string }> = []
const layers: Array<{ facts: F[]; dayRange: [number, number] }> = [
  { facts: FRESH, dayRange: [0, 3] },
  { facts: RECENT, dayRange: [3, 14] },
  { facts: MEDIUM, dayRange: [14, 60] },
  { facts: DISTANT, dayRange: [60, 180] },
  { facts: DEEP, dayRange: [180, 365] },
]
for (const layer of layers) {
  for (let i = 0; i < layer.facts.length; i++) {
    const f = layer.facts[i]
    const dayOffset = layer.dayRange[0] + (i / layer.facts.length) * (layer.dayRange[1] - layer.dayRange[0])
    ALL_FACTS.push({ ...f, createdAt: ts(Math.round(dayOffset), f.hr) })
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鎯呰妭璁板繂锛?6 娈碉紝璺?6 涓湀锛?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

const EPISODES = [
  { sum:'绗竴娆¤亰澶╋紝灏忔槑鑷垜浠嬬粛锛屽湪鑵捐宸ヤ綔锛屽吇浜嗕竴鍙鐚彨鍜挭', ei:0.3, de:'CALM_RATIONAL', kw:['鑷垜浠嬬粛','鑵捐','鍜挭'], st:1, et:5, days:300 },
  { sum:'灏忔槑鍒嗕韩浜嗗枩娆㈢殑椋熺墿鍜岀埍濂斤紝鑱婂埌鐏攨鍜岀鐞?, ei:0.5, de:'QUIET_FOND', kw:['鐏攨','绡悆','鐖卞ソ'], st:6, et:12, days:280 },
  { sum:'灏忔槑鎻愬埌鏈€濂界殑鏈嬪弸灏忕孩鍜屽浜猴紝淇′换鎰熶笂鍗?, ei:0.6, de:'SWEET_ATTACHMENT', kw:['灏忕孩','濡堝','淇′换'], st:13, et:17, days:250 },
  { sum:'灏忔槑琚瀵兼壒璇勫悗蹇冩儏浣庤惤锛屽悜浼翠荆鍊捐瘔', ei:0.7, de:'HURT_GRIEVANCE', kw:['鎵硅瘎','浣庤惤','瀹夋叞'], st:18, et:18, days:200 },
  { sum:'灏忔槑PMP鑰冭瘯閫氳繃锛岄潪甯稿紑蹇?, ei:0.8, de:'SWEET_ATTACHMENT', kw:['PMP','閫氳繃','寮€蹇?], st:19, et:19, days:150 },
  { sum:'灏忔槑鍜屽皬绾㈠惖鏋跺悗鍙堝拰濂?, ei:0.75, de:'HURT_GRIEVANCE', kw:['鍚垫灦','鍜屽ソ','灏忕孩'], st:20, et:21, days:120 },
  { sum:'灏忔槑娣卞鍔犵彮鍚庡€捐瘔鐤叉儷鍜岀潯鐪犻棶棰?, ei:0.65, de:'FEARFUL_OBEDIENT', kw:['鍔犵彮','绱?,'鐫＄湢'], st:22, et:25, days:90 },
  { sum:'灏忔槑鑱婂埌鏈潵璁″垝锛屾兂鑰傾WS璁よ瘉銆佸甫濡堝鏃呮父', ei:0.5, de:'QUIET_FOND', kw:['AWS','鏃呮父','璁″垝'], st:26, et:28, days:60 },
  { sum:'灏忔槑鎻愬埌鏆楁亱灏忛泤锛屽湪椋熷爞鍋堕亣', ei:0.6, de:'SHY_HEARTBEAT', kw:['灏忛泤','鏆楁亱','椋熷爞'], st:29, et:30, days:30 },
  { sum:'灏忔槑娣卞emo锛岃亰鍒板鐙劅鍜岀嫭灞呯殑瀵傚癁', ei:0.7, de:'HURT_GRIEVANCE', kw:['瀛ょ嫭','鐙眳','娣卞'], st:31, et:32, days:14 },
  { sum:'灏忔槑鍒嗕韩浜嗗伐浣滄垚灏憋紝浠ｇ爜琚瘎涓烘渶浣冲疄璺?, ei:0.7, de:'SWEET_ATTACHMENT', kw:['浠ｇ爜','鏈€浣冲疄璺?,'鑷豹'], st:33, et:34, days:10 },
  { sum:'灏忔槑濂跺ザ浣忛櫌锛屽緢鎷呭績浣嗚涓嶄簡鍋?, ei:0.75, de:'FEARFUL_OBEDIENT', kw:['濂跺ザ','浣忛櫌','鎷呭績'], st:35, et:36, days:3 },
  { sum:'灏忔槑瀛︿細浜嗗脊銆婂皬鏄熸槦銆嬬殑鍚変粬鐗?, ei:0.6, de:'QUIET_FOND', kw:['鍚変粬','灏忔槦鏄?,'寮€蹇?], st:37, et:38, days:2 },
  { sum:'灏忔槑鍜屽皬闆呬竴璧峰姞鐝紝鑱婂緱寰堝紑蹇?, ei:0.65, de:'SHY_HEARTBEAT', kw:['灏忛泤','鍔犵彮','寮€蹇?], st:39, et:40, days:1 },
  { sum:'灏忔槑鏀跺埌灏忔潕缁撳閭€璇凤紝瑕佸幓鍖椾含褰撲即閮?, ei:0.5, de:'QUIET_FOND', kw:['灏忔潕','缁撳','浼撮儙'], st:41, et:42, days:5 },
  { sum:'灏忔槑浠婂ぉ鐘舵€佷笉閿欙紝鍑嗘椂涓嬬彮锛屽仛浜嗚繍鍔?, ei:0.6, de:'SWEET_ATTACHMENT', kw:['鐘舵€佸ソ','杩愬姩','鍙樺ソ'], st:43, et:45, days:0 },
]

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鐭ヨ瘑鍥捐氨 / 鏃堕棿閿氱偣 / 涔犳儻 / 鑱旀兂锛堝悓 v2锛岀暐锛?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

const TRIPLES = [
  { s:'灏忔槑',p:'宸ヤ綔浜?,o:'鑵捐',c:0.95 }, { s:'灏忔槑',p:'浣忓湪',o:'娣卞湷鍗楀北鍖?,c:0.85 },
  { s:'灏忔槑',p:'姣曚笟浜?,o:'鍗庡崡鐞嗗伐澶у',c:0.8 }, { s:'灏忔槑',p:'鍏讳簡',o:'鍜挭锛堟鐚級',c:0.95 },
  { s:'灏忕孩',p:'鏄皬鏄庣殑',o:'鏈€濂界殑鏈嬪弸',c:0.9 }, { s:'灏忕孩',p:'涔熸槸',o:'澶у鍚屽',c:0.85 },
  { s:'灏忕孩',p:'鍦?,o:'鍒涗笟鍏徃鍋氫骇鍝佺粡鐞?,c:0.7 }, { s:'灏忔槑',p:'鏆楁亱',o:'灏忛泤',c:0.6 },
  { s:'灏忛泤',p:'鍦?,o:'浜у搧缁?,c:0.65 }, { s:'寮犲摜',p:'鏄皬鏄庣殑',o:'鐩村睘棰嗗',c:0.7 },
  { s:'灏忔槑',p:'鍠滄',o:'鐏攨锛堥夯杈ｏ級',c:0.9 }, { s:'灏忔槑',p:'璁ㄥ帉',o:'棣欒彍',c:0.85 },
  { s:'灏忔槑',p:'姝ｅ湪瀛?,o:'鍚変粬',c:0.8 }, { s:'鍜挭',p:'骞撮緞',o:'3宀?,c:0.9 },
  { s:'灏忔槑',p:'鑰佸鍦?,o:'婀栧崡闀挎矙',c:0.85 }, { s:'鐖哥埜',p:'鏄?,o:'涓鏁板鑰佸笀',c:0.8 },
  { s:'灏忛洦',p:'鏄皬鏄庣殑',o:'濡瑰',c:0.8 }, { s:'灏忛洦',p:'鍦?,o:'闀挎矙瀛﹀尰',c:0.75 },
  { s:'灏忔潕',p:'鏄皬鏄庣殑',o:'澶у瀹ゅ弸',c:0.75 }, { s:'灏忔潕',p:'鍦?,o:'鍖椾含瀛楄妭璺冲姩',c:0.7 },
  { s:'闃挎澃',p:'鏄皬鏄庣殑',o:'鐞冨弸',c:0.7 }, { s:'闃挎澃',p:'鍦?,o:'鍗庝负宸ヤ綔',c:0.65 },
  { s:'灏忔槑',p:'浼氱敤',o:'Go/Python/Java',c:0.8 }, { s:'灏忔槑',p:'鍠滄',o:'鍛ㄦ澃浼?,c:0.85 },
  { s:'灏忔槑',p:'鏄?,o:'婀栦汉鐞冭糠',c:0.7 },
]

const ANCHORS = [
  { date:`${YEAR}-08-15`, type:'birthday', ei:0.9, dom:'IDENTITY', sum:'灏忔槑鐨勭敓鏃? },
  { date:ts(300,12).slice(0,10), type:'first_met', ei:0.6, dom:'RELATIONSHIP', sum:'绗竴娆¤亰澶? },
  { date:ts(150,17).slice(0,10), type:'milestone', ei:0.8, dom:'MOOD', sum:'PMP閫氳繃' },
  { date:ts(10,20).slice(0,10), type:'relationship', ei:0.7, dom:'MOOD', sum:'鍜屽皬绾㈠拰濂? },
  { date:ts(3,17).slice(0,10), type:'milestone', ei:0.7, dom:'WORK', sum:'椤圭洰涓婄嚎' },
  { date:`${YEAR+1}-01-29`, type:'holiday', ei:0.7, dom:'COMMITMENT', sum:'鏄ヨ妭' },
  { date:ts(1,14).slice(0,10), type:'recurring_memory', ei:0.6, dom:'MOOD', sum:'灏忛泤澶告垜浠ｇ爜濂? },
  { date:TODAY, type:'recurring_memory', ei:0.5, dom:'MOOD', sum:'浠婂ぉ鐘舵€佷笉閿? },
  { date:`${YEAR}-12-25`, type:'holiday', ei:0.5, dom:'PREFERENCE', sum:'鍦ｈ癁鑺? },
  { date:`${YEAR}-10-01`, type:'holiday', ei:0.6, dom:'COMMITMENT', sum:'鍥藉簡' },
]

const HABITS = [
  { type:'late_chatter',scope:'long_term',wd:null,hs:22,he:2,c:0.8,oc:15,src:'detected',note:'22鐐?2鐐硅亰澶? },
  { type:'late_chatter',scope:'long_term',wd:5,hs:23,he:3,c:0.7,oc:8,src:'detected',note:'鍛ㄤ簲鏇存櫄' },
  { type:'morning_quiet',scope:'long_term',wd:null,hs:7,he:9,c:0.6,oc:10,src:'detected',note:'鏃╀笂涓嶆椿璺? },
  { type:'suppress_type',scope:'short_term',wd:null,hs:14,he:18,c:0.9,oc:1,src:'explicit',note:'涓嬪崍鍒彁閱?,exp:Date.now()+4*3600000 },
  { type:'dnd',scope:'short_term',wd:null,hs:1,he:8,c:0.95,oc:1,src:'explicit',note:'浠婃櫄鍒儲鎴?,exp:Date.now()+7*3600000 },
  { type:'late_chatter',scope:'long_term',wd:6,hs:10,he:12,c:0.65,oc:6,src:'detected',note:'鍛ㄥ叚涓婂崍鑱婂ぉ' },
  { type:'late_chatter',scope:'long_term',wd:null,hs:12,he:13,c:0.55,oc:8,src:'detected',note:'鍗堜紤鑱婂ぉ' },
  { type:'late_chatter',scope:'long_term',wd:null,hs:18,he:20,c:0.6,oc:12,src:'detected',note:'涓嬬彮鍚庢椿璺? },
]

const ASSOC_LINKS: Array<[string,string,string,number]> = [
  ['鐏攨','棣欒彍','瀵规瘮鍋忓ソ',0.8], ['灏忕孩','澶у鍚屽','鍚屼竴浜?,0.9],
  ['鍜挭','姗樼尗','鍚屼竴瀹炰綋',0.95], ['PMP','AWS','杩炵画鐩爣',0.7],
  ['鍔犵彮','澶辩湢','鍥犳灉鍏崇郴',0.8], ['灏忕孩','鍚垫灦','鍏宠仈浜嬩欢',0.75],
  ['鍚変粬','鍛ㄦ澃浼?,'鍏磋叮鍏宠仈',0.6], ['濡堝','鏄ヨ妭鏃呮父','鎵胯鍏宠仈',0.8],
  ['灏忛泤','鍔犵彮','鍏宠仈浜嬩欢',0.7], ['濂跺ザ','浣忛櫌','鍏宠仈浜嬩欢',0.8],
  ['灏忔潕','缁撳','鍏宠仈浜嬩欢',0.7], ['绡悆','闃挎澃','鍏磋叮鍏宠仈',0.75],
  ['鍘熺','鍔ㄦ极','鍏磋叮鍏宠仈',0.6], ['棰堟','涔呭潗','鍥犳灉鍏崇郴',0.7],
  ['鐒﹁檻','澶辩湢','鍥犳灉鍏宠仈',0.65],
]

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 涓诲嚱鏁?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export function seedTestData(presetId = 'deredere'): {
  root:string; store:FactStore; episodicStore:EpisodicStore; kg:KnowledgeGraph
  retriever:MemoryRetriever; state:FullState; cleanup:()=>void
} {
  const root = join(tmpdir(),`Ackem-seed-${Date.now()}-${Math.random().toString(36).slice(2,6)}`)
  mkdirSync(join(root,'memory','facts'),{recursive:true})
  mkdirSync(join(root,'memory','episodes'),{recursive:true})
  mkdirSync(join(root,'memory','kg'),{recursive:true})
  mkdirSync(join(root,'companion'),{recursive:true})

  // 1. 浜嬪疄锛堝甫绮剧‘ createdAt锛?
  const store = new FactStore(defaultFactsPath(root)); store.load()
  for (const f of ALL_FACTS) {
    const fact = store.addFact({
      domain:f.d, subcategory:f.sub, subject:f.s, summary:f.sum,
      confidence:f.c, triggers:f.t, sourceSessionId:SESSION,
      sourceTurnIndex:f.trn, emotionalContext:f.ec, factLayer:'raw',
    })
    // 鐩存帴淇敼鍐呭瓨瀵硅薄鐨?createdAt锛堢簿纭椂闂存埑锛?
    fact.createdAt = f.createdAt
  }
  store.flush()
  // 鍚屾鍒?DB
  const db = getDatabase(root)
  if (db) {
    for (const fact of store.listActive()) {
      db.prepare(`UPDATE memory_facts SET created_at=? WHERE id=?`).run(fact.createdAt, fact.id)
    }
    // ageMeta
    const bf = store.listActive().find(f => (f as any).ageMeta)
    if (bf) db.prepare(`UPDATE memory_facts SET age_value=25,age_birth_year=1999,age_birthday_mmdd='08-15',age_recorded_at=?,age_is_estimate=0 WHERE id=?`).run(ts(300,21),bf.id)
  }
  store.flush()

  // 2. 鎯呰妭
  const episodicStore = new EpisodicStore(defaultEpisodesPath(root)); episodicStore.load()
  let prevEpId:string|null = null
  for (const ep of EPISODES) {
    const added = episodicStore.add({ summary:ep.sum, emotionalIntensity:ep.ei, dominantEmotion:ep.de, keywords:ep.kw, prevEpisodeId:prevEpId, sourceSessionId:SESSION, startTurn:ep.st, endTurn:ep.et })
    prevEpId = added.id
  }

  // 3. 鐭ヨ瘑鍥捐氨
  const kg = new KnowledgeGraph(defaultKgPath(root)); kg.load()
  for (const t of TRIPLES) kg.add({ subject:t.s, predicate:t.p, object:t.o, confidence:t.c, sourceFactIds:[] })

  // 4. 鏃堕棿閿氱偣
  if (db) for (const a of ANCHORS) db.prepare(`INSERT OR IGNORE INTO temporal_anchors (id,anchor_date,anchor_type,linked_fact_ids,emotional_intensity,domain,summary,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),a.date,a.type,'',a.ei,a.dom,a.sum,new Date().toISOString())

  // 5. 涔犳儻
  if (db) { const now=Date.now(); for (const h of HABITS) db.prepare(`INSERT OR IGNORE INTO user_habits (id,type,scope,weekday,hour_start,hour_end,confidence,occurrence_count,first_seen_at,last_confirmed_at,expires_at,source,suppress_target,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),h.type,h.scope,h.wd,h.hs,h.he,h.c,h.oc,now,now,h.exp??null,h.src,h.type==='suppress_type'?'health_reminder':null,h.note,now,now) }

  // 6. 鑱旀兂
  if (db) {
    const facts = store.listActive()
    const bySum = (s:string) => facts.find(f => f.summary.includes(s))
    for (const [a,b,type,str] of ASSOC_LINKS) {
      const fa=bySum(a),fb=bySum(b)
      if (fa&&fb) db.prepare(`INSERT OR IGNORE INTO memory_associations (id,fact_id_a,fact_id_b,association_type,strength,created_at) VALUES (?,?,?,?,?,?)`).run(randomUUID(),fa.id,fb.id,type,str,new Date().toISOString())
    }
  }

  // 7. 鐘舵€侊紙妯℃嫙 300 澶╀娇鐢ㄥ悗鐨勫叧绯伙級
  const preset = PERSONALITY_PRESETS.find(p=>p.id===presetId) ?? PERSONALITY_PRESETS[5]
  const state:FullState = defaultFullState({presetId:preset.id,T:preset.T,I:preset.I,S:preset.S,O:preset.O,R:preset.R})
  state.relationship = { stage:'FAMILIAR', trust:62, rifts:0, affection_momentum:0.45, atmosphere:'warm', consecutivePositiveTurns:12, turnsSinceLastRift:30, sharedEventsCount:8 }
  state.emotion = { aff:42, sec:25, aro:10, dom:-3, primaryLabel:'QUIET_FOND', isLocked:false }
  state.counters = { totalTurns:200, sharedEventsCount:8, consecutiveMeaningfulTurns:12 }
  state.lastActive = ts(0,20)
  state.firstMetDate = ts(300,20).slice(0,10)
  state.AckemBirthday = ts(300,20).slice(0,10)
  saveState(root,state)

  const retriever = new MemoryRetriever(store, null, episodicStore, kg)
  return { root, store, episodicStore, kg, retriever, state, cleanup:()=>{ closeAllDatabases(); rmSync(root,{recursive:true,force:true}) } }
}

export function printSeedSummary(ctx:ReturnType<typeof seedTestData>):void {
  const facts = ctx.store.listActive()
  const eps = ctx.episodicStore.listAll()
  const tris = ctx.kg.listAll()
  const db = getDatabase(ctx.root)
  const anc = (db?.prepare('SELECT COUNT(*) as c FROM temporal_anchors').get() as any)?.c ?? 0
  const hab = (db?.prepare('SELECT COUNT(*) as c FROM user_habits').get() as any)?.c ?? 0
  const asc = (db?.prepare('SELECT COUNT(*) as c FROM memory_associations').get() as any)?.c ?? 0
  const doms:Record<string,number> = {}
  for (const f of facts) doms[f.domain] = (doms[f.domain]??0)+1

  // 鏃堕棿灞傚垎甯?
  const now = Date.now()
  const layers = { '鏂伴矞(0-3d)':0, '杩戞湡(3-14d)':0, '涓湡(14-60d)':0, '杩滄湡(60-180d)':0, '娣辫蹇?180-365d)':0 }
  for (const f of facts) {
    const days = (now - new Date(f.createdAt).getTime()) / 86400000
    if (days < 3) layers['鏂伴矞(0-3d)']++
    else if (days < 14) layers['杩戞湡(3-14d)']++
    else if (days < 60) layers['涓湡(14-60d)']++
    else if (days < 180) layers['杩滄湡(60-180d)']++
    else layers['娣辫蹇?180-365d)']++
  }

  console.log('\n鈺斺晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晽')
  console.log('鈺?    娴嬭瘯绉嶅瓙鏁版嵁 v3 路 鏃堕棿鍒嗗眰 路 200 鏉?      鈺?)
  console.log('鈺犫晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暎')
  console.log(`鈺? 璁板繂浜嬪疄:  ${String(facts.length).padStart(3)} 鏉?                          鈺慲)
  for (const [k,v] of Object.entries(layers)) console.log(`鈺?   ${k.padEnd(14)} ${String(v).padStart(3)} 鏉?                          鈺慲)
  console.log(`鈺? 鍩熷垎甯?    ${Object.entries(doms).map(([k,v])=>`${k}:${v}`).join(' ').slice(0,38).padEnd(38)}  鈺慲)
  console.log(`鈺? 鎯呰妭璁板繂:  ${String(eps.length).padStart(3)} 娈?(璺?${Math.round((now-new Date(eps[0]?.createdAt??0).getTime())/86400000)}~0 澶?              鈺慲)
  console.log(`鈺? 鐭ヨ瘑鍥捐氨:  ${String(tris.length).padStart(3)} 鏉′笁鍏冪粍                     鈺慲)
  console.log(`鈺? 鏃堕棿閿氱偣:  ${String(anc).padStart(3)} 鏉?                          鈺慲)
  console.log(`鈺? 鐢ㄦ埛涔犳儻:  ${String(hab).padStart(3)} 鏉?                          鈺慲)
  console.log(`鈺? 璁板繂鑱旀兂:  ${String(asc).padStart(3)} 鏉?                          鈺慲)
  console.log(`鈺? 鍏崇郴:      ${ctx.state.relationship.stage} trust=${ctx.state.relationship.trust}               鈺慲)
  console.log(`鈺? 鎯呯华:      ${ctx.state.emotion.primaryLabel} aff=${ctx.state.emotion.aff}               鈺慲)
  console.log('鈺氣晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暆\n')
}
