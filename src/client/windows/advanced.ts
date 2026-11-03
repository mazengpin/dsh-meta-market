/**
 * `advanced` — the launcher view.
 *
 * This window is a LIST OF DOORS, not a data view. It shows the four advanced sub-windows as buttons
 * and explains each one, and it deliberately does NOT render the sub-rail: `CONTRACT.md` puts the
 * sub-rail in the shell as `#dsh-meta-market-advanced-tabs` with `button[data-mm-subtab]` children,
 * and a second copy here would give a verifier two sets of selection controls that can disagree.
 *
 * The buttons therefore carry `data-mm-open`, a DIFFERENT attribute from `data-mm-subtab`, so the
 * two sets are distinguishable by a query and not only by their position on screen. The activation
 * path is `props.onOpenWindow` — no ambient state is read — and when the shell supplies no handler the
 * buttons are rendered disabled WITH THE REASON VISIBLE rather than as buttons that silently do
 * nothing.
 */
import type { VElement, WindowViewProps } from './types.ts'
import { ADVANCED_WINDOW_IDS } from './types.ts'
import { el, elOn, bodyBlock, windowFrame } from './parts.ts'

/**
 * What each advanced window is ABOUT.
 *
 * These sentences name the subject and nothing else. They are not measurements and the window does
 * not present them as ones: what each sub-window actually contains is carried by that sub-window's own
 * payload, and this launcher never speaks for it.
 */
const SUBJECTS: Record<string, string> = {
  'meta-agents': 'The agent-team window: the members of this meta layer and what each one operates.',
  'meta-loops': 'The meta-loops window: the repeating improvement loops and the state each one is in.',
  'meta-cordis': 'The meta-cordis window: the Cordis-side components this layer depends on and how they are mounted.',
  'meta-community': 'The meta-community window: the sibling meta layer this program reads but must not write to.',
}

function launcherList(props: WindowViewProps): VElement {
  const open = props.onOpenWindow
  const wired = typeof open === 'function'
  return el(
    'div',
    { class: 'mm-launchers', 'data-mm-component': 'launchers' },
    el('p', { class: 'mm-heading' }, 'The four advanced windows'),
    el(
      'ul',
      { class: 'mm-launcher-list' },
      ...ADVANCED_WINDOW_IDS.map(id =>
        el(
          'li',
          { class: 'mm-launcher', 'data-mm-launcher': id },
          elOn(
            'button',
            {
              type: 'button',
              class: 'mm-launcher-button',
              'data-mm-open': id,
              'aria-disabled': wired ? null : 'true',
              disabled: wired ? null : 'disabled',
              title: wired ? `Open the ${id} window` : 'This launcher is not connected to the window switcher, so it cannot change the window. The shell\'s own sub-rail still opens it.',
            },
            wired
              ? [{ type: 'click', handler: (): void => { open?.(id) } }]
              : [],
            id,
          ),
          el('p', { class: 'mm-launcher-subject' }, SUBJECTS[id] ?? 'subject NOT STATED'),
        ),
      ),
    ),
    wired
      ? null
      : el('p', { class: 'mm-warn' }, 'These launchers are shown disabled because the shell did not connect them: the window switcher was not supplied, so a press here could not change the window. They are rendered with the reason rather than as buttons that silently do nothing, and the shell\'s own sub-rail still opens all four.'),
    el('p', { class: 'mm-note' }, 'The advanced sub-rail belongs to the shell. These buttons are a second, in-content way to reach the same four windows; they are a shortcut to the rail, not a second copy of it, so the two cannot disagree about which window is open.'),
  )
}

export function advancedWindow(props: WindowViewProps): VElement {
  return windowFrame(props, [
    launcherList(props),
    bodyBlock(props.envelope),
  ])
}
