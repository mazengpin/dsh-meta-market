# DISCLOSURE ÔÇö dsh-meta-market 0.9.0

**This file states what the package IS, what it does today, what it does NOT do, what it reads and writes, and what a consumer must not conclude from it.** Where a number appears it was measured by running something, and the command is named. Where something is unmeasured it is called unmeasured rather than zero.

**STATE: SOURCE PREVIEW ÔÇö information-providing only.** This package is readable and reviewable as source. It is NOT installable from source. Install arrives with the published pre-release tarball on the `next` dist-tag, and `publishConfig.tag` is `next`.

## 1 What this package is

**The Web4 inter-system layer for DeepSeek Harness.** Peers recognise each other, hold bounded and refusable dialogue, align a meta-package against a shared 24-zone intent map, and exchange packages as reviewable, reversible patches ÔÇö with no central arbiter and no instance holding authority over the intent of another.

**Its governing document is `CHARTER.md`, and it ships in the tarball.** A charter edit is a breaking change to the wire, because the charter is where the frozen shapes come from (`src/shared/protocol.ts`). The reasoning and the rejected alternatives are in `CONTEXT.md`; the remaining work is in `ROADMAP.md`.

## 2 What it does today

**`pnpm run verify` exits 0 across eleven self-contained harnesses, measured 2026-11-03T20:13Z on node v24.21.0.** The counts, each with its denominator:

- hosting ÔÇö 18 of 18 checks, and it derives the hosting ledger from the live registry then mutates four copies to prove the predicate can go RED.
- host-half ÔÇö 40 of 40 declared assertions, 40 passed / 0 failed, against a real socket bound on an OS-assigned port (that run used 54567).
- negative-control ÔÇö 3 of 3 mutations caught, 6 of 6 control assertions satisfied, with `lib/index.js` restored byte-identical (628,106 B, sha256 `e2053c90a40bd92644250e14c37f0ec8715004699c27c331cbccb81f7d1f6525`).
- implemented-sweep ÔÇö 37 of 37 assertions, 0 failed; reports 19 VERIFIED (ran) + 0 VERIFIED (read) + 3 PLAN = 22 threats, of which 16 of 22 are IMPLEMENTED.
- barrel-check ÔÇö all checks held, 13 top-level keys, payload 6,401 B.
- disclosure ÔÇö the sentence-level disclosure walk over the real catalog (5,785 downloadable rows).
- attacker ÔÇö 31 of 31 assertions passed, 0 failed.
- census ÔÇö 15 of 15 checks, frozen expectations 15.
- dialogue ÔÇö 36 of 36 assertions passed.
- gate ÔÇö 29 of 29 checks passed, 0 skipped; the fitted token threshold 0.3407 sits inside the feasible interval (0.2584, 0.4504).
- window ÔÇö 13 of 13 checks passed.

**One harness in that list was repaired rather than excused.** `barrel-check.mjs` compared two calls of `describeSurface()` after deleting ONE timestamp, while the payload carries TWO (`standing.censusAt` and `implementation.censusAt`); a full `pnpm run verify` on 2026-11-03 went RED on that comparison for a one-millisecond boundary rather than for drift. Both timestamps are now excluded and every other field is still compared field by field ÔÇö the check was widened to its own stated intent, not weakened.

**A note on the two figures that differ from earlier prose.** `host-half` was previously recorded as 39 passed; the measured figure is 40 of 40 declared. The earlier number is one behind, and the measured one is what this file states.

**Packaging is measured the same way.** `npm pack --dry-run` on 2026-11-03 reported **130 files**, **package size 2.5 MB**, **unpacked size 9.9 MB**. The earlier published figure of 127 files was taken before `DISCLOSURE.md` and `CONTEXT.md` existed; 127 + 2 is 129, so one further file differs and was not isolated file by file, which is why this file states the measured 130 rather than reconstructing the count.

## 3 What it does NOT do

- **It does not apply a patch.** `src/host/patch/quarantine.ts` holds no code path that applies anything; a received envelope is quarantined, sealed and re-verified on read, and application belongs to whoever owns the running system.
- **It does not aggregate alignment across peers.** `aggregateAlignment(perPeer, census)` does not exist; `social/` holds pair bounds and single-instance bounds only.
- **It does not call a model and does not reach a GPU.** The two surfaces that name a model carry a `notDone` field stating the call is not made; the safety lane publishes `runsTheGate: false`.
- **It does not sign anything, authenticate a peer, or prove provenance.** See section 6.
- **It does not discover peers across a network in practice.** The DHT surface on `(zoneId, bucket)` is `plan`, and the surface says so: peers contacted is `0 of 0` and the topology is reported as `plan` rather than as a running network.
- **It does not publish itself.** No registry write happens in this package; the release owner publishes the tarball.
- **It does not guarantee that a received package is safe.** It gives you a bounded dialogue, a refusal vocabulary, a quarantine and a blindness register; it does not give you a verdict you can outsource your judgement to.

## 4 Data it reads and writes, with paths

**Read, all of it on this machine:**

- `profiles-tree/<profile>/package.json` ÔÇö the consuming profile manifest, found by walking UP for a fixed shape rather than by counting `../` (`src/host/registry/paths.ts`). It is how `mounted` is recomputed rather than asserted, and how the bundle census is taken.
- the plugin market catalog snapshot ÔÇö the frozen zone corpus and the downloadable live catalog are both read as files; the disclosure harness reported 5,785 of 5,785 rows parsed against the header of the file itself.
- `tmp/meta-market-trust.json` ÔÇö the admission list, under the workspace `tmp/`, deliberately NOT in `$DSH_HOME`. The owner writes it; this package only reads it, and it keeps absent, empty and unreadable as three separate states.
- the skill catalog roots, resolved from the home directory (`src/host/providers/skills.ts`).
- live `GET` readings of other plugins on `http://127.0.0.1:3083` ÔÇö see section 5.

**Written, all of it under the workspace:**

- `.dsh/meta-market/stable-official/ledger.json` ÔÇö the stable ledger, written through a temporary sibling and a rename so a reader sees the previous file in full or the new one in full; there is NO lock, so two concurrent writers can lose one write, and that is stated rather than papered over.
- `.dsh/meta-market/quarantine/<id>/record.json` and `.dsh/meta-market/quarantine/<id>/envelope.json` ÔÇö the verdict and the exact bytes that were verified.
- harness artifacts written beside their own harnesses: `last-census.json`, `last-run.json`, `last-run.json`.

**Not written: nothing under `127.0.0.1:3083`, and nothing outside the workspace.** No credential, no key material and no anonymous user id is written by this package.

## 5 Network ÔÇö what it listens on, and what has never been exercised

**The plugin opens NO listening socket of its own.** `apply()` registers exactly one route prefix (`meta-market/api`, kind `prefix`) through the DSH web server it injects, and the host-half harness asserts this directly: one route, one disposer, one injected service named `webServer`. So the package listens only wherever that server listens ÔÇö on this machine `http://127.0.0.1:3083`, the live GUI session of the owner.

**What actually binds a socket is a harness, never the plugin:** `host-half.mjs` and the dialogue harness bind `127.0.0.1` on port `0`, i.e. an OS-assigned loopback port, and the dialogue harness drives two instances over that loopback socket.

**NO PEER OUTSIDE ONE MACHINE HAS EVER BEEN EXERCISED.** Every dialogue claim today is one host against a fixture; no packet from this package has crossed a machine boundary, and no two independently operated instances have ever exchanged anything. `social` reports it rather than implying otherwise: topology `plan`, peers contacted `0 of 0`, quorum `unknown`.

**The four harnesses that read ANOTHER plugin's live surface are EXCLUDED from this package's own verify**, and the exclusion is deliberate: `src/host/providers/verify/tools-skills-census.mjs`, `advanced-drive.mjs`, `probe-memory.mjs` and `meta-plugins-driver.mjs`. They measure other plugins' routes rather than this package's behaviour, and a harness that goes RED for a reason outside its subject teaches a reader to ignore its red.

**The verify chain is therefore not offline, and that is not hidden here.** Several in-chain harnesses still read the local live deployment with bounded `GET`s on `127.0.0.1:3083` ÔÇö the hosting ledger probes its own live route when one is serving, the census re-reads recorded route statuses, and the window harness replayed 19 of 19 recorded statuses against the live server. Inside this package that traffic is loopback and read-only; nothing in the package writes to, restarts or reconfigures that server, and no route of this package accepts input.

**What has NOT been measured: any behaviour over a real network.** Latency, partitioning, a hostile peer, a second machine, a firewalled hop, and a durable reconnect are all unmeasured, because none of them has been constructed.

## 6 Security posture, stated so a consumer cannot over-read it

**Nothing signs a record.** No key material exists in this build, so no envelope, verdict, ledger entry or peer identity carries a signature. Threat `T22` (producer-side signing) is carried as `PLAN` with `control is null`.

**A peer's identity is not authenticated beyond what `CHARTER.md` states.** The assembly report publishes `authenticated: false` as a MEASURED value with three pieces of evidence attached, not as a disclaimer; the identity surface does not echo the local instance id; and the gate's own falsifier is recorded as a PARTIAL, because its first conjunct needs a card that `GateDeps` cannot construct, so "a `from` differing from the card id is refused" is prose rather than a control.

**A consumer must NOT read an exchanged package as provenance.** Quarantine re-checks a seal over the bytes it actually read, which proves the file did not change between write and read ÔÇö it does not prove who wrote it. Consistency is not authenticity, and the safety surface says exactly that in its own field.

**What the package does give you:** bounded dialogue steps, 18 refusal codes, a 22-threat table with an honest standing split (19 ran, 0 read, 3 plan), a union privilege gate, replay and budget controls, a quarantine that never applies anything, and a seven-entry blindness register returned as a value on every patch verdict.

## 7 Licence, engines, and one deliberate export

**Licence: MIT.** See `LICENSE`.

**Engines:** `node` `^22.19.0 || >=24.0.0` and `dsh` `>=0.2.2-0 <0.3.0`. Node 24.21.0 is what the measured verify run used.

**`exports["./shared/protocol"]` points at TypeScript source on purpose** ÔÇö `./src/shared/protocol.ts`, not a compiled artifact. A consumer that imports it needs a TypeScript loader; that is the cost of shipping the wire shapes as the single source of truth rather than as a copy that can drift. The Host and browser halves are compiled (`./lib/index.js`, `./lib/client.js`) and are what the bundles entry consumes.

**There is no `repository` field, and this file will not invent one.** The release owner sets the repository URL at publish time; until then a reader must not infer a canonical upstream from this package.

## 8 State of this release

**SOURCE PREVIEW ÔÇö information-providing only.** Readable and reviewable: the source, the charter, this disclosure, the context and the roadmap all ship so that a stranger can audit the claims without installing anything.

**NOT installable from source.** `pnpm install && pnpm run build` here describes DEVELOPING the clone, not consuming it. A consumer installs the published pre-release tarball from the `next` dist-tag; there is no supported path in which a profile links this working tree.

**What arrives with the tarball:** `lib/index.js`, `lib/client.js`, `lib/client.js.map`, `src`, `cordis.patch.yml`, `CHARTER.md`, `README.md`, `LICENSE`, `ROADMAP.md`, `DISCLOSURE.md`, `CONTEXT.md`.

**CORRECTED IN PLACE 2026-11-03T20:52Z — the pack is `129` files, not `130`, and the difference was a defect rather than a count.** `src/host/registry/verify/last-census.json` was a TIMESTAMPED RUN ARTIFACT written beside its own driver, so a `files: ["src"]` package shipped it and the packed file count moved between runs (130 with it, 129 without). The driver now writes `verify-output/last-census.json`, outside `src/`, and that directory is in `.gitignore`; `node --experimental-strip-types src/host/registry/verify/census.mjs` still reports `checks: 15/15 passed · VERDICT: CENSUS OK`. This also explains why a staged copy could not be byte-identical to source: it was the only one of 300 staged files that differed.
