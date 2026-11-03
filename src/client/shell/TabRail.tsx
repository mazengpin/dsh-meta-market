/**
 * The two tab rails: the six primary windows, and the four advanced ones.
 *
 * TWO COMPONENTS RATHER THAN ONE WITH A DYNAMIC ATTRIBUTE, and that is a
 * deliberate consequence of the CONTRACT rather than duplication for its own
 * sake: a verifier asserts `button[data-mm-tab="<id>"]` for the primary rail and
 * `button[data-mm-subtab="<id>"]` for the advanced one, and those are two
 * different attribute NAMES. A single component writing a computed key would
 * have to cast its props object to satisfy react's typings, which is how a typo
 * in the attribute name becomes a build that passes and a query that matches
 * nothing. The shared `TabButton` below is where the button itself is written
 * once; only the attribute placement differs.
 *
 * The advanced rail is rendered by the shell ONLY while `advanced` is the active
 * primary tab, which is what makes `#dsh-meta-market-advanced-tabs` "present only
 * while advanced is selected".
 *
 * @module dsh-meta-market/client/shell/TabRail
 */

import type { ReactElement } from 'react'
import type { WindowId } from '../types.ts'

/** The shared button, so the two rails cannot drift in class or role. */
interface TabButtonProps {
  readonly id: WindowId
  readonly label: string
  readonly active: boolean
  readonly attribute: 'data-mm-tab' | 'data-mm-subtab'
  readonly onSelect: (id: WindowId) => void
}

/**
 * One tab button.
 *
 * `aria-selected` and the `mm-tab-active` class are both set from ONE `active`
 * value, so what a screen reader announces and what a stylesheet paints cannot
 * disagree.
 *
 * @param props - the tab's identity, its label and its selected state.
 * @returns the button element.
 */
function TabButton(props: TabButtonProps): ReactElement {
  const className = props.active ? 'mm-tab mm-tab-active' : 'mm-tab'
  if (props.attribute === 'data-mm-tab') {
    return (
      <button
        type="button"
        role="tab"
        data-mm-tab={props.id}
        className={className}
        aria-selected={props.active}
        onClick={() => props.onSelect(props.id)}
      >
        {props.label}
      </button>
    )
  }
  return (
    <button
      type="button"
      role="tab"
      data-mm-subtab={props.id}
      className={className}
      aria-selected={props.active}
      onClick={() => props.onSelect(props.id)}
    >
      {props.label}
    </button>
  )
}

/** The primary rail: six windows. */
export interface PrimaryRailProps {
  readonly tabs: readonly WindowId[]
  readonly active: WindowId
  readonly label: (id: WindowId) => string
  readonly ariaLabel: string
  readonly onSelect: (id: WindowId) => void
}

/**
 * `#dsh-meta-market-tabs`, the primary rail.
 * @param props - the six ids, the active one, and the selection callback.
 * @returns the rail element.
 */
export function PrimaryTabRail(props: PrimaryRailProps): ReactElement {
  return (
    <div id="dsh-meta-market-tabs" className="mm-tabs mm-tabs-primary" role="tablist" aria-label={props.ariaLabel}>
      {props.tabs.map(id => (
        <TabButton
          key={id}
          id={id}
          label={props.label(id)}
          active={id === props.active}
          attribute="data-mm-tab"
          onSelect={props.onSelect}
        />
      ))}
    </div>
  )
}

/** The advanced sub-rail: four windows. */
export interface AdvancedRailProps {
  readonly tabs: readonly WindowId[]
  readonly active: WindowId
  readonly label: (id: WindowId) => string
  readonly ariaLabel: string
  readonly onSelect: (id: WindowId) => void
}

/**
 * `#dsh-meta-market-advanced-tabs`, the sub-rail under `advanced`.
 * @param props - the four ids, the active one, and the selection callback.
 * @returns the sub-rail element.
 */
export function AdvancedTabRail(props: AdvancedRailProps): ReactElement {
  return (
    <div
      id="dsh-meta-market-advanced-tabs"
      className="mm-tabs mm-tabs-advanced"
      role="tablist"
      aria-label={props.ariaLabel}
    >
      {props.tabs.map(id => (
        <TabButton
          key={id}
          id={id}
          label={props.label(id)}
          active={id === props.active}
          attribute="data-mm-subtab"
          onSelect={props.onSelect}
        />
      ))}
    </div>
  )
}
