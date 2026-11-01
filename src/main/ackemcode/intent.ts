// [ackemcode/intent] — 判断一句话是不是"要动代码/文件/命令"的任务
// 三端（桌面 / QQ / 微信）共用同一套判定，避免各端口径不一致。

/** 显式前缀：命中就把后面的内容整段交给 Ackem Code */
const EXPLICIT_PREFIX = /^\s*(?:\/code|#code|代码[:：]|code[:：])\s*/i

/** 动作词：要"真的动手"，不是聊天里的"写一首诗" */
const ACTION_WORDS =
  /(写|改|修改|修|修复|补|重构|删|删除|新建|创建|生成|跑|运行|执行|装|安装|部署|调试|排查|优化|实现|接入|合并|提交|拉取|推送|回滚|跑一下|跑一遍)/

/** 代码/工程类对象 */
const CODE_OBJECTS =
  /(代码|脚本|程序|函数|方法|类|组件|模块|文件|目录|文件夹|项目|仓库|分支|提交|依赖|包|接口|服务|端口|进程|命令|终端|shell|命令行|报错|异常|bug|测试|用例|数据库|表结构|配置|环境变量|构建|编译|打包|日志)/i

/** 技术名词：出现即可视为工程语境 */
const TECH_TOKENS =
  /(\.tsx?|\.jsx?|\.py|\.go|\.rs|\.java|\.json|\.ya?ml|\.sh|\.md|node|npm|pnpm|yarn|git|python|pip|docker|curl|ssh|sql|api|http|regex|正则|typescript|react|vue|electron|sqlite)/i

/** 明确"只聊天"的意图，避免把陪伴话题误判成代码任务 */
const CHAT_ONLY =
  /(写一首|写首诗|作一首|写首歌|写个故事|写一段话|写句|夸奖|哄我|陪我|安慰|表白|情书|日记|心情)/

/** 疑问句：没有明确祈使语气时，多半是在"问"而不是"让我动手" */
const QUESTION_FORM = /(是什么|有什么|为什么|怎么|如何|哪|什么|吗|呢|\?|？)/

/** 祈使/委托语气：出现这些才认为用户确实要我们动手 */
const IMPERATIVE =
  /(帮我|帮忙|给我|替我|麻烦|劳烦|请帮|一下|改成|改为|修改|修复|修好|重构|跑一下|执行一下|安装|部署|实现|接入|提交|合并|新建|创建|删掉|删除)/

export type CodeIntent = {
  matched: boolean
  /** 交给 Ackem Code 的实际内容（已去掉显式前缀） */
  prompt: string
  /** explicit=显式指令；auto=意图推断 */
  mode?: 'explicit' | 'auto'
}

export function detectCodeIntent(text: string): CodeIntent {
  const raw = (text ?? '').trim()
  if (!raw) return { matched: false, prompt: '' }

  const explicit = EXPLICIT_PREFIX.exec(raw)
  if (explicit) {
    const prompt = raw.slice(explicit[0].length).trim()
    return { matched: prompt.length > 0, prompt, mode: 'explicit' }
  }

  if (CHAT_ONLY.test(raw)) return { matched: false, prompt: '' }
  // "这个文件里写了什么""代码重要吗"这类是在问，不该直接开工
  if (QUESTION_FORM.test(raw) && !IMPERATIVE.test(raw)) return { matched: false, prompt: '' }

  const hasAction = ACTION_WORDS.test(raw)
  const hasObject = CODE_OBJECTS.test(raw)
  const hasTech = TECH_TOKENS.test(raw)

  // 动作 + (工程对象 或 技术名词) 才算；单纯提到"文件"不动手不算
  if (hasAction && (hasObject || hasTech)) {
    return { matched: true, prompt: raw, mode: 'auto' }
  }
  return { matched: false, prompt: '' }
}
