// Scratch: the real score distribution over the population the window renders, so a threshold is
// chosen against the population rather than against a hand-picked contrast.
import {
  loadZoneSpace,
  loadReferenceClasses,
  measureTextSimilarity,
  KNOWN_COLLIDING_CANDIDATES,
  KNOWN_PASSING_CANDIDATES,
  tokenize,
  candidateTerms,
} from '../index.ts'

const so = await loadZoneSpace()
if (!so.ok) { console.log(so.reason); process.exit(1) }
const space = so.space
const ro = await loadReferenceClasses(space)
if (!ro.ok) { console.log(ro.reason); process.exit(1) }
const refs = ro.references
const byId = new Map(refs.map((r) => [r.id, r]))

// Every VENDOR token, to show what the discipline removes.
const VENDOR = new Set(['dsh', 'deepseek', 'harnes', 'harness', 'plugin'])
const contentTerms = (t) => [...candidateTerms(t).keys()].filter((x) => !VENDOR.has(x))

console.log('=== pairwise scores across the 39-reference population (top 25 pairs) ===')
const pairs = []
for (let i = 0; i < refs.length; i += 1) {
  for (let j = i + 1; j < refs.length; j += 1) {
    const m = measureTextSimilarity(refs[i].intentText, refs[j].intentText, refs)
    if (m.score !== null) pairs.push({ a: refs[i].id, b: refs[j].id, score: m.score, shared: m.shared })
  }
}
pairs.sort((x, y) => y.score - x.score)
for (const p of pairs.slice(0, 25)) {
  console.log(`  ${p.score.toFixed(4)}  ${p.a} <-> ${p.b}  [${p.shared.join(',')}]`)
}
const above = pairs.filter((p) => p.score >= 0.1573)
console.log(`  pairs at or above 0.1573: ${above.length} of ${pairs.length}`)

console.log('\n=== candidate rows the window renders, scored against the population ===')
for (const c of [...KNOWN_COLLIDING_CANDIDATES, ...KNOWN_PASSING_CANDIDATES]) {
  const scored = refs
    .map((r) => ({ id: r.id, ...measureTextSimilarity(c.intentText, r.intentText, refs) }))
    .filter((r) => r.score !== null)
    .sort((x, y) => y.score - x.score)
  console.log(`  ${c.id}  contentTerms=${contentTerms(c.intentText).length}`)
  for (const s of scored.slice(0, 4)) console.log(`     ${s.score.toFixed(4)} ${s.id} [${s.shared.join(',')}]`)
}

console.log('\n=== a sample of INSTALLED plugins as candidates (their own scores) ===')
for (const id of ['dsh-sentinel', 'dsh-ide-git', 'dsh-ego-browser', 'dsh-memento', 'dsh-memory-delta', 'dsh-market', 'dsh-download-mode', 'dsh-plan-rag']) {
  const c = byId.get(id)
  if (c === undefined) { console.log(`  ${id}: ABSENT from the population`); continue }
  const scored = refs
    .filter((r) => r.id !== id)
    .map((r) => ({ id: r.id, ...measureTextSimilarity(c.intentText, r.intentText, refs) }))
    .filter((r) => r.score !== null)
    .sort((x, y) => y.score - x.score)
  const top = scored[0]
  const count = scored.filter((s) => s.score >= 0.1573 && s.shared.length >= 2).length
  console.log(`  ${id.padEnd(20)} top=${top ? top.score.toFixed(4) + ' ' + top.id + ' [' + top.shared.join(',') + ']' : 'none'}  at-or-above-bar=${count}`)
}
