// 双向迁移兼容单测：
// 社区版（V11 QQ / V12 QQ 空间）与上游（V11 agents / V12 社会系统）在
// 同一版本号上加了不同表，两边互切时都要能补齐缺失的表。
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { ensureCompatTables } from './schemaCompat'
import { SCHEMA_V1_SQL } from './schemaV1'
import { SCHEMA_V2_SQL } from './schemaV2'
import { SCHEMA_V3_SQL } from './schemaV3'
import { SCHEMA_V4_SQL } from './schemaV4'
import { SCHEMA_V5_SQL } from './schemaV5'
import { SCHEMA_V6_SQL } from './schemaV6'
import { SCHEMA_V7_SQL } from './schemaV7'
import { SCHEMA_V8_SQL } from './schemaV8'
import { SCHEMA_V9_SQL } from './schemaV9'
import { SCHEMA_V10_SQL } from './schemaV10'
import { SCHEMA_V11_SQL } from './schemaV11'
import { SCHEMA_V12_SQL } from './schemaV12'

const BASE_MIGRATIONS = [
  SCHEMA_V1_SQL,
  SCHEMA_V2_SQL,
  SCHEMA_V3_SQL,
  SCHEMA_V4_SQL,
  SCHEMA_V5_SQL,
  SCHEMA_V6_SQL,
  SCHEMA_V7_SQL,
  SCHEMA_V8_SQL,
  SCHEMA_V9_SQL,
  SCHEMA_V10_SQL
]
const COMMUNITY_MIGRATIONS = [SCHEMA_V11_SQL, SCHEMA_V12_SQL]

const COMMUNITY_TABLES = ['qq_account', 'qq_seen', 'qq_peer', 'qq_qzone_post', 'qq_qzone_plan', 'qq_qzone_react']
const UPSTREAM_TABLES = ['agents', 'social_graph', 'friend_circle', 'fc_interactions', 'groups', 'group_messages', 'social_meta']

// better-sqlite3 是 Electron 原生模块：在 Electron 的 Node ABI 下编译。
// 用系统 Node 跑 vitest 时可能 ABI 不匹配（NODE_MODULE_VERSION），此时跳过，
// 纯 Node 环境 / CI 会正常执行。
const sqliteAvailable = (() => {
  try {
    const probe = new Database(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()
const itDb = sqliteAvailable ? it : it.skip

function tableNames(db: Database.Database): string[] {
  return (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map(
    (r) => r.name
  )
}

describe('schemaCompat 双向迁移兼容', () => {
  itDb('全新安装：社区表与上游表同时存在', () => {
    const db = new Database(':memory:')
    for (const sql of [...BASE_MIGRATIONS, ...COMMUNITY_MIGRATIONS]) db.exec(sql)
    ensureCompatTables(db)
    const tables = tableNames(db)
    for (const name of [...COMMUNITY_TABLES, ...UPSTREAM_TABLES]) {
      expect(tables).toContain(name)
    }
  })

  itDb('模拟上游库切到社区版（社区 V11/V12 未跑）：补齐 QQ 表', () => {
    const db = new Database(':memory:')
    for (const sql of BASE_MIGRATIONS) db.exec(sql)
    // 上游 V22 库的版本号比社区版迁移链高，社区迁移不会执行
    db.prepare(`INSERT INTO schema_meta(key, value) VALUES ('user_version', '22')`).run()
    ensureCompatTables(db)
    const tables = tableNames(db)
    for (const name of COMMUNITY_TABLES) expect(tables).toContain(name)
    expect(tables).toContain('agents')
  })

  itDb('模拟社区库交给上游：agents / friend_circle 等表已就位', () => {
    const db = new Database(':memory:')
    for (const sql of [...BASE_MIGRATIONS, ...COMMUNITY_MIGRATIONS]) db.exec(sql)
    ensureCompatTables(db)
    const tables = tableNames(db)
    for (const name of ['agents', 'social_graph', 'friend_circle', 'user_friendships', 'groups', 'social_meta']) {
      expect(tables).toContain(name)
    }
  })

  itDb('幂等：重复执行不报错，且不丢表', () => {
    const db = new Database(':memory:')
    for (const sql of [...BASE_MIGRATIONS, ...COMMUNITY_MIGRATIONS]) db.exec(sql)
    ensureCompatTables(db)
    ensureCompatTables(db)
    ensureCompatTables(db)
    const tables = tableNames(db)
    expect(tables).toContain('qq_qzone_post')
    expect(tables).toContain('friend_circle')
  })
})
