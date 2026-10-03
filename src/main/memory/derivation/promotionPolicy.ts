/** Stable plugin habit promotion thresholds (Task 11 / plan B). */

export const HABIT_MIN_OBSERVATIONS = 3



export const HABIT_MIN_CONFIDENCE = 0.75



export function canPromotePluginHabit(observationCount: number, confidence: number): boolean {

  return observationCount >= HABIT_MIN_OBSERVATIONS && confidence >= HABIT_MIN_CONFIDENCE

}


