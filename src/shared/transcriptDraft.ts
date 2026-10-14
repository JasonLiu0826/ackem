/**
 * Composer / theater draft machine for streaming ASR.
 * Partial never looks like a committed send. User edits win the session.
 */

export type TranscriptDraftState =
  | 'idle'
  | 'listening'
  | 'partial'
  | 'user-edited'
  | 'final'
  | 'cancelled'

export type TranscriptDraft = {
  state: TranscriptDraftState
  sessionId: number
  lastSequence: number
  /** Already-finalized text from earlier utterances in this mic session. */
  committed: string
  /** Last full display text written by ASR (committed + live). */
  asrText: string
  /** What the input box currently holds. */
  draft: string
  /** Text the user just wiped. Late leftover events of that phrase are dropped. */
  clearedText: string
}

export const emptyTranscriptDraft = (): TranscriptDraft => ({
  state: 'idle',
  sessionId: 0,
  lastSequence: -1,
  committed: '',
  asrText: '',
  draft: '',
  clearedText: ''
})

/** Seed from whatever is already in the box when the mic opens. */
export function startTranscriptDraft(existingDraft: string): TranscriptDraft {
  const committed = existingDraft.trim()
  return {
    state: 'listening',
    sessionId: 0,
    lastSequence: -1,
    committed,
    asrText: committed,
    draft: existingDraft,
    clearedText: ''
  }
}

export function isStaleTranscript(
  draft: TranscriptDraft,
  sessionId: number,
  sequence: number
): boolean {
  if (sessionId < draft.sessionId) return true
  if (sessionId === draft.sessionId && sequence <= draft.lastSequence) return true
  return false
}

function joinUtterance(committed: string, live: string): string {
  const a = committed.trim()
  const b = live.trim()
  if (!a) return b
  if (!b) return a
  if (/[。！？…]$/.test(a)) return a + b
  return `${a} ${b}`
}

function withSentenceEnd(text: string): string {
  const t = text.trim()
  if (!t || /[。！？…]$/.test(t)) return t
  return `${t}。`
}

/** Late echo of the wiped phrase, or a shorter prefix of it. Longer text is new speech. */
export function isLeftoverOfCleared(cleared: string, incoming: string): boolean {
  const a = cleared.trim()
  const b = incoming.trim()
  if (!a || !b) return false
  return b === a || a.startsWith(b)
}

function clearBox(draft: TranscriptDraft, nextDraft: string): TranscriptDraft {
  return {
    state: 'listening',
    sessionId: draft.sessionId,
    lastSequence: draft.lastSequence,
    committed: '',
    asrText: '',
    draft: nextDraft,
    clearedText: (draft.asrText || draft.draft || draft.clearedText).trim()
  }
}

/** Remaining text is a new prefix. Next utterance appends after it. */
function trimToContinue(draft: TranscriptDraft, nextDraft: string): TranscriptDraft {
  return {
    state: 'listening',
    sessionId: draft.sessionId,
    lastSequence: draft.lastSequence,
    committed: nextDraft.trim(),
    asrText: nextDraft,
    draft: nextDraft,
    clearedText: (draft.asrText || draft.draft || draft.clearedText).trim()
  }
}

function isShortened(draft: TranscriptDraft, nextDraft: string): boolean {
  return nextDraft.length < Math.max(draft.draft.length, draft.asrText.length)
}

/** Keyboard / paste / delete that is not an echo of the last ASR write. */
export function markUserEdited(draft: TranscriptDraft, nextDraft: string): TranscriptDraft {
  if (draft.state === 'idle' || draft.state === 'cancelled') {
    if (!nextDraft.trim()) return clearBox(draft, nextDraft)
    return { ...draft, draft: nextDraft }
  }
  if (nextDraft === draft.asrText) return { ...draft, draft: nextDraft }
  /** Cleared box = start over. Do not lock out the next utterance. */
  if (!nextDraft.trim()) return clearBox(draft, nextDraft)
  /** Partial delete = keep the remainder, let new speech continue after it. */
  if (isShortened(draft, nextDraft)) return trimToContinue(draft, nextDraft)
  return { ...draft, state: 'user-edited', draft: nextDraft, clearedText: '' }
}

export function applyPartial(
  draft: TranscriptDraft,
  sessionId: number,
  sequence: number,
  text: string
): TranscriptDraft {
  if (isStaleTranscript(draft, sessionId, sequence)) return draft
  if (draft.state === 'user-edited' && draft.draft.trim()) return draft
  if (
    draft.clearedText &&
    sessionId <= draft.sessionId &&
    isLeftoverOfCleared(draft.clearedText, text)
  ) {
    return draft
  }
  const display = joinUtterance(draft.committed, text)
  return {
    state: 'partial',
    sessionId,
    lastSequence: sequence,
    committed: draft.committed,
    asrText: display,
    draft: display,
    clearedText: ''
  }
}

export function applyFinal(
  draft: TranscriptDraft,
  sessionId: number,
  sequence: number,
  text: string
): TranscriptDraft {
  if (isStaleTranscript(draft, sessionId, sequence)) return draft
  if (draft.state === 'user-edited' && draft.draft.trim()) {
    return { ...draft, lastSequence: sequence }
  }
  if (
    draft.clearedText &&
    sessionId <= draft.sessionId &&
    isLeftoverOfCleared(draft.clearedText, text)
  ) {
    return draft
  }
  const committed = joinUtterance(draft.committed, withSentenceEnd(text))
  return {
    state: 'final',
    sessionId,
    lastSequence: sequence,
    committed,
    asrText: committed,
    draft: committed,
    clearedText: ''
  }
}
