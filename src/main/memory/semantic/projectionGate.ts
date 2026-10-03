/** Test/production barrier: hold embedding projection until release (same-fact overlap tests). */
let gateRelease: (() => void) | null = null
let gatePromise: Promise<void> | null = null

export function armProjectionGateForTests(): { release: () => void } {
  gatePromise = new Promise<void>((resolve) => {
    gateRelease = resolve
  })
  return {
    release: () => {
      gateRelease?.()
      gateRelease = null
      gatePromise = null
    }
  }
}

export async function awaitProjectionGateIfArmed(): Promise<void> {
  if (gatePromise) await gatePromise
}

export function clearProjectionGateForTests(): void {
  gateRelease?.()
  gateRelease = null
  gatePromise = null
}
