import type Database from 'better-sqlite3'
/** A work session is reusable; run_id, rather than session/runtime_id, identifies a turn. */
export function migrateSchemaV19(db:Database.Database):void{
 const row=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memory_action_runs'").get() as {sql:string}|undefined
 if(!row)return
 const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='memory_action_runs' AND type IN ('index','trigger') AND sql IS NOT NULL").all() as Array<{sql:string}>
 const sql=row.sql.replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`\[]?memory_action_runs["`\]]?/i,'CREATE TABLE memory_action_runs_new').replace(/,\s*UNIQUE\s*\(\s*nature\s*,\s*runtime_id\s*\)/i,'')
 const foreignKeys=db.pragma('foreign_keys',{simple:true})
 db.pragma('foreign_keys = OFF')
 try{db.transaction(()=>{
  db.exec(sql)
  db.exec('INSERT INTO memory_action_runs_new SELECT * FROM memory_action_runs; DROP TABLE memory_action_runs; ALTER TABLE memory_action_runs_new RENAME TO memory_action_runs;')
  for(const index of indexes)db.exec(index.sql)
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_plugin_runtime_unique ON memory_action_runs(nature,runtime_id) WHERE nature='plugin' AND runtime_id IS NOT NULL; CREATE INDEX IF NOT EXISTS idx_memory_work_runtime ON memory_action_runs(runtime_id,updated_at) WHERE nature='work';")
  if((db.pragma('foreign_key_check') as unknown[]).length)throw Error('任务账本迁移外键检查失败')
 })()}finally{db.pragma(`foreign_keys = ${foreignKeys?'ON':'OFF'}`)}
}
