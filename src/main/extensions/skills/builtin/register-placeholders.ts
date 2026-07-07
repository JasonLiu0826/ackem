// 内置 Skill 注册表
// stub.ts 非运行时 — 见 extensions/STUB_FILES.md（FIX-033）

import type { SkillRegistry } from '../../registry'
import { registerBuiltinWebSearch } from './tool/web-search/register'
import { registerBuiltinPlanDocument } from './tool/plan-document/register'
import { registerBuiltinMarkdownTable } from './tool/markdown-table/register'
import { registerBuiltinEmergencyCompanion } from './keyword/emergency-companion/register'
import { registerBuiltinSedentaryReminder } from './scheduled/sedentary-reminder/register'
import { registerBuiltinDrinkWaterReminder } from './scheduled/drink-water-reminder/register'
import { registerBuiltinLateNightReminder } from './scheduled/late-night-reminder/register'
import { registerBuiltinWeatherSense } from './tool/weather-sense/register'
import { registerBuiltinDiaryAuto } from './diary-auto/register'
import { registerBuiltinFocusModeSync } from './system_event/focus-mode-sync/register'
import { registerBuiltinOfflineThought } from './offline-thought/register'
import { registerBuiltinMoodDiaryDetail } from './engine_event/mood-diary-detail/register'
import { registerBuiltinBirthdayDetect } from './keyword/birthday-detect/register'
import { registerBuiltinLightSchedule } from './tool/light-schedule/register'
import { registerBuiltinFunProfile } from './tool/fun-profile/register'
import { registerBuiltinDreamGenerator } from './tool/dream-generator/register'
import { registerBuiltinFileOps } from './tool/file-ops/register'
import { registerBuiltinAmbientRecall } from './scheduled/ambient-recall/register'
import { registerBuiltinProceduralMemory } from './engine_event/procedural-memory/register'
import { registerBuiltinGrowthUnlock } from './engine_event/growth-unlock/register'
import { registerBuiltinMediaCoWatch } from './system_event/media-co-watch/register'
import { registerBuiltinOpenMontage } from './tool/openmontage/register'
import { registerBuiltinAgnesImage } from './tool/agnes-image/register'
import { registerBuiltinAutoImage } from './workflow/auto-image/register'

/** 注册所有已实装的内置 Skill */
export async function registerBuiltinSkills(registry: SkillRegistry): Promise<void> {
  await registerBuiltinWebSearch(registry)
  await registerBuiltinPlanDocument(registry)
  await registerBuiltinMarkdownTable(registry)
  await registerBuiltinEmergencyCompanion(registry)
  await registerBuiltinSedentaryReminder(registry)
  await registerBuiltinDrinkWaterReminder(registry)
  await registerBuiltinLateNightReminder(registry)
  await registerBuiltinWeatherSense(registry)
  await registerBuiltinDiaryAuto(registry)
  await registerBuiltinFocusModeSync(registry)
  await registerBuiltinOfflineThought(registry)
  await registerBuiltinMoodDiaryDetail(registry)
  await registerBuiltinBirthdayDetect(registry)
  await registerBuiltinLightSchedule(registry)
  await registerBuiltinFunProfile(registry)
  await registerBuiltinDreamGenerator(registry)
  await registerBuiltinFileOps(registry)
  await registerBuiltinAmbientRecall(registry)
  await registerBuiltinProceduralMemory(registry)
  await registerBuiltinGrowthUnlock(registry)
  await registerBuiltinMediaCoWatch(registry)
  await registerBuiltinOpenMontage(registry)
  await registerBuiltinAgnesImage(registry)
  await registerBuiltinAutoImage(registry)
}

export { PLACEHOLDER_SKILL_IDS } from './register-catalog'
