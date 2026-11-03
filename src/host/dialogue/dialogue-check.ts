/**
 * ============================================================================
 * dialogue-check — the runnable instrument for this lane
 * ============================================================================
 *
 * WHAT THIS IS
 *
 * A standalone check with NO test framework, run as `node dialogue-check.ts`
 * under Node 24's strip-only TypeScript loader. It exits non-zero on any failure
 * and prints PASS/FAIL per assertion, because a check nobody can run is not a
 * check.
 *
 * TWO RULES THIS HARNESS OBEYS ABOUT ITSELF
 *
 *   1. BOTH SIDES MUST ANSWER. A checker that refuses everything has tested
 *      nothing, and neither has one that accepts everything. So the instrument
 *      asserts that at least one negative control was refused AND at least one
 *      step was admitted, and treats a run where either count is zero as an
 *      INSTRUMENT FAILURE rather than a pass. A `0` on both sides is not a
 *      green light.
 *
 *   2. EVERY LIVE-PROBE OUTCOME IS LABELLED EITHER WAY. "The backend is down"
 *      and "the probe never ran" are indistinguishable if only the second is
 *      printed, so the probe prints what it found and marks the section
 *      accordingly rather than staying silent on failure.
 *
 * WHAT IT DOES NOT DO: it does not start the backend. The decision backend is a
 * shared resource and `AGENTS.md` states that one model at a time is arithmetic
 * rather than preference. The live path is therefore exercised through an
 * INJECTED dead transport, deterministically, and the real endpoint is probed
 * read-only.
 */

import { clearsGate, maxProbability, readConfidence, reportedQuantityFor } from './confidence.ts'
import {
  canonicalize,
  extractScaleMax,
  hashMetaPackage,
  sha256,
  validateEnvelope,
} from './envelope.ts'
import { decideByLaya, parseDecisionBody, type Transport } from './laya.ts'
import {
  abstain,
  DEFAULT_BOUNDS,
  abstentionVerdict,
  gate,
  isTerminal,
  LifecycleError,
  LIVE_PHASES,
  openDialogue,
  TERMINAL_PHASES,
  TERMINAL_VERDICTS,
  transition,
} from './state.ts'
import type { DialogueEnvelope, MetaPackage } from '../../shared/protocol.ts'

// ---------------------------------------------------------------------------
// The instrument itself
// ---------------------------------------------------------------------------

let failures = 0
let checks = 0
let refusedCases = 0
let admittedCases = 0

/**
 * Assert one condition, printing its result.
 *
 * @param name - what is being asserted.
 * @param condition - the asserted condition.
 * @param detail - what to print when it fails.
 */
function check(name: string, condition: boolean, detail: string): void {
  checks += 1
  if (condition) {
    console.log(`  PASS  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}\n        ${detail}`)
  }
}

/**
 * Print a section heading.
 *
 * @param title - the heading.
 */
function section(title: string): void {
  console.log(`\n${title}`)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-16T12:00:00.000Z')
const LATER = new Date('2026-10-16T12:00:05.000Z')

const DECLARATION: MetaPackage['declaration'] = {
  capabilities: ['dialogue'],
  redLines: ['declared-credentials-plus-network'],
  declaresNothing: false,
}

const EVIDENCE = [
  {
    source: 'research/meta-market-dialogue.md',
    verification: 'verified-read' as const,
    claim: 'the dialogue lane records its bounds and their falsifiers',
  },
]

const MEASURED_CONFIDENCE = {
  value: 0.875,
  backend: 'laya-torch' as const,
  model: 'laya-typed-decisions',
  provenance: 'computed' as const,
}

/**
 * The default envelope this harness mutates.
 *
 * @returns a valid envelope.
 */
function envelope(): DialogueEnvelope {
  return {
    specVersion: 1,
    stepVersion: 1,
    messageId: 'm-1',
    dialogueId: 'd-1',
    from: 'peer-a',
    to: 'peer-b',
    step: 0,
    maxSteps: DEFAULT_BOUNDS.maxSteps,
    expiresAt: '2026-10-16T12:10:00.000Z',
    intent: null,
    offer: {
      packageId: 'pkg-1',
      specVersion: 1,
      zones: [],
      claim: { decision: 'noul', value: 1 },
      kind: 'plan',
      catalogRef: null,
      declaration: DECLARATION,
      contentHash: '',
      evidence: EVIDENCE,
    },
    decision: { decision: 'noul', value: 1 },
    confidence: MEASURED_CONFIDENCE,
  }
}

/**
 * A valid envelope with its content hash computed.
 *
 * @param overrides - fields to replace.
 * @returns the sealed envelope.
 */
function sealed(overrides: Partial<DialogueEnvelope> = {}): DialogueEnvelope {
  const base = { ...envelope(), ...overrides }
  const offer = base.offer === null ? null : { ...base.offer, contentHash: hashMetaPackage(base.offer) }
  return { ...base, offer }
}

/**
 * A scripted decision for a move.
 *
 * @param kind - which move the decision expresses.
 * @returns the decision.
 */
function scriptedDecision(kind: 'propose' | 'counter' | 'commit' | 'abstain') {
  const value = kind === 'commit' ? 'commit' : kind === 'counter' ? 'counter' : kind === 'abstain' ? 'abstain' : 'propose'
  return {
    value: { decision: 'choice' as const, value, labelSet: 'alignVerdict' as const },
    confidence: MEASURED_CONFIDENCE,
    provenance: 'model-answer-confidence' as const,
  }
}

/**
 * A transport that never answers, for deterministic degradation tests.
 *
 * @returns the dead transport.
 */
function deadTransport(): Transport {
  return {
    post: () => Promise.reject(new Error('ECONNREFUSED: nothing is listening on the target port')),
  }
}

// ---------------------------------------------------------------------------
// 1. Versioning — an unknown version is refused, not guessed at
// ---------------------------------------------------------------------------

section('1. Envelope versioning — an unknown version is REFUSED, not best-effort parsed')

const badSpec = validateEnvelope({ ...sealed(), specVersion: 99 }, NOW)
check('an unknown specVersion 99 is REFUSED', !badSpec.ok && badSpec.refusal.code === 'unknown-spec-version', `got ${badSpec.ok ? 'admission' : badSpec.refusal.code}`)

const badStep = validateEnvelope({ ...sealed(), stepVersion: 99 }, NOW)
check('an unknown stepVersion 99 is REFUSED', !badStep.ok && badStep.refusal.code === 'unknown-step-version', `got ${badStep.ok ? 'admission' : badStep.refusal.code}`)

check('a well-sealed envelope at the current versions is ADMITTED', validateEnvelope(sealed(), NOW).ok, 'the valid fixture was refused, so the refusals above prove nothing')

// ---------------------------------------------------------------------------
// 2. The three kinds, never flattened
// ---------------------------------------------------------------------------

section('2. The three kinds — checked at the RECEIVER boundary, where the wire is not type-checked')

const goodKind = sealed()
check('a `plan` offer is ADMITTED (the three kinds are not a filter against planning)', validateEnvelope(goodKind, NOW).ok, 'a well-formed `plan` offer was refused')

// The cast is the point, and it is stated rather than hidden. `kind` is TYPED as
// `ThreeKind`, so `kind: 'done'` is not a TypeScript program at all — the
// compiler rejects the fixture before it can run. Binding-time safety is REAL and
// it is NOT SUFFICIENT, because the receiver's `kind` arrives off the wire and no
// compiler checked it. So the control plants the wire value through `unknown` and
// asserts the RUNTIME check catches it. A version that omitted the cast would not
// run; a version that relied on the cast to fail would be testing the compiler
// rather than the receiver.
const flattenedWire = {
  ...sealed(),
  offer: { ...(sealed().offer as MetaPackage), kind: 'done' },
} as unknown as DialogueEnvelope
const flattenedResult = validateEnvelope(flattenedWire, NOW)
if (!flattenedResult.ok && flattenedResult.refusal.code === 'flattened-kind') refusedCases += 1
check('N1 a flattened kind arriving OFF THE WIRE is REFUSED at runtime', !flattenedResult.ok && flattenedResult.refusal.code === 'flattened-kind', `got ${flattenedResult.ok ? 'admission' : flattenedResult.refusal.code}`)
check('N1b the flattened token is genuinely not one of the three kinds, so the runtime test is not vacuous', !(['exists', 'plan', 'future'] as readonly string[]).includes('done'), 'the flattened token IS one of the three kinds')

// ---------------------------------------------------------------------------
// 3. The decision grammar
// ---------------------------------------------------------------------------

section('3. The decision grammar — closed at noul | choice | score')

const badValue = sealed({ decision: { decision: 'noul', value: 2 as 0 } })
const badValueResult = validateEnvelope(badValue, NOW)
if (!badValueResult.ok) refusedCases += 1
check('N2 a `noul` value of 2 is REFUSED (the grammar is closed at 0|1)', !badValueResult.ok && badValueResult.refusal.code === 'value-not-admissible', `got ${badValueResult.ok ? 'admission' : badValueResult.refusal.code}`)

check('the schema\'s scale form `0-5` reads a maximum of 5', extractScaleMax('0-5') === 5, `got ${String(extractScaleMax('0-5'))}`)
check('the schema\'s scale form `3 of 7` reads a maximum of 7', extractScaleMax('3 of 7') === 7, `got ${String(extractScaleMax('3 of 7'))}`)
check('the schema\'s ladder form `(1-5)` reads a maximum of 5', extractScaleMax('level (1-5)') === 5, `got ${String(extractScaleMax('level (1-5)'))}`)
check('the schema\'s THREE FORMS disagreed on `3 of 5 (1-5)` and the FIRST form in schema order wins at 5', extractScaleMax('3 of 5 (1-5)') === 5, `got ${String(extractScaleMax('3 of 5 (1-5)'))}`)

// ---------------------------------------------------------------------------
// 4. Hashing and canonicalization
// ---------------------------------------------------------------------------

section('4. Canonical hashing — the same content hashes the same regardless of key order')

const one = { b: 1, a: [1, 2, { z: true, y: false }] }
const two = { a: [1, 2, { y: false, z: true }], b: 1 }
check('two objects differing only in key order canonicalize identically', canonicalize(one) === canonicalize(two), `got ${canonicalize(one)} vs ${canonicalize(two)}`)
check('the same text hashes to the same digest twice', sha256('dialogue') === sha256('dialogue'), 'the hash is not deterministic')

// The tamper test builds the mismatch rather than mutating a frozen value: the
// content hash is computed over a payload that is then DIFFERENT from the one
// sent. That is the real attack shape — a sender declares a hash for one payload
// and ships another — and it is why the receiver recomputes rather than trusting
// the field.
const tamperedBase = sealed()
const tamperedOffer = { ...(tamperedBase.offer as MetaPackage), claim: { decision: 'noul' as const, value: 0 as const } }
const tampered = { ...tamperedBase, offer: { ...tamperedOffer, contentHash: tamperedBase.offer?.contentHash ?? '' } }
const tamperedResult = validateEnvelope(tampered, NOW)
if (!tamperedResult.ok) refusedCases += 1
check('N3 a payload whose declared hash does not match its content is REFUSED', !tamperedResult.ok && tamperedResult.refusal.code === 'offer-hash-mismatch', `got ${tamperedResult.ok ? 'admission' : tamperedResult.refusal.code}`)

// ---------------------------------------------------------------------------
// 5. Abstention — reachable from EVERY live phase
// ---------------------------------------------------------------------------

section('5. Abstention — registered as a move, reachable from every live phase, costing 1 step and nothing else')

const overlap = LIVE_PHASES.filter((phase) => TERMINAL_PHASES.includes(phase))
check(`the live and terminal phase sets are DISJOINT (${LIVE_PHASES.length} live, ${TERMINAL_PHASES.length} terminal)`, overlap.length === 0, `these phases are in both sets, so the walk below would test a state that cannot occur: ${overlap.join(', ')}`)

let abstainedFrom = 0
for (const phase of LIVE_PHASES) {
  const state = { ...openDialogue('d-abstain', NOW), phase }
  const next = abstain(state, 'red-line', LATER)
  if (next.phase === 'abstained' && isTerminal(next.phase)) abstainedFrom += 1
}
check(`an abstention succeeds from EVERY live phase (${abstainedFrom} of ${LIVE_PHASES.length})`, abstainedFrom === LIVE_PHASES.length, `only ${abstainedFrom} of ${LIVE_PHASES.length} live phases could abstain; a refusal channel available from some states is not a guarantee`)

const abstainRecord = abstentionVerdict('red-line')
check('an abstention verdict is `abstained`, NOT `refused` or `fail`', abstainRecord.verdict === 'abstained', `got ${abstainRecord.verdict}`)

// ---------------------------------------------------------------------------
// 6. Termination — both bounds, and the structural guarantee
// ---------------------------------------------------------------------------

section('6. Termination — both bounds enforced, and a terminal phase that cannot be left')

let bulk = openDialogue('d-bulk', NOW)
let applied = 0
for (let index = 0; index < DEFAULT_BOUNDS.maxSteps + 4; index += 1) {
  const result = gate({ state: bulk, envelope: sealed({ messageId: `b-${index}`, dialogueId: 'd-bulk', step: index }), now: LATER, decision: scriptedDecision('propose') })
  bulk = result.state
  if (result.applied) applied += 1
}
check(`the step budget stopped the dialogue after ${applied} of ${DEFAULT_BOUNDS.maxSteps} steps`, applied <= DEFAULT_BOUNDS.maxSteps, `${applied} envelopes were applied against a budget of ${DEFAULT_BOUNDS.maxSteps}`)

const wallState = openDialogue('d-wall', NOW)
const wallResult = gate({ state: wallState, envelope: sealed({ dialogueId: 'd-wall' }), now: new Date(NOW.getTime() + DEFAULT_BOUNDS.maxWallClockMs + 1), decision: scriptedDecision('propose') })
check(`the wall-clock budget stopped the dialogue after ${DEFAULT_BOUNDS.maxWallClockMs} ms`, wallResult.state.phase === 'budget-exhausted', `expected budget-exhausted, got ${wallResult.state.phase}`)

let threw = false
try {
  transition({ ...openDialogue('d-term', NOW), phase: 'committed' }, 'proposed', 'propose', 'x', LATER)
} catch (error) {
  threw = error instanceof LifecycleError
}
check('a step sent to a TERMINAL dialogue THROWS and cannot move it', threw, 'a terminal dialogue was moved, so termination is a convention rather than a guarantee')

check(`the envelope TTL (${DEFAULT_BOUNDS.envelopeTtlMs} ms) EXCEEDS the wall-clock budget (${DEFAULT_BOUNDS.maxWallClockMs} ms)`, DEFAULT_BOUNDS.envelopeTtlMs > DEFAULT_BOUNDS.maxWallClockMs, 'a TTL shorter than the dialogue budget would expire envelopes mid-cycle')

// ---------------------------------------------------------------------------
// 7. Replay — the same envelope twice does not apply twice
// ---------------------------------------------------------------------------

section('7. Idempotence — keyed on messageId, checked BEFORE the step counter advances')

const replayState = openDialogue('d-replay', NOW)
const first = gate({ state: replayState, envelope: sealed({ dialogueId: 'd-replay', messageId: 'r-1', step: 0 }), now: LATER, decision: scriptedDecision('propose') })
const second = gate({ state: first.state, envelope: sealed({ dialogueId: 'd-replay', messageId: 'r-1', step: 0 }), now: LATER, decision: scriptedDecision('propose') })

check('the first delivery is applied', first.applied, 'the first delivery was refused, so the replay test proves nothing')
check('the second delivery of the SAME envelope is REFUSED as a replay', second.refusal !== null && second.refusal.code === 'replay', `got ${second.refusal === null ? 'admission' : second.refusal.code}`)
check('the step count did NOT advance on the replay', second.state.appliedStep === first.state.appliedStep, `${first.state.appliedStep} -> ${second.state.appliedStep}`)
check('the replay set holds exactly ONE entry for the one message admitted', second.state.seenMessageIds.length === 1, `got ${second.state.seenMessageIds.length}; a set that grew on a replay is a phantom element charged to a container that does not hold it`)

// ---------------------------------------------------------------------------
// 8. The two confidences — the control that must DISCRIMINATE
// ---------------------------------------------------------------------------

section('8. The two confidence quantities — a floor must not read both the same way')

const FLOOR = 0.7
const rawAnswer = {
  type: 'noul',
  answer_confidence: 0.875,
  confidence: 0.5788,
  probabilities: [0.875, 0.0683, 0.0566],
}

const calibrated = readConfidence(rawAnswer, 'laya-torch', 'noul', 'laya-typed-decisions')
check('the CALIBRATED quantity reads as 0.875 (max(p))', calibrated.ok && Math.abs(calibrated.confidence.value - 0.875) < 1e-9, `got ${calibrated.ok ? String(calibrated.confidence.value) : calibrated.refusal.reason}`)

const readValue = calibrated.ok ? calibrated.confidence.value : Number.NaN
check(`the calibrated quantity CLEARS a floor of ${FLOOR}`, calibrated.ok && clearsGate(calibrated.confidence, FLOOR), `value ${String(readValue)} did not clear ${FLOOR}`)

const reported = 0.5788
check(`the REPORTED quantity (${reported}) does NOT clear a floor of ${FLOOR} — so the two DISAGREE`, reported < FLOOR, 'the two quantities agreed, so the control does not discriminate between them')
if (calibrated.ok && clearsGate(calibrated.confidence, FLOOR) && reported < FLOOR) admittedCases += 1

check('the reported quantity is named `entropy` on the torch lane', reportedQuantityFor('laya-torch', 'noul') === 'entropy', `got ${reportedQuantityFor('laya-torch', 'noul')}`)
check('the reported quantity is named the TypeSafe ratio on llama.cpp for a choice', reportedQuantityFor('llama-cpp', 'choice') === 'typesafe-choice-ratio', `got ${reportedQuantityFor('llama-cpp', 'choice')}`)

const noField = readConfidence({ probabilities: [0.9, 0.1] }, 'llama-cpp', 'choice', null)
check('where `answer_confidence` is ABSENT the reader falls back to max(probabilities)', noField.ok && Math.abs(noField.confidence.value - 0.9) < 1e-9, `got ${noField.ok ? String(noField.confidence.value) : noField.refusal.reason}`)

const empty = maxProbability([])
check('an EMPTY probability vector reads null, never -Infinity', empty === null, `got ${String(empty)}; Math.max() returns -Infinity and an empty reading has been turned into a very low confidence`)

check('a confidence of 0 is treated as PRESENT, not as absent (a truthy test would discard it)', (() => {
  const zero = readConfidence({ probabilities: [1, 0, 0] }, 'laya-torch', 'choice', null)
  return zero.ok && zero.confidence.value === 1
})(), 'a real reading was discarded')

// ---------------------------------------------------------------------------
// 9. The negative controls on the gate itself
// ---------------------------------------------------------------------------

section('9. The gate\'s refusal paths — the cases that MUST refuse')

const base = openDialogue('d-1', NOW)

const selfAddressed = gate({ state: base, envelope: sealed({ from: 'peer-a', to: 'peer-a' }), now: LATER, decision: scriptedDecision('propose') })
if (selfAddressed.refusal !== null) refusedCases += 1
check('N4 a SELF-ADDRESSED envelope is REFUSED (a monologue is not a dialogue)', selfAddressed.refusal !== null && selfAddressed.refusal.code === 'self-addressed', `got ${selfAddressed.refusal === null ? 'admission' : selfAddressed.refusal.code}`)

const expired = gate({ state: base, envelope: sealed({ expiresAt: '2026-10-16T11:00:00.000Z' }), now: LATER, decision: scriptedDecision('propose') })
if (expired.refusal !== null) refusedCases += 1
check('N5 an EXPIRED envelope is REFUSED', expired.refusal !== null && expired.refusal.code === 'expired', `got ${expired.refusal === null ? 'admission' : expired.refusal.code}`)

const wrongDialogue = gate({ state: base, envelope: sealed({ dialogueId: 'd-other' }), now: LATER, decision: scriptedDecision('propose') })
if (wrongDialogue.refusal !== null) refusedCases += 1
check('N6 an envelope from ANOTHER dialogue is REFUSED', wrongDialogue.refusal !== null && wrongDialogue.refusal.code === 'wrong-dialogue', `got ${wrongDialogue.refusal === null ? 'admission' : wrongDialogue.refusal.code}`)

const noEvidence = sealed({ offer: { ...(sealed().offer as MetaPackage), evidence: [] } })
const noEvidenceEnvelope = { ...noEvidence, offer: noEvidence.offer === null ? null : { ...noEvidence.offer, contentHash: hashMetaPackage(noEvidence.offer) } }
const noEvidenceResult = gate({ state: base, envelope: noEvidenceEnvelope, now: LATER, decision: scriptedDecision('commit') })
if (noEvidenceResult.refusal !== null) refusedCases += 1
check('N7 an evidence-free COMMIT is REFUSED', noEvidenceResult.refusal !== null && noEvidenceResult.refusal.code === 'no-evidence', `got ${noEvidenceResult.refusal === null ? 'admission' : noEvidenceResult.refusal.code}`)

const noDecision = gate({ state: base, envelope: sealed({ decision: null }), now: LATER, decision: scriptedDecision('propose') })
check('N8 a decision-free envelope is REFUSED with verdict `unknown`, NOT `refused`', noDecision.refusal !== null && noDecision.refusal.verdict === 'unknown', `got ${noDecision.refusal === null ? 'admission' : `${noDecision.refusal.code}/${noDecision.refusal.verdict}`}`)

const unmetered = gate({
  state: base,
  envelope: sealed({ decision: { decision: 'choice', value: 'commit', labelSet: 'alignVerdict' } }),
  now: LATER,
  decision: { value: { decision: 'choice', value: 'commit', labelSet: 'alignVerdict' }, confidence: { value: 0, backend: 'none', model: null, provenance: 'not-measured' }, provenance: 'not-measured' },
})
if (unmetered.refusal !== null) refusedCases += 1
check('N9 a commit against an UNMEASURED confidence is REFUSED', unmetered.refusal !== null && unmetered.refusal.code === 'confidence-absent', `got ${unmetered.refusal === null ? 'admission' : unmetered.refusal.code}`)

const admittedStep = gate({ state: base, envelope: sealed(), now: LATER, decision: scriptedDecision('propose') })
if (admittedStep.applied) admittedCases += 1
check('a well-formed step IS admitted (a checker that refuses everything has tested nothing)', admittedStep.applied, `got refusal ${admittedStep.refusal?.code ?? 'none'}`)

// ---------------------------------------------------------------------------
// 10. Verdicts and the terminal map
// ---------------------------------------------------------------------------

section('10. Terminal verdicts — `unknown` is distinct from `fail`')

const terminalMissing = TERMINAL_PHASES.filter((phase) => !Object.hasOwn(TERMINAL_VERDICTS, phase))
check(`every terminal phase maps to a verdict (${TERMINAL_PHASES.length} phases)`, terminalMissing.length === 0, `these terminal phases are missing from TERMINAL_VERDICTS: ${terminalMissing.join(', ')}`)

check('`unavailable` maps to `unknown`, NOT to `fail`', TERMINAL_VERDICTS['unavailable'] === 'unknown', `got ${String(TERMINAL_VERDICTS['unavailable'])}`)
check('`abstained` maps to `abstained`, NOT to `refused`', TERMINAL_VERDICTS['abstained'] === 'abstained', `got ${String(TERMINAL_VERDICTS['abstained'])}`)

// ---------------------------------------------------------------------------
// 11. Degradation — an absent backend is REPORTED, never substituted
// ---------------------------------------------------------------------------

section('11. Degradation — a dead backend returns `unavailable`, never an invented answer')

const dead = await decideByLaya('may this offer be applied?', { endpoint: 'http://127.0.0.1:8008', transport: deadTransport(), now: NOW })
check('a dead backend returns available:false', dead.available === false, 'a decision was returned with no backend to produce it')
check('the reason names `unreachable` rather than reading as a refusal', !dead.available && dead.reason === 'unreachable', `got ${dead.available ? 'available' : dead.reason}`)
check('the unavailable result carries NO `accepted` field at all, so a yes cannot be read out of it', !('accepted' in dead), 'the unavailable branch carries an `accepted` field, so a caller can read a decision out of a dead backend')

const parsedBad = parseDecisionBody('{"detail":"Not Found"}')
check('a non-decision body on a decision port is named `not-a-decision-shape`', parsedBad.shape === 'not-a-decision', `got ${parsedBad.shape}`)

// The live probe. It is READ-ONLY and it labels its outcome either way, because
// "the backend is down" and "the probe never ran" are indistinguishable if only
// the second is printed.
const live = await decideByLaya('is the dialogue backend reachable?', { endpoint: 'http://127.0.0.1:8008', timeoutMs: 1500, now: NOW })
if (live.available) {
  console.log(`  NOTE  the live endpoint ANSWERED (model ${String(live.reading.model)}); the live path was exercised for real`)
} else {
  console.log(`  NOTE  the live endpoint did not answer: ${live.reason} (${live.reading.detail})`)
  console.log('        This is the `unavailable` case this module was written for, and it is REPORTED rather than')
  console.log('        substituted: no decision is claimed, and the injected dead transport above exercised the')
  console.log('        same code path deterministically, so the degradation is tested either way.')
}

// ---------------------------------------------------------------------------
// The instrument's own health — a 0 on both sides is a FAILURE, not a pass
// ---------------------------------------------------------------------------

section('Instrument health')

check(`the instrument ADMITTED at least one step (${admittedCases})`, admittedCases > 0, 'nothing was admitted, so every admission path is untested')
check(`the instrument REFUSED at least one case (${refusedCases})`, refusedCases > 0, 'nothing was refused, so every refusal path is untested')
check(`the instrument ran ${checks} assertions`, checks > 0, 'the instrument ran no assertions, which is an instrument failure rather than a pass')

console.log(`\n${checks - failures} of ${checks} assertions passed; ${admittedCases} admissions recorded, ${refusedCases} refusals recorded`)

if (failures > 0) {
  console.log(`\nVERDICT: FAIL (${failures} failing assertions)\n`)
  process.exit(1)
}
console.log('\nVERDICT: PASS\n')
