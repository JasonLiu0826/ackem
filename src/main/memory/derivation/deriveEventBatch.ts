import type { MemoryEvent } from '../contracts.js'

import type { DerivedFactCandidate } from '../semantic/types.js'

import { deriveChatFacts } from './chatDeriver.js'

import { validateLlmFactDrafts } from './candidateValidator.js'

import { derivePluginFacts, type PluginDeriverOpts } from './pluginDeriver.js'

import { deriveWorkFacts } from './workDeriver.js'



export type DeriveEventBatchInput = {

  events: MemoryEvent[]

  llmDrafts?: unknown

  plugin?: PluginDeriverOpts

}



export type DeriveEventBatchResult = {

  candidates: DerivedFactCandidate[]

  llmRejected?: string

}



/** Nature-aware derivation for one correlated event batch (Task 11). */

export function deriveEventBatch(input: DeriveEventBatchInput): DeriveEventBatchResult {

  const events = input.events

  let validatedLlm: ReturnType<typeof validateLlmFactDrafts> = { ok: true, drafts: [] }

  if (input.llmDrafts !== undefined) {

    validatedLlm = validateLlmFactDrafts(input.llmDrafts, events)

    if (!validatedLlm.ok) {

      return { candidates: [], llmRejected: validatedLlm.reason }

    }

  }



  const chat = deriveChatFacts(events, validatedLlm.ok ? validatedLlm.drafts : [])

  const plugin = derivePluginFacts(events, input.plugin)

  const work = deriveWorkFacts(events)



  return { candidates: [...chat, ...plugin, ...work] }

}


