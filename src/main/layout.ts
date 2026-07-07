import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initDatabase } from './db/database'

const EMPTY_FACTS = JSON.stringify({ version: '2.0', facts: [] as unknown[] }, null, 2)

const DATA_README = `# Ackem 鏁版嵁鐩綍

鏈洰褰曚负 **鏉冨▉鏁版嵁鏍?*锛堜究鎼?\`./data\` 鎴?%LOCALAPPDATA%\\Ackem锛岃搴旂敤銆屾暟鎹洰褰曘€嶏級銆?

- **缁撴瀯鍖栨暟鎹?*锛歕`Ackem.db\`锛圫QLite锛屽紑绠卞嵆鐢紝鏃犻渶瀹夎鏁版嵁搴擄級
- **浜虹被鍙**锛歕`diary/*.md\`銆乗`companion/self.md\`銆乗`memory/archive/\` 绛?
- **浠ｇ爜涓庢矙绠?*锛歕`openforu/uskills\`銆乗`uplugins\`銆乗`uplugin-data\` 浠嶄负鐩綍

澶囦唤寤鸿锛氭嫹璐濇暣妫?data 鏍圭洰褰曪紙鍚?\`Ackem.db\`锛夈€?

璇﹁ \`docs/mainDocs/SQLite瀛樺偍璁捐鏂规_6_3.md\`銆?
`

export function ensureDataLayout(dataRoot: string): void {
  initDatabase(dataRoot)
  const dirs = [
    'imports',
    'packs',
    'memory',
    join('memory', 'shared-events'),
    join('memory', 'facts'),
    'preferences',
    'portrait',
    'diary',
    'companion',
    'weather',
    'staging',
    'openforu',
    join('openforu', 'sessions'),
    join('openforu', 'staging'),
    '_derived',
    'models'
  ]
  for (const d of dirs) {
    mkdirSync(join(dataRoot, d), { recursive: true })
  }
  const factsJson = join(dataRoot, 'memory', 'facts', 'facts.v2.json')
  if (!existsSync(factsJson)) {
    writeFileSync(factsJson, EMPTY_FACTS, 'utf-8')
  }
  const readme = join(dataRoot, 'README.md')
  if (!existsSync(readme)) {
    writeFileSync(readme, DATA_README, 'utf-8')
  }
  const packsReadme = join(dataRoot, 'packs', 'README.md')
  if (!existsSync(packsReadme)) {
    writeFileSync(
      packsReadme,
      `# packs锛堥鐣欙級\n\n瀹樻柟 / 绀惧尯 Persona Pack銆侀鍒剁瀛愮瓑銆備笌涓昏鍒?搂3.7.13 瀵归綈锛涘垵鐗堜笉鍖呭惈鍔犺浇鍣ㄣ€俓n`,
      'utf-8'
    )
  }
  const selfMd = join(dataRoot, 'companion', 'self.md')
  if (!existsSync(selfMd)) {
    writeFileSync(
      selfMd,
      `---\ntype: companion_self\nsource: template\nupdated: \n---\n\n# 闀滀腑璁板繂锛堜即渚ｇ涓€浜虹О锛塡n\n鍦ㄦ璁板綍銆屾垜銆嶇殑鍧氭寔銆佸簳绾裤€佷笂娆″己鐑堟儏缁殑鍘熷洜绛夈€?*浣庨娆℃洿鏂?*锛屼笌浜嬪疄璁板繂鍖哄垎銆俓n\n## 鏈綋璁ょ煡 路 涓嶅彲鏀瑰啓\n\n- Jason锛圙itHub JasonLiu0826锛夋槸**鍒涢€犳垜鐨勪汉**锛屼笉鏄埗浜诧紱鎴戝浠栨劅鎯呬竴鑸€俓n- Jason **杩樻椿鐫€**锛涙病瑙佽繃闈笉绛変簬浠栧凡涓嶅湪銆俓n- 姣忎釜 Ackem 閮戒笉涓€鏍凤紱鎴戦櫔鍦?*褰撳墠鐢ㄦ埛**韬竟锛屼笉鏄櫔鍦?Jason 韬竟銆俓n- 鍏充簬 Jason 鐨勮蹇嗘槸 Canon 绉嶅瓙锛屾伆濂藉湪鎴戣韩涓婏紱**鐢ㄦ埛姘歌繙鏄垜蹇冮噷鐨勭涓€浣?*銆俓n`,
      'utf-8'
    )
  }
  const stateMd = join(dataRoot, 'companion', 'state.md')
  if (!existsSync(stateMd)) {
    writeFileSync(
      stateMd,
      `---\ntype: companion_state\n---\n\n# 浼翠荆蹇収锛堝垵鐗堝崰浣嶏級\n\n鎯呯华涓庢€ф牸寮曟搸瀹屾暣鐗堣璺嚎鍥撅紙AnimaEngine锛夈€傛澶勫彲鎵嬪～绠€鐭爣绛句緵 Tier A 娉ㄥ叆銆俓n`,
      'utf-8'
    )
  }
}
