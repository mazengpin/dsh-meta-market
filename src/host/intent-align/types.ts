/**
 * The original-intent gate — declared shapes, and the three things it is a check against.
 *
 * THE QUESTION THIS MODULE ANSWERS, in the owner's words: a plugin may appear on the meta-market's
 * windows "if they pass the 'original intent'-intent that not collides with stable, official or
 * existing meta-plugins". So the gate is not a similarity search; it is a REFUSAL test with three
 * named populations, and a candidate that collides with any one of them is out.
 *
 * WHY THE VERDICT HAS THREE VALUES RATHER THAN TWO. `pass` and `collide` are decisions; `not-measured`
 * is the honest third answer when the zone space could not be read, when a reference population
 * loaded zero entries, or when a candidate carried no scor-able text. A two-valued gate has to turn
 * "we did not measure this" into "no collision" — which is this program's most expensive defect,
 * arriving here as an all-green market where the green means nothing was checked.
 *
 * @module dsh-meta-market/host/intent-align/types
 */

/** The three population classes the owner named, in the order the owner named them. */
export type ReferenceClass = 'stable' | 'official' | 'meta'

/** How a zone score was produced. Travels ON EVERY ZONE, per the task's labelling requirement. */
export type SignatureMethod = 'embedding' | 'token'

/** The gate's answer. `not-measured` is a decision, not a failure to decide. */
export type OriginalIntentVerdict = 'pass' | 'collide' | 'not-measured'

/** A count that always travels with its population. */
export interface Measured {
  readonly count: number
  readonly of: number
}

/**
 * One intent zone and the score this candidate carries in it.
 *
 * `score` is `null` exactly when the zone could not be scored, and `reason` is non-null exactly then.
 * The pairing is enforced by construction rather than by convention: a consumer that sees a number
 * knows an instrument produced it, and a consumer that sees `null` has to handle the absence.
 */
export interface ZoneScore {
  readonly zone: string
  readonly score: number | null
  readonly method: SignatureMethod
  readonly reason: string | null
}

/** The real zone space, as read from the live `dsh-intent-map`. */
export interface ZoneDefinition {
  readonly id: string
  readonly category: string
  /** The zone's own published definition. The token method's ONLY text input. */
  readonly definition: string
  readonly memberCount: number | null
  /**
   * Whether this zone is too generic to carry a collision on its own.
   *
   * MEASURED, not guessed: `alignment/threshold.ts` records that three of the six negatives in the
   * embedding separation sample land on `S4-management-ui` at 0.45–0.53, and calls it "a genuinely
   * generic zone". A gate that refused on that zone alone would refuse nearly everything.
   */
  readonly generic: boolean
}

/** The zone space, with its identity and the census that produced it. */
export interface ZoneSpace {
  /** The index this space came from, named so a mismatch can be stated rather than assumed. */
  readonly indexId: string
  readonly zones: readonly ZoneDefinition[]
  readonly census: { readonly read: number; readonly of: number; readonly at: string }
  /**
   * Whether the substrate can embed at all right now.
   *
   * `available: false` is a MEASUREMENT (the substrate said it could not embed), and it is what makes
   * every zone below carry `method: "token"`. It is never inferred from a score of zero.
   */
  readonly embedding: { readonly available: boolean; readonly reason: string | null }
  readonly identity: { readonly model: string | null; readonly dim: number | null }
}

/** A discriminated read outcome. A failure carries its HTTP status, and `0` means "no response". */
export type ZoneSpaceOutcome =
  | { readonly ok: true; readonly space: ZoneSpace; readonly readAt: string }
  | {
      readonly ok: false
      readonly status: number
      readonly route: string
      readonly readAt: string
      readonly reason: string
    }

/** A candidate to be signed: an id the surface can render, and the text that states its intent. */
export interface CandidateInput {
  readonly id: string
  readonly name?: string | null
  /**
   * The plugin's own statement of what it does.
   *
   * READ `description.en` ON A CATALOG ROW, NEVER `description`: all 4,527 rows carry a `{en, zh}`
   * object, so a lane that concatenates the field gets the literal string `[object Object]` for every
   * row and an all-neutral signature that looks like a clean corpus.
   */
  readonly intentText: string
  /** Where the citation came from, when it came from the catalog. Carried so a verdict is auditable. */
  readonly catalog?: CatalogCitation | null
}

/** A catalog row, disambiguated by more than its name — the name is not a unique key. */
export interface CatalogCitation {
  readonly name: string
  readonly npm: string | null
  readonly owner: string | null
  /** Rows this citation matched. `> 1` means the name alone identifies a SET. */
  readonly rowCount: number
}

/** A signed candidate: its intent expressed as a score in every zone of the space. */
export interface CandidateSignature {
  readonly id: string
  readonly name: string | null
  readonly intentText: string
  readonly zones: readonly ZoneScore[]
  readonly method: SignatureMethod
  /** Why the token method was used instead of the embedding method. `null` when embedding ran. */
  readonly methodReason: string | null
  /** `false` when no zone carries a numeric score — the signature is unusable, and says so. */
  readonly measured: boolean
  /**
   * The catalog row the candidate came from, when it came from one.
   *
   * Carried ON THE SIGNATURE rather than left in the caller's hands because the gate needs it: a
   * candidate must not collide with its own npm name, and `dsh-better-sidebar` colliding with
   * `DSH-better-sidebar` is what happens when the identity test only sees the id.
   */
  readonly catalog?: CatalogCitation | null
  readonly measuredAt: string
}

/** A member of one of the three reference populations, signed the same way a candidate is. */
export interface ReferenceSignature extends CandidateSignature {
  readonly klass: ReferenceClass
  readonly source: ReferenceSource
}

/** Where a reference's intent text came from, so the gate's population is auditable. */
export interface ReferenceSource {
  readonly kind: 'package-manifest' | 'profile-bundle' | 'catalog-row'
  /** Workspace-absolute path for a manifest, `null` for a catalog row. */
  readonly path: string | null
  readonly catalog: CatalogCitation | null
}

/** One reason a candidate was refused. `id` is disambiguated; a bare name can match two plugins. */
export interface Collision {
  readonly id: string
  readonly name: string
  readonly klass: ReferenceClass
  /** The zone the two signatures most strongly share. CONTEXT for the reader, not always the decision. */
  readonly zone: string
  /** The conservative strength: for the zone-profile criterion, the LOWER of the two scores. */
  readonly score: number
  readonly candidateScore: number
  readonly referenceScore: number
  /**
   * Which criterion produced this refusal. Stated because the two methods compare in two shapes, and a
   * reader who assumes `zone` decided it would be reading a caption as the reason.
   */
  readonly decidedBy: 'zone-profile' | 'text-similarity'
  readonly why: string
}

/** The gate's whole answer for one candidate. */
export interface IntentCheck {
  readonly id: string
  readonly originalIntent: OriginalIntentVerdict
  /** Non-null exactly when the verdict is `not-measured`. */
  readonly reason: string | null
  readonly zones: readonly ZoneScore[]
  readonly collidesWith: readonly Collision[]
  readonly method: SignatureMethod
  readonly measuredAt: string
  readonly census: {
    readonly compared: number
    readonly of: number
    readonly population: string
    readonly at: string
  }
}

/** The three reference populations, loaded together so their censuses are one instant. */
export type ReferenceOutcome =
  | {
      readonly ok: true
      readonly references: readonly ReferenceSignature[]
      readonly census: {
        readonly stable: Measured
        readonly official: Measured
        readonly meta: Measured
        readonly at: string
      }
      /** Reference ids that were named but whose intent text could not be read. Absent, not zero. */
      readonly absent: readonly string[]
    }
  | { readonly ok: false; readonly reason: string; readonly at: string }

/** Options for reading the zone space. */
export interface ZoneSpaceOptions {
  /** Base URL of the live harness. Defaults to the loopback port the owner's session serves. */
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

/** Options for loading the three reference populations. */
export interface ReferenceOptions {
  /** Directory holding the clones. `plugins-src/` under the deepseek-root checkout. */
  readonly pluginsSrc?: string
  /** The profile whose `dsh.profile.bundles` defines the official population. */
  readonly profileRoot?: string
  /** The catalog census. */
  readonly catalogPath?: string
  /** The official packages' source tree, where `@deepseek-ai/*` manifests live. */
  readonly harnessRoot?: string
}

/** Options for the one-shot convenience entry point. */
export interface CheckOptions extends ZoneSpaceOptions, ReferenceOptions {
  readonly space?: ZoneSpace
  readonly references?: readonly ReferenceSignature[]
  readonly threshold?: number
}

/** What `signCandidate` needs: a zone space, and nothing else. */
export interface SigningContext {
  readonly space: ZoneSpace
}

/**
 * The embedding-path threshold — INHERITED, and FALSIFIED for the use it is put to here.
 *
 * It is the value `alignment/threshold.ts` fitted (0.6605, midpoint of a 0.215 gap between 4 positives
 * and 6 negatives), and a gate that invented its own number would give this program two thresholds for
 * one quantity. So it is reused rather than re-derived.
 *
 * BUT REUSING IT IS A KNOWN-WEAK CHOICE AND MUST NOT BE PRESENTED AS A MEASURED ONE. Decision `D-0076`
 * (lead, 2026-10-16T18:23:06Z) ran the operator that threshold guards and FALSIFIED it: one intent in
 * six phrasings scored 0.836090 … 0.633092, a spread of **0.225753 — wider than the 0.215 separation the
 * threshold was fitted to** — and worst-positive 0.633092 against best-negative 0.533483 leaves 0.099609
 * with **0.6605 not between them**. `D-0076` also names the cause: `dsh-intent-map`'s zone vectors are
 * built from zone definitions PLUS every member plugin NAME, so similarity to a zone measures market
 * vocabulary overlap rather than intent.
 *
 * CONSEQUENCE, stated so this file cannot be read as validating its own embedding path: the embedding
 * branch decides against a threshold this program has already recorded as not separating its populations.
 * It is NOT exercised on this deployment — the embedder refused every connection at 2026-10-17T21:41Z and
 * again at 22:2xZ — so its behaviour is UNVERIFIED END TO END, and the token path is the only one that
 * has been measured. The cheapest real fix remains `D-0076`'s: rebuild the zone vectors from DEFINITIONS
 * ALONE and refit. The token method already uses definitions alone, which is part of why its fit is
 * stated numerically while this value is stated as inherited.
 */
export const COLLISION_THRESHOLD = 0.6605

/**
 * The token-path threshold, fitted to TWO BINDING CONSTRAINTS and placed at their exact midpoint.
 *
 * The two methods score on different scales, so they do not share a cut-off. Using 0.6605 for token
 * similarity would refuse everything: the token method measures term overlap between two descriptions,
 * where a strong match is 0.12–0.69 and not 0.7.
 */
export const TOKEN_THRESHOLD = 0.3407

/**
 * The sample `TOKEN_THRESHOLD` was fitted to. VERIFIED (ran) by `verify/gate-driver.mjs` §5.
 *
 * THIS IS A FEASIBILITY FIT, NOT A SEPARATION FIT, and the difference is the whole finding. The first
 * version placed the bar at the midpoint of a positives/negatives split and was wrong in a way the
 * population caught: the gate's own NEGATIVE CONTROL was refused. So the bar is now fitted to the two
 * constraints that a reader can check without re-running anything:
 *
 *   - MUST PASS — `ru-marketplace-mcp#dsh`, a Russian consumer-goods marketplace, measured at **0.2403**
 *     against `dsh-market` on `install, market, search`.
 *   - MUST COLLIDE — `dsh-plugin-marketplace@Scorp1o117`, a real duplicate of `dsh-market`, measured at
 *     **0.4411** on `browse, install, search`. It is the LOWER of the two must-collide positives; the
 *     other, `@PetCT`, sits at 0.6882 and is not binding.
 *
 * The feasible interval is therefore **(0.2403, 0.4411)**, and 0.3407 is its exact midpoint, which
 * maximises the margin to BOTH constraints at 0.1004 either side.
 *
 * THE COST IS NAMED RATHER THAN BURIED, because a threshold quoted without its false negatives is the
 * same defect as a count without its denominator:
 *
 *   1. `DSH-Plugins-Marketplace` (173★) scores only **0.2069** — against `dsh-recall-console`, not even
 *      against `dsh-market` (0.1525) — so it is now ADMITTED. It is a real plugin marketplace and that
 *      admission is a FALSE NEGATIVE.
 *   2. `dsh-memory-delta` vs `dsh-memento`, the clearest same-purpose pair in the installed set, scores
 *      **0.1204** and is ADMITTED. This is a false negative too.
 *   3. The reason both happen is arithmetic and it is the honest limit of this method: the control at
 *      0.2403 scores ABOVE `DSH-Plugins-Marketplace` at 0.2069, so **no single bar can refuse that
 *      marketplace and admit that control**. A bag-of-words cosine cannot separate "plugin marketplace"
 *      from "goods marketplace" — both say market, search, install. Separating them needs the embedder,
 *      which is dead on this deployment.
 *
 * The fit was made WITHOUT moving `KNOWN_PASSING_CANDIDATES`: the control was not deleted or relabelled
 * to make the gate look better, which is the move this number most invites.
 */
export const TOKEN_SEPARATION = {
  mustPass: { id: 'ru-marketplace-mcp#dsh', score: 0.2403, against: 'dsh-market', shared: 'install, market, search' },
  mustCollide: { id: 'dsh-plugin-marketplace@Scorp1o117', score: 0.4411, against: 'dsh-market', shared: 'browse, install, search' },
  alsoColliding: { id: 'dsh-plugin-marketplace@PetCT', score: 0.6882, against: 'dsh-market', shared: 'browse, click, community, inside, search' },
  feasibleInterval: { low: 0.2403, high: 0.4411 },
  chosen: TOKEN_THRESHOLD,
  chosenRule: 'the exact midpoint of the feasible interval, which maximises the margin to both binding constraints',
  margin: 0.1004,
  fitKind: 'FEASIBILITY (two constraints), not SEPARATION (two populations)',
  falseNegatives: [
    { id: 'DSH-Plugins-Marketplace', score: 0.2069, against: 'dsh-recall-console', note: 'a real plugin marketplace, ADMITTED' },
    { id: 'dsh-memory-delta vs dsh-memento', score: 0.1204, against: 'each other', note: 'the clearest same-purpose installed pair, ADMITTED' },
  ],
  criterion: 'idf-weighted token text cosine over vendor-stripped content terms, minimum 2 shared terms',
  censusAt: '2026-10-17T22:20:00Z',
  method: 'token',
  falsifier:
    'A must-pass candidate scoring at or above 0.3407, or a must-collide candidate scoring below it, breaks the fit. Second falsifier: restoring the embedder and finding that it separates `ru-marketplace-mcp#dsh` from `DSH-Plugins-Marketplace` would show the false negatives above are a limitation of the token method and not of the intent relation.',
} as const

/**
 * WHY THE TOKEN METHOD DOES NOT DECIDE ON ZONE-PROFILE OVERLAP — the measurement that forced the choice.
 *
 * The first version of this gate compared the two plugins' 24-zone PROFILES and required a shared zone
 * above the bar. That version was run twice with two different reference populations, and both times it
 * offered a band too thin to place a threshold in:
 *
 *   - over a **45-reference** population: positives 0.1452–0.2200 against negatives 0.1249–0.1390, a band
 *     of **0.0062**.
 *   - over the deduplicated **39-reference** population: positives from 0.1664 against negatives to
 *     0.1390, a band of **0.0274**.
 *
 * Both are recorded rather than only the newer one, because the population changed between them (the
 * three classes are not disjoint and duplicates were collapsed) and a corrected figure whose original is
 * invisible cannot be audited. The adopted text criterion offers a **0.1004** margin to each of its
 * binding constraints — 3.7× the wider of these two bands — and, unlike a zone, it names WHICH WORDS
 * carried the refusal, which is what a `why` needs.
 *
 * The reason the zone profile is weak is structural, not an implementation defect: `ru-marketplace` vs
 * `dsh-market` scores **0.1390–0.2403** on the shared zone `S3-install-sync` — the same zone `dsh-market`
 * peaks in at 0.2408 — because a Russian consumer-goods recipe says "skills load on install". A criterion
 * keyed on a shared ZONE cannot see that one plugin installs plugins and the other installs skills.
 */
export const TOKEN_ZONE_PROFILE_NOT_USED = {
  widerRun: { positives: { count: 3, of: 3, lowest: 0.1452, highest: 0.22 }, negatives: { count: 3, of: 3, lowest: 0.1249, highest: 0.139 }, band: 0.0062, references: 45 },
  dedupedRun: { lowestPositive: 0.1664, highestNegative: 0.139, band: 0.0274, references: 39 },
  adoptedMargin: 0.1004,
  ratio: 'the adopted criterion\'s margin is 3.7x the wider rejected band',
  replacedBy: 'idf-weighted text-to-text cosine over vendor-stripped content terms',
  censusAt: '2026-10-17T22:20:00Z',
  method: 'token',
} as const

/**
 * Zones too generic to carry a collision by themselves.
 *
 * A candidate must clear a higher bar in one of these. Measured source: `alignment/threshold.ts`
 * records three of six embedding negatives landing on `S4-management-ui` at 0.45–0.53, so that zone
 * alone is not evidence of a shared purpose.
 */
export const GENERIC_ZONE_IDS: readonly string[] = ['S4-management-ui']

/** The extra margin a generic zone must clear. `PROGRAM CHOICE`, stated rather than implied. */
export const GENERIC_ZONE_EDGE = 0.08

/** The zone count this build expects. A space that disagrees is `not-measured`, never resized silently. */
export const CANDIDATE_ZONE_COUNT = 24

/** Version of this gate's rules. Bumped when a threshold or a rule changes meaning. */
export const INTENT_ALIGN_VERSION = '1.0.0'
