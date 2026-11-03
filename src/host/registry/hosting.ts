/**
 * ============================================================================
 * dsh-meta-market — THE HOSTING LEDGER: provider-hosted preheated cache agents
 * ============================================================================
 *
 * THE ROW TYPE THIS FILE ADDS, AND WHY IT IS A REGISTRY ROW RATHER THAN A PAGE
 *
 * The owner's ask is a market obligation: *"providers like deepseek will be
 * obliged to the community to constantly host the stable meta intent aligned pre
 * heated cache agents that folds on that architecture, because such way the
 * selection of the agent will profit both deepseek as provider in expences and to
 * user with speed and api usage."* An obligation that is not a ROW cannot be
 * counted, and a count that cannot be taken cannot be met or unmet. So the unit
 * here is one row per obligation, built from the SAME `Registry` the six provider
 * lanes already read — `openRegistry()` in this module's parent — rather than from
 * a second inventory of the same machine.
 *
 * THE ONE THING EVERY ROW MUST DO: NAME THE COMPONENT IT FOLDS ONTO, AND SAY
 * WHETHER THAT COMPONENT EXISTS TODAY.
 *
 * "Folds onto the current architecture" is checkable only if it resolves to one of
 * three kinds of thing that can be measured on this machine:
 *
 *   - `clone`   — a directory under `plugins-src/` whose `package.json` `name`
 *                 matches, with the files the row depends on present on disk;
 *   - `route`   — a path on the live origin that ANSWERS. A `404` is not an
 *                 answer here: it is the one status that means "not registered";
 *   - `catalog` — a catalog row matched by `name` OR `npm`, WITH ITS ROW COUNT,
 *                 because a catalog name is not a unique key and this catalog has
 *                 two `dsh-proactive` rows today.
 *
 * THREE VERDICTS, NEVER FLATTENED — the same discipline as `kind` in `types.ts`:
 *
 *   - `folded`             — the edge lands on a component that exists today and
 *                            is reachable where the row says it is;
 *   - `folded-library-only`— the file exists and its STAGE does not run: measured
 *                            by counting the production importers of the module,
 *                            which is exactly how `dsh-intent-mode`'s preheat
 *                            builder was found to have 0 callers;
 *   - `not-folded`         — the component does not exist today, or an ABSENT
 *                            READING is being passed off as one. Named, never
 *                            counted.
 *
 * A `not-folded` row is the point of the ledger as much as a `folded` one: this
 * program's most-published defect is a plan read as an existence claim, and a
 * hosting obligation that no provider has taken up is a FACT about the market, not
 * an embarrassment to be smoothed over.
 *
 * COST AND BENEFIT SIDES ARE NULL UNTIL SOMETHING MEASURED THEM.
 *
 * `providerCost` and `userBenefit` carry `reading: null` with a `reason` unless a
 * number exists — and every number that does exist travels with its provenance,
 * `measured-here` or `cited`, and its source. A cited number is the authority of
 * the document it came from and not of this lane, which is why the field says so.
 *
 * @module dsh-meta-market/host/registry/hosting
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { resolvePluginsSrcDir, resolveProfileDir } from './paths.ts'
import type { Registry } from './types.ts'

/** One of the three kinds of thing an edge may terminate in. */
export type FoldKind = 'clone' | 'route' | 'catalog'

/** The three verdicts. Never merged: an unreachable stage is not a fold. */
export type FoldState = 'folded' | 'folded-library-only' | 'not-folded'

/** Where a number came from. `not-measured` never carries a value. */
export type Provenance = 'measured-here' | 'cited' | 'not-measured'

/** One checkable claim with its provenance. */
export interface Evidence {
  readonly claim: string
  readonly provenance: Provenance
  readonly source: string
  readonly at: string
}

/** A route as measured by this process. `status: null` = NOT PROBED, never 0. */
export interface RouteReading {
  readonly path: string
  readonly url: string
  readonly status: number | null
  readonly bytes: number | null
  readonly ms: number | null
  /** Top-level JSON keys of the body, so a caller can say what a 200 does NOT carry. */
  readonly bodyKeys: readonly string[] | null
  readonly error: string | null
  readonly at: string
}

/** A clone under `plugins-src/` as measured. */
export interface CloneReading {
  readonly packageName: string
  readonly dir: string | null
  readonly version: string | null
  readonly files: readonly { readonly file: string; readonly bytes: number; readonly exists: boolean }[]
}

/** What one trial found. `matched: null` means NOT MEASURED — not a refusal. */
export interface MeasuredTrial {
  readonly kind: FoldKind
  readonly target: string
  readonly matched: boolean | null
  readonly detail: string
  /** Present when the trial was a route. */
  readonly route: RouteReading | null
  /** Present when the trial was a clone. */
  readonly clone: CloneReading | null
  /** Rows matched, and the population, for a catalog trial. */
  readonly rows: { readonly count: number; readonly of: number } | null
  /** The matched catalog row's identity fields, when one row matched uniquely. */
  readonly row: CatalogIdentity | null
  readonly at: string
}

/** The fields the owner's ask needs from a catalog row, and nothing more. */
export interface CatalogIdentity {
  readonly name: string
  readonly npm: string | null
  readonly owner: string | null
  readonly version: string | null
  readonly stars: number | null
  readonly row: number
}

/** One side of the trade. `reading: null` is NOT MEASURED and carries `reason`. */
export interface CostSide {
  readonly reading: number | null
  readonly unit: string | null
  readonly basis: string
  readonly provenance: Provenance
  readonly source: string | null
  readonly reason: string | null
}

/** The hosting obligation itself: who hosts it, and does anybody, today. */
export interface HostingSide {
  /** The provider the obligation names. `null` = no provider is named for this stage. */
  readonly declaredProvider: string | null
  /** Where the copy that answered this request actually runs. */
  readonly hostToday: string
  /** `false` when no provider-hosted copy was found; `null` when it was not measurable. */
  readonly providerHosted: boolean | null
  readonly reason: string | null
}

/** The intent stage a preheated agent is warmed to, and whether that stage runs. */
export interface StageSide {
  readonly stage: string
  readonly preheatedTo: string
  readonly meaning: string
  readonly stageExistsToday: boolean
  /** `null` = NOT MEASURED. `false` = measured and the stage has no production caller. */
  readonly stageReachedInProduction: boolean | null
  readonly note: string | null
  /**
   * WHAT THE STAGE HAS ACTUALLY PRODUCED, when a store is declared for it.
   *
   * A call site is evidence that a stage is WIRED; an artifact is evidence that it
   * RAN. This program's record is full of stages that were wired and never called,
   * so the two are reported separately and neither stands in for the other. `null`
   * means no store was declared for this row — which is not the same as a store
   * that was read and found empty.
   */
  readonly productionOutput: {
    readonly store: string
    /** Files in the store that are NOT declared fixtures. `null` = NOT MEASURED. */
    readonly artifacts: number | null
    /** Files excluded as fixtures, counted rather than silently dropped. */
    readonly excludedFixtures: number
    readonly ledger: string
    readonly ledgerKind: string
    /** Events of `ledgerKind` in the ledger. `null` = NOT MEASURED. */
    readonly ledgerEvents: number | null
    readonly note: string
    readonly at: string
  } | null
}

/** The edge onto the current architecture. */
export interface FoldEdge {
  readonly state: FoldState
  readonly kind: FoldKind | null
  readonly component: string | null
  readonly why: string
  readonly trials: readonly MeasuredTrial[]
}

/** One provider-hosted preheated cache agent obligation. */
export interface HostingRow {
  readonly id: string
  readonly hosting: HostingSide
  readonly intentStage: StageSide
  readonly providerCost: CostSide
  readonly userBenefit: CostSide
  readonly fold: FoldEdge
  /**
   * Where the identity fields came from, so a `null` owner is readable.
   *
   * `catalog` — a market row, which carries owner/npm/version;
   * `clone`   — a local checkout, which carries a package name and version and
   *             has NO marketplace owner: the nulls are structural, not missing;
   * `none`    — no component folded, so there is no identity to state.
   */
  readonly identitySource: 'catalog' | 'clone' | 'none'
  readonly identity: CatalogIdentity | null
}

/** A provider, measured as it stands on this machine. */
export interface ProviderReading {
  readonly name: string
  readonly role: 'declared-provider' | 'host-today'
  readonly evidence: readonly Evidence[]
  /** `true` only if the provider's own surface is one of the three fold kinds. */
  readonly isFoldTarget: boolean
  /** `true` when the catalog half loaded; `false` means the counts below are NOT MEASURED and must not be read as `0 of 0`. */
  readonly catalogRows: {
    readonly scope: string
    readonly count: number
    readonly of: number
    readonly measured: boolean
  }
  /** Clones under `plugins-src/` whose package name contains the provider name. */
  readonly pluginsSrcClones: number
  readonly hostedCopies: number
  readonly reason: string
}

/** A seed whose measurement failed, named rather than silently dropped. */
export interface WithheldRow {
  readonly id: string
  readonly reason: string
}

/** The whole report this module builds. */
export interface HostingReport {
  readonly rows: readonly HostingRow[]
  readonly providers: readonly ProviderReading[]
  readonly census: {
    /** Seeds this build attempted. */
    readonly rowsAttempted: number
    /** Rows this payload actually carries. */
    readonly rowsServed: number
    readonly folded: number
    readonly foldedLibraryOnly: number
    readonly notFolded: number
    /** Rows whose fold state is `not-folded`, named so a reader need not re-derive them. */
    readonly notFoldedIds: readonly string[]
    readonly population: string
    readonly at: string
  }
  readonly withheld: readonly WithheldRow[]
  readonly notDone: readonly string[]
  readonly at: string
}

/* ------------------------------------------------------------------------- *
 * Measurement primitives. Each returns a READING, and "not measured" is a
 * distinct value from "measured and absent" everywhere it can be.
 * ------------------------------------------------------------------------- */

const ROUTE_TIMEOUT_MS = 6_000

/** Probe one path on the live origin. Never throws; a failure is a reading. */
async function probeRoute(origin: string, path: string): Promise<RouteReading> {
  const at = new Date().toISOString()
  const url = `${origin}${path}`
  const started = Date.now()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) })
    const text = await response.text()
    let bodyKeys: readonly string[] | null = null
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>
        const keys = Object.keys(record).sort()
        // A nested `state` object is represented too, as `state.<key>`: a wrapper's
        // top-level keys alone would let a 200 that carries only `{ok, state}`
        // look like a 200 that carries nothing, and the reverse trap is worse.
        const state = record.state
        const nested =
          state !== null && typeof state === 'object' && !Array.isArray(state)
            ? Object.keys(state as Record<string, unknown>)
                .map((key) => `state.${key}`)
                .sort()
            : []
        bodyKeys = [...keys, ...nested]
      }
    } catch {
      // A non-JSON body is not an error; the keys are simply not available.
    }
    return {
      path,
      url,
      status: response.status,
      bytes: Buffer.byteLength(text, 'utf8'),
      ms: Date.now() - started,
      bodyKeys,
      error: null,
      at,
    }
  } catch (error) {
    return {
      path,
      url,
      status: null,
      bytes: null,
      ms: null,
      bodyKeys: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      at,
    }
  }
}

/** Every directory under `plugins-src/`, read once. */
function pluginsSrcEntries(dir: string | null): readonly string[] {
  if (dir === null) return []
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

/** The `package.json` of a clone, or `null` when it cannot be read. */
function readManifest(dir: string): { readonly name: string | null; readonly version: string | null } {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (parsed !== null && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      return {
        name: typeof record.name === 'string' ? record.name : null,
        version: typeof record.version === 'string' ? record.version : null,
      }
    }
  } catch {
    // An unreadable manifest is not a name; the caller keeps looking.
  }
  return { name: null, version: null }
}

/** Resolve a clone by its package `name`, so a renamed directory still resolves. */
function findClone(packageName: string): { readonly dir: string; readonly version: string | null } | null {
  const root = resolvePluginsSrcDir()
  if (root === null) return null
  for (const entry of pluginsSrcEntries(root)) {
    const dir = join(root, entry)
    let isDir = false
    try {
      isDir = statSync(dir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    const manifest = readManifest(dir)
    if (manifest.name === packageName) return { dir, version: manifest.version }
  }
  return null
}

/**
 * The provider's own adapter, which lives in the harness package tree and NOT
 * under `plugins-src/`.
 *
 * Found by SHAPE from the `plugins-src` root rather than by a `../` count, for the
 * reason `paths.ts` records: a count is a bet on where the file will be emitted.
 * This reading exists so the provider side can be reported as MEASURED-BUT-NOT-A-
 * FOLD rather than as absent, which is a different and much weaker claim.
 */
function findHarnessAdapter(): { readonly dir: string; readonly version: string | null } | null {
  const root = resolvePluginsSrcDir()
  if (root === null) return null
  for (const dir of [
    join(root, '..', 'deepseek-harness', 'packages', 'llm', 'llm-deepseek'),
    join(root, '..', 'deepseek-harness', 'packages', 'llm-deepseek'),
  ]) {
    const manifest = readManifest(dir)
    if (manifest.name !== null) return { dir, version: manifest.version }
  }
  return null
}

/**
 * THE STAGE INSTRUMENT: does the declared entry point actually get CALLED?
 *
 * This replaces a weaker check that this lane shipped first and had to correct.
 * The earlier version counted importers of the module and tested whether the
 * IMPORTED NAME equalled the MODULE NAME — which is right only when a module and
 * its entry function share a name (`dispatch.ts` → `dispatch`). For `preheat.ts`
 * the entry function is `buildPacket`, so a genuinely wired stage would have been
 * reported as unwired, and `dsh-intent-mode`'s own `scheduler.ts` importing
 * `buildPacket` is exactly that case. **A check that cannot go GREEN on the thing
 * it is looking for is as broken as one that cannot go RED.**
 *
 * So the probe now takes the FUNCTION NAMES it is looking for, and asks three
 * questions per importer: which names it took, how many times it CALLS one of the
 * declared functions, and whether that importer is reachable from the plugin's own
 * entry file. A stage runs only when an importer reachable from the entry makes a
 * call — an importer that takes constants and never calls is a library edge, which
 * is what `dispatch.ts` has.
 */
const ENTRY_FILE = 'src/host/index.ts'

interface StageProbe {
  readonly module: string
  readonly functions: readonly string[]
}

interface ImporterReading {
  /** Clone-relative path of the importing file. */
  readonly file: string
  readonly names: readonly string[]
  /** Occurrences of a declared function followed by `(` in that file. */
  readonly callSites: number
  readonly reachableFromEntry: boolean
}

function relativeImportsOf(file: string): readonly string[] {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const found: string[] = []
  const pattern = /from\s+'(\.[^']+)'/g
  let match = pattern.exec(text)
  while (match !== null) {
    const specifier = match[1]
    if (specifier !== undefined) found.push(resolve(dirname(file), specifier))
    match = pattern.exec(text)
  }
  return found
}

/** Every file reachable from `entryPath` through relative imports, bounded. */
function reachableSet(entryPath: string, maxDepth = 5): ReadonlySet<string> {
  const seen = new Set<string>()
  const queue: { readonly path: string; readonly depth: number }[] = [{ path: entryPath, depth: 0 }]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    if (seen.has(current.path) || current.depth > maxDepth) continue
    seen.add(current.path)
    for (const next of relativeImportsOf(current.path)) queue.push({ path: next, depth: current.depth + 1 })
  }
  return seen
}

/**
 * Strip comments and string literals before counting a CALL SITE.
 *
 * THE FIRST VERSION OF THIS COUNTER WAS FOOLED BY A BACKTICK. `index.ts` explains
 * the dispatch seam in a doc comment — ``dispatch(intent, deps)`` — and a naive
 * `\bdispatch\s*\(` count read that PROSE as a call, which would have folded
 * `dispatch-handoff` on the strength of a comment. The error direction matters:
 * over-counting calls folds a stage that does not run, which is the expensive
 * mistake; under-counting marks a running stage as a library, which is merely
 * conservative and visible. So comments and literals are removed first.
 */
export function stripNonCode(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function probeStageReach(cloneDir: string, probe: StageProbe): {
  readonly importers: readonly ImporterReading[]
  readonly reachedThrough: ImporterReading | null
  readonly note: string
} {
  const entryPath = join(cloneDir, ENTRY_FILE)
  const reachable = reachableSet(entryPath)
  const moduleBase = probe.module.replace(/\./g, '\\.')
  const importPattern = new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*'[^']*\\/${moduleBase}\\.ts'`, 'g')
  const callPatterns = probe.functions.map((fn) => ({ fn, pattern: new RegExp(`\\b${fn}\\s*\\(`, 'g') }))
  const importers: ImporterReading[] = []
  const root = join(cloneDir, 'src')
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return
    let entries: string[]
    try {
      entries = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      let isDir = false
      try {
        isDir = statSync(path).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        walk(path, depth + 1)
        continue
      }
      if (!entry.endsWith('.ts') || entry === `${probe.module}.ts`) continue
      let text = ''
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      const names: string[] = []
      let found = false
      importPattern.lastIndex = 0
      let match = importPattern.exec(text)
      while (match !== null) {
        found = true
        for (const piece of (match[1] ?? '').split(',')) {
          const name = piece.trim().split(/\s+as\s+/)[0]?.trim() ?? ''
          if (name !== '' && !name.startsWith('type ')) names.push(name)
        }
        match = importPattern.exec(text)
      }
      if (!found) continue
      let callSites = 0
      const code = stripNonCode(text)
      for (const { pattern } of callPatterns) {
        pattern.lastIndex = 0
        callSites += code.match(pattern)?.length ?? 0
      }
      importers.push({
        file: path.slice(root.length + 1).replace(/\\/g, '/'),
        names,
        callSites,
        reachableFromEntry: reachable.has(path),
      })
    }
  }
  walk(root, 0)

  const reachedThrough =
    importers.find((importer) => importer.callSites > 0 && importer.reachableFromEntry) ?? null
  const described = importers
    .map(
      (importer) =>
        `${importer.file} takes [${importer.names.join(', ')}], makes ${importer.callSites} call(s) in code, ${
          importer.reachableFromEntry ? 'reachable' : 'NOT reachable'
        } from ${ENTRY_FILE}`,
    )
    .join('; ')
  const note =
    importers.length === 0
      ? `0 importers of ${probe.module}.ts under the clone's src/ — the module exists and nothing calls it`
      : reachedThrough === null
        ? `${importers.length} importer(s) of ${probe.module}.ts and NO call of [${probe.functions.join(', ')}] from a file reachable from ${ENTRY_FILE}: ${described}`
        : `${reachedThrough.file} calls an entry function of ${probe.module}.ts ${reachedThrough.callSites} time(s) and is reachable from ${ENTRY_FILE}; importers seen: ${described}`
  return { importers, reachedThrough, note }
}

/* ------------------------------------------------------------------------- *
 * Production output. A call site says a stage is WIRED; an artifact says it RAN.
 * ------------------------------------------------------------------------- */

/** The program workspace that owns `intent_mode/`, resolved from the profile. */
function workspaceRoot(): string | null {
  const profile = resolveProfileDir()
  return profile.path === null ? null : join(profile.path, 'dsh-meta-evolve_INIT_WORKSPACE')
}

function measureProductionOutput(spec: {
  readonly store: string
  readonly exclude: readonly string[]
  readonly ledger: string
  readonly kind: string
}): NonNullable<StageSide['productionOutput']> {
  const at = new Date().toISOString()
  const root = workspaceRoot()

  if (root === null) {
    return {
      store: spec.store,
      artifacts: null,
      excludedFixtures: 0,
      ledger: spec.ledger,
      ledgerKind: spec.kind,
      ledgerEvents: null,
      note: 'NOT MEASURED: the profile directory could not be resolved, so the declared store was never read',
      at,
    }
  }

  let artifacts: number | null = null
  let excludedFixtures = 0
  let storeNote: string
  try {
    const entries = readdirSync(join(root, spec.store))
    excludedFixtures = entries.filter((entry) => spec.exclude.includes(entry)).length
    artifacts = entries.length - excludedFixtures
    storeNote = `${artifacts} artifact(s) in ${spec.store} besides ${excludedFixtures} declared fixture(s)`
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown'
    // AN ABSENT STORE IS NOT AN EMPTY ONE, and neither is `0` here: a directory
    // that does not exist has never been written, which is a different fact from a
    // directory that was read and holds nothing.
    artifacts = null
    storeNote =
      code === 'ENOENT'
        ? `${spec.store} does not exist (ENOENT), so this stage has written nothing there`
        : `${spec.store} could not be read (${code}), so its contents are NOT MEASURED`
  }

  let ledgerEvents: number | null = null
  let ledgerNote: string
  try {
    const text = readFileSync(join(root, spec.ledger), 'utf8')
    ledgerEvents = text.match(new RegExp(`"kind"\\s*:\\s*"${spec.kind}"`, 'g'))?.length ?? 0
    ledgerNote = `${ledgerEvents} '${spec.kind}' event(s) in ${spec.ledger}`
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown'
    ledgerNote = `${spec.ledger} could not be read (${code}), so its event count is NOT MEASURED`
  }

  return {
    store: spec.store,
    artifacts,
    excludedFixtures,
    ledger: spec.ledger,
    ledgerKind: spec.kind,
    ledgerEvents,
    note: `${storeNote}; ${ledgerNote}`,
    at,
  }
}

/* ------------------------------------------------------------------------- *
 * The seeds. Each is an obligation the owner's ask names, stated at the grain of
 * ONE intent stage. The trials below are the fold attempts; measurement decides.
 * ------------------------------------------------------------------------- */

interface Seed {
  readonly id: string
  readonly declaredProvider: string | null
  readonly stage: string
  readonly preheatedTo: string
  readonly meaning: string
  readonly trials: readonly TrialSpec[]
  readonly providerCost: CostSide
  readonly userBenefit: CostSide
  /** A measured fact that belongs on the stage and is not produced by a trial. */
  readonly staticNote?: string
  /** The store this stage writes, so "it ran" can be told from "it is wired". */
  readonly outputProbe?: {
    readonly store: string
    readonly exclude: readonly string[]
    readonly ledger: string
    readonly kind: string
  }
  /** Measured refinement of the verdict, applied after the trials run. */
  readonly refine?: (trials: readonly MeasuredTrial[]) => { readonly state: FoldState; readonly why: string } | null
}

type TrialSpec =
  | { readonly kind: 'route'; readonly path: string }
  | {
      readonly kind: 'clone'
      readonly package: string
      readonly files: readonly string[]
      readonly importProbe: StageProbe | null
    }
  | { readonly kind: 'catalog'; readonly by: 'name' | 'npm' | 'owner'; readonly value: string }

const NOT_MEASURED_COST = (reason: string): CostSide => ({
  reading: null,
  unit: null,
  basis: 'no measured term exists for this side of the trade on this machine today',
  provenance: 'not-measured',
  source: null,
  reason,
})

const SEEDS: readonly Seed[] = Object.freeze([
  {
    id: 'zone-index',
    declaredProvider: 'deepseek',
    stage: 'intent-zone-lookup',
    preheatedTo: 'the 24-zone intent map, precalculated at index build time',
    meaning: 'A request is placed on the shared intent map without re-embedding the corpus.',
    trials: [
      { kind: 'route', path: '/intent-map/api/map' },
      { kind: 'clone', package: 'dsh-intent-map', files: ['src/host/recall.ts'], importProbe: null },
    ],
    providerCost: NOT_MEASURED_COST(
      'the zone index is computed and served by the local harness; no provider is billed for it and this surface holds no provider-side term for it',
    ),
    userBenefit: NOT_MEASURED_COST(
      'the saving is the difference between a precalculated read and a cold rebuild; the cold rebuild has not been measured, so only the served read latency is reported (in basis) rather than a saving',
    ),
  },
  {
    id: 'preheat-packet',
    declaredProvider: 'deepseek',
    stage: 'preheat-packet',
    preheatedTo: "the agent's first read: a composed context packet built before the agent's critical path",
    meaning: 'The embed call moves out of the critical path, so the agent\'s first read is a file read.',
    trials: [
      {
        kind: 'clone',
        package: 'dsh-intent-mode',
        files: ['src/host/preheat.ts'],
        // `buildPacket` is the entry point, NOT the module name. This probe was
        // shipped first as the bare string 'preheat' and would have reported a
        // genuinely wired stage as unwired; see the instrument's own note.
        importProbe: { module: 'preheat', functions: ['buildPacket', 'composeContext'] },
      },
      { kind: 'route', path: '/intent-mode/api/packet' },
    ],
    providerCost: NOT_MEASURED_COST(
      'the packet is built by the local harness against a local embedder; no provider-hosted preheat exists to be charged for, so there is nothing on this machine to price',
    ),
    userBenefit: NOT_MEASURED_COST(
      'moving the embed call out of the critical path has no measured latency in this workspace: no before/after pair for a packet-carrying read exists, and whether the builder has a construction site is reported on the stage rather than asserted here',
    ),
    // THE STORE IS DECLARED SO "WIRED" CANNOT PASS FOR "RAN". Re-measured after lane
    // `market-ledger` wired the preheat pass: the ledger now carries `preheated`
    // events and `intent_mode/context/` now holds packets. `latency-probe.json` is a
    // hand-written harness fixture and is excluded BY NAME, counted beside the result.
    outputProbe: {
      store: 'intent_mode/context',
      exclude: ['latency-probe.json'],
      ledger: 'intent_mode/ledger.jsonl',
      kind: 'preheated',
    },
  },
  {
    id: 'dispatch-handoff',
    declaredProvider: 'deepseek',
    stage: 'dispatch-handoff',
    preheatedTo: 'the fleet handoff that follows a preheated intent',
    meaning: 'A preheated intent is handed to an agent through a recorded adapter rather than held in memory.',
    trials: [
      {
        kind: 'clone',
        package: 'dsh-intent-mode',
        files: ['src/host/dispatch.ts'],
        // The FUNCTION, not the module name: `dispatch.ts` is imported by the host
        // entry for four helpers and for neither the dispatcher nor a call to it.
        importProbe: { module: 'dispatch', functions: ['dispatch'] },
      },
      { kind: 'route', path: '/intent-mode/api/map' },
    ],
    providerCost: NOT_MEASURED_COST(
      'no dispatch record has ever been written on this machine, so no provider-side cost has been incurred or measured',
    ),
    userBenefit: NOT_MEASURED_COST(
      'the handoff is a round trip whose duration nothing records; the packet and dispatch stores carry no timing field',
    ),
    // THE RECORD THAT WOULD MAKE THIS STAGE REAL IS DECLARED AND COUNTED, not
    // asserted in prose: a `dispatch/` store and `dispatched` ledger events, both of
    // which the row reports at read time.
    outputProbe: {
      store: 'intent_mode/dispatch',
      exclude: [],
      ledger: 'intent_mode/ledger.jsonl',
      kind: 'dispatched',
    },
  },
  {
    id: 'kv-prefix',
    declaredProvider: 'deepseek',
    stage: 'kv-prefix-reuse',
    preheatedTo: "a retained KV prefix on the provider's inference host",
    meaning: 'The provider keeps the prompt-side attention state instead of recomputing it per request.',
    // NO ROUTE TRIAL HERE ON PURPOSE: the only route that could answer for a KV
    // prefix on this machine is an inference endpoint, not a plugin route, and the
    // two trials below are the two fold kinds a retained prefix could claim. A
    // trial that probed THIS route would recurse into the memoised build.
    trials: [
      { kind: 'catalog', by: 'npm', value: 'dsh-kv-cache' },
      { kind: 'catalog', by: 'name', value: 'dsh-kv-cache' },
    ],
    providerCost: {
      reading: 4.12,
      unit: 'GiB',
      basis: 'one retained KV entry at 131072 context, at the measured 33.0 KiB per token (two-point VRAM differencing: -c 8192 → 3,055 MiB, -c 32768 → 3,847 MiB)',
      provenance: 'cited',
      source: 'research/kv-receipt-meta-market.md §1-2 (cited from the workspace record; this lane did not re-run the VRAM differencing)',
      reason: null,
    },
    userBenefit: {
      reading: 563.2,
      unit: 'ms',
      basis: 'prefill 569.2 ms cold → 6.0 ms on a full hit, i.e. 563.2 ms saved per hit — and 390.6 ms after eviction, which is why the row is not counted as folded',
      provenance: 'cited',
      source: 'research/kv-receipt-meta-market.md §1-2 (cited; not re-measured here)',
      reason: 'the cited series shows the prefix REBUILT rather than kept, so the saving is conditional on a residency nothing on this machine can attest',
    },
  },
  {
    id: 'proactive-wake',
    declaredProvider: 'community',
    stage: 'proactive-wake',
    preheatedTo: 'a scheduled wake-up, so an idle hot agent is aimed rather than guessed',
    meaning: 'A cold session is woken on a schedule the model itself set, rather than on the user request.',
    trials: [
      { kind: 'catalog', by: 'npm', value: 'dsh-proactive' },
      { kind: 'catalog', by: 'name', value: 'dsh-proactive' },
    ],
    providerCost: NOT_MEASURED_COST(
      'the catalog publishes stars, downloads and capabilities; it publishes no cost term, and downloads are not a cost',
    ),
    userBenefit: NOT_MEASURED_COST(
      'the catalog row describes a wake-up schedule; it states no measured latency or token saving, and inventing one would be the defect this program records most often',
    ),
    refine: (trials) => {
      const named = trials.find((trial) => trial.kind === 'catalog' && trial.rows !== null && trial.rows.count > 1)
      const unique = trials.find((trial) => trial.kind === 'catalog' && trial.rows !== null && trial.rows.count === 1)
      if (unique === undefined) return null
      return {
        state: 'folded',
        why: named === undefined
          ? 'a single catalog row matched, with owner, npm and version'
          : `the ${named.target} lookup returned ${named.rows?.count ?? 0} rows and was disambiguated to one row by npm; a catalog name is not a unique key`,
      }
    },
  },
  {
    id: 'provider-adapter',
    declaredProvider: 'deepseek',
    stage: 'provider-billing',
    preheatedTo: 'nothing is preheated at this stage; it is the provider side of the trade',
    meaning: 'The provider adapter that meters the tokens and would carry the hosting obligation.',
    trials: [
      { kind: 'clone', package: '@deepseek-ai/dsh-llm-deepseek', files: [], importProbe: null },
      { kind: 'catalog', by: 'owner', value: 'deepseek' },
    ],
    providerCost: NOT_MEASURED_COST(
      'the adapter meters tokens for a session; it holds no standing cost for hosting a preheated agent, and none was measured',
    ),
    userBenefit: NOT_MEASURED_COST(
      'no user-side speed or API-spend reading exists for a provider that hosts no preheated copy today',
    ),
    staticNote:
      'the provider adapter is measured on this machine but is not one of the three fold kinds, so this row states the provider side as UNFOLDED rather than counting the adapter as a fold',
  },
  {
    id: 'plan-rag-index',
    declaredProvider: 'community',
    stage: 'corpus-retrieval',
    preheatedTo: 'the precalculated plan corpus index',
    meaning: 'A corpus query is answered from a prebuilt index rather than by re-reading and re-embedding the corpus.',
    trials: [
      { kind: 'route', path: '/plan-rag/api/status' },
      { kind: 'clone', package: 'dsh-plan-rag', files: [], importProbe: null },
    ],
    providerCost: NOT_MEASURED_COST('the index is served by the local harness; no provider is billed for it'),
    userBenefit: NOT_MEASURED_COST(
      'the served read latency is in basis, but the cold-rebuild baseline a saving needs has not been measured',
    ),
  },
  {
    id: 'capacity-selection',
    declaredProvider: 'deepseek',
    stage: 'idle-hot-agent-selection',
    preheatedTo: 'the intent-zone an idle hot agent is aimed at',
    meaning: "The selection of the agent, which the owner's ask says profits both sides.",
    trials: [
      {
        kind: 'clone',
        package: 'dsh-intent-mode',
        files: ['src/host/capacity.ts'],
        // RE-MEASURED 2026-10-18 after lane `capacity-agents` landed
        // `src/host/capacity.ts` and lane `wiring` called `createCapacityProbe()`
        // from the host entry. The route trial below is KEPT and is still true of
        // that route — it reports a CAP and no queue — which is exactly why the
        // reading had to come from a different component.
        importProbe: { module: 'capacity', functions: ['createCapacityProbe'] },
      },
      { kind: 'route', path: '/agent-team-cap/api/state' },
      { kind: 'clone', package: 'dsh-agent-team-cap', files: [], importProbe: null },
    ],
    providerCost: NOT_MEASURED_COST('nothing on this machine prices an idle hot agent'),
    userBenefit: NOT_MEASURED_COST(
      'the saving is the avoided queue wait; queue occupancy is readable through the capacity probe, but no before/after wait pair has been measured here, so the saving stays unmeasured',
    ),
    refine: (trials) => {
      // The capacity COMPONENT is the question, not the cap route. If that component
      // is absent, the cap route must not fold this row on its own — that was the
      // row's first verdict, and it was right about the route.
      const component = trials.find((trial) => trial.kind === 'clone' && trial.target === 'dsh-intent-mode')
      if (component !== undefined && component.matched === true) return null
      const route = trials.find((trial) => trial.route !== null)?.route ?? null
      return {
        state: 'not-folded',
        why:
          route === null || route.status === null
            ? 'NOT MEASURED: the capacity route did not answer and the capacity component is absent, so no idle-agent reading could be taken. An unmeasured capacity is not a fold, and a `free` nobody read is not `free: true`.'
            : `no trial matched: clone:dsh-intent-mode/src/host/capacity.ts is ABSENT and route:${route.path} answers ${route.status} with a capacity CAP and no queue, idle-agent or pending-work reading — a route that answers a cap is not a component that reads a queue`,
      }
    },
  },
])

/* ------------------------------------------------------------------------- *
 * Trial measurement.
 * ------------------------------------------------------------------------- */

async function measureTrial(spec: TrialSpec, registry: Registry, origin: string): Promise<MeasuredTrial> {
  const at = new Date().toISOString()

  if (spec.kind === 'route') {
    const route = await probeRoute(origin, spec.path)
    const matched = route.status === null ? null : route.status !== 404 && route.status < 500
    return {
      kind: 'route',
      target: spec.path,
      matched,
      detail:
        route.status === null
          ? `NOT MEASURED: ${route.error ?? 'the request never completed'}`
          : `${route.status} ${route.bytes ?? 0} B in ${route.ms ?? 0} ms`,
      route,
      clone: null,
      rows: null,
      row: null,
      at,
    }
  }

  if (spec.kind === 'clone') {
    const found = findClone(spec.package)
    if (found === null) {
      return {
        kind: 'clone',
        target: spec.package,
        matched: false,
        detail: `no directory under plugins-src/ carries package name '${spec.package}'`,
        route: null,
        clone: null,
        rows: null,
        row: null,
        at,
      }
    }
    const files = spec.files.map((file) => {
      const path = join(found.dir, file)
      let bytes = 0
      let present = false
      try {
        bytes = statSync(path).size
        present = true
      } catch {
        present = false
      }
      return { file, bytes, exists: present }
    })
    const cloning: CloneReading = { packageName: spec.package, dir: found.dir, version: found.version, files }
    const missing = files.filter((entry) => !entry.exists)
    return {
      kind: 'clone',
      target: spec.package,
      matched: missing.length === 0,
      detail:
        missing.length === 0
          ? `clone at ${found.dir}${found.version === null ? '' : ` v${found.version}`}; ${files.length} of ${files.length} required files present`
          : `clone at ${found.dir} but ${missing.length} of ${files.length} required files ABSENT: ${missing.map((entry) => entry.file).join(', ')}`,
      route: null,
      clone: cloning,
      rows: null,
      row: null,
      at,
    }
  }

  const catalog = registry.downloadable.census
  if (catalog === null) {
    return {
      kind: 'catalog',
      target: `${spec.by}:${spec.value}`,
      matched: null,
      detail: `NOT MEASURED: the downloadable catalog half did not load — ${
        registry.downloadable.unavailable?.reason ?? 'no reason recorded'
      }`,
      route: null,
      clone: null,
      rows: null,
      row: null,
      at,
    }
  }
  const total = catalog.identity.rows
  if (spec.by === 'name' || spec.by === 'npm') {
    const query = spec.by === 'name' ? registry.byName(spec.value) : registry.byNpm(spec.value)
    const unique = query.rows.length === 1 ? query.rows[0] : undefined
    return {
      kind: 'catalog',
      target: `${spec.by}:${spec.value}`,
      matched: query.rows.length > 0,
      detail: `${query.rows.length} of ${query.totalRows} catalog rows matched ${spec.by} '${spec.value}'${
        query.ambiguous ? ' — AMBIGUOUS, see the disambiguation lines' : ''
      }`,
      route: null,
      clone: null,
      rows: { count: query.rows.length, of: query.totalRows },
      row:
        unique === undefined
          ? null
          : {
              name: unique.name,
              npm: unique.npm,
              owner: unique.owner,
              version: unique.version,
              stars: unique.stars,
              row: unique.index,
            },
      at,
    }
  }

  const query = registry.byOwner(spec.value)
  const unique = query.rows.length === 1 ? query.rows[0] : undefined
  return {
    kind: 'catalog',
    target: `owner:${spec.value}`,
    matched: query.rows.length > 0,
    detail: `${query.rows.length} of ${total} catalog rows carry owner '${spec.value}'`,
    route: null,
    clone: null,
    rows: { count: query.rows.length, of: total },
    row:
      unique === undefined
        ? null
        : { name: unique.name, npm: unique.npm, owner: unique.owner, version: unique.version, stars: unique.stars, row: unique.index },
    at,
  }
}

/* ------------------------------------------------------------------------- *
 * The provider table. Two readings: the provider the ask names, and the host
 * that actually served this request.
 * ------------------------------------------------------------------------- */

function measureProviders(registry: Registry): readonly ProviderReading[] {
  const at = new Date().toISOString()
  const rows = registry.downloadable.census === null ? [] : registry.allDownloadable()
  const scoped = rows.filter((row) => (row.npm ?? '').startsWith('@deepseek-ai/'))
  const ownerRows = registry.downloadable.census === null ? null : registry.byOwner('deepseek')
  const adapter = findHarnessAdapter()
  // Clones whose OWN MANIFEST names the provider. Counting directory names would
  // be a listing rather than a count, and a listing is not a count.
  const named: string[] = []
  const pluginsRoot = resolvePluginsSrcDir()
  if (pluginsRoot !== null) {
    for (const entry of pluginsSrcEntries(pluginsRoot)) {
      const manifest = readManifest(join(pluginsRoot, entry))
      if (manifest.name !== null && manifest.name.toLowerCase().includes('deepseek')) named.push(manifest.name)
    }
  }

  return [
    {
      name: 'deepseek',
      role: 'declared-provider',
      evidence: [
        {
          claim:
            adapter === null
              ? "the provider's own adapter clone was not found under plugins-src/"
              : `the provider's own adapter exists at ${adapter.dir}${adapter.version === null ? '' : ` v${adapter.version}`}, in the harness package tree rather than in plugins-src/`,
          provenance: 'measured-here',
          source: adapter?.dir ?? 'plugins-src/ (searched for package name @deepseek-ai/dsh-llm-deepseek)',
          at,
        },
        {
          claim:
            registry.downloadable.census === null
              ? "catalog scope lookup NOT MEASURED: the downloadable catalog half did not load, so a count of 0 here would be instrument failure rather than a reading"
              : `catalog rows whose npm begins '@deepseek-ai/': ${scoped.length} of ${rows.length}`,
          provenance: registry.downloadable.census === null ? 'not-measured' : 'measured-here',
          source: 'registry.downloadable (live catalog)',
          at,
        },
        {
          claim: ownerRows === null ? 'owner lookup NOT MEASURED: no catalog half loaded' : `catalog rows owned by 'deepseek': ${ownerRows.rowCount} of ${rows.length}`,
          provenance: ownerRows === null ? 'not-measured' : 'measured-here',
          source: 'registry.byOwner(deepseek)',
          at,
        },
      ],
      isFoldTarget: false,
      catalogRows: {
        scope: "npm begins '@deepseek-ai/'",
        count: scoped.length,
        of: rows.length,
        measured: registry.downloadable.census !== null,
      },
      pluginsSrcClones: named.length,
      hostedCopies: named.length,
      reason:
        "the provider's adapter exists on this machine but is neither a plugins-src clone, a mounted route, nor a catalog row — so under this row type's fold standard the PROVIDER side folds onto nothing today, and the catalog carries no row for the provider at all",
    },
    {
      name: 'local-harness',
      role: 'host-today',
      evidence: [
        {
          claim: `the origin this report was assembled behind is ${registry.baseUrl}, reached through the mounted dsh-meta-market clone`,
          provenance: 'measured-here',
          source: registry.baseUrl,
          at,
        },
      ],
      isFoldTarget: false,
      catalogRows: {
        scope: 'not a catalog entity: the host that served this read is a process, not a market row',
        count: 0,
        of: rows.length,
        measured: registry.downloadable.census !== null,
      },
      pluginsSrcClones: 0,
      hostedCopies: 0,
      reason:
        'every component that answered for these rows runs on this machine; no copy of any of them is hosted by a provider, so the hosting side of the obligation is UNSATISFIED for every row below',
    },
  ]
}

/* ------------------------------------------------------------------------- *
 * The builder. Memoised for the same reason the registry is: the route probes
 * touch the live origin, and a route read must not probe once per tab.
 * ------------------------------------------------------------------------- */

let cached: Promise<HostingReport> | null = null

/** Build the hosting report. One probe run per process unless `resetHosting()` is called. */
export async function buildHostingReport(registry: Registry): Promise<HostingReport> {
  const at = new Date().toISOString()
  const origin = registry.baseUrl
  const rows: HostingRow[] = []
  const withheld: WithheldRow[] = []
  // The provider table is measured BEFORE the rows, because `hosting.providerHosted`
  // on every row is derived from it. A literal `false` there would be a caption: it
  // would read as a measurement while asserting nothing.
  const providers = measureProviders(registry)
  const aProviderHostsOne = providers.some((provider) => provider.hostedCopies > 0)

  for (const seed of SEEDS) {
    try {
      if (registry.installed.census === null && registry.downloadable.census === null) {
        withheld.push({
          id: seed.id,
          reason: 'BOTH registry halves are NOT MEASURED, so no fold trial can be answered; a row built from two non-answers would be a caption',
        })
        continue
      }
      const trials: MeasuredTrial[] = []
      for (const spec of seed.trials) trials.push(await measureTrial(spec, registry, origin))

      // THE STAGE IS A SECOND MEASUREMENT over the clone that matched, because
      // "the file exists" and "the entry point is called" are different facts.
      let stageReached: boolean | null = null
      let importerNote: string | null = null
      const importerSpecs = seed.trials.filter(
        (spec): spec is {
          readonly kind: 'clone'
          readonly package: string
          readonly files: readonly string[]
          readonly importProbe: StageProbe
        } => spec.kind === 'clone' && spec.importProbe !== null,
      )
      for (const spec of importerSpecs) {
        const found = findClone(spec.package)
        if (found === null) {
          // The clone is absent, so the module cannot be probed. That is NOT
          // MEASURED for the stage, never `false`.
          stageReached = null
          importerNote = `${spec.package} is not present under plugins-src/, so ${spec.importProbe.module}.ts could not be probed for ${ENTRY_FILE} reachability — NOT MEASURED`
          continue
        }
        const probed = probeStageReach(found.dir, spec.importProbe)
        stageReached = probed.reachedThrough !== null
        importerNote = probed.note
      }

      const matchedTrials = trials.filter((trial) => trial.matched === true)
      const measuredTrials = trials.filter((trial) => trial.matched !== null)
      const firstMatch = matchedTrials[0]
      const refined = seed.refine?.(trials) ?? null

      let state: FoldState
      let why: string
      if (refined !== null) {
        state = refined.state
        why = refined.why
      } else if (firstMatch !== undefined) {
        state = stageReached === false ? 'folded-library-only' : 'folded'
        why =
          stageReached === false
            ? `the component exists today (${firstMatch.detail}) and its STAGE does not run: ${importerNote ?? 'the stage has no production caller'}`
            : stageReached === true
              ? `the component exists today (${firstMatch.detail}) and its STAGE RUNS: ${importerNote ?? 'an entry point is called from the plugin entry file'}`
              : `the component exists today and answers: ${firstMatch.detail}`
      } else if (measuredTrials.length === 0) {
        state = 'not-folded'
        why = `NO TRIAL WAS MEASURED (${trials.map((trial) => `${trial.kind}:${trial.target}`).join(', ')}); an unmeasured edge is not a folded one`
      } else {
        state = 'not-folded'
        why = `no trial matched: ${measuredTrials.map((trial) => `${trial.kind}:${trial.target} → ${trial.detail}`).join('; ')}`
      }

      const catalogIdentity = trials.map((trial) => trial.row).find((row): row is CatalogIdentity => row !== null) ?? null
      const cloneIdentity = trials.map((trial) => trial.clone).find((clone): clone is CloneReading => clone !== null && clone.dir !== null)
      const identitySource: 'catalog' | 'clone' | 'none' =
        catalogIdentity !== null ? 'catalog' : cloneIdentity === undefined ? 'none' : 'clone'
      const identity: CatalogIdentity | null =
        catalogIdentity ??
        (cloneIdentity === undefined
          ? null
          : {
              name: cloneIdentity.packageName,
              npm: null,
              owner: null,
              version: cloneIdentity.version,
              stars: null,
              row: -1,
            })

      const answered = trials.map((trial) => trial.route).find((route): route is RouteReading => route !== null)

      rows.push({
        id: seed.id,
        hosting: {
          declaredProvider: seed.declaredProvider,
          hostToday: `local harness at ${origin}`,
          providerHosted: aProviderHostsOne,
          reason:
            'no provider-hosted copy of this component was found on this machine; the copy that answered is the local harness',
        },
        intentStage: {
          stage: seed.stage,
          preheatedTo: seed.preheatedTo,
          meaning: seed.meaning,
          stageExistsToday: state !== 'not-folded',
          stageReachedInProduction: stageReached,
          productionOutput:
            seed.outputProbe === undefined ? null : measureProductionOutput(seed.outputProbe),
          note: [
            importerNote,
            answered === undefined
              ? null
              : `the answering route ${answered.path} returned ${answered.status === null ? 'NOT MEASURED' : answered.status} in ${answered.ms ?? 0} ms over ${answered.bytes ?? 0} B`,
            seed.staticNote ?? null,
          ]
            .filter((entry): entry is string => entry !== null)
            .join('; ') || null,
        },
        providerCost: seed.providerCost,
        userBenefit:
          answered !== undefined && seed.userBenefit.reading === null && answered.ms !== null
            ? { ...seed.userBenefit, basis: `the serving read was measured at ${answered.ms} ms; ${seed.userBenefit.basis}` }
            : seed.userBenefit,
        fold: {
          state,
          // A NOT-FOLDED EDGE LANDS ON NOTHING, so it names nothing here. The
          // component that DOES exist is still visible in `trials`, which is where
          // "the clone exists but the stage does not" belongs; putting it in
          // `component` would let a reader count a component as a fold.
          kind: state === 'not-folded' ? null : (firstMatch?.kind ?? null),
          component: state === 'not-folded' ? null : firstMatch === undefined ? null : `${firstMatch.kind}:${firstMatch.target}`,
          why,
          trials,
        },
        identitySource,
        identity,
      })
    } catch (error) {
      withheld.push({
        id: seed.id,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
    }
  }

  const counted = {
    folded: rows.filter((row) => row.fold.state === 'folded').length,
    foldedLibraryOnly: rows.filter((row) => row.fold.state === 'folded-library-only').length,
    notFolded: rows.filter((row) => row.fold.state === 'not-folded').length,
  }

  return {
    rows,
    providers,
    census: {
      rowsAttempted: SEEDS.length,
      rowsServed: rows.length,
      ...counted,
      notFoldedIds: rows.filter((row) => row.fold.state === 'not-folded').map((row) => row.id),
      population: 'provider-hosted preheated cache agent obligations attempted by this build, one row per intent stage',
      at,
    },
    withheld,
    notDone: [
      'This route starts, stops and prices nothing: it reports the hosting obligation as this machine measures it and holds no provider-side cost term of its own.',
      'No provider-hosted copy was searched for anywhere except the plugins-src clones on this machine and the catalog rows the registry loaded, so a provider hosting one elsewhere would be invisible here and is reported as absent rather than as nonexistent in general.',
      'The cost and benefit columns carry cited numbers where the workspace measured them and `null` with a reason everywhere else; no economic model was invented to fill a column.',
    ],
    at,
  }
}

/** The memoised report for this process. A route read must not re-probe per tab. */
export function getHostingReport(registry: Registry): Promise<HostingReport> {
  if (cached === null) cached = buildHostingReport(registry)
  return cached
}

/** Clear the memo. The verify harness uses it; a route never needs it. */
export function resetHosting(): void {
  cached = null
}

/** The seed ids, exported so a harness asserts the population rather than trusting it. */
export const HOSTING_SEED_IDS: readonly string[] = Object.freeze(SEEDS.map((seed) => seed.id))

/** Exported for the harness: does a file exist below a clone resolved by package name? */
export function cloneFileExists(packageName: string, file: string): boolean | null {
  const found = findClone(packageName)
  if (found === null) return null
  return existsSync(join(found.dir, file))
}
