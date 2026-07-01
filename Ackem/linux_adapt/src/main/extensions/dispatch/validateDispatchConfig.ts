import type { DispatchConfig, DispatchMode } from '../protocols'

const MODES: DispatchMode[] = ['autonomous', 'always_on', 'manual', 'dispatched']

export function validateDispatchConfig(config: DispatchConfig): string[] {
  const errors: string[] = []

  if (!MODES.includes(config.mode)) {
    errors.push('dispatch.mode 必须为 autonomous / always_on / manual / dispatched 之一')
  }

  if (config.mode === 'autonomous' && !config.time?.schedule) {
    errors.push('dispatch.mode=autonomous 时，time.schedule 必填')
  }

  if (config.mode === 'dispatched') {
    if (!config.subtype) {
      errors.push('dispatch.mode=dispatched 时，subtype 必填')
    }
    if (!config.habits?.length) {
      errors.push('dispatch.mode=dispatched 时，habits 至少填 1 条')
    }
    if (!config.scenarios?.length) {
      errors.push('dispatch.mode=dispatched 时，scenarios 至少填 1 条')
    }
    if (!config.summary?.trim()) {
      errors.push('dispatch.mode=dispatched 时，summary 必填')
    }
    if (!config.keywords?.length) {
      errors.push('dispatch.mode=dispatched 时，keywords 至少填 1 个')
    }
  }

  if (config.time?.active_hours && !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(config.time.active_hours)) {
    errors.push('time.active_hours 格式应为 HH:MM-HH:MM')
  }

  return errors
}
