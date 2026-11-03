/**
 * ============================================================================
 * dialogue/confidence — the two confidences, kept apart by the type system
 * ============================================================================
 *
 * THE DEFECT THIS FILE EXISTS TO MAKE UNREPRESENTABLE
 *
 * Two different numbers are both called "confidence", and a threshold fitted on
 * one is wrong on the other. From `laya-ask-system-one` and the measured backend
 * behaviour:
 *
 *   - `answer_confidence` = `max(p)` over the answer's probabilities. This is the
 *     CALIBRATED quantity — the one temperature scaling is fitted to — and it is
 *     the quantity a gate must compare.
 *   - `confidence`         = normalized Shannon entropy on the TORCH lane
 *                            (`1 - H(p)/log(k)`), and on the `llama.cpp` lane a
 *                            different formula again (``(p_max - 1/k)/(1 - 1/k)``
 *                            for `choice`, a distance-to-mode ratio for `score`).
 *                            NEITHER carries a calibration guarantee.
 *
 * The same answer was recorded at `answer_confidence: 0.875` and reported
 * `confidence: 0.5788` — a 0.30 gap on ONE answer, straddling a 0.70 floor in
 * opposite directions. Read the one where the other was meant and the gate
 * releases a decision it should have escalated, with no error anywhere.
 *
 * The defence is NOT a comment saying "be careful". The two quantities are
 * separate BRANDED types, and the gate function accepts only the branded one. A
 * comment is advice; a brand is a compile error.
 *
 * A SECOND TRAP, ON THE TORCH LANE ALONE: `answer_confidence` is absent from the
 * `llama.cpp` response entirely (zero occurrences), so on that lane the reading
 * must fall back to `max(probabilities)` — which is why this file computes the
 * gateable value itself rather than trusting a field to be present.
 */

import type { Confidence, DecisionValue } from '../../shared/protocol.ts'
import { type DecisionProvenance, unmeasuredConfidence } from './types.ts'

// ---------------------------------------------------------------------------
// The two quantities, as distinct branded types
// ---------------------------------------------------------------------------

/**
 * The CALIBRATED confidence: `max(p)` over the answer's probabilities.
 *
 * The brand is the point. `Confidence` is the contract's carrier and says
 * nothing about WHICH quantity its `value` holds; this type says it holds the
 * gateable one. Only `asAnswerConfidence` produces it, and `clearsGate` accepts
 * nothing else — so a reported entropy cannot reach the gate even by accident,
 * because it cannot be given the type.
 */
export type AnswerConfidence = Confidence & {
  readonly __quantity: 'answer-confidence-max-p'
}

/**
 * The REPORTED confidence — a different quantity, deliberately NOT gateable.
 *
 * It carries a brand naming it as uncalibrated even when it is perfectly valid
 * as a number. Its only legitimate use is inspection and the negative control
 * that demonstrates the two quantities disagree.
 */
export type ReportedConfidence = Confidence & {
  readonly __quantity: 'reported-confidence-not-calibrated'
}

// ---------------------------------------------------------------------------
// Reading a probability vector
// ---------------------------------------------------------------------------

/**
 * The largest probability in a reading, or `null` with the reason it is absent.
 *
 * GUARDED AGAINST THE EMPTY CASE, and this is not defensive padding.
 * `Math.max()` and `Math.max(...[])` BOTH return `-Infinity`. A reader that took
 * that value would put `-Infinity` into a comparison, where it behaves like a
 * very low confidence and silently refuses everything — a number that looks like
 * a measurement and is an artifact of an empty array.
 *
 * NON-NUMERIC ENTRIES ARE SKIPPED RATHER THAN COERCED. `Number("abc")` is `NaN`,
 * and `NaN` in a comparison is false either way, which would make an unreadable
 * vector read as a below-floor reading — an absence of a READING reported as an
 * absence of a VALUE.
 *
 * @param probabilities - the probabilities to read, of unknown provenance.
 * @returns the maximum, or null when there is no numeric probability to read.
 */
export function maxProbability(probabilities: unknown): number | null {
  if (!Array.isArray(probabilities)) return null
  const numeric = probabilities.filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
  if (numeric.length === 0) return null
  return Math.max(...numeric)
}

/**
 * Whether a record carries a usable reading at all.
 *
 * The test is PRESENCE, not truthiness: `'answer_confidence' in record`. A
 * confidence of `0` is a legal and strongly negative reading, so a truthy test
 * would discard a real reading and report no reading — this program's recorded
 * `|| 0` trap read from the other direction.
 *
 * @param record - the record to test.
 * @returns whether a reading is present.
 */
export function hasReading(record: unknown): boolean {
  if (record === null || typeof record !== 'object') return false
  const holder = record as Record<string, unknown>
  if ('answer_confidence' in holder) return true
  if (Array.isArray(holder['probabilities'])) return true
  if ('noul' in holder && holder['type'] === 'noul') return true
  return false
}

// ---------------------------------------------------------------------------
// Which quantity does the reported field hold, on THIS backend?
// ---------------------------------------------------------------------------

/**
 * What the reported `confidence` field holds, named per backend and per decision
 * kind — because the answer to "what is this number" is backend-dependent, and
 * assuming one meaning for both is the mistake recorded in `AGENTS.md`.
 *
 * @param backend - which lane produced the reading.
 * @param decision - the decision kind the reading was taken for.
 * @returns the name of the quantity, or a stated absence.
 */
export function reportedQuantityFor(
  backend: Confidence['backend'],
  decision: DecisionValue['decision'],
): 'entropy' | 'typesafe-choice-ratio' | 'typesafe-score-ratio' | 'max-p-coincides' | 'absent' {
  if (backend === 'none') return 'absent'
  if (backend === 'laya-torch') return 'entropy'
  if (decision === 'choice') return 'typesafe-choice-ratio'
  if (decision === 'score') return 'typesafe-score-ratio'
  return 'absent'
}

// ---------------------------------------------------------------------------
// The reading, in a fixed order
// ---------------------------------------------------------------------------

/**
 * A confidence reading error: the quantity could not be read, and why.
 */
export interface ConfidenceRefusal {
  readonly reason: string
}

/**
 * The outcome of reading a confidence: either the gateable quantity, or a
 * refusal naming why it is absent.
 *
 * Modelled as a union rather than as a nullable number so that a caller CANNOT
 * read a value out of the refusal branch — the same discipline the contract uses
 * for `Verdict`, and the reason a dead backend cannot be mistaken for an
 * unconvincing one.
 */
export type ConfidenceReading =
  | { readonly ok: true; readonly confidence: AnswerConfidence; readonly provenance: DecisionProvenance }
  | { readonly ok: false; readonly refusal: ConfidenceRefusal; readonly reading: Confidence }

/**
 * Read the GATEABLE confidence for a decision, in a fixed order.
 *
 * THE ORDER IS THE ALGORITHM, and each step exists because the previous one is
 * absent on some lane:
 *
 *   1. `answer_confidence`, when the KEY IS PRESENT. Present-and-zero is a real
 *      reading; absence is not.
 *   2. Otherwise `max(probabilities)` — the NORMAL path on `llama.cpp`, where
 *      `answer_confidence` does not exist at all. This is a genuine reading, not
 *      a fallback approximation, because `max(p)` IS the calibrated quantity.
 *   3. Otherwise the `noul` scalar, and ONLY for a `noul` answer, where the two
 *      fields coincide. This is the single place the reported field is the
 *      gateable quantity, and it is exactly why it must not be gated on
 *      anywhere else.
 *   4. Otherwise `null` with a reason — never a zero, never a guess.
 *
 * @param answer - the response record to read, of unknown provenance.
 * @param backend - which lane produced it.
 * @param decision - the decision kind the reading was taken for.
 * @param model - the model name the backend reported, or null when it reported none.
 * @returns the reading, or a refusal naming the absent quantity.
 */
export function readConfidence(
  answer: unknown,
  backend: Confidence['backend'],
  decision: DecisionValue['decision'],
  model: string | null,
): ConfidenceReading {
  if (answer === null || typeof answer !== 'object') {
    return {
      ok: false,
      refusal: { reason: 'the response is not an object, so no quantity could be read from it' },
      reading: unmeasuredConfidence(),
    }
  }
  const record = answer as Record<string, unknown>

  // (1) The calibrated field, when the key is present. Present-and-zero counts.
  if ('answer_confidence' in record) {
    const raw = record['answer_confidence']
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const confidence: AnswerConfidence = {
        value: raw,
        backend,
        model,
        provenance: 'computed',
        __quantity: 'answer-confidence-max-p',
      }
      return { ok: true, confidence, provenance: 'model-answer-confidence' }
    }
    return {
      ok: false,
      refusal: { reason: 'answer_confidence is present but not a finite number, so it is an unreadable reading rather than a confidence' },
      reading: unmeasuredConfidence(),
    }
  }

  // (2) max(p) over the probabilities — the normal path where the field is absent.
  const maxP = maxProbability(record['probabilities'])
  if (maxP !== null) {
    const confidence: AnswerConfidence = {
      value: maxP,
      backend,
      model,
      provenance: 'computed',
      __quantity: 'answer-confidence-max-p',
    }
    return { ok: true, confidence, provenance: 'model-answer-confidence' }
  }

  // (3) The `noul` scalar, ONLY where the two quantities coincide.
  if ('noul' in record && record['type'] === 'noul') {
    const raw = record['noul']
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const confidence: AnswerConfidence = {
        value: raw,
        backend,
        model,
        provenance: 'computed',
        __quantity: 'answer-confidence-max-p',
      }
      return { ok: true, confidence, provenance: 'noul-max-p' }
    }
  }

  // (4) No reading. Stated, with the reason, and never as a zero.
  const quantity = reportedQuantityFor(backend, decision)
  return {
    ok: false,
    refusal: {
      reason: `no ${quantity === 'absent' ? 'calibrated quantity' : quantity} could be read: answer_confidence, probabilities and a noul scalar were each absent from the response`,
    },
    reading: unmeasuredConfidence(),
  }
}

// ---------------------------------------------------------------------------
// The two constructors — one admits to the gate, one does not
// ---------------------------------------------------------------------------

/**
 * THE SINGLE constructor for a gateable confidence.
 *
 * It refuses two things, and both refusals are the point:
 *
 *   - `provenance !== 'computed'`: the contract says a `reported` confidence "is
 *     testimony and must never gate anything on its own", and a `not-measured`
 *     one "must never gate anything on its own" at all. Testimony is what a PEER
 *     asserts; this instance may gate only on what it derived.
 *   - `backend === 'none'`: a confidence with no backend is a number with no
 *     stated meaning, and this program has already compared two of those across
 *     lanes and published the result.
 *
 * @param confidence - the carrier to admit, if it may be admitted.
 * @returns the branded confidence, or `null` when it may not gate.
 */
export function asAnswerConfidence(confidence: Confidence): AnswerConfidence | null {
  if (confidence.provenance !== 'computed') return null
  if (confidence.backend === 'none') return null
  if (!Number.isFinite(confidence.value)) return null
  return { ...confidence, __quantity: 'answer-confidence-max-p' }
}

/**
 * Brand a confidence as the REPORTED quantity, for inspection and for the
 * negative control — never for the gate.
 *
 * Deliberately a separate function with a separate return type. There is no
 * overload that returns an `AnswerConfidence`, so no code path reaches the gate
 * from a reported value by choosing a different call.
 *
 * @param confidence - the carrier to brand as reported.
 * @returns the reported-confidence brand.
 */
export function asReportedConfidenceForControl(confidence: Confidence): ReportedConfidence {
  return { ...confidence, __quantity: 'reported-confidence-not-calibrated' }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Whether a confidence clears a floor.
 *
 * It ACCEPTS ONLY `AnswerConfidence`. That is the whole enforcement: a
 * `ReportedConfidence` or a bare `Confidence` is not assignable here, so the
 * cross-quantity comparison cannot be written even deliberately without a cast
 * that a reviewer would see.
 *
 * @param confidence - the branded, gateable confidence.
 * @param floor - the threshold, in [0, 1].
 * @returns whether the confidence clears the floor.
 */
export function clearsGate(confidence: AnswerConfidence, floor: number): boolean {
  return confidence.value >= floor
}
