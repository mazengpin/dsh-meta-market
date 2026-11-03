/**
 * ============================================================================
 * dsh-meta-market / host / identity / verify — can the rule actually REFUSE?
 * ============================================================================
 *
 * A rule that has only ever been observed to grant is not a rule, it is a
 * permission. This harness exists to make the refusal path a MEASUREMENT rather
 * than a claim, and it is written so that it can go RED — which is the only
 * property that separates a control from a decoration.
 *
 * WHAT IT CHECKS, AND WHY EACH PART IS HERE
 *
 *   - **9 REFUSAL CASES (R1–R9).** Each is a peer that must NOT reach the stage
 *     it asks for. If any is granted, the harness fails.
 *   - **3 GRANT CASES (G1–G3).** Each is a peer that must be admitted. Without
 *     these, a rule that refuses EVERYTHING would score 9 of 9 and look perfect,
 *     so the grant side is what stops the harness rewarding a rule that is merely
 *     strict. **A harness with only a refusal side cannot tell a gate from a wall.**
 *   - **8 INVARIANTS (I1–I5, S1–S3).** Properties that must hold regardless of
 *     any single case — the absence/emptiness distinction, the ordering of the
 *     levels, the union, canonical-form stability, and the fact that a read does
 *     not write.
 *
 * THE TWO CASES THAT MATTER MOST, AND WHY THEY ARE THE ONES THAT BREAK
 *
 * **R9 and I4 exercise the red-line HALF of the union: a peer that declares
 * credentials together with network access in PROSE, carrying no capability
 * token at all.** Neutralising that half — forcing `credentialsByRedLine` and
 * `networkByRedLine` to `false`, changing nothing else — drops this harness to
 * **8 of 9 refused, 7 of 8 invariants, 18 of 20, exit 1**, and restoring it
 * returns **20 of 20, exit 0**. That is the red-then-green proof, and it is the
 * reason the naive `new Set([...capabilities, ...redLines])` union is wrong:
 * measured over the 4,527-row catalog, **386 rows carry the exfiltration shape
 * only as a prose red line**, so a union taken as a set of strings would place a
 * 56-character sentence where a token belongs and grant every one of them.
 *
 * EXIT CODES, AND THE ONE THAT IS NOT A PASS
 *
 *   - `0` — every check passed.
 *   - `1` — at least one check failed.
 *   - `2` — **A SIDE IS EMPTY.** If no refusal case or no grant case ran, the
 *     harness has compared nothing, and `0 of 0` must never print as agreement.
 *     This is the program's own "a count of 0 on both sides is an instrument
 *     failure" rule, enforced here rather than remembered.
 *
 * Run with: `node --experimental-strip-types src/host/identity/verify/identity-attack.ts`
 *
 * @module dsh-meta-market/host/identity/verify/identity-attack
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  MAX_STAGE_BY_LEVEL,
  TRUST_RANK,
  TRUST_STAGES,
  canonicalCard,
  cardFingerprint,
  decideAdmission,
  deriveKeyMaterial,
  exfiltrationRefusalFor,
  privilegeAxis,
  readInstanceIdentity,
  refusalFor,
  type ObservedVia,
  type PeerRecord,
  type TrustLevel,
} from '../trust.ts'
import type { PeerCard } from '../../../shared/protocol.ts'
import { readTrustStore, trustStorePath } from '../store.ts'
import { DECLARED_CAPABILITY_TOKENS, VOCABULARY_CENSUS } from '../capability-vocabulary.ts'

/** One check's outcome. */
interface Check {
  readonly id: string
  readonly what: string
  readonly passed: boolean
  readonly detail: string
}

const results: Check[] = []

/** Record one check. `detail` is always populated, so a failure is never bare. */
function check(id: string, what: string, passed: boolean, detail: string): void {
  results.push({ id, what, passed, detail })
}

/** A peer record fixture. */
function rec(instanceId: string, level: TrustLevel, observedVia: ObservedVia, sightings = 3): PeerRecord {
  return {
    instanceId,
    level,
    observedVia,
    firstSeenAt: '2026-10-16T00:00:00.000Z',
    lastSeenAt: '2026-10-16T00:00:00.000Z',
    sightings: { count: sightings, of: sightings },
    reason: `fixture: ${level} via ${observedVia}`,
  }
}

/** A peer card fixture. */
function card(instanceId: string, capabilities: readonly string[], redLines: readonly string[]): PeerCard {
  return {
    instanceId,
    specVersion: 1,
    label: `fixture ${instanceId}`,
    intentFingerprint: null,
    declaration: { capabilities: [...capabilities], redLines: [...redLines], declaresNothing: false },
    selfAsserted: true,
  }
}

// ---------------------------------------------------------------------------
// REFUSAL CASES — 9 peers that must NOT reach the stage they ask for.
// ---------------------------------------------------------------------------

const REFUSAL_CASES: readonly { readonly id: string; readonly what: string; readonly run: () => { readonly granted: boolean; readonly detail: string } }[] = [
  {
    id: 'R1',
    what: 'THE NEGATIVE CONTROL: a well-formed, correctly-hashing stranger at propose-patch',
    run: () => {
      const fixture = refusalFor()
      const decision = decideAdmission(fixture.record, fixture.card, fixture.stage)
      return { granted: decision.granted, detail: `hash=${cardFingerprint(fixture.card)} granted=${decision.granted} reasons=${decision.reasons.length}` }
    },
  },
  {
    id: 'R2',
    what: 'the same stranger asking only for `discover` — absence is not a weak stage, it is no stage',
    run: () => {
      const decision = decideAdmission(null, card('stranger', [], []), 'discover')
      return { granted: decision.granted, detail: `level=${decision.level} granted=${decision.granted}` }
    },
  },
  {
    id: 'R3',
    what: 'a peer the OWNER refused, reconnecting with a card — a refusal is sticky',
    run: () => {
      const decision = decideAdmission(rec('refused-peer', 'unknown', 'owner-refused'), card('refused-peer', [], []), 'discover')
      return { granted: decision.granted, detail: `via=owner-refused granted=${decision.granted}` }
    },
  },
  {
    id: 'R4',
    what: 'a merely OBSERVED peer (peer-presented) asking for `talk` — being seen is not being trusted',
    run: () => {
      const decision = decideAdmission(rec('seen-peer', 'observed', 'peer-presented'), card('seen-peer', [], []), 'talk')
      return { granted: decision.granted, detail: `level=observed max=${MAX_STAGE_BY_LEVEL['observed']} granted=${decision.granted}` }
    },
  },
  {
    id: 'R5',
    what: 'an admitted peer asking ABOVE its level — admitted reaches `talk`, not `receive-patch`',
    run: () => {
      const decision = decideAdmission(rec('admitted-peer', 'admitted', 'owner-admitted'), card('admitted-peer', [], []), 'receive-patch')
      return { granted: decision.granted, detail: `level=admitted max=${MAX_STAGE_BY_LEVEL['admitted']} requested=receive-patch granted=${decision.granted}` }
    },
  },
  {
    id: 'R6',
    what: 'a peer declaring a token OUTSIDE the closed vocabulary — unclassifiable is refused, never defaulted',
    run: () => {
      const decision = decideAdmission(rec('odd-peer', 'vetted', 'owner-admitted'), card('odd-peer', ['telepathy'], []), 'talk')
      return { granted: decision.granted, detail: `unknown=${privilegeAxis(card('odd-peer', ['telepathy'], []).declaration).unknownTokens.join(',')} granted=${decision.granted}` }
    },
  },
  {
    id: 'R7',
    what: 'an owner-ADMITTED peer declaring credentials+network BY CAPABILITY at propose-patch',
    run: () => {
      const decision = decideAdmission(rec('greedy-peer', 'vetted', 'owner-admitted'), card('greedy-peer', ['credentials', 'network'], []), 'propose-patch')
      return { granted: decision.granted, detail: `axisSource=${privilegeAxis(card('greedy-peer', ['credentials', 'network'], []).declaration).axisSource.credentials} granted=${decision.granted}` }
    },
  },
  {
    id: 'R8',
    what: 'the same admission at receive-patch — the ceiling is the stage, not the peer',
    run: () => {
      const fixture = exfiltrationRefusalFor()
      const decision = decideAdmission(fixture.record, fixture.card, fixture.stage)
      return { granted: decision.granted, detail: `stage=${fixture.stage} granted=${decision.granted}` }
    },
  },
  {
    id: 'R9',
    what: 'THE UNION CASE: credentials+network declared ONLY as a PROSE red line, no capability token at all',
    run: () => {
      const prose = card('prose-peer', [], ['reads credentials/secrets AND has network access'])
      const decision = decideAdmission(rec('prose-peer', 'vetted', 'owner-admitted'), prose, 'propose-patch')
      const axis = privilegeAxis(prose.declaration)
      return { granted: decision.granted, detail: `credentials=${axis.axisSource.credentials} network=${axis.axisSource.network} score=${axis.privilegeScore} granted=${decision.granted}` }
    },
  },
]

// ---------------------------------------------------------------------------
// GRANT CASES — 3 peers that must be admitted, so the harness cannot reward a wall.
// ---------------------------------------------------------------------------

const GRANT_CASES: readonly { readonly id: string; readonly what: string; readonly run: () => { readonly granted: boolean; readonly detail: string } }[] = [
  {
    id: 'G1',
    what: 'an owner-admitted peer at `talk` with nothing dangerous declared',
    run: () => {
      const decision = decideAdmission(rec('good-peer', 'vetted', 'owner-admitted'), card('good-peer', ['fs-read'], []), 'talk')
      return { granted: decision.granted, detail: `granted=${decision.granted} reasons=${decision.reasons.length}` }
    },
  },
  {
    id: 'G2',
    what: 'an owner-admitted peer at propose-patch declaring fs-read AND dynamic-code — classifiable and below the rung',
    run: () => {
      const decision = decideAdmission(rec('dev-peer', 'vetted', 'owner-admitted'), card('dev-peer', ['fs-read', 'dynamic-code'], []), 'propose-patch')
      const axis = privilegeAxis(card('dev-peer', ['fs-read', 'dynamic-code'], []).declaration)
      return { granted: decision.granted, detail: `score=${axis.privilegeScore} (below 3) granted=${decision.granted}` }
    },
  },
  {
    id: 'G3',
    what: 'a merely OBSERVED peer at `discover` — the ONE stage observation reaches, and it must be reachable',
    run: () => {
      const decision = decideAdmission(rec('seen-peer', 'observed', 'peer-presented'), card('seen-peer', [], []), 'discover')
      return { granted: decision.granted, detail: `granted=${decision.granted} reason="${decision.reasons.join(' ')}"` }
    },
  },
]

// ---------------------------------------------------------------------------
// INVARIANTS — 8 properties that hold regardless of any single case.
// ---------------------------------------------------------------------------

/** A path that must not exist, for the absence tests. */
const ABSENT_PATH = join(tmpdir(), 'dsh-meta-market-identity-absent-do-not-create.json')

/** INVARIANT I1 — an absent reading is not an empty store. */
function invariantAbsenceNotEmptiness(): Check {
  const reading = readTrustStore(ABSENT_PATH)
  const absentIsNull = reading.exists === false && reading.store === null && reading.reason !== null
  const notCoercedToEmpty = !(Array.isArray(reading.store))
  return {
    id: 'I1',
    what: 'an ABSENT store reads as store:null with a reason, never as an empty store',
    passed: absentIsNull && notCoercedToEmpty,
    detail: `exists=${reading.exists} store=${reading.store === null ? 'null' : 'non-null'} reason=${reading.reason === null ? 'ABSENT' : 'present'}`,
  }
}

/** INVARIANT I2 — the level ordering is total and `unknown` reaches NO stage. */
function invariantOrdering(): Check {
  const ranks = (['unknown', 'observed', 'admitted', 'vetted'] as const).map(l => TRUST_RANK[l])
  const ascending = ranks.every((r, i) => i === 0 || r > ranks[i - 1]!)
  const unknownReachesNothing = MAX_STAGE_BY_LEVEL['unknown'] === null
  const stagesAscend = TRUST_STAGES.length === 4 && TRUST_STAGES[0] === 'discover' && TRUST_STAGES[3] === 'receive-patch'
  return {
    id: 'I2',
    what: 'levels ascend strictly and `unknown` reaches NO stage (null, not discover)',
    passed: ascending && unknownReachesNothing && stagesAscend,
    detail: `ranks=${ranks.join('<')} unknown_max=${String(MAX_STAGE_BY_LEVEL['unknown'])} stages=${TRUST_STAGES.length}`,
  }
}

/** INVARIANT I3 — a peer cannot promote itself by what its card claims. */
function invariantNoSelfPromotion(): Check {
  const claims = ['owner', 'admin', 'root', 'vetted', 'system', 'core']
  const decisions = claims.map(c => decideAdmission(null, card('self-promoter', [c], []), 'receive-patch'))
  const allRefused = decisions.every(d => !d.granted)
  const allUnknown = decisions.every(d => d.level === 'unknown')
  return {
    id: 'I3',
    what: 'a card claiming any authority is refused — the card is a request, never a grant',
    passed: allRefused && allUnknown,
    detail: `claims=${claims.length} refused=${decisions.filter(d => !d.granted).length} level=unknown in ${decisions.filter(d => d.level === 'unknown').length}`,
  }
}

/** INVARIANT I4 — THE UNION. A prose red line alone must refuse exactly as a token does. */
function invariantUnion(): Check {
  const byToken = decideAdmission(rec('p', 'vetted', 'owner-admitted'), card('p', ['credentials', 'network'], []), 'propose-patch')
  const byProse = decideAdmission(rec('p', 'vetted', 'owner-admitted'), card('p', [], ['reads credentials/secrets AND has network access']), 'propose-patch')
  const proseOnly = privilegeAxis(card('p', [], ['reads credentials/secrets AND has network access']).declaration)
  const proseAxisReached = proseOnly.axisSource.credentials === 'redLines' && proseOnly.axisSource.network === 'redLines'
  const bothRefuse = !byToken.granted && !byProse.granted
  return {
    id: 'I4',
    what: 'THE UNION: a prose red line alone refuses exactly as a capability token does',
    passed: bothRefuse && proseAxisReached,
    detail: `byToken=${byToken.granted ? 'GRANTED' : 'refused'} byProse=${byProse.granted ? 'GRANTED' : 'refused'} proseAxis=${proseOnly.axisSource.credentials}/${proseOnly.axisSource.network}`,
  }
}

/** INVARIANT I5 — canonical form is stable and field-sensitive. */
function invariantCanonicalForm(): Check {
  const a = card('x', ['fs-write', 'fs-read'], ['z red line', 'a red line'])
  const b = card('x', ['fs-read', 'fs-write'], ['a red line', 'z red line'])
  const c = card('x', ['fs-read'], ['a red line', 'z red line'])
  const orderIndependent = cardFingerprint(a) === cardFingerprint(b)
  const fieldSensitive = cardFingerprint(a) !== cardFingerprint(c)
  const stable = canonicalCard(a) === canonicalCard(a)
  return {
    id: 'I5',
    what: 'card hashing is order-independent and still distinguishes a changed field',
    passed: orderIndependent && fieldSensitive && stable,
    detail: `reorderedEqual=${orderIndependent} changedDiffers=${fieldSensitive} stable=${stable}`,
  }
}

/** INVARIANT S1 — a READ does not WRITE. The absent path must still be absent afterwards. */
function invariantReadDoesNotWrite(): Check {
  const before = existsSync(ABSENT_PATH)
  readTrustStore(ABSENT_PATH)
  const after = existsSync(ABSENT_PATH)
  return {
    id: 'S1',
    what: 'reading an absent store does not create it — absence survives a read',
    passed: before === false && after === false,
    detail: `exists before=${before} after=${after} path=${trustStorePath('<root>')}`,
  }
}

/** INVARIANT S2 — every decision carries the rule AND the falsifier that would refute it. */
function invariantDecisionsAreFalsifiable(): Check {
  const decisions = [
    decideAdmission(null, card('a', [], []), 'discover'),
    decideAdmission(rec('b', 'vetted', 'owner-admitted'), card('b', [], []), 'talk'),
    decideAdmission(rec('c', 'vetted', 'owner-admitted'), card('c', ['credentials', 'network'], []), 'receive-patch'),
  ]
  const allHaveRule = decisions.every(d => d.rule.length > 40)
  const allHaveFalsifier = decisions.every(d => d.falsifier.length > 80)
  const allHaveReasons = decisions.every(d => d.reasons.length > 0)
  return {
    id: 'S2',
    what: 'every decision states its rule, its falsifier and at least one reason',
    passed: allHaveRule && allHaveFalsifier && allHaveReasons,
    detail: `rule=${allHaveRule} falsifier=${allHaveFalsifier} reasons=${allHaveReasons} decisions=${decisions.length}`,
  }
}

/** INVARIANT S3 — the deployment's honest self-report: an identifier, no key. */
function invariantTrustRootIsHonest(): Check {
  const key = deriveKeyMaterial()
  const id = readInstanceIdentity()
  const declaresNoKey = key.publicKey === null && key.kind === 'plan' && key.reason.length > 100
  const identityIsNotACredential = id.value === null || id.value.isIdentifierOnly === true
  const censusIsInternal = VOCABULARY_CENSUS.distinctCapabilityTokens === DECLARED_CAPABILITY_TOKENS.size
  return {
    id: 'S3',
    what: 'the module reports NO key material and marks the instance id as an identifier, not a credential',
    passed: declaresNoKey && identityIsNotACredential && censusIsInternal,
    detail: `key=${key.kind}/${key.publicKey === null ? 'no-public-key' : 'PUBLIC KEY PRESENT'} id=${id.value === null ? `unread (${(id.reason ?? 'no reason given').slice(0, 40)}…)` : `isIdentifierOnly=${id.value.isIdentifierOnly}`} vocabulary=${DECLARED_CAPABILITY_TOKENS.size}==${VOCABULARY_CENSUS.distinctCapabilityTokens}`,
  }
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------

const EMPTY_SIDE = REFUSAL_CASES.length === 0 || GRANT_CASES.length === 0
if (EMPTY_SIDE) {
  process.stderr.write(`INSTRUMENT FAILURE: a side is empty (refusal cases ${REFUSAL_CASES.length}, grant cases ${GRANT_CASES.length}). A count of 0 on both sides is not a pass.\n`)
  process.exit(2)
}

let refusalsCorrect = 0
for (const testCase of REFUSAL_CASES) {
  const outcome = testCase.run()
  if (!outcome.granted) refusalsCorrect += 1
  check(testCase.id, testCase.what, !outcome.granted, `${outcome.detail} — expected REFUSED`)
}

let grantsCorrect = 0
for (const testCase of GRANT_CASES) {
  const outcome = testCase.run()
  if (outcome.granted) grantsCorrect += 1
  check(testCase.id, testCase.what, outcome.granted, `${outcome.detail} — expected GRANTED`)
}

const invariants: readonly Check[] = [
  invariantAbsenceNotEmptiness(),
  invariantOrdering(),
  invariantNoSelfPromotion(),
  invariantUnion(),
  invariantCanonicalForm(),
  invariantReadDoesNotWrite(),
  invariantDecisionsAreFalsifiable(),
  invariantTrustRootIsHonest(),
]
for (const invariant of invariants) results.push(invariant)

const heldInvariants = invariants.filter(i => i.passed).length
const total = results.length
const passedTotal = results.filter(r => r.passed).length
const failed = results.filter(r => !r.passed)

process.stdout.write(`refusal cases: ${refusalsCorrect} of ${REFUSAL_CASES.length} correctly refused\n`)
process.stdout.write(`grant cases: ${grantsCorrect} of ${GRANT_CASES.length} correctly granted\n`)
process.stdout.write(`invariants: ${heldInvariants} of ${invariants.length} held\n`)

if (failed.length > 0) {
  process.stdout.write('\nFAILED CHECKS — each is a case the rule got wrong:\n')
  for (const f of failed) process.stdout.write(`  ${f.id}  ${f.what}\n      ${f.detail}\n`)
}

process.stdout.write(`TOTAL: ${passedTotal} of ${total} checks passed\n`)
process.exit(failed.length === 0 ? 0 : 1)
