/**
 * Signing a candidate: one intent text becomes a score in every zone of the real space.
 *
 * THE METHOD IS CHOSEN BY MEASUREMENT, AND IT IS RECORDED PER ZONE. The embedding method is used only
 * when the substrate reported that it CAN embed (`space.embedding.available`); otherwise every zone is
 * labelled `method: "token"` and carries the substrate's own reason in `methodReason`. There is no path
 * where a token score is presented as an embedding similarity, and no path where a missing score becomes
 * a zero.
 *
 * THE EMBEDDING PATH NEEDS THE SUBSTRATE TO SCORE A TEXT THAT IS NOT THE ZONE DEFINITIONS. That is what
 * `GET /intent-map/api/recall?q=…&top=24` does: it embeds the query and returns the cosine against each
 * indexed zone. So the two methods read two different routes from the same plugin, and neither writes to
 * it — this plugin only ever issues GETs against a live surface on the owner's own session.
 *
 * @module dsh-meta-market/host/intent-align/signature
 */

import type {
  CandidateInput,
  CandidateSignature,
  SignatureMethod,
  SigningContext,
  ZoneScore,
} from './types.ts'
import { INTENT_RECALL_ROUTE } from './zone-space.ts'
import { DEFAULT_BASE_URL } from './zone-space.ts'
import { candidateTerms, tokenScore, zoneTerms } from './token.ts'

/** The subset of the recall payload the embedding path reads. */
interface RecallPayload {
  readonly embedded?: unknown
  readonly reason?: unknown
  readonly hits?: readonly {
    readonly zoneId?: unknown
    readonly similarity?: unknown
  }[]
}

/** Options for one signing run. */
export interface SignOptions {
  /** Base URL of the live harness. */
  readonly baseUrl?: string
  readonly timeoutMs?: number
  /**
   * TEST-ONLY: embedding scores to use instead of asking the substrate.
   *
   * Present so the embedding branch can be exercised while the model is down — and named so a reader
   * cannot mistake a run that used it for a measurement. The driver prints which branch it took.
   */
  readonly injectedEmbeddingScores?: Readonly<Record<string, number>>
}

/**
 * Sign one candidate.
 *
 * Every zone in the space appears in the result, in descending score order, with `null` and a `reason`
 * for any zone that could not be scored. A result with no numeric score anywhere sets `measured: false`
 * rather than returning an all-zero signature that would look like a plugin about nothing.
 */
export async function signCandidate(
  input: CandidateInput,
  context: SigningContext,
  options: SignOptions = {},
): Promise<CandidateSignature> {
  const measuredAt = new Date().toISOString()
  const space = context.space
  const intentText = typeof input.intentText === 'string' ? input.intentText : ''

  if (options.injectedEmbeddingScores !== undefined) {
    const scores = options.injectedEmbeddingScores
    const zones: ZoneScore[] = space.zones.map((zone) => {
      const value = scores[zone.id]
      return value === undefined
        ? {
            zone: zone.id,
            score: null,
            method: 'embedding' as SignatureMethod,
            reason: 'the injected embedding fixture carried no score for this zone',
          }
        : { zone: zone.id, score: value, method: 'embedding' as SignatureMethod, reason: null }
    })
    return {
      id: input.id,
      name: input.name ?? null,
      intentText,
      zones: [...zones].sort(byScoreDescending),
      method: 'embedding',
      methodReason: 'TEST FIXTURE: injected embedding scores, NOT a measurement',
      measured: zones.some((z) => z.score !== null),
      catalog: input.catalog ?? null,
      measuredAt,
    }
  }

  if (intentText.trim() === '') {
    return {
      id: input.id,
      name: input.name ?? null,
      intentText,
      zones: space.zones.map((zone) => ({
        zone: zone.id,
        score: null,
        method: 'token' as SignatureMethod,
        reason: 'the candidate carried no intent text, so no zone could be scored',
      })),
      method: 'token',
      methodReason: 'the candidate carried no intent text',
      measured: false,
      catalog: input.catalog ?? null,
      measuredAt,
    }
  }

  if (space.embedding.available) {
    const embedded = await scoreWithSubstrate(input, intentText, space, options)
    if (embedded !== null) return embedded
    // The substrate said it could embed and then did not. That falls through to the token method with
    // the failure as the reason, rather than returning a signature full of nulls.
  }

  const reason =
    space.embedding.reason ??
    'the embedding method was not offered by the substrate, so the token method was used'
  const terms = candidateTerms(intentText)
  const zones: ZoneScore[] = space.zones.map((zone) => {
    const scored = tokenScore(terms, zoneTerms(zone.id, zone.definition))
    return {
      zone: zone.id,
      score: scored.value,
      method: 'token' as SignatureMethod,
      reason: scored.reason,
    }
  })
  return {
    id: input.id,
    name: input.name ?? null,
    intentText,
    zones: [...zones].sort(byScoreDescending),
    method: 'token',
    methodReason: reason,
    measured: zones.some((z) => z.score !== null),
    catalog: input.catalog ?? null,
    measuredAt,
  }
}

/** Descending by score, with unscored zones last. A total order, so two runs sort identically. */
export function byScoreDescending(a: ZoneScore, b: ZoneScore): number {
  const left = a.score ?? Number.NEGATIVE_INFINITY
  const right = b.score ?? Number.NEGATIVE_INFINITY
  if (right !== left) return right - left
  return a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0
}

/**
 * Score via the substrate, or return `null` when it did not answer with scores.
 *
 * The `null` return is what distinguishes "the substrate embedded and scored" from "the substrate was
 * asked and did not", and the caller handles the second by falling through to the token method with a
 * stated reason.
 */
async function scoreWithSubstrate(
  input: CandidateInput,
  intentText: string,
  space: SigningContext['space'],
  options: SignOptions,
): Promise<CandidateSignature | null> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const timeoutMs = options.timeoutMs ?? 8000
  const route = `${INTENT_RECALL_ROUTE}?q=${encodeURIComponent(intentText)}&top=${String(space.zones.length)}`
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  let payload: RecallPayload
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${route}`, {
      signal: controller.signal,
    })
    if (!response.ok) return null
    payload = (await response.json()) as RecallPayload
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  if (payload.embedded !== true || !Array.isArray(payload.hits)) return null

  const scores = new Map<string, number>()
  for (const hit of payload.hits) {
    if (typeof hit.zoneId === 'string' && typeof hit.similarity === 'number') {
      scores.set(hit.zoneId, hit.similarity)
    }
  }
  const zones: ZoneScore[] = space.zones.map((zone) => {
    const value = scores.get(zone.id)
    return value === undefined
      ? {
          zone: zone.id,
          score: null,
          method: 'embedding' as SignatureMethod,
          reason: 'the substrate returned no similarity for this zone',
        }
      : { zone: zone.id, score: value, method: 'embedding' as SignatureMethod, reason: null }
  })
  return {
    id: input.id,
    name: input.name ?? null,
    intentText,
    zones: [...zones].sort(byScoreDescending),
    method: 'embedding',
    methodReason: null,
    measured: zones.some((z) => z.score !== null),
    measuredAt: new Date().toISOString(),
  }
}
