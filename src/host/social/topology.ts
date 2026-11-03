/**
 * ============================================================================
 * dsh-meta-market — L6 social topology: THE CHOSEN DESIGN
 * ============================================================================
 *
 * THE CHOICE, STATED FIRST, BECAUSE A SURVEY IS NOT AN ANSWER:
 *
 *   HYBRID, in three layers that answer three different questions —
 *     DISCOVERY    a (zoneId, bucket) DHT, so a peer can FIND another peer
 *                  without a directory and without knowing anyone in advance.
 *     CONVERGENCE  epidemic gossip with a fixed fanout, so a bucket's members
 *                  agree on a view in O(log N) rounds.
 *     REACHABILITY a content-blind relay, so two peers that cannot address each
 *                  other directly can still exchange a package.
 *
 * WHY NOT THE ALTERNATIVES, EACH FOR A SPECIFIC REASON AND NOT AS A LIST:
 *   - MESH is O(N) neighbours per peer. At the 100,000-peer design target that is
 *     99,999 neighbours and 4,999,950,000 edges. It is not merely expensive,
 *     it is the shape this design exists to avoid.
 *   - PURE GOSSIP cannot discover. Gossip propagates a view among peers that are
 *     ALREADY connected; it does not tell a new instance who the first peer is.
 *     That is a different question and it needs a different layer.
 *   - A CENTRAL REGISTRY is the cheapest discovery there is, and it is ruled out
 *     by the system's own definition: `WEB4` (`protocol.ts:551`) says "no central
 *     arbiter". A registry that names every peer IS an arbiter, whatever it is
 *     called.
 *   - A BLOCKCHAIN solves consensus the system does not need. Peers exchange
 *     reviewable patches; they do not need a globally ordered ledger, and buying
 *     one would put O(N) per peer back into a design whose whole point is
 *     avoiding it.
 *
 * THE FALLBACK, NAMED SO IT IS NOT A SILENT HEURISTIC: if DHT discovery is
 * unavailable, the design falls back to STATIC-SEED gossip and reports an
 * explicit `unavailable` state for discovery rather than degrading quietly. A
 * silent fallback is a design that reports success while doing something else.
 *
 * AND WHAT THE `kind` FIELD SAYS ABOUT ALL OF IT: `topology: 'plan'`. No two peers
 * have ever exchanged a message in this build. The design is complete and its
 * arithmetic runs; the network it describes has never carried a packet.
 *
 * @module dsh-meta-market/host/social/topology
 */

import type { Measured, ThreeKind, Verdict, VerdictRecord } from '../../shared/protocol.ts'
import {
  anonymitySetByMinEntropy,
  bucketLocalCost,
  fingerprintEntropy,
  type CensusResult,
  type ZoneCensus,
} from './scale.ts'

// ---------------------------------------------------------------------------
// Bucketing: the trick the whole scale argument rests on
// ---------------------------------------------------------------------------

/**
 * Buckets per zone.
 *
 * THIS IS THE CENTRAL SCALE TRICK, AND IT IS WORTH ONE SENTENCE: a peer does not
 * track a ZONE, it tracks one BUCKET of a zone, and its neighbours are the peers
 * that share a bucket rather than the peers that share an interest. B then appears
 * in the denominator of every per-peer roster term.
 *
 * It is ALSO a privacy mechanism, and the two effects point the same way: a
 * larger B shrinks every peer's roster AND shrinks the largest bucket, which is
 * the shard a lookup walks. So this knob does not trade scale against privacy —
 * raising it improves both, and the only cost is hop count in the DHT.
 */
export const BUCKETS_PER_ZONE = 8

/**
 * Map a fingerprint digest to a bucket index, deterministically.
 *
 * FNV-1a, chosen because it is tiny, has no dependencies, and is exactly as good
 * as this job needs: the input is already a digest, so this is a bucket selector
 * rather than a security primitive. **Calling it a hash and treating it as one
 * would be the mistake** — an adversary who can choose their digest can choose
 * their bucket, and that is a known property, not a defect to be discovered later.
 */
export function bucketOf(fingerprintDigest: string, bucketsPerZone = BUCKETS_PER_ZONE): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < fingerprintDigest.length; i++) {
    hash ^= fingerprintDigest.charCodeAt(i)
    // FNV prime, via shifts to stay in 32-bit integer arithmetic.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash % bucketsPerZone
}

/** The DHT key for one bucket. A peer publishes under, and looks up, this key. */
export function dhtKey(zoneId: string, bucket: number): string {
  return `${zoneId}#${bucket}`
}

/**
 * How many hops a lookup needs, from the key-space size and the per-hop contact.
 *
 * `log_contact(keySpace)`, and it is the reason B is bounded from above: a larger
 * B shrinks each bucket but grows the key space, and the key space grows the hop
 * count. It is genuinely a trade here — but at B=8 the key space is 24 x 8 = 192
 * and the answer is 5 hops at fanout 3, which is not a constraint at all.
 */
export function lookupHopBudget(keySpaceBits: number, contactPerHop: number): number | null {
  if (contactPerHop <= 1 || keySpaceBits <= 0) return null
  return Math.ceil(keySpaceBits / Math.log2(contactPerHop))
}

// ---------------------------------------------------------------------------
// Alignment between two peers: THREE outcomes, not two
// ---------------------------------------------------------------------------

/** How many zones two peers must share before either may rely on the other's alignment. */
export const MIN_SHARED_ZONES = 2

/**
 * The result of comparing two peers' zone sets.
 *
 * `insufficient-evidence` IS A THIRD OUTCOME AND IT IS THE IMPORTANT ONE. A peer
 * that discloses a single zone has NOT said "we disagree" — it has said too
 * little to tell. Folding that into `unaligned` is the same defect as reading a
 * missing field as `0`: it publishes a definite verdict over an absence of
 * evidence. The protocol already carries this shape at `Verdict`, which includes
 * `abstained` and `unknown` alongside `pass` and `fail`.
 */
export type PeerAlignment = 'aligned' | 'unaligned' | 'insufficient-evidence'

/**
 * Compare two peers' zone sets.
 *
 * Note the threshold is on SHARED ZONES, not on a score, because a score would
 * need a distance metric this lane does not own — the alignment threshold
 * operator belongs to `alignment/types.ts`, and `AlignmentVerdict` there is NOT
 * redefined here.
 */
export function peerPairAlignment(
  mine: readonly string[],
  theirs: readonly string[],
  minShared = MIN_SHARED_ZONES,
): PeerAlignment {
  const shared = new Set(mine)
  let overlap = 0
  for (const zone of theirs) {
    if (shared.has(zone)) overlap++
  }
  // THE ORDER OF THESE TWO TESTS IS THE WHOLE DESIGN, and it is easy to collapse
  // them into one. "We share too little" and "I was told too little" are different
  // states with different consequences:
  //
  //   - a peer that DISCLOSED FEWER THAN `minShared` ZONES has not told us enough
  //     to judge it at all. Calling that `unaligned` publishes a definite verdict
  //     over an absence of evidence — the same defect as reading a missing field
  //     as `0`. It is `insufficient-evidence`.
  //   - two peers that each disclosed ENOUGH, yet share less than `minShared`, are
  //     genuinely in conflict. That is `unaligned`, and it is a real finding.
  //
  // An implementation that checks the overlap first can never return `unaligned`,
  // so the third member of the union would be dead code wearing a type.
  const mineSufficient = mine.length >= minShared
  const theirsSufficient = theirs.length >= minShared
  if (!mineSufficient || !theirsSufficient) return 'insufficient-evidence'
  if (overlap < minShared) return 'unaligned'
  return 'aligned'
}

// ---------------------------------------------------------------------------
// The Sybil question, which this lane NAMES and does not answer
// ---------------------------------------------------------------------------

/**
 * The cost of a new identity, which this lane needs and cannot supply.
 *
 * THIS INTERFACE EXISTS TO MAKE AN ABSENCE VISIBLE RATHER THAN TO FILL IT. The
 * Byzantine bound `n >= 3f + 1` is only a bound if identities are not free: if
 * one machine can mint a thousand peers, the arithmetic is satisfied and the
 * guarantee is worthless. Deciding that cost belongs to the identity and safety
 * lanes; what this lane does is REFUSE TO ASSUME IT IS NON-ZERO.
 */
export interface SybilCostOracle {
  costOfNewIdentity(): { readonly value: number | null; readonly unit: string; readonly kind: ThreeKind }
}

/**
 * The honest oracle while no cost has been measured: it returns `null`, and `null`
 * is not `0`.
 *
 * A `0` here would mean "identities are free" — a definite and alarming claim —
 * whereas `null` means "nobody has measured this". Every bound computed against
 * this oracle therefore reaches `unknown`, which is the correct answer to an
 * unmeasured quantity and the reason the quorum function below never returns a
 * bare `pass`.
 */
export const UNMEASURED_SYBIL_COST: SybilCostOracle = {
  costOfNewIdentity() {
    return {
      value: null,
      unit: 'unmeasured',
      kind: 'plan',
    }
  },
}

export interface QuorumBound {
  readonly formulaSatisfied: boolean
  /**
   * Whether this instance may actually RELY on the arithmetic.
   *
   * FALSE whenever the identity cost is unmeasured, even when `n >= 3f + 1` holds.
   * This field is the whole reason the function does not simply return a boolean:
   * the arithmetic and the entitlement to trust it are different questions, and
   * collapsing them is how a satisfied inequality becomes a false guarantee.
   */
  readonly entitledToRelyOn: boolean
  readonly verdict: Verdict
  readonly record: VerdictRecord
}

/**
 * The Byzantine bound, computed but NOT asserted.
 *
 * It deliberately does NOT throw on a free or unmeasured oracle. Throwing would
 * hide the case; returning `unknown` with `entitledToRelyOn: false` REPORTS it,
 * and a caller that wants to proceed must then say so explicitly.
 */
export function quorumBound(n: number, f: number, oracle: SybilCostOracle): QuorumBound {
  const cost = oracle.costOfNewIdentity()
  const formulaSatisfied = n >= 3 * f + 1
  const costKnown = cost.value !== null && cost.value > 0
  const entitledToRelyOn = formulaSatisfied && costKnown

  return {
    formulaSatisfied,
    entitledToRelyOn,
    verdict: entitledToRelyOn ? 'pass' : 'unknown',
    record: {
      verdict: entitledToRelyOn ? 'pass' : 'unknown',
      rule: 'Byzantine fault tolerance n >= 3f + 1, valid only when an identity is not free',
      falsifier:
        'a single machine minting more than a third of the peers at negligible cost makes this bound false while the inequality still holds, which is why the inequality alone is not the claim.',
      measured:
        entitledToRelyOn
          ? { value: n, reason: null }
          : {
              value: null,
              reason:
                cost.value === null
                  ? 'the cost of a new identity is unmeasured, so n >= 3f + 1 has no force: the bound is a statement about identities that are not free.'
                  : 'the cost of a new identity is explicitly zero, so the bound is satisfied arithmetically and defeated economically.',
            },
      censusAt: null,
      evidence: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Routability: refuse, do not default
// ---------------------------------------------------------------------------

export interface RoutablePeer {
  readonly peerId: string
  readonly zones: readonly string[]
  readonly protocolVersion: number
}

export interface Routability {
  readonly routable: boolean
  readonly reason: string
}

/**
 * Whether a peer can be placed in the topology at all.
 *
 * A peer with NO ZONES IS REFUSED, not defaulted into a catch-all bucket. A
 * default bucket would make every zoneless peer neighbours with every other, which
 * is a mesh reintroduced through the back door of a convenience default — and it
 * is the same class of defect as `?? 0`. Zero zones is a definite state and the
 * honest response is to name it.
 */
export function routability(peer: RoutablePeer): Routability {
  if (peer.zones.length === 0) {
    return {
      routable: false,
      reason: 'the peer discloses no zones, so it has no bucket to be placed in. Defaulting it into a shared bucket would silently rebuild a mesh.',
    }
  }
  if (peer.protocolVersion < 1) {
    return {
      routable: false,
      reason: `protocol version ${peer.protocolVersion} is not a version this instance speaks.`,
    }
  }
  return { routable: true, reason: 'at least one zone and a supported protocol version.' }
}

// ---------------------------------------------------------------------------
// Privacy: what a peer LEARNS, and what it must NOT
// ---------------------------------------------------------------------------

/**
 * What one peer is shown about another.
 *
 * This is the DISCLOSED side of the boundary, written as a type so that the
 * withheld side can be stated as its complement rather than as a promise.
 */
export interface PeerFacingCard {
  /** A pseudonym, scoped to ONE zone. Not stable across zones and not the peerId. */
  readonly zonePseudonym: string
  readonly protocolVersion: number
  readonly zoneCount: Measured
  readonly capabilityClass: string
}

/**
 * The fields a peer-facing card MAY carry. Stated as data so a reader can see the
 * boundary without reading the constructor.
 */
export const DISCLOSED_FIELDS: readonly string[] = [
  'zonePseudonym (scoped to one zone, not stable across zones)',
  'protocolVersion',
  'zoneCount (a count, never the zone list)',
  'capabilityClass',
]

/**
 * THE FIELDS THAT MUST NEVER CROSS, AND THE LIST IS A TYPE OF DISCLOSURE RATHER
 * THAN A POLICY.
 *
 * This matters more than it looks. The zone fingerprint is sensitive not because
 * a zone id is secret — the 24 zones are published in the intent map — but
 * because the COMBINATION and the CONFIDENCE VECTOR together narrow a peer to a
 * small anonymity set. Measured over the live census: a 4-zone fingerprint has
 * `C(24,4) = 10,626` raw subsets but only `2^(4 x H_min) = 655` once the
 * distribution is respected, so the raw count overstates anonymity 16.2x. What a
 * peer must not learn is therefore the joint distribution that turns 655 into 1.
 */
export const WITHHELD_FIELDS: readonly string[] = [
  'fingerprintDigest / the raw fingerprint (it selects the bucket and narrows the anonymity set)',
  'stable peerId (linkability across zones and across rounds)',
  'the confidence vector (it is what turns a zone combination into an identification)',
  'the full zone list (a count is disclosable; the list is a fingerprint)',
  'censusAt and any timestamps that permit correlation across rounds',
]

/**
 * A per-zone pseudonym.
 *
 * Derived from the peer id AND the zone, so the same peer presents different names
 * in different zones and two peers cannot trivially join their observations. This
 * is a CORRELATION DEFENCE, NOT ANONYMITY AGAINST A GLOBAL OBSERVER — see the
 * falsifier in the research file, which names the relay as the observer that
 * defeats it.
 */
export function zoneScopedPseudonym(peerId: string, zone: string): string {
  let hash = 0x811c9dc5
  const material = `${peerId}\u0000${zone}`
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return `z${hash.toString(16).padStart(8, '0')}`
}

/**
 * Build the card one peer may see about another.
 *
 * THERE IS NO OPT-OUT PARAMETER, AND THAT IS DELIBERATE. A `disclose(...)`
 * function with a flag that widens the view is a boundary that will be widened
 * the first time a caller is in a hurry. The narrow card is the only card this
 * function can produce, so the wide one has to be written somewhere else, on
 * purpose, where a reviewer will see it.
 */
export function redactForPeer(
  peer: RoutablePeer,
  zone: string,
  capabilityClass: string,
): PeerFacingCard {
  return {
    zonePseudonym: zoneScopedPseudonym(peer.peerId, zone),
    protocolVersion: peer.protocolVersion,
    zoneCount: { count: peer.zones.length, of: peer.zones.length },
    capabilityClass,
  }
}

export interface PrivacyInvariant {
  readonly name: string
  readonly holds: boolean
  readonly detail: string
}

/**
 * Check the invariants that must hold between two cards for two different zones.
 *
 * THIS IS A CHECK, NOT A CLAIM, and it is written so it can go RED. It asserts the
 * ABSENCE of material rather than the presence of a redaction: the serialised card
 * must not CONTAIN the peer id or the fingerprint. A test that greps for the
 * redaction function's output would pass even if the function were never called.
 */
export function privacyInvariants(
  peer: RoutablePeer,
  zoneA: string,
  zoneB: string,
): readonly PrivacyInvariant[] {
  const cardA = redactForPeer(peer, zoneA, 'observer')
  const cardB = redactForPeer(peer, zoneB, 'observer')
  const serialisedA = JSON.stringify(cardA)
  const serialisedB = JSON.stringify(cardB)

  return [
    {
      name: 'cross-zone pseudonyms differ',
      holds: cardA.zonePseudonym !== cardB.zonePseudonym,
      detail: `${cardA.zonePseudonym} vs ${cardB.zonePseudonym}`,
    },
    {
      name: 'the stable peer id appears in no card',
      holds: !serialisedA.includes(peer.peerId) && !serialisedB.includes(peer.peerId),
      detail: 'the peerId is not a substring of either serialised card.',
    },
    {
      name: 'no fingerprint digest appears in a card',
      holds: !serialisedA.includes('fingerprint') && !serialisedB.includes('fingerprint'),
      detail: 'no field name or value containing "fingerprint" is present.',
    },
    {
      name: 'the zone list itself is not disclosed',
      holds: peer.zones.every((zone) => !serialisedA.includes(`"${zone}"`)),
      detail: 'a zone COUNT crosses; the zone LIST does not.',
    },
    {
      name: 'the zone id is not disclosed verbatim',
      holds: !serialisedA.includes(zoneA) && !serialisedB.includes(zoneB),
      detail: 'the zone scopes the pseudonym without being named in the card.',
    },
    {
      name: 'the card carries no timestamp',
      holds: !/\d{4}-\d{2}-\d{2}/.test(serialisedA) && !/\d{4}-\d{2}-\d{2}/.test(serialisedB),
      detail: 'no ISO date is present, so two cards cannot be correlated by when they were produced.',
    },
  ]
}

// ---------------------------------------------------------------------------
// The summary a route would serve
// ---------------------------------------------------------------------------

export interface TopologySummary {
  readonly kinds: Readonly<Record<string, ThreeKind>>
  readonly bucketsPerZone: number
  readonly minSharedZones: number
  readonly zoneCount: Measured
  readonly bucketCount: number
  readonly dhtKeySpaceBits: number
  readonly lookupHopsAtFanout3: number | null
  readonly anonymityRawAtK4: number
  readonly anonymityMinEntropyAtK4: number
  readonly anonymityOverstatementFactor: number
  readonly largestZone: { readonly id: string; readonly share: number }
  readonly censusAt: string
}

/** Assemble the topology's own summary from a census reading. Refuses an empty census by construction. */
export function summarise(censusResult: CensusResult, bucketsPerZone = BUCKETS_PER_ZONE): TopologySummary {
  if (censusResult.refused) {
    throw new Error(
      `cannot summarise a refused census (${censusResult.code}): ${censusResult.reason}`,
    )
  }
  const census: ZoneCensus = censusResult.census
  const entropy = fingerprintEntropy(census)
  const bucketCount = census.zones.length * bucketsPerZone
  const raw = combination(census.zones.length, 4)
  const corrected = anonymitySetByMinEntropy(entropy.minEntropyBits, 4)

  return {
    kinds: { topology: 'plan', zoneCensus: 'exists', peerNetwork: 'plan' },
    bucketsPerZone,
    minSharedZones: MIN_SHARED_ZONES,
    zoneCount: census.zoneCount,
    bucketCount,
    dhtKeySpaceBits: Math.log2(bucketCount),
    lookupHopsAtFanout3: lookupHopBudget(Math.log2(bucketCount), 3),
    anonymityRawAtK4: raw,
    anonymityMinEntropyAtK4: Math.round(corrected),
    anonymityOverstatementFactor: raw / corrected,
    largestZone: entropy.largestZone,
    censusAt: census.censusAt,
  }
}

/** C(n, k) without a factorial, so the count stays exact for the sizes used here. */
function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1)
  }
  return Math.round(result)
}

/**
 * The per-peer cost of the chosen shape, re-exported so a caller has one import.
 *
 * Deliberately a thin pass-through rather than a second implementation: two
 * implementations of the same arithmetic is two answers waiting to disagree, and
 * this program has published that defect under the name "two agents confirmed it
 * with the same expression".
 */
export { bucketLocalCost }
