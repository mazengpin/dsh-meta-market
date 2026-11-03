#!/usr/bin/env node
/**
 * ============================================================================
 * dsh-meta-market/verify/leak-scan.mjs — the publish-gate leak scan
 * ============================================================================
 *
 * THE RULE THIS ENFORCES
 *
 * Nothing pushed from this package may contain a secret, a local absolute path,
 * a host name, a user name, a session id or internal program context. This file
 * is the mechanical form of that sentence: it walks the package tree, matches
 * every shape in the closed list below, prints each hit with its file and line,
 * and exits 1 if there is even one.
 *
 * THE DEFECT IT IS WRITTEN AGAINST — 63 FALSE POSITIVES FROM ONE UNANCHORED CASE
 *
 * A previous scan matched `DESKTOP-[A-Z0-9]{7}` CASE-INSENSITIVELY. The plugin
 * name `dsh-whale-desktop-launcher` contains `desktop-launche`, and `launcher`
 * is seven letters, so the rule fired on an ordinary package name. Every rule
 * below is therefore CASE-SENSITIVE unless its own comment says otherwise, and
 * a case-insensitive rule is never written over a lower-case word list.
 *
 * AND THE HARNESS CARRIES ITS OWN CONTROL
 *
 * A check nobody has moved is a check nobody knows the shape of. Two synthetic
 * strings are asserted in the SAME run as the real scan: one that MUST be
 * flagged, one that MUST NOT be. If either assertion fails, this harness exits
 * non-zero even when the package tree is clean — a green that cannot go red is
 * not a green.
 *
 * The synthetic samples are assembled from fragments rather than written out,
 * so this file does not trip its own scanner. That is not cosmetic: a harness
 * that has to be excluded from its own subject has an ignore list, and an
 * ignore list is how the next real hit gets hidden.
 *
 * Usage: node verify/leak-scan.mjs
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// A run artifact directory is excluded BY NAME and for a stated reason: `verify-output/` is
// gitignored, is not in `files`, and never ships — but it holds the census report, whose own content
// legitimately records the absolute paths the round read. Excluding it keeps the gate about PUBLISHED
// text instead of about the machine that measured it.
const RUN_ARTIFACT_DIRS = new Set(['verify-output', 'tmp'])
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKIP_DIRS = new Set(['.git', 'node_modules', 'verify-output', 'tmp']) // run artifacts: gitignored, absent from `files`, never published

/** The closed list. Every regex is case-SENSITIVE unless marked otherwise. */
const RULES = [
  {
    id: 'win-abs-path',
    // A drive letter, then Users or Documents and Settings, in either escaping.
    re: /[A-Za-z]:[\u005C/]{1,2}(?:Users|Documents and Settings)(?=[\u005C/]|$)/,
    note: 'Windows absolute path',
  },
  {
    id: 'posix-home',
    re: /(?:\/home|\/Users)\/[A-Za-z][A-Za-z0-9._-]{1,31}(?![A-Za-z0-9._-])/,
    note: 'POSIX home path',
  },
  {
    id: 'hostname',
    // Case-SENSITIVE ON PURPOSE: `desktop-launcher` must never reach this rule.
    re: /DESKTOP-[A-Z0-9]{7}(?![A-Za-z0-9])/,
    note: 'host name of the DESKTOP shape, 7 uppercase alnum',
  },
  {
    id: 'gh-token',
    re: /ghp_[A-Za-z0-9]{20,}/,
    note: 'GitHub personal access token',
  },
  {
    id: 'gh-fine-token',
    re: /github_pat_[A-Za-z0-9_]{20,}/,
    note: 'GitHub fine-grained token',
  },
  {
    id: 'bearer-token',
    // A bare `Bearer` word is prose; a Bearer followed by a LONG opaque run is a credential.
    re: /Bearer[ \t]+[A-Za-z0-9._~+/=-]{20,}/,
    note: 'Bearer credential',
  },
  {
    id: 'aws-key',
    re: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/,
    note: 'AWS access key id',
  },
  {
    id: 'private-key',
    re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
    note: 'private key header',
  },
  {
    // Case-INSENSITIVE keyword, but the value must look like a secret literal:
    // a quoted run or a long opaque run. `token = makeToken()` is code, not a leak.
    id: 'bare-assignment',
    re: /(?:password|passwd|secret)[ \t]*=[ \t]*(?:"[^"\s]{4,}"|'[^'\s]{4,}'|[A-Za-z0-9/+_-]{16,})/i,
    note: 'bare password=/secret= assignment',
  },
]

/** Assemble a sample from fragments so this file never matches its own rules. */
const frag = (...parts) => parts.join('')

const CONTROLS = [
  // The pair the brief names: one that MUST be flagged, one that MUST NOT.
  { id: 'control:must-flag', sample: frag('DESKTOP', '-', '8F3K9QZ'), expect: true },
  { id: 'control:must-not-flag', sample: frag('dsh-whale-', 'desktop', '-launcher'), expect: false },
  // One positive per rule, so a rule that stops matching is visible.
  { id: 'rule:win-abs-path', sample: frag('C', ':', '\u005C', 'Users', '\u005C', 'somebody'), expect: true },
  { id: 'rule:win-abs-path-escaped', sample: frag('C', ':', '\u005C', '\u005C', 'Users', '\u005C', '\u005C', 'somebody'), expect: true },
  { id: 'rule:posix-home', sample: frag('/ho', 'me', '/', 'somebody'), expect: true },
  { id: 'rule:gh-token', sample: frag('gh', 'p', '_', 'A'.repeat(24)), expect: true },
  { id: 'rule:gh-fine-token', sample: frag('github', '_pat', '_', 'B'.repeat(24)), expect: true },
  { id: 'rule:bearer-token', sample: frag('Bearer', ' ', 'C'.repeat(32)), expect: true },
  { id: 'rule:aws-key', sample: frag('AK', 'IA', 'ABCDEFGHIJKLMNOP'), expect: true },
  { id: 'rule:private-key', sample: frag('-----BEGIN ', 'RSA ', 'PRIVATE KEY', '-----'), expect: true },
  { id: 'rule:bare-assignment', sample: frag('pass', 'word', '=', '"hunter2xyz"'), expect: true },
  // Negatives a careless rule would fire on.
  { id: 'neg:plain-desktop-word', sample: frag('the ', 'desktop', ' shell of the plugin'), expect: false },
  { id: 'neg:short-bearer-prose', sample: frag('Bearer ', 'auth is mandatory'), expect: false },
  { id: 'neg:code-assignment', sample: frag('const sec', 'ret', ' = await read()'), expect: false },
]

function scanText(text, file) {
  const hits = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    for (const rule of RULES) {
      const m = rule.re.exec(lines[i])
      if (m) hits.push({ file, line: i + 1, rule: rule.id, note: rule.note, match: m[0] })
    }
  }
  return hits
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(join(dir, entry.name), out)
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

function main() {
  // ---- SELF-TEST FIRST: a scanner that cannot go red proves nothing ----------
  const controlFailures = []
  let controlsPassed = 0
  for (const control of CONTROLS) {
    const flagged = RULES.some((rule) => rule.re.test(control.sample))
    if (flagged === control.expect) controlsPassed += 1
    else controlFailures.push(`${control.id}: expected ${control.expect ? 'FLAGGED' : 'NOT FLAGGED'}, got ${flagged ? 'FLAGGED' : 'NOT FLAGGED'}`)
  }
  const mustFlag = CONTROLS[0]
  const mustNot = CONTROLS[1]
  const mustFlagOk = RULES.some((rule) => rule.re.test(mustFlag.sample))
  const mustNotOk = !RULES.some((rule) => rule.re.test(mustNot.sample))

  console.log(`SELF-TEST: ${controlFailures.length === 0 ? 'PASS' : 'FAIL'}  ${controlsPassed}/${CONTROLS.length} controls`)
  console.log(`  MUST-FLAG     ${mustFlag.sample} -> ${mustFlagOk ? 'flagged' : 'MISSED'}`)
  console.log(`  MUST-NOT-FLAG ${mustNot.sample} -> ${mustNotOk ? 'clean' : 'FALSE POSITIVE'}`)
  for (const failure of controlFailures) console.log(`  CONTROL FAILURE: ${failure}`)

  // ---- THE REAL SCAN --------------------------------------------------------
  const files = walk(ROOT, []).sort()
  const hits = []
  const withHits = new Set()
  let unreadable = 0
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      unreadable += 1
      continue
    }
    for (const hit of scanText(text, relative(ROOT, file).split(sep).join('/'))) {
      hits.push(hit)
      withHits.add(hit.file)
    }
  }

  console.log('')
  console.log(`FILES SCANNED: ${files.length}`)
  console.log(`FILES UNREADABLE: ${unreadable}`)
  console.log(`FILES WITH HITS: ${withHits.size} / ${files.length}`)
  console.log(`HITS: ${hits.length}`)
  for (const hit of hits) {
    console.log(`HIT [${hit.rule}] ${hit.file}:${hit.line}: ${hit.note} — ${hit.match}`)
  }

  const failed = hits.length > 0 || controlFailures.length > 0 || unreadable > 0
  console.log('')
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS')
  process.exit(failed ? 1 : 0)
}

main()
