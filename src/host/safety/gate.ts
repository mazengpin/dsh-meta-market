/**
 * ============================================================================
 * dsh-meta-market — L5 SAFETY GATE (the adversary lane)
 * ============================================================================
 *
 * MISSION, verbatim from `task-6`: *"You are the ADVERSARY. Every other lane is
 * building an optimistic path; your job is to find the one that lets a hostile
 * peer harm this instance or another user's."*
 *
 * THE ACCEPTANCE CRITERION THIS FILE EXISTS TO MEET (`laya-fold-gate`, §9):
 *
 *   "Prove the gate can refuse before trusting it to allow.
 *    A gate that has never refused is untested."
 *
 * THE DESIGN RULE THAT FOLLOWS FROM IT, and it is why the checks below are
 * shaped the way they are: **a refusal is only attributable if the ORDER is
 * declared.** A gate whose first branch is a wildcard refuses everything and
 * reports the wildcard — which passes a naive "was it refused?" test. So the
 * checks are ORDERED, the order is documented at `admitEnvelope`, and the
 * harness asserts that the FIRST failing check is the one that reports: an
 * envelope wrong in four ways must say `T01`, not `T04`.
 *
 * ---------------------------------------------------------------------------
 * THE THING THIS FILE IS NOT, STATED FIRST SO NOBODY READS IT AS MORE
 * ---------------------------------------------------------------------------
 *
 * **This module is a VERDICT PRODUCER, not an enforcer.** It returns
 * `applied: false`; it cannot stop a caller that ignores that field. So the blast
 * radius is NOT bounded by this file — it is bounded by whether `task-5` calls it
 * before it applies anything. That is an architectural property, stated upward
 * rather than wrapped in a promise.
 *
 * **And every identity control below governs CONSISTENCY, not AUTHENTICITY.**
 * `PeerCard.selfAsserted` is named that way in `protocol.ts` because the type
 * system cannot tell a card from a claim. `T02` binds the envelope's `from` to
 * the card — but the card is a self-asserted claim, so a peer who COPIES an
 * honest card passes `T02`. **That is threat `T22`, it is OPEN, and `task-2`
 * owns key material.** `identity-trust` measured the other side of the same fact:
 * the deployment's id is a 37-byte bare UUID and `ed25519|generateKeyPair|
 * createSign|createVerify` match 0 of 0 non-test `.ts` files — **an IDENTIFIER
 * and no KEY.** Trust is therefore a `plan`, not an `exists`.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STANDING LIVES IN A SEPARATE MAP
 * ---------------------------------------------------------------------------
 *
 * `AGENTS.md`: *"Do not round a plan up to a control."* Every threat carries a
 * standing, and the standing is kept OUT of the threat prose in
 * `CONTROL_STANDING` so that it is a list a reader can audit in one screen and a
 * harness can check mechanically — a standing buried inside 22 narrative entries
 * is a standing nobody re-takes. `verify/attacker.mjs` asserts that **every
 * threat claiming `'VERIFIED (ran)'` was actually exercised**; a standing the
 * harness cannot reproduce is exactly the defect the harness exists to catch.
 *
 * ---------------------------------------------------------------------------
 * THE NO-DEVICE NOTE, DECLARED IN THE SOURCE RATHER THAN ONLY IN A PLAN DOC
 * ---------------------------------------------------------------------------
 *
 * The owner's gate is that GPU work is done by `llama.cpp` and its controlling
 * scripts, and that **no Cordis plugin opens a device**. This module makes no
 * model call, holds no CUDA context, and reads no weights. It is declared here so
 * a reader of the BUILT artifact sees it without opening a plan document.
 *
 * @module dsh-meta-market/host/safety/gate
 */

import { createHash } from 'node:crypto'

import { SPEC_VERSION, STEP_VERSION } from '../../shared/protocol.ts'
import type { DecisionValue, EmbeddingIdentity, Maybe, Measured, PatchProposal, Verdict, VerdictRecord } from '../../shared/protocol.ts'

import { absent, present, readField, readNonEmptyString, readStringArray, redLineReadsCredentialsAndNetwork, unionPrivilege, type Reading } from './absence-guard.ts'

/** See the header. A value so the harness can assert the declaration exists. */
export const TECHNICAL_NOTE_no_device =
  'dsh-meta-market/safety opens no GPU device: no model call, no CUDA context, no weights. GPU work is done by llama.cpp and its controlling scripts.'

/** The only three standings permitted, mirroring the program's evidence rules. */
export type ControlStatus = 'VERIFIED (ran)' | 'VERIFIED (read)' | 'PLAN'

/** Threat ids are enumerated so a refusal can NAME the one that fired. */
export type ThreatId =
  | 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07' | 'T08' | 'T09' | 'T10' | 'T11'
  | 'T12' | 'T13' | 'T14' | 'T15' | 'T16' | 'T17' | 'T18' | 'T19' | 'T20' | 'T21' | 'T22'

/** The assets a threat can harm. A threat with no asset is a worry, not a threat. */
export const ASSETS = {
  A1: "the local intent field — the user's already-formed intent (dsh-intent-map is LIVE and read-only here)",
  A2: "the market state the user reviews (this instance's staging area)",
  A3: "the user's credentials and secrets",
  A4: 'the host process and everything the agent can reach',
  A5: "the OTHER user — the peer's own intent and market (the confused-deputy victim)",
  A6: "the user's attention (the review queue whose economics approval depends on)",
} as const

/** One enumerated threat, with the asset it harms and the control that answers it. */
export interface ThreatEntry {
  readonly id: ThreatId
  readonly title: string
  /** The asset harmed, by key into `ASSETS`. */
  readonly asset: keyof typeof ASSETS
  readonly attack: string
  /** `null` means NO CONTROL IS CLAIMED — see the note on T18/T21/T22 below. */
  readonly control: string | null
  /** What must be observed for the row to earn its standing. */
  readonly falsifier: string
}

/**
 * THE THREAT TABLE — 22 entries.
 *
 * **19 carry a control (`T01`–`T17`, `T19`, `T20`). 3 do NOT: `T18` and `T22`
 * have `control: null` and are OPEN, and `T21` is stated rather than controlled.
 * 19 + 3 = 22.** The three are itemised so the arithmetic closes; a total that
 * closes while its parts do not is this program's recorded defect.
 */
export const THREATS: readonly ThreatEntry[] = [
  {
    id: 'T01',
    title: 'unknown protocol version',
    asset: 'A4',
    attack: 'declares specVersion 2 so the receiver parses a shape it was not written for; a field whose meaning changed is then acted on',
    control: 'refuse when specVersion/stepVersion differ from the frozen pair, BEFORE any other field is read — so a wrong version reports T01 and not the symptom it causes',
    falsifier: 'a specVersion of 2 must reach no offer/decision/budget branch',
  },
  {
    id: 'T02',
    title: 'identity spoofing',
    asset: 'A1',
    attack: "the envelope's `from` names a well-regarded admitted peer while the presented card belongs to the attacker; or `from === to`, so the receiver answers itself and a monologue carries two parties' standing",
    control: 'require `from === card.instanceId`, `to === thisInstanceId`, and `from !== to` — identity is bound to the CARD, not to the string the envelope carries',
    falsifier: 'a `from` differing from the card id is refused, AND `from === to` is refused',
  },
  {
    id: 'T03',
    title: 'replay',
    asset: 'A2',
    attack: 'the same envelope delivered twice. Every bounded operation becomes unbounded when the bound is counted per delivery rather than per message',
    control: "a replay registry keyed on messageId; only the FIRST delivery may carry an effect; entries expire on the envelope's own expiresAt, so memory is bounded by the same number that makes replay meaningful",
    falsifier: 'the same messageId is refused on the second delivery, AND a first delivery of a fresh id is admitted',
  },
  {
    id: 'T04',
    title: 'stale envelope',
    asset: 'A1',
    attack: 'an envelope captured hours ago is delivered after the local intent has moved, so a decision taken against the old intent lands against the new one',
    control: 'require a PARSEABLE expiresAt; refuse when the injected clock has reached it. An unparseable instant is a REFUSAL, not a pass — a malformed expiry is not an unlimited one',
    falsifier: 'a past expiresAt and a non-ISO expiresAt are BOTH refused',
  },
  {
    id: 'T05',
    title: 'proposal flood',
    asset: 'A6',
    attack: 'well-formed proposals as fast as the socket accepts. EVERY ONE of them is individually admissible, so no per-message check refuses any of them — the harm is the aggregate, which is why per-message validation structurally cannot see it',
    control: 'a per-peer, per-window budget; the (N+1)th is refused with a reason naming the window. Cost is counted BEFORE the payload is examined, so an expensive peer cannot buy admission with volume',
    falsifier: 'with max 8 in a 60s window, exactly 8 of 11 are admitted and the last 3 are refused BY T05',
  },
  {
    id: 'T06',
    title: 'step-budget exhaustion',
    asset: 'A4',
    attack: "the peer always has one more counter-offer, so the dialogue never terminates and the receiver's work is unbounded at the peer's discretion",
    control: 'refuse at `step >= maxSteps`, and refuse a SENDER-SUPPLIED maxSteps above the receiver ceiling — a budget the sender can raise is not a budget',
    falsifier: '`step >= maxSteps` is refused, AND `maxSteps: 1000000` is refused',
  },
  {
    id: 'T07',
    title: 'payload/hash mismatch',
    asset: 'A6',
    attack: 'declares contentHash H for a benign payload and sends H-prime. A reviewer who approved the DESCRIPTION approved something the payload does not say',
    control: 'TWO SURFACES, AND THEY CHECK DIFFERENT THINGS. (i) `admitPatch` recomputes sha256 over a CANONICAL serialisation and compares the whole string — canonical because two key orderings of one payload must hash alike, or the control is an outage that refuses honest senders. (ii) `admitEnvelope` checks the DIGEST MAGNITUDE only (`sha256:<64 hex>`), because an envelope carries no payload to compare against by T12 design. **The hash-to-payload comparison therefore happens ONLY in `admitPatch`, and the envelope surface is where a reader naturally looks for T07 — so this edge is stated here rather than left to be inferred.** Found by `verifier` as A18b; the envelope branch was presence-only and admitted `contentHash: "x"`, which is now refused.',
    falsifier: 'a tampered payload is refused BY T07 at admitPatch, AND a malformed contentHash is refused BY T07 at admitEnvelope, AND two key-orderings of the same payload hash alike',
  },
  {
    id: 'T08',
    title: 'hostile package, declared axis',
    asset: 'A3',
    attack: 'a proposal declaring `credentials` together with `network`. MEASURED: 440 of 4,527 catalog rows declare exactly that pair',
    control: 'refuse outright when the UNION carries both; never staged, because a control that only warns is a control that is ignored',
    falsifier: 'creds+network is refused AND a clean declaration is admitted',
  },
  {
    id: 'T09',
    title: 'hostile package, RED-LINE axis',
    asset: 'A3',
    attack: 'a CLEAN `capabilities` array while `capabilityRedLines` names reads-credentials-AND-network. **MEASURED: 23 of 4,527 rows carry that red line while declaring no `credentials` token at all** — so a filter reading `capabilities` alone does not undercount, it ADMITS those 23',
    control: 'take the UNION of both fields. The union is load-bearing because the two fields are independently derived and share NO TOKENS — the red lines are sentences and the capabilities are tokens, so "union" means two VOCABULARIES',
    falsifier: 'the red-line-only row is refused, AND `capabilities` alone is shown to say "credentials absent" for that same row',
  },
  {
    id: 'T10',
    title: 'under-declaration',
    asset: 'A2',
    attack: '396 catalog rows have no `capabilities` key and 546 carry `capabilities: []`. A reader that treats either as "can do nothing", or that sums them into one number, admits all 942',
    control: 'report `declaresNothing` WITH its mechanism (`no-capabilities-key` vs `empty-capabilities-array`), and treat a silent declaration as UNCATCHABLE — held for human review, never auto-staged',
    falsifier: 'absent key and empty array report DIFFERENT mechanisms, AND a silent declaration is not auto-staged',
  },
  {
    id: 'T11',
    title: 'install-time execution',
    asset: 'A4',
    attack: 'a red line naming `postinstall`/`install` — MEASURED: 24 of 4,527 rows. This runs BEFORE any review of runtime behaviour, so reviewing the runtime behaviour does not review the risk',
    control: 'escalate to human review with `requiresHuman`; never auto-staged, and the reason names install time rather than a generic escalation',
    falsifier: 'a red line naming install time yields abstention with `requiresHuman: true`',
  },
  {
    id: 'T12',
    title: 'CONFUSED DEPUTY',
    asset: 'A5',
    attack: "A talks to B \"to align intent\"; B uses that same channel to get A to apply a patch B should not be able to apply. **NOTE WHO IS HARMED: not A's user — A becomes the deputy, and B's other relationship is the victim**",
    control: 'purpose separation at THREE levels: (1) an offer travels only on an envelope whose decision is the declared patch-authoring label; (2) those labels are reachable only by a peer holding the `patch-authoring` role, and `intent-alignment` does NOT confer it; (3) **the patch entry point is a SEPARATE FUNCTION — an alignment envelope has no code path that could reach an application.** The refusal is structural, not a rule',
    falsifier: 'an alignment-role envelope carrying a non-null offer is refused, AND a non-authoring label carrying an offer is refused',
  },
  {
    id: 'T13',
    title: 'offer smuggling via `zones`',
    asset: 'A5',
    attack: 'the instruction hides in a field not treated as an instruction. `MetaPackage.zones` is typed `readonly string[]`, and a hostile peer sends OBJECTS whose `toString`/`toJSON` a downstream stringify reads',
    control: 'deep-check every `zones` entry as a STRING before any consumer sees the array, naming the offending INDEX so the refusal is actionable',
    falsifier: '`zones: [{}, "zone-1"]` is refused and the reason names index 0',
  },
  {
    id: 'T14',
    title: 'role confusion',
    asset: 'A5',
    attack: 'a peer admitted for alignment submits a patch. The grant that let it in is read as authority for work it was never granted',
    control: "purposes are a CLOSED set; `patch-authoring` is granted explicitly or not at all, and the patch path RE-CHECKS the proposer's role rather than trusting the admission that preceded it",
    falsifier: 'an alignment-only proposer is refused, AND an undeclared purpose (e.g. `root`) is refused',
  },
  {
    id: 'T15',
    title: 'LOCAL INTENT OVERRIDE',
    asset: 'A1',
    attack: "a peer sends zones it claims are \"close to yours\" and the local intent field absorbs a difference of the peer's choosing. **The premise is that the user's intent is ALREADY FORMED**, so absorbing anything at all is the whole harm",
    control: '**THE MECHANISM IS THAT THE FUNCTION HAS NO WRITE PATH TO EXPRESS.** It takes the peer zones as untrusted input, holds no reference to the intent field, calls no writer, and returns a `PatchProposal` with `requiresHuman: true` **that is not read from the peer** — so no peer-supplied path can lower it',
    falsifier: 'the caller-supplied local view is UNCHANGED across the call; `requiresHuman === true` on every return path',
  },
  {
    id: 'T16',
    title: 'intent override via the HTTP surface',
    asset: 'A1',
    attack: 'the plugin exposes an endpoint a peer can post intent to. The attack needs no exploit — it is the documented API, which is why this is the failure mode a gate forgets to check',
    control: "the same mechanism as T15, and the response carries `mutatedLocalIntent: false` as an INVARIANT rather than a reading. **The route surface is `task-8`'s file, so this lane claims the mechanism and NOT an endpoint it does not register**",
    falsifier: 'the local view is byte-identical after two calls, AND (task-8) no registered route writes the index',
  },
  {
    id: 'T17',
    title: 'cross-vector-space scoring',
    asset: 'A1',
    attack: "the peer vectors were built under one embedding model and this instance's index under another. The cosine is a number whose meaning is undefined — **and it will rank something**, so the failure is silent and confident",
    control: 'read BOTH identities and refuse on any difference in `model` OR `dim`, naming both. A missing identity is a REFUSAL with its reason, never a match — an unread model is not a matching model',
    falsifier: 'a different model is refused; the same model at a different `dim` is refused; an UNREAD identity is refused rather than compared',
  },
  {
    id: 'T18',
    title: 'Sybil',
    asset: 'A5',
    attack: 'create N identities, hold N votes, so "a large base of users agreeing" is purchasable at the price of N UUIDs',
    control: null,
    falsifier: 'NO CONTROL IN THIS LANE. The per-peer budget bounds what ONE identity may spend, which does not bound how many identities exist. Handed to `task-7` (social topology), which owns discovery and quorum',
  },
  {
    id: 'T19',
    title: 'quarantine bypass',
    asset: 'A2',
    attack: 'a path that applies directly, skipping staging. The gate is bypassed by not being called, which no check INSIDE the gate can detect',
    control: 'the patch entry point returns `applied: false` for EVERY verdict except a human-approved promotion this lane does not implement; staging is READ, never written, here; `task-5` must call this gate FIRST',
    falsifier: 'any `applied === true` returned from the patch path fails the row',
  },
  {
    id: 'T20',
    title: 'peer content treated as instruction',
    asset: 'A4',
    attack: 'a peer places instruction-shaped text in a field the receiving agent reads',
    control: 'the structural half: no text from `offer`/`zones`/`evidence`/`declaration` is fed to an evaluator. **What this does NOT prove: grep is a weak instrument and an indirectly-reached sink is invisible to it, so this is a conformance check standing BESIDE a control, not a control**',
    falsifier: '0 of 8 dangerous sinks in this module AND the scanner goes RED on a copy with a sink injected — a scanner that cannot fail is not a scanner',
  },
  {
    id: 'T21',
    title: 'BLAST RADIUS',
    asset: 'A1',
    attack: 'not a peer attack — the question that must be answered BEFORE mounting: if this plugin is compromised, what does the attacker get for free?',
    control: null,
    falsifier: "STATED, NOT CONTROLLED. Reachable: the intent index READ path (A1), the review queue contents (A2), the user's attention (A6), and through T12 the OTHER user (A5). Holds no device, no weights, no credential; writes no file and executes no patch. The reach is bounded by whether task-5 calls this gate — a verdict producer cannot enforce",
  },
  {
    id: 'T22',
    title: 'unsigned peer card',
    asset: 'A4',
    attack: "copy an honest peer's card. **THE honest answer: a card is indistinguishable from a claim, so this attack succeeds against EVERY control in this file**",
    control: null,
    falsifier: 'NO CONTROL IN THIS LANE, and that is the correct answer. Every identity control here governs CONSISTENCY, not AUTHENTICITY. `protocol.ts` records `selfAsserted` precisely because the type system cannot tell a card from a claim; `task-2` owns key material',
  },
]

/**
 * THE STANDING OF EACH CONTROL — the map the harness audits.
 *
 * Kept OUT of the threat prose on purpose: a standing buried inside 22 narrative
 * entries is a standing nobody re-takes, and this program re-takes numbers or
 * stops trusting them.
 *
 * **FLIPPED ONLY BY A RUN, AND THE RUN WENT RED FIRST.** `verify/attacker.mjs`
 * was executed against this file on 2026-10-16T17:12Z and reported **28 of 28
 * assertions held, 0 failed, exit 0**, exercising **21 distinct threat ids** in
 * both directions. Before the standings were flipped, the harness was made to go
 * **RED** — the `T01` version check was replaced with `if (false)` in a COPY of
 * this file and the suite reported **`27 passed, 1 failed`**, with
 * `T01 — T01 specVersion 2 instead of 1: NOT REFUSED: verdict pass`, exiting
 * **1**; the original was then restored and the suite returned to **28/28, exit
 * 0**. **That red-then-green is what makes this a control rather than a green
 * light**, and it is the discipline `laya-fold-gate` §9 demands: a gate that has
 * never refused is untested, and a suite that has never failed is not a suite.
 *
 * **`T18`, `T21` and `T22` stay `'PLAN'` PERMANENTLY** — they have no control, and
 * a standing of `'PLAN'` against `control: null` is the honest record of work
 * another lane owns. `T18` and `T22` are two faces of one fact: an identity is
 * free to manufacture, so nothing that depends on identity having a cost is safe.
 */
export const CONTROL_STANDING: Readonly<Record<ThreatId, ControlStatus>> = {
  T01: 'VERIFIED (ran)', T02: 'VERIFIED (ran)', T03: 'VERIFIED (ran)', T04: 'VERIFIED (ran)',
  T05: 'VERIFIED (ran)', T06: 'VERIFIED (ran)', T07: 'VERIFIED (ran)', T08: 'VERIFIED (ran)',
  T09: 'VERIFIED (ran)', T10: 'VERIFIED (ran)', T11: 'VERIFIED (ran)',
  T12: 'VERIFIED (ran)', T13: 'VERIFIED (ran)', T14: 'VERIFIED (ran)', T15: 'VERIFIED (ran)',
  T16: 'VERIFIED (ran)', T17: 'VERIFIED (ran)',
  T18: 'PLAN', T19: 'VERIFIED (ran)', T20: 'VERIFIED (ran)',
  T21: 'PLAN', T22: 'PLAN',
}

/**
 * WHETHER A ROW'S CONTROL IS **CODE** OR **PROSE** — a state ORTHOGONAL to `CONTROL_STANDING`.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY IT IS NOT A STANDING
 * ============================================================================
 *
 * `CONTROL_STANDING` answers *"has a run observed this row?"*. **It does not
 * answer *"does the row's stated control exist as executable code?"* — and this
 * lane proved those are DIFFERENT QUESTIONS by finding a row that passes the
 * first while failing the second.**
 *
 * **`T02` IS THE WORKED EXAMPLE, and the finding is that `:131` states three
 * conjuncts while only two are expressible.** The row's control reads:
 *
 *     require `from === card.instanceId`, `to === thisInstanceId`, and `from !== to`
 *
 * Measured by driving the artifact (`verify/implemented-sweep.mjs`):
 *
 *   - `from !== to`  — **IMPLEMENTED**, and genuinely covered: the hostile
 *     `from === to` is refused with `refusedBy === 'T02'`.
 *   - `to === thisInstanceId` — **IMPLEMENTED** (`refuse('T02', 'to must equal this instance id', …)`).
 *   - `from === card.instanceId` — **DOCUMENTED ONLY, AND UNEXPRESSIBLE AT THIS
 *     SIGNATURE. `GateDeps` has no `card` field, so no caller can supply the
 *     card this conjunct compares against. It is not merely unimplemented — it
 *     CANNOT be implemented without an interface change.** The only occurrence of
 *     `card.instanceId` in this file is the control string itself.
 *
 * **So `T02` is `'PARTIAL'`: the row is `VERIFIED (ran)`, correctly, AND half its
 * stated control is prose. Both are true at once and neither statement is
 * retired. That is the whole reason this is a separate axis rather than an
 * edited standing** — flipping `T02` off `'VERIFIED (ran)'` would deny the
 * measured refusal, and leaving it alone would repeat the overclaim.
 *
 * `T15`, `T16`, `T20` are `'DOCUMENTED-ONLY'`, and each for a DIFFERENT reason —
 * see `IMPLEMENTATION_NOTES`. **They are the sweep's real yield, and none of them
 * was known to the Lead or to me before it ran.**
 */
export type ControlImplementation =
  /** A line of code performs the control, and a run returns THIS row's own id. */
  | 'IMPLEMENTED'
  /** Part of the stated control is code and part is prose. See the notes. */
  | 'PARTIAL'
  /** The control is stated, and no executable path attributes a refusal to this row. */
  | 'DOCUMENTED-ONLY'
  /** `control: null` — the row claims no control at all, so there is nothing to implement. */
  | 'NO-CONTROL-CLAIMED'

/**
 * THE IMPLEMENTATION AXIS, one state per row.
 *
 * **Census (driven, `verify/implemented-sweep.mjs`, 2026-10-16T18:33Z): `15 IMPLEMENTED / 1 PARTIAL / 3 DOCUMENTED-ONLY / 3 NO-CONTROL-CLAIMED = 22`.**
 *
 * **Stated as the two denominators a reader needs, because a bare total hides which population it divided:**
 *
 *   - of the **19 rows that declare a control**: **15 IMPLEMENTED + 1 PARTIAL (`T02`) + 3 DOCUMENTED-ONLY (`T15`, `T16`, `T20`) = 19**;
 *   - of the **3 rows that declare none** (`T18`, `T21`, `T22`): all 3 are `NO-CONTROL-CLAIMED`;
 *   - **15 + 1 + 3 = 19**, and **19 + 3 = 22**.
 *
 * **`T16` IS `DOCUMENTED-ONLY` AND I FIRST WROTE IT AS `IMPLEMENTED`, then corrected it against this
 * lane's own measurement — recorded because the correction is the point.** My reasoning for
 * `IMPLEMENTED` was that T16's mechanism is real and drivable. **That is the wrong test.** The test
 * this axis applies is mechanical: does any code path RETURN this row's own id? **None returns
 * `'T16'`.** I had substituted a judgement about the mechanism for the measurement, which is the
 * exact move this program forbids — and it is worth noting that I made it *in the very file that
 * records the prohibition*, four minutes after writing the prohibition down. The note is retained
 * below rather than deleted, because the disagreement between the two readings is the useful part.
 */
export const CONTROL_IMPLEMENTATION: Readonly<Record<ThreatId, ControlImplementation>> = {
  T01: 'IMPLEMENTED', T02: 'PARTIAL', T03: 'IMPLEMENTED', T04: 'IMPLEMENTED',
  T05: 'IMPLEMENTED', T06: 'IMPLEMENTED', T07: 'IMPLEMENTED', T08: 'IMPLEMENTED',
  T09: 'IMPLEMENTED', T10: 'IMPLEMENTED', T11: 'IMPLEMENTED',
  T12: 'IMPLEMENTED', T13: 'IMPLEMENTED', T14: 'IMPLEMENTED',
  T15: 'DOCUMENTED-ONLY', T16: 'DOCUMENTED-ONLY', T17: 'IMPLEMENTED',
  T18: 'NO-CONTROL-CLAIMED', T19: 'IMPLEMENTED', T20: 'DOCUMENTED-ONLY',
  T21: 'NO-CONTROL-CLAIMED', T22: 'NO-CONTROL-CLAIMED',
}

/**
 * WHY each non-`'IMPLEMENTED'` row is what it is. Written out so a reader does not
 * have to reconstruct it from the code — which is the requirement this axis exists
 * to satisfy. One reason per row, and they are NOT interchangeable.
 */
export const IMPLEMENTATION_NOTES: Readonly<Partial<Record<ThreatId, string>>> = {
  T02: 'PARTIAL, and the split is the finding. IMPLEMENTED: `from !== to` (a hostile `from === to` is refused with refusedBy === "T02") and `to === thisInstanceId`. DOCUMENTED ONLY: `from === card.instanceId` — UNEXPRESSIBLE, because `GateDeps` carries no `card` field, so nothing can supply the value this conjunct compares against. The falsifier at the row therefore has a first conjunct that CANNOT pass; it is recorded as such rather than rewritten to its second conjunct alone.',
  T15: 'DOCUMENTED-ONLY for the same structural reason as T02: the mechanism is REAL (the function holds no writer, closes over no mutable intent state, and returns `mutatedLocalIntent: false` as a TYPED LITERAL), but nothing can REFUSE and attribute the refusal to T15, because admitting a peer intent is the ordinary path rather than an attack. **The control is a TYPE, not a check.** Reporting it as implemented would be reporting that a type can refuse an input it never sees.',
  T16: 'DOCUMENTED-ONLY, and I first recorded it as IMPLEMENTED — corrected against this lane\'s own measurement, which is recorded rather than quietly overwritten. The row claims `mutatedLocalIntent: false` plus "(task-8) no registered route writes the index". The first half is a TYPED LITERAL on every return path and is real; the second half belongs to task-8 and is not measurable from this lane, which registers no route at all. **No code path returns `refusedBy === "T16"`, so by this axis\'s mechanical test the row is DOCUMENTED-ONLY.** My first reading substituted "the mechanism is real and drivable" for "a run returns this row\'s id" — the judgement-for-measurement substitution this file forbids. The second half of the row is ALSO unproven here, which makes DOCUMENTED-ONLY the safer of the two readings rather than merely the stricter one.',
  T20: 'DOCUMENTED-ONLY as a GATE CONTROL, implemented as a SCANNER — and the row says so in its own text ("this is a conformance check standing BESIDE a control, not a control"). `verify/attacker.mjs` drives the scanner and it CAN go RED (0 sinks in the real source, 1 in a mutated copy). But it returns no `Admission`, so no `refusedBy` can ever name T20: it is a scanner over THIS MODULE, not a check on peer input. Under this sweep\'s rule a control must be able to attribute a refusal to its own id, so T20 is DOCUMENTED-ONLY; under a scanner rule it would pass. Both readings are stated so neither is inferred.',
  T18: 'NO-CONTROL-CLAIMED. `control: null`. A per-peer budget bounds what ONE identity spends and does not bound how many identities exist; discovery and quorum belong to `task-7`.',
  T21: 'NO-CONTROL-CLAIMED. `control: null`. A blast-radius STATEMENT, not a check — there is nothing to drive and nothing to refuse.',
  T22: 'NO-CONTROL-CLAIMED. `control: null`, and that is the correct answer. Every control in this file governs CONSISTENCY, not AUTHENTICITY: this deployment has an identifier and no key, so no check here can bind a peer to a card.',
}

/** The implementation census, as numerator and denominator. */
export function implementationCensus(): Measured & {
  readonly implemented: number
  readonly partial: number
  readonly documentedOnly: number
  readonly noControlClaimed: number
  readonly declaringControl: number
} {
  const ids = Object.keys(CONTROL_IMPLEMENTATION) as ThreatId[]
  let implemented = 0
  let partial = 0
  let documentedOnly = 0
  let noControlClaimed = 0
  for (const id of ids) {
    const s: ControlImplementation = CONTROL_IMPLEMENTATION[id]
    if (s === 'IMPLEMENTED') implemented += 1
    else if (s === 'PARTIAL') partial += 1
    else if (s === 'DOCUMENTED-ONLY') documentedOnly += 1
    else noControlClaimed += 1
  }
  const declaring = ids.length - noControlClaimed
  return { count: implemented, of: ids.length, implemented, partial, documentedOnly, noControlClaimed, declaringControl: declaring }
}

/** The census of the threat table, with numerator and denominator. */
export function threatCensus(): Measured & {
  readonly verifiedRan: number
  readonly verifiedRead: number
  readonly planned: number
  readonly withoutControl: number
} {
  const ids = Object.keys(CONTROL_STANDING) as ThreatId[]
  let ran = 0
  let read = 0
  let planned = 0
  for (const id of ids) {
    const s: ControlStatus = CONTROL_STANDING[id]
    if (s === 'VERIFIED (ran)') ran += 1
    else if (s === 'VERIFIED (read)') read += 1
    else planned += 1
  }
  const noControl = THREATS.filter((t) => t.control === null).length
  return { count: ran, of: ids.length, verifiedRan: ran, verifiedRead: read, planned, withoutControl: noControl }
}

/** The policy knobs, all in one place so a control is tunable without a hunt. */
export interface SafetyPolicy {
  readonly proposalBudget: { readonly max: number; readonly windowMs: number }
  readonly maxStepsCeiling: number
  /** The label set that authorises patch authoring. */
  readonly patchAuthoringRole: 'patch-authoring'
  readonly grantableRoles: readonly string[]
  readonly maxClockSkewMs: number
}

/** The defaults, whose numbers are chosen against measured harm rather than taste. */
export const DEFAULT_POLICY: SafetyPolicy = {
  proposalBudget: { max: 8, windowMs: 60_000 },
  maxStepsCeiling: 16,
  patchAuthoringRole: 'patch-authoring',
  grantableRoles: ['intent-alignment', 'patch-authoring'],
  maxClockSkewMs: 60_000,
}

/** A clock, injected. A control that reads `Date.now()` directly is not reproducible. */
export interface Clock {
  now(): number
}

/** A clock fixed at an instant, so both directions of every expiry test are testable. */
export function fixedClock(iso: string): Clock {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) throw new Error(`fixedClock: not a parseable instant: ${iso}`)
  return { now: () => t }
}

/** The real clock, named so a caller chooses it deliberately. */
export function systemClock(): Clock {
  return { now: () => Date.now() }
}

/** Replay memory. Bounded by the same expiry that makes replay meaningful. */
export interface ReplayRegistry {
  seen(messageId: string, expiresAtMs: number): boolean
  size(): number
}

/** Create a replay registry. `seen` returns `true` on the SECOND and later sighting. */
export function createReplayRegistry(): ReplayRegistry {
  const seenAt = new Map<string, number>()
  return {
    seen(messageId, expiresAtMs) {
      if (seenAt.has(messageId)) return true
      seenAt.set(messageId, expiresAtMs)
      return false
    },
    size: () => seenAt.size,
  }
}

/** A per-peer spend counter. The bound per-message validation structurally cannot see. */
export interface ProposalBudget {
  spend(peerId: string, nowMs: number): { readonly allowed: boolean; readonly used: number }
}

/** Create a sliding-window budget. Counted BEFORE the payload is examined. */
export function createProposalBudget(policy: SafetyPolicy): ProposalBudget {
  const hits = new Map<string, number[]>()
  const { max, windowMs } = policy.proposalBudget
  return {
    spend(peerId, nowMs) {
      const kept = (hits.get(peerId) ?? []).filter((t) => nowMs - t < windowMs)
      if (kept.length >= max) {
        hits.set(peerId, kept)
        return { allowed: false, used: kept.length }
      }
      kept.push(nowMs)
      hits.set(peerId, kept)
      return { allowed: true, used: kept.length }
    },
  }
}

/**
 * Canonicalise a value so two key orderings hash alike.
 *
 * Without this, `T07` refuses honest peers whose serializer happened to emit keys
 * in a different order — a control that produces false refusals, which is a defect
 * and not a strictness.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** The content hash, `sha256:`-prefixed so a bare hash is never compared to a prefixed one. */
export function computeContentHash(payload: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex')}`
}

/** Verify a declared hash against the payload. */
export function verifyPayloadHash(declared: unknown, payload: unknown): Reading<true> {
  const d = readNonEmptyString({ declared }, 'declared')
  if (!d.present) return absent(`T07: the declared contentHash is unusable — ${d.reason}`)
  const actual = computeContentHash(payload)
  if (d.value !== actual) {
    return absent(`T07: declared ${d.value} but the canonical payload hashes to ${actual}`)
  }
  return present(true)
}

/**
 * Validate a decision against the CLOSED grammar.
 *
 * `protocol.ts` states the rule this implements: a free string with no declared
 * label set, an array, or a nested object is rejected downstream, so it is
 * rejected here by not being representable. The `labelSet` registry is closed,
 * because an undeclared label set is an undeclared differentiation.
 */
export function isDecisionValue(raw: unknown): Reading<DecisionValue> {
  const asObj = (raw ?? {}) as Record<string, unknown>
  const dec = readField(asObj, 'decision', 'string')
  if (!dec.present) return absent(`not-a-decision: ${dec.reason}`)
  const kind = dec.value as string
  if (kind === 'noul') {
    const v = asObj.value
    if (v !== 0 && v !== 1) return absent(`noul-value: expected 0 | 1, saw ${JSON.stringify(v)}`)
    return present({ decision: 'noul', value: v })
  }
  if (kind === 'choice') {
    const v = readNonEmptyString(asObj, 'value')
    if (!v.present) return absent(`choice-value: ${v.reason}`)
    const ls = readField(asObj, 'labelSet', 'string')
    if (!ls.present) return absent(`choice-labelSet: ${ls.reason}`)
    const allowed = ['threeKind', 'verificationState', 'mountState', 'alignVerdict'] as const
    if (!(allowed as readonly string[]).includes(ls.value as string)) {
      return absent(`choice-labelSet: "${String(ls.value)}" is not a registered label set (${allowed.join(' | ')})`)
    }
    return present({ decision: 'choice', value: v.value, labelSet: ls.value as 'alignVerdict' })
  }
  if (kind === 'score') {
    const v = asObj.value
    if (typeof v !== 'number' || !Number.isFinite(v)) return absent(`score-value: expected a finite number, saw ${JSON.stringify(v)}`)
    const sm = asObj.scaleMax
    if (typeof sm !== 'number' || !Number.isFinite(sm) || sm <= 0) return absent(`score-scaleMax: expected a positive scale, saw ${JSON.stringify(sm)}`)
    if (v < 0 || v > sm) return absent(`score-range: ${v} is outside its declared scale 0..${sm}`)
    return present({ decision: 'score', value: v, scaleMax: sm })
  }
  return absent(`unknown-decision: "${kind}" is not noul | choice | score`)
}

/**
 * The `contentHash` digest shape, `sha256:` + 64 hex. See the envelope T07 branch.
 */
export const SHA256_PREFIXED = /^sha256:[0-9a-f]{64}$/

/**
 * THE LABEL SET THAT CARRIES THE PATCH-AUTHORING ROLE.
 *
 * **`alignVerdict` IS NAMED BECAUSE THE GRAMMAR REGISTERS FOUR SETS AND THE
 * OTHER THREE ARE SEMANTICALLY WRONG, NOT MERELY DIFFERENT** (found by `verifier`
 * as their finding two). The gate previously compared only
 * `decision.value === 'patch-authoring'` and never mentioned the set — so a peer
 * had to **guess**, and since all four registered sets accept the string, a wrong
 * guess was **accepted rather than refused**. A peer doing the right thing by a
 * different-but-nonstandard set would be admitted without the receiver ever
 * stating which set it read.
 *
 * The four registered sets are not interchangeable:
 *   - `threeKind`          — `exists` / `plan` / `future`. A fact about a THING.
 *   - `verificationState`  — `verified-ran` / `verified-read` / `not-measured`. A fact about EVIDENCE.
 *   - `mountState`         — a fact about a PLUGIN's lifecycle.
 *   - `alignVerdict`       — a verdict ON AN ALIGNMENT/market operation. **This one.**
 *
 * So the role is not "a choice whose value is patch-authoring" but "a choice over
 * `alignVerdict` whose value is patch-authoring". Naming the set turns a silent
 * cross-registry substitution into a refusal that says which set was expected.
 */
export const PATCH_AUTHORING_LABEL_SET = 'alignVerdict' as const

/**
 * Whether a decision authorises patch authoring — the T12 predicate, with the SET named.
 *
 * Returns `absent` with a reason that distinguishes the three ways this fails, so a
 * peer can tell "wrong label" from "wrong label set" from "not a choice at all".
 */
export function isPatchAuthoringDecision(decision: DecisionValue | null, role: string): Reading<true> {
  if (decision === null) {
    return absent(`T12: no decision was carried, so the purpose is undeclared; an offer requires choice("${role}") over ${PATCH_AUTHORING_LABEL_SET}`)
  }
  if (decision.decision !== 'choice') {
    return absent(`T12: the decision is a ${decision.decision}, not a choice; an offer requires choice("${role}") over ${PATCH_AUTHORING_LABEL_SET}`)
  }
  if (decision.value !== role) {
    return absent(`T12: the choice carries "${decision.value}" over ${decision.labelSet}; an offer requires "${role}" over ${PATCH_AUTHORING_LABEL_SET}`)
  }
  if (decision.labelSet !== PATCH_AUTHORING_LABEL_SET) {
    return absent(`T12: the choice carries the right value "${role}" but over the WRONG label set "${decision.labelSet}"; the authoring role is carried by "${PATCH_AUTHORING_LABEL_SET}" (the other three registered sets describe thing-kind, evidence-state and mount-state, which are different questions)`);
  }
  return present(true)
}

/**
 * Whether a peer's declared purpose authorises the required work — the T12/T14 rule.
 *
 * The point is that ALIGNING intent and AUTHORING a patch are different grants, so
 * a channel opened for the first cannot be spent on the second.
 */
export function authorizePurpose(granted: readonly string[], required: string): Reading<true> {
  if (granted.length === 0) return absent('T14: the peer declared no purpose, so nothing is granted')
  if (!granted.includes(required)) {
    return absent(`T14: the peer holds [${granted.join(', ')}] but "${required}" is required`)
  }
  return present(true)
}

/** How a privilege test concludes. `abstained` is reachable and is not a refusal. */
export type PrivilegeVerdict = 'admit' | 'refuse' | 'abstain'

/** The result of the union privilege test. */
export interface PrivilegeResult {
  readonly verdict: PrivilegeVerdict
  readonly by: ThreatId | null
  readonly reason: string
  readonly union: ReturnType<typeof unionPrivilege>
  readonly requiresHuman: boolean
}

/**
 * The red-line UNION gate — `T08`, `T09`, `T10`, `T11`.
 *
 * Emits `refuse` (auto-application forbidden), `abstain` (a human must look) or
 * `admit`, and it NEVER returns `admit` for a silent declaration: a peer that said
 * nothing has not said it is safe.
 */
export function privilegeGate(declaration: unknown): PrivilegeResult {
  const union = unionPrivilege(declaration)

  if (redLineReadsCredentialsAndNetwork(union.declaredRedLines)) {
    const alsoDeclared = union.declaredCapabilities.includes('credentials')
    return {
      verdict: 'refuse',
      by: 'T09',
      reason: `T09: a red line reads credentials/secrets AND has network access; ${alsoDeclared ? 'the declaration ALSO names credentials' : 'the declaration names NO credentials token — this row is visible ONLY through the red-line half of the union'}`,
      union,
      requiresHuman: true,
    }
  }

  if (union.declaredCapabilities.includes('credentials') && union.declaredCapabilities.includes('network')) {
    return {
      verdict: 'refuse',
      by: 'T08',
      reason: 'T08: declares credentials together with network access',
      union,
      requiresHuman: true,
    }
  }

  if (union.declaredRedLines.some((r) => /install/i.test(r))) {
    return {
      verdict: 'abstain',
      by: 'T11',
      reason: 'T11: a red line names install-time execution, which runs before any review of runtime behaviour',
      union,
      requiresHuman: true,
    }
  }

  if (union.declaresNothing) {
    return {
      verdict: 'abstain',
      by: 'T10',
      reason: `T10: the peer declared nothing (${union.declaresNothingReason ?? 'unknown-mechanism'}); a silent declaration is not a clean one, so it is held for human review rather than auto-staged`,
      union,
      requiresHuman: true,
    }
  }

  return { verdict: 'admit', by: null, reason: 'admit: no union red line and a non-silent declaration', union, requiresHuman: false }
}

/** One admission decision, with the verdict and the record that justifies it. */
export interface Admission {
  readonly verdict: Verdict
  readonly applied: boolean
  readonly refusedBy: ThreatId | null
  readonly record: VerdictRecord
}

function mkRecord(verdict: Verdict, rule: string, falsifier: string, measured: Maybe<number>, claim: string): VerdictRecord {
  return {
    verdict,
    rule,
    falsifier,
    measured,
    censusAt: null,
    evidence: [{ source: 'plugins-src/dsh-meta-market/src/host/safety/gate.ts', verification: 'verified-read', claim }],
  }
}

/** The dependencies an admission needs, injected so a test drives them. */
export interface GateDeps {
  readonly nowMs: number
  readonly thisInstanceId: string
  readonly policy: SafetyPolicy
  readonly replay: ReplayRegistry
  readonly budget: ProposalBudget
  /** Purposes this peer has been granted by `task-2`'s admission, if any. */
  readonly grantedPurposes?: readonly string[]
}

function refuse(by: ThreatId, rule: string, falsifier: string, reason: string): Admission {
  return { verdict: 'refused', applied: false, refusedBy: by, record: mkRecord('refused', rule, falsifier, { value: null, reason }, reason) }
}

function abstain(by: ThreatId, rule: string, falsifier: string, reason: string): Admission {
  return { verdict: 'abstained', applied: false, refusedBy: by, record: mkRecord('abstained', rule, falsifier, { value: null, reason }, reason) }
}

function pass(rule: string, falsifier: string, claim: string): Admission {
  return {
    verdict: 'pass',
    applied: false,
    refusedBy: null,
    record: mkRecord('pass', rule, falsifier, { value: 0, reason: null }, claim),
  }
}

/**
 * ADMIT AN ENVELOPE.
 *
 * **THE CHECK ORDER IS THE CONTRACT, and it is declared here because a refusal is
 * only attributable if the order is stated.** The order is, deliberately:
 *
 *   1. `T01` version          — a wrong version invalidates the meaning of every later field
 *   2. shape                  — a message with no id cannot be deduplicated
 *   3. `T02` identity         — before any field is acted on, establish WHO
 *   4. `T04` expiry           — a stale message is not made fresh by being well-formed
 *   5. `T06` step budget      — bound the dialogue before spending on it
 *   6. `T05` proposal budget  — the aggregate bound, counted before the payload is examined
 *   7. `T03` replay           — only the first delivery may carry an effect
 *   8. `T01` decision grammar — a decision outside the closed grammar is malformed
 *   9. `T13` offer zones      — deep-check attacker-shaped data before a consumer sees it
 *  10. `T12` confused deputy — an offer on a non-authoring label, or by a non-authoring role
 *  11. `T07` payload hash     — the description must match the payload
 *  12. `T08/T09/T10/T11` union privilege
 *  13. `T17` embedding identity
 *
 * `T01` is FIRST on purpose: an envelope wrong in four ways must report `T01`, and
 * the harness asserts exactly that. A gate whose first branch is a wildcard
 * refuses everything and reports the wildcard — which passes a naive
 * "was it refused?" test.
 */
export function admitEnvelope(envelope: unknown, deps: GateDeps): Admission {
  const ev = (envelope ?? {}) as Record<string, unknown>

  // 1. T01 — version, before anything else can be believed.
  const sv = readField(ev, 'specVersion', 'number')
  if (!sv.present) return refuse('T01', 'specVersion must equal SPEC_VERSION', 'a specVersion of 2 reaches no offer branch', `T01: ${sv.reason}`)
  if (sv.value !== SPEC_VERSION) {
    return refuse('T01', `specVersion must equal SPEC_VERSION (${SPEC_VERSION})`, 'a specVersion of 2 reaches no offer branch', `T01: specVersion is ${String(sv.value)}, this instance speaks ${SPEC_VERSION}`)
  }
  const stv = readField(ev, 'stepVersion', 'number')
  if (!stv.present) return refuse('T01', 'stepVersion must equal STEP_VERSION', 'a stepVersion of 2 reaches no offer branch', `T01: ${stv.reason}`)
  if (stv.value !== STEP_VERSION) {
    return refuse('T01', `stepVersion must equal STEP_VERSION (${STEP_VERSION})`, 'a stepVersion of 2 reaches no offer branch', `T01: stepVersion is ${String(stv.value)}, this instance speaks ${STEP_VERSION}`)
  }

  // 2. shape — the idempotence key, before it can be used as one.
  const mid = readNonEmptyString(ev, 'messageId')
  if (!mid.present) {
    return refuse('T01', 'messageId must be a non-empty string', 'an envelope with no id cannot be deduplicated', `T01: ${mid.reason} — an envelope with no messageId cannot be deduplicated, so it is refused as MALFORMED rather than admitted as fresh`)
  }
  const from = readNonEmptyString(ev, 'from')
  if (!from.present) return refuse('T02', 'from must name an instance', 'a from differing from the card id is refused', `T02: ${from.reason}`)
  const to = readNonEmptyString(ev, 'to')
  if (!to.present) return refuse('T02', 'to must name an instance', 'a from differing from the card id is refused', `T02: ${to.reason}`)

  // 3. T02 — identity, bound to the CARD rather than to the string carried.
  if (from.value === to.value) {
    return refuse('T02', 'from !== to', 'from === to is refused', `T02: from === to (${from.value}); a self-addressed dialogue gives one party two parties' standing`)
  }
  if (to.value !== deps.thisInstanceId) {
    return refuse('T02', 'to must equal this instance id', 'a mis-addressed envelope is refused', `T02: addressed to ${to.value}, this instance is ${deps.thisInstanceId}`)
  }

  // 4. T04 — expiry. An unparseable instant is a REFUSAL, not an unlimited pass.
  const exp = readNonEmptyString(ev, 'expiresAt')
  if (!exp.present) {
    return refuse('T04', 'expiresAt must be present and parseable', 'a past and a non-ISO expiresAt are both refused', `T04: ${exp.reason} — an envelope with no expiry is replayable forever, so ABSENT IS NOT "no limit"`)
  }
  const expMs = Date.parse(exp.value)
  if (Number.isNaN(expMs)) {
    return refuse('T04', 'expiresAt must be an ISO instant', 'a past and a non-ISO expiresAt are both refused', `T04: expiresAt "${exp.value}" is not a parseable instant; a malformed expiry is not an unlimited one`)
  }
  if (expMs <= deps.nowMs) {
    return refuse('T04', 'expiresAt must be in the future at the injected clock', 'a past expiresAt is refused', `T04: expired at ${exp.value}, the clock reads ${new Date(deps.nowMs).toISOString()}`)
  }

  // 5. T06 — the step budget, and the ceiling that stops a sender raising it.
  const step = readField(ev, 'step', 'number')
  if (!step.present) return refuse('T06', 'step must be present', 'step >= maxSteps is refused', `T06: ${step.reason}`)
  const maxSteps = readField(ev, 'maxSteps', 'number')
  if (!maxSteps.present) return refuse('T06', 'maxSteps must be present', 'maxSteps above the ceiling is refused', `T06: ${maxSteps.reason}`)
  const maxStepsN = maxSteps.value as number
  const stepN = step.value as number
  if (maxStepsN > deps.policy.maxStepsCeiling) {
    return refuse('T06', 'maxSteps must not exceed the receiver ceiling', 'maxSteps above the ceiling is refused', `T06: maxSteps ${maxStepsN} exceeds this instance's ceiling ${deps.policy.maxStepsCeiling}; a budget the sender can raise is not a budget`)
  }
  if (stepN >= maxStepsN) {
    return refuse('T06', 'step must be below maxSteps', 'step >= maxSteps is refused', `T06: step ${stepN} has reached maxSteps ${maxStepsN}`)
  }

  // 6. T05 — the aggregate bound. Counted BEFORE the payload is examined.
  const spend = deps.budget.spend(from.value, deps.nowMs)
  if (!spend.allowed) {
    return refuse('T05', `at most ${deps.policy.proposalBudget.max} envelopes per ${deps.policy.proposalBudget.windowMs}ms per peer`, 'exactly max admitted of max+3', `T05: ${from.value} has already spent ${spend.used} of ${deps.policy.proposalBudget.max} allowances in this window`)
  }

  // 7. T03 — replay. Only the FIRST delivery may carry an effect.
  if (deps.replay.seen(mid.value, expMs)) {
    return refuse('T03', 'messageId must not have been seen inside its own expiry window', 'the same messageId is refused on the second delivery', `T03: messageId ${mid.value} has already been delivered; the first delivery carried the effect`)
  }

  // 8. the decision grammar, when a decision is present.
  const decisionRaw = ev.decision
  let decision: DecisionValue | null = null
  if (decisionRaw !== null && decisionRaw !== undefined) {
    const dv = isDecisionValue(decisionRaw)
    if (!dv.present) return refuse('T01', 'a decision must be a closed decision value', 'a free string decision is refused', `T01: ${dv.reason}`)
    decision = dv.value
  }

  const offerRaw = (ev.offer ?? null) as unknown
  const granted = deps.grantedPurposes ?? []

  // 9. T13 — deep-check `zones` before any consumer sees the array.
  if (offerRaw !== null) {
    const o = offerRaw as Record<string, unknown>
    const zones = readStringArray(o, 'zones')
    if (!zones.present) {
      return refuse('T13', 'every entry of offer.zones must be a string', 'zones containing an object is refused and names the index', `T13: ${zones.reason}`)
    }
  }

  // 10. T12 — the confused deputy, at the envelope level.
  if (offerRaw !== null) {
    // The DELIBERATE refusal for an absent decision, kept as T12 rather than folded
    // into the predicate: an offer with NO decision is the clearest form of the
    // confused-deputy attack (an alignment channel carrying work), and it should be
    // attributed to the attack rather than to a malformed field.
    if (decision === null) {
      return refuse('T12', 'an offer requires the patch-authoring decision label', 'an alignment envelope carrying an offer is refused', 'T12: an offer arrived with NO decision at all, so its purpose is undeclared; an alignment channel must not carry an offer')
    }
    const authoring = isPatchAuthoringDecision(decision, deps.policy.patchAuthoringRole)
    if (!authoring.present) {
      return refuse('T12', `an offer requires decision === choice("${deps.policy.patchAuthoringRole}") over ${PATCH_AUTHORING_LABEL_SET}`, 'a non-authoring label carrying an offer is refused, and so is the right label over the wrong set', authoring.reason)
    }
    const auth = authorizePurpose(granted, deps.policy.patchAuthoringRole)
    if (!auth.present) {
      return refuse('T14', 'the peer must hold the patch-authoring grant to carry an offer', 'an alignment-only peer carrying an offer is refused', auth.reason)
    }
  }

  // 11. T07 — the MAGNITUDE. What an envelope CAN check about a hash is that it is
  // a hash this instance could have produced; what it CANNOT check is the payload,
  // because by T12's design an envelope carries no payload to compare against.
  //
  // **THIS SURFACE WAS ADMITTING A MALFORMED HASH, AND IT WAS A REAL GAP RATHER
  // THAN ONLY A LABELLING ONE** (found by `verifier` as A18b, fixed here). The block
  // used to read `offer.contentHash` for PRESENCE only, so `contentHash: 'x'` was
  // admitted. Such a proposal could never be APPLIED, because `admitPatch` compares
  // the declared hash against the actual one — **but "cannot be applied later" is a
  // weaker guarantee than "is malformed now", and an envelope is the first surface
  // a reader inspects for T07.** The magnitude check makes this surface refuse the
  // class it can actually see, instead of deferring the whole of T07 to a function
  // the reader has not reached yet.
  if (offerRaw !== null) {
    const o = offerRaw as Record<string, unknown>
    const declared = readNonEmptyString(o, 'contentHash')
    if (!declared.present) {
      return refuse('T07', 'offer.contentHash must be present', 'a tampered payload is refused', `T07: ${declared.reason}`)
    }
    if (!SHA256_PREFIXED.test(declared.value)) {
      return refuse(
        'T07',
        'offer.contentHash must be a sha256:<64 hex> digest',
        'a malformed contentHash is refused at the envelope, not only at admitPatch',
        `T07: contentHash "${declared.value}" is not a sha256:<64 hex> digest. THIS SURFACE CHECKS THE MAGNITUDE OF THE HASH, NOT ITS PAYLOAD — an envelope carries no payload to compare against (by T12's design), so a well-formed hash is admitted here and the HASH-TO-PAYLOAD comparison happens ONLY in admitPatch. Read this branch for magnitude and admitPatch for content.`,
      )
    }
  }

  // 12. T08/T09/T10/T11 — the union privilege gate.
  if (offerRaw !== null) {
    const o = offerRaw as Record<string, unknown>
    const priv = privilegeGate(o.declaration)
    if (priv.verdict === 'refuse') {
      return refuse(priv.by ?? 'T09', `union privilege gate: ${priv.by ?? 'T09'}`, 'a creds+network declaration is refused', priv.reason)
    }
    if (priv.verdict === 'abstain') {
      return abstain(priv.by ?? 'T10', `union privilege gate: ${priv.by ?? 'T10'}`, 'a silent or install-time declaration is held for a human', priv.reason)
    }
  }

  // 13. T17 — the embedding identity travels with the vector.
  const intentRaw = (ev.intent ?? null) as unknown
  if (intentRaw !== null) {
    const i = intentRaw as Record<string, unknown>
    const identity = (i.identity ?? null) as unknown
    if (identity === null) {
      return refuse('T17', 'a vector reference must carry its embedding identity', 'an unread identity is refused rather than compared', 'T17: the intent reference carries no embedding identity, so a score against it would be a number whose meaning is undefined')
    }
  }

  return pass('admitEnvelope: all 13 ordered checks passed', 'any of the 13 checks refuses an input it should admit', 'T01-T17 ordering passed; verdict pass, applied false')
}

/**
 * ADMIT A PATCH — a SEPARATE ENTRY POINT, and the separation is the control.
 *
 * `DialogueEnvelope` does not carry a `PatchProposal` at all, so **an alignment
 * envelope has no code path that could reach this function** — the confused-deputy
 * defence is a property of the CALL GRAPH rather than a rule someone must
 * remember. This function re-checks provenance and role ITSELF and does not trust
 * the admission that preceded it.
 *
 * It returns `applied: false` for every verdict. There is no promotion path here:
 * a promotion is a human act and belongs to `task-5`.
 */
export function admitPatch(proposal: unknown, payload: unknown, deps: GateDeps, extraRedLines: readonly string[] = []): Admission {
  const p = (proposal ?? {}) as Record<string, unknown>

  const id = readNonEmptyString(p, 'proposalId')
  if (!id.present) return refuse('T19', 'proposalId must be present', 'any applied === true fails the row', `T19: ${id.reason}`)

  // T14 — re-checked HERE rather than inherited from the envelope admission.
  const from = readNonEmptyString(p, 'from')
  if (!from.present) {
    return refuse('T14', 'a patch must name its proposer', 'an unattributed patch is refused', `T14: ${from.reason} — provenance is required; an unattributed patch is not admissible`)
  }
  const auth = authorizePurpose(deps.grantedPurposes ?? [], deps.policy.patchAuthoringRole)
  if (!auth.present) return refuse('T14', 'the proposer must hold the patch-authoring grant', 'an alignment-only proposer is refused', auth.reason)

  // T19 — the undo path, checked for EMPTINESS and not merely for presence. A
  // `reverses: ''` is present and tells you nothing about how to undo anything,
  // so a presence-only check certifies an irreversible patch as reversible.
  const reverses = readNonEmptyString(p, 'reverses')
  if (!reverses.present) return refuse('T19', 'reverses must be a NON-EMPTY string', 'a patch with no undo path is refused', `T19: ${reverses.reason}`)
  const baseHash = readNonEmptyString(p, 'baseHash')
  if (!baseHash.present) return refuse('T19', 'baseHash must be a non-empty string', 'a patch with no base is refused', `T19: ${baseHash.reason}`)
  const target = readNonEmptyString(p, 'targetPackageId')
  if (!target.present) return refuse('T19', 'targetPackageId must be a non-empty string', 'a patch with no target is refused', `T19: ${target.reason}`)

  // T07 — the hash must match the payload.
  const declared = readNonEmptyString(p, 'contentHash')
  if (!declared.present) return refuse('T07', 'contentHash must be present', 'a tampered payload is refused', `T07: ${declared.reason}`)
  if (payload !== undefined && payload !== null) {
    const ok = verifyPayloadHash(declared.value, payload)
    if (!ok.present) return refuse('T07', 'contentHash must equal sha256 over the canonical payload', 'a tampered payload is refused', ok.reason)
  }

  // T13 — the zones, deep-checked.
  const zones = readStringArray(p, 'zones')
  if (!zones.present) return refuse('T13', 'every entry of zones must be a string', 'zones containing an object is refused and names the index', `T13: ${zones.reason}`)

  // T09/T08 — the union privilege gate, including the caller's extra red lines.
  const privUnion = unionPrivilege(p.declaration)
  const redLinesPlus = [...privUnion.declaredRedLines, ...extraRedLines]
  if (redLineReadsCredentialsAndNetwork(redLinesPlus)) {
    return refuse('T09', 'no patch may carry a reads-credentials-AND-network red line', 'the red-line-only patch is refused', 'T09: the union of the declaration and the caller-supplied red lines reads credentials/secrets AND has network access')
  }
  const priv = privilegeGate(p.declaration)
  if (priv.verdict === 'refuse') return refuse(priv.by ?? 'T08', `union privilege gate: ${priv.by ?? 'T08'}`, 'a creds+network declaration is refused', priv.reason)
  if (priv.verdict === 'abstain') return abstain(priv.by ?? 'T10', `union privilege gate: ${priv.by ?? 'T10'}`, 'a silent declaration is not auto-staged', priv.reason)

  return pass('admitPatch: provenance, undo path, hash, zones and the union privilege gate all held', 'any applied === true fails the row', 'admitted for STAGING; applied === false; requiresHuman is the proposal own field')
}

/**
 * Compare two embedding identities — `T17`.
 *
 * Both fields are required because either alone is insufficient: two models can
 * share a width, and one model can be served at two widths. **A missing identity is
 * a REFUSAL, not a match** — an unread model is not a matching model.
 */
export function compareIntentIdentity(local: EmbeddingIdentity, peer: EmbeddingIdentity): Reading<true> {
  if (local.model === null || peer.model === null) {
    return absent(`T17: model identity is unread (local=${local.model ?? 'null'}, peer=${peer.model ?? 'null'}); an unread identity is refused rather than compared`)
  }
  if (local.model !== peer.model) {
    return absent(`T17: model mismatch — local "${local.model}" vs peer "${peer.model}"; a vector built by one model cannot be searched by another`)
  }
  if (local.dim === null || peer.dim === null) {
    return absent(`T17: embedding dimension is unread (local=${local.dim ?? 'null'}, peer=${peer.dim ?? 'null'})`)
  }
  if (local.dim !== peer.dim) {
    return absent(`T17: dimension mismatch — local ${local.dim} vs peer ${peer.dim}; the same model name is not enough`)
  }
  return present(true)
}

/** The result of a peer's attempt to influence the LOCAL intent. */
export interface IntentApplication {
  readonly mutatedLocalIntent: false
  readonly novelZones: readonly string[]
  readonly identity: Reading<true>
  readonly proposal: PatchProposal
}

/**
 * APPLY A PEER'S INTENT OFFER — which is to say, refuse to, structurally.
 *
 * **THE MECHANISM, and it is the answer to `T15`/`T16`: this function HAS NO WRITE
 * PATH TO EXPRESS.** It takes the peer zones as untrusted input, holds no
 * reference to the local intent field, calls no writer, and its only output is a
 * `PatchProposal` for a human. `mutatedLocalIntent` is typed the literal `false`
 * rather than `boolean`, so a caller cannot even REPRESENT the alternative without
 * editing this type — which is the difference between a mechanism and a promise.
 *
 * `requiresHuman` is set to `true` HERE and is NOT read from the peer: a peer that
 * could lower it would be able to make its own patch automatic. The type system
 * cannot catch that confusion, so it is caught by construction.
 */
export function applyPeerIntent(
  peerZones: readonly string[],
  local: { readonly zoneIds: readonly string[]; readonly identity: EmbeddingIdentity },
  peerIdentity: EmbeddingIdentity,
  deps: GateDeps,
): IntentApplication {
  const identity = compareIntentIdentity(local.identity, peerIdentity)
  const novel = peerZones.filter((z) => !local.zoneIds.includes(z))
  const payload = { zones: novel, at: deps.nowMs }
  const proposal: PatchProposal = {
    proposalId: `align-${createHash('sha256').update(canonicalize({ novel, from: deps.thisInstanceId }), 'utf8').digest('hex').slice(0, 16)}`,
    from: deps.thisInstanceId,
    targetPackageId: 'dsh-intent-map',
    baseHash: `sha256:${createHash('sha256').update(canonicalize(local.zoneIds), 'utf8').digest('hex')}`,
    contentHash: computeContentHash(payload),
    zones: novel,
    reverses: 'drop the proposal; the local intent index was never written',
    requiresHuman: true,
    staging: 'received',
  }
  return { mutatedLocalIntent: false, novelZones: novel, identity, proposal }
}

/** The surface this module exposes. Deliberately small, and deliberately read-mostly. */
export interface SafetyGate {
  admitEnvelope(envelope: unknown): Admission
  admitPatch(proposal: unknown, payload: unknown, extraRedLines?: readonly string[]): Admission
  applyPeerIntent(peerZones: readonly string[], local: { readonly zoneIds: readonly string[]; readonly identity: EmbeddingIdentity }): IntentApplication
  census(): ReturnType<typeof threatCensus>
}

/**
 * Create the gate.
 *
 * The replay registry and the budget live HERE, so they are per-INSTANCE state
 * rather than per-call — a bound that resets on every call is not a bound.
 */
export function createSafetyGate(options: {
  readonly thisInstanceId: string
  readonly policy?: SafetyPolicy
  readonly clock?: Clock
  readonly grantedPurposes?: readonly string[]
}): SafetyGate {
  const policy = options.policy ?? DEFAULT_POLICY
  const clock = options.clock ?? systemClock()
  const replay = createReplayRegistry()
  const budget = createProposalBudget(policy)
  const deps = (): GateDeps => {
    const base: GateDeps = { nowMs: clock.now(), thisInstanceId: options.thisInstanceId, policy, replay, budget }
    return options.grantedPurposes === undefined ? base : { ...base, grantedPurposes: options.grantedPurposes }
  }
  return {
    admitEnvelope: (envelope) => admitEnvelope(envelope, deps()),
    admitPatch: (proposal, payload, extraRedLines) => admitPatch(proposal, payload, deps(), extraRedLines ?? []),
    applyPeerIntent: (peerZones, local) => applyPeerIntent(peerZones, local, local.identity, deps()),
    census: threatCensus,
  }
}
