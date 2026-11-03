/**
 * render-disclosure.ts — the ONE sentence a reader gets about what a plugin can touch, and its fourth state.
 *
 * WHY THIS FILE EXISTS. `absence-guard.ts` separates the two ways a row can say nothing (`no-capabilities-key` and `empty-capabilities-array`) and then combines them into one boolean, `declaresNothing`.
 * A surface that prints that boolean has collapsed the distinction the guard was built to preserve, and the collapse is not symmetric: EMPTY (797 rows) OUTNUMBERS ABSENT (522), so the class a reader is most likely to meet is the one the boolean silently merges into "none".
 *
 * THE FOUR STATES, and the fourth is the one every such surface forgets: ABSENT (no `capabilities` key at all — never asked), EMPTY (`capabilities: []` — asked, and the author declared nothing), DECLARED (a non-empty declaration with no red line naming credentials or secrets), RED-LINED (a non-empty declaration WITH such a red line).
 * The union logic is NOT re-derived here: every state comes from `unionPrivilege`, so this file cannot disagree with the guard about what a row said.
 *
 * THE SENTENCES NEVER REASSURE, AND THAT IS A PROPERTY RATHER THAN A TONE. A disclosure that reassures about a plugin nobody checked is the failure this module exists to prevent, so the day-one metric is `rows rendered as reassuring ÷ total` and it must be 0.
 * `REASSURING_PATTERN` is exported so the harness scores the SAME definition this file is judged by, rather than a second copy of it.
 *
 * @module dsh-meta-market/host/safety/render-disclosure
 */
import { SENSITIVE_REDLINE_PATTERN, redLineReadsCredentialsAndNetwork, unionPrivilege } from './absence-guard.ts'

/** The four states a disclosure can be in. Closed, so a caller cannot invent a fifth reading in prose. */
export const DISCLOSURE_STATES = ['absent', 'empty', 'declared', 'red-lined'] as const
export type DisclosureState = (typeof DISCLOSURE_STATES)[number]

/** The words that would turn a disclosure into reassurance. Exported so the score is computed from one definition, not two. */
export const REASSURING_PATTERN = /\b(safe|clean|benign|trusted|trustworthy|harmless|no[- ]risk|risk[- ]free|nothing to worry|no concerns|all clear)\b/i

/** True when a rendered sentence would read as reassurance about a plugin nobody checked. */
export function isReassuring(sentence: string): boolean {
  return REASSURING_PATTERN.test(sentence)
}

/**
 * Which of the four states a row is in, decided by the guard's own readings.
 *
 * ORDER MATTERS AND IS STATED: the two ways of saying nothing are checked FIRST, because `declaresNothingReason` is the guard's verdict and this file must not second-guess it.
 * RED-LINED requires a non-empty declaration, because a red line about a plugin that declared no capabilities is not "capabilities present with a red line".
 */
export function disclosureState(input: unknown): DisclosureState {
  const view = unionPrivilege(input)
  if (view.declaresNothingReason === 'no-capabilities-key') return 'absent'
  if (view.declaresNothingReason === 'empty-capabilities-array') return 'empty'
  if (view.declaredCapabilities.length > 0 && view.sensitiveRedLines.length > 0) return 'red-lined'
  return 'declared'
}

/** The sentence for one state. One physical line each, and none of them reassures. */
export function renderDisclosure(input: unknown): string {
  const view = unionPrivilege(input)
  const state = disclosureState(input)
  const capabilities = view.declaredCapabilities.length
  const redLines = view.declaredRedLines.length
  if (state === 'absent') {
    return 'No capability declaration was made: this row carries no capabilities key at all, so nothing is known about what it can touch — it was never asked, and this is not a claim that it touches nothing.'
  }
  if (state === 'empty') {
    return 'The declaration exists and is empty: capabilities: [] says the author was asked and declared nothing, which is the author\'s claim and not a check — no verification of that emptiness was performed here.'
  }
  if (state === 'red-lined') {
    return `Declares ${String(capabilities)} capabilities and ${String(redLines)} red line(s), at least one naming credentials or secrets; that red line is the author's own sentence, so it is a warning to check rather than a measurement of what the plugin does.`
  }
  return `Declares ${String(capabilities)} capabilities and no red line naming credentials or secrets; every one of them is the author's claim, and this surface has verified none of them.`
}

/** The state, its sentence, and the two counts the sentence quotes — so a surface never prints a sentence without the numbers it rests on. */
export function disclosure(input: unknown): { readonly state: DisclosureState; readonly sentence: string; readonly capabilities: number; readonly redLines: number } {
  const view = unionPrivilege(input)
  return {
    state: disclosureState(input),
    sentence: renderDisclosure(input),
    capabilities: view.declaredCapabilities.length,
    redLines: view.declaredRedLines.length,
  }
}

/**
 * The count that makes the module's own honesty checkable: how many rows would render as reassurance, over how many were rendered.
 *
 * It exists so `0` is a MEASUREMENT with a denominator rather than an assertion, and it reports the numerator and denominator together because this program has already published a reassuring zero without one.
 */
export function reassuringCount(rows: readonly unknown[]): { readonly reassuring: number; readonly total: number } {
  let reassuring = 0
  for (const row of rows) if (isReassuring(renderDisclosure(row))) reassuring += 1
  return { reassuring, total: rows.length }
}

/** Re-exported so a caller scoring red lines does not import the guard for one predicate and this module for another. */
export { redLineReadsCredentialsAndNetwork, SENSITIVE_REDLINE_PATTERN }
