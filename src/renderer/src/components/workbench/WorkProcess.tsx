import {useEffect,useState} from 'react'
import type {TurnBlock,WorkActivity} from '../../store/workbenchStore'
import {MarkdownContent} from '../MarkdownContent'
import {groupWorkActivities} from '../../lib/workPresentation'

function Activity({item,now}:{item:WorkActivity;now:number}):JSX.Element {
 if(item.kind==='feedback')return <div className="wb-stage-feedback"><MarkdownContent source={item.text}/></div>
 if(item.kind==='thought')return <div className="wb-stage-thinking">{item.endedAt?'已思考':'正在思考'} · {Math.max(0,Math.round(((item.endedAt??now)-item.startedAt)/1000))} 秒</div>
 const labels:Record<string,string>={read_file:'读取文件',write_file:'写入文件',edit_file:'编辑文件',list_dir:'查看目录',glob:'查找文件',grep:'搜索内容',powershell:'运行终端命令',bash:'运行终端命令',web_search:'搜索网页'}
 const input=item.input&&typeof item.input==='object'?item.input as Record<string,unknown>:undefined
 const path=input?.file_path??input?.path
 const name=typeof path==='string'?path.split(/[\\/]/).pop():undefined
 return <details className="wb-operation"><summary><span>{labels[item.text]??item.text}{name?' · '+name:''}</span><span>{item.endedAt?(item.ok===false?'未成功':'已完成'):'执行中'}</span></summary>{item.input!==undefined&&<pre>{JSON.stringify(item.input,null,2)}</pre>}{item.output&&<pre>{item.output}</pre>}</details>
}
export function WorkProcess({turn,settled}:{turn:TurnBlock;settled:boolean}):JSX.Element|null {
 const [now,setNow]=useState(Date.now())
 const active=turn.activities?.some(item=>!item.endedAt)
 useEffect(()=>{if(!active||settled)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active,settled])
 if(!turn.activities?.length)return null
 const body=groupWorkActivities(turn.activities).map(items=>{
  const tools=items.filter(item=>item.kind==='tool')
  if(tools.length<2)return <div key={items[0].id}>{items.map(item=><Activity key={item.id} item={item} now={now}/>)}</div>
  const terminal=tools.every(item=>/^(powershell|bash|shell)$/i.test(item.text))
  const running=tools.some(item=>!item.endedAt),thinking=items.some(item=>item.kind==='thought'&&!item.endedAt),failed=tools.filter(item=>item.ok===false).length
  return <details className="wb-operation-group" key={items[0].id}><summary>{terminal?`运行了 ${tools.length} 条终端命令`:`执行了 ${tools.length} 项操作`}<span>{running?'执行中':thinking?'正在思考':failed?`${failed} 项未成功`:'已结束'}</span></summary>{items.map(item=><Activity key={item.id} item={item} now={now}/>)}</details>
 })
 return settled?<details className="wb-work-process"><summary>执行过程 · {turn.activities.length} 项 · 思考 {turn.thoughtSeconds} 秒</summary>{body}</details>:<div className="wb-work-process is-active">{body}</div>
}
