/**
 * L6 — MEASURING the two populations, rather than assuming them.
 *
 * EVERY NUMBER THIS MODULE PRODUCES IS TAKEN FROM A FILE OR A LIVE ROUTE AT THE MOMENT IT RUNS, and the
 * census time travels with it. Nothing here is a hardcoded list of plugins: the official set is derived
 * from the profile's own `dsh.profile.bundles`, and the stable candidate is confirmed against the same
 * profile before its manifest is read. A list in a source file would satisfy the rule on the day it was
 * written and stop matching the system every day after — the failure this program records as "a live
 * store is not a snapshot", arriving on a store's own seed data.
 *
 * THE ARITHMETIC THAT HAS TO CLOSE, and it is checked rather than asserted: `bundles = official + nonOfficial`.
 * The task brief said "the profile's 40 bundles"; the MEASURED figure at censes time was 41, and the
 * difference is exactly one row — `dsh-meta-market`, added by the `mount` lane at 14:44 the same day. A
 * count that disagrees with the brief is reported with its cause rather than quietly corrected to match.
 *
 * PATHS IN EVIDENCE ARE PREFIXED WHEN THEY LEAVE THE WORKSPACE. A program-workspace file is cited
 * workspace-relative (`research/…`); a file in the DeepSeek checkout is cited `deepseek-root:plugins-src/…`
 * so a reader can resolve it without guessing which root a bare path meant. That prefix is this lane's
 * convention and it is stated once, here.
 *
 * @module dsh-meta-market/host/stable/measure
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type { EvidencePointer } from '../../shared/protocol.ts'
import type { ArtifactCensus, BundlerCensus, FileIdentity, MemberSeed, ZoneDefinition } from './types.ts'
import { EXPECTED_ZONE_COUNT } from './scoring.ts'

/** The map route this module reads. One string, so a probe and a build cannot disagree. */
export const INTENT_MAP_ROUTE = '/intent-map/api/map'

/** The owner's live session. Read-only probes only; this module issues GETs and nothing else. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:3083'

/** A fetch that cannot hang forever. */
export const DEFAULT_TIMEOUT_MS = 8000

/** The artifact directory the alternation contract refers to. Owned by lane `patch-first`, read-only here. */
export const PATCH_ARTIFACT_REL = 'research/meta-patch-dsh-market'

/** The stable candidate's clone directory, relative to the DeepSeek checkout. */
export const STABLE_CLONE_REL = 'plugins-src/dsh-market'

/** The prefix this lane uses for citations outside the program workspace. */
export const CHECKOUT_PREFIX = 'deepseek-root:'

/** Directories a file census must never descend into: they are dependencies, not the plugin. */
const CENSUS_SKIP = new Set(['node_modules', '.git', 'tmp', '.sc'])

/** The roots this lane needs, or the reason one is missing. */
export interface CheckoutRoots {
  readonly workspaceRoot: string
  readonly profileRoot: string
  readonly deepseekRoot: string
  readonly pluginsSrc: string
  readonly harnessRoot: string
}

/** A root lookup that failed, carrying the check that failed rather than a guess. */
export type RootsOutcome =
  | { readonly ok: true; readonly roots: CheckoutRoots }
  | { readonly ok: false; readonly reason: string }

/**
 * Find the program workspace by walking up for BOTH anchors, `AGENTS.md` and `plan/`.
 *
 * The conjunction is the guard: every parent in this tree has an `AGENTS.md`, so a walk that accepted one
 * anchor would stop at whichever level it reached first. Returns `null` rather than guessing.
 */
export function resolveWorkspaceRoot(start?: string): string | null {
  let current = resolve(start ?? process.cwd())
  for (let depth = 0; depth < 32; depth += 1) {
    if (existsSync(join(current, 'AGENTS.md')) && existsSync(join(current, 'plan'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

/**
 * Derive the checkout roots from the workspace root, checking each one exists.
 *
 * The layout is fixed and is asserted rather than assumed: the workspace sits inside a profile, the
 * profile inside `profiles-tree/`, and the checkout above that. A layout change is reported as a missing
 * root, not worked around by trying paths until one answers.
 */
export function resolveCheckoutRoots(workspaceRoot?: string | null): RootsOutcome {
  const base = workspaceRoot ?? resolveWorkspaceRoot()
  if (base === null) {
    return { ok: false, reason: 'no workspace root: the walk from the current directory found no directory containing BOTH `AGENTS.md` and `plan/`' }
  }
  const profileRoot = dirname(base)
  const deepseekRoot = dirname(dirname(profileRoot))
  const pluginsSrc = join(deepseekRoot, 'plugins-src')
  const harnessRoot = join(deepseekRoot, 'deepseek-harness')
  const missing: string[] = []
  if (!existsSync(join(profileRoot, 'package.json'))) missing.push(`the profile manifest at ${join(profileRoot, 'package.json')}`)
  if (!existsSync(pluginsSrc)) missing.push(`the clone directory ${pluginsSrc}`)
  if (!existsSync(harnessRoot)) missing.push(`the harness checkout ${harnessRoot}`)
  if (missing.length > 0) {
    return { ok: false, reason: `the layout assumed from ${base} does not hold: missing ${missing.join('; ')}` }
  }
  return { ok: true, roots: { workspaceRoot: base, profileRoot, deepseekRoot, pluginsSrc, harnessRoot } }
}

/** The profile census, as read. */
export interface ProfileRead {
  readonly path: string
  readonly bundles: readonly string[]
  readonly dependencies: readonly string[]
  readonly at: string
}

/** Read the profile manifest. A read failure is a reason, never an empty profile. */
export function readProfile(profileRoot: string): { readonly ok: true; readonly profile: ProfileRead } | { readonly ok: false; readonly reason: string } {
  const path = join(profileRoot, 'package.json')
  const at = new Date().toISOString()
  if (!existsSync(path)) return { ok: false, reason: `no profile manifest at ${path}` }
  try {
    const parsed = JSON.parse(readFileSync(path, { encoding: 'utf8' })) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: unknown } }
    }
    const raw = parsed.dsh?.profile?.bundles
    if (!Array.isArray(raw)) {
      return { ok: false, reason: `${path} carries no \`dsh.profile.bundles\` array, so the official population cannot be derived` }
    }
    const bundles = raw.filter((row): row is string => typeof row === 'string')
    if (bundles.length !== raw.length) {
      return { ok: false, reason: `${path} carries ${String(raw.length - bundles.length)} non-string bundle rows of ${String(raw.length)}; a partial population would silently shrink the official set` }
    }
    return { ok: true, profile: { path, bundles, dependencies: Object.keys(parsed.dependencies ?? {}), at } }
  } catch (error) {
    return { ok: false, reason: `${path} does not parse: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** The bundles census, with the identity check that makes it arithmetic rather than three counts. */
export function censusBundles(profile: ProfileRead): BundlerCensus {
  const official = profile.bundles.filter((row) => row.startsWith('@deepseek-ai/'))
  const nonOfficial = profile.bundles.length - official.length
  return {
    bundles: profile.bundles.length,
    officialBundles: official.length,
    nonOfficialBundles: nonOfficial,
    dependencies: profile.dependencies.length,
    profilePath: profile.path,
    at: profile.at,
  }
}

/** A file census for one directory: files, directories, and the `src/` subset, all measured. */
export interface DirectoryCensus {
  readonly files: number
  readonly directories: number
  readonly srcFiles: number
  readonly bytes: number
}

/**
 * Walk a directory and count files and directories, skipping dependencies.
 *
 * `directories` does NOT include the root itself, and the skip list is printed in the evidence claim so a
 * reader knows what the denominator excluded. A directory listing would have counted entries of mixed
 * kinds; this counts kinds separately, which is why the two totals can be compared against each other.
 */
export function censusDirectory(root: string): DirectoryCensus {
  let files = 0
  let directories = 0
  let srcFiles = 0
  let bytes = 0
  const walk = (current: string, depth: number, underSrc: boolean): void => {
    if (depth > 12) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (CENSUS_SKIP.has(entry.name)) continue
        directories += 1
        walk(join(current, entry.name), depth + 1, underSrc || entry.name === 'src')
        continue
      }
      if (!entry.isFile()) continue
      files += 1
      if (underSrc) srcFiles += 1
      try {
        bytes += statSync(join(current, entry.name)).size
      } catch {
        // A file that vanished between listing and stat is not charged to the byte total.
      }
    }
  }
  walk(root, 0, false)
  return { files, directories, srcFiles, bytes }
}

/** sha256 of a file's bytes, with the algorithm named beside the value and the file's own clock. */
export function fileIdentity(path: string): FileIdentity | null {
  try {
    const bytes = readFileSync(path)
    let modifiedAt: string | null = null
    try {
      modifiedAt = statSync(path).mtime.toISOString()
    } catch {
      modifiedAt = null
    }
    return { path, bytes: bytes.byteLength, sha256Hex: createHash('sha256').update(bytes).digest('hex'), modifiedAt }
  } catch {
    return null
  }
}

/**
 * Measure which patch artifacts exist for the alternation contract.
 *
 * THE THREE STATES ARE KEPT APART, and this is the function where that matters: the directory being absent
 * (nothing has been proposed yet), the directory being present and empty (a proposal was started and did
 * not land), and the directory holding files (artifacts exist and can be named). Collapsing the first two
 * into `files: 0` is the absent-is-zero defect, so `exists` is a separate field and `reason` explains a
 * non-existence.
 */
export function censusArtifacts(workspaceRoot: string | null): ArtifactCensus {
  const at = new Date().toISOString()
  if (workspaceRoot === null) {
    return { directory: PATCH_ARTIFACT_REL, absolute: '', exists: false, files: [], reason: 'no workspace root, so the artifact directory could not be located (NOT the same as an empty directory)', at }
  }
  const absolute = join(workspaceRoot, PATCH_ARTIFACT_REL)
  if (!existsSync(absolute)) {
    return {
      directory: PATCH_ARTIFACT_REL,
      absolute,
      exists: false,
      files: [],
      reason: `\`${PATCH_ARTIFACT_REL}\` does not exist under the workspace root at ${at}; no patch artifact has been committed yet, which is an absence of a proposal and not a proposal with no content`,
      at,
    }
  }
  const files: FileIdentity[] = []
  const walk = (current: string, depth: number): void => {
    if (depth > 6) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const identity = fileIdentity(path)
      if (identity !== null) files.push({ ...identity, path })
    }
  }
  walk(absolute, 0)
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  return {
    directory: PATCH_ARTIFACT_REL,
    absolute,
    exists: true,
    files,
    reason: files.length === 0 ? `${PATCH_ARTIFACT_REL} exists but holds no files at ${at}` : null,
    at,
  }
}

/**
 * The live zone space: 24 zones with their definitions and the index identity that produced them.
 *
 * THE COUNT IS ASSERTED. A space of three zones would score every member against a vocabulary the system
 * does not have and report a clean map, so a count other than the expected 24 is refused rather than
 * used.
 */
export interface ZoneRead {
  readonly ok: true
  readonly zones: readonly ZoneDefinition[]
  readonly indexId: string
  readonly identity: { readonly model: string | null; readonly dim: number | null }
  readonly at: string
}

export type ZoneOutcome = ZoneRead | { readonly ok: false; readonly status: number; readonly reason: string; readonly at: string }

/** Read the intent map's 24 zones. `status: 0` means nothing answered — not a 404, and not an empty space. */
export async function readZones(baseUrl: string = DEFAULT_BASE_URL, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<ZoneOutcome> {
  const at = new Date().toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  type MapPayload = {
    censusAt?: string
    index?: { identity?: { model?: unknown; dim?: unknown; builtAt?: unknown } }
    zones?: readonly { id?: unknown; category?: unknown; definition?: unknown }[]
  }
  let payload: MapPayload | null = null
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${INTENT_MAP_ROUTE}`, { signal: controller.signal })
    if (!response.ok) {
      return { ok: false, status: response.status, reason: `the intent map answered HTTP ${String(response.status)}; an unread zone space cannot be scored against`, at }
    }
    payload = (await response.json()) as MapPayload
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: `the intent map could not be reached (${error instanceof Error ? error.message : 'unknown failure'}); status 0 means nothing answered, which is not an empty zone space`,
      at,
    }
  } finally {
    clearTimeout(timer)
  }
  if (payload === null) {
    return { ok: false, status: 0, reason: 'the fetch returned without a payload and without an error; that is instrument failure, not an empty space', at }
  }

  const raw = payload.zones
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, status: 200, reason: `the route answered but carried ${Array.isArray(raw) ? '0' : 'no'} zones; a corpus that reads as empty is instrument failure, not a pass`, at }
  }
  const zones: ZoneDefinition[] = []
  const skipped: string[] = []
  for (const row of raw) {
    const id = typeof row.id === 'string' ? row.id : null
    const definition = typeof row.definition === 'string' ? row.definition : null
    if (id === null || definition === null) {
      skipped.push(id ?? '<zone with no id>')
      continue
    }
    zones.push({ id, category: typeof row.category === 'string' ? row.category : 'unknown', definition })
  }
  if (zones.length !== raw.length) {
    return { ok: false, status: 200, reason: `${String(raw.length - zones.length)} of ${String(raw.length)} zones carried no id or no definition (${skipped.join(', ')}); a partial space would score every member against a vocabulary the map does not have`, at }
  }
  if (zones.length !== EXPECTED_ZONE_COUNT) {
    return { ok: false, status: 200, reason: `the route reported ${String(zones.length)} zones but this build expects ${String(EXPECTED_ZONE_COUNT)}; refused rather than scored against a different map`, at }
  }
  return {
    ok: true,
    zones,
    indexId: typeof payload.index?.identity?.builtAt === 'string' ? payload.index.identity.builtAt : (payload.censusAt ?? 'unidentified-index'),
    identity: {
      model: typeof payload.index?.identity?.model === 'string' ? payload.index.identity.model : null,
      dim: typeof payload.index?.identity?.dim === 'number' ? payload.index.identity.dim : null,
    },
    at,
  }
}

/** The description field this lane reads. All-caps because reading `description` alone yields `[object Object]` on a catalog row. */
export const INTENT_TEXT_FIELD = 'description'

/** A manifest as this lane reads it: enough to identify the plugin and state its intent. */
interface Manifest {
  readonly name?: unknown
  readonly version?: unknown
  readonly description?: unknown
  readonly repository?: unknown
}

/** Read a package.json and return the intent text, keeping a missing description a named absence. */
function readManifest(path: string): { readonly manifest: Manifest; readonly intentText: string } | null {
  try {
    const manifest = JSON.parse(readFileSync(path, { encoding: 'utf8' })) as Manifest
    const description = typeof manifest.description === 'string' ? manifest.description.trim() : ''
    return { manifest, intentText: description }
  } catch {
    return null
  }
}

/**
 * Find the manifest of one official bundle inside the harness checkout.
 *
 * SCANNED, NOT ASSUMED, and the scan is bounded to the two directories bundles live in. The name in the
 * manifest is what identifies it, so a directory rename does not break the mapping and a manifest renamed
 * is a missing member rather than a wrong one.
 */
export function findPackageManifest(harnessRoot: string, packageName: string): string | null {
  const roots = [join(harnessRoot, 'packages', 'bundle'), join(harnessRoot, 'packages', 'experimental')]
  for (const root of roots) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = join(root, entry.name, 'package.json')
      if (!existsSync(candidate)) continue
      const parsed = readManifest(candidate)
      if (parsed === null) continue
      if (parsed.manifest.name === packageName) return candidate
    }
  }
  return null
}

/**
 * Discover the stable and official members, with the evidence for each.
 *
 * THE STABLE SET IS ONE NAMED CANDIDATE AND IT IS CONFIRMED, NOT ASSUMED: the profile's `dshmarket`
 * dependency must point at `plugins-src/dsh-market` and the bundles must name it, or the member is
 * reported with `installed: null` and the reason travels in its evidence. The wider stable population is
 * the profile's 34 non-official bundles; extending to it is a task with its own denominator and is NOT
 * silently folded in here, because a member nobody measured would be stored as if it had been.
 */
export function discoverMembers(roots: CheckoutRoots, profile: ProfileRead | null): {
  readonly members: readonly MemberSeed[]
  readonly absent: readonly string[]
} {
  const members: MemberSeed[] = []
  const absent: string[] = []
  const installed = profile === null ? null : profile.bundles

  // --- the stable candidate -------------------------------------------------------------------
  const cloneDir = join(roots.deepseekRoot, STABLE_CLONE_REL)
  const stableManifestPath = join(cloneDir, 'package.json')
  const stableParsed = existsSync(stableManifestPath) ? readManifest(stableManifestPath) : null
  if (stableParsed === null) {
    absent.push(`stable:${STABLE_CLONE_REL}`)
  } else {
    const name = typeof stableParsed.manifest.name === 'string' ? stableParsed.manifest.name : null
    const version = typeof stableParsed.manifest.version === 'string' ? stableParsed.manifest.version : null
    const depSpec = profile === null ? undefined : readDependencySpec(profile.path, name ?? '')
    const bundleIndex = installed === null || name === null ? -1 : installed.indexOf(name)
    const census = censusDirectory(cloneDir)
    const evidence: EvidencePointer[] = [
      {
        source: `${CHECKOUT_PREFIX}${STABLE_CLONE_REL}/package.json`,
        verification: 'verified-ran',
        claim: `the stable candidate's manifest was read at censes time: name \`${name ?? '<absent>'}\`, version \`${version ?? '<absent>'}\``,
      },
      {
        source: `read ${CHECKOUT_PREFIX}${STABLE_CLONE_REL} (file census)`,
        verification: 'verified-ran',
        claim: `${String(census.files)} files and ${String(census.directories)} directories outside ${[...CENSUS_SKIP].join('/')}, of which ${String(census.srcFiles)} files are under src/, totalling ${String(census.bytes)} bytes`,
      },
      {
        source: `${CHECKOUT_PREFIX}profiles-tree/personal-dev/package.json`,
        verification: profile === null ? 'not-measured' : 'verified-ran',
        claim:
          profile === null
            ? 'the profile manifest could not be read, so whether this clone is installed is NOT MEASURED (not `false`)'
            : depSpec === undefined
              ? `the profile's dependencies carry NO entry whose value resolves to ${STABLE_CLONE_REL}; installed is therefore reported as false rather than assumed`
              : `the profile's dependencies map \`${name ?? '<absent>'}\` to \`${depSpec}\`, and its bundles name it at index ${String(bundleIndex)} of ${String(profile.bundles.length)}`,
      },
    ]
    members.push({
      id: `stable:${name ?? 'dsh-market'}`,
      name: name ?? 'dshmarket',
      npm: name,
      klass: 'stable',
      version,
      manifestPath: stableManifestPath,
      intentText: stableParsed.intentText,
      installed: profile === null ? null : bundleIndex >= 0,
      evidence,
    })
  }

  // --- the official set, enumerated from the profile's own bundles ----------------------------
  if (installed === null) {
    absent.push('official:* (no profile)')
  } else {
    for (const bundle of installed) {
      if (!bundle.startsWith('@deepseek-ai/')) continue
      const manifestPath = findPackageManifest(roots.harnessRoot, bundle)
      if (manifestPath === null) {
        absent.push(`official:${bundle} (no manifest under ${join(roots.harnessRoot, 'packages')})`)
        continue
      }
      const parsed = readManifest(manifestPath)
      if (parsed === null) {
        absent.push(`official:${bundle} (manifest does not parse: ${manifestPath})`)
        continue
      }
      const version = typeof parsed.manifest.version === 'string' ? parsed.manifest.version : null
      const index = installed.indexOf(bundle)
      const evidence: EvidencePointer[] = [
        {
          source: `${CHECKOUT_PREFIX}profiles-tree/personal-dev/package.json`,
          verification: 'verified-ran',
          claim: `the profile's \`dsh.profile.bundles\` names \`${bundle}\` at index ${String(index)} of ${String(installed.length)}`,
        },
        {
          source: `${CHECKOUT_PREFIX}${manifestPath.slice(roots.deepseekRoot.length + 1).replace(/\\/g, '/')}`,
          verification: 'verified-ran',
          claim: `a manifest declaring the name \`${bundle}\` was read from the harness checkout, version \`${version ?? '<absent>'}\``,
        },
      ]
      members.push({
        id: `official:${bundle.replace('@deepseek-ai/', '')}`,
        name: bundle,
        npm: bundle,
        klass: 'official',
        version,
        manifestPath,
        intentText: parsed.intentText,
        installed: true,
        evidence,
      })
    }
  }

  return { members, absent }
}

/** The dependency entry whose spec points at a clone directory. `undefined` when no entry does. */
function readDependencySpec(profilePath: string, name: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(profilePath, { encoding: 'utf8' })) as { dependencies?: Record<string, string> }
    const dependencies = parsed.dependencies ?? {}
    if (typeof dependencies[name] === 'string') return dependencies[name]
    for (const spec of Object.values(dependencies)) {
      if (typeof spec === 'string' && spec.includes('plugins-src/dsh-market')) return spec
    }
    return undefined
  } catch {
    return undefined
  }
}
