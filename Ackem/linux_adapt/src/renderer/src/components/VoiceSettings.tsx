/**
 * Voice settings — ASR/TTS pipeline (Settings → 语音).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceEnvReport } from '../ackem'
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
      <SettingsStatusBadge tone={props.ok ? 'ok' : 'warn'}>{props.ok ? '✓' : '!'}</SettingsStatusBadge>
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
      const report = await window.ackem.voice?.checkEnvironment?.()
      setEnv(report ?? null)
      const h = await window.ackem.voice?.health?.()
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
      void window.ackem.voice?.health?.().then(setHealth).catch(() => setHealth(null))
    }, 60_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsub = window.ackem.voice?.onInstallLog?.((p) => {
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
      const result = await window.ackem.voice?.installEnvironment?.()
      if (!result?.ok) {
        setInstallError(result?.error ?? '准备失败，请重试')
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
        title="语音环境"
        hint="Ackem 可自动配置，无需手动安装 Python 或运行命令行"
        badge={
          envReady ? (
            <SettingsStatusBadge tone="ok">已就绪</SettingsStatusBadge>
          ) : (
            <SettingsStatusBadge tone="warn">待准备</SettingsStatusBadge>
          )
        }
      >
        <p className="settings-note">{env?.summary ?? '正在检测语音环境…'}</p>
        {env?.detail ? <p className="settings-field-footnote">{env.detail}</p> : null}

        {env ? (
          <div className="voice-env-steps">
            <StepRow
              ok={env.python.ok}
              label="Python 运行环境"
              hint={env.python.message + (env.python.version ? ` · ${env.python.version}` : '')}
            />
            <StepRow
              ok={env.dependenciesOk}
              label="语音识别 / 合成依赖"
              hint={
                env.dependenciesOk
                  ? 'faster-whisper、pyttsx3（离线 TTS）等已安装'
                  : env.missingDependencies.length
                    ? `缺少: ${env.missingDependencies.join(', ')}`
                    : '尚未安装'
              }
            />
            <StepRow
              ok={env.serviceRunning || serviceOk}
              label="语音服务"
              hint={
                serviceOk
                  ? `${health?.tts_engine ?? 'TTS'} · 服务运行中`
                  : '服务未运行'
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
              {installing ? '正在准备…（首次约 3–15 分钟）' : '一键准备语音环境'}
            </button>
            <p className="settings-field-footnote">
              会自动下载内置 Python（约 300MB，仅 Windows 首次）并安装语音依赖，完成后自动启动服务。
              发行版 exe 若已内置 python-embedded，则跳过下载。
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
            title="重新检测环境"
            hint="检查 Python、依赖与服务状态"
            busy={checking}
            busyLabel="检测中…"
            actionLabel="检测"
            onAction={() => void refreshEnv()}
          />
          <SettingsActionItem
            title="启动 / 重启语音服务"
            hint="依赖已安装但服务异常时使用"
            busy={false}
            actionLabel="重启"
            onAction={() => {
              void window.ackem.voice?.restartService?.().then(() => refreshEnv())
            }}
          />
        </SettingsActionStack>
      </SettingsBlock>

      <SettingsBlock title="功能开关">
        <SettingsToggleRow
          title="启用语音功能"
          hint={
            envReady
              ? '开启后可在剧院模式使用麦克风对话'
              : '建议先点击上方「一键准备语音环境」'
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
          title="TTS 自动播报回复"
          hint={
            TTS_BROADCAST_ENABLED
              ? 'LLM 文字回复完成后，按情绪标签合成语音'
              : '灰度中，暂不可用（后续版本开放）'
          }
          checked={TTS_BROADCAST_ENABLED ? settings.ttsEnabled : false}
          disabled={!TTS_BROADCAST_ENABLED}
          onChange={(checked) => update({ ttsEnabled: checked })}
        />
        <SettingsToggleRow
          title="记住剧院麦克风状态"
          hint="下次进入剧院时恢复上次开/关"
          checked={settings.rememberMicState}
          disabled={!settings.enabled}
          onChange={(checked) => update({ rememberMicState: checked })}
        />
      </SettingsBlock>

      {settings.enabled ? (
        <>
          <SettingsBlock title="语音识别">
            <SettingsField label="ASR 模型">
              <select
                value={settings.asrModel}
                onChange={(e) => update({ asrModel: e.target.value as 'base' | 'small' })}
                className="field-input w-full"
              >
                <option value="base">base — 快（约 1–3s）</option>
                <option value="small">small — 准（约 2–5s）</option>
              </select>
            </SettingsField>
          </SettingsBlock>

          <SettingsBlock
            title="TTS 播报"
            hint={TTS_BROADCAST_ENABLED ? undefined : '灰度中 · 接口已预留，后续开放'}
          >
            <div
              className={
                TTS_BROADCAST_ENABLED ? undefined : 'pointer-events-none opacity-45 select-none'
              }
              aria-disabled={!TTS_BROADCAST_ENABLED}
            >
            <SettingsField label="TTS 引擎">
              <select
                value={settings.ttsEngine}
                onChange={(e) =>
                  update({ ttsEngine: e.target.value as VoiceSettingsState['ttsEngine'] })
                }
                className="field-input w-full"
              >
                <option value="auto">自动（优先神经网络，失败降级本机）</option>
                <option value="piper">Piper 离线（可导入音色包，推荐）</option>
                {GPT_SOVITS_VOICE_ENABLED ? (
                  <option value="gpt-sovits">GPT-SoVITS 语音包（角色声线，需 GPU）</option>
                ) : null}
                <option value="edge-tts">edge-tts 在线（音质最好，需联网）</option>
                <option value="local-sapi">本机系统语音（机械感强）</option>
                <option value="cosyvoice">CosyVoice（需 GPU）</option>
              </select>
                <p className="settings-field-footnote">
                  想自己导入音色：选 Piper，把 `.onnx` + `.onnx.json` 放进用户目录
                  `voice-models/piper/`（见下方说明），重启语音服务即可。在线推荐 edge-tts 晓晓。
                  GPT-SoVITS 内置角色声线接口已预留，后续版本开放。
                </p>
            </SettingsField>

            {GPT_SOVITS_VOICE_ENABLED && settings.ttsEngine === 'gpt-sovits' && (
              <SettingsField label="GPT-SoVITS 语音包">
                <select
                  value={settings.ttsGptSovitsModel}
                  onChange={(e) => update({ ttsGptSovitsModel: e.target.value })}
                  className="field-input w-full"
                  disabled={gptSovitsVoices.length === 0}
                >
                  {gptSovitsVoices.length === 0 ? (
                    <option value="">未检测到语音包</option>
                  ) : (
                    gptSovitsVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label || v.id}
                        {v.language ? ` · ${v.language}` : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="settings-field-footnote">
                  Ackem 内置 Ackem 女声语音包，开箱即用（无需训练、无需单独下载）。
                  首次说话约 30–60 秒加载模型，需 NVIDIA GPU。也可改用 Piper / edge-tts。
                </p>
              </SettingsField>
            )}

            {settings.ttsEngine === 'piper' && (
              <SettingsField label="离线音色包">
                <select
                  value={settings.ttsPiperModel}
                  onChange={(e) => update({ ttsPiperModel: e.target.value })}
                  className="field-input w-full"
                  disabled={piperVoices.length === 0}
                >
                  {piperVoices.length === 0 ? (
                    <option value="">未检测到音色包</option>
                  ) : (
                    piperVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label || v.id}
                        {v.language ? ` · ${v.language}` : ''}
                      </option>
                    ))
                  )}
                </select>
                <p className="settings-field-footnote">
                  导入路径（二选一）：<br />
                  1. %APPDATA%\Ackem\voice-models\piper\你的音色名\<br />
                  2. 开发版 Ackem\voice-service\models\piper\<br />
                  每个文件夹放一对同名 `.onnx` 与 `.onnx.json`。详见该目录下 README.md。
                </p>
              </SettingsField>
            )}

            {(settings.ttsEngine === 'auto' || settings.ttsEngine === 'edge-tts') && (
              <SettingsField label="在线音色">
                <select
                  value={settings.ttsVoice}
                  onChange={(e) =>
                    update({ ttsVoice: e.target.value as VoiceSettingsState['ttsVoice'] })
                  }
                  className="field-input w-full"
                >
                  <option value="xiaoxiao">晓晓（女声，推荐）</option>
                  <option value="xiaoyi">晓伊（女声）</option>
                  <option value="yunxi">云希（男声）</option>
                  <option value="yunjian">云健（男声）</option>
                </select>
              </SettingsField>
            )}

            <SettingsField label={`TTS 音量 · ${settings.ttsVolume}%`}>
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

            <SettingsField label={`打断阈值 · ${settings.interruptThreshold} ms`}>
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
              <p className="settings-field-footnote">TTS 播放中，用户持续说话超过此时间则打断播报</p>
            </SettingsField>
            </div>
          </SettingsBlock>

          <SettingsBlock title="交互模式" hint="VAD 半双工为默认；嘈杂环境可切换 PTT">
            <SettingsOptionCards
              name="voiceMode"
              value={settings.voiceMode}
              onChange={(v) => update({ voiceMode: v })}
              options={[
                { value: 'vad', label: 'VAD 半双工', hint: '自动检测说话与静默' },
                { value: 'ptt', label: 'PTT 按住说话', hint: '按住麦克风键说话，松开识别' }
              ]}
            />

            <SettingsOptionCards
              name="inputChannel"
              value={settings.inputChannel}
              onChange={(v) => update({ inputChannel: v })}
              options={[
                { value: 'dual', label: '双通道', hint: '语音 + 文字；识别结果可编辑后发送' },
                { value: 'voice-only', label: '仅语音', hint: '隐藏文字输入，识别后直接发送' },
                { value: 'text-only', label: '仅文字', hint: '关闭麦克风，传统打字' }
              ]}
            />

            <SettingsField label={`静默阈值 · ${settings.silenceThreshold} ms`}>
              <input
                type="range"
                min={500}
                max={3000}
                step={100}
                value={settings.silenceThreshold}
                onChange={(e) => update({ silenceThreshold: Number(e.target.value) })}
                className="settings-range"
              />
              <p className="settings-field-footnote">判定「说完一句话」的静默时长（中文建议 800–1200ms）</p>
            </SettingsField>
          </SettingsBlock>
        </>
      ) : (
        <p className="settings-note settings-note--inset">
          开启语音后，在剧院模式可使用<strong>麦克风输入</strong>（语音识别后发送）。
          TTS 语音播报灰度中，Ackem 暂不以语音回复。首次使用点「一键准备语音环境」即可。
        </p>
      )}
    </>
  )
}
