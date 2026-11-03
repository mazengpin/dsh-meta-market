/**
 * `/gui/health` — the assembly's answer to "is this surface actually composed?"
 *
 * WHY THIS ROUTE IS NOT DECORATION
 *
 * Six providers land at six different times and any one of them may be absent or
 * broken when a reader looks. Without a health route, a reader who opens one
 * window and finds `unavailable` cannot tell whether the SURFACE is down, that
 * PROVIDER is down, or the whole thing was never built — three different facts
 * that lead to three different actions. So this route states all three explicitly:
 * the assembly's identity, whether it is mounted, and how many of the ten windows
 * answered — with the numerator AND the denominator, and the per-provider landed
 * table beside them.
 *
 * THE COUNT THAT MATTERS, AND THE ONE THAT WOULD BE A LIE
 *
 * `windowsAnswered` is computed by asking each provider in this same request, not
 * by reporting a constant. A constant here would be a caption rather than a
 * measurement, and it would be right until the first provider failed — which is
 * exactly the moment a reader would rely on it.
 *
 * @module dsh-meta-market/host/gui/health
 */

import type { Census, Falsifier, ProviderOutcome, WindowId } from '../types.ts'
import { WINDOW_IDS } from './registry.ts'
import { isAnswering, staleWasWritten } from './envelope.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** One window's state, as `/gui/health` reports it. */
export interface HealthWindowRow {
  readonly id: WindowId
  readonly provider: string
  readonly providerPath: string
  readonly providerLanded: boolean
  readonly answered: boolean
  readonly items: number | null
  readonly unavailable: { readonly reason: string; readonly measuredAt: string } | null
  /** Non-null when the window answered from a census and its LIVE read did not succeed. */
  readonly stale: { readonly reason: string; readonly boundMs: number | null; readonly at: string } | null
  /** Whether the provider WROTE the `stale` key; `false` = it never considered the question. */
  readonly staleReported: boolean
}

/** The `/gui/health` payload. */
export interface HealthPayload {
  readonly generatedAt: string
  readonly identity: {
    readonly id: string | null
    readonly kind: string | null
    /** MEASURED from the profile manifest; `null` = NOT MEASURED, never `false`. */
    readonly mounted: boolean | null
    readonly prefix: string | null
    readonly specVersion: number | null
    readonly stepVersion: number | null
    readonly authenticated: boolean | null
  }
  readonly mounted: boolean | null
  /**
   * THE READING `mounted` CAME FROM, passed through whole.
   *
   * Without this, `mounted` is a boolean a reader cannot audit — which is exactly
   * the shape of the defect it replaced (a literal `false` indistinguishable from
   * a measurement). Carrying the manifest path, its byte size, the bundle
   * membership and the census time beside it is what makes the value checkable.
   */
  readonly mount: unknown
  /** The live-probe reading `mounted` and `kind` were derived from, passed through whole. */
  readonly served: unknown
  /** The count the contract asks for, numerator stated beside its denominator. */
  readonly windowsAnswered: number
  /**
   * The IDS behind that count, so a reader comparing this payload with
   * `/gui/sections` compares SETS rather than two bare numbers. Two counts taken
   * at different instants may legitimately differ; two counts at the same instant
   * must not, and an id list is the only way to tell those apart without rerunning.
   */
  readonly answeredWindows: readonly WindowId[]
  readonly census: Census
  /**
   * HOW MANY PROVIDERS ACTUALLY WROTE `stale`, beside how many are degraded.
   *
   * Both numbers, because they answer different questions: `degraded` is "how many
   * windows are answering from a census rather than a live read", and `reporting`
   * is "how many providers even considered it". A window that never wrote the key
   * reads as not-degraded unless this count is published beside it — the absence of
   * a reading presented as an absence of a problem.
   */
  readonly staleCensus: {
    readonly reporting: number
    readonly degraded: number
    readonly total: number
    readonly population: string
  }
  readonly windows: readonly HealthWindowRow[]
  readonly providers: readonly { key: string; path: string; landed: boolean }[]
  readonly routes: { readonly advertised: number; readonly paths: readonly string[] }
  readonly gaps: readonly string[]
  readonly falsifiers: readonly Falsifier[]
}

/**
 * Assemble the health payload.
 *
 * @param outcomes - one outcome per window, produced in this same request.
 * @param assembly - `describeAssembly()`'s report; identity is read from it rather
 *   than restated, so this route cannot drift from the assembly it describes.
 * @param advertisedPaths - `REGISTERED_PATHS`; passed in rather than imported to
 *   avoid a cycle back into the route table that calls this builder.
 * @param providers - the landed/absent table from the provider composition.
 * @param now - the clock, passed in so a drive can pin it.
 */
export function buildHealth(
  outcomes: readonly ProviderOutcome[],
  assembly: unknown,
  advertisedPaths: readonly string[],
  providers: readonly { key: string; path: string; landed: boolean }[],
  now: Date,
): HealthPayload {
  const at = now.toISOString()
  const record = asRecord(assembly)
  const specVersion = typeof record.specVersion === 'number' ? record.specVersion : null
  const stepVersion = typeof record.stepVersion === 'number' ? record.stepVersion : null
  const authenticated = typeof record.authenticated === 'boolean' ? record.authenticated : null
  const mounted = typeof record.mounted === 'boolean' ? record.mounted : null

  const windows: readonly HealthWindowRow[] = WINDOW_IDS.map((id) => {
    const outcome = outcomes.find((candidate) => candidate.windowId === id)
    if (outcome === undefined) {
      return {
        id,
        provider: 'unmapped',
        providerPath: 'unmapped provider key',
        providerLanded: false,
        answered: false,
        items: null,
        unavailable: { reason: 'the assembly produced no provider outcome for this window', measuredAt: at },
        stale: null,
        staleReported: false,
      }
    }
    const items = outcome.payload?.items
    const answered = isAnswering(outcome)
    return {
      id,
      provider: outcome.provider,
      providerPath: outcome.path,
      providerLanded: outcome.landed,
      answered,
      items: Array.isArray(items) ? items.length : null,
      unavailable: outcome.failed ?? outcome.payload?.unavailable ?? null,
      stale: outcome.payload?.stale ?? null,
      staleReported: staleWasWritten(outcome.payload),
    }
  })

  const answered = windows.filter((row) => row.answered).length
  const census: Census = {
    numerator: answered,
    denominator: WINDOW_IDS.length,
    population: 'the ten windows in the CONTRACT; answered means the provider landed, did not throw, and did not report itself unavailable',
    at,
  }

  const gaps = windows
    .filter((row) => !row.answered)
    .map((row) => `${row.id}: ${row.unavailable?.reason ?? (row.providerLanded ? 'provider answered no payload' : `provider not landed at ${row.providerPath}`)}`)

  return {
    generatedAt: at,
    identity: {
      id: asStringOrNull(record.id),
      kind: asStringOrNull(record.kind),
      mounted,
      prefix: asStringOrNull(record.prefix),
      specVersion,
      stepVersion,
      authenticated,
    },
    mounted,
    mount: record.mount ?? null,
    served: record.served ?? null,
    windowsAnswered: answered,
    answeredWindows: windows.filter((row) => row.answered).map((row) => row.id),
    census,
    staleCensus: {
      reporting: windows.filter((row) => row.staleReported).length,
      degraded: windows.filter((row) => row.stale !== null).length,
      total: windows.length,
      population: 'the ten windows: `reporting` counts providers that WROTE the stale key; `degraded` counts those whose written value is a marker rather than null',
    },
    windows,
    providers,
    routes: { advertised: advertisedPaths.length, paths: advertisedPaths },
    gaps,
    falsifiers: [
      {
        claim: 'every window reported as answered has a provider that landed',
        how: 'in this same payload, filter `windows` for `answered === true` and require `providerLanded === true` on every row; a row where they disagree means the count is not derived from the table printed beside it',
      },
      {
        claim: 'no path advertised under `routes.paths` returns 404 when driven',
        how: 'request each advertised path and require none to answer 404; 200, 400 and 405 are all honest answers, and absence is not — this is the check `tmp/mmg-host-drive.mjs` performs and prints as a numerator over the advertised count',
      },
      {
        claim: 'the answered numerator is not a constant',
        how: 'temporarily make one provider throw, re-run the drive, and require `windowsAnswered` to decrease by exactly one while `gaps` names that window; a numerator that does not move is a caption',
      },
    ],
  }
}
