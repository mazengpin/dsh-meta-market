/**
 * The Meta-Plugins window: every plugin that is meta-aligned to intent, INSTALLED or DOWNLOADABLE.
 *
 * This is the owner's headline requirement — *"each place will show the info about 'meta aligned to intent plugins' that are installed on current system or downloadable from internet"* — so the alignment verdict is not a column bolted onto a plugin list. It is the ADMISSION RULE: an item appears because it was signed against the 24-zone intent map and decided against the three reference populations, and an item that COLLIDES appears too, because a gate that cannot show a refusal is not a gate and this window is the one place the refusal is visible.
 *
 * WHAT THIS FILE OWNS, AND WHAT IT ONLY COMPOSES
 *
 * One file: `src/host/providers/plugins.ts`. It shapes the window and owns NO measurement. Three sibling lanes own the inputs, are writing concurrently, and their logic is not reimplemented here:
 *
 *   - `../registry/` (`catalog-inventory`) — the installed inventory and the downloadable catalog, with the name-OR-`npm` discipline and its own census.
 *   - `../intent-align/` (`intent-align`) — the zone space, each candidate's signature, and the original-intent verdict with its collision list. Its `decideOriginalIntent` already compares against `stable`, `official` and `meta` reference classes, so the CONTRACT's "does it collide with a stable, official or existing meta plugin" question is answered in ONE place rather than in two that could disagree.
 *   - `../stable/` (`stable-official`) — the patch alternation contract, which is where `patch.available` must come from. It is NOT read here yet (see below), so every item's `patch` is `null` with a stated reason rather than a guess.
 *
 * WHY THE VALUE IMPORTS ARE NOT IN THIS FILE YET
 *
 * `tsconfig.json` has `include: ["src"]` and the clone is built by one `tsc` over the whole tree, so a single non-resolving module specifier in this file fails the typecheck of every other lane's file. A half-landed dependency would therefore break the build for sixteen lanes in order to make one window look complete. So `loadSources()` is the ONE seam: while a barrel is absent it returns a stated absence, `buildWindow` returns `unavailable` with a reason that names the barrel it looked for, and the swap to the real calls is an edit inside `loadSources` alone — the shaping below does not move.
 *
 * The alternative — importing the barrel and letting the clone fail to compile — is the "a plan read as an existence claim" defect in build form: the window would look built and nothing else would build.
 *
 * WHAT AN ABSENCE MUST LOOK LIKE, AND WHY IT IS NOT AN EMPTY LIST
 *
 * A window with `items: []` and `census: {0, 0}` is the defect this program has paid for repeatedly: `0` on both sides is instrument failure, never a pass, and a zero ITEM count would render as "no plugin is meta-aligned" when the truth is "nothing was signed". So the absent case carries `unavailable.reason` naming each missing barrel and its path, and carries no census at all.
 *
 * THE `null` RULE THIS WINDOW IS MOST LIKELY TO BREAK
 *
 * `installed` and `downloadable` are `boolean | null`, and `null` means NOT MEASURED. Nothing here coerces: `x || false` would turn an unprobed field into a measurement and the resulting list would read as complete. A candidate whose install state was not probed keeps `null` into the payload, and the split reports it as its own class rather than folding it into either side.
 *
 * @module dsh-meta-market/host/providers/plugins
 */

import type {
  Census,
  Collision,
  Control,
  Falsifier,
  ItemSource,
  PatchRef,
  ProviderWindow,
  WindowId,
  WindowItem,
  ZoneMatch,
} from '../types.ts'
import { getRegistry, resolveCloneRoot, resolveProfileDir, resolveProfileDirFrom } from '../registry/index.ts'
import type { Candidate, InstalledEntry, Registry } from '../registry/index.ts'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  KNOWN_COLLIDING_CANDIDATES,
  KNOWN_FALSE_NEGATIVE_CANDIDATES,
  KNOWN_PASSING_CANDIDATES,
  decideOriginalIntent,
  loadReferenceClasses,
  loadZoneSpace,
  signCandidate,
} from '../intent-align/index.ts'
import type { CandidateInput, IntentCheck, ReferenceSignature, ZoneSpace } from '../intent-align/index.ts'
import { loadLedger, patchRefFor } from '../stable/index.ts'
import type { StableLedger } from '../stable/index.ts'

/**
 * The window this provider fills.
 *
 * `as const` rather than a widened `string` because the assembly keys its registry by this value, and a local typo must be a compile error rather than a window that silently answers under the wrong id.
 */
export const WINDOW_ID = 'meta-plugins' as const

/**
 * The sibling barrels this window composes, declared as data so that the absent case names the path it looked for rather than only the lane.
 *
 * An unavailability reason that does not name its path is not actionable: a reader cannot tell whether the module is missing, misspelled, or merely not yet imported.
 */
const DEPENDENCY_BARRELS = Object.freeze({
  registry: 'src/host/registry/index.ts',
  intentAlign: 'src/host/intent-align/index.ts',
  stable: 'src/host/stable/index.ts',
})

/** A candidate plus the TEXT its intent signature is computed from, and where that text came from. */
interface PreparedCandidate {
  readonly candidate: Candidate
  /** The text handed to the intent gate. Never `[object Object]` — see `intentTextOf`. */
  readonly intentText: string
  /** Where `intentText` came from, with the row or manifest named, so a verdict is auditable. */
  readonly intentTextFrom: string
  /**
   * Set when the intent module itself records this candidate as a KNOWN FALSE NEGATIVE.
   *
   * This is the recall half of the gate's self-check, and it exists because a gate can fail in two directions. A refused control is a PRECISION failure; an admitted near-duplicate is a RECALL failure. `intent-align` keeps both lists, so this window renders both and does not let a `pass` on a known miss read as a clean admission.
   */
  readonly knownMiss: string | null
  /**
   * Set when the registry holds NO text for this identity other than its own name.
   *
   * A NAME IS NOT AN INTENT. Signing `@deepseek-ai/dsh-experimental-terminal-bundle` and `…-agent-team-profile` on their names gives two records that share the vendor's own word `experimental`, and they collide at 0.6350 — a refusal produced entirely by a shared PREFIX WORD, not by two plugins wanting the same thing. Measured, not feared: that is what the first run with the bundles included did, and it is the same family of false positive as the earlier `dsh` over-fire. So a candidate with no intent text is reported as `not-measured` with that reason rather than being signed and refused.
   */
  readonly intentTextMissing: boolean
}

/**
 * Everything this window needs from its siblings, and nothing it does not.
 *
 * One object rather than three imports so the swap from absent to present is one edit at one seam, and so a reader can see exactly which measurements this window depends on.
 */
interface MetaMarketSources {
  readonly candidates: readonly PreparedCandidate[]
  readonly decide: (prepared: PreparedCandidate) => IntentCheck
  readonly patchOf: (prepared: PreparedCandidate) => PatchRef | null
  /**
   * The population, in words, and the count.
   *
   * Carried from the lane that enumerated rather than recomputed here: a denominator whose population a different lane phrased is a count taken by nobody.
   */
  readonly population: string
  readonly populationCount: number
  /**
   * The instant this population was RESOLVED, in ISO form — the census time of the window.
   *
   * Added 2026-10-18 for the reuse memo at the bottom of this file. The rules it enforces: (i) the
   * window-level `census.at` is this instant, never the instant a later request was served, so a
   * reused population can never be presented as a fresh measurement; (ii) a reused population
   * reports `stale` with this instant as its `at`, so a renderer can branch on "this is a reuse"
   * instead of inferring it from a clock; (iii) every per-source census time below travels with the
   * data it stamps.
   */
  readonly measuredAt: string
  /**
   * The instant the 24-zone space was read (`loadZoneSpace().readAt`).
   *
   * THIS FIELD WAS GENUINELY ABSENT BEFORE THE MEMO. The zone SCORES in `intent.zones` are derived
   * from the zone space, and the space's own read time appeared nowhere in the payload — it was
   * implicit only because the space was re-read on every request. A memo without this field would
   * serve zone scores with no census time at all, which is the `D-0073` shape the previous round
   * refused to introduce.
   */
  readonly zoneSpaceAt: string
  /** The instant the reference populations were read (`loadReferenceClasses().census.at`), carried so the window census names its oldest source rather than only its newest. */
  readonly referencesAt: string
  /** What the patch column measured. Stated on every read, because `patch: null` means two very different things. */
  readonly patchNote: string
  /**
   * The ids the intent module itself declares MUST pass.
   *
   * Carried so the window can check the gate rather than only report it: `KNOWN_PASSING_CANDIDATES` exists as the negative control against over-fitting, so if one of those ids renders anything but `aligned`, the gate is refusing a candidate it was built not to refuse. That is a false refusal, and a window that showed it as one more red row without saying so would be publishing exactly the all-green/all-red inference this program warns about.
   */
  readonly expectedPassIds: readonly string[]
  /**
   * Where the program workspace root resolved from, at BOTH compiled depths.
   *
   * The two answers must exist and agree. A fixed `../` count is correct in `src/` and wrong in the emitted `lib/`, which is not hypothetical: it is the defect `catalog-inventory` measured and repaired in `../registry/paths.ts`. A suffix test alone would pass that defect, so the falsifier compares two resolved ABSOLUTE paths and requires each to exist.
   */
  readonly rootEvidence: {
    readonly sourceLayout: string | null
    readonly bundleLayout: string | null
    readonly agrees: boolean
    readonly searched: readonly string[]
  }
}

/** Why `loadSources()` returned nothing: the barrels it looked for and the moment it looked. */
interface SourcesAbsent {
  readonly reason: string
  readonly measuredAt: string
}

/**
 * The program workspace root, resolved by SHAPE through `../registry/paths.ts` rather than by counting `../`.
 *
 * WHY NOT A LITERAL, AND WHY NOT A SECOND RESOLVER. The stable/official ledger lives in the program workspace, which is NOT an ancestor of this clone, so a `../` walk from here can never reach it — and `catalog-inventory` already paid for the other half of that lesson: its fixed relative walk was correct in `src/` and one segment short in the emitted `lib/`, so a depth-based root resolves differently in the two layouts this file is compiled into. Two root resolvers would also be two answers to one question, so this composes THEIR resolver and adds only the shape that is mine to name: the program workspace is the directory under the profile that carries the program's own `AGENTS.md` and `plan/`.
 *
 * `path: null` returns the directories searched, so an unmeasured patch column stays UNKNOWN-WITH-EVIDENCE rather than becoming a guess.
 */
function programWorkspaceFrom(startDir: string): { readonly path: string | null; readonly searched: readonly string[] } {
  const suffix = 'dsh-meta-evolve_INIT_WORKSPACE'
  const searched: string[] = []
  const profile = startDir === '' ? resolveProfileDir() : resolveProfileDirFrom(startDir)
  for (const dir of profile.searched) searched.push(dir)
  if (profile.path === null) return { path: null, searched }
  const candidate = resolve(profile.path, suffix)
  searched.push(candidate)
  const shapeHolds = existsSync(join(candidate, 'AGENTS.md')) && existsSync(join(candidate, 'plan'))
  return { path: shapeHolds ? candidate : null, searched }
}

/**
 * The program workspace root as this module's own location resolves it.
 *
 * The empty-string start means "use the module-relative search", which is the same surface every other reader in this clone uses.
 */
function programWorkspaceRoot(): { readonly path: string | null; readonly searched: readonly string[] } {
  return programWorkspaceFrom('')
}

/**
 * The patch half's fallback sentence, used only when the ledger could not be read.
 *
 * `patch: null` is ambiguous on its own: it means either "a patch exists for nothing here" or "the patch half was never measured". When the ledger is present the sentence is composed from what it reported, so the second reading is the one a reader gets only when it is true.
 */
const PATCH_NOT_MEASURED =
  'the patch alternation half was NOT measured, so `patch: null` on every item means UNKNOWN rather than "no patch exists"'

/**
 * The registry's candidate for one installed dependency, or `null` when it could not be resolved.
 *
 * The `null` is COUNTED by the caller and printed as "N of M" in the population sentence, because a silently skipped dependency would shrink the denominator and make the window look complete.
 *
 * The npm-exact preference is this program's duplicate-name guard applied at the one place it bites: a catalog `name` is not a unique key (`dsh-cost-meter` exists three times), so when several candidates match the dependency key, the one whose `npm` equals the dependency's own package name is preferred rather than "the first match".
 */
function installedCandidate(registry: Registry, entry: InstalledEntry): Candidate | null {
  const byName = registry.candidatesFor({ name: entry.dependency })
  if (byName.candidates.length > 0) {
    const exactNpm = byName.candidates.find(
      (candidate) => candidate.npm !== null && entry.packageName !== null && candidate.npm === entry.packageName,
    )
    return exactNpm ?? byName.candidates[0]
  }
  if (entry.packageName !== null && entry.packageName !== entry.dependency) {
    const byNpm = registry.candidatesFor({ npm: entry.packageName })
    if (byNpm.candidates.length > 0) return byNpm.candidates[0]
  }
  return null
}

/**
 * The registry's candidate for one catalog-only plugin the intent module cites.
 *
 * The owner check is the disambiguation, not a formality: `dsh-plugin-marketplace` matches TWO catalog rows under two owners, so a lookup that returned `rows[0]` would render one real plugin's verdict under another real plugin's name. When the owner cannot single out one row, this returns `null` and the candidate is dropped and counted, rather than guessed.
 */
function citedCandidate(registry: Registry, input: CandidateInput): Candidate | null {
  const name = input.name ?? ''
  let match = name === '' ? null : registry.candidatesFor({ name })
  if ((match === null || match.rows.length === 0) && input.catalog?.npm != null) {
    match = registry.candidatesFor({ npm: input.catalog.npm })
  }
  if (match === null || match.rows.length === 0) return null
  const owner = input.catalog?.owner ?? null
  const rows = match.rows
  const chosen = owner === null ? (rows.length === 1 ? rows[0] : null) : rows.filter((row) => row.owner === owner)
  const row = Array.isArray(chosen) ? (chosen.length === 1 ? chosen[0] : null) : chosen
  if (row === null || row === undefined) return null
  return match.candidates.find((candidate) => candidate.source.row === row.index) ?? null
}

/**
 * The text a candidate's intent signature is computed from.
 *
 * `description` on a catalog row is the source's `{ en, zh }` object narrowed by the registry to its English string; a lane that concatenated the object would sign the literal `[object Object]` and get a uniformly neutral score, which is a measured trap in this corpus rather than a hypothetical one. When no description exists the fallback is the plugin NAME, and it says so — a name-only signature is weak by construction, so a low zone score is expected rather than being evidence.
 */
function intentTextFor(candidate: Candidate, registry: Registry): { intentText: string; intentTextFrom: string } {
  if (candidate.source.row !== undefined) {
    const row = registry.allDownloadable().find((item) => item.index === candidate.source.row)
    if (row !== undefined && row.description !== null && row.description.trim() !== '') {
      return { intentText: row.description, intentTextFrom: `catalog row ${row.index}, quoting its own English description` }
    }
  }
  return {
    intentText: candidate.name,
    intentTextFrom:
      'the plugin name alone: no catalog row carried a description for it, so this is a NAME-ONLY token signature and a low zone score is expected by construction rather than being evidence of non-alignment',
  }
}

/**
 * Resolve the sibling modules and prepare the candidate population.
 *
 * THIS IS THE ONE SEAM. It returns a stated absence while the barrels are missing, and it is a function rather than an inline `return null` in `buildWindow` because the absent and present cases must share one call site — a swap that also moves the caller is a swap that can move the shaping with it.
 *
 * THE REGISTRY IS READ THROUGH `getRegistry()`, NOT `openRegistry()` — and the difference is 33-43 s per request rather than a style choice. MEASURED 2026-10-18 post-restart on the live profile: `/gui/section?window=meta-plugins` took **42.8 s** (pass 1) and **32.9 s** (pass 2) while `meta-memory` answered in 0.13 s; a direct in-process timing of `measureInstalled({probeRoutes: false})` was **884 ms / 1,392 ms** against **19,988 ms / 33,214 ms** with `probeRoutes: true` (117 sequential live probes of other plugins' routes, 3-4 of them timing out at the 2,500 ms bound). `openRegistry()` re-runs that measurement on EVERY call, so every `/gui/sections`, `/gui/health` and `/gui/section?window=meta-plugins` request re-probed 117 routes on the owner's live session. `getRegistry()` is the registry module's documented memo — its own header says *"The instance is memoised, so a second call inside one process performs no second probe run"* — so the census is measured ONCE per process and each payload carries the census instant it was measured at (`registry.at`), which is the program's standing rule for a census stamp. A census that is re-measured to look fresh is not fresher; it is slower.
 */
async function loadSources(): Promise<MetaMarketSources | SourcesAbsent> {
  const measuredAt = new Date().toISOString()
  const absent = (reason: string): SourcesAbsent => ({ reason, measuredAt })

  const registry = await getRegistry()
  if (registry.installed.census === null) {
    return absent(
      `the installed half could not be measured (${DEPENDENCY_BARRELS.registry}): ${registry.installed.unavailable?.reason ?? 'no reason given'}`,
    )
  }
  if (registry.downloadable.census === null) {
    return absent(
      `the downloadable catalog could not be read (${DEPENDENCY_BARRELS.registry}): ${registry.downloadable.unavailable?.reason ?? 'no reason given'}`,
    )
  }

  const spaceOutcome = await loadZoneSpace()
  if (!spaceOutcome.ok) {
    return absent(
      `the 24-zone intent space could not be read from ${spaceOutcome.route} (status ${spaceOutcome.status ?? 'no response'}): ${spaceOutcome.reason}`,
    )
  }
  const space: ZoneSpace = spaceOutcome.space

  const referenceOutcome = await loadReferenceClasses(space)
  if (!referenceOutcome.ok) {
    return absent(
      `the stable/official/meta reference populations could not be read (${DEPENDENCY_BARRELS.intentAlign}): ${referenceOutcome.reason}`,
    )
  }
  const references: readonly ReferenceSignature[] = referenceOutcome.references

  const collected: PreparedCandidate[] = []

  const installedEntries = registry.allInstalled()
  if (installedEntries.length === 0) {
    // A readable manifest with ZERO dependencies is instrument failure, not a measurement: this profile links ~36 plugins, so an empty read means the read was of a half-written file. Publishing "0 of 0 dependencies" would put a denominator nobody can close into the census, which is the exact shape AGENTS.md calls a failure of the instrument rather than a pass.
    return absent(
      `the installed half answered with 0 dependencies, which is instrument failure rather than a measurement (the profile manifest at ${registry.installed.census.profileManifest} was read at ${registry.installed.census.at}); a concurrent lane editing that manifest produces this, and the window reports an absence rather than a census whose denominator is 0`,
    )
  }
  let installedResolved = 0
  for (const entry of installedEntries) {
    const candidate = installedCandidate(registry, entry)
    if (candidate === null) continue
    installedResolved += 1
    const text = intentTextFor(candidate, registry)
    collected.push({
      candidate,
      intentText: text.intentText,
      intentTextFrom: text.intentTextFrom,
      knownMiss: null,
      intentTextMissing: false,
    })
  }

  /**
   * THE BUNDLES THE PROFILE LOADS THAT ARE NOT ITS DEPENDENCIES.
   *
   * `registry.allInstalled()` walks `dependencies`; `dsh.profile.bundles` is a SECOND declaration of what this harness loads, and the two do not cover the same identities. Measured on this profile: 41 bundles of which the 7 `@deepseek-ai/*` official packages appear in NO dependency entry — so a window built only from `dependencies` omits seven things the harness actually loads, and the owner's requirement is what is installed on the current system, not only what is linked from `plugins-src/`.
   *
   * `installed: true` for these is a MEASUREMENT and not a default: `bundles` is the profile's own declaration of what to load at boot, read by the registry. `downloadable` is `true` only when a catalog row was actually found, and `false` only because the 5,785-row catalog DID load and did not contain it — never because the lookup was skipped.
   */
  const bundleCensus = registry.installed.census.bundles
  const covered = new Set<string>()
  for (const entry of installedEntries) {
    covered.add(entry.dependency)
    if (entry.packageName !== null) covered.add(entry.packageName)
  }
  let bundleOnlyResolved = 0
  for (const bundle of bundleCensus) {
    if (covered.has(bundle)) continue
    covered.add(bundle)
    bundleOnlyResolved += 1
    const match = registry.candidatesFor({ name: bundle })
    // A name that matched several rows identifies a SET, so no single row is adopted; the ambiguity is carried instead of resolved silently.
    const row = match.rows.length === 1 ? match.rows[0] : undefined
    const candidate: Candidate = {
      id: bundle,
      name: row?.name ?? bundle,
      npm: row?.npm ?? (bundle.startsWith('@') ? bundle : null),
      owner: row?.owner ?? null,
      kind: 'exists',
      installed: true,
      downloadable: row !== undefined,
      source:
        row === undefined
          ? {
              where: 'installed',
              rowCount: match.rows.length,
              disambiguation: [`bundle-listed in dsh.profile.bundles; ${match.rows.length} catalog row(s) matched by name`],
            }
          : {
              where: 'both',
              row: row.index,
              rowCount: match.rows.length,
              disambiguation: match.rows.map(
                (item) => `row ${item.index} · ${item.name} · npm:${item.npm ?? 'absent'} · owner:${item.owner ?? 'absent'}`,
              ),
            },
    }
    collected.push({
      candidate,
      intentText: bundle,
      intentTextFrom:
        'the bundle name in dsh.profile.bundles, which is the only text the registry holds for it: a NAME-ONLY token signature, so a low zone score is expected by construction rather than being evidence of non-alignment',
      knownMiss: null,
      intentTextMissing: row === undefined,
    })
  }

  const cited = [...KNOWN_COLLIDING_CANDIDATES, ...KNOWN_PASSING_CANDIDATES, ...KNOWN_FALSE_NEGATIVE_CANDIDATES]
  let citedResolved = 0
  // Captured by catalog ROW and resolved to an item id only after disambiguation, so a control cannot lose its label to an id rewrite.
  const expectedPassRows = new Set<number>()
  for (const input of cited) {
    const candidate = citedCandidate(registry, input)
    if (candidate === null) continue
    citedResolved += 1
    if (KNOWN_PASSING_CANDIDATES.some((passing) => passing.id === input.id) && candidate.source.row !== undefined) {
      expectedPassRows.add(candidate.source.row)
    }
    collected.push({
      candidate,
      intentText: input.intentText,
      intentTextFrom: `the intent module's cited candidate for catalog row ${candidate.source.row ?? 'unknown'}, quoting that row's own English description`,
      knownMiss: KNOWN_FALSE_NEGATIVE_CANDIDATES.some((miss) => miss.id === input.id)
        ? `its best reference score sits BELOW the collision bar, so the gate admits it. An admit here is a RECALL failure the gate reports about itself, not evidence that the plugin is aligned.`
        : null,
      intentTextMissing: false,
    })
  }

  /**
   * DISAMBIGUATE THE ITEM IDS, because the registry's `Candidate.id` is `npm ?? name` and a name is not a unique key here.
   *
   * Measured, not hypothetical: `dsh-plugin-marketplace` matches TWO catalog rows under two owners, and one of them carries `npm: null`, so BOTH rows arrive with the id `dsh-plugin-marketplace`. De-duplicating on that id silently drops one real plugin — the exact "take the first match" defect this program has recorded, arriving in the provider rather than in the lookup. So an id shared by more than one candidate is qualified with its owner, and only a candidate whose id AND owner both repeat is a genuine duplicate.
   */
  const idCounts = new Map<string, number>()
  for (const entry of collected) idCounts.set(entry.candidate.id, (idCounts.get(entry.candidate.id) ?? 0) + 1)
  const prepared: PreparedCandidate[] = []
  const seen = new Set<string>()
  for (const entry of collected) {
    const shared = (idCounts.get(entry.candidate.id) ?? 0) > 1
    const id = shared ? `${entry.candidate.id}@${entry.candidate.owner ?? 'unknown-owner'}` : entry.candidate.id
    if (seen.has(id)) continue
    seen.add(id)
    prepared.push(shared ? { ...entry, candidate: { ...entry.candidate, id } } : entry)
  }
  const expectedPassIds = prepared
    .filter((entry) => entry.candidate.source.row !== undefined && expectedPassRows.has(entry.candidate.source.row))
    .map((entry) => entry.candidate.id)

  const checks = new Map<string, IntentCheck>()
  for (const candidate of prepared) {
    if (candidate.intentTextMissing) {
      // NOT SIGNED, and the difference matters: a name-only signature is a number, but it is a number about a NAME. Reporting the absence keeps "we could not measure this intent" distinguishable from "this intent passed".
      checks.set(candidate.candidate.id, {
        id: candidate.candidate.id,
        originalIntent: 'not-measured',
        reason:
          'the registry holds no text for this identity other than its own name, and a name is not an intent: signing it would let two vendor-prefixed names collide on a shared prefix word',
        zones: [],
        collidesWith: [],
        method: 'token',
        measuredAt: new Date().toISOString(),
        census: {
          compared: 0,
          of: references.length,
          population: `${references.length} reference signatures were available, but this candidate could not be signed`,
          at: referenceOutcome.census.at,
        },
      })
      continue
    }
    const signature = await signCandidate(
      { id: candidate.candidate.id, name: candidate.candidate.name, intentText: candidate.intentText },
      { space },
    )
    checks.set(candidate.candidate.id, decideOriginalIntent(signature, references))
  }

  const decide = (entry: PreparedCandidate): IntentCheck => {
    const check = checks.get(entry.candidate.id)
    if (check !== undefined) return check
    // Unreachable from this function, and still answered rather than asserted: a missing check is a NOT-MEASURED verdict, never a pass.
    return {
      id: entry.candidate.id,
      originalIntent: 'not-measured',
      reason: 'no intent decision was recorded for this candidate',
      zones: [],
      collidesWith: [],
      method: 'token',
      measuredAt: new Date().toISOString(),
      census: {
        compared: 0,
        of: references.length,
        population: `${references.length} reference signatures loaded by the intent module (${referenceOutcome.census.stable.count} stable, ${referenceOutcome.census.official.count} official, ${referenceOutcome.census.meta.count} meta)`,
        at: referenceOutcome.census.at,
      },
    }
  }

  const catalogRows = registry.downloadable.census.identity.rows
  const population =
    `${prepared.length} plugin candidates: the ${installedResolved} of ${installedEntries.length} dependencies declared by the live personal-dev profile manifest that the registry could resolve (read in both halves by ../registry/ at ${registry.installed.census.at}), ` +
    `plus the ${bundleOnlyResolved} identities the profile declares it LOADS as \`dsh.profile.bundles\` without listing them as dependencies (the \`@deepseek-ai/*\` official packages are among these), ` +
    `plus the ${citedResolved} of ${cited.length} catalog-only plugins that the intent module cites together with their own catalog description ` +
    `(${KNOWN_COLLIDING_CANDIDATES.length} it records as colliding, ${KNOWN_PASSING_CANDIDATES.length} kept as the negative control that must pass, and ${KNOWN_FALSE_NEGATIVE_CANDIDATES.length} it records as a KNOWN FALSE NEGATIVE which the gate admits). ` +
    `The ${catalogRows}-row downloadable catalog was NOT signed for this window, so a row that is not listed here was not measured — which is not the same as measured and rejected. ` +
    `The reference populations the gate compared against are ${referenceOutcome.census.stable.count} stable, ${referenceOutcome.census.official.count} official and ${referenceOutcome.census.meta.count} meta.`

  // The workspace root is resolved by SHAPE, and from TWO start directories: this module's own location, and the bundle depth `<clone>/lib` at which the sibling lane's fixed `../` walk was measured to be one segment short. A source-layout answer that disagrees with the bundle-layout answer is the defect, so both are computed on every read.
  const workspace = programWorkspaceRoot()
  const cloneRoot = resolveCloneRoot()
  const bundleDepth = cloneRoot === null ? null : programWorkspaceFrom(join(cloneRoot, 'lib'))
  const rootAgrees = bundleDepth !== null && workspace.path !== null && bundleDepth.path === workspace.path

  const ledgerOutcome = await loadLedger(workspace.path === null ? {} : { root: workspace.path })
  const ledger: StableLedger | null = ledgerOutcome.ok ? ledgerOutcome.ledger : null
  // `from` is captured here rather than read after a null-check, because `ledgerOutcome` is a discriminated union and a template literal inside the branch does not narrow it.
  const ledgerFrom = ledgerOutcome.ok ? ledgerOutcome.from : null
  const ledgerPath = ledgerOutcome.ok ? ledgerOutcome.path : null
  const patchNote =
    workspace.path === null
      ? `${PATCH_NOT_MEASURED}: the program workspace root could not be resolved by shape; searched ${workspace.searched.length} path(s): ${workspace.searched.join(', ') || '(none)'}`
      : ledger === null
        ? `${PATCH_NOT_MEASURED}: the workspace root resolved to ${workspace.path} but ${ledgerOutcome.ok ? 'no ledger was returned' : ledgerOutcome.reason}`
        : `the patch alternation half was measured from the stable/official ledger at ${workspace.path} (${ledgerFrom === 'file' ? `read from ${ledgerPath}` : 'measured while this population was resolved'}) at ${measuredAt}`

  return {
    candidates: prepared,
    decide,
    patchOf: (entry: PreparedCandidate): PatchRef | null =>
      ledger === null ? null : patchRefFor(ledger, entry.candidate.id),
    population,
    populationCount: prepared.length,
    measuredAt,
    zoneSpaceAt: spaceOutcome.readAt,
    referencesAt: referenceOutcome.census.at,
    patchNote,
    expectedPassIds,
    rootEvidence: {
      sourceLayout: workspace.path,
      bundleLayout: bundleDepth === null ? null : bundleDepth.path,
      agrees: rootAgrees,
      searched: workspace.searched,
    },
  }
}

/** Narrow an absent-sources value from a resolved one without asserting. */
function isAbsent(value: MetaMarketSources | SourcesAbsent): value is SourcesAbsent {
  return 'reason' in value
}

/**
 * The measured zones, in the CONTRACT's `ZoneMatch` shape.
 *
 * THE `null` SCORES ARE DROPPED HERE AND THE DROP IS COUNTED, not silently lost. `../intent-align/` scores a zone as `number | null`, with `null` meaning that zone could not be scored; the CONTRACT's `ZoneMatch.score` is a plain `number`. So an unscored zone cannot be carried, and a window that quietly showed fewer zones than the space holds would look like a space with fewer zones. The count travels in the alignment `why` instead.
 */
function measuredZones(check: IntentCheck): { readonly zones: readonly ZoneMatch[]; readonly dropped: number } {
  const zones: ZoneMatch[] = []
  let dropped = 0
  for (const zone of check.zones) {
    if (zone.score === null) {
      dropped += 1
      continue
    }
    zones.push({ zone: zone.zone, score: zone.score, method: zone.method })
  }
  return { zones, dropped }
}

/** The collision list, reduced to the CONTRACT's `{ id, why }` — the remainder is the intent lane's evidence and stays there. */
function collisionsOf(check: IntentCheck): readonly Collision[] {
  return check.collidesWith.map((collision) => ({ id: collision.id, why: collision.why }))
}

/**
 * The alignment verdict, DERIVED from the intent check rather than restated beside it.
 *
 * WHY DERIVED: `intent.originalIntent` and `alignment.verdict` are two encodings of one decision, and two encodings of one fact that are set independently can disagree. This program has recorded that failure shape before, so one is computed from the other and the payload always shows both.
 *
 * THE GUARD ON `collide` IS THE LOAD-BEARING BRANCH. A collision with no named counterpart cannot be falsified by a reader, so it is downgraded to `not-measured` with the reason stated: an unfalsifiable refusal is worse than a declared gap.
 */
function alignFrom(check: IntentCheck, dropped: number): WindowItem['alignment'] {
  const zoneNote =
    dropped === 0
      ? ''
      : ` (${dropped} of ${check.zones.length} zones were unscored and are not carried, because the CONTRACT's zone score is a number)`
  const evidence =
    `intent-align:${check.id} / ${check.method} / compared ${check.census.compared} of ${check.census.of} references` +
    ` (${check.census.population}) at ${check.census.at}`
  if (check.originalIntent === 'collide') {
    if (check.collidesWith.length === 0) {
      return {
        verdict: 'not-measured',
        why: `the intent module reported a collision but named nothing it collides with, and a collision with no named counterpart cannot be falsified${zoneNote}`,
        evidence,
      }
    }
    const first = check.collidesWith[0]
    return {
      verdict: 'collides',
      why: `${first.why} — ${check.collidesWith.length} named collision(s) in total${zoneNote}`,
      evidence,
    }
  }
  if (check.originalIntent === 'not-measured') {
    return {
      verdict: 'not-measured',
      why: `${check.reason ?? 'the intent module returned not-measured without a reason'}${zoneNote}`,
      evidence,
    }
  }
  return { verdict: 'aligned', why: `passes the original-intent gate${zoneNote}`, evidence }
}

/**
 * `ItemSource.where` for a registry candidate.
 *
 * THE REGISTRY HAS THREE HALF-VALUES AND THE CONTRACT HAS THREE PLACE-VALUES, and they are not the same three. The registry answers `installed` / `downloadable` / `both`; the CONTRACT asks `installed` / `catalog` / `community`. So `downloadable` maps to `catalog`, and `both` maps to `installed` — because the more specific fact, that this plugin is on THIS system, is the one a reader acts on, while the catalog side is not lost: `downloadable` stays `true` on the item. The mapping is here rather than in the registry because it is this window's vocabulary that has fewer words.
 */
function whereOf(candidate: Candidate): ItemSource {
  const where = candidate.source.where
  const mapped: ItemSource['where'] = where === 'downloadable' ? 'catalog' : 'installed'
  const source: ItemSource = {
    where: mapped,
    ...(candidate.source.route === undefined ? {} : { route: candidate.source.route }),
    ...(candidate.source.row === undefined ? {} : { row: candidate.source.row }),
  }
  return source
}

/**
 * One candidate as one row. Pure: every input is passed in, so a driver can exercise the shaping without a live host.
 *
 * `zoneSpaceAt` is threaded in (2026-10-18) because `intent.zones` carries zone SCORES and the zone space's read
 * time was otherwise nowhere in the payload; a reused population must state when its zone scores were measured,
 * not leave a reader to assume the request's clock.
 */
function itemFrom(prepared: PreparedCandidate, check: IntentCheck, patch: PatchRef | null, zoneSpaceAt: string): WindowItem {
  const { zones, dropped } = measuredZones(check)
  const base = alignFrom(check, dropped)
  return {
    id: prepared.candidate.id,
    name: prepared.candidate.name,
    npm: prepared.candidate.npm,
    owner: prepared.candidate.owner,
    kind: prepared.candidate.kind,
    installed: prepared.candidate.installed,
    downloadable: prepared.candidate.downloadable,
    source: whereOf(prepared.candidate),
    intent: {
      zones,
      originalIntent: check.originalIntent,
      collidesWith: collisionsOf(check),
    },
    // The intent TEXT's provenance travels with the verdict: a name-only signature and a description signature are not the same measurement, and a reader comparing two items needs to know which one they are looking at.
    alignment: {
      ...base,
      // A known false negative keeps the gate's own verdict — overriding it here would be this window deciding instead of reporting — but the label goes FIRST in `why`, so the row cannot be read as a clean admit.
      why: prepared.knownMiss === null ? base.why : `KNOWN FALSE NEGATIVE — ${prepared.knownMiss} The gate's own verdict follows: ${base.why}`,
      evidence: `${base.evidence} · zone space read at ${zoneSpaceAt} · intent text from: ${prepared.intentTextFrom}`,
    },
    patch,
  }
}

/**
 * The census, and the population sentence is the ENUMERATING LANE's rather than this file's.
 *
 * A denominator whose population a different lane phrased is a count taken by nobody, so the sentence and the count are both passed through unchanged.
 */
function censusOf(items: readonly WindowItem[], sources: MetaMarketSources, at: string): Census {
  return {
    numerator: items.length,
    denominator: sources.populationCount,
    population: sources.population,
    at,
  }
}

/**
 * The installed/downloadable split, with a NOT-MEASURED class so it CLOSES.
 *
 * `installed + downloadable + notMeasured` must equal the item count. A split that does not close has dropped a row into a branch, and a reader can check the arithmetic without trusting the author.
 */
interface Split {
  readonly installed: number
  readonly downloadable: number
  readonly notMeasured: number
}

function splitOf(items: readonly WindowItem[]): Split {
  let installed = 0
  let downloadable = 0
  let notMeasured = 0
  for (const item of items) {
    if (item.installed === true) {
      installed += 1
    } else if (item.downloadable === true) {
      downloadable += 1
    } else {
      // Neither half was measured true: `false` on both, or `null` on either, lands here rather than being coerced.
      notMeasured += 1
    }
  }
  return { installed, downloadable, notMeasured }
}

/** The verdict census — the number that decides whether this window is a check or an all-green list. */
interface VerdictCensus {
  readonly aligned: number
  readonly collides: number
  readonly notMeasured: number
}

function verdictsOf(items: readonly WindowItem[]): VerdictCensus {
  let aligned = 0
  let collides = 0
  let notMeasured = 0
  for (const item of items) {
    if (item.alignment.verdict === 'aligned') {
      aligned += 1
    } else if (item.alignment.verdict === 'collides') {
      collides += 1
    } else {
      notMeasured += 1
    }
  }
  return { aligned, collides, notMeasured }
}

/**
 * The controls this window offers.
 *
 * ALL ARE `kind: 'read'`, and that is the honest answer rather than a limitation being hidden. This provider measures and shapes; the CONTRACT is explicit that a control which only reads a value back is not a control, and advertising a `write` control this module does not own would be exactly the defect that rule exists to prevent. The absent write surface is stated in the falsifiers rather than dressed as a button.
 */
const CONTROLS: readonly Control[] = Object.freeze([
  {
    id: 'meta-plugins-refresh',
    label: 'Re-measure this window: installed inventory, catalog, and a fresh intent decision per candidate',
    kind: 'read',
    target: '/meta-market/api/gui/section?window=meta-plugins',
    demonstrable: true,
  },
  {
    id: 'meta-plugins-collisions-only',
    label: 'Show only the items whose original intent collides, with the plugin each collides with',
    kind: 'read',
    target: '/meta-market/api/gui/section?window=meta-plugins#alignment=collides',
    demonstrable: true,
  },
])

/**
 * The falsifiers, each a check a reader can run without the author's help.
 *
 * The first is the one that matters: this window exists so a failing alignment is VISIBLE. A collision count of 0 over a non-zero population is not a clean result — it is a statement that the gate has not yet been shown able to refuse.
 */
function falsifiersFor(
  items: readonly WindowItem[],
  verdicts: VerdictCensus,
  split: Split,
  patchNote: string,
): readonly Falsifier[] {
  const unmeasuredInstalls = items.filter((item) => item.installed === null).length
  const patched = items.filter((item) => item.patch !== null).length
  return [
    {
      claim: 'the original-intent gate is a check: at least one real item is shown as colliding, naming the plugin it collides with',
      how: `count items whose alignment.verdict === 'collides' (measured: ${verdicts.collides} of ${items.length}); if that is 0 while the population is not 0, this window is an all-green list and the gate has NOT been shown able to refuse — report that rather than the clean read.`,
    },
    {
      claim: 'the installed/downloadable split accounts for every row and no item was dropped by a classification',
      how: `installed ${split.installed} + downloadable ${split.downloadable} + not-measured ${split.notMeasured} must equal ${items.length}; a split that does not close has lost a row to a branch.`,
    },
    {
      claim: '`installed: null` is published as NOT MEASURED and is never read as `false`',
      how: `count items with installed === null (${unmeasuredInstalls} of ${items.length}) and confirm none of them carries installed === false — a false there would assert a probe nobody ran, and any "|| false" coercion anywhere in this file would produce exactly that.`,
    },
    {
      claim: 'no item carries a collision list a reader cannot falsify',
      how: `for every item with alignment.verdict === 'collides', confirm collidesWith is non-empty and each id resolves to a row in the stable/official store, the catalog, or the installed inventory; an id resolving to nothing is an unfalsifiable refusal.`,
    },
    {
      claim: 'the patch column was measured rather than omitted',
      how: `${patched} of ${items.length} items carry an available patch artifact${patched === 0 ? '' : ` (${items.filter((item) => item.patch !== null).map((item) => `${item.id} → ${item.patch?.artifact ?? ''}`).join(', ')})`}; the other ${items.length - patched} are UNKNOWN rather than "no patch exists". ${patchNote}`,
    },
  ]
}

/**
 * Compose the window from resolved sources.
 *
 * Separate from `buildWindow` so the shaping is exercisable by a driver with fixture sources: the only way to prove this file CAN emit a `collides` row before a live catalog answers, and the only way to prove the split and the census can disagree with a bad input.
 *
 * `reused` is the memo's honesty switch (2026-10-18): a fresh population reports `stale: null` (every
 * instrument was read for this request); a REUSED population reports `stale` with the resolution instant
 * as its `at`, its TTL as `boundMs`, and a reason naming all three source census times. The window
 * census's `at` is the POPULATION's measurement instant in both cases — never the request's clock — so a
 * reuse cannot be mistaken for a fresh read even by a reader who ignores `stale`.
 */
function composeWindow(sources: MetaMarketSources, reused: boolean): ProviderWindow {
  const items = sources.candidates.map((prepared) =>
    itemFrom(prepared, sources.decide(prepared), sources.patchOf(prepared), sources.zoneSpaceAt),
  )
  const split = splitOf(items)
  const verdicts = verdictsOf(items)
  const refusedControls = items.filter(
    (item) => sources.expectedPassIds.includes(item.id) && item.alignment.verdict !== 'aligned',
  )
  // The recall half: a row the gate admits that its own module records as a miss. Counted from the label the item carries rather than from a second list, so the count and the rows cannot disagree.
  const knownMissRows = items.filter((item) => item.alignment.why.startsWith('KNOWN FALSE NEGATIVE'))
  return {
    items,
    census: censusOf(items, sources, sources.measuredAt),
    controls: CONTROLS,
    falsifiers: [
      ...falsifiersFor(items, verdicts, split, sources.patchNote),
      {
        claim: 'the gate does not refuse a candidate it was built not to refuse',
        how:
          `${refusedControls.length} of ${sources.expectedPassIds.length} candidates the intent module declares MUST pass are refused: ` +
          (refusedControls.length === 0
            ? 'none. This is the over-fitting control, and it currently holds.'
            : `${refusedControls.map((item) => `${item.id} (${item.alignment.why})`).join('; ')}. A refused negative control means the bar is set below scores that carry no shared purpose, so the collision count is not a discrimination until that is resolved.`),
      },
      {
        claim: 'the gate reports its own misses: a row it is known to admit is shown as a known miss rather than as an alignment it made',
        how:
          `${knownMissRows.length} of ${items.length} items carry a KNOWN FALSE NEGATIVE label (${knownMissRows.map((item) => item.id).join(', ') || 'none'}). ` +
          'The other direction of failure is a refused control; this one is an admitted near-duplicate. A window that showed neither would report precision and recall as though one number covered both. ' +
          'The inversion that makes this row unfixable by tuning — the admitted duplicate scoring BELOW the must-pass control, so no single bar admits one and refuses the other — is `D-0245`, recorded by the lane that measured it. It is cited rather than copied here: a literal score in this file would go stale on the next threshold edit, and a stale literal inside a FALSIFIER is worse than none, because a falsifier exists to be checkable.',
      },
      {
        claim: 'the root the patch ledger is read from resolves identically in the source tree and at the emitted bundle depth',
        how:
          `${sources.rootEvidence.agrees ? 'AGREE' : 'DISAGREE'} — source layout: ${sources.rootEvidence.sourceLayout ?? 'null'}; bundle depth (<clone>/lib): ${sources.rootEvidence.bundleLayout ?? 'null'}; directories searched: ${sources.rootEvidence.searched.length}. ` +
          'Both must be non-null, must exist, and must be EQUAL: a fixed "../" count is correct in `src/` and one segment short in `lib/`, and a suffix-only comparison passes that defect, which is why this compares two absolute paths rather than their endings.',
      },
    ],
    unavailable: null,
    stale: reused
      ? {
          reason:
            `the meta-plugins population is a REUSED measurement, not a fresh one: resolved at ${sources.measuredAt}, ` +
            `zone space read at ${sources.zoneSpaceAt}, reference populations read at ${sources.referencesAt}. ` +
            `It is served for at most ${String(SOURCES_TTL_MS)} ms after resolution, so a read inside that window is not a second measurement.`,
          boundMs: SOURCES_TTL_MS,
          at: sources.measuredAt,
        }
      : null,
  }
}

/**
 * How long a resolved population is reused before it is measured again.
 *
 * MEASURED BASIS, 2026-10-18: resolving this population costs `loadReferenceClasses` **7,346-10,429 ms**
 * (the profile manifest, every clone's `package.json`, the 7.19 MB live catalog and the harness package
 * index) plus ~8 s of per-candidate signing plus `loadZoneSpace` 1,148-2,282 ms, and the whole window
 * measured **19,808-20,832 ms** warm; `/gui/sections` therefore ran 8.2-32.8 s after the registry fix and
 * hit **59,246 ms** once on the new boot (census `01:04:47Z`-`01:06:30Z`). The population changes only when
 * a plugin is installed, removed or re-described, which no GUI click does, so a minute of reuse is the
 * same trade the advanced provider already makes for its 11-route probe batch (15 s) — but here it is
 * LARGER because the work is larger, and it is REPORTED through `stale` rather than hidden.
 */
const SOURCES_TTL_MS = 60_000

/**
 * The last resolved population, and when it was computed.
 *
 * WHY THIS IS SOUND AND NOT A FRESHNESS SHORTCUT. Every input is process-stable or already memoised:
 * the registry instance is `getRegistry()`'s process memo, the zone space and the reference populations
 * are files and one local HTTP read, and the signing is deterministic in `(candidates, space, references)`.
 * So a second resolution inside the TTL would be the SAME measurement made again, at full cost. What a
 * cache must never do is present that measurement under a later clock: `composeWindow` therefore stamps
 * the window census with `sources.measuredAt`, reports `stale` with that instant and this TTL, and every
 * per-source census time travels in the payload. An ABSENCE is never cached, so a transient zone-space
 * timeout is retried on the next request rather than frozen for the TTL.
 */
let sourcesCache: { readonly computedAtMs: number; readonly sources: MetaMarketSources } | null = null

/** Clear the reuse memo. Exported for a driver that must measure the population from scratch. */
export function resetSources(): void {
  sourcesCache = null
}

/**
 * Fill the Meta-Plugins window.
 *
 * `windowId` is accepted for the assembly's `ProviderBuild` signature and never used to switch behaviour: this module answers for exactly one window, and a second id reaching it is the assembly's error rather than a case to handle quietly. It is typed and checked rather than dropped, so a caller asking the wrong provider cannot do so silently.
 */
export async function buildWindow(windowId?: WindowId): Promise<ProviderWindow> {
  const at = new Date().toISOString()
  if (windowId !== undefined && windowId !== WINDOW_ID) {
    return {
      unavailable: {
        reason: `this provider answers only for window '${WINDOW_ID}' and was asked for '${windowId}'`,
        measuredAt: at,
      },
      controls: [],
      falsifiers: [
        {
          claim: 'the assembly routes each provider to the window it owns',
          how: 'request each of the ten window ids and confirm every window answers under its own id; a provider answering for another window makes a label true of the wrong payload.',
        },
      ],
    }
  }
  const nowMs = Date.now()
  if (sourcesCache !== null && nowMs - sourcesCache.computedAtMs < SOURCES_TTL_MS) {
    // A REUSE, and it says so in `stale` and in the census instant. The population is not re-measured.
    return composeWindow(sourcesCache.sources, true)
  }
  const sources = await loadSources()
  if (isAbsent(sources)) {
    // The absence is NOT cached: a zone-space timeout must be retried, not frozen for the TTL.
    return {
      unavailable: { reason: sources.reason, measuredAt: sources.measuredAt },
      controls: [],
      falsifiers: [
        {
          claim: 'this window reports an absence rather than an empty success when its sources are missing',
          how: `request /meta-market/api/gui/section?window=${WINDOW_ID} and confirm the body carries unavailability naming the missing barrels, and that census is ABSENT rather than {"numerator":0,"denominator":0} — a zero on both sides is instrument failure, not a pass.`,
        },
      ],
    }
  }
  sourcesCache = { computedAtMs: Date.now(), sources }
  return composeWindow(sources, false)
}

/** Exported for a driver only: the shaping seam, so a fixture can prove this file can emit `collides` and can go red. */
export const __test = Object.freeze({ itemFrom, alignFrom, whereOf, measuredZones, splitOf, verdictsOf, composeWindow, SOURCES_TTL_MS })
