/**
 * tools-skills-census.mjs — the LANE'S OWN DRIVER for the two providers it owns.
 *
 * TWO JOBS, and they are separate on purpose:
 *
 * 1. **THE CONTROLLABILITY TEST.** It stands up a real `node:http` server over
 *    `dsh-tools-skills-evolve`'s OWN route handler, drives two knob writes, and
 *    requires an OUTCOME (a verdict) to change and come back. Reading a knob back
 *    would prove a field was reachable and nothing about control, so no assertion
 *    below reads a knob as its evidence — every assertion reads a VERDICT.
 *
 *    **IT DOES NOT WRITE TO PORT 3083.** 3083 is the owner's live session; the
 *    brief for this lane is probe-only there. The write is driven against a server
 *    this file starts and stops, which is the same instrument
 *    `research/obj1-evolve-iterations.md` §4.3 used — and it is why the provider
 *    marks these controls `demonstrable: true` while the LIVE route is only read.
 *
 *    **IT PASSES THE REAL REQUEST OBJECT, not a model of one.** A prior harness in
 *    this program supplied an invented `req` with a pre-read `body` field and a
 *    handler that discarded every body passed all of its POST checks
 *    (`research/obj1-evolve-iterations.md` §4 fact 2). So this file hands the
 *    plugin's handler the ACTUAL `IncomingMessage`, which it reads through
 *    `req[Symbol.asyncIterator]`; the only thing rewritten is `req.url`, because
 *    the prefix strip is the mount's job and not the handler's.
 *
 * 2. **THE TWO CENSUSES**, built by calling the shipped providers themselves, so
 *    the numbers in the report are the numbers the window serves rather than a
 *    second instrument's opinion of them. Every item whose status is NOT MEASURED
 *    is printed with its reason.
 *
 *   node --experimental-strip-types src/host/providers/verify/tools-skills-census.mjs [workspace]
 *
 * Exit 0 = both censuses closed (numerator === denominator) AND both knob flips
 * were observed over a real socket AND both restored.
 */

import { createServer } from 'node:http'

const WORKSPACE =
	process.argv[2] ?? 'C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE'
const EVOLVE = 'file:///C:/Users/0000/Projects/deepseek-root/plugins-src/dsh-tools-skills-evolve/src/'
const HERE = new URL('./', import.meta.url)

// The workspace is the PROJECT ROOT for this session (it has its own git repo),
// and `skills.ts` resolves the skill roots from it. Setting it here is what makes
// this driver's census the same census the mounted window would take in the same
// session, rather than a census of wherever this file happened to be run from.
process.chdir(WORKSPACE)

const failures = []
const observations = []

function record(step, detail) {
	observations.push({ step, detail })
}

function check(id, ok) {
	if (!ok) failures.push(id)
	console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id}`)
}

// ---------------------------------------------------------------------------
// PART 1 — the controllability test, over a real socket
// ---------------------------------------------------------------------------

console.log('=== PART 1: controllability of the tools/skills meta layer ===')
console.log('')

const { createRouteHandler } = await import(new URL('host/routes.ts', EVOLVE).href)
const { createEvolutionState } = await import(new URL('host/state.ts', EVOLVE).href)
const PREFIX = '/tools-skills-evolve'
const handler = createRouteHandler({ state: createEvolutionState() })

const server = createServer((req, res) => {
	const raw = req.url ?? '/'
	if (!raw.startsWith(PREFIX)) {
		res.statusCode = 404
		res.end('outside the plugin prefix')
		return
	}
	// THE MOUNT'S ONLY JOB: strip the prefix. The body is NOT pre-read — the
	// handler reads the real stream, which is the defect this driver refuses to
	// reproduce.
	req.url = raw.slice(PREFIX.length) || '/'
	handler(req, res)
})

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
const port = server.address().port
const base = `http://127.0.0.1:${port}`
console.log(`server   ${base} (the owning plugin's OWN handler, mounted by this file)`)

async function call(method, path, body) {
	const res = await fetch(`${base}${PREFIX}${path}`, {
		method,
		...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
	})
	const text = await res.text()
	let parsed = null
	try {
		parsed = JSON.parse(text)
	} catch {
		parsed = null
	}
	return { status: res.status, parsed, text, bytes: Buffer.byteLength(text) }
}

function row(state, name) {
	return state?.proposals?.find((p) => p.name === name) ?? null
}

const reach = await call('GET', '/api/state')
record('GET /api/state', `HTTP ${reach.status}, ${reach.bytes} B`)
console.log(`reach    GET /api/state -> HTTP ${reach.status} (${reach.bytes} B)`)
check('P1 the surface answers 200 with a parseable state payload', reach.status === 200 && reach.parsed !== null)

const before = reach.parsed
const metaSkill = 'evolve-a-skill-in-this-system'
const metaTool = 'inspect-and-rewrite-tool-surface'
const beforeSkill = row(before, metaSkill)
const beforeTool = row(before, metaTool)
const capBefore = before?.gate?.knobs?.descriptionCap
const floorBefore = before?.gate?.knobs?.minProcedureSteps

console.log('')
console.log(`BEFORE   cap=${capBefore} floor=${floorBefore}`)
console.log(`  ${metaSkill}  ${beforeSkill?.verdict} / ${beforeSkill?.promotionStage} (${beforeSkill?.descriptionLength} ch)`)
console.log(`  ${metaTool}  ${beforeTool?.verdict} / ${beforeTool?.promotionStage} (${beforeTool?.descriptionLength} ch)`)

// The precondition. A proposal that STARTED refused would "change" into the
// state it was already in, so a later flip would prove nothing.
check('P2 PRECONDITION: both meta artifacts start at `promote`', beforeSkill?.verdict === 'promote' && beforeTool?.verdict === 'promote')
check('P3 the two artifacts are really the meta ones (149 ch / 128 ch, cited from obj1 §2)', beforeSkill?.descriptionLength === 149 && beforeTool?.descriptionLength === 128)

// ---- drive #1: the cap, aimed at the LONGER description -------------------
const drive1 = await call('POST', '/api/knobs', { descriptionCap: 148 })
record('POST /api/knobs cap=148', `HTTP ${drive1.status} redecided=${JSON.stringify(drive1.parsed?.redecided ?? [])}`)
console.log('')
console.log(`DRIVE 1  POST /api/knobs {"descriptionCap":148} -> HTTP ${drive1.status}; redecided=${JSON.stringify(drive1.parsed?.redecided ?? [])}`)
check('P4 the cap write was ACCEPTED (200)', drive1.status === 200)

const after1 = (await call('GET', '/api/state')).parsed
const skill1 = row(after1, metaSkill)
const tool1 = row(after1, metaTool)
console.log(`AFTER 1  ${metaSkill}  ${skill1?.verdict} / ${skill1?.promotionStage} failing=${JSON.stringify(skill1?.failing)}`)
console.log(`         ${metaTool}  ${tool1?.verdict} / ${tool1?.promotionStage} failing=${JSON.stringify(tool1?.failing)}`)
check('P5 THE OUTCOME CHANGED: the meta-SKILL flipped promote -> refuse', skill1?.verdict === 'refuse')
check('P6 the refusal names ONE criterion (Q2) and not a blanket rejection', JSON.stringify(skill1?.failing) === JSON.stringify(['Q2']))
check('P7 SELECTIVE: the meta-TOOL was NOT touched by the cap', tool1?.verdict === 'promote')
// The surface names a redecided row `<kind>:<name>` — measured, not assumed, and
// the first version of this check failed because it compared the bare name. The
// assertion is written against the OBSERVED shape and still requires the meta
// artifact to be among the moved rows, so it can fail if the surface stops naming it.
const redecidedNames = (drive1.parsed?.redecided ?? []).map((r) => String(r.name))
check('P8 the surface SAID what it moved, in redecided[]',
	redecidedNames.some((name) => name === metaSkill || name.endsWith(`:${metaSkill}`)))

// ---- drive #2: the floor, aimed at the SHORTER procedure ------------------
const drive2 = await call('POST', '/api/knobs', { descriptionCap: capBefore, minProcedureSteps: 4 })
record('POST /api/knobs floor=4', `HTTP ${drive2.status} redecided=${JSON.stringify(drive2.parsed?.redecided ?? [])}`)
console.log('')
console.log(`DRIVE 2  POST /api/knobs {"minProcedureSteps":4} -> HTTP ${drive2.status}; redecided=${JSON.stringify(drive2.parsed?.redecided ?? [])}`)
check('P9 the floor write was accepted', drive2.status === 200)

const after2 = (await call('GET', '/api/state')).parsed
const skill2 = row(after2, metaSkill)
const tool2 = row(after2, metaTool)
console.log(`AFTER 2  ${metaSkill}  ${skill2?.verdict} / ${skill2?.promotionStage} failing=${JSON.stringify(skill2?.failing)}`)
console.log(`         ${metaTool}  ${tool2?.verdict} / ${tool2?.promotionStage} failing=${JSON.stringify(tool2?.failing)}`)
check('P10 THE OUTCOME CHANGED: the meta-TOOL flipped promote -> refuse', tool2?.verdict === 'refuse')
check('P11 the refusal names ONE criterion (Q3) and not a blanket rejection', JSON.stringify(tool2?.failing) === JSON.stringify(['Q3']))
check('P12 SELECTIVE: the meta-SKILL was NOT touched by the floor', skill2?.verdict === 'promote')
// DERIVED, not asserted: P13's value comes from the two observations above, so it
// can print FAIL. A check written as `check(..., true)` is a caption, not a check.
check('P13 the two knobs reached DIFFERENT artifacts, so neither is a global refuse-all',
	skill1?.verdict === 'refuse' && tool1?.verdict === 'promote' && tool2?.verdict === 'refuse' && skill2?.verdict === 'promote')

// ---- restore --------------------------------------------------------------
const restore = await call('POST', '/api/knobs', { descriptionCap: capBefore, minProcedureSteps: floorBefore })
const restored = (await call('GET', '/api/state')).parsed
const skillR = row(restored, metaSkill)
const toolR = row(restored, metaTool)
record('RESTORE', `HTTP ${restore.status}`)
console.log('')
console.log(`RESTORE  cap=${restored?.gate?.knobs?.descriptionCap} floor=${restored?.gate?.knobs?.minProcedureSteps}`)
console.log(`         ${metaSkill}  ${skillR?.verdict} / ${skillR?.promotionStage}`)
console.log(`         ${metaTool}  ${toolR?.verdict} / ${toolR?.promotionStage}`)
check('P14 restoring the knobs RESTORES both outcomes, so the knob caused the change', skillR?.verdict === 'promote' && toolR?.verdict === 'promote')

await new Promise((resolveClose) => server.close(resolveClose))

// ---------------------------------------------------------------------------
// PART 2 — the two censuses, from the shipped providers
// ---------------------------------------------------------------------------

console.log('')
console.log('=== PART 2: the two censuses, built by the providers themselves ===')

async function census(modulePath, label) {
	const module = await import(new URL(modulePath, HERE).href)
	const built = await module.buildWindow()
	const c = built.census ?? {}
	const items = built.items ?? []
	console.log('')
	console.log(`--- ${label} (WINDOW_ID=${module.WINDOW_ID}) ---`)
	console.log(`census  ${c.numerator}/${c.denominator}  at ${c.at}`)
	console.log(`population  ${c.population}`)
	console.log(`items (${items.length}):`)
	for (const item of items) {
		const installed = item.installed === null ? 'NOT MEASURED' : String(item.installed)
		const dl = item.downloadable === null ? 'NOT MEASURED' : String(item.downloadable)
		console.log(`  ${item.id}`)
		console.log(`    installed=${installed} downloadable=${dl} kind=${item.kind} alignment=${item.alignment.verdict}`)
		console.log(`    evidence: ${item.alignment.evidence}`)
		if (item.installed === null || item.downloadable === null) {
			console.log(`    NOT MEASURED reason: ${item.alignment.why}`)
		}
	}
	console.log(`controls (${(built.controls ?? []).length}):`)
	for (const control of built.controls ?? []) {
		console.log(`  [${control.kind}] ${control.id} demonstrable=${control.demonstrable}`)
	}
	console.log(`falsifiers (${(built.falsifiers ?? []).length})`)
	if (built.unavailable) console.log(`unavailable: ${built.unavailable.reason}`)
	// The closure check: the numerator IS the item list, so a mismatch means the
	// provider's own denominator disagrees with what it actually returned.
	check(`${label}: the census CLOSES (numerator === items returned)`, c.numerator === items.length)
	check(`${label}: numerator === denominator (nothing in the population was dropped silently)`, c.numerator === c.denominator)
	return built
}

const tools = await census('../tools.ts', 'meta-tools')
const skills = await census('../skills.ts', 'meta-skills')

// The cross-check that makes the skills census a reading rather than an assertion:
// the directory walk cannot see the bundled/runtime roots, and the provider says so
// by naming them as rows. Their presence is what keeps the total from undercounting.
const generated = (skills.items ?? []).filter((item) => /generated, and its zone/.test(item.alignment.why)).length
console.log('')
console.log(`generated-and-zone-labelled rows: ${generated} of ${(skills.items ?? []).length}`)
check('S1 the meta-tool row is present in meta-tools', (tools.items ?? []).some((i) => i.id === 'inspect-and-rewrite-tool-surface'))
check('S2 the meta-skill row is present in meta-skills and is NOT installed (not landed)', (skills.items ?? []).some((i) => i.id === 'evolve-a-skill-in-this-system' && i.installed === false))
check('S3 the 3 non-directory-root skills are named rather than counted as zero', (skills.items ?? []).filter((i) => ['dsh-memory-delta', 'dsh-plugin-guide', 'diagnose-windows-sandbox-acl'].includes(i.id)).length === 3)

console.log('')
console.log('=== PART 3: the DEGRADED path — a failed live probe must not empty the window ===')
console.log('')
// THE FLICKER TEST. `surface-host` measured meta-tools answering `unavailable` on
// one drive and four rows on the next, 68 seconds later, on ONE unchanged artifact,
// and named the cost: a field that flickers teaches a reader it is noise, so the one
// time it is real they will not believe it. The defect was that `unavailable` was
// set from the PROBE while the rows come from checkout censuses and cited research.
//
// This section drives that path deliberately by moving the live base to a port
// nothing listens on, so the probe CANNOT answer, and then requires the window to
// keep every row and to say so where a reader can see it. Without this the fix is an
// assertion; with it, the fix is a measurement.
delete process.env.DSH_META_MARKET_LIVE_BASE
process.env.DSH_META_MARKET_LIVE_BASE = 'http://127.0.0.1:9'
// A fresh import specifier, because the module URL is cached after Part 2.
const deadToolsMod = await import(new URL('../tools.ts?degraded', HERE).href)
const deadSkillsMod = await import(new URL('../skills.ts?degraded', HERE).href)
const deadTools = await deadToolsMod.buildWindow()
const deadSkills = await deadSkillsMod.buildWindow()

console.log(`dead-port meta-tools: unavailable=${deadTools.unavailable === null ? 'null' : 'SET'}, items=${(deadTools.items ?? []).length}, census=${deadTools.census?.numerator}/${deadTools.census?.denominator}`)
console.log(`dead-port meta-skills: unavailable=${deadSkills.unavailable === null ? 'null' : 'SET'}, items=${(deadSkills.items ?? []).length}, census=${deadSkills.census?.numerator}/${deadSkills.census?.denominator}`)
console.log(`dead-port census.population carries the note: ${/LIVE READ DID NOT SUCCEED/.test(String(deadTools.census?.population))}`)
console.log(`dead-port window.description flags the reading as census-bound: ${/CENSUS-BOUND/.test(String(deadTools.window?.description))}`)
console.log(`dead-port meta-skill row is still present and still measured false: ${(deadSkills.items ?? []).some((i) => i.id === 'evolve-a-skill-in-this-system' && i.installed === false)}`)

check('D1 meta-tools with a DEAD live route keeps all 4 rows', (deadTools.items ?? []).length === 4)
check('D2 meta-tools with a DEAD live route reports `unavailable: null` — a slow probe is not a missing window', deadTools.unavailable === null)
check('D3 the dead read is still VISIBLE, in census.population', /LIVE READ DID NOT SUCCEED/.test(String(deadTools.census?.population)))
check('D4 the dead read is flagged at the top level, in window.description', /CENSUS-BOUND/.test(String(deadTools.window?.description)))
check('D5 meta-skills with a DEAD live route keeps all 17 rows', (deadSkills.items ?? []).length === 17)
check('D6 meta-skills with a DEAD live route reports `unavailable: null`', deadSkills.unavailable === null)
check('D7 the meta-skill row survives the dead read with the SAME measured `installed: false`', (deadSkills.items ?? []).some((i) => i.id === 'evolve-a-skill-in-this-system' && i.installed === false))
// The negative control for D1-D7: the healthy run above must differ from this one in
// exactly the field the test is about, or the test could not have failed.
check('D8 NEGATIVE CONTROL: the healthy run and the dead run differ on the live note, so this test can tell them apart', String(tools.census?.population ?? '') !== String(deadTools.census?.population ?? ''))

// ---- the FIRST-CLASS `stale` field, landed by surface-host after this lane showed
// the split was needed. A timeout must reach `stale` (structured: a reason, the bound
// it exceeded, and the instant) and must NEVER reach `unavailable`, which is reserved
// for "nothing was measured at all". Both providers are asserted, because `skills.ts`
// probes too and would otherwise be counted by `staleCensus` as not reporting at all.
console.log(`dead-port meta-tools stale: ${deadTools.stale === null ? 'null' : `boundMs=${deadTools.stale?.boundMs} at=${deadTools.stale?.at}`}`)
console.log(`dead-port meta-skills stale: ${deadSkills.stale === null ? 'null' : `boundMs=${deadSkills.stale?.boundMs} at=${deadSkills.stale?.at}`}`)
check('D9 meta-tools reports `stale` on a dead read, with the bound it exceeded', (deadTools.stale?.boundMs ?? null) !== null)
check('D10 meta-tools reports `stale: null` on the HEALTHY read, so the field is not permanently on', tools.stale === null)
check('D11 meta-skills reports `stale` on a dead read (it probes, so it is not census-only)', (deadSkills.stale?.boundMs ?? null) !== null)
check('D12 meta-skills reports `stale: null` on the healthy read', skills.stale === null)
check('D13 `stale` and `unavailable` are NOT the same field: a stale read keeps every row and is never unavailable',
	deadTools.unavailable === null && deadTools.stale !== null && deadSkills.unavailable === null && deadSkills.stale !== null)
check('D14 both providers share the ONE assembly-wide bound rather than a literal each', deadTools.stale?.boundMs === deadSkills.stale?.boundMs)

console.log('')
console.log('=== OBSERVATIONS ===')
for (const o of observations) console.log(`  ${String(o.step).padEnd(26)} ${o.detail}`)

console.log('')
if (failures.length > 0) {
	console.log(`FAILURES (${failures.length}): ${failures.join(' | ')}`)
	process.exit(1)
}
console.log('ALL CHECKS PASSED — both flips observed over a real socket, both restored, both censuses closed.')
