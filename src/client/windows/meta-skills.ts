/**
 * `meta-skills` — the primary window for meta skills.
 *
 * A skill is the place where "it exists" and "it is documented" most easily get confused, so this
 * window's note points the reader at the kind column and at the evidence line rather than at the
 * name.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaSkillsWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a meta skill. A plan row describes a skill this program will build and a future row a tagged goal, so neither is evidence that the skill is installed today; only an exists row with a live source line is. The alignment column carries the verdict and the evidence that produced it, so a reader can check the verdict instead of taking it.',
    ),
  )
}
