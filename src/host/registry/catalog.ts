/**
 * ============================================================================
 * dsh-meta-market — the DOWNLOADABLE half, measured from a file this process owns
 * ============================================================================
 *
 * WHY THE LIVE CATALOG IS READ FROM A CACHED FILE AND NOT FETCHED HERE
 *
 * The registry is loaded during a boot-time plugin apply. A route handler that
 * reached the network on every request would put an unmeasured dependency in a
 * handler this program has already argued must not do that, and a fetch at apply
 * time would make boot depend on the network. So the live catalog is fetched by
 * `verify/fetch-catalog.mjs`, its identity is recorded in `data/SOURCES.json`,
 * and this module reads BYTES THAT ARE ON DISK. Repeat reads therefore never
 * re-hit the network, and a reader can reproduce the census from the file the
 * census names.
 *
 * THE CACHE IS A SNAPSHOT TOO, AND IT IS LABELLED AS ONE. `identity.source` says
 * `live` or `snapshot`; it never says "current". The live file measured
 * 2026-10-17T14:41Z carried **5,785** rows against the **5,704** the brief
 * quoted — the market grew between the two measurements, and the honest report
 * is both numbers with their clocks rather than the brief's figure restated.
 *
 * MATCHING IS BY `name` OR `npm`, AND A MATCH CARRIES ITS ROW COUNT. This
 * program's `AGENTS.md` records three separate wrong findings produced by a
 * name-only lookup and one produced by taking the first of several matching rows
 * (`dsh-cost-meter` exists three times: 0★, 391★, 1★). So no function here
 * returns a single row: every lookup returns an array plus `ambiguous`, and
 * `disambiguation` names owner/npm/stars per row so "take the first" is a
 * decision someone has to defend.
 *
 * CASE: comparisons are ORDINAL (exact), because Windows folds case by default in
 * the shell and a case-folded match is a different claim. A caller that needs a
 * case-folded fallback gets it from `byName`/`byNpm` only when the exact pass
 * found nothing, and the result says `folded: true` in `disambiguation`.
 *
 * @module dsh-meta-market/host/registry/catalog
 */

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  CatalogIdentity,
  CatalogQuery,
  CatalogRow,
  DownloadableCensus,
  DownloadableState,
  Unavailable,
} from './types.ts'
import { resolveLiveCatalogCache, resolveSnapshotCatalogCache } from './paths.ts'

/** The directory this module lives in; `SOURCES.json` is read beside the code. */
const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The live catalog's cached copy, resolved by SHAPE.
 *
 * **THE FIXED `resolve(HERE, 'data/…')` WAS CORRECT IN SOURCE AND WRONG IN THE
 * BUNDLE**, for the same reason the profile walk was: `tsdown` emits
 * `lib/index.js`, so `HERE` is `<clone>/lib` and the data directory is not
 * beside it. `paths.ts` searches the source and bundle layouts from every
 * ancestor and returns `null` when neither exists; `null` reaches
 * `unavailable.reason` rather than turning into an empty catalog.
 */
export const LIVE_CATALOG_CACHE = resolveLiveCatalogCache()

/** The recorded identity of that copy; the census is reproducible from this file. */
export const LIVE_CATALOG_SOURCES = resolve(HERE, 'data/SOURCES.json')

/**
 * The 4,527-row snapshot the program measured on 2026-10-12.
 *
 * It lives in the program workspace rather than in this clone because the
 * workspace owns it and a second copy would be a second statement of one fact.
 * It is anchored to the RESOLVED profile directory, not to a `../` count, so a
 * moved checkout and a bundled artifact resolve it identically; when it cannot
 * be read the half is `null` with a reason rather than an empty array.
 */
export const SNAPSHOT_CATALOG_CACHE = resolveSnapshotCatalogCache()

/** Normalised description: the source carries `{ en, zh }`. */
function readDescription(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const en = (value as Record<string, unknown>).en
    if (typeof en === 'string' && en.trim() !== '') return en
  }
  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * `capabilities` is `string[]` or ABSENT.
 *
 * The distinction is load-bearing: 396 of the 4,527 snapshot rows have no
 * `capabilities` key at all, 546 have `capabilities: []`, and an earlier count
 * charged every absent row a phantom element (`@($null).Count` is `1`) and
 * published 13,938 where the truth was 13,542. `null` here is "never asked";
 * `[]` is "asked, and they said nothing".
 */
function readCapabilities(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((item): item is string => typeof item === 'string')
}

function normaliseRow(raw: unknown, index: number): CatalogRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const name = readString(row.name)
  if (name === null) return null
  const capabilitiesValue = row.capabilities
  return {
    index,
    name,
    owner: readString(row.owner),
    npm: readString(row.npm),
    url: readString(row.url),
    page: readString(row.page),
    category: readString(row.category),
    description: readDescription(row.description),
    stars: readNumber(row.stars),
    version: readString(row.version),
    install: readString(row.install),
    downloads: readNumber(row.downloads),
    added: readString(row.added),
    capabilities: readCapabilities(capabilitiesValue),
    capabilitiesPresent: 'capabilities' in row,
  }
}

/** The parsed envelope. `plugins` is the only population this module counts. */
interface ParsedCatalog {
  readonly rows: readonly CatalogRow[]
  readonly headerCount: number | null
  readonly updated: string | null
  readonly sha256: string
  readonly bytes: number
}

function parseCatalogFile(path: string): ParsedCatalog {
  const buffer = readFileSync(path)
  const parsed: unknown = JSON.parse(buffer.toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).plugins)) {
    throw new Error(`no plugins array in ${path}`)
  }
  const envelope = parsed as Record<string, unknown>
  const plugins = envelope.plugins as unknown[]
  const rows: CatalogRow[] = []
  for (let index = 0; index < plugins.length; index += 1) {
    const row = normaliseRow(plugins[index], index)
    // A row without a name is counted as unreadable rather than silently skipped:
    // the census below compares `rows.length` to the envelope's own count so a
    // dropped row cannot hide.
    if (row !== null) rows.push(row)
  }
  return {
    rows,
    headerCount: typeof envelope.count === 'number' ? envelope.count : null,
    updated: typeof envelope.updated === 'string' ? envelope.updated : null,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.byteLength,
  }
}

function identityFor(parsed: ParsedCatalog, path: string, source: 'live' | 'snapshot'): CatalogIdentity {
  const names = new Map<string, number>()
  let rowsWithNpm = 0
  let nameOrNpmDivergent = 0
  for (const row of parsed.rows) {
    names.set(row.name, (names.get(row.name) ?? 0) + 1)
    if (row.npm !== null) {
      rowsWithNpm += 1
      if (row.npm !== row.name) nameOrNpmDivergent += 1
    }
  }
  let duplicateNameGroups = 0
  let duplicateNameRows = 0
  for (const count of names.values()) {
    if (count > 1) {
      duplicateNameGroups += 1
      duplicateNameRows += count
    }
  }
  let fetchedAt: string | null = null
  try {
    fetchedAt = statSync(path).mtime.toISOString()
  } catch {
    fetchedAt = null
  }
  return {
    source,
    path,
    url: source === 'live' ? 'https://awesome-dsh-plugin.com/plugins.json' : null,
    bytes: parsed.bytes,
    fetchedAt,
    sha256: parsed.sha256,
    rows: parsed.rows.length,
    headerCount: parsed.headerCount,
    updated: parsed.updated,
    distinctNames: names.size,
    duplicateNameGroups,
    duplicateNameRows,
    nameOrNpmDivergent,
    rowsWithNpm,
  }
}

/**
 * Load one catalog half from the first readable candidate.
 *
 * A candidate list is tried in order; every failure is recorded and the FIRST
 * success wins. When nothing reads, the half is `null` with every path and every
 * reason in `unavailable.reason` — an unreadable source is never an empty array.
 */
function loadHalf(
  candidates: readonly string[],
  source: 'live' | 'snapshot',
  at: string,
): DownloadableState {
  const failures: string[] = []
  for (const path of candidates) {
    try {
      const parsed = parseCatalogFile(path)
      if (parsed.rows.length === 0) {
        failures.push(`${path}: parsed 0 rows (instrument failure, not an empty catalog)`)
        continue
      }
      const census: DownloadableCensus = {
        identity: identityFor(parsed, path, source),
        rows: parsed.rows,
        at,
      }
      return { census, unavailable: null }
    } catch (error) {
      failures.push(`${path}: ${(error as Error).message}`)
    }
  }
  const unavailable: Unavailable = {
    reason: `no readable ${source} catalog: ${failures.join('; ')}`,
    measuredAt: at,
  }
  return { census: null, unavailable }
}

/** Resolve the live half, preferring an explicit override, then the shipped cache. */
export function loadDownloadable(
  options: {
    readonly liveCatalogPaths?: readonly string[]
    readonly snapshotCatalogPaths?: readonly string[]
    readonly at?: string
  } = {},
): { readonly live: DownloadableState; readonly snapshot: DownloadableState; readonly at: string } {
  const at = options.at ?? new Date().toISOString()
  const livePaths = (
    options.liveCatalogPaths ?? [
      ...(process.env.DSH_META_MARKET_LIVE_CATALOG ? [process.env.DSH_META_MARKET_LIVE_CATALOG] : []),
      ...(LIVE_CATALOG_CACHE === null ? [] : [LIVE_CATALOG_CACHE]),
    ]
  ).filter((path): path is string => path !== null && path !== '')
  const snapshotPaths = (
    options.snapshotCatalogPaths ?? [
      ...(process.env.DSH_META_MARKET_SNAPSHOT_CATALOG ? [process.env.DSH_META_MARKET_SNAPSHOT_CATALOG] : []),
      ...(SNAPSHOT_CATALOG_CACHE === null ? [] : [SNAPSHOT_CATALOG_CACHE]),
    ]
  ).filter((path): path is string => path !== null && path !== '')
  return {
    live: loadHalf(livePaths, 'live', at),
    snapshot: loadHalf(snapshotPaths, 'snapshot', at),
    at,
  }
}

/** One row's one-line identity, so an ambiguous match cannot be read as a single answer. */
export function describeRow(row: CatalogRow): string {
  return [
    `row ${row.index}`,
    row.name,
    row.npm === null ? 'npm:absent' : `npm:${row.npm}`,
    row.owner === null ? 'owner:absent' : `owner:${row.owner}`,
    row.stars === null ? 'stars:null' : `stars:${row.stars}`,
  ].join(' · ')
}

function queryRows(
  rows: readonly CatalogRow[],
  field: CatalogQuery['field'],
  query: string,
  match: (row: CatalogRow) => boolean,
  keyOf: (row: CatalogRow) => string | null,
): CatalogQuery {
  const matched = rows.filter(match)
  const groups = new Map<string, number>()
  for (const row of matched) {
    const key = keyOf(row)
    if (key === null) continue
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return {
    query,
    field,
    rows: matched,
    rowCount: matched.length,
    totalRows: rows.length,
    ambiguous: matched.length > 1,
    groups: [...groups.entries()]
      .filter(([, count]) => count > 1)
      .map(([key, rowCount]) => ({ key, rowCount })),
    disambiguation: matched.map(describeRow),
  }
}

/**
 * The five query surfaces the provider lanes read, bound to one row set.
 *
 * Every one returns `CatalogQuery`, never a row: the row count and the
 * disambiguation lines are the point, because a name is not a unique key.
 */
export function queryCatalog(
  rows: readonly CatalogRow[],
  field: CatalogQuery['field'],
  query: string,
): CatalogQuery {
  const needle = query.trim()
  switch (field) {
    case 'name':
      return queryRows(rows, field, query, (row) => row.name === needle, (row) => row.owner)
    case 'npm':
      return queryRows(rows, field, query, (row) => row.npm === needle, (row) => row.owner)
    case 'owner':
      return queryRows(rows, field, query, (row) => row.owner === needle, (row) => row.name)
    case 'keyword': {
      const lower = needle.toLowerCase()
      return queryRows(
        rows,
        field,
        query,
        (row) =>
          row.name.toLowerCase().includes(lower) ||
          (row.npm !== null && row.npm.toLowerCase().includes(lower)) ||
          (row.category !== null && row.category.toLowerCase().includes(lower)) ||
          (row.description !== null && row.description.toLowerCase().includes(lower)) ||
          (row.capabilities !== null && row.capabilities.some((item) => item.toLowerCase().includes(lower))),
        (row) => row.name,
      )
    }
    case 'zone': {
      // A zone id such as `M1-cross-session-store` is matched on its slug tokens,
      // and the method is stated because this is a TOKEN match and not the
      // embedding alignment the intent map computes. `AGENTS.md`'s rule that a
      // description is not a capability applies to reading a keyword hit as
      // alignment: this filter narrows a population, it does not judge one.
      const tokens = needle
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .filter((token) => token.length >= 3)
      if (tokens.length === 0) return queryRows(rows, field, query, () => false, (row) => row.name)
      return queryRows(
        rows,
        field,
        query,
        (row) => {
          const haystack = [row.name, row.npm ?? '', row.category ?? '', row.description ?? '', ...(row.capabilities ?? [])]
            .join(' ')
            .toLowerCase()
          return tokens.every((token) => haystack.includes(token))
        },
        (row) => row.name,
      )
    }
  }
}
