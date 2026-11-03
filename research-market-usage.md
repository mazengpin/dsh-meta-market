# Research — using the market layer to create and maintain meta plugins

**Gate.** This package is outside the public pre-release. Its repository is private and nothing here is published. The internal reasoning behind the gate itself is withheld.

## 1. What a new meta plugin must declare to be discoverable

A plugin is discoverable when four things are true at once, and a missing one is the difference between a package that exists and a package a stranger can use:

1. **One route prefix**, declared once, so a capability has one address rather than several.
2. **One identity for both seats** — the sidebar row id must equal the panel key. Two spellings are two seats and only one of them has a page behind it.
3. **A capability table** whose every row cites the member line that serves it, so a reviewer can check the claim instead of trusting the summary.
4. **A disclosed absence path**: what the surface answers when a member is unreachable, stated as `unmeasured` with a reason and never as a zero.

## 2. The four maintenance acts

| Act | What it produces | What it must not do |
|---|---|---|
| Bump with a delta record | one comparable number against the previous round | renumber silently so drift looks like stability |
| Re-run the package's own harness | a verdict with a numerator and denominator | relax an assertion to keep the release |
| Re-measure the capability census | the count of rows reachable now | drop a row that became unreachable without naming it |
| Republish the tree | the same identifiers, a new version | change an identifier as a tidy-up |

**An identifier change is a break.** A route path, a package name or a panel id is what other people's automation holds; changing one is a stated intent with a deprecation note, never housekeeping.

## 3. How the gate grades what it is offered

The market's gate scores a candidate on measurable properties of what it receives — a threshold over a distribution rather than a boolean opinion — and it records the verdict beside the candidate. Where this repository does not enforce a rule it claims, that is stated as **NOT MEASURED** rather than described as enforcement.

## 4. What is explicitly out of scope

- No Web3 material is published; the layer is gated and its repository private.
- No peer outside one machine has been exercised as a fleet.
- No token economics, no valuation, no incentive design.

## 5. Next measurement

Run one candidate through the whole loop — declare, gate, publish, re-measure — and record every step's exit code, so the maintenance table is demonstrated rather than described. The falsifier: if a republish with unchanged identifiers produces a different capability count, the census is measuring the publishing pipeline rather than the package.
