/**
 * `meta-memory` — the primary window for the memory layer.
 *
 * The memory layer is the one place in this surface where a catalog row and an installed row can
 * describe the same name, so the note is about the difference between them rather than about the
 * memory layer's design.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaMemoryWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a memory-layer component. The source line under each name is load-bearing here: an installed row was read from a live route on this machine, while a catalog row is list-only evidence that the entry exists in the market and was NOT probed here. Two rows that look alike can therefore be very different strengths of evidence, so read the source before comparing them.',
    ),
  )
}
