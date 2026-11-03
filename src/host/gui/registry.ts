/**
 * The TEN-WINDOW REGISTRY: the only place a window id, its label, its kind or its
 * description is written down.
 *
 * WHY THE IDENTITY OF A WINDOW IS NOT PROVIDER-OWNED
 *
 * Six provider modules are written by four other lanes. If each of them also
 * decided what its window is CALLED and what KIND it is, then the tab rail, the
 * route dispatch and the payload could disagree about the same window, and a
 * reader comparing two surfaces would find two answers — the same class of defect
 * as a hand-maintained path list beside a route table. So identity lives here,
 * once, and a provider may only narrow `description` or correct `kind` with
 * evidence (`ProviderWindow.window`); it may never add, rename or reorder a
 * window.
 *
 * WHY EVERY WINDOW'S `kind` DEFAULTS TO `plan`
 *
 * Because it is TRUE OF THE WINDOW, and because this program's most-published
 * defect is a plan read as an existence claim. **CORRECTED 2026-10-17:** this
 * paragraph used to justify the `plan` default by citing `index.ts`'s
 * `mounted: false` — which was a LITERAL and was itself false (the package IS in
 * `personal-dev`'s `dsh.profile.bundles`; measured by `lead` at
 * `2026-10-17T14:51:53Z`). The `plan` kind below does NOT rest on that field and
 * must not be read as resting on it: a window whose CONTENT includes existing
 * plugins is still a window of this new GUI surface, and the assembly reports
 * mounted-ness separately, measured per request from the profile manifest.
 *
 * @module dsh-meta-market/host/gui/registry
 */

import type { WindowId, WindowMeta } from '../types.ts'

/** The provider module key a window is served by, one of the six files under `src/host/providers/`. */
export type ProviderKey = 'plugins' | 'tools' | 'skills' | 'memory' | 'intent' | 'advanced'

/** A registry row: the window's identity plus which provider module answers it. */
export interface WindowRow {
  readonly meta: WindowMeta
  readonly provider: ProviderKey
}

/**
 * The ten rows, in the CONTRACT's order. The order is the TAB ORDER, so it is
 * preserved rather than sorted — `meta-plugins` first is what the owner asked for.
 */
export const WINDOW_ROWS: readonly WindowRow[] = Object.freeze([
  {
    provider: 'plugins',
    meta: {
      id: 'meta-plugins',
      label: 'Meta-Plugins',
      description: 'Meta plugins that are installed on this system or downloadable from the catalog, each carrying its intent-map match and its alignment verdict.',
      kind: 'plan',
    },
  },
  {
    provider: 'tools',
    meta: {
      id: 'meta-tools',
      label: 'Meta-tools',
      description: 'Meta tools that let an agent act on the meta layer, with where each one is installed and whether its intent collides with an existing tool.',
      kind: 'plan',
    },
  },
  {
    provider: 'skills',
    meta: {
      id: 'meta-skills',
      label: 'Meta-skills',
      description: 'Meta skills — reusable instructions a meta agent loads — with their intent match, their install state and their loop provenance.',
      kind: 'plan',
    },
  },
  {
    provider: 'memory',
    meta: {
      id: 'meta-memory',
      label: 'Meta-memory',
      description: 'The meta-memory layer: the stores and plugins behind the RAG level, and the single model identity the system keeps loaded.',
      kind: 'plan',
    },
  },
  {
    provider: 'intent',
    meta: {
      id: 'meta-intent',
      label: 'Meta-intent',
      description: 'The intent map this market aligns against: its precalculated zones read live, and the plugins that pass or collide with them.',
      kind: 'plan',
    },
  },
  {
    provider: 'advanced',
    meta: {
      id: 'advanced',
      label: 'Advanced',
      description: 'A container window with no items of its own; it opens the four advanced sub-tabs, and its payload states what each of them answers.',
      kind: 'plan',
    },
  },
  {
    provider: 'advanced',
    meta: {
      id: 'meta-agents',
      label: 'meta-Agents',
      description: 'The meta agents this system runs — the Agent Team members and the lanes they own — as they actually stand rather than as a future goal.',
      kind: 'plan',
    },
  },
  {
    provider: 'advanced',
    meta: {
      id: 'meta-loops',
      label: 'meta-Loops',
      description: 'The meta loops that evolve the meta layer: each loop, its recorded rounds, and what a round changed.',
      kind: 'plan',
    },
  },
  {
    provider: 'advanced',
    meta: {
      id: 'meta-cordis',
      label: 'meta-cordis',
      description: 'The Cordis-level lifecycle this clone lives inside: registration, the effect that makes it reversible, and what is mounted where.',
      kind: 'plan',
    },
  },
  {
    provider: 'advanced',
    meta: {
      id: 'meta-community',
      label: 'meta-community',
      description: 'The read-only dsh-meta-community clone: its own route surface and census, reported as a separate artifact rather than as part of this one.',
      kind: 'plan',
    },
  },
])

/** The ten ids, in tab order. */
export const WINDOW_IDS: readonly WindowId[] = Object.freeze(WINDOW_ROWS.map((row) => row.meta.id))

/** The four ids `advanced` contains, in sub-tab order (CONTRACT §"Window ids"). */
export const ADVANCED_IDS: readonly WindowId[] = Object.freeze([
  'meta-agents',
  'meta-loops',
  'meta-cordis',
  'meta-community',
])

/** The six ids the top rail shows, in tab order. */
export const PRIMARY_IDS: readonly WindowId[] = Object.freeze([
  'meta-plugins',
  'meta-tools',
  'meta-skills',
  'meta-memory',
  'meta-intent',
  'advanced',
])

/** Narrow an arbitrary string to a `WindowId`. Used for the query parameter, which is untrusted. */
export function isWindowId(value: string): value is WindowId {
  return (WINDOW_IDS as readonly string[]).includes(value)
}

/** Look a row up by id; `undefined` means the id is not one of the ten. */
export function rowFor(id: WindowId): WindowRow | undefined {
  return WINDOW_ROWS.find((row) => row.meta.id === id)
}
