/**
 * The view registry: ten windows, one id each, and the single entry point a host shell calls.
 *
 * `shell-client` imports `renderView` (and optionally `VIEWS`), so the shell never needs a switch over
 * window ids that a new window could silently fall through. Every id in `WINDOW_IDS` HAS a view — the
 * type `Record<WindowId, WindowView>` makes a missing one a compile error rather than a blank panel.
 */
import type { VElement, WindowId, WindowView, WindowViewProps } from './types.ts'
// `PRIMARY_WINDOW_IDS` / `ADVANCED_WINDOW_IDS` / `WINDOW_IDS` are DECLARED ONCE in `./types.ts` and
// re-exported below by `export *`, so the shell reads the same arrays the views read. A second
// literal here would be two encodings of one fact and could put the tab rail in an order the view map
// does not agree with.
import { WINDOW_IDS } from './types.ts'
import { el } from './parts.ts'
import { metaPluginsWindow } from './meta-plugins.ts'
import { metaToolsWindow } from './meta-tools.ts'
import { metaSkillsWindow } from './meta-skills.ts'
import { metaMemoryWindow } from './meta-memory.ts'
import { metaIntentWindow } from './meta-intent.ts'
import { advancedWindow } from './advanced.ts'
import { metaAgentsWindow } from './meta-agents.ts'
import { metaLoopsWindow } from './meta-loops.ts'
import { metaCordisWindow } from './meta-cordis.ts'
import { metaCommunityWindow } from './meta-community.ts'

/** One view per window id. The type is total, so an id cannot be added to the contract and forgotten here. */
export const VIEWS: Record<WindowId, WindowView> = {
  'meta-plugins': metaPluginsWindow,
  'meta-tools': metaToolsWindow,
  'meta-skills': metaSkillsWindow,
  'meta-memory': metaMemoryWindow,
  'meta-intent': metaIntentWindow,
  advanced: advancedWindow,
  'meta-agents': metaAgentsWindow,
  'meta-loops': metaLoopsWindow,
  'meta-cordis': metaCordisWindow,
  'meta-community': metaCommunityWindow,
}

/**
 * An unknown id renders a VISIBLE message naming itself and the ten known ids.
 *
 * A blank panel is the one failure mode this surface cannot afford: it is indistinguishable from a
 * window whose population is empty, which is exactly the confusion the whole `unavailable` contract
 * exists to prevent.
 */
function unknownWindowView(id: string): VElement {
  return el(
    'section',
    { class: 'mm-window mm-window-unknown', 'data-mm-view': 'unknown', 'data-mm-unknown-window': id },
    el('header', { class: 'mm-header' }, el('h3', { class: 'mm-title' }, `Unknown window id: ${id}`)),
    el('p', { class: 'mm-warn' }, `No view is registered for "${id}". The ten known ids are: ${WINDOW_IDS.join(', ')}. This is a visible refusal, not an empty window — an empty window would read as "no plugins".`),
  )
}

/** Render one window. The root is always an element; an unknown id is a rendered message, never null. */
export function renderView(id: WindowId, props: WindowViewProps): VElement {
  const view: WindowView | undefined = VIEWS[id]
  if (view === undefined) return unknownWindowView(typeof id === 'string' ? id : String(id))
  return view(props)
}

export { toElement, domFactory, reactFactory } from './dom.ts'
export * from './types.ts'
