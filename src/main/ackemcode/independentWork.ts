import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs'
import {join,dirname} from 'node:path'
type RecordRow={runId:string;turnId:string;sessionId:string;goal:string;at:number;status:string;summary?:string}
const pathFor=(root:string)=>join(root,'memory','tasks','workbench-user-records.json')
export function recordIndependentWork(root:string,row:RecordRow):void{
 const file=pathFor(root);let rows:RecordRow[]=[]
 if(existsSync(file))rows=JSON.parse(readFileSync(file,'utf8'))
 rows=[...rows.filter(r=>r.runId!==row.runId),{...row,goal:row.goal.slice(0,1000),summary:row.summary?.slice(0,4000)}].slice(-100)
 mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(rows));renameSync(file+'.tmp',file)
}
export function independentWorkContext(root:string):string{
 try{const rows=JSON.parse(readFileSync(pathFor(root),'utf8')) as RecordRow[]
 return rows.length?'用户在工作页独立操作的历史（不属于当前聊天派工；只有与当前目标有关时才参考，不能自动继续或在主聊天播报历史任务）：\n'+rows.slice(-8).map(r=>JSON.stringify(r)).join('\n'):''}catch{return''}
}
