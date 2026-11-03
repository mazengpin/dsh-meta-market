/**
 * The lane's self-test: N controls, each asserting an outcome, plus the negative control that proves
 * the checker can FAIL.
 *
 * Two assertions were REMOVED because the compiler proved them vacuous, and that is a finding rather
 * than a nuisance. `tsc` reported `TS2367` for `r.verdict === 'refused-uncertain' && r.verdict !==
 * 'no-zone'`: the first operand narrows the union, so the second comparison was provably TRUE and
 * tested nothing. That is a stronger statement than the runtime check was — "an unmeasured run is not
 * a finding" is guaranteed by the TYPE, not by a passing test — so the assertion was removed rather
 * than written around, because a check that cannot fail is not a check. The count below is
 * INCREMENTED as checks execute rather than declared as a literal, so `controlsRun === 0` is a real
 * guard instead of an unfalsifiable one.
 */
import type { EmbeddingIdentity } from '../../shared/protocol.ts'
import { alignPackage, ZONE_WRITE_POLICY } from './operator.ts'
import type { AlignmentInput } from './operator.ts'
import { buildCensus, LIVE_CATALOG_NOT_MEASURED } from './census.ts'
import type { IndexFacts } from './census.ts'
import { guardIdentity, preflightIdentity } from './identity.ts'
import { ALIGN_THRESHOLD, ALIGN_THRESHOLD_VALUE, clearsThreshold } from './threshold.ts'
import type { AlignmentCensus, AlignmentVerdict, ZoneScore } from './types.ts'

/** A counter, incremented by `check()` — never a literal, so `=== 0` is reachable in principle. */
let controlsRun = 0
const failures: string[] = []

function check(label: string, condition: boolean): void {
  controlsRun += 1
  if (!condition) failures.push(label)
}

function score(zoneId: string, similarity: number | null, reason: string | null = null): ZoneScore {
  return {
    zoneId,
    similarity: { value: similarity, reason: similarity === null ? reason : null },
    aboveThreshold: similarity !== null && similarity >= ALIGN_THRESHOLD_VALUE,
  }
}

const indexIdentity: EmbeddingIdentity = {
  model: 'qwen3-embedding:0.6b',
  dim: 1024,
  modelSource: 'declared-config',
  endpoint: 'http://127.0.0.1:11434/api/embed',
}

/** The real substrate reading, census 2026-10-16T16:48Z. */
const indexFacts: IndexFacts = {
  model: 'qwen3-embedding:0.6b',
  dim: 1024,
  zonesIndexed: { count: 24, of: 24 },
  zonesStale: { count: 0, of: 24 },
  freshness: 'fresh',
  builtAt: '2026-10-15T21:54:25.432Z',
  indexCensusAt: '2026-10-15T15:22:03.708Z',
  sourceCatalog: 'research/cache/plugins-2026-10-12.json',
  catalogCount: 4527,
  catalogUpdated: '2026-10-12',
}

const ALIGNMENT_AT = '2026-10-16T16:55:00Z'
const healthCensus = buildCensus(indexFacts, LIVE_CATALOG_NOT_MEASURED, ALIGNMENT_AT)

function input(
  packageId: string,
  zones: readonly ZoneScore[],
  identity = guardIdentity(indexIdentity, indexIdentity),
  census: AlignmentCensus = healthCensus,
): AlignmentInput {
  return { packageId, zones, identity, census, threshold: ALIGN_THRESHOLD, alignmentAt: ALIGNMENT_AT }
}

// ---------------------------------------------------------------------------------------------
// 1-4. POSITIVES. Measured top-1 cosines on the live route: 0.768, 0.770, 0.800, 0.8616.
// ---------------------------------------------------------------------------------------------
const p1 = alignPackage(input('mem-durable', [score('M1-cross-session-store', 0.8616)]))
check('P1 a package occupying a zone is `aligned`', p1.verdict === 'aligned')
check('P1 the zone is named', p1.best.value?.zoneId === 'M1-cross-session-store')
check('P1 the coarse verdict is `pass`', p1.record.verdict === 'pass')

const p2 = alignPackage(input('fork-rewind', [score('S4-fork-edit-rewind', 0.8)]))
check('P2 a second positive aligns', p2.verdict === 'aligned')

const p3 = alignPackage(input('skill-sync', [score('S3-install-sync', 0.77)]))
check('P3 the lowest measured positive still aligns', p3.verdict === 'aligned')

const p4 = alignPackage(input('compaction', [score('S1-compaction-context', 0.768)]))
check('P4 the exact lowest positive aligns at the threshold', p4.verdict === 'aligned')

// ---------------------------------------------------------------------------------------------
// 5-6. THE NAMED MUST-REFUSE NEGATIVE CONTROLS. Sourdough 0.4722, cricket 0.53.
// ---------------------------------------------------------------------------------------------
const n1 = alignPackage(input('sourdough-recipe', [score('S1-content-pack', 0.4722)]))
check('N1 the sourdough control MUST NOT align', n1.verdict === 'no-zone')
check('N1 no zone is reported above the threshold', n1.zonesAboveThreshold.count === 0)
// `no-zone` maps to the COARSE verdict `pass`: the OPERATION completed, it is the RESULT that is
// empty. Asserting `record.verdict === 'fail'` here would be wrong, which is why SHARED_VERDICT_OF
// is exported as data.
check('N1 the coarse verdict is `pass`, not `fail` — the operation completed', n1.record.verdict === 'pass')

const n2 = alignPackage(input('cricket-scoreboard', [score('S3-nav-search', 0.53)]))
check('N2 the cricket control MUST NOT align', n2.verdict === 'no-zone')

// ---------------------------------------------------------------------------------------------
// 7. THE CONTROL THAT PROVES THE THRESHOLD IS DOING THE WORK.
// If the sourdough package aligns at a low threshold, the refusal came from the SCORES and not from
// the threshold. If it does not, the threshold is decoration.
// ---------------------------------------------------------------------------------------------
const lowered = { ...ALIGN_THRESHOLD, value: 0.4 }
const n3 = alignPackage({
  packageId: 'sourdough-recipe-low-threshold',
  zones: [score('S1-content-pack', 0.4722)],
  identity: guardIdentity(indexIdentity, indexIdentity),
  census: healthCensus,
  threshold: lowered,
  alignmentAt: ALIGNMENT_AT,
})
check('C1 the same package DOES align at a 0.4 threshold, so the threshold is load-bearing', n3.verdict === 'aligned')

// ---------------------------------------------------------------------------------------------
// 8. IDENTITY MISMATCH — the guard must refuse and name BOTH models.
// ---------------------------------------------------------------------------------------------
const liveLaya: EmbeddingIdentity = {
  model: 'Laya-Q8_0.gguf',
  dim: 1024,
  modelSource: 'server-self-report',
  endpoint: 'http://127.0.0.1:8080/v1/systemone',
}
const mismatch = guardIdentity(indexIdentity, liveLaya)
check('I1 a changed model does NOT agree', mismatch.agrees.value === false)
check('I2 the refusal names the INDEX model', (mismatch.refusalReason.value ?? '').includes('qwen3-embedding:0.6b'))
check('I3 the refusal names the LIVE model', (mismatch.refusalReason.value ?? '').includes('Laya-Q8_0.gguf'))
const r8 = alignPackage(input('mem-durable', [score('M1-cross-session-store', 0.8616)], mismatch))
check('I4 a mismatch REFUSES rather than scoring', r8.verdict === 'refused-identity')
check('I5 the coarse verdict is `refused`', r8.record.verdict === 'refused')

// SAME WIDTH, DIFFERENT MODEL — the substitution a dim-only guard would wave through.
check('I6 the two models share a width, so a dim-only guard would have passed them', indexIdentity.dim === liveLaya.dim)

// ---------------------------------------------------------------------------------------------
// 9. AN UNREADABLE LIVE IDENTITY IS `null`, NOT `false`, AND IT ALSO REFUSES.
// ---------------------------------------------------------------------------------------------
const unreadable: EmbeddingIdentity = { model: null, dim: null, modelSource: null, endpoint: null }
const unknownGuard = guardIdentity(indexIdentity, unreadable)
check('U1 an unreadable live identity is null, not false', unknownGuard.agrees.value === null)
check('U2 null is distinguishable from false', unknownGuard.agrees.value !== false)
const r9 = alignPackage(input('mem-durable', [score('M1-cross-session-store', 0.8616)], unknownGuard))
check('U3 an unreadable identity REFUSES — the guard fails closed', r9.verdict === 'refused-identity')

// ---------------------------------------------------------------------------------------------
// 10. INTEGRITY STALENESS — an unsound index refuses WITHOUT SCORING.
// ---------------------------------------------------------------------------------------------
const unsound = buildCensus({ ...indexFacts, freshness: 'stale' }, LIVE_CATALOG_NOT_MEASURED, ALIGNMENT_AT)
check('S1 an unsound index is not permitted to score', !unsound.integrityOk)
const r10 = alignPackage(input('mem-durable', [score('M1-cross-session-store', 0.99)], undefined, unsound))
check('S2 an unsound index REFUSES even with a 0.99 similarity', r10.verdict === 'refused-uncertain')
check('S3 the record records no measurement', r10.record.measured.value === null)

// ---------------------------------------------------------------------------------------------
// 11. THE ZERO-SIMILARITY SET — gate 3. This is the instrument-failure control.
// ---------------------------------------------------------------------------------------------
const r11 = alignPackage(input('nothing-supplied', []))
check('Z1 zero supplied zones is `refused-uncertain`, NOT `no-zone`', r11.verdict === 'refused-uncertain')
check('Z2 the denominator is a real 0 of 0 and is reported', r11.zonesScored.count === 0 && r11.zonesScored.of === 0)
check('Z3 the denial is not reported as a measurement', r11.record.measured.value === null)

// ---------------------------------------------------------------------------------------------
// 12. THE ALL-ABSENT SET — the second shape of gate 3, which an array-length check would MISS.
// ---------------------------------------------------------------------------------------------
const absentAll = [score('M1-cross-session-store', null, 'the substrate did not embed the query')]
const r12 = alignPackage(input('embedded-nothing', absentAll))
check('A1 a NON-EMPTY array of all-absent scores is still `refused-uncertain`', r12.verdict === 'refused-uncertain')
check('A2 the array length is 1, so an array-length-only gate would not fire', absentAll.length === 1)
check('A3 the absence carries its reason', (r12.zones[0]?.similarity.reason ?? '').length > 0)

// ---------------------------------------------------------------------------------------------
// 13. ABSENT SCORES SORT LAST AND ARE NEVER COMPARED AS 0.
// ---------------------------------------------------------------------------------------------
const mixed = [
  score('S4-fork-edit-rewind', null, 'not scored'),
  score('M1-cross-session-store', 0.86),
]
const r13 = alignPackage(input('mixed', mixed))
check('M1 a real score outranks an absent one', r13.best.value?.zoneId === 'M1-cross-session-store')
check('M2 the absent zone is retained in the result, not dropped', r13.zones.length === 2)
check('M3 one of two was scored', r13.zonesScored.count === 1 && r13.zonesScored.of === 2)

// `clearsThreshold` must not coerce.
const absentCompare = clearsThreshold({ value: null, reason: 'unmeasured' }, ALIGN_THRESHOLD_VALUE)
check('M4 an absent score is not above the threshold', !absentCompare.above)
check('M5 and it carries a reason', absentCompare.reason !== null)
check('M6 a NaN is uncomparable rather than low', clearsThreshold({ value: Number.NaN, reason: null }, ALIGN_THRESHOLD_VALUE).reason !== null)

/**
 * THE CONTROL THAT MAKES THE COERCION DETECTABLE — and it exists because the NEGATIVE CONTROL FAILED
 * WITHOUT IT, which is this harness's most useful result.
 *
 * The mutation injected to prove this harness can go RED was the comparator
 * `(b.similarity.value ?? 0) - (a.similarity.value ?? 0)` — an absent score coerced to 0, the exact
 * defect this program has paid for three times. The harness reported ALL 58 CONTROLS PASSED against
 * the mutated operator. The reason is a fixture gap, not a comparator that was secretly fine: every
 * "real" score in the fixtures was POSITIVE, and an absent score coerced to 0 still sorts BELOW a
 * positive score, so the two comparators were indistinguishable on this data.
 *
 * A cosine similarity is in [-1, 1], so a REAL score can be negative. Add one, and the two
 * comparators separate immediately: correct behaviour ranks the real -0.2 ABOVE the absent reading,
 * while coercion ranks the absent reading (as 0) above it. This is the "a check that cannot fail is
 * not a check" rule firing on the harness itself.
 */
const negMixed = [
  score('M4-consolidation-lifecycle', null, 'not scored'),
  score('S9-session-hygiene', -0.2),
]
const r14 = alignPackage(input('negative-similarity', negMixed))
check('K1 a REAL negative score outranks an ABSENT one', r14.best.value?.zoneId === 'S9-session-hygiene')
check('K2 the winner is the real -0.2, so an absent score was never read as 0', r14.best.value?.similarity.value === -0.2)

// ---------------------------------------------------------------------------------------------
// 14. THE CENSUS — the trap, the delta, and the not-measured-is-not-zero rule.
// ---------------------------------------------------------------------------------------------
check('C2 the currency caveat is populated ALTHOUGH the live catalog was not measured', healthCensus.currencyStale)
check('C3 the caveat names the index catalog date', healthCensus.currencyCaveat.includes('2026-10-12'))
check('C4 the caveat states the live catalog was NOT measured this run', healthCensus.currencyCaveat.includes('NOT measured'))
check('C5 the unmeasured live count is null, never 0', healthCensus.liveCatalogCount.value === null)
check('C6 the unmeasured live count carries a reason', (healthCensus.liveCatalogCount.reason ?? '').length > 0)
check('C7 no delta is computed from an absent reading', healthCensus.catalogDelta.value === null)
check('C8 the index catalog count keeps its denominator', healthCensus.indexCatalogCount.count === 4527 && healthCensus.indexCatalogCount.of === 4527)
check('C9 24 of 24 zones indexed', healthCensus.zonesIndexed.count === 24 && healthCensus.zonesIndexed.of === 24)

const measuredCensus = buildCensus(indexFacts, { value: 4765, reason: null }, ALIGNMENT_AT)
check('C10 a measured live catalog yields a real delta', measuredCensus.catalogDelta.value === 238)
check('C11 the delta percent is 5.26', Math.abs((measuredCensus.catalogDeltaPercent.value ?? 0) - 5.2578) < 0.01)
check('C12 the caveat changes when the live catalog IS measured', measuredCensus.currencyCaveat.includes('was measured at 4765'))
const alignedResult = alignPackage(input('skill-sync', [score('S3-install-sync', 0.8)]))
check('C13 currency staleness DOWNSHIFTS rather than refuses', alignedResult.verdict === 'aligned' && alignedResult.dated)
check('C14 the dated reason is the census caveat', (alignedResult.datedReason.value ?? '').includes('2026-10-12'))

// ---------------------------------------------------------------------------------------------
// 15. THE PROTOCOL SHAPE.
// ---------------------------------------------------------------------------------------------
check('V1 the verdict set is closed at 5 members', (() => {
  const seen: AlignmentVerdict[] = ['aligned', 'no-zone', 'refused-identity', 'refused-uncertain', 'unknown']
  return new Set(seen).size === 5
})())
check('V2 the write policy proposes and does not write', ZONE_WRITE_POLICY.mode === 'propose')
check('V3 the write policy declares the plan kind', ZONE_WRITE_POLICY.kind === 'plan')
check('V4 the pre-flight passes on a matching model', preflightIdentity('qwen3-embedding:0.6b', indexIdentity).value === null)
check('V5 the pre-flight catches a mismatched model', preflightIdentity('Laya-Q8_0.gguf', indexIdentity).value !== null)
check('V6 the threshold is provisional', ALIGN_THRESHOLD.provisional)
check('V7 the threshold records its provenance', ALIGN_THRESHOLD.provenance === 'PROGRAM CHOICE')
check('V8 the threshold carries a falsifier', ALIGN_THRESHOLD.falsifier.length > 0)
/**
 * V9 originally asserted `marginToPositives === marginToNegatives` and FAILED, and the failure is a
 * finding rather than a nuisance: the symmetry is exact in arithmetic and FALSE in IEEE-754 double.
 * Measured: `0.768 - 0.6605 = 0.10750000000000004` and `0.6605 - 0.553 = 0.10749999999999993`,
 * differing by 1.11e-16 — about one ULP. (The exact midpoint `(0.553 + 0.768) / 2` is itself
 * `0.6605000000000001`, so the stored 0.6605 is not even the representable midpoint.) The claim
 * "the threshold sits at the midpoint" is therefore true to ~1e-16 and must be ASSERTED that way;
 * a strict `===` on derived floats tests the display precision, not the arithmetic.
 */
check(
  'V9 the margins are symmetric at the midpoint, to within one ULP (strict === is false: 1.11e-16 apart)',
  (() => {
    const a = ALIGN_THRESHOLD.marginToPositives.value
    const b = ALIGN_THRESHOLD.marginToNegatives.value
    if (a === null || b === null) return false
    return Math.abs(a - b) < 1e-12
  })(),
)
check('V10 both margins are positive', (ALIGN_THRESHOLD.marginToPositives.value ?? -1) > 0)

// ---------------------------------------------------------------------------------------------
// REPORT — the denominator is counted, not asserted.
// ---------------------------------------------------------------------------------------------
/**
 * The declared denominator. It read 56 on the first run and the harness reported `58 of 56`, i.e. the
 * DECLARATION was wrong rather than the code — which is the guard working. `grep -c '^check('` now
 * returns 58 and this pins it: if a control is ever deleted, this number and the counted number stop
 * agreeing and the run exits 3 rather than passing quietly.
 */
const EXPECTED = 60
if (controlsRun === 0) {
  console.error('INSTRUMENT FAILURE: zero controls ran. A 0 on both sides is not a pass.')
  process.exit(2)
}
console.log(`controls run: ${String(controlsRun)} of ${String(EXPECTED)} expected`)
console.log(`failures: ${String(failures.length)}`)
for (const f of failures) console.log(`  FAIL: ${f}`)
if (failures.length > 0) process.exit(1)
if (controlsRun !== EXPECTED) {
  console.error(
    `INSTRUMENT FAILURE: ${String(controlsRun)} controls ran but ${String(EXPECTED)} were expected — the count and the code disagree, so one of them is wrong.`,
  )
  process.exit(3)
}
console.log('ALL CONTROLS PASSED')
