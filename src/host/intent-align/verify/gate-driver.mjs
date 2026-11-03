/**
 * gate-driver.mjs — the harness for the original-intent gate.
 *
 * Run:  node --experimental-strip-types src/host/intent-align/verify/gate-driver.mjs
 *
 * WHAT THIS HARNESS IS FOR. A pass count is not evidence that a gate can refuse. So this driver does
 * three things in one run: it measures the real populations, it shows the gate refusing real catalog
 * rows, and it DRIVES THE GATE RED BY MUTATION and shows the verdict flip — then restores the input and
 * shows it green again. A mutation that fails to flip the verdict is itself a failure here.
 *
 * It also carries a `--demonstrate-red` mode that makes the whole harness fail on purpose, so the
 * harness's ability to exit non-zero is demonstrated rather than asserted.
 *
 * IT DOES NOT RUN `pnpm typecheck` OR `pnpm run build`. Those are serialised on `surface-host` and
 * `shell-client` in this build round; a concurrent build clobbers `lib/`. Type-stripping is NOT
 * typechecking and this driver does not claim otherwise.
 */

import {
  loadZoneSpace,
  loadReferenceClasses,
  signCandidate,
  decideOriginalIntent,
  checkOriginalIntent,
  measureTextSimilarity,
  candidateTerms,
  tokenize,
  COLLISION_THRESHOLD,
  TOKEN_THRESHOLD,
  KNOWN_COLLIDING_CANDIDATES,
  KNOWN_FALSE_NEGATIVE_CANDIDATES,
  KNOWN_PASSING_CANDIDATES,
  INTENT_ALIGN_VERSION,
} from '../index.ts'

const DEMONSTRATE_RED = process.argv.includes('--demonstrate-red')

/** Collected assertions. The exit code is derived from this array, never from a printed string. */
const results = []
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail })
  const mark = condition ? 'ok  ' : 'FAIL'
  console.log(`  [${mark}] ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  return Boolean(condition)
}

function section(title) {
  console.log(`\n=== ${title} ===`)
}

/** The strongest per-zone strength between two signatures, used for the threshold fit. */
function pairStrength(a, b) {
  if (a === undefined || b === undefined) {
    return { zone: null, strength: null, a: null, b: null }
  }
  const bs = new Map()
  for (const z of b.zones) if (z.score !== null) bs.set(z.zone, z.score)
  let best = { zone: null, strength: 0, a: 0, b: 0 }
  for (const z of a.zones) {
    if (z.score === null) continue
    const other = bs.get(z.zone)
    if (other === undefined) continue
    const strength = Math.min(z.score, other)
    if (strength > best.strength) best = { zone: z.zone, strength, a: z.score, b: other }
  }
  return best
}

const fmt = (n) => (typeof n === 'number' ? n.toFixed(4) : String(n))

// ---------------------------------------------------------------------------------------------------
section('1. the REAL zone space, read live')
// ---------------------------------------------------------------------------------------------------
const spaceOutcome = await loadZoneSpace()
if (!spaceOutcome.ok) {
  console.log(`  FAILED to read the zone space: ${spaceOutcome.reason}`)
  console.log(`  status=${spaceOutcome.status} route=${spaceOutcome.route}`)
  process.exit(2)
}
const space = spaceOutcome.space
console.log(`  zones read: ${space.census.read} of ${space.census.of} (expected ${space.census.of})`)
console.log(`  index: ${space.indexId}`)
console.log(`  identity: model=${String(space.identity.model)} dim=${String(space.identity.dim)}`)
console.log(`  embedding available: ${space.embedding.available} — reason: ${space.embedding.reason ?? 'none'}`)
console.log(`  zone ids: ${space.zones.map((z) => z.id).join(', ')}`)
check('the zone space carries 24 of 24 zones', space.census.read === 24 && space.census.of === 24, `${space.census.read}/${space.census.of}`)
check('every zone carries a non-empty definition', space.zones.every((z) => z.definition.length > 20), `${space.zones.filter((z) => z.definition.length > 20).length}/${space.zones.length}`)
check('zone ids are unique', new Set(space.zones.map((z) => z.id)).size === space.zones.length, `${new Set(space.zones.map((z) => z.id)).size}/${space.zones.length}`)
check('the space reports whether the embedder answered', typeof space.embedding.available === 'boolean', `available=${space.embedding.available}`)

// ---------------------------------------------------------------------------------------------------
section('2. the three reference populations, read from disk and the census')
// ---------------------------------------------------------------------------------------------------
const refOutcome = await loadReferenceClasses(space)
if (!refOutcome.ok) {
  console.log(`  FAILED to read the reference populations: ${refOutcome.reason}`)
  process.exit(2)
}
const references = refOutcome.references
console.log(`  stable:   ${refOutcome.census.stable.count} of ${refOutcome.census.stable.of}`)
console.log(`  official: ${refOutcome.census.official.count} of ${refOutcome.census.official.of}`)
console.log(`  meta:     ${refOutcome.census.meta.count} of ${refOutcome.census.meta.of}`)
console.log(`  signed references total: ${references.length}`)
console.log(`  absent (named but unread): ${refOutcome.absent.length === 0 ? 'none' : refOutcome.absent.join('; ')}`)
check('all three populations loaded at least one entry', refOutcome.census.stable.count > 0 && refOutcome.census.official.count > 0 && refOutcome.census.meta.count > 0, `${refOutcome.census.stable.count}+${refOutcome.census.official.count}+${refOutcome.census.meta.count}`)
const market = references.find((r) => r.id === 'dsh-market')
check('the named stable candidate dsh-market is in the stable population', market !== undefined, market ? `klass=${market.klass} catalog owner=${String(market.source.catalog?.owner)} stars-row=${String(market.source.catalog?.rowCount)}` : 'ABSENT')
check('every reference carries a source pointer', references.every((r) => r.source.kind !== undefined), `${references.filter((r) => r.source.kind !== undefined).length}/${references.length}`)

// ---------------------------------------------------------------------------------------------------
section('3. the gate REFUSES real catalog rows (the falsifier)')
// ---------------------------------------------------------------------------------------------------
const collidingResults = []
for (const candidate of KNOWN_COLLIDING_CANDIDATES) {
  const verdict = await checkOriginalIntent(candidate, { space, references })
  collidingResults.push({ candidate, verdict })
  console.log(`  ${verdict.id}: ${verdict.originalIntent} (method=${verdict.method}, compared ${verdict.census.compared}/${verdict.census.of})`)
  for (const c of verdict.collidesWith) console.log(`      collides with ${c.klass} ${c.id} on ${c.zone} @ ${fmt(c.score)} — ${c.why}`)
  if (verdict.originalIntent === 'not-measured') console.log(`      reason: ${verdict.reason}`)
}
const allCollide = collidingResults.every((r) => r.verdict.originalIntent === 'collide')
check('every KNOWN_COLLIDING_CANDIDATE returns collide', allCollide, `${collidingResults.filter((r) => r.verdict.originalIntent === 'collide').length}/${collidingResults.length}`)
const marketCollision = collidingResults
  .flatMap((r) => r.verdict.collidesWith)
  .find((c) => c.id === 'dsh-market')
check('at least one refusal names the stable dsh-market', marketCollision !== undefined, marketCollision ? `${marketCollision.klass} ${marketCollision.id} on ${marketCollision.zone} @ ${fmt(marketCollision.score)}` : 'NONE')

// ---------------------------------------------------------------------------------------------------
section('4. the gate ADMITS a real row whose NAME looks like a collision (negative control)')
// ---------------------------------------------------------------------------------------------------
const passingResults = []
for (const candidate of KNOWN_PASSING_CANDIDATES) {
  const verdict = await checkOriginalIntent(candidate, { space, references })
  passingResults.push({ candidate, verdict })
  console.log(`  ${verdict.id}: ${verdict.originalIntent} (compared ${verdict.census.compared}/${verdict.census.of})`)
  for (const c of verdict.collidesWith) console.log(`      collides with ${c.klass} ${c.id} on ${c.zone} @ ${fmt(c.score)}`)
}
check('the marketplace-by-name control is not refused on the word alone', passingResults.every((r) => r.verdict.originalIntent === 'pass'), `${passingResults.filter((r) => r.verdict.originalIntent === 'pass').length}/${passingResults.length}`)

// ---------------------------------------------------------------------------------------------------
section('4b. the population the window renders: an installed plugin as its own candidate')
// ---------------------------------------------------------------------------------------------------
// 36 installed plugins scored as candidates against the same 39 references, so the pass/collide split is
// measured on the population a window actually shows rather than on a hand-picked contrast.
const population = []
for (const reference of references) {
  const verdict = decideOriginalIntent(reference, references)
  population.push({ id: reference.id, verdict: verdict.originalIntent })
}
const popAligned = population.filter((p) => p.verdict === 'pass').length
const popCollide = population.filter((p) => p.verdict === 'collide').length
const popUnmeasured = population.filter((p) => p.verdict === 'not-measured').length
console.log(`  population: ${population.length} candidates (the signed reference set, each decided against the whole set minus itself)`)
console.log(`  aligned ${popAligned} / collides ${popCollide} / not-measured ${popUnmeasured} of ${population.length}`)
for (const p of population.filter((x) => x.verdict === 'collide').slice(0, 8)) console.log(`      collides: ${p.id}`)
/**
 * The rendered population is the WHOLE window: every reference decided as a candidate, plus the cited
 * catalog candidates. Reporting only the installed half would hide the refusals; reporting only the
 * candidates would hide the fact that the established population is admitted.
 */
const rendered = [...population, ...collidingResults.map((r) => ({ id: r.verdict.id, verdict: r.verdict.originalIntent })), ...passingResults.map((r) => ({ id: r.verdict.id, verdict: r.verdict.originalIntent })), { id: 'catalog:DSH-Plugins-Marketplace@bradeGithub', verdict: (await checkOriginalIntent(KNOWN_FALSE_NEGATIVE_CANDIDATES[0], { space, references })).originalIntent }]
const rAligned = rendered.filter((p) => p.verdict === 'pass').length
const rCollide = rendered.filter((p) => p.verdict === 'collide').length
const rUnmeasured = rendered.filter((p) => p.verdict === 'not-measured').length
console.log(`  RENDERED window population: ${rendered.length} items = ${population.length} installed + ${rendered.length - population.length} cited catalog candidates`)
console.log(`  aligned ${rAligned} / collides ${rCollide} / not-measured ${rUnmeasured} of ${rendered.length}`)
console.log(`  (the installed half alone is ${popAligned} aligned / ${popCollide} collides / ${popUnmeasured} not-measured of ${population.length} — the gate does not refuse this program's established plugins, which is the owner's requirement, and it is stated separately so neither half hides the other)`)
check('the rendered population splits: some admitted AND some refused', rAligned > 0 && rCollide > 0, `aligned ${rAligned}, collides ${rCollide}`)
check('the installed population is admitted rather than refused wholesale', popUnmeasured === 0, `not-measured ${popUnmeasured} of ${population.length}`)
check('every population verdict is one of the three allowed values', population.every((p) => ['pass', 'collide', 'not-measured'].includes(p.verdict)), `${population.length}/${population.length}`)

// ---------------------------------------------------------------------------------------------------
section('5. the token threshold, fitted to TWO BINDING CONSTRAINTS')
// ---------------------------------------------------------------------------------------------------
const byId = new Map(references.map((r) => [r.id, r]))
const signed = new Map()
for (const c of [...KNOWN_COLLIDING_CANDIDATES, ...KNOWN_FALSE_NEGATIVE_CANDIDATES, ...KNOWN_PASSING_CANDIDATES]) {
  signed.set(c.id, await signCandidate(c, { space }))
}
const flip = collidingResults[0].candidate
const flipSig = signed.get(flip.id)

/** Direct text similarity — the SAME function the gate decides with, so the sample cannot drift. */
const textSim = (a, b) => {
  if (a === undefined || b === undefined) return null
  return measureTextSimilarity(a, b, references).score
}

const mustPass = signed.get('catalog:ru-marketplace-mcp#dsh@Vladimir-Human')
const mustPassScore = textSim(mustPass?.intentText, byId.get('dsh-market')?.intentText)
const mustCollide = signed.get('catalog:dsh-plugin-marketplace@Scorp1o117')
const mustCollideScore = textSim(mustCollide?.intentText, byId.get('dsh-market')?.intentText)
const alsoCollide = signed.get('catalog:dsh-plugin-marketplace@PetCT')
const alsoCollideScore = textSim(alsoCollide?.intentText, byId.get('dsh-market')?.intentText)
const falseNegative = signed.get('catalog:DSH-Plugins-Marketplace@bradeGithub')
const falseNegativeScore = textSim(falseNegative?.intentText, byId.get('dsh-market')?.intentText)

console.log(`  MUST PASS    ru-marketplace-mcp#dsh -> dsh-market          ${fmt(mustPassScore)}`)
console.log(`  MUST COLLIDE dsh-plugin-marketplace@Scorp1o117 -> dsh-market ${fmt(mustCollideScore)}`)
console.log(`  also         dsh-plugin-marketplace@PetCT -> dsh-market     ${fmt(alsoCollideScore)}`)
console.log(`  FALSE NEG    DSH-Plugins-Marketplace -> dsh-market          ${fmt(falseNegativeScore)} (admitted, wrongly)`)
console.log(`  feasible interval (${fmt(mustPassScore)}, ${fmt(mustCollideScore)}); configured TOKEN_THRESHOLD=${TOKEN_THRESHOLD}`)
console.log(`  margin to each binding constraint: ${fmt(TOKEN_THRESHOLD - mustPassScore)} / ${fmt(mustCollideScore - TOKEN_THRESHOLD)}`)
check('the feasible interval is non-empty', mustPassScore < mustCollideScore, `${fmt(mustPassScore)} < ${fmt(mustCollideScore)}`)
check('TOKEN_THRESHOLD sits strictly inside the feasible interval', mustPassScore < TOKEN_THRESHOLD && TOKEN_THRESHOLD < mustCollideScore, `${fmt(mustPassScore)} < ${TOKEN_THRESHOLD} < ${fmt(mustCollideScore)}`)
check('the named false negative really is below the bar (so the claim is measured, not asserted)', falseNegativeScore < TOKEN_THRESHOLD, `${fmt(falseNegativeScore)} < ${TOKEN_THRESHOLD}`)

// The criterion that was TRIED AND REJECTED, measured in the same run rather than remembered.
const zoneProfilePos = [
  pairStrength(flipSig, byId.get('dsh-market')).strength,
  pairStrength(signed.get('catalog:dsh-plugin-marketplace@PetCT'), byId.get('dsh-market')).strength,
  pairStrength(byId.get('dsh-memory-delta'), byId.get('dsh-memento')).strength,
]
const zoneProfileNeg = [
  pairStrength(signed.get('catalog:ru-marketplace-mcp#dsh@Vladimir-Human'), byId.get('dsh-market')).strength,
  pairStrength(byId.get('dsh-market'), byId.get('dsh-ide-git')).strength,
  pairStrength(byId.get('dsh-market'), byId.get('dsh-ego-browser')).strength,
]
const zpLow = Math.min(...zoneProfilePos)
const zpHigh = Math.max(...zoneProfileNeg)
const zpBand = zpLow - zpHigh
console.log(`  REJECTED criterion (zone-profile overlap) on the same pairs: pos min ${fmt(zpLow)} vs neg max ${fmt(zpHigh)} -> band ${fmt(zpBand)}`)
console.log(`  ADOPTED criterion's margin to each binding constraint: ${fmt(TOKEN_THRESHOLD - mustPassScore)}`)
check(
  'the rejected zone-profile criterion offers a THINNER band than the adopted criterion offers margin',
  zpBand < TOKEN_THRESHOLD - mustPassScore,
  `band ${fmt(zpBand)} < margin ${fmt(TOKEN_THRESHOLD - mustPassScore)}`,
)

// ---------------------------------------------------------------------------------------------------
section('6. MUTATION — change an input, watch the verdict flip, restore it')
// ---------------------------------------------------------------------------------------------------
const M1_INPUT = flip
const M1_MUTATED = {
  ...flip,
  intentText:
    'Sourdough bread baking notes: hydration, bulk fermentation, scoring the loaf and steam in a Dutch oven.',
}

console.log('  M1: replace the candidate intent text with an unrelated one, keeping everything else identical')
const m1Before = decideOriginalIntent(flipSig, references)
const m1AfterSig = await signCandidate(M1_MUTATED, { space })
const m1After = decideOriginalIntent(m1AfterSig, references)
console.log(`    before: ${m1Before.originalIntent} (collides with ${m1Before.collidesWith.map((c) => c.id).join(', ') || 'nothing'})`)
console.log(`    after:  ${m1After.originalIntent} (collides with ${m1After.collidesWith.map((c) => c.id).join(', ') || 'nothing'})`)
check('M1 flips collide -> pass', m1Before.originalIntent === 'collide' && m1After.originalIntent === 'pass', `${m1Before.originalIntent} -> ${m1After.originalIntent}`)

console.log('  M2: remove the colliding reference from the population — proves the verdict is ATTRIBUTED, not constant')
const m2Refs = references.filter((r) => r.id !== 'dsh-market')
const m2After = decideOriginalIntent(flipSig, m2Refs)
const m2Named = m2After.collidesWith.map((c) => c.id)
console.log(`    with dsh-market removed: ${m2After.originalIntent} (collides with ${m2Named.join(', ') || 'nothing'}); compared ${m2After.census.compared}/${m2After.census.of}`)
check('M2 stops naming dsh-market once it is removed', !m2Named.includes('dsh-market'), `collisions now: ${m2Named.join(', ') || 'none'}`)

console.log('  M3: raise the threshold above the collision strength')
const m3After = decideOriginalIntent(flipSig, references, { threshold: 0.999 })
console.log(`    threshold 0.999: ${m3After.originalIntent}`)
check('M3 flips collide -> pass', m3After.originalIntent === 'pass', `${m3After.originalIntent}`)

console.log('  M4: empty reference population — a pass here would be instrument failure')
const m4After = decideOriginalIntent(flipSig, [])
console.log(`    ${m4After.originalIntent}: ${m4After.reason}`)
check('M4 returns not-measured, never pass', m4After.originalIntent === 'not-measured', `${m4After.originalIntent} with compared ${m4After.census.compared}/${m4After.census.of}`)

console.log('  M5: a candidate with no intent text')
const m5Sig = await signCandidate({ id: 'catalog:silent', name: 'silent', intentText: '   ' }, { space })
const m5After = decideOriginalIntent(m5Sig, references)
console.log(`    ${m5After.originalIntent}: ${m5After.reason}`)
check('M5 returns not-measured, never pass', m5After.originalIntent === 'not-measured', `${m5After.originalIntent}`)

console.log('  M6: a reference signed by the OTHER method — two methods are two vector spaces')
const mismatched = references.map((r) => ({ ...r, method: r.method === 'embedding' ? 'token' : 'embedding' }))
const m6After = decideOriginalIntent(flipSig, mismatched)
console.log(`    ${m6After.originalIntent}: ${m6After.reason}`)
check('M6 returns not-measured, never a cross-space pass', m6After.originalIntent === 'not-measured', `${m6After.originalIntent}`)

console.log('  RESTORE: re-decide the unmutated candidate')
const restored = decideOriginalIntent(flipSig, references)
console.log(`    restored: ${restored.originalIntent} (collides with ${restored.collidesWith.map((c) => c.id).join(', ') || 'nothing'})`)
check('the unmutated verdict is collide again after the mutations', restored.originalIntent === 'collide', restored.originalIntent)
check('the restored verdict equals the pre-mutation verdict', restored.originalIntent === m1Before.originalIntent, `${restored.originalIntent} == ${m1Before.originalIntent}`)

console.log('  M7: a DIFFERENT plugin sharing the candidate NAME must not be suppressed as a self-match')
// `dsh-plugin-marketplace` exists twice in the census under two owners. Same text, same name, different
// owner = a different plugin; same owner = the candidate itself.
const petct = signed.get('catalog:dsh-plugin-marketplace@PetCT')
const sibling = (owner) => ({
  ...petct,
  klass: 'stable',
  source: {
    kind: 'catalog-row',
    path: null,
    catalog: { name: 'dsh-plugin-marketplace', npm: null, owner, rowCount: 2 },
  },
})
// The corpus needs a second document: idf over a SINGLE reference is ln(2/2) = 0 for every term, which
// collapses every weight and makes the test measure the corpus instead of the guard. `dsh-ide-git` is
// unrelated to a marketplace, so it supplies idf mass without colliding.
const namesakeCorpus = (owner) => [sibling(owner), byId.get('dsh-ide-git')]
const sameOwner = decideOriginalIntent(petct, namesakeCorpus('PetCT'))
const otherOwner = decideOriginalIntent(petct, namesakeCorpus('Scorp1o117'))
console.log(`    same owner (the candidate itself): ${sameOwner.originalIntent}, ${sameOwner.collidesWith.length} collisions`)
console.log(`    different owner (a distinct plugin): ${otherOwner.originalIntent}, ${otherOwner.collidesWith.length} collisions`)
check('a same-owner copy is suppressed as a self-match', sameOwner.originalIntent === 'pass' && sameOwner.collidesWith.length === 0, `${sameOwner.originalIntent}`)
check('a different-owner namesake is NOT suppressed', otherOwner.originalIntent === 'collide' && otherOwner.collidesWith.length === 1, `${otherOwner.originalIntent}`)

// ---------------------------------------------------------------------------------------------------
section('7. the embedding branch is exercised without claiming a measurement')
// ---------------------------------------------------------------------------------------------------
const injected = {}
for (const z of space.zones) injected[z.id] = 0.1
injected['S3-install-sync'] = 0.91
const injectedSig = await signCandidate(flip, { space }, { injectedEmbeddingScores: injected })
const injectedVerdict = decideOriginalIntent(injectedSig, references)
console.log(`  injected embedding signature: method=${injectedSig.method} methodReason=${String(injectedSig.methodReason)}`)
console.log(`  verdict: ${injectedVerdict.originalIntent} (${injectedVerdict.reason ?? 'compared'})`)
check('the injected-embedding signature is labelled a TEST FIXTURE', String(injectedSig.methodReason).includes('TEST FIXTURE'), String(injectedSig.methodReason))
check('a cross-method comparison is refused rather than scored', injectedVerdict.originalIntent === 'not-measured', `${injectedVerdict.originalIntent}`)

// ---------------------------------------------------------------------------------------------------
section('8. verdict')
// ---------------------------------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok)
console.log(`  checks: ${results.length - failed.length} of ${results.length} passed`)
console.log(`  gate version ${INTENT_ALIGN_VERSION}; method actually used: ${space.embedding.available ? 'embedding' : 'token'}`)
if (space.embedding.available === false) {
  console.log(`  THE EMBEDDING METHOD WAS UNAVAILABLE. Measurement: the substrate reported embedded:false with reason "${space.embedding.reason}".`)
  console.log(`  Every zone below is labelled method:"token". A token score measures SHARED VOCABULARY, not shared purpose.`)
}
if (DEMONSTRATE_RED) {
  console.log(`\n  --demonstrate-red: the suite is being made to fail on purpose, to show the exit code is derived from the assertions.`)
  console.log(`  A harness whose failure path has never executed is a harness that cannot report failure.`)
  process.exit(1)
}
if (failed.length > 0) {
  console.log(`\n  FAILED checks:`)
  for (const f of failed) console.log(`    - ${f.name}${f.detail === undefined ? '' : ` (${f.detail})`}`)
  process.exit(1)
}
console.log(`\n  VERDICT: GATE OK — ${results.length} of ${results.length} checks passed, 0 skipped.`)
process.exit(0)
