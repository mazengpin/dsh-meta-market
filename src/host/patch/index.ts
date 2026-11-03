/**
 * L4 — patch distribution: the lane's public surface.
 *
 * This file is the ONLY module in the lane that a consumer should import by
 * directory, and it exists so that the surface is a deliberate list rather than
 * whatever the filesystem happens to expose. Everything re-exported here is
 * either a type a consumer must name to call the lane, or a function the host
 * assembly calls to register it.
 *
 * THE ONE FACT THIS MODULE EXISTS TO STATE PLAINLY, and it is stated as a value
 * in `LANE_SUMMARY` rather than only in prose: THE LANE APPLIES NOTHING. There
 * is no code path in `src/host/patch/` that writes to a live market, executes a
 * reversal, or mutates a running system. `stage` writes to a quarantine
 * directory; `revert` appends a ladder entry. Both are deliberate, and both are
 * the reason a peer's envelope cannot reach the market directly.
 *
 * The second fact, which is the more important one and the more uncomfortable:
 * SIGNATURE VERIFICATION IS REGISTERED AND NEVER RUNS. See `headlineGap`.
 *
 * Three kinds, never flattened: this lane is `kind: 'plan'` — it is built, it
 * typechecks, it has run its own assertions, and it has NEVER been exercised by
 * a live peer against a real market. Calling it `exists` would claim a maturity
 * it does not have; calling it `future` would erase work that is on disk.
 */

import { PATCH_ROUTES, describeLane, dispatch, DEFAULT_PROMOTION_TERMS } from './routes.ts'
import {
  AUTO_PROMOTION_PROHIBITED_RED_LINES,
  BLINDNESS_REGISTER,
  HASH_ALGORITHM,
  KNOWN_CAPABILITIES,
  PARKED_CHECKS,
  RED_LINE_FAMILIES,
  RED_LINE_CENSUS,
  recogniseRedLine,
  REGISTERED_LABEL_SETS,
  SIGNATURE_ALGORITHM,
  canonicalBytes,
  canonicalJson,
  nextLadderState,
  packageHash,
  promotionRule,
  runSelfCheck,
  sha256Hex,
  verifyEnvelope,
} from './verify.ts'
import { ENVELOPE_FILENAME, QUARANTINE_REL, RECORD_FILENAME, census, quarantineRoot, read, resolveWorkspaceRoot, revert, sealEnvelope, stage } from './quarantine.ts'

// ---------------------------------------------------------------------------
// The lane summary — what a landing page renders and what a verifier checks
// ---------------------------------------------------------------------------

/**
 * What this lane is, in the terms the program requires of every lane.
 *
 * `kind` is `'plan'`, not `'exists'`, and the distinction is load-bearing rather
 * than modest. See the file header.
 */
export const LANE_SUMMARY = {
  id: 'L4',
  name: 'Patch distribution, verification, and reversibility',
  kind: 'plan' as const,
  /** Stated as a value because it is the guarantee the whole lane exists to give. */
  appliesAnything: false,
  /**
   * The honest headline. This is the string a reader should see before any
   * `pass` this lane ever returns.
   */
  headlineGap:
    'SIGNATURE IS NOT VERIFIED, AND NEVER WAS: the frozen protocol declares no signature field on MetaPackage ' +
    'or PatchProposal at all, so contentHash is unsigned and unbound to proposal.from. A relay that is itself an ' +
    'admitted peer can rewrite package and proposal, recompute the hash, and pass every check. An admitted ' +
    'envelope is one this lane has INSPECTED, never one it has PROVEN.',
  /** How many routes this lane contributes, counted from the table rather than written down. */
  routeCount: PATCH_ROUTES.length,
  /** How many checks run per verdict, split into the ones that run and the ones that do not. */
  checks: {
    registered: 9,
    run: 9 - PARKED_CHECKS.length,
    parked: PARKED_CHECKS.length,
  },
  /** The register is published as a count so that a shrinking register is visible from outside. */
  blindnessEntries: BLINDNESS_REGISTER.length,
  hashAlgorithm: HASH_ALGORITHM,
  signatureAlgorithm: SIGNATURE_ALGORITHM,
} as const

// ---------------------------------------------------------------------------
// Re-exports — types
// ---------------------------------------------------------------------------

export type {
  CheckId,
  CheckOutcome,
  CheckResult,
  BlindnessEntry,
  LadderEntry,
  LadderState,
  PatchEnvelope,
  PatchVerdict,
  PromotionTerms,
  QuarantineRecord,
  SelfCheckFinding,
  Sha256Hex,
  StoreOutcome,
  VerifyPorts,
  ZoneLookup,
} from './types.ts'

export type { ReadOutcome, QuarantineCensus } from './quarantine.ts'
export type { RouteRequest, RouteResponse, RouteRow } from './routes.ts'

// ---------------------------------------------------------------------------
// Re-exports — values
// ---------------------------------------------------------------------------

export { PATCH_ROUTES, describeLane, dispatch, DEFAULT_PROMOTION_TERMS }

export {
  AUTO_PROMOTION_PROHIBITED_RED_LINES,
  BLINDNESS_REGISTER,
  HASH_ALGORITHM,
  KNOWN_CAPABILITIES,
  PARKED_CHECKS,
  RED_LINE_FAMILIES,
  RED_LINE_CENSUS,
  recogniseRedLine,
  REGISTERED_LABEL_SETS,
  SIGNATURE_ALGORITHM,
  canonicalBytes,
  canonicalJson,
  nextLadderState,
  packageHash,
  promotionRule,
  runSelfCheck,
  sha256Hex,
  verifyEnvelope,
}

export {
  ENVELOPE_FILENAME,
  QUARANTINE_REL,
  RECORD_FILENAME,
  census,
  quarantineRoot,
  read,
  resolveWorkspaceRoot,
  revert,
  sealEnvelope,
  stage,
}

// ---------------------------------------------------------------------------
// A convenience view, for a reader that has a directory listing and no verdict
// ---------------------------------------------------------------------------

/**
 * What this lane exports, counted.
 *
 * A module surface that is described in prose drifts from the module; one that
 * is counted does not. This exists so that the research record can state the
 * size of the surface with a method beside it, and so that a later edit that
 * removes an export is visible as a changed number rather than as a silently
 * narrower API.
 */
export function surfaceCensus(): {
  readonly routeCount: number
  readonly routePaths: readonly string[]
  readonly methods: readonly string[]
  readonly checkIds: readonly string[]
  readonly parkedCheckIds: readonly string[]
  readonly blindnessIds: readonly string[]
} {
  return {
    routeCount: PATCH_ROUTES.length,
    routePaths: PATCH_ROUTES.map((row) => row.path),
    methods: [...new Set(PATCH_ROUTES.flatMap((row) => row.methods))].sort(),
    checkIds: ['shape', 'content-hash', 'decision-grammar', 'target-zone', 'origin-peer', 'declaration-coverage', 'red-line-union', 'signature', 'reversibility'],
    parkedCheckIds: PARKED_CHECKS.map((entry) => entry.id),
    blindnessIds: BLINDNESS_REGISTER.map((entry) => entry.id),
  }
}
