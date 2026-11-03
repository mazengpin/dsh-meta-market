import type { Maybe, Measured } from '../../shared/protocol.ts'
import type { AlignmentCensus } from './types.ts'

/**
 * The census, and the two stalenesses it keeps apart.
 *
 * THE TRAP, quoted from the live substrate's own `absenceDiscipline` before anything is built on it
 * (`GET /intent-map/api/map`, VERIFIED (ran), 2026-10-16T16:48Z):
 *
 *   "`fresh` means the corpus text is byte-identical to what was embedded. It does NOT mean the map
 *    is correct."
 *
 * The arithmetic of the trap: `freshness: "fresh"` with `zonesFresh 24 of 24` and `stale: []` means
 * the 24 vectors match the 24 zone DEFINITIONS. It says nothing about the market. The index was built
 * from `research/cache/plugins-2026-10-12.json` at 4,527 rows; the live catalog was measured at 4,765
 * rows on 2026-10-15 (the Lead's measurement, NOT re-taken by this lane). That is +238 rows, +5.26%,
 * in three days. A package added on 2026-10-13 is in NONE of those 24 zones.
 *
 * So an alignment verdict that carries a score and not the census it was scored against is a
 * confident lie, and `AlignmentCensus` is a REQUIRED field of every result so that this is
 * unrepresentable.
 */

/** What the map route reports about its own index. Read, not re-derived. */
export interface IndexFacts {
  readonly model: string | null
  readonly dim: number | null
  /** Zones carrying an indexed vector, with its denominator. */
  readonly zonesIndexed: Measured
  /** Zones whose stored vector no longer matches its definition. */
  readonly zonesStale: Measured
  readonly freshness: string
  readonly builtAt: string
  readonly indexCensusAt: string
  readonly sourceCatalog: string
  readonly catalogCount: number
  readonly catalogUpdated: string
}

/**
 * The live catalog has no reading until something takes one.
 *
 * `value: null` with a reason — NEVER `0`. A `0` here would assert that the live catalog is empty,
 * which no instrument in this lane ever measured. This lane does not fetch the network, so this is
 * the normal value.
 */
export const LIVE_CATALOG_NOT_MEASURED: Maybe<number> = {
  value: null,
  reason:
    'this lane does not fetch the live catalog; no reading was taken, so the count is absent rather than zero',
}

/**
 * INTEGRITY staleness: does the index still describe the definitions it holds vectors for?
 *
 * `freshness !== "fresh"` means the stored vectors no longer match the zone definitions. Nothing may
 * be scored — a similarity would be measured against definitions that no longer exist.
 */
export function integrityPermitsScoring(freshness: string): {
  readonly permitted: boolean
  readonly reason: Maybe<string>
} {
  if (freshness === 'fresh') {
    return {
      permitted: true,
      reason: {
        value: null,
        reason:
          'the vectors match the zone DEFINITIONS; this says nothing about whether they describe the current market',
      },
    }
  }
  return {
    permitted: false,
    reason: {
      value: `the index reports freshness "${freshness}", so its vectors no longer match the zone definitions they represent. Nothing may be scored against them.`,
      reason: null,
    },
  }
}

/** Parse `YYYY-MM-DD` to a comparable integer, or `null` when unparseable. */
function dateKey(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (m === null) return null
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
}

/**
 * Build the census for one alignment run.
 *
 * `currencyStale` is computed from the CATALOG DATES, not from a live reading, so the caveat is
 * populated even when the live catalog was never measured. That is deliberate: making it conditional
 * would let an unmeasured run silently drop its most important caveat.
 */
export function buildCensus(
  index: IndexFacts,
  liveCatalogCount: Maybe<number>,
  alignmentAt: string,
): AlignmentCensus {
  const integrity = integrityPermitsScoring(index.freshness)

  const delta: Maybe<number> =
    liveCatalogCount.value === null
      ? { value: null, reason: 'no live catalog reading was taken, so no delta can be computed' }
      : {
          value: liveCatalogCount.value - index.catalogCount,
          reason: null,
        }

  const deltaPercent: Maybe<number> =
    delta.value === null || index.catalogCount === 0
      ? {
          value: null,
          reason:
            delta.value === null
              ? 'no live catalog reading was taken'
              : 'the index catalog count is 0, so a percentage is undefined rather than infinite',
        }
      : {
          value: (delta.value / index.catalogCount) * 100,
          reason: null,
        }

  const indexKey = dateKey(index.catalogUpdated)
  const nowKey = dateKey(alignmentAt)
  const currencyStale =
    indexKey === null || nowKey === null ? false : indexKey < nowKey

  const measuredPart =
    liveCatalogCount.value === null
      ? 'the live catalog was NOT measured in this run, so the delta is unknown'
      : `the live catalog was measured at ${String(liveCatalogCount.value)} rows`

  return {
    integrityOk: integrity.permitted,
    integrityReason: integrity.reason,
    liveCatalogCount,
    indexCatalogCount: { count: index.catalogCount, of: index.catalogCount },
    indexCatalogDate: index.catalogUpdated,
    indexCensusAt: index.indexCensusAt,
    catalogDelta: delta,
    catalogDeltaPercent: deltaPercent,
    zonesIndexed: index.zonesIndexed,
    zonesStale: index.zonesStale,
    indexedAt: index.builtAt,
    currencyStale,
    currencyCaveat: `the ${String(index.zonesIndexed.of)} zones were derived from ${index.sourceCatalog}, a catalog dated ${index.catalogUpdated}; this alignment ran ${alignmentAt}. A catalog row added after ${index.catalogUpdated} is represented in NONE of the ${String(index.zonesIndexed.of)} zones, so a package built from such a row cannot be aligned by similarity to them — and ${measuredPart}.`,
  }
}
