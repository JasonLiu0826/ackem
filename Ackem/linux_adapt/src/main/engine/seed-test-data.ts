// [seed-test-data] — 实机测试数据种子 v3（200 条 + 时间分层）
// 模拟用户 6 个月使用，记忆按时间层分布：新鲜(0-3d) / 近期(3-14d) / 中期(14-60d) / 远期(60-180d) / 深记忆(180-365d)
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

/** 创建精确时间戳：daysAgo 天前 + hour 点 */
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

// ═══════════════════════════════════════════
// 200 条事实 — 按时间层分布
// ═══════════════════════════════════════════

type F = { d:string; sub:string; s:string; sum:string; c:number; t:string[]; ec:EmotionalContext; trn:number; hr:number; age?:{age:number;mmdd:string;yr:number} }

// ── 新鲜层 (0-3天, ~25条) ── 高召回率，近期事件 ──
const FRESH: F[] = [
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天状态不错，准时下班了',c:0.7,t:['准时','下班','状态好'],ec:EC.p,trn:195,hr:18 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天被小雅夸了，说他代码写得好',c:0.75,t:['小雅','夸','代码'],ec:EC.p,trn:196,hr:14 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天一个人吃了火锅，有点孤独',c:0.65,t:['一个人','火锅','孤独'],ec:EC.v,trn:197,hr:21 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天心情一般，没什么特别的事',c:0.5,t:['心情','一般'],ec:EC.n,trn:198,hr:20 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明今天代码合并冲突搞了两小时',c:0.55,t:['合并冲突','代码'],ec:EC.neg,trn:199,hr:16 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明今天写了一个自动化脚本，省了很多重复工作',c:0.7,t:['自动化','脚本'],ec:EC.p,trn:200,hr:11 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明今天准时下班了，难得',c:0.55,t:['准时','下班','难得'],ec:EC.p,trn:201,hr:18 },
  { d:'HEALTH',sub:'MENTAL',s:'用户',sum:'小明今天感觉状态不错，精力充沛',c:0.6,t:['状态好','精力'],ec:EC.p,trn:202,hr:10 },
  { d:'HEALTH',sub:'EXERCISE',s:'用户',sum:'小明今天做了20个俯卧撑，是这周第一次运动',c:0.5,t:['俯卧撑','运动'],ec:EC.n,trn:203,hr:20 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'小雅',sum:'小明今天在食堂偶遇小雅，一起吃了午饭',c:0.65,t:['小雅','食堂','午饭'],ec:EC.p,trn:204,hr:12 },
  { d:'RELATIONSHIP',sub:'PET',s:'咪咪',sum:'咪咪今天特别乖，趴在小明腿上睡了一下午',c:0.7,t:['咪咪','乖','睡觉'],ec:EC.p,trn:205,hr:15 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'妈妈',sum:'妈妈今天打电话来，问小明吃了没',c:0.6,t:['妈妈','打电话'],ec:EC.n,trn:206,hr:19 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'奶奶',sum:'小明给奶奶买了一台血压计寄回去了',c:0.65,t:['奶奶','血压计'],ec:EC.p,trn:207,hr:10 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'用户',sum:'小明今天看了《三体》大结局，感慨万千',c:0.6,t:['三体','结局','感慨'],ec:EC.p,trn:208,hr:23 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明今天debug了一个诡异的并发问题',c:0.65,t:['debug','并发'],ec:EC.p,trn:209,hr:15 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明的项目通过了安全审计',c:0.7,t:['安全审计','通过'],ec:EC.p,trn:210,hr:17 },
  { d:'HEALTH',sub:'SLEEP',s:'用户',sum:'小明昨天失眠了，翻来覆去到2点才睡着',c:0.7,t:['失眠','2点'],ec:EC.v,trn:211,hr:3 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天学会了弹《小星星》的吉他版',c:0.6,t:['吉他','小星星','学会'],ec:EC.p,trn:212,hr:22 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明被拉进了一个紧急oncall群',c:0.5,t:['oncall','紧急'],ec:EC.neg,trn:213,hr:9 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天心情特别好，因为天气好+项目顺利',c:0.8,t:['心情好','天气','顺利'],ec:EC.p,trn:214,hr:11 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'小红',sum:'小红最近在学画画，给小明画了一幅猫的素描',c:0.6,t:['小红','画画','素描'],ec:EC.p,trn:215,hr:20 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'小陈',sum:'小明今天教小陈用git rebase',c:0.6,t:['小陈','git','rebase'],ec:EC.p,trn:216,hr:14 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明今天和产品经理吵了一架，需求又改了',c:0.6,t:['产品经理','吵架','需求'],ec:EC.neg,trn:217,hr:16 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明计划明年带奶奶去体检',c:0.6,t:['奶奶','体检','明年'],ec:EC.p,trn:218,hr:22 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得有个人可以倾诉真的很幸运',c:0.65,t:['倾诉','幸运'],ec:EC.p,trn:219,hr:1 },
]

// ── 近期层 (3-14天, ~40条) ──
const RECENT: F[] = [
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明的项目上线了，用户反馈不错',c:0.8,t:['项目','上线','反馈'],ec:EC.p,trn:170,hr:17 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明和小红和好了，互相道歉了',c:0.8,t:['和好','道歉','小红'],ec:EC.p,trn:171,hr:20 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天跑步跑了5公里，是自己的新纪录',c:0.7,t:['跑步','5公里','纪录'],ec:EC.p,trn:172,hr:7 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明被安排下周去上海出差',c:0.5,t:['出差','上海'],ec:EC.n,trn:173,hr:10 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明和CTO一对一谈话，CTO很看好他',c:0.7,t:['CTO','谈话','看好'],ec:EC.p,trn:174,hr:15 },
  { d:'HEALTH',sub:'CONDITION',s:'用户',sum:'小明的胃病最近好多了',c:0.55,t:['胃病','好多了'],ec:EC.p,trn:175,hr:12 },
  { d:'HEALTH',sub:'MENTAL',s:'用户',sum:'小明觉得有个人可以倾诉真的很重要',c:0.65,t:['倾诉','重要'],ec:EC.p,trn:176,hr:23 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'奶奶',sum:'小明的奶奶住院了，他很担心但请不了假',c:0.7,t:['奶奶','住院','担心'],ec:EC.v,trn:177,hr:3 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'小李',sum:'小李下个月要结婚了，小明要去北京当伴郎',c:0.7,t:['小李','结婚','伴郎'],ec:EC.p,trn:178,hr:20 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明做了一个噩梦，梦到被追着跑',c:0.5,t:['噩梦','梦'],ec:EC.neg,trn:179,hr:4 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明帮同事解决了一个困扰了三天的bug',c:0.7,t:['bug','解决','同事'],ec:EC.p,trn:180,hr:16 },
  { d:'HEALTH',sub:'SLEEP',s:'用户',sum:'小明发现听白噪音有助于入睡',c:0.55,t:['白噪音','入睡'],ec:EC.n,trn:181,hr:23 },
  { d:'WORK',sub:'PROJECT',s:'用户',sum:'小明的项目需要对接银行的API，文档很烂',c:0.55,t:['银行','API','文档'],ec:EC.neg,trn:182,hr:14 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明收到了大学聚会的邀请，有点想去',c:0.5,t:['聚会','大学','邀请'],ec:EC.n,trn:183,hr:19 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'小雅',sum:'小明和小雅一起加班过几次，聊得挺开心',c:0.6,t:['小雅','加班','聊天'],ec:EC.p,trn:184,hr:22 },
  { d:'HEALTH',sub:'CONDITION',s:'用户',sum:'小明体检报告说血脂偏高',c:0.65,t:['体检','血脂'],ec:EC.neg,trn:185,hr:10 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明被表扬了，说他带新人带得好',c:0.7,t:['表扬','带新'],ec:EC.p,trn:186,hr:15 },
  { d:'HEALTH',sub:'EXERCISE',s:'用户',sum:'小明周末约了阿杰去爬山',c:0.5,t:['爬山','阿杰'],ec:EC.p,trn:187,hr:9 },
  { d:'MOOD',sub:'PATTERN',s:'用户',sum:'小明晚上11点以后特别容易emo',c:0.6,t:['晚上','11点','emo'],ec:EC.v,trn:188,hr:1 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明发现自己的一个旧项目被公司废弃了',c:0.55,t:['旧项目','废弃'],ec:EC.neg,trn:189,hr:11 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明想把吉他练到能弹唱一首完整的歌',c:0.55,t:['吉他','弹唱'],ec:EC.p,trn:190,hr:22 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'张哥',sum:'张哥上次批评小明是因为代码review没做好',c:0.6,t:['张哥','批评','review'],ec:EC.neg,trn:191,hr:16 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'王姐',sum:'王姐推荐小明看《设计模式》这本书',c:0.5,t:['王姐','设计模式'],ec:EC.n,trn:192,hr:14 },
  { d:'HEALTH',sub:'DIET',s:'用户',sum:'小明最近开始喝枸杞水养生了',c:0.5,t:['枸杞','养生'],ec:EC.n,trn:193,hr:10 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得《三体》是中国最好的科幻小说',c:0.55,t:['三体','科幻'],ec:EC.p,trn:194,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得生活要有仪式感',c:0.5,t:['仪式感','生活'],ec:EC.p,trn:195,hr:20 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'用户',sum:'小明最近在追《三体》电视剧',c:0.75,t:['三体','电视剧'],ec:EC.n,trn:196,hr:21 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明的年终绩效拿了B+',c:0.6,t:['绩效','B+'],ec:EC.n,trn:197,hr:15 },
  { d:'HEALTH',sub:'EXERCISE',s:'用户',sum:'小明买了个瑜伽垫，想在家做拉伸',c:0.5,t:['瑜伽垫','拉伸'],ec:EC.n,trn:198,hr:20 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明计划下个月去上海出差时顺便见小李',c:0.6,t:['上海','出差','小李'],ec:EC.n,trn:199,hr:10 },
  { d:'HEALTH',sub:'DIET',s:'用户',sum:'小明最近早餐开始吃燕麦了',c:0.45,t:['早餐','燕麦'],ec:EC.n,trn:200,hr:8 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明今天地铁上让座给一个老奶奶',c:0.5,t:['让座','地铁'],ec:EC.p,trn:201,hr:8 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'妹妹',sum:'小雨暑假会来深圳找小明玩',c:0.65,t:['小雨','暑假','深圳'],ec:EC.p,trn:202,hr:20 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得远程办公是未来的趋势',c:0.5,t:['远程','办公'],ec:EC.n,trn:203,hr:14 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明认为每个人都有自己的节奏',c:0.6,t:['节奏','自己'],ec:EC.p,trn:204,hr:23 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明今天和产品经理吵架了',c:0.6,t:['产品经理','吵架'],ec:EC.neg,trn:205,hr:16 },
  { d:'RELATIONSHIP',sub:'NEIGHBOR',s:'隔壁老王',sum:'小明隔壁住的是个程序员老王',c:0.5,t:['隔壁','老王','邻居'],ec:EC.n,trn:206,hr:19 },
  { d:'PREFERENCE',sub:'SNACK',s:'用户',sum:'小明喜欢吃辣条，卫龙的那种',c:0.55,t:['辣条','卫龙'],ec:EC.p,trn:207,hr:22 },
  { d:'COMMITMENT',sub:'PROMISE',s:'用户',sum:'小明答应阿杰下个月一起去爬梧桐山',c:0.55,t:['阿杰','梧桐山'],ec:EC.p,trn:208,hr:20 },
]

// ── 中期层 (14-60天, ~55条) ── 关系建立、偏好确认、工作里程碑 ──
const MEDIUM: F[] = [
  { d:'IDENTITY',sub:'NAME',s:'用户',sum:'用户名字叫小明',c:0.95,t:['小明','名字','我叫'],ec:EC.n,trn:1,hr:20 },
  { d:'IDENTITY',sub:'AGE',s:'用户',sum:'小明今年25岁，1999年8月15日出生',c:0.9,t:['年龄','生日','出生'],ec:EC.n,trn:2,hr:21,age:{age:25,mmdd:'08-15',yr:1999} },
  { d:'IDENTITY',sub:'OCCUPATION',s:'用户',sum:'小明在腾讯做后端开发工程师',c:0.95,t:['工作','腾讯','后端'],ec:EC.n,trn:3,hr:20 },
  { d:'IDENTITY',sub:'LOCATION',s:'用户',sum:'小明住在深圳南山区科技园附近',c:0.85,t:['住','深圳','南山'],ec:EC.n,trn:4,hr:22 },
  { d:'IDENTITY',sub:'EDUCATION',s:'用户',sum:'小明是华南理工大学计算机系毕业的',c:0.8,t:['大学','毕业','华工'],ec:EC.n,trn:5,hr:21 },
  { d:'IDENTITY',sub:'HOMETOWN',s:'用户',sum:'小明老家在湖南长沙',c:0.85,t:['老家','湖南','长沙'],ec:EC.n,trn:6,hr:20 },
  { d:'IDENTITY',sub:'GENDER',s:'用户',sum:'小明是男生',c:0.95,t:['男','性别'],ec:EC.n,trn:7,hr:19 },
  { d:'IDENTITY',sub:'ZODIAC',s:'用户',sum:'小明是狮子座',c:0.7,t:['狮子座','星座'],ec:EC.n,trn:8,hr:22 },
  { d:'IDENTITY',sub:'PERSONALITY',s:'用户',sum:'小明说自己是INTJ型人格',c:0.6,t:['INTJ','MBTI'],ec:EC.n,trn:9,hr:23 },
  { d:'IDENTITY',sub:'PHONE',s:'用户',sum:'小明用的是iPhone 15 Pro',c:0.7,t:['手机','iPhone'],ec:EC.n,trn:10,hr:20 },
  { d:'IDENTITY',sub:'HEIGHT',s:'用户',sum:'小明身高175cm',c:0.7,t:['身高','多高'],ec:EC.n,trn:11,hr:21 },
  { d:'IDENTITY',sub:'WEIGHT',s:'用户',sum:'小明体重70kg',c:0.65,t:['体重','胖'],ec:EC.n,trn:12,hr:22 },
  { d:'IDENTITY',sub:'DRIVING',s:'用户',sum:'小明有驾照但没买车',c:0.6,t:['驾照','开车'],ec:EC.n,trn:13,hr:20 },
  { d:'IDENTITY',sub:'COMMUTE',s:'用户',sum:'小明每天地铁通勤40分钟',c:0.65,t:['通勤','地铁'],ec:EC.n,trn:14,hr:8 },
  { d:'IDENTITY',sub:'LIVING_ALONE',s:'用户',sum:'小明一个人住，偶尔觉得孤独',c:0.7,t:['独居','孤独'],ec:EC.v,trn:15,hr:1 },
  { d:'PREFERENCE',sub:'FOOD',s:'用户',sum:'小明最喜欢吃火锅，尤其是麻辣锅底',c:0.9,t:['火锅','麻辣'],ec:EC.p,trn:16,hr:19 },
  { d:'PREFERENCE',sub:'FOOD',s:'用户',sum:'小明不吃香菜',c:0.85,t:['香菜','不吃'],ec:EC.neg,trn:17,hr:12 },
  { d:'PREFERENCE',sub:'FOOD',s:'用户',sum:'小明喜欢吃辣，湖南人嘛',c:0.8,t:['辣','湖南'],ec:EC.p,trn:18,hr:19 },
  { d:'PREFERENCE',sub:'DRINK',s:'用户',sum:'小明喝咖啡只喝美式',c:0.7,t:['咖啡','美式'],ec:EC.n,trn:19,hr:10 },
  { d:'PREFERENCE',sub:'HOBBY',s:'用户',sum:'小明喜欢打篮球，每周六下午会去打',c:0.85,t:['篮球','周六'],ec:EC.p,trn:20,hr:16 },
  { d:'PREFERENCE',sub:'HOBBY',s:'用户',sum:'小明最近在学吉他，买了把雅马哈F310',c:0.8,t:['吉他','雅马哈'],ec:EC.p,trn:21,hr:22 },
  { d:'PREFERENCE',sub:'HOBBY',s:'用户',sum:'小明喜欢玩《原神》',c:0.7,t:['原神','游戏'],ec:EC.p,trn:22,hr:23 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'用户',sum:'小明喜欢看科幻电影，最喜欢星际穿越',c:0.85,t:['电影','科幻','星际穿越'],ec:EC.p,trn:23,hr:21 },
  { d:'PREFERENCE',sub:'MUSIC',s:'用户',sum:'小明喜欢听周杰伦的歌',c:0.85,t:['周杰伦','音乐'],ec:EC.p,trn:24,hr:20 },
  { d:'PREFERENCE',sub:'SPORT',s:'用户',sum:'小明是湖人球迷，最喜欢詹姆斯',c:0.7,t:['湖人','詹姆斯','NBA'],ec:EC.p,trn:25,hr:22 },
  { d:'PREFERENCE',sub:'TRAVEL',s:'用户',sum:'小明去过日本旅游，觉得京都很好',c:0.7,t:['日本','京都'],ec:EC.p,trn:26,hr:20 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'小红',sum:'小红是小明最好的朋友，大学同学',c:0.9,t:['小红','朋友','大学同学'],ec:EC.p,trn:27,hr:21 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'妈妈',sum:'小明的妈妈在老家湖南',c:0.85,t:['妈妈','老家','湖南'],ec:EC.n,trn:28,hr:19 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'爸爸',sum:'小明的爸爸是中学老师，教数学',c:0.8,t:['爸爸','老师','数学'],ec:EC.n,trn:29,hr:20 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'妹妹',sum:'小明有个妹妹叫小雨，在长沙学医',c:0.8,t:['妹妹','小雨','学医'],ec:EC.p,trn:30,hr:21 },
  { d:'RELATIONSHIP',sub:'PET',s:'咪咪',sum:'小明养了一只橘猫叫咪咪，3岁了',c:0.95,t:['咪咪','橘猫','宠物'],ec:EC.p,trn:31,hr:20 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'张哥',sum:'张哥是小明的直属领导',c:0.7,t:['张哥','领导'],ec:EC.n,trn:32,hr:10 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'王姐',sum:'王姐是组里的资深开发',c:0.65,t:['王姐','资深'],ec:EC.n,trn:33,hr:14 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'小李',sum:'小李是小明的大学室友，在北京字节跳动',c:0.75,t:['小李','室友','字节'],ec:EC.n,trn:34,hr:20 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'阿杰',sum:'阿杰是小明打篮球认识的朋友',c:0.7,t:['阿杰','篮球'],ec:EC.n,trn:35,hr:16 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明主要用Go语言开发',c:0.8,t:['Go','语言'],ec:EC.n,trn:36,hr:14 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明熟悉MySQL和Redis',c:0.7,t:['MySQL','Redis'],ec:EC.n,trn:37,hr:15 },
  { d:'WORK',sub:'PROJECT',s:'用户',sum:'小明在做一个支付系统重构的项目',c:0.8,t:['支付','重构'],ec:EC.n,trn:38,hr:10 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明考试通过了PMP认证，非常开心',c:0.9,t:['PMP','通过','开心'],ec:EC.p,trn:39,hr:17 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明被领导批评了一次，心情很低落',c:0.85,t:['批评','领导','低落'],ec:EC.neg,trn:40,hr:16 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明的代码被选为团队最佳实践',c:0.8,t:['代码','最佳实践'],ec:EC.p,trn:41,hr:15 },
  { d:'MOOD',sub:'PATTERN',s:'用户',sum:'小明每到周日晚上就会有点焦虑',c:0.7,t:['周日','焦虑','周一'],ec:EC.neg,trn:42,hr:22 },
  { d:'HEALTH',sub:'SLEEP',s:'用户',sum:'小明最近经常加班到11点，睡眠不太好',c:0.85,t:['加班','睡眠','熬夜'],ec:EC.v,trn:43,hr:23 },
  { d:'HEALTH',sub:'CONDITION',s:'用户',sum:'小明颈椎不太好，久坐会疼',c:0.7,t:['颈椎','久坐','疼'],ec:EC.neg,trn:44,hr:15 },
  { d:'HEALTH',sub:'CONDITION',s:'用户',sum:'小明有点近视，戴350度的眼镜',c:0.8,t:['近视','眼镜'],ec:EC.n,trn:45,hr:20 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明计划今年考AWS架构师认证',c:0.75,t:['AWS','架构师'],ec:EC.n,trn:46,hr:22 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明打算春节带妈妈去旅游',c:0.7,t:['春节','旅游','妈妈'],ec:EC.p,trn:47,hr:21 },
  { d:'IDENTITY',sub:'SALARY',s:'用户',sum:'小明月薪大概25k',c:0.5,t:['工资','月薪'],ec:EC.n,trn:48,hr:23 },
  { d:'IDENTITY',sub:'WORK_YEARS',s:'用户',sum:'小明工作3年了',c:0.8,t:['工作年限','几年'],ec:EC.n,trn:49,hr:20 },
  { d:'IDENTITY',sub:'COMPUTER',s:'用户',sum:'小明的笔记本是MacBook Pro M3',c:0.7,t:['电脑','MacBook'],ec:EC.n,trn:50,hr:10 },
  { d:'IDENTITY',sub:'RENT',s:'用户',sum:'小明房租每月4500',c:0.5,t:['房租','租金'],ec:EC.n,trn:51,hr:22 },
  { d:'IDENTITY',sub:'COOKING',s:'用户',sum:'小明不太会做饭，基本靠外卖',c:0.6,t:['做饭','外卖'],ec:EC.n,trn:52,hr:19 },
  { d:'IDENTITY',sub:'DIALECT',s:'用户',sum:'小明会说长沙话',c:0.6,t:['方言','长沙话'],ec:EC.n,trn:53,hr:20 },
  { d:'IDENTITY',sub:'BLOOD_TYPE',s:'用户',sum:'小明是O型血',c:0.65,t:['血型','O型'],ec:EC.n,trn:54,hr:21 },
]

// ── 远期层 (60-180天, ~50条) ── 早期偏好、深层关系、旧工作事件 ──
const DISTANT: F[] = [
  { d:'PREFERENCE',sub:'FOOD',s:'用户',sum:'小明喜欢吃烧烤，尤其是烤羊肉串',c:0.75,t:['烧烤','羊肉串'],ec:EC.p,trn:55,hr:20 },
  { d:'PREFERENCE',sub:'FOOD',s:'用户',sum:'小明不太吃甜食',c:0.6,t:['甜食','蛋糕'],ec:EC.n,trn:56,hr:19 },
  { d:'PREFERENCE',sub:'DRINK',s:'用户',sum:'小明偶尔喝啤酒，喜欢百威',c:0.6,t:['啤酒','百威'],ec:EC.n,trn:57,hr:22 },
  { d:'PREFERENCE',sub:'HOBBY',s:'用户',sum:'小明偶尔打英雄联盟，喜欢玩中单',c:0.65,t:['英雄联盟','LOL'],ec:EC.p,trn:58,hr:23 },
  { d:'PREFERENCE',sub:'HOBBY',s:'用户',sum:'小明喜欢看动漫，追过咒术回战',c:0.7,t:['动漫','咒术回战'],ec:EC.p,trn:59,hr:22 },
  { d:'PREFERENCE',sub:'ENTERTAINMENT',s:'用户',sum:'小明喜欢看脱口秀',c:0.6,t:['脱口秀'],ec:EC.p,trn:60,hr:21 },
  { d:'PREFERENCE',sub:'MUSIC',s:'用户',sum:'小明也喜欢听陈奕迅的歌',c:0.7,t:['陈奕迅','十年'],ec:EC.p,trn:61,hr:20 },
  { d:'PREFERENCE',sub:'BOOK',s:'用户',sum:'小明最近在读《人类简史》',c:0.65,t:['人类简史','读书'],ec:EC.p,trn:62,hr:23 },
  { d:'PREFERENCE',sub:'TRAVEL',s:'用户',sum:'小明想去冰岛看极光',c:0.6,t:['冰岛','极光'],ec:EC.p,trn:63,hr:22 },
  { d:'PREFERENCE',sub:'FASHION',s:'用户',sum:'小明穿衣风格偏休闲',c:0.5,t:['穿衣','卫衣'],ec:EC.n,trn:64,hr:20 },
  { d:'PREFERENCE',sub:'WEATHER',s:'用户',sum:'小明喜欢秋天',c:0.55,t:['秋天','天气'],ec:EC.n,trn:65,hr:15 },
  { d:'PREFERENCE',sub:'SEASON',s:'用户',sum:'小明最讨厌夏天，深圳太热了',c:0.5,t:['夏天','热'],ec:EC.neg,trn:66,hr:14 },
  { d:'PREFERENCE',sub:'TIME',s:'用户',sum:'小明是夜猫子，晚上效率最高',c:0.65,t:['夜猫子','晚上'],ec:EC.n,trn:67,hr:2 },
  { d:'PREFERENCE',sub:'SOCIAL',s:'用户',sum:'小明不太喜欢社交聚会',c:0.6,t:['社交','聚会'],ec:EC.n,trn:68,hr:20 },
  { d:'PREFERENCE',sub:'PET',s:'用户',sum:'小明喜欢猫多过狗',c:0.7,t:['猫','狗'],ec:EC.p,trn:69,hr:21 },
  { d:'RELATIONSHIP',sub:'EX',s:'前女友',sum:'小明大学时有个女朋友，大三分手了',c:0.5,t:['前女友','大学','分手'],ec:EC.neg,trn:70,hr:23 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'妈妈',sum:'妈妈总催小明找女朋友',c:0.7,t:['妈妈','催','女朋友'],ec:EC.neg,trn:71,hr:20 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'爸爸',sum:'爸爸不太善于表达，但小明知道爸爸很爱他',c:0.6,t:['爸爸','表达'],ec:EC.p,trn:72,hr:21 },
  { d:'RELATIONSHIP',sub:'FAMILY',s:'奶奶',sum:'小明的奶奶在乡下，身体不太好',c:0.75,t:['奶奶','乡下','身体'],ec:EC.v,trn:73,hr:3 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'小雅',sum:'小明对隔壁组的小雅有好感',c:0.6,t:['小雅','喜欢的人','暗恋'],ec:EC.p,trn:74,hr:22 },
  { d:'RELATIONSHIP',sub:'CRUSH',s:'小雅',sum:'小雅是产品组的，长发，笑起来很好看',c:0.55,t:['小雅','产品组','长发'],ec:EC.p,trn:75,hr:20 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'小陈',sum:'小陈是今年新来的应届生',c:0.6,t:['小陈','应届'],ec:EC.n,trn:76,hr:10 },
  { d:'WORK',sub:'PROJECT',s:'用户',sum:'小明负责的支付系统QPS从1000优化到了5000',c:0.75,t:['QPS','优化'],ec:EC.p,trn:77,hr:15 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明的代码review被张哥打回来了三次',c:0.65,t:['review','打回'],ec:EC.neg,trn:78,hr:16 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明参加了一次技术分享会',c:0.6,t:['技术分享','微服务'],ec:EC.p,trn:79,hr:14 },
  { d:'WORK',sub:'ASPIRATION',s:'用户',sum:'小明想在两年内升到T9级别',c:0.6,t:['升职','T9'],ec:EC.n,trn:80,hr:22 },
  { d:'WORK',sub:'ASPIRATION',s:'用户',sum:'小明有创业的想法',c:0.5,t:['创业','想法'],ec:EC.n,trn:81,hr:23 },
  { d:'WORK',sub:'EVENT',s:'用户',sum:'小明团队来了个新CTO',c:0.55,t:['CTO','OKR'],ec:EC.n,trn:82,hr:10 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明对分布式系统比较了解',c:0.6,t:['分布式','DDIA'],ec:EC.n,trn:83,hr:15 },
  { d:'HEALTH',sub:'EXERCISE',s:'用户',sum:'小明每周六打篮球，偶尔跑步',c:0.7,t:['篮球','跑步'],ec:EC.n,trn:84,hr:16 },
  { d:'HEALTH',sub:'CONDITION',s:'用户',sum:'小明换季容易过敏',c:0.6,t:['过敏','换季'],ec:EC.neg,trn:85,hr:10 },
  { d:'HEALTH',sub:'MENTAL',s:'用户',sum:'小明有时候会焦虑，但不知道为什么',c:0.65,t:['焦虑','心理'],ec:EC.v,trn:86,hr:23 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明加班到凌晨3点，第二天精神很差',c:0.7,t:['加班','凌晨'],ec:EC.neg,trn:87,hr:3 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明周末和朋友去唱KTV',c:0.75,t:['KTV','唱歌'],ec:EC.p,trn:88,hr:22 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明在网上看到一个感人的视频哭了',c:0.6,t:['感人','视频','哭'],ec:EC.v,trn:89,hr:1 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明堵车迟到了，被扣了50块钱',c:0.6,t:['堵车','迟到'],ec:EC.neg,trn:90,hr:9 },
  { d:'MOOD',sub:'PATTERN',s:'用户',sum:'小明一到下雨天就犯困',c:0.5,t:['下雨','犯困'],ec:EC.n,trn:91,hr:14 },
  { d:'MOOD',sub:'PATTERN',s:'用户',sum:'小明压力大的时候会咬指甲',c:0.55,t:['压力','咬指甲'],ec:EC.neg,trn:92,hr:15 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得健康比赚钱重要',c:0.6,t:['健康','赚钱'],ec:EC.n,trn:93,hr:22 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明相信努力会有回报',c:0.6,t:['努力','回报'],ec:EC.p,trn:94,hr:23 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得AI会改变很多行业',c:0.55,t:['AI','改变'],ec:EC.n,trn:95,hr:14 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得家人是最重要的',c:0.7,t:['家人','最重要'],ec:EC.p,trn:96,hr:21 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得深圳节奏太快了',c:0.55,t:['深圳','快'],ec:EC.neg,trn:97,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明认为真诚是最重要的品质',c:0.6,t:['真诚','品质'],ec:EC.p,trn:98,hr:22 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明对加班文化很反感',c:0.6,t:['加班','反感'],ec:EC.neg,trn:99,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得朋友不在多，在于真心',c:0.6,t:['朋友','真心'],ec:EC.p,trn:100,hr:22 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明想存钱买Model 3',c:0.6,t:['买车','Model 3'],ec:EC.n,trn:101,hr:22 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明计划下半年学React',c:0.6,t:['React','个人项目'],ec:EC.n,trn:102,hr:23 },
  { d:'COMMITMENT',sub:'PROMISE',s:'用户',sum:'小明答应妈妈今年一定回家过年',c:0.7,t:['回家','过年','妈妈'],ec:EC.p,trn:103,hr:21 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明想在30岁之前当上技术leader',c:0.55,t:['30岁','leader'],ec:EC.n,trn:104,hr:23 },
]

// ── 深记忆层 (180-365天, ~30条) ── 早期身份、童年回忆、深层价值观 ──
const DEEP: F[] = [
  { d:'IDENTITY',sub:'WORK_YEARS',s:'用户',sum:'小明2021年毕业就进了腾讯',c:0.8,t:['毕业','入职','2021'],ec:EC.n,trn:105,hr:20 },
  { d:'IDENTITY',sub:'WECHAT',s:'用户',sum:'小明微信昵称叫"码农小明"',c:0.6,t:['微信','昵称'],ec:EC.n,trn:106,hr:22 },
  { d:'IDENTITY',sub:'HANDEDNESS',s:'用户',sum:'小明是右撇子',c:0.5,t:['右撇子'],ec:EC.n,trn:107,hr:14 },
  { d:'IDENTITY',sub:'SLEEP_SCHEDULE',s:'用户',sum:'小明一般12点左右睡，8点起',c:0.7,t:['作息','几点睡'],ec:EC.n,trn:108,hr:1 },
  { d:'PREFERENCE',sub:'MUSIC',s:'用户',sum:'小明不太喜欢说唱',c:0.5,t:['说唱','rap'],ec:EC.n,trn:109,hr:22 },
  { d:'PREFERENCE',sub:'BOOK',s:'用户',sum:'小明高中时最喜欢的书是《三体》',c:0.7,t:['三体','高中'],ec:EC.p,trn:110,hr:21 },
  { d:'PREFERENCE',sub:'SPORT',s:'用户',sum:'小明偶尔跑步，一般跑3-5公里',c:0.6,t:['跑步','公里'],ec:EC.n,trn:111,hr:7 },
  { d:'PREFERENCE',sub:'FASHION',s:'用户',sum:'小明不喜欢穿正装',c:0.5,t:['正装','西装'],ec:EC.n,trn:112,hr:10 },
  { d:'PREFERENCE',sub:'MOVIE_GENRE',s:'用户',sum:'小明不喜欢看恐怖片',c:0.6,t:['恐怖片','害怕'],ec:EC.neg,trn:113,hr:23 },
  { d:'PREFERENCE',sub:'GAME',s:'用户',sum:'小明小时候最喜欢玩《我的世界》',c:0.6,t:['我的世界','Minecraft'],ec:EC.p,trn:114,hr:22 },
  { d:'PREFERENCE',sub:'TV',s:'用户',sum:'小明喜欢看《老友记》',c:0.6,t:['老友记','美剧'],ec:EC.p,trn:115,hr:21 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明也会Python和Java',c:0.8,t:['Python','Java'],ec:EC.n,trn:116,hr:14 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明最近在学Kubernetes',c:0.7,t:['Kubernetes','K8s'],ec:EC.n,trn:117,hr:15 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明正在准备AWS架构师认证考试',c:0.65,t:['AWS','架构师','认证'],ec:EC.n,trn:118,hr:22 },
  { d:'WORK',sub:'SKILL',s:'用户',sum:'小明对Redis缓存穿透击穿雪崩很清楚',c:0.6,t:['Redis','穿透','击穿'],ec:EC.n,trn:119,hr:15 },
  { d:'HEALTH',sub:'DIET',s:'用户',sum:'小明最近在控制饮食，少吃碳水',c:0.6,t:['控制饮食','碳水'],ec:EC.n,trn:120,hr:12 },
  { d:'HEALTH',sub:'CONDITION',s:'用户',sum:'小明有轻微的胃病',c:0.6,t:['胃病','辣'],ec:EC.neg,trn:121,hr:19 },
  { d:'RELATIONSHIP',sub:'FRIEND',s:'小红',sum:'小红在一家创业公司做产品经理',c:0.7,t:['小红','产品经理'],ec:EC.n,trn:122,hr:14 },
  { d:'RELATIONSHIP',sub:'COLLEAGUE',s:'王姐',sum:'王姐推荐小明看《设计模式》',c:0.5,t:['王姐','设计模式'],ec:EC.n,trn:123,hr:14 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明和小红吵架了，因为一件小事',c:0.75,t:['吵架','小红'],ec:EC.neg,trn:124,hr:20 },
  { d:'MOOD',sub:'EVENT',s:'用户',sum:'小明在网上看到一个感人的视频',c:0.6,t:['感人','视频'],ec:EC.v,trn:125,hr:1 },
  { d:'MOOD',sub:'PATTERN',s:'用户',sum:'小明开心的时候会哼歌',c:0.5,t:['开心','哼歌'],ec:EC.p,trn:126,hr:15 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得程序员35岁不一定被淘汰',c:0.5,t:['35岁','程序员'],ec:EC.n,trn:127,hr:23 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得陪伴比物质更重要',c:0.65,t:['陪伴','物质'],ec:EC.p,trn:128,hr:23 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得现在的教育太卷了',c:0.5,t:['教育','卷'],ec:EC.neg,trn:129,hr:22 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得养宠物能治愈人心',c:0.6,t:['宠物','治愈'],ec:EC.p,trn:130,hr:21 },
  { d:'WORLD',sub:'VALUE',s:'用户',sum:'小明觉得开心最重要，钱够花就行',c:0.55,t:['开心','钱'],ec:EC.p,trn:131,hr:23 },
  { d:'WORLD',sub:'OPINION',s:'用户',sum:'小明觉得深圳夏天太热但冬天舒服',c:0.5,t:['深圳','夏天','冬天'],ec:EC.n,trn:132,hr:14 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明想存够50万就回长沙发展',c:0.5,t:['存钱','50万','长沙'],ec:EC.n,trn:133,hr:23 },
  { d:'COMMITMENT',sub:'PLAN',s:'用户',sum:'小明想在35岁之前实现财务自由',c:0.4,t:['财务自由','35岁'],ec:EC.n,trn:134,hr:23 },
]

// 汇总所有事实，分配精确时间戳
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

// ═══════════════════════════════════════════
// 情节记忆（16 段，跨 6 个月）
// ═══════════════════════════════════════════

const EPISODES = [
  { sum:'第一次聊天，小明自我介绍，在腾讯工作，养了一只橘猫叫咪咪', ei:0.3, de:'CALM_RATIONAL', kw:['自我介绍','腾讯','咪咪'], st:1, et:5, days:300 },
  { sum:'小明分享了喜欢的食物和爱好，聊到火锅和篮球', ei:0.5, de:'QUIET_FOND', kw:['火锅','篮球','爱好'], st:6, et:12, days:280 },
  { sum:'小明提到最好的朋友小红和家人，信任感上升', ei:0.6, de:'SWEET_ATTACHMENT', kw:['小红','妈妈','信任'], st:13, et:17, days:250 },
  { sum:'小明被领导批评后心情低落，向伴侣倾诉', ei:0.7, de:'HURT_GRIEVANCE', kw:['批评','低落','安慰'], st:18, et:18, days:200 },
  { sum:'小明PMP考试通过，非常开心', ei:0.8, de:'SWEET_ATTACHMENT', kw:['PMP','通过','开心'], st:19, et:19, days:150 },
  { sum:'小明和小红吵架后又和好', ei:0.75, de:'HURT_GRIEVANCE', kw:['吵架','和好','小红'], st:20, et:21, days:120 },
  { sum:'小明深夜加班后倾诉疲惫和睡眠问题', ei:0.65, de:'FEARFUL_OBEDIENT', kw:['加班','累','睡眠'], st:22, et:25, days:90 },
  { sum:'小明聊到未来计划，想考AWS认证、带妈妈旅游', ei:0.5, de:'QUIET_FOND', kw:['AWS','旅游','计划'], st:26, et:28, days:60 },
  { sum:'小明提到暗恋小雅，在食堂偶遇', ei:0.6, de:'SHY_HEARTBEAT', kw:['小雅','暗恋','食堂'], st:29, et:30, days:30 },
  { sum:'小明深夜emo，聊到孤独感和独居的寂寞', ei:0.7, de:'HURT_GRIEVANCE', kw:['孤独','独居','深夜'], st:31, et:32, days:14 },
  { sum:'小明分享了工作成就，代码被评为最佳实践', ei:0.7, de:'SWEET_ATTACHMENT', kw:['代码','最佳实践','自豪'], st:33, et:34, days:10 },
  { sum:'小明奶奶住院，很担心但请不了假', ei:0.75, de:'FEARFUL_OBEDIENT', kw:['奶奶','住院','担心'], st:35, et:36, days:3 },
  { sum:'小明学会了弹《小星星》的吉他版', ei:0.6, de:'QUIET_FOND', kw:['吉他','小星星','开心'], st:37, et:38, days:2 },
  { sum:'小明和小雅一起加班，聊得很开心', ei:0.65, de:'SHY_HEARTBEAT', kw:['小雅','加班','开心'], st:39, et:40, days:1 },
  { sum:'小明收到小李结婚邀请，要去北京当伴郎', ei:0.5, de:'QUIET_FOND', kw:['小李','结婚','伴郎'], st:41, et:42, days:5 },
  { sum:'小明今天状态不错，准时下班，做了运动', ei:0.6, de:'SWEET_ATTACHMENT', kw:['状态好','运动','变好'], st:43, et:45, days:0 },
]

// ═══════════════════════════════════════════
// 知识图谱 / 时间锚点 / 习惯 / 联想（同 v2，略）
// ═══════════════════════════════════════════

const TRIPLES = [
  { s:'小明',p:'工作于',o:'腾讯',c:0.95 }, { s:'小明',p:'住在',o:'深圳南山区',c:0.85 },
  { s:'小明',p:'毕业于',o:'华南理工大学',c:0.8 }, { s:'小明',p:'养了',o:'咪咪（橘猫）',c:0.95 },
  { s:'小红',p:'是小明的',o:'最好的朋友',c:0.9 }, { s:'小红',p:'也是',o:'大学同学',c:0.85 },
  { s:'小红',p:'在',o:'创业公司做产品经理',c:0.7 }, { s:'小明',p:'暗恋',o:'小雅',c:0.6 },
  { s:'小雅',p:'在',o:'产品组',c:0.65 }, { s:'张哥',p:'是小明的',o:'直属领导',c:0.7 },
  { s:'小明',p:'喜欢',o:'火锅（麻辣）',c:0.9 }, { s:'小明',p:'讨厌',o:'香菜',c:0.85 },
  { s:'小明',p:'正在学',o:'吉他',c:0.8 }, { s:'咪咪',p:'年龄',o:'3岁',c:0.9 },
  { s:'小明',p:'老家在',o:'湖南长沙',c:0.85 }, { s:'爸爸',p:'是',o:'中学数学老师',c:0.8 },
  { s:'小雨',p:'是小明的',o:'妹妹',c:0.8 }, { s:'小雨',p:'在',o:'长沙学医',c:0.75 },
  { s:'小李',p:'是小明的',o:'大学室友',c:0.75 }, { s:'小李',p:'在',o:'北京字节跳动',c:0.7 },
  { s:'阿杰',p:'是小明的',o:'球友',c:0.7 }, { s:'阿杰',p:'在',o:'华为工作',c:0.65 },
  { s:'小明',p:'会用',o:'Go/Python/Java',c:0.8 }, { s:'小明',p:'喜欢',o:'周杰伦',c:0.85 },
  { s:'小明',p:'是',o:'湖人球迷',c:0.7 },
]

const ANCHORS = [
  { date:`${YEAR}-08-15`, type:'birthday', ei:0.9, dom:'IDENTITY', sum:'小明的生日' },
  { date:ts(300,12).slice(0,10), type:'first_met', ei:0.6, dom:'RELATIONSHIP', sum:'第一次聊天' },
  { date:ts(150,17).slice(0,10), type:'milestone', ei:0.8, dom:'MOOD', sum:'PMP通过' },
  { date:ts(10,20).slice(0,10), type:'relationship', ei:0.7, dom:'MOOD', sum:'和小红和好' },
  { date:ts(3,17).slice(0,10), type:'milestone', ei:0.7, dom:'WORK', sum:'项目上线' },
  { date:`${YEAR+1}-01-29`, type:'holiday', ei:0.7, dom:'COMMITMENT', sum:'春节' },
  { date:ts(1,14).slice(0,10), type:'recurring_memory', ei:0.6, dom:'MOOD', sum:'小雅夸我代码好' },
  { date:TODAY, type:'recurring_memory', ei:0.5, dom:'MOOD', sum:'今天状态不错' },
  { date:`${YEAR}-12-25`, type:'holiday', ei:0.5, dom:'PREFERENCE', sum:'圣诞节' },
  { date:`${YEAR}-10-01`, type:'holiday', ei:0.6, dom:'COMMITMENT', sum:'国庆' },
]

const HABITS = [
  { type:'late_chatter',scope:'long_term',wd:null,hs:22,he:2,c:0.8,oc:15,src:'detected',note:'22点-2点聊天' },
  { type:'late_chatter',scope:'long_term',wd:5,hs:23,he:3,c:0.7,oc:8,src:'detected',note:'周五更晚' },
  { type:'morning_quiet',scope:'long_term',wd:null,hs:7,he:9,c:0.6,oc:10,src:'detected',note:'早上不活跃' },
  { type:'suppress_type',scope:'short_term',wd:null,hs:14,he:18,c:0.9,oc:1,src:'explicit',note:'下午别提醒',exp:Date.now()+4*3600000 },
  { type:'dnd',scope:'short_term',wd:null,hs:1,he:8,c:0.95,oc:1,src:'explicit',note:'今晚别烦我',exp:Date.now()+7*3600000 },
  { type:'late_chatter',scope:'long_term',wd:6,hs:10,he:12,c:0.65,oc:6,src:'detected',note:'周六上午聊天' },
  { type:'late_chatter',scope:'long_term',wd:null,hs:12,he:13,c:0.55,oc:8,src:'detected',note:'午休聊天' },
  { type:'late_chatter',scope:'long_term',wd:null,hs:18,he:20,c:0.6,oc:12,src:'detected',note:'下班后活跃' },
]

const ASSOC_LINKS: Array<[string,string,string,number]> = [
  ['火锅','香菜','对比偏好',0.8], ['小红','大学同学','同一人',0.9],
  ['咪咪','橘猫','同一实体',0.95], ['PMP','AWS','连续目标',0.7],
  ['加班','失眠','因果关系',0.8], ['小红','吵架','关联事件',0.75],
  ['吉他','周杰伦','兴趣关联',0.6], ['妈妈','春节旅游','承诺关联',0.8],
  ['小雅','加班','关联事件',0.7], ['奶奶','住院','关联事件',0.8],
  ['小李','结婚','关联事件',0.7], ['篮球','阿杰','兴趣关联',0.75],
  ['原神','动漫','兴趣关联',0.6], ['颈椎','久坐','因果关系',0.7],
  ['焦虑','失眠','因果关联',0.65],
]

// ═══════════════════════════════════════════
// 主函数
// ═══════════════════════════════════════════

export function seedTestData(presetId = 'deredere'): {
  root:string; store:FactStore; episodicStore:EpisodicStore; kg:KnowledgeGraph
  retriever:MemoryRetriever; state:FullState; cleanup:()=>void
} {
  const root = join(tmpdir(),`ackem-seed-${Date.now()}-${Math.random().toString(36).slice(2,6)}`)
  mkdirSync(join(root,'memory','facts'),{recursive:true})
  mkdirSync(join(root,'memory','episodes'),{recursive:true})
  mkdirSync(join(root,'memory','kg'),{recursive:true})
  mkdirSync(join(root,'companion'),{recursive:true})

  // 1. 事实（带精确 createdAt）
  const store = new FactStore(defaultFactsPath(root)); store.load()
  for (const f of ALL_FACTS) {
    const fact = store.addFact({
      domain:f.d, subcategory:f.sub, subject:f.s, summary:f.sum,
      confidence:f.c, triggers:f.t, sourceSessionId:SESSION,
      sourceTurnIndex:f.trn, emotionalContext:f.ec, factLayer:'raw',
    })
    // 直接修改内存对象的 createdAt（精确时间戳）
    fact.createdAt = f.createdAt
  }
  store.flush()
  // 同步到 DB
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

  // 2. 情节
  const episodicStore = new EpisodicStore(defaultEpisodesPath(root)); episodicStore.load()
  let prevEpId:string|null = null
  for (const ep of EPISODES) {
    const added = episodicStore.add({ summary:ep.sum, emotionalIntensity:ep.ei, dominantEmotion:ep.de, keywords:ep.kw, prevEpisodeId:prevEpId, sourceSessionId:SESSION, startTurn:ep.st, endTurn:ep.et })
    prevEpId = added.id
  }

  // 3. 知识图谱
  const kg = new KnowledgeGraph(defaultKgPath(root)); kg.load()
  for (const t of TRIPLES) kg.add({ subject:t.s, predicate:t.p, object:t.o, confidence:t.c, sourceFactIds:[] })

  // 4. 时间锚点
  if (db) for (const a of ANCHORS) db.prepare(`INSERT OR IGNORE INTO temporal_anchors (id,anchor_date,anchor_type,linked_fact_ids,emotional_intensity,domain,summary,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),a.date,a.type,'',a.ei,a.dom,a.sum,new Date().toISOString())

  // 5. 习惯
  if (db) { const now=Date.now(); for (const h of HABITS) db.prepare(`INSERT OR IGNORE INTO user_habits (id,type,scope,weekday,hour_start,hour_end,confidence,occurrence_count,first_seen_at,last_confirmed_at,expires_at,source,suppress_target,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),h.type,h.scope,h.wd,h.hs,h.he,h.c,h.oc,now,now,h.exp??null,h.src,h.type==='suppress_type'?'health_reminder':null,h.note,now,now) }

  // 6. 联想
  if (db) {
    const facts = store.listActive()
    const bySum = (s:string) => facts.find(f => f.summary.includes(s))
    for (const [a,b,type,str] of ASSOC_LINKS) {
      const fa=bySum(a),fb=bySum(b)
      if (fa&&fb) db.prepare(`INSERT OR IGNORE INTO memory_associations (id,fact_id_a,fact_id_b,association_type,strength,created_at) VALUES (?,?,?,?,?,?)`).run(randomUUID(),fa.id,fb.id,type,str,new Date().toISOString())
    }
  }

  // 7. 状态（模拟 300 天使用后的关系）
  const preset = PERSONALITY_PRESETS.find(p=>p.id===presetId) ?? PERSONALITY_PRESETS[5]
  const state:FullState = defaultFullState({presetId:preset.id,T:preset.T,I:preset.I,S:preset.S,O:preset.O,R:preset.R})
  state.relationship = { stage:'FAMILIAR', trust:62, rifts:0, affection_momentum:0.45, atmosphere:'warm', consecutivePositiveTurns:12, turnsSinceLastRift:30, sharedEventsCount:8 }
  state.emotion = { aff:42, sec:25, aro:10, dom:-3, primaryLabel:'QUIET_FOND', isLocked:false }
  state.counters = { totalTurns:200, sharedEventsCount:8, consecutiveMeaningfulTurns:12 }
  state.lastActive = ts(0,20)
  state.firstMetDate = ts(300,20).slice(0,10)
  state.ackemBirthday = ts(300,20).slice(0,10)
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

  // 时间层分布
  const now = Date.now()
  const layers = { '新鲜(0-3d)':0, '近期(3-14d)':0, '中期(14-60d)':0, '远期(60-180d)':0, '深记忆(180-365d)':0 }
  for (const f of facts) {
    const days = (now - new Date(f.createdAt).getTime()) / 86400000
    if (days < 3) layers['新鲜(0-3d)']++
    else if (days < 14) layers['近期(3-14d)']++
    else if (days < 60) layers['中期(14-60d)']++
    else if (days < 180) layers['远期(60-180d)']++
    else layers['深记忆(180-365d)']++
  }

  console.log('\n╔══════════════════════════════════════════════╗')
  console.log('║     测试种子数据 v3 · 时间分层 · 200 条       ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║  记忆事实:  ${String(facts.length).padStart(3)} 条                           ║`)
  for (const [k,v] of Object.entries(layers)) console.log(`║    ${k.padEnd(14)} ${String(v).padStart(3)} 条                           ║`)
  console.log(`║  域分布:    ${Object.entries(doms).map(([k,v])=>`${k}:${v}`).join(' ').slice(0,38).padEnd(38)}  ║`)
  console.log(`║  情节记忆:  ${String(eps.length).padStart(3)} 段 (跨 ${Math.round((now-new Date(eps[0]?.createdAt??0).getTime())/86400000)}~0 天)              ║`)
  console.log(`║  知识图谱:  ${String(tris.length).padStart(3)} 条三元组                     ║`)
  console.log(`║  时间锚点:  ${String(anc).padStart(3)} 条                           ║`)
  console.log(`║  用户习惯:  ${String(hab).padStart(3)} 条                           ║`)
  console.log(`║  记忆联想:  ${String(asc).padStart(3)} 条                           ║`)
  console.log(`║  关系:      ${ctx.state.relationship.stage} trust=${ctx.state.relationship.trust}               ║`)
  console.log(`║  情绪:      ${ctx.state.emotion.primaryLabel} aff=${ctx.state.emotion.aff}               ║`)
  console.log('╚══════════════════════════════════════════════╝\n')
}
