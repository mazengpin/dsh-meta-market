/**
 * ============================================================================
 * dsh-meta-market / host / identity — the trust root, stated honestly
 * ============================================================================
 *
 * THE MISSION, AND THE ONE SENTENCE IT REDUCES TO
 *
 * How does instance A know that instance B is who it claims, and may it talk to
 * B AT ALL? This module answers the second half and tells the truth about the
 * first, because the two answers are of different KINDS and flattening them is
 * this program's most-published defect.
 *
 * THE FINDING, UP FRONT, BECAUSE EVERYTHING BELOW DEPENDS ON IT
 *
 * **This deployment has an IDENTIFIER and it does not have a KEY.** Measured:
 * `$DSH_HOME/.anonymous-user-id` (`~/.dsh/.anonymous-user-id`) holds a **36-char
 * bare UUID, 37 bytes with its newline**, and the Harness package that owns it
 * says in its own header that it is *"never derived from the hostname, network
 * address, git remote, or any other identifying source"* and that *"deleting the
 * file mints a fresh identity on the next launch"*
 * (`deepseek-harness/packages/identity/anonymous-user-id/src/index.ts:6-9`).
 *
 * A value that anyone can copy, and that any process sharing `$DSH_HOME`
 * reports identically, **cannot authenticate anything**. It is a NAME, not a
 * credential. So:
 *
 *   - A peer card's `instanceId` **declares** which instance is speaking. It is
 *     the `from` address on an envelope, not a signature under one.
 *   - **Provenance is `plan` kind.** There is no key material on this deployment
 *     to bind a card to a real instance: a search for `ed25519`,
 *     `generateKeyPair`, `createSign` and `createVerify` across all non-test
 *     `.ts` files under the checkout's `packages/**` returns **0 of 0 files**. The
 *     `identity/` package directory contains exactly one package,
 *     `anonymous-user-id`, and it is the file quoted above. No key file exists
 *     (`.identity.key`, `.ed25519`, `keys` — all absent), and `~/.dsh/.credentials.yaml`
 *     (246 B, one record, `client-connection/browser-session`) DOES hold a secret,
 *     so a secret store exists even though no key material does.
 *   - The consequence is not a gap to apologise for, it is the DESIGN: if cards
 *     cannot be authenticated, then **no admission decision may rest on a card**.
 *     It must rest on a local, non-forgeable fact instead. That is what this
 *     module implements, and it is why the trust root is a LOCAL DECISION and
 *     NOT a remote assertion.
 *
 * THE TRUST ROOT, NAMED
 *
 * **The trust root is the OWNER'S OWN ADMISSION DECISION — a local, human-acted
 * allowlist of peer ids — together with the observation history this instance
 * recorded itself.** Both halves are:
 *
 *   - **not derivable from anything a peer sends** (so lying on the card buys
 *     nothing: the card is a request to be considered, never a grant), and
 *   - **not forgeable by a peer** (so a peer cannot promote itself), and
 *   - **not a built cryptographic fact** (so this module does not claim one).
 *
 * A peer that presents a valid-looking card, correctly signed by a key it
 * generated a moment ago, is by construction not one byte stronger than a peer
 * that presents nothing, because **there is no key that this instance could
 * check it against**. `deriveKeyMaterial()` below returns `null` with that
 * reason rather than pretending otherwise.
 *
 * **No route in this lane exposes a write to the trust store**, so the trust root
 * is unreachable from the network surface. That is deliberate: the one operation
 * that can promote a peer is an operation no peer can reach.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *
 *   - **No device, no GPU.** There is no CUDA context here and the GPU directive
 *     says none should be opened from a Cordis plugin. This module performs no
 *     I/O beyond the local filesystem and holds no model.
 *   - **No Laya call from this module.** The Laya decision path takes
 *     `noul`/`choice`/`score` fields only and rejects free strings and nested
 *     objects; a peer's raw capability token array is a shape that path cannot
 *     express. So the union computation below reduces the tokens to closed
 *     decisions and exposes them as `noul`/`score` values, and the *caller*
 *     (task-6, safety) owns the call. Putting a `string[]` in a request body
 *     would be answered by a refusal nobody intended to ask for.
 *   - **No trust in a declaration.** `declaration` on a card is self-asserted
 *     testimony. It is used to REFUSE, never to permit.
 *
 * THE ERROR DIRECTION, CHOSEN DELIBERATELY
 *
 * Every unmeasurable input resolves to **less** trust, never more. A missing
 * reading is `unknown`, and `unknown` is not a stage. This is stated as a rule
 * because the opposite choice — "we could not check, so let it through" — is
 * the one that produces a system which looks careful and admits anyone.
 *
 * @module dsh-meta-market/host/identity
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  DECLARED_CAPABILITY_TOKENS,
  redLineNamesCredentials,
  redLineNamesNetwork,
} from './capability-vocabulary.ts'
import type {
  CapabilityDeclaration,
  Measured,
  Maybe,
  PeerCard,
  ThreeKind,
  Verdict,
  Verification,
} from '../../shared/protocol.ts'

/** The four stages a peer may reach, in order. Each is a separate grant. */
export type TrustStage = 'discover' | 'talk' | 'propose-patch' | 'receive-patch'

/** The stages in ascending order, so `meets()` is an index comparison and not a switch. */
export const TRUST_STAGES: readonly TrustStage[] = ['discover', 'talk', 'propose-patch', 'receive-patch']

/**
 * How far this instance trusts one peer.
 *
 * Ordered, and the order is the whole meaning: a grant to `receive-patch`
 * implies every stage below it, which is why the stages are an array with a
 * total order rather than a set of independent booleans.
 */
export type TrustLevel = 'unknown' | 'observed' | 'admitted' | 'vetted'

/** Ascending rank. `unknown` is rank 0 and is NOT a stage — it grants nothing. */
export const TRUST_RANK: Readonly<Record<TrustLevel, number>> = {
  unknown: 0,
  observed: 1,
  admitted: 2,
  vetted: 3,
}

/** The highest stage each trust level reaches. `unknown` reaches none — `null`, not `'discover'`. */
export const MAX_STAGE_BY_LEVEL: Readonly<Record<TrustLevel, TrustStage | null>> = {
  unknown: null,
  observed: 'discover',
  admitted: 'talk',
  vetted: 'receive-patch',
}

/** The ranks, exposed so a caller can order two levels without re-deriving the table. */
export function trustRank(level: TrustLevel): number {
  return TRUST_RANK[level]
}

/**
 * Where this instance heard about a peer.
 *
 * `owner-admitted` is the only value that can produce `admitted` or above, and
 * it is never derived from the peer's own bytes. The distinction is carried in
 * the type because it is the entire trust root.
 */
export type ObservedVia = 'owner-admitted' | 'peer-presented' | 'owner-refused'

/** One peer, as this instance has recorded it locally. */
export interface PeerRecord {
  readonly instanceId: string
  readonly level: TrustLevel
  readonly observedVia: ObservedVia
  /** ISO time of the first sighting, or `null` if never sighted. */
  readonly firstSeenAt: string | null
  /** ISO time of the last sighting, or `null`. */
  readonly lastSeenAt: string | null
  /** How many times a card from this id has been seen. `Measured` because a count needs its denominator. */
  readonly sightings: Measured
  /** Why this level, in a sentence a reader can act on. */
  readonly reason: string
}

/** The local, on-disk shape of the allowlist and observation history. */
export interface TrustStore {
  /** Owner-admitted peer ids. THE trust root. Written by a human, never by a peer. */
  readonly admitted: readonly string[]
  /** Peer ids the owner explicitly refused, so a refusal is not re-litigated every boot. */
  readonly refused: readonly string[]
  readonly observed: Readonly<Record<string, { readonly firstSeenAt: string; readonly lastSeenAt: string; readonly sightings: number }>>
}

/** An empty store, as a value rather than a branch. */
export const EMPTY_TRUST_STORE: TrustStore = { admitted: [], refused: [], observed: {} }

/**
 * The outcome of reading the trust store.
 *
 * `store: null` with a `reason` is the honest form for an absent file. It is
 * NEVER an empty store, because an empty store means "the owner admitted
 * nobody", which is a different and much stronger claim than "no allowlist was
 * found". Collapsing the two would make a missing file silently refuse everyone
 * — which is safe, and would hide a real configuration error behind a
 * security-looking result.
 */
export interface TrustStoreReading {
  readonly path: string | null
  readonly exists: boolean
  readonly bytes: number | null
  readonly store: TrustStore | null
  readonly reason: string | null
}

/**
 * WHAT PROVES A PEER IS WHO IT CLAIMS — and the honest answer, which is nothing.
 *
 * This interface exists so the gap is a NAMED VALUE rather than an omission a
 * reader has to notice. `kind` is `ThreeKind` and is `'plan'` on this
 * deployment: the mechanism is designed and not built.
 */
export interface KeyMaterial {
  /** `exists` when a real key and a real verification path are available; `plan` otherwise. */
  readonly kind: ThreeKind
  /** The algorithm a built version would use. `null` when nothing is available. */
  readonly algorithm: string | null
  /** The public key a peer's card would be checked against, or `null` — which is today's answer. */
  readonly publicKey: string | null
  /** Why the value above is what it is. Required in practice whenever `publicKey` is null. */
  readonly reason: string
  readonly evidence: readonly Verification[]
}

/**
 * The key material available on this deployment.
 *
 * **Returns `publicKey: null` and `kind: 'plan'`, and that is the finding rather
 * than a stub.** A module that returned a plausible placeholder here would make
 * every downstream admission look authenticated.
 *
 * @returns the honest reading of available key material.
 */
export function deriveKeyMaterial(): KeyMaterial {
  return {
    kind: 'plan',
    algorithm: null,
    publicKey: null,
    reason:
      'No key material exists on this deployment, so no card can be authenticated and none is treated as authenticated. The Harness ships one identity package, `@deepseek-ai/dsh-anonymous-user-id`, and its id is a random UUID that its own source says is never derived from an identifying source and is replaced when the file is deleted — an IDENTIFIER, not a credential. A search for ed25519, generateKeyPair, createSign and createVerify over every non-test .ts file under the checkout\'s packages/ returned 0 files, so there is no signing primitive wired anywhere to borrow. No key file exists either. The mechanism that would replace this is `plan` kind: an Ed25519 keypair minted at first boot, the public half published in the peer card, and a signature over the canonical card payload verified before any field of that card is read.',
    evidence: ['verified-ran', 'verified-read'],
  }
}

/**
 * What was learned about this instance's own identity.
 *
 * Declared here rather than imported so this module reads without a type it does
 * not otherwise need.
 */
export interface InstanceIdentity {
  readonly instanceId: string
  readonly source: string
  readonly bytes: number
  /** `true`: the value is a copyable identifier, not a credential. */
  readonly isIdentifierOnly: boolean
  /** `sha256(id)` truncated to 16 hex chars — safe to publish where the id itself is not. */
  readonly fingerprint: string
  readonly bindingKind: ThreeKind
  readonly bindingReason: string
}

/**
 * Read the per-install identifier this deployment already has.
 *
 * The Harness's own path is used — `$DSH_HOME` then `~/.dsh` — so this module
 * names the SAME identity the rest of the deployment uses rather than minting a
 * parallel one. A second identity would be a second answer to "who is this
 * instance", which is the defect the whole module exists to prevent.
 *
 * **This is a NAME, not a secret, and the payload says so in a field rather than
 * in a comment.** `isIdentifierOnly` is computed from the observed shape (a bare
 * UUID), not asserted.
 *
 * @returns the reading, with `value: null` and a reason when nothing was found.
 */
export function readInstanceIdentity(): Maybe<InstanceIdentity> {
  const home = process.env['DSH_HOME'] ?? join(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '', '.dsh')
  if (home === '') {
    return { value: null, reason: 'Neither DSH_HOME, USERPROFILE nor HOME is set, so the harness home could not be located and no instance id was read.' }
  }
  const path = join(home, '.anonymous-user-id')
  if (!existsSync(path)) {
    return { value: null, reason: `${path} does not exist, so this instance has no persisted id — this is an ABSENT reading, not an instance with an empty id.` }
  }
  let text: string
  let bytes: number
  try {
    text = readFileSync(path, 'utf8')
    bytes = statSync(path).size
  } catch (error) {
    return { value: null, reason: `${path} exists but could not be read: ${messageOf(error)}` }
  }
  const value = text.trim()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (!isUuid) {
    return { value: null, reason: `${path} exists but its contents are not a bare UUID (${bytes} bytes), so it was NOT adopted as an instance id.` }
  }
  return {
    value: {
      instanceId: value,
      source: path,
      bytes,
      /**
       * `true` because the value is a bare, copyable UUID. This field is what
       * stops a downstream consumer treating the instance id as a credential.
       */
      isIdentifierOnly: true,
      /**
       * The fingerprint, not the value, is what a payload should carry when a
       * reader needs to distinguish two instances. The id itself is a
       * correlatable identifier and there is no reason to publish it.
       */
      fingerprint: createHash('sha256').update(value).digest('hex').slice(0, 16),
      /** The mechanism binding THIS id to a real instance. `plan`: nothing binds it today. */
      bindingKind: 'plan' satisfies ThreeKind,
      bindingReason: 'Nothing binds this id to the instance that presents it: the file is readable by any process sharing the harness home and copying it reproduces the identity exactly. Treat it as a claim about which instance is SPEAKING, never as proof of which instance is CONNECTED.',
    },
    reason: null,
  }
}

/**
 * Canonicalise a card so two parties hash the same bytes.
 *
 * **Field order is fixed by this function and not by the sender.** A hash taken
 * over a `JSON.stringify(card)` whose key order the sender chose is a hash a
 * sender can vary without changing a single value — the same card admits many
 * byte strings, so a signature over one of them proves nothing about the
 * others.
 *
 * `intentFingerprint` is INCLUDED and the raw vector is not, because the vector
 * reveals the user's interests and the fingerprint does not. `declaration`'s
 * arrays are SORTED, so a peer cannot re-order a capability list to produce a
 * second valid hash over the same claims.
 *
 * Note `declaresNothing` is INCLUDED: a card that declares nothing must not
 * canonicalise to the same bytes as a card that was never asked, because
 * `declaresNothing` and `neverDeclared` are different claims.
 *
 * @param card - the card to canonicalise.
 * @returns a deterministic string.
 */
export function canonicalCard(card: PeerCard): string {
  const declaration = card.declaration
  const caps = [...declaration.capabilities].sort()
  const reds = [...declaration.redLines].sort()
  return JSON.stringify({
    specVersion: card.specVersion,
    instanceId: card.instanceId,
    label: card.label,
    intentFingerprint: card.intentFingerprint,
    capabilities: caps,
    redLines: reds,
    declaresNothing: declaration.declaresNothing,
  })
}

/** `sha256` of the canonical card, 32 hex chars. The value a signature would cover. */
export function cardFingerprint(card: PeerCard): string {
  return createHash('sha256').update(canonicalCard(card), 'utf8').digest('hex').slice(0, 32)
}

/**
 * Whether a card could be bound to a real instance.
 *
 * Always `unknown` on this deployment, and it returns that as a VALUE with a
 * reason rather than a bare `false`, because `false` would mean "we checked, and
 * it is not" — a positive result about the world — where the truth is "there is
 * nothing to check it against".
 *
 * @param card - the card to assess.
 * @returns a verdict; `unknown` today, with the reason naming what is missing.
 */
export function verifyCardProvenance(card: PeerCard): { readonly verdict: Verdict; readonly reason: string; readonly cardHash: string } {
  const key = deriveKeyMaterial()
  const cardHash = cardFingerprint(card)
  if (key.publicKey === null) {
    return {
      verdict: 'unknown',
      cardHash,
      reason: `${key.reason} The card hashes to ${cardHash}, and that hash proves the card is internally consistent — it does NOT prove who composed it, because anyone can compose a card that hashes correctly.`,
    }
  }
  return { verdict: 'unknown', cardHash, reason: 'A public key was available but no signature field exists on PeerCard to check against it, so provenance is still unmeasured.' }
}

/** The peer's privilege as closed decisions. */
export interface PrivilegeAxis {
  /** The declared tokens PLUS the red lines — the union's size, so a reader sees both contribute. */
  readonly declaredTokenCount: number
  readonly declaresNothing: boolean
  /** The DECLARED capability tokens, sorted. A closed vocabulary, not prose. */
  readonly capabilityUnion: readonly string[]
  /** The red lines as given. Prose sentences, carried alongside the tokens and never merged into them. */
  readonly redLines: readonly string[]
  readonly unknownTokens: readonly string[]
  readonly credentialsWithNetwork: 0 | 1
  readonly declaresDynamicCode: 0 | 1
  readonly declaresShell: 0 | 1
  /** `score` on a declared 0-3 ladder: 3 is the exfiltration shape, and it is its own rung. */
  readonly privilegeScore: number
  /** Which FIELD each axis was learned from, so the union is legible rather than merely claimed. */
  readonly axisSource: {
    readonly credentials: 'capabilities' | 'redLines' | 'both' | 'neither'
    readonly network: 'capabilities' | 'redLines' | 'both' | 'neither'
  }
  readonly fieldOf: {
    readonly inCapabilitiesOnly: readonly string[]
    readonly redLinesOnly: readonly string[]
    readonly inBoth: readonly string[]
  }
}

/**
 * Reduce a peer's raw declaration to the closed decisions the Laya path can take.
 *
 * THE POINT OF THIS FUNCTION IS THE SHAPE, NOT THE ARITHMETIC. A `string[]` is
 * not expressible in the decision grammar, so a lane that forwarded one would be
 * refused for a reason it did not intend to ask about. Everything a model is
 * asked here is a `noul` (an integer 0 or 1) or a `score` (an integer inside a
 * declared scale).
 *
 * **THE UNION RULE IS APPLIED HERE, and it is the task's central requirement.**
 * The catalog's `capabilities` and `capabilityRedLines` are independently derived
 * and DISAGREE. Measured over the staged snapshot
 * (`research/cache/plugins-2026-10-12.json`, 4,527 rows, census 2026-10-16T16:49Z):
 * **488 rows declare `credentials` in `capabilities` while 386 rows carry a
 * red line naming credentials — 102 rows declare it and are not red-lined, and
 * the two sets are not nested.** A filter reading either field alone is wrong.
 *
 * **AND THE UNION IS NOT A SET UNION OF STRINGS, WHICH IS THE PART THAT LOOKS
 * RIGHT AND IS NOT.** `capabilities` is a closed TOKEN set — measured at 10
 * distinct values over 13,542 assertions. `capabilityRedLines` is free PROSE —
 * 538 assertions whose dominant value is the 56-character sentence
 * `'reads credentials/secrets AND has network access'`. So
 * `new Set([...capabilities, ...redLines])` puts a sentence where a token
 * belongs, and every exact-membership test against it then returns `false` — a
 * peer who declares the exfiltration shape in PROSE would be GRANTED. The union
 * is therefore taken at the level of MEANING: exact membership for tokens,
 * substring for red lines, and `axisSource` reports which field each axis came
 * from so the union is legible rather than merely claimed.
 *
 * @param declaration - the peer's self-declaration.
 * @returns the axis as closed decisions, with the union computed.
 */
export function privilegeAxis(declaration: CapabilityDeclaration): PrivilegeAxis {
  const declared = new Set(declaration.capabilities)
  const redLines = [...declaration.redLines]

  const declaresNothing = declaration.declaresNothing
  const hasCapability = (token: string): boolean => !declaresNothing && declared.has(token)
  const hasRedLineNaming = (predicate: (line: string) => boolean): boolean => !declaresNothing && redLines.some(predicate)

  const credentialsByCapability = hasCapability('credentials')
  const credentialsByRedLine = hasRedLineNaming(redLineNamesCredentials)
  const networkByCapability = hasCapability('network')
  const networkByRedLine = hasRedLineNaming(redLineNamesNetwork)

  const holdsCredentials = credentialsByCapability || credentialsByRedLine
  const holdsNetwork = networkByCapability || networkByRedLine
  const dynamicCode = hasCapability('dynamic-code')
  const shell = hasCapability('shell')

  const unionTokenCount = declaresNothing ? 0 : declared.size + redLines.length
  const unknownCapabilities = [...declared].filter(t => !DECLARED_CAPABILITY_TOKENS.has(t)).sort()

  return {
    declaredTokenCount: unionTokenCount,
    declaresNothing,
    capabilityUnion: [...declared].sort(),
    redLines,
    unknownTokens: unknownCapabilities,
    credentialsWithNetwork: holdsCredentials && holdsNetwork ? 1 : 0,
    declaresDynamicCode: dynamicCode ? 1 : 0,
    declaresShell: shell ? 1 : 0,
    privilegeScore: privilegeLadder(holdsCredentials && holdsNetwork, dynamicCode, shell),
    axisSource: {
      credentials: credentialsByCapability && credentialsByRedLine ? 'both' : credentialsByCapability ? 'capabilities' : credentialsByRedLine ? 'redLines' : 'neither',
      network: networkByCapability && networkByRedLine ? 'both' : networkByCapability ? 'capabilities' : networkByRedLine ? 'redLines' : 'neither',
    },
    fieldOf: {
      inCapabilitiesOnly: [...declared].sort(),
      redLinesOnly: redLines.filter(l => !declared.has(l)),
      inBoth: [...declared].filter(t => redLines.includes(t)).sort(),
    },
  }
}

/**
 * The privilege ladder, 0-3, declared in the proposition.
 *
 * `0` nothing notable; `1` one dangerous axis; `2` two; `3` credentials together
 * with network. The top rung is not merely the sum of two axes — it is the
 * exfiltration shape, which is why it is its own rung rather than the sum.
 *
 * @param credentialsAndNetwork - the exfiltration shape.
 * @param dynamicCode - declares dynamic code.
 * @param shell - declares shell.
 * @returns the level, 0-3.
 */
function privilegeLadder(credentialsAndNetwork: boolean, dynamicCode: boolean, shell: boolean): number {
  if (credentialsAndNetwork) return 3
  return (dynamicCode ? 1 : 0) + (shell ? 1 : 0)
}

/** What a peer presented at one stage, and what this instance decided. */
export interface AdmissionDecision {
  readonly instanceId: string
  readonly stage: TrustStage
  readonly granted: boolean
  readonly level: TrustLevel
  /** The rule that produced this decision, cited rather than implied. */
  readonly rule: string
  /** The single observation that would make this decision wrong. */
  readonly falsifier: string
  /**
   * What was looked at, or `null` when nothing was.
   *
   * **`Measured | null`, per the Lead's cross-lane ruling, and deliberately NOT
   * `Maybe<number>`.** `Maybe<number>.value` is a bare number with no
   * denominator, which is the coercion `ABSENCE_DISCIPLINE` forbids; a count is
   * either `Measured` (a numerator WITH its denominator) or it is absent. The
   * WHY for a `null` here is carried by `reasons` below, which is the sibling
   * field that makes the simpler composition correct for this shape.
   */
  readonly measured: Measured | null
  readonly reasons: readonly string[]
}

/**
 * The admission rule: **a peer reaches a stage only if this instance's own local
 * record already places it at or above that stage, and a refusal is always
 * available.**
 *
 * THE FOUR THINGS IT REFUSES, STATED SO EACH IS CHECKABLE
 *
 *  1. **Any peer not in the local store.** Level `unknown`, no stage — including
 *     `discover`. A peer's own card never gets it in: the card is read to learn
 *     `instanceId` and to compute the privilege axis, and the axis is used to
 *     REFUSE. This is the negative control in `refusalFor()`.
 *  2. **Any peer the owner refused**, even if a card is presented again. A
 *     refusal is sticky, so a peer cannot re-litigate it by reconnecting.
 *  3. **A peer whose declared privilege sits at the top rung** — credentials
 *     together with network — at `propose-patch` and above, EVEN IF the owner
 *     admitted it. The owner admits a peer to TALK; they do not thereby hand it
 *     the exfiltration shape. Measured population: 386 of 4,527 catalog rows
 *     carry exactly that red line.
 *  4. **A peer presenting tokens outside the vocabulary.** Unclassifiable
 *     privilege is refused rather than defaulted, because the alternative is a
 *     filter that passes anything it has not heard of.
 *
 * @param record - this instance's local record of the peer, or `null` when there is none.
 * @param card - the card the peer presented, or `null` when none was presented.
 * @param stage - the stage being requested.
 * @returns the decision, with the rule, the falsifier and the reasons.
 */
export function decideAdmission(record: PeerRecord | null, card: PeerCard | null, stage: TrustStage): AdmissionDecision {
  const instanceId = record?.instanceId ?? card?.instanceId ?? '<no id presented>'
  const level: TrustLevel = record?.level ?? 'unknown'
  const reasons: string[] = []
  const rule = 'admit iff (a) the LOCAL record places the peer at or above the stage, and (b) every declared capability token is in the closed vocabulary, and (c) at propose-patch and above the peer does not declare credentials together with network access'

  const falsifier =
    'a peer that was granted ' + stage + ' while (i) absent from the local trust store, or (ii) explicitly refused by the owner, or (iii) declaring a token outside the closed vocabulary, or (iv) at propose-patch or above declaring credentials together with network access'

  if (record === null) {
    reasons.push('The peer is not in this instance\'s local trust store. A card is a request to be considered, never a grant, so nothing the peer sent could have got it in.')
    return { instanceId, stage, granted: false, level: 'unknown', rule, falsifier, measured: null, reasons }
  }
  if (record.observedVia === 'owner-refused') {
    reasons.push('The owner explicitly refused this peer. A refusal survives reconnection, so presenting a card again does not reopen it.')
    return { instanceId, stage, granted: false, level, rule, falsifier, measured: record.sightings, reasons }
  }
  if (record.observedVia !== 'owner-admitted') {
    reasons.push(`The peer is known to this instance but was NOT admitted by the owner (observedVia=${record.observedVia}). Observation is recorded from the peer's OWN presentation, so it can never reach above \`discover\`.`)
  }

  const maxStage = MAX_STAGE_BY_LEVEL[level]
  if (maxStage === null) {
    reasons.push('The peer\'s level is `unknown`, which reaches no stage — not even `discover`. `unknown` is not a weak stage, it is the absence of one.')
    return { instanceId, stage, granted: false, level, rule, falsifier, measured: record.sightings, reasons }
  }
  if (TRUST_STAGES.indexOf(stage) > TRUST_STAGES.indexOf(maxStage)) {
    reasons.push(`The peer\'s level \`${level}\` reaches at most \`${maxStage}\`, which is below the requested \`${stage}\`.`)
    return { instanceId, stage, granted: false, level, rule, falsifier, measured: record.sightings, reasons }
  }

  if (card === null) {
    reasons.push('No card was presented with this request, so the peer\'s declared privilege could not be evaluated. An unmeasured privilege is refused rather than assumed harmless.')
    return { instanceId, stage, granted: false, level, rule, falsifier, measured: record.sightings, reasons }
  }

  const axis = privilegeAxis(card.declaration)
  if (axis.unknownTokens.length > 0) {
    reasons.push(`The peer declared ${axis.unknownTokens.length} token(s) this instance cannot classify: ${axis.unknownTokens.map(t => JSON.stringify(t)).join(', ')}. Unclassifiable privilege is refused rather than defaulted.`)
    return { instanceId, stage, granted: false, level, rule, falsifier, measured: { count: axis.unknownTokens.length, of: axis.declaredTokenCount }, reasons }
  }

  if (stage === 'propose-patch' || stage === 'receive-patch') {
    if (axis.credentialsWithNetwork === 1) {
      reasons.push('The peer declares credentials TOGETHER WITH network access. That is the exfiltration shape, and it is held at `talk`: the owner can admit a peer to converse without handing it a patch channel. This is a REFUSAL of the stage, not a refusal of the peer.')
      return { instanceId, stage, granted: false, level, rule, falsifier, measured: { count: 1, of: 1 }, reasons }
    }
  }

  reasons.push(`Granted: the local record places the peer at \`${level}\` via \`${record.observedVia}\`, which reaches \`${maxStage}\` or above, and its declared privilege is classifiable and below the exfiltration rung.`)
  return { instanceId, stage, granted: true, level, rule, falsifier, measured: record.sightings, reasons }
}

/**
 * THE NEGATIVE CONTROL, AS A FUNCTION.
 *
 * A rule that cannot name the case it must refuse is not a rule. This returns
 * the canonical refused case **as a value**, so `verify/identity-attack.ts` can
 * assert that the built code actually refuses it rather than that the prose says
 * it would.
 *
 * The case: **a peer presenting a well-formed, correctly-hashing card, at
 * `propose-patch`, that the owner has NEVER admitted.** Nothing about the card is
 * malformed — its shape is valid, its hash is consistent — and it is still
 * refused, because validity is not authority.
 *
 * @returns the refused case, ready to be fed to `decideAdmission`.
 */
export function refusalFor(): { readonly card: PeerCard; readonly record: PeerRecord | null; readonly stage: TrustStage; readonly why: string } {
  return {
    card: {
      instanceId: 'attacker-instance',
      specVersion: 1,
      label: 'a perfectly well-formed stranger',
      intentFingerprint: null,
      declaration: { capabilities: [], redLines: [], declaresNothing: false },
      selfAsserted: true,
    },
    record: null,
    stage: 'propose-patch',
    why: 'Every byte of this card is well-formed and its hash is internally consistent. It is refused because the peer is absent from this instance\'s own trust store — validity is not authority, and a card is a request to be considered rather than a grant.',
  }
}

/** A second refusal, of the same peer the owner admitted — the privilege ceiling. */
export function exfiltrationRefusalFor(): { readonly card: PeerCard; readonly record: PeerRecord; readonly stage: TrustStage; readonly why: string } {
  return {
    card: {
      instanceId: 'admitted-but-greedy',
      specVersion: 1,
      label: 'an admitted peer that also reads secrets and talks to the network',
      intentFingerprint: null,
      declaration: { capabilities: ['credentials', 'network'], redLines: [], declaresNothing: false },
      selfAsserted: true,
    },
    record: {
      instanceId: 'admitted-but-greedy',
      level: 'vetted',
      observedVia: 'owner-admitted',
      firstSeenAt: null,
      lastSeenAt: null,
      sightings: { count: 3, of: 3 },
      reason: 'owner-admitted in the test fixture',
    },
    stage: 'receive-patch',
    why: 'The owner admitted this peer and its level reaches receive-patch, so the local-record half of the rule passes. It is still refused because it declares credentials together with network access: admission to converse is not admission to the exfiltration shape.',
  }
}

/** The message of a thrown value. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
