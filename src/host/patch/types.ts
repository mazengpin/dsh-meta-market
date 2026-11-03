/**
 * L4 — patch distribution: the types this lane OWNS, and the ones it borrows.
 *
 * The split is deliberate and it is the first thing to know about this file.
 * Anything frozen by the charter is RE-EXPORTED from `../../shared/protocol.ts`
 * and never redefined here: a second definition of `MetaPackage` is a second
 * truth about what a package is, and the two would drift on the first edit.
 * Anything this lane invents — the check registry, the verdict wrapper, the
 * blindness register, the ladder — is owned here, because nobody else may
 * change it without changing this lane.
 *
 * WHY THE BORROWED NAMES ARE RE-EXPORTED RATHER THAN RE-DECLARED. A consumer
 * that already imports `PatchProposal` from the protocol expects to be able to
 * import it from here too, and to get THE SAME TYPE. Re-declaring it structurally
 * identical would satisfy the compiler and break the guarantee, because a later
 * protocol edit would silently stop applying to this lane's consumers.
 */

import type {
  CapabilityDeclaration,
  CatalogReference,
  EvidencePointer,
  Maybe,
  Measured,
  MetaPackage,
  PatchProposal,
  PatchStaging,
  ThreeKind,
  Verdict,
  Verification,
  VerdictRecord,
  Confidence,
} from '../../shared/protocol.ts'

// ---------------------------------------------------------------------------
// Borrowed — re-exported so a consumer has one import site and one definition.
// ---------------------------------------------------------------------------

export type {
  CapabilityDeclaration,
  CatalogReference,
  Confidence,
  EvidencePointer,
  Maybe,
  Measured,
  MetaPackage,
  PatchProposal,
  PatchStaging,
  ThreeKind,
  Verdict,
  Verification,
  VerdictRecord,
}

// ---------------------------------------------------------------------------
// Owned — hashing
// ---------------------------------------------------------------------------

/** A lowercase hex SHA-256 digest. Branded nowhere, because a brand cannot be checked at a route. */
export type Sha256Hex = string

/**
 * The hash algorithm, recorded as a value rather than assumed.
 *
 * A digest with no named algorithm cannot be verified by a party that has only
 * the digest, so the algorithm is part of the verdict rather than the lore
 * around it. Changing this is a migration, not an edit.
 */
export const HASH_ALGORITHM = 'sha256' as const

/**
 * The signature algorithm this lane WOULD verify, and it is `null` ON PURPOSE.
 *
 * THIS CONSTANT NAMES AN ABSENCE, AND IT IS `null` SO THAT IT CANNOT BE MISTAKEN
 * FOR A WORKING ALGORITHM. Typing `'ed25519'` here would assert a capability the
 * deployment does not have: the frozen protocol declares no signature field at
 * all, `~/.dsh/.anonymous-user-id` is a bare 37-byte UUID, and a grep for
 * `ed25519|generateKeyPair|createSign|createVerify` matches 0 of 0 non-test
 * source files. The build holds an IDENTIFIER and no KEY.
 *
 * The consequence is a compile-time guarantee rather than a comment: a consumer
 * that branches on `SIGNATURE_ALGORITHM !== null` cannot write a code path that
 * pretends a signature was verified, because under this constant that branch is
 * unreachable and TypeScript knows it. See blindness entry B1 for the finding
 * this encodes.
 */
export const SIGNATURE_ALGORITHM: null = null

// ---------------------------------------------------------------------------
// Owned — the check registry
// ---------------------------------------------------------------------------

/**
 * The outcome of ONE check. Three values, and the third is the point.
 *
 * `not-checked` is not a synonym for `pass` and it is not a synonym for `fail`.
 * It means the check did not run, for a stated reason, and the reason travels
 * beside it. Collapsing it into either neighbour is the defect this type exists
 * to make unwritable — a check that could not run is not evidence that the thing
 * it would have checked is good.
 */
export type CheckOutcome = 'pass' | 'fail' | 'not-checked'

/**
 * The closed set of check identifiers.
 *
 * Closed on purpose. A check that can be added by writing a string is a check
 * that can be added without appearing in the blindness register, and the
 * register's whole value is that it is complete and enumerable. Adding a check
 * means editing this union, which means editing the register, which means the
 * self-check notices.
 */
export type CheckId =
  | 'shape'
  | 'content-hash'
  | 'decision-grammar'
  | 'target-zone'
  | 'origin-peer'
  | 'declaration-coverage'
  | 'red-line-union'
  | 'signature'
  | 'reversibility'

/**
 * What one check found, including the reason when it did not run.
 *
 * `detail` is a sentence a reader can act on, not a code. `evidence` carries the
 * pointers that support the outcome, which may be empty for a check that
 * established something by arithmetic rather than by citation.
 */
export interface CheckResult {
  readonly id: CheckId
  readonly outcome: CheckOutcome
  /** One line stating what was compared, in the form a reader can re-run. */
  readonly detail: string
  /**
   * Why the check did not run. Required in practice when `outcome` is
   * `not-checked` and forbidden to be a restatement of "it failed".
   */
  readonly notCheckedReason: string | null
  readonly evidence: readonly EvidencePointer[]
}

// ---------------------------------------------------------------------------
// Owned — the blindness register
// ---------------------------------------------------------------------------

/**
 * One thing this lane does NOT check, stated where the verdict can carry it.
 *
 * Every entry is returned on EVERY verdict, pass or fail. That is the design:
 * a gap that is reported only when it is inconvenient is a gap that is reported
 * never, and a reader who sees `pass` must also see what `pass` did not cover.
 */
export interface BlindnessEntry {
  /** Stable identifier, cited by the research record and by decisions. */
  readonly id: string
  /** One line naming the gap. */
  readonly gap: string
  /**
   * The concrete consequence — what an adversary or an accident can do BECAUSE
   * of this gap. A gap with no stated consequence is not yet a finding.
   */
  readonly consequence: string
  /**
   * `true` when this lane could close the gap with a change to its own code,
   * `false` when closing it requires a change to the frozen protocol or a
   * capability the deployment does not have. The distinction decides who owns
   * the fix and it is the reason the entry is not a single sentence.
   */
  readonly closableHere: boolean
}

// ---------------------------------------------------------------------------
// Owned — the verdict this lane returns
// ---------------------------------------------------------------------------

/**
 * The lane's verdict, wrapping the protocol's `Verdict` with what this lane adds.
 *
 * `blindness` is REQUIRED, not optional. An optional blindness field is one a
 * caller can omit, and an omitted blindness register reads exactly like a clean
 * bill of health. Requiring it means every construction site must say what it
 * did not check, and there is no construction site that can say nothing.
 */
export interface PatchVerdict {
  /** `null` when the envelope could not be read at all — which is not `refused`. */
  readonly verdict: Verdict | null
  readonly checks: readonly CheckResult[]
  /** `true` only when every applicable check passed AND none is `not-checked`. */
  readonly admitted: boolean
  /** Why it was refused or abstained, in the order the checks were applied. */
  readonly refusalReasons: readonly string[]
  readonly blindness: readonly BlindnessEntry[]
  readonly staging: PatchStaging
  /** When the verdict was computed. A verdict with no census cannot be aged. */
  readonly censusAt: string
  /** What was measured, if anything. `null` value with a reason when nothing was. */
  readonly measured: Maybe<Measured>
}

// ---------------------------------------------------------------------------
// Owned — the ladder
// ---------------------------------------------------------------------------

/**
 * Where a patch stands. Four states, and the transition graph has exactly one
 * edge backwards.
 *
 * `reverted` is reachable from `promoted` and from `staged`, which is the point:
 * an applied patch keeps its undo path for as long as it is recorded. There is
 * deliberately no `applied-and-gone`.
 */
export type LadderState = 'quarantined' | 'promoted' | 'reverted'

/**
 * The conditions under which a patch may leave quarantine, recorded as data.
 *
 * Recorded as a value so that `promotionRule` can be a function of the terms and
 * not of a reader's memory, and so that a caller can be told WHY promotion was
 * refused rather than only that it was.
 */
export interface PromotionTerms {
  /** Every check must have run and passed. `not-checked` is not a pass. */
  readonly requiresAllChecksRan: boolean
  /** A human must have been named, when the change is above the red line. */
  readonly requiresHumanForRedLines: boolean
  /** A patch with no `reverses` path may never promote. */
  readonly requiresReversesPath: boolean
  /**
   * The red-line strings that may NEVER auto-promote, whatever else is true.
   * Carried as data because it is a policy, and a policy in a literal is a
   * policy nobody can audit.
   */
  readonly autoPromotionProhibitedRedLines: readonly string[]
}

/** One entry in the append-only ladder. Entries are appended, never rewritten. */
export interface LadderEntry {
  readonly proposalId: string
  readonly from: LadderState | null
  readonly to: LadderState
  readonly at: string
  /** Why the move happened. An empty reason is refused by the writer. */
  readonly reason: string
}

// ---------------------------------------------------------------------------
// Owned — the quarantine record
// ---------------------------------------------------------------------------

/**
 * What is written to disk when an envelope is staged.
 *
 * The stored verdict is deliberately a STRUCTURED SUBSET rather than the whole
 * `PatchVerdict`: the blindness register is recomputed at read time from the
 * live register, so a stored copy cannot go stale against the code that
 * produced it. Storing the register would freeze a claim about what this lane
 * does not check at the moment of writing, and the lane's gaps change when its
 * checks change.
 */
export interface QuarantineRecord {
  readonly proposalId: string
  readonly packageId: string
  readonly from: string
  readonly stagedAt: string
  /** The digest of the exact bytes stored, so a reader can detect tampering. */
  readonly envelopeHash: Sha256Hex
  /** The verdict at staging time, minus the register. */
  readonly verdict: {
    readonly verdict: Verdict | null
    readonly checks: readonly CheckResult[]
    readonly admitted: boolean
    readonly refusalReasons: readonly string[]
    readonly staging: PatchStaging
  }
  readonly ladder: readonly LadderEntry[]
}

// ---------------------------------------------------------------------------
// Owned — the envelope
// ---------------------------------------------------------------------------

/**
 * What a peer actually sends: a package and the proposal that would change it.
 *
 * Bundled rather than separate because the two halves are verified together and
 * a route that accepted them separately could be driven to verify one against
 * the other's identity. See blindness entry B7 for what is NOT covered.
 */
export interface PatchEnvelope {
  readonly package: MetaPackage
  readonly proposal: PatchProposal
}

// ---------------------------------------------------------------------------
// Owned — the ports
// ---------------------------------------------------------------------------

/**
 * What this lane needs from the world, injected rather than imported.
 *
 * The zone registry and the clock are the two things a check needs that this
 * lane must not own: the zones belong to the intent map, and the clock belongs
 * to the caller who must be able to pin it for a reproducible census.
 */
export interface VerifyPorts {
  /** Does this zone exist? A `false` here is a READING; see blindness entry B5. */
  readonly zoneExists: (zoneId: string) => ZoneLookup
  /** Injected so a verdict can be reproduced byte-for-byte under a pinned time. */
  readonly now: () => Date
}

/**
 * The answer to "does this zone exist", with the reason when it does not.
 *
 * `exists: false` with a reason is a measurement. `exists: false` with reason
 * `null` would be an absence of a reading dressed as a negative finding, which
 * is why the reason field is part of the shape rather than a convention.
 */
export interface ZoneLookup {
  readonly exists: boolean
  /** Why the lookup answered as it did. `null` only when `exists` is true. */
  readonly reason: string | null
}

/**
 * The outcome of a write that may not have happened.
 *
 * Not a boolean, and not a throw. A `false` conflates "refused, and here is why"
 * with "the filesystem failed", and a caller that treats them alike will report
 * a refusal as an outage. `wrote` is separate from `ok` for the same reason the
 * protocol separates `Verdict` from `admitted`.
 */
export interface StoreOutcome<T> {
  readonly ok: boolean
  /** `true` when bytes were actually written. A dry run is `ok` and not `wrote`. */
  readonly wrote: boolean
  /** The value, when one was produced. */
  readonly value: T | null
  /** Why it failed. `null` when `ok` is true. */
  readonly reason: string | null
}

// ---------------------------------------------------------------------------
// Owned — the self-check
// ---------------------------------------------------------------------------

/**
 * One assertion about this lane's own behaviour, with the observation that
 * would falsify it.
 *
 * `falsifier` is required, matching the protocol's rule that a verdict with no
 * falsifier is an opinion. Applied to a test suite, it means every assertion
 * states what would have made it wrong rather than only what made it pass.
 */
export interface SelfCheckFinding {
  readonly id: string
  readonly description: string
  readonly passed: boolean
  readonly falsifier: string
  /** What was actually observed, so a failure can be read without re-running. */
  readonly observed: string
}
