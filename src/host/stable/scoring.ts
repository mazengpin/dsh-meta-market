/**
 * L6 — the token scorer, and the rule that turns 24 numbers into a match verdict.
 *
 * WHY THIS FILE EXISTS AT ALL, WHEN `intent-align` ALSO SCORES ZONES. The two modules score DIFFERENT
 * SUBJECTS and the owner's clause names both: `intent-align` answers "does this CANDIDATE collide with a
 * stored class", and this lane answers "do the STORED members overlap EACH OTHER". If this lane returned a
 * candidate match as well there would be two opinions about one question and no reader appointed to
 * choose between them. So the scorer here is used on member manifests only, and its output is stored, not
 * compared with `intent-align`'s in a way that could silently pick a winner.
 *
 * THE METHOD IS `token` BECAUSE THE EMBEDDING METHOD COULD NOT BE MEASURED AT CENSUS TIME, and that is a
 * reading rather than a preference: `GET http://127.0.0.1:11434/api/ps` returned `000` (no connection —
 * NOT a 404, and not a status this lane is allowed to read as "no data"), and the live
 * `/intent-map/api/recall` route answered `embedded:false, reason:"the query could not be embedded: fetch
 * failed"` at 2026-10-17T21:42Z. A score labelled `embedding` that was produced by a tokeniser would be a
 * mislabelled instrument, so every zone this lane stores carries `method: 'token'` and the record carries
 * the reason.
 *
 * THE FORMULA IS STATED SO IT CAN BE RE-RUN, not described so it can be believed:
 *
 *     tokens(text) = the set of lowercase runs matching /[a-z][a-z0-9+#-]{2,}/g, minus STOPWORDS
 *     score(zone)  = |tokens(intentText) INTERSECT tokens(zone.definition)| / |tokens(intentText)|
 *
 * It measures CONTAINMENT OF THE PLUGIN'S OWN WORDS IN THE ZONE'S DEFINITION, which is the quantity that
 * answers "does this zone's definition speak about what this plugin says it does". It is NOT a symmetric
 * similarity: a one-word description would score 1.00 against every zone containing that word, which is
 * why the description field is used and why the score is published beside the text it came from.
 *
 * @module dsh-meta-market/host/stable/scoring
 */

import type { OriginalIntentVerdict, SignatureMethod, StableRecord, StoredCollision, StoredMatch, StoredZone, ZoneDefinition } from './types.ts'

/**
 * Words that carry no intent, dropped before scoring.
 *
 * Kept SHORT and printed, because a stopword list is a modelling decision that can move every score. It
 * holds only function words; a domain word left out is a word this scorer will over-weight.
 */
export const STOPWORDS: readonly string[] = [
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'are', 'not', 'but',
  'can', 'will', 'its', 'their', 'them', 'they', 'has', 'have', 'was', 'were', 'all', 'any', 'own',
  'one', 'two', 'use', 'using', 'used', 'via', 'per', 'out', 'off', 'get', 'set', 'add', 'new',
  'plugin', 'plugins', 'dsh', 'deepseek', 'harness',
]

/**
 * The floor a shared dominant zone must clear before it counts as a collision.
 *
 * A PROGRAM CHOICE, stated as a number rather than left in a comment, and it is deliberately LOW: a
 * shared argmax at 0.03 is two members matching the same zone because the zone's definition is long,
 * not because they share a purpose. 0.10 means at least a tenth of a member's own intent words appear in
 * the shared zone's definition.
 */
export const SHARED_DOMINANT_MIN = 0.1

/** The zone count this build expects. A space that disagrees is refused, never silently resized. */
export const EXPECTED_ZONE_COUNT = 24

/** Tokenise by the published rule. Exported so a reader can recompute any stored score. */
export function tokensOf(text: string): ReadonlySet<string> {
  const found = text.toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) ?? []
  const kept = found.filter((word) => !STOPWORDS.includes(word))
  return new Set(kept)
}

/** The containment score of one text against one zone definition. `0` when the text carries no tokens. */
export function containmentScore(intentText: string, definition: string): number {
  const intent = tokensOf(intentText)
  if (intent.size === 0) return 0
  const zone = tokensOf(definition)
  let shared = 0
  for (const word of intent) if (zone.has(word)) shared += 1
  return shared / intent.size
}

/**
 * Score one intent text against the whole zone space.
 *
 * The map ALWAYS carries every zone of the space, score included, because a map that dropped its weak
 * zones would make "this member matches nothing" indistinguishable from "this member was scored against
 * three zones".
 */
export function scoreIntent(
  intentText: string,
  zones: readonly ZoneDefinition[],
  method: SignatureMethod = 'token',
): readonly StoredZone[] {
  return zones.map((zone) => ({
    zone: zone.id,
    score: Number(containmentScore(intentText, zone.definition).toFixed(4)),
    method,
  }))
}

/**
 * The zone a member sits in most strongly, or `null` when its map carries no positive score.
 *
 * Ties resolve to the FIRST zone in the space's own order, so the answer is deterministic across runs
 * rather than dependent on object iteration. That is stated because a tie-break that varies is a
 * different verdict on the same data.
 */
export function dominantZone(map: readonly StoredZone[]): StoredZone | null {
  let best: StoredZone | null = null
  for (const zone of map) {
    if (best === null || zone.score > best.score) best = zone
  }
  if (best === null || best.score <= 0) return null
  return best
}

/** The rule's own record, so a verdict can cite it and a reader can falsify it. */
export const MATCH_RULE = {
  id: 'L6-shared-dominant',
  text:
    'Two stored members COLLIDE when their intent maps share the same dominant zone AND the lower of the ' +
    'two scores in that zone is at least SHARED_DOMINANT_MIN. A member with no collision is `pass`. A ' +
    'member whose map carries no numeric score, or a population with fewer than two measured members, is ' +
    '`not-measured` — never `pass`.',
  sharedDominantMin: SHARED_DOMINANT_MIN,
  falsifier:
    'One stored pair that shares its dominant zone at or above SHARED_DOMINANT_MIN while both records read ' +
    '`pass`, or one record reading `collide` whose stored maps do not share a dominant zone. The rule is ' +
    'also falsified by a member marked `pass` whose own map carries no numeric score.',
} as const

/** What the match verdicts were computed over. One string, used by every record's `compared.population`. */
export const COMPARISON_POPULATION =
  'the stored records of THIS ledger (stable and official members), each scored against the same live ' +
  '24-zone space; a member is compared with every OTHER stored member and never with itself'

/**
 * Decide every member's match verdict against the rest of the stored population.
 *
 * Returns one entry per input record, keyed by id, so a caller cannot accidentally read a verdict for a
 * record that was not compared. A population of one is `not-measured` rather than `pass`: a single
 * member has nothing to collide WITH, and calling that a pass is the "0 on both sides is a pass" defect.
 */
export function decideMatches(
  members: readonly { readonly id: string; readonly klass: StableRecord['klass']; readonly zones: readonly StoredZone[]; readonly measured: boolean }[],
  at: string,
): Map<string, StoredMatch> {
  const measured = members.filter((member) => member.measured)
  const dominants = new Map<string, StoredZone | null>()
  for (const member of members) dominants.set(member.id, dominantZone(member.zones))

  const out = new Map<string, StoredMatch>()
  for (const member of members) {
    const compared = {
      count: Math.max(0, measured.length - 1),
      of: Math.max(0, members.length - 1),
      population: COMPARISON_POPULATION,
      at,
    }
    if (!member.measured) {
      out.set(member.id, {
        verdict: 'not-measured',
        rule: MATCH_RULE.id,
        reason: 'this member carries no numeric zone score, so it cannot be compared with anything',
        collidesWith: [],
        compared,
      })
      continue
    }
    if (measured.length < 2) {
      out.set(member.id, {
        verdict: 'not-measured',
        rule: MATCH_RULE.id,
        reason: `${String(measured.length)} of ${String(members.length)} stored members carried a measurable map; a population with nothing to compare against is not a pass`,
        collidesWith: [],
        compared,
      })
      continue
    }

    const own = dominants.get(member.id) ?? null
    const collisions: StoredCollision[] = []
    if (own !== null) {
      for (const other of measured) {
        if (other.id === member.id) continue
        const theirs = dominants.get(other.id) ?? null
        if (theirs === null || theirs.zone !== own.zone) continue
        const strength = Math.min(own.score, theirs.score)
        if (strength < SHARED_DOMINANT_MIN) continue
        collisions.push({
          id: other.id,
          klass: other.klass,
          sharedZone: own.zone,
          score: Number(strength.toFixed(4)),
          why:
            `both members' strongest zone is \`${own.zone}\`, at ${own.score.toFixed(4)} and ` +
            `${theirs.score.toFixed(4)}; the conservative strength ${strength.toFixed(4)} clears ` +
            `SHARED_DOMINANT_MIN ${SHARED_DOMINANT_MIN}`,
        })
      }
    }

    const verdict: OriginalIntentVerdict = collisions.length > 0 ? 'collide' : 'pass'
    out.set(member.id, {
      verdict,
      rule: MATCH_RULE.id,
      reason: null,
      collidesWith: collisions,
      compared,
    })
  }
  return out
}

/**
 * The strongest shared-dominant pair in a population, or `null` when no pair shares a dominant zone.
 *
 * Published beside the verdicts so a reader sees HOW CLOSE a `pass` came to failing. A suite of passes
 * with no separation figure is a green total that says nothing about whether the check could disagree.
 */
export function strongestSharedPair(
  members: readonly { readonly id: string; readonly zones: readonly StoredZone[] }[],
): { readonly a: string; readonly b: string; readonly zone: string; readonly score: number } | null {
  const dominants = members.map((member) => ({ id: member.id, zone: dominantZone(member.zones) }))
  let best: { a: string; b: string; zone: string; score: number } | null = null
  for (let i = 0; i < dominants.length; i += 1) {
    for (let j = i + 1; j < dominants.length; j += 1) {
      const left = dominants[i]
      const right = dominants[j]
      if (left === undefined || right === undefined) continue
      if (left.zone === null || right.zone === null) continue
      if (left.zone.zone !== right.zone.zone) continue
      const score = Math.min(left.zone.score, right.zone.score)
      if (best === null || score > best.score) best = { a: left.id, b: right.id, zone: left.zone.zone, score: Number(score.toFixed(4)) }
    }
  }
  return best
}
