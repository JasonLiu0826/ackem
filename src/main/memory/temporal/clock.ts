export interface Clock {
  now(): Date
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

export class FakeClock implements Clock {
  constructor(private instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime())
  }

  set(instant: Date): void {
    this.instant = new Date(instant.getTime())
  }
}

let activeClock: Clock = new SystemClock()

export function getClock(): Clock {
  return activeClock
}

export function setClockForTests(clock: Clock): void {
  activeClock = clock
}

export function resetClockForTests(): void {
  activeClock = new SystemClock()
}
