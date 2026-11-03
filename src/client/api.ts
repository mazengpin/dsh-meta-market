/**
 * The Client half's transport.
 *
 * ONE route: `GET /meta-market/api/gui/section?window=<id>`. The prefix is NOT
 * re-declared here — it is read from the frozen `src/shared/protocol.ts`, so the
 * browser and the host cannot disagree about where the route lives. (A second
 * literal for the prefix is two encodings of one fact, and this program has paid
 * for that class already: a route table that advertised a doubled path segment.)
 *
 * THREE DISTINCT NON-ANSWERS, which is the whole reason this file types failures
 * instead of returning `null`:
 *
 *  - the fetch THREW → `unreachable` (no server, DNS, offline),
 *  - HTTP 404 → `unmounted` (the plugin's prefix is not registered on this host —
 *    the same confusion `D-0071` records between an absent route and a 404),
 *  - HTTP 400 → `rejected`, and the body NAMES THE KNOWN IDS, which is surfaced
 *    rather than summarised (the contract requires 400 with the id list instead
 *    of a silent empty payload),
 *  - a 2xx body that does not carry the envelope's required keys → `malformed`.
 *
 * A 404 is NOT `unavailable`: `unavailable` is a FIELD of a real envelope
 * (`payload.unavailable`), meaning the surface answered and the underlying
 * measurement could not be taken. The two are reported separately because they
 * mean opposite things about the system's health.
 *
 * @module dsh-meta-market/client/api
 */

import { ROUTE_PREFIX } from '../shared/protocol.ts'
import { SectionError } from './types.ts'
import type { WindowEnvelope, WindowId } from './types.ts'

/** Placeholder origin for the non-DOM case (specs, SSR): URL resolution needs a base. */
const PLACEHOLDER_ORIGIN = 'http://dsh.invalid/'

/**
 * Resolve one route against the page base, without a query and without a hash.
 *
 * Resolving against `location.href` keeps the plugin working behind a
 * reverse-proxy prefix; dropping the query is also what strips a launch token.
 *
 * @param path - the slash-less route path, e.g. `meta-market/api/gui/section`.
 * @returns the absolute URL to fetch.
 */
export function routeUrl(path: string): string {
  const base = typeof location === 'undefined' ? PLACEHOLDER_ORIGIN : location.href
  const url = new URL(path, base)
  url.search = ''
  url.hash = ''
  return url.toString()
}

/**
 * The one section URL, built so the query survives resolution.
 *
 * `routeUrl` deliberately CLEARS the query (it is what strips a launch token), so
 * the `window` parameter is set on the resolved URL afterwards rather than being
 * written into the path and silently dropped.
 *
 * @param window - the window id to ask for.
 * @returns the absolute URL to fetch.
 */
export function sectionUrl(window: WindowId): string {
  const url = new URL(routeUrl(`${ROUTE_PREFIX}/gui/section`))
  url.searchParams.set('window', window)
  return url.toString()
}

/** The envelope keys this client REQUIRES before it will render a payload. */
const REQUIRED_KEYS = ['window', 'generatedAt', 'census', 'items', 'unavailable', 'controls', 'falsifiers'] as const

/**
 * Check that a parsed body really is an envelope.
 *
 * The check is on the KEYS, and `unavailable` must be PRESENT even when its value
 * is `null` — an absent key means the route did not answer the absence question,
 * which is a different statement from "the route answered, nothing was absent".
 * Reading the two the same way is how `|| 0` turns "not measured" into a measured
 * zero.
 *
 * @param raw - the parsed body, of unknown provenance.
 * @param window - the window that was asked for, named in the failure message.
 * @returns the body, narrowed to the envelope shape.
 * @throws SectionError `malformed` when a required key is missing.
 */
function assertEnvelope(raw: unknown, window: WindowId): WindowEnvelope {
  if (raw === null || typeof raw !== 'object') {
    throw new SectionError('malformed', `the ${window} section payload was not an object`)
  }
  const record = raw as Record<string, unknown>
  const missing = REQUIRED_KEYS.filter(key => !(key in record))
  if (missing.length > 0) {
    throw new SectionError(
      'malformed',
      `the ${window} section payload is missing ${missing.join(', ')} — absent is not zero, so nothing is rendered as one`,
    )
  }
  if (!Array.isArray(record['items'])) {
    throw new SectionError('malformed', `the ${window} section payload's items is not an array`)
  }
  const id = (record['window'] as { id?: unknown } | null)?.id
  if (id !== window) {
    throw new SectionError(
      'malformed',
      `asked for ${JSON.stringify(window)} and the payload answered for ${JSON.stringify(id)} — a cross-wired payload is refused rather than rendered`,
    )
  }
  return raw as WindowEnvelope
}

/**
 * Read one window's payload envelope.
 *
 * @param window - one of the ten window ids from CONTRACT.
 * @param signal - an abort signal, so a tab switch cannot be answered by the previous tab's request.
 * @returns the parsed envelope.
 * @throws SectionError with one of the four typed failures.
 */
export async function loadSection(window: WindowId, signal?: AbortSignal): Promise<WindowEnvelope> {
  let response: Response
  try {
    response = await fetch(sectionUrl(window), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new SectionError(
      'unreachable',
      aborted
        ? 'the section request was superseded by a newer one'
        : error instanceof Error
          ? error.message
          : String(error),
    )
  }

  if (response.status === 404) {
    throw new SectionError('unmounted', 'the meta-market route prefix is not mounted on this host', 404)
  }
  if (!response.ok) {
    // The body carries the reason, and for a 400 it names the KNOWN IDS. Surfacing
    // it is the difference between "the route refused this window" and "the route
    // was silent".
    const detail = await response.text().catch(() => '')
    throw new SectionError(
      'rejected',
      `HTTP ${response.status}${detail === '' ? '' : `: ${detail.slice(0, 400)}`}`,
      response.status,
    )
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (error) {
    throw new SectionError(
      'malformed',
      error instanceof Error ? error.message : String(error),
      response.status,
    )
  }
  return assertEnvelope(parsed, window)
}
