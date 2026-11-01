/**
 * R6-SKILLFORK · Bundled skills (CC skills/bundled spirit, self-authored text).
 *
 * Three high-leverage coding skills registered in-process — no disk install
 * needed, always present, and guaranteed a slot in the skill listing budget.
 * Project/user skills with the same name override bundled ones (recorded in
 * SkillOverride like any other override).
 */
import type { LoadedSkill } from '../loadSkills.js'

const SIMPLIFY_BODY = `# Simplify — post-change multi-perspective review

Use this after completing a batch of code changes, before declaring the work
done. The goal is to catch bugs, over-engineering, and convention drift while
the diff is still fresh.

## Procedure

1. Identify the change set: the files you created or modified this session
   (use git diff / git status when available, otherwise your own edit list).
2. Launch 2-3 PARALLEL read-only review agents (agent tool, subagent_type
   "Explore", one message with multiple calls), each with ONE assigned lens:
   - **Correctness**: trace the changed control flow; look for broken edge
     cases, error paths, type mismatches, unhandled null/undefined, and
     places where the change contradicts callers or tests.
   - **Simplification**: find code that can be deleted or collapsed — dead
     branches, needless abstraction, duplicated logic, config for scenarios
     that cannot happen. Simpler is better; suggest concrete removals.
   - **Consistency** (optional third): compare the change against the
     surrounding codebase's naming, error handling, and structural patterns;
     flag anything that a maintainer would find foreign.
   Give each agent the concrete file list and what changed — they cannot see
   your conversation.
3. Merge the three reports into ONE prioritized list:
   - P0 = likely bug, fix before delivery
   - P1 = clear simplification with low risk
   - P2 = style/consistency nit (mention, don't necessarily act)
4. Apply P0 fixes and obvious P1 wins now. Do NOT restructure beyond the
   review findings — this skill reduces code, it does not grow it.
5. Re-run the narrowest relevant check (typecheck / affected tests) after
   applying fixes.

## Rules

- Review agents are read-only; only YOU apply fixes in the main session.
- If the reviews disagree, prefer the correctness lens.
- If nothing significant is found, say so plainly and stop — do not invent
  work to justify the review.`

const VERIFY_BODY = `# Verify — evidence-based delivery gate

Use this before claiming any implementation task is complete. "It should
work" is not evidence; this skill produces a PASS/FAIL/PARTIAL verdict backed
by command output.

## Procedure

1. Run the cheap gate first: call verify_delivery (uses the configured
   verifyCommand, or auto-discovers package.json test/lint/build scripts).
   - PASS → record the output as evidence, go to step 3.
   - FAIL → fix the failures and re-run. Never reinterpret FAIL as "mostly
     working".
   - PARTIAL / no runnable checks → go to step 2.
2. For deeper or adversarial verification, launch an agent with
   subagent_type "verification" and give it: what was supposed to be built,
   the acceptance criteria, and the files touched. It independently re-runs
   checks and probes edge cases, then returns a VERDICT report.
3. Report the result to the user with the verdict and the evidence (exact
   commands + trimmed output). If the verdict is PARTIAL, state exactly what
   was verified and what was not — do not round up to done.

## Rules

- A change without a passing check is "written", not "delivered".
- If no verification is possible in this environment (no test runner, no
  build), say that explicitly instead of pretending.
- Keep evidence honest: paste real output, never synthesize it.`

const DEBUG_BODY = `# Debug — systematic root-cause workflow

Use this when something is broken and the cause is not already obvious.
Resist the urge to patch symptoms; follow the loop below.

## Procedure

1. **Reproduce** — find the smallest reliable trigger: exact command, input,
   and observed-vs-expected behavior. If you cannot reproduce it, gather
   evidence (logs, stack traces) before changing anything.
2. **Locate** — follow the failure signal to code: read the stack trace
   bottom-up, grep for the error message, and identify the last known-good
   point in the data/control flow. Prefer reading the involved code over
   guessing.
3. **Hypothesize** — state ONE specific cause ("X is null here because Y ran
   before Z"), then design the cheapest observation that would confirm or
   kill it (targeted log, small script, single assertion). Test hypotheses
   one at a time.
4. **Fix minimally** — change the root cause, not the symptom. The right fix
   usually touches fewer lines than the workaround. Do not refactor
   surrounding code in the same pass.
5. **Regress** — re-run the original reproduction (must now pass) plus the
   nearest existing tests (must still pass). If you added a temporary probe,
   remove it.

## Rules

- Two failed fix attempts in a row → stop, re-read the evidence, and revisit
  step 3 with a fresh hypothesis; do not keep stacking patches.
- Timebox exploration: if 15+ tool calls produce no new signal, summarize
  findings and ask the user for the missing context.
- Keep a short running note of ruled-out hypotheses so you do not re-test
  them.`

function bundled(
  name: string,
  description: string,
  whenToUse: string,
  body: string
): LoadedSkill {
  return {
    name,
    folderName: name,
    description,
    whenToUse,
    disableModelInvocation: false,
    userInvocable: true,
    allowedTools: [],
    executionContext: undefined,
    source: 'bundled',
    dir: '',
    skillMdPath: `(bundled)/${name}`,
    body,
    validationIssues: []
  }
}

/** Registered before disk roots — any user/project skill with the same name overrides. */
export const BUNDLED_SKILLS: LoadedSkill[] = [
  bundled(
    'simplify',
    'Post-change review: 2-3 parallel read-only agents check correctness, simplification opportunities, and consistency, then you apply the merged fixes.',
    'after completing a batch of code changes, before declaring done',
    SIMPLIFY_BODY
  ),
  bundled(
    'verify',
    'Evidence-based delivery gate: run verify_delivery and/or a verification sub-agent to produce a PASS/FAIL/PARTIAL verdict before claiming completion.',
    'before telling the user an implementation task is complete',
    VERIFY_BODY
  ),
  bundled(
    'debug',
    'Systematic root-cause workflow: reproduce, locate, hypothesize one cause at a time, fix minimally, regress.',
    'when something is broken and the cause is not obvious',
    DEBUG_BODY
  )
]
