/**
 * `meta-community` — an advanced sub-window.
 *
 * `dsh-meta-community` is authorized by `D-0080` and is READ-ONLY to this program. The banner below
 * makes that visible on the surface itself rather than leaving it in a decision record a reader of the
 * GUI will never open: a window that can be mistaken for a write target should say it is not one.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { el, note, standardWindow } from './parts.ts'

const READ_ONLY_NOTICE = el(
  'p',
  { class: 'mm-readonly', 'data-mm-component': 'readonly', role: 'note' },
  'READ-ONLY: the community meta layer is authorized read-only to this program (D-0080). This window reads it; nothing on this surface writes to it, and a row describing a change is describing a patch, not an applied write.',
)

export function metaCommunityWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is an entry in the community meta layer, read from it and never written back. The source line distinguishes a row that was read from the live community surface from one that came from a catalog listing, and the two carry different weight: the first is a reading of that layer today, the second is evidence that the entry is listed somewhere.',
    ),
    READ_ONLY_NOTICE,
  )
}
