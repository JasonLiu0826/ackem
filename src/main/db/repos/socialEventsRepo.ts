import { getDatabase } from '../database'
export type SocialEvent={id:string;type:string;payload:string;created_at:string}
const d=(r:string)=>{const x=getDatabase(r);if(!x)throw new Error('DATABASE_UNAVAILABLE');return x}
export function addSocialEvent(r:string,x:SocialEvent):void{d(r).prepare('INSERT INTO social_events VALUES(?,?,?,?)').run(x.id,x.type,x.payload,x.created_at)}
export function listSocialEvents(r:string,type?:string,limit=100):SocialEvent[]{return (type?d(r).prepare('SELECT * FROM social_events WHERE type=? ORDER BY created_at DESC LIMIT ?').all(type,limit):d(r).prepare('SELECT * FROM social_events ORDER BY created_at DESC LIMIT ?').all(limit)) as SocialEvent[]}
