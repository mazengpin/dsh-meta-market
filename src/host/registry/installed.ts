/**
 * ============================================================================
 * dsh-meta-market — the INSTALLED half, measured rather than assumed
 * ============================================================================
 *
 * FOUR SOURCES ARE MEASURED AND NONE IS INFERRED FROM ANOTHER:
 *
 *   1. the live profile manifest (`dependencies` and `dsh.profile.bundles`),
 *   2. `node_modules`, counted by KIND — a directory listing is not a directory
 *      count, and the program has published a mixed listing count as a directory
 *      count before (`AGENTS.md`, found by `verify-round6`),
 *   3. each dependency's own checkout: whether it exists, its `package.json`
 *      name, and whether it declares `dsh.client`,
 *   4. the routes its source registers, and a LIVE probe of each against the
 *      harness origin, with the status code recorded.
 *
 * WHAT A PROBE IS ALLOWED TO DO, AND WHY THIS IS NOT AN ASSUMPTION
 *
 * `3083` is the owner's live session. A probe therefore must not be able to
 * mutate it. Two guards: only route literals read out of an installed
 * checkout's own source are probed (nothing is guessed), and a path whose last
 * segment names a mutating operation is NOT probed (`probeSkippedBecause`
 * carries the reason). `null` status means NOT PROBED — never `false`, because
 * "we chose not to ask" and "we asked and it was absent" are different claims.
 *
 * `304`/`401`/`403`/`405` are ANSWERS: the route key exists and the server has
 * an opinion about it. So `servesRoute` is `true` when any probe returned any
 * status other than `404`, `false` when probes ran and every one was `404`, and
 * `null` when no probe was made.
 *
 * @module dsh-meta-market/host/registry/installed
 */

import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import type {
  DerivedRoute,
  InstalledCensus,
  InstalledEntry,
  InstalledState,
  RouteProbe,
  Unavailable,
} from './types.ts'
import { describeSearch, resolveProfileDir, resolvePluginsSrcDir } from './paths.ts'

/**
 * The profile this program develops in, resolved by SHAPE rather than by a
 * `../` count.
 *
 * **THE FIXED WALK WAS A BUNDLE BUG THAT SHIPPED A FALSE ABSENCE.** In source
 * this file sits at `src/host/registry/`, so `../../../../../` reached
 * `deepseek-root` correctly; `tsdown` emits `lib/index.js`, where the same count
 * reached the home directory and the live surface reported
 * `profile manifest unreadable at C:\Users\0000\profiles-tree\personal-dev/package.json`
 * — the Meta-Plugins window `unavailable` for a path error while the data was
 * fine. Found by `surface-host` with a reproduction; repaired in `paths.ts`,
 * which walks up looking for the fixed shape and never consults `HOME`.
 * `null` means NOT FOUND and the reason string carries the directories searched.
 */
export const DEFAULT_PROFILE_DIR: string | null = resolveProfileDir().path

/** The checkout root that relative `link:` specs resolve against — parent of the resolved clone. */
export const DEFAULT_PLUGINS_SRC_DIR: string | null = resolvePluginsSrcDir()

/** The live harness origin. Probed, never written to. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:3083'

/**
 * Route literals whose last segment names a mutating operation.
 *
 * Kept deliberately broad: a false skip costs one unprobed route and is recorded
 * as such, while a false probe could change the owner's live system.
 */
const MUTATING_SEGMENT =
  /(install|uninstall|remove|delete|update|upgrade|restart|rollback|write|save|set$|create|patch|apply|block|unblock|cancel|approve|reject|move|rename|upload|send|post|execute|run$|start|stop|clear|reset|kill|publish|migrate|note|favorite|favourite|dismiss|backup|restore|sync|merge|commit|switch|toggle|ack|promote|adopt|discard|purge|truncate|revoke|grant|edit|modify|import|export)/iu

/** Files whose route registrations are read. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs']

function walk(dir: string, out: string[], depth = 0): void {
  if (depth > 8) return
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path, out, depth + 1)
    } else if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      out.push(path)
    }
  }
}

interface RawRoute {
  readonly path: string
  readonly kind: 'exact' | 'prefix'
  readonly source: string
  /** `null` when the path was a literal; the constant's name when it was resolved. */
  readonly viaConst: string | null
}

/**
 * Read the route paths a checkout REGISTERS, from its own source or build.
 *
 * **THE FIRST VERSION OF THIS FUNCTION WAS WRONG BY OMISSION AND THE CENSUS SAID
 * SO.** It matched `path: '<literal>'` only, and 30 of 36 installed checkouts
 * write `path: ROUTE_PATH` — a module constant. The census therefore reported
 * "no route found" for plugins that plainly serve one, which is the
 * absent-is-not-zero trap arriving in a source scanner: a missed reading is not
 * an absent route. The fix is a SECOND PASS that resolves `const NAME = '<literal>'`
 * inside the same checkout, and the resolved reading records `viaConst` so a
 * reader can see which paths were read off a constant rather than a literal.
 *
 * A template literal with an interpolation (`/deps/${name}`) is still skipped
 * rather than expanded: an expanded guess is not a registered path, and probing a
 * guess would record a `404` that says nothing about the plugin.
 */
export function deriveRoutes(checkoutPath: string, pluginsSrcDir: string): readonly RawRoute[] {
  const roots = [join(checkoutPath, 'src'), join(checkoutPath, 'lib')].filter((path) => existsSync(path))
  const files: string[] = []
  for (const root of roots) walk(root, files)

  // Pass 1 — every module-level string constant in the checkout. A collision
  // keeps the FIRST reading and is not silently averaged; route constants are
  // conventionally unique per module and a conflicting pair would be a bug in
  // the plugin, not a datum for this census. Constants chain — the measured
  // convention is `ROUTE_PREFIX = 'intent-map/api'` beside
  // ``ROUTE_PATH = `/${ROUTE_PREFIX}` `` — so a second pass below substitutes.
  const rawConstants = new Map<string, string>()
  const texts = new Map<string, string>()
  const constantDeclaration =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`]*)`)/gu
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    texts.set(file, text)
    constantDeclaration.lastIndex = 0
    let declaration: RegExpExecArray | null = constantDeclaration.exec(text)
    while (declaration !== null) {
      const name = declaration[1] ?? ''
      const value = declaration[2] ?? declaration[3] ?? declaration[4] ?? ''
      if (name !== '' && value !== '' && !rawConstants.has(name)) rawConstants.set(name, value)
      declaration = constantDeclaration.exec(text)
    }
  }

  // Resolve `${NAME}` inside a constant's own value. Three rounds is enough for
  // the measured chains and bounded so a cyclic pair cannot spin.
  const constants = new Map(rawConstants)
  for (let round = 0; round < 3; round += 1) {
    let changed = false
    for (const [name, value] of constants) {
      if (!value.includes('${')) continue
      const resolved = value.replace(/\$\{([A-Za-z_$][\w$]*)\}/gu, (whole, inner: string) => constants.get(inner) ?? whole)
      if (resolved !== value) {
        constants.set(name, resolved)
        changed = true
      }
    }
    if (!changed) break
  }

  // Pass 2 — every `path:` value, literal or constant, in a file that registers.
  const routes: RawRoute[] = []
  const seen = new Set<string>()
  const property = /path:\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)`|([A-Za-z_$][\w$]*))/gu
  for (const [file, text] of texts) {
    if (!text.includes('register(') && !text.includes('webServer')) continue
    property.lastIndex = 0
    let match: RegExpExecArray | null = property.exec(text)
    while (match !== null) {
      const literalValue = match[1] ?? match[2] ?? match[3]
      const identifier = match[4] ?? null
      const value = literalValue ?? (identifier === null ? '' : (constants.get(identifier) ?? ''))
      if (value.startsWith('/') && value !== '/' && !seen.has(value)) {
        const window = text.slice(Math.max(0, match.index - 400), match.index + 120)
        const kind: 'exact' | 'prefix' = /kind:\s*'prefix'/.test(window) ? 'prefix' : 'exact'
        seen.add(value)
        routes.push({
          path: value,
          kind,
          source: `${file.slice(pluginsSrcDir.length + 1).replaceAll('\\', '/')}:${text.slice(0, match.index).split('\n').length}`,
          viaConst: identifier !== null && literalValue === undefined ? identifier : null,
        })
      }
      match = property.exec(text)
    }
  }
  return routes
}

function lastSegment(path: string): string {
  const parts = path.split('/').filter((part) => part !== '')
  return parts.length === 0 ? '' : parts[parts.length - 1]
}

/** Probe one path under the read-only policy. Never throws. */
async function probeRoute(
  path: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<{ readonly probe: RouteProbe | null; readonly skipped: string | null }> {
  const segment = lastSegment(path)
  if (MUTATING_SEGMENT.test(segment)) {
    return {
      probe: null,
      skipped: `read-only probe policy: last segment "${segment}" names a mutating operation, so this path was NOT probed on the owner's live session`,
    }
  }
  const url = `${baseUrl}${path}`
  const at = new Date().toISOString()
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json, text/html;q=0.9, */*;q=0.1' },
    })
    return { probe: { path, url, status: response.status, error: null, at }, skipped: null }
  } catch (error) {
    return { probe: { path, url, status: null, error: (error as Error).message, at }, skipped: null }
  }
}

interface ManifestReading {
  readonly dependencies: Record<string, string>
  readonly bundles: readonly string[]
  readonly sha256: string
  readonly mtime: string | null
}

function readProfileManifest(profileDir: string): ManifestReading {
  const manifestPath = join(profileDir, 'package.json')
  const buffer = readFileSync(manifestPath)
  const manifest = JSON.parse(buffer.toString('utf8')) as Record<string, unknown>
  const dependencies: Record<string, string> = {}
  const rawDependencies = manifest.dependencies
  if (rawDependencies && typeof rawDependencies === 'object') {
    for (const [key, value] of Object.entries(rawDependencies as Record<string, unknown>)) {
      if (typeof value === 'string') dependencies[key] = value
    }
  }
  const bundles: string[] = []
  const dsh = manifest.dsh
  if (dsh && typeof dsh === 'object') {
    const profile = (dsh as Record<string, unknown>).profile
    if (profile && typeof profile === 'object') {
      const rawBundles = (profile as Record<string, unknown>).bundles
      if (Array.isArray(rawBundles)) {
        for (const item of rawBundles) if (typeof item === 'string') bundles.push(item)
      }
    }
  }
  let mtime: string | null = null
  try {
    mtime = statSync(manifestPath).mtime.toISOString()
  } catch {
    mtime = null
  }
  return { dependencies, bundles, sha256: createHash('sha256').update(buffer).digest('hex'), mtime }
}

function countNodeModules(
  profileDir: string,
  dependencies: readonly InstalledEntry[],
): InstalledCensus['nodeModules'] {
  const root = join(profileDir, 'node_modules')
  if (!existsSync(root)) {
    return {
      entries: 0,
      directories: 0,
      symlinks: 0,
      linksWithoutDependency: [],
      dependenciesWithoutLink: dependencies.map((entry) => entry.dependency),
    }
  }
  const entries = readdirSync(root, { withFileTypes: true })
  let directories = 0
  let symlinks = 0
  const known = new Set(dependencies.map((entry) => entry.dependency))
  const linksWithoutDependency: string[] = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      symlinks += 1
      if (!entry.name.startsWith('@') && !known.has(entry.name)) linksWithoutDependency.push(entry.name)
    } else if (entry.isDirectory()) {
      directories += 1
    }
  }
  return {
    entries: entries.length,
    directories,
    symlinks,
    linksWithoutDependency: linksWithoutDependency.sort(),
    dependenciesWithoutLink: dependencies
      .filter((entry) => entry.nodeModulesPath === null)
      .map((entry) => entry.dependency)
      .sort(),
  }
}

/** Resolve a `link:` spec to an absolute checkout, relative to the profile dir. */
function checkoutFromSpec(spec: string, profileDir: string): string | null {
  if (!spec.startsWith('link:')) return null
  return resolve(profileDir, spec.slice('link:'.length))
}

/**
 * One dependency whose route probes have NOT been run yet.
 *
 * Phase 1 of `measureInstalled` derives every route for every checkout and fills
 * this; phase 2 runs the probes; phase 3 assembles the entries. The split exists so
 * the probes can be scheduled together (bounded, see `PROBE_CONCURRENCY`) instead of
 * one dependency's batch finishing before the next begins.
 */
interface ProbeDraft {
  readonly dependency: string
  readonly spec: string
  readonly resolution: InstalledEntry['resolution']
  readonly checkoutPath: string | null
  readonly checkoutExists: boolean | null
  readonly packageName: string | null
  readonly clientPresent: boolean | null
  readonly bundleListed: boolean
  readonly nodeModulesPath: string | null
  readonly rawRoutes: readonly RawRoute[]
}

/**
 * How many route probes may be in flight at once.
 *
 * MEASURED 2026-10-18 from `dsh-meta-market`'s own source tree against the live
 * profile (three in-process runs): `measureInstalled({probeRoutes: false})` took
 * **884 / 1,392 ms** (44 dependencies, every filesystem read) while the same call
 * with `probeRoutes: true` took **19,988 / 22,094 / 33,214 ms** over **117 probes** —
 * so the probes, not the walks, are the cost, and they were run strictly one after
 * another (three or four of them time out at the 2,500 ms bound, and each of those
 * stalls every probe behind it). The bound is small ON PURPOSE: these are GETs
 * against the OWNER'S LIVE SESSION, so the goal is to stop paying one round trip
 * after another, not to open 117 connections at once. Four keeps the burst bounded
 * and every probe keeps its own timeout and its own read-only skip.
 */
const PROBE_CONCURRENCY = 4

/**
 * Measure the installed half.
 *
 * Async only because the probes are; every filesystem read is synchronous and
 * every failure produces `null` plus a reason instead of a zero.
 */
export async function measureInstalled(
  options: {
    readonly profileDir?: string
    readonly pluginsSrcDir?: string
    readonly baseUrl?: string
    readonly probeRoutes?: boolean
    readonly probeTimeoutMs?: number
    readonly at?: string
  } = {},
): Promise<InstalledState> {
  const at = options.at ?? new Date().toISOString()
  const profileSearch = resolveProfileDir()
  const profileDir = options.profileDir ?? profileSearch.path
  const pluginsSrcDir = options.pluginsSrcDir ?? DEFAULT_PLUGINS_SRC_DIR
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const probeRoutes = options.probeRoutes ?? true
  const timeoutMs = options.probeTimeoutMs ?? 2_500

  if (profileDir === null) {
    // NOT MEASURED, with the search printed: a reader of a failed half must be
    // able to see WHERE the instrument looked, or the absence is unappealable.
    const unavailable: Unavailable = {
      reason: `profile manifest not found: ${describeSearch('resolveProfileDir', profileSearch.searched)}`,
      measuredAt: at,
    }
    return { census: null, unavailable }
  }

  let manifest: ManifestReading
  try {
    manifest = readProfileManifest(profileDir)
  } catch (error) {
    const unavailable: Unavailable = {
      reason: `profile manifest unreadable at ${join(profileDir, 'package.json')}: ${(error as Error).message}`,
      measuredAt: at,
    }
    return { census: null, unavailable }
  }

  // ---- PHASE 1: every filesystem read and route DERIVATION, in dependency order ----
  // Synchronous work only: a checkout is walked and its route literals extracted, so
  // phase 2 has one flat list to schedule rather than one batch per dependency.
  const drafts: ProbeDraft[] = []
  for (const [dependency, spec] of Object.entries(manifest.dependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const checkoutPath = checkoutFromSpec(spec, profileDir)
    const resolution: InstalledEntry['resolution'] = spec.startsWith('link:')
      ? 'link'
      : /^\d|^\^|^~|^[a-z]/.test(spec)
        ? 'registry'
        : 'other'

    let checkoutExists: boolean | null = null
    let packageName: string | null = null
    let clientPresent: boolean | null = null
    let rawRoutes: readonly RawRoute[] = []
    if (checkoutPath !== null) {
      checkoutExists = existsSync(checkoutPath)
      if (checkoutExists) {
        try {
          const pkg = JSON.parse(readFileSync(join(checkoutPath, 'package.json'), 'utf8')) as Record<string, unknown>
          packageName = typeof pkg.name === 'string' ? pkg.name : null
          const dsh = pkg.dsh
          clientPresent = Boolean(dsh && typeof dsh === 'object' && 'client' in (dsh as Record<string, unknown>))
        } catch {
          packageName = null
          clientPresent = null
        }
        rawRoutes = deriveRoutes(checkoutPath, pluginsSrcDir ?? checkoutPath)
      }
    }

    let nodeModulesPath: string | null = null
    try {
      nodeModulesPath = realpathSync(join(profileDir, 'node_modules', dependency))
    } catch {
      nodeModulesPath = null
    }

    const bundleListed =
      manifest.bundles.includes(dependency) || (packageName !== null && manifest.bundles.includes(packageName))

    drafts.push({
      dependency,
      spec,
      resolution,
      checkoutPath,
      checkoutExists,
      packageName,
      clientPresent,
      bundleListed,
      nodeModulesPath,
      rawRoutes,
    })
  }

  // ---- PHASE 2: every probe, at most PROBE_CONCURRENCY in flight ----
  // The task list is flat and carries its own destination, so the result is stitched
  // back by index and the DERIVED ORDER cannot depend on which probe finished first.
  const tasks: { readonly draft: number; readonly route: number; readonly path: string }[] = []
  drafts.forEach((draft, draftIndex) => {
    draft.rawRoutes.slice(0, 40).forEach((raw, routeIndex) => {
      tasks.push({ draft: draftIndex, route: routeIndex, path: raw.path })
    })
  })
  const probed = new Map<string, { readonly probe: RouteProbe | null; readonly skipped: string | null }>()
  if (probeRoutes && tasks.length > 0) {
    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= tasks.length) return
        const task = tasks[index]
        if (task === undefined) return
        probed.set(`${task.draft}:${task.route}`, await probeRoute(task.path, baseUrl, timeoutMs))
      }
    }
    await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, tasks.length) }, () => worker()))
  }

  // ---- PHASE 3: assemble the entries in dependency order ----
  const offline = { probe: null, skipped: 'probing disabled by the caller (harness offline mode)' }
  const entries: InstalledEntry[] = []
  for (const [draftIndex, draft] of drafts.entries()) {
    const routes: DerivedRoute[] = draft.rawRoutes.slice(0, 40).map((raw, routeIndex) => {
      const reading = probed.get(`${draftIndex}:${routeIndex}`) ?? offline
      return {
        path: raw.path,
        kind: raw.kind,
        source: raw.source,
        viaConst: raw.viaConst,
        probe: reading.probe,
        probeSkippedBecause: reading.skipped,
      }
    })

    const answers = routes.filter((route) => route.probe !== null && route.probe.status !== null)
    const servesRoute = answers.length === 0 ? null : answers.some((route) => route.probe?.status !== 404)
    const servesRouteUnknownBecause =
      servesRoute !== null
        ? null
        : draft.rawRoutes.length === 0
          ? 'no route literal found in this checkout (it may register no HTTP route at all)'
          : 'no probe was made, so serving is NOT MEASURED rather than absent'

    entries.push({
      dependency: draft.dependency,
      spec: draft.spec,
      resolution: draft.resolution,
      checkoutPath: draft.checkoutPath,
      checkoutExists: draft.checkoutExists,
      packageName: draft.packageName,
      clientPresent: draft.clientPresent,
      bundleListed: draft.bundleListed,
      nodeModulesPath: draft.nodeModulesPath,
      routes,
      servesRoute,
      servesRouteUnknownBecause,
    })
  }

  const census: InstalledCensus = {
    profileManifest: join(profileDir, 'package.json'),
    profileManifestSha256: manifest.sha256,
    profileManifestMtime: manifest.mtime,
    at,
    dependencies: entries,
    bundles: manifest.bundles,
    nodeModules: countNodeModules(profileDir, entries),
    entriesWithCheckout: entries.filter((entry) => entry.checkoutExists === true).length,
    entriesWithClient: entries.filter((entry) => entry.clientPresent === true).length,
    entriesBundleListed: entries.filter((entry) => entry.bundleListed).length,
    entriesServingRoute: entries.filter((entry) => entry.servesRoute === true).length,
    entriesWithRoutes: entries.filter((entry) => entry.routes.length > 0).length,
  }
  return { census, unavailable: null }
}

/**
 * Does this installed entry answer to a catalog row's `name` or `npm`?
 *
 * Ordinal on both fields — a dependency key and a catalog `npm` are identifiers,
 * and case-folding them would be the shell trap arriving in a matcher. The
 * entry's own manifest name is tried as well, because a profile key and a
 * package name can differ (`dshmarket` is the dependency AND the package name
 * for `plugins-src/dsh-market`, which is the kind of coincidence that makes
 * name-only matching look safe).
 */
export function entryMatchesRow(entry: InstalledEntry, name: string, npm: string | null): boolean {
  const own = [entry.dependency, entry.packageName].filter((value): value is string => value !== null)
  if (own.includes(name)) return true
  if (npm !== null && own.includes(npm)) return true
  return false
}

/** A tiny guard used by the harness: is this path a directory? */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Exported for the verify driver's fixture check. */
export const internals = { MUTATING_SEGMENT, lastSegment, readProfileManifest, basename }
