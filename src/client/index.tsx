/**
 * Client half of `dsh-meta-market`.
 *
 * THREE REGISTRATIONS, and the pairing is the point:
 *
 *  1. this plugin's dictionary in the shared locale service;
 *  2. **one nav row** in `sidebar.panellist`;
 *  3. **one keyed `main` panel** behind that row, because a row whose panel does
 *     not exist throws on the first click.
 *
 * THE TRAP THIS FILE IS WRITTEN AROUND, copied from `dsh-intent-map` because it is
 * a property of the SEAM and not of that plugin:
 *
 *   **the row's `id` in `sidebar.panellist` must equal the panel's `key` in `main`.**
 *
 * The two slots spell identity differently. `sidebar.panellist` is a LIST and
 * builds its rows from `options.id`; `main` is `kind: 'keyed'` and `ui-layout`
 * matches `entry.options.key`. Registering `{ id: X }` in both slots looks
 * correct, satisfies a naive "same identity" review, and still throws on the first
 * click — the worst failure shape available here, because the row RENDERS and the
 * user's own click looks broken. {@link MARKET_ROW_ID} and {@link MARKET_MAIN_KEY}
 * are therefore two separate declarations of one value.
 *
 * **`main` is `scope: 'root'`, so the page gets no `useProjection` and no
 * `sessionId`** — it reads its own route over `fetch`, and this file passes it
 * nothing but the injected translator.
 *
 * The registrations go through `ctx.slots.inject`, not a bare `register`: both
 * slots are declared by OTHER packages, and a bare `register` into an undeclared
 * slot throws at load.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: it does not render the panel's body.
 * The ten windows live under `src/client/windows/**`, owned by another lane, and
 * the shell reaches them through exactly one module (`./shell/views.ts`). Nor does
 * it decide that the plugin is mounted — `cordis.patch.yml` carries the row and no
 * profile consumes it yet, so the window exists as a `plan` until the owner
 * restarts their session.
 *
 * @module dsh-meta-market/client
 */

import { createElement as h, type ReactElement } from 'react'
import { LOCALE_NS, en } from './shell/locales.ts'
import { MarketPage } from './shell/Page.tsx'
import { installOpenChannel } from './shell/openChannel.ts'
import type { MiniDocument } from './shell/openChannel.ts'
import type { ClientContext, Translator } from './types.ts'
// Side-effect imports: the build inlines each CSS file as ONE `<style data-plugin>`
// tag at factory execution, which is how the module system attributes and reclaims
// the plugin's styles. `./windows/windows.css` belongs to the view layer and is
// imported HERE and nowhere else, so it is emitted exactly once; a bare import in
// a `.ts` module would also fail `tsc` without the `*.css` declaration in
// `./shell/styles.d.ts`.
import './styles.css'
import './windows/windows.css'

/** Loader row name; the Client bundle registers itself under this same id. */
export const name = 'dsh-meta-market'

/** The three Client services this half reads. `layout` is the panel-selection face. */
export const inject = ['slots', 'locale', 'layout']

/**
 * The panel's identity, declared once per spelling.
 *
 * {@link MARKET_ROW_ID} is the `sidebar.panellist` row's `id`; {@link MARKET_MAIN_KEY}
 * is the `main` panel's `key`. They hold the same string ON PURPOSE — see the
 * module header — and both are namespaced so they cannot collide with a shipped
 * panel id.
 */
const MARKET_ROW_ID = 'dsh-meta-market:market'
/** The `main` key the row selects. MUST equal {@link MARKET_ROW_ID}. */
const MARKET_MAIN_KEY = 'dsh-meta-market:market'

/** Position among the global panel rows, ascending. Sits after the siblings' rows. */
const MARKET_ROW_ORDER = 6.6

/**
 * The row's glyph, drawn inline so the bundle needs no asset fetch.
 * @returns the svg element.
 */
function MarketRowIcon(): ReactElement {
  return h(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    h('path', { d: 'M2 6.5 8 3l6 3.5-6 3.5-6-3.5Z' }),
    h('path', { d: 'M2 10.5 8 14l6-3.5' }),
    h('path', { d: 'M2 8.5 8 12l6-3.5' }),
  )
}

/**
 * Register the dictionary, the nav row and the keyed main panel.
 * @param ctx - the Client plugin context (`slots`, `locale`, `effect`, `logger`).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NS, 'en', en as unknown as Record<string, string>),
    'dsh-meta-market: en dictionary',
  )

  const t: Translator = ctx.locale.bind(LOCALE_NS)

  // The `main` panel FIRST, so the row below can never select a key that does not
  // exist yet. A ROOT-scope KEYED panel: identity is `key`, and the page receives
  // no session seat.
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: MARKET_MAIN_KEY,
        locale: LOCALE_NS,
        registrant: 'dsh-meta-market',
        inject: () => ({ t }),
      },
      MarketPage as unknown as (props: Record<string, unknown>) => ReactElement | null,
    ),
  )

  // The `sidebar.panellist` row. A LIST row, so the identity is `id` — and it must
  // equal the `main` key above or the click throws.
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: MARKET_ROW_ID,
        order: MARKET_ROW_ORDER,
        label: () => t('row'),
        locale: LOCALE_NS,
        registrant: 'dsh-meta-market',
        inject: () => ({ t }),
      },
      MarketRowIcon,
    ),
  )

  // The OPEN CHANNEL: the listener `dsh-market`'s "Meta-Market" button dispatches
  // against. It is wrapped in `ctx.effect` for the same reason every registration
  // above is — a hot reload re-runs `apply`, and an un-removed listener would stack
  // one more copy per reload, so a single click would open the window N times with
  // no error anywhere. `installOpenChannel` returns the SAME function reference it
  // added; the disposer removes exactly that one.
  //
  // It is installed HERE and not inside the page component on purpose: the request
  // arrives while this plugin's panel has never been rendered (that is the normal
  // case — the user is looking at ANOTHER plugin's panel), so a listener living in
  // the page would not exist yet. Module install + module-scope `lastOpen` is what
  // lets the record survive the dispatch-then-mount gap.
  if (typeof window !== 'undefined') {
    ctx.effect(() => {
      const channel = installOpenChannel({
        mainKey: MARKET_MAIN_KEY,
        rowLabel: () => t('row'),
        // The layout face is resolved at CALL time and its absence is a THROW rather
        // than a captured `undefined`: a service that arrives a moment after this
        // plugin does must still be used, and if it never arrives the channel's
        // catch turns the throw into the row-click fallback with a logged reason.
        // Capturing `ctx.layout === undefined ? undefined : …` at install time would
        // have frozen a boot-ordering accident into a permanent choice.
        selectPanel: key => {
          const face = ctx.layout
          if (face === undefined) throw new Error('the layout service is not available, so no keyed main panel can be selected')
          face.selectPanel(key)
        },
        target: window,
        doc: document as unknown as MiniDocument,
        logger: ctx.logger,
      })
      return () => channel.dispose()
    }, 'dsh-meta-market: open channel')
  }

  ctx.logger.info(
    `dsh-meta-market: client active; nav row ${MARKET_ROW_ID}@${MARKET_ROW_ORDER} with keyed main twin ${MARKET_MAIN_KEY}, plus the en dictionary`,
  )
}
