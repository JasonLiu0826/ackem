import { getDatabase } from '../database'
export type FcInteraction={id:string;post_id:string;actor_kind:'user'|'agent';actor_id:string;type:'like'|'comment';content?:string|null;sentiment?:number|null;created_at:string}
const dbFor=(r:string)=>{const db=getDatabase(r);if(!db)throw new Error('DATABASE_UNAVAILABLE');return db}
export function addInteraction(root:string,x:FcInteraction):boolean{try{dbFor(root).prepare('INSERT INTO fc_interactions VALUES(?,?,?,?,?,?,?,?)').run(x.id,x.post_id,x.actor_kind,x.actor_id,x.type,x.content??null,x.sentiment??null,x.created_at);return true}catch{return false}}
export function listInteractions(root:string,postId:string):FcInteraction[]{return dbFor(root).prepare('SELECT * FROM fc_interactions WHERE post_id=? ORDER BY created_at').all(postId) as FcInteraction[]}
export function hasLiked(root:string,postId:string,kind:string,id:string):boolean{return !!dbFor(root).prepare(`SELECT 1 FROM fc_interactions WHERE post_id=? AND actor_kind=? AND actor_id=? AND type='like'`).get(postId,kind,id)}
