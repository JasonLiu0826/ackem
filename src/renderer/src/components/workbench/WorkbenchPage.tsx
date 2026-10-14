import {useAttachmentInput} from '../../hooks/useAttachmentInput'
import {AttachmentDropOverlay} from '../ChatAttachments'
import {addWorkbenchAttachments} from '../../store/workbenchAttachments'
import { useAppStore } from '../../store/appStore'
import { useEffect, useState } from 'react'
import { PINNED_TASK_ID, selectedDisplayTaskOf, useWorkbenchStore } from '../../store/workbenchStore'
import { Composer } from './Composer'
import { IconSidebar } from './icons'
import { RightRail } from './RightRail'
import { SessionPane } from './SessionPane'
import { WorkbenchSidebar } from './WorkbenchSidebar'
import { cx } from './ui/cx'
import { statusLabel } from './ui/status'
import { WbModal } from './ui/WbModal'
import '../../assets/workbench.css'

export function WorkbenchPage(): JSX.Element {
  const task = useWorkbenchStore(selectedDisplayTaskOf)
  const [launchingCli, setLaunchingCli] = useState(false)
  async function openCli(): Promise<void> {
    if (!task || launchingCli) return
    setLaunchingCli(true)
    try {
      await window.ackem.workbench.cliLaunch({ taskId: task.coordinatorTaskId ?? task.displayChildId ?? task.id, cwd: task.cwd })
    } catch (error) {
      useAppStore.getState().pushToast(error instanceof Error ? error.message : String(error))
    } finally { setLaunchingCli(false) }
  }
  const attachmentInput=useAttachmentInput(items=>{if(task)addWorkbenchAttachments(task.id,items);else useAppStore.getState().pushToast('请先新建或选择任务')},message=>useAppStore.getState().pushToast(message),task?.id??'')
  const trustConfirmOpen = useWorkbenchStore((s) => s.trustConfirmOpen)
  const newWorkspaceOpen = useWorkbenchStore((s) => s.newWorkspaceOpen)
  const editSendConfirmOpen = useWorkbenchStore((s) => s.editSendConfirmOpen)

  useEffect(() => {
    // 内核事件订阅已上移到 App 级 (聊天派工需要全局实时入账); 这里只做页面级刷新。
    void useWorkbenchStore.getState().hydrateRuntime()
    const poll = window.setInterval(() => {
      if (useWorkbenchStore.getState().tasks.some((task) => task.runtimeSessionId && (task.status === 'running' || task.status === 'waiting' || task.status === 'unknown'))) {
        void useWorkbenchStore.getState().hydrateRuntime()
      }
    }, 3000)
    if (!useWorkbenchStore.getState().tasks.some((t) => t.id === PINNED_TASK_ID)) return () => { window.clearInterval(poll) }
    if (!useWorkbenchStore.getState().selectedTaskId) {
      useWorkbenchStore.getState().selectTask(PINNED_TASK_ID)
    }
    return () => { window.clearInterval(poll) }
  }, [])

  return (
    <div className="wb">
      <WorkbenchSidebar />
      <section className="wb-center" {...attachmentInput.dragProps}>
        <AttachmentDropOverlay visible={attachmentInput.dragging} pending={attachmentInput.pending}/>
        {task ? (
          <>
            <header className="wb-titlebar">
              <button
                type="button"
                className="wb-icon-btn"
                title="折叠左栏"
                onClick={() =>
                  useWorkbenchStore.getState().setSidebarCollapsed(!useWorkbenchStore.getState().sidebarCollapsed)
                }
              >
                <IconSidebar />
              </button>
              <h1>{task.title}</h1>
              <span className={cx('wb-status-pill', task.status)}>
                <span className={cx('wb-dot', task.status)} />
                {task.taskState === 'cancelling' ? '正在停止' : task.taskState === 'paused' ? '已停止' : task.taskState === 'queued' ? '等待处理' : task.executionSettled?'已结束':statusLabel(task.status)}
              </span>
              <button
                type="button"
                className="wb-ghost"
                title="打开独立 AckemCode CLI 窗口"
                disabled={launchingCli}
                onClick={() => void openCli()}
              >
                {launchingCli ? '正在打开…' : 'CLI独立界面'}
              </button>
            </header>
            <SessionPane />
            <Composer task={task} />
          </>
        ) : null}
      </section>
      <RightRail />
      {newWorkspaceOpen ? <NewWorkspaceDialog /> : null}
      {trustConfirmOpen ? <TrustConfirm /> : null}
      {editSendConfirmOpen ? <EditSendConfirm /> : null}
    </div>
  )
}

function NewWorkspaceDialog(): JSX.Element {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')

  async function browseFolder(): Promise<void> {
    if (picking) return
    setPicking(true)
    setPickError('')
    try {
      if (typeof window.ackem.selectFolder !== 'function') {
        setPickError('需要重启应用后才能选文件夹，也可以直接把路径贴进输入框。')
        return
      }
      const picked = await window.ackem.selectFolder()
      const path = picked.path?.trim()
      if (!path) return
      setFolder(path)
      if (!name.trim()) {
        const tail = path.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop()
        setName(tail || '工作区')
      }
    } catch {
      setPickError('选文件夹失败，也可以直接把路径贴进输入框。')
    } finally {
      setPicking(false)
    }
  }

  return (
    <WbModal
      title="新工作区"
      hint="选本机文件夹并起名。从列表删除不会删磁盘上的文件夹。"
      onClose={() => useWorkbenchStore.getState().setNewWorkspaceOpen(false)}
      footer={
        <>
          <button type="button" className="wb-btn" onClick={() => useWorkbenchStore.getState().setNewWorkspaceOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="wb-btn primary"
            disabled={!name.trim() || !folder.trim()}
            onClick={() => useWorkbenchStore.getState().addWorkspace(name.trim(), folder.trim())}
          >
            添加
          </button>
        </>
      }
    >
      <div className="wb-field">
        <label>名称</label>
        <input value={name} placeholder="例如 AckemCode" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="wb-field">
        <label>文件夹</label>
        <div className="wb-field-row">
          <input
            className="wb-grow"
            value={folder}
            placeholder="本机路径"
            onChange={(e) => setFolder(e.target.value)}
          />
          <button type="button" className="wb-btn" disabled={picking} onClick={() => void browseFolder()}>
            {picking ? '选择中…' : '浏览'}
          </button>
        </div>
        {pickError ? <p className="wb-muted">{pickError}</p> : null}
      </div>
    </WbModal>
  )
}

function EditSendConfirm(): JSX.Element {
  const taskId = useWorkbenchStore((s) => s.selectedTaskId)
  return (
    <WbModal
      title="用这句重跑？"
      hint="当前内核尚未提供安全的编辑并回滚接线。请取消后把修改作为新消息发送。"
      onClose={() => useWorkbenchStore.getState().setEditSendConfirmOpen(false)}
      footer={
        <>
          <button
            type="button"
            className="wb-btn"
            onClick={() => useWorkbenchStore.getState().setEditSendConfirmOpen(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="wb-btn primary"
            onClick={() => useWorkbenchStore.getState().confirmEditSend(taskId)}
          >
            同意
          </button>
        </>
      }
    >
      {null}
    </WbModal>
  )
}

function TrustConfirm(): JSX.Element {
  const taskId = useWorkbenchStore((s) => s.selectedTaskId)
  return (
    <WbModal
      title="完全放开？"
      hint="本任务可访问本机文件、执行命令和联网，不受工作目录限制，也不再询问操作权限。你仍可随时停止任务。"
      onClose={() => useWorkbenchStore.getState().setTrustConfirmOpen(false)}
      footer={
        <>
          <button type="button" className="wb-btn" onClick={() => useWorkbenchStore.getState().setTrustConfirmOpen(false)}>
            取消
          </button>
          <button type="button" className="wb-btn danger" onClick={() => useWorkbenchStore.getState().setTrust(taskId, 'full')}>
            确认放开
          </button>
        </>
      }
    >
      {null}
    </WbModal>
  )
}
