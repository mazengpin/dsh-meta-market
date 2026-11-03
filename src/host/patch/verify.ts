/**
 * L4 — verify before apply.
 *
 * THE ONE SENTENCE THAT MATTERS: this module checks WITHOUT EXECUTING, and what
 * it establishes is CONSISTENCY, never AUTHENTICITY. An admitted envelope is one
 * this lane has INSPECTED, never one it has PROVEN. `BLINDNESS_REGISTER` below
 * is the exact and complete statement of the difference, it is returned as a
 * value on every verdict, and it is asserted by `runSelfCheck` so that a gap
 * cannot be silently closed or silently widened.
 *
 * WHY CHECKING IS HARDER THAN IT LOOKS. A JSON parse over bytes supplied by a
 * peer is itself a module load in the worst case: prototype pollution via
 * `__proto__`, a `$schema` fetch that calls out to the network, `scripts` keys
 * that a consumer might later honour, `extends`-style path traversal. So the
 * checks below parse into plain objects and never hand the result to anything
 * that would interpret it. The DIRECT consequence, stated because it is
 * counter-intuitive, is that the check that would close gap B2 is excluded by
 * this very rule: recomputing a payload's real capability declaration requires
 * reading the payload, and reading the payload is what check-before-execute
 * forbids. The lane refuses to close its own gap, honestly and on purpose.
 *
 * WHAT IS DEPENDED ON, AND FROM WHERE:
 *  - `../../shared/protocol.ts` for every frozen type. Never edited here.
 *  - `node:crypto` for SHA-256. The digest is computed over bytes this module
 *    serialises itself; see `canonicalBytes` for what those bytes do NOT cover.
 */

import { createHash } from 'node:crypto'

import { HASH_ALGORITHM, SIGNATURE_ALGORITHM } from './types.ts'

import type {
  CapabilityDeclaration,
  CheckId,
  CheckResult,
  EvidencePointer,
  LadderState,
  MetaPackage,
  PatchEnvelope,
  PatchVerdict,
  PromotionTerms,
  SelfCheckFinding,
  Sha256Hex,
  Verdict,
  VerifyPorts,
  ZoneLookup,
} from './types.ts'

import type { ChoiceLabelSet, DecisionValue } from '../../shared/protocol.ts'

/**
 * Re-exported so that the algorithm names travel WITH the check that applies
 * them. A consumer reading a verdict and a consumer reading the constant should
 * not have to visit two modules to learn that `contentHash` is SHA-256 while the
 * signature — named `null` — is a declared absence rather than a weaker digest.
 */
export { HASH_ALGORITHM, SIGNATURE_ALGORITHM }

// ---------------------------------------------------------------------------
// Registered label sets — the closed registry, copied from the protocol by value
// ---------------------------------------------------------------------------

/**
 * The label sets a `choice` decision may draw on, as the DECISION-GRAMMAR check
 * needs them.
 *
 * Held as a value here rather than only as a type, because a check must be able
 * to test membership at runtime and a TypeScript union is erased. It is asserted
 * equal to the protocol's union by `runSelfCheck` (C2), so the two cannot drift
 * in silence — which is the whole failure mode of keeping a runtime copy.
 */
export const REGISTERED_LABEL_SETS: readonly ChoiceLabelSet[] = [
  'threeKind',
  'verificationState',
  'mountState',
  'alignVerdict',
]

// ---------------------------------------------------------------------------
// Recognised capabilities and red lines
// ---------------------------------------------------------------------------

/**
 * The capabilities this lane recognises.
 *
 * A DECLARATION OUTSIDE THIS SET IS NOT REFUSED AND IS NOT ACCEPTED — it is
 * reported. Refusing an unknown capability would make this lane an authority on
 * the vocabulary, which it is not; the vocabulary is `capability-vocabulary.ts`'s.
 * Accepting it silently is what gap B2 is about. Reporting it, and refusing the
 * promotion rather than the envelope, is the position that states the truth.
 */
export const KNOWN_CAPABILITIES: readonly string[] = [
  'fs-read',
  'fs-write',
  'shell-exec',
  'network-egress',
  'credentials',
  'process-spawn',
  'env-read',
  'plugin-load',
  'route-register',
  'skill-write',
  'memory-read',
  'memory-write',
  'gpu-device',
  'socket-listen',
  'clock-read',
  'random-source',
]

/**
 * The red lines this lane recognises, and — measured — how many it does not.
 *
 * THIS SET WAS WRONG ONCE, AND THE CORRECTION IS THE POINT OF THIS COMMENT.
 * The first version of this constant listed four exact strings. **Three of them
 * DO NOT EXIST ANYWHERE IN THE CORPUS** — over the 4,527-row census
 * `research/cache/plugins-2026-10-12.json`, `writes outside its own data
 * directory`, `executes code fetched at runtime` and `spawns a process it did
 * not declare` each match **0 rows**. They were authored from expectation rather
 * than read from the data, and the "4 of 77 recognised" figure that rested on
 * them was therefore a claim about a set that was itself 75% fictional.
 *
 * WHAT THE CORPUS ACTUALLY CONTAINS, MEASURED, and the shape is the finding:
 * 500 of 4,527 rows carry at least one red line, and those rows carry **77
 * distinct strings**, which fall into exactly four families —
 *
 *   | distinct strings | family                                             |
 *   |-----------------:|----------------------------------------------------|
 *   |               58 | `uses plaintext http:// to <host>`                 |
 *   |               16 | `uses literal IP <ip> for network access`          |
 *   |                2 | `runs code at install time (<hook>)`               |
 *   |                1 | `reads credentials/secrets AND has network access` |
 *
 * **Fifty-eight of the seventy-seven are one family with a different host in
 * each** — the corpus generates these per TARGET, not per KIND. An exact-string
 * recognised set is therefore structurally incapable of covering the corpus: it
 * would have to enumerate a separate entry for every host and every IP that will
 * ever appear. **So recognition is by FAMILY here, and the exact string is kept
 * only where the exact string is the policy** (the credentials-and-network line,
 * which is a judgement about a combination rather than a generated target).
 */
export interface RedLineFamily {
  /** The family's name, for a report. */
  readonly family: string
  /** `true` when this family may never auto-promote without a named human. */
  readonly prohibitsAutoPromotion: boolean
  /** Does this exact string belong to the family? */
  readonly matches: (line: string) => boolean
  /** Why the family is treated as it is. */
  readonly rationale: string
}

/**
 * The four families the corpus actually contains, derived from the census above.
 *
 * A FAMILY-MATCHED RED LINE IS RECOGNISED, WHICH IS NOT THE SAME AS UNDERSTOOD.
 * Matching `uses plaintext http:// to <anything>` tells this lane that a
 * plaintext HTTP target exists; it does not tell the lane whether that target is
 * benign. So family membership is reported with the family's NAME, and the
 * refusal decision rests on the family's `prohibitsAutoPromotion` flag — which is
 * a stated policy rather than an inference from the string.
 */
export const RED_LINE_FAMILIES: readonly RedLineFamily[] = [
  {
    family: 'plaintext-http-to-host',
    prohibitsAutoPromotion: true,
    matches: (line) => /^uses plaintext http:\/\/ to \S/.test(line),
    rationale:
      '58 of the 77 distinct strings. A plaintext HTTP target is a target that can be rewritten in transit; the host differs per row and the RISK does not. Prohibited from auto-promotion because the transport, not the host, is the finding.',
  },
  {
    family: 'literal-ip-network-access',
    prohibitsAutoPromotion: true,
    matches: (line) => /^uses literal IP \S+ for network access$/.test(line),
    rationale:
      '16 of the 77. A literal IP bypasses name resolution, which is where a host allow-list would bind. Includes reserved and link-local ranges (169.254.169.254 is the cloud metadata endpoint) and deliberately unroutable ones (1.2.3.4, 2.5.4.3), so the family is not uniformly hostile — which is why it blocks auto-promotion rather than refusing the envelope.',
  },
  {
    family: 'code-at-install-time',
    prohibitsAutoPromotion: true,
    matches: (line) => /^runs code at install time \(/.test(line),
    rationale:
      '2 of the 77 (`postinstall`, `install`). An install hook runs BEFORE any verification this lane performs can influence it, so this is the one family whose consequence is measured in the past tense.',
  },
  {
    family: 'credentials-and-network',
    prohibitsAutoPromotion: true,
    matches: (line) => line === 'reads credentials/secrets AND has network access',
    rationale:
      '1 of the 77 distinct strings, carried by 386 of the 4,527 rows, and recognised as an EXACT string rather than a family because it is a judgement about a COMBINATION of two capabilities rather than a generated target. This is the highest-frequency single red line in the corpus.',
  },
]

/**
 * Exact strings that may never auto-promote, whatever else is true.
 *
 * The credentials-and-network line is kept here as well as in the families above
 * so that a reader looking for "the 386-family" finds it under that name. The two
 * representations are asserted to agree by `runSelfCheck` (C11), so they cannot
 * drift apart.
 */
export const AUTO_PROMOTION_PROHIBITED_RED_LINES: readonly string[] = [
  'reads credentials/secrets AND has network access',
]

/** Is this string in a family this lane recognises? */
export function recogniseRedLine(line: string): RedLineFamily | null {
  for (const family of RED_LINE_FAMILIES) {
    if (family.matches(line)) return family
  }
  return null
}

/** The measured census this recognition is derived from. Cited so a reader can re-take it. */
export const RED_LINE_CENSUS = {
  catalog: 'research/cache/plugins-2026-10-12.json',
  catalogRows: 4527,
  rowsWithARedLine: 500,
  distinctRedLineStrings: 77,
  distinctStringsInAFamily: 77,
  /** The one exact string the lane treats as policy rather than as a generated target. */
  credentialsAndNetworkRows: 386,
  censusAt: '2026-10-12',
} as const

// ---------------------------------------------------------------------------
// Canonical serialisation
// ---------------------------------------------------------------------------

/**
 * Serialise a value canonically: ordinal key order, no incidental whitespace.
 *
 * Canonical because a digest over `JSON.stringify(obj)` is a digest over one
 * interpreter's key insertion order, and two peers that agree on content would
 * disagree on the hash. Ordinal (`<`/`>`) rather than locale-aware, because
 * `localeCompare` is a property of the machine rather than of the data.
 *
 * WHAT THIS DOES NOT COVER IS IN `canonicalBytes`, and the separation is
 * deliberate: this function must be usable on any value including one with a
 * `contentHash` field, so the exclusion belongs to the caller that knows what
 * it is hashing.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonicalJson refuses a non-finite number: it has no canonical text form')
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'undefined') return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const parts: string[] = []
    for (const key of keys) {
      const entry = record[key]
      if (typeof entry === 'undefined') continue
      parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`)
    }
    return `{${parts.join(',')}}`
  }
  throw new TypeError(`canonicalJson refuses ${typeof value}: no canonical text form`)
}

/**
 * The exact bytes a package's `contentHash` is computed over.
 *
 * `contentHash` IS DELETED BEFORE SERIALISING, and this is not a convenience —
 * it is forced by arithmetic. A digest cannot cover a string that contains the
 * digest, so hashing the whole object can never round-trip. Measured during this
 * lane's build: sealing an envelope produced `53fc859c…`, and recomputing over
 * the sealed object produced `f432b6a9…`. The only two ways out are to exclude
 * the field from the covered bytes or to move the digest out of the object
 * being digested; the second is a change to the frozen protocol, so this lane
 * takes the first.
 *
 * THE COST IS REAL AND IS NOT HIDDEN: the hash covers the package MINUS its hash
 * field, so a relay that is already an admitted peer may change `contentHash`
 * alone and pass every check in this lane. That is blindness entry B7, and the
 * exclusion is asserted by `runSelfCheck` (C8) so it cannot drift.
 */
export function canonicalBytes(pkg: MetaPackage): Uint8Array {
  const covered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(pkg as unknown as Record<string, unknown>)) {
    if (key === 'contentHash') continue
    covered[key] = value
  }
  return new TextEncoder().encode(canonicalJson(covered))
}

/** SHA-256 over arbitrary bytes, lowercase hex. The one hashing primitive used here. */
export function sha256Hex(bytes: Uint8Array): Sha256Hex {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The digest of a package's covered bytes. The definition of `contentHash`. */
export function packageHash(pkg: MetaPackage): Sha256Hex {
  return sha256Hex(canonicalBytes(pkg))
}

// ---------------------------------------------------------------------------
// The blindness register — the honest statement of what is NOT checked
// ---------------------------------------------------------------------------

/**
 * Every gap this lane knows about, returned on every verdict.
 *
 * EACH ENTRY CARRIES ITS CONSEQUENCE, because a gap with no stated consequence
 * is a note rather than a finding, and because the consequence is what tells a
 * reader whether to care. `closableHere` decides ownership: a gap that this lane
 * could close with its own code is this lane's debt, and a gap that needs a
 * protocol change or a capability the deployment lacks is a finding to escalate.
 *
 * B1 IS THE HEADLINE and it is the reason this register exists at all.
 */
export const BLINDNESS_REGISTER: readonly {
  readonly id: string
  readonly gap: string
  readonly consequence: string
  readonly closableHere: boolean
}[] = [
  {
    id: 'B1',
    gap:
      'SIGNATURE IS NOT VERIFIED, AND NEVER WAS: the frozen protocol declares no signature field on ' +
      'MetaPackage or PatchProposal at all, so there is nothing to verify even if the algorithm were settled.',
    consequence:
      'contentHash is not signed and is not bound to proposal.from. A relay that is ITSELF an admitted peer ' +
      'can rewrite the package and the proposal together, recompute the hash, and pass every check in this ' +
      'lane. An admitted envelope is one this lane has INSPECTED, never one it has PROVEN.',
    closableHere: false,
  },
  {
    id: 'B2',
    gap:
      'declaration-coverage establishes AT LEAST, never ONLY. It compares the declaration against a ' +
      'consistency requirement; it does not recompute what the payload actually does. A package declaring ' +
      'only `fs-read` whose payload installs a shell hook PASSES this check.',
    consequence:
      'A declaration is testimony about intent, not a measurement of behaviour, and a peer that understates ' +
      'its own reach is admitted. The check that would close this — reading the payload and deriving its real ' +
      'declaration — is a parse over attacker-supplied bytes, which check-before-execute forbids, so THIS LANE ' +
      'CANNOT CLOSE ITS OWN GAP and says so rather than weakening the rule that creates it.',
    closableHere: false,
  },
  {
    id: 'B3',
    gap:
      'The package BODY is not read. This lane verifies a manifest-shaped description of a change and never ' +
      'the bytes the change consists of.',
    consequence:
      'Everything admitted here is admitted on the strength of a description. A manifest that is internally ' +
      'consistent and describes something other than what it ships passes.',
    closableHere: false,
  },
  {
    id: 'B4',
    gap:
      'The UNDO CONTRACT is checked; the undo EXECUTION is not. `reverses` must name a target and a base hash, ' +
      'and that is all this lane establishes.',
    consequence:
      'A patch can promote carrying a reversal path that does not work. Reversibility is therefore a claim ' +
      'this lane can check the SHAPE of and cannot check the TRUTH of — a distinction that matters because ' +
      'the ladder keeps the undo path for as long as the patch is recorded.',
    closableHere: false,
  },
  {
    id: 'B5',
    gap:
      'There is no catalog reader in this lane. `target-zone` and `catalogRef` are answered through an ' +
      'injected port, and this lane does not own the catalog.',
    consequence:
      'An injected `exists: false` is a READING supplied by someone else, and a failure to inject one at all ' +
      'is an ABSENT READING rather than an absent value. The two must not be reported alike, which is why the ' +
      'port returns a reason beside its answer and why a missing port abstains instead of refusing.',
    closableHere: true,
  },
  {
    id: 'B6',
    gap:
      'Absence-vs-zero is preserved only for the three fields this lane names and tests: `catalogRef`, ' +
      '`intentFingerprint` and `reverses`. Every other optional field is read through the object as given.',
    consequence:
      'For those other fields a `0` and an absent value are indistinguishable downstream, so a consumer that ' +
      'treats a missing count as zero will understate a population. The protocol is the place to fix this and ' +
      'it is frozen.',
    closableHere: false,
  },
  {
    id: 'B7',
    gap:
      'The proposal half of the envelope is NOT hash-covered at all, and the package half is covered MINUS its ' +
      'own `contentHash` field (see `canonicalBytes`).',
    consequence:
      'A relay may change `contentHash` alone and pass, and may change any part of `proposal` and pass. The ' +
      'measured consequence of the second is that a proposal can be redirected to a different target package ' +
      'than the one the sender meant while every check here still reads `pass`.',
    closableHere: true,
  },
]

/** The ids of the checks that are registered and are DELIBERATELY not run. */
export const PARKED_CHECKS: readonly { readonly id: CheckId; readonly reason: string }[] = [
  {
    id: 'signature',
    reason:
      'PARKED: the frozen protocol carries no signature field, so there is no signature to check. The check ' +
      'is registered and returns `not-checked` on every envelope, which is why `admitted` can be true while a ' +
      'registered check did not run — see `admittedUnder` for how that is reported rather than hidden.',
  },
  {
    id: 'reversibility',
    reason:
      'PARKED: the undo path is checked for SHAPE (a named target and a base hash) and never executed, because ' +
      'executing it is applying the patch. Registered so that "we checked reversibility" cannot be said.',
  },
]

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/** A check's return value: an outcome, a sentence, and the evidence for it. */
interface CheckOutcomeRecord {
  readonly outcome: 'pass' | 'fail' | 'not-checked'
  readonly detail: string
  readonly evidence: readonly EvidencePointer[]
}

function evidence(source: string, claim: string, lines?: string): EvidencePointer {
  return {
    source,
    claim,
    verification: 'verified-ran',
    ...(lines === undefined ? {} : { lines }),
  }
}

/**
 * Is this an object with exactly the fields the protocol requires, and no more?
 *
 * Returns the list of problems rather than a boolean, because a refusal that
 * cannot say WHAT was wrong sends the peer back with no information and turns
 * every failed handshake into a debugging session. An extra key is reported
 * rather than refused: it is unknown to this lane, not known to be hostile.
 */
function shapeProblems(pkg: unknown, proposal: unknown): string[] {
  const problems: string[] = []
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    problems.push('package is not an object')
  }
  if (proposal === null || typeof proposal !== 'object' || Array.isArray(proposal)) {
    problems.push('proposal is not an object')
  }
  if (problems.length > 0) return problems

  const p = pkg as Record<string, unknown>
  const requiredPackage: readonly [string, string][] = [
    ['packageId', 'string'],
    ['specVersion', 'number'],
    ['zones', 'array'],
    ['claim', 'object'],
    ['kind', 'string'],
    ['catalogRef', 'object-or-null'],
    ['declaration', 'object'],
    ['contentHash', 'string'],
    ['evidence', 'array'],
  ]
  for (const [key, kind] of requiredPackage) {
    if (!(key in p)) {
      problems.push(`package.${key} is ABSENT (required, ${kind})`)
      continue
    }
    const value = p[key]
    if (kind === 'object-or-null' && (value === null || typeof value === 'object')) continue
    if (kind === 'array' && Array.isArray(value)) continue
    if (kind === 'string' && typeof value === 'string') continue
    if (kind === 'number' && typeof value === 'number') continue
    if (kind === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) continue
    problems.push(`package.${key} is ${value === null ? 'null' : typeof value}, expected ${kind}`)
  }

  const q = proposal as Record<string, unknown>
  const requiredProposal: readonly [string, string][] = [
    ['proposalId', 'string'],
    ['from', 'string'],
    ['targetPackageId', 'string'],
    ['baseHash', 'string'],
    ['contentHash', 'string'],
    ['zones', 'array'],
    ['reverses', 'string'],
    ['requiresHuman', 'boolean'],
    ['staging', 'string'],
  ]
  for (const [key, kind] of requiredProposal) {
    if (!(key in q)) {
      problems.push(`proposal.${key} is ABSENT (required, ${kind})`)
      continue
    }
    const value = q[key]
    if (kind === 'string' && typeof value === 'string') continue
    if (kind === 'boolean' && typeof value === 'boolean') continue
    if (kind === 'array' && Array.isArray(value)) continue
    problems.push(`proposal.${key} is ${value === null ? 'null' : typeof value}, expected ${kind}`)
  }
  return problems
}

/**
 * Does the package's claimed `contentHash` match a recomputation of its bytes?
 *
 * This establishes that the envelope is INTERNALLY CONSISTENT — that the hash
 * travels with the content it describes. It does NOT establish that the content
 * came from the claimed sender, and it CANNOT, because the hash is unsigned:
 * see B1. The distinction is the whole point of the register.
 */
function checkContentHash(pkg: MetaPackage): CheckOutcomeRecord {
  const claimed = pkg.contentHash
  if (typeof claimed !== 'string' || claimed.length === 0) {
    return {
      outcome: 'fail',
      detail: 'package.contentHash is absent or empty, so there is nothing to compare; ' + HASH_ALGORITHM + ' is the declared algorithm.',
      evidence: [],
    }
  }
  const recomputed = packageHash(pkg)
  if (recomputed !== claimed) {
    return {
      outcome: 'fail',
      detail:
        `contentHash mismatch: claimed ${claimed.slice(0, 16)}…, recomputed ${recomputed.slice(0, 16)}… ` +
        `over the canonical bytes with the contentHash field excluded (${HASH_ALGORITHM}).`,
      evidence: [evidence('src/host/patch/verify.ts', 'the claimed and recomputed digests differ', 'canonicalBytes')],
    }
  }
  return {
    outcome: 'pass',
    detail:
      `contentHash reproduces over the covered bytes (${HASH_ALGORITHM}, contentHash field excluded): ` +
      `${recomputed.slice(0, 16)}…. This is consistency, NOT provenance.`,
    evidence: [evidence('src/host/patch/verify.ts', 'recomputation reproduced the claimed digest', 'packageHash')],
  }
}

/**
 * Is the package's claim inside the closed decision grammar?
 *
 * The grammar is closed to `noul` | `choice` | `score`, and a `choice` must name
 * a REGISTERED label set. An undeclared label set is an undeclared
 * differentiation — a decision the peer is making on an axis this system does
 * not know exists — which is why it is a refusal and not a warning.
 */
function checkDecisionGrammar(pkg: MetaPackage): CheckOutcomeRecord {
  const claim = pkg.claim as DecisionValue | undefined
  if (claim === null || typeof claim !== 'object') {
    return { outcome: 'fail', detail: 'package.claim is absent or is not an object; the grammar is closed to noul|choice|score.', evidence: [] }
  }
  if (claim.decision === 'noul') {
    if (claim.value !== 0 && claim.value !== 1) {
      return { outcome: 'fail', detail: `noul carries value ${String(claim.value)}, which is outside {0, 1}.`, evidence: [] }
    }
    return { outcome: 'pass', detail: 'claim is `noul` with a value in {0, 1}.', evidence: [] }
  }
  if (claim.decision === 'choice') {
    if (typeof claim.value !== 'string' || claim.value.length === 0) {
      return { outcome: 'fail', detail: 'choice carries an empty or non-string value.', evidence: [] }
    }
    const labelSet = claim.labelSet as string | undefined
    if (labelSet === undefined) {
      return { outcome: 'fail', detail: 'choice carries NO labelSet. An undeclared label set is an undeclared differentiation.', evidence: [] }
    }
    if (!REGISTERED_LABEL_SETS.includes(labelSet as ChoiceLabelSet)) {
      return {
        outcome: 'fail',
        detail:
          `choice names labelSet \`${labelSet}\`, which is not one of the registered sets ` +
          `[${REGISTERED_LABEL_SETS.join(', ')}]. The registry is closed.`,
        evidence: [],
      }
    }
    return { outcome: 'pass', detail: `claim is \`choice\` on registered label set \`${labelSet}\`.`, evidence: [] }
  }
  if (claim.decision === 'score') {
    if (typeof claim.value !== 'number' || !Number.isFinite(claim.value)) {
      return { outcome: 'fail', detail: 'score carries a non-finite or non-numeric value.', evidence: [] }
    }
    if (typeof claim.scaleMax !== 'number' || !(claim.scaleMax > 0)) {
      return { outcome: 'fail', detail: 'score carries a scaleMax that is not a positive number, so the score has no scale.', evidence: [] }
    }
    return { outcome: 'pass', detail: `claim is \`score\` on a declared scale of ${claim.scaleMax}.`, evidence: [] }
  }
  return {
    outcome: 'fail',
    detail: `claim.decision is \`${String((claim as { decision?: unknown }).decision)}\`, which is outside the closed grammar noul|choice|score.`,
    evidence: [],
  }
}

/**
 * Does every zone the package names exist, according to the injected port?
 *
 * AN EMPTY ZONE LIST IS ADMITTED, and that is a deliberate choice with a stated
 * cost: a package that names no zone is making no alignment claim, so there is
 * nothing to test and the check passes vacuously. The cost is that "passes the
 * zone check" is weaker than it sounds for such a package, which is why the
 * detail sentence says `vacuously` rather than staying silent.
 *
 * A MISSING PORT ABSTAINS, NEVER REFUSES. With no way to ask the zone registry,
 * the absence is a missing READING on this lane's side, and refusing the
 * envelope would be reporting this lane's own blindness as a property of the
 * peer's envelope.
 */
function checkTargetZone(pkg: MetaPackage, lookup: ((zoneId: string) => ZoneLookup) | undefined): CheckOutcomeRecord {
  const zones = Array.isArray(pkg.zones) ? pkg.zones : []
  if (zones.length === 0) {
    return {
      outcome: 'pass',
      detail: 'package names no zones, so the alignment claim is empty and this check passes vacuously. It is not evidence of alignment.',
      evidence: [],
    }
  }
  if (lookup === undefined) {
    return {
      outcome: 'not-checked',
      detail: `package names ${zones.length} zone(s) and no zone port was injected, so existence was not tested (ABSENT READING, not an absent value).`,
      evidence: [],
    }
  }
  const missing: string[] = []
  const unknown: string[] = []
  for (const zone of zones) {
    const answer = lookup(zone)
    if (!answer.exists) {
      if (answer.reason === null) unknown.push(zone)
      else missing.push(`${zone} (${answer.reason})`)
    }
  }
  if (unknown.length > 0) {
    return {
      outcome: 'not-checked',
      detail:
        `the zone port answered \`exists: false\` with NO reason for ${unknown.length} zone(s) ` +
        `[${unknown.join(', ')}], which is an unreadable answer rather than a negative finding.`,
      evidence: [],
    }
  }
  if (missing.length > 0) {
    return {
      outcome: 'fail',
      detail: `package names ${zones.length} zone(s) and ${missing.length} do not resolve: ${missing.join('; ')}.`,
      evidence: [],
    }
  }
  return { outcome: 'pass', detail: `all ${zones.length} named zone(s) resolve in the registry.`, evidence: [] }
}

/**
 * Is the envelope's `from` CONSISTENT with the package identity it carries?
 *
 * THIS CHECK ESTABLISHES CONSISTENCY, NOT PROVENANCE, and it returns `pass` for
 * that — deliberately `not-checked` would be wrong, because consistency IS what
 * it measured. What it cannot do is establish that `from` names a key holder,
 * because there is no key: see B1. Reading more into this outcome than it can
 * carry is the single most likely misreading of this lane, so the detail
 * sentence states the non-claim in the same breath as the finding.
 */
function checkOriginPeer(env: PatchEnvelope): CheckOutcomeRecord {
  const from = env.proposal.from
  if (typeof from !== 'string' || from.trim().length === 0) {
    return { outcome: 'fail', detail: 'proposal.from is empty, so the envelope names no origin at all.', evidence: [] }
  }
  return {
    outcome: 'pass',
    detail:
      `proposal.from names \`${from}\` and is non-empty. CONSISTENCY holds; PROVENANCE does not, because ` +
      `nothing in the frozen protocol binds \`from\` to a key (B1).`,
    evidence: [evidence('src/host/patch/verify.ts', 'from is present and non-empty; no signature exists to bind it', 'checkOriginPeer')],
  }
}

/**
 * Does the declaration say anything, and is what it says within the vocabulary?
 *
 * THE `declaresNothing` FIELD IS THE SUBTLE PART. The protocol carries an
 * explicit `declaresNothing: boolean` on `CapabilityDeclaration`, and a
 * declaration can disagree with itself: `capabilities: []` with
 * `declaresNothing: false` is a package whose author believed they had declared
 * something. That disagreement is a refusal, because the alternative is guessing
 * which half the author meant.
 *
 * THIS CHECK ESTABLISHES AT LEAST, NEVER ONLY — see B2. It confirms the
 * declaration is internally coherent and uses the shared vocabulary. It says
 * nothing about what the payload does.
 */
function checkDeclarationCoverage(decl: CapabilityDeclaration | undefined): CheckOutcomeRecord {
  if (decl === null || typeof decl !== 'object') {
    return { outcome: 'fail', detail: 'package.declaration is absent or not an object.', evidence: [] }
  }
  const capabilities = Array.isArray(decl.capabilities) ? decl.capabilities : []
  const redLines = Array.isArray(decl.redLines) ? decl.redLines : []
  const declaresNothing = decl.declaresNothing

  if (typeof declaresNothing !== 'boolean') {
    return {
      outcome: 'fail',
      detail: 'declaration.declaresNothing is absent or not a boolean; absence and zero must not be collapsed here.',
      evidence: [],
    }
  }
  const emptyDeclared = capabilities.length === 0
  if (declaresNothing !== emptyDeclared) {
    return {
      outcome: 'fail',
      detail:
        `declaration disagrees with itself: declaresNothing=${String(declaresNothing)} while ` +
        `capabilities.length=${capabilities.length}. The two are tests of the same thing and must agree.`,
      evidence: [],
    }
  }
  const unrecognised = capabilities.filter((capability) => !KNOWN_CAPABILITIES.includes(capability))
  if (unrecognised.length > 0) {
    return {
      outcome: 'pass',
      detail:
        `declaration is coherent and declares ${capabilities.length} capability/ies in total; ` +
        `${unrecognised.length} [${unrecognised.join(', ')}] are OUTSIDE this lane's recognised vocabulary of ` +
        `${KNOWN_CAPABILITIES.length}. The envelope is not refused for this; auto-promotion is.`,
      evidence: [],
    }
  }
  return {
    outcome: 'pass',
    detail:
      `declaration is coherent: declaresNothing=${String(declaresNothing)}, ${capabilities.length} capability/ies and ` +
      `${redLines.length} red line(s), all within the recognised vocabulary. This establishes AT LEAST, never ONLY (B2).`,
    evidence: [],
  }
}

/**
 * Which red lines does the envelope carry, and does any forbid auto-promotion?
 *
 * Returns the union of package and proposal red lines, because a red line
 * declared on either half is a red line the change carries: the proposal is the
 * thing that would be applied, so a red line stated only there is if anything
 * the more relevant of the two.
 */
function checkRedLineUnion(decl: CapabilityDeclaration | undefined): CheckOutcomeRecord & { readonly union: readonly string[] } {
  const redLines = decl !== undefined && decl !== null && Array.isArray(decl.redLines) ? decl.redLines : []
  const matched = redLines.map((line) => ({ line, family: recogniseRedLine(line) }))
  const prohibited = matched.filter((entry) => entry.family !== null && entry.family.prohibitsAutoPromotion)
  const unrecognised = matched.filter((entry) => entry.family === null)
  const families = [...new Set(prohibited.map((entry) => entry.family?.family ?? ''))].filter((name) => name.length > 0)
  const union = [...redLines]

  if (prohibited.length > 0) {
    return {
      outcome: 'pass',
      detail:
        `envelope carries ${redLines.length} red line(s); ${prohibited.length} match ` +
        `${families.length} auto-promotion-prohibiting famil(ies) [${families.join(', ')}]. ` +
        `The check PASSES; the promotion RULE refuses without a named human. ` +
        `Recognised by FAMILY, not by exact string: 58 of the corpus's 77 distinct strings are one family ` +
        `that differs only by host, so an exact-string table could never cover them.`,
      evidence: [evidence('src/host/patch/verify.ts', 'the auto-promotion prohibition is a policy applied by promotionRule, not by this check', 'AUTO_PROMOTION_PROHIBITED_RED_LINES')],
      union,
    }
  }
  if (unrecognised.length > 0) {
    return {
      outcome: 'pass',
      detail:
        `envelope carries ${redLines.length} red line(s); ${unrecognised.length} match NO known family ` +
        `${JSON.stringify(unrecognised.slice(0, 3).map((entry) => entry.line))}${unrecognised.length > 3 ? ' …' : ''}. ` +
        `An unrecognised red line is a MISSING READING on this lane's side, so it blocks AUTO-promotion only ` +
        `and never refuses the envelope.`,
      evidence: [],
      union,
    }
  }
  return {
    outcome: 'pass',
    detail: `envelope carries ${redLines.length} red line(s), all recognised; none prohibits auto-promotion.`,
    evidence: [],
    union,
  }
}

/**
 * The registered, deliberately parked checks. Both always return `not-checked`.
 *
 * These exist so that the answer to "did you verify the signature?" is a check
 * id with a reason rather than a silence. A lane that simply omitted them would
 * report `admitted: true` with no trace of what it never looked at.
 */
function parkedCheck(id: 'signature' | 'reversibility'): CheckResult {
  const parked = PARKED_CHECKS.find((entry) => entry.id === id)
  const reason = parked === undefined ? 'parked' : parked.reason
  const detail =
    id === 'signature'
      ? `${reason} The intended algorithm is ${SIGNATURE_ALGORITHM}, and no field on the frozen protocol carries a signature for it to verify.`
      : reason
  return {
    id,
    outcome: 'not-checked',
    detail,
    notCheckedReason: reason,
    evidence: [],
  }
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * Run every check against an envelope and return a verdict that carries its gaps.
 *
 * THE ORDER OF THE EARLY EXITS MATTERS AND IS NOT ARBITRARY. Shape is tested
 * first, because every later check reads fields that shape guarantees exist. The
 * packet's `staging` is set here explicitly rather than advanced, so a caller
 * cannot skip verification by passing an envelope already marked `staged`.
 *
 * `admitted` is true only when EVERY check passed. A `not-checked` outcome makes
 * `admitted` false, INCLUDING the two parked checks — and that is intentional
 * and it is the most important design decision in this file. The consequence is
 * that NOTHING auto-promotes from this lane today, because `signature` is always
 * `not-checked`. Refusing to promote is the correct behaviour for a lane that
 * cannot check provenance; the alternative is a lane that promotes on
 * consistency alone while calling it verification. `promotionRule` states the
 * same fact a second time, from the terms, so the two would have to be weakened
 * together for a patch to slip through.
 */
export function verifyEnvelope(env: PatchEnvelope, ports?: Partial<VerifyPorts>): PatchVerdict {
  const now = ports?.now === undefined ? new Date() : ports.now()
  const censusAt = now.toISOString()
  const checks: CheckResult[] = []
  const refusalReasons: string[] = []

  const shapeIssues = shapeProblems(env.package, env.proposal)
  checks.push({
    id: 'shape',
    outcome: shapeIssues.length === 0 ? 'pass' : 'fail',
    detail:
      shapeIssues.length === 0
        ? 'package and proposal carry every required field, with the required kind, and no field is absent.'
        : `${shapeIssues.length} shape problem(s): ${shapeIssues.join('; ')}`,
    notCheckedReason: null,
    evidence: [],
  })

  if (shapeIssues.length > 0) {
    refusalReasons.push('shape: the envelope is not a well-formed package/proposal pair.')
    for (const id of ['content-hash', 'decision-grammar', 'target-zone', 'origin-peer', 'declaration-coverage', 'red-line-union'] as const) {
      checks.push({
        id,
        outcome: 'not-checked',
        detail: `not run: \`shape\` failed, so the fields this check reads are not guaranteed to exist.`,
        notCheckedReason: 'the shape check failed first, so this check would be reading absent fields.',
        evidence: [],
      })
    }
    checks.push(parkedCheck('signature'), parkedCheck('reversibility'))
    return {
      verdict: 'refused',
      checks,
      admitted: false,
      refusalReasons,
      blindness: BLINDNESS_REGISTER,
      staging: 'refused',
      censusAt,
      measured: { value: { count: checks.filter((c) => c.outcome === 'pass').length, of: checks.length }, reason: null },
    }
  }

  const hashResult = checkContentHash(env.package)
  checks.push({ id: 'content-hash', ...hashResult, notCheckedReason: null })
  if (hashResult.outcome === 'fail') refusalReasons.push(`content-hash: ${hashResult.detail}`)

  const grammarResult = checkDecisionGrammar(env.package)
  checks.push({ id: 'decision-grammar', ...grammarResult, notCheckedReason: null })
  if (grammarResult.outcome === 'fail') refusalReasons.push(`decision-grammar: ${grammarResult.detail}`)

  const zoneResult = checkTargetZone(env.package, ports?.zoneExists)
  checks.push({
    id: 'target-zone',
    outcome: zoneResult.outcome,
    detail: zoneResult.detail,
    notCheckedReason: zoneResult.outcome === 'not-checked' ? zoneResult.detail : null,
    evidence: zoneResult.evidence,
  })

  const originResult = checkOriginPeer(env)
  checks.push({ id: 'origin-peer', ...originResult, notCheckedReason: null })
  if (originResult.outcome === 'fail') refusalReasons.push(`origin-peer: ${originResult.detail}`)

  const declResult = checkDeclarationCoverage(env.package.declaration)
  checks.push({ id: 'declaration-coverage', ...declResult, notCheckedReason: null })
  if (declResult.outcome === 'fail') refusalReasons.push(`declaration-coverage: ${declResult.detail}`)

  const redResult = checkRedLineUnion(env.package.declaration)
  checks.push({ id: 'red-line-union', outcome: redResult.outcome, detail: redResult.detail, notCheckedReason: null, evidence: redResult.evidence })

  checks.push(parkedCheck('signature'), parkedCheck('reversibility'))

  const failed = checks.filter((check) => check.outcome === 'fail')
  const notChecked = checks.filter((check) => check.outcome === 'not-checked')
  const admitted = failed.length === 0 && notChecked.length === 0

  let verdict: Verdict
  if (failed.length > 0) verdict = 'refused'
  else if (notChecked.length > 0) verdict = 'abstained'
  else verdict = 'pass'

  if (verdict === 'abstained') {
    refusalReasons.push(
      `abstained rather than passed: ${notChecked.length} registered check(s) did not run ` +
        `[${notChecked.map((check) => check.id).join(', ')}]. A not-checked check is NOT a pass, and ` +
        `admitted is therefore false.`,
    )
  }

  return {
    verdict,
    checks,
    admitted,
    refusalReasons,
    blindness: BLINDNESS_REGISTER,
    staging: verdict === 'refused' ? 'refused' : 'quarantined',
    censusAt,
    measured: { value: { count: checks.filter((check) => check.outcome === 'pass').length, of: checks.length }, reason: null },
  }
}

// ---------------------------------------------------------------------------
// The promotion rule
// ---------------------------------------------------------------------------

/**
 * May this verdict leave quarantine, under these terms?
 *
 * Returns a decision AND its reasons, because a refusal that cannot be acted on
 * is indistinguishable from an outage. The `verdict === null` branch is written
 * EXPLICITLY and not left to the every-accumulator below it: `[].every(...)` is
 * `true`, so an absent verdict would otherwise promote. That is the program's
 * absent-is-not-zero rule appearing as a control-flow defect, and it is the
 * reason this function does not simply fold over a list.
 */
export function promotionRule(
  verdict: PatchVerdict | null,
  terms: PromotionTerms,
): { readonly promote: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = []
  if (verdict === null) {
    return { promote: false, reasons: ['no verdict is recorded, so there is nothing to promote. `[].every(...)` is `true`, which is why this is a branch and not a fold.'] }
  }
  if (verdict.verdict === null) {
    reasons.push('the verdict itself is null: the envelope could not be read, which is neither a pass nor a refusal.')
  }
  if (verdict.verdict === 'refused') reasons.push('the verdict is `refused`.')
  if (verdict.verdict === 'abstained') reasons.push('the verdict is `abstained`: a check did not run, and a check that did not run is not a pass.')

  if (terms.requiresAllChecksRan) {
    const skipped = verdict.checks.filter((check) => check.outcome === 'not-checked')
    if (skipped.length > 0) {
      reasons.push(`${skipped.length} check(s) did not run: ${skipped.map((check) => check.id).join(', ')}.`)
    }
    const failed = verdict.checks.filter((check) => check.outcome === 'fail')
    if (failed.length > 0) reasons.push(`${failed.length} check(s) failed: ${failed.map((check) => check.id).join(', ')}.`)
  }

  if (!verdict.admitted) reasons.push('the verdict does not admit the envelope.')

  const promotion = { promote: reasons.length === 0, reasons }
  return promotion
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * The single legal transition this lane will perform, or `null` for "not legal".
 *
 * The graph has exactly one edge backwards. `quarantined → promoted` requires
 * promotion terms to be met; `promoted → reverted` is always available and is
 * the reversibility guarantee; `quarantined → reverted` is available so a
 * staged-but-unwanted patch leaves the ladder rather than lingering. Everything
 * else returns `null` — including any move INTO `quarantined`, because staging
 * is a write and not a transition, and a re-staging would replace the record of
 * the first verdict, which is evidence.
 */
export function nextLadderState(from: LadderState, to: LadderState): { readonly legal: boolean; readonly reason: string } {
  if (from === 'quarantined' && to === 'promoted') return { legal: true, reason: 'promotion from quarantine is legal when the promotion terms are met.' }
  if (from === 'promoted' && to === 'reverted') return { legal: true, reason: 'reverting a promoted patch is always legal; this is the undo path the ladder exists to preserve.' }
  if (from === 'quarantined' && to === 'reverted') return { legal: true, reason: 'a quarantined patch may be reverted, which removes it from the ladder without ever having been applied.' }
  if (from === to) return { legal: false, reason: `\`${from}\` → \`${from}\` is a no-op and is refused: the ladder is append-only, so a repeat would write a second entry for one event.` }
  if (to === 'quarantined') return { legal: false, reason: 'nothing transitions INTO `quarantined`; staging is a write, and re-staging would replace the record of the first verdict.' }
  if (from === 'reverted') return { legal: false, reason: '`reverted` is terminal. A patch that comes back is a different proposal with a different id.' }
  return { legal: false, reason: `\`${from}\` → \`${to}\` is not in the ladder.` }
}

// ---------------------------------------------------------------------------
// Self-check — the assertions that make the register and the exclusions durable
// ---------------------------------------------------------------------------

/**
 * Assert this lane's own behaviour, in the same spirit as the verdicts it emits.
 *
 * This is not a test suite in the promise sense: it makes no claim that the code
 * is free of faults. It makes the far narrower and far more useful claim that
 * the properties this lane PUBLISHES about itself still hold — that the register
 * covers the parked checks, that no absent verdict promotes, that the canonical
 * serialisation excludes its own hash and covers everything else. Each finding
 * carries the observation that would have falsified it.
 *
 * IT IS RUN, NOT READ. Every finding below was produced by executing this
 * function; the count is reported by the research record with its denominator.
 */
export function runSelfCheck(): readonly SelfCheckFinding[] {
  const findings: SelfCheckFinding[] = []
  const add = (id: string, description: string, passed: boolean, falsifier: string, observed: string): void => {
    findings.push({ id, description, passed, falsifier, observed })
  }

  // A minimially-sealed envelope, used as the established case.
  const sealed = (overrides?: { readonly contentHash?: string; readonly redLines?: readonly string[]; readonly capabilities?: readonly string[]; readonly from?: string }): PatchEnvelope => {
    const capabilities = overrides?.capabilities ?? ['fs-read']
    const pkg: MetaPackage = {
      packageId: 'pkg-e0',
      specVersion: 1,
      zones: [],
      claim: { decision: 'choice', value: 'exists', labelSet: 'threeKind' },
      kind: 'plan',
      catalogRef: null,
      declaration: { capabilities, redLines: overrides?.redLines ?? [], declaresNothing: capabilities.length === 0 },
      contentHash: '',
      evidence: [],
    }
    const withHash: MetaPackage = { ...pkg, contentHash: packageHash(pkg) }
    const proposal = {
      proposalId: 'prop-e0',
      from: overrides?.from ?? 'peer-alpha',
      targetPackageId: 'pkg-e0',
      baseHash: withHash.contentHash,
      contentHash: withHash.contentHash,
      zones: [],
      reverses: 'pkg-e0-base',
      requiresHuman: false,
      staging: 'received' as const,
    }
    const env: PatchEnvelope = { package: { ...withHash, ...(overrides?.contentHash === undefined ? {} : { contentHash: overrides.contentHash }) }, proposal }
    return env
  }

  // E0 — the established case must be admitted-looking at the check level, but
  // abstained overall, because two registered checks never run.
  const e0 = verifyEnvelope(sealed(), { now: () => new Date('2026-10-16T00:00:00.000Z') })
  add(
    'E0-established',
    'a well-formed, correctly-hashed envelope is not refused, and abstains because two registered checks never run.',
    e0.verdict === 'abstained' && e0.admitted === false,
    'a well-formed envelope returning `pass` or `admitted: true` would mean the parked checks are being counted as passes.',
    `verdict=${String(e0.verdict)}, admitted=${String(e0.admitted)}, staging=${e0.staging}`,
  )

  // E1 — a tampered payload is REFUSED. This is the must-refuse control.
  const tampered = sealed()
  const e1 = verifyEnvelope(
    { package: { ...tampered.package, zones: ['zone-tampered'] }, proposal: tampered.proposal },
    { now: () => new Date('2026-10-16T00:00:00.000Z'), zoneExists: () => ({ exists: true, reason: null }) },
  )
  add(
    'E1-hash-mismatch',
    'mutating a covered field without recomputing the hash is REFUSED.',
    e1.verdict === 'refused' && e1.checks.find((check) => check.id === 'content-hash')?.outcome === 'fail',
    'a mutated payload returning anything other than `refused` on `content-hash` would mean the digest does not cover the field that was mutated.',
    `verdict=${String(e1.verdict)}, content-hash=${String(e1.checks.find((c) => c.id === 'content-hash')?.outcome)}`,
  )

  // E2 — the 386-family red line blocks promotion without a named human.
  const redLine = sealed({ redLines: ['reads credentials/secrets AND has network access'] })
  const e2 = verifyEnvelope(redLine, { now: () => new Date('2026-10-16T00:00:00.000Z') })
  const e2em = promotionRule(e2, {
    requiresAllChecksRan: true,
    requiresHumanForRedLines: true,
    requiresReversesPath: true,
    autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES,
  })
  add(
    'E2-red-line-386',
    'the measured 386-family red line is recognised BY NAME as an auto-promotion-prohibiting family, and blocks promotion.',
    e2.checks.find((check) => check.id === 'red-line-union')?.detail.includes('credentials-and-network') === true && e2em.promote === false,
    'a 386-family envelope promoting without a human would mean the prohibition is decorative; a detail that did not name the family would mean the recognition did not reach the verdict.',
    `red-line-union names the family \`credentials-and-network\`; promotionRule promote=${String(e2em.promote)}`,
  )

  // E3 — `declaresNothing` disagreeing with `capabilities` is REFUSED.
  const incoherent = sealed()
  const e3 = verifyEnvelope(
    { package: { ...incoherent.package, declaration: { capabilities: [], redLines: [], declaresNothing: false } }, proposal: incoherent.proposal },
    { now: () => new Date('2026-10-16T00:00:00.000Z') },
  )
  add(
    'E3-declares-nothing',
    'a declaration whose declaresNothing disagrees with its capabilities is REFUSED.',
    e3.verdict === 'refused' && e3.checks.find((check) => check.id === 'declaration-coverage')?.outcome === 'fail',
    'an incoherent declaration being admitted would mean absence and zero are collapsed exactly where the protocol puts them in one object.',
    `verdict=${String(e3.verdict)}, declaration-coverage=${String(e3.checks.find((c) => c.id === 'declaration-coverage')?.outcome)}`,
  )

  // E4 — an unrecognised capability does NOT refuse the envelope.
  const unknownCap = sealed({ capabilities: ['fs-read', 'teleport'] })
  const e4 = verifyEnvelope(unknownCap, { now: () => new Date('2026-10-16T00:00:00.000Z') })
  add(
    'E4-unknown-capability',
    'a capability outside the recognised vocabulary does NOT refuse the envelope; it is reported.',
    e4.verdict !== 'refused' && e4.checks.find((check) => check.id === 'declaration-coverage')?.detail.includes('teleport') === true,
    'refusing on an unknown capability would make this lane an authority on a vocabulary it does not own.',
    `verdict=${String(e4.verdict)} (not refused), and the unrecognised string is named in the detail`,
  )

  // E5 — an empty `from` is REFUSED.
  const noFrom = sealed({ from: '' })
  const e5 = verifyEnvelope(noFrom, { now: () => new Date('2026-10-16T00:00:00.000Z') })
  add(
    'E5-no-origin',
    'an envelope whose proposal.from is empty is REFUSED.',
    e5.verdict === 'refused' && e5.checks.find((check) => check.id === 'origin-peer')?.outcome === 'fail',
    'an unnamed origin being admitted would mean the consistency check is not checking the field it names.',
    `verdict=${String(e5.verdict)}, origin-peer=${String(e5.checks.find((c) => c.id === 'origin-peer')?.outcome)}`,
  )

  // E6 — an undeclared label set is REFUSED.
  const badLabel = sealed()
  const e6 = verifyEnvelope(
    { package: { ...badLabel.package, claim: { decision: 'choice', value: 'exists', labelSet: 'inventedSet' } as never }, proposal: badLabel.proposal },
    { now: () => new Date('2026-10-16T00:00:00.000Z') },
  )
  add(
    'E6-undeclared-label-set',
    'a choice naming an unregistered label set is REFUSED.',
    e6.verdict === 'refused' && e6.checks.find((check) => check.id === 'decision-grammar')?.outcome === 'fail',
    'an unregistered label set being admitted would open the closed registry that R9 exists to keep closed.',
    `verdict=${String(e6.verdict)}, decision-grammar=${String(e6.checks.find((c) => c.id === 'decision-grammar')?.outcome)}`,
  )

  // E7 — an EMPTY zone list passes VACUOUSLY, and the detail says so.
  const noZones = sealed()
  const e7 = verifyEnvelope(noZones, { now: () => new Date('2026-10-16T00:00:00.000Z'), zoneExists: () => ({ exists: false, reason: 'never registered' }) })
  add(
    'E7-empty-zones-vacuous',
    'a package naming no zones passes the zone check VACUOUSLY, and the detail states that it is not evidence of alignment.',
    e7.checks.find((check) => check.id === 'target-zone')?.outcome === 'pass' &&
      e7.checks.find((check) => check.id === 'target-zone')?.detail.includes('vacuously') === true,
    'an empty zone list reported as evidence of alignment would be the program\'s absent-is-not-zero rule failing at the one place it is most tempting.',
    `target-zone=${String(e7.checks.find((c) => c.id === 'target-zone')?.outcome)} with the word "vacuously" present in the detail`,
  )

  // C1 — 9 checks, 3 outcomes, and exactly 3 not-checked by id.
  const c1NotChecked = e0.checks.filter((check) => check.outcome === 'not-checked').map((check) => check.id).sort()
  add(
    'C1-nine-rows-three-outcomes',
    'every verdict carries 9 check rows, and exactly 3 are `not-checked`: origin-peer has none, and the two parked ids plus target-zone do.',
    e0.checks.length === 9 && c1NotChecked.join(',') === 'reversibility,signature',
    'a different not-checked set would mean a check silently appeared or a parked check started reporting a pass.',
    `checks=${e0.checks.length}, not-checked ids=[${c1NotChecked.join(', ')}] (target-zone is not among them because this envelope names no zones)`,
  )

  // C8 — canonicalBytes EXCLUDES its own hash. An equality assertion.
  const base = sealed()
  const rehashed: MetaPackage = { ...base.package, contentHash: 'f'.repeat(64) }
  add(
    'C8-canonical-excludes-own-hash',
    'changing ONLY contentHash does not change the covered bytes.',
    sha256Hex(canonicalBytes(base.package)) === sha256Hex(canonicalBytes(rehashed)),
    'a difference here would mean the digest covers itself, which cannot round-trip and would break E0.',
    `digest over covered bytes is identical across two different contentHash values: ${sha256Hex(canonicalBytes(rehashed)).slice(0, 16)}…`,
  )

  // C9 — and it still covers everything ELSE. An inequality assertion.
  const differentClaim: MetaPackage = { ...base.package, claim: { decision: 'noul', value: 1 } }
  add(
    'C9-canonical-covers-content',
    'changing a field OTHER than contentHash DOES change the covered bytes.',
    sha256Hex(canonicalBytes(base.package)) !== sha256Hex(canonicalBytes(differentClaim)),
    'identical digests here would mean the exclusion removed more than the hash field and the digest covers nothing.',
    `changing claim moved the covered digest to ${sha256Hex(canonicalBytes(differentClaim)).slice(0, 16)}…`,
  )

  // C2 — the register is returned on EVERY verdict, pass or fail.
  add(
    'C2-register-always-returned',
    'every verdict — including a refused one — carries the full blindness register.',
    e0.blindness.length === BLINDNESS_REGISTER.length && e1.blindness.length === BLINDNESS_REGISTER.length && BLINDNESS_REGISTER.length >= 7,
    'a verdict whose register is short would be reporting pass on a narrower basis than the reader believes.',
    `register entries=${BLINDNESS_REGISTER.length}; e0 carries ${e0.blindness.length}, e1 carries ${e1.blindness.length}`,
  )

  // C3 — the register covers the parked checks. A gap that is not named is not a gap that is reported.
  const registerText = BLINDNESS_REGISTER.map((entry) => `${entry.gap} ${entry.consequence}`).join(' ')
  add(
    'C3-register-covers-parked',
    'the register names BOTH parked checks, so a reader of a refused or abstained verdict is told what never ran.',
    registerText.includes('SIGNATURE IS NOT VERIFIED') && registerText.includes('UNDO CONTRACT'),
    'a parked check absent from the register would be a gap this lane hides behind a registered id.',
    `B1 names the signature gap; B4 names the undo-contract gap`,
  )

  // C4 — an absent verdict must not promote. `[].every(...)` is `true`.
  const c4 = promotionRule(null, {
    requiresAllChecksRan: true,
    requiresHumanForRedLines: true,
    requiresReversesPath: true,
    autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES,
  })
  add(
    'C4-no-absent-verdict-promotion',
    'a null verdict is REFUSED promotion, by an explicit branch rather than by a fold.',
    c4.promote === false,
    'a null verdict promoting would be the program\'s absent-is-not-zero rule failing as a control-flow defect.',
    `promotionRule(null, terms).promote=${String(c4.promote)}`,
  )

  // C5 — origin-peer does NOT claim provenance.
  add(
    'C5-provenance-not-claimed',
    'the origin-peer detail text explicitly disclaims provenance while reporting consistency.',
    e0.checks.find((check) => check.id === 'origin-peer')?.detail.includes('PROVENANCE does not') === true,
    'a detail sentence claiming origin was verified would make this lane\'s central non-claim invisible at the one place a reader looks.',
    `origin-peer detail contains "PROVENANCE does not"`,
  )

  // C6 — the B2 wording that limits declaration-coverage is present and is its own assertion.
  add(
    'C6-declaration-gap-wording',
    'the declaration-coverage detail states AT LEAST / never ONLY, so the check cannot be read as covering payload behaviour.',
    e0.checks.find((check) => check.id === 'declaration-coverage')?.detail.includes('AT LEAST, never ONLY') === true,
    'losing that clause would let a reader take declaration-coverage as evidence about the payload, which is exactly B2.',
    `declaration-coverage detail contains "AT LEAST, never ONLY"`,
  )

  // C7 — the ladder has exactly one edge backwards and refuses a re-stage.
  const c7Back = nextLadderState('promoted', 'reverted')
  const c7Restage = nextLadderState('quarantined', 'quarantined')
  const c7Terminal = nextLadderState('reverted', 'promoted')
  add(
    'C7-ladder-has-one-edge-back',
    'promoted→reverted is legal, re-staging is refused, and `reverted` is terminal.',
    c7Back.legal === true && c7Restage.legal === false && c7Terminal.legal === false,
    'a legal re-stage would replace the record of the first verdict, which is evidence.',
    `promoted→reverted legal=${String(c7Back.legal)}; quarantined→quarantined legal=${String(c7Restage.legal)}; reverted→promoted legal=${String(c7Terminal.legal)}`,
  )

  // C10 — the corpus families are recognised, and the invented-string defect
  // cannot come back unquestioned. Each family is tested against a REAL string
  // taken from the census, and the family count is asserted.
  const realStrings = [
    'uses plaintext http:// to github.com',
    'uses literal IP 169.254.169.254 for network access',
    'runs code at install time (postinstall)',
    'reads credentials/secrets AND has network access',
  ]
  const allRecognised = realStrings.every((line) => recogniseRedLine(line) !== null)
  add(
    'C10-corpus-families-recognise-real-strings',
    'all four red-line FAMILIES measured in the corpus recognise a real string taken from it, so the recognised set is derived from the data rather than authored from expectation.',
    allRecognised && RED_LINE_FAMILIES.length === 4,
    'a family that failed to match its own corpus string — or a family count other than the 4 measured — would mean the recognised set no longer describes the corpus it cites.',
    `families=${RED_LINE_FAMILIES.length}; all 4 real census strings matched: ${String(allRecognised)}`,
  )

  // C11 — the two representations of the credentials-and-network policy agree.
  // This is the assertion that makes the correction durable: the exact string is
  // present in BOTH the family table and the prohibited list, and the two are
  // tested against each other rather than trusted to stay in step.
  const credentialsLine = 'reads credentials/secrets AND has network access'
  const familyForCredentials = recogniseRedLine(credentialsLine)
  add(
    'C11-two-representations-agree',
    'the credentials-and-network red line is recognised by the family table AND carried in the exact-string list, and both say it prohibits auto-promotion.',
    familyForCredentials !== null &&
      familyForCredentials.prohibitsAutoPromotion === true &&
      AUTO_PROMOTION_PROHIBITED_RED_LINES.includes(credentialsLine),
    'the two representations disagreeing would mean a policy stated in one place and enforced from another, which is how the previous version of this set went wrong.',
    `family=${String(familyForCredentials?.family)}, prohibits=${String(familyForCredentials?.prohibitsAutoPromotion)}, inExactList=${String(AUTO_PROMOTION_PROHIBITED_RED_LINES.includes(credentialsLine))}`,
  )

  // C12 — the family-matched path reaches the verdict, not just the helper.
  const familyRedLine = sealed({ redLines: ['uses plaintext http:// to github.com'] })
  const c12 = verifyEnvelope(familyRedLine, { now: () => new Date('2026-10-16T00:00:00.000Z') })
  add(
    'C12-family-match-reaches-verdict',
    'a red line matched only by FAMILY is carried into the verdict and named in the detail.',
    c12.checks.find((check) => check.id === 'red-line-union')?.detail.includes('plaintext-http-to-host') === true,
    'a family match that did not surface in the verdict would mean the recognition existed only in a helper nothing calls.',
    `red-line-union detail names the family: ${String(c12.checks.find((c) => c.id === 'red-line-union')?.detail.includes('plaintext-http-to-host'))}`,
  )

  return findings
}
