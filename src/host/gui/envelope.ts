/**
 * THE ENVELOPE ASSEMBLY — the one place a window payload is shaped.
 *
 * WHY THE PROVIDER MAY RETURN ALMOST NOTHING AND STILL BE SERVED
 *
 * Six provider modules are written by four other lanes concurrently. A required
 * field in `ProviderWindow` would turn one lane's omission into a TypeScript error
 * in the whole clone, and a thrown exception inside one provider into a dead
 * surface. So the provider states what it MEASURED and this file fills the rest —
 * and every field it fills is chosen in the direction that claims LESS:
 *
 *   - `installed` / `downloadable` become `null` (**NOT MEASURED**), never `false`,
 *     because `false` is a measurement claim and an absent probe is not a failed one.
 *   - `intent.originalIntent` and `alignment.verdict` become `not-measured` with a
 *     `why` that says the provider did not report one, never `aligned`.
 *   - a window whose provider is missing, threw, or self-reported `unavailable`
 *     gets `unavailable: {reason, measuredAt}` and its reason string is preserved
 *     VERBATIM. This file never rewrites, shortens or re-counts another lane's reason.
 *
 * THE CENSUS RULE, AND THE ONE THING THIS FILE REFUSES TO DO
 *
 * If the provider supplied a census, it is printed as given — the lane that took
 * the measurement owns its population string. If it did not, the derived census
 * says exactly what it counted: **the item list in this payload**, not a catalog
 * and not the world. A derived census labelled "plugins in the catalog" would be a
 * fabricated measurement with a numerator that looks right.
 *
 * @module dsh-meta-market/host/gui/envelope
 */

import type {
  Alignment,
  Census,
  Collision,
  Control,
  Falsifier,
  IntentMatch,
  ItemSource,
  PatchRef,
  ProviderOutcome,
  ProviderWindow,
  ThreeKind,
  WindowEnvelope,
  WindowId,
  WindowItem,
  ZoneMatch,
} from '../types.ts'
import { ADVANCED_IDS, PRIMARY_IDS, WINDOW_ROWS, type ProviderKey, type WindowRow } from './registry.ts'

/** Narrow an unknown value to a plain record without throwing on a primitive. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** A non-empty string, or the fallback. An empty string is treated as absent. */
function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** A string or explicit null — used for `npm`/`owner`, where `''` is not a value. */
function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * A boolean MEASUREMENT, or `null` for NOT MEASURED.
 *
 * Deliberately not `Boolean(value)`: that maps `undefined` to `false`, which is
 * this program's absent-is-not-zero rule broken in the exact field where a reader
 * would act on it ("not installed" versus "we did not look").
 */
function asBoolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** The three kinds, or `null` when the value is not one of them. */
function asKind(value: unknown): ThreeKind | null {
  return value === 'exists' || value === 'plan' || value === 'future' ? value : null
}

function normalizeZones(raw: unknown): readonly ZoneMatch[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry): ZoneMatch => {
    const zone = asRecord(entry)
    return {
      zone: asString(zone.zone, ''),
      score: typeof zone.score === 'number' && Number.isFinite(zone.score) ? zone.score : 0,
      method: zone.method === 'token' ? 'token' : 'embedding',
    }
  }).filter((match) => match.zone !== '')
}

function normalizeCollisions(raw: unknown): readonly Collision[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const collision = asRecord(entry)
    return { id: asString(collision.id, ''), why: asString(collision.why, '') }
  }).filter((collision) => collision.id !== '')
}

/**
 * One item, with every unreadable field turned into an honest absence.
 *
 * `source.where` is the only field this function has to DEFAULT rather than leave
 * absent, because the CONTRACT fixes its enum and the client branches on it. When
 * a provider omits it, `'catalog'` is recorded — which is why `source` is the one
 * field a provider lane must not omit: this is a floor, not a measurement.
 */
function normalizeItem(raw: unknown, index: number): WindowItem {
  const item = asRecord(raw)
  const id = asString(item.id, `unidentified-item-${index}`)
  const source = asRecord(item.source)
  const where = source.where
  const intent = asRecord(item.intent)
  const alignment = asRecord(item.alignment)
  const patch = asRecord(item.patch)

  const originalIntent = intent.originalIntent
  const verdict = alignment.verdict

  const sourceOut: ItemSource = {
    where: where === 'installed' || where === 'catalog' || where === 'community' ? where : 'catalog',
    ...(typeof source.route === 'string' && source.route.length > 0 ? { route: source.route } : {}),
    ...(typeof source.row === 'number' && Number.isFinite(source.row) ? { row: source.row } : {}),
  }

  const intentOut: IntentMatch = {
    zones: normalizeZones(intent.zones),
    originalIntent:
      originalIntent === 'pass' || originalIntent === 'collide' || originalIntent === 'not-measured'
        ? originalIntent
        : 'not-measured',
    collidesWith: normalizeCollisions(intent.collidesWith),
  }

  const alignmentOut: Alignment = {
    verdict: verdict === 'aligned' || verdict === 'collides' || verdict === 'not-measured' ? verdict : 'not-measured',
    why: asString(alignment.why, 'the provider reported no alignment verdict for this item'),
    evidence: asString(alignment.evidence, `unreported: the provider gave no evidence field for item ${id}`),
  }

  const patchOut: PatchRef | null =
    patch.available === true
      ? {
          available: true,
          artifact: asString(patch.artifact, 'unreported-artifact'),
          applies: asString(patch.applies, 'unreported-effect'),
        }
      : null

  return {
    id,
    name: asString(item.name, id),
    npm: asStringOrNull(item.npm),
    owner: asStringOrNull(item.owner),
    kind: asKind(item.kind) ?? 'plan',
    installed: asBoolOrNull(item.installed),
    downloadable: asBoolOrNull(item.downloadable),
    source: sourceOut,
    intent: intentOut,
    alignment: alignmentOut,
    patch: patchOut,
  }
}

function normalizeControls(raw: unknown): readonly Control[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry): Control => {
    const control = asRecord(entry)
    return {
      id: asString(control.id, ''),
      label: asString(control.label, ''),
      kind: control.kind === 'write' ? 'write' : 'read',
      target: asString(control.target, ''),
      demonstrable: control.demonstrable === true,
    }
  }).filter((control) => control.id !== '')
}

function normalizeFalsifiers(raw: unknown): readonly Falsifier[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const falsifier = asRecord(entry)
    return { claim: asString(falsifier.claim, ''), how: asString(falsifier.how, '') }
  }).filter((falsifier) => falsifier.claim !== '' && falsifier.how !== '')
}

/**
 * The degraded-read marker, normalized without inventing one.
 *
 * A provider that reports `stale` gets it published; a provider that does not gets
 * `null`. **`null` here means the provider reported no degraded read — NOT that the
 * assembly ruled one out.** This is a provider-reported state and the assembly is
 * not in a position to certify that another lane's live probe succeeded, so the
 * falsifier below says so rather than letting `null` read as a clean bill.
 */
function normalizeStale(raw: unknown): { reason: string; boundMs: number | null; at: string } | null {
  if (raw === null || raw === undefined) return null
  const stale = asRecord(raw)
  const reason = asString(stale.reason, '')
  if (reason === '') return null
  return {
    reason,
    boundMs: typeof stale.boundMs === 'number' && Number.isFinite(stale.boundMs) ? stale.boundMs : null,
    at: asString(stale.at, ''),
  }
}

/**
 * The falsifiers that belong to the ASSEMBLY rather than to a lane.
 *
 * A window whose provider supplied none is not thereby unfalsifiable: these two
 * are true of every envelope this file produces and each names a check a reader
 * can run against the served bytes. They are appended, never substituted, so a
 * lane's own falsifiers keep their place and their wording.
 */
function assemblyFalsifiers(census: Census, itemCount: number): readonly Falsifier[] {
  return [
    {
      claim: `this window's census numerator (${String(census.numerator)}) equals the number of items in this payload (${String(itemCount)})`,
      how: 'count the `items` array in the served body and compare it with `census.numerator`; /meta-market/api/gui/health performs exactly this comparison for all ten windows and reports the mismatching ids. ONE LEGITIMATE EXCEPTION: when the provider supplied no census and returned zero items, the numerator is `null` on purpose — that is an EMPTY LIST, not a measured zero, and comparing it to 0 would invent the reading',
    },
    {
      claim: 'no item in this window reports `installed: false` for a plugin this assembly could not probe',
      how: 'filter the items for `installed === false` and check each one carries a `source.route` or `source.row` that names the probe that produced the reading; an unprobed item must carry `installed: null` (NOT MEASURED)',
    },
    {
      claim: '`stale: null` on this window means its provider reported no degraded live read, and is NOT a claim this assembly verified',
      how: 're-read the provider module and its own census string: a provider that states "LIVE READ DID NOT SUCCEED" in `census.population` while this envelope carries `stale: null` is reporting the fact in prose only, and the marker should be populated; the assembly cannot detect that for it',
    },
  ]
}

/** ISO stamp for a caller-supplied clock, so a test can pin it. */
function iso(now: Date): string {
  return now.toISOString()
}

/**
 * THE ONE PREDICATE FOR "DID THIS WINDOW ANSWER", used by BOTH `/gui/sections` and
 * `/gui/health`.
 *
 * It exists because the two routes each had their own copy of the same three
 * conditions and the drive caught them disagreeing: `sections` reported **2** of
 * ten available while `health` reported **1** of ten answered, from two requests
 * seven seconds apart. The difference there was almost certainly a provider whose
 * own reading changed between the two requests — a live provider is allowed to do
 * that — but **two encodings of one fact must not be able to disagree by
 * ACCIDENT**, and two independently written predicates can drift apart by edit in
 * a way that no timestamp explains. So there is one function, and both routes are
 * views of it.
 *
 * A reader comparing the two payloads across requests should compare the `at`
 * stamps first: a difference of instant is a measurement, a difference at the same
 * instant is a defect.
 */
export function isAnswering(outcome: ProviderOutcome): boolean {
  if (outcome.landed === false) return false
  if (outcome.failed !== null) return false
  const unavailable = outcome.payload?.unavailable
  return unavailable === null || unavailable === undefined
}

/**
 * Build one window's envelope.
 *
 * @param row - the registry row; it owns the window's identity.
 * @param outcome - what the provider composition produced for this window.
 * @param now - the clock, passed in rather than read here so a drive can pin it.
 */
export function buildEnvelope(row: WindowRow, outcome: ProviderOutcome, now: Date): WindowEnvelope {
  const at = iso(now)
  const payload: ProviderWindow | null = outcome.payload
  const rawItems: unknown = payload?.items
  const items: readonly WindowItem[] = Array.isArray(rawItems)
    ? rawItems.map((entry, index) => normalizeItem(entry, index))
    : []

  const supplied = asRecord(payload?.census)
  const suppliedNumerator = typeof supplied.numerator === 'number' ? supplied.numerator : null
  const suppliedDenominator = typeof supplied.denominator === 'number' ? supplied.denominator : null
  const suppliedPopulation = typeof supplied.population === 'string' && supplied.population.length > 0 ? supplied.population : null

  const unavailable =
    outcome.landed === false
      ? {
          reason: `provider not landed: ${outcome.path} was not on disk when this build's static import set was fixed`,
          measuredAt: at,
        }
      : outcome.failed !== null
        ? outcome.failed
        : payload?.unavailable !== null && payload?.unavailable !== undefined
          ? payload.unavailable
          : null

  /**
   * THE CENSUS OF AN UNAVAILABLE WINDOW IS NOT `0 / 0` — IT IS NOT MEASURED.
   *
   * `prov-plugins` states this itself in its own header: *"a zero on both sides is
   * instrument failure, not a pass"*. The CONTRACT requires a `census` object on
   * every envelope, so the object is present — with `numerator` and `denominator`
   * **`null`** and a `population` that repeats the provider's own reason. A
   * derived `0 / 0` would read as "measured: there are no such plugins", which is
   * a claim the assembly is in no position to make about a window whose provider
   * never answered.
   */
  const anySupplied = suppliedNumerator !== null || suppliedDenominator !== null || suppliedPopulation !== null
  const census: Census = anySupplied
    ? {
        numerator: suppliedNumerator,
        denominator: suppliedDenominator,
        population: suppliedPopulation ?? 'the provider supplied a count without stating its population; treat this count as unattributed rather than as a census',
        at: typeof supplied.at === 'string' && supplied.at.length > 0 ? supplied.at : at,
      }
    : unavailable !== null
      ? {
          numerator: null,
          denominator: null,
          population: `NOT MEASURED: ${unavailable.reason}`,
          at,
        }
      : items.length === 0
        ? {
            /**
             * A DERIVED `0/0` IS NOT A MEASUREMENT, and this branch exists because
             * `prov-plugins` asked for it in exactly these terms: *"a derived `0` on
             * a window I reported as `unavailable` would resurrect exactly the `0/0`
             * reading I refuse to publish."* The unavailable case is handled above;
             * this is the OTHER case — a provider that reported itself healthy and
             * returned no items and no census. `0/0` there reads as "measured: there
             * are none", which the assembly cannot know. So it is `null/null` with
             * the reason stated, and `items.length` stays visibly `0` in the array.
             */
            numerator: null,
            denominator: null,
            population:
              'NOT MEASURED: the provider supplied no census and returned zero items, so this window has an EMPTY LIST rather than a measured zero — a 0 on both sides is instrument failure, not a pass',
            at,
          }
        : {
          numerator: items.length,
          denominator: items.length,
          population: `items in this payload's own \`items\` array — NOT a catalog census and NOT a count of plugins in existence`,
          at,
        }

  const providerFalsifiers = normalizeFalsifiers(payload?.falsifiers)
  const windowOverride = asRecord(payload?.window)
  const kind = asKind(windowOverride.kind) ?? row.meta.kind
  const stale = normalizeStale(payload?.stale)

  return {
    window: {
      id: row.meta.id,
      label: row.meta.label,
      description:
        typeof windowOverride.description === 'string' && windowOverride.description.length > 0
          ? windowOverride.description
          : row.meta.description,
      kind,
    },
    generatedAt: at,
    census,
    items,
    unavailable,
    /**
     * REQUIRED AND NULLABLE (`lead`'s ruling, so it is checkable rather than taste):
     * the same `null | {...}` convention the CONTRACT already uses for
     * `unavailable`, and never optional — an optional field would let a provider
     * OMIT it, and `undefined !== null`. `prov-tools-skills` paid for exactly that
     * this round: `skills.ts` left `unavailable` undefined, its own check asserted
     * `=== null`, and the absent field passed for a present one.
     */
    stale,
    controls: normalizeControls(payload?.controls),
    falsifiers: [...providerFalsifiers, ...assemblyFalsifiers(census, items.length)],
  }
}

/**
 * Did the provider WRITE the `stale` key at all?
 *
 * `stale: null` and an absent `stale` both normalise to `null` in the envelope, and
 * they are not the same fact: the first is a provider stating that its live read
 * was healthy, the second is a provider that never considered the question. The
 * envelope cannot preserve that difference in its own required field, so it is
 * reported separately and `/gui/health` counts it — **an absence of a READING is
 * not an absence of a VALUE**, and a true/false summary would erase it.
 */
export function staleWasWritten(payload: ProviderWindow | null): boolean {
  return payload !== null && typeof payload === 'object' && 'stale' in (payload as Record<string, unknown>)
}

/** One row of the tab catalog. `available` is a measured fact, not a hard-coded true. */
export interface SectionRow {
  readonly id: WindowId
  readonly label: string
  readonly description: string
  readonly kind: ThreeKind
  readonly provider: ProviderKey
  readonly parent: WindowId | null
  readonly providerLanded: boolean
  readonly available: boolean
  readonly itemCount: number | null
  readonly census: Census
  readonly unavailable: { readonly reason: string; readonly measuredAt: string } | null
  /** Non-null when the window answered from a census rather than a live read. */
  readonly stale: { readonly reason: string; readonly boundMs: number | null; readonly at: string } | null
  /** Whether the provider WROTE the `stale` key; `false` = it never considered the question. */
  readonly staleReported: boolean
}

/** The `/gui/sections` payload: the catalog, plus the rail order the client renders. */
export interface SectionsPayload {
  readonly generatedAt: string
  readonly census: Census
  readonly primary: readonly WindowId[]
  readonly advanced: readonly WindowId[]
  /**
   * HOW MANY PROVIDERS ACTUALLY WROTE THE `stale` KEY.
   *
   * The envelope's `stale` is required, so every window SERVES the key; but a
   * provider that never wrote it and a provider that wrote `null` are different
   * facts, and a required output field cannot carry that difference. This census
   * does, so "nobody measured staleness" cannot read as "nobody is stale".
   */
  readonly staleCensus: {
    readonly reporting: number
    readonly reportingDegraded: number
    readonly total: number
    readonly population: string
  }
  readonly sections: readonly SectionRow[]
}

/** Which envelope a row's id sits inside: the four advanced ids belong to `advanced`. */
function parentOf(id: WindowId): WindowId | null {
  return (ADVANCED_IDS as readonly string[]).includes(id) ? 'advanced' : null
}

/**
 * Build the tab catalog.
 *
 * `available` is `true` only when the provider LANDED and did not self-report
 * unavailable. A window that is unavailable is still listed — the contract is a
 * catalog of ten windows, and dropping one would make an absence indistinguishable
 * from a window that was never specified.
 */
export function buildSections(outcomes: readonly ProviderOutcome[], now: Date): SectionsPayload {
  const at = iso(now)
  const sections: readonly SectionRow[] = WINDOW_ROWS.map((row) => {
    const outcome = outcomes.find((candidate) => candidate.windowId === row.meta.id)
    if (outcome === undefined) {
      // NOT the same as "landed: false": this is the assembly's own bookkeeping
      // failing to produce a row at all, which must be visible rather than counted
      // as an absence of the provider.
      return {
        id: row.meta.id,
        label: row.meta.label,
        description: row.meta.description,
        kind: row.meta.kind,
        provider: row.provider,
        parent: parentOf(row.meta.id),
        providerLanded: false,
        available: false,
        itemCount: null,
        census: {
          numerator: null,
          denominator: null,
          population: 'NOT MEASURED: the assembly produced no provider outcome for this window',
          at,
        },
        unavailable: { reason: 'the assembly produced no provider outcome for this window', measuredAt: at },
        stale: null,
        staleReported: false,
      }
    }
    const envelope = buildEnvelope(row, outcome, now)
    const answering = isAnswering(outcome)
    return {
      id: envelope.window.id,
      label: envelope.window.label,
      description: envelope.window.description,
      kind: envelope.window.kind,
      provider: row.provider,
      parent: parentOf(envelope.window.id),
      providerLanded: outcome.landed,
      available: answering,
      itemCount: answering ? envelope.items.length : null,
      census: envelope.census,
      unavailable: envelope.unavailable,
      stale: envelope.stale,
      staleReported: staleWasWritten(outcome.payload),
    }
  })

  const answered = sections.filter((section) => section.available).length
  return {
    generatedAt: at,
    census: {
      numerator: answered,
      denominator: sections.length,
      population: 'the ten windows in the CONTRACT: available means the provider landed and did not report unavailable',
      at,
    },
    primary: PRIMARY_IDS,
    advanced: ADVANCED_IDS,
    staleCensus: {
      reporting: sections.filter((section) => section.staleReported).length,
      reportingDegraded: sections.filter((section) => section.stale !== null).length,
      total: sections.length,
      population: 'the ten windows: `reporting` counts providers that WROTE the stale key; `reportingDegraded` counts those whose written value is a marker rather than null',
    },
    sections,
  }
}
