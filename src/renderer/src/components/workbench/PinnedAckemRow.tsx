import { formatRelativeTime, type WorkbenchTask } from '../../store/workbenchStore'
import { IconPin } from './icons'
import { cx } from './ui/cx'

export function PinnedAckemRow(props: {
  task: WorkbenchTask
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const queued = props.task.queuedJobs + props.task.queuedFollow.length
  const sub =
    props.task.status === 'running' && queued > 0
      ? `排队 ${queued} · 干活中`
      : props.task.status === 'running'
        ? '干活中'
        : props.task.status === 'waiting'
          ? '等你批'
          : props.task.status === 'unknown' ? '待核对' : '工作与操作记录'

  return (
    <button type="button" className={cx('wb-row', props.active && 'is-active')} onClick={props.onSelect}>
      <span className={cx('wb-dot', props.task.status)} />
      <span className="wb-row-main">
        <span className="wb-row-title wb-pin-title">
          <IconPin width={12} height={12} />
          Ackem
        </span>
        <span className="wb-row-sub">{sub}</span>
      </span>
      <span className="wb-row-time">{formatRelativeTime(props.task.updatedAt)}</span>
    </button>
  )
}
