/**
 * `meta-tools` — the primary window for meta tools.
 *
 * The tool-specific thing this window must not get wrong is `kind`: a tool that exists today, a tool
 * this program will build, and a tagged future goal are three different claims, and a table that
 * showed one "available" column would flatten them.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { note, standardWindow } from './parts.ts'

export function metaToolsWindow(props: WindowViewProps): VElement {
  return standardWindow(
    props,
    note(
      'Every row is a meta tool. Read the kind column before the name: exists means measured on this system, plan means this program will build it, and future is a tagged goal — the three are never flattened into "available". The zone column gives the intent zones the tool scores against plus the method that produced each score, because a token match and an embedding cosine are different measurements and are not compared here.',
    ),
  )
}
