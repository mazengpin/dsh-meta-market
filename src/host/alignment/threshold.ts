import type { Maybe, Measured } from '../../shared/protocol.ts'
import type { AlignmentThreshold } from './types.ts'

/**
 * The threshold, and the measurement it was fitted to.
 *
 * A THRESHOLD THAT CANNOT REFUSE IS NOT A THRESHOLD, so the substrate's separation was measured
 * before the number was chosen. VERIFIED (ran), census 2026-10-16T16:55Z: ten intents, once each,
 * through `GET /intent-map/api/recall?q=…&top=24` on the live `dsh-intent-map`.
 *
 *   positives: 0.768, 0.770, 0.800, 0.8616   (4 of 4 embedded, scoredZones 24 of 24)
 *   negatives: 0.4722, 0.500, 0.530, 0.550, 0.550, 0.553
 *
 * `10 of 10` intents returned `embedded: true` and `scoredZones 24 of 24`, so this is a fully
 * answering instrument on all ten and NOT the zero-on-both-sides failure the program warns about.
 * The two populations do not overlap: max(negative) 0.553 sits 0.215 below min(positive) 0.768.
 */
export const ALIGN_THRESHOLD_VALUE = 0.6605

/** The measured sample the value is fitted to, kept as data so the fit can be re-checked. */
export const MEASURED_SEPARATION = {
  positives: { count: 4, of: 4 },
  negatives: { count: 6, of: 6 },
  lowestPositive: 0.768,
  highestNegative: 0.553,
  separation: 0.215,
  /** The exact midpoint of the gap. */
  midpoint: 0.6605,
  censusAt: '2026-10-16T16:55:00Z',
  route: '/intent-map/api/recall',
  servedModel: 'qwen3-embedding:0.6b',
  corpus: '24 zones; index built from research/cache/plugins-2026-10-12.json (4,527 rows)',
} as const

/**
 * The program's chosen value, with its provenance stated rather than implied.
 *
 * PROVENANCE: `PROGRAM CHOICE`, not a measured constant — the same label `plan/intent-field/schema.json`
 * puts on its own weights, for the same reason. Two limits are stated rather than buried:
 *
 *   1. It is fitted to 4 positives and 6 negatives. Ten points are a reason to believe a BAND exists,
 *      not a calibrated constant. Placing the value at the midpoint maximises the margin to BOTH
 *      populations and so tolerates the most measurement error in either direction.
 *   2. Three of the six negatives land on `S4-management-ui` at 0.45–0.53 — a genuinely generic zone.
 *      A lower threshold would align a sourdough recipe to a real intent zone. The refusal is
 *      load-bearing, not decorative.
 *
 * ONE DISCREPANCY IS RECORDED RATHER THAN SMOOTHED. The Lead's approval names the value "0.65"; the
 * exact midpoint is 0.6605, and 0.6605 rounded to two decimals is 0.66, not 0.65. This lane
 * implements 0.6605. The difference is 0.0105 and it changes no verdict on the measured sample (both
 * values sit between 0.553 and 0.768), but a reader comparing this file with the approval should see
 * the discrepancy rather than have to reconstruct it.
 */
export const ALIGN_THRESHOLD: AlignmentThreshold = {
  value: ALIGN_THRESHOLD_VALUE,
  provenance: 'PROGRAM CHOICE',
  provisional: true,
  positives: MEASURED_SEPARATION.positives,
  negatives: MEASURED_SEPARATION.negatives,
  lowestPositive: { value: MEASURED_SEPARATION.lowestPositive, reason: null },
  highestNegative: { value: MEASURED_SEPARATION.highestNegative, reason: null },
  separation: { value: MEASURED_SEPARATION.separation, reason: null },
  marginToPositives: {
    value: MEASURED_SEPARATION.lowestPositive - ALIGN_THRESHOLD_VALUE,
    reason: null,
  },
  marginToNegatives: {
    value: ALIGN_THRESHOLD_VALUE - MEASURED_SEPARATION.highestNegative,
    reason: null,
  },
  measuredAt: MEASURED_SEPARATION.censusAt,
  falsifier:
    'A fifth positive scoring below 0.768, or a seventh negative scoring above 0.553, puts the two populations into overlap and retires this threshold. Second falsifier: switching the embedding profile away from `qwen` invalidates the fit entirely, because in the Laya space (decision D-0006: 276/276 pairwise cosines, minimum +0.780) a per-zone threshold carries no information.',
}

/** The outcome of comparing one reading against the threshold. */
export interface ThresholdComparison {
  readonly above: boolean
  /** Non-null exactly when the comparison could not be made on a value. */
  readonly reason: string | null
}

/**
 * Compare a similarity against the threshold — the ONLY place a score is compared.
 *
 * An absent value is never coerced. `null` is UNCOMPARABLE with a reason, and `NaN` is an undefined
 * direction rather than a low score; both return `above: false` with the reason set, and the caller
 * distinguishes them from a genuine miss by reading `reason`. This is the guard against the program's
 * most-paid-for defect: `(score ?? 0) >= threshold` would turn "we did not measure this" into
 * "maximally dissimilar", which is a claim no instrument made.
 */
export function clearsThreshold(score: Maybe<number>, threshold: number): ThresholdComparison {
  if (score.value === null) {
    return {
      above: false,
      reason:
        score.reason ??
        'the similarity is absent and no reason was recorded — an unmeasured zone, not a dissimilar one',
    }
  }
  if (Number.isNaN(score.value)) {
    return {
      above: false,
      reason: 'the similarity is NaN — an undefined direction, not a low score',
    }
  }
  return { above: score.value >= threshold, reason: null }
}

/** `Measured` for a comparison, so "0 above the threshold" always travels with its denominator. */
export function aboveThresholdCensus(scores: readonly Maybe<number>[], threshold: number): Measured {
  let count = 0
  for (const score of scores) {
    if (clearsThreshold(score, threshold).above) count += 1
  }
  return { count, of: scores.length }
}
