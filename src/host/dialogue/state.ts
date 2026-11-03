/**
 * ============================================================================
 * dialogue/state — the gate, the budgets, and the termination guarantee
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * The receiver's decision procedure for one step. `gate()` takes a dialogue
 * state and an envelope and returns the next state, an optional refusal, and a
 * record of what the step measured. Everything in this lane that changes a
 * dialogue's phase goes through `transition`, and everything that reaches
 * `transition` has already passed the envelope validation in `envelope.ts`.
 *
 * THREE PROPERTIES THIS FILE IS RESPONSIBLE FOR, EACH STRUCTURAL
 *
 *   1. TERMINATION. Every phase change goes through `transition`, which THROWS
 *      when the current phase is terminal. A terminal dialogue is therefore
 *      un-leavable in code rather than by convention, and the guarantee does not
 *      depend on any caller remembering it.
 *
 *   2. BOUNDED WORK. BOTH budgets are applied on EVERY step, and BOTH are
 *      checked BEFORE the envelope is examined. The ordering is deliberate: a
 *      peer cannot extend a dialogue by sending messages that are individually
 *      invalid, because each one still costs a step. Without the ordering, a
 *      flood of malformed envelopes is a flood the receiver absorbs.
 *
 *   3. REFUSAL THAT COSTS NOTHING. `abstain()` takes no argument that can refuse
 *      it, consults no backend and requires no evidence, so it cannot fail to be
 *      available — see `ABSTENTION_COST` in `types.ts` for the arithmetic.
 */

import type {
  DialogueEnvelope,
  Maybe,
  Measured,
  Verdict,
  VerdictRecord,
} from '../../shared/protocol.ts'
import { STEP_VERSION } from '../../shared/protocol.ts'
import type {
  AbstentionReason,
  DialogueDecision,
  DialogueMove,
  DialoguePhase,
  Refusal,
} from './types.ts'
import {
  ABSTENTION_COST,
  DEFAULT_BOUNDS,
  isTerminal,
  LIVE_PHASES,
  TERMINAL_PHASES,
  UNMEASURED_CONFIDENCE,
} from './types.ts'
import { requireEvidence, validateEnvelope } from './envelope.ts'

/** Re-exported so a consumer names the step version without a second import. */
export const DIALOGUE_STEP_VERSION = STEP_VERSION

/**
 * A confidence that was NEVER TAKEN.
 *
 * Re-exported from the grammar file so a consumer has one import path. Read the
 * note there before reading `value: 0` as a confidence of zero — it is not.
 *
 * @returns a `not-measured` confidence marker.
 */
export function unmeasuredConfidence(): DialogueEnvelope['confidence'] {
  return UNMEASURED_CONFIDENCE
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * One recorded step: which message moved the dialogue, and where to.
 *
 * `at` is recorded rather than derived, because a wall-clock budget computed
 * from "now" at different moments would give different answers for the same
 * dialogue — a budget that cannot be recomputed is a budget that cannot be
 * audited.
 */
export interface Transition {
  readonly messageId: string
  readonly from: DialoguePhase
  readonly to: DialoguePhase
  readonly move: DialogueMove
  readonly at: string
}

/** The dialogue's own state. Immutable: `gate` returns a new one. */
export interface DialogueState {
  readonly dialogueId: string
  readonly phase: DialoguePhase
  /** The highest step applied so far, counting from 0. `-1` means none applied. */
  readonly appliedStep: number
  /** Every `messageId` this dialogue has ADMITTED. The idempotence set. */
  readonly seenMessageIds: readonly string[]
  readonly transitions: readonly Transition[]
  readonly openedAt: string
  readonly bounds: {
    readonly maxSteps: number
    readonly maxWallClockMs: number
    readonly envelopeTtlMs: number
  }
}

/**
 * What one step measured, together with the rule that produced it and the
 * observation that would make it wrong.
 *
 * `falsifier` is required, following the contract's own rule that a verdict with
 * no falsifier is an opinion. `measured` is `Measured | null` rather than a bare
 * maybe-number, because a count with no denominator cannot be audited — and a
 * count that may be ABSENT is not the same as a count that is zero.
 */
export interface DialogueRecord {
  readonly verdict: Verdict
  readonly rule: string
  readonly falsifier: string
  readonly measured: Measured | null
  readonly reason: string | null
  readonly censusAt: string | null
}

/**
 * A lifecycle error: the caller asked for a transition a terminal dialogue
 * cannot make.
 *
 * `phase` is a DECLARED FIELD ASSIGNED IN THE BODY rather than a constructor
 * parameter property. That is not style: Node 24's strip-only TypeScript loader
 * rejects parameter properties outright (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`),
 * and this lane's harness runs under that loader. The type error was the loader
 * telling the truth about what it will execute.
 */
export class LifecycleError extends Error {
  readonly phase: DialoguePhase

  /**
   * @param phase - the terminal phase the caller tried to leave.
   * @param message - what was attempted.
   */
  constructor(phase: DialoguePhase, message: string) {
    super(message)
    this.name = 'LifecycleError'
    this.phase = phase
  }
}

/**
 * Open a dialogue.
 *
 * @param dialogueId - the dialogue's identity.
 * @param now - when it opened.
 * @param bounds - overridden bounds, or the defaults.
 * @returns the opened state.
 */
export function openDialogue(
  dialogueId: string,
  now: Date,
  bounds: DialogueState['bounds'] = {
    maxSteps: DEFAULT_BOUNDS.maxSteps,
    maxWallClockMs: DEFAULT_BOUNDS.maxWallClockMs,
    envelopeTtlMs: DEFAULT_BOUNDS.envelopeTtlMs,
  },
): DialogueState {
  return {
    dialogueId,
    phase: 'opened',
    appliedStep: -1,
    seenMessageIds: [],
    transitions: [],
    openedAt: now.toISOString(),
    bounds,
  }
}

/**
 * Apply one phase change — the ONLY writer of `phase`.
 *
 * THE TERMINATION GUARANTEE IS THIS FUNCTION'S THROW. A terminal phase has no
 * outgoing transition, so a dialogue that has ended cannot be extended by any
 * caller, however the caller was written or configured.
 *
 * @param state - the current state.
 * @param to - the phase to move to.
 * @param move - the move that caused the change.
 * @param messageId - the message that caused it.
 * @param now - when it happened.
 * @returns the next state.
 * @throws LifecycleError when the current phase is terminal.
 */
export function transition(
  state: DialogueState,
  to: DialoguePhase,
  move: DialogueMove,
  messageId: string,
  now: Date,
): DialogueState {
  if (isTerminal(state.phase)) {
    throw new LifecycleError(
      state.phase,
      `the dialogue is in the terminal phase ${state.phase} and cannot move to ${to}: a terminated dialogue does not resume`,
    )
  }
  const step: Transition = {
    messageId,
    from: state.phase,
    to,
    move,
    at: now.toISOString(),
  }
  return { ...state, phase: to, transitions: [...state.transitions, step] }
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * How many steps have been spent.
 *
 * `appliedStep` counts from 0 and means "the highest step applied", so a
 * dialogue that has applied nothing is `-1` and has spent 0. The +1 is the
 * conversion, and writing it once here rather than at every call site is what
 * stops an off-by-one becoming a budget that is one step too generous.
 *
 * @param state - the state to measure.
 * @returns the number of steps applied.
 */
export function stepBudgetSpent(state: DialogueState): number {
  return state.appliedStep + 1
}

/**
 * How much wall-clock time the dialogue has consumed.
 *
 * @param state - the state to measure.
 * @param now - the moment to measure at.
 * @returns elapsed milliseconds; never negative.
 */
export function elapsedMs(state: DialogueState, now: Date): number {
  const opened = new Date(state.openedAt).getTime()
  return Math.max(0, now.getTime() - opened)
}

/**
 * Whether the wall-clock budget is exhausted.
 *
 * @param state - the state to test.
 * @param now - the moment to test at.
 * @returns whether the dialogue has run out of time.
 */
export function wallClockSpent(state: DialogueState, now: Date): boolean {
  return elapsedMs(state, now) > state.bounds.maxWallClockMs
}

/**
 * Apply both budgets, returning the state a terminal outcome would leave.
 *
 * BOTH are applied, and the reason is that neither alone is sufficient: a step
 * budget is defeated by a peer that answers each step slowly, and a wall-clock
 * budget by a peer that answers instantly and never terminates. Hitting EITHER
 * bound ends the dialogue WITHOUT committing.
 *
 * @param state - the current state.
 * @param now - the moment to measure at.
 * @returns the next state and which bound (if any) was hit.
 */
export function applyBudgets(
  state: DialogueState,
  now: Date,
): { readonly state: DialogueState; readonly bound: 'steps' | 'wall-clock' | null } {
  if (isTerminal(state.phase)) return { state, bound: null }
  if (wallClockSpent(state, now)) {
    return { state: transition(state, 'budget-exhausted', 'refuse', 'budget', now), bound: 'wall-clock' }
  }
  if (stepBudgetSpent(state) >= state.bounds.maxSteps) {
    return { state: transition(state, 'budget-exhausted', 'refuse', 'budget', now), bound: 'steps' }
  }
  return { state, bound: null }
}

// ---------------------------------------------------------------------------
// Abstention
// ---------------------------------------------------------------------------

/**
 * Abstain. THE REFUSAL CHANNEL THAT CANNOT BE UNAVAILABLE.
 *
 * This function takes no `Refusal`-capable argument, reads no envelope, consults
 * no backend and requires no evidence. Its cost is `ABSTENTION_COST`: one step,
 * zero evidence, zero counters, no peer cooperation, no model call. It is
 * therefore reachable from EVERY live phase of EVERY dialogue, including one
 * whose offer is malformed, whose counterparty is hostile and whose backend is
 * dead — which is precisely when a refusal channel is needed.
 *
 * @param state - the dialogue to abstain from.
 * @param reason - which of the closed abstention reasons applies.
 * @param now - when the abstention happened.
 * @returns the abstained state.
 */
export function abstain(state: DialogueState, reason: AbstentionReason, now: Date): DialogueState {
  return transition(state, 'abstained', 'abstain', `abstain:${reason}`, now)
}

/**
 * The verdict an abstention carries.
 *
 * `abstained` is its own verdict and NOT a flavour of `refused` or `fail` — the
 * contract carries it as a distinct member, because "I decline to judge" and "I
 * judged it bad" are different findings about the world and demand different
 * responses from a counterparty.
 *
 * @param reason - the abstention reason, recorded in the reason field.
 * @returns the record.
 */
export function abstentionVerdict(reason: AbstentionReason): DialogueRecord {
  return {
    verdict: 'abstained',
    rule: 'a peer may decline to decide at any step, at a cost of 1 step and nothing else',
    falsifier: `a peer abstains and the dialogue records a verdict other than abstained, or the abstention costs more than ${ABSTENTION_COST.stepCost} step`,
    measured: { count: ABSTENTION_COST.stepCost, of: ABSTENTION_COST.stepCost },
    reason,
    censusAt: null,
  }
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

/**
 * The verdict each terminal phase maps to.
 *
 * `unavailable` maps to `unknown` and NOT to `fail`. The absence of an
 * instrument is a different fact from a negative judgement, and the contract
 * carries `unknown` for exactly this reason — reporting the absence of a reading
 * as a negative finding is this program's most-repeated defect.
 */
export const TERMINAL_VERDICTS: Record<string, Verdict> = {
  committed: 'pass',
  abstained: 'abstained',
  refused: 'refused',
  expired: 'unknown',
  'budget-exhausted': 'unknown',
  unavailable: 'unknown',
}

/**
 * The verdict a terminal phase carries.
 *
 * @param phase - the phase to map.
 * @returns the verdict, defaulting to `unknown` for an unmapped phase — never to
 *          `fail`, so an unmapped phase cannot be read as a rejection.
 */
export function verdictFor(phase: DialoguePhase): Verdict {
  return TERMINAL_VERDICTS[phase] ?? 'unknown'
}

/**
 * Adapt a lane record to the contract's `VerdictRecord`.
 *
 * THE ADAPTER EXISTS BECAUSE OF A CONTRACT CONFLICT, and this is the honest
 * handling of it rather than a silent cast. `protocol.ts` types
 * `VerdictRecord.measured` as `Maybe<number>` — a bare number with no
 * denominator — while this build's standing ruling is that a count which may be
 * absent is NEVER a bare maybe-number, because `Maybe<number>` cannot carry the
 * population the count was taken over.
 *
 * The frozen contract wins at the boundary, because it is frozen and this lane
 * does not own it. The denominator is therefore preserved in `rule`, appended as
 * `[measured N of M]`, so the audit trail survives the narrowing instead of
 * being lost to it. Reported to the Lead: the fix belongs in `protocol.ts`.
 *
 * @param record - the lane's own record.
 * @returns the contract-shaped record.
 */
export function toVerdictRecord(record: DialogueRecord): VerdictRecord {
  const measured: Maybe<number> =
    record.measured === null
      ? { value: null, reason: record.reason ?? 'no reading was taken for this step' }
      : { value: record.measured.count, reason: null }
  const denominatorNote =
    record.measured === null ? '' : ` [measured ${record.measured.count} of ${record.measured.of}]`
  return {
    verdict: record.verdict,
    rule: `${record.rule}${denominatorNote}`,
    falsifier: record.falsifier,
    measured,
    censusAt: record.censusAt,
    evidence: [],
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** Everything `gate` needs to decide one step. */
export interface GateInput {
  readonly state: DialogueState
  readonly envelope: DialogueEnvelope
  readonly now: Date
  readonly decision: DialogueDecision
  /** The step this instance is willing to accept, for monotonicity. Defaults to `envelope.step`. */
  readonly expectedStep?: number
}

/** The outcome of one gate call. */
export interface GateOutcome {
  readonly state: DialogueState
  readonly refusal: Refusal | null
  readonly record: DialogueRecord
  /** Whether the step was APPLIED. A refused step is not applied. */
  readonly applied: boolean
}

/**
 * Build a refusal outcome without moving the dialogue.
 *
 * @param state - the state to return unchanged.
 * @param now - the moment of the refusal.
 * @param refusal - the refusal itself.
 * @param rule - the rule that produced it.
 * @param falsifier - the observation that would make it wrong.
 * @param measured - what this step measured, with its denominator, or null.
 * @returns the outcome.
 */
function refused(
  state: DialogueState,
  now: Date,
  refusal: Refusal,
  rule: string,
  falsifier: string,
  measured: Measured | null,
): GateOutcome {
  return {
    state,
    refusal,
    applied: false,
    record: {
      verdict: refusal.verdict,
      rule,
      falsifier,
      measured,
      reason: refusal.reason,
      censusAt: now.toISOString(),
    },
  }
}

/**
 * The move an envelope's decision expresses.
 *
 * @param envelope - the envelope to read.
 * @returns the move.
 */
function moveOf(envelope: DialogueEnvelope): DialogueMove {
  const decision = envelope.decision
  if (decision === null) return 'refuse'
  if (decision.decision === 'noul') return decision.value === 1 ? 'propose' : 'refuse'
  if (decision.decision === 'choice') {
    if (decision.value === 'abstain') return 'abstain'
    if (decision.value === 'commit') return 'commit'
    if (decision.value === 'counter') return 'counter'
    return 'propose'
  }
  return 'counter'
}

/**
 * The phase a move leads to.
 *
 * @param move - the move.
 * @returns the phase.
 */
function phaseForMove(move: DialogueMove): DialoguePhase {
  if (move === 'commit') return 'committed'
  if (move === 'abstain') return 'abstained'
  if (move === 'refuse') return 'refused'
  if (move === 'counter') return 'countered'
  return 'proposed'
}

/**
 * GATE ONE STEP — the receiver's whole decision procedure, in a fixed order.
 *
 * THE ORDER IS THE ALGORITHM:
 *
 *   1. BUDGETS FIRST. Both, applied before the envelope is examined, so a peer
 *      cannot extend a dialogue by sending individually-invalid messages: each
 *      one still costs a step.
 *   2. TERMINAL CHECK. A terminated dialogue does not resume.
 *   3. REPLAY, keyed on `messageId`, and checked BEFORE the step counter
 *      advances — otherwise a peer could exhaust a receiver's step budget by
 *      resending one message.
 *   4. DIALOGUE IDENTITY. An envelope from another dialogue is refused rather
 *      than merged.
 *   5. MONOTONICITY. An out-of-order step is refused rather than applied.
 *   6. VALIDITY. The fixed order in `envelope.ts`.
 *   7. EVIDENCE SUFFICIENCY, checked after well-formedness so the two codes stay
 *      distinguishable.
 *   8. THE DECISION'S PRESENCE, and its confidence.
 *   9. ABSTENTION, then admission.
 *
 * @param input - the step to gate.
 * @returns the next state, the refusal if any, and what was measured.
 */
export function gate(input: GateInput): GateOutcome {
  const { state, envelope, now, decision } = input

  // (1) Both budgets, before anything the peer sent is read.
  const budgeted = applyBudgets(state, now)
  if (budgeted.bound !== null) {
    return refused(
      budgeted.state,
      now,
      {
        code: 'budget-exhausted',
        reason: `the ${budgeted.bound} budget ended the dialogue before this step could be applied`,
        verdict: 'unknown',
      },
      `a dialogue ends when it spends ${state.bounds.maxSteps} steps or ${state.bounds.maxWallClockMs} ms, whichever comes first`,
      'a dialogue that spends either budget and continues anyway',
      { count: stepBudgetSpent(state), of: state.bounds.maxSteps },
    )
  }

  // (2) A terminal dialogue does not resume.
  if (isTerminal(state.phase)) {
    return refused(
      state,
      now,
      {
        code: 'terminal',
        reason: `the dialogue is already in the terminal phase ${state.phase}`,
        verdict: verdictFor(state.phase),
      },
      'a terminal phase has no outgoing transition',
      'a step applied to a dialogue already in a terminal phase',
      { count: stepBudgetSpent(state), of: state.bounds.maxSteps },
    )
  }

  // (3) Replay — before the step counter advances.
  if (state.seenMessageIds.includes(envelope.messageId)) {
    return refused(
      state,
      now,
      {
        code: 'replay',
        reason: `${envelope.messageId} has already been admitted to this dialogue; the same envelope delivered twice must not apply twice`,
        verdict: 'refused',
      },
      'the idempotence key is messageId, and it is recorded when a step is ADMITTED',
      'the same messageId appearing twice in seenMessageIds, or appliedStep advancing for a repeat',
      { count: state.seenMessageIds.filter((id) => id === envelope.messageId).length, of: state.seenMessageIds.length },
    )
  }

  // (4) Which dialogue is this?
  if (envelope.dialogueId !== state.dialogueId) {
    return refused(
      state,
      now,
      {
        code: 'wrong-dialogue',
        reason: `the envelope belongs to dialogue ${envelope.dialogueId}, not ${state.dialogueId}`,
        verdict: 'refused',
      },
      'an envelope is applied only to the dialogue it names',
      'an envelope applied to a dialogue it does not name',
      { count: 1, of: 1 },
    )
  }

  // (5) Monotonicity.
  const expected = input.expectedStep ?? envelope.step
  if (envelope.step !== expected) {
    return refused(
      state,
      now,
      {
        code: 'step-not-monotone',
        reason: `this dialogue expected step ${expected} and received ${envelope.step}; an out-of-order step is refused rather than applied`,
        verdict: 'refused',
      },
      'steps are applied in order, each advancing by one',
      'a step applied whose index is not the expected one',
      { count: envelope.step, of: expected },
    )
  }

  // (6) Validity, in the fixed order documented in envelope.ts.
  const valid = validateEnvelope(envelope, now)
  if (!valid.ok) {
    // The `measured` here is `{ count: 0, of: 0 }` ON PURPOSE, and it is the one
    // place in this file where a zero numerator and a zero denominator are not an
    // instrument failure: the population is "evidence pointers the evidence
    // predicate examined", and the refusal fires precisely BECAUSE that
    // population is empty. THE DENIAL IS THE READING. Recorded explicitly so a
    // reader does not read the two zeroes as a harness that never ran — and note
    // that the guard is not the digits but whether the value is reported as a
    // PASS, which it is not.
    if (valid.refusal.code === 'no-offer') {
      return refused(
        budgeted.state,
        now,
        valid.refusal,
        'an envelope is admissible only when it carries an offer',
        'an envelope with no offer that was admitted',
        { count: 0, of: 0 },
      )
    }
    return refused(
      budgeted.state,
      now,
      valid.refusal,
      'an envelope passes the nine-step validation order in envelope.ts',
      `an envelope refused with ${valid.refusal.code} that a differently written instrument admits`,
      { count: envelope.step + 1, of: envelope.maxSteps },
    )
  }

  // (7) Evidence sufficiency — well-formedness was checked above, so this is a
  //     distinguishable refusal rather than a second spelling of malformed.
  const offer = envelope.offer
  if (offer === null) {
    return refused(
      budgeted.state,
      now,
      { code: 'no-offer', reason: 'the envelope carries no offer', verdict: 'refused' },
      'an envelope is admissible only when it carries an offer',
      'an envelope with no offer that was admitted',
      { count: 0, of: 0 },
    )
  }
  const evidenceRefusal = requireEvidence(offer.evidence)
  if (evidenceRefusal !== null) {
    return refused(
      budgeted.state,
      now,
      evidenceRefusal,
      'an offer is acted on only when it carries evidence',
      'an evidence-free offer that was committed',
      { count: 0, of: offer.evidence.length },
    )
  }

  // (8) The decision's presence.
  if (envelope.decision === null) {
    return refused(
      budgeted.state,
      now,
      {
        code: 'no-decision',
        reason: 'the envelope carries no decision, which is a missing reading rather than a refusal',
        verdict: 'unknown',
      },
      'a step is applied only when it states a decision',
      'a decision-free envelope that was applied',
      { count: 0, of: 1 },
    )
  }

  // (9) Abstention is terminal and is admitted WITHOUT a reading.
  const move = moveOf(envelope)
  if (move === 'abstain') {
    const next = abstain(budgeted.state, 'no-reading', now)
    const record = abstentionVerdict('no-reading')
    return {
      state: { ...next, appliedStep: budgeted.state.appliedStep + 1, seenMessageIds: [...budgeted.state.seenMessageIds, envelope.messageId] },
      refusal: null,
      applied: true,
      record: { ...record, censusAt: now.toISOString() },
    }
  }

  // (9b) A commit requires a gateable confidence. An unmeasured one may not gate.
  if (move === 'commit') {
    const confidence = decision.confidence
    const gateable =
      confidence.provenance === 'computed' && confidence.backend !== 'none' && Number.isFinite(confidence.value)
    if (!gateable) {
      return refused(
        budgeted.state,
        now,
        {
          code: 'confidence-absent',
          reason: `a commit requires a CALIBRATED confidence; this one has provenance ${confidence.provenance} and backend ${confidence.backend}`,
          verdict: 'unknown',
        },
        'a commit is applied only against a computed confidence from a named backend',
        'a commit applied with a not-measured or peer-reported confidence',
        { count: 0, of: 1 },
      )
    }
  }

  // (9c) Admit.
  const next = transition(budgeted.state, phaseForMove(move), move, envelope.messageId, now)
  return {
    state: {
      ...next,
      appliedStep: budgeted.state.appliedStep + 1,
      seenMessageIds: [...budgeted.state.seenMessageIds, envelope.messageId],
    },
    refusal: null,
    applied: true,
    record: {
      verdict: verdictFor(phaseForMove(move)),
      rule: `the step was admitted after passing all nine checks, moving ${budgeted.state.phase} to ${phaseForMove(move)}`,
      falsifier: `a step admitted while any of the nine checks would have refused it`,
      measured: { count: budgeted.state.appliedStep + 2, of: state.bounds.maxSteps },
      reason: null,
      censusAt: now.toISOString(),
    },
  }
}

/**
 * The final record for a dialogue that has ended.
 *
 * @param state - the terminal state.
 * @param now - when the record is taken.
 * @returns the record.
 */
export function finalRecord(state: DialogueState, now: Date): DialogueRecord {
  const phase = state.phase
  const verdict = verdictFor(phase)
  return {
    verdict,
    rule: `the dialogue ended in ${phase}, which maps to ${verdict}`,
    falsifier: `a dialogue ending in ${phase} recording a verdict other than ${verdict}`,
    measured: { count: stepBudgetSpent(state), of: state.bounds.maxSteps },
    reason: isTerminal(phase) ? null : `the dialogue is still live in ${phase}`,
    censusAt: now.toISOString(),
  }
}

/**
 * Re-exported so a consumer — including this lane's own harness — reaches the
 * bounds and the phase sets through the module that USES them, rather than
 * having to import the grammar file separately to assert against them.
 */
export { DEFAULT_BOUNDS, isTerminal, LIVE_PHASES, TERMINAL_PHASES }
