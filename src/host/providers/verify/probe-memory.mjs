/**
 * Live probe of the memory meta layer on the owner's session at 127.0.0.1:3083.
 *
 * WHY A SEPARATE DRIVER AND NOT A `fetch` INSIDE THE PROVIDER
 *
 * `memory.ts` is bundled into `lib/index.js` by `tsdown`, and its `buildWindow`
 * runs inside a request that the same webServer is serving. A provider that
 * fetched its sibling routes would be a handler asking the process it lives in,
 * which is a self-request with no timeout boundary the provider controls. So the
 * numbers are RECORDED here, stamped, and compared on every run of
 * `check-window.mjs` — a measurement that can be reproduced, not a claim that can
 * be re-asserted.
 *
 * WHAT THIS PROBE DOES NOT DO
 *
 * It sends GET to the memory GET routes and POST to the two `dsh-memory-delta`
 * routes that are POST-only BY THEIR OWN CONTRACT (their handler answers 405 to a
 * GET; see `plugins-src/dsh-memory-delta/src/panel.mjs`, `readAllowedBody`). It
 * sends no write: `/dsh-memory-delta/action` is present in the route table and is
 * NOT driven, because driving it would change the owner's memory library and this
 * driver is an instrument, not a control.
 *
 * Usage: node src/host/providers/verify/probe-memory.mjs
 */

const BASE = 'http://127.0.0.1:3083'
const WORKSPACE = 'C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE'

/** GET routes, each carrying the plugin that owns it, so a 404 names a lane and not a mystery. */
const GET_ROUTES = [
  ['dsh-memento', '/api/memento/entries'],
  ['dsh-memento', '/api/memento/audit'],
  ['dsh-memento', '/api/memento/proposals'],
  ['dsh-memento', '/api/memento/store'],
  ['dsh-memento', '/api/memento/rag'],
  ['dsh-memento', '/api/memento/models'],
  ['dsh-memento', '/api/memento/recall'],
  ['dsh-memento', '/api/memento/control'],
  ['dsh-memory-delta', '/dsh-memory-delta/state'],
  ['dsh-memory-delta', '/dsh-memory-delta/search'],
  ['dsh-memory-delta', '/dsh-memory-delta/action'],
  ['dsh-memory-injector', '/memory-inject/api/status'],
  ['dsh-memory-injector', '/memory-inject/api/verdicts'],
  ['dsh-intent-map', '/intent-map/api/map'],
  ['dsh-intent-map', '/intent-map/api/identity'],
  ['dsh-recall-console', '/recall-console/api/status'],
  ['dsh-system-status', '/system-status/api/state'],
]

/** POST routes whose own handler declares them POST-only and whose operation is a READ. */
const POST_ROUTES = [
  ['dsh-memory-delta', '/dsh-memory-delta/search', { query: 'memory', workspace: WORKSPACE, limit: 5 }],
  ['dsh-memory-delta', '/dsh-memory-delta/state', { workspace: WORKSPACE }],
]

/** One measured probe. `bytes` is the body length actually received, error bodies included. */
async function probe(plugin, method, route, body) {
  const at = new Date().toISOString()
  const started = Date.now()
  const response = await fetch(BASE + route, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return {
    plugin,
    method,
    route,
    status: response.status,
    bytes: Buffer.byteLength(text, 'utf8'),
    ms: Date.now() - started,
    at,
    bodyStart: text.slice(0, 120),
  }
}

const rows = []
for (const [plugin, route] of GET_ROUTES) rows.push(await probe(plugin, 'GET', route))
for (const [plugin, route, body] of POST_ROUTES) rows.push(await probe(plugin, 'POST', route, body))

console.log(JSON.stringify({ base: BASE, probedAt: new Date().toISOString(), count: rows.length, rows }, null, 2))
