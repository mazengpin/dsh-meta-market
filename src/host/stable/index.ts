/**
 * L6 — the lane's public surface: the STORE of stable and official intent maps, and the ALTERNATION contract.
 *
 * WHAT THE OWNER ASKED FOR, AND WHERE EACH HALF LIVES:
 *
 *   "stable plugins that emerged in ecosystem and already widely adopted in community eg. dsh-market and
 *    plugins that shipped with official dsh shall also be there if they pass the 'original intent'-intent
 *    that not collides with stable, official or existing meta-plugins"  -> `ledger.ts` + `scoring.ts`
 *   "stable and official will have their intent map and match stored in the meta market"  -> `store.ts`
 *   "next 'stable plugin'/official commit of patch from meta-patch is available way to alternate them"
 *                                                                          -> `alternation.ts`
 *
 * THE ONE FACT THIS BARREL EXISTS TO STATE PLAINLY, as a value in `LANE_SUMMARY` rather than only in prose:
 * THIS LANE IS THE STORE, NOT THE GATE. `intent-align` answers "does this candidate collide with a stable,
 * official or meta plugin"; this lane answers "what is stored about the stable and official members, and
 * which patch is current for each". A second candidate-match path would be a second opinion nobody
 * reviews, so it is deliberately absent — and `match` here is a statement about the stored POPULATION,
 * named as such in every record.
 *
 * THREE KINDS, NEVER FLATTENED: this lane is `kind: 'plan'`. It is built and it runs, but it has never been
 * exercised by a second system's patch commit, and the artifact directory it reads does not exist yet. A
 * lane that called itself `exists` here would be claiming the alternation path had been used, which the
 * census at the top of `LANE_SUMMARY` contradicts.
 *
 * @module dsh-meta-market/host/stable
 */

import type {
  ArtifactCensus,
  LedgerOutcome,
  StableLedger,
  StableRecord,
  StoredCollision,
  StoredMatch,
  StoreOutcome,
} from './types.ts'
import { ALTERNATION_PROCEDURE, availabilityFor } from './alternation.ts'
import { MATCH_RULE, SHARED_DOMINANT_MIN, COMPARISON_POPULATION, strongestSharedPair } from './scoring.ts'
import { censusArtifacts, resolveWorkspaceRoot, PATCH_ARTIFACT_REL, DEFAULT_BASE_URL } from './measure.ts'
import { measureLedger } from './ledger.ts'
import { STORE_FILENAME, STORE_REL, STORE_SCHEMA_VERSION, readLedger, writeLedger } from './store.ts'

// ---------------------------------------------------------------------------
// Types — re-exported so a consumer has one import site
// ---------------------------------------------------------------------------

export type {
  AppliedPatch,
  ArtifactCensus,
  BundlerCensus,
  EvidencePointer,
  FileIdentity,
  LedgerOutcome,
  Measured,
  MemberSeed,
  OriginalIntentVerdict,
  PatchAvailability,
  PatchStaging,
  ReadLedgerOutcome,
  Sha256Hex,
  SignatureMethod,
  StableClass,
  StableLedger,
  StableRecord,
  StoreOutcome,
  StoredCollision,
  StoredIntent,
  StoredMatch,
  StoredPatch,
  StoredZone,
  ThreeKind,
  ZoneDefinition,
} from './types.ts'

export type { AlternationPlan } from './alternation.ts'
export type { LedgerFile } from './store.ts'

// ---------------------------------------------------------------------------
// Constants — the numbers and rules a reader should be able to cite
// ---------------------------------------------------------------------------

/** The lane identity, in the form the assembly's lane table expects. */
export const LANE_ID = 'L6'

/**
 * What this lane is, in the terms the program requires of every lane.
 *
 * The counts are filled from a ledger by `describeLane(ledger)`; the CONSTANT reports the shape, and the
 * falsifier is the check that would show a `pass` here was empty.
 */
export const LANE_SUMMARY = {
  id: LANE_ID,
  name: 'Stable and official plugins: stored intent map, stored match, patch alternation',
  kind: 'plan' as const,
  appliesAnything: false,
  /** The store this lane writes. Stated so a reader does not have to derive it from the code. */
  storePath: `${STORE_REL}/${STORE_FILENAME}`,
  /** The path this lane READS and never writes. Lane `patch-first` owns it. */
  artifactPath: PATCH_ARTIFACT_REL,
  /** The honest headline gap, in one sentence. */
  headlineGap:
    'EVERY STORED INTENT MAP IS SCORED WITH THE TOKEN METHOD, NOT THE EMBEDDING METHOD: the embedding substrate ' +
    'answered `000` (no connection) on 11434 and `/intent-map/api/recall` returned `embedded:false` at census ' +
    'time, so no stored score is an embedding score and none may be compared with one.',
  /** The falsifiers a reader can run against this lane's claims. */
  falsifiers: [
    {
      claim: 'the ledger on disk is the ledger this lane measured',
      how: `read \`${STORE_REL}/${STORE_FILENAME}\` and recompute sha256 over the canonical (key-sorted) ledger member; a mismatch with \`sealedSha256\` is a tamper reading`,
    },
    {
      claim: 'a record reading `pass` shares no dominant zone with any other stored member',
      how: 'compare the record\'s 24 stored scores: a pair sharing its argmax zone at or above SHARED_DOMINANT_MIN disproves the verdict',
    },
    {
      claim: 'no patch is applied to any stored member',
      how: 'every record\'s `patch.current` is `null` while the artifact census reports the directory absent; a non-null current with an empty history is a fabricated apply',
    },
    {
      claim: 'the store survives a restart',
      how: 'delete nothing, restart, and `loadLedger` reports `from: "file"`; a reported `from: "measured"` after a successful write means the file could not be read back',
    },
  ],
} as const

export {
  ALTERNATION_PROCEDURE,
  COMPARISON_POPULATION,
  MATCH_RULE,
  PATCH_ARTIFACT_REL,
  SHARED_DOMINANT_MIN,
  STORE_FILENAME,
  STORE_REL,
  STORE_SCHEMA_VERSION,
  availabilityFor,
  censusArtifacts,
  measureLedger,
  readLedger,
  resolveWorkspaceRoot,
  strongestSharedPair,
  writeLedger,
}

// ---------------------------------------------------------------------------
// The store: read, or measure when there is nothing to read
// ---------------------------------------------------------------------------

/** Options for the store entry points. */
export interface StoreOptions {
  /** The program workspace root. Defaults to the walk-up from the current directory. */
  readonly root?: string | null
  /** The live harness base URL the zone space is read from. */
  readonly baseUrl?: string
  readonly timeoutMs?: number
  readonly now?: () => Date
}

/**
 * Read the persisted ledger, MEASURING only when the file is absent or unreadable.
 *
 * The distinction is reported as `from`, and it is not cosmetic: `from: 'file'` means the reader is looking
 * at what a previous run decided, and `from: 'measured'` means this call took the census. A caller that
 * cannot tell those apart will report a live measurement as a stored fact.
 */
export async function loadLedger(options: StoreOptions = {}): Promise<LedgerOutcome> {
  const root = options.root ?? resolveWorkspaceRoot()
  const stored = readLedger(root)
  if (stored.ok && stored.value !== null && stored.value.sealProblem === null) {
    return { ok: true, ledger: stored.value.ledger, from: 'file', path: stored.value.path }
  }
  const reason = stored.ok ? (stored.value?.sealProblem ?? 'the ledger read produced no value') : stored.reason
  const measured = await measureLedger({
    workspaceRoot: root,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  if (root === null) {
    return { ok: false, reason: `no workspace root, and no stored ledger could be read (${reason})`, path: null }
  }
  return { ok: true, ledger: measured.ledger, from: 'measured', path: `${root}/${STORE_REL}/${STORE_FILENAME}` }
}

/**
 * Measure the ledger and WRITE it, carrying any applied-patch history forward.
 *
 * The history carry is the reason this is a separate function from `loadLedger`: a re-measure must not
 * un-apply a patch. The write's own outcome is reported separately from the measurement, because "the
 * measurement worked and the write failed" is a real state and a single boolean would hide it.
 */
export async function refreshLedger(
  options: StoreOptions = {},
): Promise<{ readonly ok: boolean; readonly wrote: boolean; readonly ledger: StableLedger | null; readonly reason: string | null; readonly path: string | null; readonly notes: readonly string[] }> {
  const root = options.root ?? resolveWorkspaceRoot()
  const stored = readLedger(root)
  const previous = stored.ok && stored.value !== null && stored.value.sealProblem === null ? stored.value.ledger : null
  const measured = await measureLedger({
    workspaceRoot: root,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
    previous,
  })
  const written: StoreOutcome<string> = writeLedger(root, measured.ledger)
  return {
    ok: written.ok,
    wrote: written.wrote,
    ledger: measured.ledger,
    reason: written.reason,
    path: written.value,
    notes: measured.notes,
  }
}

// ---------------------------------------------------------------------------
// Reading the store
// ---------------------------------------------------------------------------

/** The counts, taken from the record array they describe. */
export function censusOf(ledger: StableLedger): StableLedger['census'] {
  const records = ledger.records
  return {
    stable: { count: records.filter((record) => record.klass === 'stable').length, of: records.length },
    official: { count: records.filter((record) => record.klass === 'official').length, of: records.length },
    records: { count: records.length, of: records.length },
    population: ledger.census.population,
    at: ledger.census.at,
  }
}

/**
 * Look one record up by id, package name or npm name.
 *
 * Three keys because a provider renders catalog-derived ids while this store keys on manifest names, and a
 * lookup that accepted only one of them would report "not stored" for a member that is stored. `null`
 * means NOT IN THE STORED POPULATION — it does not mean the plugin does not exist.
 */
export function getStoredRecord(ledger: StableLedger, id: string): StableRecord | null {
  const needle = id.toLowerCase()
  const stripped = needle.replace(/^(stable|official):/, '')
  for (const record of ledger.records) {
    const keys = [record.id.toLowerCase(), record.id.toLowerCase().replace(/^(stable|official):/, ''), record.name.toLowerCase(), (record.npm ?? '').toLowerCase()]
    if (keys.includes(needle) || keys.includes(stripped)) return record
  }
  return null
}

/** The CONTRACT's `patch` field for one item: available only when a MEASURED artifact identifies it. */
export function patchRefFor(ledger: StableLedger, itemId: string): { readonly available: true; readonly artifact: string; readonly applies: string } | null {
  const record = getStoredRecord(ledger, itemId)
  if (record === null) return null
  const available = record.patch.available
  if (!available.ok || available.artifact === null || available.applies === null) return null
  return { available: true, artifact: available.artifact, applies: available.applies }
}

/** One alternation, planned from the stored state without re-measuring the artifact directory. */
export function alternationPlan(ledger: StableLedger, id: string): {
  readonly ok: boolean
  readonly member: string
  readonly artifact: string | null
  readonly displaces: string | null
  readonly apply: readonly string[]
  readonly reverse: readonly string[]
  readonly reason: string | null
} {
  const record = getStoredRecord(ledger, id)
  if (record === null) {
    return { ok: false, member: id, artifact: null, displaces: null, apply: [], reverse: [], reason: `no stored record for \`${id}\`; the ledger holds ${String(ledger.records.length)} records and this is not one of them` }
  }
  const available = record.patch.available
  if (!available.ok || available.artifact === null) {
    return {
      ok: false,
      member: record.id,
      artifact: null,
      displaces: record.patch.current?.artifact ?? null,
      apply: [],
      reverse: record.patch.current === null ? [] : [`apply \`${record.patch.current.artifact}\` again to go back, naming its own reverses text`],
      reason: available.reason,
    }
  }
  return {
    ok: true,
    member: record.id,
    artifact: available.artifact,
    displaces: record.patch.current?.artifact ?? null,
    apply: [
      `verify \`${available.artifact}\` against the census recorded in this record at ${ledger.census.at}`,
      record.patch.current === null ? 'record it as the FIRST patch for this member' : `record it as current, displacing \`${record.patch.current.artifact}\``,
      'append the entry to `history`, keeping every displaced entry; execute the patch as an operator step — this plugin applies nothing',
    ],
    reverse: [
      record.patch.current === null
        ? 'REVERSE OF A FIRST PATCH: record that no patch is current, keeping the entry in `history`'
        : `apply \`${record.patch.current.artifact}\` again as its own alternation, naming this patch in its \`displaces\``,
      'the stable clone is not restored by this lane; the patch\'s own reverses text is the undo path for the code',
    ],
    reason: available.reason,
  }
}

/** What a lane table and a landing page render. Counts are SET BY THE CALLER from a ledger, never typed. */
export function describeLane(ledger: StableLedger | null): {
  readonly id: string
  readonly name: string
  readonly kind: 'plan'
  readonly appliesAnything: false
  readonly stableCount: number
  readonly officialCount: number
  readonly recordCount: number
  readonly withPatch: number
  readonly colliding: number
  readonly storePath: string
  readonly artifactPath: string
  readonly headlineGap: string
  readonly strongestSharedPair: string | null
} {
  if (ledger === null) {
    return {
      id: LANE_ID,
      name: LANE_SUMMARY.name,
      kind: 'plan',
      appliesAnything: false,
      stableCount: 0,
      officialCount: 0,
      recordCount: 0,
      withPatch: 0,
      colliding: 0,
      storePath: LANE_SUMMARY.storePath,
      artifactPath: LANE_SUMMARY.artifactPath,
      headlineGap: LANE_SUMMARY.headlineGap,
      strongestSharedPair: null,
    }
  }
  const census = censusOf(ledger)
  const pair = strongestSharedPair(ledger.records.map((record) => ({ id: record.id, zones: record.intent.zones })))
  return {
    id: LANE_ID,
    name: LANE_SUMMARY.name,
    kind: 'plan',
    appliesAnything: false,
    stableCount: census.stable.count,
    officialCount: census.official.count,
    recordCount: census.records.count,
    withPatch: ledger.records.filter((record) => record.patch.current !== null).length,
    colliding: ledger.records.filter((record) => record.match.verdict === 'collide').length,
    storePath: LANE_SUMMARY.storePath,
    artifactPath: LANE_SUMMARY.artifactPath,
    headlineGap: LANE_SUMMARY.headlineGap,
    strongestSharedPair:
      pair === null
        ? 'no pair of stored members shares a dominant zone; the collision check therefore found nothing to refuse, which is a reading and not a pass'
        : `${pair.a} and ${pair.b} both dominate \`${pair.zone}\` at conservative strength ${pair.score.toFixed(4)} against SHARED_DOMINANT_MIN ${String(SHARED_DOMINANT_MIN)}`,
  }
}

// ---------------------------------------------------------------------------
// A convenience re-export for a caller that wants the live artifact census
// ---------------------------------------------------------------------------

/** The artifact census for the current workspace, as `measureLedger` takes it. */
export function artifactCensus(root?: string | null): ArtifactCensus {
  return censusArtifacts(root ?? resolveWorkspaceRoot())
}

/** The default base URL, exported so a caller can name the host it probed. */
export { DEFAULT_BASE_URL }

/**
 * A stored match verdict, narrowed for a renderer.
 *
 * Exported as a FUNCTION rather than left to the caller so the three-valued verdict is never collapsed:
 * a renderer that reads `match.verdict` gets `pass | collide | not-measured` and must handle all three.
 */
export function matchOf(ledger: StableLedger, id: string): StoredMatch | null {
  return getStoredRecord(ledger, id)?.match ?? null
}

/** The collisions one record carries, kept as their own accessor so a renderer cannot show `collide` with an empty list. */
export function collisionsOf(ledger: StableLedger, id: string): readonly StoredCollision[] {
  return getStoredRecord(ledger, id)?.match.collidesWith ?? []
}
