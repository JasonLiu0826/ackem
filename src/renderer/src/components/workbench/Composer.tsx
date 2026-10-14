import {addWorkbenchAttachments} from '../../store/workbenchAttachments'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsrDraft } from '../../hooks/useAsrDraft'
import { useVoicePipeline } from '../../hooks/useVoicePipeline'
import { loadVoiceSettings } from '../../lib/voiceSettings'
import { useAppStore } from '../../store/appStore'
import { useUiStore } from '../../store/uiStore'
import {
  useWorkbenchStore,
  type TrustLevel,
  type WorkbenchTask
} from '../../store/workbenchStore'
import { ComposerAttachments } from './ComposerAttachments'
import { ModelSettings } from './ModelSettings'
import { IconMic, IconPlus, IconSend, IconStop } from './icons'
import { cx } from './ui/cx'
import { useDismiss } from './ui/useDismiss'
import { WbMenu } from './ui/WbMenu'
import {LongTermControls} from './LongTermControls'
import {canStopWorkbenchTask} from '../../lib/workPresentation'
import {WorkQueue} from './WorkQueue'

const TRUSTS: { id: TrustLevel; label: string; cls: string }[] = [
  { id: 'ask', label: '每次询问', cls: 'wb-trust-ask' },
  { id: 'session', label: '自动允许编辑', cls: 'wb-trust-session' },
  { id: 'full', label: '完全放开', cls: 'wb-trust-full' }
]

export function Composer(props: { task: WorkbenchTask }): JSX.Element {
  const task = props.task
  const [longTermOpen,setLongTermOpen]=useState(false)
  const busy = !!task.runtimeQueue?.length||canStopWorkbenchTask(task)
  const [menu, setMenu] = useState<'plus' | 'trust' | 'mode' | 'model' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  useDismiss(!!menu, closeMenu, rootRef)
  const trust = TRUSTS.find((t) => t.id === task.trust) ?? TRUSTS[0]
  const canSend = !!task.composerDraft.trim() || task.composerAttachments.length > 0
  const canStop = canStopWorkbenchTask(task)
  const theaterOpen = useUiStore((s) => s.theaterOpen)
  const voice = useVoicePipeline({ surface: 'workbench', active: !theaterOpen })
  const asr = useAsrDraft({
    enabled: !theaterOpen,
    getText: () => useWorkbenchStore.getState().tasks.find((t) => t.id === task.id)?.composerDraft ?? '',
    setText: (text) => useWorkbenchStore.getState().setComposerDraft(task.id, text),
    onVoiceOnlyFinal: () => useWorkbenchStore.getState().send(task.id)
  })

  useEffect(() => {
    if (voice.error) useAppStore.getState().pushToast(voice.error)
  }, [voice.error])

  useEffect(() => {
    if (voice.micActive) asr.beginListen()
  }, [voice.micActive, asr.beginListen])

  function ensureVoiceEnabled(): boolean {
    if (loadVoiceSettings().enabled) return true
    useAppStore.getState().pushToast('请先在设置里启用语音，并准备好语音环境')
    useAppStore.getState().openSettingsAt('settings-voice')
    return false
  }

  return (
    <div className="wb-composer-dock">
      <WorkQueue task={task}/>
      <div className="wb-composer" ref={rootRef}>
        <ComposerAttachments
          items={task.composerAttachments}
          onRemove={(id) => useWorkbenchStore.getState().removeAttachment(task.id, id)}
          onPath={(path) => useWorkbenchStore.getState().openPath(path)}
        />
        {asr.recognizing ? <div className="wb-asr-live">识别中</div> : null}
        <textarea
          rows={2}
          value={task.composerDraft}
          placeholder={
            voice.micActive
              ? asr.recognizing
                ? '识别中…'
                : voice.state === 'thinking'
                  ? '正在识别…'
                  : '正在听… 说完会写进输入框'
              : busy
                ? '输入下一项要求，加入等待队列…'
                : '跟一句…'
          }
          onChange={(e) => {
            asr.onUserType(e.target.value)
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(160, el.scrollHeight)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              useWorkbenchStore.getState().send(task.id,busy&&(e.ctrlKey||e.metaKey)?'immediate':undefined)
            }
          }}
        />
        <div className="wb-composer-bar">
          <button
            type="button"
            className={cx('wb-plus-btn', menu === 'plus' && 'is-open')}
            aria-label="添加附件"
            onClick={() => setMenu(menu === 'plus' ? null : 'plus')}
          >
            <IconPlus width={14} height={14} />
          </button>
            <button type="button" className={cx('wb-pill','wb-mode-trigger',task.executionMode==='plan'&&'is-plan',menu==='mode'&&'is-open')} aria-label="工作模式" aria-haspopup="menu" aria-expanded={menu==='mode'} onClick={() => setMenu(menu==='mode'?null:'mode')}>{task.executionMode==='plan'?'Plan 模式':'Agent 模式'}</button>
            <button type="button" className={cx('wb-pill', trust.cls)} onClick={() => setMenu(menu === 'trust' ? null : 'trust')}>{trust.label}</button>
          <span className="wb-bar-spacer" />
          <ModelSettings task={task} open={menu==='model'} onToggle={() => setMenu(menu==='model'?null:'model')} onClose={closeMenu}/>
          <button
            type="button"
            className={cx('wb-pill', 'is-mic', voice.micActive && 'is-on')}
            title={
              voice.micActive
                ? '关掉麦克风'
                : loadVoiceSettings().voiceMode === 'ptt'
                  ? '按住说话'
                  : '语音输入'
            }
            onClick={() => {
              closeMenu()
              if (!ensureVoiceEnabled()) return
              if (loadVoiceSettings().voiceMode === 'ptt') return
              voice.toggleMic()
            }}
            onPointerDown={(e) => {
              if (loadVoiceSettings().voiceMode !== 'ptt') return
              if (!ensureVoiceEnabled()) return
              e.currentTarget.setPointerCapture(e.pointerId)
              if (!voice.micActive) void voice.startListening()
              voice.setPttActive(true)
            }}
            onPointerUp={() => {
              if (loadVoiceSettings().voiceMode !== 'ptt') return
              voice.setPttActive(false)
            }}
            onPointerCancel={() => {
              if (loadVoiceSettings().voiceMode !== 'ptt') return
              voice.setPttActive(false)
            }}
          >
            <IconMic />
          </button>
          {canStop ? <button type="button" className={cx('wb-send', 'is-stop')} title="停止当前任务" aria-label="停止当前任务" onClick={() => useWorkbenchStore.getState().abort(task.id)}><IconStop /></button> : null}
          {busy&&canSend?<button type="button" className="wb-queue-now" title="停止当前执行后立即处理（Ctrl+Enter）" onClick={()=>useWorkbenchStore.getState().send(task.id,'immediate')}>立即执行</button>:null}
          {canSend || !canStop ? <button type="button" className="wb-send" title={busy?'加入等待队列':'发送要求'} aria-label={busy?'加入等待队列':'发送要求'} disabled={!canSend} onClick={() => useWorkbenchStore.getState().send(task.id)}><IconSend /></button> : null}
          {menu === 'plus' ? (
            <WbMenu at="plus" onClose={closeMenu}>
              {task.coordinatorTaskId?<button type="button" onClick={()=>{closeMenu();setLongTermOpen(true)}}>长期安排</button>:null}
              <button type="button" onClick={() => {setMenu(null);void addImages(task.id)}}>
                图片
              </button>
              <button type="button" onClick={() => {setMenu(null);void addFiles(task.id,'file')}}>文件</button>
              <button type="button" onClick={() => {setMenu(null);void addFiles(task.id,'video')}}>视频</button>
              <button type="button" onClick={() => {setMenu(null);void addFolder(task.id)}}>
                文件夹
              </button>
            </WbMenu>
          ) : null}
          {menu === 'trust' ? (
            <WbMenu at="trust" onClose={closeMenu}>
              {TRUSTS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={t.cls}
                  onClick={() => {
                    if (t.id === 'full') {
                      useWorkbenchStore.getState().setTrustConfirmOpen(true)
                      setMenu(null)
                      return
                    }
                    useWorkbenchStore.getState().setTrust(task.id, t.id)
                    setMenu(null)
                  }}
                >
                  {t.label}
                </button>
              ))}
            </WbMenu>
          ) : null}
          {task.coordinatorTaskId?<LongTermControls key={task.coordinatorTaskId} taskId={task.coordinatorTaskId} open={longTermOpen} onClose={()=>setLongTermOpen(false)}/>:null}
          {menu === 'mode' ? <WbMenu at="effort" onClose={closeMenu}>
            <div role="menu" aria-label="工作模式">{(['agent','plan'] as const).map(mode => <button type="button" role="menuitemradio" aria-checked={(task.executionMode??'agent')===mode} key={mode}
              onClick={() => {useWorkbenchStore.getState().setExecutionMode(task.id,mode);closeMenu()}}>
              <span className="wb-mode-option"><span>{mode==='agent'?'Agent 模式':'Plan 模式'}</span><span aria-hidden="true">{(task.executionMode??'agent')===mode?'✓':''}</span></span>
              <small className="wb-mode-description">{mode==='agent'?'按要求执行并交付结果':'先调研和制定计划，批准后执行'}</small>
            </button>)}</div>
          </WbMenu> : null}
        </div>
      </div>
    </div>
  )
}

async function addImages(taskId:string):Promise<void>{await addFiles(taskId,'image')}
async function addFiles(taskId:string,kind:'image'|'file'|'video'):Promise<void>{
 try{addWorkbenchAttachments(taskId,await window.ackem.selectChatAttachments(kind))}catch(error){useAppToast(String(error))}
}

async function addFolder(taskId:string):Promise<void>{
 try{const {path}=await window.ackem.selectFolder();if(!path)return;const error=useWorkbenchStore.getState().addAttachment(taskId,{kind:'folder',id:Math.random().toString(36).slice(2),name:path.split(/[\\/]/).filter(Boolean).pop()||path,path});if(error)useAppToast(error)}catch(error){useAppToast(String(error))}
}

function pathOf(file: File): string {
  try {
    return window.ackem?.getPathForFile?.(file) || file.name
  } catch {
    return file.name
  }
}


function useAppToast(text: string): void {
  void import('../../store/appStore').then(({ useAppStore }) => useAppStore.getState().pushToast(text))
}
