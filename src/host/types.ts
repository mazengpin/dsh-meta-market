/**
 * The Host surfaces this plugin uses, declared STRUCTURALLY.
 *
 * There is no `@deepseek-ai/*` import anywhere in this package — not a value
 * import and not a peer. The reason is the one `dsh-intent-map` records and it
 * applies unchanged: a cross-package value import is a load-order dependency in
 * somebody else's boot, and this plugin needs four members of `webServer` and
 * nothing else.
 *
 * **WHY A LOCAL DECLARATION IS NOT A DUPLICATION.** The Host's own boot context
 * is the authority; this interface is the SLICE of it this clone consumes, so a
 * host that grows a member does not require an edit here, and a host that
 * removes one this clone uses fails to typecheck rather than at runtime. The two
 * are related by structure, which is what makes a nominal import unnecessary.
 *
 * @module dsh-meta-market/host/types
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * The unregister function a successful registration returns.
 *
 * Named rather than inlined because `ctx.effect` returning it is the whole
 * mechanism by which a disposed plugin stops serving; a bare `() => void` at the
 * call site does not say what disposing means.
 */
export type RouteRegistrar = () => void

/** The slice of the Host context this plugin reads. */
export interface HostContext {
  readonly webServer: {
    /**
     * Register a route. `kind: 'prefix'` matches the whole subtree, which is what
     * lets one registration own several sub-routes.
     */
    register(route: {
      readonly kind: 'prefix'
      readonly path: string
      readonly handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void
    }): RouteRegistrar
  }
  /**
   * Scoped cleanup, so a disposed plugin leaves no route behind.
   *
   * The callback returns the disposer rather than being the disposer: the host
   * runs it during apply and holds what it returns, which is why this plugin
   * cannot register and clean up in two separate statements.
   */
  effect(callback: () => RouteRegistrar | void, label?: string): void
  readonly logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
  }
}

/**
 * ============================================================================
 * THE PROBE BOUND — one named constant, because four lanes independently guessed
 * ============================================================================
 *
 * MEASURED, all on 2026-10-17, all by different lanes, on different routes, with no
 * coordination:
 *
 *   - `prov-advanced` — 1,500 ms bound against a route whose cold cost is 1,367 ms;
 *   - `prov-tools-skills` — 1,500 ms bound against a measured floor of 1,611 ms
 *     (six reads: 1,611 / 1,720 / 1,760 / 1,888 / 2,083 / 3,999 ms), which made the
 *     probe a coin flip BY CONSTRUCTION and discarded four rows the provider held;
 *   - `prov-intent` — 2,000 ms bound; its window read answered at 22:19:45Z and
 *     unavailable at 22:20:16Z on one unchanged artifact;
 *   - and the meta-tools flicker that surfaced the family — `unavailable` at one
 *     request, four rows 68 seconds later, no code change.
 *
 * **FOUR LANES INVENTED A PROBE TIMEOUT, AND EVERY ONE SET IT BELOW THE LATENCY IT
 * WAS MEASURING.** That is not four bugs; it is one missing shared constant. Every
 * lane measured its own route's speed AFTER its window had already flickered, and
 * each came back with a number that would have been right on the first try if it had
 * existed here.
 *
 * THE RULE, in the form a lane can execute rather than remember: **measure the route
 * at least six times, and set the bound at 1.25x the WORST observed.** The worst, not
 * the median — a bound is a ceiling, and a ceiling fitted to the middle of a
 * distribution is a coin. `probeBoundMs` below is that arithmetic so it does not have
 * to be re-remembered.
 *
 * A TIMEOUT IS A MEASUREMENT AND MUST NOT BE REPORTED AS AN ABSENCE: a probe that
 * exceeded its bound says "silence for N ms", which is a reading. So a slow live
 * probe belongs in `ProviderWindow.stale`, keeping the rows the provider already
 * has, and NOT in `unavailable`, which is reserved for "nothing was measured at all".
 */
export const PROVIDER_PROBE_BOUND_MS = 5_000

/** The rule stated so it can be cited in a review, beside `probeBoundMs`. */
export const PROVIDER_PROBE_BOUND_RULE =
  'measure the probed route at least six times on the live process; set the bound at 1.25x the WORST observed — never at the median, and never below the worst, because a bound below the worst is a coin flip by construction'

/**
 * The bound implied by a measurement.
 *
 * @param worstObservedMs the slowest of at least six live reads.
 * @returns 1.25x that, rounded up, so the arithmetic cannot drift from the rule.
 */
export function probeBoundMs(worstObservedMs: number): number {
  return Math.ceil(worstObservedMs * 1.25)
}

/**
 * ============================================================================
 * THE GUI WINDOW CONTRACT — landed EARLY, on purpose, because it is a SEAM
 * ============================================================================
 *
 * Six provider modules are being written by four other lanes at the same time as
 * this file (`providers/plugins.ts`, `tools.ts`, `skills.ts`, `memory.ts`,
 * `intent.ts`, `advanced.ts`). They cannot import a type that does not exist yet,
 * and this assembly cannot compose a payload whose shape is re-invented per
 * window. So the shape is fixed HERE, first, and the provider lanes are told the
 * exact exported names rather than being left to guess them.
 *
 * **THE SHAPE IS `research/meta-market-gui/CONTRACT.md`'s ENVELOPE, and this file
 * is not a second definition of it** — it is that envelope transcribed into the
 * type system. Where the two could disagree, the CONTRACT wins and this file is
 * wrong; `lead` owns the CONTRACT and no lane edits it.
 *
 * THE THREE `kind` VALUES ARE NEVER FLATTENED
 *
 * `exists` / `plan` / `future` is this program's most-repeated distinction: an
 * `exists` claim carries evidence, a `plan` claim carries an owner and a task,
 * and a `future` claim is a tagged goal that is not scheduled. Collapsing any two
 * of them into "we have it" is the defect the whole workspace is built against,
 * so `kind` is a required FIELD on every window and every item.
 *
 * @module dsh-meta-market/host/types
 */

/** The three kinds, kept distinct everywhere. */
export type ThreeKind = 'exists' | 'plan' | 'future'

/**
 * The ten window ids, in the CONTRACT's order: six primary, then the four that
 * `advanced` contains. The order is part of the contract because it is the tab
 * order, so the registry below preserves it rather than sorting it.
 */
export type WindowId =
  | 'meta-plugins'
  | 'meta-tools'
  | 'meta-skills'
  | 'meta-memory'
  | 'meta-intent'
  | 'advanced'
  | 'meta-agents'
  | 'meta-loops'
  | 'meta-cordis'
  | 'meta-community'

/** One zone match, `method` stated because an embedding score and a token score are not comparable. */
export interface ZoneMatch {
  readonly zone: string
  readonly score: number
  readonly method: 'embedding' | 'token'
}

/** A named collision against a stable, official or existing meta plugin. */
export interface Collision {
  readonly id: string
  readonly why: string
}

/** The original-intent check's result, as the item carries it. */
export interface IntentMatch {
  readonly zones: readonly ZoneMatch[]
  readonly originalIntent: 'pass' | 'collide' | 'not-measured'
  readonly collidesWith: readonly Collision[]
}

/** The alignment verdict, with the place it can be checked. */
export interface Alignment {
  readonly verdict: 'aligned' | 'collides' | 'not-measured'
  readonly why: string
  readonly evidence: string
}

/** A reviewable, reversible patch attached to an item. */
export interface PatchRef {
  readonly available: true
  readonly artifact: string
  readonly applies: string
}

/** Where an item was found: on this system, in the catalog, or in the community clone. */
export interface ItemSource {
  readonly where: 'installed' | 'catalog' | 'community'
  readonly route?: string
  readonly row?: number
}

/**
 * One row in a window.
 *
 * `installed` and `downloadable` are `boolean | null`, and the `null` is
 * load-bearing: it means **NOT MEASURED**, never "false". A provider that could
 * not probe a catalog must say `null`, because `false` asserts a measurement it
 * did not take.
 */
export interface WindowItem {
  readonly id: string
  readonly name: string
  readonly npm: string | null
  readonly owner: string | null
  readonly kind: ThreeKind
  readonly installed: boolean | null
  readonly downloadable: boolean | null
  readonly source: ItemSource
  readonly intent: IntentMatch
  readonly alignment: Alignment
  readonly patch: PatchRef | null
}

/** A control offered by a window. `kind: 'write'` must have been driven once with its outcome shown. */
export interface Control {
  readonly id: string
  readonly label: string
  readonly kind: 'read' | 'write'
  readonly target: string
  readonly demonstrable: boolean
}

/** A claim that could be false, and the check that would show it. */
export interface Falsifier {
  readonly claim: string
  readonly how: string
}

/**
 * A count with its population and its census time.
 *
 * `numerator` and `denominator` allow `null` for the same reason `installed`
 * does: an unmeasurable count is absent, and a `0` there would be a reading the
 * provider never took.
 */
export interface Census {
  readonly numerator: number | null
  readonly denominator: number | null
  readonly population: string
  readonly at: string
}

/** What a window says about itself, independent of what it contains. */
export interface WindowMeta {
  readonly id: WindowId
  readonly label: string
  readonly description: string
  readonly kind: ThreeKind
}

/**
 * What a provider may return.
 *
 * EVERY FIELD IS OPTIONAL, and that is deliberate rather than lax. A provider is
 * another lane's deliverable and its shape may land in any order; the assembly is
 * the one place that knows the envelope, so the provider states what it measured
 * and this assembly fills the rest with honest absences. A required-field
 * contract would push the assembly's knowledge into six files and let one lane's
 * omission break the whole window.
 */
export interface ProviderWindow {
  readonly items?: readonly WindowItem[]
  readonly census?: Partial<Census>
  readonly controls?: readonly Control[]
  readonly falsifiers?: readonly Falsifier[]
  readonly unavailable?: { readonly reason: string; readonly measuredAt: string } | null
  /**
   * A FIRST-CLASS DEGRADED-READ MARKER, added at `prov-tools-skills`'s request.
   *
   * That lane was fusing two different states into `unavailable` — "this window has
   * nothing to say" and "the live probe did not answer" — so a 1,500 ms timeout
   * below the route's own 1,611 ms measured floor discarded four rows the provider
   * already held, and `/gui/sections` printed `unavailable` on one request and four
   * rows on the next with no code change between them. `stale` separates them:
   * **`unavailable` means nothing was measured; `stale` means the window answered
   * from a census and its LIVE read did not succeed.** Both are visible; neither is
   * inferred from the other, and a row is never discarded to express a slow socket.
   *
   * The lane's only top-level slot before this was `window.description` — prose a
   * client cannot branch on. A marker a renderer can branch on is the difference
   * between a caption and a state.
   */
  readonly stale?: { readonly reason: string; readonly boundMs: number | null; readonly at: string } | null
  /** A provider may correct the registry's `description`/`kind`; identity is never provider-owned. */
  readonly window?: { readonly description?: string; readonly kind?: ThreeKind }
}

/** The exported function a provider module must carry. */
export type ProviderBuild = (windowId?: WindowId) => ProviderWindow | Promise<ProviderWindow>

/**
 * What a provider MODULE looks like from here, structurally, so a namespace
 * import can be inspected without asserting an export that may not be there yet.
 */
export interface ProviderModule {
  readonly WINDOW_ID?: unknown
  readonly WINDOW_IDS?: unknown
  readonly buildWindow?: unknown
  readonly default?: unknown
}

/**
 * What the provider composition hands to the envelope assembly for one window.
 *
 * `landed: false` means the provider MODULE was not on disk when this build's
 * static import set was fixed — a build-time absence, not a runtime failure.
 * `failed` carries a provider that existed and threw. **These are kept apart
 * because "the file is not there" and "the file ran and broke" are different
 * facts about the system, and a single `error` field would merge them.
 */
export interface ProviderOutcome {
  readonly windowId: WindowId
  /** The provider module key from the registry (`plugins`, `tools`, …). */
  readonly provider: string
  /** Workspace-relative path of the module that was expected to answer. */
  readonly path: string
  readonly landed: boolean
  readonly payload: ProviderWindow | null
  readonly failed: { readonly reason: string; readonly measuredAt: string } | null
}

/** The envelope every one of the ten windows answers with. */
export interface WindowEnvelope {
  readonly window: WindowMeta
  readonly generatedAt: string
  readonly census: Census
  readonly items: readonly WindowItem[]
  readonly unavailable: { readonly reason: string; readonly measuredAt: string } | null
  /**
   * Non-null when the window answered from a non-live census (see
   * `ProviderWindow.stale`): the rows are real, the LIVE read did not succeed, and
   * a renderer can show that distinction instead of prose.
   */
  readonly stale: { readonly reason: string; readonly boundMs: number | null; readonly at: string } | null
  readonly controls: readonly Control[]
  readonly falsifiers: readonly Falsifier[]
}
