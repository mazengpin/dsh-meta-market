/**
 * THE PROVIDER COMPOSITION — six modules, ten windows, one failure boundary each.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *
 * One provider must never be able to take the surface down with it. Every call is
 * wrapped, and a failing provider yields `unavailable: {reason, measuredAt}` on
 * ITS OWN window while the other nine still answer. The alternative — one
 * `Promise.all` with no per-call catch — means the least finished lane decides
 * whether the most finished one is readable, and this build has six lanes landing
 * at six different times.
 *
 * **CORRECTED 2026-10-18: the SENTENCE ABOVE IS NOT AN ARGUMENT AGAINST `Promise.all` HERE,
 * and it was read as one.** `collectOutcomes` used a sequential `for … await` loop, so the
 * ten windows cost the SUM of their build times instead of the MAX. MEASURED post-restart
 * 2026-10-18, single-window timings of the live route (2 passes, seconds in pass-1/pass-2
 * read order): `meta-plugins` **42.84 / 32.91**, `meta-tools` 4.04 / 6.18, `meta-skills`
 * 1.79 / 5.07, `meta-memory` 0.13 / 0.15, `meta-intent` 5.62 / 5.48, `advanced` 5.38 /
 * 5.19, `meta-agents` 1.58 / 0.06, `meta-loops` 0.15 / 0.21, `meta-cordis` 0.23 / 0.07,
 * `meta-community` 0.11 / 0.04 — a sequential sum of **61.87 s / 55.36 s** against a
 * longest single window of **42.84 s**. The per-call `try/catch` in `callProvider` IS the
 * failure boundary the paragraph above requires, so `Promise.all` keeps every window's
 * isolation and removes the sum: this is the same boundary, not a weaker one. What the
 * paragraph forbids is an UNCAUGHT `Promise.all`, and there has never been one here.
 *
 * THREE DISTINCT FAILURES, KEPT DISTINCT
 *
 *   - **not landed** — the module was absent when this build's static import set
 *     was fixed. That is a fact about the BUILD, and the fixed import set is why
 *     the absence cannot be discovered at request time: the bundler resolved every
 *     specifier when `lib/index.js` was written.
 *   - **threw** — the module exists and its `buildWindow` rejected or raised.
 *     That is a fact about the PROVIDER at runtime.
 *   - **no builder** — the module exists but exports no function this file can
 *     call. That is a fact about the CONTRACT, and it names the export keys it
 *     did see so the owning lane can be told precisely what is wrong.
 *
 * Merging those three into one `error` string is how "not built yet" gets read as
 * "broken", which is the most expensive confusion in this program.
 *
 * WHY THE IMPORTS ARE STATIC
 *
 * `tsdown` writes ONE ESM bundle (`src/host/index.ts` → `lib/index.js`). A dynamic
 * import with a computed specifier would not be bundled, so at runtime it would
 * resolve relative to `lib/` and find nothing — a surface that works in-process
 * against `src/` and 404s in the artifact. So each provider is a namespace import
 * here, added when its file lands, and a module absent at build time is a row
 * with `module: null` rather than a broken bundle.
 *
 * @module dsh-meta-market/host/providers
 */

import type { ProviderModule, ProviderOutcome, ProviderWindow, WindowId } from '../types.ts'
import { rowFor, type ProviderKey } from '../gui/registry.ts'
import * as pluginsProvider from './plugins.ts'
import * as intentProvider from './intent.ts'
import * as toolsProvider from './tools.ts'
import * as skillsProvider from './skills.ts'
import * as memoryProvider from './memory.ts'
import * as advancedProvider from './advanced.ts'

/**
 * One expected provider module.
 *
 * `module` is `null` until the file exists ON DISK at build time. That is not a
 * stub of another lane's work: nothing is written to their path and nothing is
 * asserted about their content — the row simply records that this build had no
 * module to import, which is a true statement about the artifact.
 */
interface Binding {
  readonly key: ProviderKey
  readonly path: string
  readonly module: ProviderModule | null
}

/**
 * The six modules the CONTRACT names. The paths are workspace-relative so a
 * reader — and the `unavailable.reason` string — can go straight to the file.
 */
const BINDINGS: readonly Binding[] = Object.freeze([
  { key: 'plugins', path: 'plugins-src/dsh-meta-market/src/host/providers/plugins.ts', module: pluginsProvider },
  { key: 'tools', path: 'plugins-src/dsh-meta-market/src/host/providers/tools.ts', module: toolsProvider },
  { key: 'skills', path: 'plugins-src/dsh-meta-market/src/host/providers/skills.ts', module: skillsProvider },
  { key: 'memory', path: 'plugins-src/dsh-meta-market/src/host/providers/memory.ts', module: memoryProvider },
  { key: 'intent', path: 'plugins-src/dsh-meta-market/src/host/providers/intent.ts', module: intentProvider },
  { key: 'advanced', path: 'plugins-src/dsh-meta-market/src/host/providers/advanced.ts', module: advancedProvider },
])

/** The provider status table, for `/gui/health`. */
export function providerTable(): readonly { key: ProviderKey; path: string; landed: boolean }[] {
  return BINDINGS.map((binding) => ({ key: binding.key, path: binding.path, landed: binding.module !== null }))
}

/** The module path expected to answer a window, whether or not it landed. */
export function providerPathFor(id: WindowId): string {
  const row = rowFor(id)
  return BINDINGS.find((binding) => binding.key === row?.provider)?.path ?? 'unmapped provider key'
}

/**
 * The callable builder inside a provider namespace.
 *
 * Four shapes are accepted because four lanes are writing these files in parallel
 * and the cost of tolerating a shape is one lookup, while the cost of refusing it
 * is a window that reports "no builder" over a module that plainly has one:
 * a named `buildWindow`, a default-exported object carrying `buildWindow`, a
 * default-exported function, and a named `provide`.
 */
function resolveBuilder(module: ProviderModule): { fn: ((id?: WindowId) => unknown) | null; seen: readonly string[] } {
  const seen = Object.keys(module as Record<string, unknown>).sort()
  const candidates: unknown[] = []
  candidates.push((module as Record<string, unknown>).buildWindow)
  const fallback = module.default
  if (typeof fallback === 'function') candidates.push(fallback)
  if (fallback !== null && typeof fallback === 'object') {
    candidates.push((fallback as Record<string, unknown>).buildWindow)
  }
  candidates.push((module as Record<string, unknown>).provide)
  const fn = candidates.find((candidate): candidate is (id?: WindowId) => unknown => typeof candidate === 'function')
  return { fn: fn ?? null, seen }
}

/**
 * Does the module say it serves this window?
 *
 * A shared module (`advanced.ts`) declares `WINDOW_IDS`; a single-window module
 * declares `WINDOW_ID`. A module that declares neither is trusted, because a
 * lane that has not adopted the declaration should not lose its window over it —
 * but a module that declares the WRONG id is refused loudly, because the
 * alternative is serving one window's measurements under another window's label.
 */
function declares(module: ProviderModule, id: WindowId): { ok: true } | { ok: false; reason: string } {
  const single = module.WINDOW_ID
  const many = module.WINDOW_IDS
  if (Array.isArray(many)) {
    const ids = many.filter((entry): entry is string => typeof entry === 'string')
    if (ids.length > 0 && !ids.includes(id)) {
      return { ok: false, reason: `module declares WINDOW_IDS [${ids.join(', ')}] and does not serve '${id}'` }
    }
    return { ok: true }
  }
  if (typeof single === 'string' && single !== id) {
    return { ok: false, reason: `module declares WINDOW_ID '${single}' and was asked for '${id}'` }
  }
  return { ok: true }
}

/**
 * Ask one window's provider for its payload, never throwing.
 *
 * @param id - one of the ten window ids.
 * @returns an outcome carrying either a payload or a reason; always one of the three states.
 */
export async function callProvider(id: WindowId): Promise<ProviderOutcome> {
  const row = rowFor(id)
  const provider = row?.provider ?? 'unmapped'
  const path = providerPathFor(id)
  const measuredAt = new Date().toISOString()

  if (row === undefined) {
    return { windowId: id, provider, path, landed: false, payload: null, failed: { reason: `'${id}' is not one of the ten window ids`, measuredAt } }
  }

  const binding = BINDINGS.find((candidate) => candidate.key === row.provider)
  if (binding === undefined || binding.module === null) {
    return { windowId: id, provider, path, landed: false, payload: null, failed: null }
  }

  const { fn, seen } = resolveBuilder(binding.module)
  if (fn === null) {
    return {
      windowId: id,
      provider,
      path,
      landed: true,
      payload: null,
      failed: { reason: `provider module exported no builder; exports seen: [${seen.join(', ')}]`, measuredAt },
    }
  }

  const declaration = declares(binding.module, id)
  if (!declaration.ok) {
    return { windowId: id, provider, path, landed: true, payload: null, failed: { reason: declaration.reason, measuredAt } }
  }

  try {
    const result = await fn(id)
    if (result === null || typeof result !== 'object') {
      return {
        windowId: id,
        provider,
        path,
        landed: true,
        payload: null,
        failed: { reason: `provider returned ${result === null ? 'null' : typeof result} rather than a payload object`, measuredAt },
      }
    }
    return { windowId: id, provider, path, landed: true, payload: result as ProviderWindow, failed: null }
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return { windowId: id, provider, path, landed: true, payload: null, failed: { reason: `provider threw — ${reason}`, measuredAt: new Date().toISOString() } }
  }
}

/**
 * Ask every window, in registry order. Each call carries its own failure boundary.
 *
 * CONCURRENT SINCE 2026-10-18, AND THE FAILURE BOUNDARY IS UNCHANGED. This was a
 * sequential `for … await` loop, which made a ten-window read cost the SUM of ten
 * provider builds rather than the MAX. MEASURED on the live profile, 2026-10-18
 * 17:19:05–17:21:04 local, `/gui/section?window=<id>` twice per id (pass-1/pass-2
 * seconds): meta-plugins 42.84/32.91, meta-tools 4.04/6.18, meta-skills 1.79/5.07,
 * meta-memory 0.13/0.15, meta-intent 5.62/5.48, advanced 5.38/5.19, meta-agents
 * 1.58/0.06, meta-loops 0.15/0.21, meta-cordis 0.23/0.07, meta-community 0.11/0.04 —
 * a sequential sum of **61.87 s / 55.36 s** against a longest window of **42.84 s**.
 *
 * `callProvider` returns an OUTCOME for every path including a thrown provider (its
 * `try/catch` at the bottom is the boundary the module header requires), so it
 * never rejects: `Promise.all` cannot turn one window's failure into another
 * window's absence, and there is still no uncaught `Promise.all` here. Order is
 * preserved because `Promise.all` preserves input order, so the sections catalog
 * cannot be reordered by which provider finishes first.
 */
export async function collectOutcomes(ids: readonly WindowId[]): Promise<readonly ProviderOutcome[]> {
  return Promise.all(ids.map((id) => callProvider(id)))
}
