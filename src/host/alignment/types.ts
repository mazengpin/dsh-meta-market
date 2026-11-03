import type {
  EmbeddingIdentity,
  EvidencePointer,
  Maybe,
  Measured,
  Verdict,
  VerdictRecord,
} from '../../shared/protocol.ts'

/**
 * L3 — Alignment of a meta-package to the universal intent map.
 *
 * THE VERDICT IS TWO-LEVEL, AND THAT IS DELIBERATE. `AlignmentVerdict` is this lane's rich, closed
 * outcome; `Verdict` (the protocol's) is the coarse operation outcome that travels in a
 * `VerdictRecord`. The mapping is `SHARED_VERDICT_OF` below, named so it can be checked rather than
 * inferred, and a consumer must read `AlignmentResult.verdict` whenever the distinction between
 * "measured, and it occupies nothing" and "we could not measure" matters — because the coarse view
 * CANNOT carry that distinction and was never meant to.
 *
 * Two refusals and one measurement, never collapsed:
 *   - `refused-identity`  — no comparison was LEGAL: the embedding identity changed, so the two
 *                           vector spaces are not the same space.
 *   - `refused-uncertain` — no comparison was POSSIBLE: no reading was taken, or the index is
 *                           unsound. This includes the EMPTY comparison set, which is the single
 *                           most likely way this operator could lie (see `alignPackage`).
 *   - `no-zone`           — a comparison WAS made and found nothing. A MEASUREMENT, and the
 *                           interesting signal: `plan/06-future-dsh-meta-plugins.md` asks for the
 *                           empty zone precisely because it is the new thing.
 */

export type AlignmentVerdict =
  | 'aligned'
  | 'no-zone'
  | 'refused-identity'
  | 'refused-uncertain'
  | 'unknown'

/**
 * The rich-to-coarse projection, stated as data.
 *
 * `no-zone -> 'pass'` is the mapping that most needs saying out loud: `pass` here means "the
 * alignment OPERATION completed and produced a reading", NOT "the package aligned". A package that
 * occupies no zone is a `pass` with an empty result — so the must-REFUSE negative control asserts on
 * `AlignmentResult.verdict === 'no-zone'`, and NOT on `record.verdict === 'fail'`. Reading the coarse
 * verdict as the lane's verdict is the mistake this table exists to make visible.
 */
export const SHARED_VERDICT_OF: Readonly<Record<AlignmentVerdict, Verdict>> = {
  aligned: 'pass',
  'no-zone': 'pass',
  'refused-identity': 'refused',
  'refused-uncertain': 'refused',
  unknown: 'unknown',
}

/** The three routes on `dsh-intent-map` this lane consumes. All read-only; see `ZONE_WRITE_POLICY`. */
export const INTENT_MAP_ROUTES = {
  map: '/intent-map/api/map',
  identity: '/intent-map/api/identity',
  recall: '/intent-map/api/recall',
} as const

/**
 * Quotes carried beside the code, each with the source it came from.
 *
 * THE FIRST TWO ARE THE LIVE PAYLOAD'S OWN WORDS, NOT THIS FILE'S. They are the sibling plugin's
 * `absenceDiscipline` array, read from `GET /intent-map/api/map`. `charter-writer` corrected this
 * lane on exactly that point while this module was being rebuilt: the `fresh`-is-not-correct
 * sentence is NOT in `src/shared/protocol.ts`'s `ABSENCE_DISCIPLINE` (whose nearest line reads
 * "A field that was not measured is null with a reason"). Both artifacts are real, they say
 * different things, and citing a live payload as though it were the charter would be a crossed
 * citation — the same defect this lane already corrected once for the Laya degeneracy figures.
 */
export const ALIGNMENT_EVIDENCE = {
  /** Source: the LIVE payload's `absenceDiscipline`, `GET /intent-map/api/map`, 2026-10-16T16:48Z. */
  freshnessIsNotCorrectness:
    '`fresh` means the corpus text is byte-identical to what was embedded. It does NOT mean the map is correct.',
  /** Source: the same live array. */
  aHashIsNotASemanticCheck:
    'A hash match is not a semantic check: two different corpora cannot collide in sha256, but a corpus that is unchanged can still be WRONG.',
  /**
   * Source: the LIVE `dsh-intent-map` guard, `plugins-src/dsh-intent-map/src/host/recall.ts`
   * (VERIFIED (read)). A width check alone cannot separate the two spaces this lane is most likely
   * to confuse: 1024 is the hidden size of BOTH `qwen3-embedding:0.6b` AND the Laya encoder.
   */
  aWidthIsNotAName:
    'A dimension comparison passes across two different vector spaces: 1024 is the hidden size of both the qwen3 embedder and the Laya encoder, so a dim-only guard waves through the substitution it exists to catch.',
  /** Source: decision `D-0006` — NOT `research/intent-map-live-verification.md` §8.4, which has no match for these figures. */
  layaDegeneracy:
    'Decision D-0006 (active, 2026-10-15, lane rag-plans): the Laya encoder space is degenerate — 276/276 pairwise cosines with minimum +0.780 — so a per-zone threshold carries no information there.',
} as const

/**
 * What one zone scored.
 *
 * `similarity` is a `Maybe`, so a zone the substrate did not score travels with the REASON it has no
 * score rather than as a `0`. This matters at the gate: a zone scored `0` and a zone never scored
 * are different facts, and only the second is an instrument problem.
 */
export interface ZoneScore {
  readonly zoneId: string
  readonly similarity: Maybe<number>
  /** True only when `similarity.value` is a real number at or above the threshold. */
  readonly aboveThreshold: boolean
}

/**
 * The two stalenesses, kept apart BY TYPE because collapsing them is the error this lane exists to
 * prevent.
 *
 * INTEGRITY staleness: the stored vectors no longer match the zone definitions they represent
 * (`freshness !== "fresh"`). Nothing may be scored — a similarity would be measured against
 * definitions that no longer exist.
 *
 * CURRENCY staleness: the index is sound but the world moved on. The zone set derives from an older
 * catalog. This does NOT make a score wrong; it makes the verdict DATED. Refusing on it would throw
 * away a valid measurement of the 24 zones because the market grew.
 */
export interface AlignmentCensus {
  /** The soundness reading. `freshness === "fresh"` is what permits scoring. */
  readonly integrityOk: boolean
  readonly integrityReason: Maybe<string>
  /**
   * Not measured is not zero. `value: null` asserts nothing about the live catalog; a `0` would
   * assert that it is empty, which no instrument in this lane ever took.
   */
  readonly liveCatalogCount: Maybe<number>
  /** The catalog the 24 zone vectors were actually built from. */
  readonly indexCatalogCount: Measured
  readonly indexCatalogDate: string
  readonly indexCensusAt: string
  /** `liveCatalogCount - indexCatalogCount`. Absent, with a reason, when the live count is absent. */
  readonly catalogDelta: Maybe<number>
  readonly catalogDeltaPercent: Maybe<number>
  /** Zones carrying an indexed vector. Numerator and denominator, both counted. */
  readonly zonesIndexed: Measured
  /** Zones whose stored vector no longer matches its definition. */
  readonly zonesStale: Measured
  readonly indexedAt: string
  /**
   * Always populated when the index's catalog predates this alignment, and TRUE WHETHER OR NOT the
   * live catalog was measured. Making it conditional on a live reading would let an unmeasured run
   * silently drop its most important caveat.
   */
  readonly currencyStale: boolean
  readonly currencyCaveat: string
}

/**
 * Which half of the substrate reported which identity, and whether they agree.
 *
 * `agrees` is three-state and `null` is NOT `false`. `false` means two readings were taken and
 * differ; `null` means the live half could not be read. They demand opposite responses, and
 * collapsing `null` into `false` would print "the model changed" for "we could not ask the
 * substrate".
 */
export interface IdentityGuard {
  readonly agrees: Maybe<boolean>
  readonly index: EmbeddingIdentity
  readonly live: EmbeddingIdentity
  /** Populated only on refusal, and it names BOTH models so the substitution is identifiable. */
  readonly refusalReason: Maybe<string>
}

/** A threshold is a decision, so it carries its provenance, its sample, and its falsifier. */
export interface AlignmentThreshold {
  readonly value: number
  /** `PROGRAM CHOICE` is not a euphemism: the value is fitted to a measured gap, not derived. */
  readonly provenance: 'PROGRAM CHOICE' | 'MEASURED'
  readonly provisional: boolean
  readonly positives: Measured
  readonly negatives: Measured
  readonly lowestPositive: Maybe<number>
  readonly highestNegative: Maybe<number>
  /** `lowestPositive - highestNegative`. Absent with a reason when either endpoint is absent. */
  readonly separation: Maybe<number>
  /** Margin to each population at the chosen value. Symmetric only at the midpoint. */
  readonly marginToPositives: Maybe<number>
  readonly marginToNegatives: Maybe<number>
  readonly measuredAt: string
  readonly falsifier: string
}

/** The result. Every field a caller needs in order to disbelieve the verdict correctly. */
export interface AlignmentResult {
  readonly verdict: AlignmentVerdict
  readonly packageId: string
  /** EVERY zone scored, not only the passing ones, so a reader can re-derive the verdict. */
  readonly zones: readonly ZoneScore[]
  readonly zonesAboveThreshold: Measured
  readonly zonesScored: Measured
  readonly best: Maybe<ZoneScore>
  readonly threshold: AlignmentThreshold
  readonly census: AlignmentCensus
  readonly identity: IdentityGuard
  /** The shared contract record: coarse verdict, rule, falsifier, measurement, census time, evidence. */
  readonly record: VerdictRecord
  readonly dated: boolean
  readonly datedReason: Maybe<string>
}

/**
 * Whether this plugin WRITES zone assignments or only PROPOSES them.
 *
 * The reasons, in order of weight:
 *   - the index belongs to `dsh-intent-map`, a DIFFERENT plugin, live on the owner's own session;
 *   - the 24 vectors are keyed to an embedding identity, so a foreign write that changed the space
 *     without changing the recorded identity would leave every stored vector unusable WHILE
 *     `freshness` still reported `"fresh"` — the seam `ALIGNMENT_EVIDENCE.freshnessIsNotCorrectness`
 *     describes, made worse because a writer could CAUSE it rather than merely suffer it;
 *   - this is `plan` kind, not `exists`.
 */
export interface ZoneWritePolicy {
  readonly mode: 'propose'
  readonly kind: 'plan'
  readonly reason: string
  readonly revisitCondition: string
}

/** A route reading, discriminated so a `404` can never be read as an empty result. */
export type ReadOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly readAt: string }
  | { readonly ok: false; readonly status: number; readonly route: string; readonly readAt: string }

/** The evidence array every result's `VerdictRecord` carries. */
export type AlignmentEvidence = readonly EvidencePointer[]
