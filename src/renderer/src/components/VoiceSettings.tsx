/**
 * Voice settings 鈥?ASR/TTS pipeline (Settings 鈫?璇煶).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceEnvReport } from '../Ackem'
import {
  SettingsActionItem,
  SettingsActionStack,
  SettingsBlock,
  SettingsField,
  SettingsOptionCards,
  SettingsStatusBadge,
  SettingsToggleRow
} from './settings/settingsUi'
import {
  loadVoiceSettings,
  saveVoiceSettings,
  syncVoiceSettingsToMain,
  GPT_SOVITS_VOICE_ENABLED,
  TTS_BROADCAST_ENABLED,
  type VoiceSettingsState
} from '../lib/voiceSettings'

type HealthInfo = {
  asr_ready: boolean
  tts_ready: boolean
  tts_engine: string
  tts_model_loaded: boolean
  gpu_available: boolean
  gpu_name: string
  port: number
  piper_voices?: Array<{ id: string; label: string; language: string }>
  gpt_sovits_voices?: Array<{ id: string; label: string; language: string }>
} | null

function StepRow(props: { ok: boolean; label: string; hint?: string }): JSX.Element {
  return (
    <div className="voice-env-step">
      <SettingsStatusBadge tone={props.ok ? 'ok' : 'warn'}>{props.ok ? '鉁? : '!'}</SettingsStatusBadge>
      <div>
        <p className="voice-env-step__label">{props.label}</p>
        {props.hint ? <p className="voice-env-step__hint">{props.hint}</p> : null}
      </div>
    </div>
  )
}

export function VoiceSettings(): JSX.Element {
  const [settings, setSettingsState] = useState<VoiceSettingsState>(loadVoiceSettings)
  const [env, setEnv] = useState<VoiceEnvReport | null>(null)
  const [health, setHealth] = useState<HealthInfo>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installLog, setInstallLog] = useState<string[]>([])
  const [installError, setInstallError] = useState<string | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  const scrollInstallLog = useCallback(() => {
    const el = logContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const refreshEnv = useCallback(async (): Promise<void> => {
    setChecking(true)
    try {
      const report = await window.Ackem.voice?.checkEnvironment?.()
      setEnv(report ?? null)
      const h = await window.Ackem.voice?.health?.()
      setHealth(h ?? null)
    } catch {
      setEnv(null)
      setHealth(null)
    } finally {
      setChecking(false)
    }
  }, [])

  const piperVoices = health?.piper_voices ?? []
  const gptSovitsVoices = health?.gpt_sovits_voices ?? []

  const update = (patch: Partial<VoiceSettingsState>) => {
    const next = { ...settings, ...patch }
    setSettingsState(next)
    saveVoiceSettings(next)
    void syncVoiceSettingsToMain(next)
  }

  useEffect(() => {
    void syncVoiceSettingsToMain(settings)
    void refreshEnv()
    const timer = setInterval(() => {
      void window.Ackem.voice?.health?.().then(setHealth).catch(() => setHealth(null))
    }, 60_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsub = window.Ackem.voice?.onInstallLog?.((p) => {
      setInstallLog((prev) => [...prev.slice(-80), p.line])
      requestAnimationFrame(scrollInstallLog)
    })
    return unsub
  }, [scrollInstallLog])

  useEffect(() => {
    if (installLog.length === 0) return
    scrollInstallLog()
  }, [installLog.length, scrollInstallLog])

  const runInstall = async (): Promise<void> => {
    setInstalling(true)
    setInstallError(null)
    setInstallLog([])
    try {
      const result = await window.Ackem.voice?.installEnvironment?.()
      if (!result?.ok) {
        setInstallError(result?.error ?? '鍑嗗澶辫触锛岃閲嶈瘯')
      }
      await refreshEnv()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  const envReady = Boolean(env?.ready)
  const serviceOk = Boolean(health?.asr_ready && health?.tts_ready)

  return (
    <>
      <SettingsBlock
        title="璇煶鐜"
        hint="Ackem 鍙嚜鍔ㄩ厤缃紝鏃犻渶鎵嬪姩瀹夎 Python 鎴栬繍琛屽懡浠よ"
        badge={
          envReady ? (
            <SettingsStatusBadge tone="ok">宸插氨缁?/SettingsStatusBadge>
          ) : (
            <SettingsStatusBadge tone="warn">寰呭噯澶?/SettingsStatusBadge>
          )
        }
      >
        <p className="settings-note">{env?.summary ?? '姝ｅ湪妫€娴嬭闊崇幆澧冣€?}</p>
        {env?.detail ? <p className="settings-field-footnote">{env.detail}</p> : null}

        {env ? (
          <div className="voice-env-steps">
            <StepRow
              ok={env.python.ok}
              label="Python 杩愯鐜"
              hint={env.python.message + (env.python.version ? ` 路 ${env.python.version}` : '')}
            />
            <StepRow
              ok={env.dependenciesOk}
              label="璇煶璇嗗埆 / 鍚堟垚渚濊禆"
              hint={
                env.dependenciesOk
                  ? 'faster-whisper銆乸yttsx3锛堢绾?TTS锛夌瓑宸插畨瑁?
                  : env.missingDependencies.length
                    ? `缂哄皯: ${env.missingDependencies.join(', ')}`
                    : '灏氭湭瀹夎'
              }
            />
            <StepRow
              ok={env.serviceRunning || serviceOk}
              label="璇煶鏈嶅姟"
              hint={
                serviceOk
                  ? `${health?.tts_engine ?? 'TTS'} 路 鏈嶅姟杩愯涓璥
                  : '鏈嶅姟鏈繍琛?
              }
            />
          </div>
        ) : null}

        {!envReady && env?.canAutoInstall !== false ? (
          <div className="voice-env-actions">
            <button
              type="button"
              className="field-btn-primary px-4 py-2 text-sm"
              disabled={installing || checking}
              onClick={() => void runInstall()}
            >
              {installing ? '姝ｅ湪鍑嗗鈥︼紙棣栨绾?3鈥?5 鍒嗛挓锛? : '涓€閿噯澶囪闊崇幆澧?}
            </button>
            <p className="settings-field-footnote">
              浼氳嚜鍔ㄤ笅杞藉唴缃?Python锛堢害 300MB锛屼粎 Windows 棣栨锛夊苟瀹夎璇煶渚濊禆锛屽畬鎴愬悗鑷姩鍚姩鏈嶅姟銆?
              鍙戣鐗?exe 鑻ュ凡鍐呯疆 python-embedded锛屽垯璺宠繃涓嬭浇銆?
            </p>
          </div>
        ) : null}

        {installError ? <p className="voice-env-error">{installError}</p> : null}

        {installLog.length > 0 ? (
          <div ref={logContainerRef} className="voice-env-log" aria-live="polite">
            {installLog.map((line, i) => (
              <div key={`${i}-${line}`} className="voice-env-log__line">
                {line}
              </div>
            ))}
          </div>
        ) : null}

        <SettingsActionStack>
          <SettingsActionItem
            title="閲嶆柊妫€娴嬬幆澧?
            hint="妫€鏌?Python銆佷緷璧栦笌鏈嶅姟鐘舵€?
            busy={checking}
            busyLabel="妫€娴嬩腑鈥?
            actionLabel="妫€娴?
            onAction={() => void refreshEnv()}
          />
          <SettingsActionItem
            title="鍚姩 / 閲嶅惎璇煶鏈嶅姟"
            hint="渚濊禆宸插畨瑁呬絾鏈嶅姟寮傚父鏃朵娇鐢?
            busy={false}
            actionLabel="閲嶅惎"
            onAction={() => {
              void window.Ackem.voice?.restartService?.().then(() => refreshEnv())
            }}
          />
        </SettingsActionStack>
      </SettingsBlock>

      <SettingsBlock title="鍔熻兘寮€鍏?>
        <SettingsToggleRow
          title="鍚敤璇煶鍔熻兘"
          hint={
            envReady
              ? '寮€鍚悗鍙湪鍓ч櫌妯″紡浣跨敤楹﹀厠椋庡璇?
              : '寤鸿鍏堢偣鍑讳笂鏂广€屼竴閿噯澶囪闊崇幆澧冦€?
          }
          checked={settings.enabled}
          onChange={(checked) => {
            update({ enabled: checked })
            if (checked && env && !env.ready) {
              void runInstall()
            }
          }}
        />
        <SettingsToggleRow
          title="TTS 鑷姩鎾姤鍥炲"
          hint={
            TTS_BROADCAST_ENABLED
              ? 'LLM 鏂囧瓧鍥炲瀹屾垚鍚庯紝鎸夋儏缁爣绛惧悎鎴愯闊?
              : '鐏板害涓紝鏆備笉鍙敤锛堝悗缁増鏈紑鏀撅級'
          }
          checked={TTS_BROADCAST_ENABLED ? settings.ttsEnabled : false}
          disabled={!TTS_BROADCAST_ENABLED}
          onChange={(checked) => update({ ttsEnabled: checked })}
        />
        <SettingsToggleRow
          title="璁颁綇鍓ч櫌楹﹀厠椋庣姸鎬?
          hint="涓嬫杩涘叆鍓ч櫌鏃舵仮澶嶄笂娆″紑/鍏?
          checked={settings.rememberMicState}
          disabled={!settings.enabled}
          onChange={(checked) => update({ rememberMicState: checked })}
        />
      </SettingsBlock>

      {settings.enabled ? (
        <>
          <SettingsBlock title="璇煶璇嗗埆">
            <SettingsField label="ASR 妯″瀷">
              <select
                value={settings.asrModel}
                onChange={(e) => update({ asrModel: e.target.value as 'base' | 'small' })}
                className="field-input w-full"
              >
                <option value="base">base 鈥?蹇紙绾?1鈥?s锛?/option>
                <option value="small">small 鈥?鍑嗭紙绾?2鈥?s锛?/option>
              </select>
            </SettingsField>
          </SettingsBlock>

          <SettingsBlock
            title="TTS 鎾姤"
            hint={TTS_BROADCAST_ENABLED ? undefined : '鐏板害涓?路 鎺ュ彛宸查鐣欙紝鍚庣画寮€鏀?}
          >
            <div
              className={
                TTS_BROADCAST_ENABLED ? undefined : 'pointer-events-none opacity-45 select-none'
              }
              aria-disabled={!TTS_BROADCAST_ENABLED}
            >
            <SettingsField label="TTS 寮曟搸">
              <select
                value={settings.ttsEngine}
                onChange={(e) =>
                  update({ ttsEngine: e.target.value as VoiceSettingsState['ttsEngine'] })
                }
                className="field-input w-full"
              >
                <option value="auto">鑷姩锛堜紭鍏堢缁忕綉缁滐紝澶辫触闄嶇骇鏈満锛?/option>
                <option value="piper">Piper 绂荤嚎锛堝彲瀵煎叆闊宠壊鍖咃紝鎺ㄨ崘锛?/option>
                {GPT_SOVITS_VOICE_ENABLED ? (
                  <option value="gpt-sovits">GPT-SoVITS 璇煶鍖咃紙瑙掕壊澹扮嚎锛岄渶 GPU锛?/option>
                ) : null}
                <option value="edge-tts">edge-tts 鍦ㄧ嚎锛堥煶璐ㄦ渶濂斤紝闇€鑱旂綉锛?/option>
                <option value="local-sapi">鏈満绯荤粺璇煶锛堟満姊版劅寮猴級</option>
                <option value="cosyvoice">CosyVoice锛堥渶 GPU锛?/option>
              </select>
                <p className="settings-field-footnote">
                  鎯宠嚜宸卞鍏ラ煶鑹诧細閫?Piper锛屾妸 `.onnx` + `.onnx.json` 鏀捐繘鐢ㄦ埛鐩綍
                  `voice-models/piper/`锛堣涓嬫柟璇存槑锛夛紝閲嶅惎璇煶鏈嶅姟鍗冲彲銆傚湪绾挎帹鑽?edge-tts 鏅撴檽銆?
                  GPT-SoVITS 鍐呯疆瑙掕壊澹扮嚎鎺ュ彛宸查鐣欙紝鍚庣画鐗堟湰寮€鏀俱€?
                </p>
            </SettingsField>

            {GPT_SOVITS_VOICE_ENABLED && settings.ttsEngine === 'gpt-sovits' && (
              <SettingsField label="GPT-SoVITS 璇煶鍖?>
                <select
                  value={settings.ttsGptSovitsModel}
                  onChange={(e) => update({ ttsGptSovitsModel: e.target.value })}
                  className="field-input w-full"
                  disabled={gptSovitsVoices.length === 0}
                >
                  {gptSovitsVoices.length === 0 ? (
                    <option value="">鏈娴嬪埌璇煶鍖?/option>
                  ) : (
                    gptSovitsVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label || v.id}
                        {v.language ? ` 路 ${v.language}` : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="settings-field-footnote">
                  Ackem 鍐呯疆 Ackem 濂冲０璇煶鍖咃紝寮€绠卞嵆鐢紙鏃犻渶璁粌銆佹棤闇€鍗曠嫭涓嬭浇锛夈€?
                  棣栨璇磋瘽绾?30鈥?0 绉掑姞杞芥ā鍨嬶紝闇€ NVIDIA GPU銆備篃鍙敼鐢?Piper / edge-tts銆?
                </p>
              </SettingsField>
            )}

            {settings.ttsEngine === 'piper' && (
              <SettingsField label="绂荤嚎闊宠壊鍖?>
                <select
                  value={settings.ttsPiperModel}
                  onChange={(e) => update({ ttsPiperModel: e.target.value })}
                  className="field-input w-full"
                  disabled={piperVoices.length === 0}
                >
                  {piperVoices.length === 0 ? (
                    <option value="">鏈娴嬪埌闊宠壊鍖?/option>
                  ) : (
                    piperVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label || v.id}
                        {v.language ? ` 路 ${v.language}` : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="settings-field-footnote">
                  瀵煎叆璺緞锛堜簩閫変竴锛夛細<br />
                  1. %APPDATA%\Ackem\voice-models\piper\浣犵殑闊宠壊鍚峔<br />
                  2. 寮€鍙戠増 Ackem\voice-service\models\piper\<br />
                  姣忎釜鏂囦欢澶规斁涓€瀵瑰悓鍚?`.onnx` 涓?`.onnx.json`銆傝瑙佽鐩綍涓?README.md銆?
                </p>
              </SettingsField>
            )}

            {(settings.ttsEngine === 'auto' || settings.ttsEngine === 'edge-tts') && (
              <SettingsField label="鍦ㄧ嚎闊宠壊">
                <select
                  value={settings.ttsVoice}
                  onChange={(e) =>
                    update({ ttsVoice: e.target.value as VoiceSettingsState['ttsVoice'] })
                  }
                  className="field-input w-full"
                >
                  <option value="xiaoxiao">鏅撴檽锛堝コ澹帮紝鎺ㄨ崘锛?/option>
                  <option value="xiaoyi">鏅撲紛锛堝コ澹帮級</option>
                  <option value="yunxi">浜戝笇锛堢敺澹帮級</option>
                  <option value="yunjian">浜戝仴锛堢敺澹帮級</option>
                </select>
              </SettingsField>
            )}

            <SettingsField label={`TTS 闊抽噺 路 ${settings.ttsVolume}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.ttsVolume}
                onChange={(e) => update({ ttsVolume: Number(e.target.value) })}
                className="settings-range"
                disabled={!TTS_BROADCAST_ENABLED}
              />
            </SettingsField>

            <SettingsField label={`鎵撴柇闃堝€?路 ${settings.interruptThreshold} ms`}>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={settings.interruptThreshold}
                onChange={(e) => update({ interruptThreshold: Number(e.target.value) })}
                className="settings-range"
                disabled={!TTS_BROADCAST_ENABLED}
              />
              <p className="settings-field-footnote">TTS 鎾斁涓紝鐢ㄦ埛鎸佺画璇磋瘽瓒呰繃姝ゆ椂闂村垯鎵撴柇鎾姤</p>
            </SettingsField>
            </div>
          </SettingsBlock>

          <SettingsBlock title="浜や簰妯″紡" hint="VAD 鍗婂弻宸ヤ负榛樿锛涘槇鏉傜幆澧冨彲鍒囨崲 PTT">
            <SettingsOptionCards
              name="voiceMode"
              value={settings.voiceMode}
              onChange={(v) => update({ voiceMode: v })}
              options={[
                { value: 'vad', label: 'VAD 鍗婂弻宸?, hint: '鑷姩妫€娴嬭璇濅笌闈欓粯' },
                { value: 'ptt', label: 'PTT 鎸変綇璇磋瘽', hint: '鎸変綇楹﹀厠椋庨敭璇磋瘽锛屾澗寮€璇嗗埆' }
              ]}
            />

            <SettingsOptionCards
              name="inputChannel"
              value={settings.inputChannel}
              onChange={(v) => update({ inputChannel: v })}
              options={[
                { value: 'dual', label: '鍙岄€氶亾', hint: '璇煶 + 鏂囧瓧锛涜瘑鍒粨鏋滃彲缂栬緫鍚庡彂閫? },
                { value: 'voice-only', label: '浠呰闊?, hint: '闅愯棌鏂囧瓧杈撳叆锛岃瘑鍒悗鐩存帴鍙戦€? },
                { value: 'text-only', label: '浠呮枃瀛?, hint: '鍏抽棴楹﹀厠椋庯紝浼犵粺鎵撳瓧' }
              ]}
            />

            <SettingsField label={`闈欓粯闃堝€?路 ${settings.silenceThreshold} ms`}>
              <input
                type="range"
                min={500}
                max={3000}
                step={100}
                value={settings.silenceThreshold}
                onChange={(e) => update({ silenceThreshold: Number(e.target.value) })}
                className="settings-range"
              />
              <p className="settings-field-footnote">鍒ゅ畾銆岃瀹屼竴鍙ヨ瘽銆嶇殑闈欓粯鏃堕暱锛堜腑鏂囧缓璁?800鈥?200ms锛?/p>
            </SettingsField>
          </SettingsBlock>
        </>
      ) : (
        <p className="settings-note settings-note--inset">
          寮€鍚闊冲悗锛屽湪鍓ч櫌妯″紡鍙娇鐢?strong>楹﹀厠椋庤緭鍏?/strong>锛堣闊宠瘑鍒悗鍙戦€侊級銆?
          TTS 璇煶鎾姤鐏板害涓紝Ackem 鏆備笉浠ヨ闊冲洖澶嶃€傞娆′娇鐢ㄧ偣銆屼竴閿噯澶囪闊崇幆澧冦€嶅嵆鍙€?
        </p>
      )}
    </>
  )
}
