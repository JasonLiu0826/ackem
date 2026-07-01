import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendHabitLine,
  countHabitOccurrences,
  isEstablishedHabit,
  listEstablishedHabits,
  normalizeHabitKey,
  readHabitLines,
  type HabitLine
} from '../../../../../memory/proceduralHabits'
import { HABIT_KEYWORD } from './manifest'

const REL = join('memory', 'procedural-memory.jsonl')

export {
  countHabitOccurrences,
  isEstablishedHabit,
  listEstablishedHabits,
  normalizeHabitKey,
  readHabitLines,
  type HabitLine
}

export function appendHabit(dataRoot: string, text: string): string {
  return appendHabitLine(dataRoot, text)
}

export function messageLooksLikeHabit(message: string): boolean {
  return HABIT_KEYWORD.test(message)
}

export function countHabits(dataRoot: string): number {
  const file = join(dataRoot, REL)
  if (!existsSync(file)) return 0
  return readFileSync(file, 'utf-8').split('\n').filter(Boolean).length
}
