/**
 * `meta-agents` — an advanced sub-window.
 *
 * The agent layer is where "a member exists" and "a member is doing something" differ, so the note
 * points at the source line and at the controls rather than at the names.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaAgentsWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a member of the meta agent team. Read the source line under each name before treating two rows as alike: a row read from a live route describes this machine, while a catalog or community row is evidence that the entry exists and not that it is running here. The controls section below is where a member can be acted on — a read control changes nothing, and it says so.',
    ),
  )
}
