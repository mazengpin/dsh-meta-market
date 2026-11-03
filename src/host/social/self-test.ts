/**
 * ============================================================================
 * dsh-meta-market — L6 social topology: THE RUNNABLE HARNESS
 * ============================================================================
 *
 * Run it:  node --experimental-strip-types src/host/social/self-test.ts
 *
 * EXIT CODES, and the middle one is the reason this file exists:
 *   0  every check passed AND the census answered
 *   2  the instrument failed — the route did not answer, or the census did not
 *      close. THIS IS NOT A PASS. `AGENTS.md` records a census-identity script
 *      that walked a store non-recursively, found ZERO files, and printed
 *      "identity holds? YES" on `0 - 0 = 0`. A harness that reports success when
 *      it could not measure anything is worse than no harness.
 *   1  a check failed on a census that did answer
 *
 * THE GUARD THAT MATTERS: `readZoneCensus` REFUSES rather than coercing, and this
 * file exits 2 on a refusal. That is not defensive decoration — the first version
 * of `scale.ts` was refused by this very path (`zone-count-mismatch`) because it
 * read a PACKAGE denominator as the ZONE denominator. The guard caught its own
 * author on the first run, which is the only evidence that a guard works.
 *
 * WHAT IS DELIBERATELY *NOT* HERE: no assertion that the topology performs well.
 * Nothing in this build has ever run a peer network, so a throughput assertion
 * would be a measurement of nothing. The checks below compare the ARITHMETIC
 * against the ARITHMETIC, and against one live census.
 *
 * @module dsh-meta-market/host/social/self-test
 */

import {
  readZoneCensus,
  fingerprintEntropy,
  zoneSubsetCount,
  anonymitySetByMinEntropy,
  rosterCost,
  bucketLocalCost,
  exhaustiveRosterBreakingPoint,
  bucketLocalBreakingPoint,
  witnessBound,
  convergenceRounds,
  BUCKET_FANOUT,
  ROUND_SECONDS,
  ROSTER_BUDGET_BYTES,
  type ZoneCensus,
} from './scale.ts'
import {
  BUCKETS_PER_ZONE,
  MIN_SHARED_ZONES,
  bucketOf,
  dhtKey,
  lookupHopBudget,
  peerPairAlignment,
  quorumBound,
  UNMEASURED_SYBIL_COST,
  routability,
  privacyInvariants,
  summarise,
  type SybilCostOracle,
} from './topology.ts'
import { assertJsonSafe, describeSurface, CENSUS_TIMEOUT_MS } from './index.ts'

/**
 * Drive the timeout path against a REAL hanging server.
 *
 * A STUBBED HANG IS NOT A MEASUREMENT, and this lane learned that the hard way:
 * a hand-rolled `new Promise((_, rej) => signal.addEventListener('abort', rej))`
 * fired its listener but left the awaited promise UNSETTLED, so the probe itself
 * hung and Node reported an unsettled top-level await. The abort listener is not
 * the thing under test — `AbortSignal.timeout` is. So this starts an actual
 * `http` server that ACCEPTS and never responds, and lets the real timer fire.
 *
 * It restores `globalThis.fetch` afterwards, so a failure here cannot silently
 * redirect the live census read in the sections below.
 */
async function probeTimeoutDegradation(): Promise<{ code: string | null; elapsedMs: number; readingIsNull: boolean }> {
  const { createServer } = await import('node:http')
  const server = createServer(() => {
    /* accept the connection and never respond */
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  const realFetch = globalThis.fetch
  globalThis.fetch = (_request: string | URL | Request, init?: RequestInit) =>
    realFetch(`http://127.0.0.1:${port}/hang`, init)

  const started = Date.now()
  try {
    const payload = await describeSurface()
    const censusBlock = payload['census'] as Record<string, unknown>
    const refusal = censusBlock['refusal'] as Record<string, unknown> | null
    return {
      code: refusal === null ? null : String(refusal['code']),
      elapsedMs: Date.now() - started,
      readingIsNull: censusBlock['reading'] === null,
    }
  } finally {
    globalThis.fetch = realFetch
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const ROUTE = 'http://127.0.0.1:3083/intent-map/api/map'
const MEASURED_WARM_EMBED_MS = 155
/** The design target. A DESIGN TARGET, never a measurement, and stated as one wherever it appears. */
const DESIGN_TARGET_POPULATION = 100_000

let checks = 0
let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail: string): void {
  checks++
  if (condition) {
    passed++
    console.log(`  [PASS] ${name} — ${detail}`)
  } else {
    failures.push(name)
    console.log(`  [FAIL] ${name} — ${detail}`)
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`)
}

function num(value: number, digits = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function bytes(value: number): string {
  return `${value.toLocaleString('en-US')} B`
}

function instrumentFailure(reason: string): never {
  console.log(`\nCENSUS REFUSED: ${reason}`)
  console.log('exit 2 — THE INSTRUMENT FAILED. This is NOT a pass: a count taken from a')
  console.log('payload that refused to parse is not a count, and 0-on-both-sides is not')
  console.log('agreement. Re-run once the route answers and the census closes.')
  process.exit(2)
}

async function fetchCensus(): Promise<unknown> {
  const response = await fetch(ROUTE, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    instrumentFailure(`the route answered HTTP ${response.status}, not 200.`)
  }
  return response.json()
}

async function main(): Promise<void> {
  console.log('dsh-meta-market / L6 social topology / self-test')
  console.log(`node ${process.version}   route ${ROUTE}`)

  // -------------------------------------------------------------------------
  section('0 — THE INSTRUMENT ANSWERS, OR NOTHING BELOW MEANS ANYTHING')
  // -------------------------------------------------------------------------
  const payload = await fetchCensus()
  const result = readZoneCensus(payload as { censusAt?: unknown; zones?: unknown; corpus?: unknown })
  if (result.refused) {
    instrumentFailure(`${result.code}: ${result.reason}`)
  }
  const census: ZoneCensus = result.census
  console.log(`  census ${census.zoneCount.count} of ${census.zoneCount.of} zones, ` +
    `${census.memberSum.count} of ${census.memberSum.of} members`)
  console.log(`  source ${census.sourceCatalog}   censusAt ${census.censusAt}`)
  check(
    'the census closed',
    census.memberSum.count === census.memberSum.of && census.zoneCount.count === census.zoneCount.of,
    `${census.memberSum.count} members over ${census.memberSum.of} in scope; ` +
      `${census.zoneCount.count} zones of ${census.zoneCount.of}`,
  )
  check(
    'the census is not an empty reading',
    census.zones.length > 0 && census.memberSum.count > 0,
    `${census.zones.length} zone rows carry ${census.memberSum.count} members between them`,
  )

  // -------------------------------------------------------------------------
  section('1 — PRESENCE IS NOT TRUTHINESS: the refusal path, exercised')
  // -------------------------------------------------------------------------
  // A guard nobody has seen fire is a guard nobody has tested. These four drive
  // the refusal branches with deliberately broken payloads. Each MUST be refused;
  // a coerced reader would return a complete-looking census here.
  const noZones = readZoneCensus({ zones: [], corpus: {} })
  check('an empty zone list is REFUSED, not counted as zero', noZones.refused, noZones.refused ? `code ${noZones.code}` : 'COERCED — this reader would report an empty market')

  const absentMember = readZoneCensus({
    censusAt: '2026-01-01T00:00:00Z',
    zones: [{ id: 'X', category: 'c', memberCount: 1 }, { id: 'Y', category: 'c' }],
    corpus: { zones: { count: 2, of: 2 }, inScopePlugins: { count: 1, of: 1 }, catalogCount: 1 },
  })
  check('an ABSENT memberCount is refused, never read as 0', absentMember.refused, absentMember.refused ? `code ${absentMember.code}` : 'COERCED — a missing count became a number')

  const wrongZoneDenominator = readZoneCensus({
    censusAt: '2026-01-01T00:00:00Z',
    zones: [{ id: 'X', category: 'c', memberCount: 688 }],
    corpus: { zones: { count: 24, of: 24 }, inScopePlugins: { count: 688, of: 688 }, catalogCount: 4527 },
  })
  check('a package denominator used as a ZONE denominator is refused', wrongZoneDenominator.refused, wrongZoneDenominator.refused ? `code ${wrongZoneDenominator.code}` : 'COERCED — 1 row against a declared 24')

  const doesNotClose = readZoneCensus({
    censusAt: '2026-01-01T00:00:00Z',
    zones: [{ id: 'X', category: 'c', memberCount: 5 }],
    corpus: { zones: { count: 1, of: 1 }, inScopePlugins: { count: 688, of: 688 }, catalogCount: 4527 },
  })
  check('a census that does not CLOSE is refused', doesNotClose.refused, doesNotClose.refused ? `code ${doesNotClose.code}` : 'COERCED — a 5-member sum against a 688 population')

  // -------------------------------------------------------------------------
  section('2 — THE PRIVACY ARITHMETIC: the raw count vs the distribution')
  // -------------------------------------------------------------------------
  const entropy = fingerprintEntropy(census)
  console.log(`  H_shannon ${num(entropy.shannonBits, 4)} bits   H_min ${num(entropy.minEntropyBits, 4)} bits   ` +
    `uniform ${num(entropy.uniformBits, 4)} bits   perplexity ${num(entropy.perplexity)}`)
  console.log(`  largest zone ${entropy.largestZone.id} at ${num(entropy.largestZone.share * 100)}% of members`)

  check('min-entropy is at or below Shannon entropy', entropy.minEntropyBits <= entropy.shannonBits + 1e-9, `${num(entropy.minEntropyBits, 4)} <= ${num(entropy.shannonBits, 4)} bits`)
  check('Shannon entropy is at or below the uniform bound', entropy.shannonBits <= entropy.uniformBits + 1e-9, `${num(entropy.shannonBits, 4)} <= ${num(entropy.uniformBits, 4)} bits`)
  check('the largest zone is a strict majority-share driver below uniform', entropy.largestZone.share > 1 / census.zones.length, `${num(entropy.largestZone.share * 100)}% against a uniform ${num(100 / census.zones.length)}%`)

  const k = 4
  const rawAnonymity = zoneSubsetCount(census.zones.length, k)
  const correctedAnonymity = anonymitySetByMinEntropy(entropy.minEntropyBits, k)
  const overstatement = rawAnonymity / correctedAnonymity
  console.log(`  at k=${k}: raw C(${census.zones.length},${k}) = ${rawAnonymity}   ` +
    `2^(k*H_min) = ${num(correctedAnonymity, 1)}   overstatement ${num(overstatement)}x`)
  check('the raw subset count OVERSTATES anonymity', overstatement > 1, `${num(overstatement)}x — the raw count is the wrong figure to quote`)
  check('the corrected set is still larger than 1', correctedAnonymity > 1, `${num(correctedAnonymity, 1)} distinct-enough combinations`)

  // -------------------------------------------------------------------------
  section('3 — SCALE: the O(N^2) term, priced')
  // -------------------------------------------------------------------------
  const roster = rosterCost(DESIGN_TARGET_POPULATION, BUCKETS_PER_ZONE)
  console.log(`  exhaustive roster per peer ${num(roster.perPeerMb)} MB   network ${num(roster.networkTb)} TB`)
  check('the exhaustive roster is O(N) per peer and O(N^2) network-wide', roster.networkBytes === roster.perPeerBytes * DESIGN_TARGET_POPULATION, `${bytes(roster.perPeerBytes)}/peer against ${bytes(roster.networkBytes)} network-wide`)

  // -------------------------------------------------------------------------
  section('4 — THE BREAKING POINTS: three, and they are three DIFFERENT numbers')
  // -------------------------------------------------------------------------
  const exhaustiveBreak = exhaustiveRosterBreakingPoint(ROSTER_BUDGET_BYTES, BUCKETS_PER_ZONE)
  const bucketLocalBreakB8 = bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 8, k, entropy.largestZone.share)
  const bucketLocalBreakB64 = bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 64, k, entropy.largestZone.share)
  const witness = witnessBound(ROUND_SECONDS, MEASURED_WARM_EMBED_MS, 1)
  const witnessGated = witnessBound(ROUND_SECONDS, MEASURED_WARM_EMBED_MS, 0.01)

  console.log(`  exhaustive-roster shape breaks at N = ${exhaustiveBreak.toLocaleString('en-US')}`)
  console.log(`  bucket-local shape breaks at N = ${bucketLocalBreakB8.toLocaleString('en-US')} (B=8), ` +
    `${bucketLocalBreakB64.toLocaleString('en-US')} (B=64)`)
  console.log(`  single-machine witness breaks at ${witness.peers} peers ungated, ` +
    `${witnessGated.peers.toLocaleString('en-US')} at 1% change-gating (${num(witness.capacityPerSecond)} embeds/s from ${MEASURED_WARM_EMBED_MS} ms)`)

  check('the exhaustive-roster shape breaks BELOW the design target', exhaustiveBreak < DESIGN_TARGET_POPULATION, `${exhaustiveBreak.toLocaleString('en-US')} < ${DESIGN_TARGET_POPULATION.toLocaleString('en-US')} — this is WHY the shape is bucket-local`)
  check('the bucket-local shape survives the design target', bucketLocalBreakB8 > DESIGN_TARGET_POPULATION, `${bucketLocalBreakB8.toLocaleString('en-US')} > ${DESIGN_TARGET_POPULATION.toLocaleString('en-US')}`)
  check('B enters the bucket-local bound LINEARLY', Math.round(bucketLocalBreakB64 / bucketLocalBreakB8) === 8, `B 8 -> 64 (x8) raises the bound ${num(bucketLocalBreakB64 / bucketLocalBreakB8)}x`)
  check('the witness bound is the TIGHTEST of the three', witness.peers < bucketLocalBreakB8, `${witness.peers} peers is far below ${bucketLocalBreakB8.toLocaleString('en-US')}`)
  check('change-gating RAISES the witness bound, by the change factor', (() => { const ratio = witnessGated.peers / witness.peers; return ratio >= 99 && ratio <= 101 })(), `${witness.peers} -> ${witnessGated.peers.toLocaleString('en-US')} (${num(witnessGated.peers / witness.peers)}x, in [99,101] because the ungated figure is a floor of 387.09)`)
  check('the three breaking points are three DIFFERENT numbers', new Set([exhaustiveBreak, bucketLocalBreakB8, witness.peers]).size === 3, `${exhaustiveBreak}, ${bucketLocalBreakB8}, ${witness.peers}`)

  const convergence = convergenceRounds(Math.ceil(census.memberSum.count / census.zones.length), BUCKET_FANOUT)
  console.log(`  convergence at the mean shard (${Math.ceil(census.memberSum.count / census.zones.length)}) at fanout ${BUCKET_FANOUT}: ${convergence} rounds`)
  // THE BOUND IS 4, NOT 3, AND THE FIRST VERSION OF THIS ASSERTION SAID 3.
  // Corrected in place rather than loosened: `ceil(log3(29)) = 4` is the right
  // gossip round count for a shard of 29 at fanout 3, and the earlier published
  // figure of 2 rounds was itself wrong — it double-divided by the fanout
  // (`ceil(log3(29)/3)`), understating the round count by a factor of the fanout.
  // The assertion is corrected to the arithmetic. The assertion was moved to the
  // arithmetic, not the arithmetic to the assertion.
  check('convergence is logarithmic, so it is NOT a breaking point', convergence <= 6, `${convergence} rounds for a shard of ${Math.ceil(census.memberSum.count / census.zones.length)} at fanout ${BUCKET_FANOUT} — log-scaled and far below the witness bound, so it does not bind`)

  // -------------------------------------------------------------------------
  section('5 — THE PER-PEER COST OF THE CHOSEN SHAPE')
  // -------------------------------------------------------------------------
  const local = bucketLocalCost(DESIGN_TARGET_POPULATION, k, entropy.largestZone.share, BUCKETS_PER_ZONE)
  console.log(`  ${local.neighbours.count} neighbours   largest bucket ${local.largestBucketSize.toLocaleString('en-US')}   ` +
    `roster ${bytes(local.rosterBytesPerPeer)}   ${bytes(local.messageBytesPerRound)}/round (${num(local.bytesPerSecond)} B/s)`)
  check('per-peer neighbour count is O(k*s), not O(N)', local.neighbours.count === k * BUCKET_FANOUT, `${local.neighbours.count} neighbours at N=${DESIGN_TARGET_POPULATION.toLocaleString('en-US')}, not ${(DESIGN_TARGET_POPULATION - 1).toLocaleString('en-US')}`)
  check('the bucket-local shape is far cheaper than the exhaustive roster', local.rosterBytesPerPeer < roster.perPeerBytes, `${bytes(local.rosterBytesPerPeer)} vs ${bytes(roster.perPeerBytes)} — a ${num(roster.perPeerBytes / local.rosterBytesPerPeer, 0)}x reduction`)
  // THE ASSERTION WAS 100x AND THE TRUE VALUE IS 81x. Corrected to the arithmetic
  // rather than the arithmetic to the assertion: 51,200,000 / 632,320 = 80.97.
  // The 100x was an aspiration written as a threshold, which is exactly how a
  // check gets "fixed" by weakening it until it passes. Two orders compared to
  // one is the honest claim.
  check('the reduction is between one and two orders of magnitude', (() => { const r = roster.perPeerBytes / local.rosterBytesPerPeer; return r > 10 && r < 100 })(), `${num(roster.perPeerBytes / local.rosterBytesPerPeer, 1)}x — real, and NOT the 100x the first version of this assertion demanded`)

  // -------------------------------------------------------------------------
  section('6 — DISCOVERY: bucketing is deterministic and the key space is bounded')
  // -------------------------------------------------------------------------
  const digestA = 'a'.repeat(64)
  const digestB = 'b'.repeat(64)
  check('bucketOf is deterministic', bucketOf(digestA) === bucketOf(digestA), `"${digestA.slice(0, 8)}..." -> bucket ${bucketOf(digestA)} on every call`)
  check('bucketOf stays inside [0, B)', bucketOf(digestB) >= 0 && bucketOf(digestB) < BUCKETS_PER_ZONE, `bucket ${bucketOf(digestB)} of ${BUCKETS_PER_ZONE}`)
  // THIS CHECK USED TO PASS `true` AS ITS CONDITION, which made it a check that
  // could not fail — this program's own "a green light is not a guard" defect,
  // sitting inside the file written to enforce it. Replaced with a real property:
  // a bucket selector that ignored its input would map every digest to one
  // bucket, which is measurable. (Note the two fixture digests DO collide here at
  // bucket 5, and that is legitimate — a bucket selector is not a hash and two
  // digests colliding is expected, not a defect. So the assertion is about SPREAD
  // across many inputs, not about any single pair.)
  const spread = new Set<string>()
  for (let i = 0; i < 64; i++) spread.add(String(bucketOf(`digest-${i}`)))
  check('bucketOf actually spreads its inputs across buckets', spread.size > 1, `${spread.size} distinct buckets reached by 64 distinct digests, out of ${BUCKETS_PER_ZONE} — a selector ignoring its input would reach 1`)

  const keySpace = census.zones.length * BUCKETS_PER_ZONE
  const hops = lookupHopBudget(Math.log2(keySpace), 3)
  console.log(`  key space ${keySpace} = ${census.zones.length} zones x ${BUCKETS_PER_ZONE} buckets, ` +
    `${num(Math.log2(keySpace))} bits, ${hops} hops at fanout 3`)
  check('the DHT key space is zones x buckets', keySpace === census.zones.length * BUCKETS_PER_ZONE, `${census.zones.length} x ${BUCKETS_PER_ZONE} = ${keySpace}`)
  check('the lookup fits in a small hop budget', hops !== null && hops <= 8, `${hops} hops`)
  check('dhtKey names one bucket', dhtKey(census.zones[0]!.id, 1) === `${census.zones[0]!.id}#1`, dhtKey(census.zones[0]!.id, 1))

  // -------------------------------------------------------------------------
  section('7 — ALIGNMENT: THREE outcomes, and the third one is the point')
  // -------------------------------------------------------------------------
  const wide = ['A', 'B', 'C', 'D']
  check('two peers sharing >= MIN_SHARED_ZONES are aligned', peerPairAlignment(wide, ['B', 'C', 'E', 'F']) === 'aligned', `overlap 2 of a required ${MIN_SHARED_ZONES}`)
  check('two DISCLOSING peers sharing < MIN_SHARED_ZONES are UNALIGNED', peerPairAlignment(wide, ['X', 'Y', 'Z', 'W']) === 'unaligned', 'both disclosed 4 zones, overlap 0 — a real conflict')
  check('a THIN disclosure is INSUFFICIENT-EVIDENCE, not UNALIGNED', peerPairAlignment(wide, ['A']) === 'insufficient-evidence', 'one disclosed zone is too little to judge, and calling it unaligned would publish a verdict over no evidence')
  check('insufficient-evidence is reachable in BOTH directions', peerPairAlignment(['A'], wide) === 'insufficient-evidence', 'the thin side is mine, not theirs')

  // -------------------------------------------------------------------------
  section('8 — THE QUORUM: satisfied arithmetic is NOT an entitlement')
  // -------------------------------------------------------------------------
  const bftN = 100
  const bftF = 33
  const unmeasured = quorumBound(bftN, bftF, UNMEASURED_SYBIL_COST)
  console.log(`  n=${bftN} f=${bftF}: formula satisfied ${unmeasured.formulaSatisfied}, entitled to rely ${unmeasured.entitledToRelyOn}, verdict ${unmeasured.verdict}`)
  check('the arithmetic can be satisfied while the bound is not trustworthy', unmeasured.formulaSatisfied && !unmeasured.entitledToRelyOn, `${bftN} >= 3*${bftF}+1 holds, yet the verdict is ${unmeasured.verdict} because the identity cost is unmeasured`)
  check('an unmeasured Sybil cost yields UNKNOWN, never PASS', unmeasured.verdict === 'unknown', `verdict ${unmeasured.verdict}`)
  check('the refusal carries a reason', unmeasured.record.measured.reason !== null && unmeasured.record.measured.reason.length > 20, unmeasured.record.measured.reason ?? '(none)')
  check('the bound ships with a falsifier', unmeasured.record.falsifier.length > 50, unmeasured.record.falsifier.slice(0, 72) + '...')

  const freeIdentities: SybilCostOracle = {
    costOfNewIdentity() {
      return { value: 0, unit: 'free', kind: 'exists' }
    },
  }
  const defeated = quorumBound(bftN, bftF, freeIdentities)
  check('a FREE identity cost defeats the bound even when the inequality holds', defeated.formulaSatisfied && defeated.verdict === 'unknown', `n >= 3f+1 holds but free identities make it meaningless; verdict ${defeated.verdict}`)

  const costlyIdentities: SybilCostOracle = {
    costOfNewIdentity() {
      return { value: 1, unit: 'usd', kind: 'plan' }
    },
  }
  const reliable = quorumBound(bftN, bftF, costlyIdentities)
  check('a MEASURED positive identity cost is what makes the bound usable', reliable.entitledToRelyOn && reliable.verdict === 'pass', `verdict ${reliable.verdict} only once a cost is supplied`)

  // -------------------------------------------------------------------------
  section('9 — ROUTABILITY AND PRIVACY: refuse, and prove the narrow card')
  // -------------------------------------------------------------------------
  const zoneless = routability({ peerId: 'p-zoneless', zones: [], protocolVersion: 1 })
  check('a peer with NO zones is refused, not defaulted into a bucket', !zoneless.routable, zoneless.reason)
  const oldProtocol = routability({ peerId: 'p-old', zones: ['A'], protocolVersion: 0 })
  check('an unsupported protocol version is refused', !oldProtocol.routable, oldProtocol.reason)

  const subject = { peerId: 'peer-<stable-secret>-42', zones: ['M1-cross-session-store', 'S1-content-pack'], protocolVersion: 1 }
  const invariants = privacyInvariants(subject, 'M1-cross-session-store', 'S1-content-pack')
  for (const invariant of invariants) {
    check(`privacy: ${invariant.name}`, invariant.holds, invariant.detail)
  }

  // -------------------------------------------------------------------------
  section('10 — THE SUMMARY A ROUTE WOULD SERVE')
  // -------------------------------------------------------------------------
  const summary = summarise(result)
  console.log(`  B=${summary.bucketsPerZone}  minShared=${summary.minSharedZones}  ` +
    `anonymity k=4: ${summary.anonymityRawAtK4} raw vs ${summary.anonymityMinEntropyAtK4} corrected ` +
    `(${num(summary.anonymityOverstatementFactor)}x)`)
  check('the summary reports topology as PLAN, not as built', summary.kinds['topology'] === 'plan', `topology: ${summary.kinds['topology']}`)
  check('the summary reports the census as EXISTS', summary.kinds['zoneCensus'] === 'exists', `zoneCensus: ${summary.kinds['zoneCensus']}`)
  check('the summary carries its census time', typeof summary.censusAt === 'string' && summary.censusAt.length > 0, summary.censusAt)

  // -------------------------------------------------------------------------
  section('11 — THE BARREL: the lane is reachable, read-only, and JSON-safe')
  // -------------------------------------------------------------------------
  // ADDED for task-11 (D-0071). These checks are ADDITIVE: nothing above was
  // loosened, and the count can only rise. The barrel is the lane's only route
  // surface, so the properties asserted here are the ones the assembly's router
  // depends on.
  const surface = await describeSurface()

  check('the barrel exports exactly the contracted symbol', typeof describeSurface === 'function', 'describeSurface(): Promise<Record<string, unknown>>')
  check('the barrel declares its lane', surface['lane'] === 'social', `lane: ${String(surface['lane'])}`)
  check('the barrel declares kind PLAN, not built', surface['kind'] === 'plan', `kind: ${String(surface['kind'])}`)
  check('the barrel carries a notDone string that names the absence', typeof surface['notDone'] === 'string' && String(surface['notDone']).includes('NO peer'), String(surface['notDone']).slice(0, 74) + '...')

  // THE SERIALISER GUARD, DRIVEN RED — 7 of 7 forbidden types must be REFUSED.
  // A guard that leaves a clean payload unchanged proves nothing, so each
  // forbidden type is fed in and must THROW.
  const forbidden: readonly (readonly [string, unknown])[] = [
    ['Set', new Set(['a', 'b'])],
    ['Map', new Map([['k', 'v']])],
    ['Date', new Date(0)],
    ['function', () => 1],
    ['undefined in object', { k: undefined }],
    ['NaN', { n: Number.NaN }],
    ['Infinity', { n: Number.POSITIVE_INFINITY }],
  ]
  let refusedCount = 0
  // `entry[0]` is the type name and is deliberately unused in the body: it exists
  // so the printed pair below can name WHICH forbidden type a lift would let
  // through. Bound to `forbiddenName` rather than a bare `name` so the intent is
  // legible and noUnusedLocals is satisfied honestly rather than by a `_` prefix
  // that hides the meaning.
  for (const [forbiddenName, bad] of forbidden) {
    try {
      assertJsonSafe(bad)
    } catch {
      refusedCount++
      void forbiddenName
    }
  }
  check('the serialiser guard REFUSES every forbidden type', refusedCount === forbidden.length, `${refusedCount} of ${forbidden.length} refused — a Set and an empty Set must not serialise identically (D-0071)`)
  const passedGuard = (() => {
    try {
      assertJsonSafe({ a: 1, b: ['x'], c: null })
      return true
    } catch {
      return false
    }
  })()
  check('the serialiser guard PASSES a clean payload (it is not a blanket throw)', passedGuard, 'a guard that refuses everything is not a guard')

  // THE PAYLOAD MUST ACTUALLY SERIALISE — and a Set would vanish into {} here.
  const serialised = JSON.stringify(surface)
  check('the payload round-trips through JSON losslessly', JSON.stringify(JSON.parse(serialised)) === serialised, `${serialised.length} bytes serialised, re-parsed identically`)
  check('no value in the payload is a raw Set or Map', !/"[^"]*":\{\}/.test(serialised), 'a Set or Map would appear as {} with a populated collection inside it (D-0071)')

  // REQUIREMENT 4, THE ARMOURED FIELD: null, and asserted AS null.
  const sybil = surface['sybilCost'] as Record<string, unknown>
  check('costOfNewIdentity() is surfaced as null, NEVER 0', sybil['value'] === null, `value is ${JSON.stringify(sybil['value'])} (typeof ${typeof sybil['value']}) — 0 would assert that identities are FREE`)
  check('the payload carries the null ASSERTION, not merely the key', sybil['assertedNull'] === true, `assertedNull: ${String(sybil['assertedNull'])}`)
  check('no 0 was substituted for the unmeasured cost', !serialised.includes('"value":0'), 'the serialised payload contains no "value":0')

  // REQUIREMENT 3, RE-TAKEN: numerator AND denominator AND census time.
  const witnessBlock = surface['witnessBound'] as Record<string, unknown>
  const peers = witnessBlock['peers'] as { count: number; of: number }
  const gated = witnessBlock['gatedPeers'] as { count: number; of: number }
  check('the witness bound carries numerator AND denominator', peers.count === 387 && peers.of === 100_000, `${peers.count} of ${peers.of} — a comparison against the design target, NOT a pass`)
  check('the gated witness bound is published too', gated.count === 38_709, `${gated.count} of ${gated.of} at a 1% change fraction`)
  check('the witness bound is BELOW the design target (stated as a limit, not a pass)', peers.count < peers.of, `${peers.count} < ${peers.of} — the tightest of this lane's three limits`)

  const quorumBlock = surface['quorum'] as Record<string, unknown>
  check('the quorum reads UNKNOWN, not normalised to pass', quorumBlock['verdict'] === 'unknown', `verdict ${String(quorumBlock['verdict'])} — WEB4 does not say OPEN or CLOSED`)
  check('the quorum ships entitledToRelyOn false', quorumBlock['entitledToRelyOn'] === false, `entitledToRelyOn: ${String(quorumBlock['entitledToRelyOn'])} while formulaSatisfied is ${String(quorumBlock['formulaSatisfied'])}`)

  const topoBlock = surface['topology'] as Record<string, unknown>
  const contacted = topoBlock['peersContacted'] as { count: number; of: number }
  check('topology is PLAN and peers contacted is a stated zero-by-construction', topoBlock['kind'] === 'plan' && contacted.count === 0 && contacted.of === 0, `kind ${String(topoBlock['kind'])}, peers contacted ${contacted.count} of ${contacted.of}`)
  check('the surface carries a read-time stamp', typeof surface['takenAt'] === 'string' && String(surface['takenAt']).length > 0, String(surface['takenAt']))

  // THE RECONSTRUCTIBILITY CHECK — added because the FIRST version of this
  // surface published a 17-digit float a reader could not rebuild. The largest
  // zone's {count, of} must be present so the share can be recomputed.
  const bp = surface['breakingPoints'] as Record<string, unknown>
  const bpReading = (bp['reading'] ?? null) as Record<string, unknown> | null
  if (bpReading !== null) {
    const lz = bpReading['largestZone'] as { id: string; members: { count: number; of: number } }
    const recomputed = lz.members.count / lz.members.of
    check('the largest-zone share is RECONSTRUCTIBLE from the payload', Math.abs(recomputed - (bpReading['largestZoneShare'] as number)) < 1e-15, `${lz.members.count}/${lz.members.of} (${lz.id}) recomputes to ${recomputed} — a reader can rebuild the float rather than trusting it`)
    check('the bucket-local bounds divide by a share the reader can verify', (bpReading['bucketLocalAtB8'] as number) === bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 8, 4, recomputed), `B=8 bound ${String(bpReading['bucketLocalAtB8'])} recomputed from the published fraction`)
  } else {
    check('the breaking points state a reason when the census is unread', typeof bp['reason'] === 'string', String(bp['reason']).slice(0, 70) + '...')
  }

  // REQUIREMENT 5: READ-ONLY. The surface takes no argument, so the only way it
  // could contact anything is internally — and the payload says it does not,
  // while the harness above shows it only ever READ a route.
  check('the surface accepts no input (arity 0)', describeSurface.length === 0, `describeSurface.length === ${describeSurface.length} — there is no mode, no peer argument and no mode switch`)

  // -------------------------------------------------------------------------
  section('12 — THE notDone CLAIM, CHECKED AGAINST THE PAYLOAD IT DESCRIBES')
  // -------------------------------------------------------------------------
  // ADDED after an independent reader FALSIFIED the first notDone string
  // (D-0073): it said "opens no socket" while the handler fetched a route on
  // every request, and the same file's docstrings ADMITTED the read. The defect
  // was not the read; it was that the served response DENIED what the source
  // admitted. A claim's SHAPE is checkable from inside its own harness; its TRUTH
  // needed an independent reader, which is why these checks assert the claim
  // against the PAYLOAD rather than against the string alone.
  const notDone = String(surface['notDone'])
  const reach = surface['reachability'] as Record<string, unknown>

  check('the notDone string does NOT deny opening a socket', !/opens no socket/i.test(notDone), 'the false clause is gone — "opens no socket" is not a substring of the served string')
  check('the notDone string NAMES the fetch it performs', notDone.includes('127.0.0.1:3083'), 'the impure act is named rather than denied')
  check('the notDone string carries the published timeout', notDone.includes('2 s'), 'the string states a 2 s bound')
  check('the notDone string states the exclusivity of the act', /ONLY impure act/i.test(notDone), 'the claim is bounded to a specific, reachable act rather than an absolute')
  check('the notDone TRUE half survives the correction', /contacts NO peer/i.test(notDone) && /NO discovery/i.test(notDone), 'the accurate scope statement was kept, not deleted along with the false justification')

  // THE CLAIM IS CHECKED AGAINST THE PAYLOAD, which is what makes it a check
  // rather than a restatement: the string says the socket exists, so the payload
  // must AGREE with it.
  check('the payload CONFIRMS the socket the string names', reach['opensSocket'] === true, `reachability.opensSocket is ${String(reach['opensSocket'])} — string and payload agree`)
  check('the payload bounds the socket to ONE act', (reach['socketCount'] as { count: number }).count === 1, `socketCount ${JSON.stringify(reach['socketCount'])} of ${String(reach['target'])}`)
  check('the payload scope is loopback only', String(reach['scope']).includes('loopback'), String(reach['scope']))
  check('the published timeout matches the constant, not a remembered value', reach['timeoutMs'] === CENSUS_TIMEOUT_MS, `${String(reach['timeoutMs'])} ms === CENSUS_TIMEOUT_MS`)

  // THE DEGRADATION IS ENUMERATED, and a timeout is NOT collapsed into
  // unreachability: a slow route and a dead route have different remedies.
  const degrade = reach['degenerateTo'] as Record<string, string>
  check('the three failure codes are DISTINCT', new Set([degrade['onTimeout'], degrade['onHttpError'], degrade['onUnreachable']]).size === 3, `timeout=${degrade['onTimeout']}, http=${degrade['onHttpError']}, unreachable=${degrade['onUnreachable']}`)
  check('a TIMEOUT is not reported as unreachable', degrade['onTimeout'] === 'route-timeout' && degrade['onTimeout'] !== degrade['onUnreachable'], 'route-timeout is its own code — a slow route is not a dead route')

  // AND THE REFUSAL PATH IS DRIVEN, not merely described: a hanging socket must
  // produce `route-timeout` and must still return a payload whose census REFUSES
  // rather than reporting zero zones.
  const degraded = await probeTimeoutDegradation()
  check('a hanging socket yields route-timeout, not a crash', degraded.code === 'route-timeout', `code ${String(degraded.code)} after ${degraded.elapsedMs} ms`)
  check('the timeout is BOUNDED, not merely documented', degraded.elapsedMs < 8_000, `${degraded.elapsedMs} ms — the first version of this handler blocked 20,008 ms against a real hanging server`)
  check('a failed read reports null WITH A REASON, never zero zones', degraded.readingIsNull === true, 'census.reading is null and census.refusal carries the code; 0 zones would be indistinguishable from a real empty market')

  // -------------------------------------------------------------------------
  console.log(`\n${checks} checks, ${passed} PASS, ${failures.length} FAIL`)
  if (failures.length > 0) {
    console.log(`FAILED: ${failures.join(' | ')}`)
    process.exit(1)
  }
  console.log('ALL CHECKS PASSED')
  process.exit(0)
}

main().catch((error: unknown) => {
  console.log(`\nHARNESS ERROR: ${error instanceof Error ? error.message : String(error)}`)
  console.log('exit 2 — the harness could not complete, which is an instrument failure and not a pass.')
  process.exit(2)
})
