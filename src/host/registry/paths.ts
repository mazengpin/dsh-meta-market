/**
 * ============================================================================
 * dsh-meta-market — path resolution that survives the bundle
 * ============================================================================
 *
 * WHY THIS FILE EXISTS, AND WHAT IT COSTS TO NOT HAVE IT
 *
 * The first version of this lane resolved the profile with a fixed relative
 * walk from `import.meta.url`: `resolve(HERE, '../../../../../profiles-tree/personal-dev')`.
 * That is CORRECT in source (`src/host/registry/`) and WRONG in the built bundle,
 * because `tsdown` emits `lib/index.js` and this module's `import.meta.url` then
 * points at `<clone>/lib/` — two segments shallower than the source tree it was
 * written against. Measured on the live `3083` surface:
 *
 *   `profile manifest unreadable at C:\Users\0000\profiles-tree\personal-dev/package.json`
 *
 * — `/Projects/deepseek-root` silently missing, i.e. the walk climbed one
 * directory too far and landed in the home directory. The Meta-Plugins window
 * then reported `unavailable` for a PATH error while the data underneath was
 * fine, which is the worst shape an absence can take: it looks like the plugin
 * layer is missing when it is the instrument that is lost.
 *
 * **A COUNT OF `../` IS A BET ON WHERE THE FILE WILL BE EMITTED.** So this module
 * stops counting and walks UP looking for a fixed SHAPE instead — the profile's
 * `profiles-tree/personal-dev/package.json`, or this package's own
 * `package.json` name — and reports the directories it searched when nothing is
 * found. `HOME` is deliberately never consulted: on this machine the checkout is
 * not under the home directory, so a home-anchored path is wrong by construction.
 *
 * Found by `surface-host` (report with reproduction), fixed here rather than by
 * changing the caller. `AGENTS.md`'s rule applies: the lane that owns the
 * instrument repairs the instrument.
 *
 * @module dsh-meta-market/host/registry/paths
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The directory this module's source (or bundle) lives in. */
export const HERE = dirname(fileURLToPath(import.meta.url))

/** How far up any shape search may climb. Twelve covers `src/host/registry` and `lib`. */
const MAX_LEVELS = 12

export interface SearchResult {
  /** `null` = NOT FOUND, never a guess. */
  readonly path: string | null
  /** Every directory that was asked, so a null can be audited rather than believed. */
  readonly searched: readonly string[]
}

function ancestors(startDir: string): string[] {
  const levels: string[] = []
  let current = resolve(startDir)
  for (let level = 0; level < MAX_LEVELS; level += 1) {
    levels.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return levels
}

/** Walk up from `startDir` and return the first ancestor satisfying `predicate`. */
export function findUp(startDir: string, predicate: (dir: string) => boolean): SearchResult {
  const searched: string[] = []
  for (const dir of ancestors(startDir)) {
    searched.push(dir)
    if (predicate(dir)) return { path: dir, searched }
  }
  return { path: null, searched }
}

/** Walk up collecting the first `relativePath` that exists below any ancestor. */
export function findArtifact(startDir: string, relativePaths: readonly string[]): SearchResult {
  const searched: string[] = []
  for (const dir of ancestors(startDir)) {
    for (const relative of relativePaths) {
      const candidate = resolve(dir, relative)
      searched.push(candidate)
      if (existsSync(candidate)) return { path: candidate, searched }
    }
  }
  return { path: null, searched }
}

function readPackageName(dir: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (parsed && typeof parsed === 'object') {
      const name = (parsed as Record<string, unknown>).name
      return typeof name === 'string' ? name : null
    }
  } catch {
    // An unreadable manifest is not a name; the caller keeps walking.
  }
  return null
}

/**
 * This package's own root — the directory whose `package.json` is named
 * `dsh-meta-market`. In source that is three levels above this file; in the
 * bundle it is one. Neither number is written down.
 */
export function resolveCloneRoot(): string | null {
  return findUp(HERE, (dir) => readPackageName(dir) === 'dsh-meta-market').path
}

/** The checkout root that relative `link:` specs resolve against — the parent of the clone. */
export function resolvePluginsSrcDir(): string | null {
  const cloneRoot = resolveCloneRoot()
  return cloneRoot === null ? null : dirname(cloneRoot)
}

/**
 * The live profile this program develops in.
 *
 * Precedence: explicit environment override, then the fixed shape
 * `<ancestor>/profiles-tree/personal-dev/package.json`. `HOME` is never used.
 *
 * **THE FIRST FIX RETURNED THE ANCESTOR INSTEAD OF THE PROFILE**, and the probe
 * caught it because the ancestor (`deepseek-root`) also contains a manifest —
 * just not the profile's. A shape search must return the path the SHAPE names,
 * not the directory it was found under; the two differ by exactly the relative
 * suffix, and only an `existsSync` on the RESULT can tell them apart.
 */
export function resolveProfileDir(): SearchResult {
  return resolveProfileDirFrom(HERE)
}

/**
 * The same search, from an explicit start directory.
 *
 * Exported so the verify driver can prove the BUNDLE layout resolves too, by
 * starting at `<clone>/lib` — the depth at which the reported defect appeared —
 * without copying a file into `lib/` (a shared build output this lane must not
 * write).
 */
export function resolveProfileDirFrom(startDir: string): SearchResult {
  const override = process.env.DSH_META_MARKET_PROFILE_DIR
  if (override && override.trim() !== '') {
    const candidate = resolve(override)
    return { path: existsSync(join(candidate, 'package.json')) ? candidate : null, searched: [candidate] }
  }
  const suffix = 'profiles-tree/personal-dev'
  const found = findUp(startDir, (dir) => existsSync(join(dir, suffix, 'package.json')))
  return { path: found.path === null ? null : resolve(found.path, suffix), searched: found.searched }
}

/**
 * The live catalog cache, resolved by SHAPE so the bundle and the source agree.
 *
 * Both emitted layouts are searched in each ancestor: `data/…` (bundle beside
 * `lib/`, or a future copy at the clone root) and `src/host/registry/data/…`
 * (the source tree this lane owns).
 */
export function resolveLiveCatalogCache(): string | null {
  return findArtifact(HERE, [
    'src/host/registry/data/plugins-live-2026-10-17.json',
    'data/plugins-live-2026-10-17.json',
    'registry/data/plugins-live-2026-10-17.json',
  ]).path
}

/**
 * The 4,527-row snapshot, which the workspace owns and this clone does not copy.
 *
 * Anchored to the RESOLVED profile directory rather than to a `../` count, so a
 * moved checkout and a bundled artifact resolve it identically.
 */
export function resolveSnapshotCatalogCache(): string | null {
  const override = process.env.DSH_META_MARKET_SNAPSHOT_CATALOG
  if (override && override.trim() !== '') {
    const candidate = resolve(override)
    return existsSync(candidate) ? candidate : null
  }
  const profile = resolveProfileDir()
  if (profile.path !== null) {
    const candidate = resolve(profile.path, 'dsh-meta-evolve_INIT_WORKSPACE/research/cache/plugins-2026-10-12.json')
    if (existsSync(candidate)) return candidate
  }
  return findArtifact(HERE, [
    'research/cache/plugins-2026-10-12.json',
    '../dsh-meta-evolve_INIT_WORKSPACE/research/cache/plugins-2026-10-12.json',
  ]).path
}

/**
 * A human-readable anchor report, used inside an `unavailable.reason` so a reader
 * of a failed half can see which directories the search actually visited.
 */
export function describeSearch(label: string, searched: readonly string[]): string {
  return `${label}: searched ${searched.length} path(s): ${searched.join(', ')}`
}
