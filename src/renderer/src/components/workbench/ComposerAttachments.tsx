import type { Attachment } from '../../store/workbenchStore'
import { IconClose, IconDoc, IconFolder } from './icons'

export function ComposerAttachments(props: {
  items: Attachment[]
  onRemove: (id: string) => void
  onPath?: (path: string) => void
}): JSX.Element | null {
  if (props.items.length === 0) return null
  return <div className="attachment-tray">{props.items.map(item=><div className="attachment-tile" key={item.id} title={item.name}>{item.kind==='image'?<img src={item.dataUrl} alt={item.name}/>:item.kind==='video'&&item.thumbnail?<img src={item.thumbnail} alt={item.name}/>:<span className="attachment-type">{item.kind==='folder'?'▣':'▤'}</span>}<span className="attachment-name">{item.name}</span><button type="button" aria-label={`移除 ${item.name}`} onClick={()=>props.onRemove(item.id)}><IconClose width={10} height={10}/></button></div>)}</div>
}

export function MessageAttachments(props: {
  items: Attachment[]
  onPath?: (path: string) => void
}): JSX.Element | null {
  if (props.items.length === 0) return null
  const images = props.items.filter((a) => a.kind === 'image')
  const rest = props.items.filter((a) => a.kind !== 'image')
  return (
    <>
      {images.length > 0 ? (
        <div className="wb-thumbs">
          {images.map((img) =>
            img.kind === 'image' ? (
              <span key={img.id} className="wb-thumb">
                <img src={img.dataUrl} alt={img.name} />
              </span>
            ) : null
          )}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div className="wb-chips">
          {rest.map((item) => (
            <span key={item.id} className={['wb-chip', item.kind === 'folder' ? 'is-folder' : ''].join(' ')}>
              {item.kind === 'folder' ? <IconFolder width={12} height={12} /> : <IconDoc width={12} height={12} />}
              {props.onPath ? (
                <button type="button" className="wb-md-link" onClick={() => props.onPath?.(item.path)}>
                  {item.kind==='video'?'▶ ':''}{item.name}
                </button>
              ) : (
                item.name
              )}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
