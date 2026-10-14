import {
  formatRelativeTime,
  type UserWorkspace,
  type WorkbenchTask
} from '../../store/workbenchStore'
import { IconChevron, IconClose, IconFolder, IconPlus } from './icons'
import { cx } from './ui/cx'

export function UserWorkspaceTree(props: {
  workspaces: UserWorkspace[]
  tasks: WorkbenchTask[]
  selectedTaskId: string
  searchQuery: string
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onSelectWorkspace: (id: string) => void
  onAddTask: (workspaceId: string) => void
  onRemoveWorkspace: (id: string) => void
  onRemoveTask: (id: string) => void
}): JSX.Element {
  const q = props.searchQuery.trim().toLowerCase()
  const match = (s: string) => !q || s.toLowerCase().includes(q)
  const independents = props.tasks.filter((t) => !t.pinned && t.workspaceId == null && match(t.title))

  return (
    <>
      {props.workspaces.map((ws) => {
        const childTasks = props.tasks.filter(
          (t) => t.workspaceId === ws.id && match(t.title || ws.name)
        )
        if (q && !match(ws.name) && childTasks.length === 0) return null
        return (
          <div key={ws.id}>
            <div className={cx('wb-row', 'is-ws', childTasks.some((t) => t.id === props.selectedTaskId) && 'is-on')}>
              <button type="button" onClick={() => props.onToggle(ws.id)} aria-label={ws.expanded?'折叠工作区':'展开工作区'} aria-expanded={ws.expanded}>
                <IconChevron
                  width={12}
                  height={12}
                  style={{ transform: ws.expanded ? 'rotate(90deg)' : undefined, transition: 'transform 120ms' }}
                />
              </button>
              <IconFolder width={14} height={14} />
              <button
                type="button"
                className="wb-row-main"
                title={ws.folderPath}
                onClick={() => props.onSelectWorkspace(ws.id)}
              >
                <span className="wb-row-title">{ws.name}</span>
              </button>
              <div className="wb-row-actions">
                <button
                  type="button"
                  className="wb-icon-btn"
                  title="在此工作区新建任务"
                  onClick={() => props.onAddTask(ws.id)}
                >
                  <IconPlus width={12} height={12} />
                </button>
                <button
                  type="button"
                  className="wb-icon-btn wb-row-x"
                  title="从列表移除（不删磁盘）"
                  onClick={() => props.onRemoveWorkspace(ws.id)}
                >
                  <IconClose width={12} height={12} />
                </button>
              </div>
            </div>
            {ws.expanded
              ? childTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    active={task.id === props.selectedTaskId}
                    onSelect={() => props.onSelect(task.id)}
                    onRemove={() => props.onRemoveTask(task.id)}
                  />
                ))
              : null}
          </div>
        )
      })}
      {independents.length > 0 ? <div className="wb-section-label">独立任务</div> : null}
      {independents.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          active={task.id === props.selectedTaskId}
          onSelect={() => props.onSelect(task.id)}
          onRemove={() => props.onRemoveTask(task.id)}
        />
      ))}
    </>
  )
}

function TaskRow(props: {
  task: WorkbenchTask
  active: boolean
  onSelect: () => void
  onRemove: () => void
}): JSX.Element {
  const waiting = props.task.status === 'waiting' ? '等你批' : null
  return (
    <div className={cx('wb-row', 'wb-task', props.active && 'is-active')}>
      <button type="button" className="wb-row-hit" onClick={props.onSelect}>
        <span className={['wb-dot', props.task.status].join(' ')} />
        <span className="wb-row-main">
          <span className="wb-row-title">{props.task.title}</span>
          {waiting ? <span className="wb-row-sub">{waiting}</span> : null}
        </span>
      </button>
      <span className="wb-row-time">{formatRelativeTime(props.task.updatedAt)}</span>
      <button type="button" className="wb-icon-btn wb-row-x" title="从列表移除" onClick={props.onRemove}>
        <IconClose width={12} height={12} />
      </button>
    </div>
  )
}
