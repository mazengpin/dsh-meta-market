/**
 * THE ADVANCED SUB-RAIL — four windows from one file, each a full CONTRACT envelope.
 *
 * WHAT THIS PROVIDER IS FOR
 *
 * The owner's mission for this sub-rail is one sentence, and it sets the test:
 * *"Advanced opens a list of buttons to see the meta-Agents meta-Loops meta-cordis
 * meta-community; so each place will show the info about 'meta aligned to intent
 * plugins' that are installed on current system or downloadable from internet."*
 * So the four windows are not four more copies of the plugin catalogue. They are
 * the four LAYERS the meta market stands on, and each one reports the layer as it
 * stands on THIS machine — what is mounted, what answered, what is only a plan.
 *
 * THE RULE THIS FILE IS BUILT AROUND, AND IT IS THE PROGRAM'S OWN
 *
 * A count carries its numerator, its denominator, its population definition and
 * its census moment, or it is not a reading. Three traps from this program would
 * otherwise have fired inside this file, and each is answered by construction
 * rather than by care:
 *
 *   1. **"A directory listing is not a directory count."** The count of the
 *      Cordis corpus is taken with `readdirSync(..., {withFileTypes: true})` and an
 *      `isDirectory()` recursion, never by measuring the length of a listing. This
 *      program published a wrong package-group count once by counting ENTRIES.
 *   2. **"A `0` on both sides is instrument failure."** Every live probe returns
 *      `status: null` when the connection failed, which is **NOT MEASURED**, and a
 *      `404` only when a server actually answered `404`. A dead port therefore
 *      cannot produce a clean-looking `0 of 7`.
 *   3. **"Absent is not zero."** A workspace or profile manifest that cannot be
 *      located yields `null` and a stated reason, never `0`.
 *
 * WHY THE FOUR WINDOWS LIVE IN ONE FILE
 *
 * The CONTRACT gives this lane one path: `src/host/providers/advanced.ts`. The
 * four windows share one measurement apparatus — one loopback probe batch, one
 * workspace locator, one profile-manifest read — and splitting them across four
 * files would mean four copies of that apparatus, where a fix to one drifts.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 * **It imports nothing but `../types.ts`.** `tsconfig.json` has `include: ["src"]`
 * and the clone is typechecked as one tree, so a single unresolved module
 * specifier in this file would fail every other lane's typecheck. It therefore
 * does not import `../gui/registry.ts`, `../intent-align/**` or any sibling
 * provider: the window identities come from `WindowId` in the shared types, and
 * the assembly owns the registry. It also does not call `alignPackage` — the
 * intent-align lane owns that, and this file reports `intent: not-measured` with a
 * reason rather than inventing zone scores it did not compute.
 *
 * @module dsh-meta-market/host/providers/advanced
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PROVIDER_PROBE_BOUND_MS, probeBoundMs } from '../types.ts'
import type {
  Census,
  Control,
  Falsifier,
  ProviderWindow,
  ThreeKind,
  WindowId,
  WindowItem,
} from '../types.ts'

/**
 * The windows this provider answers: the four sub-tabs, and the CONTAINER that
 * holds them.
 *
 * **`advanced` IS INCLUDED DELIBERATELY**, after an interface question from
 * `surface-host`. That lane's assembly asks every provider for every window id its
 * registry row names, and a module that declined `advanced` produced the
 * worst-shaped answer of the ten: `/gui/section?window=advanced` answered 200 with
 * `unavailable.reason = "does not serve 'advanced'"`, so the tab that OPENS the
 * four working tabs read as broken while its children all answered. The container
 * is therefore built here, from the same four builders at one shared instant, so
 * there is one source of truth for the four and the container's arithmetic sits
 * with the lane that measured them.
 *
 * **The container does NOT form a second opinion about `kind`.** Its rows carry the
 * CONTRACT's floor value and say so, because the assembly owns that field.
 */
export const WINDOW_IDS = Object.freeze(['meta-agents', 'meta-loops', 'meta-cordis', 'meta-community', 'advanced'] as const)

/**
 * The first id, exported separately because `ProviderModule` inspects
 * `WINDOW_ID` and a four-window provider is still expected to name one.
 */
export const WINDOW_ID = 'meta-agents' as const

/** The live deployment this provider probes. The owner's session; probed, never written. */
const LIVE_ORIGIN = 'http://127.0.0.1:3083'

/**
 * THE PROBE BOUND, FITTED FROM SIX MEASUREMENTS PER ROUTE RATHER THAN GUESSED.
 *
 * This lane produced the first instance of the defect that turned out to be
 * systemic: a **1,500 ms** bound against a **1,367 ms** cold `/agent-team-cap/api/zones`
 * read, so the bound sat below the latency it was timing and the window published a
 * well-formed `null` about a route that works. `lead` then ruled the fix a shared
 * constant, and `src/host/types.ts` now carries `PROVIDER_PROBE_BOUND_MS` and
 * `probeBoundMs(worst)`. **The rule: measure the route at least six times on the
 * live process, bound at 1.25× the WORST — never the median, never below the worst.**
 *
 * THE SERIES, measured 2026-10-17T22:23:28Z against `http://127.0.0.1:3083`, six
 * sequential reads per path, milliseconds in read order:
 *
 *   - `/intent-map/api/map` (positive control)  3615, 235, 433, 3059, 740, 167  -> worst **3615**
 *   - `/zone-recalc/api/does-not-exist` (control) 131, 144, 2088, 951, 506, 107 -> worst **2088**
 *   - `/agent-team-cap/api/state`               250, 328, 308, 313, 257, 244  -> worst **328**
 *   - `/agent-team-cap/api/zones`               328, 78, 148, 157, 48, 50     -> worst **328** (cold read 1367 ms earlier this session)
 *   - `/meta-community/api/members`             48, 53, 54, 55, 73, 38        -> worst **73**
 *   - `/meta-community/api/census`              149, 186, 41, 29, 96, 76      -> worst **186**
 *   - `/meta-community/api/fuse`                160, 12, 76, 65, 234, 201     -> worst **234**
 *   - `/meta-community/api/standing`            63, 213, 44, 29, 82, 129      -> worst **213**
 *   - `/meta-community/api/clauses`             15, 73, 140, 70, 14, 167      -> worst **167**
 *   - `/meta-community/api/clauses/conformance` 51, 44, 66, 299, 56, 191      -> worst **299**
 *   - `/meta-community/api/standing/relabel`    105, 93, 276, 47, 132, 31     -> worst **276**
 *
 * **The binding route is the POSITIVE CONTROL, not a subject**, which is the finding
 * worth keeping: `/intent-map/api/map` is an embedding read and its spread runs from
 * 167 ms to 3,615 ms — a 21× ratio on one route in one run, so any bound fitted to a
 * median or a mean there is below a real read. A control that times out reports the
 * whole batch BLIND, so a bound too tight on the control is worse than one too tight
 * on a subject.
 *
 * THE FIT. `probeBoundMs(3615)` = **4,519 ms**; the assembly default is **5,000**, and
 * this file takes the LARGER of the two, so my bound can never be the tight one when
 * the shared default is already wider. Both numbers are stated here so a reader can
 * see which one bound.
 */
const WORST_OBSERVED_PROBE_MS = 3_615
const PROBE_TIMEOUT_MS = Math.max(PROVIDER_PROBE_BOUND_MS, probeBoundMs(WORST_OBSERVED_PROBE_MS))

/**
 * How long a probe batch is reused.
 *
 * The window is polled by a GUI; a 15 s reuse means a click does not re-probe
 * seven routes, and the census time on the payload is the time the MEASUREMENT was
 * taken rather than the time the request arrived. That distinction is the whole
 * point of a census stamp, so the reuse window is short enough that a reader is
 * never shown a reading older than a few seconds without being told.
 *
 * **CORRECTED 2026-10-18 — THE REUSE NEVER WORKED FOR A SLOW BATCH, AND THAT IS
 * WHAT MADE THREE WINDOWS RE-PROBE PER REQUEST.** The stamp was `nowMs`, which
 * `buildWindow` took at the START of its own call BEFORE awaiting the batch, so a
 * batch that took longer than the TTL was written to the cache already expired:
 * `nowMs(new call) - fetchedAtMs(start of previous call) >= PROBE_TTL_MS` the
 * instant it landed. `PROBE_TTL_MS` is 15 s and the batch is 11 sequential probes
 * with a `PROBE_TIMEOUT_MS` of ~4.5 s each, so a batch with three slow paths is
 * ~14 s — one more slow path and the next advanced window re-probes all eleven.
 * MEASURED cost of that defect: the sections route answered in 53.30, 57.06 and **122.65 s**
 * (three runs, 2026-10-18T17:10:34–17:18:20 local); the 122.65 s outlier is the
 * shape of three full batches on one request. The fix is not a wider TTL — a wider
 * TTL would hide a stale reading — it is to stamp the cache at COMPLETION and to
 * share an IN-FLIGHT batch, so a slow measurement is reused by the concurrent
 * windows that arrived while it was running and expires 15 s after it finished.
 */
const PROBE_TTL_MS = 15_000

/** The seven paths `dsh-meta-community` advertises, in its own table order. */
const COMMUNITY_PATHS = Object.freeze([
  '/meta-community/api/members',
  '/meta-community/api/census',
  '/meta-community/api/fuse',
  '/meta-community/api/standing',
  '/meta-community/api/clauses',
  '/meta-community/api/clauses/conformance',
  '/meta-community/api/standing/relabel',
])

/**
 * The controls. A comparison whose two sides are both unanswered is not a
 * comparison, so the probe batch carries two positive controls beside its
 * subjects:
 *
 *   - `/intent-map/api/map` is a route measured answering `200` with a body, so a
 *     batch in which it fails reports INSTRUMENT FAILURE rather than "everything
 *     is down".
 *   - `/zone-recalc/api/does-not-exist` is an UNKNOWN path on a MOUNTED plugin.
 *     It answers `404` **with a body**, which is what distinguishes "the plugin is
 *     mounted and this path is not" from "the plugin is not mounted": the latter
 *     returns a `404` with **0 bytes**. Without this row a reader cannot tell the
 *     two apart, and this program's whole complaint about advertised-but-404 paths
 *     is that the two states look identical.
 */
const CONTROL_MOUNTED_PATH = '/intent-map/api/map'
const CONTROL_UNMOUNTED_PATH = '/zone-recalc/api/does-not-exist'

/** One probed path. `status: null` means NOT MEASURED — the connection failed. */
interface ProbeRow {
  readonly path: string
  readonly status: number | null
  readonly bytes: number | null
  readonly error: string | null
  readonly body: string | null
}

/** One probe batch, with the moment the MEASUREMENT was taken. */
interface ProbeBatch {
  readonly at: string
  readonly rows: readonly ProbeRow[]
}

/** The memo, keyed on nothing because there is exactly one deployment to probe. */
let probeCache: { readonly at: string; readonly fetchedAtMs: number; readonly batch: ProbeBatch } | null = null

/**
 * The batch currently being measured, if any.
 *
 * Required for the same reason the TTL is: three windows (`advanced`, `meta-agents`,
 * `meta-community`) ask this provider for a payload, and they now ask CONCURRENTLY
 * (`collectOutcomes` uses `Promise.all` since 2026-10-18). Without this, three
 * concurrent callers would each see an empty cache and open three batches — eleven
 * probes each — against the owner's live session. Sharing the in-flight promise
 * means one measurement serves all three, which is the behaviour the "collected
 * once per request" contract in `routes.ts` actually claims.
 */
let probeInFlight: Promise<ProbeBatch> | null = null

/** A bounded single-path GET. Never throws; a failure is a `null` status. */
async function probePath(path: string): Promise<ProbeRow> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(`${LIVE_ORIGIN}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    const body = await response.text()
    return { path, status: response.status, bytes: body.length, error: null, body }
  } catch (error: unknown) {
    return {
      path,
      status: null,
      bytes: null,
      error: error instanceof Error ? error.message : String(error),
      body: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Probe the whole batch once and reuse it for the TTL.
 *
 * THE ORDER IS THE INSTRUMENT, and the two controls go FIRST. A blind batch must
 * be recognisable as blind before it can be read as a finding, so the route known
 * to answer `200` is probed before the seven routes whose 404s are the subject.
 *
 * SEQUENTIAL, and it STOPS AT THE FIRST TRANSPORT FAILURE. A `Promise.all` over
 * eleven paths opens eleven sockets at the owner's live session at once and, on a
 * dead port, resolves eleven timeouts concurrently — a burst against the process
 * the owner is working in. And once a connection to this origin has failed, the
 * remaining paths are recorded as `not probed` rather than each waiting out its
 * own timeout: eleven timeouts is 44 s of a GUI request spent learning one fact.
 */
async function probeBatch(nowMs: number): Promise<ProbeBatch> {
  if (probeCache !== null && nowMs - probeCache.fetchedAtMs < PROBE_TTL_MS) return probeCache.batch
  // ONE measurement serves every caller that arrives while it runs. See `probeInFlight`.
  if (probeInFlight !== null) return probeInFlight
  const at = new Date(nowMs).toISOString()
  const paths = [
    CONTROL_MOUNTED_PATH,
    CONTROL_UNMOUNTED_PATH,
    '/agent-team-cap/api/state',
    '/agent-team-cap/api/zones',
    ...COMMUNITY_PATHS,
  ]
  probeInFlight = (async (): Promise<ProbeBatch> => {
    const rows: ProbeRow[] = []
    let transportFailed: string | null = null
    for (const path of paths) {
      if (transportFailed !== null) {
        rows.push({ path, status: null, bytes: null, error: `not probed: the previous request to ${LIVE_ORIGIN} failed (${transportFailed})`, body: null })
        continue
      }
      const row = await probePath(path)
      if (row.error !== null) transportFailed = row.error
      rows.push(row)
    }
    const batch: ProbeBatch = { at, rows }
    // STAMPED AT COMPLETION, not at the start (see `PROBE_TTL_MS`): a batch that
    // outruns the TTL must not be born expired, or the next window re-probes it.
    probeCache = { at, fetchedAtMs: Date.now(), batch }
    return batch
  })()
  try {
    return await probeInFlight
  } finally {
    probeInFlight = null
  }
}

/** The batch as a lookup, so a builder asks by path rather than by index. */
function rowOf(batch: ProbeBatch, path: string): ProbeRow | undefined {
  return batch.rows.find((row) => row.path === path)
}

/** The three filesystem anchors this provider reads. */
interface Anchors {
  readonly anchor: string
  readonly profileManifest: string
  readonly programRoot: string
  readonly via: string
}

/**
 * Locate the profile manifest and the program workspace, WITHOUT assuming a
 * directory depth.
 *
 * This file is read from two different depths depending on how it is running: as
 * `src/host/providers/advanced.ts` under a type-stripping driver, and as
 * `lib/index.js` inside the built bundle. A hard-coded `../../..` would therefore
 * be correct in exactly one of those and silently wrong in the other, and the
 * silent version of wrong is the one that reports a `0`.
 *
 * So the search walks up to eight ancestors and asks each one whether the whole
 * tree it needs is below it, and it REPORTS the rung that matched. A reader can
 * then check the claim instead of trusting it, and a layout change fails loudly —
 * as `null` with a reason — instead of as a zero.
 */
function locateAnchors(): Anchors | { readonly absent: string } {
  const envProgram = process.env['DSH_META_PROGRAM_ROOT']
  const envProfile = process.env['DSH_META_PROFILE_DIR']
  if (typeof envProgram === 'string' && envProgram.length > 0 && typeof envProfile === 'string' && envProfile.length > 0) {
    const profileManifest = join(envProfile, 'package.json')
    if (existsSync(profileManifest) && existsSync(join(envProgram, 'runner'))) {
      return { anchor: envProfile, profileManifest, programRoot: envProgram, via: 'environment override' }
    }
    return { absent: `the environment override named ${envProfile} and ${envProgram}, and a required path is not there` }
  }
  for (let depth = 1; depth <= 8; depth += 1) {
    let ancestor: string
    try {
      ancestor = fileURLToPath(new URL('../'.repeat(depth), import.meta.url))
    } catch {
      break
    }
    const profileManifest = join(ancestor, 'profiles-tree', 'personal-dev', 'package.json')
    const programRoot = join(ancestor, 'profiles-tree', 'personal-dev', 'dsh-meta-evolve_INIT_WORKSPACE')
    if (existsSync(profileManifest) && existsSync(join(programRoot, 'runner'))) {
      return { anchor: ancestor, profileManifest, programRoot, via: `ancestor ${depth} above ${import.meta.url}` }
    }
  }
  return {
    absent: `walked 8 ancestors above ${import.meta.url} and found no directory holding both profiles-tree/personal-dev/package.json and profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE/runner; set DSH_META_PROGRAM_ROOT and DSH_META_PROFILE_DIR to measure this window`,
  }
}

/** The profile manifest's two load-bearing fields, as read from disk. */
interface ProfileFacts {
  readonly bundles: readonly string[]
  readonly dependencyNames: readonly string[]
  readonly dependency: (name: string) => string | null
  readonly agentTeamCapRow: number | null
  readonly agentTeamProfileRow: number | null
  readonly communityInBundles: boolean
  readonly communityInDependencies: boolean
}

function readProfile(manifestPath: string): ProfileFacts | { readonly absent: string } {
  let text: string
  try {
    text = readFileSync(manifestPath, 'utf8')
  } catch (error: unknown) {
    return { absent: `could not read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    return { absent: `${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const dsh = record['dsh'] !== null && typeof record['dsh'] === 'object' ? (record['dsh'] as Record<string, unknown>) : {}
  const profile = dsh['profile'] !== null && typeof dsh['profile'] === 'object' ? (dsh['profile'] as Record<string, unknown>) : {}
  const rawBundles = profile['bundles']
  const rawDeps = record['dependencies']
  const bundles = Array.isArray(rawBundles) ? rawBundles.filter((entry): entry is string => typeof entry === 'string') : []
  const deps = rawDeps !== null && typeof rawDeps === 'object' ? (rawDeps as Record<string, unknown>) : {}
  const dependencyNames = Object.keys(deps)
  return {
    bundles,
    dependencyNames,
    dependency: (name: string) => {
      const value = deps[name]
      return typeof value === 'string' ? value : null
    },
    agentTeamCapRow: bundles.indexOf('dsh-agent-team-cap') + 1 || null,
    agentTeamProfileRow: bundles.indexOf('@deepseek-ai/dsh-experimental-agent-team-profile') + 1 || null,
    communityInBundles: bundles.includes('dsh-meta-community'),
    communityInDependencies: 'dsh-meta-community' in deps,
  }
}

/**
 * Count the FILES under a directory, with a directory-aware instrument.
 *
 * **This is the guard the program asked for by name.** `readdirSync` returns
 * entries; an entry is a file OR a directory; a listing prints names and not
 * kinds. So the count is taken over `Dirent`s with `isDirectory()` branching, and
 * the walk recurses — never over the length of a listing, and never with a
 * `-mindepth 1 -maxdepth 1` that would silently drop the nested files.
 */
function countFiles(root: string): { readonly files: readonly string[]; readonly absent: string | null } {
  const files: string[] = []
  const walk = (dir: string, relative: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) walk(join(dir, entry.name), childRelative)
      else files.push(childRelative)
    }
  }
  try {
    walk(root, '')
  } catch (error: unknown) {
    return { files: [], absent: error instanceof Error ? error.message : String(error) }
  }
  return { files, absent: null }
}

/** Count the immediate SUBDIRECTORIES of a directory, with `isDirectory()`. */
function countDirectories(root: string): { readonly names: readonly string[]; readonly absent: string | null } {
  try {
    const names = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    return { names, absent: null }
  } catch (error: unknown) {
    return { names: [], absent: error instanceof Error ? error.message : String(error) }
  }
}

/** A count that never lies: `null` when unmeasured, with the reason elsewhere. */
function censusOf(numerator: number | null, denominator: number | null, population: string, at: string): Census {
  return { numerator, denominator, population, at }
}

/**
 * THE `stale` MARKER — `unavailable` means nothing was measured; `stale` means the
 * window answered from a census and its LIVE read did not succeed.
 *
 * Added at `surface-host`'s direction and it is the distinction this lane kept
 * fusing: before it, a slow socket and an empty window both produced `unavailable`,
 * so a reader could not tell a provider that had discarded four measured rows from
 * one that had nothing to say. A row is never discarded to express a slow socket —
 * the file-derived rows stand, the live row says `null`, and this marker says WHY.
 *
 * `boundMs` is the probe bound ONLY where a probe was the failing instrument. For a
 * file read there is no bound, so it is `null` rather than a number borrowed from a
 * different instrument — the same absent-versus-zero rule one field down.
 */
function staleOf(
  reason: string | null,
  at: string,
  boundMs: number | null,
): { readonly reason: string; readonly boundMs: number | null; readonly at: string } | null {
  return reason === null ? null : { reason, boundMs, at }
}

/** What every item in this file needs, with the honest-absence fields first. */
interface ItemInput {
  readonly id: string
  readonly name: string
  readonly kind: ThreeKind
  readonly installed: boolean | null
  readonly where: 'installed' | 'catalog' | 'community'
  readonly verdict: 'aligned' | 'collides' | 'not-measured'
  readonly why: string
  readonly evidence: string
  readonly npm?: string | null
  readonly owner?: string | null
  readonly downloadable?: boolean | null
  readonly route?: string
  readonly originalIntent?: 'pass' | 'collide' | 'not-measured'
  readonly collidesWith?: readonly { readonly id: string; readonly why: string }[]
  readonly patch?: { readonly artifact: string; readonly applies: string } | null
}

/**
 * Shape one item.
 *
 * `downloadable` defaults to `null` (**NOT MEASURED**) rather than `false`: none
 * of these four layers is a catalogue lookup, so no download probe was taken, and
 * `false` would assert one. Same rule as the CONTRACT's `installed`.
 */
function itemOf(input: ItemInput): WindowItem {
  return {
    id: input.id,
    name: input.name,
    npm: input.npm ?? null,
    owner: input.owner ?? null,
    kind: input.kind,
    installed: input.installed,
    downloadable: input.downloadable ?? null,
    source: {
      where: input.where,
      ...(input.route === undefined ? {} : { route: input.route }),
    },
    intent: {
      zones: [],
      originalIntent: input.originalIntent ?? 'not-measured',
      collidesWith: input.collidesWith ?? [],
    },
    alignment: { verdict: input.verdict, why: input.why, evidence: input.evidence },
    patch: input.patch === undefined || input.patch === null ? null : { available: true, ...input.patch },
  }
}

/**
 * THE `kind` DERIVATION, AND WHO OWNS IT — lead ruling, 2026-10-17.
 *
 * **A provider must not claim its own existence, and `kind` is not a literal.**
 * The lead fixed one owner for the field and made it derived at request time:
 *
 *   - `exists` only if the package is present in the profile's DECLARED bundles
 *     **and** its prefix has answered a live fetch with a non-404 status;
 *   - `plan` if it is declared but has not answered (today's state for this whole
 *     clone: bundle row 41 declared, the `/gui/*` routes not yet served);
 *   - `future` for anything recorded in the plan corpus with no clone at all;
 *   - anything else is NOT MEASURED, and this file reports that in
 *     `alignment.verdict` (`not-measured`) with the reason, because `kind` itself
 *     has only the three values and must not be invented a fourth.
 *
 * Two consequences this file implements rather than describes:
 *
 *   1. **The WINDOW-level `kind` is the assembly's, and this provider never sets
 *      it.** There is no `window: { kind }` override anywhere in this file, so all
 *      four sub-windows inherit whatever `surface-host` derives. A lane that
 *      flipped its own window to `exists` the moment it was written would be
 *      making an existence claim about the very surface it is.
 *   2. **A package-shaped ITEM derives its `kind` here from the same two
 *      measurements**, so a row cannot say `exists` on the strength of a clone
 *      being on disk. `future` is never returned: this file cannot see the plan
 *      corpus, so it has no instrument for it and says so instead of guessing.
 *
 * Artifacts that are not packages — a corpus document, a loop directory, a round
 * record — are outside this rule by subject rather than by exception: their `kind`
 * is about the ARTIFACT's presence and is derived from the file walk, which is the
 * instrument that measures them.
 */
function deriveKind(declared: boolean | null, answered: boolean | null): ThreeKind {
  if (declared === null || answered === null) return 'plan'
  if (declared && answered) return 'exists'
  return 'plan'
}

/** The one sentence every window of this provider carries about intent, exported so the assembly can reuse it verbatim. */
export const INTENT_NOT_MEASURED =
  'intent is NOT MEASURED here: these four windows report LAYERS this program stands on, not catalogue plugins, and the intent-align lane owns the 24-zone scoring. This provider runs no embedder and reports no zone score rather than inventing one — a score it did not compute would be indistinguishable from one it did.'

/** ========================================================================== */
/** WINDOW 1 — meta-agents                                                     */
/** ========================================================================== */

/**
 * THE AGENT-TEAM LAYER, MEASURED.
 *
 * The owner's fleet runs on two shipped pieces and one cap, and all three are
 * readable today:
 *
 *   - `@deepseek-ai/dsh-experimental-agent-team-profile` is the bundle row that
 *     mounts the Team service. It is in the profile's `dsh.profile.bundles`.
 *   - `dsh-agent-team-cap` is a local clone, consumed through a RELATIVE `link:`
 *     dependency (the program's rule; an absolute path is forbidden), and it
 *     reads and writes ANOTHER row's config through `ctx.configEditor`. Its
 *     `cordis.patch.yml` is a top-level ARRAY, which is the form the loader
 *     requires — measured here rather than assumed.
 *   - The ROSTER MECHANISM is a delegated-subagent runtime with a per-run cap. The
 *     cap is what the owner asked to raise to "unlimited", and the live route
 *     reports the value it actually settled on rather than the value someone typed.
 *
 * THE EVIDENCE SOURCE IS NAMED PER ROW, because "the roster works" is not a
 * measurement. Two of the five rows are `dsh.profile.bundles` / `dependencies`
 * entries — the profile manifest read from disk, which answers "is it mounted"
 * and cannot answer "is it working". The other three are live `200` reads on
 * `http://127.0.0.1:3083`, which answer "is it working" and cannot answer "is it
 * the only copy". Neither instrument subsumes the other.
 */
function metaAgentsWindow(at: string, batch: ProbeBatch, anchors: Anchors | { readonly absent: string }): ProviderWindow {
  const stateRow = rowOf(batch, '/agent-team-cap/api/state')
  const zonesRow = rowOf(batch, '/agent-team-cap/api/zones')

  interface CapState {
    readonly configured: number | null
    readonly live: number | null
    readonly standard: number | null
    readonly selection: string | null
    readonly settled: boolean | null
    readonly entryId: string | null
    readonly writable: boolean | null
  }
  const parseState = (row: ProbeRow | undefined): CapState | null => {
    if (row === undefined || row.body === null || row.status !== 200) return null
    try {
      const parsed: unknown = JSON.parse(row.body)
      const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
      const state = record['state'] !== null && typeof record['state'] === 'object' ? (record['state'] as Record<string, unknown>) : {}
      const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)
      return {
        configured: num(state['configured']),
        live: num(state['live']),
        standard: num(state['standard']),
        selection: typeof state['selection'] === 'string' ? state['selection'] : null,
        settled: typeof state['settled'] === 'boolean' ? state['settled'] : null,
        entryId: typeof state['entryId'] === 'string' ? state['entryId'] : null,
        writable: typeof state['writable'] === 'boolean' ? state['writable'] : null,
      }
    } catch {
      return null
    }
  }

  interface ZoneFacts {
    readonly tool: string | null
    readonly registered: boolean | null
    readonly provider: string | null
    readonly filterCapable: boolean | null
    readonly knownToolCount: number | null
    readonly zoneIds: readonly string[]
  }
  const parseZones = (row: ProbeRow | undefined): ZoneFacts | null => {
    if (row === undefined || row.body === null || row.status !== 200) return null
    try {
      const parsed: unknown = JSON.parse(row.body)
      const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
      const rawZones = record['zones']
      const zoneIds = Array.isArray(rawZones)
        ? rawZones
            .map((entry) => (entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>)['zone'] : null))
            .filter((value): value is string => typeof value === 'string')
        : []
      return {
        tool: typeof record['tool'] === 'string' ? record['tool'] : null,
        registered: typeof record['registered'] === 'boolean' ? record['registered'] : null,
        provider: typeof record['provider'] === 'string' ? record['provider'] : null,
        filterCapable: typeof record['providerToolFilterCapable'] === 'boolean' ? record['providerToolFilterCapable'] : null,
        knownToolCount: typeof record['knownToolCount'] === 'number' ? record['knownToolCount'] : null,
        zoneIds,
      }
    } catch {
      return null
    }
  }

  const cap = parseState(stateRow)
  const zones = parseZones(zonesRow)
  const profile = 'absent' in anchors ? null : readProfile(anchors.profileManifest)
  const profileFacts = profile !== null && !('absent' in profile) ? profile : null

  const stateEvidence =
    stateRow === undefined
      ? 'no probe was taken for /agent-team-cap/api/state'
      : stateRow.status === null
        ? `NOT MEASURED: GET ${LIVE_ORIGIN}/agent-team-cap/api/state did not answer (${stateRow.error ?? 'unknown transport error'}) at ${batch.at}`
        : `GET ${LIVE_ORIGIN}/agent-team-cap/api/state -> ${String(stateRow.status)}, ${String(stateRow.bytes)} B at ${batch.at}`

  // THE DERIVATION, COMPUTED ONCE, so four rows cannot disagree about one plugin.
  // `declared` is the profile manifest; `answered` is a live fetch that names the
  // component. Both are required for `exists`, which is the lead's rule.
  const serviceDeclared = profileFacts === null ? null : profileFacts.agentTeamProfileRow !== null
  // The Team service exposes no prefix of its own, so the live channel that NAMES
  // it is the cap route: it reports `entryId: "agent-team"` and `addressable`,
  // which is a fetch describing this component rather than a neighbouring one.
  const serviceAnswered = cap === null ? null : cap.entryId === 'agent-team'
  const capDeclared =
    profileFacts === null ? null : profileFacts.dependency('dsh-agent-team-cap') !== null || profileFacts.bundles.includes('dsh-agent-team-cap')
  const capAnswered = stateRow === undefined ? null : stateRow.status !== null && stateRow.status !== 404
  const capKind = deriveKind(capDeclared, capAnswered)

  const items: WindowItem[] = []

  items.push(
    itemOf({
      id: 'agent-team-service-row',
      name: '@deepseek-ai/dsh-experimental-agent-team-profile',
      kind: deriveKind(serviceDeclared, serviceAnswered),
      installed: profileFacts === null ? null : profileFacts.agentTeamProfileRow !== null,
      where: 'installed',
      verdict: profileFacts === null ? 'not-measured' : profileFacts.agentTeamProfileRow !== null ? 'aligned' : 'collides',
      why:
        profileFacts === null
          ? 'the profile manifest could not be read, so the bundle row is NOT MEASURED rather than absent'
          : profileFacts.agentTeamProfileRow === null
            ? 'the Team service bundle row is NOT in dsh.profile.bundles, so the roster mechanism has no service behind it on this deployment'
            : `the Team service bundle row is present at 1-based position ${String(profileFacts.agentTeamProfileRow)} of ${String(profileFacts.bundles.length)} in dsh.profile.bundles, so the service the cap reads is mounted by the loader rather than merely installed in node_modules`,
      evidence:
        profileFacts === null
          ? 'profile manifest unreadable (see this window’s unavailable reason)'
          : `${'absent' in anchors ? 'profile manifest' : anchors.profileManifest} — dsh.profile.bundles[${String((profileFacts.agentTeamProfileRow ?? 1) - 1)}]`,
    }),
  )

  items.push(
    itemOf({
      id: 'agent-team-cap-plugin',
      name: 'dsh-agent-team-cap',
      npm: null,
      owner: null,
      kind: capKind,
      installed: profileFacts === null ? null : profileFacts.dependency('dsh-agent-team-cap') !== null,
      where: 'installed',
      verdict: profileFacts !== null && profileFacts.dependency('dsh-agent-team-cap') !== null ? 'aligned' : 'not-measured',
      why:
        profileFacts === null
          ? 'the profile manifest could not be read, so the dependency row is NOT MEASURED'
          : profileFacts.dependency('dsh-agent-team-cap') === null
            ? 'dsh-agent-team-cap is not a dependency of this profile, so the cap surface is not on this deployment'
            : `present as a RELATIVE link dependency (${String(profileFacts.dependency('dsh-agent-team-cap'))}) and also a bundles row, so it is both installed and loaded — the two are separate facts and this row has both`,
      evidence:
        profileFacts === null
          ? 'profile manifest unreadable'
          : `${anchors === undefined ? 'profile manifest' : 'profile manifest'} — dependencies["dsh-agent-team-cap"] and dsh.profile.bundles`,
    }),
  )

  items.push(
    itemOf({
      id: 'max-members-cap',
      name: 'agent-team maxMembers cap',
      kind: capKind,
      installed: cap === null ? null : true,
      where: 'installed',
      route: '/agent-team-cap/api/state',
      verdict: cap === null ? 'not-measured' : 'aligned',
      why:
        cap === null
          ? 'the live cap route did not answer, so the cap value is NOT MEASURED — it is not "0" and it is not "8"'
          : `the live route reports configured=${String(cap.configured)} live=${String(cap.live)} standard=${String(cap.standard)} selection=${String(cap.selection)} settled=${String(cap.settled)}. The configured value equals Number.MAX_SAFE_INTEGER (9007199254740991), which is this deployment’s encoding of "unlimited", and live EQUALS configured — a cap that is set but not settled would be a readback, not a control`,
      evidence: stateEvidence,
    }),
  )

  items.push(
    itemOf({
      id: 'delegate-bounded-tool',
      name: zones?.tool ?? 'delegate_bounded',
      kind: capKind,
      installed: zones === null ? null : (zones.registered ?? null),
      where: 'installed',
      route: '/agent-team-cap/api/zones',
      verdict: zones === null ? 'not-measured' : zones.registered === true ? 'aligned' : 'collides',
      why:
        zones === null
          ? 'the zones route did not answer, so whether the delegation tool is registered is NOT MEASURED'
          : `registered=${String(zones.registered)} provider=${String(zones.provider)} toolFilterCapable=${String(zones.filterCapable)} over ${String(zones.knownToolCount)} known tools. The capability flag being false is reported rather than smoothed over: a filter the provider cannot apply is a refusal, and this row states which side of it the deployment is on`,
      evidence:
        zonesRow === undefined || zonesRow.status === null
          ? `NOT MEASURED at ${batch.at}`
          : `GET ${LIVE_ORIGIN}/agent-team-cap/api/zones -> ${String(zonesRow.status)}, ${String(zonesRow.bytes)} B at ${batch.at}`,
    }),
  )

  items.push(
    itemOf({
      id: 'zone-vocabulary',
      name: zones === null ? 'delegation zone catalog (not measured)' : `delegation zone catalog: ${zones.zoneIds.join(', ')}`,
      kind: capKind,
      installed: zones === null ? null : zones.zoneIds.length > 0,
      where: 'installed',
      route: '/agent-team-cap/api/zones',
      verdict: zones === null ? 'not-measured' : zones.zoneIds.length > 0 ? 'aligned' : 'collides',
      why:
        zones === null
          ? 'the zones route did not answer, so the zone vocabulary is NOT MEASURED'
          : `${String(zones.zoneIds.length)} zones are advertised by the live surface (${zones.zoneIds.join(', ')}), and each one is a named allow-list rather than a permissive label — a child cannot ask for a zone that is not listed, because the filter is computed against the live registry`,
      evidence:
        zonesRow === undefined || zonesRow.status === null
          ? `NOT MEASURED at ${batch.at}`
          : `GET ${LIVE_ORIGIN}/agent-team-cap/api/zones -> ${String(zonesRow.status)}, ${String(zonesRow.bytes)} B at ${batch.at}`,
    }),
  )

  const controls: readonly Control[] = [
    {
      id: 'cap-state-read',
      label: 'Read the live agent-team maxMembers cap and whether it settled',
      kind: 'read',
      target: 'GET /agent-team-cap/api/state',
      demonstrable: stateRow !== undefined && stateRow.status === 200,
    },
    {
      id: 'cap-zones-read',
      label: 'Read the delegation zone catalog and the registered tool name',
      kind: 'read',
      target: 'GET /agent-team-cap/api/zones',
      demonstrable: zonesRow !== undefined && zonesRow.status === 200,
    },
    {
      id: 'cap-set-write',
      label: 'Set the fleet cap (8 | 16 | "unlimited") — the write half of the same surface',
      kind: 'write',
      target: 'POST /agent-team-cap/api/set',
      demonstrable: false,
    },
  ]

  const falsifiers: readonly Falsifier[] = [
    {
      claim:
        'the fleet cap this system runs is "unlimited" — encoded as 9007199254740991 — and the live runtime has SETTLED on it rather than merely been told it',
      how: `GET ${LIVE_ORIGIN}/agent-team-cap/api/state and read configured, live and settled. Falsified the moment live and configured diverge, or settled is false, or configured is a small integer. A readback that reports a number the caller typed proves nothing about the runtime; the pair (configured, live) is what makes it a measurement.`,
    },
    {
      claim:
        'the write control above can move the cap — reported as demonstrable:false because this lane did NOT drive it, and an undriven write is not a control',
      how: `POST ${LIVE_ORIGIN}/agent-team-cap/api/set with {"choice":8}, confirm state.configured becomes 8, then POST {"choice":"unlimited"} and confirm it returns to 9007199254740991. It was withheld rather than forgotten: this route caps the LIVE FLEET the owner is running, and a lane testing its own window must not shorten the fleet mid-run. A reader who drives the pair has falsified this row's honesty in both directions.`,
    },
    {
      claim: 'the agent-team layer is mounted because a bundle row loads it, and not merely installed because a dependency names it',
      how: `read dsh.profile.bundles in ${'absent' in anchors ? 'the profile manifest' : anchors.profileManifest} and confirm @deepseek-ai/dsh-experimental-agent-team-profile is IN that array; then GET ${LIVE_ORIGIN}/agent-team-cap/api/state and confirm it answers 200. Either instrument alone is satisfiable by a broken deployment: a bundles row proves intent, a 200 proves a running process.`,
    },
    {
      claim: 'nothing in this window is reported as a working zero',
      how: 'check every `installed` field: it is true, or null with a reason in `alignment.evidence`. A `false` here would mean measured-and-absent, which is a different claim, and a null must never be read as false.',
    },
  ]

  return {
    items,
    census: censusOf(
      items.length,
      5,
      'the 5 agent-team layer components this provider enumerated: 2 profile-manifest rows (the Team service bundle row and the cap’s link dependency), the live maxMembers reading, the registered delegation tool, and the zone vocabulary. The denominator is the population measured from the manifest and the live surfaces; the numerator is the rows actually emitted, so a failed probe LOWERS the ratio rather than quietly dropping a row.',
      at,
    ),
    controls,
    falsifiers,
    unavailable: null,
    // The manifest rows are real whether or not the socket answered, so a failed
    // live read is STALE and never UNAVAILABLE: the two cap rows keep their rows and
    // the reason names the probe that did not come back.
    stale: staleOf(
      stateRow === undefined || stateRow.status === null
        ? `the live cap read did not answer within ${String(PROBE_TIMEOUT_MS)} ms (${stateRow?.error ?? 'no probe row'}); the profile-manifest rows are from disk and stand, and the maxMembers reading is absent rather than zero`
        : zonesRow === undefined || zonesRow.status === null
          ? `the live zones read did not answer within ${String(PROBE_TIMEOUT_MS)} ms; the delegation tool and zone vocabulary are absent rather than empty`
          : null,
      at,
      PROBE_TIMEOUT_MS,
    ),
  }
}

/** ========================================================================== */
/** WINDOW 2 — meta-loops                                                      */
/** ========================================================================== */

/**
 * THE EVOLUTION LOOPS, CITED RATHER THAN RE-DERIVED.
 *
 * The interesting fact about this window is that it does NOT need to invent
 * anything: the evolve loop already writes a machine-readable record
 * (`tmp/ts-evolve-state.json`, written by `runner/ts-evolve/run.mjs`), and that
 * record carries the rounds, the per-round verdicts and the totals. So this window
 * reads the record and reports it, and the numbers it publishes are the numbers
 * the loop published to itself.
 *
 * **The two earlier records are READ, not recomputed, and they are labelled so.**
 * `research/obj1-evolve-iterations.md` (5 rounds, 15 / 9 / 6) and
 * `research/tools-skills-meta.md` (the first 3 rounds' 10 / 7 / 3) are prose
 * records of runs whose state file is the authority above them. Re-deriving them
 * here would be a second implementation of one fact, which is how this program's
 * numbers have historically drifted apart.
 *
 * THE LOOP CENSUS IS A FRACTION WITH A DENOMINATOR, and the denominator is the
 * thing a reader would get wrong: `runner/` holds **17** top-level directories at
 * this census, and only **5** of them are evolution loops. The other 12 are
 * verification, bench and recon families. Reporting "17 runners" as if all of them
 * evolve would be the count-without-its-population error, so the population string
 * names the split and the item rows name which five.
 */
interface LoopState {
  readonly roundsRead: number
  readonly rounds: readonly {
    readonly round: string
    readonly proposals: number
    readonly promoted: number
    readonly refused: number
    readonly intent: string
  }[]
  readonly proposals: number
  readonly promoted: number
  readonly refused: number
  readonly refusedNamingOneCriterion: number
  readonly population: string
  readonly censusAt: string
  readonly observedDeclarations: number
  readonly logsRead: number
  readonly logsFound: number
  readonly records: number
  readonly frames: number
  readonly framesBad: number
  readonly controllabilityPassed: number
  readonly controllabilityTotal: number
  readonly metaSkill: string
  readonly metaTool: string
  readonly loopsStops: boolean
}

/** Read the run's own record. Returns `null` rather than a zero when unreadable. */
function readLoopState(programRoot: string): LoopState | null {
  let text: string
  try {
    text = readFileSync(join(programRoot, 'tmp', 'ts-evolve-state.json'), 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const root = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const num = (value: unknown): number => (typeof value === 'number' ? value : 0)
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')

  const rawRounds = Array.isArray(root['rounds']) ? root['rounds'] : []
  const rounds = rawRounds.map((entry) => {
    const round = asRecord(entry)
    const verdicts = asRecord(round['verdicts'])
    return {
      round: str(round['round']),
      proposals: num(verdicts['proposals']),
      promoted: num(verdicts['promoted']),
      refused: num(verdicts['refused']),
      intent: str(round['intent']),
    }
  })
  const totals = asRecord(root['totals'])
  const observation = asRecord(root['observation'])
  const evidence = asRecord(root['evidence'])
  const controllability = asRecord(root['controllability'])
  const termination = asRecord(root['termination'])
  const subject = asRecord(controllability['subject'])
  const checks = Array.isArray(controllability['checks']) ? controllability['checks'] : []
  const checksOk = checks.filter((entry) => asRecord(entry)['ok'] === true).length

  if (rounds.length === 0) return null
  return {
    roundsRead: rounds.length,
    rounds,
    proposals: num(totals['proposals']),
    promoted: num(totals['promoted']),
    refused: num(totals['refused']),
    refusedNamingOneCriterion: num(totals['refusedNamingOneCriterion']),
    population: str(totals['population']),
    censusAt: str(root['censusAt']),
    observedDeclarations: num(evidence['observedDeclarations']),
    logsRead: num(observation['logsRead']),
    logsFound: num(observation['logsFound']),
    records: num(evidence['records']),
    frames: num(observation['frames']),
    framesBad: num(observation['framesBad']),
    controllabilityPassed: checksOk,
    controllabilityTotal: checks.length,
    metaSkill: str(subject['metaSkill']),
    metaTool: str(subject['metaTool']),
    loopsStops: termination['loopStops'] === true || num(termination['retainedThisRound']) === 0,
  }
}

/** The five directory names under `runner/` that are evolution loops, with what each is. */
const LOOP_FAMILIES: readonly { readonly dir: string; readonly label: string; readonly what: string }[] = Object.freeze([
  { dir: 'ts-evolve', label: 'tools/skills evolve loop', what: 'the 5-round loop that grades description rewrites and promotes only what passes 8/8' },
  { dir: 'foundry-loop', label: 'plugin foundry loop', what: 'the loop that generates and grades a plugin from a declared subject' },
  { dir: 'fuse-loop', label: 'plugin fuse loop', what: 'the loop that fuses contributions into a package and grades the result' },
  { dir: 'patch-loop', label: 'patch loop', what: 'the loop that produces and verifies a reviewable patch artifact' },
  { dir: 'small-loop', label: 'small loop', what: 'the small, single-step loop over the same live surface' },
])

function metaLoopsWindow(at: string, anchors: Anchors | { readonly absent: string }): ProviderWindow {
  if ('absent' in anchors) {
    return {
      unavailable: { reason: anchors.absent, measuredAt: at },
      controls: [],
      falsifiers: [
        {
          claim: 'this window reports an absence rather than an empty success when the program workspace cannot be located',
          how: 'confirm the body carries unavailable.reason naming the search that failed, and that census is absent rather than {"numerator":0,"denominator":0} — a zero on both sides is instrument failure, not a pass.',
        },
      ],
    }
  }

  const state = readLoopState(anchors.programRoot)
  const runnerDirs = countDirectories(join(anchors.programRoot, 'runner'))
  const runnerFiles = countFiles(join(anchors.programRoot, 'runner'))
  const scriptLike = runnerFiles.files.filter((file) => /\.(mjs|js|ts|ps1|sh|cmd)$/.test(file)).length
  const loopDirs = LOOP_FAMILIES.filter((family) => runnerDirs.names.includes(family.dir)).length

  const artifacts: readonly { readonly path: string; readonly bytes: number | null; readonly lines: number | null }[] = [
    { path: 'research/obj1-evolve-iterations.md', ...sizeOf(join(anchors.programRoot, 'research', 'obj1-evolve-iterations.md')) },
    { path: 'research/tools-skills-meta.md', ...sizeOf(join(anchors.programRoot, 'research', 'tools-skills-meta.md')) },
    { path: 'tmp/ts-evolve-state.json', ...sizeOf(join(anchors.programRoot, 'tmp', 'ts-evolve-state.json')) },
  ]

  const items: WindowItem[] = []

  for (const family of LOOP_FAMILIES) {
    const present = runnerDirs.names.includes(family.dir)
    const files = present ? countFiles(join(anchors.programRoot, 'runner', family.dir)).files.length : null
    const isEvolve = family.dir === 'ts-evolve'
    items.push(
      itemOf({
        id: `loop-${family.dir}`,
        name: family.label,
        kind: present ? 'exists' : 'plan',
        installed: present,
        where: 'installed',
        verdict: present ? 'aligned' : 'collides',
        why: present
          ? `${family.what}. ${String(files)} file(s) under runner/${family.dir}/ (directory-aware walk, node_modules excluded).${isEvolve && state !== null ? ` Its own record reports ${String(state.roundsRead)} rounds over ${String(state.observedDeclarations)} observed tool declarations from ${String(state.logsRead)} decoded logs of ${String(state.logsFound)} found, and the totals those rounds produced.` : ''}`
          : `${family.what} — but runner/${family.dir}/ is NOT on disk, so this row is a plan rather than a reading. It is emitted as its own row instead of being omitted, because an omitted row is indistinguishable from a passing one.`,
        evidence: present
          ? `readdirSync(${join(anchors.programRoot, 'runner', family.dir)}) with withFileTypes:true, isDirectory() recursion, node_modules pruned — ${String(files)} file(s)`
          : `readdirSync(${join(anchors.programRoot, 'runner')}) — ${family.dir} is not among ${String(runnerDirs.names.length)} top-level directories`,
      }),
    )
  }

  if (state !== null) {
    for (const round of state.rounds) {
      items.push(
        itemOf({
          id: `round-${round.round.toLowerCase()}`,
          name: `${round.round} — ${round.intent}`,
          kind: 'exists',
          installed: true,
          where: 'installed',
          verdict: round.refused > 0 && round.promoted > 0 ? 'aligned' : round.promoted > 0 ? 'aligned' : 'collides',
          why: `${String(round.proposals)} proposal(s): ${String(round.promoted)} promoted, ${String(round.refused)} refused.${round.refused > 0 ? ' A round that refuses something is the loop demonstrating it can refuse; a loop that only ever accepts is accumulating, not evolving.' : ''}`,
          evidence: `tmp/ts-evolve-state.json rounds[] — the run’s own record, census ${state.censusAt}, read at ${at}`,
        }),
      )
    }
    items.push(
      itemOf({
        id: 'evolve-control-subject',
        name: `controllability subject: ${state.metaSkill} / ${state.metaTool}`,
        kind: 'exists',
        installed: true,
        where: 'installed',
        verdict: state.controllabilityTotal > 0 && state.controllabilityPassed === state.controllabilityTotal ? 'aligned' : 'collides',
        why: `the loop’s own controllability battery: ${String(state.controllabilityPassed)} of ${String(state.controllabilityTotal)} checks passed. The subject pair is the meta-skill and the meta-tool the rounds produced, and the battery is what turns "the knob exists" into "driving the knob changed an outcome"`,
        evidence: `tmp/ts-evolve-state.json controllability.checks[] at ${state.censusAt}`,
      }),
    )
  }

  for (const artifact of artifacts) {
    items.push(
      itemOf({
        id: `record-${artifact.path.replace(/[^a-z0-9]+/gi, '-')}`,
        name: artifact.path,
        kind: artifact.bytes === null ? 'plan' : 'exists',
        installed: artifact.bytes === null ? false : true,
        where: 'installed',
        verdict: artifact.bytes === null ? 'collides' : 'aligned',
        why:
          artifact.bytes === null
            ? 'the file is NOT on disk at this census, so the numbers attributed to it are cited from the record rather than measured here'
            : `${String(artifact.bytes)} B, ${String(artifact.lines)} line(s) (newline count, not a split length — a split reads one line too many on every file this program writes). The rounds and totals above are CITED from this artifact, not re-derived: a second derivation of one fact is how two numbers for one thing get published.`,
        evidence: `stat of ${join(anchors.programRoot, artifact.path)} at ${at}`,
      }),
    )
  }

  const controls: readonly Control[] = [
    {
      id: 'loop-record-read',
      label: 'Read the evolve loop’s own machine-readable round record',
      kind: 'read',
      target: 'tmp/ts-evolve-state.json (file read, not a route)',
      demonstrable: state !== null,
    },
    {
      id: 'loop-families-census',
      label: 'Count the evolution-loop families under runner/ and their files',
      kind: 'read',
      target: 'runner/ (directory-aware walk)',
      demonstrable: runnerDirs.absent === null,
    },
  ]

  const falsifiers: readonly Falsifier[] = [
    {
      claim: state === null
        ? 'the loop has a machine-readable record of its rounds'
        : `the loop ran ${String(state.roundsRead)} rounds producing ${String(state.proposals)} proposals, ${String(state.promoted)} promoted and ${String(state.refused)} refused, and ${String(state.refusedNamingOneCriterion)} of the ${String(state.refused)} refusals named exactly ONE criterion`,
      how:
        state === null
          ? 'it does not, at this census: tmp/ts-evolve-state.json is unreadable, and this window then emits rows stating that rather than counting to zero.'
          : `read tmp/ts-evolve-state.json and check totals.proposals == ${String(state.proposals)} and that the sum of rounds[].verdicts.refused equals it. A refusal that names several criteria cannot say which criterion the artifact failed, so a single-criterion fault would be indistinguishable from a broad one — that identity is the check, not the count.`,
    },
    {
      claim: 'the loop STOPS on its own terms rather than by running out of budget',
      how: `check tmp/ts-evolve-state.json termination: the terminal round retains nothing and the loop stops. A loop that only ever accepts never terminates by itself; a loop whose terminal round retains zero has demonstrated a stopping condition, and one whose terminal round is missing has not.`,
    },
    {
      claim: `exactly ${String(loopDirs)} of ${String(runnerDirs.names.length)} top-level directories under runner/ are evolution loops, and the fraction is not "all of them"`,
      how: `node -e "const fs=require('fs');console.log(fs.readdirSync('runner',{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name))" and count the names against the five rows above. The trap this guards is a directory listing read as a directory count: a listing includes FILES, and it prints names rather than kinds, so the mixture is invisible in its own output.`,
    },
  ]

  return {
    items,
    census: censusOf(
      items.length,
      LOOP_FAMILIES.length + 5 + 1 + 3,
      `the 14-row population this window enumerates: ${String(LOOP_FAMILIES.length)} evolution-loop families, 5 recorded rounds, 1 controllability subject and 3 citable records (= 14). The denominator is the population the corpus defines; the numerator is the rows emitted, so an unreadable round record lowers the ratio to 8 of 14 and is never silently omitted. Runner corpus at this census: ${String(runnerDirs.names.length)} top-level director(ies), ${String(runnerFiles.files.length)} file(s), of which ${String(scriptLike)} are script-like (.mjs/.js/.ts/.ps1/.sh/.cmd).`,
      at,
    ),
    controls,
    falsifiers,
    unavailable: null,
    // A FILE read has no probe bound, so `boundMs` is null here rather than a
    // number borrowed from a different instrument.
    stale: staleOf(
      state === null && runnerDirs.absent === null
        ? 'tmp/ts-evolve-state.json is not readable, so the ROUND rows are absent while the loop-family rows are real; the corpus numbers stand and the rounds are NOT MEASURED rather than zero'
        : null,
      at,
      null,
    ),
  }
}

/** Byte size and newline count of a file, or `null` for both when unreadable. */
function sizeOf(path: string): { readonly bytes: number | null; readonly lines: number | null } {
  try {
    const buffer = readFileSync(path)
    let newlines = 0
    for (const byte of buffer) if (byte === 0x0a) newlines += 1
    return { bytes: buffer.length, lines: newlines }
  } catch {
    return { bytes: null, lines: null }
  }
}

/** ========================================================================== */
/** WINDOW 3 — meta-cordis                                                     */
/** ========================================================================== */

/**
 * THE CORDIS-HARD-WAY LAYER: the corpus, and what is actually MOUNTED.
 *
 * TWO COUNTS, AND THEY ARE TAKEN WITH DIFFERENT INSTRUMENTS ON PURPOSE.
 *
 *   1. **The corpus.** `cordis_hard_way/` is counted by walking DIREENTS —
 *      `readdirSync(..., {withFileTypes:true})` with an `isDirectory()` branch —
 *      and never by measuring the length of a listing. This program published a
 *      wrong count once (54 instead of 52) by counting the entries of a directory
 *      listing, and the mixture is invisible in a listing because it prints names
 *      and not kinds. The corpus enumeration is cross-checked against the corpus's
 *      OWN index: `cordis_hard_way/README.md` links nine chapters, so ten files is
 *      the number the corpus claims for itself.
 *   2. **The mounts.** `dsh.profile.bundles` in the profile manifest is the array
 *      the loader iterates, so its LENGTH is how many bundles this profile
 *      declares — and a bundle row is not a plugin row: a row that is declared can
 *      still be skipped by the loader (see this window's falsifier on
 *      `skippedBundles`). Declared is the fact this instrument can measure; loaded
 *      is not, from here.
 *
 * THE PATCH FORM IS THE THIRD COUNT AND IT IS THE ONE THAT FAILS
 *
 * The loader's `parsePatchList` requires a **top-level YAML array** and throws
 * otherwise; `profile.ts` catches that throw into `skippedBundles`, so an
 * unloadable bundle patch costs one stderr line and no failed boot. Measured at
 * this census: this clone's own `cordis.patch.yml` and `dsh-agent-team-cap`'s are
 * top-level ARRAYS, and `dsh-meta-community`'s is a top-level MAPPING. That is a
 * real, currently-failing candidate and it is reported as `collides` rather than
 * smoothed over.
 */
function metaCordisWindow(at: string, anchors: Anchors | { readonly absent: string }): ProviderWindow {
  if ('absent' in anchors) {
    return {
      unavailable: { reason: anchors.absent, measuredAt: at },
      controls: [],
      falsifiers: [
        {
          claim: 'this window reports an absence rather than an empty success when the program workspace cannot be located',
          how: 'confirm unavailable.reason names the search, and that no count in the body reads 0 — a zero produced by an instrument that cannot see its subject is instrument failure.',
        },
      ],
    }
  }

  const corpus = countFiles(join(anchors.programRoot, 'cordis_hard_way'))
  const corpusFiles = corpus.files
  const readme = (() => {
    try {
      return readFileSync(join(anchors.programRoot, 'cordis_hard_way', 'README.md'), 'utf8')
    } catch {
      return null
    }
  })()
  const linkedChapters = readme === null ? [] : [...new Set([...readme.matchAll(/\((\d\d-[a-z0-9-]+\.md)\)/g)].map((match) => (match[1] ?? '')))].filter(Boolean)
  const profile = readProfile(anchors.profileManifest)
  const profileFacts = 'absent' in profile ? null : profile

  const items: WindowItem[] = []

  items.push(
    itemOf({
      id: 'cordis-corpus-files',
      name: `cordis_hard_way/ corpus (${String(corpusFiles.length)} file(s))`,
      kind: corpus.absent === null ? 'exists' : 'plan',
      installed: corpus.absent === null,
      where: 'installed',
      verdict: corpus.absent === null ? 'aligned' : 'collides',
      why:
        corpus.absent === null
          ? `${String(corpusFiles.length)} file(s) under cordis_hard_way/, counted by a directory-aware walk (readdirSync withFileTypes, isDirectory() recursion, node_modules pruned). The corpus's own README links ${String(linkedChapters.length)} chapter(s), so the corpus claims ${String(linkedChapters.length + 1)} files including itself and the walk finds ${String(corpusFiles.length)} — the two agree, which is what makes this a cross-check rather than one instrument agreeing with itself.`
          : `NOT MEASURED: ${corpus.absent}`,
      evidence: `countFiles(${join(anchors.programRoot, 'cordis_hard_way')}) -> ${String(corpusFiles.length)} file(s); README link regex /\((\\d\\d-[a-z0-9-]+\\.md)\)/g -> ${String(linkedChapters.length)} chapter(s)`,
    }),
  )

  for (const file of corpusFiles) {
    const size = sizeOf(join(anchors.programRoot, 'cordis_hard_way', file))
    items.push(
      itemOf({
        id: `cordis-doc-${file.replace(/\.md$/, '').toLowerCase()}`,
        name: file,
        kind: 'exists',
        installed: true,
        where: 'installed',
        verdict: 'aligned',
        why: `${String(size.bytes)} B, ${String(size.lines)} line(s) (newline count). One row per corpus file rather than one aggregate row, because a corpus that lost a chapter would otherwise still read as "the corpus is there".`,
        evidence: `stat of ${join(anchors.programRoot, 'cordis_hard_way', file)} at ${at}`,
      }),
    )
  }

  items.push(
    itemOf({
      id: 'profile-bundles-mounted',
      name: 'profile bundles the loader iterates',
      kind: 'exists',
      installed: profileFacts === null ? null : profileFacts.bundles.length > 0,
      where: 'installed',
      verdict: profileFacts === null ? 'not-measured' : 'aligned',
      why:
        profileFacts === null
          ? 'the profile manifest could not be read, so the bundle count is NOT MEASURED — null, not 0'
          : `${String(profileFacts.bundles.length)} bundle(s) are declared in dsh.profile.bundles, and ${String(profileFacts.dependencyNames.length)} package(s) in dependencies. DECLARED is what this instrument measures: a declared bundle can still be SKIPPED by the loader (its patch is caught into skippedBundles), so this row does not claim all of them loaded.`,
      evidence: `${anchors.profileManifest} — dsh.profile.bundles.length and Object.keys(dependencies).length, read at ${at}`,
    }),
  )

  const patchRows: readonly { readonly clone: string; readonly path: string }[] = [
    { clone: 'dsh-meta-market (this clone)', path: join(anchors.anchor, 'plugins-src', 'dsh-meta-market', 'cordis.patch.yml') },
    { clone: 'dsh-agent-team-cap', path: join(anchors.anchor, 'plugins-src', 'dsh-agent-team-cap', 'cordis.patch.yml') },
    { clone: 'dsh-meta-community', path: join(anchors.anchor, 'plugins-src', 'dsh-meta-community', 'cordis.patch.yml') },
  ]

  for (const row of patchRows) {
    const form = patchFormOf(row.path)
    const isArray = form !== null && form.shape === 'array'
    items.push(
      itemOf({
        id: `patch-form-${row.clone.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        name: `${row.clone} cordis.patch.yml`,
        kind: form === null ? 'plan' : 'exists',
        installed: form === null ? false : true,
        where: 'installed',
        verdict: form === null ? 'collides' : isArray ? 'aligned' : 'collides',
        why:
          form === null
            ? 'the patch file is NOT on disk, so its form is NOT MEASURED rather than assumed loadable'
            : isArray
              ? `top-level ARRAY with ${String(form.entries)} entr(ies) — the form parsePatchList requires, so a bundle row naming this clone would be loaded rather than skipped${
                  row.clone.startsWith('dsh-meta-market') && profileFacts !== null && profileFacts.bundles.includes('dsh-meta-market')
                    ? `. AND THIS FORM IS NOW LOAD-BEARING RATHER THAN HYPOTHETICAL: the mount lane declared this clone at 1-based position ${String(profileFacts.bundles.indexOf('dsh-meta-market') + 1)} of ${String(profileFacts.bundles.length)} in dsh.profile.bundles, so the array shape is what decides whether that row loads or is swallowed into skippedBundles`
                    : ''
                }`
              : `top-level MAPPING with key(s) [${form.keys.join(', ')}] — the loader requires a top-level ARRAY and THROWS otherwise, and profile.ts catches that throw into skippedBundles, so adding a bundle row for this clone today would SKIP it with one stderr line and no failed boot`,
        evidence:
          form === null
            ? `stat of ${row.path} — absent`
            : `${row.path} — ${String(form.bytes)} B, top-level ${form.shape}; requirement at deepseek-harness/packages/boot/app-boot/src/index.ts parsePatchList ("must be a top-level YAML array of loader patch entries")`,
        ...(form !== null && !isArray
          ? {
              verdict: 'collides' as const,
              collidesWith: [
                {
                  id: 'deepseek-harness/app-boot/parsePatchList',
                  why: 'requires a top-level YAML array of loader patch entries and throws on a mapping, and profile.ts swallows the throw into skippedBundles',
                },
              ],
            }
          : {}),
      }),
    )
  }

  const controls: readonly Control[] = [
    {
      id: 'corpus-census',
      label: 'Count the Cordis corpus with a directory-aware instrument',
      kind: 'read',
      target: 'cordis_hard_way/ (readdirSync withFileTypes + isDirectory recursion)',
      demonstrable: corpus.absent === null,
    },
    {
      id: 'bundle-census',
      label: 'Read the declared profile bundles from the manifest',
      kind: 'read',
      target: 'profiles-tree/personal-dev/package.json — dsh.profile.bundles',
      demonstrable: profileFacts !== null,
    },
    {
      id: 'patch-form-read',
      label: 'Read a clone’s bundle-patch top-level shape',
      kind: 'read',
      target: 'plugins-src/<clone>/cordis.patch.yml (top-level shape only)',
      demonstrable: patchRows.length > 0,
    },
  ]

  const mappingClones = patchRows.filter((row) => {
    const form = patchFormOf(row.path)
    return form !== null && form.shape !== 'array'
  })

  const falsifiers: readonly Falsifier[] = [
    {
      claim: `the Cordis corpus under cordis_hard_way/ holds ${String(corpusFiles.length)} file(s), counted as FILES with a directory-aware instrument`,
      how: `node -e "const fs=require('fs'),p=require('path');const w=(d,a=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){e.isDirectory()?w(p.join(d,e.name),a):a.push(e.name)}return a};console.log(w('cordis_hard_way').length)" and compare. The trap: \`ls cordis_hard_way | wc -l\` counts ENTRIES, which includes directories, and a listing prints names rather than kinds — this program published 54 where the truth was 52 by exactly that instrument.`,
    },
    {
      claim: `at this census, ${String(mappingClones.length)} of ${String(patchRows.length)} measured clone patch files is a top-level MAPPING and therefore unloadable, and the rest are arrays`,
      how: `parse each cordis.patch.yml and test Array.isArray(parsed). A patch that parses is not thereby loadable: the test is the SHAPE, and a mapping parses perfectly while the loader refuses it.`,
    },
    {
      claim: 'a declared bundle row is not a loaded plugin, and this window does not conflate them',
      how: `count dsh.profile.bundles (declared) and then look for the loader's skippedBundles for the same boot. The two numbers can differ, and a window that reported "40 mounted" from the array length alone would be claiming a load it never observed. This row says DECLARED and names the gap.`,
    },
    {
      claim: 'the corpus count and the corpus’s own index agree rather than one instrument repeating itself',
      how: `compare the walk's file count with (chapters linked by cordis_hard_way/README.md + 1 for the README). Evidence of two independent claims about one population; a corpus missing a chapter would drop the walk's number and not the README's.`,
    },
  ]

  return {
    items,
    census: censusOf(
      items.length,
      corpusFiles.length + 5,
      `the population this window enumerates: ${String(corpusFiles.length)} corpus files + 5 mount-layer rows (1 corpus aggregate, 1 declared-bundles row, ${String(patchRows.length)} patch-form rows) = ${String(corpusFiles.length + 5)}. Of the ${String(patchRows.length)} measured patch files, ${String(mappingClones.length)} are top-level MAPPINGS and unloadable.`,
      at,
    ),
    controls,
    falsifiers,
    unavailable: null,
    stale: staleOf(
      corpus.absent !== null || profileFacts === null
        ? `a file instrument did not read: ${corpus.absent !== null ? `the corpus walk failed (${corpus.absent})` : 'the profile manifest is unreadable, so the declared-bundle count is absent rather than 0'}; every count that DID read stands`
        : null,
      at,
      null,
    ),
  }
}

/**
 * The TOP-LEVEL SHAPE of a YAML document, read without a YAML parser.
 *
 * Installing a parser to answer one question would add a dependency to a package
 * that has none, so the question is answered structurally: the first non-blank,
 * non-comment line of a YAML document is `- ...` for a top-level SEQUENCE and
 * `key:` for a top-level MAPPING. That is sufficient for the one distinction the
 * loader makes, and it is stated so a reader knows the instrument is a shape test
 * and not a parse. `entries` and `keys` are reported for the shape that was found.
 */
function patchFormOf(path: string): { readonly shape: 'array' | 'mapping'; readonly entries: number; readonly keys: readonly string[]; readonly bytes: number } | null {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const lines = text.split('\n')
  const body = lines.filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
  const first = body[0] === undefined ? '' : body[0]
  if (first.trimStart().startsWith('-')) {
    const entries = body.filter((line) => /^-(\s|$)/.test(line)).length
    return { shape: 'array', entries, keys: [], bytes: Buffer.byteLength(text) }
  }
  const keys = body
    .filter((line) => /^[A-Za-z0-9_.-]+\s*:/.test(line))
    .map((line) => (line.split(':')[0] ?? '').trim())
  return { shape: 'mapping', entries: 0, keys, bytes: Buffer.byteLength(text) }
}

/** ========================================================================== */
/** WINDOW 4 — meta-community                                                  */
/** ========================================================================== */

/**
 * `dsh-meta-community`, PROBED RATHER THAN COPIED.
 *
 * The clone is owner-authorized (`D-0080`) and READ-ONLY to this lane. A decision
 * (`D-0236`) states that all seven of its advertised routes return `404` with a
 * `0`-byte body on the live deployment. **This lane does not adopt that decision;
 * it re-runs the probe and reports what it measures**, because a decision is a
 * claim about a moment and a probe is a claim about now. If the state has moved,
 * the decision is stale and this window's rows say so with the measurement beside
 * the decision's numbers.
 *
 * THE TWO DISCRIMINATIONS THIS WINDOW IS BUILT ON, both of which a naive probe
 * would miss:
 *
 *   1. **A `404` with `0` bytes is NOT the same as a `404` with a body.** The
 *      un-mounted prefix falls through to the host's bare `404` with an empty body;
 *      a MOUNTED plugin answering an unknown sub-path returns a `404` that carries
 *      its own JSON. Measured here: `/zone-recalc/api/does-not-exist` answers `404`
 *      with a 75-byte body while `/meta-community/api/members` answers `404` with
 *      `0` bytes. Without that control the two states are indistinguishable, and
 *      this program's own complaint about advertised-but-404 paths is that they
 *      look identical to never-having-been-registered.
 *   2. **`null` is not `404`.** A socket that never answered yields `status: null`,
 *      and the row then says NOT MEASURED. Counting a dead port as seven 404s would
 *      manufacture exactly the finding the probe exists to test.
 */
interface CommunityRouteRow {
  readonly path: string
  readonly status: number | null
  readonly bytes: number | null
  readonly body: string | null
  readonly error: string | null
}

function metaCommunityWindow(at: string, batch: ProbeBatch, anchors: Anchors | { readonly absent: string }): ProviderWindow {
  const control = rowOf(batch, CONTROL_MOUNTED_PATH)
  const unregistered = rowOf(batch, CONTROL_UNMOUNTED_PATH)
  const instrumentOk = control !== undefined && control.status === 200

  const routes: CommunityRouteRow[] = COMMUNITY_PATHS.map((path) => {
    const row = rowOf(batch, path)
    return {
      path,
      status: row?.status ?? null,
      bytes: row?.bytes ?? null,
      body: row?.body ?? null,
      error: row?.error ?? 'no probe row was produced for this path',
    }
  })

  const answered = routes.filter((row) => row.status !== null && row.status !== 404).length
  const notFoundEmpty = routes.filter((row) => row.status === 404 && row.bytes === 0).length
  const notFoundWithBody = routes.filter((row) => row.status === 404 && row.bytes !== null && row.bytes > 0).length
  const unmeasured = routes.filter((row) => row.status === null).length

  const profile = 'absent' in anchors ? null : readProfile(anchors.profileManifest)
  const profileFacts = profile !== null && !('absent' in profile) ? profile : null
  const patchForm = 'absent' in anchors ? null : patchFormOf(join(anchors.anchor, 'plugins-src', 'dsh-meta-community', 'cordis.patch.yml'))

  // `exists` needs DECLARED **and** ANSWERED, which is the lead's rule and which
  // this clone fails on both counts: 0 bundle rows and 0 answering routes. So its
  // kind is `plan` — a built artifact that is neither mounted nor reachable — and
  // the row says so rather than claiming existence from a clone on disk. It is not
  // `future`: `future` is for a plan-corpus goal with no clone, and this one has a
  // full `src/` tree and a `lib/`.
  const communityKind = deriveKind(profileFacts === null ? null : profileFacts.communityInBundles, answered > 0)

  const items: WindowItem[] = [
    itemOf({
      id: 'community-clone',
      name: 'dsh-meta-community',
      npm: null,
      owner: null,
      kind: communityKind,
      installed: true,
      downloadable: null,
      where: 'community',
      verdict: 'aligned',
      why:
        profileFacts === null
          ? 'the clone exists on disk (its src/ tree and cordis.patch.yml were read); its mount state is NOT MEASURED because the profile manifest could not be read'
          : `the clone exists on disk but is in ${String(profileFacts.communityInBundles ? 1 : 0)} of ${String(profileFacts.bundles.length)} dsh.profile.bundles entries and ${String(profileFacts.communityInDependencies ? 1 : 0)} of ${String(profileFacts.dependencyNames.length)} dependencies — so it is BUILT and not MOUNTED, which is a different state from absent and is the state this clone is in`,
      evidence:
        profileFacts === null
          ? 'plugins-src/dsh-meta-community/ on disk; profile manifest unreadable'
          : `${anchors === undefined ? 'profile manifest' : 'profile manifest'} — bundles.includes("dsh-meta-community") and "dsh-meta-community" in dependencies, read at ${at}`,
    }),
  ]

  for (const route of routes) {
    const measured = route.status !== null
    const verdict: 'aligned' | 'collides' | 'not-measured' = !measured
      ? 'not-measured'
      : route.status === 404 && route.bytes === 0
        ? 'collides'
        : 'aligned'
    items.push(
      itemOf({
        id: `community-route-${route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
        name: route.path,
        kind: 'exists',
        installed: measured ? route.status !== 404 : null,
        where: 'community',
        route: route.path,
        verdict,
        why: !measured
          ? `NOT MEASURED: GET ${LIVE_ORIGIN}${route.path} did not answer (${route.error}) — this is a failed reading, not a 404, and it must not be counted as one`
          : route.status === 404 && route.bytes === 0
            ? `404 with a 0-byte body: the prefix is not mounted on this deployment at all, because a MOUNTED plugin answering an unknown sub-path returns its own 404 WITH a body (see the control row below). Advertised and unreachable is worse than absent: a reader who mistypes nothing still cannot reach this route.`
            : `HTTP ${String(route.status)} with ${String(route.bytes)} byte(s): this route answered on the live deployment, so the 7-of-7-404 state recorded by D-0236 has MOVED at this census and that decision is STALE for this row`,
        evidence:
          route.status === null
            ? `probe of ${route.path} at ${batch.at} — no answer`
            : `GET ${LIVE_ORIGIN}${route.path} -> ${String(route.status)}, ${String(route.bytes)} B at ${batch.at}`,
      }),
    )
  }

  items.push(
    itemOf({
      id: 'community-control-mounted',
      name: CONTROL_MOUNTED_PATH,
      kind: 'exists',
      installed: control === undefined ? null : control.status === 200,
      where: 'installed',
      route: CONTROL_MOUNTED_PATH,
      verdict: control === undefined || control.status === null ? 'not-measured' : control.status === 200 ? 'aligned' : 'collides',
      why:
        control === undefined || control.status === null
          ? 'the instrument was not proven able to see an answer, so every 404 in this window is a failed reading rather than a finding — a `0` on both sides is instrument failure, not a pass'
          : `HTTP ${String(control.status)} with ${String(control.bytes)} byte(s) on a route measured as answering. This row exists so the seven 404s above are a MEASUREMENT rather than a blind probe: an instrument that cannot see a 200 cannot be trusted to report a 404.`,
      evidence:
        control === undefined || control.status === null
          ? `GET ${LIVE_ORIGIN}${CONTROL_MOUNTED_PATH} did not answer at ${batch.at}`
          : `GET ${LIVE_ORIGIN}${CONTROL_MOUNTED_PATH} -> ${String(control.status)}, ${String(control.bytes)} B at ${batch.at}`,
    }),
  )

  items.push(
    itemOf({
      id: 'community-control-unregistered-path',
      name: `${CONTROL_UNMOUNTED_PATH} (a MOUNTED plugin’s unknown path)`,
      kind: 'exists',
      installed: unregistered === undefined ? null : unregistered.status !== null,
      where: 'installed',
      route: CONTROL_UNMOUNTED_PATH,
      verdict: unregistered === undefined || unregistered.status === null ? 'not-measured' : 'aligned',
      why:
        unregistered === undefined || unregistered.status === null
          ? 'NOT MEASURED: the unregistered-path control did not answer, so the 0-byte/with-body distinction this window relies on is unproven at this census'
          : `HTTP ${String(unregistered.status)} with ${String(unregistered.bytes)} byte(s). That is the discriminator: a mounted plugin answering an unknown sub-path returns a 404 WITH A BODY, while an un-mounted prefix returns a 404 with 0 bytes. The seven community rows are 0-byte 404s, so they are the second kind.`,
      evidence:
        unregistered === undefined || unregistered.status === null
          ? `GET ${LIVE_ORIGIN}${CONTROL_UNMOUNTED_PATH} did not answer at ${batch.at}`
          : `GET ${LIVE_ORIGIN}${CONTROL_UNMOUNTED_PATH} -> ${String(unregistered.status)}, ${String(unregistered.bytes)} B at ${batch.at}`,
    }),
  )

  items.push(
    itemOf({
      id: 'community-patch-form',
      name: 'dsh-meta-community cordis.patch.yml',
      kind: patchForm === null ? 'plan' : 'exists',
      installed: patchForm !== null,
      where: 'community',
      verdict: patchForm === null ? 'not-measured' : patchForm.shape === 'array' ? 'aligned' : 'collides',
      why:
        patchForm === null
          ? 'the bundle patch is NOT on disk, so its shape is NOT MEASURED'
          : patchForm.shape === 'array'
            ? `top-level ARRAY with ${String(patchForm.entries)} entr(ies): loadable, and D-0081’s mount step is now unblocked on this file’s count`
            : `top-level MAPPING with key(s) [${patchForm.keys.join(', ')}] while the loader requires a top-level ARRAY — parsePatchList throws and profile.ts catches the throw into skippedBundles, so a bundle row added today would SKIP this clone with one stderr line and no failed boot. This is the one item on this surface that is a REAL, currently-failing candidate`,
      evidence:
        patchForm === null
          ? 'plugins-src/dsh-meta-community/cordis.patch.yml — absent'
          : `plugins-src/dsh-meta-community/cordis.patch.yml — ${String(patchForm.bytes)} B, first non-comment line decides the top-level shape; requirement at deepseek-harness/packages/boot/app-boot/src/index.ts parsePatchList`,
      collidesWith:
        patchForm !== null && patchForm.shape !== 'array'
          ? [
              {
                id: 'deepseek-harness/app-boot/parsePatchList',
                why: 'requires a top-level YAML array of loader patch entries and throws on a mapping; profile.ts:749-767 catches the throw into skippedBundles',
              },
            ]
          : [],
      originalIntent: patchForm !== null && patchForm.shape !== 'array' ? 'collide' : 'not-measured',
    }),
  )

  const controls: readonly Control[] = [
    {
      id: 'community-probe',
      label: 'Probe the 7 advertised /meta-community/api paths on the live deployment',
      kind: 'read',
      target: `GET ${LIVE_ORIGIN}/meta-community/api/<route> ×7`,
      demonstrable: instrumentOk && unmeasured === 0,
    },
    {
      id: 'community-patch-shape',
      label: 'Read the clone’s bundle-patch top-level shape',
      kind: 'read',
      target: 'plugins-src/dsh-meta-community/cordis.patch.yml (shape only)',
      demonstrable: patchForm !== null,
    },
    {
      id: 'community-relabel-write',
      label: 'POST an author-id set to /standing/relabel — the clone’s only write route',
      kind: 'write',
      target: 'POST /meta-community/api/standing/relabel',
      demonstrable: false,
    },
  ]

  const falsifiers: readonly Falsifier[] = [
    {
      claim: instrumentOk
        ? `${String(notFoundEmpty)} of ${String(COMMUNITY_PATHS.length)} advertised /meta-community/api paths return 404 with a 0-byte body at ${batch.at}, and ${String(answered)} of ${String(COMMUNITY_PATHS.length)} answer anything else`
        : `the 7 community paths cannot be characterised at ${batch.at}: the control route ${CONTROL_MOUNTED_PATH} did not answer 200, so this probe is BLIND and the count is instrument failure rather than a finding`,
      how: `re-run the same seven paths and count 404-with-0-bytes rows: node -e "const p=['/meta-community/api/members','/meta-community/api/census','/meta-community/api/fuse','/meta-community/api/standing','/meta-community/api/clauses','/meta-community/api/clauses/conformance','/meta-community/api/standing/relabel'];Promise.all(p.map(async u=>{const r=await fetch('${LIVE_ORIGIN}'+u);const b=await r.text();console.log(u,r.status,b.length)})).then(()=>{})" — then run the SAME command against ${CONTROL_MOUNTED_PATH} and confirm it prints 200 with a non-zero length. A probe that cannot reproduce a 200 has not measured the 404s, it has measured itself.`,
    },
    {
      claim: 'D-0236’s claim that all 7 routes return 404/0 B still holds at this census',
      how: `GET each of the 7 advertised paths and compare the status you get against D-0236's recorded 7 of 7 at 404/0 B, using node -e over the same 7 paths and then re-running it against /intent-map/api/map to prove the probe can still see a 200; if any row differs, this decision is STALE and supersession is the record-keeper's call rather than this window's. The window does not adopt the decision’s numbers; it measures and lets them differ. Present state: ${String(answered)} answering, ${String(notFoundEmpty)} 404-with-0-bytes, ${String(notFoundWithBody)} 404-with-a-body, ${String(unmeasured)} unmeasured.`,
    },
    {
      claim: 'a 0-byte 404 means UNMOUNTED rather than merely an unknown route',
      how: `compare with ${CONTROL_UNMOUNTED_PATH}, an unknown path on a MOUNTED plugin: it answers 404 with a non-empty JSON body (${String(unregistered?.bytes ?? 0)} B at this census). The distinction is the body, not the status, so a probe that reads only the status code cannot tell a mounted plugin from an absent one.`,
    },
    {
      claim: 'the 0-byte 404s are an absence of a MOUNT and not an absence of a BUILD',
      how: `read the clone's src/ tree and its package.json (both present), then count its rows in dsh.profile.bundles (${profileFacts === null ? 'NOT MEASURED' : String(profileFacts.communityInBundles ? 1 : 0)} of ${profileFacts === null ? 'an unmeasured denominator' : String(profileFacts.bundles.length)}). A clone that is built and not mounted is a mount gap, not a missing artifact, and the two need different fixes.`,
    },
  ]

  const population = `${String(COMMUNITY_PATHS.length)} advertised /meta-community/api paths + 1 clone row + 2 probe controls + 1 bundle-patch row = ${String(COMMUNITY_PATHS.length + 4)}. At ${batch.at}: ${String(answered)} answered, ${String(notFoundEmpty)} returned 404 with 0 bytes, ${String(unmeasured)} unmeasured.`

  return {
    items,
    census: censusOf(items.length, COMMUNITY_PATHS.length + 4, population, at),
    controls,
    falsifiers,
    unavailable: null,
    // THE CASE THIS MARKER EXISTS FOR, and it is this window. Every row here is
    // measured EXCEPT when the socket did not answer: the clone's rows come from
    // disk and stand, and only the seven route readings are absent. Calling that
    // `unavailable` would discard a real census to express a slow socket.
    stale: staleOf(
      unmeasured > 0
        ? `${String(unmeasured)} of ${String(COMMUNITY_PATHS.length)} advertised routes did not answer within ${String(PROBE_TIMEOUT_MS)} ms, so they are NOT MEASURED rather than 404. The clone row and the from-disk patch-shape row stand; the route readings are absent${instrumentOk ? '' : ', and the positive control did not answer either, so the whole batch is BLIND and no 404 may be read as a finding'}`
        : instrumentOk
          ? null
          : `the positive control ${CONTROL_MOUNTED_PATH} did not answer 200, so this batch is BLIND: the ${String(notFoundEmpty)} zero-byte 404s cannot be distinguished from a probe that could not reach a mounted route`
      ,
      at,
      PROBE_TIMEOUT_MS,
    ),
  }
}

/**
 * THE CONTAINER — `advanced` itself, built from the four children it holds.
 *
 * WHY THE ARITHMETIC LIVES HERE RATHER THAN IN THE GUI LAYER
 *
 * `surface-host` offered two shapes and expressed no preference beyond "one of us
 * owns the arithmetic". This file owns it, because the four children are this
 * file's own output: a container assembled in the GUI layer would count outcomes
 * the assembly collected, while a container assembled here counts the same builders
 * the sub-tabs call. One source of truth, and the count cannot drift from the rows.
 *
 * WHAT IT DOES *NOT* DO. It does not restate any child's `kind`. The lead's ruling
 * gives that field one owner — the assembly — and a container row that formed its
 * own opinion would be a second derivation of a field this lane does not own. So a
 * row here carries the CONTRACT's floor value and names that it is a floor, and the
 * measurement it DOES own (did the child answer, and how many rows did it carry)
 * is in `alignment` and in the child's own census numbers.
 *
 * A child that did not answer is OMITTED from `items` and keeps its place in the
 * DENOMINATOR, so the fraction is a real 3-of-4 rather than a tautology, and the
 * population string names the missing ids so an omitted row is never invisible.
 */
function advancedContainerWindow(at: string, batch: ProbeBatch, anchors: Anchors | { readonly absent: string }): ProviderWindow {
  const children: readonly { readonly id: string; readonly payload: ProviderWindow }[] = [
    { id: 'meta-agents', payload: metaAgentsWindow(at, batch, anchors) },
    { id: 'meta-loops', payload: metaLoopsWindow(at, anchors) },
    { id: 'meta-cordis', payload: metaCordisWindow(at, anchors) },
    { id: 'meta-community', payload: metaCommunityWindow(at, batch, anchors) },
  ]

  const answered = children.filter((child) => child.payload.unavailable === null)
  const missing = children.filter((child) => child.payload.unavailable !== null).map((child) => child.id)

  const items: WindowItem[] = answered.map((child) => {
    const rows = Array.isArray(child.payload.items) ? child.payload.items.length : 0
    const census = child.payload.census ?? {}
    return itemOf({
      id: `subwindow-${child.id}`,
      name: child.id,
      kind: 'plan',
      installed: true,
      where: 'installed',
      verdict: 'aligned',
      why: `this sub-window ANSWERED with ${String(rows)} row(s): census ${String(census.numerator ?? 'not reported')} of ${String(census.denominator ?? 'not reported')} over "${String(census.population ?? 'no population string reported').slice(0, 150)}". Its own census moment is ${String(census.at ?? 'unreported')}. The row's \`kind\` is the CONTRACT's floor (\`plan\`) and NOT this lane's opinion: the lead's ruling gives that field one owner, the assembly, and a container that re-derived it would be the second opinion the ruling exists to prevent.`,
      evidence: `buildWindow('${child.id}') in this same process at ${at} — unavailable === null`,
    })
  })

  const controls: readonly Control[] = [
    {
      id: 'container-fanout',
      label: 'Build all four sub-windows at one shared instant and count which answered',
      kind: 'read',
      target: 'in-process: buildWindow() for the four sub-ids',
      demonstrable: true,
    },
  ]

  const falsifiers: readonly Falsifier[] = [
    {
      claim: `the container's numerator equals the number of sub-windows that ANSWERED (${String(answered.length)} of ${String(children.length)} at ${at})`,
      how: `request /meta-market/api/gui/section?window=advanced and count the \`items\` rows whose id starts with \`subwindow-\`; then request each of the four sub-window ids directly and confirm exactly those four (minus any that reported unavailable) are present. A container that counted its children without asking them would print 4 of 4 over a broken child.`,
    },
    {
      claim: 'a sub-window that failed to answer is OMITTED from the rows but KEPT in the denominator, so the fraction falls rather than the row vanishing',
      how: `confirm census.denominator is 4 on every read and that census.population names the missing ids; then break one child (point DSH_META_PROGRAM_ROOT at a directory with no runner/) and confirm the numerator drops to 3, the population names it, and the denominator stays 4.`,
    },
    {
      claim: 'the container does not form a second opinion about any child’s `kind`',
      how: 'check every row here for the same floor `kind`, and read its `alignment.why`, which says the field is the assembly’s; then compare with the assembly’s own derived kind for the same sub-id. If a row ever reported `exists` while the assembly derived `plan` for that id, two owners would be deriving one field.',
    },
  ]

  return {
    items,
    census: censusOf(
      items.length,
      children.length,
      `the ${String(children.length)} sub-windows \`advanced\` contains; ${String(answered.length)} answered at ${at}${missing.length === 0 ? ' (none missing)' : `, and the missing id(s) are ${missing.join(', ')}`}. The denominator is the four CONTRACT sub-ids this provider builds; the numerator is the rows emitted, so an unavailable child LOWERS the fraction instead of disappearing from it.`,
      at,
    ),
    controls,
    falsifiers,
    unavailable: null,
    // PASS-THROUGH, NOT A SECOND OPINION. The container reports the first child's
    // staleness verbatim, because this file owns no probe of its own and a container
    // that invented one would be a second derivation of a child's state.
    stale: children.find((child) => child.payload.stale !== null && child.payload.stale !== undefined)?.payload.stale ?? null,
  }
}

/** ========================================================================== */
/** The entry point                                                            */
/** ========================================================================== */

/**
 * Build one window's payload.
 *
 * `windowId` is REQUIRED in practice for this provider and optional only to
 * satisfy `ProviderBuild`: four windows come from one file, so a call with no id
 * has no single answer, and answering with the first id would make a caller's
 * omission look like a successful request for `meta-agents`. An unknown id
 * therefore returns `unavailable` with the known ids named — the CONTRACT's rule
 * that an unknown window is reported, never silently emptied.
 */
export async function buildWindow(windowId?: WindowId): Promise<ProviderWindow> {
  const nowMs = Date.now()
  const at = new Date(nowMs).toISOString()

  if (windowId === undefined || !(WINDOW_IDS as readonly string[]).includes(windowId)) {
    return {
      unavailable: {
        reason:
          windowId === undefined
            ? `this provider answers four windows and was asked for none; the ids are ${WINDOW_IDS.join(', ')}`
            : `this provider answers only ${WINDOW_IDS.join(', ')} and was asked for '${windowId}'`,
        measuredAt: at,
      },
      controls: [],
      falsifiers: [
        {
          claim: 'the assembly routes each provider to the window it owns, and an unowned id is reported rather than emptied',
          how: `request /meta-market/api/gui/section?window=meta-plugins and confirm it does not answer with the advanced provider's rows; then request ?window=advanced and confirm the four sub-window ids are listed rather than answered.`,
        },
      ],
    }
  }

  const anchors = locateAnchors()

  if (windowId === 'meta-loops') return metaLoopsWindow(at, anchors)
  if (windowId === 'meta-cordis') return metaCordisWindow(at, anchors)

  const batch = await probeBatch(nowMs)
  if (windowId === 'meta-agents') return metaAgentsWindow(at, batch, anchors)
  if (windowId === 'advanced') return advancedContainerWindow(at, batch, anchors)
  return metaCommunityWindow(at, batch, anchors)
}

/**
 * Exported for a driver only: the shape tests, so they can be exercised without a
 * live deployment.
 *
 * `metaCommunityWindow` is here so a driver can hand it a SYNTHETIC BLIND BATCH —
 * eleven rows all `status: null` — and prove two things that a green run cannot:
 * that `stale` can actually be set, and that a blind probe keeps its eleven rows
 * and reports zero 404s rather than manufacturing seven of them. **A marker that
 * has never been observed firing is a caption, and the only way to know is to move
 * the value and watch the payload change.**
 */
export const __test = Object.freeze({
  locateAnchors,
  countFiles,
  countDirectories,
  patchFormOf,
  sizeOf,
  readProfile,
  probeBatch,
  metaCommunityWindow,
  staleOf,
  PROBE_TIMEOUT_MS,
})
