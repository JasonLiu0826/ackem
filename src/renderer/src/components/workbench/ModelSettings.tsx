import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useWorkbenchStore, type EffortLevel, type WorkbenchTask } from '../../store/workbenchStore'
import { cx } from './ui/cx'
import { useDismiss } from './ui/useDismiss'

const LEVELS: { id: EffortLevel; label: string; description: string }[] = [
  { id: 'low', label: 'Low', description: '快速思考' },
  { id: 'medium', label: 'Medium', description: '兼顾速度与深度' },
  { id: 'high', label: 'High', description: '深入思考与核验' },
  { id: 'max', label: 'Max', description: '最高思考深度' }
]

export function ModelSettings({ task, open, onToggle, onClose }: { task: WorkbenchTask; open: boolean; onToggle: () => void; onClose: () => void }): JSX.Element {
  const [model, setModel] = useState('')
  const [error, setError] = useState('')
  const slider = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(open, onClose, root)
  const effortIndex = Math.max(0, LEVELS.findIndex(level => level.id === task.effort))
  const level = LEVELS[effortIndex]
  const max = level.id === 'max'
  useEffect(() => { setModel('') }, [task.id, task.runtimeSessionId])
  useEffect(() => {
    let disposed = false
    setError('')
    window.ackem.workbench.modelInfo(task.runtimeSessionId).then(info => {
      if (!disposed) setModel(info.model)
    }).catch(() => { if (!disposed) setError('暂时无法读取模型，请确认 AckemCode 已连接。') })
    return () => { disposed = true }
  }, [task.id, task.runtimeSessionId, open])
  useEffect(() => { if (open) slider.current?.focus() }, [open])
  return <div className="wb-model-control" ref={root}>
    <button ref={trigger} type="button" className={cx('wb-pill', 'wb-model-trigger', max && 'is-max', open && 'is-open')}
      aria-label="模型设置" aria-haspopup="dialog" aria-expanded={open} title="模型与思考等级" onClick={onToggle}>
      <span className="wb-model-name">{model || '模型设置'}</span><span className="wb-model-effort">{level.label}</span>
    </button>
    {open && <div className={cx('wb-model-popover', max && 'is-max')} role="dialog" aria-label="模型与思考等级"
      onKeyDown={event => { if(event.key==='Escape'){event.stopPropagation();onClose();trigger.current?.focus()} }}>
      <div className="wb-model-popover-header"><span className="wb-model-level">{level.label}</span><span className="wb-model-current" title={model}>{model || (error ? '模型暂不可用' : '正在读取模型…')}</span></div>
      {error && <p className="wb-model-error" role="status">{error}</p>}
      <label className="wb-effort-label" htmlFor={`wb-effort-${task.id}`}>思考深度<span>{level.description}</span></label>
      <div className="wb-effort-slider" style={{ '--effort-progress': `${effortIndex / (LEVELS.length - 1) * 100}%` } as CSSProperties}>
        <div className="wb-effort-track" aria-hidden="true">{max && <div className="wb-effort-particles">{Array.from({length:6},(_,index) => <i key={index} style={{'--particle-delay':`${-index * 0.45}s`,'--particle-y':`${[25,58,38,72,45,64][index]}%`} as CSSProperties}/>)}</div>}</div><div className="wb-effort-dots" aria-hidden="true">{LEVELS.map(l => <i key={l.id}/>)}</div>
        <input ref={slider} id={`wb-effort-${task.id}`} type="range" min={0} max={LEVELS.length - 1} step={1} value={effortIndex}
          aria-valuetext={`${level.label}，${level.description}`} onChange={event => useWorkbenchStore.getState().setEffort(task.id, LEVELS[Number(event.target.value)].id)}/>
      </div>
      <div className="wb-effort-stops">{LEVELS.map(l => <button type="button" key={l.id} className={cx(l.id === level.id && 'is-selected', l.id==='max' && 'is-max')} aria-label={`${l.label}，${l.description}`} aria-pressed={l.id===level.id}
        onClick={() => useWorkbenchStore.getState().setEffort(task.id, l.id)}>{l.label}{l.id==='low' ? <small>Fast</small> : l.id==='max' ? <small>Slow</small> : null}</button>)}</div>
      {task.status==='running'||task.status==='waiting' ? <p className="wb-model-note">调整后用于下一条任务要求</p> : null}
    </div>}
  </div>
}
