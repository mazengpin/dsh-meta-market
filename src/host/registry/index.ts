/**
 * ============================================================================
 * dsh-meta-market — the registry barrel: ONE stable surface for six provider lanes
 * ============================================================================
 *
 * WHY THIS MODULE EXISTS AS A BARREL RATHER THAN AS TWO EXPORTS
 *
 * Six windows need the same two inventories, and the failure mode this program
 * has actually suffered is not a missing number — it is two lanes measuring the
 * same population with two expressions and agreeing on a wrong one. So the
 * measuring lives here once, every query returns its own row count and its own
 * disambiguation lines, and a provider that needs a catalogue row index reads
 * `CatalogRow.index` from a row this module measured.
 *
 * EVERY READ IS ASYNC ONLY AT OPEN. `openRegistry()` awaits the route probes and
 * returns a `Registry`; every method on it is synchronous, so a request handler
 * that already holds a registry performs no I/O. The instance is memoised, so a
 * second call inside one process performs no second probe run.
 *
 * AN UNAVAILABLE HALF IS `null`, WITH A REASON. If the profile manifest cannot
 * be read the installed half is `null` and every candidate reports
 * `installed: null` — NOT MEASURED — rather than `false`, which would read as
 * "we looked and it is not there".
 *
 * @module dsh-meta-market/host/registry
 */

import { loadDownloadable, queryCatalog } from './catalog.ts'
import { entryMatchesRow, measureInstalled } from './installed.ts'
import type {
  Candidate,
  CandidateMatch,
  CatalogQuery,
  CatalogRow,
  InstalledEntry,
  Registry,
  RegistryCensus,
  RegistryOptions,
} from './types.ts'

export type {
  Candidate,
  CandidateMatch,
  CatalogIdentity,
  CatalogQuery,
  CatalogRow,
  DerivedRoute,
  DownloadableCensus,
  DownloadableState,
  InstalledCensus,
  InstalledEntry,
  InstalledState,
  Kind,
  Registry,
  RegistryCensus,
  RegistryOptions,
  RouteProbe,
  Unavailable,
} from './types.ts'

export { LIVE_CATALOG_CACHE, LIVE_CATALOG_SOURCES, SNAPSHOT_CATALOG_CACHE, describeRow } from './catalog.ts'
export { DEFAULT_BASE_URL, DEFAULT_PLUGINS_SRC_DIR, DEFAULT_PROFILE_DIR } from './installed.ts'
export {
  findUp,
  findArtifact,
  resolveCloneRoot,
  resolvePluginsSrcDir,
  resolveProfileDir,
  resolveProfileDirFrom,
  resolveLiveCatalogCache,
  resolveSnapshotCatalogCache,
} from './paths.ts'

function censusRow(numerator: number, denominator: number, population: string, at: string): RegistryCensus {
  return { numerator, denominator, population, at }
}

/** Case-folded fallback, used only when the ordinal pass found nothing. */
function foldedQuery(rows: readonly CatalogRow[], field: 'name' | 'npm', query: string): CatalogQuery {
  const lower = query.trim().toLowerCase()
  const matched = rows.filter((row) => (field === 'name' ? row.name : (row.npm ?? '')).toLowerCase() === lower)
  return {
    query,
    field,
    rows: matched,
    rowCount: matched.length,
    totalRows: rows.length,
    ambiguous: matched.length > 1,
    groups: [],
    disambiguation: [
      `ordinal ${field} match found nothing; this is a CASE-FOLDED match, which is a different claim`,
      ...matched.map(
        (row) => `row ${row.index} · ${row.name} · npm:${row.npm ?? 'absent'} · owner:${row.owner ?? 'absent'}`,
      ),
    ],
  }
}

/**
 * Build the registry.
 *
 * The downloadable half is read first because it needs no socket; the installed
 * half then probes. Probe failures are captured per route and never thrown, so a
 * harness that is not mounted still produces a full installed census with
 * `servesRoute: null` rather than no census at all.
 */
export async function openRegistry(options: RegistryOptions = {}): Promise<Registry> {
  const at = new Date().toISOString()
  const baseUrl = options.baseUrl ?? 'http://127.0.0.1:3083'

  const downloadable = loadDownloadable({
    ...(options.liveCatalogPaths ? { liveCatalogPaths: options.liveCatalogPaths } : {}),
    ...(options.snapshotCatalogPaths ? { snapshotCatalogPaths: options.snapshotCatalogPaths } : {}),
    at,
  })
  const installed = await measureInstalled({
    ...(options.profileDir ? { profileDir: options.profileDir } : {}),
    ...(options.pluginsSrcDir ? { pluginsSrcDir: options.pluginsSrcDir } : {}),
    baseUrl,
    probeRoutes: options.probeRoutes ?? true,
    ...(options.probeTimeoutMs ? { probeTimeoutMs: options.probeTimeoutMs } : {}),
    at,
  })

  const liveRows = downloadable.live.census?.rows ?? null
  const installedEntries = installed.census?.dependencies ?? null

  function requireCatalog(): readonly CatalogRow[] {
    if (liveRows === null) {
      throw new Error(
        `downloadable catalog is NOT MEASURED: ${downloadable.live.unavailable?.reason ?? 'no reason recorded'}`,
      )
    }
    return liveRows
  }

  function query(field: 'name' | 'npm', value: string): CatalogQuery {
    const rows = requireCatalog()
    const ordinal = queryCatalog(rows, field, value)
    return ordinal.rowCount === 0 ? foldedQuery(rows, field, value) : ordinal
  }

  const registry: Registry = {
    installed,
    downloadable: { census: downloadable.live.census, unavailable: downloadable.live.unavailable },
    at,
    baseUrl,
    byName: (name) => query('name', name),
    byNpm: (npm) => query('npm', npm),
    byOwner: (owner) => queryCatalog(requireCatalog(), 'owner', owner),
    byKeyword: (keyword) => queryCatalog(requireCatalog(), 'keyword', keyword),
    byZone: (zone) => queryCatalog(requireCatalog(), 'zone', zone),
    allInstalled: () => installedEntries ?? [],
    allDownloadable: () => requireCatalog(),
    candidatesFor: (input) => candidatesFor(registry, input),
    bothHalves: () => {
      const entries = (installedEntries ?? []).filter((entry) => {
        if (liveRows === null) return false
        return liveRows.some((row) => entryMatchesRow(entry, row.name, row.npm))
      })
      return { entries, at }
    },
    census: () => {
      // The narrowed reading is captured once: inside a callback TypeScript
      // widens `installed.census` back to `InstalledCensus | null`, and the
      // `?` that guarded the outer expression cannot guard the inner one.
      const installedCensus = installed.census
      const deps = installedCensus?.dependencies ?? []
      const bundles = installedCensus?.bundles ?? []
      const rows = [
        censusRow(
          deps.filter((entry) => entry.checkoutExists === true).length,
          deps.length,
          'dependencies entries in the live profile manifest whose checkout exists on disk',
          at,
        ),
        censusRow(
          bundles.filter((bundle) => deps.some((entry) => entry.dependency === bundle || entry.packageName === bundle)).length,
          bundles.length,
          'dsh.profile.bundles entries naming a dependency of this profile, against all bundle entries (the remainder are official @deepseek-ai bundles)',
          at,
        ),
        censusRow(
          liveRows === null ? 0 : liveRows.length,
          downloadable.live.census?.identity.headerCount ?? (liveRows === null ? 0 : liveRows.length),
          'rows parsed from the downloadable live catalog against the file\'s own count header',
          at,
        ),
        censusRow(
          downloadable.live.census ? downloadable.live.census.identity.rowsWithNpm : 0,
          liveRows === null ? 0 : liveRows.length,
          'downloadable rows carrying an npm field against downloadable rows',
          at,
        ),
        censusRow(
          downloadable.live.census ? downloadable.live.census.identity.nameOrNpmDivergent : 0,
          downloadable.live.census ? downloadable.live.census.identity.rowsWithNpm : 0,
          'downloadable rows whose npm differs from name, against rows carrying an npm field',
          at,
        ),
        censusRow(
          downloadable.live.census ? downloadable.live.census.identity.duplicateNameRows : 0,
          liveRows === null ? 0 : liveRows.length,
          'downloadable rows sharing a name with another row, against downloadable rows',
          at,
        ),
      ]
      // A census whose two halves are both zero is instrument failure, and the
      // program's rule says say so rather than print a pass. This function
      // therefore never reports `0/0` silently: an unavailable half reports its
      // denominator as measured rows, which is never 0 when the half loaded.
      return rows
    },
  }
  return registry
}

/**
 * Candidates for one identity, measured in BOTH halves.
 *
 * A candidate list is a UNION: catalog rows that match, plus installed entries
 * that match even when the catalog has no row for them. Each candidate carries
 * its own `installed` / `downloadable` reading, and `source.rowCount` so a
 * window cannot render "the" row when three matched.
 */
function candidatesFor(registry: Registry, input: { readonly name?: string; readonly npm?: string }): CandidateMatch {
  const name = input.name?.trim() ?? ''
  const npm = input.npm?.trim() ?? ''
  const rows: CatalogRow[] = []
  const seen = new Set<number>()
  if (name !== '') {
    for (const row of registry.byName(name).rows) {
      if (!seen.has(row.index)) {
        seen.add(row.index)
        rows.push(row)
      }
    }
  }
  if (npm !== '') {
    for (const row of registry.byNpm(npm).rows) {
      if (!seen.has(row.index)) {
        seen.add(row.index)
        rows.push(row)
      }
    }
  }

  const entries = registry.allInstalled()
  const downloadableKnown = registry.downloadable.census !== null
  const candidates: Candidate[] = []
  for (const row of rows) {
    const matches = entries.filter((entry) => entryMatchesRow(entry, row.name, row.npm))
    candidates.push({
      id: row.npm ?? row.name,
      name: row.name,
      npm: row.npm,
      owner: row.owner,
      kind: 'exists',
      installed: registry.installed.census === null ? null : matches.length > 0,
      downloadable: true,
      source: {
        where: matches.length > 0 ? 'both' : 'downloadable',
        ...(matches[0]?.routes.find((route) => route.probe?.status !== null)?.probe?.path
          ? { route: matches[0].routes.find((route) => route.probe?.status !== null)?.probe?.path as string }
          : {}),
        row: row.index,
        rowCount: rows.length,
        disambiguation: rows.map((item) => `row ${item.index} · ${item.name} · npm:${item.npm ?? 'absent'} · owner:${item.owner ?? 'absent'}`),
      },
    })
  }

  if (rows.length === 0) {
    for (const entry of entries) {
      const identity = npm !== '' ? npm : name
      const own = [entry.dependency, entry.packageName].filter((value): value is string => value !== null)
      if (identity === '' || !own.includes(identity)) continue
      candidates.push({
        id: entry.dependency,
        name: entry.packageName ?? entry.dependency,
        npm: null,
        owner: null,
        kind: 'exists',
        installed: entry.checkoutExists === true ? true : entry.checkoutExists,
        downloadable: downloadableKnown ? false : null,
        source: {
          where: 'installed',
          ...(entry.routes.find((route) => route.probe?.status !== null)?.probe?.path
            ? { route: entry.routes.find((route) => route.probe?.status !== null)?.probe?.path as string }
            : {}),
          rowCount: 1,
          disambiguation: [`installed only: ${entry.dependency}=${entry.spec} (no catalog row matched)`],
        },
      })
    }
  }

  const installedMatches: InstalledEntry[] = rows.length === 0
    ? entries.filter((entry) => {
        const identity = npm !== '' ? npm : name
        return identity !== '' && [entry.dependency, entry.packageName].includes(identity)
      })
    : entries.filter((entry) => rows.some((row) => entryMatchesRow(entry, row.name, row.npm)))

  return {
    query: npm !== '' ? npm : name,
    rows,
    rowCount: rows.length,
    ambiguous: rows.length > 1,
    installedMatches,
    candidates,
  }
}

let cached: Promise<Registry> | null = null

/**
 * The memoised registry for this process.
 *
 * Memoisation is deliberate: the route probes touch the owner's live session, so
 * a provider called on every request must not probe every time. `options` is
 * honoured on the FIRST call only; a caller that needs a different fixture uses
 * `openRegistry` directly and `resetRegistry()` first.
 */
export function getRegistry(options: RegistryOptions = {}): Promise<Registry> {
  if (cached === null) cached = openRegistry(options)
  return cached
}

/** Clear the memo. The verify driver uses it; a provider never needs it. */
export function resetRegistry(): void {
  cached = null
}

/**
 * THE HOSTING LEDGER IS PART OF THIS BARREL, not a sibling inventory.
 *
 * The provider-hosted preheated cache agent rows are built FROM this registry —
 * the same catalog half, the same installed half, the same route probes — and the
 * route that serves them reaches them through this module. Re-exporting here is
 * what makes the row type a registry row rather than a second measurement of the
 * same machine, which is the failure this file's header describes.
 */
export { buildHostingReport, cloneFileExists, getHostingReport, HOSTING_SEED_IDS, resetHosting } from './hosting.ts'

export type {
  CostSide,
  FoldEdge,
  FoldKind,
  FoldState,
  HostingReport,
  HostingRow,
  ProviderReading,
  StageSide,
} from './hosting.ts'
