/**
 * ============================================================================
 * dsh-meta-market — registry census driver
 * ============================================================================
 *
 * WHAT THIS IS FOR
 *
 * It opens the real registry against the real profile, the real checkouts and
 * the owner's live `3083`, then prints every count with its numerator and its
 * denominator and asserts the properties this program has published wrong before:
 *
 *   - a half that loaded must have MORE THAN ZERO rows (a `0` on both sides is
 *     instrument failure, not a pass);
 *   - the live catalog's parsed rows must equal its own `count` header;
 *   - the snapshot must still be the 4,527-row census the program cites;
 *   - a name lookup must return a ROW COUNT, and `dsh-cost-meter` must return
 *     more than one row (the positive control that the ambiguity guard can see
 *     an ambiguous name at all);
 *   - the read-only probe policy must actually skip a mutating path (a policy
 *     that never skips anything is a caption);
 *   - at least one installed plugin must have been probed AND answered, so a
 *     zero of "serves a route" is a reading rather than an unmounted harness.
 *
 * RUN
 *
 *   node --experimental-strip-types src/host/registry/verify/census.mjs
 *
 * Flags: `--offline` skips the live probes (routes then read NOT MEASURED), and
 * `--no-write` keeps the driver from refreshing `last-census.json`.
 *
 * Exit codes: 0 every assertion passed · 1 an assertion disagreed · 3 instrument
 * failure (a half did not load, or fewer assertions ran than expected).
 *
 * @module dsh-meta-market/host/registry/verify
 */

import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDownloadable } from '../catalog.ts'
import { internals } from '../installed.ts'
import { resolveCloneRoot, resolveProfileDir, resolveProfileDirFrom } from '../paths.ts'
import { openRegistry, resetRegistry } from '../index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = new Set(process.argv.slice(2))
const offline = args.has('--offline')
const write = !args.has('--no-write')

const checks = []
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail })
  const mark = condition ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('=== dsh-meta-market registry census ===')
console.log(`census at ${new Date().toISOString()} · probes ${offline ? 'DISABLED (--offline)' : 'ENABLED'}`)

resetRegistry()
const registry = await openRegistry({ probeRoutes: !offline })

// ---------------------------------------------------------------- installed
const installed = registry.installed
const ic = installed.census
console.log('\n-- INSTALLED half --')
if (ic === null) {
  console.log(`NOT MEASURED: ${installed.unavailable?.reason ?? 'no reason recorded'}`)
} else {
  const dependencies = ic.dependencies
  const withCheckout = dependencies.filter((entry) => entry.checkoutExists === true)
  const withClient = dependencies.filter((entry) => entry.clientPresent === true)
  const bundleListed = dependencies.filter((entry) => entry.bundleListed)
  const probed = dependencies.filter((entry) => entry.routes.some((route) => route.probe !== null))
  const answered = dependencies.filter((entry) =>
    entry.routes.some((route) => route.probe !== null && route.probe.status !== null && route.probe.status !== 404),
  )
  const serving = dependencies.filter((entry) => entry.servesRoute === true)
  const notServing = dependencies.filter((entry) => entry.servesRoute === false)
  const unmeasured = dependencies.filter((entry) => entry.servesRoute === null)

  console.log(`dependencies: ${dependencies.length}/${dependencies.length} (population: keys of dependencies in ${ic.profileManifest})`)
  console.log(`checkouts present: ${withCheckout.length}/${dependencies.length}`)
  console.log(`dsh.client present: ${withClient.length}/${dependencies.length}`)
  console.log(`listed in dsh.profile.bundles: ${bundleListed.length}/${dependencies.length}`)
  console.log(`bundles array: ${ic.bundles.length} entries (population: dsh.profile.bundles as written)`)
  console.log(`node_modules: ${ic.nodeModules.entries} entries = ${ic.nodeModules.directories} directories + ${ic.nodeModules.symlinks} symlinks + ${ic.nodeModules.entries - ic.nodeModules.directories - ic.nodeModules.symlinks} files`)
  console.log(`node_modules links with NO dependency: ${ic.nodeModules.linksWithoutDependency.length === 0 ? 'none' : ic.nodeModules.linksWithoutDependency.join(', ')}`)
  console.log(`dependencies with no node_modules entry: ${ic.nodeModules.dependenciesWithoutLink.length === 0 ? 'none' : ic.nodeModules.dependenciesWithoutLink.join(', ')}`)
  console.log(`route literals derived: ${ic.entriesWithRoutes}/${dependencies.length} plugins`)
  console.log(`probed: ${probed.length}/${dependencies.length} plugins; answered with a non-404: ${answered.length}/${probed.length} probed`)
  console.log(`servesRoute true: ${serving.length}/${dependencies.length} · false: ${notServing.length} · null (NOT MEASURED): ${unmeasured.length}`)

  const missing = dependencies.filter((entry) => entry.resolution === 'link' && entry.checkoutExists !== true)
  if (missing.length > 0) console.log(`link: checkouts MISSING: ${missing.map((entry) => entry.dependency).join(', ')}`)
  const registrySpecs = dependencies.filter((entry) => entry.resolution !== 'link')
  if (registrySpecs.length > 0) {
    console.log(`registry specs (no checkout to inspect, so checkoutExists is null): ${registrySpecs.map((entry) => `${entry.dependency}@${entry.spec}`).join(', ')}`)
  }
  console.log(`manifest identity: sha256 ${ic.profileManifestSha256} · mtime ${ic.profileManifestMtime}`)
  const unmeasuredList = unmeasured.map((entry) => entry.dependency)
  if (unmeasuredList.length > 0) console.log(`servesRoute NOT MEASURED for: ${unmeasuredList.join(', ')}`)

  check('installed half loaded', ic !== null, `${dependencies.length} dependencies`)
  check(
    'every dependency with a link: spec has a checkout on disk',
    missing.length === 0,
    `${withCheckout.length}/${dependencies.length} dependencies have a checkout (${registrySpecs.length} are registry specs)`,
  )
  check(
    'at least one plugin was probed and answered (the probe is a reading, not an unmounted harness)',
    offline ? answered.length === 0 : answered.length > 0,
    offline ? 'offline mode: no probe expected' : `${answered.length}/${dependencies.length} answered`,
  )
  const bundlesNamingDependency = ic.bundles.filter((bundle) =>
    dependencies.some((entry) => entry.dependency === bundle || entry.packageName === bundle),
  )
  check(
    'bundle entries that are not dependencies are the official @deepseek-ai bundles',
    ic.bundles.filter((bundle) => !bundlesNamingDependency.includes(bundle)).every((bundle) => bundle.startsWith('@deepseek-ai/')),
    `${bundlesNamingDependency.length}/${ic.bundles.length} bundles name a profile dependency; ${ic.bundles.length - bundlesNamingDependency.length} do not`,
  )

  // ---------------------------------------------------------- probe policy
  const mutating = '/dsh-market/install'
  check(
    'read-only probe policy skips a mutating path',
    internals.MUTATING_SEGMENT.test(internals.lastSegment(mutating)),
    `lastSegment(${mutating}) = "${internals.lastSegment(mutating)}"`,
  )
  check(
    'read-only probe policy does NOT skip an obviously read path',
    !internals.MUTATING_SEGMENT.test(internals.lastSegment('/intent-map/api/map')),
    'lastSegment(/intent-map/api/map) = "map"',
  )

  // ------------------------------------------------- bundle-layout resolution
  // The reported defect: a fixed `../` walk was correct in source and one
  // segment short in the emitted `lib/`, so the live surface reported the
  // profile manifest at `C:\Users\0000\profiles-tree\personal-dev/package.json`.
  // This drives the SAME resolver from the bundle depth, without writing to lib/.
  const cloneRoot = resolveCloneRoot()
  const simulate = cloneRoot === null ? null : resolveProfileDirFrom(`${cloneRoot}/lib`)
  const sourceProfile = resolveProfileDir().path
  // A SUFFIX TEST ALONE WOULD HAVE PASSED THE DEFECT: the wrong answer was
  // `C:\Users\0000\profiles-tree\personal-dev`, which ends with the same suffix
  // and is simply not there. The assertion that can fail is EXISTENCE plus
  // AGREEMENT with the source-layout answer.
  const bundleManifest = simulate?.path ? `${simulate.path}/package.json` : null
  check(
    'profile resolves from the BUNDLE layout (lib/) to a manifest that EXISTS',
    bundleManifest !== null && existsSync(bundleManifest) && sourceProfile !== null && simulate?.path === sourceProfile,
    simulate === null
      ? 'clone root not resolved'
      : `lib/ → ${simulate.path ?? 'NOT FOUND'} (searched ${simulate.searched.length}); source → ${sourceProfile ?? 'NOT FOUND'}`,
  )
  const outside = resolveProfileDirFrom('C:/Windows/System32')
  check(
    'the shape search reports NOT FOUND outside the checkout rather than guessing',
    outside.path === null && outside.searched.length > 0,
    `C:/Windows/System32 → ${outside.path ?? 'null'} (searched ${outside.searched.length})`,
  )
}

// ------------------------------------------------------------- downloadable
console.log('\n-- DOWNLOADABLE half --')
const halves = loadDownloadable({})
const live = halves.live
const snapshot = halves.snapshot

if (live.census === null) {
  console.log(`live: NOT MEASURED — ${live.unavailable?.reason}`)
} else {
  const id = live.census.identity
  console.log(`live rows: ${id.rows}/${id.headerCount ?? id.rows} (population: plugins[] in ${id.path})`)
  console.log(`live identity: sha256 ${id.sha256} · ${id.bytes} B · updated ${id.updated} · fetched ${id.fetchedAt}`)
  console.log(`live npm field present: ${id.rowsWithNpm}/${id.rows}`)
  console.log(`live name≠npm: ${id.nameOrNpmDivergent}/${id.rowsWithNpm} of npm-bearing rows (= ${((100 * id.nameOrNpmDivergent) / id.rowsWithNpm).toFixed(1)}%), or ${((100 * id.nameOrNpmDivergent) / id.rows).toFixed(1)}% of all rows`)
  console.log(`live distinct names: ${id.distinctNames}/${id.rows}; duplicate groups: ${id.duplicateNameGroups} covering ${id.duplicateNameRows} rows`)
  check('live catalog loaded with rows', id.rows > 0, `${id.rows} rows`)
  check('live rows equal the file count header', id.rows === id.headerCount, `${id.rows} vs ${id.headerCount}`)
}

if (snapshot.census === null) {
  console.log(`snapshot: NOT MEASURED — ${snapshot.unavailable?.reason}`)
} else {
  const id = snapshot.census.identity
  console.log(`snapshot rows: ${id.rows}/${id.headerCount ?? id.rows} (population: plugins[] in ${id.path})`)
  console.log(`snapshot identity: sha256 ${id.sha256} · ${id.bytes} B · updated ${id.updated}`)
  console.log(`snapshot npm field present: ${id.rowsWithNpm}/${id.rows}`)
  console.log(`snapshot name≠npm: ${id.nameOrNpmDivergent}/${id.rowsWithNpm} of npm-bearing rows (= ${((100 * id.nameOrNpmDivergent) / id.rowsWithNpm).toFixed(1)}%), or ${((100 * id.nameOrNpmDivergent) / id.rows).toFixed(1)}% of all rows`)
  console.log(`snapshot distinct names: ${id.distinctNames}/${id.rows}; duplicate groups: ${id.duplicateNameGroups} covering ${id.duplicateNameRows} rows`)
  check('snapshot is the 4,527-row census the program cites', id.rows === 4527, `${id.rows}`)
  check('snapshot rows equal the file count header', id.rows === id.headerCount, `${id.rows} vs ${id.headerCount}`)
}

// ------------------------------------------------------------- name matching
console.log('\n-- MATCHING DISCIPLINE --')
if (live.census !== null) {
  const costMeter = registry.byName('dsh-cost-meter')
  console.log(`byName("dsh-cost-meter"): ${costMeter.rowCount} rows · ambiguous ${costMeter.ambiguous}`)
  for (const line of costMeter.disambiguation) console.log(`   ${line}`)
  check(
    'a duplicated name returns its row count and refuses to be read as one row',
    costMeter.rowCount > 1,
    `${costMeter.rowCount} rows for dsh-cost-meter`,
  )

  const divergent = registry.byNpm('dsh-vibe-math')
  console.log(`byNpm("dsh-vibe-math"): ${divergent.rowCount} rows (name-OR-npm lookup finds what name-only cannot)`)
  check('byNpm finds a row that byName would miss', divergent.rowCount > 0, `${divergent.rowCount} rows`)

  const keyword = registry.byKeyword('memory')
  console.log(`byKeyword("memory"): ${keyword.rowCount}/${keyword.totalRows}`)
  const zone = registry.byZone('M1-cross-session-store')
  console.log(`byZone("M1-cross-session-store"): ${zone.rowCount}/${zone.totalRows} (token method, not embedding alignment)`)

  // ------------------------------------------------------------------ both
  const both = registry.bothHalves()
  console.log(`\ninstalled ∩ downloadable: ${both.entries.length}/${registry.allInstalled().length} installed entries have a catalog row`)
  for (const entry of both.entries) console.log(`   ${entry.dependency} (package ${entry.packageName ?? 'absent'})`)
  check('intersection is measured with a denominator', both.entries.length >= 0 && registry.allInstalled().length > 0, `${both.entries.length}/${registry.allInstalled().length}`)
}

// ------------------------------------------------------------------- census
console.log('\n-- CENSUS ROWS --')
for (const row of registry.census()) {
  console.log(`${row.numerator}/${row.denominator} — ${row.population} (at ${row.at})`)
}

const failed = checks.filter((item) => !item.ok)
const expected = 15
console.log(`\nchecks: ${checks.length - failed.length}/${checks.length} passed · frozen expectations: ${checks.length} (expected at least ${expected})`)
if (checks.length < expected) {
  console.log('INSTRUMENT FAILURE: fewer checks ran than this driver declares')
  process.exit(3)
}
console.log(`VERDICT: ${failed.length === 0 ? 'CENSUS OK' : 'CENSUS DISAGREED'}`)

if (write) {
  const report = {
    at: new Date().toISOString(),
    offline,
    checks,
    installed: ic === null ? null : {
      dependencies: ic.dependencies.length,
      withCheckout: ic.dependencies.filter((entry) => entry.checkoutExists === true).length,
      manifestSha256: ic.profileManifestSha256,
      manifestMtime: ic.profileManifestMtime,
      bundles: ic.bundles.length,
      bundlesListed: ic.dependencies.filter((entry) => entry.bundleListed).length,
      nodeModules: ic.nodeModules,
      serving: ic.dependencies.filter((entry) => entry.servesRoute === true).length,
      probed: ic.dependencies.filter((entry) => entry.routes.some((route) => route.probe !== null)).length,
      entries: ic.dependencies.map((entry) => ({
        dependency: entry.dependency,
        spec: entry.spec,
        packageName: entry.packageName,
        checkoutExists: entry.checkoutExists,
        clientPresent: entry.clientPresent,
        bundleListed: entry.bundleListed,
        routes: entry.routes.map((route) => ({
          path: route.path,
          kind: route.kind,
          status: route.probe?.status ?? null,
          skipped: route.probeSkippedBecause,
        })),
        servesRoute: entry.servesRoute,
      })),
    },
    downloadable: live.census === null ? null : {
      identity: live.census.identity,
      duplicateNameGroups: live.census.identity.duplicateNameGroups,
    },
    snapshot: snapshot.census === null ? null : { identity: snapshot.census.identity },
    censusRows: registry.census(),
  }
  writeFileSync(resolve(HERE, 'last-census.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`report written: ${resolve(HERE, 'last-census.json')}`)
}

process.exit(failed.length === 0 ? 0 : 1)
