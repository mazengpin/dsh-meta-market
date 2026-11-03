/**
 * `meta-loops` — an advanced sub-window.
 *
 * A loop is the one subject in this surface where a green number is most likely to be read as proof,
 * so the note sends the reader to the falsifier list instead of to the census.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaLoopsWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a repeating improvement loop. The falsifier list at the bottom of this window matters more here than anywhere else on the surface: a loop reported as passing is a report that nothing that ran disagreed with its expectation, which is not the same claim as "the loop works". Read what would disprove each loop before reading its state.',
    ),
  )
}
