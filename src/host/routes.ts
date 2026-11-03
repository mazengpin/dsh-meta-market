/**
 * The route table for `dsh-meta-market`, and the only place its payload is shaped.
 *
 * WHY THIS IS A SEPARATE FILE FROM `index.ts`
 *
 * `index.ts` is REGISTRATION and nothing else: it declares `name`, `inject` and
 * one `ctx.effect` that registers one prefix. Everything that decides what a
 * request means lives here. The split is not stylistic — it is what makes
 * "does this plugin decide anything at registration time?" answerable by reading
 * one short file, and the answer must be no, because a boot-time decision is a
 * decision nobody can audit afterwards.
 *
 * WHICH LANES ARE ACTUALLY REACHABLE, MEASURED RATHER THAN ASSUMED
 *
 * `task-8` asks for a prefix that exposes each lane's capability. That is the
 * right goal and the honest state is not uniform, so this file reports the state
 * instead of inventing an endpoint per lane:
 *
 *   - **`patch` HAS a route table.** `src/host/patch/routes.ts` exports
 *     `PATCH_ROUTES` — nine rows, each with a path, allowed methods, a handler and
 *     a one-line summary — plus `dispatch(request)` which returns a status and a
 *     body or `null` for an unmatched path. **That dispatch is wired below.** This
 *     is the only lane that declared a transport-shaped surface, and the wiring
 *     forwards to it rather than reimplementing it.
 *   - **The other five expose typed FUNCTIONS and no route table.** `alignment`
 *     exports `alignPackage(input)`, `dialogue` exports its gate and transition
 *     functions, `identity` exports its admission rule, `safety` exports the gate,
 *     `social` exports its scale arithmetic. **Mounting them would mean inventing
 *     an HTTP shape for each of them here** — an assembly writing a lane's
 *     interface is how a seventh, unreviewed opinion enters a build that exists to
 *     avoid exactly that. So they are reported as `wired: false` with the reason,
 *     and a reader gets a stated gap rather than a route that appears and then
 *     404s deeper in.
 *
 * **THE SAME DISTINCTION THE REST OF THIS BUILD INSISTS ON: a thing that is not
 * wired is not thereby absent, and a thing that is absent must not be reported as
 * a working zero.** Five lanes report `wired: false` with a `why` string; they are
 * not reported as failures and they are not omitted.
 *
 * THE KIND IS `plan` AND THE PAYLOAD SAYS SO ON EVERY READ
 *
 * No profile manifest consumes this package, so no bundle patch loads it and
 * nothing here is served on a live port. That is a fact about `exists` versus
 * `plan`, and this program's most-published defect is a plan read as an existence
 * claim. So `kind` and `mounted` are FIELDS on the assembly report and on every
 * lane row, rather than a sentence in a doc comment that a reader has to find and
 * believe.
 *
 * @module dsh-meta-market/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROUTE_PREFIX, SPEC_VERSION, STEP_VERSION } from '../shared/protocol.ts'
import { PATCH_ROUTES, dispatch as dispatchPatch } from './patch/routes.ts'
import { ALIGN_THRESHOLD, ALIGN_THRESHOLD_VALUE, MEASURED_SEPARATION, LIVE_CATALOG_NOT_MEASURED, laneEvidence, INTENT_MAP_ROUTES } from './alignment/index.ts'
import { DIALOGUE_MOVES, LIVE_PHASES, TERMINAL_PHASES, REFUSAL_CODES, ABSTENTION_REASONS, DEFAULT_BOUNDS, THREE_KINDS, UNMEASURED_CONFIDENCE, DEFAULT_LAYA_ENDPOINT, DECISION_ROUTE } from './dialogue/index.ts'
import { TRUST_STAGES, VOCABULARY_CENSUS, DECLARED_CAPABILITY_TOKENS, AUTHENTICATED_CAPABILITY_TOKENS, CREDENTIAL_RED_LINE_MARKERS, NETWORK_RED_LINE_MARKERS, TRUST_STORE_FILE } from './identity/index.ts'
import { describeSurface as describeSafety } from './safety/index.ts'
import { describeSurface as describeSocial } from './social/index.ts'
import { ADVANCED_IDS, PRIMARY_IDS, WINDOW_IDS, isWindowId, rowFor } from './gui/registry.ts'
import { buildEnvelope, buildSections } from './gui/envelope.ts'
import { buildHealth } from './gui/health.ts'
import { collectOutcomes, providerTable } from './providers/index.ts'
import { getRegistry } from './registry/index.ts'
import { getHostingReport } from './registry/hosting.ts'

/** The absolute prefix every route in this clone lives under. */
export const PREFIX = `/${ROUTE_PREFIX}`

/**
 * THE THREE GUI WINDOW PATHS, built from `PREFIX` ONCE.
 *
 * This constant exists because of `D-0071`, and specifically because of the
 * defect it records: `${PREFIX}/api/lanes` was written when `PREFIX` already
 * ended in `/api`, the segment doubled, the branch comparing against it was
 * unreachable, and the 404 body **advertised the path it did not serve**. The
 * guard against a repeat is structural rather than careful: `PREFIX` appears in
 * each string exactly once, the same expression is used for the advertised list
 * and for the dispatch comparison, and `tmp/mmg-host-drive.mjs` drives every
 * advertised path and requires none to answer 404.
 */
const GUI_SECTIONS = `${PREFIX}/gui/sections`
const GUI_SECTION = `${PREFIX}/gui/section`
const GUI_HEALTH = `${PREFIX}/gui/health`

/**
 * THE HOSTING LEDGER PATH — provider-hosted preheated cache agents.
 *
 * Built from `PREFIX` exactly once, like the three GUI paths above, because the
 * same defect is available to any hand-typed variant: `D-0071`'s doubled segment
 * made an advertised path unreachable and a 404 body advertise it. The path is in
 * `REGISTERED_PATHS` because it is dispatched here, and the dispatch comparison
 * uses the one constant.
 */
const HOSTING = `${PREFIX}/hosting`

/**
 * The paths this clone answers, derived from what is actually wired.
 *
 * **DERIVED RATHER THAN LISTED**, because a hand-maintained path list beside a
 * route table is two statements of one fact and they drift. The 404 handler
 * echoes this, so a reader who mistypes a path is told the real set rather than a
 * subset that a previous edit forgot.
 *
 * **AND THE DERIVATION HAD TO BE FIXED, BECAUSE IT WAS ADVERTISING A PATH THAT
 * 404s.** `PREFIX` is `/${ROUTE_PREFIX}`, and `ROUTE_PREFIX` is already
 * `'meta-market/api'` — so this array previously contained
 * `${PREFIX}/api/lanes`, i.e. **`/meta-market/api/api/lanes`, with the segment
 * `api` doubled.** The `handle` branch comparing against that same doubled string
 * was therefore **unreachable**, and the 404 body listed it under `registered`:
 * **the surface advertised a route it did not serve.** Found when the three new
 * report routes 404'd on a first run with the identical mistake in their keys —
 * the new failure exposed the old one, which is the useful thing about wiring by
 * derivation rather than by hand.
 *
 * **The measured form is the single-`api` one, and it is asserted in the harness
 * (`F1`/`F3` drive `/meta-market/api/patch/status` and `/patch/blindness`; `G1`
 * drives `/meta-market/api/alignment`).** A path list is a claim about the
 * surface, so it belongs in the same test as the surface.
 */
export const REGISTERED_PATHS: readonly string[] = Object.freeze([
  PREFIX,
  `${PREFIX}/lanes`,
  ...PATCH_ROUTES.map((row) => `${PREFIX}${row.path}`),
  `${PREFIX}/alignment`,
  `${PREFIX}/dialogue`,
  `${PREFIX}/identity`,
  `${PREFIX}/safety`,
  `${PREFIX}/social`,
  HOSTING,
  GUI_SECTIONS,
  GUI_SECTION,
  GUI_HEALTH,
])

/**
 * THE GUI WINDOW ROUTES — three read routes that serve the ten-window surface.
 *
 * A 400 THAT NAMES THE TEN IDS IS THE POINT, NOT A SIDE EFFECT
 *
 * `D-0071` records what an advertised path that 404s costs, and this surface has
 * a second trap of its own: **a 404 on `/gui/section` is indistinguishable from
 * an unmounted plugin.** The prefix exists only while this plugin is registered,
 * so a reader who asks for a window and receives 404 cannot tell "that window id
 * is wrong" from "nothing is mounted here" — and those need opposite responses.
 * So an unknown or missing `window` answers **400 with the ten ids in the body**,
 * and 404 under this prefix is reserved for "this route is not in this clone".
 *
 * The outcomes are collected ONCE per request, so the sections catalog, the single
 * window and the health count are three views of one instant rather than three
 * instants a provider could land between.
 *
 * **CORRECTED 2026-10-18 — THE SENTENCE ABOVE WAS TRUE OF THE LOOP AND FALSE OF THE
 * INSTANTS, AND IT WAS READ AS A GUARANTEE THE CODE DID NOT PROVIDE.** `collectOutcomes`
 * was called exactly once per request (that part was true), but it built the ten windows
 * one after another, so each provider measured at ITS OWN instant and the catalog is a
 * mosaic rather than a snapshot. MEASURED from one live `/gui/sections` response
 * (2026-10-18 17:25:04–17:25:49 local, 45.7 s, HTTP 200): `generatedAt` **00:25:04Z**,
 * `meta-plugins` census **00:25:04**, `meta-tools` **00:25:29**, `meta-skills` **00:25:32**,
 * `meta-intent` **00:25:42**, `advanced` **00:25:42**, `meta-agents` **00:25:49**,
 * `meta-loops` **00:25:49**, `meta-cordis` **00:25:49**, `meta-community` **00:25:49** —
 * **45 seconds between the first and last census stamp inside one request.** (`meta-memory`
 * reports its own fixed `CENSUS_AT`, which is honest because it carries the reading's own
 * time rather than the request's.) AND the advanced provider could RE-COLLECT its probe
 * batch per window inside that one pass: its TTL stamp was taken before the await, so a
 * batch slower than 15 s was written already expired and the next of its three windows
 * re-probed all eleven routes — the shape of the **122.65 s** `/gui/sections` outlier.
 *
 * The corrected statement, which the code now keeps: **the outcomes are collected in ONE
 * concurrent pass per request (`Promise.all` over ten independent providers, each with its
 * own failure boundary), and every window's payload carries the census instant at which its
 * own reading was taken — the catalog is a set of instants that are LABELLED, not one
 * instant.** The advanced provider now shares one in-flight probe batch across its three
 * windows, so those three are one instant.
 */
async function handleGui(
  path: string,
  params: URLSearchParams,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // Trailing slash tolerated: a browser appending one is not asking a different question.
  const normalised = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  const isSections = normalised === GUI_SECTIONS
  const isSection = normalised === GUI_SECTION
  const isHealth = normalised === GUI_HEALTH
  if (!isSections && !isSection && !isHealth) return false

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, {
      ok: false,
      error: `method ${req.method ?? 'unknown'} is not allowed here; this route is read-only`,
      allowed: ['GET'],
    })
    return true
  }

  const now = new Date()

  if (isSection) {
    const requested = params.get('window')
    if (requested === null || requested.length === 0) {
      sendJson(res, 400, {
        ok: false,
        error: 'the query parameter `window` is required',
        route: GUI_SECTION,
        attempted: null,
        knownWindows: WINDOW_IDS,
        why: 'an unknown window is answered with 400 rather than 404, because under this prefix a 404 is indistinguishable from a plugin that is not mounted (D-0071)',
      })
      return true
    }
    if (!isWindowId(requested)) {
      sendJson(res, 400, {
        ok: false,
        error: `unknown window '${requested}'`,
        route: GUI_SECTION,
        attempted: requested,
        knownWindows: WINDOW_IDS,
        why: 'these are the ten window ids from research/meta-market-gui/CONTRACT.md; a 404 here would be indistinguishable from an unmounted plugin (D-0071)',
      })
      return true
    }
    const row = rowFor(requested)
    if (row === undefined) {
      // Unreachable while `isWindowId` and `rowFor` read the same registry, and
      // stated rather than assumed: a divergence between the two is exactly the
      // two-statements-of-one-fact defect this file's path list was fixed for.
      sendJson(res, 500, {
        ok: false,
        error: `registry inconsistency: '${requested}' is a valid WindowId but has no registry row`,
        knownWindows: WINDOW_IDS,
      })
      return true
    }
    const outcomes = await collectOutcomes([requested])
    const outcome = outcomes[0]
    if (outcome === undefined) {
      sendJson(res, 500, { ok: false, error: `no provider outcome produced for '${requested}'`, knownWindows: WINDOW_IDS })
      return true
    }
    sendJson(res, 200, { ok: true, ...buildEnvelope(row, outcome, now) })
    return true
  }

  const outcomes = await collectOutcomes(WINDOW_IDS)
  // ONE assembly report per request, read from the same function the prefix route
  // uses — so the catalog, the health payload and `/meta-market/api` cannot state
  // three different mounted-ness values. The value is MEASURED (see `readMount`).
  const assembly = await describeAssembly(req)

  if (isSections) {
    sendJson(res, 200, {
      ok: true,
      ...buildSections(outcomes, now),
      rail: { primary: PRIMARY_IDS, advanced: ADVANCED_IDS },
      assembly: { id: assembly.id, kind: assembly.kind, mounted: assembly.mounted, mount: assembly.mount },
    })
    return true
  }

  sendJson(res, 200, { ok: true, ...buildHealth(outcomes, assembly, REGISTERED_PATHS, providerTable(), now) })
  return true
}

/**
 * THE THREE REPORT-ONLY LANE SURFACES, AND WHY THEY ARE REPORTS.
 *
 * `alignment`, `dialogue` and `identity` each export a real barrel — the module
 * that DECLARES their public surface. So each gets a route. But the route returns
 * that lane's **declared constants and its honest state**, and it does NOT accept
 * an input and run the lane, for a reason that is measured rather than stylistic:
 *
 *   - `alignment`'s `alignPackage(input)` needs a **live intent index**. `census.ts`
 *     exports `LIVE_CATALOG_NOT_MEASURED` — the lane's own name for the fact that
 *     the live catalog has NOT been read at serve time. A route that ran
 *     `alignPackage` here would have to either invent an index or read one at
 *     request time; inventing is a fabrication and reading it per request puts an
 *     unmeasured dependency in a boot-time-registered handler.
 *   - `dialogue`'s decision path goes through `decideByLaya` to a **local Laya
 *     endpoint**. That is a model call, and this assembly is registered at boot by
 *     a Cordis plugin that must not reach a device — the standing rule is that
 *     **no plugin in this program opens a device or talks to a model**; the models
 *     are served by `llama.cpp` beside the harness. A route wired to `decideByLaya`
 *     would put a model dependency behind an HTTP GET.
 *   - `identity`'s `readInstanceIdentity` reads `~/.dsh/.anonymous-user-id`, which
 *     this deployment measured as a **37-byte bare UUID** — an identifier with no
 *     key. Publishing it over HTTP is neither needed nor harmless, so the route
 *     reports the VOCABULARY and the trust stages and **does not echo the id**.
 *
 * **Every row below is a constant that the lane itself exports**, so this route is
 * a PIPE and not an opinion: if a lane changes its threshold, its vocabulary or
 * its phases, this surface changes with it and no edit here is required. That
 * property is the whole justification for reporting rather than re-deriving.
 *
 * **THE HONEST DEGRADATION IS THE POINT.** A reader who hits `/api/alignment` gets
 * the threshold and the measured separation and the explicit statement that the
 * live catalog is not measured — rather than a plausible score computed from an
 * index nobody read.
 */
function alignmentReport(): Record<string, unknown> {
  return {
    lane: 'alignment',
    kind: 'plan',
    threshold: { name: ALIGN_THRESHOLD, value: ALIGN_THRESHOLD_VALUE, standing: 'PROVISIONAL / PROGRAM CHOICE' },
    measuredSeparation: MEASURED_SEPARATION,
    liveCatalog: LIVE_CATALOG_NOT_MEASURED,
    intentMapRoutes: INTENT_MAP_ROUTES,
    evidence: laneEvidence(),
    /**
     * CORRECTED 2026-10-16 after `intent-alignment` reported this string stale (`task-16`, §8).
     * It read: *"alignPackage(input) is NOT called here: it needs a live intent index, and this
     * lane reports LIVE_CATALOG_NOT_MEASURED rather than an index nobody read."*
     *
     * **The first clause is still true of this route; the REASON was false.** The lane then READ
     * an index from disk (233,992 B, 24 vectors x 1024) and it produced real verdicts — so an
     * index on disk is SUFFICIENT, and "it needs a live index" tells a reader the operation is
     * blocked when it is only unwired. `LIVE_CATALOG_NOT_MEASURED` was never the obstacle; it is
     * a statement about the CATALOG, not about the index.
     *
     * **This is `D-0073`'s shape on my own file, and the lane that caught it was reading its own
     * surface back rather than trusting mine.** A `notDone` may state what a route does not do.
     * It may not supply a cause that is not the cause.
     *
     * AND THE RUN REPLACED THE NUMBER I PUBLISHED HERE. `MEASURED_SEPARATION` (0.215) was fitted
     * on a thin population; the lane's six-phrasing run measured a spread of **0.225753 — WIDER
     * than the separation the threshold was fitted to** — so `threshold.standing` above is
     * PROVISIONAL for a measured reason rather than a disclaimer. Read the lane's §5 and §15.
     */
    notDone: 'This ROUTE does not call alignPackage and serves no alignment verdict. That is an UNWIRED route, not a missing capability: the lane has run the operator end to end against an index read from disk. It does NOT call it because a GET must not spend an embedding call, and because the threshold below is PROVISIONAL — see the lane record before relying on any verdict it reports.',
  }
}

function dialogueReport(): Record<string, unknown> {
  return {
    lane: 'dialogue',
    kind: 'plan',
    moves: DIALOGUE_MOVES,
    livePhases: LIVE_PHASES,
    terminalPhases: TERMINAL_PHASES,
    refusalCodes: REFUSAL_CODES,
    abstentionReasons: ABSTENTION_REASONS,
    bounds: DEFAULT_BOUNDS,
    threeKinds: THREE_KINDS,
    unmeasuredConfidence: UNMEASURED_CONFIDENCE,
    laya: { endpoint: DEFAULT_LAYA_ENDPOINT, route: DECISION_ROUTE },
    /**
     * CORRECTED 2026-10-16T18:0xZ after `verifier` falsified the previous wording,
     * which read: *"decideByLaya is NOT reachable here: it is a model call, and no
     * plugin in this program opens a device or talks to a model (llama.cpp serves
     * the models beside the harness)."*
     *
     * **The first clause was true and the JUSTIFICATION was false, which is the
     * worse half to get wrong.** `decideByLaya` IS exported by this lane's own
     * barrel (`dialogue/index.ts`), it DOES open a socket (`dialogue/laya.ts`:
     * `await fetch(url, …)`), and **the lane's own shipped check drives it live
     * against `127.0.0.1:8008`.** So the claim that no plugin here talks to a model
     * was false about this very lane, and it was the sentence a reader would use to
     * decide what this program is permitted to do.
     *
     * The accurate statement separates three facts: this ROUTE does not call it;
     * this PLUGIN's barrel does export it; and the LANE's harness does drive it
     * live. **A `notDone` may say what this route does not do. It may not assert a
     * program-wide prohibition that its own lane's tests contradict.**
     */
    notDone: 'This ROUTE does not call decideByLaya and serves no decision. That is not because the call is unavailable — dialogue/laya.ts opens a socket to the local Laya endpoint and the lane its own harness drives it live (see laya.endpoint below). It is because this route is a read-only report: an HTTP GET must not be able to spend a model call, so no decision path is reachable FROM THIS SURFACE.',
  }
}

/**
 * THE SET-TO-ARRAY BOUNDARY, AND IT IS NOT COSMETIC.
 *
 * `JSON.stringify` serialises a `Set` as **`{}`** — not as an array, and not as an
 * error. Measured on this build: `AUTHENTICATED_CAPABILITY_TOKENS` is a
 * `ReadonlySet<string>` with members, and it appeared in this surface as
 * **`absent`** because `{}` has no `length`. So the route published an **empty
 * object where the lane declares a populated set**, and a reader would conclude
 * the vocabulary was empty — **a case of this program's own absent-versus-empty
 * trap, arriving through the serialiser rather than through a `|| 0`.**
 *
 * It was caught by assertion `G5`, which asserted the field was an ARRAY, so this
 * is the harness doing its job rather than a near miss. The general guard: **any
 * `Set` or `Map` crossing an HTTP boundary must be converted explicitly**, because
 * the failure is silent and the result is indistinguishable from a genuinely empty
 * collection.
 *
 * Converted HERE rather than in `capability-vocabulary.ts`: those two declarations
 * are that lane's public surface and are correctly typed as sets for their own
 * use. Changing them to arrays to suit this consumer would be the assembly
 * editing a lane to fit its own transport — the same error this file refuses when
 * it declines to invent a route table for a lane that declares none.
 */
function setToSortedArray(value: ReadonlySet<string>): readonly string[] {
  return Object.freeze([...value].sort())
}

function identityReport(): Record<string, unknown> {
  return {
    lane: 'identity',
    kind: 'plan',
    trustStages: TRUST_STAGES,
    trustStoreFile: TRUST_STORE_FILE,
    vocabulary: VOCABULARY_CENSUS,
    declaredCapabilityTokens: setToSortedArray(DECLARED_CAPABILITY_TOKENS),
    authenticatedCapabilityTokens: setToSortedArray(AUTHENTICATED_CAPABILITY_TOKENS),
    credentialRedLineMarkers: CREDENTIAL_RED_LINE_MARKERS,
    networkRedLineMarkers: NETWORK_RED_LINE_MARKERS,
    authenticated: false,
    notDone: 'readInstanceIdentity is NOT called here and the local id is NOT echoed: this deployment has an identifier and no key, so publishing the identifier proves nothing and leaks a stable handle',
  }
}

/**
 * A lane as this assembly reports it.
 *
 * `kind` is a FIELD and not a comment, because a lane that is a plan must not be
 * readable as an existence claim. `mounted` is separate from `kind` for the same
 * reason a file's presence is separate from its validity. `wired` is a THIRD
 * separate fact: a lane can be written, correct, and not yet answering over HTTP,
 * and collapsing `wired` into either of the other two is how "we have an API" gets
 * said about a function nobody can call.
 */
export interface LaneReport {
  readonly id: string
  readonly kind: 'exists' | 'plan' | 'future'
  /**
   * MEASURED at request time from the profile manifest, never a literal.
   *
   * `null` means the manifest could not be found or read — NOT MEASURED — and is
   * distinct from `false`, which is a reading that the package is not listed.
   */
  readonly mounted: boolean | null
  /** Whether this lane answers over the prefix, as opposed to exposing functions only. */
  readonly wired: boolean
  /** Present whenever `wired` is false, so a gap is stated rather than inferred. */
  readonly why?: string
  readonly summary: string
}

/**
 * A lane row WITHOUT `mounted`, because mounted-ness is a property of the PACKAGE
 * and not of the lane.
 *
 * The rows below used to carry `mounted: false` individually, which was six
 * copies of one fact — and when the fact changed, six literals went stale at once
 * while the payload kept claiming the package was not mounted. **That is the
 * caption-versus-check trap in its purest form: a printed value no assertion
 * reads.** So the field is now attached by `describeAssembly()` from a probe of
 * the profile manifest, and a lane row cannot state it at all.
 */
export type LaneRow = Omit<LaneReport, 'mounted'>

/**
 * The lanes as they stand.
 *
 * **THIS ARRAY IS A VERIFIED (read) CLAIM, NOT A VERIFIED (ran) ONE, AND SAYING
 * SO IS THE POINT.** Each row was established by reading the lane's own barrel and
 * research record, and each cites the file it came from in `evidence` so a reader
 * can audit the claim instead of taking this array on trust. It is deliberately NOT
 * computed by scanning `src/host/**` at boot: a boot-time scan would report a lane
 * that failed to compile as merely ABSENT, which is precisely the distinction the
 * array exists to preserve.
 *
 * **CORRECTED 2026-10-17T14:5xZ — THIS PARAGRAPH USED TO SAY *"`mounted: false` on
 * every row is not pessimism. No profile manifest consumes this package."* THAT
 * WAS FALSE, and it was false for a day while the payload published it.**
 * Measured by `lead` at `2026-10-17T14:51:53Z`: pid 24760 (StartTime unchanged
 * `12:56:16.396 -07:00`) answers SEVEN of the advertised paths with 200, and
 * `profiles-tree/personal-dev/package.json` names this package at
 * `dependencies.dsh-meta-market` AND inside `dsh.profile.bundles`. The package IS
 * consumed and IS mounted; the surface said otherwise because the value was a
 * LITERAL. It is now read from that manifest on every request (see `readMount`),
 * so it cannot go stale without the manifest changing under it.
 */
export const LANE_ROWS: readonly LaneRow[] = Object.freeze([
  { id: 'identity', kind: 'plan', wired: true, summary: 'peer identity, capability vocabulary and the local-record admission rule; the trust root kind is plan because this deployment has an identifier and no key' },
  { id: 'dialogue', kind: 'plan', wired: true, summary: 'bounded, refusable dialogue whose two confidence quantities are distinct types that cannot be compared against one threshold' },
  { id: 'alignment', kind: 'plan', wired: true, summary: 'alignment of meta-packages to the 24-zone intent map; threshold 0.6605, provisional, with a named must-REFUSE control' },
  { id: 'patch', kind: 'plan', wired: true, summary: 'verify-before-apply with a seven-entry blindness register returned as a VALUE on every verdict, pass or fail; its nine routes are dispatched from its own table below' },
  { id: 'safety', kind: 'plan', wired: true, summary: '22 enumerated threats, the union privilege gate, and replay and budget controls; every control governs consistency rather than authenticity' },
  { id: 'social', kind: 'plan', wired: true, summary: 'DHT discovery on (zoneId, bucket) with epidemic convergence; global traffic O(N), linear, with the O(N-squared) roster shape named and declined' },
])

/** Where each claim above can be checked, so the reporting surface is auditable. */
export const LANE_EVIDENCE = Object.freeze({
  identity: 'research/meta-market-identity-trust.md',
  dialogue: 'research/meta-market-dialogue.md',
  alignment: 'research/meta-market-alignment.md',
  patch: 'research/meta-market-patches.md',
  safety: 'research/meta-market-safety.md',
  social: 'research/meta-market-social.md',
})

/**
 * ============================================================================
 * MOUNTED-NESS, MEASURED AT REQUEST TIME — and the literal it replaces
 * ============================================================================
 *
 * This file used to publish `mounted: false` as a LITERAL, and a doc comment
 * beside it explained the literal as a fact: *"no profile manifest consumes this
 * package"*. Both were published for a day and both were wrong. `lead` measured
 * at `2026-10-17T14:51:53Z` that pid 24760 (same StartTime `12:56:16.396 -07:00`,
 * so the process had not restarted) answers SEVEN advertised paths with `200`,
 * and `profiles-tree/personal-dev/package.json` names this package twice —
 * `dependencies["dsh-meta-market"] = "link:../../plugins-src/dsh-meta-market"` and
 * `dsh.profile.bundles` containing `"dsh-meta-market"`.
 *
 * **The lesson is not "write true instead of false".** A new literal goes stale
 * the same way, and the next reader has no way to tell a measurement from a
 * caption. So mounted-ness is DERIVED from a read of the manifest on every
 * request, the reading's inputs are published beside the verdict, and a manifest
 * that cannot be found or parsed yields `null` — NOT MEASURED — never `false`.
 *
 * WHY THE MANIFEST IS FOUND BY WALKING UP AND NOT BY A PATH CONSTANT
 *
 * The plugin is consumed through a relative `link:` from the profile, so the two
 * live in one tree but neither can name the other's absolute path portably. The
 * walk starts at this module's own directory (which is `lib/` in the bundle and
 * `src/host/` under a source drive) and looks for the profile at the fixed
 * relative shape `profiles-tree/personal-dev/package.json`, giving up after
 * `MOUNT_SEARCH_DEPTH` levels. A give-up is reported as an absence with the
 * directory it searched, so "not measured" never reads as "not mounted".
 */
const MOUNT_PACKAGE = 'dsh-meta-market'
const MOUNT_SEARCH_DEPTH = 8

/** What the manifest read establishes, with every field it was derived from. */
export interface MountReading {
  readonly mounted: boolean | null
  readonly manifestPath: string | null
  readonly manifestBytes: number | null
  readonly linkedInDependencies: boolean | null
  readonly listedInBundles: boolean | null
  readonly bundlesCensus: { readonly entries: number; readonly containsPackage: number } | null
  readonly searchedFrom: string | null
  readonly measuredAt: string
  readonly reason: string | null
}

/** The profile manifest, found by walking up from this module. `null` when it is not there. */
function profileManifestPath(): { path: string | null; searchedFrom: string | null } {
  let dir: string
  try {
    dir = dirname(fileURLToPath(import.meta.url))
  } catch {
    return { path: null, searchedFrom: null }
  }
  const start = dir
  for (let depth = 0; depth < MOUNT_SEARCH_DEPTH; depth += 1) {
    const candidate = join(dir, 'profiles-tree', 'personal-dev', 'package.json')
    if (existsSync(candidate)) return { path: candidate, searchedFrom: start }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { path: null, searchedFrom: start }
}

/**
 * Read the profile manifest and report whether it loads this package.
 *
 * `mounted` means: **the package name is listed in `dsh.profile.bundles`**, which
 * is the list the profile's own loader consumes. Being present in `dependencies`
 * without being bundled is installed-but-unloaded and is reported as
 * `linkedInDependencies: true, mounted: false` — two different facts, kept apart.
 */
export function readMount(now: Date): MountReading {
  const at = now.toISOString()
  const { path, searchedFrom } = profileManifestPath()
  if (path === null) {
    return {
      mounted: null,
      manifestPath: null,
      manifestBytes: null,
      linkedInDependencies: null,
      listedInBundles: null,
      bundlesCensus: null,
      searchedFrom,
      measuredAt: at,
      reason: `NOT MEASURED: no profiles-tree/personal-dev/package.json within ${MOUNT_SEARCH_DEPTH} levels above ${searchedFrom ?? 'an unresolvable module directory'}`,
    }
  }
  try {
    const text = readFileSync(path, 'utf8')
    const manifest = JSON.parse(text) as Record<string, unknown>
    const dependencies = manifest.dependencies
    const linked = dependencies !== null && typeof dependencies === 'object' && MOUNT_PACKAGE in (dependencies as Record<string, unknown>)
    const dsh = manifest.dsh
    const profile = dsh !== null && typeof dsh === 'object' ? (dsh as Record<string, unknown>).profile : null
    const bundles = profile !== null && typeof profile === 'object' ? (profile as Record<string, unknown>).bundles : null
    const list = Array.isArray(bundles) ? bundles.filter((entry): entry is string => typeof entry === 'string') : null
    const listed = list === null ? null : list.includes(MOUNT_PACKAGE)
    return {
      mounted: listed,
      manifestPath: path,
      manifestBytes: Buffer.byteLength(text),
      linkedInDependencies: linked,
      listedInBundles: listed,
      bundlesCensus: list === null ? null : { entries: list.length, containsPackage: list.includes(MOUNT_PACKAGE) ? 1 : 0 },
      searchedFrom,
      measuredAt: at,
      reason:
        listed === null
          ? `NOT MEASURED: ${path} has no dsh.profile.bundles array, so bundle membership cannot be read`
          : listed
            ? null
            : `READ: ${path} does not list ${MOUNT_PACKAGE} in dsh.profile.bundles`,
    }
  } catch (error) {
    return {
      mounted: null,
      manifestPath: path,
      manifestBytes: null,
      linkedInDependencies: null,
      listedInBundles: null,
      bundlesCensus: null,
      searchedFrom,
      measuredAt: at,
      reason: `NOT MEASURED: ${path} could not be read — ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * THE SELF-PROBE HEADER, AND WHY IT EXISTS RATHER THAN A TIMEOUT GUARD
 *
 * `mounted` and `kind` are derived from a LIVE fetch of this plugin's own prefix
 * (`lead`'s ruling, `D-0244`). That fetch is a request into the same handler, so
 * without a stop condition it recurses: assembling a payload would probe, the
 * probe would assemble a payload, and so on until the stack or the timeout ended
 * it. The stop condition is a header: **any request carrying `x-mmg-selfprobe`
 * answers a fixed minimal body and never reaches the assembly.** A header rather
 * than a path so the advertised route set does not grow to accommodate an
 * instrument, and rather than a module flag because a flag is per-process state
 * that two concurrent requests would share.
 *
 * There is a second, quieter benefit: the short-circuit carries no assembly, so a
 * probe measures ROUTING — does a request to this prefix reach this plugin — and
 * not the data, and a probe that fails therefore cannot look like a data problem.
 */
const SELF_PROBE_HEADER = 'x-mmg-selfprobe'

/** How long a self-probe may take before it is reported as NOT MEASURED. Short: it is loopback. */
const SELF_PROBE_TIMEOUT_MS = 400

/**
 * What a live probe established. `null` status means the probe was NOT MEASURED —
 * a timeout, a refused connection or an origin that could not be determined — and
 * is never collapsed into `404`, because "there was no server to ask" and "the
 * server said no such route" are opposite facts.
 */
export interface ServedReading {
  readonly origin: string | null
  readonly prefixStatus: number | null
  readonly guiStatus: number | null
  readonly at: string
  readonly reason: string | null
  readonly timeoutMs: number
}

/** One GET against this plugin's own prefix, with the self-probe header set. */
async function probeStatus(origin: string, path: string): Promise<number | null> {
  try {
    const response = await fetch(origin + path, {
      headers: { [SELF_PROBE_HEADER]: '1' },
      signal: AbortSignal.timeout(SELF_PROBE_TIMEOUT_MS),
    })
    // The body is drained so the connection is released; its content is never read.
    await response.arrayBuffer()
    return response.status
  } catch {
    return null
  }
}

/**
 * Probe the deployment this request arrived on.
 *
 * The origin is the incoming `Host` header, so the probe asks THE SERVER THAT IS
 * ALREADY ANSWERING — not a hard-coded port. That matters because this plugin can
 * be mounted on any port, and a hard-coded `127.0.0.1:3083` would make the reading
 * describe somebody else's process.
 *
 * TWO PROBES, TWO QUESTIONS, AND THEY ARE ALLOWED TO DISAGREE:
 *   - `prefixStatus` asks whether the prefix is registered — the MOUNT question.
 *   - `guiStatus` asks whether THIS BUILD's GUI surface is live — the FRESHNESS
 *     question, and the one that distinguishes "mounted with an older body" from
 *     "mounted with this body". A process that loaded yesterday answers 200 to the
 *     first and 404 to the second, which is precisely the state the owner's live
 *     session is in.
 */
export async function readServed(req: IncomingMessage, now: Date): Promise<ServedReading> {
  const host = req.headers.host
  const at = now.toISOString()
  if (typeof host !== 'string' || host.length === 0) {
    return { origin: null, prefixStatus: null, guiStatus: null, at, reason: 'NOT MEASURED: the request carried no Host header, so there is no origin to probe', timeoutMs: SELF_PROBE_TIMEOUT_MS }
  }
  const origin = `http://${host}`
  const [prefixStatus, guiStatus] = await Promise.all([probeStatus(origin, PREFIX), probeStatus(origin, GUI_HEALTH)])
  const measured = prefixStatus !== null || guiStatus !== null
  return {
    origin,
    prefixStatus,
    guiStatus,
    at,
    reason: measured ? null : `NOT MEASURED: neither ${PREFIX} nor ${GUI_HEALTH} answered ${origin} within ${SELF_PROBE_TIMEOUT_MS}ms`,
    timeoutMs: SELF_PROBE_TIMEOUT_MS,
  }
}

/**
 * The assembly's own report.
 *
 * `authenticated: false` is a CONSEQUENCE of three independent measurements, not
 * a disclaimer, and the reference to each is carried beside it. Three lanes
 * reached the same structural finding from three different instruments:
 * `identity-trust` measured that `~/.dsh/.anonymous-user-id` is a 37-byte bare
 * UUID and that no signing primitive appears in any non-test source file;
 * `safety-gate` concluded that every control in its lane governs CONSISTENCY and
 * not AUTHENTICITY; `patch-distribution` found that the protocol declares no
 * signature field at all, so an admitted envelope was INSPECTED and never PROVEN.
 * One measurement is a finding; three instruments agreeing is a fact about the
 * build.
 *
 * @returns the report object, ready to serialise.
 */
export async function describeAssembly(req?: IncomingMessage): Promise<Record<string, unknown>> {
  const now = new Date()
  const mount = readMount(now)
  const served = req === undefined
    ? {
        origin: null,
        prefixStatus: null,
        guiStatus: null,
        at: now.toISOString(),
        reason: 'NOT MEASURED: no request was supplied to the assembler, so there was no origin to probe',
        timeoutMs: SELF_PROBE_TIMEOUT_MS,
      }
    : await readServed(req, now)

  /**
   * `mounted` IS THE COMPOSITE `lead` RULED FOR (`D-0244`): the package must be
   * DECLARED in the profile's `dsh.profile.bundles` **and** the prefix must ANSWER
   * a live fetch with something other than 404. Either half alone is a weaker
   * claim than the word "mounted" carries:
   *   - declared but unmeasured  → somebody edited a manifest, nobody proved a load;
   *   - answering but undeclared → something is serving, but not necessarily from
   *     the profile the user thinks is running.
   * When either half could not be measured the composite is `null`, NOT `false`,
   * and `mount.reason` / `served.reason` say which half was missing.
   */
  const mounted: boolean | null =
    mount.listedInBundles === null || served.prefixStatus === null
      ? null
      : mount.listedInBundles && served.prefixStatus !== 404

  /**
   * `kind` IS DERIVED, from ONE measurement: does the live deployment serve THIS
   * BUILD's GUI surface (`/gui/health`, which exists only in a bundle built after
   * 2026-10-17T21:5xZ)?
   *
   * That question is chosen because it is the only one that separates the two
   * states that look identical from outside: a process that loaded an OLDER body
   * of this plugin answers 200 on the prefix and 404 on the GUI routes, so calling
   * its state "exists" would be a claim about code that process is not running.
   * When the probe was not measured the value stays `plan` — the non-claiming
   * direction — and `served.reason` says the measurement is missing.
   */
  const kind = served.guiStatus === 200 ? 'exists' : 'plan'

  const wired = LANE_ROWS.filter((lane) => lane.wired).length
  // PER-LANE ROUTE COUNT, NOT A SHARED CONSTANT. This previously reported
  // `PATCH_ROUTES.length` for EVERY wired lane, which was correct only while
  // `patch` was the only one. `patch` dispatches its own nine-row table; each of
  // the other five serves exactly one route. Reporting nine for `alignment` would
  // have been a number that is right for another lane.
  const transport = LANE_ROWS.filter((lane) => lane.wired).map((lane) => ({
    lane: lane.id,
    routes: lane.id === 'patch' ? PATCH_ROUTES.length : 1,
    kind: lane.id === 'patch' ? 'dispatched-table' : 'report-only',
  }))
  return {
    id: 'dsh-meta-market',
    /**
     * DERIVED, NOT WRITTEN (`D-0244`). `kind` is `exists` only when the live
     * deployment serves THIS BUILD's `/gui/health` with 200. Today, against the
     * owner's running process, the probe answers 404 because that process loaded
     * an older body, so `kind` reads `plan` — and it will read `exists` on the
     * first request after the restart WITHOUT AN EDIT HERE. That is the property
     * the old literal lacked: this value cannot go stale, only unmeasured.
     */
    kind,
    /**
     * DERIVED, NOT WRITTEN. The composite of the manifest read (`mount`) and the
     * live probe (`served`); both readings are published beside it so a reader can
     * audit the verdict instead of trusting a boolean.
     */
    mounted,
    mount,
    /**
     * REPLACED 2026-10-17 — this field used to be `notServed` and read *"THIS
     * SURFACE HAS NEVER ANSWERED ON A PORT … `personal-dev/package.json` contains
     * 0 references to this package"*. **Both clauses were false and had been
     * published on a live route for a day** (`lead`, `2026-10-17T14:51:53Z`: seven
     * advertised paths answered 200 on pid 24760 with an unchanged StartTime, and
     * the manifest contains two references).
     *
     * `served` is now a REAL measurement made by this handler: two self-probes of
     * the origin the request arrived on (see `readServed`), separated because they
     * answer different questions — `prefixStatus` is the MOUNT question, `guiStatus`
     * is the FRESHNESS question. `null` on either is NOT MEASURED and is never
     * collapsed into a status code.
     */
    served,
    noUserAttached: 'THE INTENT MAP IS NOT ATTACHED TO A USER. The map this plugin aligns against is a map of the PLUGIN MARKET rather than of a person: its 24 vectors are keyed to ZONE ids, it holds no userId/sessionId, its `owner` fields name 565 plugin AUTHORS, and the only user-shaped file on this deployment is `.anonymous-user-id` — anonymous by its own name. So the owner\'s precondition "intent of user is already formed" fails as a precondition ON THIS ARTIFACT, and it is NOT an absence of the person from the system.',
    /**
     * The scope boundary above is LOAD-BEARING and was added after `identity-trust` falsified the
     * first version of that string (`task-19`, reported not fixed because this is the Lead's file).
     *
     * It read: "NO USER IS ATTACHED TO THIS SYSTEM." Measured against the session store, that
     * absolute is FALSE: frame-walking the multi-frame zstd logs finds `user/message` records in
     * 12 of 12 sampled logs. THE USER IS PRESENT IN THE SYSTEM AND ABSENT FROM THE MAP, and the
     * distinction inverts the finding's shape — an ABSENCE cannot be closed, a GAP can.
     *
     * AND THIS FILE ALREADY OWNS THE BOUNDARY IT NEEDED: `kind` is `exists` / `plan` / `future`,
     * and the scoped claim is `kind: plan` ON THE MAP rather than an absence claim about the
     * system. A finding that reads as "the user is not there" cannot be acted on; one that reads
     * "the user is not THERE, and the raw material to derive them IS" names a buildable gap.
     * `identity-trust` measured that raw material rather than asserting it: 555 user/message
     * records, in 12 of 12 sampled logs, out of 14,195 records (SAMPLE, not a census).
     */
    noOtherMetaPlugins: 'THE OTHER META PLUGINS ARE NOT ESTABLISHED. A scoped census finds exactly 1 `dsh-meta-*` clone on this machine and it IS this plugin, against a denominator of 28 clones — so the owner\'s phrase "the other meta plugins are established" is self-referential and unsatisfiable as written, and the two named alternatives are `future` goals that remain forbidden.',
    noTotalAlignment: 'NO OBJECT EXISTS FOR "manage the TOTAL system alignment". There is no aggregate over peers anywhere in `src/host/**`: `alignment/` exports per-item operations and `social/` has `peerPairAlignment` (exactly two peers) and `quorumBound` (one instance). The missing component is `aggregateAlignment(perPeer, census)`, and a "total" over a FLOOR of 387 witnessed of 100,000 peers is a total over 0.387% and must be labelled one.',
    specVersion: SPEC_VERSION,
    stepVersion: STEP_VERSION,
    prefix: PREFIX,
    authenticated: false,
    authenticationEvidence: [
      'research/meta-market-identity-trust.md — 37-byte bare UUID and no signing primitive in any non-test source file',
      'research/meta-market-safety.md — controls govern consistency, not authenticity',
      'research/meta-market-patches.md — B1: the protocol declares no signature field, so an admitted envelope is inspected, not proven',
    ],
    lanes: LANE_ROWS.map((lane) => ({ ...lane, mounted, evidence: LANE_EVIDENCE[lane.id as keyof typeof LANE_EVIDENCE] ?? null })),
    /**
     * THE WIRING CENSUS, with its denominator. Six lanes exist; some number of
     * them answer over this prefix. Reporting the numerator alone would let a
     * reader assume the rest, so both are stated — and neither is a zero, so this
     * is a reading rather than an instrument failure.
     */
    wiring: {
      wired,
      lanes: LANE_ROWS.length,
      transport,
      note: 'a lane that is not wired is not thereby absent; it exposes typed functions and this assembly does not invent a route table for it',
    },
  }
}

/** JSON, with `no-store`, so a cached read can never be mistaken for a fresh one. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** Read the request body, bounded, and never throwing on a malformed payload. */
async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > limit) return { __unreadable: `request body exceeded ${limit} bytes` }
    chunks.push(buf)
  }
  if (size === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return { __unreadable: 'request body was not valid JSON' }
  }
}

/**
 * Handle one request under the prefix.
 *
 * A non-GET on a read-only route is `405` rather than a silent success, and an
 * unknown path is `404` with the attempted path and the REAL path set echoed.
 * Both are deliberate: a control surface that answers `200` to a typo teaches the
 * user that a thing exists when it does not.
 *
 * `patch`'s own table decides `405` versus dispatch for its nine sub-paths — this
 * function forwards the method verbatim rather than second-guessing it, because
 * `dispatch` already returns the `allowed` list and a second opinion here would be
 * the assembly overriding a lane about its own surface.
 *
 * @param req - the incoming request.
 * @param res - the response to write.
 */
export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  /**
   * THE SELF-PROBE STOP CONDITION, FIRST STATEMENT IN THE HANDLER.
   *
   * Assembling an assembly report probes this plugin's own prefix, and the probe
   * arrives at this same handler. Without this branch the first probe would
   * assemble another report, which would probe again. The branch is deliberately
   * the first thing here rather than inside a route: a stop condition that depends
   * on which path was asked for is a stop condition that can be bypassed by the
   * one path it does not know about.
   */
  if (req.headers[SELF_PROBE_HEADER] !== undefined) {
    sendJson(res, 200, { ok: true, selfProbe: true, at: new Date().toISOString() })
    return
  }

  const url = new URL(req.url ?? '/', 'http://dsh.invalid')
  const path = url.pathname

  if (path === PREFIX || path === `${PREFIX}/` || path === `${PREFIX}/lanes`) {
    if (req.method !== 'GET') {
      sendJson(res, 405, {
        ok: false,
        error: `method ${req.method ?? 'unknown'} is not allowed here; this route is read-only`,
        allowed: ['GET'],
      })
      return
    }
    sendJson(res, 200, { ok: true, assembly: await describeAssembly(req) })
    return
  }

  // THE THREE REPORT-ONLY LANE SURFACES. Each returns constants its own lane
  // exports, plus a `notDone` naming the operation the route deliberately does NOT
  // perform and why. A route that reported a threshold without saying which
  // operation it therefore cannot serve would be read as a working API.
  // THE HOSTING LEDGER. Its own branch rather than a row in the reports table
  // below, for two reasons: it needs the SHARED registry instance (the same one
  // the six provider lanes read, so the meta-market does not grow a second
  // inventory of the same machine), and it probes the live origin once per process
  // — which is a memoised cost, not a per-request one, and a reports-table entry
  // would hide that behind a signature that reads as pure.
  if (path === HOSTING) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, {
        ok: false,
        error: `method ${req.method ?? 'unknown'} is not allowed here; this route is read-only`,
        allowed: ['GET'],
      })
      return
    }
    const registry = await getRegistry()
    const report = await getHostingReport(registry)
    sendJson(res, 200, { ok: true, ...report })
    return
  }

  // THE FIVE LANE SURFACES. Four return a plain object; `social` returns a
  // PROMISE, because its own barrel declares `async describeSurface()`. **That
  // asymmetry is a real hazard and it is worth naming: an un-awaited promise
  // serialises to `{}` — the same silent-empty shape as a `Set`, and it would have
  // looked exactly like a lane with nothing to report.** The registry therefore
  // holds `unknown` rather than a narrowed object type and every value is awaited
  // before it is serialised, so a lane that later becomes async does not silently
  // start serving an empty body.
  const reports: Record<string, () => unknown> = {
    [`${PREFIX}/alignment`]: alignmentReport,
    [`${PREFIX}/dialogue`]: dialogueReport,
    [`${PREFIX}/identity`]: identityReport,
    [`${PREFIX}/safety`]: describeSafety,
    [`${PREFIX}/social`]: describeSocial,
  }
  const report = reports[path]
  if (report !== undefined) {
    if (req.method !== 'GET') {
      sendJson(res, 405, {
        ok: false,
        error: `method ${req.method ?? 'unknown'} is not allowed here; this route is read-only`,
        allowed: ['GET'],
      })
      return
    }
    const payload = await report()
    sendJson(res, 200, { ok: true, ...(payload as Record<string, unknown>) })
    return
  }

  // THE GUI WINDOW SURFACE. Handled BEFORE the patch lane's dispatch, because the
  // patch lane answers `null` for paths it does not own and the 404 below would
  // then be the GUI routes' answer instead of the GUI routes themselves.
  if (await handleGui(path, url.searchParams, req, res)) return

  // ANY OTHER PATH UNDER THE PREFIX IS OFFERED TO THE PATCH LANE FIRST. The lane's
  // path is passed WITHOUT the prefix, which is the contract its `RouteRequest`
  // documents; a leading-slash mismatch here would 404 a route that exists.
  const relative = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : null
  if (relative !== null && relative.startsWith('/')) {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
    const outcome = dispatchPatch({ method: req.method ?? 'GET', path: relative, body })
    if (outcome !== null) {
      sendJson(res, outcome.status, outcome.body)
      return
    }
  }

  sendJson(res, 404, {
    ok: false,
    error: 'no such route in this clone',
    attempted: path,
    registered: REGISTERED_PATHS,
  })
}
