/**
 * ============================================================================
 * dsh-meta-market / host / identity — the capability vocabulary, closed
 * ============================================================================
 *
 * WHY A CLOSED VOCABULARY IS THE WHOLE POINT
 *
 * A privilege filter is only as strong as the set of things it can recognise. If
 * a peer may declare ANY string as a capability, then a peer that declares a
 * string the filter has never seen is not refused — it is simply not matched,
 * and a filter built on "does it match a dangerous token" therefore passes it.
 * That is the failure mode this file exists to prevent: **what cannot be
 * classified must be refused, not defaulted**, and the way to make that
 * checkable is to publish a CLOSED set and test membership against it.
 *
 * WHAT THE TWO FIELDS ACTUALLY ARE, MEASURED
 *
 * The catalog carries TWO independently derived fields, and they disagree:
 *
 *   - `capabilities` — a list of short TOKENS. Measured over the staged snapshot
 *     (`research/cache/plugins-2026-10-12.json`, **4,527 rows**, census
 *     **2026-10-16T16:49Z**): **4,131 rows carry the key**, contributing **13,542
 *     assertions** over exactly **10 distinct tokens**. It is a CLOSED set in
 *     practice, and this file closes it in principle.
 *   - `capabilityRedLines` — a list of PROSE SENTENCES. **4,131 rows carry the
 *     key**, contributing **538 assertions** over **79 distinct strings**. The
 *     dominant value is a 56-character sentence, `'reads credentials/secrets AND
 *     has network access'`, not a token.
 *
 * **THE ARITHMETIC THAT MAKES THE UNION MANDATORY:** **488 rows declare
 * `credentials` in `capabilities`, while 386 rows carry a red line naming
 * credentials.** The sets are **not nested**: **102 rows declare credentials and
 * are NOT red-lined**, and a filter reading either field alone therefore misses a
 * real class of peer. Over the **688-row in-scope sample** used by the intent-zone
 * work, the same non-nesting appears at a smaller scale — **16 declare, 14 are
 * red-lined, 11 agree, 5 disagree one way and 3 the other** — which is what
 * reproduces `plan/06`'s figure rather than contradicting it.
 *
 * SO THE THREE SETS BELOW ARE DELIBERATELY DIFFERENT, AND ARE NOT INTERCHANGEABLE:
 *
 *   1. `DECLARED_CAPABILITY_TOKENS` — the closed token set, matched by EXACT
 *      membership. This is the thing a peer's `capabilities` array must be a
 *      subset of.
 *   2. `AUTHENTICATED_CAPABILITY_TOKENS` — the subset whose presence a peer card
 *      can be CONSISTENT with, which is a weaker claim than "known". Kept separate
 *      so "we recognise this token" is never silently read as "we have verified
 *      it".
 *   3. `CREDENTIAL_RED_LINE_MARKERS` / `NETWORK_RED_LINE_MARKERS` — SUBSTRING
 *      probes, because red lines are PROSE and an exact-membership test against a
 *      sentence would match nothing. **This is the pair that a naive
 *      `new Set([...capabilities, ...redLines])` union gets wrong**: it would put
 *      sentences where tokens belong, every exact test would then fail, and a peer
 *      declaring the exfiltration shape in prose would be GRANTED.
 *
 * @module dsh-meta-market/host/identity/capability-vocabulary
 */

/**
 * The closed set of capability tokens, as asserted by the catalog.
 *
 * Ten values, and the count is measured rather than chosen: over 4,131 rows
 * carrying the field, 13,542 assertions resolve to exactly these ten distinct
 * strings. A peer declaring anything outside this set is **unclassifiable**, and
 * `decideAdmission()` refuses it rather than ignoring it.
 */
export const DECLARED_CAPABILITY_TOKENS: ReadonlySet<string> = new Set([
  'fs-read',
  'fs-write',
  'network',
  'shell',
  'env',
  'credentials',
  'llm',
  'dynamic-code',
  'host-runtime',
  'subagent',
])

/**
 * The subset a peer card can be CHECKED against in the sense of consistency.
 *
 * Deliberately NOT the same set as above and NOT used for membership testing.
 * The distinction matters because "this token is one we recognise" and "this
 * token's presence has been corroborated" are different claims, and collapsing
 * them would let a card's own assertion promote itself.
 */
export const AUTHENTICATED_CAPABILITY_TOKENS: ReadonlySet<string> = new Set([
  'fs-read',
  'fs-write',
  'network',
  'shell',
  'env',
  'credentials',
])

/**
 * Substrings that mark a red line as naming CREDENTIALS.
 *
 * **Substrings, not tokens, because the field is prose.** Measured: the dominant
 * red-line value is the full sentence `'reads credentials/secrets AND has network
 * access'`. An exact-membership test against that field matches nothing, which is
 * precisely how a prose-aware union would fail silently.
 *
 * The markers are matched case-insensitively, and `secret` is included because
 * the catalog's own dominant sentence uses *"credentials/secrets"* — a probe
 * keyed only on `credential` would miss the singular/compound forms.
 */
export const CREDENTIAL_RED_LINE_MARKERS: readonly string[] = ['credential', 'secret', 'password', 'token', 'api key', 'apikey']

/**
 * Substrings that mark a red line as naming NETWORK access.
 *
 * Covers the catalog's phrasing (`network`, `internet`, `http`, `fetch`,
 * `egress`, `remote`) because the sentence is author-written prose and cannot be
 * relied on to use one word.
 */
export const NETWORK_RED_LINE_MARKERS: readonly string[] = ['network', 'internet', 'http', 'fetch', 'egress', 'remote', 'socket', 'download']

/** Whether a red-line string names credentials, by substring. */
export function redLineNamesCredentials(line: string): boolean {
  const lower = line.toLowerCase()
  return CREDENTIAL_RED_LINE_MARKERS.some(marker => lower.includes(marker))
}

/** Whether a red-line string names network access, by substring. */
export function redLineNamesNetwork(line: string): boolean {
  const lower = line.toLowerCase()
  return NETWORK_RED_LINE_MARKERS.some(marker => lower.includes(marker))
}

/**
 * The census, carried with its denominators so a quote cannot lose them.
 *
 * Every figure here is a **numerator with the population it was taken over**,
 * because this program's most expensive published defects have all been counts
 * quoted without their denominator. The `tokenRowCounts` map is the per-token
 * row count, which is what makes `credentials` (488) and `env` (2,370)
 * distinguishable at a glance rather than by re-measuring.
 *
 * **The census date is part of the record.** A live catalog is not a snapshot, so
 * a figure quoted without its moment cannot be re-taken by the reader who needs
 * to check it.
 */
export const VOCABULARY_CENSUS = {
  source: 'research/cache/plugins-2026-10-12.json',
  censusAt: '2026-10-16T16:49Z',
  catalogRows: 4_527,
  rowsCarryingCapabilities: 4_131,
  capabilityAssertions: 13_542,
  distinctCapabilityTokens: 10,
  rowsCarryingRedLines: 4_131,
  redLineAssertions: 538,
  distinctRedLineStrings: 79,
  rowsDeclaringNothingAtAll: 942,
  rowsCarryingAtLeastOneRedLine: 500,
  rowsDeclaringCredentials: 488,
  rowsCredentialRedLined: 386,
  rowsDeclaringCredentialsNotRedLined: 102,
  credentialsWithNetworkByCapabilities: 440,
  credentialsWithNetworkByRedLines: 386,
  tokenRowCounts: {
    'fs-read': 3_067,
    network: 2_378,
    'fs-write': 2_375,
    env: 2_370,
    shell: 1_694,
    credentials: 488,
    llm: 379,
    'dynamic-code': 361,
    'host-runtime': 335,
    subagent: 95,
  },
} as const
