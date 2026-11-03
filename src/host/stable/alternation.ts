/**
 * L6 — the ALTERNATION CONTRACT: a patch from `meta-patch` replaces a previous one, reviewably.
 *
 * THE OWNER'S CLAUSE, verbatim: "next 'stable plugin'/official commit of patch from meta-patch is
 * available way to alternate them". The two words that bind this module are NEXT and ALTERNATE: a later
 * artifact REPLACES an earlier one, and the earlier one is still there to go back to. So a patch here is
 * never a silent overwrite of a file — it is an APPEND to a history, with the entry it displaced named on
 * the entry that displaces it.
 *
 * FIVE REFUSALS, AND EACH ONE CLOSES A WAY TO LOSE THE UNDO PATH:
 *
 *   1. An artifact that was not MEASURED cannot be applied. This lane reads
 *      `research/meta-patch-dsh-market/` and never writes it (lane `patch-first` owns that path), so
 *      "the file is there" is a reading this module takes rather than an argument it accepts.
 *   2. An empty `reverses` path is refused, matching the frozen protocol's rule that a patch with no undo
 *      path is not admissible for application.
 *   3. An unattributed apply is refused: `appliedBy` is required, for the same reason `PatchProposal.from`
 *      is required.
 *   4. Applying an artifact that is ALREADY current is refused — a second identical entry would record one
 *      event twice in an append-only history.
 *   5. A ledger whose seal does not hold is refused as input, because a store that cannot detect its own
 *      tampering must not be the thing that records a change.
 *
 * WHAT APPLY DOES NOT DO, STATED PLAINLY. It does not execute the patch, copy any file, or modify the
 * stable plugin's clone. `plugins-src/dsh-market` is not this lane's to write. Apply records WHICH patch is
 * current for a member, what it displaced, and how to go back — the reviewable half — and the execution of
 * the patch remains an operator step outside this plugin. That is the same boundary `patch/quarantine.ts`
 * draws when it says it applies nothing.
 *
 * @module dsh-meta-market/host/stable/alternation
 */

import type { ArtifactCensus, StableLedger, StableRecord, StoreOutcome } from './types.ts'
import { PATCH_ARTIFACT_REL } from './measure.ts'

/** The staging value an applied patch carries. Borrowed from the protocol's closed set, not invented. */
export const APPLIED_STAGING = 'applied' as const

/** What a patch artifact looks like on disk. A census counts every file; only these can be APPLIED. */
export const PATCH_EXTENSIONS: readonly string[] = ['.patch', '.diff']

/**
 * What a COMMITTED patch artifact is NAMED, and the pattern is a measured observation rather than a taste.
 *
 * `patch-first` names its commits `NNNN-<slug>.patch` (`0001-meta-market-button-row.patch` at the first
 * census). The same directory also holds `mutated.patch` — a MUTATION FIXTURE the lane built to prove its
 * verifier can refuse — and a rule that treated both as equally applicable would let a test fixture be
 * applied to a live member. The convention is therefore part of the matching rule, and a file that does not
 * follow it is reported as present-but-not-a-commit rather than silently counted.
 */
export const COMMIT_ARTIFACT_PATTERN = /^[0-9]{4}-[A-Za-z0-9._-]+\.(patch|diff)$/

/** The basename of a path, in both separator styles, so a Windows path is not one long filename. */
function basenameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut === -1 ? path : path.slice(cut + 1)
}

/** The census-relative form of a file, so a stored artifact path is workspace-relative and stable. */
function relativeArtifact(census: ArtifactCensus, path: string): string {
  const inside = path.startsWith(census.absolute) ? path.slice(census.absolute.length).replace(/^[\\/]/, '') : path
  return `${PATCH_ARTIFACT_REL}/${inside.replace(/\\/g, '/')}`
}

/**
 * Find the patch artifact that belongs to one member, or say precisely why none does.
 *
 * THREE RULES, EACH LOSING A FALSE MATCH THAT WAS ACTUALLY OBSERVED:
 *
 *   1. ONLY `.patch` / `.diff` FILES ARE CANDIDATES. The directory also holds evidence JSON, a driver and two
 *      scratch git repositories (78 files at the first census), and a rule that accepted any file matched 78
 *      of 78 for `dsh-market` because the DIRECTORY's own name contains `dsh-market`. A match on the full path
 *      is a match on the parent, which tells a reader nothing about the file.
 *   2. THE MATCH IS ON THE BASENAME. `0001-meta-market-button-row.patch` does not name `dsh-market`, so a
 *      name-only rule finds nothing — which is correct and is reported as NO ARTIFACT rather than resolved by
 *      guessing.
 *   3. THE ONLY-PATCH CONVENTION IS NAMED, NOT ASSUMED. When exactly one patch candidate exists and no name
 *      matches, it is attached WITH A REASON saying it was attached by position, not by name, so a reader can
 *      disagree with the convention instead of inheriting it silently. When several exist and none matches, the
 *      answer is `ok: false` and the candidates are listed.
 *
 * Among several name-matched candidates the NEWEST by the file's own mtime wins, because the owner's clause is
 * about a NEWER commit replacing an older one and path order does not encode time.
 */
export function availabilityFor(
  census: ArtifactCensus,
  member: { readonly id: string; readonly name: string; readonly npm: string | null; readonly klass?: 'stable' | 'official' },
): { readonly ok: boolean; readonly artifact: string | null; readonly applies: string | null; readonly reason: string | null } {
  if (!census.exists) {
    return { ok: false, artifact: null, applies: null, reason: census.reason ?? `${PATCH_ARTIFACT_REL} does not exist` }
  }
  const patchLike = census.files.filter((file) => PATCH_EXTENSIONS.some((extension) => basenameOf(file.path).toLowerCase().endsWith(extension)))
  if (patchLike.length === 0) {
    return {
      ok: false,
      artifact: null,
      applies: null,
      reason: `${String(census.files.length)} file(s) exist under ${PATCH_ARTIFACT_REL} and none is a ${PATCH_EXTENSIONS.join('/')} file, so there is nothing this lane could apply`,
    }
  }
  const candidates = patchLike.filter((file) => COMMIT_ARTIFACT_PATTERN.test(basenameOf(file.path)))
  if (candidates.length === 0) {
    return {
      ok: false,
      artifact: null,
      applies: null,
      reason:
        `${String(patchLike.length)} patch file(s) exist under ${PATCH_ARTIFACT_REL} and NONE follows the commit naming convention ` +
        `${String(COMMIT_ARTIFACT_PATTERN)} (${patchLike.map((file) => basenameOf(file.path)).join(', ')}); ` +
        `a file that does not name a commit is not a commit, so nothing is attached`,
    }
  }
  const needles = [...new Set([member.name, member.npm ?? '', member.id.replace(/^[a-z]+:/, '')]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((value) => value.length >= 4))]
  const matched = candidates.filter((file) => {
    const stem = basenameOf(file.path).toLowerCase().replace(/[^a-z0-9]/g, '')
    return needles.some((needle) => stem.includes(needle))
  })

  let chosen = null as (typeof candidates)[number] | null
  let reason: string | null = null
  if (matched.length > 0) {
    chosen = [...matched].sort((left, right) => (left.modifiedAt ?? '').localeCompare(right.modifiedAt ?? ''))[matched.length - 1] ?? null
    if (matched.length > 1) {
      reason = `${String(matched.length)} of ${String(candidates.length)} patch artifacts name this member; the NEWEST by file mtime was chosen (${chosen === null ? '<none>' : basenameOf(chosen.path)})`
    }
  } else if (candidates.length === 1 && member.klass === 'stable') {
    /**
     * THE ONLY-PATCH CONVENTION APPLIES TO THE STABLE CANDIDATE AND NOT TO THE OFFICIAL SET.
     *
     * The owner's clause names one first candidate — `dsh-market` — and the artifact for it is
     * `0001-meta-market-button-row.patch`, whose name describes the CHANGE rather than the plugin, so no
     * name rule can find it. A positional attachment is therefore allowed FOR THAT MEMBER with the reason
     * printed. Extending it to the official bundles was observed to claim the same patch for all seven,
     * which is a false statement about seven plugins, so the convention is fenced to the class it was
     * written for.
     */
    chosen = candidates[0] ?? null
    reason =
      `attached by POSITION, not by name, and ONLY because this member is the stable candidate: ${basenameOf((candidates[0] as (typeof candidates)[number]).path)} ` +
      `is the only ${PATCH_EXTENSIONS.join('/')} file under ${PATCH_ARTIFACT_REL} and its name describes the change rather than the plugin ` +
      `(looked for ${needles.join(', ')}). Named so a reader can disagree with the convention.`
  } else {
    return {
      ok: false,
      artifact: null,
      applies: null,
      reason:
        `${String(candidates.length)} patch artifact(s) exist under ${PATCH_ARTIFACT_REL} and none of their names identifies this member ` +
        `(looked for ${needles.join(', ')}); candidates: ${candidates.map((file) => basenameOf(file.path)).join(', ')}`,
    }
  }
  if (chosen === null) {
    return { ok: false, artifact: null, applies: null, reason: 'artifact selection produced no file; this is an instrument failure, not a member without a patch' }
  }
  return {
    ok: true,
    artifact: relativeArtifact(census, chosen.path),
    applies: `replaces the stored intent map and match for \`${member.id}\` with the artifact's revision (sha256 ${chosen.sha256Hex.slice(0, 16)}…, ${String(chosen.bytes)} bytes, modified ${chosen.modifiedAt ?? '<clock absent>'})`,
    reason,
  }
}

/** Re-find the identity of an artifact a record already names. `null` when it is no longer in the census. */
export function artifactIdentity(census: ArtifactCensus, artifact: string): { readonly sha256Hex: string; readonly bytes: number } | null {
  for (const file of census.files) {
    if (relativeArtifact(census, file.path) === artifact) return { sha256Hex: file.sha256Hex, bytes: file.bytes }
  }
  return null
}

/** What one alternation would do, in words a reviewer can check before it happens. */
export interface AlternationPlan {
  readonly ok: boolean
  readonly member: string
  readonly artifact: string | null
  readonly displaces: string | null
  readonly apply: readonly string[]
  readonly reverse: readonly string[]
  readonly reason: string | null
}

/** The three-line procedure, written once and reused by the plan and by the report. */
export const ALTERNATION_PROCEDURE = {
  whatAPatchArtifactIs:
    `a file committed under ${PATCH_ARTIFACT_REL}/ by lane \`patch-first\`, identified by its sha256 and named for the member it changes; this lane reads it and never writes it`,
  whatItDisplaces:
    'the member\'s CURRENT patch, if any: the new entry records `displaces` = the artifact it replaced, and the displaced entry stays in `history` rather than being deleted',
  howToGoBack:
    'apply the displaced artifact again with `appliedBy` and its own `reverses` text — every applied entry carries an undo path, so going back is another alternation and not a deletion',
} as const

/**
 * Plan one alternation: what would be applied, what it would displace, and how to undo it.
 *
 * The plan is a pure function of stored state and a MEASURED artifact census. A plan that says `ok: false`
 * carries the reason; it never returns an empty apply list with no explanation.
 */
export function planAlternation(ledger: StableLedger, census: ArtifactCensus, id: string): AlternationPlan {
  const record = ledger.records.find((row) => row.id === id) ?? null
  if (record === null) {
    return { ok: false, member: id, artifact: null, displaces: null, apply: [], reverse: [], reason: `no stored record for \`${id}\`; the ledger holds ${String(ledger.records.length)} records and this is not one of them` }
  }
  const availability = availabilityFor(census, record)
  const current = record.patch.current
  if (!availability.ok || availability.artifact === null) {
    return {
      ok: false,
      member: id,
      artifact: null,
      displaces: current?.artifact ?? null,
      apply: [],
      reverse: current === null ? [] : ['apply the displaced artifact again, naming its own reverses text'],
      reason: availability.reason,
    }
  }
  return {
    ok: true,
    member: id,
    artifact: availability.artifact,
    displaces: current?.artifact ?? null,
    apply: [
      `verify the artifact's sha256 against the census taken at ${census.at}`,
      `record \`${availability.artifact}\` as current for \`${id}\`${current === null ? ' (this is the first patch)' : `, displacing \`${current.artifact}\``}`,
      'append the entry to `history`; the displaced entry stays in place',
      `execute the patch as an operator step — this plugin applies nothing`,
    ],
    reverse: [
      current === null
        ? 'REVERSE OF A FIRST PATCH: record that no patch is current, keeping the entry in `history`'
        : `apply \`${current.artifact}\` again, as its own alternation, naming this patch in its \`displaces\``,
      'the stable clone under plugins-src/dsh-market is not restored by this lane; its own reverts text is the undo path for the code',
    ],
    reason: availability.reason,
  }
}

/**
 * Apply one alternation to the ledger, IN MEMORY, and return the new ledger.
 *
 * Returns a new document rather than mutating the input: the caller decides whether to write it, and a
 * refusal leaves the previous ledger exactly as it was. The five refusals are in the module header; each
 * returns `ok: false` with a reason naming the artifact.
 */
export function applyAlternation(
  ledger: StableLedger,
  census: ArtifactCensus,
  input: {
    readonly id: string
    readonly appliedBy: string
    readonly reverses: string
    readonly reason: string
    readonly now?: Date
  },
): StoreOutcome<StableLedger> {
  const at = (input.now ?? new Date()).toISOString()
  const record: StableRecord | null = ledger.records.find((row) => row.id === input.id) ?? null
  if (record === null) {
    return { ok: false, wrote: false, value: null, reason: `no stored record for \`${input.id}\`; an alternation needs a member to alternate` }
  }
  if (typeof input.appliedBy !== 'string' || input.appliedBy.trim().length === 0) {
    return { ok: false, wrote: false, value: null, reason: 'an unattributed apply is refused: `appliedBy` names who did it, for the same reason a proposal requires `from`' }
  }
  if (typeof input.reverses !== 'string' || input.reverses.trim().length === 0) {
    return { ok: false, wrote: false, value: null, reason: 'an empty `reverses` path is refused: a patch with no undo path must not be applied' }
  }
  const availability = availabilityFor(census, record)
  if (!availability.ok || availability.artifact === null) {
    return { ok: false, wrote: false, value: null, reason: availability.reason ?? 'no measured artifact for this member' }
  }
  if (record.patch.current !== null && record.patch.current.artifact === availability.artifact) {
    return { ok: false, wrote: false, value: null, reason: `\`${availability.artifact}\` is already current for \`${input.id}\`; a second identical entry would record one event twice` }
  }
  const identity = artifactIdentity(census, availability.artifact)
  const entry = {
    artifact: availability.artifact,
    sha256Hex: identity?.sha256Hex ?? '',
    algorithm: 'sha256' as const,
    staging: APPLIED_STAGING,
    appliedAt: at,
    appliedBy: input.appliedBy.trim(),
    displaces: record.patch.current?.artifact ?? null,
    reverses: input.reverses.trim(),
    reason: input.reason.trim().length > 0 ? input.reason.trim() : `alternation recorded at ${at}`,
  }
  const updated: StableRecord = {
    ...record,
    patch: { ...record.patch, current: entry, history: [...record.patch.history, entry], available: availability },
  }
  return {
    ok: true,
    wrote: false,
    value: {
      ...ledger,
      writtenAt: at,
      records: ledger.records.map((row) => (row.id === record.id ? updated : row)),
      census: { ...ledger.census, at },
      comparison: { ...ledger.comparison, at },
    },
    reason: null,
  }
}
