/**
 * ============================================================================
 * dsh-meta-market / host / identity — the barrel
 * ============================================================================
 *
 * A re-export surface and nothing else. No logic, no I/O, no registration: the
 * Lead owns `src/host/index.ts` and `src/host/routes.ts`, and a module that
 * registered a route from here would put a network surface on the trust root
 * without anyone having decided to.
 *
 * **That absence is load-bearing rather than tidy.** The trust root is the
 * owner's local allowlist, and its security property is that no peer can write
 * to it. There is deliberately no route in this module that mutates the store,
 * so the surface a peer can reach cannot promote a peer. A barrel that exported
 * a mutator would be the one place a future route could pick it up by accident.
 *
 * @module dsh-meta-market/host/identity
 */

export {
  TRUST_STAGES,
  TRUST_RANK,
  MAX_STAGE_BY_LEVEL,
  EMPTY_TRUST_STORE,
  trustRank,
  deriveKeyMaterial,
  readInstanceIdentity,
  canonicalCard,
  cardFingerprint,
  verifyCardProvenance,
  privilegeAxis,
  decideAdmission,
  refusalFor,
  exfiltrationRefusalFor,
  messageOf,
  type TrustStage,
  type TrustLevel,
  type ObservedVia,
  type PeerRecord,
  type TrustStore,
  type TrustStoreReading,
  type KeyMaterial,
  type InstanceIdentity,
  type PrivilegeAxis,
  type AdmissionDecision,
} from './trust.ts'

export { TRUST_STORE_FILE, trustStorePath, readTrustStore, recordFor, levelFor } from './store.ts'

export {
  DECLARED_CAPABILITY_TOKENS,
  AUTHENTICATED_CAPABILITY_TOKENS,
  CREDENTIAL_RED_LINE_MARKERS,
  NETWORK_RED_LINE_MARKERS,
  VOCABULARY_CENSUS,
  redLineNamesCredentials,
  redLineNamesNetwork,
} from './capability-vocabulary.ts'
