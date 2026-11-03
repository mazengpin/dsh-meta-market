import type { EvidencePointer, Measured, VerdictRecord } from '../../shared/protocol.ts'
import type {
  AlignmentCensus,
  AlignmentResult,
  AlignmentThreshold,
  AlignmentVerdict,
  IdentityGuard,
  ZoneScore,
  ZoneWritePolicy,
} from './types.ts'
import { ALIGNMENT_EVIDENCE, SHARED_VERDICT_OF } from './types.ts'
import { clearsThreshold } from './threshold.ts'

/**
 * The alignment operator.
 *
 * FOUR GATES IN THIS ORDER, AND THE ORDER IS THE SUBSTANCE. Each exists because a specific wrong
 * answer is reachable without it.
 *
 *   1. IDENTITY — tested as `agrees.value !== true`, NOT `=== false`, so an unreadable identity
 *      refuses rather than scoring. A guard written `=== false` fails OPEN, and a failed probe is an
 *      ordinary event rather than an exceptional one.
 *   2. INTEGRITY — `freshness !== "fresh"` refuses WITHOUT SCORING, because the vectors no longer
 *      match the definitions they represent. Note the asymmetry with currency staleness: that one
 *      DOWNSHIFTS the verdict, this one refuses outright.
 *   3. NO READING — an empty comparison set refuses as `refused-uncertain`. THIS IS THE MOST
 *      IMPORTANT GATE: a threshold applied to an empty set yields zero zones above it, textually
 *      identical to a genuine `no-zone` measurement. Without this gate the operator reports "this
 *      package occupies no zone" when the truth is "no measurement was taken" — this program's
 *      most-published defect. It fires in two distinct ways: `zones.length === 0`, and every
 *      supplied zone carrying an ABSENT similarity. Checking only the array length misses the second
 *      entirely.
 *   4. THE THRESHOLD — reached only with a real comparison set. ZERO OCCUPIED ZONES IS `no-zone`: a
 *      MEASUREMENT, and the interesting signal `plan/06-future-dsh-meta-plugins.md` asks for.
 */

/**
 * Whether `dsh-meta-market` writes zones or only proposes them.
 *
 * DECISION: PROPOSE, NEVER WRITE. This is `plan` kind, not `exists`.
 */
export const ZONE_WRITE_POLICY: ZoneWritePolicy = {
  mode: 'propose',
  kind: 'plan',
  reason:
    'the zone index belongs to `dsh-intent-map`, a different plugin, live on the owner\'s own 3083 session, so writing it is a scope violation. Beyond ownership: the 24 vectors are keyed to an embedding identity, so a foreign write that changed the space without changing the recorded identity would leave every stored vector unusable WHILE `freshness` still reported "fresh" — a self-inflicted version of the seam this lane exists to police.',
  revisitCondition:
    'revisit only if `dsh-intent-map` publishes a WRITE route carrying its own identity guard, AND the owner authorises a second writer. Absent both, the mode stays `propose`, because a second writer with no identity guard is how a shared vector space silently becomes two.',
}

/** The input to one alignment run. Everything absent is absent ON PURPOSE, never defaulted. */
export interface AlignmentInput {
  readonly packageId: string
  /** Every zone to compare against, with the substrate's own similarity for each. */
  readonly zones: readonly ZoneScore[]
  readonly identity: IdentityGuard
  readonly census: AlignmentCensus
  readonly threshold: AlignmentThreshold
  /** When this run happened. Required: a verdict with no moment cannot be re-taken. */
  readonly alignmentAt: string
}

/**
 * Kept as a constant so `laneEvidence()` cannot drift from the threshold it describes.
 */
const ALIGN_THRESHOLD_NOTE =
  'is fitted to a measured gap with no overlap: 4 positives at 0.768-0.8616 against 6 negatives at 0.4722-0.553, separation 0.215, with 10 of 10 intents embedded and scoredZones 24 of 24 (census 2026-10-16T16:55Z)'

/**
 * Order zones by similarity DESCENDING, with an ABSENT similarity sorted LAST.
 *
 * A `null` score must never be compared as a number. The obvious form — `(b ?? 0) - (a ?? 0)` — sorts
 * an absent score as though it were a real zero, i.e. as "maximally dissimilar", which is a claim no
 * instrument made. This program has paid for that coercion three separate times.
 */
export function byScoreDescending(a: ZoneScore, b: ZoneScore): number {
  const av = a.similarity.value
  const bv = b.similarity.value
  if (av === null && bv === null) return a.zoneId.localeCompare(b.zoneId)
  if (av === null) return 1
  if (bv === null) return -1
  if (av === bv) return a.zoneId.localeCompare(b.zoneId)
  return bv - av
}

/** The lane's own evidence, always attached so a result is never a bare verdict. */
export function laneEvidence(): readonly EvidencePointer[] {
  return [
    {
      source: 'GET /intent-map/api/map',
      verification: 'verified-ran',
      claim: `${ALIGNMENT_EVIDENCE.freshnessIsNotCorrectness} (read from the live payload at 2026-10-16T16:48Z)`,
    },
    {
      source: 'plugins-src/dsh-intent-map/src/host/recall.ts',
      verification: 'verified-read',
      claim: ALIGNMENT_EVIDENCE.aWidthIsNotAName,
    },
    {
      source: 'decision-log:D-0006',
      verification: 'verified-read',
      claim: ALIGNMENT_EVIDENCE.layaDegeneracy,
    },
    {
      source: 'GET /intent-map/api/recall?q=...&top=24',
      verification: 'verified-ran',
      claim: `the threshold ${ALIGN_THRESHOLD_NOTE}`,
    },
  ]
}

/**
 * Run the four gates and produce a result.
 *
 * Never throws, and never returns a bare verdict: every path returns an `AlignmentResult` carrying
 * its `VerdictRecord`, which itself requires a `rule`, a `falsifier` and the `measured` reading. A
 * refusal therefore records WHY it refused, not merely that it did.
 */
export function alignPackage(input: AlignmentInput): AlignmentResult {
  const { threshold, census, identity, alignmentAt } = input

  const zonesScored: Measured = {
    count: input.zones.filter((z) => z.similarity.value !== null).length,
    of: input.zones.length,
  }
  const above: readonly ZoneScore[] = input.zones.filter(
    (z) => clearsThreshold(z.similarity, threshold.value).above,
  )
  const zonesAboveThreshold: Measured = { count: above.length, of: input.zones.length }

  const buildRecord = (
    verdict: AlignmentVerdict,
    rule: string,
    measured: Measured | null,
  ): VerdictRecord => ({
    verdict: SHARED_VERDICT_OF[verdict],
    rule,
    falsifier: threshold.falsifier,
    measured:
      measured === null
        ? {
            value: null,
            reason: 'no comparison was made, so there is no measured reading to report',
          }
        : { value: measured.count, reason: null },
    censusAt: measured === null ? null : alignmentAt,
    evidence: laneEvidence(),
  })

  const base = {
    packageId: input.packageId,
    zones: input.zones,
    zonesAboveThreshold,
    zonesScored,
    threshold,
    census,
    identity,
  }

  // GATE 1 — IDENTITY. `!== true` closes on `null` as well as on `false`.
  if (identity.agrees.value !== true) {
    const why =
      identity.refusalReason.value ??
      identity.agrees.reason ??
      'the embedding identity did not agree and no reason was recorded'
    return {
      ...base,
      verdict: 'refused-identity',
      best: {
        value: null,
        reason:
          'no ranking is produced: every similarity would be computed across two vector spaces',
      },
      record: buildRecord('refused-identity', `identity gate: refused because ${why}`, null),
      dated: false,
      datedReason: { value: null, reason: 'nothing was measured, so nothing can be dated' },
    }
  }

  // GATE 2 — INTEGRITY. An unsound index refuses WITHOUT SCORING.
  if (!census.integrityOk) {
    const why = census.integrityReason.value ?? 'the index reports itself unsound'
    return {
      ...base,
      verdict: 'refused-uncertain',
      best: {
        value: null,
        reason: 'no ranking is produced: the vectors no longer match the zone definitions',
      },
      record: buildRecord('refused-uncertain', `integrity gate: refused because ${why}`, null),
      dated: false,
      datedReason: { value: null, reason: 'nothing was measured, so nothing can be dated' },
    }
  }

  // GATE 3 — NO READING. Both shapes must refuse; see the gate-3 note above.
  if (zonesScored.count === 0) {
    const why =
      input.zones.length === 0
        ? 'zero zones were supplied, so no comparison was made'
        : `all ${String(input.zones.length)} supplied zones carry an absent similarity, so no comparison was made`
    return {
      ...base,
      verdict: 'refused-uncertain',
      best: { value: null, reason: why },
      record: buildRecord('refused-uncertain', `no-reading gate: refused because ${why}`, null),
      dated: false,
      datedReason: { value: null, reason: 'nothing was measured, so nothing can be dated' },
    }
  }

  // GATE 4 — THE THRESHOLD. Reached only with a real comparison set.
  const ranked = [...input.zones].sort(byScoreDescending)
  const best = ranked[0]
  const verdict: AlignmentVerdict = above.length > 0 ? 'aligned' : 'no-zone'

  return {
    ...base,
    verdict,
    best:
      best === undefined
        ? { value: null, reason: 'the ranked list is empty, which gate 3 should have prevented' }
        : { value: best, reason: null },
    record: buildRecord(
      verdict,
      `threshold gate: ${String(above.length)} of ${String(input.zones.length)} zones at or above ${String(threshold.value)} (${threshold.provenance}${threshold.provisional ? ', PROVISIONAL' : ''})`,
      zonesAboveThreshold,
    ),
    dated: census.currencyStale,
    datedReason: census.currencyStale
      ? { value: census.currencyCaveat, reason: null }
      : {
          value: null,
          reason:
            'the index catalog is not older than this alignment, so no currency caveat applies',
        },
  }
}
