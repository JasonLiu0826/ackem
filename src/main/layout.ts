import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initDatabase } from './db/database'

const EMPTY_FACTS = JSON.stringify({ version: '2.0', facts: [] as unknown[] }, null, 2)

const DATA_README = `# Ackem 数据目录

本目录为 **权威数据根**（便携 \`./data\` 或 %LOCALAPPDATA%\\Ackem，见应用「数据目录」）。

- **结构化数据**：\`ackem.db\`（SQLite，开箱即用，无需安装数据库）
- **人类可读**：\`diary/*.md\`、\`companion/self.md\`、\`memory/archive/\` 等
- **代码与沙箱**：\`openforu/uskills\`、\`uplugins\`、\`uplugin-data\` 仍为目录

备份建议：拷贝整棵 data 根目录（含 \`ackem.db\`）。

详见 \`docs/mainDocs/SQLite存储设计方案_6_3.md\`。
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
      `# packs（预留）\n\n官方 / 社区 Persona Pack、预制种子等。与主计划 §3.7.13 对齐；初版不包含加载器。\n`,
      'utf-8'
    )
  }
  const selfMd = join(dataRoot, 'companion', 'self.md')
  if (!existsSync(selfMd)) {
    writeFileSync(
      selfMd,
      `---\ntype: companion_self\nsource: template\nupdated: \n---\n\n# 镜中记忆（伴侣第一人称）\n\n在此记录「我」的坚持、底线、上次强烈情绪的原因等。**低频次更新**，与事实记忆区分。\n`,
      'utf-8'
    )
  }
  const stateMd = join(dataRoot, 'companion', 'state.md')
  if (!existsSync(stateMd)) {
    writeFileSync(
      stateMd,
      `---\ntype: companion_state\n---\n\n# 伴侣快照（初版占位）\n\n情绪与性格引擎完整版见路线图（AnimaEngine）。此处可手填简短标签供 Tier A 注入。\n`,
      'utf-8'
    )
  }
}
