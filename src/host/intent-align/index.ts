/**
 * The original-intent gate — public surface.
 *
 * The one-sentence contract: a candidate is admitted to a meta-market window only if its signed intent
 * does not collide with a **stable**, **official**, or **existing meta** plugin. The verdict is
 * `pass` | `collide` | `not-measured`, and every zone carries the method that produced its score.
 *
 * READ THIS BEFORE TRUSTING A GREEN WINDOW. `pass` is a claim about a comparison that actually happened.
 * The gate returns `not-measured` — never `pass` — when the zone space could not be read, when the
 * reference populations loaded nothing, or when the candidate and the references were signed by
 * different methods. A surface that renders `not-measured` items as green has undone this module.
 *
 * THE CHECK CAN AND DOES FAIL. `KNOWN_COLLIDING_CANDIDATES` carries real catalog rows that this gate
 * refuses, each with the plugin it collides against and a citation that disambiguates the row. They are
 * here so no lane has to invent a failing item to demonstrate the window is a check.
 *
 * @module dsh-meta-market/host/intent-align
 */

import type {
  CandidateInput,
  CandidateSignature,
  CheckOptions,
  IntentCheck,
  ReferenceSignature,
  ZoneSpace,
} from './types.ts'
import { loadReferenceClasses } from './references.ts'
import { signCandidate } from './signature.ts'
import { decideOriginalIntent } from './gate.ts'
import { loadZoneSpace } from './zone-space.ts'

export {
  COLLISION_THRESHOLD,
  TOKEN_THRESHOLD,
  TOKEN_SEPARATION,
  GENERIC_ZONE_IDS,
  GENERIC_ZONE_EDGE,
  CANDIDATE_ZONE_COUNT,
  INTENT_ALIGN_VERSION,
} from './types.ts'
export type {
  CandidateInput,
  CandidateSignature,
  CatalogCitation,
  CheckOptions,
  Collision,
  IntentCheck,
  Measured,
  OriginalIntentVerdict,
  ReferenceClass,
  ReferenceOptions,
  ReferenceOutcome,
  ReferenceSignature,
  ReferenceSource,
  SignatureMethod,
  SigningContext,
  ZoneDefinition,
  ZoneScore,
  ZoneSpace,
  ZoneSpaceOptions,
  ZoneSpaceOutcome,
} from './types.ts'

export { loadZoneSpace, INTENT_MAP_ROUTE, INTENT_RECALL_ROUTE, DEFAULT_BASE_URL } from './zone-space.ts'
export { signCandidate, byScoreDescending } from './signature.ts'
export type { SignOptions } from './signature.ts'
export { loadReferenceClasses, META_PLUGIN_IDS, NAMED_STABLE_CANDIDATE, SELF_ID } from './references.ts'
export { decideOriginalIntent, thresholdFor, thresholdForZone, measureTextSimilarity } from './gate.ts'
export { tokenize, tokenScore, candidateTerms, zoneTerms } from './token.ts'

/**
 * One-shot convenience: load the space, load the references, sign, decide.
 *
 * For a window that renders dozens of items, use the three steps directly and pass the loaded
 * `space` and `references` in — this function re-reads both on every call, which is correct and slow.
 */
export async function checkOriginalIntent(
  input: CandidateInput,
  options: CheckOptions = {},
): Promise<IntentCheck> {
  const space = options.space ?? (await requireSpace(options))
  const references = options.references ?? (await requireReferences(space, options))
  const signature = await signCandidate(input, { space }, { baseUrl: options.baseUrl })
  return decideOriginalIntent(signature, references, { threshold: options.threshold })
}

/** Load a space or throw, so a caller of the one-shot path cannot proceed on a failed read. */
async function requireSpace(options: CheckOptions): Promise<ZoneSpace> {
  const outcome = await loadZoneSpace(options)
  if (!outcome.ok) {
    throw new Error(`the zone space could not be read: ${outcome.reason}`)
  }
  return outcome.space
}

/** Load references or throw, for the same reason. */
async function requireReferences(
  space: ZoneSpace,
  options: CheckOptions,
): Promise<readonly ReferenceSignature[]> {
  const outcome = await loadReferenceClasses(space, options)
  if (!outcome.ok) {
    throw new Error(`the reference populations could not be read: ${outcome.reason}`)
  }
  return outcome.references
}

/**
 * REAL candidates this gate refuses, with the catalog row each came from.
 *
 * VERIFIED (ran) by `verify/gate-driver.mjs` §3 at `TOKEN_THRESHOLD` **0.3407**. VERIFIED (read) against
 * the census `research/cache/plugins-2026-10-12.json` — **4,527 rows**, matched by `name` OR `npm` with
 * the row count recorded. Each intent text is the row's own `description.en`, quoted not paraphrased.
 *
 * `dsh-plugin-marketplace` appears TWICE in the census under two owners, so its id carries the owner: a
 * name-only citation identifies a set, and `Collision.id` is disambiguated for the same reason.
 */
export const KNOWN_COLLIDING_CANDIDATES: readonly CandidateInput[] = [
  {
    id: 'catalog:dsh-plugin-marketplace@PetCT',
    name: 'dsh-plugin-marketplace',
    intentText:
      'Browse, search, star-sort, favorite and one-click download community plugins from inside DeepSeek Harness settings.',
    catalog: { name: 'dsh-plugin-marketplace', npm: null, owner: 'PetCT', rowCount: 2 },
  },
  {
    id: 'catalog:dsh-plugin-marketplace@Scorp1o117',
    name: 'dsh-plugin-marketplace',
    intentText:
      'Browse and search GitHub dsh-plugin repositories from Web UI Settings, sort by stars, and install plugins through the DSH CLI.',
    catalog: {
      name: 'dsh-plugin-marketplace',
      npm: 'dsh-plugin-marketplace',
      owner: 'Scorp1o117',
      rowCount: 2,
    },
  },
]

/**
 * A REAL candidate this gate now ADMITS and SHOULD NOT — kept, named, and measured rather than deleted.
 *
 * `DSH-Plugins-Marketplace` (173★) is a genuine plugin marketplace and therefore a genuine duplicate of
 * stable `dsh-market`. It scores **0.2069** against `dsh-recall-console` and only **0.1525** against
 * `dsh-market`, which is BELOW the must-pass control's **0.2403** — so no single threshold can refuse
 * this row and admit that control. Moving the bar down to catch it would refuse the control and, behind
 * it, most of the installed population.
 *
 * It is kept here rather than dropped because a gate whose known misses are invisible cannot be audited,
 * and because this row is the exact evidence for the claim in `TOKEN_SEPARATION`: the token method cannot
 * separate "plugin marketplace" from "goods marketplace". A consumer must render these as `pass` and may
 * label them as known false negatives; it must not present them as aligned.
 */
export const KNOWN_FALSE_NEGATIVE_CANDIDATES: readonly CandidateInput[] = [
  {
    id: 'catalog:DSH-Plugins-Marketplace@bradeGithub',
    name: 'DSH-Plugins-Marketplace',
    intentText:
      'GitHub-topic-driven plugin & skill marketplace: a Settings page that browses the auto-collected registry (the whole dsh-plugin topic plus the skills index, CI-refreshed every 2 hours) with one-click install, type detection, install-script and host-shadow-dependency safety confirmations, env-key management, and the STANDARD.md recognition spec.',
    catalog: { name: 'DSH-Plugins-Marketplace', npm: null, owner: 'bradeGithub', rowCount: 1 },
  },
]

/**
 * REAL candidates this gate must ADMIT, kept beside the refusals so a run can show both directions.
 *
 * `ru-marketplace-mcp#dsh` is the important one: its name contains "marketplace", which is the token the
 * collision would fire on if the gate keyed on a single word. It is a Russian consumer-goods
 * marketplace, unrelated to plugin installation, so a gate that refused it would be refusing on a
 * string rather than on a purpose. Its presence here is the negative control for over-fitting.
 */
export const KNOWN_PASSING_CANDIDATES: readonly CandidateInput[] = [
  {
    id: 'catalog:ru-marketplace-mcp#dsh@Vladimir-Human',
    name: 'ru-marketplace-mcp#dsh',
    intentText:
      'Skills and optional MCP rows for eleven marketplaces: price comparison across Wildberries, Detsky Mir and Yandex Market, plus per-source search, product cards and reviews, including Ozon, Avito and AliExpress. The 14 skills load on install; both MCP rows stay disabled until RU_MARKETPLACE_MCP_DIR points at a local clone, which needs Python 3.12+ and uv.',
    catalog: {
      name: 'ru-marketplace-mcp#dsh',
      npm: null,
      owner: 'Vladimir-Human',
      rowCount: 1,
    },
  },
]

/** Sign every candidate in a list against one space. Kept here so a provider has one call, not a loop. */
export async function signMany(
  inputs: readonly CandidateInput[],
  space: ZoneSpace,
): Promise<readonly CandidateSignature[]> {
  const out: CandidateSignature[] = []
  for (const input of inputs) {
    out.push(await signCandidate(input, { space }))
  }
  return out
}
