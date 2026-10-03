import { getDatabase } from '../database'
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function getSocialMeta(r:string,key:string):string|null{return (d(r).prepare('SELECT value FROM social_meta WHERE key=?').get(key) as {value:string}|undefined)?.value??null}
export function setSocialMeta(r:string,key:string,value:string):void{d(r).prepare(`INSERT INTO social_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key,value)}
