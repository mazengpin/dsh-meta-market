/**
 * ============================================================================
 * dialogue — the safety grammar of one step
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * The vocabularies the dialogue lane reasons in: which moves a step may make,
 * which phases a dialogue may occupy, what an abstention costs, what bounds a
 * dialogue, and why a refusal was issued. Every type that is part of the FROZEN
 * contract is imported from `../../shared/protocol.ts` and never redefined here
 * (`charter-writer` owns that file; this lane owns only its own grammar).
 *
 * WHY THE VOCABULARIES ARE CLOSED UNIONS RATHER THAN STRINGS
 *
 * Same reason the contract gives for `ThreeKind`: a rule that lives in a
 * discriminant is a rule the compiler enforces. A `phase: string` would let a
 * phase be spelled two ways and then compared as though the two were different
 * situations — which is this program's recorded way of reading the wrong row.
 *
 * WHAT THIS FILE DOES *NOT* DO: it does not widen `ChoiceLabelSet`.
 *
 * The contract's label sets are `threeKind | verificationState | mountState |
 * alignVerdict`, closed on purpose, and the dialogue's accept/counter/abstain/
 * refuse vocabulary is a FOURTH vocabulary. Reaching into the closed registry to
 * add a fifth member would be a lane extending a shared contract to fit its own
 * payload — the exact drift the contract forbids in its own words. So the moves
 * below are declared as their own closed union, under the same discipline,
 * beside the registry rather than inside it.
 */

import type {
  Confidence,
  DecisionValue,
  DialogueEnvelope,
  ThreeKind,
  Verification,
  Verdict,
} from '../../shared/protocol.ts'

// ---------------------------------------------------------------------------
// Re-exports — the frozen contract, carried through this module's surface
// ---------------------------------------------------------------------------

/**
 * Re-exported rather than redefined. A consumer of the dialogue lane should not
 * need a second import path to name the protocol it is speaking.
 */
export type { Confidence, DecisionValue, DialogueEnvelope, ThreeKind, Verification, Verdict }

/**
 * The three kinds as a RUNTIME value, so the boundary can be checked rather than
 * assumed.
 *
 * `ThreeKind` is a type, and a type is erased. The contract's rule 2 is that the
 * three kinds are never flattened and that no `done`/`complete`/`ready` exists
 * in this protocol — but the receiver's `kind` arrives off the WIRE, where
 * nothing is type-checked. A receiver that trusted its own types would accept
 * whatever a peer sent while believing the compiler had already excluded it,
 * which is the substitution this program forbids. So the same three words are
 * exported as data and tested at runtime.
 */
export const THREE_KINDS: readonly ThreeKind[] = ['exists', 'plan', 'future']

// ---------------------------------------------------------------------------
// The safety grammar of one step
// ---------------------------------------------------------------------------

/**
 * The moves one step may make. Closed, and `abstain` is a MEMBER rather than an
 * error path — that is the difference between a dialogue that can refuse and one
 * that can only fail.
 */
export const DIALOGUE_MOVES = ['propose', 'counter', 'commit', 'abstain', 'refuse'] as const

/** One move in the cycle. */
export type DialogueMove = (typeof DIALOGUE_MOVES)[number]

/**
 * Whether a value is one of the moves.
 *
 * @param value - the value to test, of unknown provenance: it may have come off
 *                the wire, where no compiler checked it.
 * @returns whether `value` is a move.
 */
export function isDialogueMove(value: unknown): value is DialogueMove {
  return typeof value === 'string' && (DIALOGUE_MOVES as readonly string[]).includes(value)
}

/**
 * Every phase a dialogue may occupy.
 *
 * The first three are LIVE and the last six are TERMINAL. The union is written
 * in that order deliberately: a reader scanning it sees the live states before
 * the outcomes, which is the order in which the phases actually occur.
 */
export type DialoguePhase =
  | 'opened'
  | 'proposed'
  | 'countered'
  | 'committed'
  | 'abstained'
  | 'refused'
  | 'expired'
  | 'budget-exhausted'
  | 'unavailable'

/**
 * The phases a dialogue never leaves.
 *
 * Exported as data because it is asserted against, not merely documented: the
 * transition guard tests membership, and the harness walks the COMPLEMENT of this
 * set to prove an abstention is reachable from every live phase. A set that
 * existed only as prose could not be walked.
 */
export const TERMINAL_PHASES: readonly DialoguePhase[] = [
  'committed',
  'abstained',
  'refused',
  'expired',
  'budget-exhausted',
  'unavailable',
]

/**
 * Whether a phase is terminal.
 *
 * @param phase - the phase to test.
 * @returns whether the phase is one a dialogue never leaves.
 */
export function isTerminal(phase: DialoguePhase): boolean {
  return TERMINAL_PHASES.includes(phase)
}

/**
 * The live phases — the complement of `TERMINAL_PHASES`, exported so the two can
 * be checked for DISJOINTNESS rather than assumed to partition the union.
 *
 * This matters more than it looks. A harness that walks "every non-terminal
 * phase" and asks whether an abstention is reachable there is testing an empty
 * domain if the two sets overlap or if the complement was computed wrongly — and
 * a check over an empty domain is this program's "a 0 on both sides is an
 * instrument failure" trap wearing a green light.
 */
export const LIVE_PHASES: readonly DialoguePhase[] = ['opened', 'proposed', 'countered']

// ---------------------------------------------------------------------------
// Abstention — the channel that must never be unavailable
// ---------------------------------------------------------------------------

/**
 * Why a peer declined to decide.
 *
 * `red-line` is distinct from `out-of-scope` on purpose: a peer refusing because
 * the offer crosses a declared red line and a peer declining because the offer is
 * not its business are different facts about the peer, and flattening them would
 * lose the only signal a counterparty can act on.
 */
export const ABSTENTION_REASONS = [
  'no-reading',
  'below-floor',
  'out-of-scope',
  'red-line',
  'budget',
] as const

/** One reason a peer declined to decide. */
export type AbstentionReason = (typeof ABSTENTION_REASONS)[number]

/**
 * WHAT AN ABSTENTION COSTS. This object is the safety construction, stated as
 * numbers rather than as a policy.
 *
 * A dialogue that cannot refuse is not safe dialogue, and the cheapest way to
 * make refusal unavailable is to make it expensive. So every cost is declared:
 *
 *   - `stepCost: 1` — abstaining costs a step, so it cannot be used to extend a
 *     dialogue indefinitely. It is affordable (one), not free (zero).
 *   - `evidenceRequired: 0` and `countersRequired: 0` — a peer may decline
 *     WITHOUT having read the offer and WITHOUT the counterparty having
 *     countered. A refusal channel that requires a reading is unavailable
 *     exactly when the reader is broken, which is when it is most needed.
 *   - `peerCooperationRequired: false` — THE LOAD-BEARING FIELD. A refusal that
 *     needs the counterparty's agreement is available exactly when the
 *     counterparty permits it, which is the one case a safety channel must not
 *     depend on.
 *   - `wallClockMs: 0` and `modelCalls: 0` — abstaining consults no model and
 *     waits on no I/O, so it cannot be blocked by a dead backend or a slow
 *     endpoint.
 */
export const ABSTENTION_COST = {
  stepCost: 1,
  evidenceRequired: 0,
  countersRequired: 0,
  peerCooperationRequired: false,
  wallClockMs: 0,
  modelCalls: 0,
} as const

// ---------------------------------------------------------------------------
// Refusal — why a step was not applied
// ---------------------------------------------------------------------------

/**
 * Every reason this lane refuses a step. Closed, so a refusal code cannot be
 * invented at a call site and cannot be compared against a value that can never
 * occur.
 *
 * A code that no code path can produce is a control that does not exist, which
 * is why `flattened-kind` is in this list AND has a runtime producer: the type
 * system already forbids a flattened `kind` on the call path, and the wire does
 * not.
 */
export const REFUSAL_CODES = [
  'malformed-envelope',
  'unknown-spec-version',
  'unknown-step-version',
  'self-addressed',
  'expired',
  'no-offer',
  'offer-hash-mismatch',
  'no-decision',
  'wrong-dialogue',
  'step-not-monotone',
  'message-id-mismatch',
  'replay',
  'budget-exhausted',
  'terminal',
  'no-evidence',
  'value-not-admissible',
  'flattened-kind',
  'confidence-absent',
] as const

/** One reason a step was not applied. */
export type RefusalCode = (typeof REFUSAL_CODES)[number]

/**
 * A refusal: the code, why it was issued, and the verdict it carries.
 *
 * The verdict is carried rather than implied because a refusal is not always a
 * negative finding. `no-decision` refuses with verdict `unknown` — "we could not
 * check" — which is a different fact from `self-addressed` refusing with
 * `refused`. Collapsing them into one negative outcome would let a missing
 * reading read as a rejection of the thing measured.
 */
export interface Refusal {
  readonly code: RefusalCode
  readonly reason: string
  readonly verdict: Verdict
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * The bounds every dialogue runs under. All four are required, and each has a
 * stated default below.
 */
export interface DialogueBounds {
  /** The maximum number of steps the dialogue may apply. */
  readonly maxSteps: number
  /** The maximum wall-clock duration, measured from the dialogue's opening. */
  readonly maxWallClockMs: number
  /** How long an envelope stays admissible. */
  readonly envelopeTtlMs: number
  /** The largest envelope this lane will parse, in bytes. */
  readonly maxEnvelopeBytes: number
}

/**
 * The defaults, and the arithmetic behind each — because an unexplained bound is
 * a bound that gets changed without anyone knowing what it protected.
 *
 *   - `maxSteps: 8` is chosen AGAINST THE CYCLE, not picked. A full
 *     propose -> counter -> commit exchange is 3 steps, so 8 allows two complete
 *     negotiation rounds plus a commit and a refusal, and no more. If a
 *     legitimate alignment needs more than 8 steps, this number is too tight and
 *     the arithmetic above is wrong.
 *   - `maxWallClockMs: 30_000` bounds the wall clock independently, because a
 *     step budget is defeated by a peer that answers each step slowly and a
 *     clock budget is defeated by a peer that answers instantly and never
 *     terminates. Neither bound alone is sufficient.
 *   - `envelopeTtlMs: 120_000` exceeds `maxWallClockMs` ON PURPOSE. An envelope
 *     must remain admissible for the whole of the dialogue that will consume it,
 *     so a TTL shorter than the dialogue budget would expire envelopes
 *     mid-cycle. This is the same defect shape as the recorded `dsh-zone-recalc`
 *     cache, whose 60 s TTL sat under an ~86 s cold walk and produced a cache
 *     guaranteed to miss. The relationship is stated as arithmetic because a TTL
 *     with no stated relationship to the work it must cover is the bug.
 *   - `maxEnvelopeBytes: 64 * 1024` is a parse bound, not a policy: it stops a
 *     peer from making the receiver allocate before it has decided anything.
 */
export const DEFAULT_BOUNDS: DialogueBounds = {
  maxSteps: 8,
  maxWallClockMs: 30_000,
  envelopeTtlMs: 120_000,
  maxEnvelopeBytes: 64 * 1024,
}

// ---------------------------------------------------------------------------
// Provenance of a decision
// ---------------------------------------------------------------------------

/**
 * Where a decision's confidence came from — the three lanes it can have come
 * from, named so that a consumer cannot read one as another.
 */
export type DecisionProvenance =
  /** A `noul` decision for which `noul` and `max(p)` COINCIDE. See `confidence.ts`. */
  | 'noul-max-p'
  /** The calibrated field or the probabilities, read from a live backend. */
  | 'model-answer-confidence'
  /** The reported field, which is a DIFFERENT quantity and must not gate. */
  | 'model-reported-confidence'
  /** No reading was taken. The confidence is a marker, not a measurement. */
  | 'not-measured'

/**
 * A decision the dialogue reached, with its confidence and that confidence's
 * provenance travelling together.
 *
 * They travel together because a decision whose confidence provenance is
 * unknown is a decision whose threshold cannot be audited — and this program has
 * already paid for reading one confidence where another was meant.
 */
export interface DialogueDecision {
  readonly value: DecisionValue
  readonly confidence: Confidence
  readonly provenance: DecisionProvenance
}

/**
 * The confidence for a decision that was never measured.
 *
 * `provenance: 'not-measured'` and `backend: 'none'` are what make this a MARKER
 * rather than a reading — the contract says a `not-measured` confidence "must
 * never gate anything on its own", and `asAnswerConfidence` returns `null` for
 * this value rather than admitting it to the gate.
 *
 * READ `value: 0` CAREFULLY. It is NOT a confidence of zero. `0` and `1` are
 * both legal probabilities, so a bare zero is indistinguishable from a maximally
 * confident "no" — which is exactly the coercion this program has recorded four
 * times. The `backend` and `provenance` fields are what make the absence
 * readable, and they are why this value can be tested for rather than guessed at.
 */
export const UNMEASURED_CONFIDENCE: Confidence = {
  value: 0,
  backend: 'none',
  model: null,
  provenance: 'not-measured',
} as const

/**
 * A fresh marker for a decision that was never measured.
 *
 * A function rather than only the constant, so a caller can obtain one without
 * holding a mutable reference to a shared object. The returned value is a new
 * object each call.
 *
 * @returns a `not-measured` confidence marker.
 */
export function unmeasuredConfidence(): Confidence {
  return { value: 0, backend: 'none', model: null, provenance: 'not-measured' }
}
