/**
 * Reading the REAL zone space from the live `dsh-intent-map`.
 *
 * WHY THIS FILE FETCHES INSTEAD OF HOLDING A LIST. The task's rule is "do not invent zone names", and
 * a hardcoded 24-row list would satisfy that on the day it was written and silently stop matching the
 * map every day after — which is the failure mode the program records as "a live store is not a
 * snapshot". The zone ids, their definitions and their member counts are read from the route that owns
 * them, and the count is ASSERTED against the expected 24 rather than accepted whatever it is: a space
 * of 3 zones would let the gate pass everything through a tiny vocabulary and report success.
 *
 * THE TWO READS ARE INDEPENDENT, AND ONE OF THEM IS ABOUT THE EMBEDDER. `GET /intent-map/api/map`
 * carries the zone definitions, which the token method can use with no model at all. The embedding
 * method needs the substrate to actually embed, which is a separate fact: `GET /intent-map/api/recall`
 * reports `embedded: false` with the substrate's own reason when it cannot. Probing both, separately,
 * is what lets each zone carry the method that ACTUALLY produced its score instead of the one we hoped
 * for.
 *
 * @module dsh-meta-market/host/intent-align/zone-space
 */

import type {
  ZoneDefinition,
  ZoneSpace,
  ZoneSpaceOptions,
  ZoneSpaceOutcome,
} from './types.ts'
import { CANDIDATE_ZONE_COUNT, GENERIC_ZONE_IDS } from './types.ts'

/** The map route this module reads. Named once; a probe and a build use the same string. */
export const INTENT_MAP_ROUTE = '/intent-map/api/map'

/** The recall route, used only to ask whether the substrate can embed at all. */
export const INTENT_RECALL_ROUTE = '/intent-map/api/recall'

/** The owner's live session. A probe, never a restart — this module issues GETs only. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:3083'

/** A fetch that cannot hang forever. */
const DEFAULT_TIMEOUT_MS = 8000

/** The subset of the map payload this module reads. Extra fields are ignored, never required. */
interface MapPayload {
  readonly censusAt?: string
  readonly index?: {
    readonly identity?: {
      readonly model?: string | null
      readonly dim?: number | null
      readonly builtAt?: string | null
    }
    readonly zoneCount?: number
  }
  readonly zones?: readonly {
    readonly id?: unknown
    readonly category?: unknown
    readonly definition?: unknown
    readonly memberCount?: unknown
  }[]
}

interface RecallPayload {
  readonly embedded?: unknown
  readonly reason?: unknown
}

/** Join a base and a route without producing a doubled slash. */
function joinUrl(base: string, route: string): string {
  return `${base.replace(/\/+$/, '')}${route}`
}

/**
 * Read the map route, returning the failure branch rather than an empty space.
 *
 * A network failure is reported with `status: 0`, following `alignment/client.ts`'s rule: `0` is not an
 * HTTP status, so a reader cannot confuse "nothing answered" with "the route said no".
 */
export async function loadZoneSpace(options: ZoneSpaceOptions = {}): Promise<ZoneSpaceOutcome> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const readAt = new Date().toISOString()

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  let payload: MapPayload
  try {
    const response = await fetch(joinUrl(baseUrl, INTENT_MAP_ROUTE), { signal: controller.signal })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        route: INTENT_MAP_ROUTE,
        readAt,
        reason: `the intent map answered with HTTP ${String(response.status)}; an unread zone space cannot be scored against`,
      }
    }
    payload = (await response.json()) as MapPayload
  } catch (error) {
    return {
      ok: false,
      status: 0,
      route: INTENT_MAP_ROUTE,
      readAt,
      reason: `the intent map could not be reached (${error instanceof Error ? error.message : 'unknown failure'}); status 0 means nothing answered, which is not an empty zone space`,
    }
  } finally {
    clearTimeout(timer)
  }

  const raw = payload.zones
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      status: 200,
      route: INTENT_MAP_ROUTE,
      readAt,
      reason: `the route answered but carried ${Array.isArray(raw) ? '0' : 'no'} zones; a corpus that reads as empty is instrument failure, not a pass`,
    }
  }

  const zones: ZoneDefinition[] = []
  const skipped: string[] = []
  for (const row of raw) {
    const id = typeof row.id === 'string' ? row.id : null
    const definition = typeof row.definition === 'string' ? row.definition : null
    // A zone with no definition cannot be scored by the token method, and a zone with no id cannot be
    // reported. Both are SKIPPED AND NAMED rather than coerced into a placeholder row.
    if (id === null || definition === null) {
      skipped.push(id ?? '<zone with no id>')
      continue
    }
    zones.push({
      id,
      category: typeof row.category === 'string' ? row.category : 'unknown',
      definition,
      memberCount: typeof row.memberCount === 'number' ? row.memberCount : null,
      generic: GENERIC_ZONE_IDS.includes(id),
    })
  }

  if (zones.length !== raw.length) {
    return {
      ok: false,
      status: 200,
      route: INTENT_MAP_ROUTE,
      readAt,
      reason: `${String(raw.length - zones.length)} of ${String(raw.length)} zones carried no id or no definition (${skipped.join(', ')}); a partial space would score every candidate against a vocabulary the substrate does not have`,
    }
  }

  // The count is ASSERTED, not accepted. `0 of 24` and `24 of 24` must not be able to look alike.
  if (zones.length !== CANDIDATE_ZONE_COUNT) {
    return {
      ok: false,
      status: 200,
      route: INTENT_MAP_ROUTE,
      readAt,
      reason: `the route reported ${String(zones.length)} zones but this build expects ${String(CANDIDATE_ZONE_COUNT)}; refused rather than scored against a different map`,
    }
  }

  const ids = new Set(zones.map((z) => z.id))
  if (ids.size !== zones.length) {
    return {
      ok: false,
      status: 200,
      route: INTENT_MAP_ROUTE,
      readAt,
      reason: `the space carries duplicate zone ids (${String(zones.length - ids.size)} duplicate of ${String(zones.length)}), so a zone score would be ambiguous`,
    }
  }

  const embedding = await probeEmbedding(baseUrl, timeoutMs)

  return {
    ok: true,
    readAt,
    space: {
      indexId: payload.index?.identity?.builtAt ?? payload.censusAt ?? 'unidentified-index',
      zones,
      census: { read: zones.length, of: CANDIDATE_ZONE_COUNT, at: readAt },
      embedding,
      identity: {
        model: payload.index?.identity?.model ?? null,
        dim: payload.index?.identity?.dim ?? null,
      },
    },
  }
}

/**
 * Ask the substrate whether it can embed, and take its own answer.
 *
 * This is a PROBE, not a scoring call: one short query, and the only field read is `embedded`. When it
 * is `false` the reason is the substrate's own string, carried into every zone's `methodReason`, so a
 * reader learns *why* the token method ran rather than being told only that it did.
 */
async function probeEmbedding(
  baseUrl: string,
  timeoutMs: number,
): Promise<ZoneSpace['embedding']> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    const route = `${INTENT_RECALL_ROUTE}?q=${encodeURIComponent('intent probe')}&top=1`
    const response = await fetch(joinUrl(baseUrl, route), { signal: controller.signal })
    if (!response.ok) {
      return {
        available: false,
        reason: `the recall probe answered with HTTP ${String(response.status)}; the embedding method was not offered`,
      }
    }
    const payload = (await response.json()) as RecallPayload
    if (payload.embedded === true) {
      return { available: true, reason: null }
    }
    const why = typeof payload.reason === 'string' ? payload.reason : 'no reason given'
    return {
      available: false,
      reason: `the substrate reported embedded:false for a probe query — ${why}`,
    }
  } catch (error) {
    return {
      available: false,
      reason: `the recall probe could not be reached (${error instanceof Error ? error.message : 'unknown failure'}), so the embedding method was not offered`,
    }
  } finally {
    clearTimeout(timer)
  }
}
