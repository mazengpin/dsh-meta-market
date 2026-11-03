# Research — dsh-meta-market

**Gate.** This repository is private and outside the public pre-release. What is withheld is withheld deliberately; a coarse row here is not an omission.

## 1. The question

Can a market layer decide what is worth offering **without trusting the offeror** — grading a candidate on measurable properties of what it receives, and recording the verdict beside the artifact?

## 2. What is measured today

- The package's own verification chain runs a set of independent harnesses, each printing a verdict with a numerator and a denominator, and the chain stops at the first red one.
- The gate scores a candidate on a threshold that sits inside a measured distribution rather than at its edge, and the verdict is written beside the candidate.
- The capability table cites the member line that serves each row, so a reviewer checks the claim rather than the summary.
- A negative control is part of the chain: a mutated artifact must go red and the restored artifact must be byte-identical.

## 3. What is NOT measured

- Any peer outside one machine: no fleet has been exercised beyond a single host.
- The behaviour of the gate against an adversarial candidate: the harness drives mutations of its own fixtures, not a hostile author.
- Any rendered surface: no GUI is claimed, and how a deployment presents the data is the deployment's choice.

## 4. The companion study

`research-market-usage.md` in this repository covers the practical loop: what a new meta plugin must declare to be discoverable, the four maintenance acts, and the rule that an identifier change is a break rather than housekeeping.

## 5. Next measurement

Run one candidate through the whole loop — declare, gate, publish, re-measure — recording each step's exit code. The falsifier: if a republish with unchanged identifiers produces a different capability count, the census is measuring the pipeline rather than the package.
