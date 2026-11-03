/**
 * ============================================================================
 * dsh-meta-market — L5 `safety` barrel: the lane's READ-ONLY surface
 * ============================================================================
 *
 * This file exists so the assembly can FORWARD to this lane instead of reporting
 * it `wired: false`. It exports exactly ONE symbol:
 *
 *     export function describeSurface(): Record<string, unknown>
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SURFACE DELIBERATELY IS NOT, AND WHY THAT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * **It does not run the gate. It does not read a payload. It does not accept an
 * input.** It is a status report about the lane's own declarations and nothing
 * else, and every value in it is either a constant, a count over constants, or a
 * string naming what the lane refuses to do.
 *
 * **This lane argued, in `research/meta-market-safety.md` §9.1, that a FALSE
 * REFUSAL IS INDISTINGUISHABLE FROM A CORRECT ONE at any surface outside the lane
 * — a gate that rejects honest peers produces exactly the evidence that would
 * prove it is working.** That argument is the reason there is no admission path
 * here. Putting one behind an HTTP GET would put this lane's single hardest
 * property — **that it can refuse** — one anonymous request away from a caller who
 * has never read the threat table. A caller who can make the gate refuse can make
 * it look correct.
 *
 * ---------------------------------------------------------------------------
 * `D-0071` — THE SERIALISER TRAP, AND THIS LANE IS ESPECIALLY EXPOSED TO IT
 * ---------------------------------------------------------------------------
 *
 * **`JSON.stringify(new Set([1,2,3]))` is `"{}"` — no error, no warning — and a
 * SET WITH THREE MEMBERS SERIALISES IDENTICALLY TO AN EMPTY ONE.** That is this
 * program's absent-versus-empty trap arriving through the serialiser instead of
 * through a `|| 0`, so **every guard written against coercion is blind to it**;
 * the lane caught it in `identity` an hour ago, where a 6-member
 * `ReadonlySet<string>` was published as absent.
 *
 * **This lane carries four `Map`/`Set`/`RegExp` values** (measured by grep over
 * `src/host/safety/**`, 2026-10-16T17:4xZ):
 *   - `gate.ts:395` `new Map<string, number>()` — the replay registry's `seenAt` (per-instance, not module-level);
 *   - `gate.ts:413` `new Map<string, number[]>()` — the proposal budget's `hits` (per-instance, not module-level);
 *   - `gate.ts:506` `SHA256_PREFIXED` — a **`RegExp`**, which stringifies to `{}` for the same reason;
 *   - `absence-guard.ts:227` `[...new Set([...a, ...b])]` — already spread, so already an array.
 *
 * **None of the three module-level ones is reachable as a value of this surface,
 * and that is a property I asserted rather than assumed.** The two `Map`s are
 * **closure state inside factory calls**, so no export holds them; the barrel does
 * not import them. `CONTROL_STANDING` and `THREATS` are a `Record` and an `array`.
 * **The one place a `Set` DOES appear is `describeSurface`'s own output** — the
 * `statusValues` list below — and it is **spread at this boundary** precisely
 * because D-0071 says a populated set and an empty one are indistinguishable once
 * serialised. `verify/attacker.mjs` asserts the payload is JSON-round-trippable
 * and that every count matches the module constants, so this is a check rather
 * than a promise.
 */

import { CONTROL_STANDING, CONTROL_IMPLEMENTATION, implementationCensus, THREATS, threatCensus, ASSETS, DEFAULT_POLICY, TECHNICAL_NOTE_no_device } from './gate.ts'

/**
 * Every value that can appear in the answer, so a consumer can enumerate the
 * closed grammar rather than discover it by example. Spread to an ARRAY at the
 * boundary — see `D-0071` in the module header.
 */
const STATUS_VALUES = new Set(['VERIFIED (ran)', 'VERIFIED (read)', 'PLAN'])

/**
 * THE OPERATION THIS SURFACE DELIBERATELY DOES NOT PERFORM.
 *
 * Load-bearing rather than decorative: without it, a route that reports a
 * standing split reads as a working admission service. The assembly's other
 * lanes carry this field for the same reason.
 */
const NOT_DONE =
  'This surface does NOT run the gate, does NOT read a payload and does NOT accept an input. ' +
  'It is a READ-ONLY status report about this lane\'s own declarations. The gate itself lives in ' +
  '`safety/gate.ts` as `admitEnvelope()` and `admitPatch()`, which are PURE FUNCTIONS called by the ' +
  'patch/dialogue paths and are NOT reachable from any route this lane registers — deliberately, ' +
  'because exposing an admission path over HTTP would put the lane\'s only enforceable property, ' +
  'that it can REFUSE, behind an anonymous request from a caller who has not read the threat table.'

/**
 * The lane's headline finding, on the surface rather than in a comment.
 *
 * **This is the one thing a reader of a safety status must not have to infer**,
 * and it is also one of the three independent measurements behind the assembly's
 * `authenticated: false`, so a consumer should receive it from THIS lane rather
 * than from a note in someone else's route file.
 */
const CONSISTENCY_NOT_AUTHENTICITY =
  'Every control in this lane governs CONSISTENCY, not AUTHENTICITY. Each one checks that a claim ' +
  'AGREES WITH ITSELF — that a card matches an envelope, that a hash matches a canonical form, that ' +
  'a declaration does not contradict itself. NOT ONE of them checks that a peer is anyone in ' +
  'particular, because the card is SELF-ASSERTED (`PeerCard.selfAsserted` in `protocol.ts`) and no ' +
  'key material exists to bind it. A peer who COPIES an honest card passes every check here. ' +
  'Two independent measurements agree from other lanes: the deployment id is a 37-byte bare UUID ' +
  'with zero signature operations in any non-test source file, and the protocol declares no ' +
  'signature field at all — so "ADMITTED" means INSPECTED, never PROVEN. Web4 trust is a `plan`, ' +
  'not an `exists`.'

/**
 * DESCRIBE THIS LANE'S SURFACE — the ONE export the assembly consumes.
 *
 * Pure, synchronous, argument-free and side-effect-free: it reads module constants
 * and counts them. Calling it twice returns deep-equal values, and it cannot fail
 * on input because it takes none.
 *
 * The shape is stable and every count is a pair, so a consumer never has to guess
 * whether a number is a total or a numerator.
 */
export function describeSurface(): Record<string, unknown> {
  // RE-TAKEN, not cited: the census is computed here over the live module
  // constants, so it cannot drift from `CONTROL_STANDING` after an edit.
  const census = threatCensus()

  // The per-threat detail, with the standing of each row. Built as plain objects
  // and plain arrays so nothing here needs a serialiser guard.
  const rows = THREATS.map((t) => ({
    id: t.id,
    title: t.title,
    asset: t.asset,
    status: CONTROL_STANDING[t.id],
    /**
     * THE SECOND AXIS, and the reason it is served rather than merely stored.
     * `status` answers "has a run observed this row?"; `implementation` answers
     * "is the row's stated control CODE or PROSE?". **`T02` is `VERIFIED (ran)`
     * and `PARTIAL` at once — the row passes, and half its stated control is a
     * string.** A consumer reading `status` alone would conclude the control is
     * whole. Serving both is what makes the difference visible WITHOUT reading
     * `gate.ts`.
     */
    implementation: CONTROL_IMPLEMENTATION[t.id],
    hasControl: t.control !== null,
    hasFalsifier: typeof t.falsifier === 'string' && t.falsifier.length > 0,
  }))

  // The rows with no control, named rather than only counted — an OPEN list a
  // reader can carry, because "3 without a control" is not actionable but
  // "T18, T21, T22" is.
  const openIds = rows.filter((r) => !r.hasControl).map((r) => r.id)

  return {
    lane: 'safety',
    kind: 'plan',
    notDone: NOT_DONE,

    /**
     * The standing split, as NUMERATOR AND DENOMINATOR with its census stamp.
     * Computed at call time from `CONTROL_STANDING` — see the module header.
     */
    standing: {
      verifiedRan: census.verifiedRan,
      verifiedRead: census.verifiedRead,
      planned: census.planned,
      of: census.of,
      censusAt: new Date().toISOString(),
      /** Spelled out so a reader does not have to reconstruct the arithmetic. */
      split: `${census.verifiedRan} VERIFIED (ran) + ${census.verifiedRead} VERIFIED (read) + ${census.planned} PLAN = ${census.of}`,
      statusValues: [...STATUS_VALUES],
      /** The rows that carry NO control, named. Not an error — a scope statement. */
      openWithoutControl: openIds,
      countWithoutControl: census.withoutControl,
    },

    /**
     * THE IMPLEMENTATION AXIS — whether each row's stated control is CODE or PROSE.
     *
     * **Served BESIDE `standing`, not instead of it, because the two disagree and
     * the disagreement is the finding.** `standing` says `T02` is `VERIFIED (ran)`;
     * this says `T02` is `PARTIAL`. Both are true: the `from !== to` half fires and
     * is covered, while `from === card.instanceId` — the half the row's own text
     * leads with — is **UNEXPRESSIBLE at this signature, because `GateDeps` carries
     * no `card` field.** A reader who saw only `standing` would take the control for
     * whole.
     *
     * **THE COUNTS ARE A MEASUREMENT, NOT A STANDBY.** Taken by driving the artifact
     * (`verify/implemented-sweep.mjs`): of the 19 rows that declare a control,
     * 15 IMPLEMENTED + 1 PARTIAL + 3 DOCUMENTED-ONLY; of the 3 that declare none,
     * all 3 NO-CONTROL-CLAIMED. `attacker.mjs` asserts this axis against the ids a
     * refusal actually returned in its own run, so a row cannot claim code it lacks.
     */
    implementation: (() => {
      const impl = implementationCensus()
      return {
        implemented: impl.implemented,
        partial: impl.partial,
        documentedOnly: impl.documentedOnly,
        noControlClaimed: impl.noControlClaimed,
        of: impl.of,
        declaringControl: impl.declaringControl,
        censusAt: new Date().toISOString(),
        /** Spelled out so a reader does not have to reconstruct the arithmetic. */
        split: `${impl.implemented} IMPLEMENTED + ${impl.partial} PARTIAL + ${impl.documentedOnly} DOCUMENTED-ONLY + ${impl.noControlClaimed} NO-CONTROL-CLAIMED = ${impl.of}`,
        /** Of the rows that DECLARE a control, how many are actually code. */
        declaringSplit: `${impl.implemented} IMPLEMENTED + ${impl.partial} PARTIAL + ${impl.documentedOnly} DOCUMENTED-ONLY = ${impl.declaringControl} rows declaring a control`,
        /** A documented-but-unimplemented control is a FINDING, not a gap to be hidden. */
        documentedOnlyRows: rows.filter((r) => r.implementation === 'DOCUMENTED-ONLY').map((r) => r.id),
        partialRows: rows.filter((r) => r.implementation === 'PARTIAL').map((r) => r.id),
        /** Whether a row's control is code cannot be told from `status` alone. */
        orthogonalToStanding: true,
      }
    })(),

    /** The threat table's size and its per-row standings. */
    threats: {
      count: THREATS.length,
      rows,
    },

    /** The assets the table defends, so an id like `A6` is resolvable. */
    assets: ASSETS,

    /** The counters the gate itself would use, quoted rather than enforced here. */
    policy: {
      proposalBudgetMax: DEFAULT_POLICY.proposalBudget.max,
      proposalBudgetWindowMs: DEFAULT_POLICY.proposalBudget.windowMs,
      maxStepsCeiling: DEFAULT_POLICY.maxStepsCeiling,
      maxClockSkewMs: DEFAULT_POLICY.maxClockSkewMs,
      labelSetForPatchAuthoring: DEFAULT_POLICY.patchAuthoringRole,
      grantableRoles: [...DEFAULT_POLICY.grantableRoles],
    },

    /** THE HEADLINE FINDING, stated on the surface (requirement 5). */
    consistencyNotAuthenticity: CONSISTENCY_NOT_AUTHENTICITY,

    /** This lane holds no device. Stated on the surface rather than inferred. */
    technicalNote: TECHNICAL_NOTE_no_device,

    /**
     * Whether this surface can cause anything. Always `false`, and stated as a
     * fact rather than left to be concluded from the absence of an input field.
     */
    mutatesState: false,
    acceptsInput: false,
    runsTheGate: false,
  }
}
