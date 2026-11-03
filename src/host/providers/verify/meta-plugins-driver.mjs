// A driver for the Meta-Plugins provider: it EXECUTES `buildWindow` and prints what the window would publish.
//
// WHY THIS FILE EXISTS. `pnpm typecheck` is the assembly lane's to run — two concurrent `tsdown` runs clobber `lib/` — so this lane's proof has to be an execution rather than a build. It is `.mjs` on purpose: `tsconfig.json` has `include: ["src"]` and `allowJs` off, so a `.mjs` driver cannot become a typecheck liability for the other fifteen lanes, while `node --experimental-strip-types` can still import the `.ts` sources directly.
//
// WHAT IT PRINTS, and every number carries its denominator: the census (numerator, denominator, population), the installed/downloadable/not-measured split with the arithmetic that must close, the alignment verdict census, and every item whose verdict is `collides` with the plugin it names. The last is the requirement that makes the window a check: no collision means the alignment gate has not been shown able to refuse, and this driver exits 2 rather than reporting an all-green success.

const { buildWindow, WINDOW_ID } = await import('../plugins.ts')
const { writeFileSync } = await import('node:fs')
const { fileURLToPath } = await import('node:url')
const { dirname, resolve } = await import('node:path')

/**
 * The run is written beside this driver as `last-run.json`, not only printed.
 *
 * A measurement that lives only in a transcript cannot be audited by a reader: they have to take the author's word for the numbers. Writing the artifact makes the census, the split and the collision list re-derivable from a file in the workspace.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

const started = Date.now()
const payload = await buildWindow(WINDOW_ID)
const elapsedMs = Date.now() - started

const out = {
  window: WINDOW_ID,
  elapsedMs,
  unavailable: payload.unavailable ?? null,
  census: payload.census ?? null,
  controlIds: (payload.controls ?? []).map((control) => `${control.id}:${control.kind}`),
  falsifierCount: (payload.falsifiers ?? []).length,
  itemCount: (payload.items ?? []).length,
}

if (payload.unavailable !== null && payload.unavailable !== undefined) {
  console.log(JSON.stringify({ ...out, verdicts: null, split: null, collisions: [] }, null, 2))
  process.exit(3)
}

const items = payload.items ?? []
const split = { installed: 0, downloadable: 0, notMeasured: 0, kindExists: 0, kindPlan: 0, kindFuture: 0 }
const verdicts = { aligned: 0, collides: 0, notMeasured: 0 }
const methods = { embedding: 0, token: 0, none: 0 }
const collisions = []

for (const item of items) {
  if (item.installed === true) split.installed += 1
  else if (item.downloadable === true) split.downloadable += 1
  else split.notMeasured += 1

  if (item.kind === 'exists') split.kindExists += 1
  else if (item.kind === 'plan') split.kindPlan += 1
  else split.kindFuture += 1

  if (item.alignment.verdict === 'aligned') verdicts.aligned += 1
  else if (item.alignment.verdict === 'collides') verdicts.collides += 1
  else verdicts.notMeasured += 1

  const methodsHere = new Set(item.intent.zones.map((zone) => zone.method))
  if (methodsHere.has('embedding')) methods.embedding += 1
  else if (methodsHere.has('token')) methods.token += 1
  else methods.none += 1

  if (item.alignment.verdict === 'collides') {
    collisions.push({
      id: item.id,
      name: item.name,
      collidesWith: item.intent.collidesWith.map((collision) => collision.id),
      why: item.intent.collidesWith[0]?.why ?? item.alignment.why,
    })
  }
}

const splitCloses = split.installed + split.downloadable + split.notMeasured === items.length
const verdictsClose = verdicts.aligned + verdicts.collides + verdicts.notMeasured === items.length

const report = {
  ...out,
  split,
  splitCloses,
  verdicts,
  verdictsClose,
  intentMethods: methods,
  collisions,
  collisionCount: collisions.length,
  collisionRequirementMet: collisions.length > 0,
  // A sample of what a non-colliding row looks like, so a reader can see the shape rather than only the totals.
  sampleAligned: items
    .filter((item) => item.alignment.verdict === 'aligned')
    .slice(0, 3)
    .map((item) => ({ id: item.id, kind: item.kind, installed: item.installed, downloadable: item.downloadable })),
  sampleNotMeasured: items
    .filter((item) => item.alignment.verdict === 'not-measured')
    .slice(0, 3)
    .map((item) => ({ id: item.id, why: item.alignment.why })),
}

writeFileSync(resolve(HERE, 'last-run.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))

if (!splitCloses || !verdictsClose) {
  console.error('FAIL: a split did not close — a row was dropped by a branch')
  process.exit(2)
}
if (collisions.length === 0) {
  console.error('FAIL: no item rendered `collides` — the alignment gate is not yet a check')
  process.exit(2)
}
