/**
 * ============================================================================
 * dsh-meta-market — the frozen shared contract
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * The interface every lane codes against: the Host half serves it, the Client
 * half reads it, and the six sibling lanes (`identity`, `dialogue`,
 * `alignment`, `patch`, `safety`, `social`) import it rather than inventing
 * their own shapes. It is FROZEN at `task-1`; a change after that is a
 * coordinated edit, not a lane's private decision.
 *
 * TYPES ONLY. No runtime logic, no I/O, no `Date.now()`, no import except
 * `type`. Two consequences, both deliberate: this file typechecks standalone —
 * before `task-8` has written a `package.json`, a `tsconfig.json` or an entry
 * point — and it cannot drift from the behaviour it describes, because it
 * describes no behaviour. The only value exports are `const` literals.
 *
 * FOUR PROGRAM RULES ARE LOAD-BEARING IN THE TYPE SHAPES THEMSELVES. This is
 * the point of the file: a rule that lives only in prose is a rule that a lane
 * forgets. A rule that lives in a discriminant is a rule the compiler enforces.
 *
 * 1. AN ABSENCE IS A VALUE, AND IT IS NEVER ZERO.
 *    This program has published a wrong number by reading "not measured" as `0`
 *    four separate times. So `ThreeKind` carries `exists | plan | future`
 *    rather than a boolean, `Verdict` carries `unknown` as a distinct outcome
 *    rather than a falsy one, and every count is wrapped in `Measured` beside
 *    its denominator. A field whose value is not known is `null`, and the
 *    reason it is null travels with it.
 *
 * 2. THE THREE KINDS ARE NEVER FLATTENED.
 *    `exists` / `plan` / `future` (AGENTS.md). There is deliberately NO `done`,
 *    NO `complete`, NO `ready` and NO `status` token anywhere in this file — a
 *    single status token is exactly what destroys the distinction, and the
 *    schema that governs the plan corpus lists those tokens as forbidden
 *    (`plan/intent-field/schema.json`, `labelSets[threeKind].flattening`).
 *
 * 3. THE DECISION GRAMMAR IS CLOSED: `noul` | `choice` | `score`.
 *    Borrowed from `plan/intent-field/schema.json`, which is the authority.
 *    `noul` is an integer 0 or 1, `choice` is a string drawn from a REGISTERED
 *    label set, `score` is an integer inside a scale the proposition declares.
 *    A free string, an array and a nested object are each rejected by the Laya
 *    path, so no payload below carries one. `DecisionValue` states the three
 *    admissible shapes and nothing wider.
 *
 * 4. THE TWO SYSTEM-1 BACKENDS DISAGREE ABOUT `confidence`.
 *    The torch lane computes normalized entropy; the `llama.cpp` lane computes
 *    the TypeSafe formula (`AGENTS.md`, from `server-decision.cpp:1094`). A
 *    threshold fitted on one lane is wrong on the other. So every confidence
 *    here is wrapped in `Confidence`, which CANNOT be constructed without
 *    naming the backend that produced it — the disagreement is made
 *    unrepresentable rather than merely documented.
 *
 * WHAT THIS FILE IS NOT, STATED SO IT IS NOT OVER-READ
 *
 *   - **Not the Web4 definition.** That is one paragraph of `CHARTER.md`, and
 *     it is an OPERATIVE definition for this system: an in-house decision, not
 *     a claim that the industry agrees. See `WEB4` below for the pointer.
 *   - **Not evidence that anything works.** Every interface here is `plan`
 *     kind at freeze time — these are shapes this build will produce, not
 *     shapes anything produces today. The one `exists` component named below
 *     (`intent-map`) is a SEPARATE, LIVE plugin that this one only reads.
 *   - **Not a runtime validation layer.** `noul` is typed `0 | 1`, but a
 *     value that arrives over the wire is `unknown` until a lane validates
 *     it. Types constrain the code we write, not the bytes an untrusted peer
 *     sends; `task-6` (safety) owns that boundary, and it must not assume this
 *     file did its job for it.
 *
 * @module dsh-meta-market/shared/protocol
 */

/** The route prefix this plugin owns, WITHOUT a leading slash (for the Client). */
export const ROUTE_PREFIX = 'meta-market/api'

/** The route prefix WITH its leading slash (the web server matches absolute paths). */
export const ROUTE_PATH = `/${ROUTE_PREFIX}`

/**
 * The protocol version carried by every envelope.
 *
 * The OWNER's rule, not this plugin's: the owner asked for a design in which two
 * or more systems (separate installs of the harness) can negotiate safely and
 * converge on shared intent without either needing the other's implementation.
 * `SPEC_VERSION` is bumped when a shape changes incompatibly; STEP_VERSION is
 * bumped only when the ORDER of steps inside the negotiation changes, because
 * already-open dialogues care about that step order and not about the shape.
 * Both are frozen by `task-1` and are read here, not re-derived.
 */
export const SPEC_VERSION = 1

/** See SPEC_VERSION. */
export const STEP_VERSION = 1

/**
 * Pointers to the two frozen references this build inherits.
 *
 * Recorded as data rather than left in prose so a reader can find them from the
 * code alone, and so nothing can be amended quietly.
 */
export const REFERENCE = {
  /** The decision grammar this file borrows. `plan/` is owned by the Lead, not by a lane. */
  decisionGrammar: 'plan/intent-field/schema.json',
  /** The recon that established Web4 is undefined in-house. Decision, not a document. */
  web4Ruling: 'decision-log:D-0017',
  /** The owner's authorization to build this plugin at all, and only this one. */
  buildAuthorization: 'decision-log:D-0053',
} as const

/**
 * The three kinds of thing, which must never be flattened.
 *
 * A field carrying a fact about a stage or a target state says which of the
 * three it is. This is not decoration: the program's most-published defect is
 * rounding `plan` up to `exists`, and a union that requires the author to pick
 * one is the only form of that rule a compiler can enforce.
 */
export type ThreeKind = 'exists' | 'plan' | 'future'

/** The verification vocabulary. `not-measured` is a reading state, not a verdict. */
export type Verification = 'verified-ran' | 'verified-read' | 'not-measured'

/**
 * The claim that a count is known — and the reason to distrust it.
 *
 * Every count in this protocol is wrapped rather than bare, because a bare
 * `number` cannot distinguish "measured, and it is 0" from "never measured",
 * and this program has paid for that coercion more than once. A `Measured` is
 * never constructed without its denominator.
 */
export interface Measured {
  /** The numerator. Counted, not computed from the denominator. */
  readonly count: number
  /** The denominator, counted over the same population at the same moment. */
  readonly of: number
}

/**
 * A reading that may not exist, together with why it does not.
 *
 * `value: null` with a `reason` is the honest form; `value: 0` with no reason
 * is the defect this type exists to prevent. The `reason` is required in
 * practice whenever `value` is null and is a sentence a reader can act on.
 */
export interface Maybe<T> {
  readonly value: T | null
  /** Why `value` is absent. `null` is only acceptable when `value` is present. */
  readonly reason: string | null
}

/**
 * A confidence, bound to the backend that produced it.
 *
 * THE BACKEND FIELD IS NOT OPTIONAL AND NOT NULLABLE, and that is the whole
 * design. The torch lane and the `llama.cpp` lane compute different quantities
 * under the same name, so a bare `number` labelled "confidence" is a number
 * whose meaning depends on where it came from — and a threshold fitted on one
 * is wrong on the other. Requiring the producer's identity at construction
 * makes the comparison across backends impossible to write by accident.
 */
export interface Confidence {
  /** In [0, 1]. */
  readonly value: number
  /** Which lane produced it. Cross-lane threshold reuse is forbidden. */
  readonly backend: 'laya-torch' | 'llama-cpp' | 'none'
  /**
   * The backend's own account of the model it served, read from its response.
   * `null` when the endpoint did not report one — a missing reading, which is
   * NOT the same as a model named `null`.
   */
  readonly model: string | null
  /**
   * How the value was obtained. `reported` means a peer or a config asserted
   * it; `computed` means this instance derived it. A `reported` confidence is
   * testimony and must never gate anything on its own.
   */
  readonly provenance: 'reported' | 'computed' | 'not-measured'
}

/**
 * The closed decision grammar: `noul` | `choice` | `score`.
 *
 * Each member states a value shape the Laya path ACCEPTS. Anything wider — a
 * free string with no declared label set, an array, a nested object — is
 * rejected downstream, so it is rejected here as well by not being
 * representable. `choice` carries its own `labelSet` because the registry is
 * CLOSED: an undeclared label set is an undeclared differentiation, which is
 * the defect the schema's `R9` refusal exists to catch.
 */
export type DecisionValue =
  | { readonly decision: 'noul'; readonly value: 0 | 1 }
  | { readonly decision: 'choice'; readonly value: string; readonly labelSet: ChoiceLabelSet }
  | { readonly decision: 'score'; readonly value: number; readonly scaleMax: number }

/**
 * The label sets a `choice` may draw on — the program's registered sets.
 *
 * Closed on purpose: adding a label set is a one-line, deliberate extension,
 * never a lane reaching for a string its own payload needed that day.
 */
export type ChoiceLabelSet = 'threeKind' | 'verificationState' | 'mountState' | 'alignVerdict'

/**
 * The identity of one harness instance — this system, or a peer's.
 *
 * TWO DISTINCT DOCUMENTS share this shape and must never be confused: the card
 * this instance publishes about ITSELF, and the card a peer presents about
 * itself. The peer's card is UNTRUSTED INPUT until `task-2` has admitted it;
 * nothing in the type system can make that distinction, so the field
 * `selfAsserted` states it explicitly and `task-2` owns the admission rule.
 */
export interface PeerCard {
  /** The instance's own identifier. Stable across restarts. */
  readonly instanceId: string
  /** The protocol version the peer speaks, so a mismatch can be refused, not guessed at. */
  readonly specVersion: number
  /** What the peer says it is. Human-facing; never a basis for trust on its own. */
  readonly label: string
  /**
   * A fingerprint of the peer's intent vector, NOT the vector itself.
   * Intent zones reveal the user's interests; the raw vector is sensitive and
   * is not exchanged. See `IntentVectorReference` for the same rule at the
   * alignment layer.
   */
  readonly intentFingerprint: string | null
  /** What the peer declares it may do. Self-declared, therefore catchable, per `task-2`. */
  readonly declaration: CapabilityDeclaration
  /** Always true for a card received over a dialogue. A local card sets it false. */
  readonly selfAsserted: boolean
}

/**
 * A peer's declared capabilities and red lines — two fields that DISAGREE.
 *
 * **EVERY COUNT IN THIS PARAGRAPH CARRIES ITS POPULATION, because the first
 * version of it did not and that was a denominator defect (decision `D-0054`).**
 * The original pair read *"16 plugins declare credentials while 14 are
 * red-lined"*, which is true only of the **688-entry in-scope sample** — but it
 * sat immediately beside a catalog-scale figure, so a reader took it as catalog
 * scale. **Over the whole 4,527-row catalog** (census `2026-10-16T16:54:22Z`,
 * `research/cache/plugins-2026-10-12.json`) the figures are **488 of 4,527**
 * declaring a `credentials` capability, **386 of 4,527** carrying the
 * reads-credentials-AND-network red line, and **374** declaring credentials and
 * network together. **A privilege filter operates on the CATALOG population, so
 * 488/386 are the figures to filter on.** The original pair is reproduced above
 * with its own denominator rather than deleted: a corrected figure whose
 * original is invisible cannot be audited, and this program has corrected a
 * correction in place before for exactly that reason.
 *
 * The catalog's two fields are independently derived and are not nested, so a
 * filter that reads one of them is wrong: this shape carries BOTH and a consumer
 * is expected to take the UNION. **The union is load-bearing rather than merely
 * conservative, and the reason is measured: 23 catalog rows carry the
 * creds+network red line while declaring NO `credentials` token at all, so a
 * filter reading `capabilities` alone does not undercount — it silently ADMITS
 * those 23.** `declaresNothing` is separate from an empty array because 942
 * catalog plugins declare no capabilities at all — an absent declaration and an
 * empty one are different claims about a peer.
 *
 * THE STRING ARRAYS HERE ARE TRANSPORT, NOT DECISION INPUT, and the boundary is
 * deliberate rather than accidental. A token list is a `choice` over a declared
 * vocabulary, so a consumer reduces it to closed decisions before anything
 * reaches the Laya path: the OBSERVABLE the model is asked about is a
 * `noul` — "does this peer declare credentials together with network access?" —
 * or a `score` over a declared privilege ladder, never the free token array.
 * Putting a raw `string[]` in a request body is the same mistake as reading an
 * absent field as zero: it is a shape the path cannot express, so a lane that
 * sent one would be answered by a refusal it did not intend to ask for.
 */
export interface CapabilityDeclaration {
  /** Capability tokens the peer says it holds. */
  readonly capabilities: readonly string[]
  /** Red lines the peer says it will not cross. NOT the complement of `capabilities`. */
  readonly redLines: readonly string[]
  /**
   * Whether the peer made no declaration at all. `true` here with empty arrays
   * is a peer that said nothing; `false` with empty arrays is a peer that said
   * it can do nothing. They must not be read as one fact.
   */
  readonly declaresNothing: boolean
}

/**
 * A reference to an intent vector — a POINTER, never the vector.
 *
 * The system this build joins already exists and is live: `dsh-intent-map`
 * serves `GET /intent-map/api/map` with 24 zones behind a 1024-dimension
 * embedding. That plugin is `exists`; this one only READS it and never writes
 * its index. Two rules travel with every reference:
 *
 *   - **The identity travels with the vector.** A vector built by one model
 *     cannot be searched by another, so a consumer that finds a mismatched
 *     `identity` must REFUSE rather than score across it. The `dsh-intent-map`
 *     precedent is refusal, and this file reuses that shape rather than
 *     inventing a second one.
 *   - **`fresh` does not mean correct.** `dsh-intent-map` reports
 *     `freshness: "fresh"` when its vectors match the zone DEFINITIONS; its
 *     indexed corpus is the staged 4,527-row census while the live catalog was
 *     measured at 4,765 rows. A `fresh` freshness over a stale census is the
 *     programme's standard trap in a new costume, so `censusAt` and
 *     `catalogCount` travel here too.
 */
export interface IntentVectorReference {
  /** The index this vector belongs to, named so a mismatch can be stated. */
  readonly indexId: string
  /** The zone ids this vector claims, drawn from the index's own set. */
  readonly zoneIds: readonly string[]
  /** The embedding identity the vector was built under. Read LIVE at query time. */
  readonly identity: EmbeddingIdentity
  /** Whether the index reported itself fresh, and what fresh was measured against. */
  readonly freshness: 'fresh' | 'stale' | 'partial' | 'unbuilt' | 'unreadable' | 'mismatched'
  /** When the index was read for this reference. Distinct from when it was built. */
  readonly censusAt: string | null
}

/**
 * The embedding identity — the field that makes a vector unusable if it drifts.
 *
 * `dim` and `model` are both required because either alone is insufficient: two
 * different models can share a width, and the same model can be served at two
 * widths. `modelSource` records HOW the name was learned, following the sibling
 * plugin's rule — a name echoed from our own config is a weaker fact than a
 * name the serving process reported about the weights it loaded.
 */
export interface EmbeddingIdentity {
  readonly model: string | null
  readonly dim: number | null
  /** `server-self-report` is authoritative; `declared-config` is not. */
  readonly modelSource: 'server-self-report' | 'declared-config' | null
  /** The endpoint that answered, named so a reader can re-probe it. */
  readonly endpoint: string | null
}

/**
 * One message in a dialogue between two instances.
 *
 * THE ENVELOPE IS THE SAFETY BOUNDARY, not a wrapper around one. Three bounds
 * are structural rather than policy: `expiresAt` makes a replayed message
 * distinguishable from a live one, `step` against `maxSteps` makes termination
 * a property of the message rather than of the receiver's patience, and
 * `abstain` is a first-class outcome so a dialogue that cannot refuse is not
 * expressible. `task-3` owns the cycle; this file owns only the carrier.
 */
export interface DialogueEnvelope {
  /** Bumped on any incompatible change; a receiver refuses an unknown version. */
  readonly specVersion: number
  readonly stepVersion: number
  /** Unique per message. The idempotence key — the SAME envelope twice must not apply twice. */
  readonly messageId: string
  /** The dialogue this message belongs to, so out-of-order arrival is detectable. */
  readonly dialogueId: string
  readonly from: string
  readonly to: string
  /** The step within the dialogue, counted from 0. */
  readonly step: number
  /** The dialogue's step budget. Bounds the work one peer can impose on another. */
  readonly maxSteps: number
  /** When this message stops being admissible. Required: an envelope with no expiry is replayable forever. */
  readonly expiresAt: string
  readonly intent: IntentVectorReference | null
  readonly offer: MetaPackage | null
  /**
   * The dialogue's own accept/refuse/abstain, as a closed decision value.
   * `abstain` is reachable at every step and costs the abstainer nothing.
   */
  readonly decision: DecisionValue | null
  /** The confidence attached to `decision`, bound to its backend. `null` when none was taken. */
  readonly confidence: Confidence | null
}

/**
 * A meta-package: something a peer proposes to add to, or change in, the market.
 *
 * NOT an install spec and NOT executable. It is a description plus the evidence
 * for it, and the receiving side must be able to VERIFY it without running it.
 * `contentHash` is what makes that possible — and what makes a payload that
 * disagrees with its declared hash detectable, which `task-5` must refuse.
 */
export interface MetaPackage {
  readonly packageId: string
  /** The protocol version this package was authored against. */
  readonly specVersion: number
  /** The intent zones this package claims to occupy. Empty is a reachable and meaningful outcome. */
  readonly zones: readonly string[]
  /** What the package asserts, as a closed decision value. Never a free-form string. */
  readonly claim: DecisionValue
  /** `exists` when the package names something already in the catalog; `plan` or `future` otherwise. */
  readonly kind: ThreeKind
  /** The catalog row this package refers to, when it refers to one. `null` when it does not. */
  readonly catalogRef: CatalogReference | null
  /** The privilege axis. Carried on the package, not looked up later: red lines do not travel by reference. */
  readonly declaration: CapabilityDeclaration
  /** The hash of the canonical payload. What a receiver checks BEFORE applying anything. */
  readonly contentHash: string
  /** Where the evidence for `claim` lives. A pointer, not a copy. */
  readonly evidence: readonly EvidencePointer[]
}

/**
 * A pointer into the market catalog, disambiguated by MORE than its name.
 *
 * A catalog `name` is not a unique key: 4,527 rows carry 4,226 distinct names,
 * and `dsh-cost-meter` alone exists three times at 0★, 391★ and 1★. A citation
 * that carries only a name identifies a set, not a row, so `owner` and `npm`
 * are carried here to make the match unambiguous — and `rowCount` records how
 * many rows the citation matched, because a lookup that silently returned the
 * first of three is this program's recorded way of reading the wrong plugin.
 */
export interface CatalogReference {
  readonly name: string
  readonly npm: string | null
  readonly owner: string | null
  /** How many catalog rows matched this citation. `> 1` means the citation is ambiguous. */
  readonly rowCount: number
  /** The census the match was taken over, so two citations can be compared. */
  readonly censusAt: string | null
}

/**
 * A pointer to the evidence for a claim.
 *
 * Deliberately a pointer: this program's rule is that facts have exactly one
 * home, and a copied fact is a fact that can disagree with its original.
 */
export interface EvidencePointer {
  /** A workspace-relative path, a route, a command, or a URL. */
  readonly source: string
  readonly verification: Verification
  /** WHAT this evidence establishes, in one sentence. A bare pointer proves nothing. */
  readonly claim: string
}

/**
 * A proposal to change the market — reviewable, and reversible or refused.
 *
 * The three fields that make it reviewable are `baseHash` (what the proposer
 * believed it was changing), `contentHash` (what it is actually sending) and
 * `reverses` (how to undo it). A proposal with no `reverses` is not admissible
 * for application; saying so in the type makes "we forgot the undo path"
 * a compile error rather than a production surprise.
 */
export interface PatchProposal {
  readonly proposalId: string
  /** The peer that proposed it. Provenance is required: an unattributed patch is not admissible. */
  readonly from: string
  /** The package this patch changes, and the hash the proposer believed it had. */
  readonly targetPackageId: string
  readonly baseHash: string
  /** The hash of the payload being sent. A mismatch with the payload is a refusal. */
  readonly contentHash: string
  /** The zones this patch would move the package into. */
  readonly zones: readonly string[]
  /** How to undo this patch. Required — an irreversible patch must not be applied. */
  readonly reverses: string
  /**
   * Whether applying this requires a human. `true` for anything touching the
   * declared-credentials-plus-network population: 386 of 4,527 catalog rows
   * carry exactly that red line, and those must never be automatic.
   */
  readonly requiresHuman: boolean
  /** Where the patch sits in the review path. Nothing lands in the live market directly. */
  readonly staging: PatchStaging
}

/**
 * Where a patch is in the review path.
 *
 * Five states, and `refused` and `withdrawn` are distinct because a patch
 * rejected on its merits and a patch retracted by its author are different
 * facts about the proposer. There is deliberately no `applied-and-gone`:
 * `applied` retains its `reverses` path for as long as the patch is recorded.
 */
export type PatchStaging =
  | 'received'
  | 'verifying'
  | 'quarantined'
  | 'staged'
  | 'applied'
  | 'refused'
  | 'withdrawn'

/**
 * The outcome of an operation, as a CLOSED set — never a boolean.
 *
 * `unknown` is the outcome that matters most and the one a boolean cannot
 * carry. A boolean `ok: false` conflates "we checked, and it is bad" with "we
 * could not check", and those demand opposite responses: the first refuses, the
 * second must not be read as a refusal of the thing measured — it is a refusal
 * to act on a missing reading. `task-4` and `task-5` both depend on this
 * distinction and neither may collapse it into `ok`.
 */
export type Verdict = 'pass' | 'fail' | 'refused' | 'abstained' | 'unknown'

/**
 * A verdict together with the evidence for it and the rule that produced it.
 *
 * A verdict with no `rule` is an opinion. `falsifier` is required and states
 * the single observation that would make this verdict wrong — the same rule the
 * plan corpus enforces on its own rows, carried here so a verdict cannot be
 * recorded as unfalsifiable.
 */
export interface VerdictRecord {
  readonly verdict: Verdict
  /** The rule or threshold that produced this verdict, cited rather than implied. */
  readonly rule: string
  /** The single observation that would make this verdict wrong. Required. */
  readonly falsifier: string
  /** What was measured, if anything. `null` value with a reason when nothing was. */
  readonly measured: Maybe<number>
  /** When the reading was taken. `null` when no reading was taken. */
  readonly censusAt: string | null
  readonly evidence: readonly EvidencePointer[]
}

/**
 * The discipline that travels with every payload.
 *
 * Copied in form from the sibling plugins and stated in the imperative, because
 * it is read by whoever debugs the next wrong number rather than by a parser.
 * It is a value so that a route can emit it and a reader who cannot import this
 * module still receives the rules it must obey.
 */
export const ABSENCE_DISCIPLINE: readonly string[] = [
  'A field that was not measured is null with a reason — never 0, never false, never an empty object.',
  'Every count carries its population: a numerator AND a denominator AND a census time.',
  'A 0 on both sides of a comparison is an INSTRUMENT FAILURE, not a pass: assert that both sides answered.',
  'An absent optional field is not a zero. Test `key in object` before reading a value; never `|| 0`, `?? 0` or a truthy test.',
  'exists / plan / future are three kinds and are never flattened into one status token.',
  'A confidence carries the backend that produced it; a threshold fitted on one lane is wrong on the other.',
  'An edge that folds onto a component that does not exist is not folded onto the current architecture — say so plainly.',
]

/**
 * The operative definition of Web4, in one sentence, for THIS system.
 *
 * Recorded here as well as in `CHARTER.md` so a consumer that imports only this
 * module still receives it — and recorded with its NON-CLAIMS, because a
 * definition that arrives without them can be read as claiming far more than it
 * does.
 *
 * The basis is decision `D-0017` and the recon it cites: the term has ZERO
 * prior in-house usage (0 of 4,296 pre-existing workspace files), and outside
 * this workspace it is a contested, marketing-adjacent term with several
 * incompatible definitions and no standards body behind it.
 *
 * It does NOT claim that the industry agrees, that it is standardised, that any
 * existing product implements it, or that it is what the owner's outside
 * sources mean. It is an OPERATIVE definition: a decision about what the word
 * names inside this build, so that nine lanes do not each invent one.
 */
export const WEB4 = {
  definition: 'Web4 is the inter-system layer in which two or more independently operated harness instances recognise each other as peers, conduct bounded and refusable dialogues, align their meta-packages to a shared intent map, and exchange those packages as reviewable, reversible patches — with no central arbiter and no instance holding authority over another\'s intent.',
  kind: 'plan' as const,
  basis: 'decision-log:D-0017 (Web4 undefined in-house: 0 of 4,296 pre-existing workspace files use the term; contested and non-standardised outside)',
  operative: true,
  claimsIndustryConsensus: false,
  nonClaims: [
    'Does NOT claim the term is standardised, or that any standards body defines it.',
    'Does NOT claim the industry agrees; outside this workspace the term is contested and marketing-adjacent.',
    'Does NOT adopt any of the outside definitions recorded in the recon.',
    'Does NOT claim that any part of this system is built: the definition is `plan` kind at freeze time.',
  ],
} as const
