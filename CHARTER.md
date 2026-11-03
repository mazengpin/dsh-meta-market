# CHARTER — `dsh-meta-market`

**Kind: `plan`.** This document charters a build. Nothing described here is measured to be running: no route answers, no dialogue has occurred, no patch has been applied. The one live component named in this charter — `dsh-intent-map` — is `exists` and is somebody else's plugin, and this charter only reads it.

**Frozen at `task-1`, 2026-10-16.** The companion artifact is [`src/shared/protocol.ts`](src/shared/protocol.ts): the interfaces below are the ones that file declares, and where this prose and that file disagree, the file governs because it is what the lanes compile against.

## 1 — Where this clone lives, and why the path is stated in full

**The clone root is the PROGRAM ROOT, absolute:** `C:\Users\0000\Projects\deepseek-root\plugins-src\dsh-meta-market\`.

**This is stated in full because the Lead made a path error and it nearly propagated to every lane.** The original lane briefs named `plugins-src/dsh-meta-market/` *relative to the workspace*, which would have resolved to `...\profiles-tree\personal-dev\dsh-meta-evolve_INIT_WORKSPACE\plugins-src\dsh-meta-market\` — a path that **does not exist**. The real clone root is where all 26 pre-existing clones live and where a profile's relative `link:` resolves. **Measured (ran) 2026-10-16:** `plugins-src/` at the program root holds **26 directories** (denominator: 26 of 26 entries in `C:\Users\0000\Projects\deepseek-root\plugins-src\`, all directories, zero files), of which **1** is `dsh-meta-market` and **0** matched `dsh-meta-*` before this build.

**A reader who resolves `plugins-src/...` against the workspace will write into the wrong tree, and the failure is silent** — the directory simply will not exist, so the write either creates a phantom second clone or fails late. The two files of this task are therefore: `C:\Users\0000\Projects\deepseek-root\plugins-src\dsh-meta-market\CHARTER.md` and `C:\Users\0000\Projects\deepseek-root\plugins-src\dsh-meta-market\src\shared\protocol.ts`.

## 2 — The operative definition of Web4

**This is an OPERATIVE definition: a decision about what the word names inside this build, so that nine lanes do not each invent one. It is NOT a claim that the industry agrees, and it is NOT a discovery about what Web4 "really" is.**

**The definition, in one sentence.** Web4 is the inter-system layer in which two or more independently operated harness instances recognise each other as peers, conduct bounded and refusable dialogues, align their meta-packages to a shared intent map, and exchange those packages as reviewable, reversible patches — with no central arbiter and no instance holding authority over another's intent.

**Why a definition is needed at all, and its basis.** Decision **`D-0017`** (active) records that Web4 is **UNDEFINED IN-HOUSE** and treats that as an unresolved prerequisite; decision **`D-0053`** authorizes this build and requires it to *"fix a written definition of Web4 in the delivered artifacts and must not assume one."* The recon that established the in-house zero is `horseriders/03-track-and-edge-runners.md` §1.

**The census behind "undefined in-house", with its denominator and its moment.** Verified (read) from that document: a word-boundary pattern over six populations found **0 of 4,296** pre-existing workspace files using the term, with the only **2** uses being files the HorseRiders program itself wrote on 2026-10-16; **0 of 18,242** harness files; and **0 documents anywhere in the corpus that define it**. The census was taken 2026-10-16T11:28Z–11:35Z by `tmp/web4-census2.ps1`. Its instrument was proven rather than assumed — the same walker's loose run found **19** files elsewhere (`webp` assets), so the zero is a real absence rather than a blind spot. **Scope limit, declared:** the census excludes `.git`, `node_modules`, `dist`, `.turbo`, `coverage` and `.s1cap`, and `.s1cap` was found to hold **47** hits which are conversation logs and not documents.

**What the term means OUTSIDE this workspace, recorded as reporting rather than adopted.** Verified (read) from `horseriders/03` §2: it is a **contested, marketing-adjacent** term with several incompatible definitions, no standards body, a crypto-adjacent centre of mass, and at least one unrelated homonym (a CTF challenge named `web4`). One source frames it as an *"intelligent symbiosis era"*, another as an *"AI-driven next-generation internet"*, a third as *"autonomous action"* in a Web1→4 lineage, and critics call it an explicit hype term. **`D-0017` is right that a search for the term does not reliably resolve it.**

### 2.1 What this definition does NOT claim

**Stated here, and carried as data in `WEB4.nonClaims`, because a definition that arrives without its non-claims can be read as claiming far more than it does.**

| # | Non-claim |
|---|---|
| 1 | Does **NOT** claim the term is standardised, or that any standards body defines it. |
| 2 | Does **NOT** claim the industry agrees; outside this workspace the term is contested and marketing-adjacent. |
| 3 | Does **NOT** adopt any of the outside definitions recorded in the recon. |
| 4 | Does **NOT** claim that any part of this system is built. The definition is `plan` kind at freeze time. |

**One consequence of non-claim 4 that a reader must not miss:** defining Web4 does **not** close `D-0017`'s prerequisite in general — it closes it *for this build only*. The owner's separate Tier-3 claim that the harness's capabilities are *"already in enabled capabilities of Web4"* **remains uncheckable**, because that claim is about the outside term, and this definition explicitly declines to be the outside term.

## 3 — The three kinds, never flattened

**`exists` / `plan` / `future`, inherited from `AGENTS.md`, and load-bearing in the type shapes rather than only in this prose.** The protocol file carries `ThreeKind` as a union and **contains no `status` token, no `done`, no `complete`, no `ready` and no `shipped`** — a single status token is precisely what destroys the distinction, which is why the plan corpus's own schema lists those tokens as forbidden (`plan/intent-field/schema.json`, `labelSets[threeKind].flattening.forbiddenTokens`).

| Kind | Means | In this charter |
|---|---|---|
| `exists` | verifiable today, with evidence | §1's clone census, §5's substrate readings, `dsh-intent-map` |
| `plan` | this program will build it; nothing is scheduled by saying so | **everything in §4, §6 and §7** |
| `future` | recorded, tagged, not scheduled | `dsh-meta-evolve` and `dsh-meta-research`, which stay forbidden |

**Applying the rule to this document's own subject: `dsh-meta-market` is `plan` until `task-8` builds and `task-9` verifies it.** `D-0053` authorized the build; authorization is not existence. **`D-0017`'s own recorded finding is the worked example of this rule:** the prior stage's artifacts were tagged `future` precisely so they would not be built early, and a decision — not a plan edit — was the correct instrument for raising one of them.

## 4 — The frozen interfaces

**These are the names `task-1` freezes. A change after this is a coordinated edit, not a lane's private decision.** The file is types-only — no runtime logic, no I/O, no `Date.now()`, and no import except `type` — so it typechecks standalone before `task-8` has written an entry point, and it cannot drift from behaviour because it describes none.

| Interface | What it carries | The rule that is structural rather than prose |
|---|---|---|
| `PeerCard` | instance id, spec version, label, intent **fingerprint**, declaration | `selfAsserted` distinguishes a peer's card from our own; a self-asserted card is untrusted input |
| `CapabilityDeclaration` | `capabilities`, `redLines`, `declaresNothing` | the two lists **disagree** and are not nested, so a filter takes the **UNION**; `declaresNothing` separates "said nothing" from "said it can do nothing" |
| `DialogueEnvelope` | spec/step version, message id, dialogue id, step vs maxSteps, expiry, intent, offer, decision, confidence | `expiresAt` and `maxSteps` make replay and unbounded dialogue **inexpressible** rather than merely disallowed |
| `IntentVectorReference` | index id, zone ids, identity, freshness, census time | the raw vector is **never** exchanged — only a fingerprint — because zones reveal the user's interests |
| `EmbeddingIdentity` | model, dim, `modelSource`, endpoint | a model change is **refused rather than scored across**; either field alone is insufficient |
| `MetaPackage` | package id, zones, claim, kind, catalog ref, declaration, content hash, evidence | the privilege axis travels **on** the package — red lines do not travel by reference |
| `CatalogReference` | name, npm, owner, **rowCount**, census time | a `name` is **not** a unique key (4,527 rows / 4,226 names), so `rowCount` records ambiguity rather than hiding it |
| `PatchProposal` | target, base hash, content hash, zones, `reverses`, `requiresHuman`, staging | `reverses` is **required** — "we forgot the undo path" becomes a compile error |
| `VerdictRecord` | verdict, rule, falsifier, measured, census time, evidence | `unknown` is a first-class outcome; a verdict with no `rule` is an opinion |
| `Confidence` | value, **backend**, model, provenance | cannot be constructed without naming the backend, so a cross-lane threshold is **unrepresentable** |
| `Measured` / `Maybe<T>` | count **with** its denominator / a value with the reason it is absent | a bare `number` cannot distinguish "measured 0" from "never measured" |

**The decision grammar is closed, and the closure is why the Laya path is not broken by this protocol.** `DecisionValue` admits exactly three shapes, borrowed from `plan/intent-field/schema.json`: `noul` is an integer `0 | 1`; `choice` is a string **with its registered label set**; `score` is an integer **with its declared scale maximum**. A free string with no label set, an array, and a nested object are each rejected downstream, so they are rejected here by not being representable. **One boundary worth naming explicitly:** `CapabilityDeclaration` carries `string[]` as **transport, not as decision input** — a consumer reduces a token list to closed decisions (a `noul`, or a `score` over a declared privilege ladder) *before* anything reaches the model. Sending a raw `string[]` in a request body is the same class of mistake as reading an absent field as zero.

## 5 — The substrate this build stands on, and its honest limits

**`dsh-intent-map` is `exists` and is live, and this plugin only READS it.** Verified (read) from `plan/06-future-dsh-meta-plugins.md`: `GET http://127.0.0.1:3083/intent-map/api/map` → **200**, `identity.model` a 1024-dimension embedding, `vectorCount 24`, `zonesFresh 24 of 24`, `freshness "fresh"`.

**Two limits travel with that reading and the alignment lane must not round them up.** (i) The indexed corpus is the **STAGED** census — `catalogCount 4527`, `catalogUpdated 2026-10-12` — against a live catalog measured at **4,765 rows on 2026-10-15**. (ii) **`freshness: "fresh"` means the vectors match the zone DEFINITIONS, not that the index describes the current market.** A row added to the live catalog yesterday is not in those 24 zones. Both are recorded in `plan/06` and are restated here because a charter that omitted them would license a confident lie.

**The rule this charter takes from that precedent:** embedding identity is read **live**, and a mismatch is **refused rather than scored across** two vector spaces. `EmbeddingIdentity` and the reuse of the sibling plugin's refusal shape exist for that reason.

**Still `plan`, named so it is not assumed:** `dsh-meta-market` has no route, no mount and no build artifact. Its `package.json`, `tsconfig.json`, `tsdown.config.ts` and `cordis.patch.yml` belong to `task-8`.

## 6 — Lane write-scopes

**Reproduced from `task-1`'s own brief. These are disjoint; a lane that writes outside its scope has silently taken another lane's authority.** Write-scope overlap is advisory rather than a lock, so this table is the only coordination mechanism and it is read, not enforced.

| Lane | Writes |
|---|---|
| `charter-writer` | `plugins-src/dsh-meta-market/CHARTER.md`, `plugins-src/dsh-meta-market/src/shared/protocol.ts` |
| `identity-trust` | `plugins-src/dsh-meta-market/src/host/identity/**`, `research/meta-market-identity-trust.md` |
| `dialogue-protocol` | `plugins-src/dsh-meta-market/src/host/dialogue/**`, `research/meta-market-dialogue.md` |
| `intent-alignment` | `plugins-src/dsh-meta-market/src/host/alignment/**`, `research/meta-market-alignment.md` |
| `patch-distribution` | `plugins-src/dsh-meta-market/src/host/patch/**`, `research/meta-market-patches.md` |
| `safety-gate` | `plugins-src/dsh-meta-market/src/host/safety/**`, `research/meta-market-safety.md` |
| `social-topology` | `plugins-src/dsh-meta-market/src/host/social/**`, `research/meta-market-social.md` |
| `host-assembly` | `plugins-src/dsh-meta-market/src/host/index.ts`, `src/host/routes.ts`, `cordis.patch.yml`, `package.json`, `tsconfig.json`, `tsdown.config.ts` |
| `verifier` | `research/meta-market-verification.md` — **only** this file |

**All paths in that table are relative to the program root stated in §1**, i.e. `C:\Users\0000\Projects\deepseek-root\`, not to the workspace. **`research/` resolves to the WORKSPACE** (`...\dsh-meta-evolve_INIT_WORKSPACE\research\`), because that is where the program's research corpus lives. **The two halves of a lane's scope therefore resolve against different roots, and that is a trap**: a lane that resolves its `research/` path against the program root writes a research file into the wrong tree.

**Not writable by any lane:** anything under `plan/` (the Lead's), any other `dsh-meta-*` plugin, and `plugins-src/dsh-intent-map` (another plugin's clone, and live on the owner's GUI).

## 7 — Gates that bind this build

**These are owner-set constraints, not style preferences.**

1. **GPU only via `llama.cpp`.** There is a **hard prohibition on any Cordis→GPU connection**: no plugin in this program opens a device, and `dsh-meta-market` must not. The route to the card is `llama.cpp`'s HTTP API, and "the GPU directive is satisfied" is asserted from `nvidia-smi` residency, never from a flag and never from a device string on the Cordis side.
2. **`dsh-meta-evolve` and `dsh-meta-research` remain FORBIDDEN.** `D-0053` is a **narrow override of exactly one name**, not a repeal of the gate. No lane may create any other `dsh-meta-*` directory or file.
3. **Do not touch port 3083** (the owner's live session). Read from it freely; never write to it, never restart it.
4. **Mounting is the owner's decision and a restart is part of every plugin change.** No lane adds this plugin to a profile manifest or to `dsh.profile.bundles`.

## 8 — The measurement discipline this build inherits

**Every claim in this build is marked `VERIFIED (ran)` or `VERIFIED (read)`. Every number carries a numerator, a denominator and a census time.** The traps below have each already produced a wrong published number in this program, and each is guarded in code or in the protocol rather than only in prose.

- **An absent optional field is not a zero.** Test `'field' in obj` before reading a value; never `|| 0`, `?? 0` or a truthy test. Guarded by `Maybe<T>` and by the `ABSENCE_DISCIPLINE` value.
- **A `0` on both sides of a comparison is an INSTRUMENT FAILURE, not a pass.** Assert that both sides actually answered, and exit non-zero when they did not.
- **A catalog `name` is not a unique key.** 4,527 rows carry 4,226 distinct names, and one name exists three times at 0★, 391★ and 1★. Guarded by `CatalogReference.rowCount`.
- **`grep -c $'\r'` manufactures the CR it reports** — it has produced the same false finding in three agents here. Count **bytes**, not a pattern. This charter's own formatting claims were taken that way.
- **A shell redirect is not a byte-preserving copy** — PowerShell rewrites LF as CRLF, so a redirect can never be the instrument for a byte-identity claim. Use git's object hash.
- **`split('\n').length` reads one line too many** on every file this program may write, because a file ends with exactly one trailing newline. State the instrument with the number; `wc -l` counts newlines and is correct here.
- **Agreement on an unanswered request is not agreement.** Two sides that both return `404`, `null` or an empty array have compared two non-answers and will print a pass.

**File discipline for everything written under this clone: one physical line per paragraph; exactly one trailing newline; LF only; UTF-8.**

## 9 — What this charter does not do, and what remains unsettled

**Stated plainly, because a list of unresolved items is a deliverable and hiding one is the defect this program has paid for most often.**

| # | Not settled | Why it is not settled here |
|---|---|---|
| 1 | **The trust root's kind.** Where a peer's identity is actually anchored — a key, a pin, a local registry — is `task-2`'s decision. | `task-2` owns it. This charter freezes only the `PeerCard` shape. |
| 2 | **The discovery mechanism.** Mesh, gossip, DHT, relay or hybrid is `task-7`'s explicit decision. | Deferring it in the charter is deliberate; "it depends" is not an answer the lane may give. |
| 3 | **Whether this plugin WRITES intent zones or only PROPOSES them.** The protocol leans to propose, because writing another plugin's index is a scope violation. | `task-4`'s decision. Recording a lean is not making the decision. |
| 4 | **The numeric thresholds** (alignment similarity, dialogue bounds, quorum size). | Each is a `task-4`/`task-3`/`task-7` decision and none can be fitted before the lane that measures it exists. |
| 5 | **Whether the outside world's "Web4" and this operative definition ever reconcile.** | §2 declines to reconcile them, and `D-0017`'s Tier-3 prerequisite remains open. |
| 6 | **`SPEC_VERSION` interoperability.** The version is frozen at `1` and its refusal path is declared, but no second implementation exists to interoperate with. | Nothing can be settled about a protocol with one participant. |

**One further limit, stated because it would otherwise be read as more than it is:** the protocol file's typecheck result is a statement about the file, not about the plugin. It passed `tsc 5.6.3` `--noEmit` under `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`, and a negative control proved the checker can fail; but there is **no `node_modules` in this clone yet** (the Lead owns `pnpm install` in `task-8`), so the check ran against the program root's resolver and involved no `@types/node` — which this file does not import. **Nothing here is a build claim.**

## 10 — The frozen-artifact census, so a reader can tell whether they hold the frozen revision

**A reader coding against a file they believe is frozen, but which is not, has no way to notice.** This section is the check: it records the byte-level identity of both artifacts at freeze time, so a later reader can recompute it and learn whether they hold this revision.

**Measured (ran) 2026-10-16, by a byte-level census run from the program root.** CR and CRLF are counted as **BYTES**, never by pattern — `grep -c $'\r'` manufactures the CR it reports and produced the same false finding in three agents here.

| Artifact | Bytes | Newlines (`wc -l` convention) | CR bytes | CRLF | Trailing newlines | sha256 |
|---|---:|---:|---:|---:|---:|---|
| `src/shared/protocol.ts` | **26,919** | **545** | **0** | **0** | **1** | `01a179b7b58874f651a95370b87c298c6c2e2674f3637e443533a2f5eb972598` |

**How to re-take it, so this is a check rather than a claim.** This command is **self-contained and depends on no scratch file**: it is run from the clone root, reads the bytes directly, and prints the same fields. The census tool used at freeze time was deleted after use, deliberately, so that `task-1` left exactly the two files §1 names.

```
node -e "const b=require('fs').readFileSync('src/shared/protocol.ts');let cr=0,lf=0,c=0;for(const x of b){if(x===13)cr++;if(x===10)lf++}for(let i=0;i<b.length-1;i++)if(b[i]===13&&b[i+1]===10)c++;const t=b[b.length-1]===10?1:0;console.log(JSON.stringify({bytes:b.length,newlines:lf,crBytes:cr,crlfBytes:c,endsWithLf:b[b.length-1]===10,sha256:require('crypto').createHash('sha256').update(b).digest('hex')}))"
```

**The tell that the revision differs is a `sha256` mismatch — not a byte-size difference**, because a size can match while content does not, and the hash cannot.

**One honest limit on this census.** Deleted tooling means the measurement is reproducible from the command above rather than from a retained script; the command is therefore the instrument of record, and if it and the table ever disagree the command governs, because the table is a copy and the command is not.

**Boundary of this document:** `task-1` wrote exactly two files, both named in §1. No `package.json`, no scaffold and no other `dsh-meta-*` anything was created by this task.
