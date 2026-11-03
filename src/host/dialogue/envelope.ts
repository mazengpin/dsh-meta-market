/**
 * ============================================================================
 * dialogue/envelope — validation, canonical hashing, and sealing
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * The receiver's boundary. Everything arriving from a peer passes through
 * `validateEnvelope`, which refuses in a FIXED ORDER, and everything this
 * instance sends passes through `seal`, which attaches the hash the receiver
 * will recompute.
 *
 * WHY THE ORDER IS FIXED, AND WHY IT IS THE ALGORITHM
 *
 * A receiver that validates cheap structural facts before establishing that the
 * message is even addressed to it will do work on behalf of a peer that never
 * earned it. So the order runs cheapest-and-most-disqualifying first:
 *
 *   1. `specVersion`   — an unknown version is not best-effort parsed. A
 *                        receiver that guesses at a future version's meaning
 *                        turns an unknown field into an unintended behaviour.
 *   2. `stepVersion`   — separate, because an already-open dialogue cares about
 *                        step ORDER rather than about envelope shape.
 *   3. shape           — required fields present and of the right kind.
 *   4. self-addressed  — a monologue is not a dialogue. The premise of this
 *                        system is TWO OR MORE instances.
 *   5. expiry          — past `expiresAt` the envelope is refused. An envelope
 *                        with no live expiry is replayable forever.
 *   6. offer present   — nothing to accept, counter or refuse otherwise.
 *   7. the three kinds — never flattened, checked at runtime because the wire
 *                        is not type-checked.
 *   8. decision grammar — only `noul` | `choice` | `score`, per the schema.
 *   9. evidence well-formed, then decision present.
 *
 * NOTE WHAT IS *NOT* HERE: whether evidence is REQUIRED. That is a gate rule,
 * not an envelope rule, and keeping them in separate functions is what keeps the
 * refusal codes distinguishable — `no-evidence` means "well formed and
 * insufficient", never "malformed".
 */

import { createHash } from 'node:crypto'

import type {
  DialogueEnvelope,
  EvidencePointer,
  IntentVectorReference,
  MetaPackage,
} from '../../shared/protocol.ts'
import { SPEC_VERSION, STEP_VERSION } from '../../shared/protocol.ts'
import type { Refusal, RefusalCode } from './types.ts'
import { THREE_KINDS } from './types.ts'

/** The outcome of validating an envelope or a sub-part of one. */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: Refusal }

/**
 * Build a refusal.
 *
 * `verdict` is a required argument rather than a defaulted one, because the
 * common mistake is to let everything refuse as `fail` — which turns "we could
 * not check" into a negative finding about the thing measured.
 *
 * @param code - the closed refusal code.
 * @param verdict - the verdict this refusal carries.
 * @param reason - a sentence a reader can act on.
 * @returns the refusal.
 */
export function refuse(code: RefusalCode, verdict: Refusal['verdict'], reason: string): ValidationResult {
  return { ok: false, refusal: { code, reason, verdict } }
}

/**
 * Serialize a value with ordinal-sorted keys at every depth.
 *
 * Two objects that differ only in key order are the same object, and a hash that
 * disagreed with itself over key order would make `contentHash` unreliable in
 * exactly the case it exists to catch. Arrays keep their order: an array's order
 * IS part of its value.
 *
 * @param value - the value to canonicalize.
 * @returns the canonical JSON text.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
  return `{${parts.join(',')}}`
}

/**
 * The SHA-256 of a string, lowercase hex.
 *
 * @param text - the text to hash.
 * @returns the digest.
 */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * The content hash of a meta-package.
 *
 * `contentHash` is EXCLUDED from its own computation, and that exclusion is the
 * whole mechanism: a hash that covered its own field could never be computed,
 * because writing it would change the input. The field is stripped rather than
 * set to a placeholder, so a package cannot smuggle a differing hash through a
 * canonicalization of its own declared value.
 *
 * @param metaPackage - the package to hash.
 * @returns the hash of the package's canonical payload.
 */
export function hashMetaPackage(metaPackage: MetaPackage): string {
  const payload: Record<string, unknown> = { ...metaPackage }
  delete payload['contentHash']
  return sha256(canonicalize(payload))
}

// ---------------------------------------------------------------------------
// The decision grammar
// ---------------------------------------------------------------------------

/**
 * Every way the schema's three scale forms are written, in the SCHEMA'S ORDER.
 *
 * This is copied in order from `plan/intent-field/schema.json`, and the order is
 * load-bearing rather than cosmetic: a reader that tried the parenthesised
 * ladder first would match the wrong number on a string written as
 * `3 of 5 (1-5)`, taking the ladder's maximum where the schema names the first
 * form as authoritative.
 *
 *   1. `0-(\d+)`            — a range, the maximum in group 1.
 *   2. `(\d+)\s+of\s+(\d+)` — "n of m", the maximum in group 2.
 *   3. a parenthesised ladder — the largest integer inside the parentheses.
 *
 * @param text - the declared scale.
 * @returns the scale maximum, or null when no form matches.
 */
export function extractScaleMax(text: string): number | null {
  const range = /0-(\d+)/.exec(text)
  if (range !== null && range.length >= 2) {
    const captured = range[1]
    const parsed = Number.parseInt(captured, 10)
    if (Number.isFinite(parsed)) return parsed
  }

  const ofForm = /(\d+)\s+of\s+(\d+)/.exec(text)
  if (ofForm !== null && ofForm.length >= 3) {
    const parsed = Number.parseInt(ofForm[2], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  const ladder = /\(([^)]*)\)/.exec(text)
  if (ladder !== null && ladder.length >= 2) {
    const inside = ladder[1]
    const numbers = inside.match(/\d+/g)
    if (numbers !== null && numbers.length > 0) {
      const values = numbers.map((token) => Number.parseInt(token, 10)).filter((n) => Number.isFinite(n))
      if (values.length > 0) return Math.max(...values)
    }
  }

  return null
}

/**
 * Whether a value is an admissible decision, per the closed grammar.
 *
 * A free string, an array and a nested object are each rejected — not because
 * this lane dislikes them, but because the Laya path rejects them, so admitting
 * one here would build an offer the model can never answer.
 *
 * @param value - the value to check, of unknown provenance.
 * @returns whether it is admissible.
 */
export function checkDecisionValue(value: unknown): ValidationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return refuse('malformed-envelope', 'refused', 'a decision must be an object with a `decision` discriminant')
  }
  const record = value as Record<string, unknown>
  const decision = record['decision']

  if (decision === 'noul') {
    const noul = record['value']
    if (noul !== 0 && noul !== 1) {
      return refuse('value-not-admissible', 'refused', `a noul value must be 0 or 1, got ${JSON.stringify(noul)}`)
    }
    return { ok: true }
  }

  if (decision === 'choice') {
    const choice = record['value']
    const labelSet = record['labelSet']
    const registered = ['threeKind', 'verificationState', 'mountState', 'alignVerdict']
    if (typeof choice !== 'string' || choice.length === 0) {
      return refuse('value-not-admissible', 'refused', 'a choice value must be a non-empty string')
    }
    if (typeof labelSet !== 'string' || !registered.includes(labelSet)) {
      return refuse(
        'value-not-admissible',
        'refused',
        `a choice must declare a REGISTERED label set (${registered.join('|')}), got ${JSON.stringify(labelSet)}; an undeclared label set is an undeclared differentiation`,
      )
    }
    return { ok: true }
  }

  if (decision === 'score') {
    const score = record['value']
    const scaleMax = record['scaleMax']
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return refuse('value-not-admissible', 'refused', 'a score value must be a finite number')
    }
    if (typeof scaleMax !== 'number' || !Number.isFinite(scaleMax) || scaleMax <= 0) {
      return refuse('value-not-admissible', 'refused', 'a score must declare a positive scaleMax')
    }
    if (score < 0 || score > scaleMax) {
      return refuse('value-not-admissible', 'refused', `a score of ${score} is outside its declared 0..${scaleMax} scale`)
    }
    return { ok: true }
  }

  return refuse('value-not-admissible', 'refused', `the decision discriminant must be noul|choice|score, got ${JSON.stringify(decision)}`)
}

/**
 * Whether evidence is WELL FORMED.
 *
 * Well-formedness is all this checks. A pointer with an empty `claim` is a
 * pointer that proves nothing, and the contract says so in its own comment —
 * here that becomes a refusal rather than a reader's obligation.
 *
 * @param evidence - the evidence array to check.
 * @returns whether it is well formed.
 */
export function checkEvidence(evidence: unknown): ValidationResult {
  if (!Array.isArray(evidence)) {
    return refuse('malformed-envelope', 'refused', 'evidence must be an array of pointers')
  }
  for (const entry of evidence) {
    if (entry === null || typeof entry !== 'object') {
      return refuse('malformed-envelope', 'refused', 'an evidence entry must be an object')
    }
    const pointer = entry as Record<string, unknown>
    if (typeof pointer['source'] !== 'string' || pointer['source'].length === 0) {
      return refuse('malformed-envelope', 'refused', 'an evidence pointer must name a source')
    }
    if (typeof pointer['claim'] !== 'string' || pointer['claim'].length === 0) {
      return refuse(
        'malformed-envelope',
        'refused',
        'an evidence pointer must state what it establishes; a bare pointer proves nothing',
      )
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

/**
 * Validate an envelope, in the fixed order documented at the head of this file.
 *
 * @param envelope - the envelope to validate, of unknown provenance.
 * @param now - the moment to validate against, injected so expiry is testable.
 * @returns whether it may proceed to the gate.
 */
export function validateEnvelope(envelope: unknown, now: Date): ValidationResult {
  // (1) The spec version. Unknown means REFUSED, never best-effort.
  if (envelope === null || typeof envelope !== 'object') {
    return refuse('malformed-envelope', 'refused', 'the envelope is not an object')
  }
  const carrier = envelope as Record<string, unknown>
  if (carrier['specVersion'] !== SPEC_VERSION) {
    return refuse(
      'unknown-spec-version',
      'refused',
      `this receiver speaks specVersion ${SPEC_VERSION}; it refuses ${JSON.stringify(carrier['specVersion'])} rather than guessing at its meaning`,
    )
  }

  // (2) The step version, separately: an open dialogue cares about step ORDER.
  if (carrier['stepVersion'] !== STEP_VERSION) {
    return refuse(
      'unknown-step-version',
      'refused',
      `this receiver speaks stepVersion ${STEP_VERSION}, got ${JSON.stringify(carrier['stepVersion'])}`,
    )
  }

  const cast = envelope as DialogueEnvelope

  // (3) Shape.
  if (typeof cast.messageId !== 'string' || cast.messageId.length === 0) {
    return refuse('malformed-envelope', 'refused', 'messageId is required and must be a non-empty string')
  }
  if (typeof cast.dialogueId !== 'string' || cast.dialogueId.length === 0) {
    return refuse('malformed-envelope', 'refused', 'dialogueId is required and must be a non-empty string')
  }
  if (typeof cast.from !== 'string' || typeof cast.to !== 'string') {
    return refuse('malformed-envelope', 'refused', 'from and to are both required')
  }
  if (typeof cast.step !== 'number' || !Number.isInteger(cast.step) || cast.step < 0) {
    return refuse('malformed-envelope', 'refused', 'step must be a non-negative integer')
  }
  if (typeof cast.maxSteps !== 'number' || !Number.isInteger(cast.maxSteps) || cast.maxSteps <= 0) {
    return refuse('malformed-envelope', 'refused', 'maxSteps must be a positive integer; a dialogue with no step bound is a denial-of-service shape')
  }

  // (4) A monologue is not a dialogue.
  if (cast.from === cast.to) {
    return refuse(
      'self-addressed',
      'refused',
      `the envelope is addressed from ${cast.from} to itself; this system is two or more instances, so a self-addressed message is refused`,
    )
  }

  // (5) Expiry.
  if (typeof cast.expiresAt !== 'string' || cast.expiresAt.length === 0) {
    return refuse('malformed-envelope', 'refused', 'expiresAt is required; an envelope with no expiry is replayable forever')
  }
  const expires = new Date(cast.expiresAt)
  if (Number.isNaN(expires.getTime())) {
    return refuse('malformed-envelope', 'refused', `expiresAt is not a parseable timestamp: ${cast.expiresAt}`)
  }
  if (expires.getTime() <= now.getTime()) {
    return refuse(
      'expired',
      'refused',
      `the envelope expired at ${cast.expiresAt} and was validated at ${now.toISOString()}`,
    )
  }

  // (6) An offer is what makes a message a proposal.
  if (cast.offer === null) {
    return refuse('no-offer', 'refused', 'the envelope carries no offer, so there is nothing to accept, counter or refuse')
  }

  // (7) THE THREE KINDS, NEVER FLATTENED.
  // The contract's rule 2 is that the three kinds are never flattened and that
  // there is deliberately no `done`/`complete`/`ready` in this protocol; rule 1
  // is that a plan is never rounded up to an existence claim.
  //
  // The type system already narrows `kind` to `ThreeKind`, so this check is
  // UNREACHABLE through a well-typed call — and it is here anyway, because the
  // receiver's `kind` arrives OFF THE WIRE, where not one byte is type-checked. A
  // receiver that trusted its own types would accept whatever a peer sent while
  // believing the compiler had already excluded it. The type is the contract at
  // the SENDER's boundary; this test is the contract at the RECEIVER's.
  if (!THREE_KINDS.includes(cast.offer.kind)) {
    return refuse(
      'flattened-kind',
      'refused',
      `the offer's kind must be one of ${THREE_KINDS.join('|')}, got ${JSON.stringify(cast.offer.kind)}; a status token is not one of the three kinds`,
    )
  }

  // (8) The offer's content hash must agree with its own payload.
  const recomputed = hashMetaPackage(cast.offer)
  if (cast.offer.contentHash !== recomputed) {
    return refuse(
      'offer-hash-mismatch',
      'refused',
      `the offer declares contentHash ${cast.offer.contentHash} but its canonical payload hashes to ${recomputed}`,
    )
  }

  const claimCheck = checkDecisionValue(cast.offer.claim)
  if (!claimCheck.ok) return claimCheck

  // (9) The evidence must be well formed, and the decision must exist at all.
  const evidenceCheck = checkEvidence(cast.offer.evidence)
  if (!evidenceCheck.ok) return evidenceCheck

  if (cast.decision === null) {
    return refuse(
      'no-decision',
      'unknown',
      'the envelope carries no decision; this is a MISSING READING rather than a refusal, so it is refused with verdict unknown',
    )
  }
  const decisionCheck = checkDecisionValue(cast.decision)
  if (!decisionCheck.ok) {
    return { ok: false, refusal: { ...decisionCheck.refusal, code: 'value-not-admissible' } }
  }

  return { ok: true }
}

/**
 * Whether an evidence array is SUFFICIENT for the gate.
 *
 * Deliberately separate from `checkEvidence`: well-formed-and-empty is a
 * different fact from malformed, and it refuses with a different code.
 *
 * @param evidence - the evidence to require.
 * @returns the refusal when insufficient, or null.
 */
export function requireEvidence(evidence: readonly EvidencePointer[]): Refusal | null {
  if (evidence.length === 0) {
    return {
      code: 'no-evidence',
      reason: 'the offer carries no evidence, and an offer is acted on only when it carries evidence',
      verdict: 'refused',
    }
  }
  return null
}

/** The input to `seal`. Everything but `contentHash`, which is computed. */
export interface SealInput {
  readonly messageId: string
  readonly dialogueId: string
  readonly from: string
  readonly to: string
  readonly step: number
  readonly maxSteps: number
  readonly expiresAt: string
  readonly intent: IntentVectorReference | null
  readonly packageId: string
  readonly zones: readonly string[]
  readonly claim: MetaPackage['claim']
  readonly kind: MetaPackage['kind']
  readonly catalogRef: MetaPackage['catalogRef']
  readonly declaration: MetaPackage['declaration']
  readonly evidence: readonly EvidencePointer[]
  readonly decision: DialogueEnvelope['decision']
  readonly confidence: DialogueEnvelope['confidence']
}

/**
 * Seal a message: attach the spec versions and the offer's content hash.
 *
 * `contentHash` is COMPUTED here rather than accepted, so a sender cannot
 * declare one hash and send another payload. The receiver still recomputes it —
 * a sender's own arithmetic is testimony about the sender, and the whole point
 * of the field is that the two sides can disagree.
 *
 * @param input - the message to seal.
 * @returns the sealed envelope.
 */
export function seal(input: SealInput): DialogueEnvelope {
  const offer: MetaPackage = {
    packageId: input.packageId,
    specVersion: SPEC_VERSION,
    zones: input.zones,
    claim: input.claim,
    kind: input.kind,
    catalogRef: input.catalogRef,
    declaration: input.declaration,
    contentHash: '',
    evidence: input.evidence,
  }
  const sealed: MetaPackage = { ...offer, contentHash: hashMetaPackage(offer) }
  return {
    specVersion: SPEC_VERSION,
    stepVersion: STEP_VERSION,
    messageId: input.messageId,
    dialogueId: input.dialogueId,
    from: input.from,
    to: input.to,
    step: input.step,
    maxSteps: input.maxSteps,
    expiresAt: input.expiresAt,
    intent: input.intent,
    offer: sealed,
    decision: input.decision,
    confidence: input.confidence,
  }
}
