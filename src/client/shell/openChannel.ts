/**
 * The open channel: how `dsh-market`'s "Meta-Market" button reaches this window.
 *
 * THE SHAPE OF THE PROBLEM. Another plugin's button dispatches a cancelable
 * `CustomEvent('dsh-meta-market:open')` and treats `dispatchEvent(...) === false`
 * as "somebody took it". `dispatchEvent` returns false exactly when a listener
 * called `preventDefault()`, so the ONLY way to answer that button is to
 * `preventDefault()` — and the only honest way to call it is to have actually done
 * something. So the order in {@link handle} is: ACTIVATE, then preventDefault on
 * success. A listener that preventDefaults first and then fails would tell the
 * dispatcher "handled" about a request nothing handled, which is this program's
 * absent-versus-zero defect one level up: a `false` from `dispatchEvent` cannot
 * distinguish a working handler from a lying one.
 *
 * THERE IS NO `/meta-market` URL, and that is why this file exists rather than a
 * redirect. `index.tsx` registers a `sidebar.panellist` row whose `id` equals the
 * `main` panel's `key` (both `dsh-meta-market:market`), and the panel is
 * `scope: 'root'`, `kind: 'keyed'` with no route of its own. Navigation therefore
 * has to go through the layout service, exactly as the sidebar's own row does:
 * `ui-sidebar/src/client/index.ts:70-72` calls `ctx.layout.selectPanel(id)` on
 * click, and `ui-layout/src/client/service.ts:72-78` is the implementation. THIS
 * FILE CALLS THE SAME API, which is the whole point — not a DOM scrape that would
 * silently rot when the sidebar's markup changes.
 *
 * ONE FALLBACK, NAMED AND MEASURED. If `ctx.layout` is absent, or if
 * `selectPanel` throws (it throws when the key is not registered), the channel
 * falls back to clicking this plugin's OWN row button in the sidebar, located by
 * its `aria-label`. That is the weaker path — it depends on markup and on a
 * locale-resolved label — so which path was taken is recorded in
 * `data-mm-open-via` rather than left to be inferred from the fact that it worked.
 *
 * THE DISPOSER IS THE POINT OF THE `ctx.effect` WRAP IN `index.tsx`. A hot reload
 * re-runs `apply`; without removal each reload would stack one more listener, and
 * the visible symptom would be a click that opens the window N times with no error
 * anywhere. {@link OpenChannel.dispose} removes the SAME function reference it
 * added, and the harness drives install → dispose → install and asserts one
 * activation per dispatch.
 *
 * @module dsh-meta-market/client/shell/openChannel
 */

/** The event name `dsh-market`'s button dispatches. One spelling, used by both sides. */
export const OPEN_EVENT = 'dsh-meta-market:open'

/**
 * The key the LIVE channel is recorded under, on the event target (`window`).
 *
 * This is this plugin's own namespaced slot on `window` — nothing else is written
 * there, and in particular nothing is written into the host's DOM (which is why the
 * DOM fallback click has to go through `aria-label`). It exists so a second
 * evaluation of this module can find and dispose its predecessor, and so a verifier
 * can ask the live page WHICH evaluation is answering.
 */
export const REGISTRY_KEY = '__dshMetaMarketOpenChannel'

/** Which mechanism activated the window. Recorded, because they are not equivalent. */
export type OpenVia = 'layout' | 'row-click' | 'none'

/** What happened to one open request. */
export interface OpenRecord {
  /** `accepted` = the panel is selected; `refused` = nothing was activated. */
  readonly outcome: 'accepted' | 'refused'
  readonly via: OpenVia
  /** ISO 8601, taken when the request arrived. */
  readonly at: string
  /**
   * The `detail.mainKey` the dispatcher asked for, if it gave one.
   *
   * `mainKey`, NOT a path: `dsh-market`'s final contract sends
   * `detail: { source, mainKey, at }` because there IS no `/meta-market` URL — this
   * panel is a keyed `main` entry with no route. A request naming a DIFFERENT key
   * is refused rather than silently opening ours, so a mistyped handshake fails
   * visibly instead of appearing to work.
   */
  readonly mainKey: string | null
  /** Why it was refused. `null` when accepted. */
  readonly reason: string | null
}

/** The tiny surface this module needs from `document`; absent in a node driver. */
export interface MiniDocument {
  readonly documentElement: { setAttribute(name: string, value: string): void; removeAttribute?(name: string): void } | null
  querySelector(selector: string): { click(): void; getAttribute(name: string): string | null } | null
  getElementById?(id: string): { setAttribute(name: string, value: string): void } | null
}

/** What the channel needs to install itself. */
export interface OpenChannelDeps {
  /** The `main` key to select — the same string as the sidebar row's `id`. */
  readonly mainKey: string
  /** This plugin's sidebar row label, used only by the DOM fallback. */
  readonly rowLabel: () => string
  /** `ctx.layout.selectPanel`, when the layout service is present. */
  readonly selectPanel: ((key: string) => void) | undefined
  /** The event target to listen on: `window` in the browser, a stub in the harness. */
  readonly target: { addEventListener(type: string, listener: (event: Event) => void): void; removeEventListener(type: string, listener: (event: Event) => void): void }
  /** The document used for the fallback click and the state attributes. */
  readonly doc: MiniDocument | null
  readonly logger: { info(...args: unknown[]): void }
}

/** The installed channel. */
export interface OpenChannel {
  /** Remove the listener. Idempotent, and removes the same reference it added. */
  dispose(): void
  /** How many requests this channel has handled — the counter the harness reads. */
  handled(): number
  /** The most recent request, or `null` when none has arrived. */
  last(): OpenRecord | null
}

/**
 * The last request, kept at MODULE scope so the window can mirror it when it
 * mounts after the dispatch. A dispatch can arrive before this plugin's panel has
 * ever been rendered (that is the common case: the user clicks a button on another
 * plugin's panel), so the record has to survive the gap.
 */
let lastOpen: OpenRecord | null = null

/**
 * Read the most recent open request.
 * @returns the record, or `null` when no request has arrived this session.
 */
export function lastOpenRequest(): OpenRecord | null {
  return lastOpen
}

/**
 * Re-publish the most recent request onto the CURRENT document and window root.
 *
 * Needed because the usual order is dispatch-then-mount: the click arrives while
 * this plugin's panel has never been rendered, so {@link publish} wrote the record
 * to `document.documentElement` and found no `#dsh-meta-market-window` to write it
 * on. The window calls this from its mount effect so the root carries the same
 * state, and a verifier can read the attribute on either element.
 *
 * @param doc - the document, or `null` in a non-DOM run.
 */
export function mirrorLastOpen(doc: MiniDocument | null): void {
  if (lastOpen === null) return
  publish(lastOpen, doc)
}

/**
 * Write the request onto the document and, when it exists, onto the window root.
 *
 * The attributes are the instrument: a verifier asserts the TRANSITION
 * (`data-mm-open` absent -> `accepted`) rather than reading a caption. They are
 * put on `document.documentElement` as well as on `#dsh-meta-market-window`,
 * because the window root may not exist yet at the moment of the dispatch.
 *
 * @param record - what happened.
 * @param doc - the document, or `null` in a non-DOM run.
 */
function publish(record: OpenRecord, doc: MiniDocument | null): void {
  if (doc === null) return
  const root = doc.documentElement
  if (root === null) return
  root.setAttribute('data-mm-open', record.outcome)
  root.setAttribute('data-mm-open-via', record.via)
  root.setAttribute('data-mm-open-at', record.at)
  root.setAttribute('data-mm-open-mainkey', record.mainKey ?? '')
  const windowRoot = doc.getElementById?.('dsh-meta-market-window') ?? null
  if (windowRoot !== null) {
    windowRoot.setAttribute('data-mm-open', record.outcome)
    windowRoot.setAttribute('data-mm-open-via', record.via)
    windowRoot.setAttribute('data-mm-open-at', record.at)
  }
}

/**
 * Install the listener.
 * @param deps - the main key, the layout face, the event target and the document.
 * @returns the channel handle, whose `dispose` removes the exact listener added.
 */
export function installOpenChannel(deps: OpenChannelDeps): OpenChannel {
  let count = 0
  let disposed = false

  /**
   * Activate this plugin's keyed `main` panel.
   * @returns which mechanism worked, and why when neither did.
   */
  const activate = (): { via: OpenVia; reason: string | null } => {
    if (deps.selectPanel !== undefined) {
      try {
        deps.selectPanel(deps.mainKey)
        return { via: 'layout', reason: null }
      } catch (error) {
        // `layout.selectPanel` THROWS when the key is not registered. That is a real
        // refusal and it is recorded, not swallowed: the fallback below may still
        // succeed, but a reader must be able to see that the primary path failed.
        deps.logger.info(
          `dsh-meta-market: layout.selectPanel refused ${deps.mainKey} (${error instanceof Error ? error.message : String(error)}); falling back to the sidebar row`,
        )
      }
    }
    const doc = deps.doc
    if (doc !== null) {
      // The sidebar row is a plain <button> whose only stable handle is its
      // `aria-label` (ui-sidebar/src/client/SidebarRoot.tsx:65-71 renders it with
      // no data attribute and no id). That is why this path is the FALLBACK and
      // why `data-mm-open-via` records which path ran: a `row-click` acceptance is
      // a weaker claim than a `layout` one, and a reader is told which they got.
      const row = doc.querySelector(`button[aria-label="${deps.rowLabel()}"]`)
      if (row !== null) {
        row.click()
        return { via: 'row-click', reason: null }
      }
    }
    return {
      via: 'none',
      reason: deps.selectPanel === undefined ? 'no layout service and no sidebar row found' : 'layout refused the key and no sidebar row found',
    }
  }

  /**
   * One dispatch.
   * @param event - the cancelable CustomEvent the other plugin dispatched.
   */
  const handle = (event: Event): void => {
    count += 1
    const detail = (event as Event & { detail?: { mainKey?: unknown } }).detail
    const mainKey = typeof detail?.mainKey === 'string' ? detail.mainKey : null
    if (mainKey !== null && mainKey !== deps.mainKey) {
      // A handshake naming a different key is refused rather than answered with our
      // window: opening ours would make a mistyped contract look like a working one.
      const record: OpenRecord = {
        outcome: 'refused',
        via: 'none',
        at: new Date().toISOString(),
        mainKey,
        reason: `the request named ${JSON.stringify(mainKey)} and this window registers only ${JSON.stringify(deps.mainKey)}`,
      }
      lastOpen = record
      publish(record, deps.doc)
      deps.logger.info(`dsh-meta-market: open request REFUSED — ${record.reason ?? 'key mismatch'}`)
      // Not preventDefault'ed: the dispatcher's fallback must still run.
      return
    }
    const activation = activate()
    if (activation.via === 'none') {
      const record: OpenRecord = { outcome: 'refused', via: 'none', at: new Date().toISOString(), mainKey, reason: activation.reason }
      lastOpen = record
      publish(record, deps.doc)
      deps.logger.info(`dsh-meta-market: open request REFUSED — ${activation.reason ?? 'unknown'}`)
      // NOT preventDefault'ed on purpose: `dispatchEvent` must keep returning true so
      // the dispatching button can tell that nothing handled its request and run its
      // own fallback. Claiming an event we did not honour is the false-success shape
      // this whole surface exists to remove.
      return
    }
    // ACTIVATION SUCCEEDED, so claim the event. This is what makes
    // `dispatchEvent(...)` return false at the dispatcher.
    if (typeof event.preventDefault === 'function') event.preventDefault()
    const record: OpenRecord = { outcome: 'accepted', via: activation.via, at: new Date().toISOString(), mainKey, reason: null }
    lastOpen = record
    publish(record, deps.doc)
    deps.logger.info(`dsh-meta-market: open request accepted via ${activation.via}`)
  }

  // SELF-SUPERSESSION, and it is not belt-and-braces: it is the defence against a
  // defect another lane MEASURED on this same seam. `dsh-market`'s button kept a
  // listener attached by an EARLIER module evaluation across a hot reload, so the
  // button looked live and ran old code, and in one measurement ONE click produced
  // TWO activations. Their fix was to stop putting handlers on a node that outlives
  // the evaluation. The equivalent here is that a surviving listener on `window`
  // would do exactly the same thing to this half.
  //
  // `ctx.effect` is expected to dispose us on unload and the driver proves `dispose`
  // works WHEN CALLED — but "the host called the disposer" is an assumption about
  // the host, and this program's rule is to convert an assumption about someone
  // else's behaviour into a mechanism. So the live channel is recorded ON THE EVENT
  // TARGET under a namespaced key, and an install first disposes its predecessor.
  // The consequence: a module re-evaluated without its disposer leaving one extra
  // listener, at most, and the newest evaluation is always the one answering.
  const registry = deps.target as unknown as Record<string, unknown>
  const previous = registry[REGISTRY_KEY]
  if (previous !== undefined && previous !== null && typeof (previous as { dispose?: unknown }).dispose === 'function') {
    ;(previous as { dispose(): void }).dispose()
    deps.logger.info('dsh-meta-market: a previous open-channel listener was still installed; disposed it before installing this one')
  }

  deps.target.addEventListener(OPEN_EVENT, handle)
  const channel: OpenChannel = {
    dispose(): void {
      if (disposed) return
      disposed = true
      deps.target.removeEventListener(OPEN_EVENT, handle)
      if (registry[REGISTRY_KEY] === channel) delete registry[REGISTRY_KEY]
    },
    handled(): number {
      return count
    },
    last(): OpenRecord | null {
      return lastOpen
    },
  }
  registry[REGISTRY_KEY] = channel
  return channel
}
