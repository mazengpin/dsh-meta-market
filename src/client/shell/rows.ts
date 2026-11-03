/**
 * Row inspection over the converted React tree — the shell's answer to the ONE
 * failure mode a hand-rolled view tree introduces that a plain React element
 * does not have.
 *
 * A view returns a node tree; `toElement` walks it into React elements. If a view
 * returns something that converts to nothing, the panel renders EMPTY — and on
 * screen an empty panel is indistinguishable from "no plugins installed", which
 * is this program's most-published defect arriving in the GUI. So the shell does
 * not trust the conversion, it COUNTS what came out:
 *
 *   (i)  **rows > 0** — the view rendered items;
 *   (ii) **rows === 0 and a measured denominator** — a genuine empty result, said
 *        in words so it cannot be mistaken for a defect;
 *   (iii) **no tree at all** — `null`, `undefined`, or a converted node that is
 *        not an object — a DEFECT, rendered visibly as an error.
 *
 * The count is taken from the conversion's OUTPUT rather than from the envelope's
 * `items.length`, because the question being asked is "did the view actually
 * produce rows", not "did the payload contain items". Those are different
 * questions and a payload can be full while the rendered tree is empty.
 *
 * @module dsh-meta-market/client/shell/rows
 */

/** The attribute every rendered row carries, per CONTRACT. */
export const ITEM_ATTRIBUTE = 'data-mm-item'

/** What the row inspection found. */
export interface RowAudit {
  /** How many nodes carrying `data-mm-item` the converted tree holds. */
  readonly rows: number
  /** Whether the conversion produced anything renderable at all. */
  readonly hasTree: boolean
}

/** A react element, as far as counting needs to see it. */
interface ElementLike {
  readonly props?: Record<string, unknown> | null
}

/**
 * Is this value a converted React node rather than a bare string or number?
 *
 * `toElement` is typed `unknown`; a string child is legitimate React output (a
 * view may render text), so it is NOT counted as a defect — only `null`,
 * `undefined` and a non-elements array are.
 *
 * @param value - the converted node.
 * @returns true when the value is something React would render.
 */
function renderable(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' || typeof value === 'number') return true
  if (Array.isArray(value)) return value.some(renderable)
  return typeof value === 'object'
}

/**
 * Walk a React node and count the rows it carries.
 *
 * The walk follows `props.children` because react elements keep their children in
 * props rather than in a child array of their own. It is deliberately a small
 * structural walk and not a DOM query: it has to work before anything is mounted,
 * including in a node-side harness with no document.
 *
 * @param node - the converted React node.
 * @returns how many `data-mm-item` nodes it contains, and whether it has a tree.
 */
export function auditRows(node: unknown): RowAudit {
  let rows = 0
  const walk = (value: unknown): void => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      for (const child of value) walk(child)
      return
    }
    if (typeof value !== 'object') return
    const element = value as ElementLike
    const props = element.props
    if (props === null || props === undefined) return
    if (ITEM_ATTRIBUTE in props) rows += 1
    walk(props['children'])
  }
  walk(node)
  return { rows, hasTree: renderable(node) }
}

/**
 * Read a census number WITHOUT coercing it.
 *
 * `null`, `undefined`, `NaN` and a non-number all return `null` — NOT MEASURED.
 * A `0` returns `0`, because a measured zero is a value and the two are different
 * statements. This is the one place the shell is allowed to look at a count.
 *
 * @param value - the value as it arrived over the wire.
 * @returns the number, or `null` when it was not measured.
 */
export function measuredCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
