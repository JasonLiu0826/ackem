// [S-15] 缃戦〉鎼滅储 鈥?娉ㄥ唽鍐呯疆 Skill

import type { SkillRegistry } from '../../../registry'
import { WEB_SEARCH_MANIFEST } from './manifest'
import { webSearchSkill } from './skill'

export async function registerBuiltinWebSearch(registry: SkillRegistry): Promise<void> {
  // 娓呯悊鏃у崰浣嶇増鏈紙鏃?functionDef锛屼細瀵艰嚧 findByFunctionName 鍖归厤澶辫触锛?
  if (registry.get('Ackem/web-search@0.0.1')) {
    await registry.unregister('Ackem/web-search@0.0.1')
  }

  const reg = await registry.register(webSearchSkill)
  if (!reg.ok) {
    throw new Error(reg.error ?? '缃戦〉鎼滅储 Skill 娉ㄥ唽澶辫触')
  }

  const instance = registry.get(WEB_SEARCH_MANIFEST.id)
  if (instance?.status !== 'active') {
    const act = await registry.activate(WEB_SEARCH_MANIFEST.id)
    if (!act.ok) throw new Error(act.error ?? '缃戦〉鎼滅储 Skill 婵€娲诲け璐?)
  }
}
