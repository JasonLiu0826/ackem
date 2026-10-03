import { getDatabase } from '../database'
export type GroupMessage={id:string;group_id:string;sender_kind:'user'|'agent'|'system';sender_id:string;content:string;created_at:string}
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function addGroupMessage(r:string,x:GroupMessage):void{d(r).prepare('INSERT INTO group_messages VALUES(?,?,?,?,?,?)').run(x.id,x.group_id,x.sender_kind,x.sender_id,x.content,x.created_at)}
export function listGroupMessages(r:string,g:string,limit=50):GroupMessage[]{return d(r).prepare('SELECT * FROM group_messages WHERE group_id=? ORDER BY created_at DESC LIMIT ?').all(g,limit) as GroupMessage[]}
