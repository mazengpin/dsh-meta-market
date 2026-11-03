/**
 * THE CHECK FOR THE META-MEMORY WINDOW — envelope shape, recorded readings, and a
 * live re-probe, with a negative control proving the comparison can go red.
 *
 * WHAT IT ASSERTS, AND WHY EACH ONE IS AN ASSERTION RATHER THAN A PRINTED VALUE
 *
 *   C1  the provider answers for `meta-memory` and refuses another window id
 *       (a provider that answers anything is a provider whose declaration is not read)
 *   C2  census.numerator equals items.length, and census.denominator is stated
 *   C3  every item's kind is one of the three, and `installed` is boolean-or-null
 *   C4  every item's source.route was ACTUALLY PROBED (it appears in ROUTE_READINGS)
 *   C5  every null `installed`/`downloadable` carries a stated reason (the word
 *       NOT MEASURED, or an explicit "0 of N rows" reading) in its evidence
 *   C6  every recorded reading was produced by the driver, i.e. it has a status,
 *       a byte size and an ISO instant
 *   C7  controls: every `write` control must have `demonstrable: true`, because the
 *       CONTRACT says a write control that was not driven is not a control
 *   C8  falsifiers are non-empty and each has a `how` (a claim with no check is a caption)
 *   C9  LIVE: re-probe 3083 and compare every recorded status. Byte sizes are
 *       reported as DRIFT, never as identity — a live ledger appends.
 *   NEG the comparison itself is driven with a mutated observation and MUST fail,
 *       so "C9 passed" is a check that has been shown able to disagree.
 *
 * Usage: node --experimental-strip-types src/host/providers/verify/check-window.mjs
 */

import { buildWindow, WINDOW_ID, ROUTE_READINGS } from '../memory.ts'

const BASE = 'http://127.0.0.1:3083'
const WORKSPACE = 'C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE'

const checks = []
const record = (id, ok, detail) => checks.push({ id, ok, detail })

/** Re-probe one route. The two POST-only memory-delta routes carry their read bodies. */
async function observe(row) {
  const bodies = {
    '/dsh-memory-delta/search': { query: 'memory', workspace: WORKSPACE, limit: 5 },
    '/dsh-memory-delta/state': { workspace: WORKSPACE },
  }
  const body = row.method === 'POST' ? bodies[row.route] : undefined
  const response = await fetch(BASE + row.route, {
    method: row.method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return { status: response.status, bytes: Buffer.byteLength(text, 'utf8'), at: new Date().toISOString() }
}

/** Compare recorded readings against observations. Pure, so the negative control can drive it. */
function compare(recorded, observed) {
  const failures = []
  for (const row of recorded) {
    const seen = observed.find((entry) => entry.route === row.route && entry.method === row.method)
    if (seen === undefined) {
      failures.push(`${row.method} ${row.route}: no observation`)
      continue
    }
    if (seen.status !== row.status) {
      failures.push(`${row.method} ${row.route}: recorded ${row.status}, observed ${seen.status}`)
    }
  }
  return failures
}

const window = await buildWindow(WINDOW_ID)
const items = window.items ?? []
const census = window.census ?? {}

record('C1a', Array.isArray(window.items), 'provider returns an items array for meta-memory')
const refusal = await buildWindow('meta-plugins')
record('C1b', refusal.items === undefined && typeof refusal.unavailable?.reason === 'string', `another window id is refused with a reason: ${refusal.unavailable?.reason ?? 'NONE'}`)

record('C2', census.numerator === items.length && typeof census.denominator === 'number', `census ${census.numerator}/${census.denominator} against items.length ${items.length} (population: ${census.population ?? 'NOT STATED'})`)

const KINDS = new Set(['exists', 'plan', 'future'])
record('C3a', items.every((item) => KINDS.has(item.kind)), `kinds present: ${[...new Set(items.map((item) => item.kind))].join(', ')}`)
record('C3b', items.every((item) => item.installed === true || item.installed === false || item.installed === null), 'installed is boolean or null on every item')

const probedRoutes = new Set(ROUTE_READINGS.map((row) => `${row.method} ${row.route}`))
const unprobed = items.filter((item) => !item.source.route || !probedRoutes.has(`GET ${item.source.route}`))
record('C4', unprobed.length === 0, `${items.length - unprobed.length} of ${items.length} items cite a route that is in ROUTE_READINGS; unprobed: ${unprobed.map((item) => item.id).join(', ') || 'none'}`)

const unexplained = items.filter((item) => {
  const nulls = []
  if (item.installed === null) nulls.push('installed')
  if (item.downloadable === null) nulls.push('downloadable')
  if (nulls.length === 0) return false
  return !/NOT MEASURED|0 of |catalog match/i.test(item.alignment.evidence)
})
record('C5', unexplained.length === 0, `${unexplained.length} item(s) carry a null with no stated reason`)

const malformed = ROUTE_READINGS.filter((row) => typeof row.status !== 'number' || typeof row.bytes !== 'number' || Number.isNaN(Date.parse(row.at)))
record('C6', malformed.length === 0, `${ROUTE_READINGS.length - malformed.length} of ${ROUTE_READINGS.length} readings carry a status, a byte size and an ISO instant`)

const controls = window.controls ?? []
const writeNotDriven = controls.filter((control) => control.kind === 'write' && control.demonstrable !== true)
record('C7', writeNotDriven.length === 0, `${controls.filter((control) => control.kind === 'read').length} read control(s), ${controls.filter((control) => control.kind === 'write').length} write control(s); undriven writes: ${writeNotDriven.length}`)

const falsifiers = window.falsifiers ?? []
record('C8', falsifiers.length > 0 && falsifiers.every((entry) => typeof entry.how === 'string' && entry.how.length > 20), `${falsifiers.length} falsifier(s), each with a runnable how`)

const observed = []
for (const row of ROUTE_READINGS) observed.push({ method: row.method, route: row.route, ...(await observe(row)) })
const liveFailures = compare(ROUTE_READINGS, observed)
record('C9', liveFailures.length === 0, liveFailures.length === 0 ? `${ROUTE_READINGS.length} of ${ROUTE_READINGS.length} recorded statuses reproduced on ${BASE}` : `status drift: ${liveFailures.join('; ')}`)

const drift = ROUTE_READINGS
  .map((row) => {
    const seen = observed.find((entry) => entry.route === row.route && entry.method === row.method)
    return seen === undefined ? null : { route: row.route, method: row.method, recorded: row.bytes, observed: seen.bytes, delta: seen.bytes - row.bytes }
  })
  .filter((entry) => entry !== null && entry.delta !== 0)
record('C0-drift', true, `${drift.length} of ${ROUTE_READINGS.length} byte sizes drifted since the census; drift is EXPECTED on a live store and is not compared as identity: ${drift.map((entry) => `${entry.method} ${entry.route} ${entry.recorded}→${entry.observed}`).join(', ') || 'none'}`)

// THE NEGATIVE CONTROL. A comparison that cannot fail is not a comparison, so the
// same `compare` is handed one deliberately wrong observation and MUST report a failure.
const mutated = observed.map((entry, index) => (index === 0 ? { ...entry, status: 599 } : entry))
const negativeFailures = compare(ROUTE_READINGS, mutated)
record('NEG', negativeFailures.length === 1, `mutated the first observation to 599 and the comparison reported ${negativeFailures.length} failure(s): ${negativeFailures.join('; ') || 'NONE — the check is blind'}`)

const failed = checks.filter((entry) => !entry.ok)
for (const entry of checks) console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.id}  ${entry.detail}`)
console.log(`\nCENSUS ${census.numerator}/${census.denominator} — ${census.population ?? ''}`)
console.log(`ROUTES ${ROUTE_READINGS.length} probed, ${observed.length} re-probed at ${new Date().toISOString()}`)
console.log(`CHECKS ${checks.length - failed.length}/${checks.length} passed`)
console.log(failed.length === 0 ? 'VERDICT: WINDOW OK' : 'VERDICT: WINDOW FAILED')
process.exit(failed.length === 0 ? 0 : 1)
