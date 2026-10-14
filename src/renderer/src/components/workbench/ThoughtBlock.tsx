import { fileNameOf, type ThoughtLine } from '../../store/workbenchStore'
import { IconChevron } from './icons'
import { cx } from './ui/cx'

function thoughtPathParts(text: string, path: string): { prefix: string; label: string } {
  const name = fileNameOf(path)
  if (text.endsWith(path)) return { prefix: text.slice(0, -path.length), label: path }
  if (text.endsWith(name)) return { prefix: text.slice(0, -name.length), label: name }
  return { prefix: /[:：]\s*$/.test(text) ? text : `${text} `, label: name }
}

export function ThoughtBlock(props: {
  seconds: number
  open: boolean
  cancelled?: boolean
  lines: ThoughtLine[]
  onToggle: () => void
  onPath: (path: string) => void
}): JSX.Element | null {
  if (props.seconds <= 0 && props.lines.length === 0) return null
  return (
    <div className="wb-thought">
      <button type="button" className={cx('wb-thought-head', props.open && 'is-open')} onClick={props.onToggle}>
        <IconChevron width={12} height={12} />
        早期执行记录 · 用时 {props.seconds}s{props.cancelled ? ' · 已取消' : ''}
      </button>
      {props.open
        ? props.lines.map((line) => {
            const split=line.text.indexOf('\n')
            if(split>=0)return <details key={line.id} className="wb-operation"><summary>{line.text.slice(0,split).slice(0,100)}</summary><pre>{line.text.slice(split+1)}</pre></details>
            const parts = line.path ? thoughtPathParts(line.text, line.path) : null
            return (
              <div key={line.id} className="wb-thought-line">
                {parts && line.path ? (
                  <>
                    {parts.prefix}
                    <button type="button" className="wb-link" onClick={() => props.onPath(line.path!)}>
                      {parts.label}
                    </button>
                  </>
                ) : (
                  line.text
                )}
              </div>
            )
          })
        : null}
    </div>
  )
}
