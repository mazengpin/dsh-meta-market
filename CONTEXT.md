
# CONTEXT ÔÇö dsh-meta-market

**This file exists so that a stranger can rebuild the REASONING behind this package, not only its source.** It is context, not contract: the contract is `CHARTER.md`, the state is `DISCLOSURE.md`, and the remaining work is `ROADMAP.md`.

## 1 The problem this package solves, plainly

**A DeepSeek Harness instance is a closed world.** It knows its own plugins, its own skills, its own intent map, and nothing else; when a second instance is operated by a different person on a different machine, there is no vocabulary for the two of them to say anything to each other, no way to agree on what a good package is, and no way to hand one across without handing over authority along with it.

**This package is an attempt at that vocabulary.** Its subject is inter-system exchange between harness instances that do NOT trust each other and do NOT share an owner: peers recognise one another, hold a BOUNDED and REFUSABLE dialogue, align a package against a shared 24-zone intent map, and exchange packages as reviewable and reversible patches.

**The one sentence that decides most of the design: no instance holds authority over the intent of another instance.** Everything downstream of it ÔÇö the closed decision grammar, the refusal codes, the quarantine, the absence of an aggregate score ÔÇö is that sentence being enforced rather than quoted.

## 2 The context: the program, the sibling packages, and the constraint

**This clone lives at `plugins-src/dsh-meta-market` in the `dsh-meta-evolve` program**, alongside its siblings `dsh-meta-evolve`, `dsh-meta-research` and `dsh-meta-community`. It is built on this machine and consumed by a profile through a RELATIVE `link:`, never as a prebuilt artifact.

**The constraint that shaped this one is `CHARTER.md`, and it is a governing document rather than a style guide.** A charter edit is a breaking change to the wire, because the charter is where the shapes come from. What it forbids, and what each prohibition forced:

- **No Cordis-to-GPU connection and no model call from a route.** Forced the surfaces that NAME a model ÔÇö `decideByLaya` in dialogue, the embedder identity in alignment ÔÇö to carry a `notDone` field that states the call is not made, and forced the safety lane to publish `runsTheGate: false` rather than a reassuring boolean.

- **The three kinds, `exists` / `plan` / `future`, never flattened, and no `status` / `done` / `ready` / `shipped` token anywhere in the protocol.** Forced six lane surfaces to report `kind` honestly ÔÇö every lane here reports `plan` today ÔÇö and forced the assembly report to derive `kind` from a live probe instead of declaring it.

- **An absent field is not a zero, and a measured zero is not an absence.** Forced `Measured` (a count WITH its denominator) and `Maybe<T>` (a value WITH the reason it is absent) into the frozen protocol, and forced the social surface to publish an unmeasured sybil cost as `null` rather than `0`.

- **No central arbiter.** Forced the refusal to aggregate: `aggregateAlignment(perPeer, census)` does not exist, and `social/` holds pair bounds and single-instance bounds only.

- **The raw intent vector is never exchanged, only a fingerprint.** Forced `IntentVectorReference` (zone ids, identity, freshness, census time) ÔÇö a vector would reveal which interests a person holds.

- **Port 3083 is the live session of the owner: read freely, never write, never restart.** Forced every live reading in this build to be a bounded GET, and forced the providers that read the routes of OTHER plugins to be excluded from the verify chain of this package.

## 3 The intent, and what was deliberately NOT attempted

**The intent is a MARKET-shaped layer rather than a network**: packages are offered, verified, quarantined and reversed, and a peer that lies loses standing rather than being banned by a moderator. Alignment to a shared map of zones is how two instances can compare offers without either one becoming the arbiter of the interests of the other.

**Deliberately NOT attempted, each for a stated reason:**

- **A second real host on a second machine.** Not attempted: no second machine is available in this environment, so every dialogue claim today is one host against a fixture. Recorded as `ROADMAP.md` item 1 rather than implied by the word peer.

- **Producer-side signing of an exchanged package.** Not attempted: no key material exists, so nothing signs a record and a consumer must not read an exchanged package as provenance. This is threat `T22`, carried as `PLAN` with `control is null`.

- **Applying a received patch.** Not attempted on purpose: `patch/quarantine.ts` has no code path that applies anything. Application belongs to whoever owns the running system.

- **Aggregate alignment across peers.** Not attempted: any aggregate would be one instance speaking for many, which is the authority the charter removes.

- **A model call from any route.** Not attempted: owner prohibition; see section 2.

- **Publishing from source.** Not attempted: the package is a SOURCE PREVIEW. Install arrives with the published pre-release tarball on the `next` dist-tag.

## 4 Alternatives considered and rejected

**DHT on `(zoneId, bucket)` is what `social/` implements**, and the alternatives ÔÇö mesh, gossip, relay, hybrid ÔÇö were deferred to the owning task (`CHARTER.md` section 9 records the deferral). **The reasons the rejected ones lost are `NOT RECORDED`:** the charter states that the choice was deliberately deferred, not that the alternatives were weighed and one failed.

**A single aggregate alignment score across peers was rejected**, and the reason IS recorded: it would give one instance authority over the intent of another, which section 2 forbids.

**Reading a raw intent vector from a peer was rejected**, and the reason IS recorded: zones reveal the interests of the user, so only a fingerprint travels.

**Trusting a stored verdict on re-read was rejected**, and the reason IS recorded in `src/host/patch/quarantine.ts`: a file on disk is not the file that was written, so the seal is recomputed from the bytes actually read and a mismatch is a tamper reading rather than a parse error.

**Storing the ledger as a directory of records was rejected**, and the reason IS recorded in `src/host/stable/store.ts`: a directory of records has no atomic cut, so the ledger is one file written through a temporary sibling and a rename.

**Any other alternative is `NOT RECORDED`** ÔÇö this package does not reconstruct reasoning it does not have, and a plausible-sounding rejection reason invented here would be indistinguishable from a measured one.

## 5 Recreate a working environment, with node, pnpm and git only

**These steps use no shell other than the one that runs `node`, `pnpm`, `git` and `npm`. There is no platform-specific script in this package and none is needed.**

1. `git clone <this repository>` and `cd` into `plugins-src/dsh-meta-market`.

2. `node -v` ÔÇö must satisfy `engines.node` (`^22.19.0 || >=24.0.0`); the `dsh` engine range is `>=0.2.2-0 <0.3.0`.

3. `pnpm install` ÔÇö installs the six devDependencies; there are no runtime dependencies.

4. `pnpm run typecheck` ÔÇö `tsc --noEmit`.

5. `pnpm run build` ÔÇö `tsdown`, emitting `lib/index.js` (Host half) and `lib/client.js` (browser half).

6. `pnpm run verify` ÔÇö eleven self-contained harnesses; the chain excludes the four harnesses that read the live surface of another plugin.

7. `npm pack --dry-run` ÔÇö prints the file list and tarball size that a publish would carry.

8. To mount the clone in a profile: add `"dsh-meta-market": "link:../../plugins-src/dsh-meta-market"` to the profile `package.json`, add `"dsh-meta-market"` to its `dsh.profile.bundles`, run `pnpm install` there, then restart `dsh web` ÔÇö a bundles change hot-reloads, the Host half is a boot-time load.

## 6 What to read next

**`CHARTER.md` first** ÔÇö it is the governing document and the only place the constraints are stated with their evidence. **`DISCLOSURE.md`** next for what is measured today and what is not. **`ROADMAP.md`** for what `1.0.0` still requires.

**Then the source files that carry the design reasoning, each in a long header comment rather than in this file:**

- `src/shared/protocol.ts` ÔÇö the frozen wire shapes, and why each field exists (`Measured`, `Maybe<T>`, `Confidence`, `IntentVectorReference`).

- `src/host/safety/gate.ts` ÔÇö the 22-threat table, the standing split, and the union privilege rule.

- `src/host/patch/quarantine.ts` ÔÇö why nothing lands in a live market from a peer, and why the seal is re-checked on read.

- `src/host/stable/store.ts` ÔÇö why the ledger is one file, why the seal is over a key-sorted serialisation, and why a failed write says so.

- `src/host/registry/paths.ts` ÔÇö why a count of `../` is a bet on where the file will be emitted, and how the walk was repaired.
