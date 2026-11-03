/**
 * L6 — stable and official plugins: the types this lane OWNS, and the ones it borrows.
 *
 * THE SPLIT IS THE FIRST THING TO KNOW ABOUT THIS FILE. Anything the program has already fixed — a
 * count that travels with its denominator, an evidence pointer, a store outcome, the hashing algorithm
 * — is IMPORTED from the module that owns it and re-exported here. Redeclaring `StoreOutcome` or
 * `Measured` would give this program two definitions of one fact, and the two would agree on the day
 * they were written and drift on the first edit.
 *
 * THE VOCABULARY IS `src/host/patch/`'S, DELIBERATELY. `StoreOutcome`, `Sha256Hex` and `HASH_ALGORITHM`
 * come from `../patch/types.ts`, and `PatchStaging` comes from the frozen protocol, because a second
 * store in the same plugin with its own notion of "did this write happen" would make two lanes answer
 * the same question differently and neither be wrong on its own terms. The rule this lane adds is not a
 * new outcome type; it is that the thing being stored is an INTENT MAP AND A MATCH, not an envelope.
 *
 * WHAT THIS LANE IS, AND WHAT IT IS NOT, STATED IN THE TYPES RATHER THAN IN A COMMENT ONLY:
 *
 *   - It is the STORE the owner asked for — "stable and official will have their intent map and match
 *     stored in the meta market" — one record per stable or official plugin.
 *   - It is the ALTERNATION CONTRACT — "next 'stable plugin'/official commit of patch from meta-patch is
 *     available way to alternate them" — an applied patch is a record with a named artifact, a digest,
 *     what it displaced, and how to go back. Appending is the only write; nothing is overwritten.
 *   - It is NOT a second candidate-matching gate. `intent-align` owns "does this candidate collide with
 *     a stable, official or meta plugin". This lane's `match` field is about the stored POPULATION: which
 *     stored members overlap EACH OTHER. Those are different subjects and the field names say which is
 *     which, because the program's expensive defect is two encodings of one fact that disagree.
 *
 * @module dsh-meta-market/host/stable/types
 */

import type { EvidencePointer, Measured, ThreeKind } from '../../shared/protocol.ts'
import type { PatchStaging } from '../../shared/protocol.ts'
import type { Sha256Hex, StoreOutcome } from '../patch/types.ts'

export type { EvidencePointer, Measured, PatchStaging, Sha256Hex, StoreOutcome, ThreeKind }

/** The two populations this lane stores. `meta` is `intent-align`'s class and is deliberately absent here. */
export type StableClass = 'stable' | 'official'

/**
 * How a zone score was produced.
 *
 * The two methods are NOT on one scale, so the method travels on every zone rather than being a
 * property of the record: a reader who compares an embedding score against a token score compares two
 * instruments, which is the digest-without-its-algorithm trap wearing different clothes.
 */
export type SignatureMethod = 'embedding' | 'token'

/** The three-valued answer. `not-measured` is a reading state, never a synonym for `pass`. */
export type OriginalIntentVerdict = 'pass' | 'collide' | 'not-measured'

/** One zone of a stored intent map. `score` is a number, always: an unscoreable zone is absent from the map. */
export interface StoredZone {
  readonly zone: string
  readonly score: number
  readonly method: SignatureMethod
}

/** A named overlap between two STORED members. `klass` says which population the other side belongs to. */
export interface StoredCollision {
  readonly id: string
  readonly klass: StableClass
  /** The zone both members occupy as their strongest match. */
  readonly sharedZone: string
  /** The conservative strength: the LOWER of the two members' scores in the shared zone. */
  readonly score: number
  readonly why: string
}

/** The match verdict of one stored member against its fellow stored members. */
export interface StoredMatch {
  readonly verdict: OriginalIntentVerdict
  /** The rule id that produced this verdict. A verdict with no rule is an opinion. */
  readonly rule: string
  /** Non-null exactly when `verdict` is `not-measured`. */
  readonly reason: string | null
  readonly collidesWith: readonly StoredCollision[]
  readonly compared: {
    readonly count: number
    readonly of: number
    readonly population: string
    readonly at: string
  }
}

/** Where a stored intent map's text came from, so the map is auditable without re-running the measure. */
export interface IntentSource {
  readonly kind: 'package-manifest'
  /** Absolute path of the manifest that was read. */
  readonly path: string
  /** The field inside it. Named because a description field is a claim by its author. */
  readonly field: string
}

/** One stored intent map: 24 zones and the method that produced them, or an honest absence. */
export interface StoredIntent {
  readonly zones: readonly StoredZone[]
  readonly method: SignatureMethod
  /** Why the token method ran instead of the embedding method. `null` when embedding produced the map. */
  readonly methodReason: string | null
  /** `false` when no zone carried a score. A map with no numbers is not evidence of anything. */
  readonly measured: boolean
  readonly measuredAt: string | null
  readonly source: IntentSource
}

/**
 * One patch as it was applied, KEPT FOREVER.
 *
 * `displaces` is the load-bearing field: it names the patch this one replaced, and the displaced patch
 * stays in `history` rather than being deleted. An alternation path that cannot say what it displaced
 * is an overwrite with a changelog, which is exactly what the owner's clause rules out.
 */
export interface AppliedPatch {
  /** Workspace-relative path of the artifact that was applied. */
  readonly artifact: string
  readonly sha256Hex: Sha256Hex
  readonly algorithm: 'sha256'
  /** Where the patch sits in the ladder, borrowing the protocol's own vocabulary. */
  readonly staging: PatchStaging
  readonly appliedAt: string
  /** WHO applied it. An unattributed patch is not admissible; this matches the protocol's rule for `from`. */
  readonly appliedBy: string
  /** The patch this one replaced, or `null` for the first. */
  readonly displaces: string | null
  /** How to undo it, in words a person can follow. An empty reverses path may never be applied. */
  readonly reverses: string
  readonly reason: string
}

/** What this lane knows about patch availability for one member: a MEASUREMENT, not a guess. */
export interface PatchAvailability {
  readonly ok: boolean
  readonly artifact: string | null
  readonly applies: string | null
  readonly reason: string | null
}

/** The patch half of one record: what is current, what came before, and whether an artifact exists. */
export interface StoredPatch {
  readonly current: AppliedPatch | null
  /** Append-only history, oldest first. The current patch is the last entry. */
  readonly history: readonly AppliedPatch[]
  readonly available: PatchAvailability
}

/** One stored plugin. `kind: 'exists'` because the plugin is on disk and its manifest was read. */
export interface StableRecord {
  readonly id: string
  readonly name: string
  readonly npm: string | null
  readonly klass: StableClass
  readonly kind: ThreeKind
  /** Measured from the manifest. `null` when the manifest carried no version. */
  readonly version: string | null
  /** `true` when the profile's bundles name it. `null` when the profile could not be read. */
  readonly installed: boolean | null
  readonly evidence: readonly EvidencePointer[]
  readonly intent: StoredIntent
  readonly match: StoredMatch
  readonly patch: StoredPatch
}

/** The stored document. This is what is written to disk, sealed. */
export interface StableLedger {
  readonly schemaVersion: number
  readonly writtenAt: string
  /** The workspace the census was taken from. `null` when it could not be resolved. */
  readonly workspaceRoot: string | null
  readonly census: {
    readonly stable: Measured
    readonly official: Measured
    readonly records: Measured
    readonly population: string
    readonly at: string
  }
  /** What the match verdicts were computed over, so a reader can tell what a `pass` covered. */
  readonly comparison: {
    readonly population: string
    readonly rule: string
    readonly at: string
  }
  readonly bundlerCensus: BundlerCensus
  readonly records: readonly StableRecord[]
}

/** The profile census this store was built against, with the arithmetic that closes it. */
export interface BundlerCensus {
  /** The profile's `dsh.profile.bundles` length. */
  readonly bundles: number
  /** How many of those start with `@deepseek-ai/`. */
  readonly officialBundles: number
  /** How many do not. `bundles - officialBundles` is CHECKED, not assumed. */
  readonly nonOfficialBundles: number
  /** The dependency keys, a different population from the bundles and counted separately. */
  readonly dependencies: number
  /** Where the profile manifest was read from. */
  readonly profilePath: string
  readonly at: string
}

/** One member as discovered, before its intent map was scored. */
export interface MemberSeed {
  readonly id: string
  readonly name: string
  readonly npm: string | null
  readonly klass: StableClass
  readonly version: string | null
  readonly manifestPath: string
  readonly intentText: string
  readonly installed: boolean | null
  readonly evidence: readonly EvidencePointer[]
}

/** A zone and its definition, as read from the live intent map. The token method's only text input. */
export interface ZoneDefinition {
  readonly id: string
  readonly category: string
  readonly definition: string
}

/** The result of reading the ledger back. A failure carries a reason and never an empty ledger. */
export type ReadLedgerOutcome =
  | {
      readonly ok: true
      readonly ledger: StableLedger
      /** `null` when the seal held. A sentence when the bytes changed after the write. */
      readonly sealProblem: string | null
      readonly path: string
      /** The digest recorded in the file, so a caller can compare it with what it read. */
      readonly seal: Sha256Hex | null
    }
  | { readonly ok: false; readonly reason: string; readonly path: string | null }

/** What `loadLedger` answers: the ledger, where it came from, or why there is none. */
export type LedgerOutcome =
  | { readonly ok: true; readonly ledger: StableLedger; readonly from: 'file' | 'measured'; readonly path: string }
  | { readonly ok: false; readonly reason: string; readonly path: string | null }

/** A file's identity, so the same size at two moments cannot stand in for the same bytes. */
export interface FileIdentity {
  readonly path: string
  readonly bytes: number
  readonly sha256Hex: Sha256Hex
  /**
   * The file's own modification time, ISO 8601.
   *
   * Carried because "which patch is the newest" is a real question for the alternation contract and path
   * order does not answer it. A reader can compare this with the artifact's own commit time; a file whose
   * clock disagrees with its commit is a copy, not a commit.
   */
  readonly modifiedAt: string | null
}

/** The artifact directory this lane reads and never writes. Owned by lane `patch-first`. */
export interface ArtifactCensus {
  readonly directory: string
  /** Absolute path, so a reader can `ls` it without resolving anything. */
  readonly absolute: string
  readonly exists: boolean
  /** Files found, at any depth. `0` with `exists: false` would be the absent-is-zero defect, so both are reported. */
  readonly files: readonly FileIdentity[]
  readonly reason: string | null
  readonly at: string
}
