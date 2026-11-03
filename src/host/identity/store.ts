/**
 * ============================================================================
 * dsh-meta-market / host / identity — the local record, and its three states
 * ============================================================================
 *
 * THE TRUST ROOT LIVES HERE, ON DISK, IN A FILE NO PEER CAN REACH
 *
 * `trust.ts` owns the RULE. This module owns the fact the rule reads. The split
 * matters because the rule's strength is bounded by where its input comes from,
 * and the input comes from a file the owner writes and a peer cannot.
 *
 * **ABSENT, EMPTY AND UNREADABLE ARE THREE DIFFERENT STATES AND ARE KEPT
 * SEPARATE.** This is the module's reason to exist as its own file rather than a
 * function inside `trust.ts`, and it is this program's most-expensive recurring
 * defect:
 *
 *   - **ABSENT** — no file. Nothing is known about who the owner admits. This is
 *     an absence of a READING, and it must not be reported as a fact about peers.
 *   - **EMPTY** — a file, correctly parsed, listing nobody. A positive claim: the
 *     owner has admitted no peers, and nobody may be granted.
 *   - **UNREADABLE** — a file that exists and cannot be parsed. The reading
 *     FAILED, which is neither of the above and must be reported as a failure.
 *
 * A module that collapsed these into `{}` would report all three as "no peers
 * admitted" and would look secure in every case — including the case where the
 * allowlist was simply misplaced, which is the case an operator most needs to
 * see. **The safe default and the correct diagnosis are not the same thing.**
 *
 * The admission RULE already refuses everyone the store does not name, so
 * collapsing the states would not admit anyone wrongly. That is exactly why the
 * defect would be invisible: nothing would break, and a real configuration error
 * would be indistinguishable from a working, restrictive deployment.
 *
 * @module dsh-meta-market/host/identity/store
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { EMPTY_TRUST_STORE, type PeerRecord, type TrustLevel, type TrustStore, type TrustStoreReading } from './trust.ts'

/**
 * The store's filename, **inside the workspace's `tmp/`** — not the harness home.
 *
 * Deliberately NOT in `$DSH_HOME`, where the anonymous id lives. The id is
 * minted by the harness and shared by every process; the allowlist is this
 * program's own artifact and a peer's process has no business reading it. Two
 * files in one directory would also invite the reading that both are equally
 * protected, and they are not.
 */
export const TRUST_STORE_FILE = 'meta-market-trust.json'

/**
 * Where the store would live, given a workspace root.
 *
 * Resolved by the CALLER rather than read from an environment variable here, so
 * a test can point at a fixture without mutating the process environment — the
 * pattern that makes the harness in `verify/identity-attack.ts` hermetic.
 *
 * @param workspaceRoot - the workspace root to resolve against.
 * @returns the absolute path the store would occupy.
 */
export function trustStorePath(workspaceRoot: string): string {
  return join(workspaceRoot, 'tmp', TRUST_STORE_FILE)
}

/**
 * Read the trust store, preserving absence, emptiness and unreadability apart.
 *
 * **The file is NOT created by this function, and that is deliberate.** A reader
 * that creates what it reads turns "the owner has not written an allowlist" into
 * "the owner has written an empty one" — destroying the distinction above at the
 * moment it is most needed, and on a read path, which is the wrong place for a
 * write. The owner creates the file; this function reports not finding it.
 *
 * @param path - the absolute path to read.
 * @returns the reading, with `store: null` and a `reason` when nothing usable was found.
 */
export function readTrustStore(path: string): TrustStoreReading {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      bytes: null,
      store: null,
      reason: `${path} does not exist, so this instance has no allowlist. This is an ABSENT READING, not an empty allowlist: the owner may have written one elsewhere, and reporting an empty store here would make a misconfigured path indistinguishable from a restrictive deployment.`,
    }
  }
  let text: string
  let bytes: number
  try {
    bytes = statSync(path).size
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return {
      path,
      exists: true,
      bytes: null,
      store: null,
      reason: `${path} exists but could not be read: ${error instanceof Error ? error.message : String(error)}. This is a FAILED READING — distinct from both an absent and an empty store — and no peer may be granted on it.`,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      path,
      exists: true,
      bytes,
      store: null,
      reason: `${path} exists (${bytes} B) and is not valid JSON: ${error instanceof Error ? error.message : String(error)}. A malformed allowlist is a FAILED READING, never an empty one.`,
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { path, exists: true, bytes, store: null, reason: `${path} exists (${bytes} B) and is valid JSON but is not an object, so it cannot be an allowlist.` }
  }
  const source = parsed as Record<string, unknown>
  const admitted = stringArray(source['admitted'])
  const refused = stringArray(source['refused'])
  if (admitted === null || refused === null) {
    return { path, exists: true, bytes, store: null, reason: `${path} exists (${bytes} B) but its \`admitted\` or \`refused\` field is present and not an array of strings. A PARTIAL reading is a failed one: half an allowlist must not be trusted as a whole.` }
  }
  const observed = observedMap(source['observed'])
  return {
    path,
    exists: true,
    bytes,
    store: { admitted, refused, observed },
    reason: null,
  }
}

/**
 * The trust level for one peer, from a store alone.
 *
 * **`observedVia` is decided before `level`, and the order is the whole point.**
 * A peer listed in `refused` is `owner-refused` no matter what else the store
 * says, because a refusal must not be overridable by a second entry — a store
 * that admitted AND refused the same id would otherwise be read as an admission
 * by whichever branch ran first.
 *
 * A peer in `observed` but in NEITHER list is `peer-presented`, which reaches
 * only `discover`. That is the case that matters: **being seen is not being
 * trusted**, and a store that grew a level for every peer it had ever seen would
 * promote a peer by the act of talking to it.
 *
 * @param store - the parsed store, or `null` when the reading failed.
 * @param instanceId - the peer to look up.
 * @returns the record, or `null` when the store names no such peer.
 */
export function recordFor(store: TrustStore | null, instanceId: string): PeerRecord | null {
  if (store === null) return null

  const seen = Object.hasOwn(store.observed, instanceId) ? store.observed[instanceId] : undefined
  const sightings = seen === undefined
    ? { count: 0, of: 0 }
    : { count: seen.sightings, of: seen.sightings }

  if (store.refused.includes(instanceId)) {
    return {
      instanceId,
      level: 'unknown',
      observedVia: 'owner-refused',
      firstSeenAt: seen?.firstSeenAt ?? null,
      lastSeenAt: seen?.lastSeenAt ?? null,
      sightings,
      reason: 'The owner listed this id under `refused`. That is consulted BEFORE `admitted`, so an id appearing in both lists is refused rather than admitted — a refusal cannot be overridden by a second entry.',
    }
  }

  if (store.admitted.includes(instanceId)) {
    return {
      instanceId,
      level: 'vetted',
      observedVia: 'owner-admitted',
      firstSeenAt: seen?.firstSeenAt ?? null,
      lastSeenAt: seen?.lastSeenAt ?? null,
      sightings,
      reason: 'The owner listed this id under `admitted`. This is the ONLY path to a level above `observed`, and it is a human act on a local file rather than anything a peer sent.',
    }
  }

  if (seen !== undefined) {
    return {
      instanceId,
      level: 'observed',
      observedVia: 'peer-presented',
      firstSeenAt: seen.firstSeenAt,
      lastSeenAt: seen.lastSeenAt,
      sightings,
      reason: 'This instance has seen a card from this id, and the owner has neither admitted nor refused it. Observation is recorded from the peer\'s OWN presentation, so it reaches only `discover` — being seen is not being trusted.',
    }
  }

  return null
}

/** `levelFor` — the level alone, for a caller that does not need the whole record. */
export function levelFor(store: TrustStore | null, instanceId: string): TrustLevel {
  return recordFor(store, instanceId)?.level ?? 'unknown'
}

/** A string array if the value is one, else `null` — so `[]` and `undefined` stay distinct. */
function stringArray(value: unknown): readonly string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  return value.every(entry => typeof entry === 'string') ? (value as readonly string[]) : null
}

/** The `observed` map, keeping a malformed entry out rather than coercing it. */
function observedMap(value: unknown): TrustStore['observed'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<string, { readonly firstSeenAt: string; readonly lastSeenAt: string; readonly sightings: number }> = {}
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const firstSeenAt = typeof row['firstSeenAt'] === 'string' ? row['firstSeenAt'] : null
    const lastSeenAt = typeof row['lastSeenAt'] === 'string' ? row['lastSeenAt'] : null
    const sightings = typeof row['sightings'] === 'number' && Number.isFinite(row['sightings']) ? row['sightings'] : 0
    if (firstSeenAt === null || lastSeenAt === null) continue
    out[id] = { firstSeenAt, lastSeenAt, sightings }
  }
  return out
}

/** Re-exported so a caller need not reach into `trust.ts` for the empty value. */
export { EMPTY_TRUST_STORE }
