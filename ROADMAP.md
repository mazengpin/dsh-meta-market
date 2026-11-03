# ROADMAP — dsh-meta-market

**Version `0.9.0` is a PRE-RELEASE.** It is published on the `next` dist-tag and it is under active development: the surface below is what `1.0.0` still requires, not a wish list appended after the fact.

## What this package is

The Web4 inter-system layer: peers recognise each other, hold bounded refusable dialogue, align to a shared 24-zone intent map, and exchange packages as reviewable reversible patches.

## What is measured today

`pnpm run verify` runs 11 harnesses green: hosting 18 of 18, host-half 39 passed / 0 failed, negative-control 3 of 3 mutations caught with `lib/index.js` restored byte-identical, census 15 of 15, dialogue 36 of 36, gate 29 of 29, window 13 of 13; `npm pack --dry-run` 127 files / 2.5 MB.

## What 1.0.0 still requires

1. A second real host on a second machine: every dialogue claim today is one host against a fixture.
2. Producer-side signing of the exchanged package, so a patch proves who offered it.
3. The two live-deployment harnesses that stay RED (`tools-skills-census`, `advanced-drive`) split into this package`s subject and not — a harness that measures another plugin must live with that plugin.
4. A cost ceiling on a dialogue round, because `CHARTER.md` bounds what may be said and not what it costs.

## Limits, stated rather than implied

No peer outside one machine has been exercised. Nothing signs a record. `exports["./shared/protocol"]` points at TypeScript source on purpose, so that consumer needs a TS loader.

## Compatibility seam

Depends on the profile client slots (`locale`, `slots`, `layout`) and on `CHARTER.md` as its governing document; a charter edit is a breaking change to the wire.

## How this roadmap is graded

An item is DONE only when a command proves it and the command is named here. An item that is only described is not done, and a roadmap whose items all read as prose is a plan, not a state.
