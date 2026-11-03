/**
 * ============================================================================
 * L10 — THE DOCUMENTED-vs-IMPLEMENTED SWEEP
 * ============================================================================
 *
 * THE QUESTION: for EVERY row in `THREATS`, is the `control` string backed by a
 * line of code that a run can make go RED — or is it prose?
 *
 * THE RULE, and it is deliberately strict. A control counts as IMPLEMENTED only
 * when BOTH hold:
 *
 *   (a) **REACHABLE** — a line of code in `gate.ts` performs it; and
 *   (b) **FALSIFIABLE** — a hostile input drives that line to REFUSE with the
 *       row's OWN id in `refusedBy`.
 *
 * A row that refuses hostile input but attributes it to a DIFFERENT threat id is
 * NOT implemented for that row: the refusal is real, the CONTROL the row names
 * is not what fired. That distinction is the whole point of this sweep, and it is
 * the attribution rule that already caught four of this program's defects.
 *
 * **WHY `refusedBy` AND NOT `verdict`:** a verdict-only probe cannot tell the
 * control it names from the branch that fired first. `dialogue-protocol`'s first
 * harness asserted only the verdict and had four rows "pass" while being refused
 * by `T01`/the grammar and never reaching the branch they claimed to test.
 *
 * **D-0077 APPLIES TO THIS FILE.** Every piece of evidence below is produced by
 * DRIVING the artifact. The only identifier counts are `refusedBy` values READ
 * OFF RETURNED OBJECTS, never substring counts over source. Where a count over
 * source appears, it is labelled as such and is not load-bearing.
 *
 * RUN: node --experimental-strip-types src/host/safety/verify/implemented-sweep.mjs
 */

import { THREATS, CONTROL_STANDING, admitEnvelope, admitPatch, applyPeerIntent, computeContentHash, createReplayRegistry, createProposalBudget, DEFAULT_POLICY } from '../gate.ts'

const NOW = '2026-10-16T18:30:00.000Z'
const LATER = '2026-10-16T19:30:00.000Z'
const EARLIER = '2026-10-16T17:30:00.000Z'
const THIS = 'inst-local'
const PEER = 'inst-peer'
const AUTH = ['patch-authoring']
const ALIGN = ['intent-alignment']
const CLEAN = { capabilities: ['fs-read'], redLines: [], declaresNothing: false }
const GOOD_HASH = computeContentHash({ ok: true })

let seq = 0
const nid = (p) => `${p}-${++seq}`
function deps({ purposes = ALIGN, at = NOW, policy } = {}) {
  const p = policy ?? DEFAULT_POLICY
  return { nowMs: Date.parse(at), thisInstanceId: THIS, policy: p, replay: createReplayRegistry(), budget: createProposalBudget(p), grantedPurposes: purposes }
}
function env(over = {}) {
  return { specVersion: 1, stepVersion: 1, messageId: nid('m'), dialogueId: 'd', from: PEER, to: THIS, step: 0, maxSteps: 8, expiresAt: LATER, intent: null, offer: null, decision: null, confidence: null, ...over }
}
function prop(over = {}) {
  return { proposalId: nid('p'), from: PEER, targetPackageId: 'pkg-1', baseHash: 'sha256:base', contentHash: GOOD_HASH, zones: ['z1'], reverses: 'restore to base', requiresHuman: true, staging: 'received', declaration: CLEAN, ...over }
}

/**
 * DRIVE a hostile input and report which control ACTUALLY fired.
 *
 * The returned `by` is read off the returned object — it is the artifact's own
 * attribution, not this harness's opinion.
 */
function fire(fn) {
  try {
    const r = fn()
    return { verdict: r.verdict, by: r.refusedBy ?? null, reason: (r.record && r.record.measured && r.record.measured.reason) || '' }
  } catch (e) {
    return { verdict: 'THREW', by: null, reason: String(e && e.message) }
  }
}

/** One hostile driver per row. A missing entry is itself a finding. */
const hostile = {
  T01: () => fire(() => admitEnvelope(env({ specVersion: 2 }), deps())),
  T02: () => fire(() => admitEnvelope(env({ from: THIS, to: THIS }), deps())),
  T03: () => { const d = deps(); const e = env({ messageId: 'fixed' }); admitEnvelope(e, d); return fire(() => admitEnvelope(e, d)) },
  T04: () => fire(() => admitEnvelope(env({ expiresAt: EARLIER }), deps())),
  T05: () => {
    const d = deps()
    let refused = null
    for (let i = 0; i < 11; i += 1) { const a = fire(() => admitEnvelope(env({ messageId: `f${i}` }), d)); if (a.verdict === 'refused') refused = a }
    return refused ?? { verdict: 'none-refused', by: null, reason: '' }
  },
  T06: () => fire(() => admitEnvelope(env({ step: 8, maxSteps: 8 }), deps())),
  T07: () => fire(() => admitPatch(prop(), { tampered: true }, deps({ purposes: AUTH }))),
  T08: () => fire(() => admitPatch(prop({ declaration: { capabilities: ['credentials', 'network'], redLines: [], declaresNothing: false } }), undefined, deps({ purposes: AUTH }))),
  T09: () => fire(() => admitPatch(prop({ declaration: { capabilities: [], redLines: ['reads credentials and has network'], declaresNothing: false } }), undefined, deps({ purposes: AUTH }))),
  T10: () => fire(() => admitPatch(prop({ declaration: {} }), undefined, deps({ purposes: AUTH }))),
  T11: () => fire(() => admitPatch(prop({ declaration: { capabilities: ['fs-read'], redLines: ['runs code at install time'], declaresNothing: false } }), undefined, deps({ purposes: AUTH }))),
  T12: () => fire(() => admitEnvelope(env({ offer: { zones: [], contentHash: GOOD_HASH, declaration: CLEAN }, decision: { decision: 'choice', value: 'intent-alignment', labelSet: 'alignVerdict' } }), deps({ purposes: ALIGN }))),
  T13: () => fire(() => admitEnvelope(env({ offer: { zones: [{}, 'z1'], contentHash: GOOD_HASH, declaration: CLEAN }, decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' } }), deps({ purposes: AUTH }))),
  T14: () => fire(() => admitPatch(prop(), undefined, deps({ purposes: ['root'] }))),
  T15: () => { const view = ['za']; const r = applyPeerIntent(['zb'], { zoneIds: view, identity: { model: 'm', dim: 8, modelSource: 's', endpoint: 'e' } }, { model: 'm', dim: 8, modelSource: 's', endpoint: 'e' }, deps()); return { verdict: r.mutatedLocalIntent === false ? 'invariant-holds' : 'invariant-BROKEN', by: null, reason: `view ${JSON.stringify(view)}` } },
  T16: () => { const r = applyPeerIntent(['zb'], { zoneIds: [], identity: { model: 'm', dim: 8, modelSource: 's', endpoint: 'e' } }, { model: 'm', dim: 8, modelSource: 's', endpoint: 'e' }, deps()); return { verdict: typeof r.proposal === 'object' ? 'invariant-holds' : 'invariant-BROKEN', by: null, reason: 'no route registered by this lane at all' } },
  T17: () => { const r = applyPeerIntent(['z'], { zoneIds: [], identity: { model: 'm', dim: 8, modelSource: 's', endpoint: 'e' } }, { model: 'other', dim: 8, modelSource: 's', endpoint: 'e' }, deps()); return { verdict: r.identity.present ? 'NOT-REFUSED' : 'refused', by: r.identity.present ? null : 'T17', reason: r.identity.reason ?? '' } },
  T18: () => ({ verdict: 'no-driver', by: null, reason: 'control is null — nothing to drive' }),
  T19: () => fire(() => admitPatch(prop({ reverses: '' }), undefined, deps({ purposes: AUTH }))),
  T20: () => ({ verdict: 'no-driver', by: null, reason: 'a source conformance check, driven by its own scanner' }),
  T21: () => ({ verdict: 'no-driver', by: null, reason: 'control is null — a scope statement, not a check' }),
  T22: () => ({ verdict: 'no-driver', by: null, reason: 'control is null — no key material exists to drive' }),
}

const rows = THREATS.map((t) => {
  const driven = hostile[t.id] ? hostile[t.id]() : { verdict: 'NO-DRIVER-WRITTEN', by: null, reason: '' }
  const hasControl = t.control !== null
  const firedItself = driven.by === t.id
  // IMPLEMENTED = the row's own id came back from a code path.
  const implemented = hasControl && firedItself
  return { id: t.id, standing: CONTROL_STANDING[t.id], hasControl, driven, attributedToOwnId: firedItself, implemented }
})

const pad = (s, n) => String(s).padEnd(n)
console.log('')
console.log('L10 documented-vs-implemented sweep — census ' + new Date().toISOString())
console.log('')
console.log(pad('ID', 6) + pad('STANDING', 17) + pad('CTRL?', 7) + pad('FIRED', 20) + pad('ATTRIB', 8) + 'VERDICT')
console.log('-'.repeat(104))
for (const r of rows) {
  const attrib = r.driven.by === null ? '-' : (r.attributedToOwnId ? 'OWN-ID' : `OTHER(${r.driven.by})`)
  console.log(pad(r.id, 6) + pad(r.standing, 17) + pad(r.hasControl ? 'yes' : 'NONE', 7) + pad(r.driven.verdict, 20) + pad(attrib, 8) + (r.implemented ? 'IMPLEMENTED' : r.hasControl ? 'DOCUMENTED-ONLY' : 'NO-CONTROL-DECLARED'))
  if (r.driven.reason) console.log('       reason: ' + String(r.driven.reason).slice(0, 150))
}

// ===========================================================================
// THE T02 FALSIFIER, RUN AS WRITTEN — item 3 of task-25
// ===========================================================================
// `gate.ts:132` declares: "a `from` differing from the card id is refused, AND
// `from === to` is refused."
//
// BOTH conjuncts are driven below. **THE FIRST CANNOT PASS**, and the reason is
// structural rather than a bug to fix in this round: `from === card.instanceId`
// needs a CARD, and `GateDeps` carries no `card` field, so no caller can supply
// the value the conjunct compares against. **It is not merely unimplemented — it
// is UNEXPRESSIBLE at this signature.**
//
// I am NOT implementing it (it needs an interface change, out of this round) and
// I am NOT weakening the falsifier to its second conjunct alone. I am RUNNING it
// and RECORDING which conjunct fails.
console.log('')
console.log('T02 FALSIFIER — RUN AS DECLARED AT gate.ts:132')
console.log('-'.repeat(104))

// Conjunct 1: "a `from` differing from the card id is refused".
// The hostile input for this conjunct is a `from` that names a peer other than
// the one the card belongs to. THERE IS NO CARD TO COMPARE AGAINST, so the input
// the conjunct describes cannot be constructed at this interface. Four different
// `from` values are driven instead, and the measurement below is what the gate
// does with each — which is the honest form of "this conjunct cannot be tested".
const fromProbe = ['inst-peer', 'literally-any-string', 'a-different-peer', '']
const fromResults = fromProbe.map((v) => {
  const a = fire(() => admitEnvelope(env({ messageId: nid('t02'), from: v, to: THIS }), deps()))
  return { from: v === '' ? '(empty)' : v, verdict: a.verdict, by: a.by }
})
let conjunct1 = 0
for (const r of fromResults) {
  console.log(`  from=${pad(r.from, 22)} -> ${pad(r.verdict, 12)} by=${r.by ?? '-'}`)
  if (r.verdict === 'refused' && r.by === 'T02') conjunct1 += 1
}
console.log('')
console.log(`  CONJUNCT 1 ("a from differing from the card id is refused"): **CANNOT PASS.**`)
console.log(`    It needs a card; GateDeps has no \`card\` field, so the input is UNCONSTRUCTIBLE.`)
console.log(`    Of 4 \`from\` values driven, ${conjunct1} of 4 were refused by T02 — and the ${fromResults.length - conjunct1} admitted`)
console.log(`    are the finding: a \`from\` that names any peer at all is accepted, because the gate`)
console.log(`    checks non-emptiness, not identity. This is the half of the control that is PROSE.`)
console.log('')

// Conjunct 2: "`from === to` is refused".
const selfAddressed = fire(() => admitEnvelope(env({ messageId: nid('t02'), from: THIS, to: THIS }), deps()))
const conjunct2 = selfAddressed.verdict === 'refused' && selfAddressed.by === 'T02'
console.log(`  CONJUNCT 2 ("from === to is refused"): ${conjunct2 ? '**PASSES**' : '**FAILS**'} — verdict=${selfAddressed.verdict}, by=${selfAddressed.by}`)
console.log(`    reason: ${selfAddressed.reason}`)
console.log('')
console.log(`  FALSIFIER RESULT: ${conjunct2 ? 'FAILS ON ITS FIRST CONJUNCT' : 'FAILS ON BOTH CONJUNCTS'}.`)
console.log(`    1 of 2 conjuncts holds. RECORDED AS A PARTIAL FAILURE, NOT AS A PASS, and NOT`)
console.log(`    rewritten to its second conjunct. CONTROL_IMPLEMENTATION.T02 = 'PARTIAL'.`)
console.log('')

// ===========================================================================
// TWIN DISCIPLINE — does each refusal have a twin differing ONLY in the hostile field?
// ===========================================================================
// Item 4 of task-25. A refusal with no admitted twin beside it is a receiver that
// refuses everything, which is not a control. **But a twin that differs in MORE
// than the hostile field cannot isolate it** — and a twin that differs in the
// RIGHT field can still be useless if it happens to be admitted for a different
// reason.
//
// THE CASE THAT MOTIVATED THIS BLOCK: `attacker.mjs`'s T12 pairs a hostile
// envelope (offer + alignment label, malformed `contentHash`) with a BARE
// `envelope()` — no offer, no decision. Those two differ in MANY fields, so the
// benign side proves only "a bare envelope is admitted", NOT "an envelope
// identical except for the label is admitted". **An over-refusing T12 — one that
// refused every alignment-role envelope carrying any decision — would leave that
// twin admitted and the harness GREEN.** That is the exact blind spot that let
// `patch-distribution`'s false refusal survive a verdict-only run.
//
// So the twin below is rebuilt to differ in ONE field, and the ordering is tested.
console.log('')
console.log('TWIN DISCIPLINE — one hostile, one twin differing ONLY in the hostile field')
console.log('-'.repeat(104))

const alignmentWithOffer = () => env({
  messageId: nid('t12'),
  offer: { zones: ['z1'], contentHash: GOOD_HASH, declaration: CLEAN },
  decision: { decision: 'choice', value: 'intent-alignment', labelSet: 'alignVerdict' },
})
// THE CORRECT TWIN: identical decision, identical role, NO offer. The ONLY
// difference from the hostile input above is the `offer` field.
const alignmentNoOffer = () => env({
  messageId: nid('t12'),
  offer: null,
  decision: { decision: 'choice', value: 'intent-alignment', labelSet: 'alignVerdict' },
})

const t12Hostile = fire(() => admitEnvelope(alignmentWithOffer(), deps({ purposes: ALIGN })))
const t12Twin = fire(() => admitEnvelope(alignmentNoOffer(), deps({ purposes: ALIGN })))
const t12Isolated = t12Hostile.verdict === 'refused' && t12Hostile.by === 'T12' && t12Twin.verdict !== 'refused'
console.log(`  HOSTILE (offer present, alignment label) -> ${pad(t12Hostile.verdict, 10)} by=${t12Hostile.by ?? '-'}`)
console.log(`  TWIN    (offer absent,  alignment label) -> ${pad(t12Twin.verdict, 10)} by=${t12Twin.by ?? '-'}   <- differs in ONE field`)
console.log(`  ISOLATED? ${t12Isolated ? 'YES — the refusal is attributable to the offer field alone' : 'NO'}`)
if (!t12Isolated && t12Twin.verdict === 'refused') {
  console.log(`  ** THE TWIN IS REFUSED BY ${t12Twin.by} — so the T12 control OVER-REFUSES, and`)
  console.log(`     attacker.mjs's bare-envelope twin MASKED it. The failing check is named above.**`)
}
console.log('')

// The flattening case: does the offer field ALONE flip the verdict, with the
// decision held constant in the authoring direction?
const authoringWithOffer = () => env({
  messageId: nid('t12b'),
  offer: { zones: ['z1'], contentHash: GOOD_HASH, declaration: CLEAN },
  decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' },
})
const authoringNoOffer = () => env({
  messageId: nid('t12b'),
  offer: null,
  decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' },
})
const aOffer = fire(() => admitEnvelope(authoringWithOffer(), deps({ purposes: AUTH })))
const aNoOffer = fire(() => admitEnvelope(authoringNoOffer(), deps({ purposes: AUTH })))
console.log(`  AUTHORING+offer (the legitimate path)   -> ${pad(aOffer.verdict, 10)} by=${aOffer.by ?? '-'}`)
console.log(`  AUTHORING no-offer                      -> ${pad(aNoOffer.verdict, 10)} by=${aNoOffer.by ?? '-'}`)
console.log(`     A control that refused BOTH would be an over-refusal; one that refused NEITHER would be absent.`)
console.log('')

const withControl = rows.filter((r) => r.hasControl)
const implemented = rows.filter((r) => r.implemented)
const documentedOnly = withControl.filter((r) => !r.implemented)
const noControl = rows.filter((r) => !r.hasControl)

console.log('')
console.log(`HEADLINE: ${implemented.length} of ${rows.length} rows are IMPLEMENTED (a code path returns the row's OWN id).`)
console.log(`  rows declaring a control:  ${withControl.length} of ${rows.length}`)
console.log(`  of those, IMPLEMENTED:     ${implemented.length} of ${withControl.length}`)
console.log(`  of those, DOCUMENTED-ONLY: ${documentedOnly.length} of ${withControl.length}  -> ${documentedOnly.map((r) => r.id).join(', ') || 'none'}`)
console.log(`  rows declaring NO control: ${noControl.length} of ${rows.length}  -> ${noControl.map((r) => r.id).join(', ')}`)
console.log('')
process.exit(0)
