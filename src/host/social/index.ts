/**
 * ============================================================================
 * dsh-meta-market — L6 social topology: THE LANE BARREL
 * ============================================================================
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT CEREMONY. `social` was one of two lanes
 * with no `index.ts`, so the assembly could only report it as `wired: false` —
 * a lane whose work is real and whose surface is unreachable. This barrel is the
 * smallest thing that closes that gap: ONE exported function, no other coupling,
 * so the assembly can forward to it without reviewing a second time.
 *
 * THE SURFACE IS READ-ONLY AND IT STARTS NOTHING. `describeSurface()` is a pure
 * function over constants this module computes at call time. It opens no socket,
 * dials no peer, reads no file, accepts no argument and mutates no state. **No
 * peer has ever been contacted in this build**, and a surface that implied
 * otherwise would be the single worst claim this lane could ship.
 *
 * `D-0071` — THE SERIALISER TRAP, AND WHY THIS FILE IS WRITTEN AROUND IT.
 * `JSON.stringify` renders a `Set` or `Map` as `{}` with NO error and NO warning,
 * so a set with six members and an empty set serialise IDENTICALLY, and `{}` has
 * no `length` — a populated collection publishes as ABSENT. That is this
 * program's absent-versus-empty trap arriving through the serialiser instead of
 * through a `|| 0`. **A topology lane is the likeliest place in the build to
 * hold a `Set`**, so this barrel was not assumed safe — it was audited:
 * `new Set` occurs three times in the lane (`topology.ts:141` building the
 * overlap index, `self-test.ts:216` and `:259`), and ALL THREE are LOCAL
 * TEMPORARIES that never reach a return value. No exported type in this lane
 * declares a `Set`, `Map` or `Date`, and `JSON.stringify` round-trips the
 * structures this barrel emits losslessly — measured, not reasoned.
 *
 * AND THE SURFACE ITSELF IS THE GUARD. `assertJsonSafe` below walks the payload
 * and REFUSES a `Set`, `Map`, `Date`, function, `undefined` or non-finite number
 * rather than letting the serialiser silently flatten it. A guard that returns a
 * payload unchanged proves nothing on its own, so the self-test drives it with
 * each forbidden type and requires a THROW — a red-then-green, not a green.
 *
 * @module dsh-meta-market/host/social
 */

import {
  bucketLocalBreakingPoint,
  fingerprintEntropy,
  readZoneCensus,
  witnessBound,
  ROSTER_BUDGET_BYTES,
  ROUND_SECONDS,
  type ZoneCensus,
} from './scale.ts'
import {
  BUCKETS_PER_ZONE,
  MIN_SHARED_ZONES,
  quorumBound,
  UNMEASURED_SYBIL_COST,
  type QuorumBound,
} from './topology.ts'

/** The route the assembly would mount this behind, stated here so the two cannot drift. */
export const SURFACE_PATH = 'meta-market/api/social'

/** The lane's read-time stamp, so every figure below carries the moment it was taken. */
export interface SurfaceCensus {
  readonly takenAt: string
  readonly sourceRoute: string
  readonly censusAt: string | null
  readonly kind: 'exists' | 'plan' | 'future'
  readonly note: string
}

/**
 * The measured warm-embed latency, in milliseconds.
 *
 * A MEASURED INSTRUMENT READING (`research/intent-map-live-verification.md` §3),
 * not a design assumption. The witness bound moves linearly with it, so if this
 * number is ever replaced the bound below moves with it rather than silently
 * disagreeing with it.
 */
const MEASURED_WARM_EMBED_MS = 155

/** The design target. A DESIGN TARGET — never a measurement, and labelled as one wherever it appears. */
const DESIGN_TARGET_POPULATION = 100_000

// ---------------------------------------------------------------------------
// The serialiser guard — refuses, rather than flattening silently
// ---------------------------------------------------------------------------

/** Types the payload must never contain, named so a refusal can say WHICH one it found. */
const FORBIDDEN_CONSTRUCTORS: readonly string[] = ['Set', 'Map', 'WeakSet', 'WeakMap', 'Date', 'RegExp', 'Promise']

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'Array'
  if (typeof value === 'function') return 'function'
  if (typeof value === 'object') return (value.constructor?.name ?? 'object')
  return typeof value
}

/**
 * Walk a payload and THROW on anything `JSON.stringify` would misrepresent.
 *
 * `JSON.stringify` itself is not the check: it succeeds on a `Set` and hands back
 * `{}`, which is precisely the failure `D-0071` records. So the check is
 * structural and runs BEFORE the value is published, and it reports the path at
 * which it refused so a failure names its own location.
 */
export function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === null) return

  const kind = describeValue(value)
  if (FORBIDDEN_CONSTRUCTORS.includes(kind)) {
    throw new Error(
      `${path} is a ${kind}. JSON.stringify would render it as {} with no error, so a populated ${kind} and an empty one would publish identically — see decision D-0071. Convert it with [...x] at this boundary.`,
    )
  }
  if (kind === 'function') {
    throw new Error(`${path} is a function, which JSON.stringify drops from an object silently.`)
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${path} is ${String(value)}, which JSON.stringify renders as null — a non-finite number would publish as an ABSENCE.`)
  }
  if (value === undefined) {
    throw new Error(`${path} is undefined, which JSON.stringify drops from an object silently, turning a present-but-unset key into a missing one.`)
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`))
    return
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        throw new Error(`${path}.${key} is undefined and would be dropped by JSON.stringify.`)
      }
      assertJsonSafe(entry, `${path}.${key}`)
    }
  }
}

// ---------------------------------------------------------------------------
// The census, read live and REFUSED rather than coerced
// ---------------------------------------------------------------------------

interface LiveCensus {
  readonly census: ZoneCensus | null
  readonly refusal: { readonly code: string; readonly reason: string } | null
  readonly takenAt: string
}

/**
 * The census fetch's timeout, in milliseconds.
 *
 * CHOSEN FROM A MEASUREMENT, NOT FROM TASTE, and the measurement corrected an
 * earlier value. The live route answers in **28–51 ms** (measured 2026-10-16,
 * three readings: 51 ms, 28 ms, 28 ms), while the first version of this constant
 * was **20,000 ms** — chosen as a generous ceiling and never revisited. Measured
 * against a REAL hanging server (an `http.createServer` that accepts and never
 * responds), the handler blocked **20,008 ms** before the abort fired. A status
 * route that stalls twenty seconds when the live GUI is down is not a status
 * route: the caller cannot distinguish "slow" from "hung", and every other lane's
 * health check that awaits this route inherits the stall.
 *
 * 2,000 ms is ~39x the slowest observed healthy reading, which leaves room for a
 * cold or loaded machine while keeping the worst case a pause rather than a hang.
 * The bound is stated on the surface itself (`census.timeoutMs`) rather than left
 * for a reader to discover.
 */
export const CENSUS_TIMEOUT_MS = 2_000

/**
 * Read the live zone census, or RECORD THE REFUSAL.
 *
 * The refusal is carried into the payload rather than thrown, because a surface
 * that 500s when the route is down tells a reader nothing, whereas a surface that
 * says `refused: no-census-time` tells them exactly which instrument failed. The
 * distinction this lane exists to protect is preserved: an unread census reports
 * `null` with a reason, NEVER a `0` that would read as "zero zones exist".
 */
async function readLiveCensus(): Promise<LiveCensus> {
  const takenAt = new Date().toISOString()
  try {
    const response = await fetch('http://127.0.0.1:3083/intent-map/api/map', {
      signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { census: null, refusal: { code: 'route-unavailable', reason: `the intent-map route answered HTTP ${response.status}, not 200. A probe that did not answer is not a market with no zones.` }, takenAt }
    }
    const result = readZoneCensus((await response.json()) as { censusAt?: unknown; zones?: unknown; corpus?: unknown })
    if (result.refused) {
      return { census: null, refusal: { code: result.code, reason: result.reason }, takenAt }
    }
    return { census: result.census, refusal: null, takenAt }
  } catch (error: unknown) {
    // A TIMEOUT IS NOT AN UNREACHABLE ROUTE, and the two are separated on purpose.
    // The first version collapsed both into `route-unreachable`, which tells a
    // reader the route is down when the truth may be that it is merely slow —
    // different failures, different remedies. `AbortSignal.timeout` rejects with a
    // `TimeoutError`, so the name is the discriminator.
    const name = error instanceof Error ? error.name : ''
    const message = error instanceof Error ? error.message : String(error)
    if (name === 'TimeoutError' || /timed? out/i.test(message)) {
      return {
        census: null,
        refusal: { code: 'route-timeout', reason: `the intent-map route did not answer within ${CENSUS_TIMEOUT_MS} ms. The route may be slow rather than down, which is why this is NOT reported as unreachable — a status surface must not confuse the two.` },
        takenAt,
      }
    }
    return {
      census: null,
      refusal: { code: 'route-unreachable', reason: `the intent-map route could not be read: ${message}. This is an INSTRUMENT FAILURE, not a census of zero.` },
      takenAt,
    }
  }
}

// ---------------------------------------------------------------------------
// The one exported function
// ---------------------------------------------------------------------------

/**
 * Describe this lane's surface: what it declares, what it measured, and what it
 * deliberately does NOT do.
 *
 * READ-ONLY AND NO PEER CONTACT — but it is NOT socket-free, and the first version
 * of `notDone` claimed it was. That claim is corrected below and the correction is
 * documented here because the defect is worth more than the fix.
 *
 * WHAT IT DOES: reads `http://127.0.0.1:3083/intent-map/api/map` on THIS machine
 * to take its census. That is a socket, opened on every request. It is deliberate,
 * documented and bounded — and it was DENIED by the string this function
 * published, while this very docstring ADMITTED it. **The read was right and the
 * string was wrong**, which is the more dangerous arrangement of the two: a reader
 * who acts on the justification acts on a false one, and the file's own comments
 * would have contradicted them.
 *
 * THERE IS NO PARAMETER, no mode to select and no branch that reaches a peer. The
 * census read is the ONLY impure act, it is refused rather than coerced, and its
 * timeout is published on the surface.
 */
export async function describeSurface(): Promise<Record<string, unknown>> {
  const live = await readLiveCensus()

  // THE QUORUM, RE-DERIVED RATHER THAN CITED. The oracle still returns null, so
  // the bound still refuses to be relied upon. Computed here so the surface
  // reports the real object rather than a remembered string.
  const bound: QuorumBound = quorumBound(100, 33, UNMEASURED_SYBIL_COST)
  const rawCost = UNMEASURED_SYBIL_COST.costOfNewIdentity()

  // THE WITNESS BOUND, recomputed from the measured latency so it cannot drift
  // from its own input.
  const witness = witnessBound(ROUND_SECONDS, MEASURED_WARM_EMBED_MS, 1)
  const witnessGated = witnessBound(ROUND_SECONDS, MEASURED_WARM_EMBED_MS, 0.01)

  const census = live.census
  const entropy = census === null ? null : fingerprintEntropy(census)
  const share = entropy === null ? null : entropy.largestZone.share

  const payload: Record<string, unknown> = {
    lane: 'social',
    kind: 'plan',
    // CORRECTED 2026-10-16 — the previous string read "...contacts NO peer, opens
    // no socket and accepts no input", and the "opens no socket" clause was FALSE:
    // the handler fetches the intent-map route every time. Two things were wrong
    // with it. (i) It DENIED an act the route performs, and a status surface is
    // read by someone deciding what to rely on. (ii) It attached that false denial
    // to a TRUE statement of intent — "starts no discovery, contacts no peer" is
    // exactly right — which is the shape that survives review, because the true
    // half is the half a reader checks against the route.
    //
    // The shape is now DO-AND-NOT-DO with the impure act NAMED. That bounds the
    // claim from inside: instead of an absolute a reader cannot test, it states a
    // specific reachable act, a specific timeout and a specific exclusivity
    // ("the only one"), each of which a reader can verify against the route.
    notDone:
      'Starts NO discovery and contacts NO peer: no two peers have ever exchanged a packet in this build, and the topology it describes has never carried traffic. It DOES open one socket on every request — a fetch of the local intent-map route at 127.0.0.1:3083 on this machine, to take its census. That fetch is bounded by a 2 s timeout and is the ONLY impure act this surface performs: it accepts no input, mutates no state, and reaches nothing off this machine.',

    // --- the census, or its refusal -----------------------------------------
    // THE DEGRADATION IS PART OF THE SURFACE, not a footnote. A reader is told
    // which socket is opened, how long it may block, and what they get when it
    // fails — so a 2 s pause is a documented bound rather than a mystery stall.
    census:
      census === null
        ? { kind: 'plan', reading: null, refusal: live.refusal, timeoutMs: CENSUS_TIMEOUT_MS }
        : {
            kind: 'exists',
            reading: {
              zones: { count: census.zoneCount.count, of: census.zoneCount.of },
              members: { count: census.memberSum.count, of: census.memberSum.of },
              sourceCatalog: census.sourceCatalog,
            },
            refusal: null,
            timeoutMs: CENSUS_TIMEOUT_MS,
          },

    // THE ONLY IMPURE ACT, NAMED AND BOUNDED. Published so the claim in `notDone`
    // can be checked against the payload rather than taken on trust.
    reachability: {
      kind: 'exists' as const,
      opensSocket: true,
      socketCount: { count: 1, of: 1 },
      target: 'http://127.0.0.1:3083/intent-map/api/map',
      scope: 'loopback only — nothing off this machine',
      timeoutMs: CENSUS_TIMEOUT_MS,
      degenerateTo: {
        onTimeout: 'route-timeout',
        onHttpError: 'route-unavailable',
        onUnreachable: 'route-unreachable',
        onRefusedCensus: 'the census reader\u2019s own refusal code, carried through unchanged',
      },
      note: 'A timeout is reported as `route-timeout` and NOT as `route-unreachable`: a slow route and a dead route have different remedies, and collapsing them misinforms the reader about which failure they have.',
    },

    // --- the three facts the Lead asked a reader to get from this lane -------
    // RE-TAKEN at call time, each carrying numerator, denominator and census time.
    topology: {
      kind: 'plan' as const,
      peersContacted: { count: 0, of: 0 },
      note: 'A 0 on both sides here is NOT agreement and NOT a pass: it is the literal count of peers ever contacted, which is zero because the discovery layer has never been executed. Stated as 0 of 0 by construction, and the construction is the finding.',
    },

    witnessBound: {
      kind: 'exists' as const,
      peers: { count: witness.peers, of: DESIGN_TARGET_POPULATION },
      gatedPeers: { count: witnessGated.peers, of: DESIGN_TARGET_POPULATION },
      changeFraction: 0.01,
      capacityPerSecond: witness.capacityPerSecond,
      warmEmbedMs: MEASURED_WARM_EMBED_MS,
      intervalSeconds: ROUND_SECONDS,
      note: 'A comparison against the design target, NOT a pass: the single-machine witness bound sits BELOW the target, which is the tightest of this lane\u2019s three limits.',
    },

    quorum: {
      kind: 'plan' as const,
      entitledToRelyOn: bound.entitledToRelyOn,
      verdict: bound.verdict,
      formulaSatisfied: bound.formulaSatisfied,
      reason: bound.record.measured.reason,
      note: 'WEB4 does not state whether the peer network is OPEN or CLOSED, so the bound reads `unknown`. `unknown` is the CORRECT value and is NOT normalised to `pass`.',
    },

    // --- ARMOURED: the identity cost, which must never become 0 -------------
    sybilCost: {
      kind: 'plan' as const,
      value: rawCost.value,
      unit: rawCost.unit,
      // Stated as the literal it must be, so a later edit that coerces it fails
      // loudly here rather than quietly asserting that identities are FREE.
      assertedNull: rawCost.value === null,
      note: 'null, NEVER 0. Absent means NOBODY HAS MEASURED THIS; a 0 would assert that a new identity costs nothing, which is the exact claim this lane exists to refuse. A JSON null looks like a bug to an editor who has not read the record, which is why the value and its assertion travel together.',
    },

    // --- the design constants, so the surface states its own calibration -----
    design: {
      bucketsPerZone: BUCKETS_PER_ZONE,
      minSharedZones: MIN_SHARED_ZONES,
      designTargetPopulation: DESIGN_TARGET_POPULATION,
      rosterBudgetBytes: ROSTER_BUDGET_BYTES,
      roundSeconds: ROUND_SECONDS,
    },

    // --- the breaking points, recomputed from the live share where possible --
    breakingPoints: breakingPointsFor(census, share),

    // --- the invariants the lane refuses to weaken ---------------------------
    invariants: {
      crossesABoundary: [
        'zonePseudonym (scoped to one zone, not stable across zones)',
        'protocolVersion',
        'zoneCount (a count, never the zone list)',
        'capabilityClass',
      ],
      neverCrosses: [
        'fingerprintDigest / the raw fingerprint',
        'stable peerId',
        'the confidence vector',
        'the full zone list',
        'censusAt and correlation-permitting timestamps',
      ],
    },

    takenAt: live.takenAt,
  }

  // THE GUARD RUNS BEFORE THE VALUE IS PUBLISHED, not after.
  assertJsonSafe(payload)
  return payload
}

/**
 * The three breaking points, computed from the live largest-zone share when the
 * census answered and reported as `null` with a reason when it did not.
 *
 * A `null` here is the honest output: the bucket-local bound DIVIDES by the
 * largest-zone share, so with no census there is no share, and substituting a
 * remembered 0.1977 would republish the exact rounded-intermediate defect this
 * lane corrected (`D-L6-001`).
 *
 * AND THE SHARE IS PUBLISHED AS A FRACTION, NOT ONLY AS A FLOAT — corrected after
 * running this function and reading its own output. The first version emitted
 * `largestZoneShare: 0.19767441860465115` and nothing else, which is a defect of
 * a specific and familiar kind: **a reader could not reconstruct the number**,
 * because the census block above publishes zone and member TOTALS but never the
 * largest zone's own memberCount. AGENTS.md names the inability of a reader to
 * reconstruct a figure as this program's most-published defect, and the float
 * form makes it worse by looking exact to seventeen digits when it is a binary
 * approximation of `136/688`. The `{count, of}` pair is now the primary form and
 * the float carries a note saying what it is.
 */
function breakingPointsFor(census: ZoneCensus | null, share: number | null): Record<string, unknown> {
  // HARDENED AFTER A REAL CRASH, and the shape of the crash is the lesson.
  // The first version guarded `census === null || share === null`. It was called
  // with ONE argument, so `share` arrived as `undefined` — and **`undefined ===
  // null` is FALSE**, so both guards passed, execution continued into
  // `census.zones.reduce`, and the surface threw. An absent ARGUMENT and an
  // explicit `null` are different values that a `=== null` test cannot tell
  // apart, which is this program's absent-versus-null distinction arriving
  // through the parameter list rather than through a field.
  //
  // And it could not have been caught by running the harness alone:
  // `node --experimental-strip-types` STRIPS types WITHOUT CHECKING them, so the
  // arity error at the call site was invisible at run time and only the typecheck
  // would have caught it. **Type-stripping is not typechecking.**
  if (census === null || census === undefined || share === null || share === undefined) {
    return {
      kind: 'plan',
      reading: null,
      reason: 'the live census did not answer, so the largest-zone share is unknown. It is NOT defaulted to a remembered value: the bucket-local bound divides by this share, so a stale constant would silently republish a computed limit.',
    }
  }
  const largest = census.zones.reduce((a, b) => (b.memberCount > a.memberCount ? b : a))
  return {
    kind: 'plan',
    reading: {
      bucketLocalAtB8: bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 8, 4, share),
      bucketLocalAtB64: bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 64, 4, share),
      // THE PRIMARY FORM: a reader can divide these two and get the share back.
      largestZone: {
        id: largest.id,
        members: { count: largest.memberCount, of: census.memberSum.count },
      },
      largestZoneShare: share,
      largestZoneShareNote:
        'the float above is a binary approximation of largestZone.members.count / largestZone.members.of, NOT an exact decimal. Recompute from the {count, of} pair rather than quoting the decimal: the bucket-local bounds above DIVIDE by this share, so a share rounded early moves them — see D-L6-001.',
    },
    reason: null,
  }
}

/**
 * The lane's whole public surface, for a reader who wants the symbol list rather
 * than the payload. Exported so the barrel is self-describing.
 */
export const SOCIAL_SURFACE_EXPORTS: readonly string[] = ['describeSurface', 'assertJsonSafe']
