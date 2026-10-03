import { getDatabase } from '../database'
export type Friendship={id:string;user_id:string;agent_id:string;status:'pending'|'accepted'|'rejected';requested_at:string;responded_at?:string|null}
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function upsertFriendship(r:string,x:Friendship):void{d(r).prepare(`INSERT INTO user_friendships VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,agent_id) DO UPDATE SET status=excluded.status,responded_at=excluded.responded_at`).run(x.id,x.user_id,x.agent_id,x.status,x.requested_at,x.responded_at??null)}
export function getFriendship(r:string,agent:string,user='local'):Friendship|null{return d(r).prepare('SELECT * FROM user_friendships WHERE user_id=? AND agent_id=?').get(user,agent) as Friendship??null}
export function listFriendships(r:string,status?:Friendship['status']):Friendship[]{return (status?d(r).prepare('SELECT * FROM user_friendships WHERE status=?').all(status):d(r).prepare('SELECT * FROM user_friendships').all()) as Friendship[]}
