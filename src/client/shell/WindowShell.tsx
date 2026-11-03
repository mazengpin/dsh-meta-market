/**
 * The window shell: two rails, one panel, one fetch, and the state machine that
 * sits between the route and the view.
 *
 * `#dsh-meta-market-window` is the root. The advanced sub-rail is rendered ONLY
 * while `advanced` is the active primary tab, and the panel's `data-mm-window`
 * names the window whose view is actually on screen — so under `advanced` the
 * panel says `meta-agents`, not `advanced`. Both identities are stated
 * (`data-mm-window` for the view, `data-mm-primary` for the tab that opened it)
 * because collapsing them would make "advanced selected, no sub-window chosen yet"
 * and "meta-cordis selected" the same rendered claim.
 *
 * THE FETCH IS CANCELLED, NOT MERELY IGNORED. A tab switch aborts the in-flight
 * request and the aborted rejection never reaches `setState`, which is what stops
 * a slow answer for the previous tab from painting over the current one. Ignoring
 * the result without aborting would leave the request running and the race would
 * still be decided by arrival order on a slower network.
 *
 * A FAILED REQUEST IS NOT RETRIED AUTOMATICALLY. There is a visible `Refresh`
 * button, and the error branch has its own `Retry`; a surface that silently
 * re-requests makes "the route is down" look like "the surface is slow".
 *
 * @module dsh-meta-market/client/shell/WindowShell
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { SectionError } from '../types.ts'
import type { SectionState, Translator, WindowId } from '../types.ts'
import { loadSection } from '../api.ts'
import { AdvancedTabRail, PrimaryTabRail } from './TabRail.tsx'
import { PanelFrame } from './PanelFrame.tsx'
import { mirrorLastOpen } from './openChannel.ts'
import type { MiniDocument } from './openChannel.ts'
import { ADVANCED_TAB, ADVANCED_TABS, PRIMARY_TABS, isAdvancedWindow } from './views.ts'

/** What the shell needs from the Client shell: a translator and nothing else. */
export interface WindowShellProps {
  readonly t: Translator
}

/**
 * The full window.
 * @param props - the injected translator.
 * @returns the window element.
 */
export function WindowShell(props: WindowShellProps): ReactElement {
  const { t } = props
  const [primary, setPrimary] = useState<WindowId>(PRIMARY_TABS[0])
  const [advancedWindow, setAdvancedWindow] = useState<WindowId>(ADVANCED_TABS[0])
  const [attempt, setAttempt] = useState(0)

  const effective: WindowId = primary === ADVANCED_TAB ? advancedWindow : primary
  const [state, setState] = useState<SectionState>({ kind: 'loading', window: effective })

  // Mirror the last open request onto THIS element, because the usual order is
  // dispatch-then-mount: the click that made the shell select this panel arrived
  // when no `#dsh-meta-market-window` existed, so the channel could only write the
  // record to `document.documentElement`. This effect closes that gap once, on
  // mount, so a verifier finds `data-mm-open` on the window root as well.
  useEffect(() => {
    mirrorLastOpen(typeof document === 'undefined' ? null : (document as unknown as MiniDocument))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading', window: effective })
    loadSection(effective, controller.signal)
      .then(envelope => {
        if (controller.signal.aborted) return
        setState({ kind: 'ready', window: effective, envelope })
      })
      .catch((error: unknown) => {
        // An aborted request is NOT a failure: it was superseded on purpose.
        if (controller.signal.aborted) return
        if (error instanceof SectionError) {
          setState({ kind: 'error', window: effective, failure: error.failure, message: error.message, status: error.status })
          return
        }
        setState({
          kind: 'error',
          window: effective,
          failure: 'malformed',
          message: error instanceof Error ? error.message : String(error),
          status: null,
        })
      })
    return () => {
      controller.abort()
    }
  }, [effective, attempt])

  /**
   * Switch window on a view's request (the `advanced` view's four launchers).
   * @param id - the window the view wants opened.
   */
  const openWindow = (id: WindowId): void => {
    if (id === ADVANCED_TAB) {
      setPrimary(ADVANCED_TAB)
      return
    }
    if (isAdvancedWindow(id)) {
      setPrimary(ADVANCED_TAB)
      setAdvancedWindow(id)
      return
    }
    setPrimary(id)
  }

  const label = (id: WindowId): string => t(`tab.${id}`)

  return (
    <div id="dsh-meta-market-window" className="mm-window">
      <header className="mm-head">
        <div className="mm-head-row">
          <h1 className="mm-h1">{t('title')}</h1>
          <button
            type="button"
            className="mm-btn"
            onClick={() => setAttempt(current => current + 1)}
            disabled={state.kind === 'loading'}
          >
            {t('refresh')}
          </button>
        </div>
        <p className="mm-sub">{t('subtitle')}</p>
      </header>

      <PrimaryTabRail
        tabs={PRIMARY_TABS}
        active={primary}
        label={label}
        ariaLabel={t('primaryRail')}
        onSelect={setPrimary}
      />

      {primary === ADVANCED_TAB ? (
        <AdvancedTabRail
          tabs={ADVANCED_TABS}
          active={advancedWindow}
          label={label}
          ariaLabel={t('advancedRail')}
          onSelect={setAdvancedWindow}
        />
      ) : null}

      <PanelFrame
        window={effective}
        primary={primary}
        state={state}
        t={t}
        onRetry={() => setAttempt(current => current + 1)}
        onOpenWindow={openWindow}
      />
    </div>
  )
}
