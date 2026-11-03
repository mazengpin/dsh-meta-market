/**
 * ============================================================================
 * dsh-meta-market — self-contained route-surface harness
 * ============================================================================
 *
 * WHAT THIS PROVES, AND WHY IT IS NOT A MOCK
 *
 * It builds a real HTTP server, hands `apply()` a real `HostContext` with a real
 * `webServer.register` that binds a real port on `127.0.0.1`, and then drives the
 * plugin's ACTUAL registered handler over that socket. What it does NOT do is
 * mount into a live profile — and that is the point. `task-8`'s acceptance says
 * the surface must answer on a private port in a self-contained harness rather
 * than by touching the owner's live `3083`, because a plugin that has to be
 * mounted to be tested is a plugin whose tests mutate the thing they measure.
 *
 * THE ONE THING THIS HARNESS MUST NOT BE ABLE TO DO QUIETLY
 *
 * A green route test that has never been red proves nothing. Every assertion here
 * therefore reports a COUNT of assertions run beside its verdict, the process
 * exits non-zero when the count is wrong, and the port is chosen by the OS (port
 * `0`) so two runs cannot collide and no run can attach to a server it did not
 * start. The program's own rule applies throughout: **a `0` on both sides is an
 * instrument failure, not a pass** — so a run that asserts nothing exits 3.
 *
 * WHY THE `effect` DISPOSER IS TESTED AND NOT ASSUMED
 *
 * `ctx.effect` is the only reason this plugin can be unloaded. A registration
 * outside an effect leaks, and a leaked route keeps answering after its owner is
 * gone — which is the worst possible failure for a surface whose entire subject
 * is trust. So the harness asserts the disposer actually closes the socket
 * rather than trusting that it does.
 *
 * RUN
 *
 *   node --experimental-strip-types src/host/verify/host-half.mjs
 *
 * Exit codes: 0 all assertions passed · 1 an assertion failed · 3 instrument
 * failure (the server never answered, or the assertion count did not match).
 *
 * @module dsh-meta-market/host/verify
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLONE = resolve(HERE, '..', '..', '..')

/**
 * Import the built module by a FILE URL.
 *
 * A raw Windows path dies with `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received
 * protocol 'c:'` — found by the safety lane the same way, by running rather than
 * reading. `pathToFileURL` is the only form that works, and it keeps this harness
 * portable rather than pinned to one drive letter.
 */
const url = pathToFileURL(resolve(CLONE, 'lib', 'index.js')).href
const mod = await import(url)

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  ${mark}  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** The assertions this harness DECLARES it will run. A mismatch is exit 3. */
let declared = 0

/* ---------------------------------------------------------------------------
 * A REAL HostContext. Every member is a function that does something, because a
 * stub that silently accepts anything would let a defect in `apply()` pass.
 * ------------------------------------------------------------------------ */

const logLines = []
let registeredPath = null
let registeredKind = null
let disposed = false

const ctx = {
  webServer: {
    register(route) {
      registeredKind = route.kind
      registeredPath = route.path
      server.on('request', (req, res) => route.handler(req, res))
      return () => {
        disposed = true
        // The disposer removes the listener; it does not close the server, which
        // the harness owns. What matters is that it is CALLED, so an unload path
        // that forgets to run it is caught here.
        server.removeAllListeners('request')
      }
    },
  },
  effect(callback) {
    const disposer = callback()
    // The host holds the disposer; the harness keeps it so the disposal path can
    // be exercised rather than assumed.
    if (typeof disposer === 'function') disposers.push(disposer)
  },
  logger: {
    info: (...args) => logLines.push(['info', args]),
    warn: (...args) => logLines.push(['warn', args]),
  },
}

const disposers = []
const server = createServer()

/* ---------------------------------------------------------------------------
 * A. apply() REGISTERS EXACTLY WHAT IT SAYS IT DOES
 * ------------------------------------------------------------------------ */

declared += 1
mod.apply(ctx)
check('A1 apply() registers exactly one route', registeredPath !== null && registeredKind === 'prefix',
  `kind=${registeredKind} path=${registeredPath}`)

declared += 1
check('A2 the registered prefix is the one in protocol.ts', registeredPath === `/${'meta-market/api'}`,
  `path=${registeredPath}`)

declared += 1
check('A3 apply() installs exactly one effect disposer', disposers.length === 1, `disposers=${disposers.length}`)

declared += 1
check('A4 the plugin names one injected service', Array.isArray(mod.inject) && mod.inject.length === 1 && mod.inject[0] === 'webServer',
  `inject=${JSON.stringify(mod.inject)}`)

/* ---------------------------------------------------------------------------
 * B. THE SURFACE ACTUALLY ANSWERS OVER A SOCKET
 * ------------------------------------------------------------------------ */

await new Promise((res) => server.listen(0, '127.0.0.1', res))
const port = server.address().port

async function get(path, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method })
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = null }
  return { status: response.status, body, text, headers: response.headers }
}

const root = await get('/meta-market/api')

declared += 1
check('B1 the prefix answers 200', root.status === 200, `status=${root.status}`)

declared += 1
check('B2 the payload is JSON and carries an assembly block', root.body !== null && typeof root.body.assembly === 'object',
  `keys=${root.body === null ? 'unparseable' : Object.keys(root.body).join(',')}`)

declared += 1
/**
 * B3 RECOMPUTES THE VERDICT INSTEAD OF ASSERTING A LITERAL, because both values are derived at
 * request time. It used to assert `kind === 'plan' && mounted === false`, which was true on
 * 2026-10-17 and is FALSE today: `profiles-tree/personal-dev/package.json` lists this package in
 * `dsh.profile.bundles`, so the assembled reading is `mounted: true`, and this deployment answers
 * this build's own GUI surface, so `kind` reads `exists`. A literal here would have reported the
 * plugin as unmounted while the profile was mounting it — the exact defect this harness exists to
 * catch, arriving inside the harness. So it takes the manifest path the payload publishes, reads
 * that file independently, and requires the payload's `mounted` to equal the independent reading.
 */
const publishedManifest = root.body?.assembly?.mount?.manifestPath ?? null
let recomputedMounted = null
if (typeof publishedManifest === 'string') {
  try {
    const manifest = JSON.parse(readFileSync(publishedManifest, 'utf8'))
    const bundles = manifest?.dsh?.profile?.bundles
    recomputedMounted = Array.isArray(bundles) ? bundles.includes('dsh-meta-market') : null
  } catch {
    recomputedMounted = null
  }
}
check('B3 the assembly reports a MEASURED kind and a `mounted` flag that agrees with the manifest it publishes',
  (root.body?.assembly?.kind === 'exists' || root.body?.assembly?.kind === 'plan' || root.body?.assembly?.kind === 'future')
    && recomputedMounted !== null
    && root.body?.assembly?.mounted === recomputedMounted,
  `kind=${root.body?.assembly?.kind} mounted=${root.body?.assembly?.mounted} recomputedFrom=${publishedManifest ?? 'ABSENT: no manifest path published'} -> ${recomputedMounted}`)

declared += 1
/**
 * B4 KEEPS THE ONE-MOUNTED-FACT PROPERTY CHECKABLE. `mounted` used to be asserted on every lane row;
 * the payload now attaches it ONCE (`LaneRow = Omit<LaneReport, 'mounted'>`) because six copies of
 * one fact can disagree with each other and at most one of them can be right. The payload now
 * maps the SAME measurement onto every row (`{ ...lane, mounted, evidence }`), so the property that
 * replaced six independent literals is: every lane row carries its own `kind` from the closed three
 * plus a non-empty `evidence`, every lane row's `mounted` EQUALS the assembly's, and the assembly's
 * is a boolean rather than a null. A row that disagreed with the assembly would fail here — which
 * is the only thing that makes the repetition safe.
 */
check('B4 every lane row carries its own kind and evidence, and its `mounted` CANNOT disagree with the assembly',
  Array.isArray(root.body?.assembly?.lanes) && root.body.assembly.lanes.length > 0
    && root.body.assembly.lanes.every((l) => (l.kind === 'exists' || l.kind === 'plan' || l.kind === 'future')
      && l.mounted === root.body.assembly.mounted
      && typeof l.evidence === 'string')
    && typeof root.body.assembly.mounted === 'boolean',
  `lanes=${root.body?.assembly?.lanes?.length} kinds=${JSON.stringify(root.body?.assembly?.lanes?.map((l) => l.kind))} assemblyMounted=${root.body?.assembly?.mounted}`)

declared += 1
check('B5 authentication is reported as a measured false, with its evidence attached',
  root.body?.assembly?.authenticated === false && Array.isArray(root.body.assembly.authenticationEvidence)
    && root.body.assembly.authenticationEvidence.length === 3,
  `authenticated=${root.body?.assembly?.authenticated} evidence=${root.body?.assembly?.authenticationEvidence?.length}`)

declared += 1
check('B6 the response forbids caching, so a read cannot be mistaken for fresh',
  (root.headers.get('cache-control') ?? '').includes('no-store'),
  `cache-control=${root.headers.get('cache-control')}`)

/* ---------------------------------------------------------------------------
 * C. THE REFUSALS — the half that makes B meaningful
 * ------------------------------------------------------------------------ */

const unknown = await get('/meta-market/api/nope')

declared += 1
check('C1 an unknown sub-path is 404, not a silent 200', unknown.status === 404, `status=${unknown.status}`)

declared += 1
check('C2 the 404 echoes the attempted path AND the real path set',
  unknown.body?.attempted === '/meta-market/api/nope'
    && Array.isArray(unknown.body?.registered)
    && unknown.body.registered.length > 0
    && unknown.body.registered.includes('/meta-market/api')
    && unknown.body.registered.includes('/meta-market/api/patch/status'),
  `attempted=${unknown.body?.attempted} registered=${unknown.body?.registered?.length} includesPrefix=${unknown.body?.registered?.includes('/meta-market/api')} includesPatchStatus=${unknown.body?.registered?.includes('/meta-market/api/patch/status')}`)

const post = await get('/meta-market/api', 'POST')

declared += 1
check('C3 a non-GET on a read-only route is 405 and names the allowed method',
  post.status === 405 && Array.isArray(post.body?.allowed) && post.body.allowed[0] === 'GET',
  `status=${post.status} allowed=${JSON.stringify(post.body?.allowed)}`)

/* ---------------------------------------------------------------------------
 * F. THE WIRED LANE SURFACE — `patch` is the one lane that declared a route
 * table, and these assertions are what make "wired: true" a measurement rather
 * than a claim in an array.
 * ------------------------------------------------------------------------ */

const patchStatus = await get('/meta-market/api/patch/status')

declared += 1
check('F1 the wired lane answers over the prefix (patch/status)', patchStatus.status === 200,
  `status=${patchStatus.status}`)

declared += 1
check('F2 the forwarded response is the LANE\'s own payload, not a re-shape by the assembly',
  typeof patchStatus.body === 'object' && patchStatus.body !== null && patchStatus.body.lane !== undefined,
  `lane=${patchStatus.body?.lane ?? 'absent'}`)

const patchBlindness = await get('/meta-market/api/patch/blindness')

declared += 1
check('F3 a second wired route answers (patch/blindness)',
  patchBlindness.status === 200 && typeof patchBlindness.body === 'object' && patchBlindness.body !== null,
  `status=${patchBlindness.status}`)

const patchWrongMethod = await get('/meta-market/api/patch/status', 'POST')

declared += 1
check('F4 the lane\'s own 405 (not the assembly\'s) handles a wrong method on a lane route',
  patchWrongMethod.status === 405 && Array.isArray(patchWrongMethod.body?.allowed),
  `status=${patchWrongMethod.status} allowed=${JSON.stringify(patchWrongMethod.body?.allowed)}`)

declared += 1
check('F5 the wiring census reports a numerator AND a denominator, and neither is a failed instrument',
  typeof root.body?.assembly?.wiring?.wired === 'number'
    && typeof root.body?.assembly?.wiring?.lanes === 'number'
    && root.body.assembly.wiring.lanes > 0
    && root.body.assembly.wiring.wired > 0,
  `wired=${root.body?.assembly?.wiring?.wired} of ${root.body?.assembly?.wiring?.lanes}`)

declared += 1
check('F6 every unwired lane states WHY, so a gap is readable rather than inferred',
  Array.isArray(root.body?.assembly?.lanes)
    && root.body.assembly.lanes.every((l) => l.wired === true || typeof l.why === 'string'),
  `unwiredWithoutReason=${root.body?.assembly?.lanes?.filter((l) => l.wired !== true && typeof l.why !== 'string').length ?? 'n/a'}`)

/* ---------------------------------------------------------------------------
 * G. THE THREE REPORT-ONLY LANE SURFACES — AND THE ASSERTION THAT MAKES THEM
 *    WORTH HAVING RATHER THAN MERELY PRESENT.
 *
 *    A route that answers 200 with `{}` passes a "does it answer" test and tells
 *    a reader nothing. So each is asserted to carry BOTH the lane's own declared
 *    constants AND a `notDone` naming the operation it deliberately does not
 *    perform. The `notDone` is the load-bearing field: without it, a route that
 *    reports an alignment threshold reads as an alignment SERVICE.
 * ------------------------------------------------------------------------ */

const alignmentRoute = await get('/meta-market/api/alignment')

declared += 1
check('G1 the alignment surface answers AND carries its real threshold',
  alignmentRoute.status === 200
    && typeof alignmentRoute.body?.threshold?.value === 'number'
    && alignmentRoute.body.threshold.value > 0,
  `status=${alignmentRoute.status} threshold=${alignmentRoute.body?.threshold?.value ?? 'absent'}`)

declared += 1
check('G2 the alignment surface states the operation it does NOT perform',
  typeof alignmentRoute.body?.notDone === 'string' && alignmentRoute.body.notDone.length > 0
    && alignmentRoute.body.notDone.includes('alignPackage'),
  `notDone=${alignmentRoute.body?.notDone ? alignmentRoute.body.notDone.slice(0, 60) + '…' : 'ABSENT — the route reads as a working service'}`)

const dialogueRoute = await get('/meta-market/api/dialogue')

declared += 1
check('G3 the dialogue surface answers AND carries a non-empty declared vocabulary',
  dialogueRoute.status === 200
    && Array.isArray(dialogueRoute.body?.moves) && dialogueRoute.body.moves.length > 0
    && Array.isArray(dialogueRoute.body?.refusalCodes) && dialogueRoute.body.refusalCodes.length > 0,
  `status=${dialogueRoute.status} moves=${dialogueRoute.body?.moves?.length ?? 'absent'} refusalCodes=${dialogueRoute.body?.refusalCodes?.length ?? 'absent'}`)

declared += 1
check('G4 the dialogue surface names the model call it does NOT make — no plugin here reaches a device',
  typeof dialogueRoute.body?.notDone === 'string' && dialogueRoute.body.notDone.includes('decideByLaya'),
  `notDone=${dialogueRoute.body?.notDone ? dialogueRoute.body.notDone.slice(0, 60) + '…' : 'ABSENT'}`)

const identityRoute = await get('/meta-market/api/identity')

declared += 1
/**
 * G5 IS THE ASSERTION THAT CAUGHT A REAL DEFECT, so it is written to keep
 * catching it. The lane declares both token sets as `ReadonlySet<string>`, and
 * `JSON.stringify` renders a Set as `{}` — so the first version of this route
 * published `declaredCapabilityTokens: {}`, which a reader would read as "the
 * vocabulary is empty" rather than "the vocabulary was not serialised".
 *
 * `length > 0` is therefore required on the DECLARED set, not merely
 * `Array.isArray`: an empty array and a lost Set are different failures and only
 * the length distinguishes them. The AUTHENTICATED set is asserted to be an array
 * WITHOUT a length requirement, because a genuinely empty authenticated set is the
 * honest state of this deployment and must be reported as `[]` rather than as a
 * missing key.
 */
check('G5 the identity surface answers AND its declared vocabulary SURVIVED serialisation',
  identityRoute.status === 200
    && Array.isArray(identityRoute.body?.trustStages) && identityRoute.body.trustStages.length > 0
    && Array.isArray(identityRoute.body?.declaredCapabilityTokens) && identityRoute.body.declaredCapabilityTokens.length > 0
    && Array.isArray(identityRoute.body?.authenticatedCapabilityTokens),
  `status=${identityRoute.status} trustStages=${identityRoute.body?.trustStages?.length ?? 'absent'} declaredTokens=${identityRoute.body?.declaredCapabilityTokens?.length ?? 'ABSENT (Set serialised to {} and lost)'} authenticatedTokens=${identityRoute.body?.authenticatedCapabilityTokens?.length ?? 'ABSENT'}`)

declared += 1
/**
 * G6 IS A REFUSAL-CLASS ASSERTION, WHICH IS THE ONE THIS PROGRAM KEEPS GETTING
 * WRONG. It is not enough that the identity route omit the local id; the route
 * must be shown to omit it. So the assertion reads the real id from disk and
 * checks it does NOT appear anywhere in the serialized response.
 */
let localId = null
try {
  const { readFileSync } = await import('node:fs')
  const { homedir } = await import('node:os')
  localId = readFileSync(`${homedir()}/.dsh/.anonymous-user-id`, 'utf8').trim()
} catch { localId = null }
const identitySerialized = JSON.stringify(identityRoute.body ?? {})
check('G6 the identity surface does NOT echo the local instance id',
  localId !== null && localId.length > 0
    ? !identitySerialized.includes(localId)
    : identitySerialized.includes('readInstanceIdentity') === false,
  localId !== null
    ? `local id (${localId.length} chars) present in payload? ${identitySerialized.includes(localId)}`
    : 'the local id file was not readable, so the negative is asserted against the notDone text instead')

declared += 1
check('G7 the wiring census is 6 of 6 — and it is published as numerator AND denominator',
  root.body?.assembly?.wiring?.wired === 6 && root.body?.assembly?.wiring?.lanes === 6,
  `wired=${root.body?.assembly?.wiring?.wired} of ${root.body?.assembly?.wiring?.lanes}`)

declared += 1
check('G8 the per-lane route counts are NOT a shared constant — patch reports 9, a report-only lane reports 1',
  Array.isArray(root.body?.assembly?.wiring?.transport)
    && root.body.assembly.wiring.transport.some((t) => t.lane === 'patch' && t.routes === 9)
    && root.body.assembly.wiring.transport.some((t) => t.lane === 'alignment' && t.routes === 1),
  `transport=${JSON.stringify(root.body?.assembly?.wiring?.transport)}`)

/**
 * G9 IS THE GUARD AGAINST THE DEFECT THAT WAS JUST FIXED, AND IT IS THE ASSERTION
 * THIS SUITE WAS MISSING.
 *
 * The route previously advertised `/meta-market/api/api/lanes` — a doubled `api`
 * segment — under `registered`, while that path 404'd. **An advertised path that
 * does not exist is worse than a missing one**: a reader trusts the 404 body as the
 * authoritative surface, so a wrong entry there sends them to a route that cannot
 * answer, and the surface lies in the one place whose whole job is to be the list
 * of what is real.
 *
 * So: every path in `registered` is driven. **A path may serve (200) or refuse
 * (405/400) — both are honest answers from a real route — but NONE may be 404.**
 * The count of served paths must also be non-zero, because a loop that matched
 * nothing would otherwise report "no 404s found" and pass.
 */
const advertised = Array.isArray(unknown.body?.registered) ? unknown.body.registered : []
const advertisedStatus = []
for (const p of advertised) {
  const r = await get(p)
  advertisedStatus.push({ path: p, status: r.status })
}
const missing = advertisedStatus.filter((s) => s.status === 404)
const served = advertisedStatus.filter((s) => s.status === 200)

declared += 1
check('G9 every ADVERTISED path is distinguishable from a 404, and some actually serve',
  advertised.length > 0 && missing.length === 0 && served.length > 0,
  `advertised=${advertised.length} served200=${served.length} 404=${missing.length}${missing.length ? ' -> ' + JSON.stringify(missing) : ''}`)

/**
 * G10–G12: THE TWO NEWLY-WIRED LANES, PLUS A GENERIC GUARD AGAINST `D-0071` ON
 * EVERY LANE SURFACE.
 *
 * `D-0071` recorded that `JSON.stringify` renders a `Set`/`Map`/`RegExp` as `{}`
 * and an un-awaited Promise as `{}` — **silently, with no error, and
 * indistinguishably from a legitimately empty result.** So a lane payload can lose
 * its entire body and still answer `200`.
 *
 * The signature is specific and worth asserting generically: **a surface that has
 * lost its payload has `ok` and almost nothing else.** So G12 drives all five
 * report routes and requires each to carry a real body — several keys, a `lane`
 * naming itself, and a non-empty `notDone` — which is a check that would have
 * failed on the `{}` forms of both defects found today.
 */
const safetyRoute = await get('/meta-market/api/safety')

declared += 1
check('G10 the safety surface answers AND publishes its standing split with a denominator',
  safetyRoute.status === 200
    && typeof safetyRoute.body?.standing?.verifiedRan === 'number'
    && typeof safetyRoute.body?.standing?.of === 'number'
    && safetyRoute.body.standing.of === 22
    && safetyRoute.body.standing.verifiedRan + safetyRoute.body.standing.planned === 22,
  `status=${safetyRoute.status} split=${JSON.stringify(safetyRoute.body?.standing?.split ?? 'ABSENT')}`)

declared += 1
check('G11 the safety surface states it does NOT run the gate, and names the controls it lacks',
  safetyRoute.body?.runsTheGate === false
    && safetyRoute.body?.acceptsInput === false
    && typeof safetyRoute.body?.notDone === 'string' && safetyRoute.body.notDone.length > 0
    && Array.isArray(safetyRoute.body?.standing?.openWithoutControl)
    && safetyRoute.body.standing.openWithoutControl.length === safetyRoute.body.standing.planned,
  `runsTheGate=${safetyRoute.body?.runsTheGate} acceptsInput=${safetyRoute.body?.acceptsInput} openWithoutControl=${JSON.stringify(safetyRoute.body?.standing?.openWithoutControl)}`)

const socialRoute = await get('/meta-market/api/social')

declared += 1
check('G12 the social surface answers AND the unmeasured sybil cost is null, NEVER 0',
  socialRoute.status === 200
    && socialRoute.body?.sybilCost?.value === null
    && socialRoute.body?.sybilCost?.assertedNull === true
    && !JSON.stringify(socialRoute.body).includes('"value":0'),
  `status=${socialRoute.status} sybilCost.value=${JSON.stringify(socialRoute.body?.sybilCost?.value)} assertedNull=${socialRoute.body?.sybilCost?.assertedNull}`)

declared += 1
check('G13 the social surface does NOT round up: topology is plan, peers contacted is 0 of 0, quorum verdict is unknown',
  socialRoute.body?.topology?.kind === 'plan'
    && socialRoute.body?.topology?.peersContacted?.count === 0
    && socialRoute.body?.quorum?.verdict === 'unknown'
    && socialRoute.body?.quorum?.entitledToRelyOn === false,
  `topology=${socialRoute.body?.topology?.kind} peers=${JSON.stringify(socialRoute.body?.topology?.peersContacted)} quorum=${socialRoute.body?.quorum?.verdict}/${socialRoute.body?.quorum?.entitledToRelyOn}`)

/**
 * G14 IS THE GENERIC `D-0071` GUARD. It is the assertion that would have caught
 * both defects found today — the lost `Set` and the un-awaited Promise — on ANY
 * lane, without knowing in advance which lane would break.
 */
const lanePaths = ['/meta-market/api/alignment', '/meta-market/api/dialogue', '/meta-market/api/identity', '/meta-market/api/safety', '/meta-market/api/social']
const laneBodies = []
for (const p of lanePaths) {
  const r = await get(p)
  laneBodies.push({ path: p, status: r.status, keys: r.body && typeof r.body === 'object' ? Object.keys(r.body).length : 0, lane: r.body?.lane ?? null, hasNotDone: typeof r.body?.notDone === 'string' && r.body.notDone.length > 0, notDone: typeof r.body?.notDone === 'string' ? r.body.notDone : '' })
}
const lost = laneBodies.filter((b) => b.status !== 200 || b.keys < 5 || b.lane === null || !b.hasNotDone)

declared += 1
check('G14 NO lane surface silently lost its payload — the D-0071 signature is a 200 with only `ok`',
  laneBodies.length === 5 && lost.length === 0,
  `checked=${laneBodies.length} lostOrThin=${lost.length}${lost.length ? ' -> ' + JSON.stringify(lost) : ''} | ` + laneBodies.map((b) => `${b.lane}:${b.keys}k`).join(' '))

/**
 * G15 IS THE GUARD FOR THE DEFECT AN INDEPENDENT READER FOUND, AND IT IS
 * DELIBERATELY A CLAIM-SHAPE CHECK RATHER THAN A CONTENT CHECK.
 *
 * `verifier` falsified this surface's own `dialogue` `notDone`, which read: *"it is
 * a model call, and no plugin in this program opens a device or talks to a
 * model."* **The first clause was true; the justification was false.** The lane
 * exports `decideByLaya`, its `laya.ts` opens a socket, and its own shipped check
 * drives it live. **The false part was the part a reader would use to decide what
 * this program is permitted to do.**
 *
 * A route CAN know what it does not do. It CANNOT know a program-wide prohibition —
 * that is a claim about every other lane, made from a read-only status handler, and
 * it is exactly the kind of sentence that reads as authoritative while being
 * unverifiable from where it is written.
 *
 * So this asserts the SHAPE: **no lane `notDone` may contain an absolute
 * program-wide quantifier** (`no plugin`, `no lane`, `never in this program`,
 * `nothing in this program`). That is a real, checkable rule, and it is a FLOOR —
 * it cannot catch a false claim phrased without those words. **A claim's shape is
 * checkable from here; a claim's truth is not, which is why an independent reader
 * is still required.** Stating that limit is the point rather than a caveat.
 */
const forbiddenClaimShapes = ['no plugin', 'no lane', 'never in this program', 'nothing in this program', 'no user', 'no operator']

/**
 * THE RULE IS ANCHORED TO SENTENCE-INITIAL, AND THE NARROWING WAS FORCED BY A REAL COLLISION.
 *
 * As a bare substring test this rule fired on `it holds no userId/sessionId` — because **"no
 * userId" contains "no user"**. That is a legitimate, scoped, checkable statement about a FIELD,
 * and flagging it is a false positive. But the alternative — dropping the rule — would lose the
 * catch it exists for.
 *
 * So the guard now fires only where an ABSOLUTE would actually live: at the start of the string, or
 * immediately after a sentence terminator. The false claims this rule was written for are all
 * sentence-initial — `"no plugin in this program opens a device or talks to a model"` — while a
 * field name sits mid-clause. **G15c below PROVES both halves rather than asserting the narrowing
 * is safe**, because a rule narrowed without a positive control is exactly how a guard becomes
 * decorative.
 */
function startsSentence(lc, i) {
  if (i === 0) return true
  let j = i - 1
  while (j >= 0 && /\s/.test(lc[j])) j -= 1
  if (j < 0) return true
  return /[.;:—]/.test(lc[j])
}

/** True when `text` opens a sentence with a program-wide absolute. */
function assertsAbsoluteClaim(text) {
  const lc = text.toLowerCase()
  for (const phrase of forbiddenClaimShapes) {
    let i = lc.indexOf(phrase)
    while (i >= 0) {
      if (startsSentence(lc, i)) return true
      i = lc.indexOf(phrase, i + 1)
    }
  }
  return false
}

const claimOffenders = laneBodies.filter((b) => assertsAbsoluteClaim(b.notDone))

/* G15 WAS A FLOOR WITH TWO GAPS, BOTH FOUND BY `identity-trust` (`task-19`) AFTER THIS ROUND'S
 * ASSEMBLY FIELDS WERE ADDED. Both are now closed, and the closure is stated rather than assumed:
 *
 *   FIELD GAP — this check scanned `laneBodies[].notDone` ONLY, so the four strings added to
 *   `describeAssembly()` (`notServed`, `noUserAttached`, `noOtherMetaPlugins`, `noTotalAlignment`)
 *   were never read by it. `G15 0 offenders` was TRUE and said nothing about them, which is the
 *   floor limitation this file already documents one paragraph up.
 *
 *   SHAPE GAP — even if scanned, the offender list had no entry that matched "NO USER IS ATTACHED
 *   TO THIS SYSTEM", and that sentence was FALSE: frame-walking the session store finds
 *   `user/message` records in 12 of 12 sampled logs. The user is present in the SYSTEM and absent
 *   from the MAP. 'no user' and 'no operator' are now in the list.
 *
 * A SHAPE CHECK IS STILL NOT A TRUTH CHECK — the sentence was corrected by a reader, not by this
 * assertion. What changed is that the next one cannot pass SILENTLY.
 *
 * ⚠️ AND THE EXTENSION ABOVE SHIPPED BROKEN FOR 38 SECONDS, WHICH IS ITS OWN FINDING. The first
 * version referenced `assemblyStringFields` and DEFINED IT NOWHERE, so this file threw
 * `ReferenceError: assemblyStringFields is not defined` at the line below. `verifier` caught it
 * four seconds after the edit and reported the board's `38 of 38 PASS` as FALSE-RIGHT-NOW —
 * correct when written, dead when read, and **what moved was the INSTRUMENT rather than the
 * population, which is strictly worse than a stale count.**
 *
 * The lesson is not "test your edits". It is that **a harness is a program and an undefined
 * identifier in a `.mjs` file is not caught by `tsc`** — this clone's typecheck is green over the
 * TypeScript sources and says nothing at all about this `.mjs` file. So the guard against this
 * class is that the harness must be RUN on every change, which is exactly what `verifier` did and
 * exactly what the `PASS` line did not do.
 *
 * AND THE FIRST FIX OF THAT COMMENT INTRODUCED A SECOND BUG, WHICH IS WORTH THE TWO LINES: this
 * paragraph originally wrote the glob for those sources, and the `*` and `/` in it CLOSED THIS
 * BLOCK COMMENT EARLY, so the rest of the prose became code and the file threw a SYNTTAX error at
 * its own explanation. **A comment that names a path can terminate the comment it is inside.**
 */
const assemblyStringFields = []
{
  const r = await get('/meta-market/api')
  const outer = r.body && typeof r.body === 'object' ? r.body : {}
  /**
   * THE FIELDS ARE NESTED UNDER `assembly` AND THE FIRST VERSION OF THIS LOOKED AT THE ROOT.
   *
   * It scanned `scanned=0/4` and FAILED — which is the assertion behaving correctly and is worth
   * recording, because **a check that cannot see its subject must report 0 and go RED, never pass
   * on an empty set.** This program's own rule is that a `0` on both sides of a comparison is an
   * INSTRUMENT FAILURE, not agreement, and the same rule applies when the second side is a field
   * that was never read. Had this asserted `offenders === 0` alone, a wrong path and a clean
   * payload would have been indistinguishable — **and it would have printed a confident PASS over
   * four strings it never saw.**
   */
  const body = outer.assembly && typeof outer.assembly === 'object' ? outer.assembly : {}
  /**
   * THE POPULATION MOVED FROM FOUR STRINGS TO THREE, AND THE REASON IS RECORDED HERE RATHER THAN
   * LEFT TO A COUNT. `notServed` used to be one of these prose strings; it is now the `served`
   * OBJECT (`{ origin, prefixStatus, guiStatus, at, reason, timeoutMs }`), because a paragraph
   * claiming "this surface has never answered on a port" was replaced by two real self-probes. A
   * count of four would therefore have failed over a field that got BETTER, and a count of "some
   * strings" would have needed no population at all. The three that remain are the three that are
   * still prose, and the count is exact so a prose field that disappears again goes RED here.
   */
  for (const k of ['noUserAttached', 'noOtherMetaPlugins', 'noTotalAlignment']) {
    if (typeof body[k] === 'string') assemblyStringFields.push({ field: k, value: body[k] })
  }
}
const assemblyClaimOffenders = assemblyStringFields.filter((f) => assertsAbsoluteClaim(f.value))

declared += 1
check('G15 no lane `notDone` asserts a PROGRAM-WIDE prohibition a single route cannot know',
  laneBodies.length === 5 && claimOffenders.length === 0,
  `checked=${laneBodies.length} offenders=${claimOffenders.length}${claimOffenders.length ? ' -> ' + JSON.stringify(claimOffenders.map((o) => o.lane)) : ''}`)

declared += 1
check('G15b the ASSEMBLY report\'s three prose fields EXIST and are scanned by the same shape rule',
  assemblyStringFields.length === 3 && assemblyClaimOffenders.length === 0,
  `scanned=${assemblyStringFields.length}/3 offenders=${assemblyClaimOffenders.length}${assemblyClaimOffenders.length ? ' -> ' + JSON.stringify(assemblyClaimOffenders.map((o) => o.field)) : ''}`)

/**
 * G15c IS THE POSITIVE CONTROL FOR G15b, AND WITHOUT IT THE NARROWING ABOVE WOULD HAVE MADE G15
 * DECORATIVE. The rule was anchored to sentence-initial because `no userId` collided with
 * `no user`; **a guard that has been narrowed must be shown to still catch the thing it was
 * narrowed FOR.** These two fixtures are the two real claims this program actually published and
 * then had to retract (`D-0073`), one of which IS sentence-initial and one of which is a field
 * reference inside a clause. The assertion requires the FIRST to be caught and the SECOND to be
 * deliberately not caught — so a future edit that widens the rule back to a substring test, or
 * narrows it to nothing, fails HERE rather than passing silently.
 */
const ABSOLUTE_FIXTURE = 'decideByLaya is not reachable: no plugin in this program opens a device or talks to a model'
const SCOPED_FIXTURE = 'it holds no userId/sessionId, so the map is keyed to zones rather than to a person'

declared += 1
check('G15c the narrowed rule still CATCHES a sentence-initial absolute and still IGNORES a field name',
  assertsAbsoluteClaim(ABSOLUTE_FIXTURE) && !assertsAbsoluteClaim(SCOPED_FIXTURE),
  `absoluteCaught=${assertsAbsoluteClaim(ABSOLUTE_FIXTURE)} scopedIgnored=${!assertsAbsoluteClaim(SCOPED_FIXTURE)}`)

/* ---------------------------------------------------------------------------
 * D. THE DISPOSAL PATH, EXERCISED RATHER THAN ASSUMED
 * ------------------------------------------------------------------------ */

declared += 1
check('D1 the disposer was not called merely by registering', disposed === false, `disposed=${disposed}`)

disposers[0]()

declared += 1
check('D2 calling the disposer unregisters the handler', disposed === true && server.listenerCount('request') === 0,
  `disposed=${disposed} listeners=${server.listenerCount('request')}`)

const afterDisposal = await fetch(`http://127.0.0.1:${port}/meta-market/api`, { signal: AbortSignal.timeout(2000) }).then(
  (r) => r.status,
  () => 'transport-error',
)

declared += 1
check('D3 after disposal the route no longer answers a valid 200', afterDisposal === 'transport-error' || afterDisposal !== 200,
  `status=${afterDisposal}`)

declared += 1
check('E1 the logger was called exactly once, at apply time', logLines.length === 1 && logLines[0][0] === 'info',
  `logLines=${logLines.length}`)

/* ---------------------------------------------------------------------------
 * VERDICT — with the assertion count checked, not assumed
 * ------------------------------------------------------------------------ */

await new Promise((res) => server.close(res))
server.closeAllConnections()

const passed = results.filter((r) => r.ok).length
const failed = results.length - passed

console.log('')
console.log(`assertions run: ${results.length} of ${declared} declared`)
console.log(`passed: ${passed}  failed: ${failed}`)
console.log(`port used: ${port} (OS-assigned; nothing else could have been attached)`)

if (results.length !== declared) {
  console.log(`INSTRUMENT FAILURE: ran ${results.length} assertions but declared ${declared}. A harness that does not run what it declares is not a harness.`)
  process.exit(3)
}
if (passed === 0) {
  console.log('INSTRUMENT FAILURE: zero assertions passed. A 0 on both sides is instrument failure, not a pass.')
  process.exit(3)
}
if (failed > 0) {
  console.log('VERDICT FAIL')
  process.exit(1)
}
console.log('VERDICT PASS')
process.exit(0)
