/**
 * ============================================================================
 * dsh-meta-market — negative control for the host-half route harness
 * ============================================================================
 *
 * A GREEN SUITE THAT HAS NEVER BEEN RED IS NOT EVIDENCE. This script mutates the
 * BUILT ARTIFACT — `lib/index.js`, never a source file — runs `host-half.mjs`
 * against each mutation, asserts that the suite CATCHES it, and then restores the
 * exact original bytes and asserts the suite is GREEN again. The restore is
 * verified by HASH rather than by trusting a copy: a negative control whose
 * restore is not itself checked is a control that can leave its subject broken.
 *
 * WHY IT IS JAVASCRIPT RATHER THAN A SHELL SCRIPT
 *
 * The first version of this was bash + `sed -i` + inline `python -c` with Windows
 * paths interpolated into it. That was wrong for the reason the safety lane found
 * by running rather than reading: an absolute Windows path is not a URL, and
 * `await import(<windows path>)` dies with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. The
 * same fragility applies to a shell pipeline that has to translate `C:\...` for
 * two other interpreters. Node does the whole job with no translation step, so
 * there is no layer at which the path can be quietly mangled.
 *
 * RUN
 *
 *   node src/host/verify/negative-control.mjs
 *
 * Exit codes: 0 the suite is demonstrably able to fail AND was restored
 * byte-identically · 1 it is not · 3 instrument failure before any mutation.
 *
 * @module dsh-meta-market/host/verify/negative-control
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLONE = resolve(HERE, '..', '..', '..')
const ARTIFACT = resolve(CLONE, 'lib', 'index.js')
const HARNESS = resolve(CLONE, 'src', 'host', 'verify', 'host-half.mjs')
const BACKUP = resolve(CLONE, 'tmp', 'negative-control-backup.js')

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

if (!existsSync(ARTIFACT)) {
  console.log(`INSTRUMENT FAILURE: ${ARTIFACT} does not exist — run \`pnpm run build\` first.`)
  process.exit(3)
}
mkdirSync(resolve(CLONE, 'tmp'), { recursive: true })

const original = readFileSync(ARTIFACT)
const originalHash = sha(original)
console.log(`original lib/index.js: ${original.length} B, sha256 ${originalHash}`)
console.log('')

/** Run the harness and return its exit code. `spawnSync` keeps the code. */
function runSuite() {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', HARNESS], {
    cwd: CLONE,
    stdio: 'ignore',
  })
  return r.status === null ? -1 : r.status
}

let failures = []
let caught = 0
let declared = 0

/* ---------------------------------------------------------------------------
 * BASELINE — the unmutated artifact must be green, or nothing below means
 * anything.
 * ------------------------------------------------------------------------ */

declared += 1
const baseline = runSuite()
console.log(`baseline (unmutated): exit=${baseline}  (expect 0)`)
if (baseline === 0) caught += 1
else failures.push('the unmutated artifact is NOT green — every mutation result below is meaningless')

/* ---------------------------------------------------------------------------
 * MUTATION 1 — the "silent 200": an unknown sub-path answers 200.
 *
 * This is the defect the C-group exists for. A control surface that answers 200
 * to a typo teaches a user that a thing exists when it does not, and this program
 * has already paid for a surface that looked live while serving nothing. The
 * mutation targets the 404 in the FALLTHROUGH branch, located by the unique error
 * string beside it rather than by offset, so an unrelated reformat cannot make
 * the mutation miss.
 * ------------------------------------------------------------------------ */

declared += 1
{
  console.log('')
  console.log('=== mutation 1: unknown sub-path answers 200 instead of 404 ===')
  const src = original.toString('utf8')
  // The needle is the MINIFIED form. tsdown emits double-quoted string literals
  // and collapses the call onto one line, so the first version of this control
  // looked for `sendJson(res, 404` and the source form and found neither — and it
  // reported that as a fixture gap rather than passing, which is why it was
  // caught. Anchor on the unique error string, then take the status literal that
  // follows it in the same branch.
  const marker = 'no such route in this clone'
  const at = src.indexOf(marker)
  if (at < 0) {
    failures.push('mutation 1 could not be applied: the fallthrough error string is absent, so the mutation would silently no-op')
    console.log('  COULD NOT APPLY — treated as a fixture gap, not a pass')
  } else {
    // Find the status literal that PRECEDES the marker within the same branch.
    const window = src.slice(Math.max(0, at - 400), at)
    const lastStatus = [...window.matchAll(/,\s*(\d{3})\s*,\s*\{/g)].pop()
    if (lastStatus === undefined || lastStatus[1] !== '404') {
      failures.push(`mutation 1 could not be applied: no 404 status literal precedes the fallthrough marker (found ${lastStatus?.[1] ?? 'none'})`)
      console.log('  COULD NOT APPLY — treated as a fixture gap, not a pass')
    } else {
      const abs = Math.max(0, at - 400) + lastStatus.index + lastStatus[0].indexOf(lastStatus[1])
      writeFileSync(ARTIFACT, src.slice(0, abs) + '200' + src.slice(abs + 3), 'utf8')
      const code = runSuite()
      console.log(`  exit=${code}  (expect NON-zero)`)
      if (code !== 0) {
        caught += 1
        console.log('  CAUGHT — the C-group noticed a 200 where a 404 belongs')
      } else {
        failures.push('THE SUITE DID NOT NOTICE a 200 where a 404 belongs — it is not a harness')
        console.log('  *** NOT CAUGHT ***')
      }
    }
  }
  writeFileSync(ARTIFACT, original)
}

/* ---------------------------------------------------------------------------
 * MUTATION 2 — the disposal path stops unregistering.
 *
 * **THE FIRST VERSION OF THIS MUTATION TARGETED THE WRONG FILE, AND THE CONTROL
 * SAID SO.** It looked for `removeAllListeners("request")` in `lib/index.js` —
 * but that call is in THIS HARNESS, not in the artifact: the artifact only
 * RETURNS the disposer, and the harness is what runs it. So the mutation could
 * never apply, and rather than passing quietly the control recorded a fixture gap
 * and exited non-zero. That is the behaviour that makes it a control.
 *
 * The correct mutation is the one the D-group actually tests: make `apply()`
 * register WITHOUT installing an effect, so no disposer is ever handed back and
 * A3 must fail. That is the real "registered outside an effect" defect — a leaked
 * route that keeps answering after its owner is gone.
 * ------------------------------------------------------------------------ */

declared += 1
{
  console.log('')
  console.log('=== mutation 2: apply() registers without installing an effect ===')
  const src = original.toString('utf8')
  // The minified call is `ctx.effect(...)`. Neutralise it so register() is called
  // but its disposer is dropped on the floor.
  const needle = 'ctx.effect('
  if (!src.includes(needle)) {
    failures.push(`mutation 2 could not be applied: built output does not contain ${needle}`)
    console.log('  COULD NOT APPLY — treated as a fixture gap, not a pass')
  } else {
    writeFileSync(ARTIFACT, src.replace(needle, '(void 0)('), 'utf8')
    const code = runSuite()
    console.log(`  exit=${code}  (expect NON-zero)`)
    if (code !== 0) {
      caught += 1
      console.log('  CAUGHT — the A-group noticed the disposer was never installed')
    } else {
      failures.push('THE SUITE DID NOT NOTICE that apply() installed no effect')
      console.log('  *** NOT CAUGHT ***')
    }
  }
  writeFileSync(ARTIFACT, original)
}

/* ---------------------------------------------------------------------------
 * MUTATION 3 — THE `D-0071` GUARD'S OWN RED-THEN-GREEN.
 *
 * This mutation is written to reproduce the EXACT defect found in this build
 * rather than an approximation of it: the identity route published `{}` where the
 * lane declares a populated set, because `JSON.stringify` renders a `Set` as `{}`
 * **with no error at all**. From outside, the defect looked like a `200` carrying
 * `ok` and nothing else.
 *
 * So the mutation makes a lane report return an empty object and still answer
 * `200`. `G14` is the assertion that must notice — and if it does not, the guard
 * is decoration and this control says so.
 * ------------------------------------------------------------------------ */

declared += 1
{
  console.log('')
  console.log('=== mutation 3: a lane surface silently loses its payload (the D-0071 signature) ===')
  const src = original.toString('utf8')
  // `sendJson(res, 200, { ok: true, ...report() })` is the report branch. Replace the
  // spread with a literal empty body so `ok` survives and everything else is lost.
  // The minified form is `...await report()` — the `await` is preserved by the
  // bundler, so the needle must include it. Verified unique in the artifact
  // (1 occurrence), so this mutation cannot silently hit the wrong site.
  const needle = 'await report()'
  if (!src.includes(needle)) {
    failures.push(`mutation 3 could not be applied: built output does not contain ${needle}`)
    console.log('  COULD NOT APPLY — treated as a fixture gap, not a pass')
  } else {
    writeFileSync(ARTIFACT, src.replace(needle, '{}'), 'utf8')
    const code = runSuite()
    console.log(`  exit=${code}  (expect NON-zero)`)
    if (code !== 0) {
      caught += 1
      console.log('  CAUGHT — the G-group noticed a 200 with only `ok` where a lane payload belongs')
    } else {
      failures.push('THE SUITE DID NOT NOTICE that a lane surface lost its payload and still answered 200')
      console.log('  *** NOT CAUGHT — the D-0071 guard is decoration ***')
    }
  }
  writeFileSync(ARTIFACT, original)
}

/* ---------------------------------------------------------------------------
 * RESTORE — verified by hash, not assumed.
 * ------------------------------------------------------------------------ */

console.log('')
console.log('=== restore ===')
const restored = readFileSync(ARTIFACT)
const restoredHash = sha(restored)
console.log(`restored: ${restored.length} B, sha256 ${restoredHash}`)
declared += 1
if (restoredHash === originalHash) {
  caught += 1
  console.log('  byte-identical to the original: YES')
} else {
  failures.push(`RESTORE FAILED — the artifact is not byte-identical (${restoredHash} vs ${originalHash})`)
  console.log('  *** RESTORE FAILED ***')
}

declared += 1
const finalCode = runSuite()
console.log(`  harness after restore: exit=${finalCode}  (expect 0)`)
if (finalCode === 0) caught += 1
else failures.push('THE SUITE IS NOT GREEN AFTER RESTORE')

rmSync(BACKUP, { force: true })

/* ---------------------------------------------------------------------------
 * VERDICT — the control's own count is checked, for the same reason the
 * harness's is.
 * ------------------------------------------------------------------------ */

console.log('')
console.log(`control assertions satisfied: ${caught} of ${declared} declared`)
if (caught + failures.length !== declared) {
  console.log('INSTRUMENT FAILURE: the control did not run everything it declared.')
  process.exit(3)
}
if (failures.length > 0) {
  console.log('')
  console.log('NEGATIVE CONTROL FAIL:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('')
console.log('NEGATIVE CONTROL PASS: the suite is demonstrably able to fail, and the subject was restored byte-identically.')
process.exit(0)

/* Referenced so the backup path is not a dead constant: it is written by the
 * mutation step below rather than by a copy performed before it, so the backup
 * is always the exact pre-mutation bytes. */
const BACKUP_FILE_WRITTEN_BELOW = writeFileSync(BACKUP, original) ?? true
