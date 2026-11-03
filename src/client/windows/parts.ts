/**
 * Shared, honest renderers for the ten windows.
 *
 * Every view is built from these parts, so a honesty rule is implemented once and cannot be true in
 * one window and false in another. The four rules that matter:
 *
 * 1. `installed`/`downloadable` of `null` renders "NOT MEASURED". Never "false", never "0" — the
 *    contract defines null as an absent reading, and rendering it as a boolean asserts a measurement
 *    that was never taken.
 * 2. When `unavailable` is set, the row area is REPLACED by the reason. No empty table is emitted,
 *    because an empty table reads as "zero plugins" and that is the one thing the reason says it is
 *    not.
 * 3. `kind` renders as `exists` / `plan` / `future` on every row and in the header. The three are
 *    never flattened into "available".
 * 4. Every count is printed as numerator of denominator with the population and the census time,
 *    and the payload is checked against itself: if `census.numerator` disagrees with `items.length`,
 *    or the denominator is 0, or a time will not parse, the window says so visibly instead of
 *    printing a clean-looking number.
 */
import type {
  Alignment,
  Census,
  Control,
  Falsifier,
  IntentMatch,
  Item,
  ItemSource,
  PatchRef,
  VAttrs,
  VElement,
  VEvent,
  VNode,
  WindowEnvelope,
  WindowViewProps,
} from './types.ts'

/** A child a view may pass: a node, a bare string, or an explicitly skipped value. */
export type Child = VNode | string | number | null | false | undefined

/** The two literal tokens this file reserves, so "absent" is never spelled as a value. */
export const NOT_MEASURED = 'NOT MEASURED'
export const NOT_RECORDED = 'not recorded'

/** Build an element. `null`/`false`/`undefined` children are skipped rather than rendered. */
export function el(tag: string, attrs: VAttrs | null, ...children: Child[]): VElement {
  return elOn(tag, attrs, [], ...children)
}

/**
 * Build an element with event bindings.
 *
 * Events travel beside the attributes, never inside them: `domFactory` subscribes with
 * `addEventListener` and `reactFactory` passes the handler as React's `onClick`, so one launcher
 * definition works in both hosts. An element with no handler has no `events` key at all, which keeps
 * a rendered row free of functions and therefore serialisable — the property the verifier relies on.
 */
export function elOn(tag: string, attrs: VAttrs | null, events: VEvent[], ...children: Child[]): VElement {
  const out: VNode[] = []
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (typeof child === 'string') out.push({ kind: 'text', text: child })
    else if (typeof child === 'number') out.push({ kind: 'text', text: String(child) })
    else out.push(child)
  }
  const node: VElement = { kind: 'element', tag, attrs: attrs ?? {}, children: out }
  if (events.length > 0) node.events = events
  return node
}

/** A count as text: a non-finite number is an absent reading, not a number. */
export function num(value: number): string {
  return Number.isFinite(value) ? String(value) : NOT_MEASURED
}

/** A required string, but defended: an empty or missing field says so instead of rendering blank. */
export function textOr(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** Whether a time is a real time. An unparseable stamp is an absent freshness reading. */
export function parseableTime(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  return Number.isFinite(Date.parse(value))
}

/** A time, or an explicit statement that the stamp is unusable. */
export function timeText(value: string | null | undefined): string {
  return parseableTime(value) ? String(value) : `${NOT_MEASURED} (unparseable time: ${JSON.stringify(value ?? null)})`
}

/** `exists` / `plan` / `future`, never flattened. */
export function kindBadge(kind: string): VElement {
  return el('span', { class: `mm-kind mm-kind-${kind}`, 'data-mm-kind': kind, title: 'The three kinds are never flattened: exists = measured on this system, plan = this program will build it, future = a tagged goal.' }, kind)
}

/**
 * A tri-state measurement cell.
 *
 * `null` is NOT a falsy boolean here: it renders NOT MEASURED with a title that says why, because
 * the difference between "probed and absent" and "never probed" is the whole point of the field.
 */
export function flagCell(value: boolean | null, what: string): VElement {
  if (value === null) {
    return el('span', { class: 'mm-flag mm-flag-absent', title: `${what} is null in the payload. The contract defines null as NOT MEASURED — an absent reading, not a false one, and not a zero.` }, NOT_MEASURED)
  }
  return value
    ? el('span', { class: 'mm-flag mm-flag-yes', title: `${what} was measured true.` }, 'true')
    : el('span', { class: 'mm-flag mm-flag-no', title: `${what} was measured false.` }, 'false')
}

/** A score, or an explicit statement that the score is not a number. */
function scoreText(score: number): string {
  return Number.isFinite(score) ? score.toFixed(3) : 'score NOT MEASURED'
}

/** Where a row came from, so a reader can re-derive it. */
export function sourceText(source: ItemSource | null | undefined): string {
  if (source === null || source === undefined) return 'source NOT RECORDED'
  const parts: string[] = [source.where]
  if (source.route !== undefined) parts.push(`route ${source.route}`)
  if (source.row !== undefined) parts.push(`catalog row ${String(source.row)}`)
  return parts.join(', ')
}

/* --------------------------------------------------------------------------------------------- */
/* Header and census                                                                             */
/* --------------------------------------------------------------------------------------------- */

export function headerBlock(env: WindowEnvelope): VElement {
  return el(
    'header',
    { class: 'mm-header', 'data-mm-component': 'header' },
    el('h3', { class: 'mm-title' }, textOr(env.window?.label, NOT_MEASURED), ' ', kindBadge(textOr(env.window?.kind, NOT_MEASURED))),
    el('p', { class: 'mm-description' }, textOr(env.window?.description, 'description NOT STATED')),
    el('p', { class: 'mm-generated' }, `generated at ${timeText(env.generatedAt)}`),
  )
}

/** The census, as numerator of denominator plus the population it counts and the time it was taken. */
export function censusBlock(env: WindowEnvelope): VElement {
  const c: Census = env.census
  return el(
    'p',
    { class: 'mm-census', 'data-mm-component': 'census' },
    el('strong', { class: 'mm-census-count' }, `${num(c.numerator)} of ${num(c.denominator)}`),
    el('span', { class: 'mm-census-population' }, ` — ${textOr(c.population, 'population NOT STATED')}`),
    el('span', { class: 'mm-census-at' }, ` · census at ${timeText(c.at)}`),
  )
}

/**
 * Self-checks between the envelope's own numbers. Each returns a sentence a reader can act on.
 *
 * These exist because the failure this window is most likely to be shown is a payload whose parts
 * disagree — a numerator that does not match its rows, a denominator of 0, a stamp that will not
 * parse — and in every one of those cases the honest render is a visible warning beside the number,
 * not a clean number.
 */
export function censusWarnings(env: WindowEnvelope): string[] {
  const out: string[] = []
  const c = env.census
  const itemCount = Array.isArray(env.items) ? env.items.length : -1
  if (itemCount < 0) out.push('items is not an array in this payload — the row population cannot be counted, so NOT MEASURED')
  else if (c.numerator !== itemCount) out.push(`census.numerator is ${num(c.numerator)} but the payload carries ${itemCount} items — the stated numerator and the rendered rows disagree, so one of them is wrong`)
  if (!Number.isFinite(c.numerator) || !Number.isFinite(c.denominator)) out.push('the census carries a non-finite count — NOT MEASURED')
  if (Number.isFinite(c.numerator) && Number.isFinite(c.denominator) && c.denominator < c.numerator) out.push(`census.denominator ${num(c.denominator)} is smaller than numerator ${num(c.numerator)} — a numerator larger than its population cannot be right`)
  if (c.denominator === 0) out.push('census.denominator is 0 — a 0 on both sides of a comparison is INSTRUMENT FAILURE, not a pass; treat this window as UNMEASURED rather than empty')
  if (!parseableTime(c.at)) out.push('census.at is not a parseable time — freshness NOT MEASURED')
  if (!parseableTime(env.generatedAt)) out.push('generatedAt is not a parseable time — freshness NOT MEASURED')
  return out
}

export function warningBlock(warnings: string[], heading: string): VElement {
  return el(
    'div',
    { class: 'mm-warnings', 'data-mm-component': 'warnings', role: 'status' },
    el('p', { class: 'mm-warnings-heading' }, heading),
    el('ul', { class: 'mm-warnings-list' }, ...warnings.map(w => el('li', null, w))),
  )
}

/* --------------------------------------------------------------------------------------------- */
/* The unavailable state — in place of rows                                                      */
/* --------------------------------------------------------------------------------------------- */

/**
 * A failed reading, rendered where the rows would be.
 *
 * The sentence about "not a zero" is not decoration. An empty table and a failed read look the same
 * to a reader scrolling a panel, and the whole reason `unavailable` carries a `reason` is to keep
 * them apart.
 */
export function unavailableBlock(reason: string, measuredAt: string, windowLabel: string): VElement {
  return el(
    'div',
    { class: 'mm-unavailable', 'data-mm-component': 'unavailable', role: 'status' },
    el('p', { class: 'mm-unavailable-heading' }, `READING UNAVAILABLE — NOT A ZERO`),
    el('p', { class: 'mm-unavailable-reason' }, el('strong', null, 'reason: '), textOr(reason, 'reason NOT STATED')),
    el('p', { class: 'mm-unavailable-at' }, `measured at ${timeText(measuredAt)}`),
    el('p', { class: 'mm-unavailable-note' }, `No rows are rendered for ${windowLabel}. An empty table would read as "zero plugins"; this is an absent reading with a stated reason, which is a different thing.`),
  )
}

/* --------------------------------------------------------------------------------------------- */
/* The rows table                                                                                */
/* --------------------------------------------------------------------------------------------- */

const COLUMNS: readonly string[] = [
  'name',
  'npm',
  'owner',
  'kind',
  'installed',
  'downloadable',
  'aligned zones (score, method)',
  'collides with',
  'alignment',
  'patch',
]

/** A catalog-shaped string field: the payload gives `null` for "no value recorded", and the window
 * must not upgrade that into "none exists", because it cannot tell the two apart. */
function optionalString(value: string | null, column: string): VElement {
  if (value === null) {
    return el('span', { class: 'mm-absent', title: `${column} is null in the payload. This window cannot tell "no ${column} is recorded" from "not measured", so it claims neither.` }, NOT_RECORDED)
  }
  return el('span', { class: 'mm-value' }, value)
}

/** Zones with their scores AND the method that produced each score: an embedding cosine and a token
 * match are not the same measurement and are not presented as if they were. */
function zonesCell(intent: IntentMatch): VElement {
  const zones = intent.zones ?? []
  const original = intent.originalIntent
  const originalNode =
    original === 'not-measured'
      ? el('span', { class: 'mm-absent' }, `original intent: ${NOT_MEASURED}`)
      : el('span', { class: `mm-original mm-original-${original}` }, `original intent: ${original}`)
  if (zones.length === 0) {
    return el('div', { class: 'mm-zones mm-zones-empty' }, el('span', { class: 'mm-absent', title: 'No zone scored this item. That is an absent match, not a score of 0.' }, 'no zones measured'), el('br', null), originalNode)
  }
  const lines: Child[] = []
  for (const zone of zones) {
    lines.push(el('span', { class: 'mm-zone', 'data-mm-zone': zone.zone, title: `method: ${zone.method}` }, `${zone.zone} ${scoreText(zone.score)} (${zone.method})`), ' ')
  }
  return el('div', { class: 'mm-zones' }, ...lines, el('br', null), originalNode)
}

/**
 * The collision cell.
 *
 * A visible badge, and the plugin it collides with named. When the payload says `collide` but names
 * no counterpart, that is stated rather than softened: an unnamed collision cannot be checked.
 */
function collidesCell(intent: IntentMatch): VElement {
  const collisions = intent.collidesWith ?? []
  const original = intent.originalIntent
  if (collisions.length === 0) {
    if (original === 'collide') {
      return el('span', { class: 'mm-collide mm-collide-unproven' }, el('span', { class: 'mm-badge mm-badge-collides' }, 'COLLIDES'), ' ', el('span', { class: 'mm-warn' }, `counterpart ${NOT_MEASURED} (collidesWith is empty)`))
    }
    if (original === 'not-measured') {
      return el('span', { class: 'mm-absent', title: 'The intent check did not run for this row, so there is nothing to call a collision and nothing to call a pass.' }, NOT_MEASURED)
    }
    return el('span', { class: 'mm-none' }, 'no collision recorded')
  }
  return el(
    'div',
    { class: 'mm-collide' },
    el('span', { class: 'mm-badge mm-badge-collides', title: 'This row fails the original-intent check: it must not carry another plugin\'s intent.' }, 'COLLIDES'),
    el('ul', { class: 'mm-collide-list' }, ...collisions.map(c => el('li', { 'data-mm-collides-with': c.id }, el('strong', null, c.id), ' — ', textOr(c.why, 'why NOT STATED')))),
  )
}

function alignmentCell(alignment: Alignment | null | undefined): VElement {
  if (alignment === null || alignment === undefined) {
    return el('span', { class: 'mm-absent' }, NOT_MEASURED)
  }
  const verdict = alignment.verdict
  const badge = el('span', { class: `mm-badge mm-badge-${verdict}`, 'data-mm-verdict': verdict }, verdict)
  return el(
    'div',
    { class: 'mm-alignment' },
    badge,
    ' ',
    el('span', { class: 'mm-alignment-why' }, textOr(alignment.why, 'why NOT STATED')),
    el('br', null),
    el('span', { class: 'mm-alignment-evidence' }, `evidence: ${textOr(alignment.evidence, NOT_MEASURED)}`),
  )
}

/** Patch availability. `null` is a recorded absence of a patch artifact, and the title says exactly
 * that, because "no patch recorded" is not the same claim as "no patch can exist". */
function patchCell(patch: PatchRef | null | undefined): VElement {
  if (patch === null || patch === undefined) {
    return el('span', { class: 'mm-none', title: 'patch is null in the payload: no patch artifact is recorded for this row. That is not a measurement that no patch could exist.' }, 'none recorded')
  }
  return el(
    'div',
    { class: 'mm-patch' },
    el('span', { class: 'mm-badge mm-badge-patch' }, 'PATCH'),
    el('br', null),
    el('code', { class: 'mm-patch-artifact' }, textOr(patch.artifact, NOT_MEASURED)),
    el('br', null),
    el('span', { class: 'mm-patch-applies' }, textOr(patch.applies, 'what it changes NOT STATED')),
  )
}

/** A row. Every row carries `data-mm-item`, so a verifier can count rows against the census without
 * reading this code. */
export function itemRow(item: Item): VElement {
  return el(
    'tr',
    { class: `mm-row mm-row-${item.kind}`, 'data-mm-item': item.id, 'data-mm-kind': item.kind, 'data-mm-source': item.source?.where ?? 'not-recorded' },
    el('th', { class: 'mm-cell mm-cell-name', scope: 'row' }, el('span', { class: 'mm-item-name' }, textOr(item.name, NOT_MEASURED)), el('br', null), el('span', { class: 'mm-item-id' }, item.id), el('br', null), el('span', { class: 'mm-item-source' }, sourceText(item.source))),
    el('td', null, optionalString(item.npm, 'npm')),
    el('td', null, optionalString(item.owner, 'owner')),
    el('td', null, kindBadge(item.kind)),
    el('td', null, flagCell(item.installed, 'installed')),
    el('td', null, flagCell(item.downloadable, 'downloadable')),
    el('td', { class: 'mm-cell-zones' }, zonesCell(item.intent)),
    el('td', { class: 'mm-cell-collides' }, collidesCell(item.intent)),
    el('td', null, alignmentCell(item.alignment)),
    el('td', null, patchCell(item.patch)),
  )
}

/**
 * The rows table, scrolling inside the panel.
 *
 * The scroll container is `.mm-rows-scroll` (styled in `windows.css`). The header is sticky, so a
 * long table can be read without losing the column names, which is what makes "installed" and
 * "downloadable" distinguishable at row 40.
 */
export function rowsTable(items: Item[]): VElement {
  return el(
    'div',
    { class: 'mm-rows-scroll', 'data-mm-component': 'rows' },
    el(
      'table',
      { class: 'mm-rows' },
      el('thead', null, el('tr', null, ...COLUMNS.map(name => el('th', { class: 'mm-col', scope: 'col' }, name)))),
      el('tbody', null, ...items.map(item => itemRow(item))),
    ),
  )
}

/* --------------------------------------------------------------------------------------------- */
/* Falsifiers and controls                                                                       */
/* --------------------------------------------------------------------------------------------- */

/**
 * What would disprove this window.
 *
 * An empty list renders a visible finding rather than nothing: a window that states claims it never
 * says how to refute cannot be checked, and silence would read as "nothing to see".
 */
export function falsifiersBlock(list: Falsifier[] | null | undefined): VElement {
  const falsifiers = list ?? []
  if (falsifiers.length === 0) {
    return el('div', { class: 'mm-falsifiers mm-falsifiers-empty', 'data-mm-component': 'falsifiers' }, el('p', { class: 'mm-heading' }, 'What would disprove this window'), el('p', { class: 'mm-warn' }, 'no falsifier is registered in this payload — the window states claims here that nothing in it can refute, which is itself a finding.'))
  }
  return el(
    'div',
    { class: 'mm-falsifiers', 'data-mm-component': 'falsifiers' },
    el('p', { class: 'mm-heading' }, 'What would disprove this window'),
    el('ul', { class: 'mm-falsifier-list' }, ...falsifiers.map(f => el('li', null, el('strong', null, textOr(f.claim, 'claim NOT STATED')), el('br', null), el('span', { class: 'mm-falsifier-how' }, `would be shown by: ${textOr(f.how, 'how NOT STATED')}`)))),
  )
}

/**
 * The controls, each marked read or write.
 *
 * A `write` control that has never been driven is flagged UNPROVEN WRITE rather than listed beside
 * the read controls as though it were the same kind of thing. The contract says a write control must
 * have changed an outcome once; the flag says whether this payload claims that happened.
 */
export function controlsBlock(list: Control[] | null | undefined): VElement {
  const controls = list ?? []
  if (controls.length === 0) {
    return el('div', { class: 'mm-controls mm-controls-empty', 'data-mm-component': 'controls' }, el('p', { class: 'mm-heading' }, 'Controls'), el('p', { class: 'mm-absent' }, 'no controls are registered in this payload.'))
  }
  return el(
    'div',
    { class: 'mm-controls', 'data-mm-component': 'controls' },
    el('p', { class: 'mm-heading' }, 'Controls'),
    el('ul', { class: 'mm-control-list' }, ...controls.map(c => controlItem(c))),
  )
}

function controlItem(control: Control): VElement {
  const isWrite = control.kind === 'write'
  const proven = control.demonstrable === true
  return el(
    'li',
    { class: 'mm-control', 'data-mm-control': control.id, 'data-mm-control-kind': control.kind },
    el('span', { class: `mm-badge mm-control-kind mm-control-${control.kind}` }, isWrite ? 'WRITE' : 'READ'),
    ' ',
    el('strong', { class: 'mm-control-label' }, textOr(control.label, NOT_MEASURED)),
    ' ',
    el('code', { class: 'mm-control-target' }, textOr(control.target, NOT_MEASURED)),
    isWrite && !proven ? el('span', { class: 'mm-warn mm-control-unproven' }, ' — UNPROVEN WRITE: no outcome change is recorded, and a control that only reads a value back is not a control') : null,
    !isWrite && !proven ? el('span', { class: 'mm-control-note' }, ' — read-only; nothing is claimed to change') : null,
    proven && isWrite ? el('span', { class: 'mm-control-proven' }, ' — outcome change recorded') : null,
  )
}

/* --------------------------------------------------------------------------------------------- */
/* The standard window                                                                           */
/* --------------------------------------------------------------------------------------------- */

/** The row area: rows when the reading succeeded, the reason when it did not, and an explicit
 * statement when the population itself is empty. Exported so a view with its own middle block (the
 * `advanced` launcher) still renders rows through the same honest path. */
export function bodyBlock(env: WindowEnvelope): VElement {
  if (env.unavailable !== null && env.unavailable !== undefined) {
    return unavailableBlock(env.unavailable.reason, env.unavailable.measuredAt, textOr(env.window?.label, textOr(env.window?.id, 'this window')))
  }
  const items = Array.isArray(env.items) ? env.items : []
  if (items.length === 0) {
    const denominator = env.census?.denominator
    if (denominator === 0) {
      return warningBlock(
        ['0 of 0 is not evidence of an empty population: a zero on both sides of a comparison is instrument failure, so this window is UNMEASURED.'],
        'No rows, and a denominator of 0 — INSTRUMENT FAILURE',
      )
    }
    return warningBlock(
      [`0 of ${num(denominator ?? Number.NaN)} items matched. With a non-zero denominator this is a measured zero — "nothing in the population matched this window" — and it is NOT evidence that no plugin of this kind exists anywhere.`],
      'No rows matched',
    )
  }
  return rowsTable(items)
}

/**
 * The window frame every view shares: header, census, self-checks, then whatever the view puts in
 * the middle, then the falsifiers and the controls.
 *
 * The order is fixed here rather than in each view so that all ten windows answer "what is this",
 * "how many of how many", "is this payload self-consistent", "what are the rows", "what would
 * disprove it", "what can I do" in the same places on screen.
 */
export function windowFrame(props: WindowViewProps, middle: Child[]): VElement {
  const env = props.envelope
  const warnings = censusWarnings(env)
  return el(
    'section',
    { class: `mm-window mm-window-${env.window.id}`, 'data-mm-view': env.window.id, 'data-mm-kind': env.window.kind },
    headerBlock(env),
    censusBlock(env),
    warnings.length > 0 ? warningBlock(warnings, 'This payload disagrees with itself — read these before the numbers above') : null,
    ...middle,
    falsifiersBlock(env.falsifiers),
    controlsBlock(env.controls),
  )
}

/**
 * The standard window: the frame, an optional note, an optional view-specific extra block, and the
 * row area.
 *
 * The note is per-window copy that explains how to READ the table rather than what the table
 * currently says, so a note cannot drift into an unmeasured claim about the payload.
 */
export function standardWindow(props: WindowViewProps, note?: VNode | null, extra?: VNode | null): VElement {
  return windowFrame(props, [note ?? null, extra ?? null, bodyBlock(props.envelope)])
}

/** A short explanatory paragraph, used for the per-window notes. */
export function note(text: string): VElement {
  return el('p', { class: 'mm-note', 'data-mm-component': 'note' }, text)
}
