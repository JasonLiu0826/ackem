import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { PINNED_TASK_ID, inAckemArea, selectedDisplayTaskOf, useWorkbenchStore } from '../../store/workbenchStore'
import { IconChevron, IconFolder, IconPlus, IconSearch } from './icons'
import { PinnedAckemRow } from './PinnedAckemRow'
import { UserWorkspaceTree } from './UserWorkspaceTree'
import { cx } from './ui/cx'
import { useDismiss } from './ui/useDismiss'
import { WbModal } from './ui/WbModal'
import { WbPopDismiss } from './ui/WbMenu'

export function WorkbenchSidebar(): JSX.Element {
  const collapsed = useWorkbenchStore((s) => s.sidebarCollapsed)
  const workspaces = useWorkbenchStore((s) => s.workspaces)
  const tasks = useWorkbenchStore((s) => s.tasks)
  const selectedTaskId = useWorkbenchStore((s) => s.selectedTaskId)
  const searchQuery = useWorkbenchStore((s) => s.searchQuery)
  const newTaskOpen = useWorkbenchStore((s) => s.newTaskOpen)
  const pinned = selectedDisplayTaskOf({tasks,selectedTaskId:PINNED_TASK_ID})!
  const [workspaceOpen,setWorkspaceOpen]=useState(true)

  return (
    <aside className={cx('wb-sidebar', collapsed && 'is-collapsed')}>
      <div className="wb-side-head">
        <div className="wb-side-brand"><h2>AckemCode</h2><p>理解任务，执行并交付</p></div>
        <button type="button" className="wb-side-primary" onClick={() => useWorkbenchStore.getState().setNewTaskOpen(true)}>
          <IconPlus width={14} height={14} /> 新任务
        </button>
        <label className="wb-search">
          <IconSearch width={14} height={14} />
          <input
            value={searchQuery}
            placeholder="搜工作区 / 任务"
            onChange={(e) => useWorkbenchStore.getState().setSearchQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="wb-tree wb-scroll">
        <section className="wb-section">
          <div className="wb-section-label">Ackem</div>
          <PinnedAckemRow
            task={pinned}
            active={selectedTaskId === PINNED_TASK_ID || tasks.some(t=>t.id===selectedTaskId&&inAckemArea(t))}
            onSelect={() => useWorkbenchStore.getState().selectTask(PINNED_TASK_ID)}
          />
        </section>
        <section className="wb-section">
          <div className="wb-section-head">
            <button type="button" className="wb-section-label wb-section-toggle" aria-expanded={workspaceOpen} onClick={()=>setWorkspaceOpen(v=>!v)}><IconChevron width={12} height={12} style={{transform:workspaceOpen?'rotate(90deg)':undefined}}/>工作区</button>
            <button
              type="button"
              className="wb-icon-btn"
              title="新工作区"
              onClick={() => useWorkbenchStore.getState().setNewWorkspaceOpen(true)}
            >
              <IconFolder width={14} height={14} />
            </button>
          </div>
          {workspaceOpen && <UserWorkspaceTree
            workspaces={workspaces}
            tasks={tasks.filter(t => !inAckemArea(t))}
            selectedTaskId={selectedTaskId}
            searchQuery={searchQuery}
          onToggle={(id) => useWorkbenchStore.getState().toggleWorkspace(id)}
          onSelect={(id) => useWorkbenchStore.getState().selectTask(id)}
          onSelectWorkspace={(id) => useWorkbenchStore.getState().selectWorkspace(id)}
          onAddTask={(id) => useWorkbenchStore.getState().addTask(id)}
          onRemoveWorkspace={(id) => useWorkbenchStore.getState().removeWorkspace(id)}
            onRemoveTask={(id) => useWorkbenchStore.getState().removeTask(id)}
          />}
        </section>
      </div>
      <WorkEnvironment />
      {newTaskOpen ? <NewTaskDialog /> : null}
    </aside>
  )
}

function WorkEnvironment():JSX.Element {
  const [open,setOpen]=useState(false)
  const [confirmClear,setConfirmClear]=useState(false),[clearing,setClearing]=useState(false)
  const clear=async()=>{setClearing(true);try{await useWorkbenchStore.getState().clearAckemArea();setConfirmClear(false);useAppStore.getState().pushToast('Ackem 工作区已清除')}catch(error){useAppStore.getState().pushToast(String(error))}finally{setClearing(false)}}
  const [health,setHealth]=useState<'connected'|'disconnected'|'unknown'>('unknown')
  const ref=useRef<HTMLDivElement>(null)
  const trigger=useRef<HTMLButtonElement>(null)
  useDismiss(open,()=>setOpen(false),ref)
  useEffect(()=>{if(open)ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()},[open])
  useEffect(()=>{
    let live=true,request=0
    const refresh=async()=>{
      const revision=++request
      if(document.visibilityState==='hidden'){setHealth('unknown');return}
      try{const status=await window.ackem.workbench.environment();if(live&&revision===request)setHealth(status.kernelHealth)}catch{if(live&&revision===request)setHealth('unknown')}
    }
    void refresh();const timer=setInterval(()=>void refresh(),15000)
    document.addEventListener('visibilitychange',refresh)
    return()=>{live=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
  },[open])
  const action=(run:()=>void)=>{setOpen(false);run()}
  return <div className="wb-side-foot wb-environment" ref={ref}>
    <button ref={trigger} type="button" className="wb-environment-trigger" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(value=>!value)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20M9 16v4m6-4v4"/></svg>
      <span><strong>本机工作</strong><small><i className={`wb-environment-dot ${health}`}/>{health==='connected'?'AckemCode 已连接':health==='disconnected'?'AckemCode 未连接':'连接状态待确认'}</small></span><span aria-hidden="true">⋯</span>
    </button>
    {open&&<div className="wb-environment-menu" role="menu" onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();return}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
      event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      const index=items.indexOf(document.activeElement as HTMLButtonElement)
      items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()
    }}>
      <button type="button" role="menuitem" onClick={()=>action(()=>useWorkbenchStore.getState().openSettings())}>AI 连接</button>
      <button type="button" role="menuitem" onClick={()=>action(()=>{void window.ackem.workbench.openDefaultDirectory().catch(error=>useAppStore.getState().pushToast(String(error)))})}>打开默认工作目录</button>
      <button type="button" role="menuitem" onClick={()=>action(()=>useAppStore.getState().openSettingsAt('settings-appearance'))}>应用设置</button>
      <button type="button" role="menuitem" onClick={()=>action(()=>setConfirmClear(true))}>清除 Ackem 工作区</button>
    </div>}
    {confirmClear&&<WbModal title="清除 Ackem 工作区？" hint="会先停止 Ackem 正在执行的任务，再清除内联区的任务、操作记录和草稿。" onClose={()=>{if(!clearing)setConfirmClear(false)}} footer={<><button type="button" className="wb-btn" disabled={clearing} onClick={()=>setConfirmClear(false)}>取消</button><button type="button" className="wb-btn danger" disabled={clearing} onClick={()=>void clear()}>{clearing?'正在清除…':'确认清除'}</button></>}><p>工作目录里的文件、模型配置、主聊天记录及独立工作区和 CLI 数据会保留。</p></WbModal>}
  </div>
}

function NewTaskDialog(): JSX.Element {
  const workspaces = useWorkbenchStore((s) => s.workspaces)
  const [ws, setWs] = useState('independent')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), boxRef)
  const label = ws === 'independent' ? '独立任务' : workspaces.find((w) => w.id === ws)?.name || '独立任务'

  return (
    <WbModal
      title="新任务"
      hint="独立任务在工作页交付。写下要求后会显示任务名称。"
      onClose={() => useWorkbenchStore.getState().setNewTaskOpen(false)}
      footer={
        <>
          <button type="button" className="wb-btn" onClick={() => useWorkbenchStore.getState().setNewTaskOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="wb-btn primary"
            onClick={() => useWorkbenchStore.getState().addTask(ws === 'independent' ? null : ws)}
          >
            创建
          </button>
        </>
      }
    >
      <div className="wb-field">
        <label>挂到</label>
        <div className={cx('wb-choice', open && 'is-open')} ref={boxRef}>
          <button
            type="button"
            className="wb-select"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((v) => !v)}
          >
            <span>{label}</span>
            <IconChevron
              width={12}
              height={12}
              style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 120ms' }}
            />
          </button>
          {open ? (
            <>
            <WbPopDismiss onClose={() => setOpen(false)} />
            <div className="wb-choice-list" role="listbox">
              <button
                type="button"
                role="option"
                aria-selected={ws === 'independent'}
                className={cx('wb-choice-item', ws === 'independent' && 'is-on')}
                onClick={() => {
                  setWs('independent')
                  setOpen(false)
                }}
              >
                独立任务
              </button>
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="option"
                  aria-selected={ws === w.id}
                  className={cx('wb-choice-item', ws === w.id && 'is-on')}
                  onClick={() => {
                    setWs(w.id)
                    setOpen(false)
                  }}
                >
                  {w.name}
                </button>
              ))}
            </div>
            </>
          ) : null}
        </div>
      </div>
    </WbModal>
  )
}
