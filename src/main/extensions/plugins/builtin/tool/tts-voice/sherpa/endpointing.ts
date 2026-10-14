/** VAD reports speech/silence. This clock owns `final`. */

export type EndpointingPolicy = {
  minSpeechDurationMs: number
  minSilenceDurationMs: number
  maxUtteranceDurationMs: number
}

export const DEFAULT_ENDPOINTING: EndpointingPolicy = {
  minSpeechDurationMs: 200,
  minSilenceDurationMs: 700,
  maxUtteranceDurationMs: 15000
}

export type EndpointingEvent = 'none' | 'final'

export class EndpointingClock {
  private speechMs = 0
  private silenceMs = 0
  private utteranceMs = 0
  private inUtterance = false

  constructor(private readonly policy: EndpointingPolicy) {}

  reset(): void {
    this.speechMs = 0
    this.silenceMs = 0
    this.utteranceMs = 0
    this.inUtterance = false
  }

  get active(): boolean {
    return this.inUtterance
  }

  push(isSpeech: boolean, chunkMs: number): EndpointingEvent {
    if (chunkMs <= 0) return 'none'

    if (isSpeech) {
      this.speechMs += chunkMs
      this.silenceMs = 0
      if (!this.inUtterance && this.speechMs >= this.policy.minSpeechDurationMs) {
        this.inUtterance = true
        this.utteranceMs = this.speechMs
      } else if (this.inUtterance) {
        this.utteranceMs += chunkMs
      }
      if (this.inUtterance && this.utteranceMs >= this.policy.maxUtteranceDurationMs) {
        this.reset()
        return 'final'
      }
      return 'none'
    }

    if (!this.inUtterance) {
      this.speechMs = 0
      this.silenceMs = 0
      return 'none'
    }

    this.silenceMs += chunkMs
    this.utteranceMs += chunkMs
    if (this.silenceMs >= this.policy.minSilenceDurationMs) {
      this.reset()
      return 'final'
    }
    if (this.utteranceMs >= this.policy.maxUtteranceDurationMs) {
      this.reset()
      return 'final'
    }
    return 'none'
  }
}
