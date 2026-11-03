/**
 * ============================================================================
 * dsh-meta-market — Host half: REGISTRATION ONLY
 * ============================================================================
 *
 * WHAT THIS FILE IS
 *
 * This file declares a name, declares one injected service, and registers one
 * route prefix inside one `ctx.effect`. It contains no decision, no threshold
 * and no branch that changes the status of anything. The route table, the lane
 * report and every payload shape live in `./routes.ts`.
 *
 * **The split is load-bearing rather than tidy.** It makes one question
 * answerable by reading this file alone — *does this plugin decide anything at
 * registration time?* — and the answer has to be no, because a decision taken at
 * boot is a decision nobody can audit afterwards. This program has already
 * recorded what happens when the enforcement point and the thing it governs are
 * the same artifact.
 *
 * THE DIRECTIVE THIS SERVES
 *
 * The owner asked for a plugin that "give[s] the capabilities for system where
 * intent of user is already formed and the other meta plugins are established;
 * To talk to other systems that belongs to the other users and align the meta
 * packages with universal intent map, cordis hard way". `protocol.ts:WEB4` fixes
 * what that means: two or more independently operated harness instances
 * recognise each other as peers, conduct bounded and REFUSABLE dialogues, align
 * their meta-packages to a shared intent map, and exchange those packages as
 * reviewable and reversible patches — with no central arbiter, and no instance
 * holding authority over another's intent.
 *
 * BUILT UNDER `D-0053`, WHICH IS THE ONLY REASON THIS FILE MAY EXIST
 *
 * The program's one hard prohibition (`D-0002`) forbade creating any
 * `dsh-meta-*` plugin. The OWNER superseded it for this single name at
 * `2026-10-16T16:44:27.812Z`. This tree was then removed by mistake at
 * `17:00:10.326Z` — the removal enforcing the already-revoked rule — and is
 * being rebuilt under `D-0060`. **A reader who finds the prohibition quoted
 * elsewhere and reaches for the check should read `AGENTS.md`
 * §"The one hard prohibition" in full first:** the check is a SUBSET test
 * (`dsh-meta-*` minus `dsh-meta-market` must be empty), and the older
 * emptiness form is an instruction to delete this file.
 *
 * WHAT IS *NOT* DONE HERE, AND WHY THAT IS THE HONEST STATE
 *
 * This plugin is **not mounted**. `cordis.patch.yml` carries the `insert` row
 * and no profile manifest consumes this package, so nothing loads it and nothing
 * serves its prefix on any port. Its kind is `plan`. `describeAssembly()`
 * returns that kind as a FIELD rather than leaving it to a doc comment, because
 * a plan reported as an existence claim is this program's most-published defect.
 *
 * The assembly also reports `authenticated: false`, which is not a disclaimer
 * but a consequence of three independent measurements by three lanes — the
 * deployment holds an IDENTIFIER and no KEY, so no route here is offered that
 * would only be safe if authentication existed.
 *
 * @module dsh-meta-market/host
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle, PREFIX } from './routes.ts'
import type { HostContext, RouteRegistrar } from './types.ts'

/** Loader row name; the bundle patch's single `insert` mounts this same name. */
export const name = 'dsh-meta-market'

/** The one service this plugin cannot work without. */
export const inject = ['webServer']

/**
 * Register the prefix.
 *
 * `ctx.effect` is what makes the registration REVERSIBLE: the callback returns a
 * disposer, the host holds it, and disposing unregisters the prefix. So a profile
 * that drops this package stops serving it instead of leaving a live route to a
 * plugin that is no longer loaded. A registration outside an effect leaks, and a
 * leaked route keeps answering after its owner is gone — which is the worst
 * possible failure mode for a surface whose entire subject is trust.
 *
 * @param ctx - the host context; the `webServer`, `effect` and `logger` members and nothing else.
 */
export function apply(ctx: HostContext): void {
  // **THE ACTIVATION LINE MAY NOT ASSERT MOUNTED-NESS.** It used to read
  // `(kind=plan, mounted=false)`, which was a LITERAL and was FALSE for a day
  // (`lead` measured the live deployment answering seven advertised paths at
  // 2026-10-17T14:51:53Z while the payload said the package was not consumed).
  // A log line emitted at boot cannot know whether a profile consumes the package,
  // so it now states only what it is: this plugin is applying, its kind, and where
  // its prefix goes. Mounted-ness is MEASURED per request from the profile
  // manifest in `routes.ts` (`readMount`) and appears in the assembly report.
  ctx.logger.info('dsh-meta-market: applying (kind=plan); prefix=%s; mounted-ness is measured per request, not asserted here', PREFIX)
  ctx.effect(
    (): RouteRegistrar => ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        await handle(req, res)
      },
    }),
  )
}
