import type Database from 'better-sqlite3'
import {LONG_TERM_SCHEMA} from '../tasks/longTermSchema'
import {TASK_SCHEMA_SQL} from './schemaV20'
export function migrateSchemaV22(db:Database.Database):void {db.transaction(()=>db.exec(TASK_SCHEMA_SQL+LONG_TERM_SCHEMA))()}
