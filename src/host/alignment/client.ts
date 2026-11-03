import type { EmbeddingIdentity, Maybe, Measured } from '../../shared/protocol.ts'
import type { IndexFacts } from './census.ts'
import type { ZoneScore } from './types.ts'
import { INTENT_MAP_ROUTES } from './types.ts'

/**
 * The read-only client for the live `dsh-intent-map` routes.
 *
 * READ-ONLY BY DECISION — see `ZONE_WRITE_POLICY` in `operator.ts`. This module issues GETs and
 * nothing else; there is deliberately no write function here, because a writer would be a scope
 * violation against a plugin that is live on the owner's own session.
 *
 * EVERY READ IS DISCRIMINATED. A `404` and an empty result are different facts, and a client that
 * returned `[]` for a failed fetch would make the operator's gate 3 fire for the wrong reason. The
 * `ReadOutcome` union forces the caller to handle the failure branch.
 */

/** A fetch that cannot hang forever. */
const DEFAULT_TIMEOUT_MS = 5000

/** Normalise an HTTP base, so a caller passing a trailing slash does not produce a `//` route. */
function joinUrl(base: string, route: string): string {
  return `${base.replace(/\/+$/, '')}${route}`
}

/** GET and parse, mapping every failure to the `ok: false` branch rather than to an empty value. */
export async function readJson<T>(
  base: string,
  route: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<import('./types.ts').ReadOutcome<T>> {
  const readAt = new Date().toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(joinUrl(base, route), { signal: controller.signal })
    if (!response.ok) {
      return { ok: false, status: response.status, route, readAt }
    }
    const value = (await response.json()) as T
    return { ok: true, value, readAt }
  } catch {
    // A network failure is `0`, which is NOT an HTTP status. The caller sees `ok: false` and a
    // status of 0, and must not read that as "the route answered with nothing".
    return { ok: false, status: 0, route, readAt }
  } finally {
    clearTimeout(timer)
  }
}

/** The subset of the map payload this lane reads. */
export interface MapPayload {
  readonly index: {
    readonly identity: {
      readonly model: string | null
      readonly dim: number | null
      readonly vectorCount: number
    }
    readonly vectorCount: number
    readonly freshness: string
    readonly zonesFresh: Measured
    readonly stale: readonly string[]
    readonly builtAt: string
    readonly sourceCatalog: string
    readonly catalogUpdated: string
    readonly censusAt: string
    readonly catalogCount: number
  }
}

/** The subset of the identity payload this lane reads. */
export interface IdentityPayload {
  readonly index: { readonly model: string | null; readonly dim: number | null }
  readonly live: {
    readonly model: string | null
    readonly dim: number | null
    readonly source: string | null
  }
  readonly probedAt: string | null
}

/** The subset of the recall payload this lane reads. */
export interface RecallPayload {
  readonly embedded: boolean
  readonly reason: string | null
  readonly scoredZones: Measured
  readonly hits: readonly { readonly zoneId: string; readonly similarity: number }[]
}

/** Read the index facts the census needs. Returns the failure branch rather than a guess. */
export async function readIndexFacts(
  base: string,
): Promise<import('./types.ts').ReadOutcome<IndexFacts>> {
  const outcome = await readJson<MapPayload>(base, INTENT_MAP_ROUTES.map)
  if (!outcome.ok) return outcome
  const idx = outcome.value.index
  return {
    ok: true,
    readAt: outcome.readAt,
    value: {
      model: idx.identity.model,
      dim: idx.identity.dim,
      zonesIndexed: idx.zonesFresh,
      zonesStale: { count: idx.stale.length, of: idx.zonesFresh.of },
      freshness: idx.freshness,
      builtAt: idx.builtAt,
      indexCensusAt: idx.censusAt,
      sourceCatalog: idx.sourceCatalog,
      catalogCount: idx.catalogCount,
      catalogUpdated: idx.catalogUpdated,
    },
  }
}

/** Read the substrate's own account of the embedding it is serving. */
export async function readLiveIdentity(
  base: string,
): Promise<import('./types.ts').ReadOutcome<EmbeddingIdentity>> {
  const outcome = await readJson<IdentityPayload>(base, INTENT_MAP_ROUTES.identity)
  if (!outcome.ok) return outcome
  // Only the LIVE half is taken here. The INDEX half comes from the map route via
  // `readIndexFacts`, so `guardIdentity` compares two halves that were read from TWO different
  // routes rather than one route against itself, which would make the check vacuous.
  const { live } = outcome.value
  return {
    ok: true,
    readAt: outcome.readAt,
    value: {
      model: live.model,
      dim: live.dim,
      /**
       * The live half is read from the substrate's OWN statement about itself, so when it names a
       * model that is a server self-report. When it does not, the name is absent rather than
       * inherited from the index, which would manufacture agreement.
       */
      modelSource: live.model === null ? null : 'server-self-report',
      endpoint: live.source,
    },
  }
}

/** Cosine similarity. Returns `null` — with a reason — rather than `0` for an undefinable pair. */
export function cosine(
  a: readonly number[],
  b: readonly number[],
): Maybe<number> {
  if (a.length === 0 || b.length === 0) {
    return { value: null, reason: 'one of the vectors is empty, so no angle is defined' }
  }
  if (a.length !== b.length) {
    return {
      value: null,
      reason: `the vectors have different widths (${String(a.length)} and ${String(b.length)}), so no similarity is defined between them`,
    }
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (x === undefined || y === undefined) {
      return { value: null, reason: 'a vector component is absent' }
    }
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) {
    return { value: null, reason: 'a zero-magnitude vector has no direction' }
  }
  return { value: dot / (Math.sqrt(na) * Math.sqrt(nb)), reason: null }
}

/** Read the zones a query scores, as `ZoneScore`s ready for `alignPackage`. */
export async function readZoneScores(
  base: string,
  query: string,
  top = 24,
): Promise<import('./types.ts').ReadOutcome<readonly ZoneScore[]>> {
  const route = `${INTENT_MAP_ROUTES.recall}?q=${encodeURIComponent(query)}&top=${String(top)}`
  const outcome = await readJson<RecallPayload>(base, route)
  if (!outcome.ok) return outcome
  if (!outcome.value.embedded) {
    return {
      ok: true,
      readAt: outcome.readAt,
      value: outcome.value.hits.map((h) => ({
        zoneId: h.zoneId,
        similarity: {
          value: null,
          reason: `the substrate did not embed this query: ${outcome.value.reason ?? 'no reason given'}`,
        },
        aboveThreshold: false,
      })),
    }
  }
  return {
    ok: true,
    readAt: outcome.readAt,
    value: outcome.value.hits.map((h) => ({
      zoneId: h.zoneId,
      similarity: { value: h.similarity, reason: null },
      aboveThreshold: false,
    })),
  }
}
