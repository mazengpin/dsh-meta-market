/**
 * L4 — the routes, as a TABLE rather than as a chain of registrations.
 *
 * WHY A TABLE. A route table can be ENUMERATED, and an enumerable set is one a
 * verifier can compare against a documented list, a self-check can assert the
 * size of, and a reader can count. Routes registered by successive calls to
 * `ctx.webServer.register` are invisible to all three, and the failure mode —
 * a route that exists and is not in the documentation, or a documented route
 * that was never registered — is exactly the kind a program discovers by
 * accident. This module owns the table and the dispatch; the HOST owns the
 * prefix registration, so that two lanes cannot both claim a prefix.
 *
 * THE FAILURE VOCABULARY IS BORROWED FROM A SIBLING RATHER THAN INVENTED, and
 * the borrowing is deliberate so that the two plugins answer alike: 405 for a
 * wrong method, 404 for an unknown path, 400 for a request the handler cannot
 * read, 502 for a handler that threw. THE RULE THAT MATTERS MOST: a 200 is
 * never returned for a failure. A route that answers `200 {"ok": false}` trains
 * every consumer to read the body, and the first consumer that does not will
 * treat a failure as a success.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not register the prefix, does not read
 * the request body from the network, and does not apply a patch. It maps a path
 * and a method to a handler and returns the handler's own response. `dispatch`
 * returns `false` — not a 404 — when the path is not one of ours, because a
 * different lane may own it and answering 404 here would steal that route.
 */

import { quarantineRoot, resolveWorkspaceRoot, stage, read, revert, census, sealEnvelope } from './quarantine.ts'
import { promotionRule, verifyEnvelope, runSelfCheck, BLINDNESS_REGISTER, PARKED_CHECKS, HASH_ALGORITHM, SIGNATURE_ALGORITHM, KNOWN_CAPABILITIES, RED_LINE_FAMILIES, RED_LINE_CENSUS, AUTO_PROMOTION_PROHIBITED_RED_LINES } from './verify.ts'
import type { PatchEnvelope, PromotionTerms, VerifyPorts } from './types.ts'

/** What a handler returns: a status and a JSON-serialisable body. */
export interface RouteResponse {
  readonly status: number
  readonly body: unknown
}

/** What a handler is given. The body has already been read and parsed by the host. */
export interface RouteRequest {
  readonly method: string
  /** The path WITHOUT the plugin's prefix, leading slash included. */
  readonly path: string
  readonly body: unknown
  /** Injected zone lookup, when the host has one. Absent means the check abstains. */
  readonly zoneExists?: (zoneId: string) => { readonly exists: boolean; readonly reason: string | null }
  readonly now?: () => Date
}

/** One row of the table. `methods` is a list so a path can be read one way and written another. */
export interface RouteRow {
  readonly path: string
  readonly methods: readonly string[]
  /** One line stating what the route answers, for the documentation and the census. */
  readonly summary: string
  readonly handler: (request: RouteRequest) => RouteResponse
}

/** The default promotion terms. Exported so a caller can SEE the policy it is applying. */
export const DEFAULT_PROMOTION_TERMS: PromotionTerms = {
  requiresAllChecksRan: true,
  requiresHumanForRedLines: true,
  requiresReversesPath: true,
  autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES,
}

function summaryOf(): { readonly registeredChecks: number; readonly parkedChecks: number; readonly blindnessEntries: number } {
  return {
    registeredChecks: 9,
    parkedChecks: PARKED_CHECKS.length,
    blindnessEntries: BLINDNESS_REGISTER.length,
  }
}

function portsOf(request: RouteRequest): Partial<VerifyPorts> {
  return {
    ...(request.zoneExists === undefined ? {} : { zoneExists: request.zoneExists }),
    ...(request.now === undefined ? {} : { now: request.now }),
  }
}

/**
 * The route table. Nine rows, each naming its methods and its one-line purpose.
 *
 * `patch/status` is the row a monitoring process reads; it reports the counts
 * this lane publishes about itself, so that a lane which silently loses a check
 * is visible from outside rather than only from its own self-check.
 */
export const PATCH_ROUTES: readonly RouteRow[] = [
  {
    path: '/patch/status',
    methods: ['GET'],
    summary: 'Lane status: registered checks, parked checks, blindness entries, hashing and signature algorithms, and the quarantine census.',
    handler: (request) => {
      const root = resolveWorkspaceRoot()
      const counts = summaryOf()
      const quarantined = census(root)
      return {
        status: 200,
        body: {
          lane: 'L4 — patch distribution, verification, reversibility',
          appliesAnything: false,
          hashAlgorithm: HASH_ALGORITHM,
          signatureAlgorithm: SIGNATURE_ALGORITHM,
          signatureVerified: false,
          ...counts,
          knownCapabilities: KNOWN_CAPABILITIES.length,
          recognisedRedLineFamilies: RED_LINE_FAMILIES.length,
          redLineCensus: RED_LINE_CENSUS,
          autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES.length,
          quarantine: {
            root: quarantineRoot(root),
            sealedFileCount: quarantined.sealedFileCount,
            parseableCount: quarantined.parseableCount,
            directoryExists: quarantined.quarantineDirectoryExists,
            reason: quarantined.reason,
          },
          blindness: BLINDNESS_REGISTER,
          censusAt: (request.now ?? (() => new Date()))().toISOString(),
        },
      }
    },
  },
  {
    path: '/patch/verify',
    methods: ['POST'],
    summary: 'Verify an envelope WITHOUT executing it. Returns the verdict, every check, and the full blindness register.',
    handler: (request) => {
      const env = request.body as PatchEnvelope | null
      if (env === null || typeof env !== 'object' || !('package' in env) || !('proposal' in env)) {
        return {
          status: 400,
          body: {
            error: 'the body must be `{ package, proposal }`. A missing half is a request this lane cannot read, and that is a 400 rather than a verdict about the peer.',
            blindness: BLINDNESS_REGISTER,
          },
        }
      }
      const verdict = verifyEnvelope(env, portsOf(request))
      return { status: 200, body: { verdict, checkCount: verdict.checks.length, blindnessCount: verdict.blindness.length } }
    },
  },
  {
    path: '/patch/stage',
    methods: ['POST'],
    summary: 'Verify an envelope and write it to quarantine. Refuses to re-stage an existing proposalId.',
    handler: (request) => {
      const env = request.body as PatchEnvelope | null
      if (env === null || typeof env !== 'object' || !('package' in env) || !('proposal' in env)) {
        return { status: 400, body: { error: 'the body must be `{ package, proposal }`.', blindness: BLINDNESS_REGISTER } }
      }
      const root = resolveWorkspaceRoot()
      const verdict = verifyEnvelope(env, portsOf(request))
      const stored = stage(root, env, verdict)
      if (!stored.ok) {
        return {
          status: 502,
          body: {
            error: stored.reason,
            verdict,
            wrote: stored.wrote,
            note: 'this is a failure to WRITE, not a verdict about the envelope. The verdict above is the verdict taken.',
          },
        }
      }
      return { status: 200, body: { staged: true, record: stored.value, verdict } }
    },
  },
  {
    path: '/patch/revert',
    methods: ['POST'],
    summary: 'Append a `reverted` ladder entry for a staged proposal. Requires a non-empty reason. Applies nothing.',
    handler: (request) => {
      const body = request.body as { proposalId?: unknown; reason?: unknown } | null
      if (body === null || typeof body !== 'object' || typeof body.proposalId !== 'string') {
        return { status: 400, body: { error: 'the body must be `{ proposalId, reason }` with proposalId a string.' } }
      }
      if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
        return { status: 400, body: { error: 'revert requires a non-empty reason; an undo with no stated cause is indistinguishable from an accident.' } }
      }
      const root = resolveWorkspaceRoot()
      const at = (request.now ?? (() => new Date()))()
      const reverted = revert(root, body.proposalId, body.reason, at)
      if (!reverted.ok) return { status: 502, body: { error: reverted.reason, wrote: reverted.wrote } }
      return { status: 200, body: { reverted: true, record: reverted.value, note: 'the ladder moved. NO reversal was performed; see blindness B4.' } }
    },
  },
  {
    path: '/patch/promotion-rule',
    methods: ['POST'],
    summary: 'Answer whether a given verdict may leave quarantine under given terms, and why not.',
    handler: (request) => {
      const body = request.body as { verdict?: unknown; terms?: PromotionTerms } | null
      if (body === null || typeof body !== 'object') {
        return { status: 400, body: { error: 'the body must be `{ verdict, terms? }`.' } }
      }
      const verdict = body.verdict === undefined ? null : (body.verdict as Parameters<typeof promotionRule>[0])
      const terms = body.terms ?? DEFAULT_PROMOTION_TERMS
      const decision = promotionRule(verdict, terms)
      return { status: 200, body: { ...decision, terms, note: 'a `null` verdict is refused by an explicit branch, because `[].every(...)` is `true`.' } }
    },
  },
  {
    path: '/patch/self-check',
    methods: ['GET'],
    summary: 'Run this lane\'s own assertions and return each finding with the observation that would falsify it.',
    handler: (request) => {
      const findings = runSelfCheck()
      const failed = findings.filter((finding) => !finding.passed)
      return {
        status: 200,
        body: {
          total: findings.length,
          passed: findings.length - failed.length,
          failed: failed.length,
          findings,
          censusAt: (request.now ?? (() => new Date()))().toISOString(),
        },
      }
    },
  },
  {
    path: '/patch/quarantine',
    methods: ['GET'],
    summary: 'Census of staged proposals, keeping sealed-file count and parseable count apart, and reporting a missing directory as missing rather than as zero.',
    handler: (request) => {
      const root = resolveWorkspaceRoot()
      const result = census(root)
      return { status: 200, body: { ...result, root: quarantineRoot(root), censusAt: (request.now ?? (() => new Date()))().toISOString() } }
    },
  },
  {
    path: '/patch/read',
    methods: ['GET'],
    summary: 'Read one staged record back and RE-VERIFY its seal against the bytes present, reporting a tamper reading separately from a parse error.',
    handler: (request) => {
      const url = new URL(`http://localhost${request.path}`)
      const proposalId = url.searchParams.get('proposalId')
      if (proposalId === null || proposalId.length === 0) {
        return { status: 400, body: { error: 'the request must carry `?proposalId=<id>`.' } }
      }
      const root = resolveWorkspaceRoot()
      const result = read(root, proposalId)
      if (!result.ok) return { status: 404, body: { error: result.reason } }
      return { status: 200, body: { ...result.value, note: 'a `sealProblem` of null means the seal HELD against the bytes present; it does not mean the envelope is safe.' } }
    },
  },
  {
    path: '/patch/blindness',
    methods: ['GET'],
    summary: 'The blindness register on its own, so a reader can see what this lane does NOT check without asking for a verdict.',
    handler: () => ({
      status: 200,
      body: {
        note: 'These are returned on EVERY verdict. They are served separately as well so that the gap can be read without an envelope in hand.',
        entries: BLINDNESS_REGISTER,
        parkedChecks: PARKED_CHECKS,
        headlineGap: BLINDNESS_REGISTER[0]?.gap ?? null,
      },
    }),
  },
]

/**
 * A one-line description of the lane, for a landing page to render.
 *
 * `kind: 'plan'` and `appliesAnything: false` are the two fields that matter.
 * The lane is a PLAN because it has not been exercised by a live peer; it
 * applies nothing because no code path in it mutates a running system.
 */
export function describeLane(): {
  readonly id: string
  readonly kind: 'plan'
  readonly appliesAnything: false
  readonly routeCount: number
  readonly headlineGap: string | null
  readonly summary: string
} {
  return {
    id: 'L4 — patch distribution, verification, reversibility',
    kind: 'plan',
    appliesAnything: false,
    routeCount: PATCH_ROUTES.length,
    headlineGap: BLINDNESS_REGISTER[0]?.gap ?? null,
    summary:
      'A receiving instance verifies a patch WITHOUT executing it: it hashes the payload over canonical bytes, ' +
      'resolves the claimed target zone, checks the declaration for internal coherence, and refuses on mismatch. ' +
      'Signature verification is registered and NEVER RUNS, so an admitted envelope is INSPECTED, never PROVEN. ' +
      'Every applied patch keeps a ladder entry naming its undo path; nothing lands in the live market from a peer.',
  }
}

/**
 * Map a path and method to a handler, or report that the path is not ours.
 *
 * Returns `null` — NOT a 404 response — when no row matches the path. The
 * distinction is the whole reason this function exists rather than each row
 * being registered separately: a 404 from here would claim this lane owns the
 * namespace, and a sibling lane registering under the same prefix would find its
 * route shadowed by a lane that merely did not recognise it.
 *
 * A MATCHED PATH WITH A WRONG METHOD IS A 405, and it reports the methods that
 * WOULD have worked. A 404 would send the caller looking for a different URL
 * when the URL was right.
 */
export function dispatch(request: RouteRequest): RouteResponse | null {
  const path = request.path.split('?')[0]
  const row = PATCH_ROUTES.find((candidate) => candidate.path === path)
  if (row === undefined) return null
  const method = request.method.toUpperCase()
  if (!row.methods.includes(method)) {
    return {
      status: 405,
      body: { error: `\`${path}\` does not accept ${method}.`, allowed: row.methods, summary: row.summary },
    }
  }
  try {
    return row.handler(request)
  } catch (error) {
    return {
      status: 502,
      body: {
        error: `the handler for \`${path}\` threw: ${error instanceof Error ? error.message : String(error)}`,
        note: 'a 502 means the handler failed. It is not a verdict about any envelope.',
      },
    }
  }
}

/** The seal function, re-exported so the host can seal what it stages without importing quarantine directly. */
export { sealEnvelope }
