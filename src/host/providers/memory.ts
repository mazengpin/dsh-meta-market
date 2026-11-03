/**
 * THE META-MEMORY WINDOW — the memory meta layer that exists on this machine today.
 *
 * WHAT THIS PROVIDER IS
 *
 * One provider module, one window id (`meta-memory`), one CONTRACT envelope. Every
 * row in it is a memory surface that was MEASURED on the owner's live session at
 * `http://127.0.0.1:3083`: an HTTP status code and a byte size for each route it
 * cites, a tracked-file census for each checkout, and a catalog row count for each
 * plugin name. The measurements are RECORDED in `ROUTE_READINGS` below, stamped
 * with the instant they were taken, and re-driven by
 * `src/host/providers/verify/check-window.mjs` — which is what makes them a
 * reading rather than a claim.
 *
 * WHY THE READINGS ARE CONSTANTS AND NOT A `fetch` AT REQUEST TIME
 *
 * This module is bundled into `lib/index.js` by `tsdown` and its `buildWindow`
 * runs inside a request the same webServer is serving. A provider that fetched
 * its sibling routes would be a handler asking the process it lives in. So the
 * probe is a separate driver (`verify/probe-memory.mjs`), and this file records
 * what that driver measured. A reader who wants current numbers runs the driver;
 * a reader who wants this window's numbers reads them here with their time.
 *
 * THE BYTE SIZES DRIFT, AND SAYING SO IS PART OF THE EVIDENCE
 *
 * `/memory-inject/api/status` measured **43,677 B at 21:45:43Z** and **43,679 B at
 * 21:52:12Z** — two bytes apart in seven minutes, because its `verdicts` ledger
 * appends. `/api/memento/audit` is a 292,599 B window over a store whose SQL count
 * is 836 rows. **A byte size is therefore NOT an identity for a live store**, and
 * this provider never treats one as a fingerprint: the status code is the
 * assertion, the byte size is a caption that carries its census time.
 *
 * THE DUPLICATE-SURFACE FINDING, STATED RATHER THAN MERGED
 *
 * This program has an open finding about a duplicated memory panel. The honest
 * state measured here is THREE facts, and collapsing them into one would hide the
 * live half:
 *
 *   1. **The 2026-10-16 duplicate is RESOLVED at source.** `dsh-system-status`
 *      carries no `MEMORY_ROW_ID` registration and no `MemoryPage.ts`; its own
 *      `client/index.tsx` says the Memory row was retired into `dsh-memento`, and
 *      `dsh-memento`'s own test asserts the body-level `#dsh-memento-panel`
 *      overlay was removed.
 *   2. **A DIFFERENT two-surface split is LIVE.** `dsh-memento` registers a
 *      `sidebar.panellist` row (`id: 'dsh-memento'`, label `Memory` when the
 *      language probe answers `en`) and `dsh-memory-delta` registers a
 *      better-sidebar tab (`id: 'dsh-memory-delta:memory'`, title `记忆`). Both
 *      packages are in `personal-dev`'s bundle list, so both load. They are not
 *      one store shown twice: memento is a SQLite store at
 *      `~/.dsh/dsh-memento/memory.db` and memory-delta is a layered Markdown
 *      library at `~/.dsh/dsh-memory-delta`. **Two memory surfaces, two stores,
 *      one job.**
 *   3. **A DATA-level duplicate remains.** `dsh-system-status` reads
 *      `~/.dsh/dsh-memento/memory.db` read-only and reports the same store's
 *      counts as memento's own route — and the two numbers DISAGREE by
 *      construction, which is why both are cited with their definition:
 *      `/system-status/api/state` reports `audit: 836` (an uncapped SQL count)
 *      while `/api/memento/store` reports `audit: 200, auditWindow: 200` (a
 *      windowed read). Neither is wrong; a reader who saw one number would think
 *      the other surface was broken.
 *
 * THE MEMORY RAG LEVEL OF THE SINGLE-MODEL DECISION, MEASURED
 *
 * The owner's decision is one model, loaded once, backing both the decision level
 * and the memory RAG level. Measured on this session, that is NOT what the memory
 * RAG level does: `/api/memento/rag` reports `retriever: null`, `degradedTo:
 * "substring (built-in path)"`, and an `embedder` block whose `model` is `null`,
 * whose `endpoint` is `http://127.0.0.1:8010`, and whose `state` is
 * `not-measured` because nothing was listening there (3 attempts, 30,546 ms spent
 * against a 24,000 ms budget, `freshness: "stale"`, `ageMs: 6562592`). The
 * intent map's `/intent-map/api/identity` records `qwen3-embedding:0.6b`,
 * `dim: 1024`, 24 vectors — and its OWN verdict is that the recorded model is
 * `UNCONFIRMED` because `127.0.0.1:11434/api/ps` could not be reached, so `live`
 * is `null`. **Two facts, both absences of a reading rather than zeros: the
 * memory RAG level is not on the decision encoder, and the encoder's identity is
 * not currently confirmable from the intent map either.**
 *
 * @module dsh-meta-market/host/providers/memory
 */

import type { Census, Control, Falsifier, ProviderWindow, WindowId, WindowItem } from '../types.ts'

/** The one window id this module answers. */
export const WINDOW_ID = 'meta-memory' as const

/**
 * One probe result. `bytes` is the body length actually received, error bodies
 * included, because a 400 whose body says `a JSON body is required` is a reading
 * and a 400 with no body is a different one.
 */
interface RouteReading {
  readonly plugin: string
  readonly method: 'GET' | 'POST'
  readonly route: string
  readonly status: number
  readonly bytes: number
  readonly at: string
}

/**
 * THE PROBE RECORD — 19 rows, every one measured, none inferred.
 *
 * Taken by `node src/host/providers/verify/probe-memory.mjs` (GET rows and the two
 * POST read routes), plus one measured GET of `/system-status/api/state` taken by
 * the same driver on its next run. A route that had answered `404` would be here
 * as `404`; none did, which is why `unavailable` is `null` rather than an object.
 */
export const ROUTE_READINGS: readonly RouteReading[] = Object.freeze([
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/entries', status: 200, bytes: 337, at: '2026-10-17T21:52:10.021Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/audit', status: 200, bytes: 292599, at: '2026-10-17T21:52:10.230Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/proposals', status: 200, bytes: 19436, at: '2026-10-17T21:52:10.469Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/store', status: 200, bytes: 139, at: '2026-10-17T21:52:10.561Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/rag', status: 200, bytes: 1439, at: '2026-10-17T21:52:10.640Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/models', status: 200, bytes: 2072, at: '2026-10-17T21:52:10.880Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/recall', status: 200, bytes: 54, at: '2026-10-17T21:52:11.283Z' },
  { plugin: 'dsh-memento', method: 'GET', route: '/api/memento/control', status: 400, bytes: 35, at: '2026-10-17T21:52:11.471Z' },
  { plugin: 'dsh-memory-delta', method: 'GET', route: '/dsh-memory-delta/state', status: 405, bytes: 50, at: '2026-10-17T21:52:11.569Z' },
  { plugin: 'dsh-memory-delta', method: 'GET', route: '/dsh-memory-delta/search', status: 405, bytes: 50, at: '2026-10-17T21:52:11.739Z' },
  { plugin: 'dsh-memory-delta', method: 'GET', route: '/dsh-memory-delta/action', status: 405, bytes: 50, at: '2026-10-17T21:52:11.803Z' },
  { plugin: 'dsh-memory-injector', method: 'GET', route: '/memory-inject/api/status', status: 200, bytes: 43679, at: '2026-10-17T21:52:12.104Z' },
  { plugin: 'dsh-memory-injector', method: 'GET', route: '/memory-inject/api/verdicts', status: 200, bytes: 43679, at: '2026-10-17T21:52:12.165Z' },
  { plugin: 'dsh-intent-map', method: 'GET', route: '/intent-map/api/map', status: 200, bytes: 19532, at: '2026-10-17T21:52:12.292Z' },
  { plugin: 'dsh-intent-map', method: 'GET', route: '/intent-map/api/identity', status: 200, bytes: 730, at: '2026-10-17T21:52:12.394Z' },
  { plugin: 'dsh-recall-console', method: 'GET', route: '/recall-console/api/status', status: 200, bytes: 7973, at: '2026-10-17T21:52:12.424Z' },
  { plugin: 'dsh-memory-delta', method: 'POST', route: '/dsh-memory-delta/search', status: 200, bytes: 3181, at: '2026-10-17T21:52:12.568Z' },
  { plugin: 'dsh-memory-delta', method: 'POST', route: '/dsh-memory-delta/state', status: 200, bytes: 29338, at: '2026-10-17T21:52:12.654Z' },
  { plugin: 'dsh-system-status', method: 'GET', route: '/system-status/api/state', status: 200, bytes: 1938, at: '2026-10-17T21:52:38.368Z' },
])

/**
 * The census instant for the whole window: the last row's stamp.
 *
 * Stated once rather than per item, because two items carrying different census
 * times for one population is how a reader stops being able to compare them.
 */
const CENSUS_AT = '2026-10-17T21:52:38.368Z'

/**
 * Turn a probed route into an evidence line, or say it was never probed.
 *
 * **DERIVED FROM THE TABLE ON PURPOSE.** A hand-written `"200, 337 B"` in an item
 * is a second statement of a fact the table already holds, and two statements of
 * one fact drift. This function is the reason every item's evidence can be
 * audited by reading `ROUTE_READINGS` alone.
 *
 * @param route - the probed path.
 * @param method - the method the handler accepts; `GET` unless stated.
 * @returns an evidence string with the status, the size and the instant.
 */
function evidence(route: string, method: 'GET' | 'POST' = 'GET'): string {
  const row = ROUTE_READINGS.find((reading) => reading.route === route && reading.method === method)
  if (row === undefined) {
    return `NOT MEASURED: this provider never probed ${method} ${route}, so it reports no status for it`
  }
  return `${method} ${route} → ${row.status}, ${row.bytes} B at ${row.at}`
}

/**
 * The intent slot for a memory row.
 *
 * `originalIntent` is `not-measured` on every item because the original-intent
 * check needs the intent index and this provider is not the lane that owns it
 * (`intent-align` owns `src/host/intent-align/**`). Claiming `pass` here would be
 * this window asserting another lane's verdict, which is the merge the CONTRACT
 * forbids. What IS measured — a colliding JOB between two meta plugins — is
 * carried in `collidesWith`, which is a statement about surfaces and not about
 * vector scores.
 *
 * @param collidesWith - the named collisions, empty when the item collides with nothing today.
 * @returns the intent match object.
 */
function intentFor(collidesWith: readonly { readonly id: string; readonly why: string }[]): WindowItem['intent'] {
  return {
    zones: [],
    originalIntent: 'not-measured',
    collidesWith,
  }
}

/** The duplicate-surface collision, written once and cited from both sides. */
const DUPLICATE_SURFACE = `both packages are in personal-dev's bundle list and each registers a memory GUI surface — dsh-memento a sidebar.panellist row (id "dsh-memento", label "Memory" when the language probe answers en) and dsh-memory-delta a better-sidebar tab (id "dsh-memory-delta:memory", title "记忆") — and they are NOT one store shown twice: memento's is a SQLite store at ~/.dsh/dsh-memento/memory.db, memory-delta's is a layered Markdown library at ~/.dsh/dsh-memory-delta`

/**
 * The five rows.
 *
 * `downloadable` is a real reading for every row: the catalog census is 4,527 rows
 * (`research/cache/plugins-2026-10-12.json`), matched by `name` OR `npm` per this
 * program's rule, and the row count per plugin is stated in each item's evidence —
 * so `false` here means "probed, 0 of 4,527 rows", never "not checked".
 */
function items(): readonly WindowItem[] {
  return [
    {
      id: 'dsh-memento',
      name: 'dsh-memento',
      npm: 'dsh-memento',
      owner: 'PerryLink',
      kind: 'exists',
      installed: true,
      downloadable: true,
      source: { where: 'installed', route: '/api/memento/entries' },
      intent: intentFor([{ id: 'dsh-memory-delta', why: DUPLICATE_SURFACE }]),
      alignment: {
        verdict: 'aligned',
        why: 'live on the owner session and in personal-dev bundles: the panel probe answers panel.enabled true and language en, and the plugin serves 8 routes, 7 of them 200 and the eighth a 400 that names its own precondition ("a JSON body is required")',
        evidence: `${evidence('/api/memento/entries')}; ${evidence('/api/memento/store')}; ${evidence('/api/memento/rag')}; ${evidence('/api/memento/control')}; checkout census 98 tracked files (56 code, 34 metadata) at commit 013cf5e2af3ec58d901b01f33b06336d55b3cfa5, 2026-10-14T04:20:37-07:00; catalog match 1 of 4,527 rows by name OR npm (npm dsh-memento, owner PerryLink, 141 stars)`,
      },
      patch: null,
    },
    {
      id: 'dsh-memory-delta',
      name: 'dsh-memory-delta',
      npm: 'dsh-memory-delta',
      owner: 'lpf20200901',
      kind: 'exists',
      installed: true,
      downloadable: true,
      source: { where: 'installed', route: '/dsh-memory-delta/search' },
      intent: intentFor([{ id: 'dsh-memento', why: DUPLICATE_SURFACE }]),
      alignment: {
        verdict: 'aligned',
        why: 'live, and readable only by POST: its own handler answers 405 to a GET on all three routes, so an instrument that probes with GET records this plugin as ABSENT when it is present and answering — measured both ways on the same paths',
        evidence: `${evidence('/dsh-memory-delta/state')} (GET); ${evidence('/dsh-memory-delta/state', 'POST')} (POST, total 4 search matches); ${evidence('/dsh-memory-delta/search', 'POST')}; ${evidence('/dsh-memory-delta/action')} (GET 405; the POST write route was DELIBERATELY NOT DRIVEN — driving it would change the owner's memory library); checkout census 37 tracked files (24 code, 9 metadata) at commit 1a5af1662a0521ee2fde5975822c795d22d4d197, 2026-10-15T09:08:40+08:00; catalog match 1 of 4,527 rows (npm field EMPTY, owner lpf20200901, 0 stars)`,
      },
      patch: null,
    },
    {
      id: 'dsh-memory-injector',
      name: 'dsh-memory-injector',
      npm: 'dsh-memory-injector',
      owner: null,
      kind: 'exists',
      installed: true,
      downloadable: false,
      source: { where: 'installed', route: '/memory-inject/api/status' },
      intent: intentFor([]),
      alignment: {
        verdict: 'aligned',
        why: 'live and injecting: the status route reports enabled true with baseUrl http://127.0.0.1:8008 and threshold 0.5, and its two route NAMES serve ONE payload — /status and /verdicts measured identical to the byte at the same instant, because the handler branches on "status" or "verdicts" into the same body',
        evidence: `${evidence('/memory-inject/api/status')}; ${evidence('/memory-inject/api/verdicts')}; byte-size DRIFT measured across two runs: 43,677 B at 2026-10-17T21:45:43Z and 43,679 B at 21:52:12Z, because the verdict ledger appends; checkout census 19 tracked files (11 code, 4 metadata) at commit 044eb2741ac7194da807123c428c67beef933bf0, 2026-10-14T11:16:30-07:00; catalog match 0 of 4,527 rows by name OR npm, so this is a SELF-AUTHORED / UNLISTED package (real files, no catalog entry) — downloadable false is that reading, not a missing check`,
      },
      patch: null,
    },
    {
      id: 'intent-map-memory-rag-level',
      name: 'dsh-intent-map (the memory RAG level of the single-model decision)',
      npm: 'dsh-intent-map',
      owner: null,
      kind: 'exists',
      installed: true,
      downloadable: false,
      source: { where: 'installed', route: '/intent-map/api/identity' },
      intent: intentFor([{ id: 'dsh-memento', why: 'the memory RAG level is NOT on the one model: memento\'s RAG embedder is a SEPARATE endpoint (http://127.0.0.1:8010) whose model is null and whose state is not-measured, while the intent index records qwen3-embedding:0.6b at http://127.0.0.1:11434/api/embed — the owner\'s one-model decision is therefore not satisfied at the memory RAG level as measured' }]),
      alignment: {
        verdict: 'collides',
        why: 'MEASURED COLLISION, and it is the owner\'s decision that fails rather than an intent score: /api/memento/rag reports retriever null, degradedTo "substring (built-in path)", and an embedder with model null, endpoint http://127.0.0.1:8010, state not-measured, 3 attempts, 30,546 ms spent against a 24,000 ms budget, freshness stale, ageMs 6,562,592. The intent map records qwen3-embedding:0.6b at dim 1024 over 24 vectors — and its OWN verdict is UNCONFIRMED, because 127.0.0.1:11434/api/ps could not be reached, so live is null. Two absences-of-a-reading, not two zeros',
        evidence: `${evidence('/api/memento/rag')}; ${evidence('/api/memento/models')}; ${evidence('/intent-map/api/identity')}; ${evidence('/intent-map/api/map')}; checkout census 13 files under src (12 .ts) with NO .git, so a commit stamp is NOT MEASURED for this checkout and none is quoted; catalog match 0 of 4,527 rows`,
      },
      patch: null,
    },
    {
      id: 'dsh-system-status-memory-row',
      name: 'dsh-system-status (Memory row — RETIRED, and a second READER of memento\'s store)',
      npm: 'dsh-system-status',
      owner: null,
      kind: 'exists',
      installed: true,
      downloadable: false,
      source: { where: 'installed', route: '/system-status/api/state' },
      intent: intentFor([]),
      alignment: {
        verdict: 'aligned',
        why: 'this row is here to answer "is the duplicated memory panel still true", and the answer is NO at the GUI level and YES at the data level: the plugin registers ONE nav row (T1518_ROW_ID) and carries no MEMORY_ROW_ID registration, no MemoryPage.ts among its 6 client files, and its own client log states the Memory row was retired into dsh-memento — but it still reads ~/.dsh/dsh-memento/memory.db read-only and reports that store\'s counts, which DISAGREE with memento\'s own count by definition: system-status reports audit 836 (uncapped SQL count) where memento reports audit 200 with auditWindow 200 (a windowed read). Neither number is wrong and a reader who saw one would think the other surface was broken',
        evidence: `${evidence('/system-status/api/state')} (memory.store exists true, 7,340,032 B, modified 2026-10-17T13:41:08.571Z; memory.count audit 836); ${evidence('/api/memento/store')} (audit 200, auditWindow 200); checkout census 23 tracked files (12 code, 6 metadata) at commit d418c58a635430f394d492bc925e25e993153695, 2026-10-14T06:57:44-07:00; catalog match 0 of 4,527 rows`,
      },
      patch: null,
    },
  ]
}

/**
 * The controls this window offers.
 *
 * **ALL FIVE ARE `read`, AND THAT IS THE HONEST ANSWER RATHER THAN AN OVERSIGHT.**
 * The CONTRACT requires a `write` control to have been driven once with its
 * outcome shown. Driving a memory write means writing into the owner's live
 * memory store, and this provider's driver is an instrument, not a control. So no
 * `write` control is advertised: a knob nobody turned is not a control, and the
 * alternative — advertising one and calling the ability to return a 200 a
 * demonstration — is the defect the CONTRACT names in one line.
 *
 * Every row below was DRIVEN by the probe driver and its status is in the record;
 * `demonstrable: true` therefore means "driven, with the outcome recorded", not
 * "wired in principle".
 */
const controls: readonly Control[] = Object.freeze([
  { id: 'memento-panel-state', label: 'Read the memory panel\'s own state (enabled, language, entry count)', kind: 'read', target: '/api/memento/entries', demonstrable: true },
  { id: 'memento-store-count', label: 'Read the store file and its counts (entries, audit window)', kind: 'read', target: '/api/memento/store', demonstrable: true },
  { id: 'memento-rag-embedder', label: 'Read the RAG level: retriever, degradation and embedder identity', kind: 'read', target: '/api/memento/rag', demonstrable: true },
  { id: 'memory-delta-search', label: 'Search the layered Markdown library (POST; a GET answers 405)', kind: 'read', target: '/dsh-memory-delta/search', demonstrable: true },
  { id: 'memory-inject-verdicts', label: 'Read injection verdicts and the gate threshold', kind: 'read', target: '/memory-inject/api/verdicts', demonstrable: true },
])

/**
 * Falsifiers: each is a claim this window makes that a named check could show false.
 *
 * A window whose claims cannot fail is a window that is not reporting anything, so
 * every one of these is executable by running the driver named in `how`.
 */
const falsifiers: readonly Falsifier[] = Object.freeze([
  {
    claim: 'every route this window cites answered with the status recorded here, and none answered 404',
    how: 'run node src/host/providers/verify/probe-memory.mjs and compare each status; the check driver does exactly this and exits non-zero on any status drift. Byte sizes are compared as DRIFT, not as identity: a live ledger that appended two bytes between runs is drift, not a falsification',
  },
  {
    claim: 'a GET-only probe records dsh-memory-delta as absent when it is present',
    how: 'GET /dsh-memory-delta/search returns 405 with {"ok":false,"error":"只支持 POST，收到 GET"} and the SAME path with a JSON body returns 200 with 4 matches; an instrument that reports "no memory-delta search route" from the GET alone is measuring its own method, not the route',
  },
  {
    claim: 'the memory RAG level is not on the single model the decision level uses',
    how: 'read /api/memento/rag embedder.state and embedder.model; if state becomes ready and model matches the intent index model (qwen3-embedding:0.6b) at dim 1024, this collision is resolved and the item must be corrected in place — today it is not-measured with model null and a separate endpoint on :8010',
  },
  {
    claim: 'two memory GUI surfaces are live, over two different stores',
    how: 'dsh-memento client/client.js registers sidebar.panellist (id "dsh-memento", MEMORY_ROW_ORDER 40) and dsh-memory-delta client/client.js registerMemoryTab registers a better-sidebar tab (id "dsh-memory-delta:memory", title "记忆"); both packages appear in profiles-tree/personal-dev/package.json dependencies AND in its dsh.profile.bundles list. If either leaves the bundle list, the count is 1 and this claim is false',
  },
  {
    claim: 'the earlier duplicated memory panel is resolved rather than merely hidden',
    how: 'grep dsh-system-status/src/client for MEMORY_ROW_ID or MemoryPage.ts (0 matches, 6 client files) and grep dsh-memento for "id = \'dsh-memento-panel\'" (only its own test asserts the overlay was removed). If either reappears, the 2026-10-16 finding is live again and this row is wrong',
  },
  {
    claim: 'the census below counts every memory meta-layer row this provider enumerates',
    how: 'compare census.numerator to items.length (both 5) and read population for the named exclusion: dsh-recall-console was PROBED (200, 7,973 B) and excluded BY NAME because it recalls tools, skills and scripts rather than memory entries — so this window is not claiming that every plugin with "recall" in its name was ignored',
  },
])

/**
 * Build the `meta-memory` window.
 *
 * Never throws for the reason the assembly's failure boundary expects: every
 * value returned is either a measurement or a stated absence.
 *
 * @param windowId - the requested window; only `meta-memory` is served here.
 * @returns the CONTRACT envelope's provider half.
 */
export async function buildWindow(windowId?: WindowId): Promise<ProviderWindow> {
  if (windowId !== undefined && windowId !== WINDOW_ID) {
    return {
      unavailable: {
        reason: `this provider serves only '${WINDOW_ID}' and was asked for '${windowId}'; no memory measurement was taken for that id`,
        measuredAt: CENSUS_AT,
      },
    }
  }

  const rows = items()
  const census: Census = {
    numerator: rows.length,
    denominator: 5,
    population: 'memory meta-layer surfaces enumerated for this window: the three named plugin checkouts (dsh-memento, dsh-memory-delta, dsh-memory-injector), the intent-map record of the memory-RAG model identity, and dsh-system-status\'s retired Memory row plus its read-only reader of memento\'s store; dsh-recall-console is EXCLUDED BY NAME (it recalls tools, skills and scripts, not memory entries) although it was probed',
    at: CENSUS_AT,
  }

  return {
    items: rows,
    census,
    controls,
    falsifiers,
    unavailable: null,
  }
}
