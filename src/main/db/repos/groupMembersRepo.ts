import { getDatabase } from '../database'
export type GroupMember={group_id:string;member_kind:'user'|'agent';member_id:string;role:string;joined_at:string}
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function addMember(r:string,x:GroupMember):void{d(r).prepare('INSERT OR IGNORE INTO group_members VALUES(?,?,?,?,?)').run(x.group_id,x.member_kind,x.member_id,x.role,x.joined_at)}
export function removeMember(r:string,g:string,k:string,id:string):void{d(r).prepare('DELETE FROM group_members WHERE group_id=? AND member_kind=? AND member_id=?').run(g,k,id)}
export function listMembers(r:string,g:string):GroupMember[]{return d(r).prepare('SELECT * FROM group_members WHERE group_id=?').all(g) as GroupMember[]}
