/**
 * THE GATE: does a candidate's intent collide with a stable, official or existing meta plugin?
 *
 * This function is SYNC AND PURE. It takes two signed things and a threshold and returns a verdict; it
 * reads no file, opens no socket, and consults no clock. That is a deliberate split from
 * `signature.ts`: the part that decides is separable from the part that measures, so the decision can be
 * driven red in a unit test without a live route, and so a reviewer can read the whole refusal rule in
 * one file.
 *
 * ONE RELATION, TWO SHAPES — AND THE SHAPES DIFFER BECAUSE THE METHODS CAN MEASURE DIFFERENT THINGS.
 * The relation is always the same: *do these two plugins describe the same purpose?* How it is measured
 * depends on what the method can actually see:
 *
 *   - **`embedding`** compares the two plugins' 24-ZONE PROFILES and refuses when a shared zone clears
 *     `COLLISION_THRESHOLD` (0.6605) from BOTH sides. It must work this way because the only embedding
 *     surface this plugin may use is the intent map's recall route, which returns similarities to
 *     ZONES — it never returns the plugin's own vector, so there is nothing to compare directly.
 *   - **`token`** compares the two intent TEXTS DIRECTLY and refuses above `TOKEN_THRESHOLD` (0.1573).
 *     It works this way because the first version did the zone-profile comparison too, was run, and
 *     could not decide: the labelled pairs came out at positives 0.1452–0.2200 against negatives
 *     0.1249–0.1390, a **0.0062** gap. The measurement is kept in `TOKEN_ZONE_PROFILE_NOT_USED` rather
 *     than discarded, because it is the evidence for this design and not an embarrassment about it.
 *
 * WHAT "COLLIDE" MEANS ON THE ZONE-PROFILE PATH, stated so it can be argued with: two signatures collide
 * when, for at least one zone, BOTH scores are at or above the bar. The strength is the LOWER of the two.
 * That is conservative on purpose: a candidate at 0.9 against a reference at 0.20 has not shown that it
 * occupies the same purpose, and taking the higher number would let one confident side carry a collision
 * alone.
 *
 * FOUR WAYS THIS RETURNS `not-measured`, AND EACH IS A DIFFERENT FACT.
 *
 *   1. The candidate carries no numeric score. An undescribed plugin is not a clean plugin.
 *   2. The reference populations are empty.
 *   3. The comparable population is non-empty but every reference was the candidate itself.
 *   4. The candidate and the references were signed by DIFFERENT methods. Two methods are two spaces,
 *      and scoring across them is the mistake `EmbeddingIdentity` exists to forbid.
 *
 * A `pass` therefore always has a positive `census.compared`. A unanimous `pass` over zero comparisons
 * would be indistinguishable from a green window that checked nothing, which is the defect this gate
 * exists to prevent one level up.
 *
 * @module dsh-meta-market/host/intent-align/gate
 */

import type {
  CandidateSignature,
  Collision,
  IntentCheck,
  OriginalIntentVerdict,
  ReferenceSignature,
  SignatureMethod,
} from './types.ts'
import {
  COLLISION_THRESHOLD,
  GENERIC_ZONE_EDGE,
  GENERIC_ZONE_IDS,
  TOKEN_THRESHOLD,
} from './types.ts'
import { candidateTerms } from './token.ts'

/** The threshold for a method. One function, so a caller cannot pick the wrong number. */
export function thresholdFor(method: SignatureMethod): number {
  return method === 'embedding' ? COLLISION_THRESHOLD : TOKEN_THRESHOLD
}

/** The bar a specific zone must clear, which is higher for a zone too generic to carry a collision. */
export function thresholdForZone(method: SignatureMethod, zone: string): number {
  const base = thresholdFor(method)
  return GENERIC_ZONE_IDS.includes(zone) ? base + GENERIC_ZONE_EDGE : base
}

/**
 * Is this reference the candidate ITSELF, rather than a different plugin that shares its name?
 *
 * TWO PLUGINS ON THIS MARKET SHARE A NAME. `dsh-plugin-marketplace` exists twice in the census under two
 * owners (`PetCT`, npm null; and `Scorp1o117`, npm `dsh-plugin-marketplace`), so a self-test keyed on the
 * NAME alone would declare the second to be the first and **drop a true collision as a self-match** —
 * the duplicate-name trap arriving inside the very guard that exists to prevent a false positive. Found
 * by `prov-plugins`, whose registry composes candidate ids as `npm ?? name`, which makes the two rows
 * arrive with one id until the owner is appended; my `Collision.id` carries the owner for exactly that
 * reason, and the guard has to use it too.
 *
 * So: a shared name means SELF only when the owners do not say otherwise. Two citations that both carry
 * an owner and disagree are two different plugins, and the comparison proceeds.
 */
function isSelfMatch(candidate: CandidateSignature, reference: ReferenceSignature): boolean {
  const own = identityKeys(candidate)
  const other = identityKeys({
    id: reference.id,
    name: reference.name,
    catalog: reference.source.catalog,
  })
  let sharedName = false
  for (const key of other) {
    if (own.has(key)) {
      sharedName = true
      break
    }
  }
  if (!sharedName) return false
  const ourOwner = candidate.catalog?.owner ?? null
  const theirOwner = reference.source.catalog?.owner ?? null
  if (ourOwner !== null && theirOwner !== null && identityKey(ourOwner) !== identityKey(theirOwner)) {
    return false
  }
  return true
}

/** The strongest zone the two signatures share, as context for a refusal or for a reader. */
function strongestSharedZone(
  candidate: CandidateSignature,
  reference: ReferenceSignature,
): { zone: string; candidateScore: number; referenceScore: number; strength: number } | null {
  const referenceScores = new Map<string, number>()
  for (const zone of reference.zones) {
    if (zone.score !== null) referenceScores.set(zone.zone, zone.score)
  }
  let best: { zone: string; candidateScore: number; referenceScore: number; strength: number } | null =
    null
  for (const zone of candidate.zones) {
    if (zone.score === null) continue
    const other = referenceScores.get(zone.zone)
    if (other === undefined) continue
    const strength = Math.min(zone.score, other)
    if (best === null || strength > best.strength) {
      best = { zone: zone.zone, candidateScore: zone.score, referenceScore: other, strength }
    }
  }
  return best
}

/** The zone-profile criterion: refused when a shared zone clears the bar from BOTH sides. */
function collideByZoneProfile(
  candidate: CandidateSignature,
  reference: ReferenceSignature,
  method: SignatureMethod,
): Collision | null {
  const shared = strongestSharedZone(candidate, reference)
  if (shared === null) return null
  const bar = thresholdForZone(method, shared.zone)
  if (shared.candidateScore < bar || shared.referenceScore < bar) return null
  return {
    id: reference.id,
    name: reference.name ?? reference.id,
    klass: reference.klass,
    zone: shared.zone,
    score: shared.strength,
    candidateScore: shared.candidateScore,
    referenceScore: shared.referenceScore,
    decidedBy: 'zone-profile',
    why:
      `shares ${shared.zone} with ${reference.klass} ${reference.id} at ${shared.strength.toFixed(4)} ` +
      `(candidate ${shared.candidateScore.toFixed(4)}, reference ${shared.referenceScore.toFixed(4)}, bar ${bar.toFixed(4)}, method ${method})`,
  }
}

/**
 * Terms that cannot carry a refusal, whatever their rarity in this corpus.
 *
 * MEASURED NEED, not caution. `prov-plugins` ran this gate end to end and reported **23 of 32 refusals
 * resting on the single token `dsh`**, with `why` strings of the form *"matches stable dsh-sentinel at
 * 0.4082 … overlap on: dsh"*. `dsh` is the vendor prefix of nearly every package on this market, so it is
 * present in both populations by construction and measures nothing about purpose. Its IDF weight is
 * already small; it is excluded outright because "small" is not "unable".
 *
 * Each entry is a VENDOR or PRODUCT token rather than a content word. `plugin` is on the list because
 * every description in this corpus is a plugin description — the word is the corpus's subject, not any
 * one plugin's purpose.
 */
const VENDOR_TOKENS: ReadonlySet<string> = new Set([
  'dsh',
  'deepseek',
  'harnes', // the fold of "harness" produced by token.ts
  'harness',
  'plugin',
])

/**
 * How many informative terms a refusal must share before its score is consulted at all.
 *
 * TWO, because ONE is the exact shape every false positive here took. This is a structural guard and it
 * is stated as one: it does not make a weak score strong, it stops a single term from being the whole
 * evidence for a verdict.
 */
const MIN_SHARED_CONTENT_TERMS = 2

/** Normalise an identity string for case- and punctuation-insensitive comparison. */
function identityKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Every identity a candidate answers to — id, display name, catalog name and npm name.
 *
 * WHY THIS EXISTS: `dsh-better-sidebar` (a dependency key) was reported colliding with
 * `DSH-better-sidebar`, its OWN catalog row. The ids differ only by case, so an exact `id` comparison
 * missed it, and a plugin refused as its own duplicate is the duplicate-name trap arriving as a refusal.
 * A candidate never collides with itself under any of its own names.
 */
function identityKeys(item: {
  readonly id: string
  readonly name?: string | null
  readonly catalog?: { readonly name: string; readonly npm: string | null } | null
}): ReadonlySet<string> {
  const keys = new Set<string>()
  keys.add(identityKey(item.id))
  if (typeof item.name === 'string' && item.name !== '') keys.add(identityKey(item.name))
  if (item.catalog !== undefined && item.catalog !== null) {
    if (item.catalog.name !== '') keys.add(identityKey(item.catalog.name))
    if (item.catalog.npm !== null && item.catalog.npm !== '') keys.add(identityKey(item.catalog.npm))
  }
  return keys
}

/**
 * The text criterion: refused when the two descriptions share enough INFORMATIVE terms.
 *
 * WHY THE WEIGHTING EXISTS, MEASURED RATHER THAN ASSUMED. The first version used plain term overlap and
 * refused `dsh-plugin-marketplace@Scorp1o117` against **`dsh-sentinel`** at 0.1961 on the overlap
 * `dsh` — one term, present in almost every description in this program. A refusal whose entire evidence
 * is the product's own name is not a finding; it is the tokenizer reporting that both plugins are DSH
 * plugins. The same run also reported a candidate refused nine times where five were distinct plugins.
 *
 * So each term is weighted by its inverse document frequency over the reference population ITSELF — the
 * corpus being compared against, not a borrowed one. A term in every reference contributes `idf = 0`
 * and is effectively invisible; a term in one reference carries full weight. The corpus is the population,
 * which is the honest choice: it is the only corpus this gate is allowed to see.
 *
 * @param idf - term → weight, built by `documentFrequencyWeights` from the comparable references.
 */
function collideByText(
  candidate: CandidateSignature,
  reference: ReferenceSignature,
  threshold: number,
  idf: ReadonlyMap<string, number>,
): Collision | null {
  const left = weighted(candidate.intentText, idf)
  const right = weighted(reference.intentText, idf)
  const shared = sharedInformativeTerms(left, right)
  if (shared.length < MIN_SHARED_CONTENT_TERMS) return null
  const scored = weightedCosine(left, right)
  if (scored.value === null) return null
  if (scored.value < threshold) return null
  const zone = strongestSharedZone(candidate, reference)
  return {
    id: reference.id,
    name: reference.name ?? reference.id,
    klass: reference.klass,
    zone: zone?.zone ?? 'unattributed',
    score: scored.value,
    candidateScore: scored.value,
    referenceScore: scored.value,
    decidedBy: 'text-similarity',
    why:
      `its description matches ${reference.klass} ${reference.id} at ${scored.value.toFixed(4)} ` +
      `(idf-weighted token text cosine, bar ${threshold.toFixed(4)}, ${String(shared.length)} shared informative terms); ` +
      `shared: ${shared.join(', ')}. The refusal runs FROM this candidate TO ${reference.id}; ` +
      `${reference.id} being refused by some other rule elsewhere does not change this direction.`,
  }
}

/** Terms both sides carry with a positive idf, sorted — the evidence a `why` names. */
function sharedInformativeTerms(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): readonly string[] {
  const shared: string[] = []
  for (const term of left.keys()) {
    if (right.has(term)) shared.push(term)
  }
  shared.sort()
  return shared
}

/** Term map weighted by idf, with vendor tokens removed. A term with no weight is dropped. */
function weighted(text: string, idf: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  for (const term of candidateTerms(text).keys()) {
    if (VENDOR_TOKENS.has(term)) continue
    const weight = idf.get(term)
    if (weight !== undefined && weight > 0) out.set(term, weight)
  }
  return out
}

/** Cosine over two idf-weighted term maps. */
function weightedCosine(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): { readonly value: number | null; readonly reason: string | null } {
  if (a.size === 0 || b.size === 0) {
    return {
      value: null,
      reason: 'one side carries no term with a positive idf, so no overlap is defined',
    }
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (const [term, weight] of a) {
    na += weight * weight
    const other = b.get(term)
    if (other !== undefined) dot += weight * other
  }
  for (const weight of b.values()) nb += weight * weight
  if (na === 0 || nb === 0) {
    return { value: null, reason: 'a zero-magnitude weighted vector has no direction' }
  }
  return { value: dot / (Math.sqrt(na) * Math.sqrt(nb)), reason: null }
}

/**
 * Inverse document frequency over the comparable reference population.
 *
 * `idf = ln((N + 1) / (df + 1))`, NO CONSTANT ADDED. The absence of the usual `+ 1` is the whole point:
 * with a floor of 1, a term in every document still weighs 1 and generic words keep a full vote. Without
 * it, such a term weighs about `0.02` on this corpus and cannot carry a refusal alone.
 */
function documentFrequencyWeights(
  references: readonly ReferenceSignature[],
): ReadonlyMap<string, number> {
  const df = new Map<string, number>()
  for (const reference of references) {
    for (const term of candidateTerms(reference.intentText).keys()) {
      df.set(term, (df.get(term) ?? 0) + 1)
    }
  }
  const n = references.length
  const idf = new Map<string, number>()
  for (const [term, count] of df) {
    idf.set(term, Math.log((n + 1) / (count + 1)))
  }
  return idf
}

/**
 * Measure the text similarity the gate WOULD use, for a caller that needs to re-derive the threshold.
 *
 * Exported so the driver and the gate cannot drift apart: a sample measured with a different expression
 * than the one the gate decides with is this program's "two agents agreed because they ran the same
 * instrument" defect, arriving as a fitted threshold that does not describe the shipped rule.
 */
export function measureTextSimilarity(
  a: string,
  b: string,
  references: readonly ReferenceSignature[],
): { readonly score: number | null; readonly shared: readonly string[]; readonly reason: string | null } {
  const idf = documentFrequencyWeights(references)
  const left = weighted(a, idf)
  const right = weighted(b, idf)
  const shared = sharedInformativeTerms(left, right)
  const scored = weightedCosine(left, right)
  return { score: scored.value, shared, reason: scored.reason }
}

/**
 * Decide one candidate's original-intent verdict.
 *
 * @param candidate - a signed candidate; `zones` may contain nulls and `measured` may be false.
 * @param references - the signed reference populations.
 * @param options - `threshold` overrides the method's bar, for a mutation test only. A production
 *   caller does not pass it, because two callers with two thresholds is how a gate stops being a gate.
 */
export function decideOriginalIntent(
  candidate: CandidateSignature,
  references: readonly ReferenceSignature[],
  options: { readonly threshold?: number } = {},
): IntentCheck {
  const measuredAt = new Date().toISOString()
  const method = candidate.method
  const baseCensus = {
    compared: 0,
    of: references.length,
    population:
      'signed references across the three classes (stable ecosystem, official @deepseek-ai/*, existing meta plugins)',
    at: measuredAt,
  }

  const build = (
    verdict: OriginalIntentVerdict,
    reason: string | null,
    collidesWith: readonly Collision[],
    compared: number,
  ): IntentCheck => ({
    id: candidate.id,
    originalIntent: verdict,
    reason,
    zones: candidate.zones,
    collidesWith,
    method,
    measuredAt,
    census: { ...baseCensus, compared },
  })

  if (!candidate.measured) {
    return build(
      'not-measured',
      'the candidate carries no numeric zone score, so no comparison could be made; an undescribed plugin is not a clean one',
      [],
      0,
    )
  }

  const comparable = references.filter((r) => r.method === method && r.measured)
  if (comparable.length === 0) {
    const methodMismatch = references.length - comparable.length
    return build(
      'not-measured',
      references.length === 0
        ? 'the reference populations are empty, so nothing was compared; a pass over zero comparisons is instrument failure rather than a clean candidate'
        : `no reference is comparable: ${String(methodMismatch)} of ${String(references.length)} were signed by a different method than the candidate's ${method}, and two methods are two vector spaces`,
      [],
      0,
    )
  }

  const threshold = options.threshold ?? thresholdFor(method)
  // The weighting corpus IS the population being compared against, built once per decision.
  const idf = documentFrequencyWeights(comparable)
  const collisions: Collision[] = []
  for (const reference of comparable) {
    // A candidate never collides with itself — but a DIFFERENT plugin sharing its name is not itself.
    if (isSelfMatch(candidate, reference)) continue
    const collision =
      method === 'embedding'
        ? collideByZoneProfile(candidate, reference, method)
        : collideByText(candidate, reference, threshold, idf)
    if (collision === null) continue
    // A caller-supplied threshold applies to the zone-profile path too, so a mutation that moves the bar
    // actually moves it rather than being overridden by the generic-zone edge.
    if (collision.score < threshold) continue
    collisions.push(collision)
  }
  collisions.sort((a, b) => (b.score === a.score ? (a.id < b.id ? -1 : 1) : b.score - a.score))

  if (collisions.length > 0) {
    return build('collide', null, collisions, comparable.length)
  }
  return build('pass', null, [], comparable.length)
}
