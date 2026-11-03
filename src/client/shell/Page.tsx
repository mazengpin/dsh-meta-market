/**
 * The shell's page component, and the translator fallback that keeps a locale
 * failure from blanking the window.
 *
 * The `main` slot hands the registered component its `inject` result. If the
 * locale service did not deliver `t` — a boot ordering problem rather than a bug
 * in this file — the page still renders, and every string falls back to its own
 * KEY. A window whose labels read `tab.meta-plugins` is visibly wrong; a window
 * that throws because `t` was undefined is a BLANK PANEL, which is
 * indistinguishable from "nothing is installed". This program has a rule about
 * that difference, so the fallback is deliberate rather than defensive clutter.
 *
 * @module dsh-meta-market/client/shell/Page
 */

import type { ReactElement } from 'react'
import type { Translator } from '../types.ts'
import { WindowShell } from './WindowShell.tsx'

/** A translator that returns its own key, so a missing dictionary is visible. */
const KEY_AS_LABEL: Translator = key => key

/**
 * The page the `main` slot renders.
 * @param props - the injected props; `t` when the locale service answered.
 * @returns the window element.
 */
export function MarketPage(props: Record<string, unknown>): ReactElement {
  const injected = props['t']
  const t: Translator = typeof injected === 'function' ? (injected as Translator) : KEY_AS_LABEL
  return <WindowShell t={t} />
}
