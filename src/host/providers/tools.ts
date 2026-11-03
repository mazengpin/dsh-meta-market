/**
 * `meta-tools` — the tools/skills META LAYER that exists on this machine today.
 *
 * WHAT THIS WINDOW IS FOR, and what it refuses to be. The owner's mission names
 * "Meta-tools" as a tab, which is a claim that a tools meta layer exists. It does:
 * `dsh-tools-skills-evolve` carries an evolution loop whose round 3 produced a
 * meta-TOOL, and `dsh-skill-evolution` / `dsh-skill-generator` are the two skill
 * plugins the layer sits on. So this window reports those, with the measurement
 * that backs each one — a probed route with its status and byte count, or the
 * checkout path with its file census.
 *
 * **IT DOES NOT RE-DERIVE A PUBLISHED NUMBER.** `research/tools-skills-meta.md`
 * and `research/obj1-evolve-iterations.md` already measured the rounds, the
 * grades and the knob flips; re-running those instruments here would give two
 * instruments for one fact, which is how this program has produced confident
 * disagreements. The citations are named per row, and this file measures only
 * what those documents do NOT own: the LIVE route status and bytes, the checkout
 * file census, and whether the surface is answering right now.
 *
 * **THE ABSENT FIELDS ARE THE POINT.** `downloadable` is `null` on every row,
 * because this window does not consult the market catalog — `catalog-inventory`
 * owns that read, and a second catalog instrument is a second answer to one
 * question. `null` here means NOT MEASURED by this window; it never means
 * "not downloadable".
 *
 * @module dsh-meta-market/host/providers/tools
 */

import { existsSync, readdirSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'

import type { Census, Control, Falsifier, ProviderWindow, WindowId, WindowItem } from '../types.ts'
import { PROVIDER_PROBE_BOUND_MS, PROVIDER_PROBE_BOUND_RULE, probeBoundMs } from '../types.ts'

/** The window this module answers for. `surface-host`'s assembly fills the rest of the envelope. */
export const WINDOW_ID = 'meta-tools' as const

/**
 * The owner's live session. Probed, never written: the one writable surface here is
 * driven locally instead.
 *
 * **OVERRIDABLE SO THE DEGRADED PATH CAN BE TESTED RATHER THAN ARGUED ABOUT.** A
 * window that is only ever observed healthy cannot show that its `unavailable` means
 * anything, and this program's rule is that a check nobody has ever driven red is a
 * caption. Pointing this at a dead port or a blackhole address is how
 * `verify/tools-skills-census.mjs` proves the rows SURVIVE a failed probe.
 */
const TOOLS_LIVE_BASE = process.env.DSH_META_MARKET_LIVE_BASE ?? 'http://127.0.0.1:3083'

/** Where every clone of this program lives. One constant so a moved tree is one edit. */
const PLUGINS_SRC = 'C:/Users/0000/Projects/deepseek-root/plugins-src'

/** A route probe's result, or the reason there is no result. */
interface ToolsProbe {
	readonly status: number | null
	readonly bytes: number | null
	readonly reason: string | null
	readonly body: unknown
}

/**
 * How long the one live read is given — the ASSEMBLY-WIDE constant, not a local guess.
 *
 * **THE PREVIOUS BOUND WAS 1500 ms AND IT WAS BELOW THE ROUTE'S OWN MINIMUM, so it
 * measured this machine's worst case rather than the route's health.** Measured
 * 2026-10-17T22:10Z, six consecutive reads of the same route against the same
 * process with no code change between them: **1,611 / 1,720 / 1,760 / 1,888 /
 * 2,083 / 3,999 ms**, every one `200` and every one `26,067 B`. The FLOOR is
 * 1,611 ms and the bound was 1,500 ms, so the probe was a coin-flip instrument, and
 * `meta-tools` duly flickered between `unavailable` and four rows across three
 * drives of one unchanged artifact.
 *
 * **THIS LANE'S SIX MEASUREMENTS AGREE WITH THE SHARED CONSTANT TO WITHIN 1 ms, which
 * is the check that the constant is not just someone else's number.**
 * `probeBoundMs(3999)` = `ceil(3999 × 1.25)` = **4,999 ms**; the assembly-wide
 * `PROVIDER_PROBE_BOUND_MS` is **5,000 ms**. So the shared default is not merely
 * acceptable here — it is this route's own measured bound, rounded up rather than
 * hand-picked, and it is used directly instead of a literal that could drift from
 * the rule. The rule itself is cited, not paraphrased: see `PROVIDER_PROBE_BOUND_RULE`
 * in `../types.ts`, and the falsifier below re-runs the arithmetic against this
 * comment's series.
 */

/**
 * The six readings the bound above was fitted to, kept as data so the arithmetic is
 * checkable rather than recited. `probeBoundMs` is applied to the worst of them by a
 * falsifier, so a reader does not have to trust this comment.
 */
const MEASURED_ROUTE_MS = [1611, 1720, 1760, 1888, 2083, 3999] as const

/**
 * Probe one route on the live server, read-only, with a bounded wait.
 *
 * A timeout is NOT a `404`: `null` + a reason is the honest form, and `D-0071`
 * records why an advertised path that 404s is worse than an absent one. The
 * distinction is enforced by the return type rather than by a caller's memory.
 *
 * @param path route path below the server root, with its leading slash.
 * @param method the HTTP method — labelled rather than assumed, because a GET-only
 * probe is blind to a POST-only route.
 * @returns the measured status and body length, or a reason none was taken.
 */
function probeToolsRoute(path: string, method: 'GET' | 'POST' = 'GET'): Promise<ToolsProbe> {
	return new Promise<ToolsProbe>((resolve) => {
		let settled = false
		const done = (value: ToolsProbe): void => {
			if (settled) return
			settled = true
			resolve(value)
		}
		const req = request(`${TOOLS_LIVE_BASE}${path}`, { method, timeout: PROVIDER_PROBE_BOUND_MS }, (res) => {
			const chunks: Buffer[] = []
			res.on('data', (chunk: Buffer) => chunks.push(chunk))
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8')
				let body: unknown = null
				try {
					body = JSON.parse(text)
				} catch {
					body = null
				}
				done({ status: res.statusCode ?? null, bytes: Buffer.byteLength(text), reason: null, body })
			})
		})
		req.on('timeout', () => {
			req.destroy()
			// The bound is named WITH the reason, so a reader can tell a probe that
			// was given 5 s and got silence from one that was given 1.5 s and was
			// never going to answer in time.
			done({
				status: null,
				bytes: null,
				reason: `\`${method} ${TOOLS_LIVE_BASE}${path}\` did not answer within the ${PROVIDER_PROBE_BOUND_MS} ms bound; no status was read`,
				body: null,
			})
		})
		req.on('error', (error: Error) => {
			done({ status: null, bytes: null, reason: `the probe could not reach ${TOOLS_LIVE_BASE}${path}: ${error.message}`, body: null })
		})
		req.end()
	})
}

/**
 * Count the files in one checkout, excluding the two directories that are not the checkout.
 *
 * `node_modules` and `.git` are EXCLUDED because counting them would make the
 * denominator a function of the install state rather than of the source, and
 * `lib/` build output is REPORTED SEPARATELY rather than folded in: "80 files"
 * that is mostly dependency cache is a number whose population has to be read
 * twice to mean anything.
 *
 * @param root absolute checkout path.
 * @returns file count with the population it was counted over.
 */
function fileCensus(root: string): { readonly count: number | null; readonly population: string } {
	if (!existsSync(root)) {
		return { count: null, population: `files under ${root} (the checkout was ABSENT when this was read)` }
	}
	let count = 0
	const walk = (dir: string): void => {
		let entries: Dirent[]
		try {
			entries = readdirSync(dir, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name === '.git') continue
				walk(join(dir, entry.name))
			} else if (entry.isFile()) {
				count += 1
			}
		}
	}
	walk(root)
	return { count, population: `files under ${root}, excluding node_modules/ and .git/` }
}

/** One row of the plugin's own live queue, reduced to the fields this window reports. */
interface QueueRow {
	readonly name?: unknown
	readonly kind?: unknown
	readonly verdict?: unknown
	readonly promotionStage?: unknown
	readonly passed?: unknown
	readonly total?: unknown
	readonly failing?: unknown
	readonly descriptionLength?: unknown
}

/**
 * Find one row in the live payload by its `name`.
 *
 * The payload is `unknown` all the way down because it crosses an HTTP boundary;
 * every field is read defensively rather than asserted, so a surface that renames
 * a field degrades to an absence instead of throwing inside a provider.
 *
 * @param body parsed live payload, or null.
 * @param name the row's `name`.
 * @returns the row, or null when the payload carries none.
 */
function findToolsRow(body: unknown, name: string): QueueRow | null {
	if (typeof body !== 'object' || body === null) return null
	const proposals = (body as { proposals?: unknown }).proposals
	if (!Array.isArray(proposals)) return null
	for (const row of proposals) {
		if (typeof row === 'object' && row !== null && (row as QueueRow).name === name) return row as QueueRow
	}
	return null
}

/** Read a string field off an untyped row, or say it was not there. */
function text(value: unknown): string {
	return typeof value === 'string' ? value : 'not reported'
}

/** Read a number field off an untyped row, or say it was not there. */
function number(value: unknown): string {
	return typeof value === 'number' ? String(value) : 'not reported'
}

/** The rows this window must be able to name, and the citation that says they exist. */
const META_ARTIFACT = {
	id: 'inspect-and-rewrite-tool-surface',
	// The grade, the length and the criterion vocabulary are CITED, not re-derived.
	citation: 'research/obj1-evolve-iterations.md §2 (meta-tool: 8/8, description 128 ch, operator redescribe) and §1 (R3 3/2/1)',
	emergedIn: 'R3, refined in R4 (research/obj1-evolve-iterations.md §1, R3 2 promoted / 1 refused; R4 "the meta-tool widened again 128 → 182 ch")',
} as const

/**
 * Build the `meta-tools` window.
 *
 * Every measurement is taken at call time and stamped, because this window's
 * subject is a LIVE surface: a route that answered when this file was written and
 * does not answer at read time is a stale claim presented as a current one.
 *
 * @param _windowId the id the assembly asked for. Present for the `ProviderBuild` seam.
 * @returns the provider's contribution to the envelope.
 */
export async function buildWindow(_windowId?: WindowId): Promise<ProviderWindow> {
	const at = new Date().toISOString()

	// ---- the live surface, measured -----------------------------------------
	const stateRoute = '/tools-skills-evolve/api/state'
	const state = await probeToolsRoute(stateRoute)
	const stateLive = state.status === 200

	const metaToolRow = findToolsRow(state.body, META_ARTIFACT.id)
	const queueSize = (() => {
		if (typeof state.body !== 'object' || state.body === null) return null
		const proposals = (state.body as { proposals?: unknown }).proposals
		return Array.isArray(proposals) ? proposals.length : null
	})()

	// ---- the second plugin's channel, measured ------------------------------
	// `/skill-evolution` is a CONNECTION-admission channel: its handler calls
	// `ctx.connection.admit(req)` before method or body handling
	// (`plugins-src/dsh-skill-evolution/plugin.mjs:1647-1652`), so an
	// unauthenticated HTTP probe is refused whatever it asks for. The refusal is
	// MEASURED and its cause is named; it is not silently reported as "absent".
	const evolutionChannel = await probeToolsRoute('/skill-evolution')
	// Method labelled because it MATTERS and because it was checked rather than
	// assumed: the channel is POST-only once admitted, so a GET-only probe could be
	// blind to a route that works — the defect `prov-memory` and `prov-advanced` each
	// hit in their own window this round. Measured BOTH ways here: GET and POST each
	// return 401 12 B `unauthorized`, because `ctx.connection.admit(req)` runs before
	// method handling, so the refusal is method-INDEPENDENT and the GET probe is not
	// an unanswered question.
	const evolutionPost = await probeToolsRoute('/skill-evolution', 'POST')

	// ---- the third plugin, which serves no route ---------------------------
	const generatorRoute = await probeToolsRoute('/skill-generator')

	// ---- checkout censuses --------------------------------------------------
	const evolveCensus = fileCensus(`${PLUGINS_SRC}/dsh-tools-skills-evolve`)
	const evolutionCensus = fileCensus(`${PLUGINS_SRC}/dsh-skill-evolution`)
	const generatorCensus = fileCensus(`${PLUGINS_SRC}/dsh-skill-generator`)

	const items: readonly WindowItem[] = [
		{
			id: 'dsh-tools-skills-evolve',
			name: 'dsh-tools-skills-evolve',
			npm: 'dsh-tools-skills-evolve',
			owner: null,
			kind: 'exists',
			installed: true,
			downloadable: null,
			source: { where: 'installed', route: `GET ${stateRoute}` },
			intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
			alignment: {
				verdict: 'not-measured',
				why: 'the zone classifier is not run by this window; alignment is owned by intent-align\u2019s provider, which reads the Intent Map',
				evidence: stateLive
					? `GET ${TOOLS_LIVE_BASE}${stateRoute} -> HTTP ${state.status}, ${state.bytes} B, ${queueSize ?? 'unknown'} queue row(s), census read at ${at}`
					: `GET ${TOOLS_LIVE_BASE}${stateRoute} did not answer 200 (${state.reason ?? `HTTP ${state.status}`}); the checkout census is ${evolveCensus.count}/{evolveCensus.count} files instead`,
			},
			patch: null,
		},
		{
			id: 'dsh-skill-evolution',
			name: 'dsh-skill-evolution',
			npm: 'dsh-skill-evolution',
			owner: null,
			kind: 'exists',
			installed: true,
			downloadable: null,
			source: { where: 'installed', route: 'GET|POST /skill-evolution (admission-gated; both methods measured 401)' },
			intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
			alignment: {
				verdict: 'not-measured',
				why: 'its channel is admission-gated, so an unauthenticated probe cannot read its state and this window will not forge a credential to do it',
				evidence: `GET ${TOOLS_LIVE_BASE}/skill-evolution -> HTTP ${number(evolutionChannel.status)} ${evolutionChannel.bytes ?? '?'} B; POST ${TOOLS_LIVE_BASE}/skill-evolution -> HTTP ${number(evolutionPost.status)} ${evolutionPost.bytes ?? '?'} B. Both methods are refused IDENTICALLY, which is the reading that makes the GET probe valid: \`ctx.connection.admit(req)\` runs before method handling, so the 401 is an admission refusal from the plugin\u2019s own handler and NOT a 404. Checkout ${evolutionCensus.count} file(s) under ${evolutionCensus.population}`,
			},
			patch: null,
		},
		{
			id: 'dsh-skill-generator',
			name: 'dsh-skill-generator',
			npm: 'dsh-skill-generator',
			owner: null,
			kind: 'exists',
			installed: true,
			downloadable: null,
			source: { where: 'installed' },
			intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
			alignment: {
				verdict: 'not-measured',
				why: 'it is a generator, not a route surface: it has no web route to probe, so its evidence is its checkout census and its frozen grader',
				evidence: `GET ${TOOLS_LIVE_BASE}/skill-generator -> HTTP ${number(generatorRoute.status)} ${generatorRoute.bytes ?? '?'} B (no route registered); checkout ${generatorCensus.count} file(s) under ${generatorCensus.population}`,
			},
			patch: null,
		},
		{
			id: META_ARTIFACT.id,
			name: META_ARTIFACT.id,
			npm: null,
			owner: null,
			kind: 'exists',
			installed: metaToolRow === null ? null : true,
			downloadable: null,
			source: { where: 'installed', route: `GET ${stateRoute}` },
			intent: { zones: [], originalIntent: 'not-measured', collidesWith: [] },
			alignment: {
				verdict: 'not-measured',
				why: 'it is a graded DECLARATION, not a benefit: Q1-Q7 + M1 grade FORM, so "8/8" says it is well-formed, never that it improves anything',
				evidence:
					metaToolRow === null
						? `the live payload at ${stateRoute} carried no row named ${META_ARTIFACT.id} at ${at}, so its grade is CITED from ${META_ARTIFACT.citation} rather than read`
						: `live row: ${text(metaToolRow.verdict)} / ${text(metaToolRow.promotionStage)}, ${number(metaToolRow.passed)}/${number(metaToolRow.total)} criteria, description ${number(metaToolRow.descriptionLength)} ch, failing ${JSON.stringify(metaToolRow.failing)}; emerged in ${META_ARTIFACT.emergedIn}; cited from ${META_ARTIFACT.citation}`,
			},
			patch: null,
		},
	]

	const controls: readonly Control[] = [
		{
			id: 'tools-state-read',
			label: 'Read the live queue state (census, gate knobs, graded rows)',
			kind: 'read',
			target: `GET ${stateRoute}`,
			demonstrable: stateLive,
		},
		{
			id: 'tools-knob-description-cap',
			label: 'Lower `descriptionCap` so the META-SKILL flips promote -> refuse on Q2 alone',
			kind: 'write',
			target: `POST /tools-skills-evolve/api/knobs {descriptionCap: 148}`,
			demonstrable: true,
		},
		{
			id: 'tools-knob-procedure-floor',
			label: 'Raise `minProcedureSteps` so the META-TOOL flips promote -> refuse on Q3 alone',
			kind: 'write',
			target: 'POST /tools-skills-evolve/api/knobs {descriptionCap: 500, minProcedureSteps: 4}',
			demonstrable: true,
		},
		{
			id: 'tools-person-decision',
			label: 'Record a person\u2019s decision, distinct from the gate\u2019s own',
			kind: 'write',
			target: 'POST /tools-skills-evolve/api/decide',
			demonstrable: true,
		},
	]

	const falsifiers: readonly Falsifier[] = [
		{
			claim: 'the meta-tool row is a live row on the owning plugin\u2019s surface, not a name this window invented',
			how: `curl -s ${TOOLS_LIVE_BASE}${stateRoute} | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=j.proposals.find(p=>p.name==='${META_ARTIFACT.id}');console.log(r?r.passed+'/'+r.total:'ABSENT')})" — it must print 8/8, and "ABSENT" falsifies the claim`,
		},
		{
			claim: 'the two knobs are CONTROLS: each changes a VERDICT, and each reaches a different meta artifact',
			how: 'node --experimental-strip-types src/host/providers/verify/tools-skills-census.mjs — it stands up a real node:http server over the owning plugin\u2019s own handler, drives both writes, and exits non-zero unless the meta-skill flips on Q2 while the meta-tool stays promote, and the meta-tool flips on Q3 while the meta-skill stays promote, and both restore',
		},
		{
			claim: '`downloadable: null` means NOT MEASURED here rather than "not downloadable"',
			how: 'grep this file for any catalog read: there is none. A row claiming `false` would be a measurement this window never took; `registry/**` is the one place a catalog verdict comes from',
		},
		{
			claim: 'dsh-skill-generator serves no HTTP route, so its absence from the route column is a fact and not an omission',
			how: `curl -s -o /dev/null -w '%{http_code}' ${TOOLS_LIVE_BASE}/skill-generator — 404 is expected; a 200 would falsify it`,
		},
		{
			claim: 'the probe bound is fitted to this route rather than invented, and it is not below the worst reading',
			how: `the rule is "${PROVIDER_PROBE_BOUND_RULE}". Applied to this route's own six readings (${MEASURED_ROUTE_MS.join(' / ')} ms) it gives ${probeBoundMs(Math.max(...MEASURED_ROUTE_MS))} ms, which is this file's bound (${PROVIDER_PROBE_BOUND_MS} ms) — so the constant here is the arithmetic, not a preference. A reader can refute it by re-measuring the route six times and finding a worst reading above ${PROVIDER_PROBE_BOUND_MS} ms`,
		},
		{
			claim: 'the meta-tool and meta-skill were DEMONSTRATED controllable on the deployed surface, which is the AGENTS.md "demonstrate" conjunct',
			how: 'they were NOT: research/obj1-evolve-iterations.md §4 records the conjunct as UNMET (no synthesized skill has been REUSED, and the flips were shown on a harness-started server, not the deployed process). A window displaying the rows does not upgrade that status, and this falsifier exists so a later reader cannot mistake the display for the demonstration',
		},
	]

	// ---- THE TWO STATES THAT WERE BEING FUSED, now separated ----------------
	//
	// `surface-host` measured this window answering `unavailable` on one request
	// and four rows on the next, 68 seconds later, on one unchanged artifact — and
	// the cost it named is the right one: a field that flickers teaches a reader
	// that it is noise, and then the one time it is real they will not believe it.
	//
	// The defect was MINE and it was a category error: `unavailable` was set from
	// the PROBE's outcome, but this window's rows do not depend on the probe. They
	// come from three checkout censuses and from cited research, and they were
	// thrown away to report a slow socket. **A probe that TIMED OUT is a
	// measurement — 5 s of silence — and it is not the same reading as a route that
	// answered `404`, nor either of them the same as a window with nothing to say.**
	//
	// So the rule is now: `unavailable` is non-null ONLY when this window measured
	// NOTHING AT ALL — every checkout absent AND the probe silent. In every other
	// case the rows stand, `unavailable` is `null`, and the probe's own outcome
	// travels in `census.population` and in each row's `evidence`, where a reader
	// sees WHICH fields are cited rather than read. That keeps 4 of 4 visible AND
	// keeps the timeout visible, instead of trading one for the other.
	const checkoutAbsent = evolveCensus.count === null && evolutionCensus.count === null && generatorCensus.count === null
	const nothingMeasured = !stateLive && checkoutAbsent

	const liveNote = stateLive
		? ''
		: ` LIVE READ DID NOT SUCCEED at ${at} — ${state.reason ?? `the route answered HTTP ${state.status}`}. The rows below are measured from the three checkout censuses and from cited research; every field that would have come from the live route is marked as cited rather than read, and no live field is reported as a zero.`

	const census: Census = {
		numerator: items.length,
		denominator: 4,
		population:
			'the tools/skills meta layer this window names: 3 plugin checkouts (dsh-tools-skills-evolve, dsh-skill-evolution, dsh-skill-generator) + 1 graded meta-tool declaration = 4. EXCLUDED and named: the 5 harness-derived proposals in the same live queue are not meta artifacts, and the meta-SKILL belongs to the meta-skills window.' +
			liveNote,
		at,
	}

	// A timeout is reported as a timeout. The `status: null`/`bytes: null` above is
	// what keeps it out of the row counts; this string is what keeps it in the record.
	const unavailable = nothingMeasured
		? {
				reason: `nothing could be measured for this window: the live route ${stateRoute} did not answer (${state.reason ?? `HTTP ${state.status}`}) AND all three checkouts were absent, so there is no census and no cited fallback to report`,
				measuredAt: at,
			}
		: null

	// THE FIRST-CLASS MARKER, now that the seam carries one. `surface-host` landed
	// `ProviderWindow.stale` after this lane showed the split was needed, and it is
	// strictly better than the `window.description` override this file used while the
	// field did not exist: a `stale` is a STRUCTURED reading — reason, the bound it
	// exceeded, and the instant — where a description is prose an assembly may render
	// or drop. The description override is kept ONLY as a redundant human-facing copy,
	// because a reader looking at the tab sees prose long before they see a field.
	const stale = stateLive
		? null
		: {
				reason: `the live read of the owning plugin did not succeed: ${state.reason ?? `the route answered HTTP ${state.status}`}. The rows below are real and are measured from the three checkout censuses and from cited research; every field that would have come from the live route is cited rather than read. A timeout is a MEASUREMENT (silence for the bound) and is not an absence`,
				boundMs: PROVIDER_PROBE_BOUND_MS,
				at,
			}

	return {
		items,
		census,
		controls,
		falsifiers,
		unavailable,
		stale,
		window: stateLive
			? undefined
			: {
					description: `The tools/skills meta layer, read CENSUS-BOUND: the live route at ${TOOLS_LIVE_BASE} did not answer within ${PROVIDER_PROBE_BOUND_MS} ms, so live fields are cited from the research and the rows come from the checkout censuses. A slow probe is reported, not hidden.`,
				},
	}
}
