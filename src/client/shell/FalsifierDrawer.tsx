/**
 * The falsifier drawer: what could be false about this window, and the check that
 * would show it.
 *
 * A window that declares no falsifier is REPORTED, not silently rendered as a
 * clean row. The program's rule is that a check with nothing able to fail it is a
 * caption rather than a check, so its absence is a finding and the drawer says so
 * in words.
 *
 * A native `<details>` element is used rather than a stateful custom disclosure
 * for two reasons: it needs no state, so it cannot desynchronise from the panel,
 * and it is openable by a keyboard user and a verifier alike — a test can set the
 * `open` attribute without simulating a click.
 *
 * @module dsh-meta-market/client/shell/FalsifierDrawer
 */

import type { ReactElement } from 'react'
import type { Falsifier, Translator } from '../types.ts'

/** The drawer's props. */
export interface FalsifierDrawerProps {
  readonly falsifiers: readonly Falsifier[]
  readonly t: Translator
}

/**
 * The falsifier drawer.
 * @param props - the window's falsifiers and the translator.
 * @returns the drawer element.
 */
export function FalsifierDrawer(props: FalsifierDrawerProps): ReactElement {
  const count = props.falsifiers.length
  return (
    <details className="mm-falsifiers" data-mm-falsifiers={count}>
      <summary>
        {props.t('falsifiers')} ({count})
      </summary>
      {count === 0 ? (
        <p className="mm-warnp" data-mm-falsifiers-empty="true">{props.t('noFalsifiers')}</p>
      ) : (
        <ul className="mm-falsifier-list">
          {props.falsifiers.map(falsifier => (
            <li key={falsifier.claim} className="mm-falsifier">
              <span className="mm-falsifier-claim">{falsifier.claim}</span>
              <span className="mm-falsifier-how">{falsifier.how}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
