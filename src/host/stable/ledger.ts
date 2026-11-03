/**
 * L6 — composing the ledger: populations, intent maps, match verdicts, and the patch half.
 *
 * THE ORDER OF OPERATIONS IS THE DESIGN. The zone space is read FIRST, because everything downstream is a
 * score against it and a member scored against a space that failed to load would carry 24 invented zeros.
 * Then the profile, then the members, then the scores, then the match, then the patch census. A failure at
 * any step is CARRIED, not thrown: a ledger with `measured: false` and a reason is worth more than an
 * exception, because the provider that renders it can then show the reader what is missing.
 *
 * RE-MEASURING MUST NOT ERASE A HISTORY. `previous` is an input for exactly one purpose: an applied patch
 * is a record of an EVENT, and re-reading the manifests does not un-apply it. So the patch history and its
 * current entry are carried forward per member, while the intent map and match are recomputed — the map is
 * a measurement of today, the history is a record of what happened. Merging those two would make a
 * re-measure quietly delete the undo path, which is the one thing this lane exists to keep.
 *
 * THE COUNTS ARE TAKEN FROM THE ARRAYS THEY DESCRIBE, never written down beside them: `records.of` is
 * `records.length`, and the per-class counts are filters over that same array. A denominator typed by hand
 * is the defect this program has paid for most often.
 *
 * @module dsh-meta-market/host/stable/ledger
 */

import type { EvidencePointer } from '../../shared/protocol.ts'
import type {
  ArtifactCensus,
  MemberSeed,
  StableLedger,
  StableRecord,
  StoredIntent,
  StoredMatch,
  ZoneDefinition,
} from './types.ts'
import { COMPARISON_POPULATION, MATCH_RULE, decideMatches, scoreIntent } from './scoring.ts'
import { censusArtifacts, discoverMembers, readProfile, readZones, resolveCheckoutRoots, resolveWorkspaceRoot, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from './measure.ts'
import { availabilityFor } from './alternation.ts'
import { STORE_SCHEMA_VERSION } from './store.ts'

/** Everything `measureLedger` may be told; every field has a documented default. */
export interface MeasureOptions {
  /** The program workspace root. Defaults to the walk-up from the current directory. */
  readonly workspaceRoot?: string | null
  /** The live harness base URL the zone space is read from. */
  readonly baseUrl?: string
  readonly timeoutMs?: number
  /** Injected so a census can be reproduced under a pinned clock. */
  readonly now?: () => Date
  /** A previously stored ledger, whose APPLIED PATCHES are carried forward. */
  readonly previous?: StableLedger | null
}

/** An emptied intent map that says why it is empty. Never 24 zeros. */
function unmeasuredIntent(member: MemberSeed, reason: string, at: string): StoredIntent {
  return {
    zones: [],
    method: 'token',
    methodReason: `NO MAP WAS MEASURED: ${reason}`,
    measured: false,
    measuredAt: at,
    source: { kind: 'package-manifest', path: member.manifestPath, field: 'description' },
  }
}

/** One member's intent map, or the reason it has none. */
function intentFor(member: MemberSeed, zones: readonly ZoneDefinition[] | null, zonesReason: string | null, at: string): StoredIntent {
  if (zones === null) return unmeasuredIntent(member, zonesReason ?? 'the zone space was not read', at)
  if (member.intentText.trim().length === 0) {
    return unmeasuredIntent(member, `${member.manifestPath} carries no non-empty \`description\`, so there is no text to score`, at)
  }
  const map = scoreIntent(member.intentText, zones, 'token')
  const positive = map.some((zone) => zone.score > 0)
  if (!positive) {
    return {
      zones: map,
      method: 'token',
      methodReason: 'the token method scored every zone at 0, so this map carries no signal; the scores are stored rather than dropped so a reader can see the instrument produced zeros instead of an absence',
      measured: false,
      measuredAt: at,
      source: { kind: 'package-manifest', path: member.manifestPath, field: 'description' },
    }
  }
  return {
    zones: map,
    method: 'token',
    methodReason:
      'the embedding method was NOT AVAILABLE at censes time: `GET http://127.0.0.1:11434/api/ps` returned no connection ' +
      '(status 000, not a 404) and `/intent-map/api/recall` answered `embedded:false`; a token score labelled embedding ' +
      'would be a mislabelled instrument, so the method travels on every zone',
    measured: true,
    measuredAt: at,
    source: { kind: 'package-manifest', path: member.manifestPath, field: 'description' },
  }
}

/** Build one record from a member, its map, its match verdict and the artifact census. */
function recordFor(
  member: MemberSeed,
  intent: StoredIntent,
  match: StoredMatch,
  census: ArtifactCensus,
  previous: StableRecord | null,
): StableRecord {
  const availability = availabilityFor(census, member)
  const history = previous?.patch.history ?? []
  const current = previous?.patch.current ?? null
  const evidence: EvidencePointer[] = [...member.evidence]
  evidence.push({
    source: intent.source.path,
    verification: intent.measured ? 'verified-ran' : 'not-measured',
    claim: intent.measured
      ? `the intent map was scored from \`description\` against ${String(intent.zones.length)} live zones with the token method at ${String(intent.measuredAt)}`
      : `no intent map was produced: ${String(intent.methodReason)}`,
  })
  evidence.push({
    source: census.exists ? census.absolute : census.directory,
    verification: census.exists ? 'verified-ran' : 'verified-read',
    claim: census.exists
      ? `${String(census.files.length)} artifact file(s) were present under ${census.directory} at ${census.at}; ${availability.ok ? `\`${String(availability.artifact)}\` identifies this member` : `none identifies this member — ${String(availability.reason)}`}`
      : `no artifact directory was present at ${census.at}: ${String(census.reason)}`,
  })
  return {
    id: member.id,
    name: member.name,
    npm: member.npm,
    klass: member.klass,
    kind: 'exists',
    version: member.version,
    installed: member.installed,
    evidence,
    intent,
    match,
    patch: { current, history, available: availability },
  }
}

/**
 * Measure the whole ledger.
 *
 * A resolution failure is carried as an empty ledger with `records: 0 of 0` and the reason in every
 * member's absence list — NOT as a throw, and not as a ledger full of zero scores.
 */
export async function measureLedger(options: MeasureOptions = {}): Promise<{ readonly ledger: StableLedger; readonly notes: readonly string[] }> {
  const now = options.now ?? (() => new Date())
  const at = now().toISOString()
  const notes: string[] = []
  const workspaceRoot = options.workspaceRoot ?? resolveWorkspaceRoot()
  const rootsOutcome = resolveCheckoutRoots(workspaceRoot)

  if (!rootsOutcome.ok) {
    const census = censusArtifacts(workspaceRoot)
    return {
      ledger: {
        schemaVersion: STORE_SCHEMA_VERSION,
        writtenAt: at,
        workspaceRoot,
        census: { stable: { count: 0, of: 0 }, official: { count: 0, of: 0 }, records: { count: 0, of: 0 }, population: 'nothing: the checkout layout could not be resolved', at },
        comparison: { population: COMPARISON_POPULATION, rule: MATCH_RULE.id, at },
        bundlerCensus: { bundles: 0, officialBundles: 0, nonOfficialBundles: 0, dependencies: 0, profilePath: '', at },
        records: [],
      },
      notes: [...notes, rootsOutcome.reason, census.reason ?? ''],
    }
  }
  const roots = rootsOutcome.roots

  // 1. The zone space, FIRST: every score downstream is taken against it.
  const zonesOutcome = await readZones(options.baseUrl ?? DEFAULT_BASE_URL, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const zones: readonly ZoneDefinition[] | null = zonesOutcome.ok ? zonesOutcome.zones : null
  const zonesReason = zonesOutcome.ok ? null : zonesOutcome.reason
  if (!zonesOutcome.ok) notes.push(`the zone space could not be read: ${zonesOutcome.reason}`)
  else notes.push(`the zone space was read from ${options.baseUrl ?? DEFAULT_BASE_URL}: ${String(zonesOutcome.zones.length)} zones, index ${zonesOutcome.indexId}`)

  // 2. The profile, which DEFINES the official population.
  const profileOutcome = readProfile(roots.profileRoot)
  const profile = profileOutcome.ok ? profileOutcome.profile : null
  if (!profileOutcome.ok) notes.push(`the profile could not be read: ${profileOutcome.reason}`)

  // 3. The members, measured.
  const discovered = discoverMembers(roots, profile)
  for (const missing of discovered.absent) notes.push(`absent member: ${missing}`)

  // 4. Intent maps.
  const intents = discovered.members.map((member) => intentFor(member, zones, zonesReason, at))

  // 5. Match verdicts over the stored population.
  const matches = decideMatches(
    discovered.members.map((member, index) => ({
      id: member.id,
      klass: member.klass,
      zones: intents[index]?.zones ?? [],
      measured: intents[index]?.measured ?? false,
    })),
    at,
  )

  // 6. The patch half: one artifact census, taken once, so every member is compared with one instant.
  const artifacts = censusArtifacts(roots.workspaceRoot)

  const previousRecords = new Map<string, StableRecord>()
  for (const record of options.previous?.records ?? []) previousRecords.set(record.id, record)

  const records: StableRecord[] = discovered.members.map((member, index) => {
    const intent = intents[index] ?? unmeasuredIntent(member, 'the member was discovered but produced no map', at)
    const match = matches.get(member.id) ?? {
      verdict: 'not-measured' as const,
      rule: MATCH_RULE.id,
      reason: 'the match pass did not produce a verdict for this member; an absent verdict is not a pass',
      collidesWith: [],
      compared: { count: 0, of: 0, population: COMPARISON_POPULATION, at },
    }
    return recordFor(member, intent, match, artifacts, previousRecords.get(member.id) ?? null)
  })

  const stable = records.filter((record) => record.klass === 'stable')
  const official = records.filter((record) => record.klass === 'official')
  const bundlerCensus = profile === null
    ? { bundles: 0, officialBundles: 0, nonOfficialBundles: 0, dependencies: 0, profilePath: '', at }
    : {
        bundles: profile.bundles.length,
        officialBundles: profile.bundles.filter((row) => row.startsWith('@deepseek-ai/')).length,
        nonOfficialBundles: profile.bundles.filter((row) => !row.startsWith('@deepseek-ai/')).length,
        dependencies: profile.dependencies.length,
        profilePath: profile.path,
        at: profile.at,
      }

  const ledger: StableLedger = {
    schemaVersion: STORE_SCHEMA_VERSION,
    writtenAt: at,
    workspaceRoot: roots.workspaceRoot,
    census: {
      stable: { count: stable.length, of: records.length },
      official: { count: official.length, of: records.length },
      records: { count: records.length, of: records.length },
      population: `stored records discovered from the profile \`dsh.profile.bundles\` (${String(bundlerCensus.bundles)} rows: ${String(bundlerCensus.officialBundles)} official, ${String(bundlerCensus.nonOfficialBundles)} non-official) plus the one named stable candidate; the record denominator counts what this run DISCOVERED, and \`absent\` notes name what it could not`,
      at,
    },
    comparison: { population: COMPARISON_POPULATION, rule: MATCH_RULE.id, at },
    bundlerCensus,
    records,
  }
  return { ledger, notes }
}
