import type { ChatImage } from '../../../shared/chatImages'
export function ChatImagePicker({disabled,onSelected,onError}:{disabled:boolean;onSelected:(images:ChatImage[])=>void;onError:(message:string)=>void}):JSX.Element {
  return <button type="button" className="btn" aria-label="添加图片" title="添加图片（模型需支持识图）" disabled={disabled} onClick={()=>void window.ackem.selectChatImages().then(onSelected).catch(e=>onError(String(e)))}>＋</button>
}
export function ChatImages({images,onRemove}:{images:ChatImage[];onRemove?:(path:string)=>void}):JSX.Element|null {
  if(!images.length)return null
  return <div className={`chat-image-list ${onRemove?'chat-image-drafts':''}`}>{images.map(image=><figure key={image.path}><img src={image.preview} alt={image.name} title={image.name}/>{onRemove?<button type="button" aria-label={`移除 ${image.name}`} onClick={()=>onRemove(image.path)}>×</button>:null}</figure>)}</div>
}
