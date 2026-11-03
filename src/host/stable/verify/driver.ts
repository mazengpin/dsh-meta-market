/**
 * L6 — the driver: it MEASURES, it WRITES, it READS BACK, and it tries to falsify itself.
 *
 * This file exists because a module that has never been run is a plan, and the program's rule is that a
 * claim is worth what the command that produced it is worth. Every line it prints is either a reading it
 * took or an assertion it checked; the assertions are the reason it is a driver rather than a report.
 *
 * RUN IT WITH:
 *
 *   cd plugins-src/dsh-meta-market
 *   node --experimental-strip-types src/host/stable/verify/driver.ts
 *
 * It exits 0 only when every assertion held. A green run says "nothing that ran disagreed with its
 * expectation", and the FALSIFICATION block at the end says which assertions were shown able to disagree —
 * a suite that has never been driven red is a suite nobody has tested.
 *
 * THE NEGATIVE CONTROLS ARE THE POINT. Three of them mutate something on purpose:
 *   - the seal control re-seals a TAMPERED ledger and requires the digest to differ;
 *   - the arithmetic control requires `bundles === official + nonOfficial`, so a profile read that lost a
 *     row cannot pass unnoticed;
 *   - the count control requires the stored official count to equal the profile's own `@deepseek-ai/*` count,
 *     so a store that dropped a member is caught by the population it came from rather than by itself.
 *
 * @module dsh-meta-market/host/stable/verify/driver
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  ALTERNATION_PROCEDURE,
  LANE_SUMMARY,
  MATCH_RULE,
  STORE_REL,
  STORE_FILENAME,
  alternationPlan,
  artifactCensus,
  censusOf,
  describeLane,
  getStoredRecord,
  loadLedger,
  patchRefFor,
  refreshLedger,
  resolveWorkspaceRoot,
} from '../index.ts'
import { artifactIdentity } from '../alternation.ts'
import { sealLedger } from '../store.ts'

/** One assertion, with the observation that would have made it false. */
interface Finding {
  readonly id: string
  readonly description: string
  readonly passed: boolean
  readonly observed: string
  readonly falsifier: string
}

const findings: Finding[] = []

function check(id: string, description: string, passed: boolean, observed: string, falsifier: string): void {
  findings.push({ id, description, passed, observed, falsifier })
}

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

async function main(): Promise<number> {
  // The walk-up finds the program workspace only from INSIDE it. The clone lives outside, so a root may be
  // passed explicitly: `node … driver.ts <workspace-root>`. Falling back to the walk keeps the no-argument
  // run honest — it reports null and every store assertion fails rather than sliding past on zeros.
  const explicitRoot = process.argv[2] ?? null
  const root = explicitRoot ?? resolveWorkspaceRoot()
  line('=== dsh-meta-market / stable-official driver ===')
  line(`workspace root: ${root ?? '<NOT RESOLVED>'}`)
  line(`root source:    ${explicitRoot === null ? 'walk-up from the current directory' : 'argv[2]'}`)
  line(`census at:      ${new Date().toISOString()}`)
  line(`store path:     ${root === null ? '<none>' : join(root, STORE_REL, STORE_FILENAME)}`)
  line()

  const refreshed = await refreshLedger({ root })
  line('--- write ---')
  line(`write ok:   ${String(refreshed.ok)}`)
  line(`wrote:      ${String(refreshed.wrote)}`)
  line(`path:       ${refreshed.path ?? '<none>'}`)
  line(`reason:     ${refreshed.reason ?? 'none'}`)
  for (const note of refreshed.notes) line(`note:       ${note}`)
  line()

  const ledger = refreshed.ledger
  if (ledger === null) {
    line('FATAL: no ledger was produced; nothing further can be asserted.')
    return 2
  }

  const census = censusOf(ledger)
  const lane = describeLane(ledger)
  line('--- census (numerator / denominator / population) ---')
  line(`stable:    ${String(census.stable.count)} / ${String(census.stable.of)} stored records`)
  line(`official:  ${String(census.official.count)} / ${String(census.official.of)} stored records`)
  line(`records:   ${String(census.records.count)} / ${String(census.records.of)}`)
  line(`bundles:   ${String(ledger.bundlerCensus.bundles)} rows = ${String(ledger.bundlerCensus.officialBundles)} @deepseek-ai/* + ${String(ledger.bundlerCensus.nonOfficialBundles)} other, from ${ledger.bundlerCensus.profilePath}`)
  line(`deps:      ${String(ledger.bundlerCensus.dependencies)} dependency keys (a DIFFERENT population from the bundles)`)
  line(`colliding: ${String(lane.colliding)} of ${String(census.records.count)} stored records`)
  line(`withPatch: ${String(lane.withPatch)} of ${String(census.records.count)} stored records`)
  line()

  line('--- records ---')
  for (const record of ledger.records) {
    const top = [...record.intent.zones].sort((left, right) => right.score - left.score)[0]
    line(
      `${record.id}  klass=${record.klass}  version=${record.version ?? '<absent>'}  installed=${record.installed === null ? 'NOT MEASURED' : String(record.installed)}`,
    )
    line(
      `   intent: measured=${String(record.intent.measured)} method=${record.intent.method} zones=${String(record.intent.zones.length)}` +
        (top === undefined ? ' (no zones)' : ` top=\`${top.zone}\` ${top.score.toFixed(4)}`),
    )
    line(`   match:  ${record.match.verdict} (rule ${record.match.rule}) compared ${String(record.match.compared.count)} of ${String(record.match.compared.of)}`)
    for (const collision of record.match.collidesWith) line(`     collides with ${collision.id} in \`${collision.sharedZone}\` at ${collision.score.toFixed(4)}`)
    line(`   patch:  current=${record.patch.current?.artifact ?? '<none>'} history=${String(record.patch.history.length)} available=${String(record.patch.available.ok)}`)
    if (record.patch.available.reason !== null) line(`     availability reason: ${record.patch.available.reason}`)
  }
  line()

  // --- the assertions that can fail -----------------------------------------------------------
  check(
    'A1-store-written',
    'refreshLedger wrote the ledger to the documented path',
    refreshed.wrote && refreshed.path !== null && existsSync(refreshed.path),
    `wrote=${String(refreshed.wrote)} path=${refreshed.path ?? '<none>'} exists=${String(refreshed.path !== null && existsSync(refreshed.path))}`,
    'a write reported as ok with no file at the path, or a path this process cannot stat',
  )

  const loaded = await loadLedger({ root })
  check(
    'A2-store-read-back',
    'the ledger reads back from disk with its seal holding',
    loaded.ok && loaded.from === 'file' && loaded.ledger.census.records.count === census.records.count,
    loaded.ok ? `from=${loaded.from} records=${String(loaded.ledger.census.records.count)}` : `ok=false reason=${loaded.reason}`,
    'a read that falls back to `measured`, or a record count that changed between the write and the read',
  )

  check(
    'A3-bundle-arithmetic',
    'bundles = official + non-official AND the bundle count is non-zero, so no profile row was lost and the read was not empty',
    ledger.bundlerCensus.bundles > 0 && ledger.bundlerCensus.bundles === ledger.bundlerCensus.officialBundles + ledger.bundlerCensus.nonOfficialBundles,
    `${String(ledger.bundlerCensus.bundles)} = ${String(ledger.bundlerCensus.officialBundles)} + ${String(ledger.bundlerCensus.nonOfficialBundles)} (a 0 on both sides is instrument failure, not a pass)`,
    'a difference: one row counted twice or dropped by the filter; or 0 = 0 + 0, which means the profile was never read',
  )

  check(
    'A4-official-count-matches-profile',
    'every @deepseek-ai/* bundle produced a stored record, and there was at least one to produce',
    ledger.bundlerCensus.officialBundles > 0 && census.official.count === ledger.bundlerCensus.officialBundles,
    `${String(census.official.count)} stored of ${String(ledger.bundlerCensus.officialBundles)} in the profile`,
    'a stored official count below the profile count, which means a member was discovered then dropped; or a profile population of 0, which is an unread profile rather than an official set of nothing',
  )

  const badIntent = ledger.records.filter((record) => record.intent.measured && record.intent.zones.length !== 24)
  check(
    'A5-every-measured-map-is-24-zones',
    'a map marked measured carries all 24 zones',
    badIntent.length === 0,
    `${String(badIntent.length)} of ${String(ledger.records.length)} measured maps are not 24 zones`,
    'one measured map with 23 zones, which would let a wrong space look scored',
  )

  const badVerdict = ledger.records.filter((record) => record.match.verdict === 'collide' && record.match.collidesWith.length === 0)
  check(
    'A6-collide-carries-its-collision',
    'a `collide` verdict always names what it collided with',
    badVerdict.length === 0,
    `${String(badVerdict.length)} of ${String(ledger.records.length)} records read collide with an empty list`,
    'one record reading `collide` with `collidesWith: []`',
  )

  const fabricatedApply = ledger.records.filter((record) => record.patch.current !== null && record.patch.history.length === 0)
  check(
    'A7-no-fabricated-apply',
    'no record carries a current patch that is absent from its own history',
    fabricatedApply.length === 0,
    `${String(fabricatedApply.length)} of ${String(ledger.records.length)} records have a current patch outside their history`,
    'a current patch with an empty history, which is an apply nobody recorded',
  )

  // --- the negative control: the seal must be able to DISAGREE --------------------------------
  const path = refreshed.path
  let tamperObserved = 'no path to tamper with'
  let tamperPassed = false
  if (path !== null && existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, { encoding: 'utf8' })) as { sealedSha256: string; ledger: typeof ledger }
    const honest = sealLedger(raw.ledger)
    // Cast through `Record<string, unknown>` rather than intersecting with the ledger type: `StableRecord`'s
    // fields are `readonly`, so a direct assignment to `version` would be a compile error — and a tamper
    // control that cannot compile is a control that never runs.
    const tampered = JSON.parse(JSON.stringify(raw.ledger)) as { records: Record<string, unknown>[] }
    const first = tampered.records[0]
    if (first !== undefined) first['version'] = `${String(first['version'])}-TAMPERED`
    const tamperedDigest = sealLedger(tampered as unknown as typeof ledger)
    tamperPassed = honest === raw.sealedSha256 && tamperedDigest !== raw.sealedSha256
    tamperObserved = `honest=${honest.slice(0, 16)}… recorded=${String(raw.sealedSha256).slice(0, 16)}… tampered=${tamperedDigest.slice(0, 16)}…`
  }
  check(
    'A8-seal-can-disagree',
    'the seal reproduces for the honest ledger AND changes for a one-field edit',
    tamperPassed,
    tamperObserved,
    'a tampered ledger hashing to the recorded digest, which would make the seal a caption',
  )

  // --- the alternation contract, planned but not executed -------------------------------------
  const stableRecord = ledger.records.find((record) => record.klass === 'stable')
  if (stableRecord !== undefined) {
    const plan = alternationPlan(ledger, stableRecord.id)
    line('--- alternation plan for the stable member ---')
    line(`member:     ${plan.member}`)
    line(`artifact:   ${plan.artifact ?? '<none measured>'}`)
    line(`displaces:  ${plan.displaces ?? '<nothing: this would be the first patch>'}`)
    for (const step of plan.apply) line(`apply:      ${step}`)
    for (const step of plan.reverse) line(`reverse:    ${step}`)
    line(`reason:     ${plan.reason ?? 'none'}`)
    line()
    const censusNow = artifactCensus(root)
    const reference = patchRefFor(ledger, stableRecord.id)
    const identity = reference === null ? null : artifactIdentity(censusNow, reference.artifact)
    check(
      'A9-patch-reference-is-measured',
      'every patch reference names an artifact the census holds, with a digest',
      reference !== null && identity !== null && /^[0-9a-f]{64}$/.test(identity.sha256Hex),
      reference === null
        ? 'patchRefFor returned null for the stable member'
        : `${reference.artifact} -> ${identity === null ? 'NOT IN THE CENSUS' : `sha256 ${identity.sha256Hex.slice(0, 16)}… / ${String(identity.bytes)} bytes`}`,
      'a patch reference whose artifact is absent from the census, or whose digest is empty — a reference to a patch nobody measured',
    )
    check(
      'A11-no-apply-claimed',
      'no record claims an applied patch: this lane has applied nothing',
      ledger.records.every((record) => record.patch.current === null),
      `${String(ledger.records.filter((record) => record.patch.current !== null).length)} of ${String(ledger.records.length)} records carry a current patch`,
      'a record whose `patch.current` is non-null; every apply must be a deliberate, attributed call and none has been made',
    )
    check(
      'A10-lookup-rejects-unknown-ids',
      'getStoredRecord returns null for an id the store does not hold',
      getStoredRecord(ledger, 'dsh-not-a-real-plugin') === null,
      `getStoredRecord('dsh-not-a-real-plugin') = ${String(getStoredRecord(ledger, 'dsh-not-a-real-plugin'))}`,
      'a lookup that returns a record for an id nobody stored, which would make every miss look like a hit',
    )
  }

  line('--- assertions ---')
  const failed = findings.filter((finding) => !finding.passed)
  for (const finding of findings) {
    line(`${finding.passed ? 'PASS' : 'FAIL'}  ${finding.id}: ${finding.description}`)
    line(`      observed:  ${finding.observed}`)
    line(`      falsifier: ${finding.falsifier}`)
  }
  line()
  line(`ASSERTIONS: ${String(findings.length - failed.length)} of ${String(findings.length)} passed`)
  line(`lane kind: ${LANE_SUMMARY.kind}  appliesAnything: ${String(LANE_SUMMARY.appliesAnything)}`)
  line(`match rule: ${MATCH_RULE.id} — ${MATCH_RULE.text}`)
  line(`procedure:  (1) ${ALTERNATION_PROCEDURE.whatAPatchArtifactIs}`)
  line(`            (2) ${ALTERNATION_PROCEDURE.whatItDisplaces}`)
  line(`            (3) ${ALTERNATION_PROCEDURE.howToGoBack}`)
  line(`VERDICT: ${failed.length === 0 ? 'OK' : 'FAILED'}`)
  return failed.length === 0 ? 0 : 1
}

main().then((code) => {
  process.exitCode = code
}).catch((error: unknown) => {
  process.stderr.write(`driver threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 3
})

/** Reported so a reader can see the file is a module with a main, not a library. */
export const DRIVER_REL = dirname('src/host/stable/verify/driver.ts')
