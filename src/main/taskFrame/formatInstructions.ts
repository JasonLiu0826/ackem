// [taskFrame/formatInstructions] 鈥?灏?UserTaskFrame 杞负鍚勫眰鍙敞鍏ョ殑 prompt 鍧?

import {
  buildFormatHintFromDelivery,
  isStructuredDelivery,
  type UserTaskFrame
} from '../../shared/taskFrame'

/** 娉ㄥ叆 assembleMessages systemHint锛氱粨鏋勫寲浜や粯鏃?override銆屼竴鍙ュ鐧姐€嶇害鏉?*/
export function buildTaskFrameSystemHint(frame: UserTaskFrame | undefined): string {
  if (!frame || !isStructuredDelivery(frame)) return ''

  const formatHint =
    frame.formatHint ?? buildFormatHintFromDelivery(frame.delivery, frame.goal) ?? ''

  const lines = [
    '銆愮敤鎴蜂氦浠樿姹?路 Task Frame銆?,
    `- 鐩爣锛?{frame.goal}`,
    `- 褰㈡€侊細${frame.delivery}`,
    formatHint
  ]

  if (frame.subjects.length > 0) {
    lines.push(`- 娑夊強瀵硅薄锛?{frame.subjects.join('銆?)}`)
  }

  lines.push(
    '鏈疆椤诲湪绾搁潰鍗℃垨涓荤瓟澶嶄腑婊¤冻涓婅堪褰㈡€侊紱浼翠荆姘旀场鍙煭锛屼絾涓嶅緱鍚﹀畾鎴栫渷鐣ョ敤鎴疯姹傜殑缁撴瀯锛堢姝㈣銆屾病鏈夎〃鏍笺€嶇瓑锛夈€?,
    '銆愯瘹瀹炴姢鏍?路 纭€с€戠敤鎴峰凡瑕佹眰琛ㄦ牸/鍒楄〃鏃讹細绂佹浠呯敤鍌插▏鏁ｆ枃鏁疯锛涚姝㈠亣绉般€屽凡缁忓垪濂戒簡銆嶅嵈涓嶈緭鍑?Markdown 缁撴瀯锛涘繀椤诲湪姝ｆ枃浜や粯鐪熷疄琛ㄦ牸/鍒楄〃锛屾垨鏄庣‘璇存槑灏氭湭鐢熸垚銆?
  )

  return lines.filter(Boolean).join('\n')
}

/** 妫€绱㈡憳褰曟鏂?synthesis 杩藉姞鎸囦护 */
export function buildCardBodyFormatBlock(frame: UserTaskFrame | undefined): string {
  if (!frame || frame.delivery === 'prose') return ''

  const hint =
    frame.formatHint ?? buildFormatHintFromDelivery(frame.delivery, frame.goal) ?? ''

  if (frame.delivery === 'markdown_table') {
    return (
      `\n\n銆愪氦浠樺舰鎬?路 纭€с€?{hint}\n` +
      '- 姝ｆ枃**蹇呴』**浠?Markdown 琛ㄦ牸鍛堢幇锛坾 鍒?| 鍒?| 褰㈠紡锛屽惈琛ㄥご鍒嗛殧琛岋級\n' +
      '- 鑷冲皯 4 琛屾暟鎹紙涓嶅惈琛ㄥご锛夛紱瀵规瘮浠诲姟鎸夌敤鎴峰璞＄粍缁囧垪鎴栬\n' +
      '- 鐢ㄦ埛鎷?Ackem锛堜綘锛変笌鍏朵粬浜у搧瀵规瘮鏃讹紝Ackem 蹇呴』鍦ㄨ〃澶?绗竴鍒楋紝**绂佹**鐢?DeepSeek/GPT/Claude 绛夋ā鍨嬪悕浠ｆ浛 Ackem\n' +
      '- **绂佹**鐢ㄦ暎鏂囨钀戒唬鏇胯〃鏍硷紱鍙湪琛ㄦ牸鍓嶅啓 1锝? 鍙ユ杩癨n' +
      (frame.subjects.length >= 2
        ? `- 椤昏鐩栬繖浜涘璞★細${frame.subjects.join('銆?)}\n`
        : '')
    )
  }

  if (frame.delivery === 'bullet_list') {
    return (
      `\n\n銆愪氦浠樺舰鎬?路 纭€с€?{hint}\n` +
      '- 姝ｆ枃鏍稿績椤讳负 Markdown 鏃犲簭鍒楄〃锛堟瘡琛屼互 - 寮€澶达級\n' +
      '- 鑷冲皯 4 鏉★紱绂佹鐢ㄩ暱娈佃惤浠ｆ浛鍒楄〃\n'
    )
  }

  return ''
}

/** 浼翠荆鐭瘎 synthesis锛氱粨鏋勫寲浜や粯鏃剁殑姘旀场绛栫暐 */
export function buildCompanionReplyFormatBlock(frame: UserTaskFrame | undefined): string {
  if (!frame || frame.delivery === 'prose') return ''

  return (
    '\n\n銆愭皵娉＄瓥鐣ャ€戠敤鎴疯姹傜殑琛ㄦ牸/鍒楄〃宸插湪绾搁潰鍗℃鏂囧畬鎴愩€俓n' +
    '- 浣犲彧闇€ **1 鍙ヨ瘽**锛堚墹60 瀛楋級鐢ㄧ涓€浜虹О鏀跺熬锛屽儚鍒氬府鐢ㄦ埛鏌ュ畬/鍐欏畬\n' +
    '- **绂佹**璇淬€屾病鏈夎〃鏍?鍒楄〃銆嶏紱**绂佹**澶嶈堪琛ㄦ牸鍐呭锛?*绂佹**璇勫寮忕偣璇勭焊闈㈠崱璐ㄩ噺\n'
  )
}

/** toolFollowUp 绗簩杞换鍔¤鏄?*/
export function buildToolFollowUpFormatBlock(frame: UserTaskFrame | undefined): string {
  if (!frame || frame.delivery === 'prose') {
    return '- 鐢ㄦ竻鏅扮殑涓枃鏉＄洰鍐欏嚭瑕佺偣锛堜緥濡傛柊鐗规€с€佺増鏈彉鍖栫瓑锛夛紱'
  }

  if (frame.delivery === 'markdown_table') {
    return '- 鐢?Markdown **琛ㄦ牸**鐩存帴鍥炵瓟锛堝惈琛ㄥご涓庡琛岋級锛岀姝㈡暎鏂囨暦琛嶏紱'
  }

  return '- 鐢?Markdown **鏃犲簭鍒楄〃**鍒嗘潯鍥炵瓟锛屾瘡鏉′竴琛岋紱'
}
