/**
 * ============================================================================
 * dialogue — the lane's public surface
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * The two or more harness instances this system joins must be able to initiate
 * dialogues SAFELY, and this lane owns the security properties of that exchange:
 * the versioned envelope, the abstention channel, the termination bounds, and
 * idempotence. This module is what the host half imports.
 *
 * EXPORTS ARE LISTED EXPLICITLY RATHER THAN `export *`-ED, and that is not
 * tidiness. `types.ts` and `state.ts` BOTH export `LIVE_PHASES` and
 * `TERMINAL_PHASES` — deliberately, so a consumer has one import path from
 * either — and a wildcard re-export of both would make those two names ambiguous
 * and fail the build. Making the surface explicit means the collision is visible
 * here, once, rather than surfacing as a resolution error in a consumer.
 *
 * WHAT THIS LANE DOES NOT CLAIM, stated because a reader who arrives here will
 * otherwise infer it. This module is `plan` kind. Nothing in it has been observed
 * running inside a mounted host, no dialogue has yet occurred between two mounted
 * harness instances, and the live System-1 path has not been exercised against a
 * running model — see `DIALOGUE_SCOPE.doesNotClaim`.
 */

export type { AbstentionReason, DialogueMove, DialoguePhase, Refusal, RefusalCode } from './types.ts'
export {
  ABSTENTION_COST,
  ABSTENTION_REASONS,
  DEFAULT_BOUNDS,
  DIALOGUE_MOVES,
  isDialogueMove,
  isTerminal,
  LIVE_PHASES,
  REFUSAL_CODES,
  TERMINAL_PHASES,
  THREE_KINDS,
  unmeasuredConfidence,
  UNMEASURED_CONFIDENCE,
} from './types.ts'
export type { DialogueBounds, DialogueDecision, DecisionProvenance, Refusal as DialogueRefusal } from './types.ts'

export type { AnswerConfidence, ConfidenceReading, ConfidenceRefusal, ReportedConfidence } from './confidence.ts'
export {
  asAnswerConfidence,
  asReportedConfidenceForControl,
  clearsGate,
  hasReading,
  maxProbability,
  readConfidence,
  reportedQuantityFor,
} from './confidence.ts'

export type {
  BackendReading,
  HttpResponse,
  ModelDecision,
  ParsedBody,
  Transport,
  UnavailableReason,
} from './laya.ts'
export {
  ALTERNATE_LAYA_ENDPOINT,
  DECISION_ROUTE,
  DEFAULT_LAYA_ENDPOINT,
  decideByLaya,
  globalTransport,
  laneOf,
  parseDecisionBody,
  readModelName,
} from './laya.ts'

export type { SealInput, ValidationResult } from './envelope.ts'
export {
  canonicalize,
  checkDecisionValue,
  checkEvidence,
  extractScaleMax,
  hashMetaPackage,
  refuse,
  requireEvidence,
  seal,
  sha256,
  validateEnvelope,
} from './envelope.ts'

export type { DialogueRecord, DialogueState, GateInput, GateOutcome, Transition } from './state.ts'
export {
  abstain,
  abstentionVerdict,
  applyBudgets,
  DIALOGUE_STEP_VERSION,
  elapsedMs,
  finalRecord,
  gate,
  LifecycleError,
  openDialogue,
  stepBudgetSpent,
  TERMINAL_VERDICTS,
  toVerdictRecord,
  transition,
  verdictFor,
  wallClockSpent,
} from './state.ts'

/** The lane's name, used by the host half when it registers or reports. */
export const DIALOGUE_LANE = 'dialogue'

/**
 * What this lane delivers, and what it explicitly does not claim.
 *
 * The `doesNotClaim` list is part of the surface rather than a comment, because
 * a consumer that reads only the exports will otherwise take the presence of a
 * function named `decideByLaya` as evidence that a model answered. It has not.
 */
export const DIALOGUE_SCOPE = {
  kind: 'plan',
  delivers: [
    'a versioned DialogueEnvelope with a refusal path for an unknown version',
    'a propose -> counter -> commit cycle with abstention as a first-class move',
    'termination bounds: maxSteps and maxWallClockMs, both applied on every step',
    'idempotence keyed on messageId, checked before the step counter advances',
    'the Laya-shaped decision interface, expressed only as noul | choice | score',
    'a degradation path that returns unavailable rather than a synthesised decision',
  ],
  doesNotClaim: [
    'that any dialogue has occurred between two mounted harness instances',
    'that the live System-1 path has been exercised against a running model',
    'that this module has been observed running inside a mounted host',
    'that a threshold calibrated on one backend is valid on the other',
  ],
} as const
