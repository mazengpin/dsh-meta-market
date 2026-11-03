/**
 * The three reference populations the original-intent gate refuses against, loaded from REAL sources.
 *
 * THE POPULATIONS ARE ENUMERATED, NOT TYPED OUT. A hand-written list of "stable plugins" would be a
 * claim about the ecosystem made by whoever typed it; every entry here is traced to a file or a catalog
 * row, and each carries its `source` so a reader can re-derive it:
 *
 *   - `stable`   — the NON-official entries of the profile's own `dsh.profile.bundles`, resolved to a
 *                  clone under `plugins-src/` and matched to a catalog row by `name` OR `npm`.
 *   - `official` — the `@deepseek-ai/*` entries of the same bundles array, resolved to their manifests
 *                  in the harness checkout.
 *   - `meta`     — the six meta plugins the task names, resolved to clones.
 *
 * THE STABLE POPULATION IS THE LIVE MANIFEST, WHICH MOVES. Measured twice during this lane: at
 * 2026-10-17T21:41Z the bundles array held **40** entries; at **21:44:36Z** it held **41**, because
 * `dsh-meta-market` itself was appended to it by the lane that owns that file. The task brief says
 * "40 bundles" and that was true when the brief was written. So the denominator is read at load time
 * and reported with its census instant rather than being copied from a brief — this is the program's
 * "a live store is not a snapshot" rule arriving on the one file the gate's population depends on.
 *
 * WHY `dsh-meta-market` IS EXCLUDED FROM EVERY POPULATION. A candidate that collides with itself is not
 * a collision, and a reference population that contains the thing being judged would report a
 * self-match as evidence of duplication. `dsh-meta-community` is excluded for a different reason: it
 * EXISTS and is owner-authorized, but it is not in the population the task declares, and growing a
 * population to make a gate look stricter is the same defect as shrinking one to make it look greener.
 *
 * @module dsh-meta-market/host/intent-align/references
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CatalogCitation,
  Measured,
  ReferenceOutcome,
  ReferenceOptions,
  ReferenceSignature,
  ReferenceSource,
  ZoneSpace,
} from './types.ts'
import { signCandidate } from './signature.ts'

/** The six existing meta plugins the task names as the third class. */
export const META_PLUGIN_IDS: readonly string[] = [
  'dsh-intent-map',
  'dsh-intent-mode',
  'dsh-tools-skills-evolve',
  'dsh-skill-evolution',
  'dsh-memento',
  'dsh-memory-delta',
]

/** The named stable candidate the owner and the CONTRACT single out, kept as a constant for citation. */
export const NAMED_STABLE_CANDIDATE = 'dsh-market'

/** This package. Excluded from the populations, because a self-match is not a collision. */
export const SELF_ID = 'dsh-meta-market'

/** The deepseek-root checkout, as the default roots. Absolute because the plugin runs from anywhere. */
const DEFAULT_PLUGINS_SRC = 'C:/Users/0000/Projects/deepseek-root/plugins-src'
const DEFAULT_PROFILE_ROOT = 'C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev'
const DEFAULT_HARNESS_ROOT = 'C:/Users/0000/Projects/deepseek-root/deepseek-harness'
const DEFAULT_CATALOG =
  'C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE/research/cache/plugins-2026-10-12.json'

/** The subset of a `package.json` this module reads. */
interface Manifest {
  readonly name?: unknown
  readonly description?: unknown
  readonly version?: unknown
}

/** One catalog row, reduced to the fields a citation needs. */
interface CatalogRow {
  readonly name?: unknown
  readonly npm?: unknown
  readonly owner?: unknown
  readonly description?: unknown
}

/** Read a JSON file, or `null`. A missing or malformed manifest is an ABSENCE, never a silent stub. */
function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** The `description` of a manifest as a string, or `null` when it is absent or not text. */
function manifestText(manifest: Manifest): string | null {
  return typeof manifest.description === 'string' && manifest.description.trim() !== ''
    ? manifest.description
    : null
}

/**
 * The `description` of a CATALOG row as a string, or `null`.
 *
 * The catalog stores `{ en, zh }`, not a string — measured over the whole census: **4,527 of 4,527**
 * rows carry an object here. A lane that reads the field as a string gets the literal text
 * `[object Object]` for every row, which produces an all-neutral signature indistinguishable from a
 * clean corpus.
 */
function catalogText(row: CatalogRow): string | null {
  const value = row.description
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (value !== null && typeof value === 'object') {
    const en = (value as { en?: unknown }).en
    if (typeof en === 'string' && en.trim() !== '') return en
  }
  return null
}

/**
 * Match catalog rows by `name` OR `npm`.
 *
 * A name is not a unique key: the census carries 4,527 rows under 4,226 distinct names, and
 * `dsh-plugin-marketplace` alone resolves to two different plugins by two different owners. The FULL
 * match list is returned rather than its first element, so a caller can report `rowCount` and so the
 * fallback text below is taken from a row that was actually matched.
 */
function matchCatalog(rows: readonly CatalogRow[], keys: readonly string[]): readonly CatalogRow[] {
  const wanted = keys.filter((k) => k !== '').map((k) => k.toLowerCase())
  if (wanted.length === 0) return []
  return rows.filter((row) => {
    const name = typeof row.name === 'string' ? row.name.toLowerCase() : ''
    const npm = typeof row.npm === 'string' ? row.npm.toLowerCase() : ''
    return wanted.includes(name) || wanted.includes(npm)
  })
}

/** Reduce a match list to the citation a verdict travels with. `rowCount` is what disambiguates it. */
function citeFrom(matches: readonly CatalogRow[]): CatalogCitation | null {
  const first = matches[0]
  if (first === undefined) return null
  return {
    name: typeof first.name === 'string' ? first.name : '',
    npm: typeof first.npm === 'string' ? first.npm : null,
    owner: typeof first.owner === 'string' ? first.owner : null,
    rowCount: matches.length,
  }
}

/**
 * The catalog's own description text for a matched row, or `null`.
 *
 * THIS IS THE ONE PLACE `catalogText` IS CALLED, and it is why the function is not dead code: a clone
 * whose `package.json` carries no `description` would otherwise be dropped from the population as
 * "absent" even though the census states what the plugin does. Falling back to the catalog keeps the
 * reference in the population and records `kind: 'catalog-row'` so a reader knows the text came from
 * the census rather than from the clone.
 */
function catalogFallbackText(matches: readonly CatalogRow[]): string | null {
  const first = matches[0]
  return first === undefined ? null : catalogText(first)
}

/** Build an index from a package name to its directory, over one level of `plugins-src/`. */
function indexClones(pluginsSrc: string): ReadonlyMap<string, string> {
  const index = new Map<string, string>()
  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = readdirSync(pluginsSrc, { withFileTypes: true })
  } catch {
    return index
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(pluginsSrc, entry.name)
    const manifest = readJsonFile(join(dir, 'package.json')) as Manifest | null
    if (manifest === null) continue
    const name = typeof manifest.name === 'string' ? manifest.name : entry.name
    index.set(name, dir)
    // The directory name is also a key, so a bundle entry that names the DIRECTORY rather than the
    // package still resolves. Both are recorded rather than one overriding the other.
    if (!index.has(entry.name)) index.set(entry.name, dir)
  }
  return index
}

/**
 * Index the official `@deepseek-ai/*` manifests in the harness checkout.
 *
 * Bounded to depth 5 and skipping build output, because the checkout is a pnpm workspace whose
 * `node_modules` alone would dominate the walk. Measured 2026-10-17T21:47Z: the bounded walk finds
 * **342** `@deepseek-ai/*` packages, of which the 7 official bundle rows are a subset.
 */
function indexOfficial(harnessRoot: string, maxDepth = 5): ReadonlyMap<string, string> {
  const index = new Map<string, string>()
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return
    let entries: { name: string; isDirectory(): boolean }[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib' || entry.name === 'dist') continue
      const child = join(dir, entry.name)
      const manifest = readJsonFile(join(child, 'package.json')) as Manifest | null
      if (manifest !== null && typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/')) {
        index.set(manifest.name, child)
      }
      walk(child, depth + 1)
    }
  }
  walk(join(harnessRoot, 'packages'), 0)
  return index
}

/** One reference to be built, before it is signed. */
interface PendingReference {
  readonly id: string
  readonly klass: 'stable' | 'official' | 'meta'
  readonly intentText: string
  readonly source: ReferenceSource
}

/**
 * Load and sign every reference population.
 *
 * THE SPACE IS A PARAMETER, NOT A DEFAULT. Comparing a candidate signed in one space against references
 * signed in another is the "scoring across two vector spaces" that `EmbeddingIdentity` exists to
 * forbid, so the caller cannot construct that comparison by omission: `signCandidate` uses the same
 * space object for every reference.
 *
 * A population that loads ZERO entries is reported as a failure of the load rather than as a population
 * of zero, and the difference matters: the gate turns an empty population into `not-measured`, because
 * a unanimous `pass` against nothing is this program's recorded instrument failure.
 */
export async function loadReferenceClasses(
  space: ZoneSpace,
  options: ReferenceOptions = {},
): Promise<ReferenceOutcome> {
  const at = new Date().toISOString()
  const pluginsSrc = options.pluginsSrc ?? process.env.DSH_PLUGINS_SRC ?? DEFAULT_PLUGINS_SRC
  const profileRoot = options.profileRoot ?? DEFAULT_PROFILE_ROOT
  const harnessRoot = options.harnessRoot ?? DEFAULT_HARNESS_ROOT
  const catalogPath = options.catalogPath ?? DEFAULT_CATALOG

  const profile = readJsonFile(join(profileRoot, 'package.json')) as {
    dsh?: { profile?: { bundles?: unknown } }
  } | null
  const bundlesRaw = profile?.dsh?.profile?.bundles
  if (!Array.isArray(bundlesRaw)) {
    return {
      ok: false,
      at,
      reason: `the profile manifest at ${join(profileRoot, 'package.json')} carries no dsh.profile.bundles array, so the stable and official populations cannot be enumerated`,
    }
  }
  const bundles = bundlesRaw.filter((b): b is string => typeof b === 'string')

  const clones = indexClones(pluginsSrc)
  if (clones.size === 0) {
    return {
      ok: false,
      at,
      reason: `no clone under ${pluginsSrc} carries a package.json, so no reference could be read; status 0 is an unread population, not an empty one`,
    }
  }

  const catalogRaw = readJsonFile(catalogPath) as { plugins?: unknown } | unknown[] | null
  const catalogRows: readonly CatalogRow[] = Array.isArray(catalogRaw)
    ? (catalogRaw as CatalogRow[])
    : ((catalogRaw as { plugins?: unknown } | null)?.plugins as CatalogRow[] | undefined) ?? []

  const officialIndex = indexOfficial(harnessRoot)
  const absent: string[] = []
  const pending: PendingReference[] = []

  const officialBundles = bundles.filter((b) => b.startsWith('@deepseek-ai/'))
  const stableBundles = bundles.filter((b) => !b.startsWith('@deepseek-ai/'))

  // --- stable: non-official bundles, resolved to a clone -------------------------------------------
  for (const bundle of stableBundles) {
    if (bundle === SELF_ID) continue
    const dir = clones.get(bundle) ?? null
    if (dir === null) {
      absent.push(`${bundle} (stable: no clone manifest under plugins-src/)`)
      continue
    }
    const manifest = readJsonFile(join(dir, 'package.json')) as Manifest | null
    const packageName = manifest !== null && typeof manifest.name === 'string' ? manifest.name : null
    const matches = matchCatalog(catalogRows, [packageName ?? '', bundle])
    const catalog = citeFrom(matches)
    // A manifest description wins; the catalog's own description is the fallback, so a clone that
    // forgot to describe itself is still represented rather than silently dropped from the population.
    const text = (manifest === null ? null : manifestText(manifest)) ?? catalogFallbackText(matches)
    if (text === null) {
      absent.push(`${bundle} (stable: neither the clone manifest nor a catalog row carries a description)`)
      continue
    }
    /**
     * THE ID IS THE CATALOG NAME WHEN THERE IS ONE, AND THIS WAS A MEASURED BUG RATHER THAN A STYLE
     * CHOICE. The clone's `package.json` name for the market plugin is **`dshmarket`** — the npm name —
     * while the catalog name is **`dsh-market`**. Keying the reference on the package name put the
     * population under `dshmarket` and made `dsh-market` ABSENT from it, which the driver caught on its
     * first run: the gate then reported `pass` for a marketplace plugin because the one reference that
     * should have refused it was not there to be compared against. An absent reference is not a clean
     * comparator; it is a population with a hole in it.
     */
    const id = catalog?.name ?? packageName ?? bundle
    pending.push({
      id,
      klass: 'stable',
      intentText: text,
      source: {
        kind: manifestText(manifest ?? {}) === null ? 'catalog-row' : 'package-manifest',
        path: join(dir, 'package.json'),
        catalog,
      },
    })
  }

  // --- official: @deepseek-ai/* bundles, resolved to their harness manifests ------------------------
  for (const bundle of officialBundles) {
    const dir = officialIndex.get(bundle) ?? null
    if (dir === null) {
      absent.push(`${bundle} (official: no manifest found under the harness checkout)`)
      continue
    }
    const manifest = readJsonFile(join(dir, 'package.json')) as Manifest | null
    const matches = matchCatalog(catalogRows, [bundle])
    const text = (manifest === null ? null : manifestText(manifest)) ?? catalogFallbackText(matches)
    if (text === null) {
      absent.push(`${bundle} (official: neither the manifest nor a catalog row carries a description)`)
      continue
    }
    pending.push({
      id: bundle,
      klass: 'official',
      intentText: text,
      source: {
        kind: 'profile-bundle',
        path: join(dir, 'package.json'),
        catalog: citeFrom(matches),
      },
    })
  }

  // --- meta: the six named existing meta plugins ---------------------------------------------------
  for (const metaId of META_PLUGIN_IDS) {
    if (metaId === SELF_ID) continue
    const dir = clones.get(metaId) ?? null
    if (dir === null) {
      absent.push(`${metaId} (meta: no clone manifest under plugins-src/)`)
      continue
    }
    const manifest = readJsonFile(join(dir, 'package.json')) as Manifest | null
    const packageName = manifest !== null && typeof manifest.name === 'string' ? manifest.name : ''
    const matches = matchCatalog(catalogRows, [metaId, packageName])
    const text = (manifest === null ? null : manifestText(manifest)) ?? catalogFallbackText(matches)
    if (text === null) {
      absent.push(`${metaId} (meta: neither the clone manifest nor a catalog row carries a description)`)
      continue
    }
    const catalog = citeFrom(matches)
    pending.push({
      id: catalog?.name ?? metaId,
      klass: 'meta',
      intentText: text,
      source: { kind: 'catalog-row', path: join(dir, 'package.json'), catalog },
    })
  }

  const references: ReferenceSignature[] = []
  /**
   * THE THREE CLASSES ARE NOT DISJOINT, AND THE FIRST VERSION DOUBLED THE COLLISIONS BECAUSE OF IT.
   * `dsh-memory-delta` and `dsh-skill-evolution` are BOTH entries of the profile's bundles array AND
   * members of the task's six meta plugins, so they were signed twice — once `stable`, once `meta` — and
   * one candidate's refusal list then carried the same plugin under two class labels. Measured in the
   * driver's first green run: a candidate reporting 9 refusals where 5 were distinct plugins.
   *
   * The rule is ONE PLUGIN, ONE CLASS, at the most specific label: `meta` beats `official` beats
   * `stable`, because a plugin that is part of this program's meta layer is not usefully described as an
   * ecosystem plugin as well. A doubled witness is not corroboration.
   */
  const CLASS_PRIORITY: Record<'stable' | 'official' | 'meta', number> = { stable: 0, official: 1, meta: 2 }
  const deduped = new Map<string, PendingReference>()
  for (const item of pending) {
    const existing = deduped.get(item.id)
    if (existing === undefined) {
      deduped.set(item.id, item)
      continue
    }
    const keep = CLASS_PRIORITY[item.klass] > CLASS_PRIORITY[existing.klass] ? item : existing
    deduped.set(item.id, keep)
    const dropped = CLASS_PRIORITY[item.klass] > CLASS_PRIORITY[existing.klass] ? existing : item
    absent.push(
      `${dropped.id} (was also ${dropped.klass}; kept as ${keep.klass} — the three classes are not disjoint and one plugin takes the most specific label)`,
    )
  }

  for (const item of deduped.values()) {
    const signature = await signCandidate(
      { id: item.id, name: item.id, intentText: item.intentText },
      { space },
    )
    references.push({ ...signature, klass: item.klass, source: item.source })
  }

  const count = (klass: 'stable' | 'official' | 'meta'): Measured => ({
    count: references.filter((r) => r.klass === klass).length,
    of:
      klass === 'stable'
        ? stableBundles.filter((b) => b !== SELF_ID).length
        : klass === 'official'
          ? officialBundles.length
          : META_PLUGIN_IDS.length,
  })

  const census = { stable: count('stable'), official: count('official'), meta: count('meta'), at }
  if (census.stable.count + census.official.count + census.meta.count === 0) {
    return {
      ok: false,
      at,
      reason: 'every reference population loaded zero signed entries, so no candidate could be compared against anything; this is instrument failure and must not be reported as a pass',
    }
  }
  return { ok: true, references, census, absent }
}

/** Locate a harness checkout once, for a caller that wants the reported path rather than a default. */
export function defaultHarnessRoot(): string {
  return existsSync(DEFAULT_HARNESS_ROOT) ? DEFAULT_HARNESS_ROOT : ''
}
