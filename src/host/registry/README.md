# `src/host/registry/` — the inventory both halves of every meta-market window read

Owned by `catalog-inventory`. Read this before composing a window; do not re-derive a count that this module already measures, because this program's most-published defect is two lanes measuring one population with two expressions and agreeing on a wrong number.

## Entry points

- `openRegistry(options?)` → `Promise<Registry>` — builds both halves; probes installed routes by default (`probeRoutes: false` in a harness).
- `getRegistry(options?)` → `Promise<Registry>` — memoised; use this from a request handler so the probes run once per process.
- `resetRegistry()` — clears the memo; verify drivers only.
- Constants: `LIVE_CATALOG_CACHE`, `LIVE_CATALOG_SOURCES`, `SNAPSHOT_CATALOG_CACHE`, `DEFAULT_PROFILE_DIR`, `DEFAULT_PLUGINS_SRC_DIR`, `DEFAULT_BASE_URL`.
- Path helpers from `paths.ts`: `resolveProfileDir`, `resolveProfileDirFrom(startDir)`, `resolveCloneRoot`, `resolvePluginsSrcDir`, `resolveLiveCatalogCache`, `resolveSnapshotCatalogCache`, `findUp`, `findArtifact`.

Paths are resolved by **SHAPE**, never by counting `../`: the profile is found by walking up for `profiles-tree/personal-dev/package.json`, the clone by its `package.json` name, and the catalog artifacts by their fixed relative paths under any ancestor. This exists because a fixed walk was correct in `src/host/registry/` and one segment short in the emitted `lib/`, where it resolved `<home>\profiles-tree\personal-dev/package.json` and made the Meta-Plugins window report `unavailable` for a path error. `HOME` is never consulted. A failed search reports `null` and the directories it searched.

Every method on the returned `Registry` is synchronous: `byName`, `byNpm`, `byOwner`, `byKeyword`, `byZone`, `allInstalled`, `allDownloadable`, `candidatesFor`, `bothHalves`, `census`.

## The two halves

**Installed** (`registry.installed`) is measured from four places and inferred from none: the live profile manifest's `dependencies` and `dsh.profile.bundles`, `node_modules` counted by KIND (directories, symlinks and files separately — a listing length is not a directory count), each dependency's checkout (`exists`, its own `package.json` name, `dsh.client`), and the route paths its OWN source registers, each probed against `http://127.0.0.1:3083` with the status code recorded. `servesRoute` is `true` when a probe answered anything but `404`, `false` when every probe was `404`, and `null` (NOT MEASURED) when no probe was made.

**Downloadable** (`registry.downloadable`) is read from a cached file, never fetched at serve time: `data/plugins-live-2026-10-17.json`, whose URL, fetch clock, HTTP status, byte size, sha256 and row count are recorded in `data/SOURCES.json`. The 4,527-row snapshot the program cites is read from the workspace at `research/cache/plugins-2026-10-12.json` and is deliberately NOT copied here — a second copy would be a second statement of one fact.

## The rules this module enforces rather than remembers

- **Match by `name` OR `npm`, never `name` alone** — and every lookup returns a `CatalogQuery` carrying `rowCount`, `ambiguous`, and one `disambiguation` line per matched row, so "take the first match" is a decision someone has to defend. `dsh-cost-meter` returns FOUR rows in the live catalog.
- **A `name` is not a unique key.** 272 duplicate-name groups cover 689 of the 5,785 live rows; 198 groups cover 499 of the 4,527 snapshot rows.
- **Absent is not zero.** An unreadable half is `null` with `unavailable.reason`; a catalog row with no `capabilities` key has `capabilities: null` and `capabilitiesPresent: false`, never `[]`.
- **Every count carries numerator, denominator, population and census time** — `registry.census()` returns exactly those rows, and `InstalledCensus` records the profile manifest's sha256 and mtime because another lane can edit the manifest mid-census.
- **Ordinal comparisons only.** Shell case-folding is a different claim; `byName`/`byNpm` fall back to a case-folded pass ONLY when the ordinal pass found nothing, and the result says so in its first `disambiguation` line.

## The read-only probe policy

`3083` is the owner's live session. Only route paths read out of an installed checkout's own source are probed, and a path whose last segment names a mutating operation is NOT probed; the skipped route keeps `status: null` and a `probeSkippedBecause` reason. A policy that never skips anything is a caption, so the census driver asserts both directions: it must skip `/dsh-market/install` and must not skip `/intent-map/api/map`.

## Verify

```
node --experimental-strip-types src/host/registry/verify/census.mjs
```

Exit `0` all assertions passed, `1` an assertion disagreed, `3` instrument failure (fewer assertions ran than the driver declares). `--offline` skips the probes. The driver refreshes `verify/last-census.json`, which carries every installed entry, its derived routes and probe statuses. Two of its assertions exist only because the production defect was found there: it resolves the profile from the simulated bundle depth (`<clone>/lib`) and requires the result to EXIST and to agree with the source-layout answer, and it requires the same search from outside the checkout to return `null` rather than a guess.

Last recorded census (`2026-10-17T22:03Z`, 15/15 assertions): installed 36 dependencies / 41 bundles (35 quoted in the brief, and the manifest changed under measurement — `mount` added `dsh-meta-market`), `dsh.client` 26/36, route-serving 11/36 true · 12 false · 13 not measured; live catalog 5,785/5,785 rows; snapshot 4,527/4,527; name≠npm 983/2,604 live and 874/2,342 snapshot; installed∩downloadable 13/36. Re-run the driver rather than quoting these; the live count demonstrably moves.
