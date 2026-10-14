import {realpathSync} from 'node:fs'
import {getDatabase} from '../db/database'
function database(root:string){const db=getDatabase(root);if(!db)throw Error('附件来源数据库不可用');db.exec('CREATE TABLE IF NOT EXISTS work_attachment_sources(path TEXT PRIMARY KEY,canonical_path TEXT NOT NULL,selected_at INTEGER NOT NULL)');return db}
/** Called only after native selection or successful host capture, never by a submit payload. */
export function recordWorkAttachmentSources(root:string,paths:string[]):void {
 const db=database(root);db.transaction(()=>{for(const path of paths)db.prepare('INSERT OR REPLACE INTO work_attachment_sources VALUES (?,?,?)').run(path,realpathSync.native(path),Date.now())})()
}
export function verifiedWorkAttachmentSources(root:string,paths:string[]):string[] {
 const db=database(root)
 return paths.filter(path=>{const row=db.prepare('SELECT canonical_path FROM work_attachment_sources WHERE path=?').get(path) as {canonical_path:string}|undefined;try{return !!row&&realpathSync.native(path)===row.canonical_path}catch{return false}})
}
