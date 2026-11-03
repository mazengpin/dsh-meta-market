/**
 * ============================================================================
 * dsh-meta-market — presence and absence, stated ONCE
 * ============================================================================
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS IN THIS LANE'S DIRECTORY RATHER THAN `shared/`
 *
 * `protocol.ts` froze the SHAPES; it deliberately did not provide the reading
 * functions, and it says so itself: *"`noul` is typed `0 | 1`, but a value that
 * arrives over the wire is `unknown` until a lane validates it. Types constrain
 * the code we write, not the bytes an untrusted peer sends; `task-6` (safety)
 * owns that boundary."*
 *
 * That boundary is exactly where this program has published its most wrong
 * numbers, so the rule is implemented rather than remembered. `AGENTS.md`
 * records the coercion having been paid for THREE times, twice by the same
 * expression:
 *
 *   - `@($null).Count` is `1` — a phantom element charged to a container that
 *     does not hold it. It turned 13,542 capability assertions into 13,938, and
 *     the `+396` was exactly the 396 rows with NO `capabilities` key.
 *   - `u.cacheReadTokens || 0` defined a class of events, and ZERO of 10,024
 *     records had the field present-and-zero — the class was real, the stated
 *     predicate was false, and two agents "confirmed" it by running the SAME
 *     expression.
 *   - A "presence-aware" figure was then published by EXCLUDING the absent
 *     samples from the denominator, and **the exclusion was the bias**.
 *
 * THE RULE THIS FILE ENFORCES: **test `'field' in obj` before reading a value,
 * and never let `|| 0`, `?? 0`, or a truthy test stand in for presence.** Every
 * reader returns a discriminated `Reading` rather than a value, so a caller that
 * wants a number must say what it does when there is none — the coercion is not
 * merely discouraged, it is not expressible without writing the absent branch.
 *
 * AND THE HALF A GUARD LIKE THIS GETS WRONG: **an absent declaration and an
 * empty declaration are different claims.** 396 catalog rows have no
 * `capabilities` key at all ("never asked"), 546 have `capabilities: []`
 * ("asked, and they said nothing"), and their union is the 942 that `plan/06`
 * reports. Collapsing those three into one number is this file's own trap one
 * level up.
 *
 * LANE-LOCAL BY DECISION, NOT BY ACCIDENT: this helper is genuinely useful to
 * the `dialogue`, `patch` and `alignment` lanes, and the Lead offered to freeze
 * it as a shared contract. The answer was NO FOR NOW and it is recorded in
 * `research/meta-market-safety.md` §8: **a `shared/` file that changes under
 * three consumers is worse than a duplicated helper**, and promoting it mid-build
 * means negotiating a second frozen file with four lanes. **If it is promoted
 * later, promote it deliberately — with a freeze and a version — not by drift.**
 *
 * @module dsh-meta-market/host/safety/absence-guard
 */

/**
 * A reading that may or may not exist — and NEVER a value with a silent default.
 *
 * `present: false` carries the REASON, because "why is this missing" is the
 * question that tells a `0` from an `unread` — the distinction the recall console
 * had to make when it separated `null` (unprobed) from `false` (probed and
 * absent).
 */
export type Reading<T> = { readonly present: true; readonly value: T } | { readonly present: false; readonly reason: string }

/** A present reading. */
export function present<T>(value: T): Reading<T> {
  return { present: true, value }
}

/** An absent reading, which MUST say why it is absent. */
export function absent<T>(reason: string): Reading<T> {
  return { present: false, reason }
}

/** The JSON kinds a wire field can have, as the discriminator `readField` takes. */
export type FieldShape = 'string' | 'number' | 'boolean' | 'array' | 'object'

function shapeOf(value: unknown): FieldShape | 'null' | 'undefined' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t
  return 'undefined'
}

/**
 * Read a field from an untrusted value, distinguishing ABSENT from wrong-typed.
 *
 * The two failure modes get different reasons on purpose: `no-such-key` means the
 * sender never made this claim, `wrong-shape` means it made a claim this schema
 * cannot carry. A receiver that treats them alike will refuse a peer for saying
 * nothing, which is a false refusal and therefore a real defect.
 *
 * A field that is **present but empty** is a THIRD case, and it is reported as a
 * present value with an empty string: `expiresAt: ""` is a claim, and a caller
 * that wants to treat it as absent must say so. Conflating the three is how a
 * deliberate `null` became `11` in a published harness.
 */
export function readField(o: unknown, key: string, shape: FieldShape): Reading<unknown> {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) {
    return absent(`not-an-object: cannot read "${key}" from a ${shapeOf(o)}`)
  }
  if (!Object.prototype.hasOwnProperty.call(o, key)) {
    return absent(`no-such-key: "${key}" is absent from the object`)
  }
  const value = (o as Record<string, unknown>)[key]
  if (value === undefined) {
    return absent(`key-present-but-undefined: "${key}" is declared as undefined, which JSON cannot carry`)
  }
  const actual = shapeOf(value)
  if (actual !== shape) {
    return absent(`wrong-shape: "${key}" is a ${actual}, expected a ${shape}`)
  }
  return present(value)
}

/** A string array read as DATA, never as decision input. Reports the offending INDEX. */
export function readStringArray(o: unknown, key: string): Reading<readonly string[]> {
  const r = readField(o, key, 'array')
  if (!r.present) return r
  const raw = r.value as readonly unknown[]
  const bad: number[] = []
  const out: string[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i]
    if (typeof entry === 'string') out.push(entry)
    else bad.push(i)
  }
  if (bad.length > 0) {
    return absent(`mixed-array: "${key}" has ${bad.length} non-string element(s) at index ${bad.join(',')}`)
  }
  return present(out)
}

/** A non-empty string, which is a DIFFERENT claim from a present-but-empty one. */
export function readNonEmptyString(o: unknown, key: string): Reading<string> {
  const r = readField(o, key, 'string')
  if (!r.present) return r
  const v = r.value as string
  if (v.trim() === '') return absent(`empty-string: "${key}" is present but says nothing`)
  return present(v)
}

/**
 * WHY `capabilities` IS MISSING, as a closed reason — the 396/546/942 split.
 *
 * `plan/06` reports "942 plugins declare no capabilities at all" WITHOUT a
 * denominator and without saying which of these two mechanisms produced it. Both
 * are true and they mean different things, so they are distinct members rather
 * than summed by this function.
 */
export type DeclaresNothingReason = 'no-capabilities-key' | 'empty-capabilities-array'

/** The union privilege view of one catalog row or one peer declaration. */
export interface UnionPrivilege {
  /** Every token either field mentions — the UNION a filter must act on. */
  readonly tokens: readonly string[]
  readonly declaredCapabilities: readonly string[]
  readonly declaredRedLines: readonly string[]
  /** Capability tokens matching a sensitive pattern (the escalation axis). */
  readonly sensitive: readonly string[]
  /** Red lines matching a sensitive pattern. */
  readonly sensitiveRedLines: readonly string[]
  /** `true` when neither field was present: the row/peer said nothing at all. */
  readonly declaresNothing: boolean
  /** Which mechanism produced `declaresNothing`, or `null` when a declaration exists. */
  readonly declaresNothingReason: DeclaresNothingReason | null
}

/**
 * The sensitive-token pattern. `credentials` is the catalog's own token; the
 * pattern is deliberately narrow rather than clever, because a filter that
 * over-matches refuses honest peers and a filter that under-matches is the defect
 * it exists to prevent.
 */
export const SENSITIVE_TOKEN_PATTERN = /credential|secret|private[-_]?key|passwd|password/i

/** The red-line sentence pattern — the catalog's red lines are SENTENCES, not tokens. */
export const SENSITIVE_REDLINE_PATTERN = /credential|secret/i

/** A red line that names network access. */
export const NETWORK_REDLINE_PATTERN = /network/i

/** A red line that names install-time execution. */
export const INSTALL_TIME_PATTERN = /install/i

/**
 * Whether a red-line SET describes reads-credentials-AND-network.
 *
 * MEASURED, and the two forms COINCIDE on this catalog, which is why the stricter
 * per-string form is the one implemented: over all 4,527 rows the cross-array
 * union (`some(creds) && some(network)`) and the single-string test
 * (`some(creds && network)`) BOTH return 386. Reporting them as one number would
 * hide a real distinction, so `research/meta-market-safety.md` §3.3 states both
 * and this function implements the single-string form because it is the NARROWER
 * claim: a row whose red lines separate "reads credentials" from "has network
 * access" into two entries would be MISSED by it, and **that is a falsifier, not a
 * rounding.**
 *
 * THE VOCABULARY POINT THAT MAKES "TAKE THE UNION" HARD: the red-line strings
 * share NO TOKENS with the capability tokens — the catalog's red lines are
 * sentences (`reads credentials/secrets AND has network access`) while its
 * capabilities are tokens (`credentials`, `network`). So "union" is a statement
 * about TWO VOCABULARIES, and an implementation that unions two token sets will
 * silently miss all 386.
 */
export function redLineReadsCredentialsAndNetwork(redLines: readonly string[]): boolean {
  return redLines.some((r) => SENSITIVE_REDLINE_PATTERN.test(r) && NETWORK_REDLINE_PATTERN.test(r))
}

/**
 * Build the union privilege view from an untrusted value — a catalog row, a
 * peer's `CapabilityDeclaration`, or a peer card.
 *
 * Both spellings are accepted because the catalog and the frozen protocol name the
 * same two facts differently: `capabilities`/`capabilityRedLines` on a catalog
 * row, `capabilities`/`redLines` on a `CapabilityDeclaration` (a peer card).
 * Reading only one spelling would make the same peer look clean or silent
 * depending on which side serialised it.
 */
export function unionPrivilege(input: unknown, refusedTokens: readonly string[] = []): UnionPrivilege {
  const capsRead = readStringArray(input, 'capabilities')
  const redsRead = readStringArray(input, 'capabilityRedLines')
  const peerReds = redsRead.present ? redsRead : readStringArray(input, 'redLines')

  const declaredCapabilities = capsRead.present ? capsRead.value : []
  const declaredRedLines = peerReds.present ? peerReds.value : []

  const tokens = [...new Set([...declaredCapabilities, ...declaredRedLines])]

  const sensitive = declaredCapabilities.filter((t) => SENSITIVE_TOKEN_PATTERN.test(t))
  const sensitiveRedLines = declaredRedLines.filter((r) => SENSITIVE_REDLINE_PATTERN.test(r))

  // `refusedTokens` is accepted so a caller can ask "does this declaration claim
  // something I refuse"; the flag itself is deliberately NOT returned, because a
  // token appearing in both fields is the catalog's normal state (its two fields
  // are independently derived) and is therefore not by itself a refusal.
  void refusedTokens

  let declaresNothingReason: DeclaresNothingReason | null = null
  if (!capsRead.present && !peerReds.present) {
    declaresNothingReason = 'no-capabilities-key'
  } else if (
    capsRead.present &&
    peerReds.present &&
    declaredCapabilities.length === 0 &&
    declaredRedLines.length === 0
  ) {
    declaresNothingReason = 'empty-capabilities-array'
  }

  return {
    tokens,
    declaredCapabilities,
    declaredRedLines,
    sensitive,
    sensitiveRedLines,
    declaresNothing: declaresNothingReason !== null,
    declaresNothingReason,
  }
}

/**
 * A count that refuses to be bare.
 *
 * `protocol.ts` defines `Measured` as numerator + denominator. This helper exists
 * so a caller cannot construct one from a numerator alone: an unknown denominator
 * yields `absent` WITH the reason.
 */
export function measuredOrAbsent(
  count: number | null,
  of: number | null,
  reason: string,
): Reading<{ readonly count: number; readonly of: number }> {
  if (count === null || of === null) return absent(reason)
  if (of === 0) return absent(`no-population: the denominator is 0, so ${count} of 0 measures nothing`)
  return present({ count, of })
}

/**
 * THE INSTRUMENT GUARD, made executable rather than remembered.
 *
 * `AGENTS.md`: *"A 0 on both sides of a comparison is an INSTRUMENT FAILURE, not a
 * pass."* A control that refuses every input and a control whose subject was never
 * present both report "0 allowed". They are not the same result, and a harness
 * that cannot tell them apart is the reason that sentence was written down four
 * times.
 */
export function instrumentCovered(
  observed: number,
  of: number,
  what: string,
): Reading<{ readonly count: number; readonly of: number }> {
  if (of === 0) {
    return absent(`instrument-failure: the probe saw 0 of 0 ${what} — a 0 on both sides is not a pass`)
  }
  if (observed === 0) {
    return absent(`instrument-failure: ${what} — the subject never appeared, so no verdict about it is a measurement`)
  }
  return present({ count: observed, of })
}
