import {useRef} from 'react'
export function AttachmentMenu({disabled,onSelect}:{disabled:boolean;onSelect:(kind:'image'|'file'|'video'|'folder')=>void}):JSX.Element{
 const ref=useRef<HTMLDetailsElement>(null)
 return <details className="chat-attachment-menu" ref={ref} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))e.currentTarget.open=false}}><summary aria-label="添加附件" aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault()}}>＋</summary><div role="menu">{([['image','图片'],['file','文件'],['video','视频'],['folder','文件夹']] as const).map(([kind,label])=><button key={kind} type="button" role="menuitem" disabled={disabled} onClick={()=>{if(ref.current)ref.current.open=false;onSelect(kind)}}>{label}</button>)}</div></details>
}
