import { getDatabase } from '../database'
export type GroupRow={id:string;name:string;owner_kind:'user'|'agent';owner_id:string;created_at:string;dissolved_at?:string|null}
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function createGroup(r:string,x:GroupRow):void{d(r).prepare('INSERT INTO groups VALUES(?,?,?,?,?,?)').run(x.id,x.name,x.owner_kind,x.owner_id,x.created_at,x.dissolved_at??null)}
export function getGroup(r:string,id:string):GroupRow|null{return d(r).prepare('SELECT * FROM groups WHERE id=?').get(id) as GroupRow??null}
export function listGroups(r:string):GroupRow[]{return d(r).prepare('SELECT * FROM groups WHERE dissolved_at IS NULL').all() as GroupRow[]}
export function dissolveGroup(r:string,id:string):void{d(r).prepare('UPDATE groups SET dissolved_at=? WHERE id=?').run(new Date().toISOString(),id)}
