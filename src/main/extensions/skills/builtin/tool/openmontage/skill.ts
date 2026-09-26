// [OpenMontage] AI 视频制作 — Skill Handler

import { createLogger } from '../../../../../logger.js'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types.js'
import { OPENMONTAGE_MANIFEST } from './manifest.js'

const log = createLogger('openmontage')

const API_BASE = 'http://127.0.0.1:8781'

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

interface ScriptResult {
  script_id: string
  title: string
  script: string
  scenes: Array<{ index: number; text: string; duration_sec: number }>
  duration_sec: number
  style: string
}

interface ProduceResult {
  status: string
  message?: string
  output_path?: string
  duration_sec?: number
  scenes_count?: number
}

interface TaskStatus {
  task_id: string
  status: string
  started_at: string
  output_path?: string
  message?: string
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const action = invocation.args?.action as string

  if (!action) {
    return {
      ok: false,
      output: '缺少 action 参数',
      error: 'action is required',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  log.info('openmontage 调用', { action, args: invocation.args })

  try {
    switch (action) {
      case 'generate_script': {
        const topic = invocation.args?.topic as string
        if (!topic) {
          return {
            ok: false, output: '缺少 topic 参数', error: 'topic required',
            injectToContext: false, events: [], durationMs: Date.now() - start
          }
        }
        const result = await apiPost<ScriptResult>('/api/script/generate', {
          topic,
          style: (invocation.args?.style as string) || 'cinematic',
          duration_sec: (invocation.args?.duration_sec as number) || 30,
          extra_context: ''
        })
        const scenesText = result.scenes
          .map(s => `  场景${s.index}: ${s.text} (${s.duration_sec}s)`)
          .join('\n')
        return {
          ok: true,
          output: `✅ 脚本已生成\n\n标题: ${result.title}\n风格: ${result.style}\n时长: ${result.duration_sec}秒\n脚本ID: ${result.script_id}\n\n脚本内容:\n${result.script}\n\n场景分镜:\n${scenesText}\n\n如需制作视频，请说"开始制作"；如需修改，请说修改意见。`,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      case 'produce': {
        const topic = invocation.args?.topic as string
        const script = invocation.args?.script as string
        if (!topic && !script) {
          return {
            ok: false, output: '需要 topic 或 script 参数', error: 'missing input',
            injectToContext: false, events: [], durationMs: Date.now() - start
          }
        }
        // If topic provided, generate script first, then produce
        let finalScript = script
        let title = (invocation.args?.title as string) || 'untitled'
        if (topic && !script) {
          const scriptResult = await apiPost<ScriptResult>('/api/script/generate', {
            topic,
            style: (invocation.args?.style as string) || 'cinematic',
            duration_sec: (invocation.args?.duration_sec as number) || 30,
            extra_context: ''
          })
          finalScript = scriptResult.script
          title = scriptResult.title
        }
        // Async produce
        const result = await apiPost<TaskStatus>('/api/produce/async', {
          script: finalScript,
          title,
          duration_sec: (invocation.args?.duration_sec as number) || 30,
          style: (invocation.args?.style as string) || 'cinematic',
          mode: (invocation.args?.style as string) || 'cinematic'
        })
        return {
          ok: true,
          output: `🎬 视频制作已启动！\n\n任务ID: ${result.task_id}\n状态: ${result.status}\n\n视频正在后台制作中，完成后可使用 check_status 查询。预计需要 1-3 分钟。`,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      case 'produce_from_script': {
        const scriptId = invocation.args?.script_id as string
        if (!scriptId) {
          return {
            ok: false, output: '缺少 script_id 参数', error: 'script_id required',
            injectToContext: false, events: [], durationMs: Date.now() - start
          }
        }
        const result = await apiPost<TaskStatus>('/api/produce/from-script', {
          script_id: scriptId
        })
        return {
          ok: true,
          output: `🎬 从脚本开始制作！\n\n任务ID: ${result.task_id}\n脚本ID: ${scriptId}\n状态: ${result.status}\n\n使用 check_status 查询进度。`,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      case 'list_styles': {
        const result = await apiGet<{ styles: Array<{ id: string; name: string; desc: string }> }>('/api/styles')
        const list = result.styles
          .map(s => `  • ${s.id} — ${s.name}: ${s.desc}`)
          .join('\n')
        return {
          ok: true,
          output: `🎨 可用视频风格:\n\n${list}`,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      case 'list_pipelines': {
        const result = await apiGet<{ pipelines: Array<{ name: string; description: string; category: string }> }>('/api/pipelines')
        const list = result.pipelines
          .map(p => `  • ${p.name} (${p.category}): ${p.description || '无描述'}`)
          .join('\n')
        return {
          ok: true,
          output: `📋 可用流水线:\n\n${list}`,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      case 'check_status': {
        const taskId = invocation.args?.task_id as string
        if (!taskId) {
          return {
            ok: false, output: '缺少 task_id 参数', error: 'task_id required',
            injectToContext: false, events: [], durationMs: Date.now() - start
          }
        }
        const result = await apiGet<TaskStatus>(`/api/produce/status/${taskId}`)
        const statusEmoji = result.status === 'success' ? '✅' : result.status === 'running' ? '⏳' : '❌'
        let output = `${statusEmoji} 任务 ${taskId}\n\n状态: ${result.status}\n开始: ${result.started_at}`
        if (result.output_path) output += `\n视频: ${result.output_path}`
        if (result.message) output += `\n信息: ${result.message}`
        return {
          ok: true,
          output,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      case 'list_scripts': {
        const result = await apiGet<{ scripts: Array<{ script_id: string; title: string; style: string; duration_sec: number }> }>('/api/script/list')
        const list = result.scripts.length > 0
          ? result.scripts.map(s => `  • ${s.script_id}: ${s.title} (${s.style}, ${s.duration_sec}s)`).join('\n')
          : '  暂无已保存的脚本'
        return {
          ok: true,
          output: `📝 已保存的脚本:\n\n${list}`,
          data: result,
          injectToContext: true,
          events: [],
          durationMs: Date.now() - start
        }
      }

      default:
        return {
          ok: false,
          output: `未知操作: ${action}`,
          error: `unknown action: ${action}`,
          injectToContext: false,
          events: [],
          durationMs: Date.now() - start
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('openmontage 调用失败', { action, error: msg })
    return {
      ok: false,
      output: '',
      error: msg,
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const openmontageSkill: SkillHandler = {
  manifest: OPENMONTAGE_MANIFEST,
  execute
}
