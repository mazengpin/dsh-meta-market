/**
 * ============================================================================
 * dsh-meta-market — L6 social topology: THE SCALE ARITHMETIC, falsifiable
 * ============================================================================
 *
 * WHAT THIS FILE IS. The arithmetic half of the L6 lane. `topology.ts` states the
 * chosen design; this file states what the design COSTS and WHERE IT BREAKS, as
 * functions of the census rather than as constants typed into prose. Every number
 * published in `research/meta-market-social.md` sections 3 and 4 is produced by a
 * function here, so a reader can re-run it instead of trusting it.
 *
 * THE ONE DESIGN RULE: **no zone table is embedded in this file.** The census is
 * read from the live `dsh-intent-map` route and passed in. An embedded table is a
 * number that drifts from its source while continuing to look authoritative, and
 * this program has published that defect more than once. Nothing here can go
 * stale, because nothing here holds a copy.
 *
 * THE SECOND RULE, AND THE ONE THAT MATTERS MORE: **the census reader REFUSES
 * rather than coerces.** `AGENTS.md` records the same coercion being paid for
 * three times — `@($null).Count` returning 1, `u.cacheReadTokens || 0` defining a
 * class whose stated predicate was false, and a "presence-aware" figure published
 * by excluding the absent samples, where the exclusion WAS the bias. Each time a
 * missing value became a plausible number. So `readZoneCensus` returns either a
 * reading or a REFUSAL carrying a code and a sentence, and there is no branch in
 * which a missing member count becomes `0`.
 *
 * AND IT CAUGHT ITS OWN AUTHOR, TWICE. (i) The first version read
 * `corpus.inScopePlugins.of` (688 — a PACKAGE count) as the ZONE denominator, and
 * the guard refused the census with `zone-count-mismatch` rather than printing a
 * figure over a mis-read denominator. (ii) The first version also looked for
 * `corpus.memberSum` and `corpus.sourceCatalogCount`, NEITHER OF WHICH EXISTS —
 * the route ships `corpus.zones{count,of}`, `corpus.inScopePlugins{count,of}`,
 * `corpus.catalogCount` and `corpus.catalogUpdated`. Both were caught by reading
 * the payload's own keys rather than by remembering them. That is the whole
 * argument for writing the guard before the arithmetic: a check that has never
 * fired is a check that has never been tested.
 *
 * AND A THIRD, FOUND WHILE RESTORING THIS FILE. The share used in the bucket
 * arithmetic must be the EXACT fraction `136/688`, not the rounded `0.1977` the
 * prose quotes. `0.1977 x 100000 / 8 = 2471.25`, but `(136/688) x 100000 / 8 =
 * 2470.93`, and the floors differ: 2471 against 2470. Feeding a rounded
 * INTERMEDIATE into a downstream computation moved a published figure
 * (617.8 KB -> **617.5 KB**). This is the program's two-denominators defect one
 * level down — not a wrong denominator, a right denominator rounded too early —
 * which is why `fingerprintEntropy` hands out the exact ratio.
 *
 * @module dsh-meta-market/host/social/scale
 */

import type { Measured, ThreeKind, Verification } from '../../shared/protocol.ts'

// ---------------------------------------------------------------------------
// The census: what the live route says, and when it said it
// ---------------------------------------------------------------------------

/**
 * One zone row, as the route reports it.
 *
 * NOTE WHAT IS ABSENT FROM THIS TYPE ON PURPOSE. The route also ships
 * `zones[].share`, and this lane **never reads it**. Measured 2026-10-16 against
 * the live payload: `share` is a WITHIN-CATEGORY share, not a corpus share —
 * `S1-content-pack` reports `share: 76` because it holds 136 of the 179 members
 * of the `skill` category, while its corpus share is 136/688 = 19.77%; and
 * `M1-cross-session-store` reports `share: 56` for 117/209 = 55.98% against a
 * corpus share of 17.01%. Quoting it as a market share overstates by about 4x.
 * That is the same defect as the catalog's `npm` field carrying a different
 * denominator from `name`, so the field is omitted here rather than documented
 * and then used by accident.
 */
export interface ZoneRow {
  readonly id: string
  readonly category: string
  readonly memberCount: number
}

/** A count together with the moment it was taken. A count without its moment is not a measurement. */
export interface ZoneCensus {
  readonly zones: readonly ZoneRow[]
  /** Zone count, numerator and denominator: the corpus total is NOT the zone total. */
  readonly zoneCount: Measured
  /** Member count across all zones. The denominator every corpus share is taken over. */
  readonly memberSum: Measured
  /** The catalog the corpus was labelled from, and the moment it was read. */
  readonly sourceCatalog: string
  /** ISO-8601. Every figure in this lane is stamped with this. */
  readonly censusAt: string
  readonly source: Verification
}

/** Why a census was refused. A refusal is a reading about the INSTRUMENT, not a value. */
export type CensusRefusalCode =
  | 'no-zones'
  | 'member-count-absent'
  | 'does-not-close'
  | 'zone-count-mismatch'
  | 'catalog-count-absent'
  | 'no-census-time'

export interface CensusRefusal {
  readonly refused: true
  readonly code: CensusRefusalCode
  /** A sentence a reader can act on. Never a bare code. */
  readonly reason: string
}

export type CensusResult =
  | { readonly refused: false; readonly census: ZoneCensus }
  | CensusRefusal

/**
 * The shape the route actually returns, with the untrusted parts `unknown`.
 *
 * THE FIELD NAMES HERE ARE MEASURED, NOT RECALLED. Getting them wrong is a silent
 * failure rather than a loud one, which is why the checks below test for presence
 * and refuse instead of defaulting.
 */
export interface RawCensusSource {
  readonly censusAt?: unknown
  readonly zones?: unknown
  readonly corpus?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the route's payload into a census, or REFUSE with a reason.
 *
 * The refusals are the point of the function. Each is a state in which the honest
 * output is "I cannot measure this", and each is reachable in practice: the
 * payload's shape has already changed once during this build, and a reader that
 * coerced would have survived the change while reporting wrong numbers throughout.
 */
export function readZoneCensus(raw: RawCensusSource): CensusResult {
  const zonesRaw = raw.zones
  if (!Array.isArray(zonesRaw) || zonesRaw.length === 0) {
    return {
      refused: true,
      code: 'no-zones',
      reason:
        'the payload carried no zone rows. An empty zone set is not a census of zero zones: it is a payload this reader does not understand, and reporting 0 would be indistinguishable from a real empty market.',
    }
  }

  const rows: ZoneRow[] = []
  for (const [index, entry] of zonesRaw.entries()) {
    if (!isRecord(entry)) {
      return {
        refused: true,
        code: 'member-count-absent',
        reason: `zone row ${index} is not an object, so it carries no memberCount to read.`,
      }
    }
    const id = entry['id']
    if (typeof id !== 'string' || id.length === 0) {
      return {
        refused: true,
        code: 'member-count-absent',
        reason: `zone row ${index} has no readable id.`,
      }
    }
    // PRESENCE BEFORE VALUE. `'memberCount' in entry` then a type test — never
    // `entry.memberCount || 0` and never `?? 0`.
    if (!('memberCount' in entry)) {
      return {
        refused: true,
        code: 'member-count-absent',
        reason: `zone ${id} carries no memberCount key at all. That is "never asked", not "zero members", and the two must not share a number.`,
      }
    }
    const memberCount = entry['memberCount']
    if (typeof memberCount !== 'number' || !Number.isInteger(memberCount) || memberCount < 0) {
      return {
        refused: true,
        code: 'member-count-absent',
        reason: `zone ${id} carries a memberCount that is not a non-negative integer (${String(memberCount)}).`,
      }
    }
    const category = entry['category']
    rows.push({
      id,
      category: typeof category === 'string' ? category : 'unlabelled',
      memberCount,
    })
  }

  const memberSum = rows.reduce((total, row) => total + row.memberCount, 0)

  const corpus = isRecord(raw.corpus) ? raw.corpus : null
  if (corpus === null) {
    return {
      refused: true,
      code: 'does-not-close',
      reason:
        'the payload carried no corpus object, so the zone sum has nothing to close against. A sum with nothing to close against is not a census.',
    }
  }

  // THE ZONE DENOMINATOR IS THE ZONE TOTAL. This is the line the first version got
  // wrong: it used `inScopePlugins.of` (688 packages) as the zone denominator and
  // was refused. Zones and packages are different populations.
  const zoneBlock = isRecord(corpus['zones']) ? corpus['zones'] : null
  if (zoneBlock === null || typeof zoneBlock['count'] !== 'number' || typeof zoneBlock['of'] !== 'number') {
    return {
      refused: true,
      code: 'zone-count-mismatch',
      reason:
        'the payload carried no readable corpus.zones{count,of}, so the number of zone rows cannot be checked against the number of zones the corpus declares.',
    }
  }
  const declaredZones = zoneBlock['count']
  const declaredZonesOf = zoneBlock['of']
  if (declaredZones !== rows.length) {
    return {
      refused: true,
      code: 'zone-count-mismatch',
      reason: `the payload has ${rows.length} zone rows but declares ${declaredZones} zones. A partial read of a zone list is exactly the case where a wrong denominator prints a confident figure.`,
    }
  }

  // THE MEMBER DENOMINATOR IS THE PACKAGE POPULATION, and that one IS
  // `inScopePlugins` — the population every corpus share is taken over. The
  // distinction between the two `of` fields is why both are read.
  const inScope = isRecord(corpus['inScopePlugins']) ? corpus['inScopePlugins'] : null
  if (inScope === null || typeof inScope['count'] !== 'number' || typeof inScope['of'] !== 'number') {
    return {
      refused: true,
      code: 'does-not-close',
      reason:
        'the payload carried no readable corpus.inScopePlugins{count,of}, so the member sum has nothing to close against.',
    }
  }
  const inScopeCount = inScope['count']
  const inScopeOf = inScope['of']

  // THE CLOSING IDENTITY: the zone rows must sum to the declared population.
  if (memberSum !== inScopeCount) {
    return {
      refused: true,
      code: 'does-not-close',
      reason: `the ${rows.length} zone rows sum to ${memberSum} members but the corpus declares ${inScopeCount} in scope. The census does not close, so every share taken over it would be wrong by the same unknown factor.`,
    }
  }
  if (inScopeCount === 0 && inScopeOf === 0) {
    // The program's own rule, inexpressible rather than merely discouraged.
    return {
      refused: true,
      code: 'does-not-close',
      reason:
        'a 0 on both sides of the closing identity is an INSTRUMENT FAILURE, not a pass — this reader is looking at a payload it cannot see, not at an empty market.',
    }
  }

  const catalogCount = corpus['catalogCount']
  if (typeof catalogCount !== 'number') {
    return {
      refused: true,
      code: 'catalog-count-absent',
      reason: 'the payload carried no numeric corpus.catalogCount, so the population the corpus was drawn from is unstated.',
    }
  }

  const catalogUpdated = corpus['catalogUpdated']
  const censusAtRaw = raw.censusAt ?? corpus['censusAt']
  if (typeof censusAtRaw !== 'string' || censusAtRaw.length === 0) {
    return {
      refused: true,
      code: 'no-census-time',
      reason:
        'the payload carried no censusAt, and a count without the moment it was taken cannot be compared against the next reading of a live store.',
    }
  }

  return {
    refused: false,
    census: {
      zones: rows,
      zoneCount: { count: rows.length, of: declaredZonesOf },
      memberSum: { count: memberSum, of: inScopeOf },
      sourceCatalog: `${typeof catalogUpdated === 'string' ? catalogUpdated : 'undated'} (catalogCount ${catalogCount})`,
      censusAt: censusAtRaw,
      source: 'verified-ran',
    },
  }
}

// ---------------------------------------------------------------------------
// Privacy arithmetic: how large is the anonymity set, really
// ---------------------------------------------------------------------------

/**
 * The entropy of the observed zone distribution, three ways.
 *
 * WHY THREE AND NOT ONE. `C(24, k)` — the count of zone subsets — is the number a
 * first pass reaches for, and it is an OVERSTATEMENT because the zones are not
 * equally populated. Shannon entropy is the average case; min-entropy is the
 * worst case and is the figure that governs a GUESSING adversary; the uniform
 * bound is the always-cited ceiling that nothing here reaches. Reporting the raw
 * subset count as an anonymity set is the overstatement this type makes visible.
 */
export interface FingerprintEntropy {
  /** Shannon entropy in bits, over the zone member distribution. */
  readonly shannonBits: number
  /** Min-entropy in bits: -log2(max p). The worst-case, guessing-adversary figure. */
  readonly minEntropyBits: number
  /** log2(zoneCount): what the entropy would be if every zone were equally sized. */
  readonly uniformBits: number
  /** 2^shannonBits: the effective number of equally-likely zones. */
  readonly perplexity: number
  /** The largest zone, whose share is what drives min-entropy down. */
  readonly largestZone: { readonly id: string; readonly share: number }
  readonly zoneCount: Measured
}

/**
 * Compute the three entropy readings from a census.
 *
 * `largestZone.share` is an EXACT ratio (`memberCount / total`) and is handed out
 * so that downstream arithmetic never has to use the rounded decimal the prose
 * quotes. Rounding it here moved a published figure by 0.3 KB; see the module
 * header.
 */
export function fingerprintEntropy(census: ZoneCensus): FingerprintEntropy {
  const total = census.memberSum.count
  const count = census.zones.length
  if (total === 0 || count === 0) {
    throw new Error('fingerprintEntropy requires a non-empty census; readZoneCensus refuses an empty one.')
  }

  let shannonBits = 0
  let largest: { id: string; share: number } = { id: '', share: 0 }
  for (const zone of census.zones) {
    const p = zone.memberCount / total
    if (p > 0) shannonBits -= p * Math.log2(p)
    if (p > largest.share) largest = { id: zone.id, share: p }
  }

  return {
    shannonBits,
    minEntropyBits: -Math.log2(largest.share),
    uniformBits: Math.log2(count),
    perplexity: 2 ** shannonBits,
    largestZone: largest,
    zoneCount: { count, of: count },
  }
}

/** The number of k-subsets of `zoneCount` zones: C(n, k). The raw, unweighted anonymity figure. */
export function zoneSubsetCount(zoneCount: number, k: number): number {
  if (k < 0 || k > zoneCount) return 0
  let result = 1
  for (let i = 0; i < k; i++) {
    result = (result * (zoneCount - i)) / (i + 1)
  }
  return Math.round(result)
}

/**
 * The anonymity set corrected for the distribution: 2^(k * H_min).
 *
 * THIS IS THE NUMBER TO QUOTE, and the gap from `zoneSubsetCount` is the finding.
 * Measured at k=4 over the live census: `C(24,4) = 10,626` against
 * `2^(4 x 2.3388) = 655`. **The raw subset count overstates anonymity 16.2x**,
 * because an adversary guesses the popular zones first and the largest zone
 * (19.77% of members) sets the floor.
 */
export function anonymitySetByMinEntropy(minEntropyBits: number, k: number): number {
  return 2 ** (k * minEntropyBits)
}

// ---------------------------------------------------------------------------
// Roster cost: the O(N^2) term, priced so it can be declined rather than assumed
// ---------------------------------------------------------------------------

export interface RosterCost {
  readonly perPeerBytes: number
  readonly perPeerMb: number
  readonly networkBytes: number
  readonly networkTb: number
}

/** Bytes needed to name one zone's bucket set: `B` bucket keys at `bytesPerPeerRecord` each. */
function bucketKeyBytes(bucketsPerZone: number, bytesPerPeerRecord: number): number {
  return bucketsPerZone * bytesPerPeerRecord
}

/**
 * The cost if every peer held a roster entry for every other peer.
 *
 * This is the O(N^2) term. It is computed because "we avoid O(N^2)" is a claim
 * that needs a price attached, and the price is what makes the design decision
 * legible: at the 100,000-peer target it is **48.83 MB per peer and 4.66 TB
 * network-wide**, against 632,320 B (617.5 KB) per peer for the chosen shape — an
 * **81x** reduction.
 */
export function rosterCost(population: number, bucketsPerZone: number, bytesPerPeerRecord = 64): RosterCost {
  const perPeerBytes = population * bucketKeyBytes(bucketsPerZone, bytesPerPeerRecord)
  const networkBytes = perPeerBytes * population
  return {
    perPeerBytes,
    perPeerMb: perPeerBytes / (1024 * 1024),
    networkBytes,
    networkTb: networkBytes / (1024 * 1024 * 1024 * 1024),
  }
}

/**
 * The population at which an exhaustive roster exceeds a stated byte budget.
 *
 * Solved rather than searched: per-peer bytes are `N * B * R`, so the budget is
 * exceeded at `N = budget / (B * R)`. Measured with a 4 MiB budget, B=8, 64-byte
 * records: **N = 8,192 — BELOW the 100,000 target.** That is the finding which
 * forces the bucket-local shape rather than merely preferring it.
 */
export function exhaustiveRosterBreakingPoint(
  rosterBudgetBytes: number,
  bucketsPerZone: number,
  bytesPerPeerRecord = 64,
): number {
  return Math.floor(rosterBudgetBytes / bucketKeyBytes(bucketsPerZone, bytesPerPeerRecord))
}

export interface BucketLocalCost {
  readonly neighbours: Measured
  /** The population of the largest bucket — the shard one lookup walks. */
  readonly largestBucketSize: number
  readonly rosterBytesPerPeer: number
  /** Bytes one peer exchanges per round, send and receive. */
  readonly messageBytesPerRound: number
  readonly bytesPerSecond: number
}

/**
 * The cost of the CHOSEN shape: a peer tracks its zones' buckets, not the world.
 *
 * The reduction comes from `B` in the denominator of the roster term. `B` is
 * therefore not a knob with a cost on one side only: raising it shrinks every
 * peer's roster AND shrinks the largest bucket, the shard a lookup walks, so it
 * improves scale and privacy together. That joint movement is stated in the
 * research file rather than left for a reader to notice.
 *
 * `largestZoneShare` must be the exact fraction; see `fingerprintEntropy`.
 */
export function bucketLocalCost(
  population: number,
  sharedZones: number,
  largestZoneShare: number,
  bucketsPerZone: number,
  bytesPerPeerRecord = 64,
): BucketLocalCost {
  const neighbours = sharedZones * BUCKET_FANOUT
  const largestBucketSize = Math.floor((population * largestZoneShare) / bucketsPerZone)
  const rosterBytesPerPeer = sharedZones * largestBucketSize * bytesPerPeerRecord
  // One bucket digest (B keys) to each neighbour, and the same received back.
  const messageBytesPerRound = neighbours * bucketKeyBytes(bucketsPerZone, bytesPerPeerRecord) * 2
  return {
    neighbours: { count: neighbours, of: population },
    largestBucketSize,
    rosterBytesPerPeer,
    messageBytesPerRound,
    bytesPerSecond: messageBytesPerRound / ROUND_SECONDS,
  }
}

/**
 * The population at which the bucket-local shape exceeds a byte budget per peer.
 *
 * Per-peer bytes are `k * (N * share / B) * R`, so the budget is exceeded at
 * `N = budget * B / (k * R * share)`. **`B` enters LINEARLY**, and that is
 * checkable against the published pair: 663,070 at B=8 and 5,304,560 at B=64
 * differ by exactly 8x, the same factor by which B changed.
 */
export function bucketLocalBreakingPoint(
  rosterBudgetBytes: number,
  bucketsPerZone: number,
  sharedZones: number,
  largestZoneShare: number,
  bytesPerPeerRecord = 64,
): number {
  return Math.floor(
    (rosterBudgetBytes * bucketsPerZone) / (sharedZones * bytesPerPeerRecord * largestZoneShare),
  )
}

// ---------------------------------------------------------------------------
// The witness bound: the lane's most important real limit
// ---------------------------------------------------------------------------

export interface WitnessBound {
  /** Peers one machine can re-witness inside one interval. */
  readonly peers: number
  /** Embeds per second implied by the measured warm latency. */
  readonly capacityPerSecond: number
  readonly intervalSeconds: number
  readonly warmEmbedMs: number
  readonly changeFraction: number
}

/**
 * How many peers ONE machine can re-verify per round, from a MEASURED latency.
 *
 * This is the honest limit and it sits far below the design target, which is why
 * it is stated rather than buried. The 155 ms is a MEASURED warm embed
 * (`research/intent-map-live-verification.md` §3, re-verified against the live
 * route in this lane's own self-test); it is an instrument reading, not a design
 * assumption.
 *
 * CHANGE-GATING ENTERS AS A DIVISOR, and getting its direction wrong is the easy
 * mistake: if only `f` of peers have moved since the last round, one machine's
 * fixed capacity covers `capacity / f` peers, because it need only re-embed the
 * moved ones. So `f = 1` gives the worst case (387) and `f = 0.01` gives the
 * gated case (**38,709**) — the bound RISES as the change fraction falls.
 */
export function witnessBound(intervalSeconds: number, warmEmbedMs: number, changeFraction = 1): WitnessBound {
  const capacityPerSecond = 1000 / warmEmbedMs
  return {
    peers: Math.floor((capacityPerSecond * intervalSeconds) / changeFraction),
    capacityPerSecond,
    intervalSeconds,
    warmEmbedMs,
    changeFraction,
  }
}

// ---------------------------------------------------------------------------
// Convergence: logarithmic, and therefore NOT a breaking point
// ---------------------------------------------------------------------------

/**
 * Rounds for a shard of `shardSize` to converge under a fixed fanout.
 *
 * Reported because a reader will ask, and reported as what it is: O(log N), so it
 * is NOT one of this lane's breaking points. Saying so is part of the answer — a
 * design that lists every limit as a breaking point has not distinguished the
 * ones that bind.
 */
export function convergenceRounds(shardSize: number, fanout: number): number {
  if (shardSize <= 1) return 0
  return Math.ceil(Math.log(shardSize) / Math.log(fanout))
}

// ---------------------------------------------------------------------------
// The constants, in one place, so the research file and the code cannot disagree
// ---------------------------------------------------------------------------

/** Gossip fanout. The `s` in O(k*s). */
export const BUCKET_FANOUT = 3
/** The round interval every per-second figure is divided by. */
export const ROUND_SECONDS = 60
/** The roster budget every breaking point is solved against. */
export const ROSTER_BUDGET_BYTES = 4 * 1024 * 1024

/**
 * Which parts of this lane are built and which are planned.
 *
 * `topology: 'plan'` is not modesty. No two peers have ever exchanged a message in
 * this build: the design is complete and its arithmetic runs, and the network it
 * describes has never carried a packet. `zoneCensus: 'exists'` is the opposite
 * claim, supported by a live route that answers and closes.
 */
export const SOCIAL_KINDS: Readonly<Record<string, ThreeKind>> = {
  zoneCensus: 'exists',
  scaleArithmetic: 'exists',
  topology: 'plan',
  peerDialogue: 'plan',
  patchExchange: 'future',
}
