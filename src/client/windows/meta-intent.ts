/**
 * `meta-intent` — the primary window for the intent layer.
 *
 * This is the only window that adds a derived block, and it adds it because the intent layer's
 * numbers are the easiest in the whole surface to misread: a zone score is a cosine over one method
 * or a token overlap over another, and a table that showed a bare number would invite a reader to
 * compare two scales. So the block below counts rows per zone WITH ITS DENOMINATOR, prints the method
 * beside every score, and says plainly when a zone's scores come from more than one scale.
 *
 * Nothing here re-scores anything. It aggregates the scores the payload carries, which is why it can
 * be checked against `items` without re-running an embedding.
 */
import type { Item, VElement, WindowViewProps } from './types.ts'
import { el, note, num, standardWindow } from './parts.ts'

interface ZoneAggregate {
  zone: string
  items: number
  /** The best finite score seen for the zone, or null when no score for it was a finite number. */
  best: number | null
  methods: string[]
}

function zoneAggregates(items: Item[]): ZoneAggregate[] {
  const byZone = new Map<string, { items: number; best: number | null; methods: Set<string> }>()
  for (const item of items) {
    for (const zone of item.intent?.zones ?? []) {
      const entry = byZone.get(zone.zone) ?? { items: 0, best: null, methods: new Set<string>() }
      entry.items += 1
      entry.methods.add(zone.method)
      if (Number.isFinite(zone.score)) {
        entry.best = entry.best === null ? zone.score : Math.max(entry.best, zone.score)
      }
      byZone.set(zone.zone, entry)
    }
  }
  return [...byZone.entries()]
    .map(([zone, entry]) => ({ zone, items: entry.items, best: entry.best, methods: [...entry.methods].sort() }))
    .sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.zone.localeCompare(b.zone))
}

function scoreText(score: number | null): string {
  return score === null ? 'score NOT MEASURED' : score.toFixed(3)
}

function zoneSummary(items: Item[]): VElement {
  const total = items.length
  if (total === 0) {
    return el(
      'div',
      { class: 'mm-zonesummary mm-zonesummary-empty', 'data-mm-component': 'zone-summary' },
      el('p', { class: 'mm-heading' }, 'Intent zones, aggregated'),
      el('p', { class: 'mm-warn' }, 'zone scores NOT MEASURED — this payload carries 0 items, so there is no denominator to summarise and a "0 of 0" summary would be instrument failure rather than a result.'),
    )
  }

  const withZones = items.filter(item => (item.intent?.zones ?? []).length > 0).length
  const aggregates = zoneAggregates(items)
  const mixed = aggregates.filter(entry => entry.methods.length > 1)

  return el(
    'div',
    { class: 'mm-zonesummary', 'data-mm-component': 'zone-summary' },
    el('p', { class: 'mm-heading' }, 'Intent zones, aggregated over the rows above'),
    el('p', { class: 'mm-zonesummary-count' }, `${num(withZones)} of ${num(total)} items carry at least one zone score — a count of ROWS, not of zones.`),
    aggregates.length === 0
      ? el('p', { class: 'mm-absent' }, 'no zone scored any row: that is an absent match, not a score of zero, and it is not evidence that the rows have no intent.')
      : el(
          'table',
          { class: 'mm-zonetable' },
          el('thead', null, el('tr', null, ...['zone', 'rows in this zone', 'best score', 'method(s)'].map(label => el('th', { scope: 'col' }, label)))),
          el('tbody', null, ...aggregates.map(entry => el(
            'tr',
            { 'data-mm-zone-summary': entry.zone },
            el('td', null, entry.zone),
            el('td', null, num(entry.items)),
            el('td', null, scoreText(entry.best)),
            el('td', null, entry.methods.length === 0 ? 'NOT MEASURED' : entry.methods.join(', ')),
          ))),
        ),
    mixed.length === 0
      ? null
      : el('p', { class: 'mm-warn' }, `${mixed.length} zone(s) scored by more than one method (${mixed.map(entry => entry.zone).join(', ')}). Their "best score" mixes an embedding cosine with a token overlap, so those two numbers are not comparable and the max is a convenience, not a ranking.`),
  )
}

export function metaIntentWindow(props: WindowViewProps): VElement {
  const items = Array.isArray(props.envelope.items) ? props.envelope.items : []
  return standardWindow(
    props,
    note(
      'Every row is a thing whose intent was matched against the 24-zone map. The collides-with column is the original-intent check: a row is admitted only if its intent does not collide with a stable, official or already-installed meta plugin, and when it does collide the counterpart is named so the claim can be checked. A row whose original intent is NOT MEASURED was not checked at all, which is different from passing.',
    ),
    zoneSummary(items),
  )
}
