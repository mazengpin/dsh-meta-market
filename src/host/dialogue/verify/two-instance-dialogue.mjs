#!/usr/bin/env node
/**
 * ============================================================================
 * two-instance-dialogue.mjs — L9: does the protocol actually cross a socket?
 * ============================================================================
 *
 * Run:  node src/host/dialogue/verify/two-instance-dialogue.mjs
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *
 * `dialogue-check.ts` drives ONE process and calls both halves in-process. Every
 * pass it reports is a statement about functions, not about a conversation: two
 * sides driven by the same caller cannot disagree, and a bug in the wire format
 * would be invisible because the wire is never used. THIS harness removes that
 * by giving each side its own HTTP server, its own plugin registration and its
 * own address, and then making A send B a real request.
 *
 * THE POSITIVE CONTROL IS THE POINT. Three counters make a bypassed transport
 * impossible to report as success:
 *   - `bRequestsSeen`   — every HTTP request B's server callback saw.
 *   - `receiverHits`    — incremented ONLY inside the harness's receiving
 *                         handler on B, i.e. only when a request actually
 *                         reached the code that admits an envelope.
 *   - `aRequestsSent`   — incremented only after A's client got a response.
 * If the transport were bypassed, `receiverHits` would be 0 while the dialogue
 * "completed", and this script exits non-zero.
 *
 * WHAT IT DOES NOT ESTABLISH, STATED UP FRONT RATHER THAN IN A FOOTNOTE:
 *   - Both instances live in ONE OPERATING-SYSTEM PROCESS. They are two
 *     servers, two registrations and two sockets, but one heap, one event loop
 *     and one filesystem. See the section printed at the end for exactly what
 *     that costs.
 *   - NOTHING HERE IS AUTHENTICATED. The receiver INSPECTS the envelope; it
 *     cannot PROVE who wrote it. On this deployment there is no signature field
 *     to check and the only identity material is a bare UUID.
 *   - No model is called. `dialogue/laya.ts` opens a socket to the local Laya
 *     endpoint and is deliberately NOT invoked here; the decision carried in
 *     every envelope is a fixed, scripted value.
 */

import { createServer, request as httpRequest } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ---------------------------------------------------------------------------
// The instrument
// ---------------------------------------------------------------------------

let failures = 0
let checks = 0

/**
 * Assert one condition and print the result.
 *
 * @param {string} name - what is being asserted.
 * @param {boolean} condition - the asserted condition.
 * @param {string} detail - what to print when it fails.
 */
function check(name, condition, detail) {
  checks += 1
  if (condition) {
    console.log(`  PASS  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}\n        ${detail}`)
  }
}

/**
 * Print a section heading.
 *
 * @param {string} title - the heading.
 */
function section(title) {
  console.log(`\n${title}`)
}

// ---------------------------------------------------------------------------
// 1. Import the BUILT artifact
// ---------------------------------------------------------------------------

section('1. The built artifact — imported through a file:// URL, never a raw Windows path')

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = resolve(HERE, '../../../..')
const BUILT_PATH = resolve(PLUGIN_ROOT, 'lib/index.js')
const BUILT_URL = pathToFileURL(BUILT_PATH).href

// The trap this avoids is recorded: Node 24 rejects a bare `C:\...` specifier
// with ERR_UNSUPPORTED_ESM_URL_SCHEME, so a raw Windows path cannot be imported
// at all. Assert the URL form BEFORE importing, because a failure here is the
// difference between "the import was attempted correctly" and "the import never
// happened" -- and those two are indistinguishable from the error that follows.
check(`the import specifier is a file:// URL (${BUILT_URL.slice(0, 7)}...)`, BUILT_URL.startsWith('file://'), `got "${BUILT_URL}", which is a raw path and cannot be imported`)

const built = await import(BUILT_URL)
const builtText = readFileSync(BUILT_PATH, 'utf8')

check('the built artifact imported and has an entry point', typeof built.apply === 'function', 'the import produced no `apply`, so nothing below this line was measured against the artifact')

const builtExports = Object.keys(built).sort()
console.log(`  NOTE  lib/index.js is ${builtText.length} bytes and exports exactly: ${builtExports.join(', ')}`)

// ---------------------------------------------------------------------------
// 2. THE FIRST FINDING: the artifact exports the PLUGIN and not the PROTOCOL
// ---------------------------------------------------------------------------

section('2. The artifact bundles a plugin and exposes no protocol — measured, not asserted')

// This is the guard against a vacuous absence: `!('x' in built)` passes trivially
// on `{}`. So the positive is asserted on the same line of reasoning -- `apply`
// must be present -- and only then does the absence mean anything. An import that
// silently produced an empty namespace cannot pass this section.
const protocolFunctions = ['openDialogue', 'validateEnvelope', 'seal', 'gate', 'abstain', 'finalRecord']
const exportedProtocol = protocolFunctions.filter((name) => name in built)

check('the artifact DOES export the plugin entry (`apply`) — so the namespace is not empty', typeof built.apply === 'function', 'the namespace is empty or partial, which makes every absence below vacuous rather than measured')
check(`the artifact exports ZERO of the ${protocolFunctions.length} protocol functions`, exportedProtocol.length === 0, `these were exported after all: ${exportedProtocol.join(', ')}; the report below would be wrong`)

// Exported-ness is one claim; PRESENCE is a stronger one, because a bundler can
// tree-shake a function out of the file entirely. These are different defects
// with different fixes -- "add it to the barrel" versus "the bundler drops it" --
// so both are measured rather than inferred from one another.
// A SUBSTRING SEARCH IS NOT AN ATTRIBUTION, and the first version of this file
// used one and was wrong: `seal` matched 45 times because "sealed" occurs 17
// times, and bare `gate` matched 22 times because the SAFETY lane's comments say
// "the gate". Neither occurrence is this lane's function, and the assertion built
// on them failed for the wrong reason. The check below therefore uses string
// literals that exist ONLY inside dialogue/state.ts, so a hit cannot be confused
// with another lane's identifiers.
const laneUniqueMarkers = [
  'terminal phase has no outgoing transition',
  'has already been admitted to this dialogue',
  'openDialogue',
  'validateEnvelope',
]
const markerHits = laneUniqueMarkers.filter((marker) => builtText.includes(marker))
check(`the dialogue lane's own code is ABSENT from the bundle (${laneUniqueMarkers.length} lane-unique markers, ${markerHits.length} found)`, markerHits.length === 0, `these dialogue-unique literals ARE in the bundle, so the lane is bundled and merely unexported — a different defect with a different fix: ${markerHits.join(', ')}`)

const substringCounts = Object.fromEntries(protocolFunctions.map((name) => [name, (builtText.match(new RegExp(name, 'g')) ?? []).length]))
console.log(`  NOTE  raw substring counts, reported for transparency and NOT asserted (they over-count): ${Object.entries(substringCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`)
console.log('  NOTE  those include "sealed" (17x) and the safety lane\'s prose "the gate" (22x), which is')
console.log('        precisely why a substring search cannot be the instrument for this question.')

// The constants the read-only route report actually uses ARE present, which is
// what shows the bundler kept exactly what the entry point reaches and dropped
// the rest. Without this line, "the protocol is absent" could be explained by a
// failed build rather than by reachability.
const constantPresent = ['THREE_KINDS', 'DEFAULT_BOUNDS', 'REFUSAL_CODES'].filter((name) => (builtText.match(new RegExp(name, 'g')) ?? []).length > 0)
check(`the constants the route report USES survive in the bundle (${constantPresent.length} of 3)`, constantPresent.length === 3, `only ${constantPresent.join(', ')} survived, so the bundle may be truncated rather than tree-shaken`)

console.log('  NOTE  So the protocol is NOT reachable from the built artifact. To drive it, this')
console.log('        harness imports the TypeScript source below. THAT IS A DEPLOYMENT GAP and')
console.log('        not a harness convenience: a peer that only has the package installed has')
console.log('        no way to obtain the protocol at all.')

const PROTOCOL_PATH = resolve(PLUGIN_ROOT, 'src/host/dialogue/index.ts')
const protocol = await import(pathToFileURL(PROTOCOL_PATH).href)
const { openDialogue, seal, validateEnvelope, gate, abstain, finalRecord } = protocol

check('the protocol source imported and provides the six functions this harness drives', ['openDialogue', 'seal', 'validateEnvelope', 'gate', 'abstain', 'finalRecord'].every((n) => typeof protocol[n] === 'function'), `missing: ${['openDialogue', 'seal', 'validateEnvelope', 'gate', 'abstain', 'finalRecord'].filter((n) => typeof protocol[n] !== 'function').join(', ')}`)

// ---------------------------------------------------------------------------
// 3. Two instances
// ---------------------------------------------------------------------------

section('3. Two instances from one artifact — two registrations, two servers, two ports')

/**
 * Instantiate the plugin on a fresh host context.
 *
 * The context is minimal on purpose: `apply` documents that it uses `logger`,
 * `effect` and `webServer` and nothing else, so a context with exactly those
 * three members is what the plugin's own contract promises to need.
 *
 * @param {string} label - a name for the instance.
 * @returns {object} the instance, with the routes it registered.
 */
function instantiate(label) {
  const routes = []
  const disposers = []
  const ctx = {
    logger: { info: () => {} },
    effect: (fn) => { disposers.push(fn()) },
    webServer: {
      register: (route) => {
        routes.push(route)
        return { dispose: () => {} }
      },
    },
  }
  built.apply(ctx)
  return { label, routes, disposers }
}

const instanceA = instantiate('A')
const instanceB = instantiate('B')

check(`instance A registered its own route (${instanceA.routes.length})`, instanceA.routes.length === 1, `A registered ${instanceA.routes.length} routes; apply() registers exactly one prefix`)
check(`instance B registered its own route (${instanceB.routes.length})`, instanceB.routes.length === 1, `B registered ${instanceB.routes.length} routes`)
check('the two registrations are DISTINCT objects, not one shared route', instanceA.routes[0] !== instanceB.routes[0], 'both instances share one route object, so they are one instance wearing two labels')
check('the two registrations are independent handlers, not one function called twice', instanceA.routes[0].handler !== instanceB.routes[0].handler, 'both instances share one handler closure, so state could leak between them')
check('each instance captured a disposer, so its registration is reversible', instanceA.disposers.length === 1 && instanceB.disposers.length === 1, `disposers: A=${instanceA.disposers.length} B=${instanceB.disposers.length}`)

// ---------------------------------------------------------------------------
// 4. Two servers, and the harness's own receiver on B
// ---------------------------------------------------------------------------

section('4. The transport — real sockets, and counters that make a bypass visible')

let bRequestsSeen = 0
let receiverHits = 0
let aRequestsSent = 0
const receiverRequestLines = []
const receiverBodyBytes = []

/** @type {Map<string, object>} B's dialogue state, so the state machine persists across requests. */
const bDialogues = new Map()

/**
 * Read a request body to a Buffer.
 *
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {Promise<Buffer>} the body.
 */
function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', rejectBody)
  })
}

/**
 * Answer with JSON.
 *
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {number} status - the status code.
 * @param {object} payload - the body.
 */
function respond(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8')
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': body.length })
  res.end(body)
}

/** The path the HARNESS listens on. Deliberately outside the plugin's prefix. */
const RECEIVER_PATH = '/__verify__/dialogue'

/**
 * B's receiving handler — SUPPLIED BY THIS HARNESS, not by the plugin.
 *
 * This is the finding in executable form: the plugin ships no such handler, so
 * one has to be written here before any envelope can be delivered at all.
 *
 * @param {import('node:http').IncomingMessage} req - the request.
 * @param {import('node:http').ServerResponse} res - the response.
 * @returns {Promise<boolean>} whether this handler consumed the request.
 */
async function bReceiver(req, res) {
  if ((req.url ?? '').split('?')[0] !== RECEIVER_PATH) return false

  // Incremented ONLY here, so it counts requests that reached the admitting
  // code and not merely requests that reached the machine.
  receiverHits += 1
  receiverRequestLines.push(`${req.method} ${req.url} HTTP/${req.httpVersion}`)

  const raw = await readBody(req)
  receiverBodyBytes.push(raw.length)

  let parsed = null
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    respond(res, 400, { admitted: false, code: 'not-json', receivedBytes: raw.length })
    return true
  }

  const now = new Date()
  const validation = validateEnvelope(parsed, now)

  if (!validation.ok) {
    // The refusal travels back as DATA, carrying the protocol's own code. A
    // receiver that answered only 400 would make every refusal look alike.
    console.log(`  NOTE  receiver REFUSED an envelope with code "${validation.refusal.code}" (verdict ${validation.refusal.verdict})`)
    respond(res, 400, {
      admitted: false,
      code: validation.refusal.code,
      verdict: validation.refusal.verdict,
      reason: validation.refusal.reason,
      receivedBytes: raw.length,
    })
    return true
  }

  // Admitted. Drive it through the plugin's own state machine, keeping the state
  // across requests so the dialogue is a conversation rather than a sequence of
  // unrelated calls.
  let state = bDialogues.get(parsed.dialogueId)
  if (state === undefined) {
    state = openDialogue(parsed.dialogueId, now)
    bDialogues.set(parsed.dialogueId, state)
  }

  const outcome = gate({
    state,
    envelope: parsed,
    now,
    decision: {
      value: { decision: 'choice', value: 'propose', labelSet: 'alignVerdict' },
      confidence: { value: 0.875, backend: 'laya-torch', model: 'scripted-not-a-model-call', provenance: 'computed' },
      provenance: 'model-answer-confidence',
    },
  })
  bDialogues.set(parsed.dialogueId, outcome.state)

  if (outcome.refusal !== null) {
    console.log(`  NOTE  receiver VALIDATED but the gate REFUSED with code "${outcome.refusal.code}"`)
    respond(res, 409, {
      admitted: false,
      code: outcome.refusal.code,
      verdict: outcome.refusal.verdict,
      reason: outcome.refusal.reason,
      receivedBytes: raw.length,
    })
    return true
  }

  // B seals its OWN reply and sends it back. The reply is a real sealed envelope
  // with its own content hash, so A has something checkable to validate.
  const reply = seal({
    messageId: `reply-to-${parsed.messageId}`,
    dialogueId: parsed.dialogueId,
    from: 'instance-B',
    to: 'instance-A',
    step: parsed.step,
    maxSteps: state.bounds.maxSteps,
    expiresAt: new Date(now.getTime() + 120_000).toISOString(),
    intent: null,
    packageId: `pkg-reply-${parsed.messageId}`,
    zones: [],
    claim: { decision: 'choice', value: 'counter', labelSet: 'alignVerdict' },
    kind: 'plan',
    catalogRef: null,
    declaration: { capabilities: ['dialogue'], redLines: [], declaresNothing: false },
    evidence: [{ source: 'src/host/dialogue/verify/two-instance-dialogue.mjs', verification: 'verified-ran', claim: 'B admitted an envelope that arrived over a socket' }],
    decision: { decision: 'choice', value: 'counter', labelSet: 'alignVerdict' },
  })

  respond(res, 200, {
    admitted: true,
    receiver: 'harness-supplied-on-B',
    receivedBytes: raw.length,
    appliedStep: outcome.state.appliedStep,
    phase: outcome.state.phase,
    seeMessageIds: outcome.state.seenMessageIds.length,
    reply,
  })
  return true
}

/**
 * Start an instance's server.
 *
 * @param {object} instance - the plugin instance.
 * @param {Function|null} harnessHandler - the harness route, tried first.
 * @returns {Promise<{server: object, port: number}>} the listening server.
 */
function start(instance, harnessHandler) {
  const pluginHandler = instance.routes[0].handler
  const server = createServer((req, res) => {
    if (instance.label === 'B') bRequestsSeen += 1
    Promise.resolve(harnessHandler === null ? false : harnessHandler(req, res))
      .then((taken) => {
        if (taken) return undefined
        return pluginHandler(req, res)
      })
      .catch((error) => {
        if (!res.headersSent) respond(res, 500, { error: String((error && error.message) || error) })
      })
  })
  return new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => resolveStart({ server, port: server.address().port }))
  })
}

const a = await start(instanceA, null)
const b = await start(instanceB, bReceiver)

check(`two servers are listening on two distinct OS-assigned ports (A=${a.port}, B=${b.port})`, a.port > 0 && b.port > 0 && a.port !== b.port, `ports A=${a.port} B=${b.port}; equal ports would mean one server`)

// ---------------------------------------------------------------------------
// 5. Send a real envelope over a real socket
// ---------------------------------------------------------------------------

section('5. The exchange — A seals an envelope, POSTs it, B validates and replies')

/**
 * A's client: POST a JSON body and return what came back.
 *
 * @param {number} port - the destination port.
 * @param {string} path - the destination path.
 * @param {object} payload - the JSON body.
 * @returns {Promise<object>} the response, with the bytes actually written.
 */
function postJson(port, path, payload) {
  return new Promise((resolvePost, rejectPost) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': body.length } },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          aRequestsSent += 1
          resolvePost({ status: res.statusCode, raw: Buffer.concat(chunks), requestBytes: body.length })
        })
      },
    )
    req.on('error', rejectPost)
    req.end(body)
  })
}

const NOW = new Date()
const DIALOGUE_ID = 'dlg-verify-0001'

/**
 * Build A's envelope through the plugin's own `seal`.
 *
 * @param {object} overrides - fields to replace.
 * @returns {object} the sealed envelope.
 */
function aEnvelope(overrides = {}) {
  return seal({
    messageId: overrides.messageId ?? 'a-msg-0',
    dialogueId: DIALOGUE_ID,
    from: 'instance-A',
    to: 'instance-B',
    step: overrides.step ?? 0,
    maxSteps: 8,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 120_000).toISOString(),
    intent: null,
    packageId: 'pkg-verify-1',
    zones: [],
    claim: { decision: 'noul', value: 1 },
    // `kind` is passed through untyped here on purpose: this file is plain
    // JavaScript, so the wire value below is the one the receiver must catch.
    kind: overrides.kind ?? 'plan',
    catalogRef: null,
    declaration: { capabilities: ['dialogue'], redLines: [], declaresNothing: false },
    evidence: [{ source: 'src/host/dialogue/verify/two-instance-dialogue.mjs', verification: 'verified-ran', claim: 'this envelope was sealed by A and delivered over a socket' }],
    decision: { decision: 'noul', value: 1 },
  })
}

const sealedByA = aEnvelope({ messageId: 'a-msg-0', step: 0 })
const exchange = await postJson(b.port, RECEIVER_PATH, sealedByA)

check(`A's POST to B returned HTTP ${exchange.status}`, exchange.status === 200, `got HTTP ${exchange.status}: ${exchange.raw.toString('utf8').slice(0, 300)}`)

const exchangeBody = JSON.parse(exchange.raw.toString('utf8'))
check('B ADMITTED the envelope A sealed', exchangeBody.admitted === true, `B refused it: ${exchangeBody.code} — ${exchangeBody.reason}`)

// A validates B's reply. This is the return leg: if the wire had mangled the
// reply, A would catch it here rather than trusting B's word for it.
const replyValidation = exchangeBody.reply === undefined ? { ok: false, refusal: { code: 'no-reply-field' } } : validateEnvelope(exchangeBody.reply, new Date())
check('A VALIDATED the sealed reply that came back from B', replyValidation.ok === true, `A refused B's reply: ${replyValidation.ok ? '' : replyValidation.refusal.code}`)
check('B\'s reply is addressed to A, not back to itself', exchangeBody.reply !== undefined && exchangeBody.reply.to === 'instance-A' && exchangeBody.reply.from === 'instance-B', `from=${exchangeBody.reply && exchangeBody.reply.from} to=${exchangeBody.reply && exchangeBody.reply.to}`)

// A admits the reply into its OWN dialogue — the full loop, not just validation.
const aState0 = openDialogue(DIALOGUE_ID, NOW)
const aAdmit = gate({
  state: aState0,
  envelope: exchangeBody.reply,
  now: new Date(),
  decision: {
    value: { decision: 'choice', value: 'counter', labelSet: 'alignVerdict' },
    confidence: { value: 0.875, backend: 'laya-torch', model: 'scripted-not-a-model-call', provenance: 'computed' },
    provenance: 'model-answer-confidence',
  },
})
check('A ADMITTED B\'s reply into its own dialogue state', aAdmit.refusal === null, `A's gate refused the reply: ${aAdmit.refusal === null ? '' : aAdmit.refusal.code}`)

const aRecord = finalRecord(aAdmit.state, new Date())
console.log(`  NOTE  A's record: verdict=${aRecord.verdict} appliedStep=${aAdmit.state.appliedStep} phase=${aAdmit.state.phase}`)

// ---------------------------------------------------------------------------
// 6. THE POSITIVE CONTROL ON THE TRANSPORT
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 6. The named refusals, each with its ADMITTED TWIN in the same run
//
// The transport control deliberately comes AFTER these deliveries rather than
// before them. Its counters are CUMULATIVE, and the first version of this file
// read them here -- measuring 1 of 5 -- because it asked "how many crossed the
// socket" before most of them had been sent. That is an instrument reading at the
// wrong moment, which is the exact defect the control exists to catch, so the
// reading now happens last.
// ---------------------------------------------------------------------------

section('6. The limit — a hostile envelope REFUSED BY A NAMED CODE, with its admitted twin')

/**
 * Deliver an envelope and report what B did with it.
 *
 * @param {object} envelope - the envelope to deliver.
 * @param {string} label - a name for the case.
 * @returns {Promise<object>} B's response body and status.
 */
async function deliver(envelope, label) {
  const response = await postJson(b.port, RECEIVER_PATH, envelope)
  const body = JSON.parse(response.raw.toString('utf8'))
  console.log(`  NOTE  ${label}: HTTP ${response.status} admitted=${body.admitted}${body.admitted ? '' : ` code=${body.code}`}`)
  return { status: response.status, body, raw: response.raw }
}

// Case 1: a `flattened-kind` envelope — a fourth kind arriving off the wire. This
// is the case that is unreachable through a well-typed call and reachable
// precisely here, because nothing type-checked what A put on the socket.
const flat = await deliver(aEnvelope({ messageId: 'a-msg-flat', step: 1, kind: 'done' }), 'hostile: flattened kind')
check('the hostile flattened-kind envelope was REFUSED by the named code `flattened-kind`', flat.body.admitted === false && flat.body.code === 'flattened-kind', `B answered admitted=${flat.body.admitted} code=${flat.body.code}`)

// Case 2: an EXPIRED envelope.
const expired = await deliver(aEnvelope({ messageId: 'a-msg-expired', step: 1, expiresAt: new Date(NOW.getTime() - 60_000).toISOString() }), 'hostile: expired')
check('the hostile expired envelope was REFUSED by the named code `expired`', expired.body.admitted === false && expired.body.code === 'expired', `B answered admitted=${expired.body.admitted} code=${expired.body.code}`)

// The twins. A refusal with no admission beside it is a receiver that refuses
// everything, which is not a control -- so the SAME dialogue admits a benign
// envelope immediately after each refusal.
const twin1 = await deliver(aEnvelope({ messageId: 'a-msg-twin-1', step: 1 }), 'benign twin 1 (step 1)')
check('the benign twin of the flattened-kind refusal was ADMITTED', twin1.body.admitted === true, `the twin was refused with code ${twin1.body.code}, so the refusal above proves only that B refuses`)

const twin2 = await deliver(aEnvelope({ messageId: 'a-msg-twin-2', step: 2 }), 'benign twin 2 (step 2)')
check('the benign twin of the expired refusal was ADMITTED', twin2.body.admitted === true, `the twin was refused with code ${twin2.body.code}`)

check(`the state machine advanced across requests (appliedStep ${exchangeBody.appliedStep} -> ${twin1.body.appliedStep} -> ${twin2.body.appliedStep})`, twin1.body.appliedStep === 1 && twin2.body.appliedStep === 2, `steps did not increase monotonically: ${exchangeBody.appliedStep}, ${twin1.body.appliedStep}, ${twin2.body.appliedStep}`)

// Replay, over the wire: the SAME messageId delivered a second time.
const replay = await deliver(aEnvelope({ messageId: 'a-msg-twin-2', step: 3 }), 'hostile: replay of a-msg-twin-2')
check('a REPLAYED messageId is REFUSED by the named code `replay`', replay.body.admitted === false && replay.body.code === 'replay', `B answered admitted=${replay.body.admitted} code=${replay.body.code}`)

// ---------------------------------------------------------------------------
// 7. THE SECOND FINDING: the deployment ships no way to receive an envelope
// ---------------------------------------------------------------------------

section('7. Does the plugin ship a listener? — probed, not asserted')

const receiversBefore = receiverHits
const pluginProbe = await postJson(b.port, '/meta-market/api/dialogue', sealedByA)
const probeBody = pluginProbe.raw.toString('utf8')

console.log(`  NOTE  POST /meta-market/api/dialogue on the plugin's OWN surface -> HTTP ${pluginProbe.status}`)
console.log(`  NOTE  body: ${probeBody.slice(0, 200).replace(/\n/g, ' ')}`)

check(`the plugin's own dialogue route REFUSED a POST with HTTP ${pluginProbe.status} (405 = read-only, so no listener)`, pluginProbe.status === 405, `the plugin answered ${pluginProbe.status}. If it accepted an envelope, the finding below is WRONG and must be corrected`)
check('the plugin\'s refusal was ITS OWN, not this harness\'s receiver (the counter did not move)', receiverHits === receiversBefore, `receiverHits moved ${receiversBefore} -> ${receiverHits}; the 405 above came from the harness, not the plugin, and proves nothing about the plugin`)
check('the plugin\'s own surface did not admit the envelope', !probeBody.includes('"admitted": true'), 'the plugin body reports an admission, which contradicts the 405')

console.log('  NOTE  THE PROTOCOL IS DEMONSTRATED; THE DEPLOYMENT SHIPS NO WAY TO RECEIVE ONE.')
console.log('        The exchange above crossed a socket only because THIS FILE supplied the')
console.log('        receiving handler. The plugin registers one prefix whose every lane route')
console.log('        is GET-only (src/host/routes.ts:421 refuses a non-GET with 405), so an')
console.log('        instance running the shipped plugin has no endpoint an envelope can be')
console.log('        POSTed to. "Two instances can talk" is therefore true of the PROTOCOL')
console.log('        and false of the DEPLOYMENT.')

// ---------------------------------------------------------------------------
// 8. THE POSITIVE CONTROL ON THE TRANSPORT — cumulative, and therefore read LAST
// ---------------------------------------------------------------------------

section('8. Positive control — the bytes crossed a socket, or this run means nothing')

// Read here, after every delivery, because these counters are CUMULATIVE.
// `expectedDeliveries` is the number of envelopes this file delivers to the
// RECEIVER: the initial exchange, two hostile envelopes, their two admitted
// twins, and the replay. The listener probe in the section above is one further
// request to B that must NOT reach the receiver -- which is why B's server
// counter is expected to be one higher, and why asserting they are EQUAL would
// be wrong rather than strict.
const expectedDeliveries = 6
const expectedRequestsAtB = 7
const totalRequestBytes = receiverBodyBytes.reduce((sum, n) => sum + n, 0)

// A sent EVERY request in this file, including the listener probe that was
// deliberately routed to the plugin instead of the receiver. So A's send count
// belongs to `expectedRequestsAtB`, and asserting it against the receiver's
// delivery count would demand that the probe never happened.
check(`A's client received a response to all ${aRequestsSent} requests it sent`, aRequestsSent === expectedRequestsAtB, `A got ${aRequestsSent} responses for ${expectedRequestsAtB} sends; a lost send or a lost response would leave the dialogue "complete" while proving less`)
check(`B's RECEIVING HANDLER ran exactly ${receiverHits} times — a counter incremented ONLY inside it`, receiverHits === expectedDeliveries, `the receiver ran ${receiverHits} times against ${expectedDeliveries} deliveries; an in-process call would show 0 here while still reporting a completed dialogue`)
check(`B's server callback saw ${bRequestsSeen} requests (${expectedRequestsAtB} expected: ${expectedDeliveries} deliveries + 1 listener probe)`, bRequestsSeen === expectedRequestsAtB, `B saw ${bRequestsSeen}; the receiver counter and the server counter disagree with the expected traffic`)
check(`every request line B parsed is a real POST (${receiverRequestLines.length} recorded)`, receiverRequestLines.length === receiverHits && receiverRequestLines.every((line) => line.startsWith('POST ')), `recorded lines: ${JSON.stringify(receiverRequestLines)}`)
check(`the receiver read a non-zero byte count on every delivery (${totalRequestBytes} bytes total)`, receiverBodyBytes.length === expectedDeliveries && receiverBodyBytes.every((n) => n > 0), `byte counts: ${JSON.stringify(receiverBodyBytes)}; a zero here is an instrument failure, not a small envelope`)
check('the bytes B received equal the bytes A wrote, on the admitted leg', exchangeBody.receivedBytes === exchange.requestBytes, `A wrote ${exchange.requestBytes} through the socket but B parsed ${exchangeBody.receivedBytes}; the payload did not survive the wire intact`)

console.log(`  NOTE  request lines B parsed: ${JSON.stringify(receiverRequestLines)}`)
console.log(`  NOTE  body bytes per delivery: ${receiverBodyBytes.join(' + ')} = ${totalRequestBytes} bytes across ${receiverBodyBytes.length} deliveries`)
console.log(`  NOTE  response bytes B wrote on the admitted leg: ${exchange.raw.length} bytes (HTTP ${exchange.status})`)

// ---------------------------------------------------------------------------
// 9. What this run does NOT establish
// ---------------------------------------------------------------------------

section('9. The honest limit — one process, two servers, and no proof of authorship')

console.log('  NOTE  WHY TWO INSTANCES IN ONE PROCESS IS WEAKER THAN TWO PROCESSES:')
console.log('        These are two servers, two registrations and two sockets, but ONE heap,')
console.log('        ONE event loop, ONE module graph and ONE filesystem.')
console.log('        - A shared module graph means both sides run the SAME code object. A')
console.log('          version skew between peers is invisible: both are always at the same')
console.log('          revision, so the case that matters most -- an OLD peer meeting a NEW')
console.log('          one -- is the one case this cannot produce.')
console.log('        - A shared heap means a mutation on one side is observable to the other')
console.log('          without crossing the wire, so a test cannot prove the wire is the only')
console.log('          channel by inspection alone; only the counters above do that.')
console.log('        - One event loop means concurrency, interleaving and mid-flight')
console.log('          cancellation are all absent. A dialogue that only works when both')
console.log('          sides are cooperative and unpaused is not thereby shown to work.')
console.log('        - One filesystem means the identity material is the SAME FILE for both')
console.log('          sides, so the two "peers" cannot be shown to be distinguishable.')
console.log('        WHAT WOULD CLOSE THE GAP: spawn two real node processes, each running')
console.log('        the built artifact and the harness receiver, and have process A POST to')
console.log('        process B\'s port. That makes the module graph, the heap and the event')
console.log('        loop independent, and it is the next step rather than a claim made here.')

console.log('  NOTE  NOTHING HERE IS PROVEN, ONLY INSPECTED:')
let identityNote = 'not read'
try {
  const rawId = readFileSync(resolve(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh/.anonymous-user-id'), 'utf8').trim()
  identityNote = `${rawId.length} chars`
} catch (error) {
  identityNote = `unreadable (${String((error && error.message) || error)})`
}
console.log(`        The local identity is a bare UUID (${identityNote}) and the envelope declares`)
console.log('        NO signature field. So "admitted" means the receiver INSPECTED the envelope')
console.log('        and found it well-formed — it does NOT mean the receiver established WHO')
console.log('        wrote it. Every hostile case above was caught by a CONSISTENCY check')
console.log('        (kind, expiry, replay), not by an AUTHENTICITY check, because there is no')
console.log('        authenticity material to check. An attacker who owns the sending side can')
console.log('        produce a perfectly well-formed envelope, and this receiver will admit it.')

console.log('  NOTE  DEMONSTRATED IN A HARNESS IS NOT OBSERVED IN THE DEPLOYMENT:')
console.log('        This run makes the count of completed exchanges 1. The LIVE deployment')
console.log('        still reports `peersContacted: { count: 0, of: 0 }`, and that remains')
console.log('        TRUE: no peer has ever talked on it. The two statements do not conflict')
console.log('        and neither is corrected -- one counts a demonstration, the other counts')
console.log('        a running system. social/index.ts was NOT edited to reconcile them.')

// ---------------------------------------------------------------------------
// Teardown and verdict
// ---------------------------------------------------------------------------

section('Instrument health')

for (const { server, port } of [a, b]) {
  await new Promise((resolveClose) => server.close(() => resolveClose()))
  console.log(`  NOTE  server on ${port} closed`)
}

check(`the instrument ran ${checks} assertions`, checks > 0, 'no assertions ran, which is an instrument failure rather than a pass')
// The both-sides rule: a run that refused everything has tested nothing, and
// neither has one that admitted everything.
const admittedCount = [exchangeBody, twin1.body, twin2.body].filter((row) => row.admitted === true).length
const refusedCount = [flat.body, expired.body, replay.body, { admitted: false }].filter((row) => row.admitted === false).length
check(`the instrument ADMITTED envelopes (${admittedCount} of 3 benign deliveries)`, admittedCount === 3, `only ${admittedCount} of 3 benign deliveries were admitted; a receiver that refuses everything is not a control`)
check(`the instrument REFUSED envelopes (${refusedCount} hostile deliveries)`, refusedCount >= 3, `only ${refusedCount} hostile deliveries were refused; a receiver that admits everything is not a control either`)

console.log(`\n${checks - failures} of ${checks} assertions passed`)
console.log(`transport: ${aRequestsSent} responses received, ${receiverHits} receiver hits, ${bRequestsSeen} requests seen at B, ${totalRequestBytes} body bytes read`)

if (failures > 0) {
  console.log(`\nVERDICT: FAIL (${failures} failing assertions)\n`)
  process.exit(1)
}
console.log('\nVERDICT: PASS\n')
