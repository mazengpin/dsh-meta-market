/**
 * Renderers: turn the framework-free `VNode` tree into something a host shell can mount.
 *
 * Two factories, two hosts, one tree. `domFactory` builds real DOM nodes for a plain-DOM shell;
 * `reactFactory` builds React elements for the React shell this lane's `shell-client` registers.
 * Neither is imported by the VIEWS, so choosing a host never reaches the view code.
 *
 * No DOM lib is required to compile this file: the element contract is the three calls the renderer
 * actually makes, declared in `./types.ts` as `MiniDocument` / `MiniElementNode`.
 */
import type { CreateElement, MiniDocument, VAttrs, VEvent, VNode } from './types.ts'

/**
 * Convert a render tree.
 *
 * The return value is whatever the factory returns: a DOM node for `domFactory`, a React element
 * for `reactFactory`. `text` is optional on the factory so a host that renders bare strings as
 * children (React) does not need a text-node constructor.
 */
export function toElement(node: VNode, create: CreateElement): unknown {
  if (node.kind === 'text') {
    return create.text !== undefined ? create.text(node.text) : node.text
  }
  const children: unknown[] = []
  for (const child of node.children) children.push(toElement(child, create))
  return create(node.tag, node.attrs, children, node.events)
}

/**
 * A factory that builds real DOM nodes.
 *
 * Every attribute is set with `setAttribute(name, String(value))` and every `data-*` attribute is
 * passed through verbatim, which is what makes `[data-mm-item]` assertable from a verifier without
 * reading this code. `null`/`undefined` attributes are dropped rather than written as the string
 * "null" — an absent attribute must not become a value.
 *
 * Events are subscribed with `addEventListener` when the node exposes it. The guard is a real one and
 * not defensive noise: a harness may pass a minimal fake document, and silently dropping a handler
 * there is better than throwing and taking the whole panel down.
 */
export function domFactory(doc: MiniDocument): CreateElement {
  const create = ((tag: string, attrs: VAttrs | null, children: unknown[], events?: VEvent[]): unknown => {
    const element = doc.createElement(tag)
    for (const [name, value] of Object.entries(attrs ?? {})) {
      if (value === null || value === undefined) continue
      element.setAttribute(name, String(value))
    }
    for (const event of events ?? []) {
      if (typeof element.addEventListener === 'function') element.addEventListener(event.type, event.handler)
    }
    for (const child of children) element.appendChild(child)
    return element
  }) as CreateElement
  create.text = (text: string): unknown => doc.createTextNode(text)
  return create
}

/** Attribute names React spells differently. Everything else, including every `data-*` name, is
 * passed through unchanged. */
const REACT_ATTR_RENAMES: Record<string, string> = { class: 'className', for: 'htmlFor' }

/** DOM event name to React prop name: `click` becomes `onClick`. */
function reactEventProp(type: string): string {
  return `on${type.charAt(0).toUpperCase()}${type.slice(1)}`
}

/**
 * Wrap a `createElement`-shaped function (react's, or a compatible one) into a `CreateElement`.
 *
 * The parameter is typed `unknown` ON PURPOSE. React's `createElement` is overloaded and its
 * generic prop parameter does not unify with a concrete factory alias under `strictFunctionTypes`,
 * so a nominal parameter would force every host to write a cast at the call site. Taking `unknown`
 * and validating the shape at the first call keeps the host's call site honest and cast-free.
 *
 * `class` is renamed to `className`; `null`/`undefined` attributes are dropped; events become the
 * camelCase handler props React expects; children are spread, because a `CreateElement` receives
 * them as one array and React wants a rest list; and `text` returns the bare string, which React
 * renders as a text child.
 */
export function reactFactory(create: unknown): CreateElement {
  const build = create as (tag: string, attrs: Record<string, unknown> | null, ...children: unknown[]) => unknown
  if (typeof build !== 'function') {
    // A named throw rather than a blank panel: a factory that is not a function would otherwise
    // surface as an empty window that reads as "no plugins".
    throw new TypeError('reactFactory expected a createElement-shaped function')
  }
  const factory = ((tag: string, attrs: VAttrs | null, children: unknown[], events?: VEvent[]): unknown => {
    const props: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(attrs ?? {})) {
      if (value === null || value === undefined) continue
      props[REACT_ATTR_RENAMES[name] ?? name] = value
    }
    for (const event of events ?? []) props[reactEventProp(event.type)] = event.handler
    return build(tag, props, ...children)
  }) as CreateElement
  factory.text = (text: string): unknown => text
  return factory
}
