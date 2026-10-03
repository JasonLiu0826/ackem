import { getDatabase } from '../database'
export type UserBlock={user_id:string;agent_id:string;block_type:'mute'|'block';created_at:string}
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function setBlock(r:string,x:UserBlock):void{d(r).prepare(`INSERT INTO user_blocks VALUES(?,?,?,?) ON CONFLICT(user_id,agent_id) DO UPDATE SET block_type=excluded.block_type,created_at=excluded.created_at`).run(x.user_id,x.agent_id,x.block_type,x.created_at)}
export function removeBlock(r:string,agent:string,user='local'):void{d(r).prepare('DELETE FROM user_blocks WHERE user_id=? AND agent_id=?').run(user,agent)}
export function getBlock(r:string,agent:string,user='local'):UserBlock|null{return d(r).prepare('SELECT * FROM user_blocks WHERE user_id=? AND agent_id=?').get(user,agent) as UserBlock??null}
export function listBlocks(r:string,user='local'):UserBlock[]{return d(r).prepare('SELECT * FROM user_blocks WHERE user_id=?').all(user) as UserBlock[]}
