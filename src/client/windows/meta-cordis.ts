/**
 * `meta-cordis` — an advanced sub-window.
 *
 * The Cordis layer has a property no other window on this surface has: a bundles change hot-reloads
 * while everything else needs a restart. That means an `installed` reading can be newer than the
 * process serving the page, so the note says which reading is which.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaCordisWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a Cordis-side component: a plugin, a bundle row, or a context service this layer depends on. One reading needs care here — per the workspace rules a dsh.profile.bundles change hot-reloads while everything else needs a restart, so an "installed" cell can describe a newer state than the process that served this page is running. Where that distinction matters, the row source and the census time are the two fields to compare.',
    ),
  )
}
