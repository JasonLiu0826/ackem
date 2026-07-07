import { userRefersToAckemSelf } from './AckemProductIdentity'
import { createLlmJsonClient } from '../llmClient'
import {
  defaultPaperCardTitle,
  extractTitleFromCardBody,
  isPoorPaperCardTitle,
  type PaperCardKind
} from '../../shared/paperCardTitle'

const KIND_LABEL: Record<PaperCardKind, string> = {
  plan: '璁″垝涔?,
  knowledge: '鐭ヨ瘑鏁寸悊',
  search: '妫€绱㈡憳褰?,
  table: '瀵规瘮琛?
}

/** 瑙ｆ瀽绾搁潰鍗?UI 灞曠ず鏍囬锛氭鏂囨爣棰?> 瑙勫垯涓婚 > LLM 鎺ㄦ柇 > 绫诲瀷榛樿 */
export async function resolvePaperCardDisplayTitle(
  settings: AppSettings,
  kind: PaperCardKind,
  userQuestion: string,
  ruleTopic: string,
  cardBody: string
): Promise<string> {
  const fromBody = extractTitleFromCardBody(cardBody, kind)
  if (fromBody) return fromBody

  const rule = ruleTopic.trim().slice(0, 28)
  if (rule && !isPoorPaperCardTitle(rule)) return rule

  try {
    const client = createLlmJsonClient(settings)
    const text = (
      await client.chatCompletionJson({
        messages: [
          {
            role: 'system',
            content:
              `浣犳槸鏍囬鍔╂墜銆備负杩欎唤銆?{KIND_LABEL[kind]}銆嶈捣涓€涓?**6锝?6 瀛?*鐨勪腑鏂囦富棰樺悕銆俓n` +
              '鍙緭鍑烘爣棰樻湰韬細涓嶈寮曞彿銆佷笉瑕侀棶鍙枫€佷笉瑕佸杩扮敤鎴锋姳鎬ㄦ垨鏁村彞鍘熻瘽銆佷笉瑕併€岃鍒掍功/鏁寸悊鍗°€嶇瓑绫诲瀷璇嶃€? +
              (userRefersToAckemSelf(userQuestion)
                ? '\n鐢ㄦ埛鍦ㄤ笌 Ackem锛堜綘锛夊姣旀椂锛氭爣棰橀』浣撶幇 Ackem锛?*绂佹**鐢?DeepSeek/GPT/Claude 绛夋ā鍨嬪悕浠ｆ浛 Ackem銆?
                : '')
          },
          {
            role: 'user',
            content:
              `鐢ㄦ埛鍘熻瘽锛?{userQuestion.slice(0, 240)}\n\n` +
              `姝ｆ枃寮€澶达細\n${cardBody.slice(0, 420)}`
          }
        ],
        temperature: 0.25,
        max_tokens: 48
      })
    ).trim()

    const cleaned = text
      .replace(/^["銆屻€嶿|["銆嶃€廬$/gu, '')
      .replace(/[銆傦紒锛?!.鈥+$/u, '')
      .trim()
      .slice(0, 28)

    if (cleaned && !isPoorPaperCardTitle(cleaned)) return cleaned
  } catch {
    /* fallback below */
  }

  return defaultPaperCardTitle(kind)
}
