/**
 * The token method — the fallback that runs when the substrate cannot embed.
 *
 * WHY A FALLBACK EXISTS AT ALL. The embedding method needs a live model behind
 * `http://127.0.0.1:11434/api/embed`. Measured 2026-10-17T21:41Z, that endpoint refused every
 * connection (curl exit 7, `HTTP=000`) and the intent map's own recall route answered
 * `{"embedded":false,"reason":"the query could not be embedded: fetch failed"}`. A gate that only had
 * the embedding method would have been UNABLE TO DECIDE at that moment, and the honest report would
 * have been an empty window. A token method over the zone DEFINITIONS — which are text, and are served
 * by a route that was answering — lets the gate still refuse. Its cost is precision, and the price of
 * that is paid by LABELLING every zone `method: "token"` rather than by quietly reporting token scores
 * as embedding similarities.
 *
 * WHAT THE SCORE MEANS, exactly, because a number without its method is not a value.
 *
 * Weighted cosine over binary term-indicator vectors. A zone's terms come from two places with two
 * weights: its published `definition` at weight 1, and the tokens of its own `id` at weight 2. The id
 * weight is deliberate — `M1-cross-session-store` names its subject in its identifier, and that is the
 * substrate's own labelling, not an inference. A candidate's terms all weigh 1.
 *
 * The consequence stated plainly: a token score is a measure of SHARED VOCABULARY, not of shared
 * purpose. Two plugins that say "browse, search, install" score high whether they install plugins or
 * refrigerators. That is precisely why the recall route's `S4-management-ui` behaviour is recorded as a
 * generic zone, and why the gate excludes generic zones from carrying a collision alone.
 *
 * @module dsh-meta-market/host/intent-align/token
 */

/** Terms that carry no subject. Removed before scoring, so "the" cannot make two plugins similar. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'each', 'every', 'for', 'from', 'had', 'has', 'have', 'how', 'if', 'in', 'into', 'is', 'it', 'its',
  'may', 'more', 'most', 'no', 'not', 'of', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over',
  'per', 'plus', 'same', 'shall', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'two', 'under', 'up', 'use', 'used',
  'uses', 'using', 'via', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'will',
  'with', 'within', 'without', 'would', 'you', 'your',
])

/**
 * A light suffix fold, so `installs`, `installed` and `install` are one term.
 *
 * Deliberately crude and deliberately stated: this is not a stemmer, it is a fold for the four suffixes
 * that actually recur in this corpus. An over-aggressive stemmer would fold `session` into `sess` and
 * `provision` into `provisi`, which is why the rules stop at these.
 */
function fold(token: string): string {
  if (token.length > 6 && token.endsWith('ing')) return token.slice(0, -3)
  if (token.length > 5 && token.endsWith('ed')) return token.slice(0, -2)
  if (token.length > 5 && token.endsWith('es')) return token.slice(0, -2)
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1)
  return token
}

/**
 * Tokenize text into the term set the scorer uses.
 *
 * Lowercase, split on anything that is not a letter or digit, drop terms shorter than 3 characters,
 * drop stopwords, fold suffixes, and de-duplicate. The de-duplication is what makes the vector binary:
 * a definition that says "memory" nine times is not nine times more about memory than one that says it
 * once, and counting occurrences would let verbosity dominate.
 */
export function tokenize(text: string): readonly string[] {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue
    if (STOPWORDS.has(raw)) continue
    const folded = fold(raw)
    if (folded.length < 3) continue
    if (STOPWORDS.has(folded)) continue
    out.add(folded)
  }
  return [...out].sort()
}

/** A zone's weighted term vector: `definition` terms at 1, id terms at 2. */
export function zoneTerms(zoneId: string, definition: string): ReadonlyMap<string, number> {
  const weights = new Map<string, number>()
  for (const term of tokenize(definition)) weights.set(term, 1)
  for (const term of tokenize(zoneId.replace(/[-_]+/g, ' '))) {
    weights.set(term, 2)
  }
  return weights
}

/** A candidate's weighted term vector: every term at 1. */
export function candidateTerms(intentText: string): ReadonlyMap<string, number> {
  const weights = new Map<string, number>()
  for (const term of tokenize(intentText)) weights.set(term, 1)
  return weights
}

/** The L2 norm of a weighted term vector. */
function norm(vector: ReadonlyMap<string, number>): number {
  let sum = 0
  for (const weight of vector.values()) sum += weight * weight
  return Math.sqrt(sum)
}

/**
 * The weighted cosine between a candidate and a zone.
 *
 * Returns `null` — never `0` — when either side is empty: an empty intent text is not a plugin that is
 * dissimilar to everything, it is a plugin nobody described, and the two must not share a number.
 */
export function tokenScore(
  candidate: ReadonlyMap<string, number>,
  zone: ReadonlyMap<string, number>,
): { readonly value: number | null; readonly reason: string | null } {
  if (candidate.size === 0) {
    return { value: null, reason: 'the candidate intent text yielded no terms, so no overlap is defined' }
  }
  if (zone.size === 0) {
    return { value: null, reason: 'the zone yielded no terms, so no overlap is defined' }
  }
  const candidateNorm = norm(candidate)
  const zoneNorm = norm(zone)
  if (candidateNorm === 0 || zoneNorm === 0) {
    return { value: null, reason: 'a zero-magnitude term vector has no direction' }
  }
  let dot = 0
  for (const [term, weight] of candidate) {
    const other = zone.get(term)
    if (other !== undefined) dot += weight * other
  }
  return { value: dot / (candidateNorm * zoneNorm), reason: null }
}
