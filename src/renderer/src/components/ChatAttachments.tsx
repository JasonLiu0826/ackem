import type {ChatFile} from '../../../shared/chatAttachments'
import type {ChatImage} from '../../../shared/chatImages'
export function AttachmentTray({images,files,onRemove}:{images:ChatImage[];files:ChatFile[];onRemove?:(path:string)=>void}):JSX.Element|null{
 const items=[...images.map(image=>({path:image.path,name:image.name,thumbnail:image.preview,kind:'image'})),...files]
 if(!items.length)return null
 return <div className="attachment-tray">{items.map(item=><div className="attachment-tile" key={item.path} title={item.name}>{item.thumbnail?<img src={item.thumbnail} alt={item.name}/>:<span className="attachment-type">{item.kind==='folder'?'▣':item.kind==='video'?'▶':'▤'}</span>}<span className="attachment-name">{item.name}</span>{onRemove?<button type="button" aria-label={`移除 ${item.name}`} onClick={()=>onRemove(item.path)}>×</button>:null}</div>)}</div>
}
export function ChatFiles({files,onRemove}:{files:ChatFile[];onRemove?:(path:string)=>void}):JSX.Element|null{
 if(!files.length)return null
 return <div className="chat-file-list">{files.map(file=><div key={file.path} className="chat-file-chip" title={file.note}>{file.thumbnail?<img src={file.thumbnail} alt="视频抽样预览"/>:null}<span>{file.kind==='video'?'▶':'▤'} {file.name}<small>{(file.size/1024/1024).toFixed(1)} MB</small></span>{onRemove?<button type="button" aria-label={`移除 ${file.name}`} onClick={()=>onRemove(file.path)}>×</button>:null}</div>)}</div>
}
export function AttachmentDropOverlay({visible,pending}:{visible:boolean;pending:boolean}):JSX.Element|null{
 return visible?<div className="attachment-drop-overlay">松开以添加图片、文件或视频</div>:pending?<div className="attachment-upload-status" role="status">正在添加附件…</div>:null
}
