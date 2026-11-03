#!/usr/bin/env node
/**
 * ============================================================================
 * dsh-meta-market/src/host/safety/verify/disclosure.mjs — the disclosure sentence's own check
 * ============================================================================
 *
 * WHAT THIS HARNESS IS FOR. `render-disclosure.ts` claims four states, and the claim that matters is that EMPTY is its own sentence.
 * EMPTY (797 rows) outnumbers ABSENT (522), so a surface that collapses them does not merely lose a nuance: it makes the MOST COMMON way a plugin says nothing render as the rarest one, and both read as "none".
 * So the assertions run over the REAL catalog rather than over fixtures, and each state must produce itself from a real row with that row quoted.
 *
 * THE MUTATION IS BUILT IN, because a check nobody has moved is a check nobody knows the shape of.
 * A collapsing classifier — one that routes `[]` to ABSENT — is implemented HERE and required to be caught: the harness derives the collapsed reading itself and demands that it DISAGREES with the module, so the assertion fails the moment the module starts agreeing with the collapse.
 *
 * THE DAY-ONE METRIC IS A FRACTION, NOT A CLAIM. `rows rendered as reassuring ÷ total` must be 0 over the whole catalog, using the module's OWN `REASSURING_PATTERN`, so the score and the rendering cannot be scored against different definitions.
 *
 * Usage: node --experimental-strip-types src/host/safety/verify/disclosure.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unionPrivilege, redLineReadsCredentialsAndNetwork } from '../absence-guard.ts'
import { DISCLOSURE_STATES, REASSURING_PATTERN, disclosure, disclosureState, isReassuring, renderDisclosure, reassuringCount } from '../render-disclosure.ts'

const here = dirname(fileURLToPath(import.meta.url))
const clone = resolve(here, '..', '..', '..', '..')
const catalogPath = join(clone, '..', '..', 'profiles-tree', 'personal-dev', 'dsh-meta-evolve_INIT_WORKSPACE', 'research', 'cache', 'plugins-2026-10-18-horse.json')

const results = []
const failed = []
function check(label, condition, why) {
  results.push({ label, ok: condition === true, why: why ?? '' })
  if (condition !== true) failed.push({ label, why: why ?? '' })
  return condition === true
}
function eq(label, actual, expected) {
  return check(label, JSON.stringify(actual) === JSON.stringify(expected), `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
}

/* ------------------------------------------------------------- the real rows */

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const rows = Array.isArray(catalog) ? catalog : catalog.plugins
check('the real catalog loaded', Array.isArray(rows) && rows.length > 0, `path=${catalogPath}`)
const total = rows.length

/* --------------------------------------------------- the partition, measured */

const byState = { absent: [], empty: [], declared: [], 'red-lined': [] }
for (const row of rows) byState[disclosureState(row)].push(row)

eq('the catalog is the 5,932-row census', total, 5932)
eq('ABSENT is every row with no capabilities key at all', byState.absent.length, 522)
eq('EMPTY is every row declaring capabilities: []', byState.empty.length, 797)
eq('DECLARED is every non-empty declaration with no credentials/secret red line', byState.declared.length, 4116)
eq('RED-LINED is every non-empty declaration carrying such a red line', byState['red-lined'].length, 497)
eq('FALSIFIER: the four states partition every row exactly once', byState.absent.length + byState.empty.length + byState.declared.length + byState['red-lined'].length, total)
eq('every state the module names is populated by real rows', DISCLOSURE_STATES.filter((state) => byState[state].length > 0).length, 4)

/* ------------------------------------------------- the two mechanisms, and the union */

let sensitiveRed = 0
let credentialsAndNetwork = 0
for (const row of rows) {
  const view = unionPrivilege(row)
  if (view.declaredCapabilities.length > 0 && view.sensitiveRedLines.length > 0) sensitiveRed += 1
  if (redLineReadsCredentialsAndNetwork(view.declaredRedLines)) credentialsAndNetwork += 1
}
eq('the sensitive-red-line mechanism selects the same 497 rows the state uses', sensitiveRed, 497)
eq('the credentials-and-network mechanism also selects 497 rows on this catalog', credentialsAndNetwork, 497)
check('the two mechanisms COINCIDE here, which is a re-measure rather than a definition', sensitiveRed === credentialsAndNetwork, `sensitive=${sensitiveRed} credsAndNetwork=${credentialsAndNetwork}`)

/* ---------------------------------------------------- one real row quoted per state */

for (const state of DISCLOSURE_STATES) {
  const row = byState[state][0]
  check(`a real row exists for the ${state} state`, row !== undefined, 'no row produced this state')
  if (row === undefined) continue
  const rendered = disclosure(row)
  eq(`the quoted ${state} row reports the state it was found under`, rendered.state, state)
  check(`the ${state} sentence is a non-empty sentence`, typeof rendered.sentence === 'string' && rendered.sentence.length > 40, `sentence=${String(rendered.sentence)}`)
  console.log(`  ${state.padEnd(9)} ${String(row.name ?? row.id ?? '(unnamed)').padEnd(30)} ${rendered.sentence}`)
}

/* ------------------------------------- EMPTY is its own sentence, and never reads as none */

const emptyRow = byState.empty[0]
const absentRow = byState.absent[0]
const emptySentence = renderDisclosure(emptyRow)
const absentSentence = renderDisclosure(absentRow)
check('FALSIFIER: the EMPTY sentence differs from the ABSENT sentence', emptySentence !== absentSentence, `empty="${emptySentence}" absent="${absentSentence}"`)
check('the EMPTY sentence names the empty array itself', emptySentence.includes('capabilities: []'), emptySentence)
check('the ABSENT sentence names the missing key', absentSentence.includes('no capabilities key'), absentSentence)
check('the EMPTY sentence does not borrow the ABSENT wording', emptySentence.includes('no capabilities key') === false, emptySentence)
check('the ABSENT sentence does not borrow the EMPTY wording', absentSentence.includes('capabilities: []') === false, absentSentence)
check('FALSIFIER: the EMPTY sentence never reads as "none"', /\bnone\b/i.test(emptySentence) === false, emptySentence)

/* ------------------------------------------------ the built-in mutation, collapsed */

/** The defect this file exists to prevent, implemented deliberately: `[]` routed to ABSENT. */
function collapsedState(input) {
  const view = unionPrivilege(input)
  if (view.declaresNothingReason !== null) return 'absent'
  if (view.declaredCapabilities.length > 0 && view.sensitiveRedLines.length > 0) return 'red-lined'
  return 'declared'
}
const collapsedEmptyCount = rows.filter((row) => collapsedState(row) === 'empty').length
const collapsedAbsentCount = rows.filter((row) => collapsedState(row) === 'absent').length
eq('MUTATION: collapsing [] into ABSENT leaves NO empty rows at all', collapsedEmptyCount, 0)
eq('MUTATION: collapsing [] into ABSENT folds all 797 empty rows into absent', collapsedAbsentCount, 522 + 797)
check('MUTATION: the collapsing classifier disagrees with the module on the quoted EMPTY row', collapsedState(emptyRow) !== disclosureState(emptyRow), `collapsed=${collapsedState(emptyRow)} module=${disclosureState(emptyRow)}`)
check('MUTATION: the collapse is exactly what the EMPTY-sentence assertions above would catch', collapsedState(emptyRow) === 'absent' && disclosureState(emptyRow) === 'empty', 'the collapse no longer routes the row to absent')

/* ------------------------------------------------------------- the reassuring score */

const score = reassuringCount(rows)
eq('FALSIFIER: the reassuring count is ZERO over the whole catalog', score.reassuring, 0)
eq('the reassuring score carries its denominator', score.total, total)
check('the score is computed from the module own pattern, not a copy', REASSURING_PATTERN instanceof RegExp && isReassuring('this plugin is safe') === true, 'the pattern does not fire on a known-reassuring phrase')
check('FALSIFIER: the pattern CAN fire, so the zero is a measurement rather than a dead test', isReassuring('this plugin is clean and harmless') === true && isReassuring(absentSentence) === false, 'the pattern cannot distinguish a reassuring sentence from a real one')
console.log(`  reassuring: ${String(score.reassuring)} of ${String(score.total)} rows rendered as reassurance`)

/* ------------------------------------------------------------------- the census */

console.log('')
console.log('== census')
console.log(`harness:     disclosure-sentence (real catalog, ${String(total)} rows)`)
console.log(`states:      absent ${String(byState.absent.length)} · empty ${String(byState.empty.length)} · declared ${String(byState.declared.length)} · red-lined ${String(byState['red-lined'].length)} = ${String(total)}`)
console.log(`reassuring:  ${String(score.reassuring)} of ${String(score.total)}`)
console.log(`assertions:  ${String(results.length)} of ${String(results.length)} recorded, ${String(failed.length)} failed`)

if (failed.length > 0) {
  console.error('')
  console.error(`FAIL: ${String(failed.length)} of ${String(results.length)} assertions did not hold.`)
  for (const f of failed) console.error(`  ${f.label} — ${f.why}`)
  process.exit(1)
}
console.log('ALL ASSERTIONS HELD. The four states are produced by real rows, EMPTY is its own sentence and never reads as none,')
console.log('the collapse was caught by this harness own differential, and no row rendered as reassurance.')
process.exit(0)
