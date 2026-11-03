/**
 * The Client half's locale namespace and dictionary.
 *
 * ONE LANGUAGE, DELIBERATELY. The sibling `dsh-intent-map` registers `en` and
 * `zh`; this half registers `en` only, and the gap is stated rather than hidden.
 * A dictionary whose keys exist in one language and not the other is a silent
 * half-translation, and the program's own gate binds its deliverables to English
 * (`D-ENGLISH-GATE-1`), so a second dictionary is a decision for whoever owns that
 * gate and not a guess by this lane. When the locale service serves a `zh` UI, an
 * unregistered namespace falls back to the key, which is visibly wrong rather
 * than plausibly wrong — the failure mode this file prefers.
 *
 * Every visible string lives here, including the ten tab labels, because the tab
 * rail's label is a function of the active locale; a literal in the component
 * would render in one language and nobody would see it as a defect.
 *
 * @module dsh-meta-market/client/shell/locales
 */

/** The namespace this plugin's keys live under. Namespaced so it cannot collide. */
export const LOCALE_NS = 'meta-market'

/** The English dictionary. */
export const en = {
  row: 'Meta-market',
  title: 'Meta-market — meta plugins aligned to intent',
  subtitle:
    'Installed on this system or downloadable, per window. Every count carries its denominator and its census time; an unmeasurable count reads NOT MEASURED, never 0.',

  'tab.meta-plugins': 'Meta-Plugins',
  'tab.meta-tools': 'Meta-tools',
  'tab.meta-skills': 'Meta-skills',
  'tab.meta-memory': 'Meta-memory',
  'tab.meta-intent': 'Meta-intent',
  'tab.advanced': 'Advanced',
  'tab.meta-agents': 'meta-Agents',
  'tab.meta-loops': 'meta-Loops',
  'tab.meta-cordis': 'meta-cordis',
  'tab.meta-community': 'meta-community',

  primaryRail: 'Meta-market windows',
  advancedRail: 'Advanced windows',
  refresh: 'Refresh',
  loading: 'Reading the section…',
  notMeasured: 'NOT MEASURED',
  census: 'Census',
  censusAt: 'read at',
  generatedAt: 'payload generated',
  falsifiers: 'Falsifiers',
  noFalsifiers:
    'This window declares no falsifier. A check with nothing that could fail it is a caption rather than a check, so its absence is reported here rather than rendered as a clean row.',

  'fail.unreachable': 'The section route could not be reached.',
  'fail.unmounted': 'The meta-market route prefix is not mounted on this host.',
  'fail.rejected': 'The section route refused this window.',
  'fail.malformed': 'The section route answered, and the answer was not an envelope.',
  retry: 'Retry',
} as const

/** A dictionary key. */
export type DictionaryKey = keyof typeof en
