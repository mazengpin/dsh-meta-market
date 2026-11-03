/**
 * L4 — quarantine: where a received patch WAITS, and where its undo path lives.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: nothing lands in a live market
 * directly from a peer. Every envelope is written to a quarantine directory
 * under the workspace, sealed with its own digest, and read back through a
 * re-verification of that seal. Application is a separate step performed by a
 * different actor against a promotion decision — not by this module, which
 * holds no code path that applies anything.
 *
 * WHY THE SEAL IS RE-CHECKED ON READ. A file on disk is not the file that was
 * written: it can be edited between the write and the read, by an operator, by
 * a synchronisation tool, or by the same peer whose envelope is in it. Reading
 * it back and trusting the earlier verdict would make the verdict a property of
 * the filesystem's history rather than of the bytes in hand. So `read` recomputes
 * the digest of the bytes it actually read and compares it with the digest
 * recorded at staging time, and a mismatch is reported as a tamper reading
 * rather than as a parse error.
 *
 * THE SEAL COVERS THE ENVELOPE, NOT THE VERDICT. That is deliberate: the verdict
 * is a claim made by this instance at a moment, and a peer has no business
 * changing it, but equally this module must be able to record a verdict that a
 * later reader disagrees with. Sealing the verdict too would make disagreement
 * look like tampering.
 *
 * WHAT IS NOT HERE, STATED PLAINLY. There is no code in this module that applies
 * a patch, executes a reversal, or mutates a live market. `revert` moves the
 * RECORD to `reverted` and writes a ladder entry; it does not perform the
 * reversal, because the reversal is a change to a running system and belongs to
 * whoever owns that system. See blindness entry B4.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type {
  LadderEntry,
  PatchEnvelope,
  PatchVerdict,
  QuarantineRecord,
  Sha256Hex,
  StoreOutcome,
} from './types.ts'

import type { Verdict } from '../../shared/protocol.ts'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Where quarantine lives, relative to the workspace root. */
export const QUARANTINE_REL = join('.dsh', 'meta-market', 'quarantine')

/** The file a staged envelope and its verdict are written to. */
export const RECORD_FILENAME = 'record.json'

/** The exact bytes that were verified, preserved so the seal can be re-checked. */
export const ENVELOPE_FILENAME = 'envelope.json'

/**
 * Find the workspace root by walking up for BOTH of the program's anchors.
 *
 * BOTH, and the conjunction is the guard rather than thoroughness. A walk that
 * accepted either anchor alone would stop at the first directory that happened
 * to contain an `AGENTS.md` — and every parent in this tree has one, from the
 * profile down to the repository root — so the quarantine would be created at
 * whichever level the walk reached first, which is a different level depending
 * on where the process was started. Requiring both means the walk stops only at
 * the directory that is actually this program's workspace.
 *
 * Returns `null` rather than throwing, and rather than guessing a root: a
 * quarantine written under a guessed root is a quarantine nobody will find.
 */
export function resolveWorkspaceRoot(start?: string): string | null {
  let current = resolve(start ?? process.cwd())
  for (let depth = 0; depth < 32; depth += 1) {
    if (existsSync(join(current, 'AGENTS.md')) && existsSync(join(current, 'plan'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

/** The quarantine directory for a resolved root, or `null` when there is no root. */
export function quarantineRoot(root: string | null): string | null {
  if (root === null) return null
  return join(root, QUARANTINE_REL)
}

// ---------------------------------------------------------------------------
// Sealing
// ---------------------------------------------------------------------------

/**
 * The digest of an envelope's canonical bytes.
 *
 * Computed over a key-sorted serialisation rather than over `JSON.stringify` of
 * the value as it arrived, because two encoders that agree on content disagree
 * on key order, and a seal that depends on the sender's encoder is not a seal.
 */
export function sealEnvelope(env: PatchEnvelope): Sha256Hex {
  const canonical = (value: unknown): string => {
    if (value === null) return 'null'
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const parts: string[] = []
      for (const key of keys) {
        const entry = record[key]
        if (typeof entry === 'undefined') continue
        parts.push(`${JSON.stringify(key)}:${canonical(entry)}`)
      }
      return `{${parts.join(',')}}`
    }
    return 'null'
  }
  return createHash('sha256').update(new TextEncoder().encode(canonical(env))).digest('hex')
}

/**
 * Write a file atomically: to a sibling temporary path, then rename.
 *
 * The rename is the load-bearing part. `writeFileSync` to the destination is not
 * atomic — a reader that opens the path mid-write sees a truncated file and
 * reports it as corrupt — and this lane's whole purpose is that a receiving
 * instance can trust what it reads. A temp file with a distinctive suffix, then
 * a rename over the destination, means a reader sees either the previous file in
 * full or the new one in full, and never a half-written pair.
 *
 * The temporary file is removed on failure so a crashed write does not leave a
 * stray that a later census would count as a staged envelope.
 */
function writeAtomic(destination: string, contents: string): StoreOutcome<string> {
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(temporary, contents, { encoding: 'utf8' })
    renameSync(temporary, destination)
    return { ok: true, wrote: true, value: destination, reason: null }
  } catch (error) {
    try {
      if (existsSync(temporary)) writeFileSync(temporary, '', { encoding: 'utf8' })
      if (existsSync(temporary)) renameSync(temporary, `${temporary}.failed`)
    } catch {
      // Deliberately empty: the failure of a cleanup must not replace the
      // failure that caused it. The outcome below reports the original.
    }
    return {
      ok: false,
      wrote: false,
      value: null,
      reason: `could not write ${destination}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/**
 * Write an envelope and its verdict into quarantine. Refused on five conditions.
 *
 * A REFUSAL HERE IS NOT A VERDICT ABOUT THE ENVELOPE. `stage` refuses to WORK,
 * distinct from `verifyEnvelope` refusing a PATCH: a missing workspace root, an
 * occupied slot or an unusable path say nothing about the peer.
 *
 * RE-STAGING IS REFUSED BECAUSE IT WOULD DESTROY EVIDENCE. The record holds the
 * FIRST verdict taken on this proposal. Overwriting it with a second verdict
 * would replace a measurement with a later measurement and leave no trace that
 * the first existed — and the first is the one that was taken against the bytes
 * as they arrived. A peer that wishes to re-propose does so with a new
 * `proposalId`, which is a different record.
 */
export function stage(
  root: string | null,
  env: PatchEnvelope,
  verdict: PatchVerdict,
  options?: { readonly staging?: 'quarantined' | 'received' },
): StoreOutcome<QuarantineRecord> {
  if (root === null) {
    return {
      ok: false,
      wrote: false,
      value: null,
      reason:
        'no workspace root: the walk from the current directory found no directory containing BOTH `AGENTS.md` ' +
        'and `plan/`. A quarantine written under a guessed root is a quarantine nobody will find.',
    }
  }
  const proposalId = env.proposal?.proposalId
  if (typeof proposalId !== 'string' || proposalId.trim().length === 0) {
    return { ok: false, wrote: false, value: null, reason: 'the envelope names no proposalId, so there is no key to stage it under.' }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(proposalId)) {
    return {
      ok: false,
      wrote: false,
      value: null,
      reason:
        `proposalId \`${proposalId}\` contains characters outside [A-Za-z0-9._-]; it is used as a directory name, ` +
        `so a separator or a relative segment would write outside quarantine.`,
    }
  }
  const base = quarantineRoot(root)
  if (base === null) return { ok: false, wrote: false, value: null, reason: 'quarantine root could not be derived from the resolved workspace root.' }
  const directory = join(base, proposalId)
  if (existsSync(directory)) {
    return {
      ok: false,
      wrote: false,
      value: null,
      reason:
        `\`${proposalId}\` is already staged. Re-staging would replace the record of the first verdict, and that ` +
        `record is evidence. Re-propose with a new proposalId instead.`,
    }
  }

  const sealed = sealEnvelope(env)
  const record: QuarantineRecord = {
    proposalId,
    packageId: env.package?.packageId ?? '',
    from: env.proposal?.from ?? '',
    stagedAt: verdict.censusAt,
    envelopeHash: sealed,
    verdict: {
      verdict: verdict.verdict,
      checks: verdict.checks,
      admitted: verdict.admitted,
      refusalReasons: verdict.refusalReasons,
      staging: options?.staging ?? 'quarantined',
    },
    ladder: [
      {
        proposalId,
        from: null,
        to: 'quarantined',
        at: verdict.censusAt,
        reason: 'received and verified before quarantine; nothing lands in the live market from a peer.',
      },
    ],
  }

  try {
    mkdirSync(directory, { recursive: true })
  } catch (error) {
    return {
      ok: false,
      wrote: false,
      value: null,
      reason: `could not create ${directory}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const envelopeWrite = writeAtomic(join(directory, ENVELOPE_FILENAME), JSON.stringify(env, null, 2))
  if (!envelopeWrite.ok) return { ok: false, wrote: false, value: null, reason: envelopeWrite.reason }

  const recordWrite = writeAtomic(join(directory, RECORD_FILENAME), JSON.stringify(record, null, 2))
  if (!recordWrite.ok) return { ok: false, wrote: true, value: null, reason: recordWrite.reason }

  return { ok: true, wrote: true, value: record, reason: null }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** What a read produced: the record, and whether the seal still holds. */
export interface ReadOutcome {
  readonly record: QuarantineRecord
  /** `null` when the seal holds. A sentence when it does not. */
  readonly sealProblem: string | null
}

/**
 * Read a staged record back and RE-VERIFY ITS SEAL against the bytes present.
 *
 * A parse error and a tamper reading are reported differently on purpose. A file
 * that will not parse is malformed; a file that parses and whose bytes no longer
 * hash to the recorded digest is a file that CHANGED after it was verified. The
 * second is the more serious finding and it would be invisible if both were
 * reported as "could not read".
 */
export function read(root: string | null, proposalId: string): StoreOutcome<ReadOutcome> {
  const base = quarantineRoot(root)
  if (base === null) return { ok: false, wrote: false, value: null, reason: 'no workspace root, so there is no quarantine to read from.' }
  const directory = join(base, proposalId)
  const recordPath = join(directory, RECORD_FILENAME)
  const envelopePath = join(directory, ENVELOPE_FILENAME)

  if (!existsSync(recordPath)) return { ok: false, wrote: false, value: null, reason: `no record for \`${proposalId}\` at ${recordPath}.` }

  let record: QuarantineRecord
  try {
    record = JSON.parse(readFileSync(recordPath, { encoding: 'utf8' })) as QuarantineRecord
  } catch (error) {
    return { ok: false, wrote: false, value: null, reason: `record for \`${proposalId}\` does not parse: ${error instanceof Error ? error.message : String(error)}` }
  }

  let sealProblem: string | null = null
  if (!existsSync(envelopePath)) {
    sealProblem = 'the envelope bytes are absent, so the seal CANNOT be re-checked. An absent reading is not a failed seal.'
  } else {
    try {
      const present = JSON.parse(readFileSync(envelopePath, { encoding: 'utf8' })) as PatchEnvelope
      const recomputed = sealEnvelope(present)
      if (recomputed !== record.envelopeHash) {
        sealProblem =
          `SEAL MISMATCH: the bytes present hash to ${recomputed.slice(0, 16)}… while the record sealed ` +
          `${String(record.envelopeHash).slice(0, 16)}…. The file changed after it was verified.`
      }
    } catch (error) {
      sealProblem = `the envelope bytes do not parse, so the seal could not be re-checked: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return { ok: true, wrote: false, value: { record, sealProblem }, reason: null }
}

// ---------------------------------------------------------------------------
// Revert
// ---------------------------------------------------------------------------

/**
 * Move a staged record to `reverted`, appending a ladder entry.
 *
 * A REASON IS REQUIRED AND A BLANK ONE IS REFUSED. An undo with no stated cause
 * is indistinguishable from an accident, and the ladder is the only place the
 * distinction can be recorded. This is also the one place the module is strict
 * about its own input rather than about the peer's: the caller is this system.
 *
 * The envelope and the original verdict are LEFT IN PLACE. Reverting is a move
 * in the ladder, not a deletion, because the record of what was received and
 * what was found about it outlives the decision to undo it.
 */
export function revert(root: string | null, proposalId: string, reason: string, at: Date): StoreOutcome<QuarantineRecord> {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return { ok: false, wrote: false, value: null, reason: 'revert requires a non-empty reason; an undo with no stated cause is indistinguishable from an accident.' }
  }
  const base = quarantineRoot(root)
  if (base === null) return { ok: false, wrote: false, value: null, reason: 'no workspace root, so there is no quarantine to revert from.' }
  const directory = join(base, proposalId)
  const recordPath = join(directory, RECORD_FILENAME)
  if (!existsSync(recordPath)) return { ok: false, wrote: false, value: null, reason: `no record for \`${proposalId}\`.` }

  let current: QuarantineRecord
  try {
    current = JSON.parse(readFileSync(recordPath, { encoding: 'utf8' })) as QuarantineRecord
  } catch (error) {
    return { ok: false, wrote: false, value: null, reason: `record for \`${proposalId}\` does not parse: ${error instanceof Error ? error.message : String(error)}` }
  }

  const last = current.ladder.length === 0 ? null : current.ladder[current.ladder.length - 1].to
  if (last === 'reverted') {
    return { ok: false, wrote: false, value: null, reason: `\`${proposalId}\` is already reverted; a second entry would record one event twice in an append-only ladder.` }
  }

  const entry: LadderEntry = { proposalId, from: last, to: 'reverted', at: at.toISOString(), reason: reason.trim() }
  const updated: QuarantineRecord = { ...current, ladder: [...current.ladder, entry] }

  const written = writeAtomic(recordPath, JSON.stringify(updated, null, 2))
  if (!written.ok) return { ok: false, wrote: false, value: null, reason: written.reason }
  return { ok: true, wrote: true, value: updated, reason: null }
}

// ---------------------------------------------------------------------------
// Census
// ---------------------------------------------------------------------------

/** How many proposals are staged, and of those, how many actually parse. */
export interface QuarantineCensus {
  /** The number of subdirectories under quarantine carrying a sealed file. */
  readonly sealedFileCount: number
  /** Of those, how many yielded a readable record. */
  readonly parseableCount: number
  /** `null` when there was no quarantine directory to count — NOT zero. */
  readonly quarantineDirectoryExists: boolean
  /** Why the census could not be taken, when it could not. */
  readonly reason: string | null
  /** Per-proposal states, for the readers that want them. */
  readonly states: readonly { readonly proposalId: string; readonly state: string | null }[]
}

/**
 * Count what is staged, keeping THREE numbers apart that are easily conflated.
 *
 * `sealedFileCount` and `parseableCount` are different readings of different
 * populations: the first counts directories that contain a record file, the
 * second counts those whose record actually parses. A census that reported only
 * the first would overstate how much can be read; one that reported only the
 * second would silently drop a corrupt record from the total.
 *
 * A MISSING QUARANTINE DIRECTORY IS NOT A COUNT OF ZERO. `quarantineDirectoryExists`
 * is a separate field because "no patches are staged" and "this instance has
 * never staged anything, so the directory does not exist" are different facts,
 * and this program has paid for collapsing them more than once.
 */
export function census(root: string | null): QuarantineCensus {
  const base = quarantineRoot(root)
  if (base === null) {
    return { sealedFileCount: 0, parseableCount: 0, quarantineDirectoryExists: false, reason: 'no workspace root, so no quarantine directory could be located (NOT the same as an empty quarantine).', states: [] }
  }
  if (!existsSync(base)) {
    return { sealedFileCount: 0, parseableCount: 0, quarantineDirectoryExists: false, reason: null, states: [] }
  }
  let entries: string[] = []
  try {
    entries = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    return { sealedFileCount: 0, parseableCount: 0, quarantineDirectoryExists: true, reason: `quarantine directory could not be listed: ${error instanceof Error ? error.message : String(error)}`, states: [] }
  }

  const states: { proposalId: string; state: string | null }[] = []
  let sealedFileCount = 0
  let parseableCount = 0
  for (const proposalId of entries) {
    const recordPath = join(base, proposalId, RECORD_FILENAME)
    if (!existsSync(recordPath)) {
      states.push({ proposalId, state: null })
      continue
    }
    sealedFileCount += 1
    try {
      const record = JSON.parse(readFileSync(recordPath, { encoding: 'utf8' })) as QuarantineRecord
      parseableCount += 1
      const last = record.ladder.length === 0 ? null : record.ladder[record.ladder.length - 1].to
      states.push({ proposalId, state: last === null ? null : (last as Verdict | string) })
    } catch {
      states.push({ proposalId, state: null })
    }
  }

  return { sealedFileCount, parseableCount, quarantineDirectoryExists: true, reason: null, states }
}
