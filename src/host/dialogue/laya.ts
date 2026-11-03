/**
 * ============================================================================
 * dialogue/laya — the System-1 decision client, and its degradation
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * The one place this lane talks to a decision backend. It answers a single
 * question — "may this offer be acted on?" — as a typed `noul`, and it is
 * written so that a DEAD BACKEND CANNOT PRODUCE A YES.
 *
 * THE SHAPE THAT MATTERS IS THE UNAVAILABLE BRANCH
 *
 * `ModelDecision` is a union whose unavailable member has NO `accepted` field at
 * all. A caller cannot read a decision out of a dead backend, because there is
 * no field to read — the compiler requires it to handle the refusal branch
 * before it can reach an answer. Contrast a `{ ok: boolean; accepted: boolean }`
 * shape, where a dead backend returns `{ ok: false, accepted: false }` and a
 * careless reader takes `accepted` and records a REFUSAL THAT NOTHING DECIDED.
 * That is this program's "an absence of a reading is not an absence of a value"
 * rule, enforced by a discriminant rather than by a comment.
 *
 * THE TWO BACKENDS DISAGREE, AND THIS FILE NAMES WHICH ONE ANSWERED
 *
 * The torch lane and the `llama.cpp` lane compute different quantities under the
 * name `confidence`, and `llama.cpp` omits `answer_confidence` entirely. The
 * lane is therefore DERIVED FROM THE RESPONSE (`routing` is present only on
 * torch) rather than configured, so a misconfiguration cannot label a reading
 * with the wrong lane — and naming the wrong lane is how a threshold fitted on
 * one gets applied to the other.
 *
 * THIS FILE PERFORMS NO I/O OF ITS OWN. The transport is injected, so the
 * harness can drive a `deadTransport` and exercise the unreachable path
 * deterministically rather than waiting for the real endpoint to be down.
 */

import type { Confidence } from '../../shared/protocol.ts'
import { type AnswerConfidence, asAnswerConfidence, readConfidence } from './confidence.ts'
import type { DecisionProvenance } from './types.ts'

/** The endpoint the Kev decision backend serves on by default (8011; the legacy Laya runner on 8008 is the rollback). */
export const DEFAULT_LAYA_ENDPOINT = 'http://127.0.0.1:8011'

/**
 * The endpoint the skill records a DIFFERENT service holding.
 *
 * It is kept named rather than deleted because the skill's own finding is that
 * this port answers a plausible body while returning `404` on the batch route —
 * so `not-a-decision-shape` below is a case with a recorded cause, not a
 * hypothetical.
 */
export const ALTERNATE_LAYA_ENDPOINT = 'http://127.0.0.1:8080'

/** The route the decision is posted to. */
export const DECISION_ROUTE = '/v1/systemone'

/**
 * Why no decision could be read. Every member is a distinct fact, and none of
 * them is "the model said no".
 */
export type UnavailableReason =
  /** Nothing answered at the endpoint. */
  | 'unreachable'
  /** Something answered, and it is not a decision response. */
  | 'not-a-decision-shape'
  /** Something answered, too late. */
  | 'timeout'
  /** Something answered with an HTTP error status. */
  | 'http-error'
  /** A well-formed decision response arrived with no usable probability in it. */
  | 'no-reading'

/**
 * What the probe saw, recorded whether or not a decision was reached.
 *
 * `httpStatus: number | null` is `null` for "no HTTP status exists" — a transport
 * failure — and NOT `0`, because `0` is not a status a server can send and using
 * it for absence is this program's recorded coercion.
 */
export interface BackendReading {
  readonly endpoint: string
  readonly ok: boolean
  readonly httpStatus: number | null
  readonly reason: UnavailableReason | null
  readonly probedAt: string
  readonly detail: string
  readonly backend: Confidence['backend']
  readonly model: string | null
}

/** An HTTP response, structurally typed so this lane imports no host package. */
export interface HttpResponse {
  readonly status: number
  readonly body: string
}

/** A transport. Injected, so the harness can drive a dead one deterministically. */
export interface Transport {
  readonly post: (url: string, body: string, timeoutMs: number) => Promise<HttpResponse>
}

/** The transport that actually reaches the network. */
export const globalTransport: Transport = {
  post: async (url, body, timeoutMs) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      })
      return { status: response.status, body: await response.text() }
    } finally {
      clearTimeout(timer)
    }
  },
}

/** What `parseDecisionBody` found: a decision shape, or why it is not one. */
export type ParsedBody =
  | { readonly shape: 'decision'; readonly record: Record<string, unknown> }
  | { readonly shape: 'not-a-decision'; readonly reason: UnavailableReason; readonly detail: string }

/**
 * Decide whether a response body is a decision shape at all.
 *
 * The test is the presence of an `answers` OBJECT, which both backends emit and
 * which a different service on the same port does not. Everything downstream
 * reads from inside it.
 *
 * @param body - the raw response body.
 * @returns the parsed record, or the reason this is not a decision response.
 */
export function parseDecisionBody(body: string): ParsedBody {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { shape: 'not-a-decision', reason: 'not-a-decision-shape', detail: 'the body is not JSON, so it is not a decision response' }
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { shape: 'not-a-decision', reason: 'not-a-decision-shape', detail: 'the body is not a JSON object' }
  }
  const holder = parsed as Record<string, unknown>
  const answers = holder['answers']
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    return {
      shape: 'not-a-decision',
      reason: 'not-a-decision-shape',
      detail: 'the body carries no `answers` object, so it is another service answering on this port rather than a decision response',
    }
  }
  return { shape: 'decision', record: answers as Record<string, unknown> }
}

/**
 * Which lane answered, derived from the response rather than configured.
 *
 * `routing` is present only on the torch lane. Reading it from the response means
 * a misconfigured endpoint cannot label a reading with the wrong lane — and a
 * reading labelled with the wrong lane is a reading whose threshold means nothing.
 *
 * @param envelope - the outer response object.
 * @returns the lane that produced this reading.
 */
export function laneOf(envelope: unknown): Confidence['backend'] {
  if (envelope === null || typeof envelope !== 'object') return 'none'
  const routing = (envelope as Record<string, unknown>)['routing']
  if (routing === null || typeof routing !== 'object') return 'none'
  return 'laya-torch'
}

/**
 * The model name the serving process reported about the weights it loaded.
 *
 * ON THE TORCH LANE this is `routing.model`. ON `llama.cpp` IT IS DELIBERATELY
 * `null`: there, the top-level `model` is a FILE PATH rather than a model name,
 * and `routing` does not exist. The skill's rule is to read the checkpoint from
 * `routing.model` and never from the top-level `model`; returning the path here
 * would put a filesystem path into a field consumed as a model identity, and the
 * embedding-identity contract already treats a drifted identity as grounds for
 * refusal.
 *
 * `null` therefore means "the backend did not report one", which is a MISSING
 * READING and not a model named null.
 *
 * @param envelope - the outer response object.
 * @returns the reported model name, or null when the backend reported none.
 */
export function readModelName(envelope: unknown): string | null {
  if (envelope === null || typeof envelope !== 'object') return null
  const routing = (envelope as Record<string, unknown>)['routing']
  if (routing === null || typeof routing !== 'object') return null
  const model = (routing as Record<string, unknown>)['model']
  return typeof model === 'string' && model.length > 0 ? model : null
}

/**
 * The decision, or the stated reason there is none.
 *
 * READ THE SHAPE CAREFULLY: the unavailable member carries NO `accepted` field.
 * That is the degradation guarantee expressed as a type rather than promised in
 * prose — there is nothing for a caller to default to `false` and record.
 */
export type ModelDecision =
  | {
      readonly available: true
      readonly accepted: boolean
      readonly confidence: AnswerConfidence
      readonly provenance: DecisionProvenance
      readonly reading: BackendReading
    }
  | {
      readonly available: false
      readonly reason: UnavailableReason
      readonly reading: BackendReading
    }

/**
 * Build the refusal: a reading with no decision in it.
 *
 * @param reason - why no decision could be read.
 * @param reading - what the probe saw.
 * @returns the unavailable decision.
 */
function unavailable(reason: UnavailableReason, reading: BackendReading): ModelDecision {
  return { available: false, reason, reading }
}

/**
 * Ask the backend for a `noul` decision on a proposition.
 *
 * The floor is applied to the CALIBRATED quantity only, and the calibration is
 * obtained through `readConfidence`, whose reading order is stated in
 * `confidence.ts`. When no calibrated quantity can be read, this returns
 * `available: false` with `no-reading` — it does NOT treat the absence as a low
 * confidence, because an unreadable confidence and a confident "no" are opposite
 * findings and the second must never be manufactured from the first.
 *
 * @param proposition - the question to put to the model, as a `noul` proposition.
 * @param options - the endpoint, floor, timeout and transport to use.
 * @returns the decision, or the stated reason there is none.
 */
export async function decideByLaya(
  proposition: string,
  options: {
    readonly endpoint?: string
    readonly floor?: number
    readonly timeoutMs?: number
    readonly transport?: Transport
    readonly now?: Date
  } = {},
): Promise<ModelDecision> {
  const endpoint = options.endpoint ?? DEFAULT_LAYA_ENDPOINT
  const timeoutMs = options.timeoutMs ?? 5_000
  const transport = options.transport ?? globalTransport
  const probedAt = (options.now ?? new Date()).toISOString()

  const requestBody = JSON.stringify({
    type: 'noul',
    question: proposition,
    // The batch sibling is NOT used: `POST /v1/systemone/batch` is a 404 in this
    // llama.cpp build, registered nowhere in tools/server/server.cpp.
  })

  let response: HttpResponse
  try {
    response = await transport.post(`${endpoint}${DECISION_ROUTE}`, requestBody, timeoutMs)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'the transport failed without an error object'
    const timedOut = detail.toLowerCase().includes('abort')
    return unavailable(timedOut ? 'timeout' : 'unreachable', {
      endpoint,
      ok: false,
      httpStatus: null,
      reason: timedOut ? 'timeout' : 'unreachable',
      probedAt,
      detail,
      backend: 'none',
      model: null,
    })
  }

  if (response.status < 200 || response.status >= 300) {
    return unavailable('http-error', {
      endpoint,
      ok: false,
      httpStatus: response.status,
      reason: 'http-error',
      probedAt,
      detail: `the endpoint answered HTTP ${response.status}`,
      backend: 'none',
      model: null,
    })
  }

  let envelope: unknown
  try {
    envelope = JSON.parse(response.body)
  } catch {
    return unavailable('not-a-decision-shape', {
      endpoint,
      ok: false,
      httpStatus: response.status,
      reason: 'not-a-decision-shape',
      probedAt,
      detail: 'the body is not JSON',
      backend: 'none',
      model: null,
    })
  }

  const backend = laneOf(envelope)
  const model = readModelName(envelope)
  const parsed = parseDecisionBody(response.body)

  if (parsed.shape === 'not-a-decision') {
    return unavailable(parsed.reason, {
      endpoint,
      ok: false,
      httpStatus: response.status,
      reason: parsed.reason,
      probedAt,
      detail: parsed.detail,
      backend,
      model,
    })
  }

  const reading = readConfidence(parsed.record, backend === 'none' ? 'none' : backend, 'noul', model)
  if (!reading.ok) {
    return unavailable('no-reading', {
      endpoint,
      ok: false,
      httpStatus: response.status,
      reason: 'no-reading',
      probedAt,
      detail: reading.refusal.reason,
      backend: backend === 'none' ? 'none' : backend,
      model,
    })
  }

  const floor = options.floor ?? 0.7
  const admitted = asAnswerConfidence(reading.confidence)
  if (admitted === null) {
    return unavailable('no-reading', {
      endpoint,
      ok: false,
      httpStatus: response.status,
      reason: 'no-reading',
      probedAt,
      detail: 'the reading could not be branded as the calibrated quantity, so it may not gate',
      backend: backend === 'none' ? 'none' : backend,
      model,
    })
  }

  return {
    available: true,
    accepted: admitted.value >= floor,
    confidence: admitted,
    provenance: reading.provenance,
    reading: {
      endpoint,
      ok: true,
      httpStatus: response.status,
      reason: null,
      probedAt,
      detail: `read the calibrated quantity from the ${backend === 'none' ? 'unidentified' : backend} lane`,
      backend: backend === 'none' ? 'none' : backend,
      model,
    },
  }
}
