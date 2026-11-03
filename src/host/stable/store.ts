/**
 * L6 — where the ledger LIVES, and why a write reported here is a write that happened.
 *
 * THE PATH IS `<workspace>/.dsh/meta-market/stable-official/ledger.json`, and it is chosen to sit BESIDE
 * the patch lane's quarantine (`.dsh/meta-market/quarantine`) rather than because a dot-directory is
 * tidy: both are runtime state under the program workspace, both are found by walking up for the same two
 * anchors, and a reader who knows where one lives knows where the other lives. The path is EXPORTED as a
 * value (`STORE_REL`) so the runbook, the driver and a reader's `ls` cannot disagree.
 *
 * THIS IS A REAL PERSISTED ARTIFACT AND NOT AN IN-MODULE CONSTANT, and the reason is the owner's own
 * sentence — "stored in the meta market". A constant in a source file is a copy of a measurement that
 * cannot be aged: it has no census time of its own, it cannot be rewritten when the profile changes, and
 * the one thing a store must do after an ALTERNATION is change, which a constant cannot. What this module
 * will NOT do is pretend: a failed write returns `{ ok: false, wrote: false, reason }`, and a read of a
 * file that does not exist returns a reason naming the path rather than an empty ledger.
 *
 * THE SEAL IS RE-CHECKED ON READ, for the reason `patch/quarantine.ts` records: a file on disk is not the
 * file that was written. The digest is taken over a KEY-SORTED serialisation of the ledger, because two
 * encoders that agree on content disagree on key order and a seal that depends on the writer's key order
 * is not a seal. The seal covers the LEDGER, not the envelope around it, and a mismatch is reported as a
 * tamper reading rather than as a parse error — those are different findings and merging them hides the
 * serious one.
 *
 * TWO WRITES, ONE OF THEM ATOMIC, AND THE LIMIT STATED. `writeLedger` writes a temporary sibling and
 * renames over the destination, so a reader sees the previous file in full or the new one in full and
 * never a truncated pair. `applyAlternation` in `./alternation.ts` reads, edits and re-writes through the
 * same function; there is NO lock, so two concurrent writers can lose one write. That is stated rather
 * than papered over, and the falsifier in `LANE_SUMMARY` names it.
 *
 * @module dsh-meta-market/host/stable/store
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { Sha256Hex, StableLedger, StoreOutcome } from './types.ts'
import { HASH_ALGORITHM } from '../patch/types.ts'

/** The directory, relative to the program workspace root. Beside `patch/quarantine`, deliberately. */
export const STORE_REL = '.dsh/meta-market/stable-official'

/** The single file the ledger is written to. One file, because a directory of records has no atomic cut. */
export const STORE_FILENAME = 'ledger.json'

/** Bumped when the stored shape changes incompatibly. A reader refuses an unknown version. */
export const STORE_SCHEMA_VERSION = 1

/** What is written: the ledger, the seal over it, and the algorithm named beside the digest. */
export interface LedgerFile {
  readonly schemaVersion: number
  readonly sealedAt: string
  readonly algorithm: typeof HASH_ALGORITHM
  readonly sealedSha256: Sha256Hex
  readonly ledger: StableLedger
}

/** The absolute path of the ledger for a root, or `null` when there is no root. */
export function ledgerPath(root: string | null): string | null {
  if (root === null) return null
  return join(root, STORE_REL, STORE_FILENAME)
}

/**
 * Serialise a value with sorted keys, so the digest does not depend on the writer's key order.
 *
 * `undefined` members are dropped (matching JSON's own behaviour) and a non-finite number becomes `null`,
 * because `JSON.stringify(NaN)` is `null` and a seal computed over a different rendering would disagree
 * with the bytes a reader can reproduce.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    const parts: string[] = []
    for (const key of keys) {
      const entry = record[key]
      if (typeof entry === 'undefined') continue
      parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`)
    }
    return `{${parts.join(',')}}`
  }
  return 'null'
}

/** The seal over a ledger: sha256 of its canonical serialisation. */
export function sealLedger(ledger: StableLedger): Sha256Hex {
  return createHash(HASH_ALGORITHM).update(new TextEncoder().encode(canonicalJson(ledger))).digest('hex')
}

/**
 * Write a ledger atomically, reporting whether bytes actually reached the disk.
 *
 * `wrote` is separate from `ok` because a dry run is `ok` and not `wrote`, and because a caller that
 * treats "refused" and "the filesystem failed" alike will report an outage that never happened.
 */
export function writeLedger(root: string | null, ledger: StableLedger): StoreOutcome<string> {
  const path = ledgerPath(root)
  if (path === null || root === null) {
    return { ok: false, wrote: false, value: null, reason: 'no workspace root, so there is no defined place to write the ledger; a store written under a guessed root is a store nobody finds' }
  }
  const file: LedgerFile = {
    schemaVersion: STORE_SCHEMA_VERSION,
    sealedAt: ledger.writtenAt,
    algorithm: HASH_ALGORITHM,
    sealedSha256: sealLedger(ledger),
    ledger,
  }
  const temporary = `${path}.tmp-${String(process.pid)}-${String(Date.now())}`
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8' })
    renameSync(temporary, path)
    return { ok: true, wrote: true, value: path, reason: null }
  } catch (error) {
    try {
      if (existsSync(temporary)) writeFileSync(temporary, '', { encoding: 'utf8' })
      if (existsSync(temporary)) renameSync(temporary, `${temporary}.failed`)
    } catch {
      // A cleanup failure must not replace the failure that caused it. The outcome below reports the original.
    }
    return { ok: false, wrote: false, value: null, reason: `could not write ${path}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Read the ledger and RE-CHECK ITS SEAL against the bytes present. */
export function readLedger(root: string | null): StoreOutcome<{ readonly ledger: StableLedger; readonly sealProblem: string | null; readonly path: string; readonly seal: Sha256Hex | null }> {
  const path = ledgerPath(root)
  if (path === null) {
    return { ok: false, wrote: false, value: null, reason: 'no workspace root, so there is no ledger to read; an absent path is not an empty ledger' }
  }
  if (!existsSync(path)) {
    return { ok: false, wrote: false, value: null, reason: `no ledger at ${path}; nothing has written one yet, which is an absence of a store and not a store with no records` }
  }
  let file: LedgerFile
  try {
    file = JSON.parse(readFileSync(path, { encoding: 'utf8' })) as LedgerFile
  } catch (error) {
    return { ok: false, wrote: false, value: null, reason: `the ledger at ${path} does not parse: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (file.schemaVersion !== STORE_SCHEMA_VERSION) {
    return {
      ok: false,
      wrote: false,
      value: null,
      reason: `the ledger at ${path} declares schemaVersion ${String(file.schemaVersion)} while this build writes ${String(STORE_SCHEMA_VERSION)}; refused rather than read as if the shapes matched`,
    }
  }
  if (file.ledger === undefined || file.ledger === null) {
    return { ok: false, wrote: false, value: null, reason: `the ledger at ${path} carries no \`ledger\` member; the file exists and holds nothing this lane can read` }
  }
  const recomputed = sealLedger(file.ledger)
  const sealProblem =
    recomputed === file.sealedSha256
      ? null
      : `SEAL MISMATCH: the ledger bytes present hash to ${recomputed.slice(0, 16)}… while the file sealed ${String(file.sealedSha256).slice(0, 16)}…. The ledger changed after it was written.`
  return { ok: true, wrote: false, value: { ledger: file.ledger, sealProblem, path, seal: file.sealedSha256 }, reason: null }
}
