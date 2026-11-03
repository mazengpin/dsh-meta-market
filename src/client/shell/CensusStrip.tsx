/**
 * The census strip: every count the panel shows, WITH its denominator, its
 * population definition and its census time.
 *
 * This component exists because a count without its denominator is the defect
 * this program has published most often, and a GUI is the easiest place in the
 * world to render one: `12 items` looks finished whether the population was 12 or
 * 4,527. So the strip never renders a bare numerator. It renders `numerator /
 * denominator`, then the population in words, then when it was read.
 *
 * THREE VALUES, THREE TREATMENTS, and `null` never becomes `0`:
 *
 *  - a finite number → the number, as-is (a measured `0` IS a value);
 *  - `null`/`undefined`/`NaN`/a non-number → `NOT MEASURED`, with the reason the
 *    payload gave when it gave one;
 *  - the envelope-level `unavailable` → a compact `NOT MEASURED` badge whose
 *    tooltip carries the reason and its `measuredAt`. The ROW AREA is left to the
 *    view layer, which owns the fuller explanation; this badge exists so the
 *    shell can distinguish "answered, nothing measured" from "answered, empty"
 *    without reading the view's output.
 *
 * @module dsh-meta-market/client/shell/CensusStrip
 */

import type { ReactElement } from 'react'
import type { Census, Translator, WindowEnvelope } from '../types.ts'
import { measuredCount } from './rows.ts'

/** The strip's props. */
export interface CensusStripProps {
  readonly census: Census
  readonly generatedAt: string
  readonly unavailable: WindowEnvelope['unavailable']
  readonly t: Translator
}

/**
 * Render one count honestly.
 *
 * @param value - the raw value from the payload.
 * @param t - the translator, for the NOT MEASURED label.
 * @returns the count as a string, never coercing an absence to a zero.
 */
function countText(value: unknown, t: Translator): string {
  const measured = measuredCount(value)
  return measured === null ? t('notMeasured') : String(measured)
}

/**
 * The census strip.
 * @param props - the census, the payload time, the availability field and the translator.
 * @returns the strip element.
 */
export function CensusStrip(props: CensusStripProps): ReactElement {
  const { census, t } = props
  const unavailable = props.unavailable
  return (
    <div className="mm-census" data-mm-census="strip">
      <span className="mm-census-count" data-mm-census-count="items">
        <strong>{countText(census.numerator, t)}</strong>
        {' / '}
        <strong>{countText(census.denominator, t)}</strong>
      </span>
      <span className="mm-census-population" data-mm-census-population="text">{census.population}</span>
      {typeof census.at === 'string' && census.at !== '' ? (
        <span className="mm-muted">
          {t('censusAt')} {census.at}
        </span>
      ) : (
        <span className="mm-warn">{t('notMeasured')}</span>
      )}
      {typeof props.generatedAt === 'string' && props.generatedAt !== '' ? (
        <span className="mm-muted">
          {t('generatedAt')} {props.generatedAt}
        </span>
      ) : null}
      {unavailable === null || unavailable === undefined ? null : (
        <span
          className="mm-chip mm-chip-idle"
          data-mm-unavailable="chip"
          title={`${unavailable.reason} (measured ${unavailable.measuredAt})`}
        >
          {t('notMeasured')}
        </span>
      )}
    </div>
  )
}
