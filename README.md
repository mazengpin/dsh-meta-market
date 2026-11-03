# dsh-meta-market — 0.9.0 pre-release

> **Status: PRE-RELEASE `0.9.0` — under active development.** This package is published on the `next` dist-tag, not `latest`.
> Its API, wire records and panel contracts may change between `0.9.x` releases, and each package carries its own `ROADMAP.md` naming what `1.0.0` still requires.
> A published tarball is a snapshot of a moving surface: read `ROADMAP.md` before depending on a shape.

One Cordis package with two halves: a Host half that serves one route prefix, and a browser half that registers one sidebar row plus the keyed main panel behind it. It exists so that two or more independently operated harness instances can recognise each other as peers, run bounded and refusable dialogues, align their meta-packages against a shared 24-zone intent map, and exchange those packages as reviewable, reversible patches — with no central arbiter and no instance holding authority over another's intent.

## What it does, per surface

`/meta-market/api` is the prefix; twenty paths are advertised under it and the assembly report at the prefix root carries `kind`, `mounted`, the manifest reading behind `mounted`, the live probe behind `kind`, and one row per lane with that lane's own `kind` and the evidence for it. Six lanes answer: `identity` (peer identity and the local-record admission rule), `dialogue` (bounded, refusable moves with two confidence quantities that are distinct types), `alignment` (meta-package against the 24-zone map at threshold 0.6605, provisional), `patch` (verify-before-apply with a seven-entry blindness register returned as a value on every verdict, nine routes), `safety` (22 enumerated threats, the union privilege gate, replay and budget controls) and `social` (DHT discovery on `(zoneId, bucket)`). A read of `/meta-market/api/gui/health` answers only when the process is running THIS build, which is how `kind` separates "mounted with this body" from "mounted with yesterday's body".

Nothing here is authenticated: the deployment holds an identifier and no key, so no route is offered that would only be safe if authentication existed. The assembly report says so as a measured `authenticated: false` with three pieces of evidence attached, not as a disclaimer.

No route here reaches a model or a device. The two surfaces that name a model call state in their own `notDone` field that they do NOT make it.

## Install

Two edits in the consuming profile, then one restart — there is no per-request manual step and no code generation step.

1. Add the dependency as a relative `link:` in `profiles-tree/<profile>/package.json`: `"dsh-meta-market": "link:../../plugins-src/dsh-meta-market"`.
2. Add `"dsh-meta-market"` to that manifest's `dsh.profile.bundles` array. The bundle patch `cordis.patch.yml` carries the single `insert` row, so the loader mounts the Host half as the row `meta-market` and the client half is served from `exports["./client"]`.
3. Run `pnpm install` in the profile, then restart `dsh web`. A `dsh.profile.bundles` change hot-reloads; the Host half is a boot-time load.

Build the clone before the profile consumes it: `pnpm install && pnpm run build` here. `lib/index.js` is the Host half and `lib/client.js` the browser half; both ship in `files`.

## Panel

One row in `sidebar.panellist` (`dsh-meta-market:market`, order 6.6, label from the `en` dictionary) and one `keyed` panel in `main` with the SAME key. The row id and the panel key are two separate declarations of one value on purpose: the two slots spell identity differently (`id` versus `key`) and a mismatch renders a row whose first click throws.

## Checks

`pnpm run build` (tsdown, two halves), `pnpm run typecheck` (`tsc --noEmit`), `pnpm run verify` (eleven self-contained harnesses). The verify chain deliberately EXCLUDES four harnesses that read the live deployment on `127.0.0.1:3083` — `src/host/providers/verify/tools-skills-census.mjs`, `advanced-drive.mjs`, `probe-memory.mjs` and `meta-plugins-driver.mjs` — because they measure other plugins' routes rather than this package's behaviour, and at the time of this release two of them are RED for reasons outside this package (a `meta-loops` census whose numerator exceeds its denominator, and eight `meta-skills`/`meta-tools` readings). A harness that fails for a reason outside its subject teaches a reader to ignore its red.

`verify/hosting.mjs` derives the hosting ledger from the live registry and mutates four copies to prove the predicate can go RED. `src/host/verify/host-half.mjs` binds a real socket on an OS-assigned port and drives the plugin's actual handler. `negative-control.mjs` mutates the built `lib/index.js` three ways, requires the route harness to catch each, and restores the artifact by hash.

## What is NOT done, stated rather than inferred

There is no aggregate over peers: `alignment/` exports per-item operations, `social/` has pair and single-instance bounds, and `aggregateAlignment(perPeer, census)` does not exist. The alignment threshold is provisional. The intent map this plugin aligns against is a map of the plugin market, not of a person. And this package does not publish to a registry — it is consumed through a relative `link:` from the profile.

## License

MIT. See LICENSE.
