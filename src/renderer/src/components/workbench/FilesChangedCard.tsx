import { fileNameOf, type FilesChanged } from '../../store/workbenchStore'

export function FilesChangedCard(props: {
  data: FilesChanged
  onReview: () => void
  onFile: (path: string) => void
}): JSX.Element {
  return (
    <div className="wb-change-row">
      <span className="wb-change-label">改了 {props.data.count} 个文件</span>
      {props.data.files.map((f) => (
        <span key={f.path} className="wb-change-file">
          <button type="button" className="wb-link" onClick={() => props.onFile(f.path)}>
            {fileNameOf(f.path)}
          </button>
          <span className="wb-plus">+{f.added}</span>
          <span className="wb-minus">-{f.removed}</span>
        </span>
      ))}
      <button type="button" className="wb-link" onClick={props.onReview}>
        查看
      </button>
    </div>
  )
}
