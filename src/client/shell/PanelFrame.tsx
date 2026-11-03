/**
 * The panel frame: `#dsh-meta-market-panel[data-mm-window]`, and the ONE place the
 * shell decides what a state LOOKS like.
 *
 * THREE NOT-READY STATES AND FOUR READY ONES, each rendered differently, because
 * collapsing any two of them makes two different facts about the system print the
 * same sentence:
 *
 *   `loading`        — a request is in flight;
 *   `error`          — four distinct failures (`unreachable` / `unmounted` /
 *                      `rejected` / `malformed`), each with its own sentence, the
 *                      HTTP status when there was one, and the route's own body
 *                      when it gave a reason;
 *   `ready` + rows   — the view produced rows;
 *   `ready` + 0 rows — a GENUINE empty result when the census denominator is a
 *                      measured number greater than zero, said in words;
 *   `ready` + 0 rows + 0 denominator — reported as INSTRUMENT FAILURE rather than
 *                      as a pass, because a `0` on both sides of a comparison is
 *                      the instrument failing to see its subject;
 *   `ready` + no tree — a DEFECT: the view converted to nothing, which on screen
 *                      would be an empty panel and is indistinguishable from "no
 *                      plugins installed". This branch exists because the shell
 *                      counts what came out of the conversion instead of trusting
 *                      it.
 *
 * The `data-mm-state` attribute carries the branch that was taken, so a verifier
 * can assert the rendering decision without parsing prose.
 *
 * @module dsh-meta-market/client/shell/PanelFrame
 */

import type { ReactElement } from 'react'
import type { SectionState, Translator, WindowEnvelope, WindowId } from '../types.ts'
import { CensusStrip } from './CensusStrip.tsx'
import { FalsifierDrawer } from './FalsifierDrawer.tsx'
import { auditRows, measuredCount } from './rows.ts'
import { renderWindow } from './views.ts'

/** The panel's props. */
export interface PanelFrameProps {
  /** The window whose payload is on screen — the sub-window while `advanced` is active. */
  readonly window: WindowId
  /** The primary tab that owns it, so the panel states both identities rather than only one. */
  readonly primary: WindowId
  readonly state: SectionState
  readonly t: Translator
  readonly onRetry: () => void
  readonly onOpenWindow: (id: WindowId) => void
}

/**
 * The loading branch.
 * @returns the element.
 */
function LoadingView(): ReactElement {
  return (
    <div className="mm-state mm-state-loading" data-mm-state="loading" role="status">
      <span className="mm-spinner" aria-hidden="true" />
      <span>…</span>
    </div>
  )
}

/**
 * The error branch, one sentence per failure.
 * @param props - the failure, its message and the status when there was one.
 * @returns the element.
 */
function ErrorView(props: {
  readonly failure: 'unreachable' | 'unmounted' | 'rejected' | 'malformed'
  readonly message: string
  readonly status: number | null
  readonly t: Translator
  readonly onRetry: () => void
}): ReactElement {
  return (
    <div className="mm-state mm-state-error" data-mm-state="error" data-mm-failure={props.failure} role="alert">
      <p className="mm-err">{props.t(`fail.${props.failure}`)}</p>
      <p className="mm-muted">
        {props.status === null ? 'no HTTP status — the request never completed' : `HTTP ${props.status}`}
        {props.message === '' ? '' : ` · ${props.message}`}
      </p>
      <button type="button" className="mm-btn mm-btn-primary" onClick={props.onRetry}>
        {props.t('retry')}
      </button>
    </div>
  )
}

/**
 * The ready branch, including the row audit.
 * @param props - the parsed envelope, the renderer's output and the callbacks.
 * @returns the element.
 */
function ReadyView(props: {
  readonly envelope: WindowEnvelope
  readonly node: unknown
  readonly t: Translator
}): ReactElement {
  const audit = auditRows(props.node)
  const envelope = props.envelope
  const denominator = measuredCount(envelope.census?.denominator)
  const numerator = measuredCount(envelope.census?.numerator)

  if (!audit.hasTree) {
    return (
      <div className="mm-state mm-state-defect" data-mm-state="render-defect" role="alert">
        <p className="mm-err">
          This window&apos;s view converted to NO TREE. An empty panel is indistinguishable from &quot;nothing
          installed&quot;, so this is reported as a defect rather than rendered as an empty result.
        </p>
        <p className="mm-muted">
          window {envelope.window?.id ?? 'unknown'} · rows in the payload {numerator === null ? props.t('notMeasured') : numerator}
        </p>
      </div>
    )
  }

  const rows = audit.rows
  return (
    <>
      <CensusStrip census={envelope.census} generatedAt={envelope.generatedAt} unavailable={envelope.unavailable} t={props.t} />
      {rows > 0 ? null : (
        <p
          className={denominator !== null && denominator > 0 ? 'mm-note' : 'mm-warnp'}
          data-mm-empty={denominator !== null && denominator > 0 ? 'genuine' : 'instrument-failure'}
        >
          {denominator === null ? (
            <>
              The view produced 0 rows and the census denominator is {props.t('notMeasured')} — so this is
              &quot;cannot say&quot;, not &quot;nothing exists&quot;.
            </>
          ) : denominator === 0 ? (
            <>
              The view produced 0 rows and the census denominator is 0. <strong>0 of 0 is instrument failure, not a
              pass</strong> — the census could not see its population, so nothing here is a measured empty result.
            </>
          ) : (
            <>
              The view produced 0 rows against a measured population of {denominator} — this is a GENUINE empty
              result for this window, not a failure to render.
            </>
          )}
        </p>
      )}
      <div className="mm-rows">{props.node as ReactElement}</div>
      <FalsifierDrawer falsifiers={envelope.falsifiers ?? []} t={props.t} />
    </>
  )
}

/**
 * The panel frame.
 * @param props - which window is shown, the state, and the callbacks.
 * @returns the panel element.
 */
export function PanelFrame(props: PanelFrameProps): ReactElement {
  const { state, t } = props
  return (
    <section
      id="dsh-meta-market-panel"
      className="mm-panel"
      role="tabpanel"
      data-mm-window={props.window}
      data-mm-primary={props.primary}
      data-mm-state={state.kind === 'ready' ? 'ready' : state.kind}
      data-mm-unavailable={state.kind === 'ready' && state.envelope.unavailable !== null ? state.envelope.unavailable.reason : undefined}
    >
      {state.kind === 'loading' ? <LoadingView /> : null}
      {state.kind === 'error' ? (
        <ErrorView failure={state.failure} message={state.message} status={state.status} t={t} onRetry={props.onRetry} />
      ) : null}
      {state.kind === 'ready' ? (
        <ReadyView
          envelope={state.envelope}
          node={renderWindow(props.window, state.envelope, props.onOpenWindow)}
          t={t}
        />
      ) : null}
    </section>
  )
}
