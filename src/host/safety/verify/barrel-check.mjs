/**
 * The D-0071 guard, run against the real barrel.
 *
 * A barrel that returns a Set or a Map is a barrel whose members vanish in the
 * serialiser with no error, so this checks the PAYLOAD AS SERIALISED rather than
 * the object as returned — because the route's consumer sees the former.
 */

const { describeSurface } = await import('../index.ts')
const { CONTROL_STANDING, THREATS, threatCensus } = await import('../gate.ts')

let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

// ---------------------------------------------------------------------------
// 0. THE INSTRUMENT GUARD, FIRST, and it is the D-0071 hazard itself.
//    If JSON.stringify cannot even DISTINGUISH these two, then every check
//    below based on serialised output is worthless.
// ---------------------------------------------------------------------------
const populated = JSON.stringify(new Set(['a', 'b', 'c']))
const empty = JSON.stringify(new Set())
console.log('D-0071 demonstrated on the instrument itself:')
console.log('  JSON.stringify(new Set(["a","b","c"])) =', populated)
console.log('  JSON.stringify(new Set())              =', empty)
console.log('  a 3-member set and an empty set are INDISTINGUISHABLE?:', populated === empty)
check('the D-0071 trap is REAL on this runtime', populated === empty, 'if these differed, D-0071 would not apply and this whole guard would be theatre')

// A Map, the same way.
console.log('  JSON.stringify(new Map([["k",1]]))     =', JSON.stringify(new Map([['k', 1]])))
console.log('  JSON.stringify(/abc/)                  =', JSON.stringify(/abc/))

// ---------------------------------------------------------------------------
// 1. The payload is JSON-round-trippable, and round-trips WITHOUT LOSS.
//    Loss would be the symptom D-0071 produces.
// ---------------------------------------------------------------------------
const raw = describeSurface()
let text
try {
  text = JSON.stringify(raw)
} catch (e) {
  check('describeSurface() is JSON-serializable', false, String(e))
  process.exit(1)
}
const back = JSON.parse(text)
check('describeSurface() serialises without throwing', typeof text === 'string', `${text.length} bytes`)
check('deep-equal after JSON round-trip', JSON.stringify(back) === text, 'no key dropped, no value coerced')

// ---------------------------------------------------------------------------
// 2. NO {} WHERE A CONTAINER WAS MEANT — the D-0071 signature, checked by walking
//    the SERIALISED structure. A Set/Map/RegExp/Date that reached the payload
//    shows up as an empty object, so any `{}` in the payload that is not a
//    documented empty container is a serialisation loss.
// ---------------------------------------------------------------------------
const emptyObjects = []
const walk = (node, path) => {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`))
    return
  }
  const keys = Object.keys(node)
  if (keys.length === 0) emptyObjects.push(path)
  for (const k of keys) walk(node[k], `${path}.${k}`)
}
walk(back, '$')
check('no unexplained empty object in the payload', emptyObjects.length === 0, emptyObjects.length ? `found at ${emptyObjects.join(', ')}` : 'the only way a Set/Map/RegExp survives to here is as {}')

// ---------------------------------------------------------------------------
// 3. The three declared status values ARE spread to an array in the payload.
// ---------------------------------------------------------------------------
check('standing.statusValues is an ARRAY in the payload', Array.isArray(back.standing.statusValues), `got ${Object.prototype.toString.call(back.standing.statusValues)}`)
check('standing.statusValues has all 3 members', back.standing.statusValues.length === 3, `got ${back.standing.statusValues.length}, expected 3`)

// ---------------------------------------------------------------------------
// 4. EVERY COUNT MATCHES THE MODULE CONSTANTS — re-taken, not cited.
// ---------------------------------------------------------------------------
const c = threatCensus()
check('standing.verifiedRan matches the live module', back.standing.verifiedRan === c.verifiedRan, `${back.standing.verifiedRan} vs ${c.verifiedRan}`)
check('standing.verifiedRead matches the live module', back.standing.verifiedRead === c.verifiedRead, `${back.standing.verifiedRead} vs ${c.verifiedRead}`)
check('standing.planned matches the live module', back.standing.planned === c.planned, `${back.standing.planned} vs ${c.planned}`)
check('standing.of matches the live module', back.standing.of === c.of, `${back.standing.of} vs ${c.of}`)
check('the split CLOSES: ran + read + plan === of', back.standing.verifiedRan + back.standing.verifiedRead + back.standing.planned === back.standing.of, `${back.standing.split}`)
check('threats.count === THREATS.length', back.threats.count === THREATS.length, `${back.threats.count} vs ${THREATS.length}`)
check('threats.rows.length === threats.count', back.threats.rows.length === back.threats.count, 'a table that reports a count it does not carry is the absent-vs-empty trap again')

// ---------------------------------------------------------------------------
// 5. The open rows are NAMED, and the named list matches the census.
// ---------------------------------------------------------------------------
const noControl = THREATS.filter((t) => t.control === null).map((t) => t.id)
check('openWithoutControl names exactly the control-less rows', JSON.stringify(back.standing.openWithoutControl) === JSON.stringify(noControl), `${JSON.stringify(back.standing.openWithoutControl)} vs ${JSON.stringify(noControl)}`)
check('countWithoutControl matches the named list length', back.standing.countWithoutControl === back.standing.openWithoutControl.length, `${back.standing.countWithoutControl} vs ${back.standing.openWithoutControl.length}`)

// ---------------------------------------------------------------------------
// 6. THE REQUIRED FIELDS, per the task contract.
// ---------------------------------------------------------------------------
check("lane === 'safety'", back.lane === 'safety', String(back.lane))
check("kind === 'plan'", back.kind === 'plan', String(back.kind))
check('notDone is a non-empty string', typeof back.notDone === 'string' && back.notDone.length > 0, `${back.notDone.length} chars`)
check('notDone says it does NOT run the gate', /does NOT run the gate/.test(back.notDone), 'the load-bearing claim of this field')
check('consistencyNotAuthenticity is present and non-empty', typeof back.consistencyNotAuthenticity === 'string' && back.consistencyNotAuthenticity.length > 0, `${back.consistencyNotAuthenticity.length} chars`)
check('and it says CONSISTENCY, not AUTHENTICITY', /CONSISTENCY, not AUTHENTICITY/.test(back.consistencyNotAuthenticity))

// ---------------------------------------------------------------------------
// 7. IT HAS NO INPUT AND CANNOT MUTATE. Arity checked on the function itself.
// ---------------------------------------------------------------------------
check('describeSurface takes ZERO arguments', describeSurface.length === 0, `declared arity ${describeSurface.length}`)
check('runsTheGate === false', back.runsTheGate === false)
check('acceptsInput === false', back.acceptsInput === false)
check('mutatesState === false', back.mutatesState === false)

// ---------------------------------------------------------------------------
// 8. PURITY: two calls agree on everything except the timestamp.
// ---------------------------------------------------------------------------
const a = JSON.parse(JSON.stringify(describeSurface()))
const b = JSON.parse(JSON.stringify(describeSurface()))
delete a.standing.censusAt
delete b.standing.censusAt
// MEASURED 2026-11-03: the payload carries a SECOND census stamp at `implementation.censusAt`,
// and this comparison deleted only the first. Two calls that straddled a second boundary then
// differed on that stamp alone and the check went RED for a reason that is not drift — observed
// once in two full `pnpm run verify` runs. Both stamps are timestamps, so both are excluded; the
// purity claim is about everything else, which is unchanged and still compared field by field.
delete a.implementation?.censusAt
delete b.implementation?.censusAt
check('two calls are deep-equal apart from the census stamps', JSON.stringify(a) === JSON.stringify(b), 'a surface that drifts between reads is not a status report')

// ---------------------------------------------------------------------------
// 9. THE ASSEMBLY'S CONTRACT: the payload is a plain object, not an array.
// ---------------------------------------------------------------------------
check('the return value is a plain object', back !== null && typeof back === 'object' && !Array.isArray(back))

console.log('')
console.log(`BARREL CHECKS: ${failed === 0 ? 'ALL HELD' : failed + ' FAILED'} — payload ${text.length} bytes, ${Object.keys(back).length} top-level keys`)
console.log('standing split as published: ' + back.standing.split + '  (censusAt ' + back.standing.censusAt + ')')
process.exit(failed === 0 ? 0 : 1)
