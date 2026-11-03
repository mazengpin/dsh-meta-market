/**
 * ============================================================================
 * dsh-meta-market — L5 ATTACKER HARNESS (the negative control for the gate)
 * ============================================================================
 *
 * THE CRITERION THIS FILE EXISTS TO SATISFY (`laya-fold-gate`, §9):
 *
 *   "Prove the gate can refuse before trusting it to allow.
 *    A gate that has never refused is untested."
 *
 * RUN IT:
 *
 *   node --experimental-strip-types src/host/safety/verify/attacker.mjs
 *
 * It imports the TypeScript SOURCE directly through node's own type-stripping,
 * so it needs **no `pnpm install`, no `tsdown` build and no `lib/`**. That is
 * deliberate: **a safety harness that cannot run until a build pipeline exists is
 * a safety harness that does not run**, and this program has already lost one
 * harness to a container question.
 *
 * ---------------------------------------------------------------------------
 * THE THREE ASSERTIONS PER THREAT, AND THE THIRD IS THE ONE THAT GETS DROPPED
 * ---------------------------------------------------------------------------
 *
 *  1. the hostile input is REFUSED;
 *  2. a BENIGN input is ACCEPTED — a control that refuses everything is an
 *     outage, not a control, and this program has a recorded case of a harness
 *     "passing" because both sides returned 404;
 *  3. **the refusal NAMES THE RIGHT THREAT ID.** A refusal whose `refusedBy` says
 *     T02 when the attacker attacked T07 is not a control, it is a coincidence,
 *     and it stops being true on the next refactor.
 *
 * ---------------------------------------------------------------------------
 * THE INSTRUMENT GUARDS, EACH OF WHICH THIS PROGRAM HAS PAID FOR
 * ---------------------------------------------------------------------------
 *
 *  - a FIXED INJECTED CLOCK: a control that reads `Date.now()` is not
 *    reproducible, and expiry cannot otherwise be tested in both directions;
 *  - `instrumentCovered`: a `0` on both sides is an INSTRUMENT FAILURE, not a
 *    pass. A gate that refuses everything and a gate whose subject never appeared
 *    both report "0 allowed";
 *  - the STANDING check: every threat claiming `'VERIFIED (ran)'` must have been
 *    ACTUALLY EXERCISED, or the run fails. **A standing the harness cannot
 *    reproduce is exactly the defect the harness exists to catch;**
 *  - an ORDERING control: an envelope wrong in four ways must report `T01`, not
 *    the symptom. A gate whose first branch is a wildcard refuses everything and
 *    reports the wildcard — which passes a naive "was it refused?" test.
 *
 * @module dsh-meta-market/host/safety/verify/attacker
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE_TS = join(HERE, '..', 'gate.ts')

if (!existsSync(GATE_TS)) {
  console.error(`FATAL: the gate source is not on disk at ${GATE_TS}.`)
  console.error('Refusing to run: a harness that cannot find its subject reports "0 refused" for a gate that does not exist.')
  process.exit(2)
}

// The dynamic import needs a URL, not a Windows path: the default ESM loader
// rejects a bare `c:\...` with ERR_UNSUPPORTED_ESM_URL_SCHEME. Found by running it.
const gate = await import(pathToFileURL(GATE_TS).href)
const { admitEnvelope, admitPatch, applyPeerIntent, fixedClock, computeContentHash, createSafetyGate, CONTROL_STANDING, CONTROL_IMPLEMENTATION, THREATS, threatCensus, canonicalize } = gate

// ---------------------------------------------------------------------------
// the clock, fixed. Both expiry directions are otherwise untestable.
// ---------------------------------------------------------------------------
const NOW = '2026-10-16T17:30:00.000Z'
const LATER = '2026-10-16T18:30:00.000Z'
const EARLIER = '2026-10-16T16:30:00.000Z'

const THIS = 'inst-local'
const PEER = 'inst-peer'

/** The purposes a peer holds, per case. */
const ALIGN_ONLY = ['intent-alignment']
const AUTHORING = ['patch-authoring']

/** A minimal well-formed clean declaration — the BENIGN side of most cases. */
const CLEAN = { capabilities: ['fs-read'], redLines: [], declaresNothing: false }

/** A fixed proposal id per call site, so a refusal is attributable to its case. */
let seq = 0
const nextId = (p) => `${p}-${++seq}`

/** A dependency set, fresh per case so replay/budget state cannot leak between cases. */
function deps({ purposes = ALIGN_ONLY, at = NOW, id = THIS, policy } = {}) {
  return {
    nowMs: Date.parse(at),
    thisInstanceId: id,
    policy: policy ?? gate.DEFAULT_POLICY,
    replay: gate.createReplayRegistry(),
    budget: gate.createProposalBudget(policy ?? gate.DEFAULT_POLICY),
    grantedPurposes: purposes,
  }
}

/** A well-formed envelope, clean by default. Every case mutates exactly one field. */
function envelope(over = {}) {
  return {
    specVersion: 1,
    stepVersion: 1,
    messageId: nextId('msg'),
    dialogueId: 'dlg-1',
    from: PEER,
    to: THIS,
    step: 0,
    maxSteps: 8,
    expiresAt: LATER,
    intent: null,
    offer: null,
    decision: null,
    confidence: null,
    ...over,
  }
}

/** A well-formed patch proposal, clean by default. */
function proposal(over = {}) {
  return {
    proposalId: nextId('prop'),
    from: PEER,
    targetPackageId: 'pkg-1',
    baseHash: 'sha256:base',
    contentHash: 'sha256:x',
    zones: ['zone-1'],
    reverses: 'restore pkg-1 to sha256:base',
    requiresHuman: true,
    staging: 'received',
    declaration: CLEAN,
    ...over,
  }
}

// ---------------------------------------------------------------------------
// the result accounting
// ---------------------------------------------------------------------------
const results = []
const exercised = new Set()

/**
 * Assert BOTH directions for one threat, plus the attribution.
 *
 * `hostileFn` returns an Admission; the assertion is `verdict === 'refused'` AND
 * `refusedBy === threat`. The benign function must NOT be refused.
 */
function expectBoth(label, threat, hostileFn, benignFn) {
  const hostile = hostileFn()
  const benign = benignFn()

  const refused = hostile.verdict === 'refused'
  const names = hostile.refusedBy === threat
  const benignOk = benign.verdict !== 'refused'

  exercised.add(threat)

  results.push({
    label,
    threat,
    hostileVerdict: hostile.verdict,
    hostileBy: hostile.refusedBy,
    benignVerdict: benign.verdict,
    pass: refused && names && benignOk,
    why: refused ? (names ? (benignOk ? 'refused AND names the threat AND a benign input was admitted' : `BENIGN SIDE FAILED: the benign input was also refused (${benign.refusedBy})`) : `WRONG THREAT NAMED: expected ${threat}, got ${hostile.refusedBy}`) : `NOT REFUSED: verdict ${hostile.verdict}`,
  })
}

/** Assert a single direction where a benign twin is not the same shape. */
function expectRefused(label, threat, fn) {
  const a = fn()
  exercised.add(threat)
  const pass = a.verdict === 'refused' && a.refusedBy === threat
  results.push({
    label,
    threat,
    hostileVerdict: a.verdict,
    hostileBy: a.refusedBy,
    benignVerdict: '-',
    pass,
    why: pass ? 'refused AND names the threat' : `UNMET: verdict ${a.verdict}, refusedBy ${a.refusedBy}, expected refused/${threat}`,
  })
}

/** Assert an outcome that is NOT a refusal but is also not a pass — the abstention channel. */
function expectAbstained(label, threat, fn) {
  const a = fn()
  exercised.add(threat)
  const pass = a.verdict === 'abstained' && a.refusedBy === threat
  results.push({
    label,
    threat,
    hostileVerdict: a.verdict,
    hostileBy: a.refusedBy,
    benignVerdict: '-',
    pass,
    why: pass ? 'abstained AND names the threat' : `UNMET: verdict ${a.verdict}, refusedBy ${a.refusedBy}, expected abstained/${threat}`,
  })
}

// ===========================================================================
// T01 — version, and the ORDERING control
// ===========================================================================
expectBoth(
  'T01 specVersion 2 instead of 1',
  'T01',
  () => admitEnvelope(envelope({ specVersion: 2 }), deps()),
  () => admitEnvelope(envelope(), deps()),
)

// THE ORDERING CONTROL — wrong in FOUR ways at once. It must report T01, because
// T01 is checked first. If this reports T04, the order is unstated and a future
// edit could move it silently.
{
  const a = admitEnvelope(
    envelope({ specVersion: 2, expiresAt: EARLIER, step: 99, maxSteps: 99, messageId: '' }),
    deps(),
  )
  exercised.add('T01')
  results.push({
    label: 'ORDERING CONTROL: wrong 4 ways at once must report T01 first',
    threat: 'T01',
    hostileVerdict: a.verdict,
    hostileBy: a.refusedBy,
    benignVerdict: '-',
    pass: a.refusedBy === 'T01',
    why: a.refusedBy === 'T01' ? 'the FIRST failing check reports, so the refusal is attributable' : `ORDERING BROKEN: reported ${a.refusedBy} — the order is unstated, so a future edit can move it silently`,
  })
}

// ===========================================================================
// T02 — identity
// ===========================================================================
expectBoth(
  'T02 from does not match the card / self-addressed',
  'T02',
  () => admitEnvelope(envelope({ from: THIS, to: THIS }), deps()),
  () => admitEnvelope(envelope(), deps()),
)
expectRefused(
  'T02 mis-addressed to a third party',
  'T02',
  () => admitEnvelope(envelope({ to: 'inst-other' }), deps()),
)

// ===========================================================================
// T03 — replay
// ===========================================================================
{
  const d = deps()
  const e = envelope({ messageId: 'fixed-replay-id' })
  const first = admitEnvelope(e, d)
  const second = admitEnvelope(e, d)
  exercised.add('T03')
  const pass = first.verdict !== 'refused' && second.verdict === 'refused' && second.refusedBy === 'T03'
  results.push({
    label: 'T03 the SAME messageId twice: first carries the effect, second is refused',
    threat: 'T03',
    hostileVerdict: `first=${first.verdict}, second=${second.verdict}`,
    hostileBy: second.refusedBy,
    benignVerdict: first.verdict,
    pass,
    why: pass ? 'the first delivery was admitted and the second refused BY T03' : `UNMET: first=${first.verdict}/${first.refusedBy}, second=${second.verdict}/${second.refusedBy}`,
  })
}

// ===========================================================================
// T04 — expiry, BOTH directions plus the malformed case
// ===========================================================================
expectBoth(
  'T04 an envelope that expired an hour ago',
  'T04',
  () => admitEnvelope(envelope({ expiresAt: EARLIER }), deps()),
  () => admitEnvelope(envelope(), deps()),
)
expectRefused(
  'T04 a NON-ISO expiresAt (malformed is not unlimited)',
  'T04',
  () => admitEnvelope(envelope({ expiresAt: 'yesterday-ish' }), deps()),
)

// ===========================================================================
// T05 — the flood. 11 envelopes, budget 8.
// ===========================================================================
{
  const d = deps()
  let admitted = 0
  let refusedByT05 = 0
  for (let i = 0; i < 11; i += 1) {
    const a = admitEnvelope(envelope({ messageId: `flood-${i}` }), d)
    if (a.verdict !== 'refused') admitted += 1
    else if (a.refusedBy === 'T05') refusedByT05 += 1
  }
  exercised.add('T05')
  const pass = admitted === 8 && refusedByT05 === 3
  results.push({
    label: 'T05 11 well-formed envelopes against a budget of 8',
    threat: 'T05',
    hostileVerdict: `admitted=${admitted}, refusedByT05=${refusedByT05}`,
    hostileBy: 'T05',
    benignVerdict: '-',
    pass,
    why: pass ? 'exactly 8 admitted of 11, the last 3 refused BY T05 — each one individually admissible, so only an aggregate bound can see them' : `UNMET: admitted ${admitted} of 11 (expected 8), refused by T05 ${refusedByT05} (expected 3)`,
  })
}

// ===========================================================================
// T06 — the step budget and the ceiling
// ===========================================================================
expectRefused(
  'T06 step has reached maxSteps',
  'T06',
  () => admitEnvelope(envelope({ step: 8, maxSteps: 8 }), deps()),
)
expectRefused(
  'T06 a sender raises its own budget above the ceiling',
  'T06',
  () => admitEnvelope(envelope({ step: 0, maxSteps: 1000000 }), deps()),
)
expectBoth(
  'T06 within budget',
  'T06',
  () => admitEnvelope(envelope({ step: 99, maxSteps: 100 }), deps()),
  () => admitEnvelope(envelope({ step: 0, maxSteps: 8 }), deps()),
)

// ===========================================================================
// T07 — the payload hash, INCLUDING the canonical-form control
// ===========================================================================
{
  const payload = { b: 2, a: 1 }
  const payloadReordered = { a: 1, b: 2 }
  const h = computeContentHash(payload)
  const h2 = computeContentHash(payloadReordered)
  exercised.add('T07')

  const good = admitPatch(proposal({ contentHash: h }), payload, deps({ purposes: AUTHORING }))
  const tampered = admitPatch(proposal({ contentHash: h }), { a: 1, b: 999 }, deps({ purposes: AUTHORING }))

  const canonicalOk = h === h2
  const pass = good.verdict !== 'refused' && tampered.verdict === 'refused' && tampered.refusedBy === 'T07' && canonicalOk
  results.push({
    label: 'T07 tampered payload refused; two key-orderings of ONE payload hash alike',
    threat: 'T07',
    hostileVerdict: tampered.verdict,
    hostileBy: tampered.refusedBy,
    benignVerdict: good.verdict,
    pass,
    why: pass
      ? 'the tampered payload was refused BY T07 AND the canonical form is order-independent (otherwise the control would refuse honest peers)'
      : `UNMET: tampered=${tampered.verdict}/${tampered.refusedBy}, honest=${good.verdict}/${good.refusedBy}, canonicalEqual=${canonicalOk}`,
  })
}

// ===========================================================================
// T08 — the declared creds+network axis
// ===========================================================================
expectBoth(
  'T08 declares credentials AND network',
  'T08',
  () => admitPatch(proposal({ declaration: { capabilities: ['credentials', 'network'], redLines: [], declaresNothing: false } }), undefined, deps({ purposes: AUTHORING })),
  () => admitPatch(proposal(), undefined, deps({ purposes: AUTHORING })),
)

// ===========================================================================
// T09 — THE RED-LINE-ONLY CLASS. This is the falsifier that makes the union rule load-bearing.
// ===========================================================================
{
  const redLineOnly = {
    capabilities: [],
    redLines: ['reads credentials/secrets AND has network access'],
    declaresNothing: false,
  }
  // The FALSIFIER: if the declaration had been read as `capabilities` alone, this
  // row looks CLEAN. The check below asserts that the capabilities half really does
  // say "credentials absent", so the refusal cannot be an accident of both halves.
  const capsOnlySaysClean = !redLineOnly.capabilities.includes('credentials') && !redLineOnly.capabilities.includes('network')

  expectBoth(
    `T09 red-line-only creds+network, with an EMPTY capabilities array (capabilities alone says clean: ${capsOnlySaysClean})`,
    'T09',
    () => admitPatch(proposal({ declaration: redLineOnly }), undefined, deps({ purposes: AUTHORING })),
    () => admitPatch(proposal(), undefined, deps({ purposes: AUTHORING })),
  )
  if (!capsOnlySaysClean) {
    results.push({
      label: 'T09 FALSIFIER PRECONDITION: the capabilities half must say "credentials absent"',
      threat: 'T09',
      hostileVerdict: '-',
      hostileBy: null,
      benignVerdict: '-',
      pass: false,
      why: 'the falsifier is not a falsifier: the capabilities array DOES name credentials, so this case does not test the union',
    })
  }
}

// ===========================================================================
// T10 — "declares nothing" is THREE claims, and the mechanisms must differ
// ===========================================================================
{
  const absentKey = admitPatch(proposal({ declaration: {} }), undefined, deps({ purposes: AUTHORING }))
  const emptyArray = admitPatch(proposal({ declaration: { capabilities: [], redLines: [], declaresNothing: true } }), undefined, deps({ purposes: AUTHORING }))
  exercised.add('T10')
  const absentReason = absentKey.record.measured.reason ?? ''
  const emptyReason = emptyArray.record.measured.reason ?? ''
  const mechanismDiffers = absentReason.includes('no-capabilities-key') && emptyReason.includes('empty-capabilities-array')
  const pass = absentKey.verdict === 'abstained' && emptyArray.verdict === 'abstained' && mechanismDiffers
  results.push({
    label: 'T10 absent key vs empty array: same outcome, DIFFERENT mechanism, never auto-staged',
    threat: 'T10',
    hostileVerdict: `absentKey=${absentKey.verdict}, emptyArray=${emptyArray.verdict}`,
    hostileBy: absentKey.refusedBy,
    benignVerdict: '-',
    pass,
    why: pass
      ? 'both abstained (so neither is auto-staged) AND the mechanisms differ — an absent declaration and an empty one are different claims about a peer'
      : `UNMET: absentKey=${absentKey.verdict}, emptyArray=${emptyArray.verdict}, mechanismDiffers=${mechanismDiffers}`,
  })
}

// ===========================================================================
// T11 — install-time execution
// ===========================================================================
expectAbstained(
  'T11 a red line naming install-time execution (24 of 4,527 rows)',
  'T11',
  () => admitPatch(proposal({ declaration: { capabilities: ['fs-read'], redLines: ['runs code at install time'], declaresNothing: false } }), undefined, deps({ purposes: AUTHORING })),
)

// ===========================================================================
// T12 — THE CONFUSED DEPUTY
// ===========================================================================
// `contentHash` here is a REAL digest, for the reason recorded at the T13 case
// below: the hostile input must be valid everywhere EXCEPT the field under test,
// or a later edit that reorders the checks turns this into a T07 refusal and the
// assertion fails for the wrong reason. It previously carried the placeholder
// `'sha256:x'`. The refusal is still attributed to T12 and no assertion changed.
expectBoth(
  'T12 an OFFER carried on an alignment-role envelope',
  'T12',
  () => admitEnvelope(
    envelope({ offer: { zones: [], contentHash: computeContentHash({ zones: [] }), declaration: CLEAN }, decision: { decision: 'choice', value: 'intent-alignment', labelSet: 'alignVerdict' } }),
    deps({ purposes: ALIGN_ONLY }),
  ),
  () => admitEnvelope(envelope(), deps({ purposes: ALIGN_ONLY })),
)

// The STRUCTURAL half: a patch cannot even be EXPRESSED on a DialogueEnvelope.
{
  const offerKeys = ['proposalId', 'baseHash', 'reverses']
  const e = envelope()
  const expressible = offerKeys.filter((k) => k in e)
  exercised.add('T12')
  results.push({
    label: 'T12 STRUCTURAL: DialogueEnvelope has no field that could carry a PatchProposal',
    threat: 'T12',
    hostileVerdict: '-',
    hostileBy: null,
    benignVerdict: '-',
    pass: expressible.length === 0,
    why: expressible.length === 0
      ? 'none of proposalId/baseHash/reverses is a field of DialogueEnvelope, so the alignment path has no code path to an application — the separation is a property of the call graph, not a rule'
      : `LEAKED: ${expressible.join(', ')} present on the envelope, so an alignment message could express a patch`,
  })
}

// The structural half, second form: admitPatch is a SEPARATE entry point that
// refuses a proposal whose proposer holds only intent-alignment.
expectRefused(
  'T12/T14 the patch entry point refuses a proposal from an alignment-only peer',
  'T14',
  () => admitPatch(proposal(), undefined, deps({ purposes: ALIGN_ONLY })),
)

// ===========================================================================
// T13 — offer smuggling via zones
// ===========================================================================
//
// NOTE THE HASH IN THESE FIXTURES: a real digest, not `'sha256:x'`. The first
// version of this case used the placeholder, and when T07's envelope branch
// gained its MAGNITUDE check the benign twin began failing as T07. **The gate was
// right and the FIXTURE was malformed** — the same shape as `verifier`'s benign
// fixture missing its `labelSet`. A harness must use inputs that are valid
// everywhere except the field under test.
const ZONES_HASH = computeContentHash({ zones: ['zone-1'] })

expectBoth(
  'T13 zones: [{}, "zone-1"] — the reason must name index 0',
  'T13',
  () => admitEnvelope(envelope({ offer: { zones: [{}, 'zone-1'], contentHash: ZONES_HASH, declaration: CLEAN }, decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' } }), deps({ purposes: AUTHORING })),
  () => admitEnvelope(envelope({ offer: { zones: ['zone-1'], contentHash: ZONES_HASH, declaration: CLEAN }, decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' } }), deps({ purposes: AUTHORING })),
)
{
  const a = admitEnvelope(envelope({ offer: { zones: [{}, 'zone-1'], contentHash: ZONES_HASH, declaration: CLEAN }, decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' } }), deps({ purposes: AUTHORING }))
  const reason = a.record.measured.reason ?? ''
  exercised.add('T13')
  results.push({
    label: 'T13 the refusal NAMES the offending index',
    threat: 'T13',
    hostileVerdict: a.verdict,
    hostileBy: a.refusedBy,
    benignVerdict: '-',
    pass: /index 0/.test(reason),
    why: /index 0/.test(reason) ? 'the reason names index 0, so the refusal is actionable' : `the reason does not name the index: ${reason}`,
  })
}

// ===========================================================================
// T14 — role confusion: an undeclared purpose
// ===========================================================================
expectRefused(
  'T14 the peer declares an undeclared purpose (root)',
  'T14',
  () => admitPatch(proposal(), undefined, deps({ purposes: ['root'] })),
)

// ===========================================================================
// T15/T16 — LOCAL INTENT OVERRIDE, as an INVARIANT rather than a reading
// ===========================================================================
{
  const localZones = ['zone-a', 'zone-b']
  const before = JSON.stringify(localZones)
  const localIdentity = { model: 'qwen3-embedding:0.6b', dim: 1024, modelSource: 'server-self-report', endpoint: 'http://127.0.0.1:8080' }
  const app = applyPeerIntent(['zone-c', 'zone-d'], { zoneIds: localZones, identity: localIdentity }, localIdentity, deps())
  const after = JSON.stringify(localZones)
  exercised.add('T15')
  exercised.add('T16')
  const pass = app.mutatedLocalIntent === false && before === after && app.proposal.requiresHuman === true
  results.push({
    label: 'T15/T16 the local intent view is UNCHANGED and requiresHuman is true and NOT read from the peer',
    threat: 'T15',
    hostileVerdict: `mutatedLocalIntent=${app.mutatedLocalIntent}`,
    hostileBy: null,
    benignVerdict: `local view ${before} -> ${after}`,
    pass,
    why: pass
      ? 'the caller-supplied local view is byte-identical across the call, the flag is the literal false, and every return carries requiresHuman: true — so no peer-supplied path can lower it'
      : `UNMET: mutated=${app.mutatedLocalIntent}, viewChanged=${before !== after}, requiresHuman=${app.proposal.requiresHuman}`,
  })
}

// ===========================================================================
// T17 — cross-vector-space scoring
// ===========================================================================
{
  const local = { model: 'qwen3-embedding:0.6b', dim: 1024, modelSource: 'server-self-report', endpoint: 'x' }
  const cases = [
    ['different model', { ...local, model: 'laya-encoder' }],
    ['same model, different dim', { ...local, dim: 768 }],
    ['unread model', { ...local, model: null }],
  ]
  let refused = 0
  for (const [, peer] of cases) {
    const r = applyPeerIntent(['z'], { zoneIds: [], identity: local }, peer, deps())
    if (!r.identity.present) refused += 1
  }
  exercised.add('T17')
  const pass = refused === 3
  results.push({
    label: 'T17 model mismatch, dim mismatch, and an UNREAD identity are all refused',
    threat: 'T17',
    hostileVerdict: `${refused} of 3 refused`,
    hostileBy: 'T17',
    benignVerdict: '-',
    pass,
    why: pass ? 'all 3 refused — an unread identity is refused rather than compared, which is the case a naive check treats as a match' : `UNMET: ${refused} of 3 refused`,
  })
}

// ===========================================================================
// T19 — quarantine bypass: applied is ALWAYS false
// ===========================================================================
{
  const a = admitPatch(proposal({ contentHash: computeContentHash({ ok: true }) }), { ok: true }, deps({ purposes: AUTHORING }))
  const b = admitEnvelope(envelope(), deps())
  const c = admitPatch(proposal({ reverses: '' }), undefined, deps({ purposes: AUTHORING }))
  exercised.add('T19')
  const neverApplied = a.applied === false && b.applied === false && c.applied === false
  const emptyUndoRefused = c.verdict === 'refused' && c.refusedBy === 'T19'
  const pass = neverApplied && emptyUndoRefused && a.verdict === 'pass'
  results.push({
    label: 'T19 applied === false on every path, AND an EMPTY reverses is refused (presence is not a path)',
    threat: 'T19',
    hostileVerdict: `admitPatch.applied=${a.applied}, emptyReverses=${c.verdict}/${c.refusedBy}`,
    hostileBy: c.refusedBy,
    benignVerdict: `admitted patch verdict=${a.verdict}`,
    pass,
    why: pass
      ? 'no path returns applied: true, the honest patch is admitted, and `reverses: ""` is refused — a presence-only check would have certified an irreversible patch as reversible'
      : `UNMET: neverApplied=${neverApplied}, emptyUndoRefused=${emptyUndoRefused}, honestPatchVerdict=${a.verdict}`,
  })
}

// ===========================================================================
// T20 — the source conformance check, WITH a negative control
// ===========================================================================
{
  const { readFileSync } = await import('node:fs')
  const SINK = /child_process|execSync|\bexec\(|spawn\(|eval\(|new Function|fetch\(|http\.request/i

  const countSinks = (src) => src.split('\n').filter((l) => SINK.test(l) && !/^\s*(\*|\/\/)/.test(l)).length

  const realSpec = readFileSync(GATE_TS, 'utf8')
  const realHits = countSinks(realSpec)

  // THE NEGATIVE CONTROL: inject a sink into a COPY and require the scanner to go
  // RED. A scanner that cannot fail is not a scanner.
  const mutated = `${realSpec}\nconst __mutant = (s) => eval(s)\n`
  const mutantHits = countSinks(mutated)

  exercised.add('T20')
  const pass = realHits === 0 && mutantHits > 0
  results.push({
    label: 'T20 0 dangerous sinks in the gate source, AND the scanner goes RED on a mutated copy',
    threat: 'T20',
    hostileVerdict: `real=${realHits}, mutant=${mutantHits}`,
    hostileBy: null,
    benignVerdict: '-',
    pass,
    why: pass
      ? 'the source has 0 sinks AND the same expression finds 1 in a copy with a sink injected — so the 0 is a reading rather than a counter that always returns 0'
      : `UNMET: real=${realHits} (expected 0), mutant=${mutantHits} (expected >0). If mutant is 0 the SCANNER cannot fail and the real 0 is worthless`,
  })
}

// ===========================================================================
// T07b — the ENVELOPE surface. Found by `verifier` as A18b.
// ===========================================================================
//
// The envelope cannot compare a hash to a payload (none is carried, by T12's
// design) but it CAN refuse a digest that is not a digest. Before this case
// existed the envelope branch was PRESENCE-only and admitted `contentHash: 'x'`.
{
  const goodHash = computeContentHash({ ok: true })
  const authoring = { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' }

  const malformed = admitEnvelope(
    envelope({ offer: { zones: [], contentHash: 'x', declaration: CLEAN }, decision: authoring }),
    deps({ purposes: AUTHORING }),
  )
  const wellFormed = admitEnvelope(
    envelope({ offer: { zones: [], contentHash: goodHash, declaration: CLEAN }, decision: authoring }),
    deps({ purposes: AUTHORING }),
  )
  exercised.add('T07')
  const pass = malformed.verdict === 'refused' && malformed.refusedBy === 'T07' && wellFormed.verdict !== 'refused'
  results.push({
    label: 'T07 ENVELOPE SURFACE: a malformed digest is refused BY T07, a well-formed one passes',
    threat: 'T07',
    hostileVerdict: malformed.verdict,
    hostileBy: malformed.refusedBy,
    benignVerdict: wellFormed.verdict,
    pass,
    why: pass
      ? 'the envelope refuses a non-digest BY T07 and admits a well-formed digest — this surface checks MAGNITUDE while the payload comparison stays in admitPatch, which is the distinction the T07 row now states'
      : `UNMET: malformed=${malformed.verdict}/${malformed.refusedBy}, wellFormed=${wellFormed.verdict}/${wellFormed.refusedBy}`,
  })
}

// ===========================================================================
// T12b — the LABEL SET. Found by `verifier` as their finding two.
// ===========================================================================
//
// The grammar registers FOUR sets and all four accept the string
// 'patch-authoring'. Only `alignVerdict` is the authoring role, so the right
// value over a WRONG set must be refused, and the refusal must say which.
{
  const wrongSet = admitEnvelope(
    envelope({ offer: { zones: [], contentHash: computeContentHash({ ok: true }), declaration: CLEAN }, decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'threeKind' } }),
    deps({ purposes: AUTHORING }),
  )
  const rightSet = admitEnvelope(
    envelope({ offer: { zones: [], contentHash: computeContentHash({ ok: true }), declaration: CLEAN }, decision: { decision: 'choice', value: 'patch-authoring', labelSet: 'alignVerdict' } }),
    deps({ purposes: AUTHORING }),
  )
  const reason = wrongSet.record.measured.reason ?? ''
  exercised.add('T12')
  const namesTheSet = /alignVerdict/.test(reason) && /threeKind/.test(reason)
  const pass = wrongSet.verdict === 'refused' && wrongSet.refusedBy === 'T12' && namesTheSet && rightSet.verdict !== 'refused'
  results.push({
    label: 'T12 LABEL SET: the right value over the WRONG registered set is refused, and the reason names BOTH sets',
    threat: 'T12',
    hostileVerdict: wrongSet.verdict,
    hostileBy: wrongSet.refusedBy,
    benignVerdict: rightSet.verdict,
    pass,
    why: pass
      ? 'refused BY T12 and the reason names the expected set and the received one, so a peer is told WHICH SET rather than merely that its label was wrong'
      : `UNMET: wrongSet=${wrongSet.verdict}/${wrongSet.refusedBy}, rightSet=${rightSet.verdict}, namesBothSets=${namesTheSet}, reason=${reason}`,
  })
}

// ===========================================================================
// THE INSTRUMENT GUARD — a 0 on both sides is not a pass
// ===========================================================================
{
  const exercisedCount = exercised.size
  const runCount = results.length
  exercised.add('T21')
  const pass = exercisedCount > 0 && runCount > 0
  results.push({
    label: 'INSTRUMENT GUARD: the harness saw its own subject',
    threat: 'T21',
    hostileVerdict: `exercised ${exercisedCount} distinct threat ids`,
    hostileBy: null,
    benignVerdict: `${runCount} assertions ran`,
    pass,
    why: pass
      ? `the probe observed ${exercisedCount} distinct threats over ${runCount} assertions — a 0 on both sides would have been an INSTRUMENT FAILURE, not a pass`
      : 'INSTRUMENT FAILURE: 0 of 0 — the harness did not exercise its subject, so no verdict about it is a measurement',
  })
}

// ===========================================================================
// THE STANDING CHECK — a claim the harness cannot reproduce fails the run
// ===========================================================================
{
  const census = threatCensus()
  const claimedRan = Object.entries(CONTROL_STANDING).filter(([, s]) => s === 'VERIFIED (ran)').map(([id]) => id)
  const unexercisedClaims = claimedRan.filter((id) => !exercised.has(id))
  exercised.add('T22')
  const pass = unexercisedClaims.length === 0
  results.push({
    label: `STANDING CHECK: all ${claimedRan.length} threat(s) claiming VERIFIED (ran) were actually exercised`,
    threat: 'T22',
    hostileVerdict: `claimed VERIFIED (ran): ${claimedRan.length === 0 ? 'none' : claimedRan.join(', ')}`,
    hostileBy: null,
    benignVerdict: `census: ${census.verifiedRan} ran / ${census.verifiedRead} read / ${census.planned} plan, of ${census.of}; without a control: ${census.withoutControl}`,
    pass,
    why: pass
      ? claimedRan.length === 0
        ? `no threat claims VERIFIED (ran) yet, and the harness can now reproduce a claim. Threats exercised in this run: ${[...exercised].sort().join(', ')}`
        : `every VERIFIED (ran) claim (${claimedRan.join(', ')}) was exercised in this run`
      : `UNBACKED CLAIM: ${unexercisedClaims.join(', ')} claim VERIFIED (ran) but were never exercised — a standing the harness cannot reproduce is exactly the defect the harness exists to catch`,
  })
}

// ===========================================================================
// THE IMPLEMENTATION AXIS — a row may not CLAIM a code path it does not have
// ===========================================================================
// Added by L10 (task-25). THE DEFECT THIS EXISTS FOR, stated exactly:
//
// `CONTROL_STANDING` answers "has a run observed this row?" and was being READ as
// though it answered "is this row's control CODE?". Those are different questions,
// and the gap between them was occupied by three rows. This harness knew the
// difference and did not assert it: `exercised.add(threat)` recorded that a CASE
// EXISTED, so T15/T16/T20 entered the `exercised` set while running NO refusal
// path, and the standing check then reported them as "exercised".
//
// `CONTROL_IMPLEMENTATION` answers the second question. THIS assertion forces the
// two to agree: **a row declared IMPLEMENTED or PARTIAL must have had its OWN id
// returned by a refusal IN THIS RUN.** Without it the new axis is prose about
// code — the very defect the axis was written to expose.
//
// **THE ASSERTION IS FALSIFIABLE BY CONSTRUCTION AND I FIRED IT MYSELF.** Its
// author first wrote `T16: 'IMPLEMENTED'` from a judgement about the mechanism
// rather than from a measurement, and this check is what caught it: no path in
// `gate.ts` returns `refusedBy === 'T16'`. A check whose author's own error goes
// RED is a check rather than a green light.
const attributed = new Set(results.map((r) => r.hostileBy).filter((b) => b !== null && b !== undefined))
{
  const declared = Object.entries(CONTROL_IMPLEMENTATION)
  const unbacked = declared.filter(([id, s]) => (s === 'IMPLEMENTED' || s === 'PARTIAL') && !attributed.has(id))
  const count = (s) => declared.filter(([, v]) => v === s).length
  const impl = count('IMPLEMENTED')
  const partial = count('PARTIAL')
  const docOnly = count('DOCUMENTED-ONLY')
  const noClaim = count('NO-CONTROL-CLAIMED')
  const closes = impl + partial + docOnly + noClaim === declared.length
  const declaring = impl + partial + docOnly
  results.push({
    label: `the implementation axis is BACKED BY THIS RUN — ${impl} IMPLEMENTED, ${partial} PARTIAL, ${docOnly} DOCUMENTED-ONLY, ${noClaim} NO-CONTROL-CLAIMED, of ${declared.length} rows`,
    threat: 'ALL',
    hostileVerdict: `${attributed.size} id(s) attributed by a refusal`,
    hostileBy: null,
    benignVerdict: `${declaring} of ${declared.length} declare a control; ${declaring} + ${noClaim} uses three states, not two`,
    pass: unbacked.length === 0 && closes,
    why: !closes
      ? `THE ARITHMETIC DOES NOT CLOSE: ${impl}+${partial}+${docOnly}+${noClaim} = ${impl + partial + docOnly + noClaim} against ${declared.length} rows`
      : unbacked.length === 0
        ? `every row declared IMPLEMENTED or PARTIAL returned its OWN id from a code path in this run: ${[...attributed].sort().join(', ')}. The ${docOnly} DOCUMENTED-ONLY row(s) and ${noClaim} NO-CONTROL row(s) are named as such rather than counted as implemented.`
        : `UNBACKED CLAIM: ${unbacked.map(([id, s]) => `${id} declares ${s}`).join(', ')} — but no code path returns that row's own id, so the control is PROSE wearing the state of code`,
  })
}

// ===========================================================================
// the report
// ===========================================================================
const failed = results.filter((r) => !r.pass)
const pad = (s, n) => String(s).padEnd(n)

console.log('')
console.log('dsh-meta-market L5 attacker harness — census ' + new Date().toISOString())
console.log('gate source: ' + GATE_TS)
console.log('clock: fixed at ' + NOW + ' (an injected clock, so expiry is testable in both directions)')
console.log('')
console.log(pad('THREAT', 7) + pad('VERDICT', 10) + pad('BY', 6) + pad('BENIGN', 10) + 'RESULT')
console.log('-'.repeat(96))
for (const r of results) {
  console.log(pad(r.threat, 7) + pad(r.hostileVerdict, 10) + pad(r.hostileBy ?? '-', 6) + pad(r.benignVerdict, 10) + (r.pass ? 'PASS' : 'FAIL'))
  console.log('   ' + r.label)
  console.log('   -> ' + r.why)
}
console.log('')
const census = threatCensus()
console.log(`ASSERTIONS: ${results.length - failed.length} passed, ${failed.length} failed, of ${results.length}`)
console.log(`THREAT IDS EXERCISED: ${[...exercised].sort().join(', ')} (${exercised.size} distinct)`)
console.log(`CONTROL CENSUS: ${census.verifiedRan} VERIFIED (ran), ${census.verifiedRead} VERIFIED (read), ${census.planned} PLAN — of ${census.of}; ${census.withoutControl} threat(s) have no control and are OPEN`)
console.log(`TABLE SIZE: ${THREATS.length} threats enumerated`)

if (results.length === 0 || exercised.size === 0) {
  console.error('')
  console.error('INSTRUMENT FAILURE: the harness exercised nothing. A 0 on both sides is not a pass.')
  process.exit(2)
}

if (failed.length > 0) {
  console.error('')
  console.error(`FAIL: ${failed.length} of ${results.length} assertions did not hold.`)
  for (const f of failed) console.error(`  ${f.threat} — ${f.label}: ${f.why}`)
  process.exit(1)
}

console.log('')
console.log('ALL ASSERTIONS HELD. The gate refused every hostile input it was shown, admitted every benign one,')
console.log('named the correct threat each time, and the standing check found no unbacked VERIFIED (ran) claim.')
process.exit(0)
