/**
 * ============================================================================
 * dsh-meta-market — the registry: types for the two inventories every window reads
 * ============================================================================
 *
 * THE SHAPES HERE ARE A MEASUREMENT CONTRACT, NOT A DATA MODEL. Six provider
 * lanes read this module; if a field can mean "nobody looked" it is `null` and
 * there is a companion reason somewhere in the payload, because this program has
 * published an absent value as `0` often enough that `AGENTS.md` gives it a
 * section. Concretely, every count here travels as
 * `{ numerator, denominator, population, at }` in `RegistryCensus`, and a
 * consumer that prints a bare number is printing a caption rather than a check.
 *
 * THREE KINDS ARE NEVER FLATTENED. `kind` is `exists` / `plan` / `future` — a
 * catalog row is `exists` in the market, an installed checkout is `exists` on
 * this machine, and neither makes a planned integration real.
 *
 * @module dsh-meta-market/host/registry/types
 */

/** What kind of thing a row is. Never collapsed. */
export type Kind = 'exists' | 'plan' | 'future'

/** The half of the universe a reading came from. */
export type SourceHalf = 'installed' | 'downloadable'

/**
 * One catalog row, normalised.
 *
 * `index` is the row's position in the `plugins` array of the source file and is
 * the `source.row` the CONTRACT asks for. It is stable only for one source
 * revision, which is why `CatalogIdentity.sha256` travels with it.
 */
export interface CatalogRow {
  readonly index: number
  readonly name: string
  readonly owner: string | null
  readonly npm: string | null
  readonly url: string | null
  readonly page: string | null
  readonly category: string | null
  /** The English description when the source carries `{ en, zh }`; `null` when absent. */
  readonly description: string | null
  readonly stars: number | null
  readonly version: string | null
  readonly install: string | null
  readonly downloads: number | null
  readonly added: string | null
  /** `null` means the row has NO `capabilities` key — never conflate with `[]`. */
  readonly capabilities: readonly string[] | null
  readonly capabilitiesPresent: boolean
}

/** Identity of the file a catalog half was read from. */
export interface CatalogIdentity {
  readonly source: 'live' | 'snapshot'
  /** Absolute path that actually answered. */
  readonly path: string
  readonly url: string | null
  readonly bytes: number
  readonly fetchedAt: string | null
  readonly sha256: string
  readonly rows: number
  /** The file's own `count` header; `null` when absent. Divergence is reported, not hidden. */
  readonly headerCount: number | null
  readonly updated: string | null
  readonly distinctNames: number
  readonly duplicateNameGroups: number
  readonly duplicateNameRows: number
  /** Rows whose `npm` is present and differs from `name`. */
  readonly nameOrNpmDivergent: number
  /** Rows carrying an `npm` field at all. */
  readonly rowsWithNpm: number
}

/** A catalog half that could not be measured. */
export interface Unavailable {
  readonly reason: string
  readonly measuredAt: string
}

/** A probe of a route on the live harness. */
export interface RouteProbe {
  readonly path: string
  readonly url: string
  /** `null` = NOT PROBED (read-only policy, or the request never completed). */
  readonly status: number | null
  readonly error: string | null
  readonly at: string
}

/** A route literal found in an installed checkout's source. */
export interface DerivedRoute {
  readonly path: string
  /** `prefix` when the registration declared `kind: 'prefix'`. */
  readonly kind: 'exact' | 'prefix'
  /** Workspace-relative file and line the literal was read from. */
  readonly source: string
  /** The constant's name when the path was `path: ROUTE_PATH` rather than a literal. */
  readonly viaConst: string | null
  /** What the read-only probe policy decided about this path. */
  readonly probe: RouteProbe | null
  readonly probeSkippedBecause: string | null
}

/** One dependency of the live profile, measured rather than assumed. */
export interface InstalledEntry {
  /** The key in `dependencies` — the identity the profile actually consumes. */
  readonly dependency: string
  readonly spec: string
  readonly resolution: 'link' | 'registry' | 'other'
  /** Absolute checkout directory, or `null` when the spec is not a `link:`. */
  readonly checkoutPath: string | null
  /** `null` = NOT MEASURED (e.g. a registry dependency whose tarball was not inspected). */
  readonly checkoutExists: boolean | null
  /** The dependency's own `package.json` name, which may differ from the key. */
  readonly packageName: string | null
  /** `dsh.client` present in the package manifest. `null` = manifest unreadable. */
  readonly clientPresent: boolean | null
  /** Listed in the profile's `dsh.profile.bundles`. */
  readonly bundleListed: boolean
  /** `node_modules/<dependency>` resolved to a real path. `null` = not inspected. */
  readonly nodeModulesPath: string | null
  readonly routes: readonly DerivedRoute[]
  /** `true` when at least one probe answered 2xx/3xx; `false` when probes ran and none did. */
  readonly servesRoute: boolean | null
  /** Why `servesRoute` is `null`, when it is. */
  readonly servesRouteUnknownBecause: string | null
}

/** The installed half. */
export interface InstalledCensus {
  readonly profileManifest: string
  /** sha256 of the manifest AS MEASURED, because another lane can edit it mid-census. */
  readonly profileManifestSha256: string
  readonly profileManifestMtime: string | null
  readonly at: string
  readonly dependencies: readonly InstalledEntry[]
  /** `dsh.profile.bundles` exactly as written. */
  readonly bundles: readonly string[]
  /** node_modules entries, split by kind rather than counted as one listing. */
  readonly nodeModules: {
    readonly entries: number
    readonly directories: number
    readonly symlinks: number
    /** Entries in `node_modules` that no dependency names — a stale link is a fact, not an error. */
    readonly linksWithoutDependency: readonly string[]
    /** Dependencies with no `node_modules` entry at all. */
    readonly dependenciesWithoutLink: readonly string[]
  }
  readonly entriesWithCheckout: number
  readonly entriesWithClient: number
  readonly entriesBundleListed: number
  readonly entriesServingRoute: number
  readonly entriesWithRoutes: number
}

/** A half that could not be measured is `null`, never an empty array. */
export interface InstalledState {
  readonly census: InstalledCensus | null
  readonly unavailable: Unavailable | null
}

/** A catalog half plus its indexes. */
export interface DownloadableCensus {
  readonly identity: CatalogIdentity
  readonly rows: readonly CatalogRow[]
  readonly at: string
}

export interface DownloadableState {
  readonly census: DownloadableCensus | null
  readonly unavailable: Unavailable | null
}

/** What one query returned, with its own denominator. */
export interface CatalogQuery {
  readonly query: string
  readonly field: 'name' | 'npm' | 'owner' | 'keyword' | 'zone'
  readonly rows: readonly CatalogRow[]
  readonly rowCount: number
  readonly totalRows: number
  readonly ambiguous: boolean
  /** Every key that matched more than once, with its row count. */
  readonly groups: readonly { readonly key: string; readonly rowCount: number }[]
  /** One line per row, so "take the first match" cannot be done silently. */
  readonly disambiguation: readonly string[]
}

/** One candidate a window can render, with both halves measured. */
export interface Candidate {
  readonly id: string
  readonly name: string
  readonly npm: string | null
  readonly owner: string | null
  readonly kind: Kind
  /** `null` = NOT MEASURED, never `false`. */
  readonly installed: boolean | null
  readonly downloadable: boolean | null
  readonly source: {
    readonly where: SourceHalf | 'both'
    readonly route?: string
    readonly row?: number
    readonly rowCount: number
    readonly disambiguation: readonly string[]
  }
}

/** The result of looking one identity up in both halves. */
export interface CandidateMatch {
  readonly query: string
  readonly rows: readonly CatalogRow[]
  readonly rowCount: number
  readonly ambiguous: boolean
  readonly installedMatches: readonly InstalledEntry[]
  readonly candidates: readonly Candidate[]
}

/** The census every window's payload carries, in the CONTRACT's envelope shape. */
export interface RegistryCensus {
  readonly numerator: number
  readonly denominator: number
  readonly population: string
  readonly at: string
}

/** Options. Every path is overridable so the harness measures a fixture. */
export interface RegistryOptions {
  /** The profile directory holding `package.json` and `node_modules`. */
  readonly profileDir?: string
  /** Checkout root that `link:` specs are resolved against. */
  readonly pluginsSrcDir?: string
  /** The live-harness origin probed for routes. */
  readonly baseUrl?: string
  /** Overrides, in order, for the downloadable live half. */
  readonly liveCatalogPaths?: readonly string[]
  /** Overrides, in order, for the downloadable snapshot half. */
  readonly snapshotCatalogPaths?: readonly string[]
  /** Probe routes at all. The harness sets `false` to stay offline. */
  readonly probeRoutes?: boolean
  /** Per-probe timeout in milliseconds. */
  readonly probeTimeoutMs?: number
}

/** The registry a provider lane reads. All reads are synchronous once opened. */
export interface Registry {
  readonly installed: InstalledState
  readonly downloadable: DownloadableState
  readonly at: string
  readonly baseUrl: string
  byName(name: string): CatalogQuery
  byNpm(npm: string): CatalogQuery
  byOwner(owner: string): CatalogQuery
  byKeyword(keyword: string): CatalogQuery
  byZone(zone: string): CatalogQuery
  allInstalled(): readonly InstalledEntry[]
  allDownloadable(): readonly CatalogRow[]
  candidatesFor(input: { readonly name?: string; readonly npm?: string }): CandidateMatch
  /** Installed identities that were also found in the downloadable catalog. */
  bothHalves(): { readonly entries: readonly InstalledEntry[]; readonly at: string }
  census(): readonly RegistryCensus[]
}
