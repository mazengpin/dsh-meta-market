/**
 * The view contract for the ten dsh-meta-market windows.
 *
 * AUTHORITY: `research/meta-market-gui/CONTRACT.md` (lead-owned) fixes the window ids and the
 * payload envelope. This file restates that envelope as TypeScript so a view cannot render a
 * field the contract does not define, and cannot silently rename one that it does.
 *
 * OWNERSHIP: `windows-client` owns `src/client/windows/**`. This file is the ONE place the
 * client-side shape is written down; `shell-client` imports these types rather than restating
 * them, so the shell and the views cannot drift apart. Nothing here imports from `../types.ts`
 * (shell-owned), which is deliberate: a missing shell file must not break the views, and a
 * structurally identical declaration in both places stays compatible.
 *
 * THREE HONESTY RULES ARE TYPES HERE, NOT CONVENTIONS:
 * 1. `kind` is `exists` | `plan` | `future` — a union, so flattening it is a type error.
 * 2. `installed` / `downloadable` are `boolean | null`, and the contract says null means
 *    NOT MEASURED. `null` is not a falsy boolean and must never render as `false` or `0`.
 * 3. `unavailable` is `null | { reason, measuredAt }` — a window whose reading failed carries
 *    a REASON, not an empty `items` array, so "no plugins" cannot be spelled the same way as
 *    "the reading failed".
 */

/** The ten window ids, exactly as CONTRACT.md fixes them. */
export type WindowId =
  | 'meta-plugins'
  | 'meta-tools'
  | 'meta-skills'
  | 'meta-memory'
  | 'meta-intent'
  | 'advanced'
  | 'meta-agents'
  | 'meta-loops'
  | 'meta-cordis'
  | 'meta-community'

/** The six primary tabs, in the order CONTRACT.md gives. */
export const PRIMARY_WINDOW_IDS: readonly WindowId[] = [
  'meta-plugins',
  'meta-tools',
  'meta-skills',
  'meta-memory',
  'meta-intent',
  'advanced',
]

/** The four sub-windows of `advanced`, in the order CONTRACT.md gives. */
export const ADVANCED_WINDOW_IDS: readonly WindowId[] = [
  'meta-agents',
  'meta-loops',
  'meta-cordis',
  'meta-community',
]

/** All ten, primary first then advanced. */
export const WINDOW_IDS: readonly WindowId[] = [...PRIMARY_WINDOW_IDS, ...ADVANCED_WINDOW_IDS]

/** The three kinds of thing. Never flattened into one another. */
export type ThingKind = 'exists' | 'plan' | 'future'

/** One intent-zone score. `method` says how the score was produced, because a token match and an
 * embedding cosine are not comparable numbers and the window must not present them as if they were. */
export interface ZoneScore {
  zone: string
  score: number
  method: 'embedding' | 'token'
}

/** A named collision: the thing this item's intent collides with, and why. */
export interface CollisionRef {
  id: string
  why: string
}

/** The intent match. `not-measured` is a THIRD state beside pass and collide. */
export interface IntentMatch {
  zones: ZoneScore[]
  originalIntent: 'pass' | 'collide' | 'not-measured'
  collidesWith: CollisionRef[]
}

/** The alignment verdict, with the evidence that produced it. */
export interface Alignment {
  verdict: 'aligned' | 'collides' | 'not-measured'
  why: string
  evidence: string
}

/** A reviewable, reversible patch artifact. Anything else is absent, not "no patch exists". */
export interface PatchRef {
  available: true
  artifact: string
  applies: string
}

/** Where the row came from, so a reader can re-derive it. */
export type SourceWhere = 'installed' | 'catalog' | 'community'

export interface ItemSource {
  where: SourceWhere
  route?: string
  row?: number
}

/** One row. Every field is required so a producer cannot omit one and leave it looking absent. */
export interface Item {
  id: string
  name: string
  npm: string | null
  owner: string | null
  kind: ThingKind
  installed: boolean | null
  downloadable: boolean | null
  source: ItemSource
  intent: IntentMatch
  alignment: Alignment
  patch: PatchRef | null
}

/** Every count carries numerator, denominator, the population the denominator counts, and its time. */
export interface Census {
  numerator: number
  denominator: number
  population: string
  at: string
}

export interface WindowMeta {
  id: WindowId
  label: string
  description: string
  kind: ThingKind
}

/** A failed reading: a REASON, so the window can say why it has no rows. */
export interface Unavailable {
  reason: string
  measuredAt: string
}

/** A control. `kind: 'write'` promises an outcome changed; `demonstrable` says whether that was shown. */
export interface Control {
  id: string
  label: string
  kind: 'read' | 'write'
  target: string
  demonstrable: boolean
}

/** A falsifier: what could be false, and the check that would show it. */
export interface Falsifier {
  claim: string
  how: string
}

/** The full payload envelope. Every window renders exactly this, no exceptions. */
export interface WindowEnvelope {
  window: WindowMeta
  generatedAt: string
  census: Census
  items: Item[]
  unavailable: Unavailable | null
  controls: Control[]
  falsifiers: Falsifier[]
}

/* --------------------------------------------------------------------------------------------- */
/* The render tree.                                                                              */
/*                                                                                               */
/* A view returns this and nothing else: a plain, serialisable tree. `toElement` turns it into  */
/* DOM nodes, React elements, or anything else, so the shell's framework is not baked in here.  */
/* `attrs` uses `class`, not `className` (React convention); `reactFactory` renames it.         */
/* --------------------------------------------------------------------------------------------- */

/** Serialisable attributes: string, number, or absent. Booleans are NOT emitted, because a
 * boolean attribute is rendered differently by DOM and React and neither reads as a measurement. */
export type VAttrs = Record<string, string | number | null | undefined>

/**
 * A DOM event binding.
 *
 * Events are carried SEPARATELY from attributes because an attribute value is stringified: putting a
 * function in `attrs` would make `domFactory` write `onclick="() => …"` as text and make
 * `reactFactory` pass an unknown prop. Keeping the two apart is what lets a launcher button actually
 * change the selected window in either host instead of merely looking clickable.
 */
export interface VEvent {
  /** DOM event name, e.g. `click`. `reactFactory` maps it to React's camelCase prop (`onClick`). */
  type: string
  handler: (event?: unknown) => void
}

export interface VElement {
  kind: 'element'
  tag: string
  attrs: VAttrs
  events?: VEvent[]
  children: VNode[]
}

/** Text carries no attributes, so an absent value cannot hide inside a styled node. */
export interface VText {
  kind: 'text'
  text: string
}

export type VNode = VElement | VText

/**
 * A factory with an optional text constructor.
 *
 * `events` is a fourth parameter and not part of `attrs`, because an attribute is stringified by the
 * DOM factory while a handler must be subscribed and must become a React prop. `toElement` passes the
 * element's own `events` here and every factory decides what to do with them.
 *
 * `text` is optional because React accepts a bare string as a child while the DOM needs a real
 * text node; `toElement` falls back to the bare string when the factory has no `text`.
 */
export interface CreateElement {
  (tag: string, attrs: VAttrs | null, children: unknown[], events?: VEvent[]): unknown
  text?: (text: string) => unknown
}

/** No DOM lib is needed to type the renderer: only these two calls are used. */
export interface MiniElementNode {
  setAttribute(name: string, value: string): void
  appendChild(child: unknown): unknown
  /** Optional so a fake document in a harness can omit it; a real `document` always has it. */
  addEventListener?(type: string, handler: (event: unknown) => void): void
}

export interface MiniTextNode {
  nodeValue: string | null
}

export interface MiniDocument {
  createElement(tag: string): MiniElementNode
  createTextNode(text: string): MiniTextNode
}

/** What the shell passes to one view. */
export interface WindowViewProps {
  envelope: WindowEnvelope
  /** Called when the reader activates a launcher button. `advanced` uses it; the shell owns the
   * sub-rail, so this callback is the ONLY way a launcher may change the selected window. */
  onOpenWindow?: (id: WindowId) => void
}

/** A view: envelope in, render tree out. Pure: no reading of ambient state, no side effects. The
 * root is always an ELEMENT, never a bare text node and never an array, so a host can mount it
 * directly without checking what it got. */
export type WindowView = (props: WindowViewProps) => VElement
