/**
 * ============================================================================
 * meta-intent — THE WINDOW THE OTHER NINE ALIGN AGAINST
 * ============================================================================
 *
 * This provider reports the intent layer that EXISTS ON THIS MACHINE TODAY, and
 * it reports it from live readings taken inside `buildWindow`, not from figures
 * copied into this file. That choice is the whole design: a window whose purpose
 * is to be the SOURCE every other window is checked against cannot carry a
 * remembered number, because a remembered number is exactly the thing a reader
 * would check it with.
 *
 * THE FOUR SURFACES, and why each is a separate row rather than one verdict.
 * `dsh-intent-map` serves the 24-zone map. Its PRECOMPUTED EMBEDDING INDEX is a
 * distinct object with a distinct freshness verdict — the map can be current
 * while a fresh query cannot be embedded — and collapsing the two is how a
 * surface ends up green while retrieval is dead. `dsh-intent-mode` is the user
 * path (the ledger of intents the owner and the agents actually filed).
 * `dsh-plan-rag` is plan-corpus retrieval over a different index with its own
 * identity and its own staleness. Four objects, four readings, four verdicts.
 *
 * WHAT "FRESH" IS ALLOWED TO MEAN HERE. The intent map's own route states the
 * rule and this file adopts it rather than paraphrasing: `fresh` means the corpus
 * text is byte-identical to what was embedded, and the basis is a CONTENT HASH
 * per zone (`indexedHash` against `currentHash`), NOT a timestamp. So this file
 * never turns a `builtAt` into a freshness claim. Where the route computes a
 * hash, the window reports the hash comparison; where a route offers only counts
 * (`plan-rag`'s `fresh`/`stale` document split), the window reports the counts and
 * names the basis as the route's own per-chunk hash walk.
 *
 * THE EMBEDDER IS UNREACHABLE RIGHT NOW AND THE WINDOW SAYS SO. Measured
 * 2026-10-17T21:42Z: `GET /plan-rag/api/search?q=zones` answered 200 with
 * `embedded: false` and the reason "the query could not be embedded: no request
 * shape worked against http://127.0.0.1:11434/api/embed for model
 * \"qwen3-embedding:0.6b\" — ollama: fetch failed | laya: fetch failed", and a
 * direct probe of the declared endpoint returned no response at all. The 24
 * vectors were built earlier and are still served, so the map is readable and
 * retrieval is not. That state is carried on the index row as
 * `alignment.verdict: 'not-measured'` with the refusal as its evidence, and it is
 * NOT laundered into a green label: a vector count is not a query result.
 *
 * A 404 IS REPORTED AS 404. `GET /intent-map/api/search?q=memory` answers 404
 * "unknown intent-map route" — there is no query route on that plugin. The window
 * offers that as a control marked NOT demonstrable, and never as "zero zones
 * matched", because those are different facts and only one of them is true.
 *
 * THE CAVEAT THE MAP STATES ABOUT ITSELF, CARRIED RATHER THAN DROPPED. The map's
 * `index.identity` reports `identityConfirmed: false` and `modelStated: null`:
 * `qwen3-embedding:0.6b` is the tag the CLIENT REQUESTED, and ollama echoes no
 * identity on that route, so the model that produced the 24 vectors is asserted
 * by request rather than measured from the response. A reader deciding whether to
 * rely on this source is entitled to that distinction, so it is stated on the
 * row instead of being left in a route three levels deeper.
 *
 * PURITY AND BOUND. This provider reads four routes plus one 404 probe, all on
 * `127.0.0.1`, all bounded by `TIMEOUT_MS`, issued CONCURRENTLY so the worst case
 * is one timeout rather than five. It accepts no input, mutates no state, opens
 * no socket off this machine, and reaches no model. Every figure in the returned
 * envelope was produced by the call that returned it.
 *
 * @module dsh-meta-market/host/providers/intent
 */

import type {
  Census,
  Control,
  Falsifier,
  ProviderWindow,
  WindowId,
  WindowItem,
} from '../types.ts'
import { PROVIDER_PROBE_BOUND_MS, PROVIDER_PROBE_BOUND_RULE, probeBoundMs } from '../types.ts'

/** The window id this provider answers for, as the CONTRACT spells it. */
export const WINDOW_ID = 'meta-intent' as const

/**
 * Where the live GUI is — READ FROM THE ENVIRONMENT SO THE DEGRADED PATH CAN BE DRIVEN.
 *
 * The default is this machine's live session, and `src/host/social/index.ts` reads
 * the intent-map route at the same origin, so there is one convention rather than
 * two. The override exists because a degraded path that has never been driven is a
 * path that has never been tested: pointing this at a dead port in a separate
 * process is the only way to prove the cold-start branch (`unavailable` set, no
 * rows) without waiting for a real outage. `prov-tools-skills` exposes the same
 * variable name for the same reason, so one driver recipe covers both lanes.
 */
export const ORIGIN = process.env['DSH_META_MARKET_LIVE_BASE'] ?? 'http://127.0.0.1:3083'

/**
 * The per-route bound, in milliseconds — RAISED FROM 2,000 TO 5,000 AFTER THE
 * FIRST VALUE WAS PROVEN WRONG ON THE LIVE SURFACE, and the proof is why this
 * comment carries timings rather than an adjective.
 *
 * WHAT WAS WRONG. 2,000 ms was set against a 28–51 ms reading. `surface-host`
 * then measured the same built artifact answering at 22:19:45Z and timing out on
 * all three intent-layer routes at 22:20:16Z, 31 seconds apart with no code
 * change, so the bound sat under the latency it was timing and the tab flipped
 * between four rows and an absence. That is this program's own "a bound you did
 * not measure is a coin, not a threshold", paid for by this lane.
 *
 * THE SIX-READ LADDER, measured 2026-10-17T22:21–22:24Z on the live process. The
 * spread between sweeps is the finding: a quiet sweep reproduces the optimistic
 * number and would have kept the broken bound.
 *
 *   QUIET (one request at a time), six readings each:
 *     /intent-map/api/map     235 53 65 41 33 31        worst 235 ms
 *     /intent-mode/api/map    112 99 17 34 21 62        worst 112 ms
 *     /plan-rag/api/status    483 397 392 263 266 198   worst 483 ms
 *     /plan-rag/api/search    410 309 262 187 305 460   worst 460 ms
 *
 *   MIXED (12 requests in flight: 3 copies of each of the 4 routes), six rounds,
 *   which is the real condition — one window read is five routes at once and
 *   `gui/health`/`gui/sections` can overlap it:
 *     /intent-map/api/map     2266 2107 2119 1465 1460 1461 1339 1340 1340 1488 1489 1491 1361 1362 1362 1789 1789 1783   worst 2266 ms
 *     /intent-mode/api/map    2118 2112 2100 1459 1460 1462 1340 1342 1330 1497 1500 1500 1361 1363 1366 1783 1783 1784   worst 2118 ms
 *     /plan-rag/api/status    3191 3239 3242 1583 1583 1583 1561 1564 1557 2068 2081 2081 1672 1674 1679 2088 2090 2093   worst 3242 ms
 *     /plan-rag/api/search    3224 3225 3225 1601 1608 1608 1560 1555 1553 2090 2089 2089 1678 1679 1681 2142 2100 2104   worst 3225 ms
 *
 *   Note the MEDIAN of /plan-rag/api/status under that load is 2,068 ms — above
 *   the old bound. The old value was not merely close to the tail; it was below
 *   the middle of the distribution.
 *
 *   SATURATION (24 identical requests in flight, self-inflicted), six readings:
 *     /plan-rag/api/status    4970 4693 5382 4736 6751 6188   worst 7401 ms
 *
 * THE BOUND. `probeBoundMs(3242)` = 4,053 ms, so the measured rule alone gives
 * 4,053; the assembly's shared floor `PROVIDER_PROBE_BOUND_MS` is 5,000 and is
 * adopted rather than re-invented, because at 5,000 the window is above 1.25x of
 * every realistic reading and still answers in ~5 s worst case. The saturation
 * worst (7,401 ms, 1.25x = 9,251) is ABOVE this bound and that is stated rather
 * than hidden: under saturation the plan-rag row goes STALE and is served from its
 * last good reading with its age in the text, instead of the window disappearing.
 * Raising the bound to 9,500 to cover a self-inflicted 24-way flood would charge
 * every ordinary read the same ceiling, which is the trade this lane is not taking.
 *
 * The five reads are issued CONCURRENTLY, so this is also the whole window's
 * ceiling — one bound, not five stacked. A bound of 5,000 per route with stacked
 * reads would have been 25,000 ms of silence, which is the defect `surface-host`
 * named when it pointed out that three 2,000 ms timeouts charge a client 6,000 ms.
 */
/** The worst per-route reading in the MIXED sweep below; named so the bound cannot hide its input. */
export const MEASURED_MIXED_WORST_MS = 3_242

/** The worst per-route reading in the SATURATION sweep below — ABOVE the bound, by design. */
export const MEASURED_SATURATION_WORST_MS = 7_401

export const TIMEOUT_MS: number = Math.max(PROVIDER_PROBE_BOUND_MS, probeBoundMs(MEASURED_MIXED_WORST_MS))

/** The five paths this provider reads. Exported so a driver probes the same list. */
export const ROUTES = {
  intentMap: '/intent-map/api/map',
  intentMode: '/intent-mode/api/map',
  planRagStatus: '/plan-rag/api/status',
  planRagSearch: '/plan-rag/api/search?q=zone',
  intentMapSearch: '/intent-map/api/search?q=zone',
} as const

/** One of the paths above. */
export type RouteKey = keyof typeof ROUTES

/**
 * One route reading, with the two things a citation needs — the HTTP status and
 * the size of the body that was actually received — plus the two fields that make
 * a degraded read sayable instead of absent.
 *
 * `status` and `bytes` are `null` ONLY when no response arrived, and that is not
 * the same as a response of zero bytes — a distinction this program has paid for
 * before.
 *
 * `source` is the load-bearing addition. `live` is a reading taken in this call;
 * `cache` is the last good reading, reused because the live attempt failed, with
 * its own clock in `at` so its age is computable by whoever reads it; `none` is
 * nothing at all. A row is never discarded to express a slow socket, and it is
 * never silently passed off as current either.
 */
export interface Reading {
  readonly key: RouteKey
  readonly url: string
  readonly status: number | null
  readonly bytes: number | null
  /** When THIS reading was taken — the live attempt when live, the cached attempt when cached. */
  readonly at: string
  readonly body: Record<string, unknown> | null
  readonly source: 'live' | 'cache' | 'none'
  /** When the live attempt was made and what it produced; `null` only when the live attempt succeeded. */
  readonly liveFailure: string | null
  readonly liveAt: string
  /**
   * The HTTP status the LIVE attempt returned, whatever it was.
   *
   * Kept apart from `status` because the two answer different questions: `status`
   * is the status of the reading a row USES, while this is what the socket said.
   * They differ exactly when a 404 or a 500 is the live answer and a last-good
   * reading is being used instead — and in that case BOTH have to be on the
   * surface, because a 404 that is reported as "not measured" is this program's
   * own "advertised path that 404s" defect wearing a different hat.
   */
  readonly liveStatus: number | null
}

/**
 * The last good reading per route, kept IN MEMORY and per process.
 *
 * Deliberately not on disk: this is a degraded-mode convenience, not a durable
 * census, and writing one would invite a reader to trust a number whose age lives
 * in a file nobody prints. A process restart clears it, which is the honest
 * lifetime for a value that exists only to survive a slow socket.
 */
const GOOD_READINGS = new Map<RouteKey, { at: string; status: number; bytes: number; body: Record<string, unknown> | null }>()

/**
 * How old a cached reading may be before it stops being worth showing.
 *
 * Fifteen minutes is a judgement and it is stated rather than implied: the zone
 * map changes rarely, but the intent-mode row is a LEDGER census, and a
 * fifteen-minute-old ledger presented as the user's intent path would be a claim
 * about the present made from the past. Past this age the row reverts to
 * NOT MEASURED, which is the honest answer, and the staleness reason says so.
 */
export const CACHE_MAX_AGE_MS = 15 * 60_000

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function sub(body: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (body === null) return null
  const value = body[key]
  return isObject(value) ? value : null
}

function rows(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

/** Age of a past instant in whole seconds, or `null` if the instant will not parse. */
function ageSeconds(then: string, now: string): number | null {
  const a = Date.parse(then)
  const b = Date.parse(now)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 1000))
}

/**
 * Read one route and RECORD THE REFUSAL rather than throwing.
 *
 * A window that 500s when a route is down tells a reader nothing, while a row
 * that says "HTTP 404" or "no response within 5000 ms" tells them which
 * instrument failed. The reasons below deliberately keep three cases apart —
 * non-200, timeout, and nothing at all — because a timeout is not an unreachable
 * route and neither is an HTTP error, and a status surface must not merge them.
 *
 * A FAILED LIVE ATTEMPT FALLS BACK TO THE LAST GOOD READING, marked `cache`, and
 * the failure travels with it. The first version of this function discarded the
 * row instead, which meant a slow socket deleted four rows the window already
 * held — the defect `prov-tools-skills` paid for on the same surface.
 */
async function read(key: RouteKey): Promise<Reading> {
  const url = `${ORIGIN}${ROUTES[key]}`
  const attemptAt = new Date().toISOString()
  let failure: string | null = null
  let liveStatus: number | null = null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const text = await response.text()
    const at = new Date().toISOString()
    const bytes = new TextEncoder().encode(text).byteLength
    let body: Record<string, unknown> | null = null
    try {
      const parsed: unknown = JSON.parse(text)
      body = isObject(parsed) ? parsed : null
    } catch {
      body = null
    }
    if (response.ok) {
      GOOD_READINGS.set(key, { at, status: response.status, bytes, body })
      return { key, url, status: response.status, bytes, at, body, source: 'live', liveFailure: null, liveAt: at, liveStatus: response.status }
    }
    failure = `HTTP ${response.status}`
    liveStatus = response.status
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : ''
    const message = error instanceof Error ? error.message : String(error)
    failure = name === 'TimeoutError' || /timed? out/i.test(message)
      ? `no response within ${TIMEOUT_MS} ms — slow, which is not the same as down`
      : `no response at all: ${message}`
  }

  const cached = GOOD_READINGS.get(key)
  if (cached !== undefined) {
    const age = ageSeconds(cached.at, attemptAt)
    if (age !== null && age * 1_000 <= CACHE_MAX_AGE_MS) {
      return { key, url, status: cached.status, bytes: cached.bytes, at: cached.at, body: cached.body, source: 'cache', liveFailure: failure, liveAt: attemptAt, liveStatus }
    }
    failure = `${failure}; the last good reading is ${age === null ? 'of unknown age' : `${age} s old`}, past the ${Math.round(CACHE_MAX_AGE_MS / 60_000)}-minute ceiling, so it is NOT shown as this window's value`
  }

  return { key, url, status: null, bytes: null, at: attemptAt, body: null, source: 'none', liveFailure: failure, liveAt: attemptAt, liveStatus }
}

/**
 * The prefix a row carries when its value is NOT from a live probe of this call.
 *
 * A cached row keeps its verdict and its numbers, and it must not be able to read
 * as current: the prefix states that in front of the sentence rather than in a
 * footnote, because the first clause of a row is what a reader takes away.
 */
function readingPrefix(reading: Reading): string {
  if (reading.source === 'cache') return 'FROM A LAST-GOOD READING, NOT A LIVE PROBE OF THIS CALL: '
  if (reading.source === 'none') return 'NOT MEASURED: '
  return ''
}

/**
 * The citation for one reading, in the form both a reader and the driver check.
 *
 * A LIVE reading cites its own clock. A CACHED reading says CACHED, cites the
 * clock of the reading it is reusing, gives its age in seconds, and names the
 * failure that put it in that state — because a value with no age is a value
 * presented as current.
 */
function evidenceOf(reading: Reading, now: string): string {
  const size = `${show('status', reading.status)} / ${show('bytes', reading.bytes)}`
  if (reading.source === 'live') return `GET ${ROUTES[reading.key]} → ${size} at ${reading.at} (LIVE)`
  if (reading.source === 'cache') {
    const age = ageSeconds(reading.at, now)
    return `GET ${ROUTES[reading.key]} → ${size} at ${reading.at} (CACHED, ${age === null ? 'age unknown' : `${age} s old`}); the live read FAILED: ${reading.liveFailure ?? 'no reason recorded'}${reading.liveStatus === null ? '' : ` (live status was ${reading.liveStatus}, which is reported as itself and not as an empty result)`}`
  }
  return `GET ${ROUTES[reading.key]} → NOT MEASURED: ${reading.liveFailure ?? 'no reason recorded'} at ${reading.liveAt}`
}

/** The intent map's own account of itself, extracted with presence tests, not coercion. */
interface IntentMapFacts {
  readonly freshness: string | null
  readonly model: string | null
  readonly dim: number | null
  readonly endpoint: string | null
  readonly identityConfirmed: boolean | null
  readonly modelStated: string | null
  readonly builtAt: string | null
  readonly vectorCount: number | null
  readonly censusAt: string | null
  readonly zonesCount: number | null
  readonly zonesOf: number | null
  readonly zonesFreshCount: number | null
  readonly zonesFreshOf: number | null
  readonly zoneRows: number
  readonly hashCurrent: number
  readonly staleFlagged: number
  readonly verdictMissing: number
  readonly staleListed: number
  readonly inScopeCount: number | null
  readonly inScopeOf: number | null
  readonly catalogCount: number | null
}

function readIntentMap(reading: Reading): IntentMapFacts {
  const body = reading.body
  const index = sub(body, 'index')
  const identity = sub(index, 'identity')
  const zonesFresh = sub(index, 'zonesFresh')
  const corpus = sub(body, 'corpus')
  const zonesCorpus = sub(corpus, 'zones')
  const inScope = sub(corpus, 'inScopePlugins')
  const zoneRows = rows(body === null ? null : body['zones'])
  let hashCurrent = 0
  let staleFlagged = 0
  let verdictMissing = 0
  for (const zone of zoneRows) {
    const indexedHash = str(zone['indexedHash'])
    const currentHash = str(zone['currentHash'])
    if (indexedHash !== null && currentHash !== null && indexedHash === currentHash) hashCurrent += 1
    if (flag(zone['stale']) === true) staleFlagged += 1
    if (zone['verdict'] === null || zone['verdict'] === undefined) verdictMissing += 1
  }
  return {
    freshness: str(index === null ? null : index['freshness']),
    model: str(identity === null ? null : identity['model']),
    dim: num(identity === null ? null : identity['dim']),
    endpoint: str(identity === null ? null : identity['endpoint']),
    identityConfirmed: flag(identity === null ? null : identity['identityConfirmed']),
    modelStated: str(identity === null ? null : identity['modelStated']),
    builtAt: str(identity === null ? null : identity['builtAt']),
    vectorCount: num(identity === null ? null : identity['vectorCount']),
    censusAt: str(body === null ? null : body['censusAt']),
    zonesCount: num(zonesCorpus === null ? null : zonesCorpus['count']),
    zonesOf: num(zonesCorpus === null ? null : zonesCorpus['of']),
    zonesFreshCount: num(zonesFresh === null ? null : zonesFresh['count']),
    zonesFreshOf: num(zonesFresh === null ? null : zonesFresh['of']),
    zoneRows: zoneRows.length,
    hashCurrent,
    staleFlagged,
    verdictMissing,
    staleListed: rows(index === null ? null : index['stale']).length,
    inScopeCount: num(inScope === null ? null : inScope['count']),
    inScopeOf: num(inScope === null ? null : inScope['of']),
    catalogCount: num(corpus === null ? null : corpus['catalogCount']),
  }
}

/** The plan corpus index: identity, size, and the fresh/stale split of docs and chunks. */
interface PlanRagFacts {
  readonly ok: boolean | null
  readonly model: string | null
  readonly dim: number | null
  readonly endpoint: string | null
  readonly identityMatch: boolean | null
  readonly liveReason: string | null
  readonly indexBytes: number | null
  readonly builtAt: string | null
  readonly docTotal: number | null
  readonly docsFresh: number | null
  readonly docsStale: number | null
  readonly docsMissing: number | null
  readonly docsOf: number | null
  readonly chunkTotal: number | null
  readonly chunksFresh: number | null
  readonly chunksStale: number | null
  readonly chunksOf: number | null
  readonly buildErrors: number
}

function readPlanRag(reading: Reading): PlanRagFacts {
  const body = reading.body
  const index = sub(body, 'index')
  const census = sub(body, 'census')
  const identity = sub(census, 'identity') ?? sub(body, 'liveIdentity')
  const freshness = sub(body, 'freshness')
  const documents = sub(freshness, 'documents')
  const chunks = sub(freshness, 'chunks')
  const buildErrors = census === null ? [] : rows(census['buildErrors'])
  return {
    ok: flag(body === null ? null : body['ok']),
    model: str(identity === null ? null : identity['model']),
    dim: num(identity === null ? null : identity['dim']),
    endpoint: str(identity === null ? null : identity['endpoint']),
    identityMatch: flag(body === null ? null : body['identityMatch']),
    liveReason: str(sub(body, 'liveIdentity') === null ? null : (sub(body, 'liveIdentity') as Record<string, unknown>)['reason']),
    indexBytes: num(index === null ? null : index['bytes']),
    builtAt: str(census === null ? null : census['builtAt']),
    docTotal: num(census === null ? null : census['docTotal']),
    docsFresh: num(documents === null ? null : documents['fresh']),
    docsStale: num(documents === null ? null : documents['stale']),
    docsMissing: num(documents === null ? null : documents['missing']),
    docsOf: num(documents === null ? null : documents['of']),
    chunkTotal: num(census === null ? null : census['chunkTotal']),
    chunksFresh: num(chunks === null ? null : chunks['fresh']),
    chunksStale: num(chunks === null ? null : chunks['stale']),
    chunksOf: num(chunks === null ? null : chunks['of']),
    buildErrors: buildErrors.length,
  }
}

/** The user intent path: what the ledger holds, and the control state attached to it. */
interface IntentModeFacts {
  readonly lines: number | null
  readonly parsed: number | null
  readonly unparseable: number | null
  readonly intents: number | null
  readonly maxSeq: number | null
  readonly received: number | null
  readonly threshold: number | null
  readonly paused: boolean | null
  readonly preheat: string | null
  readonly adapter: string | null
  readonly readAt: string | null
}

function readIntentMode(reading: Reading): IntentModeFacts {
  const body = reading.body
  const census = sub(body, 'census')
  const byStatus = sub(census, 'byStatus')
  const control = sub(body, 'control')
  return {
    lines: num(census === null ? null : census['lines']),
    parsed: num(census === null ? null : census['parsed']),
    unparseable: num(census === null ? null : census['unparseable']),
    intents: num(census === null ? null : census['intents']),
    maxSeq: num(census === null ? null : census['maxSeq']),
    received: num(byStatus === null ? null : byStatus['received']),
    threshold: num(control === null ? null : control['threshold']),
    paused: flag(control === null ? null : control['paused']),
    preheat: str(control === null ? null : control['preheat']),
    adapter: str(control === null ? null : control['adapter']),
    readAt: str(body === null ? null : body['readAt']),
  }
}

/** `n of d` with an explicit absent form, so a missing count never prints as `0 of 0`. */
function ratio(numerator: number | null, denominator: number | null): string {
  if (numerator === null || denominator === null) return 'NOT MEASURED (the route did not supply both numbers)'
  return `${numerator} of ${denominator}`
}

/** `key=value` or `<key> NOT MEASURED`, for the evidence strings. */
function show(label: string, value: string | number | boolean | null): string {
  return value === null ? `${label}=NOT MEASURED` : `${label}=${String(value)}`
}

/**
 * Build the meta-intent window.
 *
 * The parameter is accepted and IGNORED on purpose: this module answers for one
 * window, the assembly already knows which module it called, and branching here
 * would create a second place that decides identity. It is typed rather than
 * dropped so the assembly's uniform call shape typechecks.
 */
export async function buildWindow(windowId?: WindowId): Promise<ProviderWindow> {
  void windowId
  const [mapReading, modeReading, ragReading, ragSearchReading, mapSearchReading] = await Promise.all([
    read('intentMap'),
    read('intentMode'),
    read('planRagStatus'),
    read('planRagSearch'),
    read('intentMapSearch'),
  ])

  const at = new Date().toISOString()
  const map = readIntentMap(mapReading)
  const mode = readIntentMode(modeReading)
  const rag = readPlanRag(ragReading)

  // The search route's refusal is the measurement that decides whether the index
  // is QUERYABLE, which is a different claim from whether the vectors exist.
  const embedded = flag(ragSearchReading.body === null ? null : ragSearchReading.body['embedded'])
  const embedReason = str(ragSearchReading.body === null ? null : ragSearchReading.body['reason'])
  const embedModel = str(ragSearchReading.body === null ? null : ragSearchReading.body['model'])

  // -------------------------------------------------------------------------
  // Rows. Four surfaces, each carrying the reading it came from.
  // -------------------------------------------------------------------------

  const mapItem: WindowItem = {
    id: 'dsh-intent-map',
    name: 'dsh-intent-map',
    npm: null,
    owner: null,
    kind: 'exists',
    installed: mapReading.status === 200 ? true : null,
    downloadable: null,
    source: { where: 'installed', route: ROUTES.intentMap },
    intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
    alignment: {
      verdict: mapReading.status === 200 && map.hashCurrent === map.zoneRows && map.zoneRows > 0 ? 'aligned' : 'not-measured',
      why: mapReading.status === 200
        ? `${readingPrefix(mapReading)}${ratio(map.zonesFreshCount, map.zonesFreshOf)} zones indexed and ${ratio(map.hashCurrent, map.zoneRows)} zone hashes current; ${ratio(map.staleListed, map.zoneRows)} listed stale; ${ratio(map.verdictMissing, map.zoneRows)} zones carry NO verdict (a per-zone verdict has not been computed for them, so the map is current, not judged)`
        : `the map route produced no reading (${mapReading.liveFailure ?? 'no reason recorded'}), so no zone census exists to report — this is not a map with zero zones`,
      evidence: evidenceOf(mapReading, at),
    },
    patch: null,
  }

  const indexItem: WindowItem = {
    id: 'dsh-intent-map-index',
    name: 'intent map embedding index (precomputed zone vectors)',
    npm: null,
    owner: null,
    kind: 'exists',
    installed: map.vectorCount !== null && map.vectorCount > 0 ? true : null,
    downloadable: null,
    source: { where: 'installed', route: ROUTES.intentMap },
    intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
    alignment: {
      verdict: 'not-measured',
      why: embedded === true
        ? `${readingPrefix(ragSearchReading)}${ratio(map.vectorCount, map.zonesOf)} zone vectors built at ${show('builtAt', map.builtAt)} under ${show('model', map.model)} / ${show('dim', map.dim)}, and a live query embedded successfully`
        : `${readingPrefix(ragSearchReading)}${ratio(map.vectorCount, map.zonesOf)} zone vectors EXIST and are served, and a live query could NOT be embedded (${show('embedded', embedded)}; ${embedReason ?? 'no reason was stated by the route'}) — so the index is built and its query path is unqueryable right now. A vector count is not a query result and is not reported as one`,
      evidence: `${evidenceOf(ragSearchReading, at)}, which names ${show('queryModel', embedModel)} for the query it could not embed; index identity ${show('model', map.model)} / ${show('dim', map.dim)} / ${show('identityConfirmed', map.identityConfirmed)} / ${show('modelStated', map.modelStated)}`,
    },
    patch: null,
  }

  const modeItem: WindowItem = {
    id: 'dsh-intent-mode',
    name: 'dsh-intent-mode',
    npm: null,
    owner: null,
    kind: 'exists',
    installed: modeReading.status === 200 ? true : null,
    downloadable: null,
    source: { where: 'installed', route: ROUTES.intentMode },
    intent: { zones: [], originalIntent: 'pass', collidesWith: [] },
    alignment: {
      verdict: modeReading.status === 200 ? 'aligned' : 'not-measured',
      why: modeReading.status === 200
        ? `${readingPrefix(modeReading)}the user path holds ${ratio(mode.intents, mode.lines)} intents per ledger line (${show('received', mode.received)} still in status "received", ${show('unparseable', mode.unparseable)} unparseable); control state ${show('threshold', mode.threshold)} / ${show('preheat', mode.preheat)} / ${show('adapter', mode.adapter)} / ${show('paused', mode.paused)}`
        : `the intent-mode route produced no reading (${modeReading.liveFailure ?? 'no reason recorded'}), so the ledger census was not read — an unread ledger is not an empty one`,
      evidence: evidenceOf(modeReading, at),
    },
    patch: null,
  }

  const ragItem: WindowItem = {
    id: 'dsh-plan-rag',
    name: 'dsh-plan-rag',
    npm: null,
    owner: null,
    kind: 'exists',
    installed: ragReading.status === 200 ? true : null,
    downloadable: null,
    source: { where: 'installed', route: ROUTES.planRagStatus },
    intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
    alignment: {
      verdict: rag.identityMatch === true ? 'aligned' : 'not-measured',
      why: ragReading.status === 200
        ? `${readingPrefix(ragReading)}index identity ${show('model', rag.model)} / ${show('dim', rag.dim)} compared against the live intent map: ${show('identityMatch', rag.identityMatch)}${rag.liveReason === null ? '' : ` (live reason: ${rag.liveReason})`}. CURRENCY IS SEPARATE AND WORSE: ${ratio(rag.docsFresh, rag.docsOf)} documents and ${ratio(rag.chunksFresh, rag.chunksOf)} chunks are current, so ${ratio(rag.docsStale, rag.docsOf)} documents are stale against the text on disk; ${show('buildErrors', rag.buildErrors)} build errors were recorded and the index was built at ${show('builtAt', rag.builtAt)}`
        : `the plan-rag status route produced no reading (${ragReading.liveFailure ?? 'no reason recorded'}), so neither its identity nor its freshness was read`,
      evidence: evidenceOf(ragReading, at),
    },
    patch: null,
  }

  const items: readonly WindowItem[] = [mapItem, indexItem, modeItem, ragItem]

  // -------------------------------------------------------------------------
  // Census. The population is the four surfaces this window reports. The count is
  // a COVERAGE count — how many of them answered with a readable HTTP 200 in this
  // call — and it is deliberately NOT a health verdict: the embedding index
  // answers 200 while its query path refuses, which is why its own row reads
  // `not-measured` even though it is counted here as answered. A route that did
  // not answer is counted as not covered, never as a surface with nothing in it.
  // -------------------------------------------------------------------------

  const surfaceReadings: readonly Reading[] = [mapReading, modeReading, ragReading, ragSearchReading]
  // LIVE only: a cached reading is a measurement taken at another instant and does
  // not count as coverage of the present. That is the point of separating the two.
  const answered = surfaceReadings.filter((reading) => reading.source === 'live' && reading.status === 200).length

  const census: Partial<Census> = {
    numerator: answered,
    denominator: items.length,
    population: 'intent-layer surfaces this window reports: the zone map, its precomputed embedding index, the user intent path, and the plan corpus index — counted as answering with HTTP 200 in a LIVE read taken by THIS call, out of the 4 the window declares. This is a COVERAGE count and not a health verdict: the embedding index answers 200 while its query path refuses, and its row says so. A row served from the last good reading is COUNTED AS NOT COVERED here and named in the `stale` field, because a cached reading is a measurement of an earlier instant',
    at,
  }

  // -------------------------------------------------------------------------
  // Controls. All four are READS, and all four were driven in this call, which is
  // why they are demonstrable. No write control is offered: no write route was
  // found on any of the three plugins, and inventing one would put a button on
  // the owner's surface that cannot act.
  // -------------------------------------------------------------------------

  const controls: readonly Control[] = [
    {
      id: 'read-intent-map',
      label: 'Read the 24-zone intent map (identity, per-zone content hashes, freshness)',
      kind: 'read',
      target: ROUTES.intentMap,
      demonstrable: mapReading.source === 'live' && mapReading.status === 200,
    },
    {
      id: 'read-intent-mode',
      label: 'Read the user intent ledger census and its control state',
      kind: 'read',
      target: ROUTES.intentMode,
      demonstrable: modeReading.source === 'live' && modeReading.status === 200,
    },
    {
      id: 'read-plan-rag-status',
      label: 'Read the plan corpus index identity and its fresh/stale document split',
      kind: 'read',
      target: ROUTES.planRagStatus,
      demonstrable: ragReading.source === 'live' && ragReading.status === 200,
    },
    {
      id: 'query-plan-rag',
      label: 'Query the plan corpus (returns a REFUSAL with its reason while the embedder is unreachable)',
      kind: 'read',
      target: ROUTES.planRagSearch,
      demonstrable: ragSearchReading.source === 'live' && ragSearchReading.status === 200,
    },
    {
      id: 'query-intent-map',
      label: `Query the intent map by text — NOT OFFERED BY THE PLUGIN: measured ${show('status', mapSearchReading.liveStatus)} on ${ROUTES.intentMapSearch} at ${mapSearchReading.liveAt}, and a 404 is reported as 404, never as zero matching zones`,
      kind: 'read',
      target: ROUTES.intentMapSearch,
      demonstrable: false,
    },
  ]

  // -------------------------------------------------------------------------
  // Falsifiers. Each names a claim this payload makes and the check that would
  // show it false, so the window can be wrong in public rather than in private.
  // -------------------------------------------------------------------------

  const falsifiers: readonly Falsifier[] = [
    {
      claim: 'the 24-zone intent map is current against the corpus it was built from',
      how: `GET ${ROUTES.intentMap} and compare each zone's indexedHash to its currentHash; the payload's "aligned" verdict is false if ANY of the ${map.zoneRows} zone rows has indexedHash ≠ currentHash, or if index.freshness reads anything but "fresh". Measured ${map.hashCurrent} of ${map.zoneRows} matching at ${mapReading.at}.`,
    },
    {
      claim: 'the embedding index can answer a query right now',
      how: `GET ${ROUTES.planRagSearch} and require embedded:true with at least one hit and scored.count > 0. Measured at ${ragSearchReading.at}: ${show('embedded', embedded)}, with the route's own reason ${embedReason ?? 'not stated'} — a 0 there is a refusal, not a search that found nothing.`,
    },
    {
      claim: 'the model named on this window produced the stored vectors',
      how: `read index.identity.modelStated and identityConfirmed from ${ROUTES.intentMap}; the claim is false if modelStated is null and identityConfirmed is false, which is what it reads (${show('modelStated', map.modelStated)}, ${show('identityConfirmed', map.identityConfirmed)}) — the tag is the one the client REQUESTED and ollama echoes no identity on that route, so "qwen3-embedding:0.6b / 1024" is asserted by request, not measured from the response.`,
    },
    {
      claim: 'the plan corpus retrieval covers the plan text on disk',
      how: `GET ${ROUTES.planRagStatus} and read freshness.documents.stale and freshness.chunks.stale; the claim is false if either is non-zero, which is what it reads (${show('docsStale', rag.docsStale)} of ${show('docsOf', rag.docsOf)} documents, ${show('chunksStale', rag.chunksStale)} of ${show('chunksOf', rag.chunksOf)} chunks).`,
    },
    {
      claim: 'the zone count on this window is the map\'s whole population',
      how: `compare corpus.zones.count and corpus.zones.of from ${ROUTES.intentMap} against the length of its zones array; the claim is false if the three disagree. Measured ${show('count', map.zonesCount)} / ${show('of', map.zonesOf)} against ${map.zoneRows} rendered rows — a denominator larger than the rows means rows were dropped, and equal numbers mean nothing if the array itself was never read.`,
    },
    {
      claim: `each probe bound (${TIMEOUT_MS} ms) sits above the routes it times, so a slow socket is not reported as an absent fact`,
      how: `${PROVIDER_PROBE_BOUND_RULE}. This bound is probeBoundMs(${MEASURED_MIXED_WORST_MS}) = ${probeBoundMs(MEASURED_MIXED_WORST_MS)} ms, raised to the shared floor ${PROVIDER_PROBE_BOUND_MS} ms. It is FALSE if any of the four routes answers slower than ${TIMEOUT_MS} ms in six live reads on the loaded process — re-measure and a worse reading refutes it. The measured ladder is published in this file's TIMEOUT_MS comment: mixed-sweep worst ${MEASURED_MIXED_WORST_MS} ms, saturation worst ${MEASURED_SATURATION_WORST_MS} ms, and the saturation figure is ABOVE the bound on purpose — that case degrades to a stale row served from its last good reading rather than to a window with no value, because a 9,500 ms ceiling would charge every ordinary read for a self-inflicted flood.`,
    },
    {
      claim: 'the intent ledger behind the user path is fully parsed',
      how: `GET ${ROUTES.intentMode} and require census.unparseable = 0 with census.parsed = census.lines; measured ${show('parsed', mode.parsed)} of ${show('lines', mode.lines)} lines parsed, ${show('unparseable', mode.unparseable)} unparseable.`,
    },
  ]

  // -------------------------------------------------------------------------
  // `stale` versus `unavailable` — the split the whole fix turns on.
  //
  // The first version raised `unavailable` from the probe, so ONE slow socket
  // erased four rows and told the owner the intent layer was gone. The two states
  // are now distinct and neither is inferred from the other:
  //   `unavailable` — NOTHING was measured: not live and not cached. The window
  //                   has no value to show and says so.
  //   `stale`       — the window ANSWERED, and at least one row's value did not
  //                   come from a live probe of this call: either it is the last
  //                   good reading (age stated) or the surface did not answer at
  //                   all while others did. Rows are kept, `unavailable` is null.
  // A window with one dead surface out of four is degraded, not absent, and the
  // reason names which surface and why so a reader can act on it.
  // -------------------------------------------------------------------------

  const notLive = surfaceReadings.filter((reading) => reading.source !== 'live')
  const anyValue = surfaceReadings.some((reading) => reading.status === 200)
  const nothingMeasured = !anyValue
  const degraded = notLive.length > 0 && anyValue

  const staleReason = degraded
    ? `this window answered, and ${notLive.length} of ${surfaceReadings.length} of its live probes did not succeed: ${notLive.map((reading) => `${reading.key} ${reading.source === 'cache' ? `served from its last good reading of ${reading.at} (${ageSeconds(reading.at, at) ?? '?'} s old) because the live read failed: ${reading.liveFailure ?? 'no reason recorded'}` : `NOT MEASURED (${reading.liveFailure ?? 'no reason recorded'})`}`).join('; ')}. The bound on each probe is ${TIMEOUT_MS} ms; a probe that exceeded it is reported as silence for that long, never as an absence of the underlying fact.`
    : null

  return {
    window: {
      description: 'The intent layer this system actually runs — the 24-zone map, its precomputed embedding index, the user intent path, and the plan corpus — with each map\'s freshness stated from a content hash rather than from a timestamp.',
      kind: 'exists',
    },
    census,
    items,
    unavailable: nothingMeasured
      ? {
        reason: `NOTHING was measured: none of the four intent-layer routes produced a live reading, and no cached reading was available to fall back on. Reasons — ${surfaceReadings.map((reading) => `${reading.key}: ${reading.liveFailure ?? 'no reason recorded'}`).join('; ')}. That is an instrument failure, not an intent layer with nothing in it.`,
        measuredAt: at,
      }
      : null,
    stale: staleReason === null
      ? null
      : { reason: staleReason, boundMs: TIMEOUT_MS, at },
    controls,
    falsifiers,
  }
}
