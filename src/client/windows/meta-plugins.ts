/**
 * `meta-plugins` — the primary window.
 *
 * Its subject is meta plugins ALIGNED TO INTENT that are either installed on this system or
 * downloadable. The window makes no claim of its own: everything it shows comes from the envelope,
 * and the two things it adds are instructions for reading the columns (this note) and the shared
 * self-checks in `parts.ts`.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaPluginsWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a meta plugin that is either installed on this system or downloadable. "installed" and "downloadable" are two separate three-state readings, and a cell that says NOT MEASURED is an absent reading — it is not false and not zero, so it must not be read as "not installed". The source line under each name says where the row came from: an installed row was read from a live route, a catalog row is list-only evidence that the plugin exists in the market.',
    ),
  )
}
