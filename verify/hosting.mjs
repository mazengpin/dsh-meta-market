#!/usr/bin/env node
/**
 * ============================================================================
 * dsh-meta-market/verify/hosting.mjs — the hosting ledger's own check
 * ============================================================================
 *
 * WHAT THIS HARNESS IS FOR, AND THE DEFECT IT IS WRITTEN AGAINST
 *
 * The row type added by `src/host/registry/hosting.ts` makes a claim per row: that
 * the edge folds onto a component that exists today, or that it does not. A
 * harness that only counted rows would be a caption generator. So this file does
 * three things:
 *
 *   1. It derives the report from the REAL registry and asserts the properties
 *      that make a row checkable — every folded row names its component and has a
 *      trial that matched, every `null` reading carries a reason, every non-null
 *      reading carries a provenance, and the census closes arithmetically.
 *   2. It MUTATES a copy of the report four ways and requires the same predicate
 *      to REJECT each mutation. A check nobody has moved is a check nobody knows
 *      the shape of; this is the only technique that tells an assertion from a
 *      display, and `AGENTS.md` records six defects of exactly that shape.
 *   3. It runs a BUILDER-LEVEL falsifier: with the catalog half forced
 *      unavailable, the catalog-backed row must stop being folded. If it stays
 *      folded, the verdict is written down rather than measured.
 *
 * THE LIVE ROUTE IS REPORTED, AND ITS STATUS IS NOT ASSUMED
 *
 * `/meta-market/api/hosting` requires a `dsh web` restart to be served, because
 * host changes load at boot. `--require-live` turns its status into a hard check;
 * without the flag the status is printed and the harness still exits 0 on the
 * module-level checks. That is deliberate: a harness that fails for a reason
 * outside its subject teaches a reader to ignore its red.
 *
 * Usage: node --experimental-strip-types verify/hosting.mjs [--require-live]
 */

import { openRegistry } from '../src/host/registry/index.ts'
import { buildHostingReport, HOSTING_SEED_IDS, resetHosting, stripNonCode } from '../src/host/registry/hosting.ts'
import { handle, REGISTERED_PATHS } from '../src/host/routes.ts'

const ORIGIN = process.env.DSH_META_MARKET_ORIGIN ?? 'http://127.0.0.1:3083'
const ROUTE = '/meta-market/api/hosting'
const REQUIRE_LIVE = process.argv.includes('--require-live')

let checks = 0
let failed = 0
const failures = []

function check(name, ok, detail) {
  checks += 1
  if (!ok) {
    failed += 1
    failures.push(`${name}: ${detail}`)
    console.log(`FAIL ${name} — ${detail}`)
    return false
  }
  console.log(`PASS ${name} — ${detail}`)
  return true
}

/** A deep copy, so a mutation cannot reach the report the real assertions read. */
function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

/**
 * THE PREDICATE. Every rule below is a statement about the report that can be
 * false; the mutations later move a value and require this to notice.
 */
function verifyReport(report) {
  const problems = []
  const rows = report.rows

  if (report.census.rowsAttempted !== HOSTING_SEED_IDS.length) {
    problems.push(`population: rowsAttempted ${report.census.rowsAttempted} !== seeds ${HOSTING_SEED_IDS.length}`)
  }
  if (report.census.rowsServed !== rows.length) {
    problems.push(`population: rowsServed ${report.census.rowsServed} !== rows.length ${rows.length}`)
  }
  if (report.census.folded + report.census.foldedLibraryOnly + report.census.notFolded !== rows.length) {
    problems.push(
      `arithmetic does not close: ${report.census.folded} + ${report.census.foldedLibraryOnly} + ${report.census.notFolded} !== ${rows.length}`,
    )
  }

  const ids = rows.map((row) => row.id)
  if (JSON.stringify(ids) !== JSON.stringify(HOSTING_SEED_IDS)) {
    problems.push(`seed coverage: row ids ${ids.join(', ')} !== seeds ${HOSTING_SEED_IDS.join(', ')}`)
  }

  for (const row of rows) {
    // AN ARTIFACT BEATS A CALL SITE: a store holding artifacts proves the stage ran,
    // so a row whose own store shows output cannot be labelled as one that does not.
    // Asserted FIRST so that, when it disagrees, it is the reason a reader is shown.
    const output = row.intentStage.productionOutput
    if (output !== null && output.artifacts !== null && output.artifacts > 0 && row.fold.state !== 'folded') {
      problems.push(
        `${row.id}: ${output.artifacts} artifact(s) in ${output.store} yet the row is labelled ${row.fold.state} — output proves the stage ran`,
      )
    }

    const folded = row.fold.state === 'folded' || row.fold.state === 'folded-library-only'
    if (folded) {
      if (row.fold.component === null) problems.push(`${row.id}: folded with a null component`)
      if (row.fold.kind === null) problems.push(`${row.id}: folded with a null fold kind`)
      if (!row.fold.trials.some((trial) => trial.matched === true)) {
        problems.push(`${row.id}: folded but no trial matched`)
      }
      if (row.fold.why.trim() === '') problems.push(`${row.id}: folded with an empty reason`)
    } else {
      if (row.fold.component !== null) problems.push(`${row.id}: not folded but names a component`)
      if (row.fold.kind !== null) problems.push(`${row.id}: not folded but names a fold kind`)
      if (row.fold.why.trim() === '') problems.push(`${row.id}: not folded with no reason — a refusal must say why`)
      const namesATrial = row.fold.trials.some((trial) => row.fold.why.includes(trial.target))
      const saysWhy = /NOT MEASURED|no trial matched|ABSENT/i.test(row.fold.why)
      if (!namesATrial || !saysWhy) {
        problems.push(`${row.id}: not-folded reason names ${namesATrial ? 'a trial' : 'no trial'} and ${saysWhy ? 'says why' : 'does not say why'}`)
      }
    }

    // TWO ENCODINGS OF ONE FACT MUST NOT BE ABLE TO DISAGREE. The fold state and the
    // stage reading are both statements about whether the stage runs, so a row that
    // says `folded` while its own stage is measured as unrun is internally
    // contradictory — the exact confusion between "the component exists" and "the
    // stage runs" that this row type was built to keep apart.
    if (row.fold.state === 'folded' && row.intentStage.stageReachedInProduction === false) {
      problems.push(`${row.id}: labelled folded while its stage is measured as NOT running`)
    }
    if (row.fold.state === 'folded-library-only' && row.intentStage.stageReachedInProduction !== false) {
      problems.push(`${row.id}: labelled library-only while its stage is not measured as unrun`)
    }

    for (const [side, term] of [
      ['providerCost', row.providerCost],
      ['userBenefit', row.userBenefit],
    ]) {
      if (term.reading === null) {
        if (term.unit !== null) problems.push(`${row.id}.${side}: null reading with a unit '${term.unit}'`)
        if (term.reason === null) problems.push(`${row.id}.${side}: null reading with no reason`)
      } else {
        if (term.provenance === 'not-measured') problems.push(`${row.id}.${side}: a number with provenance not-measured`)
        if (term.source === null) problems.push(`${row.id}.${side}: a number with no source`)
      }
    }

    if (row.fold.state === 'folded') {
      const identity = row.identity
      const hasIdentity =
        identity !== null && (identity.npm !== null || identity.owner !== null || identity.version !== null)
      if (!hasIdentity) problems.push(`${row.id}: a market row with no npm, owner or version`)
    }

    // THE IDENTITY'S PROVENANCE, so a null owner is readable rather than ambiguous:
    // a local clone has no marketplace owner and a catalog row does.
    if (row.identitySource === 'none' && row.identity !== null) problems.push(`${row.id}: identitySource none but an identity is present`)
    if (row.identitySource !== 'none' && row.identity === null) problems.push(`${row.id}: identitySource ${row.identitySource} with no identity`)
    if (row.identitySource === 'catalog' && (row.identity?.row ?? -1) < 0) problems.push(`${row.id}: a catalog identity with no catalog row index`)
    if (row.identitySource === 'clone' && (row.identity?.name ?? '') === '') problems.push(`${row.id}: a clone identity with no package name`)
  }

  for (const provider of report.providers) {
    if (provider.catalogRows.measured && provider.catalogRows.of === 0) {
      problems.push(`provider ${provider.name}: a MEASURED catalog reading over a 0 denominator — 0 of 0 is instrument failure`)
    }
    if (!provider.catalogRows.measured && (provider.catalogRows.count !== 0 || provider.catalogRows.of !== 0)) {
      problems.push(`provider ${provider.name}: not measured yet reports ${provider.catalogRows.count} of ${provider.catalogRows.of}`)
    }
  }

  const kv = rows.find((row) => row.id === 'kv-prefix')
  if (kv === undefined) {
    problems.push('the kv-prefix row is absent, so the cited-KV guard cannot be checked')
  } else {
    if (kv.fold.state === 'folded') problems.push('kv-prefix: a cited KV number was counted as a fold')
    if (kv.userBenefit.reading === null) problems.push('kv-prefix: the cited benefit reading is missing')
    if (kv.userBenefit.provenance !== 'cited') problems.push('kv-prefix: a cited number must say it is cited')
    if (kv.userBenefit.reason === null) problems.push('kv-prefix: a conditional saving with no qualifier')
  }

  return problems
}

/* ------------------------------------------------------------------------- */

console.log('=== dsh-meta-market hosting ledger — verify ===')
console.log(`origin ${ORIGIN} · node ${process.version} · seeds ${HOSTING_SEED_IDS.length}`)

resetHosting()
// `probeRoutes: false`: this harness's own route trials do the probing that matters
// for a fold verdict, and the registry's installed-half probe run would multiply the
// run time by the number of routes every dependency registers. `servesRoute` is not a
// field any hosting row reads.
const registry = await openRegistry({ baseUrl: ORIGIN, probeRoutes: false })
const report = await buildHostingReport(registry)

console.log('')
console.log(`rows served ${report.census.rowsServed} of ${report.census.rowsAttempted} attempted`)
console.log(
  `  folded ${report.census.folded} · folded-library-only ${report.census.foldedLibraryOnly} · not-folded ${report.census.notFolded}`,
)
console.log(`  not folded: ${report.census.notFoldedIds.join(', ') || '(none)'}`)
for (const row of report.rows) {
  console.log(`  · ${row.id.padEnd(20)} ${row.fold.state.padEnd(20)} ${row.fold.component ?? '—'}`)
  const output = row.intentStage.productionOutput
  if (output !== null) console.log(`      output: ${output.note}`)
}
if (report.withheld.length > 0) console.log(`  withheld: ${report.withheld.map((w) => `${w.id} (${w.reason})`).join('; ')}`)

console.log('')
const realProblems = verifyReport(report)
check('report satisfies every row predicate', realProblems.length === 0, realProblems.length === 0 ? '0 violations' : realProblems.join(' | '))
check(
  'at least one row is folded and at least one is not',
  report.census.folded > 0 && report.census.notFolded > 0,
  `folded ${report.census.folded} of ${report.census.rowsServed}, not-folded ${report.census.notFolded} of ${report.census.rowsServed}`,
)
check(
  'every row states the hosting side honestly (no row claims a provider-hosted copy)',
  report.rows.every((row) => row.hosting.providerHosted === report.providers.some((provider) => provider.hostedCopies > 0)),
  `providerHosted is derived from the provider table, whose hostedCopies total is ${report.providers.reduce((sum, provider) => sum + provider.hostedCopies, 0)}`,
)

/* ---- THE MUTATIONS: move a value and require the predicate to refuse. ---- */

console.log('')
const mutations = [
  [
    'M1 a folded row loses its component',
    (draft) => {
      const row = draft.rows.find((candidate) => candidate.fold.state === 'folded')
      row.fold.component = null
      return draft
    },
  ],
  [
    'M2 a null reading becomes 0 with provenance not-measured',
    (draft) => {
      const row = draft.rows.find((candidate) => candidate.fold.state === 'not-folded')
      row.providerCost.reading = 0
      row.providerCost.unit = 'tokens'
      row.providerCost.provenance = 'not-measured'
      return draft
    },
  ],
  [
    'M3 the folded tally is inflated by one',
    (draft) => {
      draft.census.folded += 1
      return draft
    },
  ],
  [
    'M4 the cited KV row is rewritten as folded',
    (draft) => {
      const row = draft.rows.find((candidate) => candidate.id === 'kv-prefix')
      row.fold.state = 'folded'
      row.fold.kind = 'catalog'
      row.fold.component = 'catalog:invented'
      return draft
    },
  ],
  [
    'M5 a clone identity is relabelled as a catalog one',
    (draft) => {
      const row = draft.rows.find((candidate) => candidate.identitySource === 'clone')
      row.identitySource = 'catalog'
      return draft
    },
  ],
  [
    'M6 the library-only row is relabelled as folded',
    (draft) => {
      const row = draft.rows.find((candidate) => candidate.fold.state === 'folded-library-only')
      row.fold.state = 'folded'
      return draft
    },
  ],
  [
    'M7 a row whose store holds artifacts is relabelled as not folded',
    (draft) => {
      const row = draft.rows.find((candidate) => (candidate.intentStage.productionOutput?.artifacts ?? 0) > 0)
      row.fold.state = 'not-folded'
      row.fold.component = null
      row.fold.kind = null
      return draft
    },
  ],
]

/**
 * THE INSTRUMENT'S OWN FALSIFIER, taken from a defect this lane shipped and then
 * found: the first call-site counter read a backticked mention of `dispatch(intent,
 * deps)` in a doc comment as a CALL, which folded a stage that never runs. The
 * counter now strips comments and literals first, and this check proves the strip
 * still happens — if `stripNonCode` stopped stripping, the dispatch row would fold
 * on prose and this line would go RED.
 */
const prose = '// dispatch(intent, deps) explains the seam\nconst note = "dispatch(x)"\n'
check(
  'a call mentioned only in a comment or a literal is NOT counted as a call',
  !/\bdispatch\s*\(/.test(stripNonCode(prose)),
  `stripNonCode removed ${prose.length - stripNonCode(prose).length} byte(s) of prose; the residue holds no dispatch( occurrence`,
)

for (const [name, mutate] of mutations) {
  let problems
  try {
    problems = verifyReport(mutate(copy(report)))
  } catch (error) {
    problems = [`the mutation could not even be applied: ${error instanceof Error ? error.message : String(error)}`]
  }
  check(`${name} is REFUSED`, problems.length > 0, problems.length === 0 ? 'the predicate accepted the mutation — it is a caption, not a check' : `refused: ${problems[0]}`)
}

/* ---- THE BUILDER FALSIFIER: with no catalog, a catalog row cannot stay folded. ---- */

console.log('')
const blindRegistry = await openRegistry({
  baseUrl: ORIGIN,
  probeRoutes: false,
  liveCatalogPaths: ['<synthetic>/nonexistent-live-catalog.json'],
  snapshotCatalogPaths: ['<synthetic>/nonexistent-snapshot-catalog.json'],
})
const blind = await buildHostingReport(blindRegistry)
const blindProactive = blind.rows.find((row) => row.id === 'proactive-wake')
const realProactive = report.rows.find((row) => row.id === 'proactive-wake')
check(
  'catalog half unloaded ⇒ the catalog-backed row stops folding (the verdict is measured)',
  realProactive?.fold.state === 'folded' && blindProactive?.fold.state === 'not-folded',
  `real '${realProactive?.fold.state ?? 'absent'}' → blind '${blindProactive?.fold.state ?? 'absent'}'; blind reason: ${blindProactive?.fold.why ?? 'none'}`,
)
check(
  'catalog half unloaded ⇒ the provider table reports NOT MEASURED rather than 0 of 0',
  blind.providers.every((provider) => !provider.catalogRows.measured),
  `measured flags: ${blind.providers.map((provider) => `${provider.name}=${provider.catalogRows.measured}`).join(', ')}`,
)

/* ---- THE ROUTE ITSELF, DRIVEN IN-PROCESS THROUGH THE SAME HANDLER. ---- */

/**
 * A restart loads a host change at boot, so a live probe of a NEW path cannot
 * succeed until the Lead batches one. That is not a reason to leave the route
 * undriven: `handle()` is the function the web server calls, so this phase calls it
 * with a mock request and reads the response it writes. What this proves is the
 * DISPATCH and the payload; what it cannot prove is that the mounted copy on the
 * live port is this build, which is what `--require-live` is for.
 */
console.log('')
function mockResponse() {
  const record = { status: null, headers: null, body: null }
  const res = {
    writeHead(status, headers) {
      record.status = status
      record.headers = headers
    },
    end(payload) {
      record.body = payload
    },
  }
  return { res, record }
}

async function drive(path) {
  const { res, record } = mockResponse()
  await handle({ url: path, method: 'GET', headers: {} }, res)
  return { status: record.status, body: record.body === null ? null : JSON.parse(record.body) }
}

const driven = await drive(ROUTE)
check(
  'the handler serves the hosting route with rows',
  driven.status === 200 && Array.isArray(driven.body?.rows) && driven.body.rows.length === driven.body.census.rowsServed,
  `status ${driven.status}, rows ${driven.body?.rows?.length ?? 'absent'} of ${driven.body?.census?.rowsServed ?? 'absent'} served`,
)
check(
  'the served census carries its population and its clock',
  typeof driven.body?.census?.population === 'string' && typeof driven.body?.census?.at === 'string',
  `population "${driven.body?.census?.population ?? 'absent'}" at ${driven.body?.census?.at ?? 'absent'}`,
)

const missing = await drive(`${ROUTE}-does-not-exist`)
check(
  'the route is advertised by the 404 body, so an advertised path is a served path',
  missing.status === 404 && Array.isArray(missing.body?.registered) && missing.body.registered.includes(ROUTE),
  `404 registered list ${Array.isArray(missing.body?.registered) ? `${missing.body.registered.length} paths, hosting ${missing.body.registered.includes(ROUTE) ? 'IN' : 'ABSENT from'} it` : 'absent'}`,
)

/**
 * THE REGRESSION GUARD ON THE FILE THIS LANE EDITED.
 *
 * `routes.ts` is shared, so adding a branch to it is exactly where an existing
 * route gets shadowed. Every path the clone advertises is driven through the same
 * handler and none may answer 404 — `200`, `400` and `405` are all honest answers,
 * and the count of paths driven is asserted non-zero so an empty loop cannot pass.
 */
const statuses = []
for (const path of REGISTERED_PATHS) {
  const driven = await drive(path)
  statuses.push({ path, status: driven.status })
}
const notFound = statuses.filter((entry) => entry.status === 404)
check(
  'every advertised path still answers through the edited handler',
  statuses.length > 0 && notFound.length === 0,
  `${statuses.length - notFound.length} of ${statuses.length} answered; 404: ${notFound.map((entry) => entry.path).join(', ') || 'none'}`,
)

/* ---- THE LIVE ROUTE. ---- */

console.log('')
let liveStatus = null
try {
  const response = await fetch(`${ORIGIN}${ROUTE}`, { signal: AbortSignal.timeout(8000) })
  liveStatus = response.status
  const body = await response.json()
  console.log(`live ${ROUTE} → ${response.status}; rows in body: ${Array.isArray(body.rows) ? body.rows.length : 'absent'}`)
  if (liveStatus === 200) {
    const liveProblems = verifyReport(body)
    check('the LIVE payload satisfies the row predicate', liveProblems.length === 0, liveProblems.length === 0 ? '0 violations' : liveProblems.join(' | '))
  }
} catch (error) {
  console.log(`live ${ROUTE} → NOT MEASURED (${error instanceof Error ? error.message : String(error)})`)
}

if (REQUIRE_LIVE) {
  check('the live route serves the rows (--require-live)', liveStatus === 200, `status ${liveStatus ?? 'NOT MEASURED'}`)
} else {
  console.log(
    liveStatus === 200
      ? 'live route is serving; rerun with --require-live to make that a hard check'
      : `live route status ${liveStatus ?? 'NOT MEASURED'} — a host change loads at boot, so a restart is required before this path answers; not counted as a failure here`,
  )
}

console.log('')
console.log(`VERDICT ${checks - failed} of ${checks} checks passed${failed === 0 ? ' — HOSTING LEDGER OK' : ' — FAILED'}`)
if (failed > 0) {
  console.log('failures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exitCode = 1
}
