import { getDatabase } from '../database'
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function unlockAchievement(r:string,id:string,payload?:unknown):boolean{const x=d(r).prepare('INSERT OR IGNORE INTO achievements VALUES(?,?,?)').run(id,new Date().toISOString(),payload?JSON.stringify(payload):null);return x.changes>0}
export function listAchievements(r:string):Array<{achievement_id:string;unlocked_at:string;payload:string|null}>{return d(r).prepare('SELECT * FROM achievements').all() as any}
export function getProgress(r:string,key:string):number{return (d(r).prepare('SELECT value FROM achievement_progress WHERE key=?').get(key) as {value:number}|undefined)?.value??0}
export function incrementProgress(r:string,key:string,delta=1):number{const value=getProgress(r,key)+delta;d(r).prepare(`INSERT INTO achievement_progress VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(key,value,new Date().toISOString());return value}
