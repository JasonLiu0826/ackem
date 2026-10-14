import {useChatScroll} from '../../hooks/useChatScroll'
import { useEffect, useMemo } from 'react'
import { ChatPositionRail } from '../ChatPositionRail'
import type { ChatRow } from '../../store/appStore'
import type { TurnBlock, WorkbenchTask } from '../../store/workbenchStore'
import { selectedDisplayTaskOf, useWorkbenchStore } from '../../store/workbenchStore'
import { MarkdownContent } from '../MarkdownContent'
import { CopyButton } from '../CopyButton'
import { ApprovalCard } from './ApprovalCard'
import { MessageAttachments } from './ComposerAttachments'
import { FilesChangedCard } from './FilesChangedCard'
import { ProcessSummary } from './ProcessSummary'
import { ThoughtBlock } from './ThoughtBlock'
import { WorkProcess } from './WorkProcess'
import {visibleWorkTurns,workTurnBody} from '../../lib/workPresentation'
import { cx } from './ui/cx'

export function SessionPane(): JSX.Element {
  const task = useWorkbenchStore(selectedDisplayTaskOf)
  const tasks=useWorkbenchStore(s=>s.tasks)
  const turns=useMemo(()=>visibleWorkTurns((task?.turns??[]).filter(turn=>turn.inputState!=='queued'&&turn.processSummary!=='已取消排队')),[task?.turns])
  const target=useWorkbenchStore(s=>s.navigationTarget)
  const {scrollRef:pane,contentRef,isAtBottom,jumpToBottom:resume,pause}=useChatScroll()
  const rows=useMemo<ChatRow[]>(()=>turns.flatMap(turn=>[
    {kind:'message',role:'user',content:turn.userText,createdAt:turn.createdAt},
    {kind:'message',role:'assistant',content:workTurnBody(turn)}
  ]),[turns])
  useEffect(()=>{resume()},[task?.id,resume])
  useEffect(()=>{
    if(!target)return
    const node=[...pane.current?.querySelectorAll<HTMLElement>('[data-owner-task]')??[]].find(n=>n.dataset.ownerTask===target)
    if(node){pause();node.scrollIntoView({block:'start',behavior:'smooth'});useWorkbenchStore.setState({navigationTarget:undefined})}
  },[target,task?.turns,pause])
  return <div className="wb-session-shell">
    <ChatPositionRail scrollRef={pane} rows={rows} onNavigate={pause} minimumItems={2} label="工作任务定位"/>
    <div className="wb-session wb-scroll" ref={pane} data-session={task?.id} tabIndex={0}>
      <div className="wb-session-inner" ref={contentRef}>
        {!task||!turns.length?<div className="wb-empty"><h2>{task?.pinned?'交给 AckemCode 一项任务':'写下第一句'}</h2><p>{task?.pinned?'Ackem 的指令、执行过程和结果都记录在这里。你可以随时补充要求或停止。':'写下要求即可开始。'}</p></div>:turns.map((turn,index)=>{
          const owner=tasks.find(t=>t.id===turn.ownerTaskId)??task
          const first=task.pinned&&(index===0||turns[index-1].ownerTaskId!==turn.ownerTaskId)
          return <div key={`${owner.id}:${turn.id}`} data-chat-row={index*2} data-owner-task={owner.id}>
            {first&&<div className="wb-task-divider"><span>{owner.pinned?'Ackem 工作':owner.title}</span>{!owner.pinned&&<button type="button" title="删除任务记录，不删除文件" aria-label={`删除任务记录：${owner.title}`} onClick={()=>useWorkbenchStore.getState().removeTask(owner.id)}>删除记录</button>}</div>}
            <TurnView task={owner} turn={turn} canEdit={false}/>
          </div>
        })}
      </div>
    </div>
    {!isAtBottom&&<button type="button" className="wb-jump-bottom" aria-label="回到工作页最底部" onClick={resume}>↓ 回到最新</button>}
  </div>
}

function TurnView(props: { task: WorkbenchTask; turn: TurnBlock; canEdit: boolean }): JSX.Element {
  const openPath = useWorkbenchStore((s) => s.openPath)
  const openChange = useWorkbenchStore((s) => s.openChange)
  const toggleThought = useWorkbenchStore((s) => s.toggleThought)
  const resolveApproval = useWorkbenchStore((s) => s.resolveApproval)
  const editing = props.task.editingTurnId === props.turn.id

  return (
    <article className="wb-turn">

      {props.turn.userText&&<><div className="wb-command-meta">{props.turn.actor==='ackem'?'Ackem 指令':'你'}<time>{new Date(props.turn.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div>
      <div className={cx('wb-user', editing && 'is-editing')}>
        {props.canEdit && !editing ? (
          <button
            type="button"
            className="wb-edit"
            onClick={() => useWorkbenchStore.getState().beginEditLastTurn(props.task.id)}
          >
            改这句
          </button>
        ) : null}
        <MessageAttachments
          items={editing ? props.task.editAttachments : props.turn.attachments}
          onPath={openPath}
        />
        {editing ? (
          <>
            <textarea
              className="wb-user-edit"
              value={props.task.editDraft}
              autoFocus
              rows={3}
              onChange={(e) => useWorkbenchStore.getState().setEditDraft(props.task.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  useWorkbenchStore.getState().cancelEdit(props.task.id)
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  useWorkbenchStore.getState().sendEdit(props.task.id)
                }
              }}
            />
            <div className="wb-user-edit-bar">
              <button type="button" className="wb-btn" onClick={() => useWorkbenchStore.getState().cancelEdit(props.task.id)}>
                取消
              </button>
              <button
                type="button"
                className="wb-btn primary"
                disabled={!props.task.editDraft.trim() && props.task.editAttachments.length === 0}
                onClick={() => useWorkbenchStore.getState().sendEdit(props.task.id)}
              >
                发送
              </button>
            </div>
          </>
        ) : (
          <div
            className={cx('wb-user-text', props.canEdit && 'is-edit')}
            onClick={
              props.canEdit ? () => useWorkbenchStore.getState().beginEditLastTurn(props.task.id) : undefined
            }
          >
            {props.turn.userText}
          </div>
        )}
      </div></>}
      {(!props.turn.activities?.length||props.turn.executionEndedAt)&&<ProcessSummary text={props.turn.assistantText&&!workTurnBody(props.turn)?'已停止，尚未生成最终答复':props.turn.processSummary} />}
      <WorkProcess turn={props.turn} settled={!!props.turn.executionEndedAt||['done','failed','paused'].includes(props.task.status)}/>
      {!props.turn.activities?.length&&<ThoughtBlock
        seconds={props.turn.thoughtSeconds}
        open={props.turn.thoughtOpen}
        cancelled={props.turn.thoughtCancelled}
        lines={props.turn.thoughtLines}
        onToggle={() => toggleThought(props.task.id, props.turn.id)}
        onPath={openPath}
      />}
      {workTurnBody(props.turn) ? (
        <div className="wb-assistant">
          {props.turn.executionEndedAt&&props.turn.assistantTextKind==='partial'&&<ProcessSummary text="以下正文尚未完成"/>}
          <MarkdownContent source={workTurnBody(props.turn)} className="wb-assistant-md" />
          <CopyButton text={workTurnBody(props.turn)} iconOnly className="wb-md-copy" />
        </div>
      ) : null}
      {props.turn.approval ? (
        <ApprovalCard
          approval={props.turn.approval}
          onAllow={() => resolveApproval(props.task.id, props.turn.id, 'allow')}
          onDeny={() => resolveApproval(props.task.id, props.turn.id, 'deny')}
          onAnswer={(answers, cancelled) => useWorkbenchStore.getState().answerQuestion(props.task.id, props.turn.id, answers, cancelled)}
          onPath={openPath}
        />
      ) : null}
      {props.turn.filesChanged ? (
        <FilesChangedCard data={props.turn.filesChanged} onReview={() => openChange()} onFile={openPath} />
      ) : null}
    </article>
  )
}

