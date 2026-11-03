import type { EmbeddingIdentity, Maybe } from '../../shared/protocol.ts'
import type { IdentityGuard } from './types.ts'

/**
 * The identity guard, reusing the `dsh-intent-map` precedent rather than inventing a second dialect.
 *
 * Two dialects in one program is how a consumer ends up handling one and not the other, so the shape
 * is taken from the sibling's own guard (`plugins-src/dsh-intent-map/src/host/recall.ts`,
 * VERIFIED (read)): a cheap PRE-FLIGHT against what we expected, and a POST-CALL check against what
 * the substrate says about itself. The second half is the one that cannot drift, because the name is
 * not a string this lane chose.
 *
 * A DIMENSION CHECK IS NOT ENOUGH, AND THE SIBLING SAYS WHY: Laya's hidden size is 1024 and
 * `qwen3-embedding:0.6b` is ALSO 1024, so a width comparison passes across two entirely different
 * spaces. A guard that checked only `dim` would wave through the exact substitution it exists to
 * catch — which is why `model` is compared FIRST and a width disagreement is only a secondary tell.
 */

/**
 * Compare the index's recorded identity against the live one.
 *
 * THREE-STATE, AND `null` IS NOT `false`. `true` means two readings agree; `false` means two were
 * taken and DIFFER; `null` means the live half could not be read at all. The gate in `operator.ts`
 * tests `agrees.value !== true`, not `=== false`, so an unreadable identity refuses rather than
 * scoring — testing `=== false` is the most likely way this guard would be defeated in practice,
 * because a failed probe is an ordinary event and a guard that reads "no reading" as "no problem"
 * fails OPEN.
 */
export function guardIdentity(index: EmbeddingIdentity, live: EmbeddingIdentity): IdentityGuard {
  // The live half is absent: we cannot compare, so we do not compare. `null`, never `false`.
  if (live.model === null) {
    return {
      agrees: {
        value: null,
        reason:
          'the live identity could not be read, so no comparison was legal. On the `ollama` dialect the live half is a RESIDENT-LIST reading (`/api/ps`), not a per-request self-report, so it can show that the loaded SET changed but cannot prove which model served a particular request when two are resident.',
      },
      index,
      live,
      refusalReason: {
        value: null,
        reason: 'no refusal is recorded because no comparison was made',
      },
    }
  }

  // The index half is absent: there is nothing to compare the live reading against.
  if (index.model === null) {
    return {
      agrees: {
        value: null,
        reason:
          'the INDEX did not record a model name, so there is nothing to compare the live reading against',
      },
      index,
      live,
      refusalReason: {
        value: null,
        reason: 'the index identity is unreadable, so no comparison was legal',
      },
    }
  }

  // Two readings, and they differ. This is `false`, not `null`, and it is a refusal.
  if (live.model !== index.model) {
    return {
      agrees: { value: false, reason: null },
      index,
      live,
      refusalReason: {
        value: `the embedding identity changed: the index was built with '${index.model}' but the substrate is serving '${live.model}'. Refusing rather than scoring across two vector spaces — a similarity computed between them is not a small similarity, it is not a similarity.`,
        reason: null,
      },
    }
  }

  // Same name, two widths. Same name is not same space.
  if (index.dim !== null && live.dim !== null && index.dim !== live.dim) {
    return {
      agrees: { value: false, reason: null },
      index,
      live,
      refusalReason: {
        value: `the same model name '${index.model}' is recorded at two widths: the index at ${String(index.dim)} and the substrate at ${String(live.dim)}. Same name is not same space.`,
        reason: null,
      },
    }
  }

  return {
    agrees: {
      value: true,
      reason:
        live.dim === null
          ? 'the model names agree; a live dim reading is unavailable on this dialect, so the width was NOT compared'
          : null,
    },
    index,
    live,
    refusalReason: { value: null, reason: 'the identity agreed, so nothing was refused' },
  }
}

/**
 * The cheap pre-flight: what this lane EXPECTED the embedder to be, against what the index recorded.
 *
 * No network. `value: null` means they agree; a non-null `value` is the reason to refuse.
 */
export function preflightIdentity(expectedModel: string, index: EmbeddingIdentity): Maybe<string> {
  if (index.model === null) {
    return {
      value: 'the index records no model name, so the expected embedder cannot be checked',
      reason: null,
    }
  }
  if (index.model !== expectedModel) {
    return {
      value: `the index was built with '${index.model}' but this lane expects '${expectedModel}'`,
      reason: null,
    }
  }
  return { value: null, reason: 'the expected embedder matches the index' }
}
