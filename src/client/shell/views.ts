/**
 * The one place the shell touches the view layer.
 *
 * `windows-client` owns `src/client/windows/**`; this file is the shell's single
 * import site for it, so the seam is one module wide. That matters twice: the ten
 * window ids come FROM the view layer (one encoding of the list, not two that can
 * disagree), and the render call is the one function the two lanes negotiated.
 *
 * THE NEGOTIATED SHAPE, as `windows-client` published it: the views return a
 * plain serializable `VElement` rather than a React component, so the same view
 * code serves a DOM host and this React shell. `toElement(view, reactFactory(h))`
 * walks that tree into React elements; `h` is react's own `createElement`, passed
 * through unchanged because `reactFactory` takes `unknown` on purpose — react's
 * `createElement` overloads do not unify with a nominal factory alias under
 * `strictFunctionTypes`, and a nominal parameter would only force a cast here.
 *
 * The cast on the return value is `as ReactNode` because `toElement` is declared
 * `unknown`: it is a DOM-or-React seam and its output type depends on which
 * factory was handed to it. `renderView` guarantees an ELEMENT root (never a
 * string, array or fragment), so this is a narrowing of a value the view layer
 * has already constrained.
 *
 * @module dsh-meta-market/client/shell/views
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import {
  ADVANCED_WINDOW_IDS,
  PRIMARY_WINDOW_IDS,
  WINDOW_IDS,
  reactFactory,
  renderView,
  toElement,
} from '../windows/index.ts'
import type { WindowEnvelope, WindowId } from '../types.ts'

/**
 * The primary rail's ids, in CONTRACT order.
 *
 * Re-exported from the view layer rather than re-declared: two literals for one
 * ordering is exactly the class of defect this program has paid for (a `54` that
 * no instrument could reproduce), and a rail that disagrees with the view map
 * would render a button whose panel does not exist.
 */
export const PRIMARY_TABS: readonly WindowId[] = PRIMARY_WINDOW_IDS

/** The advanced rail's ids, in CONTRACT order. */
export const ADVANCED_TABS: readonly WindowId[] = ADVANCED_WINDOW_IDS

/** All ten ids, in CONTRACT order. */
export const ALL_TABS: readonly WindowId[] = WINDOW_IDS

/** The primary tab that opens the sub-rail. A named constant, not a scattered literal. */
export const ADVANCED_TAB: WindowId = 'advanced'

/**
 * Is this a primary id or an advanced one?
 * @param id - any window id.
 * @returns true when the id belongs to the advanced rail.
 */
export function isAdvancedWindow(id: WindowId): boolean {
  return ADVANCED_WINDOW_IDS.includes(id)
}

/**
 * Render one window's view into a React node.
 *
 * @param id - the window to render.
 * @param envelope - the parsed payload. Required: the shell renders its own
 *   loading/error states and calls this only with a real envelope.
 * @param onOpenWindow - lets a view ask the shell to switch windows (the
 *   `advanced` view's four launcher buttons).
 * @returns a React node, ready to be placed in the panel.
 */
export function renderWindow(
  id: WindowId,
  envelope: WindowEnvelope,
  onOpenWindow?: (next: WindowId) => void,
): ReactNode {
  const view = renderView(id, onOpenWindow === undefined ? { envelope } : { envelope, onOpenWindow })
  return toElement(view, reactFactory(createElement)) as ReactNode
}
