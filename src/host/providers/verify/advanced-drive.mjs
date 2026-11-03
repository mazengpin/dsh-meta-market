/**
 * A DRIVER for `providers/advanced.ts` — the four Advanced windows, driven directly.
 *
 * WHY THIS EXISTS RATHER THAN A ROUTE CALL
 *
 * `dsh-meta-market` is not mounted on this profile, so no HTTP surface serves
 * these windows. That is exactly the state in which this program has repeatedly
 * published a `0` produced by an instrument that could not see its subject. So the
 * provider is driven IN-PROCESS here, and every assertion below is a check that can
 * FAIL — the run exits non-zero when one does.
 *
 * WHAT IT CHECKS, and each is deliberately a condition that has been made able to
 * disagree:
 *
 *   A1  four windows are built, one per id, each with the id it was asked for.
 *   A2  every `census.numerator` equals the number of rows in `items` — the
 *       CONTRACT's definition of the field, and the one the assembly's own
 *       falsifier compares against.
 *   A3  every `census.denominator` is a positive integer, and the numerator never
 *       EXCEEDS it (a numerator above its denominator is a population that was
 *       never measured).
 *   A4  no item reports `installed: false` without a `source.where` that names the
 *       instrument, so "probed and absent" is never indistinguishable from "we
 *       did not look".
 *   A5  every window carries at least one falsifier, and every falsifier's `how`
 *       names a command or a route — a falsifier nobody can run is a caption.
 *   A6  the meta-community window's probe reports its control's status, so a run
 *       in which the control did not answer is reported as BLIND rather than as
 *       seven 404s.
 *   A7  an unknown window id returns `unavailable` naming the four known ids
 *       rather than an empty payload.
 *
 * Run: node --experimental-strip-types src/host/providers/verify/advanced-drive.mjs
 */

import { buildWindow, WINDOW_IDS, __test } from '../advanced.ts'

const failures = []

/** One assertion. Recorded, never thrown, so one failure does not hide the rest. */
function check(id, label, ok, detail) {
  if (!ok) failures.push(`${id} ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const windows = []
for (const id of WINDOW_IDS) {
  const built = await buildWindow(id)
  windows.push({ id, built })
}

check('A1', 'five windows built (four sub-tabs plus the container), each answering under its own id', windows.length === WINDOW_IDS.length && windows.every((w) => w.built.unavailable === null), `built ${windows.length} of ${WINDOW_IDS.length}`)
check('A1b', 'the container id `advanced` is declared rather than declined', WINDOW_IDS.includes('advanced'), String(WINDOW_IDS.join(', ')))

console.log('')
console.log('=== THE FOUR CENSUSES ===')
for (const { id, built } of windows) {
  const items = Array.isArray(built.items) ? built.items : []
  const census = built.census ?? {}
  console.log(`${id}: items=${items.length} numerator=${String(census.numerator)} denominator=${String(census.denominator)}`)
  console.log(`  population: ${String(census.population).slice(0, 260)}`)
  console.log(`  at: ${String(census.at)}`)
  check(`A2.${id}`, 'census numerator equals the number of items', census.numerator === items.length, `numerator=${String(census.numerator)} items=${items.length}`)
  const denominatorOk = typeof census.denominator === 'number' && Number.isInteger(census.denominator) && census.denominator > 0
  const notAbove = typeof census.numerator === 'number' && typeof census.denominator === 'number' && census.numerator <= census.denominator
  check(`A3.${id}`, 'denominator is a positive integer and the numerator does not exceed it', denominatorOk && notAbove, `numerator=${String(census.numerator)} denominator=${String(census.denominator)}`)

  const unexplainedAbsences = items.filter((item) => item.installed === false && (item.source === undefined || typeof item.source.where !== 'string'))
  check(`A4.${id}`, 'every item reporting installed:false names the instrument that probed it', unexplainedAbsences.length === 0, `${unexplainedAbsences.length} unexplained of ${items.length}`)

  const falsifiers = Array.isArray(built.falsifiers) ? built.falsifiers : []
  const runnable = falsifiers.filter((entry) => /GET |POST |node -e|read |count |compare |parse |check |confirm /i.test(String(entry.how)))
  check(`A5.${id}`, 'the window carries falsifiers, each naming something a reader can run', falsifiers.length > 0 && runnable.length === falsifiers.length, `${falsifiers.length} falsifier(s), ${runnable.length} naming a command or route`)

  const counts = items.map((item) => `  [${item.kind}] ${item.id} :: installed=${String(item.installed)} verdict=${item.alignment?.verdict ?? '?'}`)
  console.log(counts.join('\n'))
  console.log(`  stale: ${built.stale === null || built.stale === undefined ? 'null (every instrument read)' : `SET — ${String(built.stale.reason).slice(0, 140)} [boundMs=${String(built.stale.boundMs)}]`}`)

  // A8: the marker must be either absent or a NAMED reason, and a stale window must
  // still carry rows. The defect it guards is a provider discarding measured rows to
  // express a slow socket, which is exactly what this lane did at 1,500 ms.
  const staleOk = built.stale === null || built.stale === undefined || (typeof built.stale.reason === 'string' && built.stale.reason.length > 20)
  const rowsKept = built.stale === null || built.stale === undefined || items.length > 0
  check(`A8.${id}`, 'stale is either null or a named reason, and a stale window still carries its rows', staleOk && rowsKept, built.stale === null || built.stale === undefined ? 'null' : `reason ${String(built.stale.reason).length} ch over ${items.length} row(s)`)
  console.log('')
}

const community = windows.find((w) => w.id === 'meta-community').built
const communityItems = Array.isArray(community.items) ? community.items : []
const routeRows = communityItems.filter((item) => String(item.source?.route ?? '').startsWith('/meta-community/api/'))
const notFoundEmpty = routeRows.filter((item) => item.installed === false).length
const controlRow = communityItems.find((item) => item.id === 'community-control-mounted')
const unregistered = communityItems.find((item) => item.id === 'community-control-unregistered-path')
const notMeasured = routeRows.filter((item) => item.installed === null).length
console.log('=== meta-community probe detail ===')
console.log(`advertised rows: ${routeRows.length}; 404-with-0-bytes: ${notFoundEmpty}; unmeasured: ${notMeasured}`)
console.log(`control ${String(controlRow?.name)} :: ${String(controlRow?.alignment?.evidence)}`)
console.log(`control ${String(unregistered?.name)} :: ${String(unregistered?.alignment?.evidence)}`)
console.log(`control rows present: ${String(controlRow !== undefined)} / ${String(unregistered !== undefined)}`)
check('A6', 'the community window reports both probe controls so a blind run is distinguishable from a finding', controlRow !== undefined && unregistered !== undefined, `${String(controlRow !== undefined)}, ${String(unregistered !== undefined)}`)

const unknown = await buildWindow('meta-plugins')
check('A7', 'an unowned window id returns unavailable naming the four known ids', typeof unknown.unavailable?.reason === 'string' && WINDOW_IDS.every((id) => unknown.unavailable.reason.includes(id)), String(unknown.unavailable?.reason).slice(0, 160))

/**
 * A9 — THE MUTATION, because a marker that has never fired is a caption.
 *
 * The live deployment is healthy, so every `stale` above is null and the marker
 * could be a constant that never changes without any check noticing. So this drives
 * `metaCommunityWindow` with a SYNTHETIC BLIND BATCH: eleven rows, all
 * `status: null`, i.e. exactly the shape a dead port produces. Three things must
 * then be true, and each is a different failure mode:
 *
 *   - `stale` is SET (the marker is reachable, not decorative);
 *   - the window keeps its ELEVEN rows (measured rows are not traded away for a
 *     slow socket — the defect this lane committed at 1,500 ms);
 *   - ZERO routes are counted as 404-with-0-bytes, because a blind probe must not
 *     manufacture the seven-404 finding it exists to test.
 */
const anchors = __test.locateAnchors()
if ('absent' in anchors) {
  check('A9', 'synthetic blind batch sets stale and manufactures no 404s', false, `cannot drive: ${anchors.absent}`)
} else {
  const blindAt = new Date().toISOString()
  const blindPaths = [
    '/meta-community/api/members',
    '/meta-community/api/census',
    '/meta-community/api/fuse',
    '/meta-community/api/standing',
    '/meta-community/api/clauses',
    '/meta-community/api/clauses/conformance',
    '/meta-community/api/standing/relabel',
    '/intent-map/api/map',
    '/zone-recalc/api/does-not-exist',
    '/agent-team-cap/api/state',
    '/agent-team-cap/api/zones',
  ]
  const blindBatch = { at: blindAt, rows: blindPaths.map((path) => ({ path, status: null, bytes: null, error: 'synthetic: connection refused by the driver', body: null })) }
  const blind = __test.metaCommunityWindow(blindAt, blindBatch, anchors)
  const blindRoutes = blind.items.filter((item) => String(item.source?.route ?? '').startsWith('/meta-community/api/'))
  const blindNotFound = blindRoutes.filter((item) => item.installed === false).length
  const blindUnmeasured = blindRoutes.filter((item) => item.installed === null).length
  console.log('')
  console.log(`=== A9 synthetic blind batch: rows=${blind.items.length} routes=${blindRoutes.length} unmeasured=${blindUnmeasured} counted-as-404=${blindNotFound}`)
  console.log(`  stale: ${blind.stale === null || blind.stale === undefined ? 'null — THE MARKER NEVER FIRED, so it is not a check' : String(blind.stale.reason).slice(0, 260)}`)
  check('A9a', 'a blind probe SETS stale rather than reporting nothing', blind.stale !== null && blind.stale !== undefined && typeof blind.stale?.reason === 'string', String(blind.stale === null || blind.stale === undefined ? 'null' : `reason ${String(blind.stale.reason).length} ch`))
  check('A9b', 'a blind probe keeps every row instead of discarding measured rows', blind.items.length === community.items.length, `${blind.items.length} rows blind vs ${community.items.length} live`)
  check('A9c', 'a blind probe counts ZERO routes as 404-with-0-bytes, so no finding is manufactured', blindNotFound === 0 && blindUnmeasured === blindRoutes.length, `${blindNotFound} invented 404(s), ${blindUnmeasured} unmeasured of ${blindRoutes.length}`)
  check('A9d', 'the blind marker carries the probe bound that was in force', typeof blind.stale?.boundMs === 'number' && blind.stale.boundMs === __test.PROBE_TIMEOUT_MS, `boundMs=${String(blind.stale?.boundMs)} in-force=${String(__test.PROBE_TIMEOUT_MS)}`)
}

console.log('')
if (failures.length === 0) {
  console.log(`VERDICT: GREEN — all checks passed, ${windows.length} window(s) built`)
  process.exit(0)
}
console.log(`VERDICT: RED — ${failures.length} check(s) failed`)
for (const failure of failures) console.log(`  ${failure}`)
process.exit(1)
