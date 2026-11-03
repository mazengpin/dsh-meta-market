/**
 * L3 — Alignment to the universal intent map. The lane's public surface.
 *
 * The `ZONE_WRITE_POLICY` is exported first on purpose: a caller who imports this module has, by that
 * act, the statement that this lane PROPOSES zone assignments and never writes them.
 */
export { ZONE_WRITE_POLICY, alignPackage, byScoreDescending, laneEvidence } from './operator.ts'
export type { AlignmentInput } from './operator.ts'
export {
  ALIGN_THRESHOLD,
  ALIGN_THRESHOLD_VALUE,
  MEASURED_SEPARATION,
  aboveThresholdCensus,
  clearsThreshold,
} from './threshold.ts'
export type { ThresholdComparison } from './threshold.ts'
export { guardIdentity, preflightIdentity } from './identity.ts'
export { LIVE_CATALOG_NOT_MEASURED, buildCensus, integrityPermitsScoring } from './census.ts'
export type { IndexFacts } from './census.ts'
export {
  INTENT_MAP_ROUTES,
  ALIGNMENT_EVIDENCE,
  SHARED_VERDICT_OF,
} from './types.ts'
export type {
  AlignmentCensus,
  AlignmentResult,
  AlignmentThreshold,
  AlignmentVerdict,
  IdentityGuard,
  ReadOutcome,
  ZoneScore,
  ZoneWritePolicy,
} from './types.ts'
export { cosine, readIndexFacts, readLiveIdentity, readJson, readZoneScores } from './client.ts'
export type { IdentityPayload, MapPayload, RecallPayload } from './client.ts'
