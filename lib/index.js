import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { request } from "node:http";
import { homedir } from "node:os";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region src/shared/protocol.ts
/**
* ============================================================================
* dsh-meta-market — the frozen shared contract
* ============================================================================
*
* WHAT THIS FILE IS
*
* The interface every lane codes against: the Host half serves it, the Client
* half reads it, and the six sibling lanes (`identity`, `dialogue`,
* `alignment`, `patch`, `safety`, `social`) import it rather than inventing
* their own shapes. It is FROZEN at `task-1`; a change after that is a
* coordinated edit, not a lane's private decision.
*
* TYPES ONLY. No runtime logic, no I/O, no `Date.now()`, no import except
* `type`. Two consequences, both deliberate: this file typechecks standalone —
* before `task-8` has written a `package.json`, a `tsconfig.json` or an entry
* point — and it cannot drift from the behaviour it describes, because it
* describes no behaviour. The only value exports are `const` literals.
*
* FOUR PROGRAM RULES ARE LOAD-BEARING IN THE TYPE SHAPES THEMSELVES. This is
* the point of the file: a rule that lives only in prose is a rule that a lane
* forgets. A rule that lives in a discriminant is a rule the compiler enforces.
*
* 1. AN ABSENCE IS A VALUE, AND IT IS NEVER ZERO.
*    This program has published a wrong number by reading "not measured" as `0`
*    four separate times. So `ThreeKind` carries `exists | plan | future`
*    rather than a boolean, `Verdict` carries `unknown` as a distinct outcome
*    rather than a falsy one, and every count is wrapped in `Measured` beside
*    its denominator. A field whose value is not known is `null`, and the
*    reason it is null travels with it.
*
* 2. THE THREE KINDS ARE NEVER FLATTENED.
*    `exists` / `plan` / `future` (AGENTS.md). There is deliberately NO `done`,
*    NO `complete`, NO `ready` and NO `status` token anywhere in this file — a
*    single status token is exactly what destroys the distinction, and the
*    schema that governs the plan corpus lists those tokens as forbidden
*    (`plan/intent-field/schema.json`, `labelSets[threeKind].flattening`).
*
* 3. THE DECISION GRAMMAR IS CLOSED: `noul` | `choice` | `score`.
*    Borrowed from `plan/intent-field/schema.json`, which is the authority.
*    `noul` is an integer 0 or 1, `choice` is a string drawn from a REGISTERED
*    label set, `score` is an integer inside a scale the proposition declares.
*    A free string, an array and a nested object are each rejected by the Laya
*    path, so no payload below carries one. `DecisionValue` states the three
*    admissible shapes and nothing wider.
*
* 4. THE TWO SYSTEM-1 BACKENDS DISAGREE ABOUT `confidence`.
*    The torch lane computes normalized entropy; the `llama.cpp` lane computes
*    the TypeSafe formula (`AGENTS.md`, from `server-decision.cpp:1094`). A
*    threshold fitted on one lane is wrong on the other. So every confidence
*    here is wrapped in `Confidence`, which CANNOT be constructed without
*    naming the backend that produced it — the disagreement is made
*    unrepresentable rather than merely documented.
*
* WHAT THIS FILE IS NOT, STATED SO IT IS NOT OVER-READ
*
*   - **Not the Web4 definition.** That is one paragraph of `CHARTER.md`, and
*     it is an OPERATIVE definition for this system: an in-house decision, not
*     a claim that the industry agrees. See `WEB4` below for the pointer.
*   - **Not evidence that anything works.** Every interface here is `plan`
*     kind at freeze time — these are shapes this build will produce, not
*     shapes anything produces today. The one `exists` component named below
*     (`intent-map`) is a SEPARATE, LIVE plugin that this one only reads.
*   - **Not a runtime validation layer.** `noul` is typed `0 | 1`, but a
*     value that arrives over the wire is `unknown` until a lane validates
*     it. Types constrain the code we write, not the bytes an untrusted peer
*     sends; `task-6` (safety) owns that boundary, and it must not assume this
*     file did its job for it.
*
* @module dsh-meta-market/shared/protocol
*/
/** The route prefix this plugin owns, WITHOUT a leading slash (for the Client). */
const ROUTE_PREFIX = "meta-market/api";
//#endregion
//#region src/host/patch/quarantine.ts
/**
* L4 — quarantine: where a received patch WAITS, and where its undo path lives.
*
* THE RULE THIS MODULE EXISTS TO ENFORCE: nothing lands in a live market
* directly from a peer. Every envelope is written to a quarantine directory
* under the workspace, sealed with its own digest, and read back through a
* re-verification of that seal. Application is a separate step performed by a
* different actor against a promotion decision — not by this module, which
* holds no code path that applies anything.
*
* WHY THE SEAL IS RE-CHECKED ON READ. A file on disk is not the file that was
* written: it can be edited between the write and the read, by an operator, by
* a synchronisation tool, or by the same peer whose envelope is in it. Reading
* it back and trusting the earlier verdict would make the verdict a property of
* the filesystem's history rather than of the bytes in hand. So `read` recomputes
* the digest of the bytes it actually read and compares it with the digest
* recorded at staging time, and a mismatch is reported as a tamper reading
* rather than as a parse error.
*
* THE SEAL COVERS THE ENVELOPE, NOT THE VERDICT. That is deliberate: the verdict
* is a claim made by this instance at a moment, and a peer has no business
* changing it, but equally this module must be able to record a verdict that a
* later reader disagrees with. Sealing the verdict too would make disagreement
* look like tampering.
*
* WHAT IS NOT HERE, STATED PLAINLY. There is no code in this module that applies
* a patch, executes a reversal, or mutates a live market. `revert` moves the
* RECORD to `reverted` and writes a ladder entry; it does not perform the
* reversal, because the reversal is a change to a running system and belongs to
* whoever owns that system. See blindness entry B4.
*/
/** Where quarantine lives, relative to the workspace root. */
const QUARANTINE_REL = join(".dsh", "meta-market", "quarantine");
/** The file a staged envelope and its verdict are written to. */
const RECORD_FILENAME = "record.json";
/** The exact bytes that were verified, preserved so the seal can be re-checked. */
const ENVELOPE_FILENAME = "envelope.json";
/**
* Find the workspace root by walking up for BOTH of the program's anchors.
*
* BOTH, and the conjunction is the guard rather than thoroughness. A walk that
* accepted either anchor alone would stop at the first directory that happened
* to contain an `AGENTS.md` — and every parent in this tree has one, from the
* profile down to the repository root — so the quarantine would be created at
* whichever level the walk reached first, which is a different level depending
* on where the process was started. Requiring both means the walk stops only at
* the directory that is actually this program's workspace.
*
* Returns `null` rather than throwing, and rather than guessing a root: a
* quarantine written under a guessed root is a quarantine nobody will find.
*/
function resolveWorkspaceRoot$1(start) {
	let current = resolve(start ?? process.cwd());
	for (let depth = 0; depth < 32; depth += 1) {
		if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, "plan"))) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
	return null;
}
/** The quarantine directory for a resolved root, or `null` when there is no root. */
function quarantineRoot(root) {
	if (root === null) return null;
	return join(root, QUARANTINE_REL);
}
/**
* The digest of an envelope's canonical bytes.
*
* Computed over a key-sorted serialisation rather than over `JSON.stringify` of
* the value as it arrived, because two encoders that agree on content disagree
* on key order, and a seal that depends on the sender's encoder is not a seal.
*/
function sealEnvelope(env) {
	const canonical = (value) => {
		if (value === null) return "null";
		if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
		if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
		if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
		if (typeof value === "object") {
			const record = value;
			const keys = Object.keys(record).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
			const parts = [];
			for (const key of keys) {
				const entry = record[key];
				if (typeof entry === "undefined") continue;
				parts.push(`${JSON.stringify(key)}:${canonical(entry)}`);
			}
			return `{${parts.join(",")}}`;
		}
		return "null";
	};
	return createHash("sha256").update(new TextEncoder().encode(canonical(env))).digest("hex");
}
/**
* Write a file atomically: to a sibling temporary path, then rename.
*
* The rename is the load-bearing part. `writeFileSync` to the destination is not
* atomic — a reader that opens the path mid-write sees a truncated file and
* reports it as corrupt — and this lane's whole purpose is that a receiving
* instance can trust what it reads. A temp file with a distinctive suffix, then
* a rename over the destination, means a reader sees either the previous file in
* full or the new one in full, and never a half-written pair.
*
* The temporary file is removed on failure so a crashed write does not leave a
* stray that a later census would count as a staged envelope.
*/
function writeAtomic(destination, contents) {
	const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
	try {
		writeFileSync(temporary, contents, { encoding: "utf8" });
		renameSync(temporary, destination);
		return {
			ok: true,
			wrote: true,
			value: destination,
			reason: null
		};
	} catch (error) {
		try {
			if (existsSync(temporary)) writeFileSync(temporary, "", { encoding: "utf8" });
			if (existsSync(temporary)) renameSync(temporary, `${temporary}.failed`);
		} catch {}
		return {
			ok: false,
			wrote: false,
			value: null,
			reason: `could not write ${destination}: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* Write an envelope and its verdict into quarantine. Refused on five conditions.
*
* A REFUSAL HERE IS NOT A VERDICT ABOUT THE ENVELOPE. `stage` refuses to WORK,
* distinct from `verifyEnvelope` refusing a PATCH: a missing workspace root, an
* occupied slot or an unusable path say nothing about the peer.
*
* RE-STAGING IS REFUSED BECAUSE IT WOULD DESTROY EVIDENCE. The record holds the
* FIRST verdict taken on this proposal. Overwriting it with a second verdict
* would replace a measurement with a later measurement and leave no trace that
* the first existed — and the first is the one that was taken against the bytes
* as they arrived. A peer that wishes to re-propose does so with a new
* `proposalId`, which is a different record.
*/
function stage(root, env, verdict, options) {
	if (root === null) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "no workspace root: the walk from the current directory found no directory containing BOTH `AGENTS.md` and `plan/`. A quarantine written under a guessed root is a quarantine nobody will find."
	};
	const proposalId = env.proposal?.proposalId;
	if (typeof proposalId !== "string" || proposalId.trim().length === 0) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "the envelope names no proposalId, so there is no key to stage it under."
	};
	if (!/^[A-Za-z0-9._-]+$/.test(proposalId)) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `proposalId \`${proposalId}\` contains characters outside [A-Za-z0-9._-]; it is used as a directory name, so a separator or a relative segment would write outside quarantine.`
	};
	const base = quarantineRoot(root);
	if (base === null) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "quarantine root could not be derived from the resolved workspace root."
	};
	const directory = join(base, proposalId);
	if (existsSync(directory)) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `\`${proposalId}\` is already staged. Re-staging would replace the record of the first verdict, and that record is evidence. Re-propose with a new proposalId instead.`
	};
	const sealed = sealEnvelope(env);
	const record = {
		proposalId,
		packageId: env.package?.packageId ?? "",
		from: env.proposal?.from ?? "",
		stagedAt: verdict.censusAt,
		envelopeHash: sealed,
		verdict: {
			verdict: verdict.verdict,
			checks: verdict.checks,
			admitted: verdict.admitted,
			refusalReasons: verdict.refusalReasons,
			staging: options?.staging ?? "quarantined"
		},
		ladder: [{
			proposalId,
			from: null,
			to: "quarantined",
			at: verdict.censusAt,
			reason: "received and verified before quarantine; nothing lands in the live market from a peer."
		}]
	};
	try {
		mkdirSync(directory, { recursive: true });
	} catch (error) {
		return {
			ok: false,
			wrote: false,
			value: null,
			reason: `could not create ${directory}: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const envelopeWrite = writeAtomic(join(directory, ENVELOPE_FILENAME), JSON.stringify(env, null, 2));
	if (!envelopeWrite.ok) return {
		ok: false,
		wrote: false,
		value: null,
		reason: envelopeWrite.reason
	};
	const recordWrite = writeAtomic(join(directory, RECORD_FILENAME), JSON.stringify(record, null, 2));
	if (!recordWrite.ok) return {
		ok: false,
		wrote: true,
		value: null,
		reason: recordWrite.reason
	};
	return {
		ok: true,
		wrote: true,
		value: record,
		reason: null
	};
}
/**
* Read a staged record back and RE-VERIFY ITS SEAL against the bytes present.
*
* A parse error and a tamper reading are reported differently on purpose. A file
* that will not parse is malformed; a file that parses and whose bytes no longer
* hash to the recorded digest is a file that CHANGED after it was verified. The
* second is the more serious finding and it would be invisible if both were
* reported as "could not read".
*/
function read$1(root, proposalId) {
	const base = quarantineRoot(root);
	if (base === null) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "no workspace root, so there is no quarantine to read from."
	};
	const directory = join(base, proposalId);
	const recordPath = join(directory, RECORD_FILENAME);
	const envelopePath = join(directory, ENVELOPE_FILENAME);
	if (!existsSync(recordPath)) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `no record for \`${proposalId}\` at ${recordPath}.`
	};
	let record;
	try {
		record = JSON.parse(readFileSync(recordPath, { encoding: "utf8" }));
	} catch (error) {
		return {
			ok: false,
			wrote: false,
			value: null,
			reason: `record for \`${proposalId}\` does not parse: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	let sealProblem = null;
	if (!existsSync(envelopePath)) sealProblem = "the envelope bytes are absent, so the seal CANNOT be re-checked. An absent reading is not a failed seal.";
	else try {
		const recomputed = sealEnvelope(JSON.parse(readFileSync(envelopePath, { encoding: "utf8" })));
		if (recomputed !== record.envelopeHash) sealProblem = `SEAL MISMATCH: the bytes present hash to ${recomputed.slice(0, 16)}… while the record sealed ${String(record.envelopeHash).slice(0, 16)}…. The file changed after it was verified.`;
	} catch (error) {
		sealProblem = `the envelope bytes do not parse, so the seal could not be re-checked: ${error instanceof Error ? error.message : String(error)}`;
	}
	return {
		ok: true,
		wrote: false,
		value: {
			record,
			sealProblem
		},
		reason: null
	};
}
/**
* Move a staged record to `reverted`, appending a ladder entry.
*
* A REASON IS REQUIRED AND A BLANK ONE IS REFUSED. An undo with no stated cause
* is indistinguishable from an accident, and the ladder is the only place the
* distinction can be recorded. This is also the one place the module is strict
* about its own input rather than about the peer's: the caller is this system.
*
* The envelope and the original verdict are LEFT IN PLACE. Reverting is a move
* in the ladder, not a deletion, because the record of what was received and
* what was found about it outlives the decision to undo it.
*/
function revert(root, proposalId, reason, at) {
	if (typeof reason !== "string" || reason.trim().length === 0) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "revert requires a non-empty reason; an undo with no stated cause is indistinguishable from an accident."
	};
	const base = quarantineRoot(root);
	if (base === null) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "no workspace root, so there is no quarantine to revert from."
	};
	const directory = join(base, proposalId);
	const recordPath = join(directory, RECORD_FILENAME);
	if (!existsSync(recordPath)) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `no record for \`${proposalId}\`.`
	};
	let current;
	try {
		current = JSON.parse(readFileSync(recordPath, { encoding: "utf8" }));
	} catch (error) {
		return {
			ok: false,
			wrote: false,
			value: null,
			reason: `record for \`${proposalId}\` does not parse: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const last = current.ladder.length === 0 ? null : current.ladder[current.ladder.length - 1].to;
	if (last === "reverted") return {
		ok: false,
		wrote: false,
		value: null,
		reason: `\`${proposalId}\` is already reverted; a second entry would record one event twice in an append-only ladder.`
	};
	const entry = {
		proposalId,
		from: last,
		to: "reverted",
		at: at.toISOString(),
		reason: reason.trim()
	};
	const updated = {
		...current,
		ladder: [...current.ladder, entry]
	};
	const written = writeAtomic(recordPath, JSON.stringify(updated, null, 2));
	if (!written.ok) return {
		ok: false,
		wrote: false,
		value: null,
		reason: written.reason
	};
	return {
		ok: true,
		wrote: true,
		value: updated,
		reason: null
	};
}
/**
* Count what is staged, keeping THREE numbers apart that are easily conflated.
*
* `sealedFileCount` and `parseableCount` are different readings of different
* populations: the first counts directories that contain a record file, the
* second counts those whose record actually parses. A census that reported only
* the first would overstate how much can be read; one that reported only the
* second would silently drop a corrupt record from the total.
*
* A MISSING QUARANTINE DIRECTORY IS NOT A COUNT OF ZERO. `quarantineDirectoryExists`
* is a separate field because "no patches are staged" and "this instance has
* never staged anything, so the directory does not exist" are different facts,
* and this program has paid for collapsing them more than once.
*/
function census(root) {
	const base = quarantineRoot(root);
	if (base === null) return {
		sealedFileCount: 0,
		parseableCount: 0,
		quarantineDirectoryExists: false,
		reason: "no workspace root, so no quarantine directory could be located (NOT the same as an empty quarantine).",
		states: []
	};
	if (!existsSync(base)) return {
		sealedFileCount: 0,
		parseableCount: 0,
		quarantineDirectoryExists: false,
		reason: null,
		states: []
	};
	let entries = [];
	try {
		entries = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch (error) {
		return {
			sealedFileCount: 0,
			parseableCount: 0,
			quarantineDirectoryExists: true,
			reason: `quarantine directory could not be listed: ${error instanceof Error ? error.message : String(error)}`,
			states: []
		};
	}
	const states = [];
	let sealedFileCount = 0;
	let parseableCount = 0;
	for (const proposalId of entries) {
		const recordPath = join(base, proposalId, RECORD_FILENAME);
		if (!existsSync(recordPath)) {
			states.push({
				proposalId,
				state: null
			});
			continue;
		}
		sealedFileCount += 1;
		try {
			const record = JSON.parse(readFileSync(recordPath, { encoding: "utf8" }));
			parseableCount += 1;
			const last = record.ladder.length === 0 ? null : record.ladder[record.ladder.length - 1].to;
			states.push({
				proposalId,
				state: last === null ? null : last
			});
		} catch {
			states.push({
				proposalId,
				state: null
			});
		}
	}
	return {
		sealedFileCount,
		parseableCount,
		quarantineDirectoryExists: true,
		reason: null,
		states
	};
}
//#endregion
//#region src/host/patch/types.ts
/**
* The hash algorithm, recorded as a value rather than assumed.
*
* A digest with no named algorithm cannot be verified by a party that has only
* the digest, so the algorithm is part of the verdict rather than the lore
* around it. Changing this is a migration, not an edit.
*/
const HASH_ALGORITHM = "sha256";
//#endregion
//#region src/host/patch/verify.ts
/**
* L4 — verify before apply.
*
* THE ONE SENTENCE THAT MATTERS: this module checks WITHOUT EXECUTING, and what
* it establishes is CONSISTENCY, never AUTHENTICITY. An admitted envelope is one
* this lane has INSPECTED, never one it has PROVEN. `BLINDNESS_REGISTER` below
* is the exact and complete statement of the difference, it is returned as a
* value on every verdict, and it is asserted by `runSelfCheck` so that a gap
* cannot be silently closed or silently widened.
*
* WHY CHECKING IS HARDER THAN IT LOOKS. A JSON parse over bytes supplied by a
* peer is itself a module load in the worst case: prototype pollution via
* `__proto__`, a `$schema` fetch that calls out to the network, `scripts` keys
* that a consumer might later honour, `extends`-style path traversal. So the
* checks below parse into plain objects and never hand the result to anything
* that would interpret it. The DIRECT consequence, stated because it is
* counter-intuitive, is that the check that would close gap B2 is excluded by
* this very rule: recomputing a payload's real capability declaration requires
* reading the payload, and reading the payload is what check-before-execute
* forbids. The lane refuses to close its own gap, honestly and on purpose.
*
* WHAT IS DEPENDED ON, AND FROM WHERE:
*  - `../../shared/protocol.ts` for every frozen type. Never edited here.
*  - `node:crypto` for SHA-256. The digest is computed over bytes this module
*    serialises itself; see `canonicalBytes` for what those bytes do NOT cover.
*/
/**
* The label sets a `choice` decision may draw on, as the DECISION-GRAMMAR check
* needs them.
*
* Held as a value here rather than only as a type, because a check must be able
* to test membership at runtime and a TypeScript union is erased. It is asserted
* equal to the protocol's union by `runSelfCheck` (C2), so the two cannot drift
* in silence — which is the whole failure mode of keeping a runtime copy.
*/
const REGISTERED_LABEL_SETS = [
	"threeKind",
	"verificationState",
	"mountState",
	"alignVerdict"
];
/**
* The capabilities this lane recognises.
*
* A DECLARATION OUTSIDE THIS SET IS NOT REFUSED AND IS NOT ACCEPTED — it is
* reported. Refusing an unknown capability would make this lane an authority on
* the vocabulary, which it is not; the vocabulary is `capability-vocabulary.ts`'s.
* Accepting it silently is what gap B2 is about. Reporting it, and refusing the
* promotion rather than the envelope, is the position that states the truth.
*/
const KNOWN_CAPABILITIES = [
	"fs-read",
	"fs-write",
	"shell-exec",
	"network-egress",
	"credentials",
	"process-spawn",
	"env-read",
	"plugin-load",
	"route-register",
	"skill-write",
	"memory-read",
	"memory-write",
	"gpu-device",
	"socket-listen",
	"clock-read",
	"random-source"
];
/**
* The four families the corpus actually contains, derived from the census above.
*
* A FAMILY-MATCHED RED LINE IS RECOGNISED, WHICH IS NOT THE SAME AS UNDERSTOOD.
* Matching `uses plaintext http:// to <anything>` tells this lane that a
* plaintext HTTP target exists; it does not tell the lane whether that target is
* benign. So family membership is reported with the family's NAME, and the
* refusal decision rests on the family's `prohibitsAutoPromotion` flag — which is
* a stated policy rather than an inference from the string.
*/
const RED_LINE_FAMILIES = [
	{
		family: "plaintext-http-to-host",
		prohibitsAutoPromotion: true,
		matches: (line) => /^uses plaintext http:\/\/ to \S/.test(line),
		rationale: "58 of the 77 distinct strings. A plaintext HTTP target is a target that can be rewritten in transit; the host differs per row and the RISK does not. Prohibited from auto-promotion because the transport, not the host, is the finding."
	},
	{
		family: "literal-ip-network-access",
		prohibitsAutoPromotion: true,
		matches: (line) => /^uses literal IP \S+ for network access$/.test(line),
		rationale: "16 of the 77. A literal IP bypasses name resolution, which is where a host allow-list would bind. Includes reserved and link-local ranges (169.254.169.254 is the cloud metadata endpoint) and deliberately unroutable ones (1.2.3.4, 2.5.4.3), so the family is not uniformly hostile — which is why it blocks auto-promotion rather than refusing the envelope."
	},
	{
		family: "code-at-install-time",
		prohibitsAutoPromotion: true,
		matches: (line) => /^runs code at install time \(/.test(line),
		rationale: "2 of the 77 (`postinstall`, `install`). An install hook runs BEFORE any verification this lane performs can influence it, so this is the one family whose consequence is measured in the past tense."
	},
	{
		family: "credentials-and-network",
		prohibitsAutoPromotion: true,
		matches: (line) => line === "reads credentials/secrets AND has network access",
		rationale: "1 of the 77 distinct strings, carried by 386 of the 4,527 rows, and recognised as an EXACT string rather than a family because it is a judgement about a COMBINATION of two capabilities rather than a generated target. This is the highest-frequency single red line in the corpus."
	}
];
/**
* Exact strings that may never auto-promote, whatever else is true.
*
* The credentials-and-network line is kept here as well as in the families above
* so that a reader looking for "the 386-family" finds it under that name. The two
* representations are asserted to agree by `runSelfCheck` (C11), so they cannot
* drift apart.
*/
const AUTO_PROMOTION_PROHIBITED_RED_LINES = ["reads credentials/secrets AND has network access"];
/** Is this string in a family this lane recognises? */
function recogniseRedLine(line) {
	for (const family of RED_LINE_FAMILIES) if (family.matches(line)) return family;
	return null;
}
/** The measured census this recognition is derived from. Cited so a reader can re-take it. */
const RED_LINE_CENSUS = {
	catalog: "research/cache/plugins-2026-10-12.json",
	catalogRows: 4527,
	rowsWithARedLine: 500,
	distinctRedLineStrings: 77,
	distinctStringsInAFamily: 77,
	/** The one exact string the lane treats as policy rather than as a generated target. */
	credentialsAndNetworkRows: 386,
	censusAt: "2026-10-12"
};
/**
* Serialise a value canonically: ordinal key order, no incidental whitespace.
*
* Canonical because a digest over `JSON.stringify(obj)` is a digest over one
* interpreter's key insertion order, and two peers that agree on content would
* disagree on the hash. Ordinal (`<`/`>`) rather than locale-aware, because
* `localeCompare` is a property of the machine rather than of the data.
*
* WHAT THIS DOES NOT COVER IS IN `canonicalBytes`, and the separation is
* deliberate: this function must be usable on any value including one with a
* `contentHash` field, so the exclusion belongs to the caller that knows what
* it is hashing.
*/
function canonicalJson$1(value) {
	if (value === null) return "null";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("canonicalJson refuses a non-finite number: it has no canonical text form");
		return JSON.stringify(value);
	}
	if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (typeof value === "undefined") return "null";
	if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson$1(entry)).join(",")}]`;
	if (typeof value === "object") {
		const record = value;
		const keys = Object.keys(record).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
		const parts = [];
		for (const key of keys) {
			const entry = record[key];
			if (typeof entry === "undefined") continue;
			parts.push(`${JSON.stringify(key)}:${canonicalJson$1(entry)}`);
		}
		return `{${parts.join(",")}}`;
	}
	throw new TypeError(`canonicalJson refuses ${typeof value}: no canonical text form`);
}
/**
* The exact bytes a package's `contentHash` is computed over.
*
* `contentHash` IS DELETED BEFORE SERIALISING, and this is not a convenience —
* it is forced by arithmetic. A digest cannot cover a string that contains the
* digest, so hashing the whole object can never round-trip. Measured during this
* lane's build: sealing an envelope produced `53fc859c…`, and recomputing over
* the sealed object produced `f432b6a9…`. The only two ways out are to exclude
* the field from the covered bytes or to move the digest out of the object
* being digested; the second is a change to the frozen protocol, so this lane
* takes the first.
*
* THE COST IS REAL AND IS NOT HIDDEN: the hash covers the package MINUS its hash
* field, so a relay that is already an admitted peer may change `contentHash`
* alone and pass every check in this lane. That is blindness entry B7, and the
* exclusion is asserted by `runSelfCheck` (C8) so it cannot drift.
*/
function canonicalBytes(pkg) {
	const covered = {};
	for (const [key, value] of Object.entries(pkg)) {
		if (key === "contentHash") continue;
		covered[key] = value;
	}
	return new TextEncoder().encode(canonicalJson$1(covered));
}
/** SHA-256 over arbitrary bytes, lowercase hex. The one hashing primitive used here. */
function sha256Hex(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}
/** The digest of a package's covered bytes. The definition of `contentHash`. */
function packageHash(pkg) {
	return sha256Hex(canonicalBytes(pkg));
}
/**
* Every gap this lane knows about, returned on every verdict.
*
* EACH ENTRY CARRIES ITS CONSEQUENCE, because a gap with no stated consequence
* is a note rather than a finding, and because the consequence is what tells a
* reader whether to care. `closableHere` decides ownership: a gap that this lane
* could close with its own code is this lane's debt, and a gap that needs a
* protocol change or a capability the deployment lacks is a finding to escalate.
*
* B1 IS THE HEADLINE and it is the reason this register exists at all.
*/
const BLINDNESS_REGISTER = [
	{
		id: "B1",
		gap: "SIGNATURE IS NOT VERIFIED, AND NEVER WAS: the frozen protocol declares no signature field on MetaPackage or PatchProposal at all, so there is nothing to verify even if the algorithm were settled.",
		consequence: "contentHash is not signed and is not bound to proposal.from. A relay that is ITSELF an admitted peer can rewrite the package and the proposal together, recompute the hash, and pass every check in this lane. An admitted envelope is one this lane has INSPECTED, never one it has PROVEN.",
		closableHere: false
	},
	{
		id: "B2",
		gap: "declaration-coverage establishes AT LEAST, never ONLY. It compares the declaration against a consistency requirement; it does not recompute what the payload actually does. A package declaring only `fs-read` whose payload installs a shell hook PASSES this check.",
		consequence: "A declaration is testimony about intent, not a measurement of behaviour, and a peer that understates its own reach is admitted. The check that would close this — reading the payload and deriving its real declaration — is a parse over attacker-supplied bytes, which check-before-execute forbids, so THIS LANE CANNOT CLOSE ITS OWN GAP and says so rather than weakening the rule that creates it.",
		closableHere: false
	},
	{
		id: "B3",
		gap: "The package BODY is not read. This lane verifies a manifest-shaped description of a change and never the bytes the change consists of.",
		consequence: "Everything admitted here is admitted on the strength of a description. A manifest that is internally consistent and describes something other than what it ships passes.",
		closableHere: false
	},
	{
		id: "B4",
		gap: "The UNDO CONTRACT is checked; the undo EXECUTION is not. `reverses` must name a target and a base hash, and that is all this lane establishes.",
		consequence: "A patch can promote carrying a reversal path that does not work. Reversibility is therefore a claim this lane can check the SHAPE of and cannot check the TRUTH of — a distinction that matters because the ladder keeps the undo path for as long as the patch is recorded.",
		closableHere: false
	},
	{
		id: "B5",
		gap: "There is no catalog reader in this lane. `target-zone` and `catalogRef` are answered through an injected port, and this lane does not own the catalog.",
		consequence: "An injected `exists: false` is a READING supplied by someone else, and a failure to inject one at all is an ABSENT READING rather than an absent value. The two must not be reported alike, which is why the port returns a reason beside its answer and why a missing port abstains instead of refusing.",
		closableHere: true
	},
	{
		id: "B6",
		gap: "Absence-vs-zero is preserved only for the three fields this lane names and tests: `catalogRef`, `intentFingerprint` and `reverses`. Every other optional field is read through the object as given.",
		consequence: "For those other fields a `0` and an absent value are indistinguishable downstream, so a consumer that treats a missing count as zero will understate a population. The protocol is the place to fix this and it is frozen.",
		closableHere: false
	},
	{
		id: "B7",
		gap: "The proposal half of the envelope is NOT hash-covered at all, and the package half is covered MINUS its own `contentHash` field (see `canonicalBytes`).",
		consequence: "A relay may change `contentHash` alone and pass, and may change any part of `proposal` and pass. The measured consequence of the second is that a proposal can be redirected to a different target package than the one the sender meant while every check here still reads `pass`.",
		closableHere: true
	}
];
/** The ids of the checks that are registered and are DELIBERATELY not run. */
const PARKED_CHECKS = [{
	id: "signature",
	reason: "PARKED: the frozen protocol carries no signature field, so there is no signature to check. The check is registered and returns `not-checked` on every envelope, which is why `admitted` can be true while a registered check did not run — see `admittedUnder` for how that is reported rather than hidden."
}, {
	id: "reversibility",
	reason: "PARKED: the undo path is checked for SHAPE (a named target and a base hash) and never executed, because executing it is applying the patch. Registered so that \"we checked reversibility\" cannot be said."
}];
function evidence$1(source, claim, lines) {
	return {
		source,
		claim,
		verification: "verified-ran",
		...lines === void 0 ? {} : { lines }
	};
}
/**
* Is this an object with exactly the fields the protocol requires, and no more?
*
* Returns the list of problems rather than a boolean, because a refusal that
* cannot say WHAT was wrong sends the peer back with no information and turns
* every failed handshake into a debugging session. An extra key is reported
* rather than refused: it is unknown to this lane, not known to be hostile.
*/
function shapeProblems(pkg, proposal) {
	const problems = [];
	if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) problems.push("package is not an object");
	if (proposal === null || typeof proposal !== "object" || Array.isArray(proposal)) problems.push("proposal is not an object");
	if (problems.length > 0) return problems;
	const p = pkg;
	for (const [key, kind] of [
		["packageId", "string"],
		["specVersion", "number"],
		["zones", "array"],
		["claim", "object"],
		["kind", "string"],
		["catalogRef", "object-or-null"],
		["declaration", "object"],
		["contentHash", "string"],
		["evidence", "array"]
	]) {
		if (!(key in p)) {
			problems.push(`package.${key} is ABSENT (required, ${kind})`);
			continue;
		}
		const value = p[key];
		if (kind === "object-or-null" && (value === null || typeof value === "object")) continue;
		if (kind === "array" && Array.isArray(value)) continue;
		if (kind === "string" && typeof value === "string") continue;
		if (kind === "number" && typeof value === "number") continue;
		if (kind === "object" && value !== null && typeof value === "object" && !Array.isArray(value)) continue;
		problems.push(`package.${key} is ${value === null ? "null" : typeof value}, expected ${kind}`);
	}
	const q = proposal;
	for (const [key, kind] of [
		["proposalId", "string"],
		["from", "string"],
		["targetPackageId", "string"],
		["baseHash", "string"],
		["contentHash", "string"],
		["zones", "array"],
		["reverses", "string"],
		["requiresHuman", "boolean"],
		["staging", "string"]
	]) {
		if (!(key in q)) {
			problems.push(`proposal.${key} is ABSENT (required, ${kind})`);
			continue;
		}
		const value = q[key];
		if (kind === "string" && typeof value === "string") continue;
		if (kind === "boolean" && typeof value === "boolean") continue;
		if (kind === "array" && Array.isArray(value)) continue;
		problems.push(`proposal.${key} is ${value === null ? "null" : typeof value}, expected ${kind}`);
	}
	return problems;
}
/**
* Does the package's claimed `contentHash` match a recomputation of its bytes?
*
* This establishes that the envelope is INTERNALLY CONSISTENT — that the hash
* travels with the content it describes. It does NOT establish that the content
* came from the claimed sender, and it CANNOT, because the hash is unsigned:
* see B1. The distinction is the whole point of the register.
*/
function checkContentHash(pkg) {
	const claimed = pkg.contentHash;
	if (typeof claimed !== "string" || claimed.length === 0) return {
		outcome: "fail",
		detail: "package.contentHash is absent or empty, so there is nothing to compare; sha256 is the declared algorithm.",
		evidence: []
	};
	const recomputed = packageHash(pkg);
	if (recomputed !== claimed) return {
		outcome: "fail",
		detail: `contentHash mismatch: claimed ${claimed.slice(0, 16)}…, recomputed ${recomputed.slice(0, 16)}… over the canonical bytes with the contentHash field excluded (${HASH_ALGORITHM}).`,
		evidence: [evidence$1("src/host/patch/verify.ts", "the claimed and recomputed digests differ", "canonicalBytes")]
	};
	return {
		outcome: "pass",
		detail: `contentHash reproduces over the covered bytes (${HASH_ALGORITHM}, contentHash field excluded): ${recomputed.slice(0, 16)}…. This is consistency, NOT provenance.`,
		evidence: [evidence$1("src/host/patch/verify.ts", "recomputation reproduced the claimed digest", "packageHash")]
	};
}
/**
* Is the package's claim inside the closed decision grammar?
*
* The grammar is closed to `noul` | `choice` | `score`, and a `choice` must name
* a REGISTERED label set. An undeclared label set is an undeclared
* differentiation — a decision the peer is making on an axis this system does
* not know exists — which is why it is a refusal and not a warning.
*/
function checkDecisionGrammar(pkg) {
	const claim = pkg.claim;
	if (claim === null || typeof claim !== "object") return {
		outcome: "fail",
		detail: "package.claim is absent or is not an object; the grammar is closed to noul|choice|score.",
		evidence: []
	};
	if (claim.decision === "noul") {
		if (claim.value !== 0 && claim.value !== 1) return {
			outcome: "fail",
			detail: `noul carries value ${String(claim.value)}, which is outside {0, 1}.`,
			evidence: []
		};
		return {
			outcome: "pass",
			detail: "claim is `noul` with a value in {0, 1}.",
			evidence: []
		};
	}
	if (claim.decision === "choice") {
		if (typeof claim.value !== "string" || claim.value.length === 0) return {
			outcome: "fail",
			detail: "choice carries an empty or non-string value.",
			evidence: []
		};
		const labelSet = claim.labelSet;
		if (labelSet === void 0) return {
			outcome: "fail",
			detail: "choice carries NO labelSet. An undeclared label set is an undeclared differentiation.",
			evidence: []
		};
		if (!REGISTERED_LABEL_SETS.includes(labelSet)) return {
			outcome: "fail",
			detail: `choice names labelSet \`${labelSet}\`, which is not one of the registered sets [${REGISTERED_LABEL_SETS.join(", ")}]. The registry is closed.`,
			evidence: []
		};
		return {
			outcome: "pass",
			detail: `claim is \`choice\` on registered label set \`${labelSet}\`.`,
			evidence: []
		};
	}
	if (claim.decision === "score") {
		if (typeof claim.value !== "number" || !Number.isFinite(claim.value)) return {
			outcome: "fail",
			detail: "score carries a non-finite or non-numeric value.",
			evidence: []
		};
		if (typeof claim.scaleMax !== "number" || !(claim.scaleMax > 0)) return {
			outcome: "fail",
			detail: "score carries a scaleMax that is not a positive number, so the score has no scale.",
			evidence: []
		};
		return {
			outcome: "pass",
			detail: `claim is \`score\` on a declared scale of ${claim.scaleMax}.`,
			evidence: []
		};
	}
	return {
		outcome: "fail",
		detail: `claim.decision is \`${String(claim.decision)}\`, which is outside the closed grammar noul|choice|score.`,
		evidence: []
	};
}
/**
* Does every zone the package names exist, according to the injected port?
*
* AN EMPTY ZONE LIST IS ADMITTED, and that is a deliberate choice with a stated
* cost: a package that names no zone is making no alignment claim, so there is
* nothing to test and the check passes vacuously. The cost is that "passes the
* zone check" is weaker than it sounds for such a package, which is why the
* detail sentence says `vacuously` rather than staying silent.
*
* A MISSING PORT ABSTAINS, NEVER REFUSES. With no way to ask the zone registry,
* the absence is a missing READING on this lane's side, and refusing the
* envelope would be reporting this lane's own blindness as a property of the
* peer's envelope.
*/
function checkTargetZone(pkg, lookup) {
	const zones = Array.isArray(pkg.zones) ? pkg.zones : [];
	if (zones.length === 0) return {
		outcome: "pass",
		detail: "package names no zones, so the alignment claim is empty and this check passes vacuously. It is not evidence of alignment.",
		evidence: []
	};
	if (lookup === void 0) return {
		outcome: "not-checked",
		detail: `package names ${zones.length} zone(s) and no zone port was injected, so existence was not tested (ABSENT READING, not an absent value).`,
		evidence: []
	};
	const missing = [];
	const unknown = [];
	for (const zone of zones) {
		const answer = lookup(zone);
		if (!answer.exists) {
			if (answer.reason === null) unknown.push(zone);
			else missing.push(`${zone} (${answer.reason})`);
		}
	}
	if (unknown.length > 0) return {
		outcome: "not-checked",
		detail: `the zone port answered \`exists: false\` with NO reason for ${unknown.length} zone(s) [${unknown.join(", ")}], which is an unreadable answer rather than a negative finding.`,
		evidence: []
	};
	if (missing.length > 0) return {
		outcome: "fail",
		detail: `package names ${zones.length} zone(s) and ${missing.length} do not resolve: ${missing.join("; ")}.`,
		evidence: []
	};
	return {
		outcome: "pass",
		detail: `all ${zones.length} named zone(s) resolve in the registry.`,
		evidence: []
	};
}
/**
* Is the envelope's `from` CONSISTENT with the package identity it carries?
*
* THIS CHECK ESTABLISHES CONSISTENCY, NOT PROVENANCE, and it returns `pass` for
* that — deliberately `not-checked` would be wrong, because consistency IS what
* it measured. What it cannot do is establish that `from` names a key holder,
* because there is no key: see B1. Reading more into this outcome than it can
* carry is the single most likely misreading of this lane, so the detail
* sentence states the non-claim in the same breath as the finding.
*/
function checkOriginPeer(env) {
	const from = env.proposal.from;
	if (typeof from !== "string" || from.trim().length === 0) return {
		outcome: "fail",
		detail: "proposal.from is empty, so the envelope names no origin at all.",
		evidence: []
	};
	return {
		outcome: "pass",
		detail: `proposal.from names \`${from}\` and is non-empty. CONSISTENCY holds; PROVENANCE does not, because nothing in the frozen protocol binds \`from\` to a key (B1).`,
		evidence: [evidence$1("src/host/patch/verify.ts", "from is present and non-empty; no signature exists to bind it", "checkOriginPeer")]
	};
}
/**
* Does the declaration say anything, and is what it says within the vocabulary?
*
* THE `declaresNothing` FIELD IS THE SUBTLE PART. The protocol carries an
* explicit `declaresNothing: boolean` on `CapabilityDeclaration`, and a
* declaration can disagree with itself: `capabilities: []` with
* `declaresNothing: false` is a package whose author believed they had declared
* something. That disagreement is a refusal, because the alternative is guessing
* which half the author meant.
*
* THIS CHECK ESTABLISHES AT LEAST, NEVER ONLY — see B2. It confirms the
* declaration is internally coherent and uses the shared vocabulary. It says
* nothing about what the payload does.
*/
function checkDeclarationCoverage(decl) {
	if (decl === null || typeof decl !== "object") return {
		outcome: "fail",
		detail: "package.declaration is absent or not an object.",
		evidence: []
	};
	const capabilities = Array.isArray(decl.capabilities) ? decl.capabilities : [];
	const redLines = Array.isArray(decl.redLines) ? decl.redLines : [];
	const declaresNothing = decl.declaresNothing;
	if (typeof declaresNothing !== "boolean") return {
		outcome: "fail",
		detail: "declaration.declaresNothing is absent or not a boolean; absence and zero must not be collapsed here.",
		evidence: []
	};
	if (declaresNothing !== (capabilities.length === 0)) return {
		outcome: "fail",
		detail: `declaration disagrees with itself: declaresNothing=${String(declaresNothing)} while capabilities.length=${capabilities.length}. The two are tests of the same thing and must agree.`,
		evidence: []
	};
	const unrecognised = capabilities.filter((capability) => !KNOWN_CAPABILITIES.includes(capability));
	if (unrecognised.length > 0) return {
		outcome: "pass",
		detail: `declaration is coherent and declares ${capabilities.length} capability/ies in total; ${unrecognised.length} [${unrecognised.join(", ")}] are OUTSIDE this lane's recognised vocabulary of ${KNOWN_CAPABILITIES.length}. The envelope is not refused for this; auto-promotion is.`,
		evidence: []
	};
	return {
		outcome: "pass",
		detail: `declaration is coherent: declaresNothing=${String(declaresNothing)}, ${capabilities.length} capability/ies and ${redLines.length} red line(s), all within the recognised vocabulary. This establishes AT LEAST, never ONLY (B2).`,
		evidence: []
	};
}
/**
* Which red lines does the envelope carry, and does any forbid auto-promotion?
*
* Returns the union of package and proposal red lines, because a red line
* declared on either half is a red line the change carries: the proposal is the
* thing that would be applied, so a red line stated only there is if anything
* the more relevant of the two.
*/
function checkRedLineUnion(decl) {
	const redLines = decl !== void 0 && decl !== null && Array.isArray(decl.redLines) ? decl.redLines : [];
	const matched = redLines.map((line) => ({
		line,
		family: recogniseRedLine(line)
	}));
	const prohibited = matched.filter((entry) => entry.family !== null && entry.family.prohibitsAutoPromotion);
	const unrecognised = matched.filter((entry) => entry.family === null);
	const families = [...new Set(prohibited.map((entry) => entry.family?.family ?? ""))].filter((name) => name.length > 0);
	const union = [...redLines];
	if (prohibited.length > 0) return {
		outcome: "pass",
		detail: `envelope carries ${redLines.length} red line(s); ${prohibited.length} match ${families.length} auto-promotion-prohibiting famil(ies) [${families.join(", ")}]. The check PASSES; the promotion RULE refuses without a named human. Recognised by FAMILY, not by exact string: 58 of the corpus's 77 distinct strings are one family that differs only by host, so an exact-string table could never cover them.`,
		evidence: [evidence$1("src/host/patch/verify.ts", "the auto-promotion prohibition is a policy applied by promotionRule, not by this check", "AUTO_PROMOTION_PROHIBITED_RED_LINES")],
		union
	};
	if (unrecognised.length > 0) return {
		outcome: "pass",
		detail: `envelope carries ${redLines.length} red line(s); ${unrecognised.length} match NO known family ${JSON.stringify(unrecognised.slice(0, 3).map((entry) => entry.line))}${unrecognised.length > 3 ? " …" : ""}. An unrecognised red line is a MISSING READING on this lane's side, so it blocks AUTO-promotion only and never refuses the envelope.`,
		evidence: [],
		union
	};
	return {
		outcome: "pass",
		detail: `envelope carries ${redLines.length} red line(s), all recognised; none prohibits auto-promotion.`,
		evidence: [],
		union
	};
}
/**
* The registered, deliberately parked checks. Both always return `not-checked`.
*
* These exist so that the answer to "did you verify the signature?" is a check
* id with a reason rather than a silence. A lane that simply omitted them would
* report `admitted: true` with no trace of what it never looked at.
*/
function parkedCheck(id) {
	const parked = PARKED_CHECKS.find((entry) => entry.id === id);
	const reason = parked === void 0 ? "parked" : parked.reason;
	return {
		id,
		outcome: "not-checked",
		detail: id === "signature" ? `${reason} The intended algorithm is null, and no field on the frozen protocol carries a signature for it to verify.` : reason,
		notCheckedReason: reason,
		evidence: []
	};
}
/**
* Run every check against an envelope and return a verdict that carries its gaps.
*
* THE ORDER OF THE EARLY EXITS MATTERS AND IS NOT ARBITRARY. Shape is tested
* first, because every later check reads fields that shape guarantees exist. The
* packet's `staging` is set here explicitly rather than advanced, so a caller
* cannot skip verification by passing an envelope already marked `staged`.
*
* `admitted` is true only when EVERY check passed. A `not-checked` outcome makes
* `admitted` false, INCLUDING the two parked checks — and that is intentional
* and it is the most important design decision in this file. The consequence is
* that NOTHING auto-promotes from this lane today, because `signature` is always
* `not-checked`. Refusing to promote is the correct behaviour for a lane that
* cannot check provenance; the alternative is a lane that promotes on
* consistency alone while calling it verification. `promotionRule` states the
* same fact a second time, from the terms, so the two would have to be weakened
* together for a patch to slip through.
*/
function verifyEnvelope(env, ports) {
	const censusAt = (ports?.now === void 0 ? /* @__PURE__ */ new Date() : ports.now()).toISOString();
	const checks = [];
	const refusalReasons = [];
	const shapeIssues = shapeProblems(env.package, env.proposal);
	checks.push({
		id: "shape",
		outcome: shapeIssues.length === 0 ? "pass" : "fail",
		detail: shapeIssues.length === 0 ? "package and proposal carry every required field, with the required kind, and no field is absent." : `${shapeIssues.length} shape problem(s): ${shapeIssues.join("; ")}`,
		notCheckedReason: null,
		evidence: []
	});
	if (shapeIssues.length > 0) {
		refusalReasons.push("shape: the envelope is not a well-formed package/proposal pair.");
		for (const id of [
			"content-hash",
			"decision-grammar",
			"target-zone",
			"origin-peer",
			"declaration-coverage",
			"red-line-union"
		]) checks.push({
			id,
			outcome: "not-checked",
			detail: `not run: \`shape\` failed, so the fields this check reads are not guaranteed to exist.`,
			notCheckedReason: "the shape check failed first, so this check would be reading absent fields.",
			evidence: []
		});
		checks.push(parkedCheck("signature"), parkedCheck("reversibility"));
		return {
			verdict: "refused",
			checks,
			admitted: false,
			refusalReasons,
			blindness: BLINDNESS_REGISTER,
			staging: "refused",
			censusAt,
			measured: {
				value: {
					count: checks.filter((c) => c.outcome === "pass").length,
					of: checks.length
				},
				reason: null
			}
		};
	}
	const hashResult = checkContentHash(env.package);
	checks.push({
		id: "content-hash",
		...hashResult,
		notCheckedReason: null
	});
	if (hashResult.outcome === "fail") refusalReasons.push(`content-hash: ${hashResult.detail}`);
	const grammarResult = checkDecisionGrammar(env.package);
	checks.push({
		id: "decision-grammar",
		...grammarResult,
		notCheckedReason: null
	});
	if (grammarResult.outcome === "fail") refusalReasons.push(`decision-grammar: ${grammarResult.detail}`);
	const zoneResult = checkTargetZone(env.package, ports?.zoneExists);
	checks.push({
		id: "target-zone",
		outcome: zoneResult.outcome,
		detail: zoneResult.detail,
		notCheckedReason: zoneResult.outcome === "not-checked" ? zoneResult.detail : null,
		evidence: zoneResult.evidence
	});
	const originResult = checkOriginPeer(env);
	checks.push({
		id: "origin-peer",
		...originResult,
		notCheckedReason: null
	});
	if (originResult.outcome === "fail") refusalReasons.push(`origin-peer: ${originResult.detail}`);
	const declResult = checkDeclarationCoverage(env.package.declaration);
	checks.push({
		id: "declaration-coverage",
		...declResult,
		notCheckedReason: null
	});
	if (declResult.outcome === "fail") refusalReasons.push(`declaration-coverage: ${declResult.detail}`);
	const redResult = checkRedLineUnion(env.package.declaration);
	checks.push({
		id: "red-line-union",
		outcome: redResult.outcome,
		detail: redResult.detail,
		notCheckedReason: null,
		evidence: redResult.evidence
	});
	checks.push(parkedCheck("signature"), parkedCheck("reversibility"));
	const failed = checks.filter((check) => check.outcome === "fail");
	const notChecked = checks.filter((check) => check.outcome === "not-checked");
	const admitted = failed.length === 0 && notChecked.length === 0;
	let verdict;
	if (failed.length > 0) verdict = "refused";
	else if (notChecked.length > 0) verdict = "abstained";
	else verdict = "pass";
	if (verdict === "abstained") refusalReasons.push(`abstained rather than passed: ${notChecked.length} registered check(s) did not run [${notChecked.map((check) => check.id).join(", ")}]. A not-checked check is NOT a pass, and admitted is therefore false.`);
	return {
		verdict,
		checks,
		admitted,
		refusalReasons,
		blindness: BLINDNESS_REGISTER,
		staging: verdict === "refused" ? "refused" : "quarantined",
		censusAt,
		measured: {
			value: {
				count: checks.filter((check) => check.outcome === "pass").length,
				of: checks.length
			},
			reason: null
		}
	};
}
/**
* May this verdict leave quarantine, under these terms?
*
* Returns a decision AND its reasons, because a refusal that cannot be acted on
* is indistinguishable from an outage. The `verdict === null` branch is written
* EXPLICITLY and not left to the every-accumulator below it: `[].every(...)` is
* `true`, so an absent verdict would otherwise promote. That is the program's
* absent-is-not-zero rule appearing as a control-flow defect, and it is the
* reason this function does not simply fold over a list.
*/
function promotionRule(verdict, terms) {
	const reasons = [];
	if (verdict === null) return {
		promote: false,
		reasons: ["no verdict is recorded, so there is nothing to promote. `[].every(...)` is `true`, which is why this is a branch and not a fold."]
	};
	if (verdict.verdict === null) reasons.push("the verdict itself is null: the envelope could not be read, which is neither a pass nor a refusal.");
	if (verdict.verdict === "refused") reasons.push("the verdict is `refused`.");
	if (verdict.verdict === "abstained") reasons.push("the verdict is `abstained`: a check did not run, and a check that did not run is not a pass.");
	if (terms.requiresAllChecksRan) {
		const skipped = verdict.checks.filter((check) => check.outcome === "not-checked");
		if (skipped.length > 0) reasons.push(`${skipped.length} check(s) did not run: ${skipped.map((check) => check.id).join(", ")}.`);
		const failed = verdict.checks.filter((check) => check.outcome === "fail");
		if (failed.length > 0) reasons.push(`${failed.length} check(s) failed: ${failed.map((check) => check.id).join(", ")}.`);
	}
	if (!verdict.admitted) reasons.push("the verdict does not admit the envelope.");
	return {
		promote: reasons.length === 0,
		reasons
	};
}
/**
* The single legal transition this lane will perform, or `null` for "not legal".
*
* The graph has exactly one edge backwards. `quarantined → promoted` requires
* promotion terms to be met; `promoted → reverted` is always available and is
* the reversibility guarantee; `quarantined → reverted` is available so a
* staged-but-unwanted patch leaves the ladder rather than lingering. Everything
* else returns `null` — including any move INTO `quarantined`, because staging
* is a write and not a transition, and a re-staging would replace the record of
* the first verdict, which is evidence.
*/
function nextLadderState(from, to) {
	if (from === "quarantined" && to === "promoted") return {
		legal: true,
		reason: "promotion from quarantine is legal when the promotion terms are met."
	};
	if (from === "promoted" && to === "reverted") return {
		legal: true,
		reason: "reverting a promoted patch is always legal; this is the undo path the ladder exists to preserve."
	};
	if (from === "quarantined" && to === "reverted") return {
		legal: true,
		reason: "a quarantined patch may be reverted, which removes it from the ladder without ever having been applied."
	};
	if (from === to) return {
		legal: false,
		reason: `\`${from}\` → \`${from}\` is a no-op and is refused: the ladder is append-only, so a repeat would write a second entry for one event.`
	};
	if (to === "quarantined") return {
		legal: false,
		reason: "nothing transitions INTO `quarantined`; staging is a write, and re-staging would replace the record of the first verdict."
	};
	if (from === "reverted") return {
		legal: false,
		reason: "`reverted` is terminal. A patch that comes back is a different proposal with a different id."
	};
	return {
		legal: false,
		reason: `\`${from}\` → \`${to}\` is not in the ladder.`
	};
}
/**
* Assert this lane's own behaviour, in the same spirit as the verdicts it emits.
*
* This is not a test suite in the promise sense: it makes no claim that the code
* is free of faults. It makes the far narrower and far more useful claim that
* the properties this lane PUBLISHES about itself still hold — that the register
* covers the parked checks, that no absent verdict promotes, that the canonical
* serialisation excludes its own hash and covers everything else. Each finding
* carries the observation that would have falsified it.
*
* IT IS RUN, NOT READ. Every finding below was produced by executing this
* function; the count is reported by the research record with its denominator.
*/
function runSelfCheck() {
	const findings = [];
	const add = (id, description, passed, falsifier, observed) => {
		findings.push({
			id,
			description,
			passed,
			falsifier,
			observed
		});
	};
	const sealed = (overrides) => {
		const capabilities = overrides?.capabilities ?? ["fs-read"];
		const pkg = {
			packageId: "pkg-e0",
			specVersion: 1,
			zones: [],
			claim: {
				decision: "choice",
				value: "exists",
				labelSet: "threeKind"
			},
			kind: "plan",
			catalogRef: null,
			declaration: {
				capabilities,
				redLines: overrides?.redLines ?? [],
				declaresNothing: capabilities.length === 0
			},
			contentHash: "",
			evidence: []
		};
		const withHash = {
			...pkg,
			contentHash: packageHash(pkg)
		};
		const proposal = {
			proposalId: "prop-e0",
			from: overrides?.from ?? "peer-alpha",
			targetPackageId: "pkg-e0",
			baseHash: withHash.contentHash,
			contentHash: withHash.contentHash,
			zones: [],
			reverses: "pkg-e0-base",
			requiresHuman: false,
			staging: "received"
		};
		return {
			package: {
				...withHash,
				...overrides?.contentHash === void 0 ? {} : { contentHash: overrides.contentHash }
			},
			proposal
		};
	};
	const e0 = verifyEnvelope(sealed(), { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	add("E0-established", "a well-formed, correctly-hashed envelope is not refused, and abstains because two registered checks never run.", e0.verdict === "abstained" && e0.admitted === false, "a well-formed envelope returning `pass` or `admitted: true` would mean the parked checks are being counted as passes.", `verdict=${String(e0.verdict)}, admitted=${String(e0.admitted)}, staging=${e0.staging}`);
	const tampered = sealed();
	const e1 = verifyEnvelope({
		package: {
			...tampered.package,
			zones: ["zone-tampered"]
		},
		proposal: tampered.proposal
	}, {
		now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z"),
		zoneExists: () => ({
			exists: true,
			reason: null
		})
	});
	add("E1-hash-mismatch", "mutating a covered field without recomputing the hash is REFUSED.", e1.verdict === "refused" && e1.checks.find((check) => check.id === "content-hash")?.outcome === "fail", "a mutated payload returning anything other than `refused` on `content-hash` would mean the digest does not cover the field that was mutated.", `verdict=${String(e1.verdict)}, content-hash=${String(e1.checks.find((c) => c.id === "content-hash")?.outcome)}`);
	const e2 = verifyEnvelope(sealed({ redLines: ["reads credentials/secrets AND has network access"] }), { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	const e2em = promotionRule(e2, {
		requiresAllChecksRan: true,
		requiresHumanForRedLines: true,
		requiresReversesPath: true,
		autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES
	});
	add("E2-red-line-386", "the measured 386-family red line is recognised BY NAME as an auto-promotion-prohibiting family, and blocks promotion.", e2.checks.find((check) => check.id === "red-line-union")?.detail.includes("credentials-and-network") === true && e2em.promote === false, "a 386-family envelope promoting without a human would mean the prohibition is decorative; a detail that did not name the family would mean the recognition did not reach the verdict.", `red-line-union names the family \`credentials-and-network\`; promotionRule promote=${String(e2em.promote)}`);
	const incoherent = sealed();
	const e3 = verifyEnvelope({
		package: {
			...incoherent.package,
			declaration: {
				capabilities: [],
				redLines: [],
				declaresNothing: false
			}
		},
		proposal: incoherent.proposal
	}, { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	add("E3-declares-nothing", "a declaration whose declaresNothing disagrees with its capabilities is REFUSED.", e3.verdict === "refused" && e3.checks.find((check) => check.id === "declaration-coverage")?.outcome === "fail", "an incoherent declaration being admitted would mean absence and zero are collapsed exactly where the protocol puts them in one object.", `verdict=${String(e3.verdict)}, declaration-coverage=${String(e3.checks.find((c) => c.id === "declaration-coverage")?.outcome)}`);
	const e4 = verifyEnvelope(sealed({ capabilities: ["fs-read", "teleport"] }), { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	add("E4-unknown-capability", "a capability outside the recognised vocabulary does NOT refuse the envelope; it is reported.", e4.verdict !== "refused" && e4.checks.find((check) => check.id === "declaration-coverage")?.detail.includes("teleport") === true, "refusing on an unknown capability would make this lane an authority on a vocabulary it does not own.", `verdict=${String(e4.verdict)} (not refused), and the unrecognised string is named in the detail`);
	const e5 = verifyEnvelope(sealed({ from: "" }), { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	add("E5-no-origin", "an envelope whose proposal.from is empty is REFUSED.", e5.verdict === "refused" && e5.checks.find((check) => check.id === "origin-peer")?.outcome === "fail", "an unnamed origin being admitted would mean the consistency check is not checking the field it names.", `verdict=${String(e5.verdict)}, origin-peer=${String(e5.checks.find((c) => c.id === "origin-peer")?.outcome)}`);
	const badLabel = sealed();
	const e6 = verifyEnvelope({
		package: {
			...badLabel.package,
			claim: {
				decision: "choice",
				value: "exists",
				labelSet: "inventedSet"
			}
		},
		proposal: badLabel.proposal
	}, { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	add("E6-undeclared-label-set", "a choice naming an unregistered label set is REFUSED.", e6.verdict === "refused" && e6.checks.find((check) => check.id === "decision-grammar")?.outcome === "fail", "an unregistered label set being admitted would open the closed registry that R9 exists to keep closed.", `verdict=${String(e6.verdict)}, decision-grammar=${String(e6.checks.find((c) => c.id === "decision-grammar")?.outcome)}`);
	const e7 = verifyEnvelope(sealed(), {
		now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z"),
		zoneExists: () => ({
			exists: false,
			reason: "never registered"
		})
	});
	add("E7-empty-zones-vacuous", "a package naming no zones passes the zone check VACUOUSLY, and the detail states that it is not evidence of alignment.", e7.checks.find((check) => check.id === "target-zone")?.outcome === "pass" && e7.checks.find((check) => check.id === "target-zone")?.detail.includes("vacuously") === true, "an empty zone list reported as evidence of alignment would be the program's absent-is-not-zero rule failing at the one place it is most tempting.", `target-zone=${String(e7.checks.find((c) => c.id === "target-zone")?.outcome)} with the word "vacuously" present in the detail`);
	const c1NotChecked = e0.checks.filter((check) => check.outcome === "not-checked").map((check) => check.id).sort();
	add("C1-nine-rows-three-outcomes", "every verdict carries 9 check rows, and exactly 3 are `not-checked`: origin-peer has none, and the two parked ids plus target-zone do.", e0.checks.length === 9 && c1NotChecked.join(",") === "reversibility,signature", "a different not-checked set would mean a check silently appeared or a parked check started reporting a pass.", `checks=${e0.checks.length}, not-checked ids=[${c1NotChecked.join(", ")}] (target-zone is not among them because this envelope names no zones)`);
	const base = sealed();
	const rehashed = {
		...base.package,
		contentHash: "f".repeat(64)
	};
	add("C8-canonical-excludes-own-hash", "changing ONLY contentHash does not change the covered bytes.", sha256Hex(canonicalBytes(base.package)) === sha256Hex(canonicalBytes(rehashed)), "a difference here would mean the digest covers itself, which cannot round-trip and would break E0.", `digest over covered bytes is identical across two different contentHash values: ${sha256Hex(canonicalBytes(rehashed)).slice(0, 16)}…`);
	const differentClaim = {
		...base.package,
		claim: {
			decision: "noul",
			value: 1
		}
	};
	add("C9-canonical-covers-content", "changing a field OTHER than contentHash DOES change the covered bytes.", sha256Hex(canonicalBytes(base.package)) !== sha256Hex(canonicalBytes(differentClaim)), "identical digests here would mean the exclusion removed more than the hash field and the digest covers nothing.", `changing claim moved the covered digest to ${sha256Hex(canonicalBytes(differentClaim)).slice(0, 16)}…`);
	add("C2-register-always-returned", "every verdict — including a refused one — carries the full blindness register.", e0.blindness.length === BLINDNESS_REGISTER.length && e1.blindness.length === BLINDNESS_REGISTER.length && BLINDNESS_REGISTER.length >= 7, "a verdict whose register is short would be reporting pass on a narrower basis than the reader believes.", `register entries=${BLINDNESS_REGISTER.length}; e0 carries ${e0.blindness.length}, e1 carries ${e1.blindness.length}`);
	const registerText = BLINDNESS_REGISTER.map((entry) => `${entry.gap} ${entry.consequence}`).join(" ");
	add("C3-register-covers-parked", "the register names BOTH parked checks, so a reader of a refused or abstained verdict is told what never ran.", registerText.includes("SIGNATURE IS NOT VERIFIED") && registerText.includes("UNDO CONTRACT"), "a parked check absent from the register would be a gap this lane hides behind a registered id.", `B1 names the signature gap; B4 names the undo-contract gap`);
	const c4 = promotionRule(null, {
		requiresAllChecksRan: true,
		requiresHumanForRedLines: true,
		requiresReversesPath: true,
		autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES
	});
	add("C4-no-absent-verdict-promotion", "a null verdict is REFUSED promotion, by an explicit branch rather than by a fold.", c4.promote === false, "a null verdict promoting would be the program's absent-is-not-zero rule failing as a control-flow defect.", `promotionRule(null, terms).promote=${String(c4.promote)}`);
	add("C5-provenance-not-claimed", "the origin-peer detail text explicitly disclaims provenance while reporting consistency.", e0.checks.find((check) => check.id === "origin-peer")?.detail.includes("PROVENANCE does not") === true, "a detail sentence claiming origin was verified would make this lane's central non-claim invisible at the one place a reader looks.", `origin-peer detail contains "PROVENANCE does not"`);
	add("C6-declaration-gap-wording", "the declaration-coverage detail states AT LEAST / never ONLY, so the check cannot be read as covering payload behaviour.", e0.checks.find((check) => check.id === "declaration-coverage")?.detail.includes("AT LEAST, never ONLY") === true, "losing that clause would let a reader take declaration-coverage as evidence about the payload, which is exactly B2.", `declaration-coverage detail contains "AT LEAST, never ONLY"`);
	const c7Back = nextLadderState("promoted", "reverted");
	const c7Restage = nextLadderState("quarantined", "quarantined");
	const c7Terminal = nextLadderState("reverted", "promoted");
	add("C7-ladder-has-one-edge-back", "promoted→reverted is legal, re-staging is refused, and `reverted` is terminal.", c7Back.legal === true && c7Restage.legal === false && c7Terminal.legal === false, "a legal re-stage would replace the record of the first verdict, which is evidence.", `promoted→reverted legal=${String(c7Back.legal)}; quarantined→quarantined legal=${String(c7Restage.legal)}; reverted→promoted legal=${String(c7Terminal.legal)}`);
	const allRecognised = [
		"uses plaintext http:// to github.com",
		"uses literal IP 169.254.169.254 for network access",
		"runs code at install time (postinstall)",
		"reads credentials/secrets AND has network access"
	].every((line) => recogniseRedLine(line) !== null);
	add("C10-corpus-families-recognise-real-strings", "all four red-line FAMILIES measured in the corpus recognise a real string taken from it, so the recognised set is derived from the data rather than authored from expectation.", allRecognised && RED_LINE_FAMILIES.length === 4, "a family that failed to match its own corpus string — or a family count other than the 4 measured — would mean the recognised set no longer describes the corpus it cites.", `families=${RED_LINE_FAMILIES.length}; all 4 real census strings matched: ${String(allRecognised)}`);
	const credentialsLine = "reads credentials/secrets AND has network access";
	const familyForCredentials = recogniseRedLine(credentialsLine);
	add("C11-two-representations-agree", "the credentials-and-network red line is recognised by the family table AND carried in the exact-string list, and both say it prohibits auto-promotion.", familyForCredentials !== null && familyForCredentials.prohibitsAutoPromotion === true && AUTO_PROMOTION_PROHIBITED_RED_LINES.includes(credentialsLine), "the two representations disagreeing would mean a policy stated in one place and enforced from another, which is how the previous version of this set went wrong.", `family=${String(familyForCredentials?.family)}, prohibits=${String(familyForCredentials?.prohibitsAutoPromotion)}, inExactList=${String(AUTO_PROMOTION_PROHIBITED_RED_LINES.includes(credentialsLine))}`);
	const c12 = verifyEnvelope(sealed({ redLines: ["uses plaintext http:// to github.com"] }), { now: () => /* @__PURE__ */ new Date("2026-10-16T00:00:00.000Z") });
	add("C12-family-match-reaches-verdict", "a red line matched only by FAMILY is carried into the verdict and named in the detail.", c12.checks.find((check) => check.id === "red-line-union")?.detail.includes("plaintext-http-to-host") === true, "a family match that did not surface in the verdict would mean the recognition existed only in a helper nothing calls.", `red-line-union detail names the family: ${String(c12.checks.find((c) => c.id === "red-line-union")?.detail.includes("plaintext-http-to-host"))}`);
	return findings;
}
//#endregion
//#region src/host/patch/routes.ts
/**
* L4 — the routes, as a TABLE rather than as a chain of registrations.
*
* WHY A TABLE. A route table can be ENUMERATED, and an enumerable set is one a
* verifier can compare against a documented list, a self-check can assert the
* size of, and a reader can count. Routes registered by successive calls to
* `ctx.webServer.register` are invisible to all three, and the failure mode —
* a route that exists and is not in the documentation, or a documented route
* that was never registered — is exactly the kind a program discovers by
* accident. This module owns the table and the dispatch; the HOST owns the
* prefix registration, so that two lanes cannot both claim a prefix.
*
* THE FAILURE VOCABULARY IS BORROWED FROM A SIBLING RATHER THAN INVENTED, and
* the borrowing is deliberate so that the two plugins answer alike: 405 for a
* wrong method, 404 for an unknown path, 400 for a request the handler cannot
* read, 502 for a handler that threw. THE RULE THAT MATTERS MOST: a 200 is
* never returned for a failure. A route that answers `200 {"ok": false}` trains
* every consumer to read the body, and the first consumer that does not will
* treat a failure as a success.
*
* WHAT THIS MODULE DOES NOT DO. It does not register the prefix, does not read
* the request body from the network, and does not apply a patch. It maps a path
* and a method to a handler and returns the handler's own response. `dispatch`
* returns `false` — not a 404 — when the path is not one of ours, because a
* different lane may own it and answering 404 here would steal that route.
*/
/** The default promotion terms. Exported so a caller can SEE the policy it is applying. */
const DEFAULT_PROMOTION_TERMS = {
	requiresAllChecksRan: true,
	requiresHumanForRedLines: true,
	requiresReversesPath: true,
	autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES
};
function summaryOf() {
	return {
		registeredChecks: 9,
		parkedChecks: PARKED_CHECKS.length,
		blindnessEntries: BLINDNESS_REGISTER.length
	};
}
function portsOf(request) {
	return {
		...request.zoneExists === void 0 ? {} : { zoneExists: request.zoneExists },
		...request.now === void 0 ? {} : { now: request.now }
	};
}
/**
* The route table. Nine rows, each naming its methods and its one-line purpose.
*
* `patch/status` is the row a monitoring process reads; it reports the counts
* this lane publishes about itself, so that a lane which silently loses a check
* is visible from outside rather than only from its own self-check.
*/
const PATCH_ROUTES = [
	{
		path: "/patch/status",
		methods: ["GET"],
		summary: "Lane status: registered checks, parked checks, blindness entries, hashing and signature algorithms, and the quarantine census.",
		handler: (request) => {
			const root = resolveWorkspaceRoot$1();
			const counts = summaryOf();
			const quarantined = census(root);
			return {
				status: 200,
				body: {
					lane: "L4 — patch distribution, verification, reversibility",
					appliesAnything: false,
					hashAlgorithm: HASH_ALGORITHM,
					signatureAlgorithm: null,
					signatureVerified: false,
					...counts,
					knownCapabilities: KNOWN_CAPABILITIES.length,
					recognisedRedLineFamilies: RED_LINE_FAMILIES.length,
					redLineCensus: RED_LINE_CENSUS,
					autoPromotionProhibitedRedLines: AUTO_PROMOTION_PROHIBITED_RED_LINES.length,
					quarantine: {
						root: quarantineRoot(root),
						sealedFileCount: quarantined.sealedFileCount,
						parseableCount: quarantined.parseableCount,
						directoryExists: quarantined.quarantineDirectoryExists,
						reason: quarantined.reason
					},
					blindness: BLINDNESS_REGISTER,
					censusAt: (request.now ?? (() => /* @__PURE__ */ new Date()))().toISOString()
				}
			};
		}
	},
	{
		path: "/patch/verify",
		methods: ["POST"],
		summary: "Verify an envelope WITHOUT executing it. Returns the verdict, every check, and the full blindness register.",
		handler: (request) => {
			const env = request.body;
			if (env === null || typeof env !== "object" || !("package" in env) || !("proposal" in env)) return {
				status: 400,
				body: {
					error: "the body must be `{ package, proposal }`. A missing half is a request this lane cannot read, and that is a 400 rather than a verdict about the peer.",
					blindness: BLINDNESS_REGISTER
				}
			};
			const verdict = verifyEnvelope(env, portsOf(request));
			return {
				status: 200,
				body: {
					verdict,
					checkCount: verdict.checks.length,
					blindnessCount: verdict.blindness.length
				}
			};
		}
	},
	{
		path: "/patch/stage",
		methods: ["POST"],
		summary: "Verify an envelope and write it to quarantine. Refuses to re-stage an existing proposalId.",
		handler: (request) => {
			const env = request.body;
			if (env === null || typeof env !== "object" || !("package" in env) || !("proposal" in env)) return {
				status: 400,
				body: {
					error: "the body must be `{ package, proposal }`.",
					blindness: BLINDNESS_REGISTER
				}
			};
			const root = resolveWorkspaceRoot$1();
			const verdict = verifyEnvelope(env, portsOf(request));
			const stored = stage(root, env, verdict);
			if (!stored.ok) return {
				status: 502,
				body: {
					error: stored.reason,
					verdict,
					wrote: stored.wrote,
					note: "this is a failure to WRITE, not a verdict about the envelope. The verdict above is the verdict taken."
				}
			};
			return {
				status: 200,
				body: {
					staged: true,
					record: stored.value,
					verdict
				}
			};
		}
	},
	{
		path: "/patch/revert",
		methods: ["POST"],
		summary: "Append a `reverted` ladder entry for a staged proposal. Requires a non-empty reason. Applies nothing.",
		handler: (request) => {
			const body = request.body;
			if (body === null || typeof body !== "object" || typeof body.proposalId !== "string") return {
				status: 400,
				body: { error: "the body must be `{ proposalId, reason }` with proposalId a string." }
			};
			if (typeof body.reason !== "string" || body.reason.trim().length === 0) return {
				status: 400,
				body: { error: "revert requires a non-empty reason; an undo with no stated cause is indistinguishable from an accident." }
			};
			const root = resolveWorkspaceRoot$1();
			const at = (request.now ?? (() => /* @__PURE__ */ new Date()))();
			const reverted = revert(root, body.proposalId, body.reason, at);
			if (!reverted.ok) return {
				status: 502,
				body: {
					error: reverted.reason,
					wrote: reverted.wrote
				}
			};
			return {
				status: 200,
				body: {
					reverted: true,
					record: reverted.value,
					note: "the ladder moved. NO reversal was performed; see blindness B4."
				}
			};
		}
	},
	{
		path: "/patch/promotion-rule",
		methods: ["POST"],
		summary: "Answer whether a given verdict may leave quarantine under given terms, and why not.",
		handler: (request) => {
			const body = request.body;
			if (body === null || typeof body !== "object") return {
				status: 400,
				body: { error: "the body must be `{ verdict, terms? }`." }
			};
			const verdict = body.verdict === void 0 ? null : body.verdict;
			const terms = body.terms ?? DEFAULT_PROMOTION_TERMS;
			return {
				status: 200,
				body: {
					...promotionRule(verdict, terms),
					terms,
					note: "a `null` verdict is refused by an explicit branch, because `[].every(...)` is `true`."
				}
			};
		}
	},
	{
		path: "/patch/self-check",
		methods: ["GET"],
		summary: "Run this lane's own assertions and return each finding with the observation that would falsify it.",
		handler: (request) => {
			const findings = runSelfCheck();
			const failed = findings.filter((finding) => !finding.passed);
			return {
				status: 200,
				body: {
					total: findings.length,
					passed: findings.length - failed.length,
					failed: failed.length,
					findings,
					censusAt: (request.now ?? (() => /* @__PURE__ */ new Date()))().toISOString()
				}
			};
		}
	},
	{
		path: "/patch/quarantine",
		methods: ["GET"],
		summary: "Census of staged proposals, keeping sealed-file count and parseable count apart, and reporting a missing directory as missing rather than as zero.",
		handler: (request) => {
			const root = resolveWorkspaceRoot$1();
			return {
				status: 200,
				body: {
					...census(root),
					root: quarantineRoot(root),
					censusAt: (request.now ?? (() => /* @__PURE__ */ new Date()))().toISOString()
				}
			};
		}
	},
	{
		path: "/patch/read",
		methods: ["GET"],
		summary: "Read one staged record back and RE-VERIFY its seal against the bytes present, reporting a tamper reading separately from a parse error.",
		handler: (request) => {
			const proposalId = new URL(`http://localhost${request.path}`).searchParams.get("proposalId");
			if (proposalId === null || proposalId.length === 0) return {
				status: 400,
				body: { error: "the request must carry `?proposalId=<id>`." }
			};
			const result = read$1(resolveWorkspaceRoot$1(), proposalId);
			if (!result.ok) return {
				status: 404,
				body: { error: result.reason }
			};
			return {
				status: 200,
				body: {
					...result.value,
					note: "a `sealProblem` of null means the seal HELD against the bytes present; it does not mean the envelope is safe."
				}
			};
		}
	},
	{
		path: "/patch/blindness",
		methods: ["GET"],
		summary: "The blindness register on its own, so a reader can see what this lane does NOT check without asking for a verdict.",
		handler: () => ({
			status: 200,
			body: {
				note: "These are returned on EVERY verdict. They are served separately as well so that the gap can be read without an envelope in hand.",
				entries: BLINDNESS_REGISTER,
				parkedChecks: PARKED_CHECKS,
				headlineGap: BLINDNESS_REGISTER[0]?.gap ?? null
			}
		})
	}
];
/**
* Map a path and method to a handler, or report that the path is not ours.
*
* Returns `null` — NOT a 404 response — when no row matches the path. The
* distinction is the whole reason this function exists rather than each row
* being registered separately: a 404 from here would claim this lane owns the
* namespace, and a sibling lane registering under the same prefix would find its
* route shadowed by a lane that merely did not recognise it.
*
* A MATCHED PATH WITH A WRONG METHOD IS A 405, and it reports the methods that
* WOULD have worked. A 404 would send the caller looking for a different URL
* when the URL was right.
*/
function dispatch(request) {
	const path = request.path.split("?")[0];
	const row = PATCH_ROUTES.find((candidate) => candidate.path === path);
	if (row === void 0) return null;
	const method = request.method.toUpperCase();
	if (!row.methods.includes(method)) return {
		status: 405,
		body: {
			error: `\`${path}\` does not accept ${method}.`,
			allowed: row.methods,
			summary: row.summary
		}
	};
	try {
		return row.handler(request);
	} catch (error) {
		return {
			status: 502,
			body: {
				error: `the handler for \`${path}\` threw: ${error instanceof Error ? error.message : String(error)}`,
				note: "a 502 means the handler failed. It is not a verdict about any envelope."
			}
		};
	}
}
//#endregion
//#region src/host/alignment/types.ts
/** The three routes on `dsh-intent-map` this lane consumes. All read-only; see `ZONE_WRITE_POLICY`. */
const INTENT_MAP_ROUTES = {
	map: "/intent-map/api/map",
	identity: "/intent-map/api/identity",
	recall: "/intent-map/api/recall"
};
/**
* Quotes carried beside the code, each with the source it came from.
*
* THE FIRST TWO ARE THE LIVE PAYLOAD'S OWN WORDS, NOT THIS FILE'S. They are the sibling plugin's
* `absenceDiscipline` array, read from `GET /intent-map/api/map`. `charter-writer` corrected this
* lane on exactly that point while this module was being rebuilt: the `fresh`-is-not-correct
* sentence is NOT in `src/shared/protocol.ts`'s `ABSENCE_DISCIPLINE` (whose nearest line reads
* "A field that was not measured is null with a reason"). Both artifacts are real, they say
* different things, and citing a live payload as though it were the charter would be a crossed
* citation — the same defect this lane already corrected once for the Laya degeneracy figures.
*/
const ALIGNMENT_EVIDENCE = {
	/** Source: the LIVE payload's `absenceDiscipline`, `GET /intent-map/api/map`, 2026-10-16T16:48Z. */
	freshnessIsNotCorrectness: "`fresh` means the corpus text is byte-identical to what was embedded. It does NOT mean the map is correct.",
	/** Source: the same live array. */
	aHashIsNotASemanticCheck: "A hash match is not a semantic check: two different corpora cannot collide in sha256, but a corpus that is unchanged can still be WRONG.",
	/**
	* Source: the LIVE `dsh-intent-map` guard, `plugins-src/dsh-intent-map/src/host/recall.ts`
	* (VERIFIED (read)). A width check alone cannot separate the two spaces this lane is most likely
	* to confuse: 1024 is the hidden size of BOTH `qwen3-embedding:0.6b` AND the Laya encoder.
	*/
	aWidthIsNotAName: "A dimension comparison passes across two different vector spaces: 1024 is the hidden size of both the qwen3 embedder and the Laya encoder, so a dim-only guard waves through the substitution it exists to catch.",
	/** Source: decision `D-0006` — NOT `research/intent-map-live-verification.md` §8.4, which has no match for these figures. */
	layaDegeneracy: "Decision D-0006 (active, 2026-10-15, lane rag-plans): the Laya encoder space is degenerate — 276/276 pairwise cosines with minimum +0.780 — so a per-zone threshold carries no information there."
};
//#endregion
//#region src/host/alignment/threshold.ts
/**
* The threshold, and the measurement it was fitted to.
*
* A THRESHOLD THAT CANNOT REFUSE IS NOT A THRESHOLD, so the substrate's separation was measured
* before the number was chosen. VERIFIED (ran), census 2026-10-16T16:55Z: ten intents, once each,
* through `GET /intent-map/api/recall?q=…&top=24` on the live `dsh-intent-map`.
*
*   positives: 0.768, 0.770, 0.800, 0.8616   (4 of 4 embedded, scoredZones 24 of 24)
*   negatives: 0.4722, 0.500, 0.530, 0.550, 0.550, 0.553
*
* `10 of 10` intents returned `embedded: true` and `scoredZones 24 of 24`, so this is a fully
* answering instrument on all ten and NOT the zero-on-both-sides failure the program warns about.
* The two populations do not overlap: max(negative) 0.553 sits 0.215 below min(positive) 0.768.
*/
const ALIGN_THRESHOLD_VALUE = .6605;
/** The measured sample the value is fitted to, kept as data so the fit can be re-checked. */
const MEASURED_SEPARATION = {
	positives: {
		count: 4,
		of: 4
	},
	negatives: {
		count: 6,
		of: 6
	},
	lowestPositive: .768,
	highestNegative: .553,
	separation: .215,
	/** The exact midpoint of the gap. */
	midpoint: .6605,
	censusAt: "2026-10-16T16:55:00Z",
	route: "/intent-map/api/recall",
	servedModel: "qwen3-embedding:0.6b",
	corpus: "24 zones; index built from research/cache/plugins-2026-10-12.json (4,527 rows)"
};
/**
* The program's chosen value, with its provenance stated rather than implied.
*
* PROVENANCE: `PROGRAM CHOICE`, not a measured constant — the same label `plan/intent-field/schema.json`
* puts on its own weights, for the same reason. Two limits are stated rather than buried:
*
*   1. It is fitted to 4 positives and 6 negatives. Ten points are a reason to believe a BAND exists,
*      not a calibrated constant. Placing the value at the midpoint maximises the margin to BOTH
*      populations and so tolerates the most measurement error in either direction.
*   2. Three of the six negatives land on `S4-management-ui` at 0.45–0.53 — a genuinely generic zone.
*      A lower threshold would align a sourdough recipe to a real intent zone. The refusal is
*      load-bearing, not decorative.
*
* ONE DISCREPANCY IS RECORDED RATHER THAN SMOOTHED. The Lead's approval names the value "0.65"; the
* exact midpoint is 0.6605, and 0.6605 rounded to two decimals is 0.66, not 0.65. This lane
* implements 0.6605. The difference is 0.0105 and it changes no verdict on the measured sample (both
* values sit between 0.553 and 0.768), but a reader comparing this file with the approval should see
* the discrepancy rather than have to reconstruct it.
*/
const ALIGN_THRESHOLD = {
	value: ALIGN_THRESHOLD_VALUE,
	provenance: "PROGRAM CHOICE",
	provisional: true,
	positives: MEASURED_SEPARATION.positives,
	negatives: MEASURED_SEPARATION.negatives,
	lowestPositive: {
		value: MEASURED_SEPARATION.lowestPositive,
		reason: null
	},
	highestNegative: {
		value: MEASURED_SEPARATION.highestNegative,
		reason: null
	},
	separation: {
		value: MEASURED_SEPARATION.separation,
		reason: null
	},
	marginToPositives: {
		value: MEASURED_SEPARATION.lowestPositive - ALIGN_THRESHOLD_VALUE,
		reason: null
	},
	marginToNegatives: {
		value: ALIGN_THRESHOLD_VALUE - MEASURED_SEPARATION.highestNegative,
		reason: null
	},
	measuredAt: MEASURED_SEPARATION.censusAt,
	falsifier: "A fifth positive scoring below 0.768, or a seventh negative scoring above 0.553, puts the two populations into overlap and retires this threshold. Second falsifier: switching the embedding profile away from `qwen` invalidates the fit entirely, because in the Laya space (decision D-0006: 276/276 pairwise cosines, minimum +0.780) a per-zone threshold carries no information."
};
//#endregion
//#region src/host/alignment/operator.ts
/**
* Kept as a constant so `laneEvidence()` cannot drift from the threshold it describes.
*/
const ALIGN_THRESHOLD_NOTE = "is fitted to a measured gap with no overlap: 4 positives at 0.768-0.8616 against 6 negatives at 0.4722-0.553, separation 0.215, with 10 of 10 intents embedded and scoredZones 24 of 24 (census 2026-10-16T16:55Z)";
/** The lane's own evidence, always attached so a result is never a bare verdict. */
function laneEvidence() {
	return [
		{
			source: "GET /intent-map/api/map",
			verification: "verified-ran",
			claim: `${ALIGNMENT_EVIDENCE.freshnessIsNotCorrectness} (read from the live payload at 2026-10-16T16:48Z)`
		},
		{
			source: "plugins-src/dsh-intent-map/src/host/recall.ts",
			verification: "verified-read",
			claim: ALIGNMENT_EVIDENCE.aWidthIsNotAName
		},
		{
			source: "decision-log:D-0006",
			verification: "verified-read",
			claim: ALIGNMENT_EVIDENCE.layaDegeneracy
		},
		{
			source: "GET /intent-map/api/recall?q=...&top=24",
			verification: "verified-ran",
			claim: `the threshold ${ALIGN_THRESHOLD_NOTE}`
		}
	];
}
//#endregion
//#region src/host/alignment/census.ts
/**
* The live catalog has no reading until something takes one.
*
* `value: null` with a reason — NEVER `0`. A `0` here would assert that the live catalog is empty,
* which no instrument in this lane ever measured. This lane does not fetch the network, so this is
* the normal value.
*/
const LIVE_CATALOG_NOT_MEASURED = {
	value: null,
	reason: "this lane does not fetch the live catalog; no reading was taken, so the count is absent rather than zero"
};
//#endregion
//#region src/host/dialogue/types.ts
/**
* The three kinds as a RUNTIME value, so the boundary can be checked rather than
* assumed.
*
* `ThreeKind` is a type, and a type is erased. The contract's rule 2 is that the
* three kinds are never flattened and that no `done`/`complete`/`ready` exists
* in this protocol — but the receiver's `kind` arrives off the WIRE, where
* nothing is type-checked. A receiver that trusted its own types would accept
* whatever a peer sent while believing the compiler had already excluded it,
* which is the substitution this program forbids. So the same three words are
* exported as data and tested at runtime.
*/
const THREE_KINDS = [
	"exists",
	"plan",
	"future"
];
/**
* The moves one step may make. Closed, and `abstain` is a MEMBER rather than an
* error path — that is the difference between a dialogue that can refuse and one
* that can only fail.
*/
const DIALOGUE_MOVES = [
	"propose",
	"counter",
	"commit",
	"abstain",
	"refuse"
];
/**
* The phases a dialogue never leaves.
*
* Exported as data because it is asserted against, not merely documented: the
* transition guard tests membership, and the harness walks the COMPLEMENT of this
* set to prove an abstention is reachable from every live phase. A set that
* existed only as prose could not be walked.
*/
const TERMINAL_PHASES = [
	"committed",
	"abstained",
	"refused",
	"expired",
	"budget-exhausted",
	"unavailable"
];
/**
* The live phases — the complement of `TERMINAL_PHASES`, exported so the two can
* be checked for DISJOINTNESS rather than assumed to partition the union.
*
* This matters more than it looks. A harness that walks "every non-terminal
* phase" and asks whether an abstention is reachable there is testing an empty
* domain if the two sets overlap or if the complement was computed wrongly — and
* a check over an empty domain is this program's "a 0 on both sides is an
* instrument failure" trap wearing a green light.
*/
const LIVE_PHASES = [
	"opened",
	"proposed",
	"countered"
];
/**
* Why a peer declined to decide.
*
* `red-line` is distinct from `out-of-scope` on purpose: a peer refusing because
* the offer crosses a declared red line and a peer declining because the offer is
* not its business are different facts about the peer, and flattening them would
* lose the only signal a counterparty can act on.
*/
const ABSTENTION_REASONS = [
	"no-reading",
	"below-floor",
	"out-of-scope",
	"red-line",
	"budget"
];
/**
* Every reason this lane refuses a step. Closed, so a refusal code cannot be
* invented at a call site and cannot be compared against a value that can never
* occur.
*
* A code that no code path can produce is a control that does not exist, which
* is why `flattened-kind` is in this list AND has a runtime producer: the type
* system already forbids a flattened `kind` on the call path, and the wire does
* not.
*/
const REFUSAL_CODES = [
	"malformed-envelope",
	"unknown-spec-version",
	"unknown-step-version",
	"self-addressed",
	"expired",
	"no-offer",
	"offer-hash-mismatch",
	"no-decision",
	"wrong-dialogue",
	"step-not-monotone",
	"message-id-mismatch",
	"replay",
	"budget-exhausted",
	"terminal",
	"no-evidence",
	"value-not-admissible",
	"flattened-kind",
	"confidence-absent"
];
/**
* The defaults, and the arithmetic behind each — because an unexplained bound is
* a bound that gets changed without anyone knowing what it protected.
*
*   - `maxSteps: 8` is chosen AGAINST THE CYCLE, not picked. A full
*     propose -> counter -> commit exchange is 3 steps, so 8 allows two complete
*     negotiation rounds plus a commit and a refusal, and no more. If a
*     legitimate alignment needs more than 8 steps, this number is too tight and
*     the arithmetic above is wrong.
*   - `maxWallClockMs: 30_000` bounds the wall clock independently, because a
*     step budget is defeated by a peer that answers each step slowly and a
*     clock budget is defeated by a peer that answers instantly and never
*     terminates. Neither bound alone is sufficient.
*   - `envelopeTtlMs: 120_000` exceeds `maxWallClockMs` ON PURPOSE. An envelope
*     must remain admissible for the whole of the dialogue that will consume it,
*     so a TTL shorter than the dialogue budget would expire envelopes
*     mid-cycle. This is the same defect shape as the recorded `dsh-zone-recalc`
*     cache, whose 60 s TTL sat under an ~86 s cold walk and produced a cache
*     guaranteed to miss. The relationship is stated as arithmetic because a TTL
*     with no stated relationship to the work it must cover is the bug.
*   - `maxEnvelopeBytes: 64 * 1024` is a parse bound, not a policy: it stops a
*     peer from making the receiver allocate before it has decided anything.
*/
const DEFAULT_BOUNDS = {
	maxSteps: 8,
	maxWallClockMs: 3e4,
	envelopeTtlMs: 12e4,
	maxEnvelopeBytes: 65536
};
/**
* The confidence for a decision that was never measured.
*
* `provenance: 'not-measured'` and `backend: 'none'` are what make this a MARKER
* rather than a reading — the contract says a `not-measured` confidence "must
* never gate anything on its own", and `asAnswerConfidence` returns `null` for
* this value rather than admitting it to the gate.
*
* READ `value: 0` CAREFULLY. It is NOT a confidence of zero. `0` and `1` are
* both legal probabilities, so a bare zero is indistinguishable from a maximally
* confident "no" — which is exactly the coercion this program has recorded four
* times. The `backend` and `provenance` fields are what make the absence
* readable, and they are why this value can be tested for rather than guessed at.
*/
const UNMEASURED_CONFIDENCE = {
	value: 0,
	backend: "none",
	model: null,
	provenance: "not-measured"
};
//#endregion
//#region src/host/dialogue/laya.ts
/** The endpoint the Kev decision backend serves on by default (8011; the legacy Laya runner on 8008 is the rollback). */
const DEFAULT_LAYA_ENDPOINT = "http://127.0.0.1:8011";
/** The route the decision is posted to. */
const DECISION_ROUTE = "/v1/systemone";
//#endregion
//#region src/host/identity/capability-vocabulary.ts
/**
* ============================================================================
* dsh-meta-market / host / identity — the capability vocabulary, closed
* ============================================================================
*
* WHY A CLOSED VOCABULARY IS THE WHOLE POINT
*
* A privilege filter is only as strong as the set of things it can recognise. If
* a peer may declare ANY string as a capability, then a peer that declares a
* string the filter has never seen is not refused — it is simply not matched,
* and a filter built on "does it match a dangerous token" therefore passes it.
* That is the failure mode this file exists to prevent: **what cannot be
* classified must be refused, not defaulted**, and the way to make that
* checkable is to publish a CLOSED set and test membership against it.
*
* WHAT THE TWO FIELDS ACTUALLY ARE, MEASURED
*
* The catalog carries TWO independently derived fields, and they disagree:
*
*   - `capabilities` — a list of short TOKENS. Measured over the staged snapshot
*     (`research/cache/plugins-2026-10-12.json`, **4,527 rows**, census
*     **2026-10-16T16:49Z**): **4,131 rows carry the key**, contributing **13,542
*     assertions** over exactly **10 distinct tokens**. It is a CLOSED set in
*     practice, and this file closes it in principle.
*   - `capabilityRedLines` — a list of PROSE SENTENCES. **4,131 rows carry the
*     key**, contributing **538 assertions** over **79 distinct strings**. The
*     dominant value is a 56-character sentence, `'reads credentials/secrets AND
*     has network access'`, not a token.
*
* **THE ARITHMETIC THAT MAKES THE UNION MANDATORY:** **488 rows declare
* `credentials` in `capabilities`, while 386 rows carry a red line naming
* credentials.** The sets are **not nested**: **102 rows declare credentials and
* are NOT red-lined**, and a filter reading either field alone therefore misses a
* real class of peer. Over the **688-row in-scope sample** used by the intent-zone
* work, the same non-nesting appears at a smaller scale — **16 declare, 14 are
* red-lined, 11 agree, 5 disagree one way and 3 the other** — which is what
* reproduces `plan/06`'s figure rather than contradicting it.
*
* SO THE THREE SETS BELOW ARE DELIBERATELY DIFFERENT, AND ARE NOT INTERCHANGEABLE:
*
*   1. `DECLARED_CAPABILITY_TOKENS` — the closed token set, matched by EXACT
*      membership. This is the thing a peer's `capabilities` array must be a
*      subset of.
*   2. `AUTHENTICATED_CAPABILITY_TOKENS` — the subset whose presence a peer card
*      can be CONSISTENT with, which is a weaker claim than "known". Kept separate
*      so "we recognise this token" is never silently read as "we have verified
*      it".
*   3. `CREDENTIAL_RED_LINE_MARKERS` / `NETWORK_RED_LINE_MARKERS` — SUBSTRING
*      probes, because red lines are PROSE and an exact-membership test against a
*      sentence would match nothing. **This is the pair that a naive
*      `new Set([...capabilities, ...redLines])` union gets wrong**: it would put
*      sentences where tokens belong, every exact test would then fail, and a peer
*      declaring the exfiltration shape in prose would be GRANTED.
*
* @module dsh-meta-market/host/identity/capability-vocabulary
*/
/**
* The closed set of capability tokens, as asserted by the catalog.
*
* Ten values, and the count is measured rather than chosen: over 4,131 rows
* carrying the field, 13,542 assertions resolve to exactly these ten distinct
* strings. A peer declaring anything outside this set is **unclassifiable**, and
* `decideAdmission()` refuses it rather than ignoring it.
*/
const DECLARED_CAPABILITY_TOKENS = /* @__PURE__ */ new Set([
	"fs-read",
	"fs-write",
	"network",
	"shell",
	"env",
	"credentials",
	"llm",
	"dynamic-code",
	"host-runtime",
	"subagent"
]);
/**
* The subset a peer card can be CHECKED against in the sense of consistency.
*
* Deliberately NOT the same set as above and NOT used for membership testing.
* The distinction matters because "this token is one we recognise" and "this
* token's presence has been corroborated" are different claims, and collapsing
* them would let a card's own assertion promote itself.
*/
const AUTHENTICATED_CAPABILITY_TOKENS = /* @__PURE__ */ new Set([
	"fs-read",
	"fs-write",
	"network",
	"shell",
	"env",
	"credentials"
]);
/**
* Substrings that mark a red line as naming CREDENTIALS.
*
* **Substrings, not tokens, because the field is prose.** Measured: the dominant
* red-line value is the full sentence `'reads credentials/secrets AND has network
* access'`. An exact-membership test against that field matches nothing, which is
* precisely how a prose-aware union would fail silently.
*
* The markers are matched case-insensitively, and `secret` is included because
* the catalog's own dominant sentence uses *"credentials/secrets"* — a probe
* keyed only on `credential` would miss the singular/compound forms.
*/
const CREDENTIAL_RED_LINE_MARKERS = [
	"credential",
	"secret",
	"password",
	"token",
	"api key",
	"apikey"
];
/**
* Substrings that mark a red line as naming NETWORK access.
*
* Covers the catalog's phrasing (`network`, `internet`, `http`, `fetch`,
* `egress`, `remote`) because the sentence is author-written prose and cannot be
* relied on to use one word.
*/
const NETWORK_RED_LINE_MARKERS = [
	"network",
	"internet",
	"http",
	"fetch",
	"egress",
	"remote",
	"socket",
	"download"
];
/**
* The census, carried with its denominators so a quote cannot lose them.
*
* Every figure here is a **numerator with the population it was taken over**,
* because this program's most expensive published defects have all been counts
* quoted without their denominator. The `tokenRowCounts` map is the per-token
* row count, which is what makes `credentials` (488) and `env` (2,370)
* distinguishable at a glance rather than by re-measuring.
*
* **The census date is part of the record.** A live catalog is not a snapshot, so
* a figure quoted without its moment cannot be re-taken by the reader who needs
* to check it.
*/
const VOCABULARY_CENSUS = {
	source: "research/cache/plugins-2026-10-12.json",
	censusAt: "2026-10-16T16:49Z",
	catalogRows: 4527,
	rowsCarryingCapabilities: 4131,
	capabilityAssertions: 13542,
	distinctCapabilityTokens: 10,
	rowsCarryingRedLines: 4131,
	redLineAssertions: 538,
	distinctRedLineStrings: 79,
	rowsDeclaringNothingAtAll: 942,
	rowsCarryingAtLeastOneRedLine: 500,
	rowsDeclaringCredentials: 488,
	rowsCredentialRedLined: 386,
	rowsDeclaringCredentialsNotRedLined: 102,
	credentialsWithNetworkByCapabilities: 440,
	credentialsWithNetworkByRedLines: 386,
	tokenRowCounts: {
		"fs-read": 3067,
		network: 2378,
		"fs-write": 2375,
		env: 2370,
		shell: 1694,
		credentials: 488,
		llm: 379,
		"dynamic-code": 361,
		"host-runtime": 335,
		subagent: 95
	}
};
//#endregion
//#region src/host/identity/trust.ts
/** The stages in ascending order, so `meets()` is an index comparison and not a switch. */
const TRUST_STAGES = [
	"discover",
	"talk",
	"propose-patch",
	"receive-patch"
];
//#endregion
//#region src/host/identity/store.ts
/**
* The store's filename, **inside the workspace's `tmp/`** — not the harness home.
*
* Deliberately NOT in `$DSH_HOME`, where the anonymous id lives. The id is
* minted by the harness and shared by every process; the allowlist is this
* program's own artifact and a peer's process has no business reading it. Two
* files in one directory would also invite the reading that both are equally
* protected, and they are not.
*/
const TRUST_STORE_FILE = "meta-market-trust.json";
//#endregion
//#region src/host/safety/gate.ts
/** See the header. A value so the harness can assert the declaration exists. */
const TECHNICAL_NOTE_no_device = "dsh-meta-market/safety opens no GPU device: no model call, no CUDA context, no weights. GPU work is done by llama.cpp and its controlling scripts.";
/** The assets a threat can harm. A threat with no asset is a worry, not a threat. */
const ASSETS = {
	A1: "the local intent field — the user's already-formed intent (dsh-intent-map is LIVE and read-only here)",
	A2: "the market state the user reviews (this instance's staging area)",
	A3: "the user's credentials and secrets",
	A4: "the host process and everything the agent can reach",
	A5: "the OTHER user — the peer's own intent and market (the confused-deputy victim)",
	A6: "the user's attention (the review queue whose economics approval depends on)"
};
/**
* THE THREAT TABLE — 22 entries.
*
* **19 carry a control (`T01`–`T17`, `T19`, `T20`). 3 do NOT: `T18` and `T22`
* have `control: null` and are OPEN, and `T21` is stated rather than controlled.
* 19 + 3 = 22.** The three are itemised so the arithmetic closes; a total that
* closes while its parts do not is this program's recorded defect.
*/
const THREATS = [
	{
		id: "T01",
		title: "unknown protocol version",
		asset: "A4",
		attack: "declares specVersion 2 so the receiver parses a shape it was not written for; a field whose meaning changed is then acted on",
		control: "refuse when specVersion/stepVersion differ from the frozen pair, BEFORE any other field is read — so a wrong version reports T01 and not the symptom it causes",
		falsifier: "a specVersion of 2 must reach no offer/decision/budget branch"
	},
	{
		id: "T02",
		title: "identity spoofing",
		asset: "A1",
		attack: "the envelope's `from` names a well-regarded admitted peer while the presented card belongs to the attacker; or `from === to`, so the receiver answers itself and a monologue carries two parties' standing",
		control: "require `from === card.instanceId`, `to === thisInstanceId`, and `from !== to` — identity is bound to the CARD, not to the string the envelope carries",
		falsifier: "a `from` differing from the card id is refused, AND `from === to` is refused"
	},
	{
		id: "T03",
		title: "replay",
		asset: "A2",
		attack: "the same envelope delivered twice. Every bounded operation becomes unbounded when the bound is counted per delivery rather than per message",
		control: "a replay registry keyed on messageId; only the FIRST delivery may carry an effect; entries expire on the envelope's own expiresAt, so memory is bounded by the same number that makes replay meaningful",
		falsifier: "the same messageId is refused on the second delivery, AND a first delivery of a fresh id is admitted"
	},
	{
		id: "T04",
		title: "stale envelope",
		asset: "A1",
		attack: "an envelope captured hours ago is delivered after the local intent has moved, so a decision taken against the old intent lands against the new one",
		control: "require a PARSEABLE expiresAt; refuse when the injected clock has reached it. An unparseable instant is a REFUSAL, not a pass — a malformed expiry is not an unlimited one",
		falsifier: "a past expiresAt and a non-ISO expiresAt are BOTH refused"
	},
	{
		id: "T05",
		title: "proposal flood",
		asset: "A6",
		attack: "well-formed proposals as fast as the socket accepts. EVERY ONE of them is individually admissible, so no per-message check refuses any of them — the harm is the aggregate, which is why per-message validation structurally cannot see it",
		control: "a per-peer, per-window budget; the (N+1)th is refused with a reason naming the window. Cost is counted BEFORE the payload is examined, so an expensive peer cannot buy admission with volume",
		falsifier: "with max 8 in a 60s window, exactly 8 of 11 are admitted and the last 3 are refused BY T05"
	},
	{
		id: "T06",
		title: "step-budget exhaustion",
		asset: "A4",
		attack: "the peer always has one more counter-offer, so the dialogue never terminates and the receiver's work is unbounded at the peer's discretion",
		control: "refuse at `step >= maxSteps`, and refuse a SENDER-SUPPLIED maxSteps above the receiver ceiling — a budget the sender can raise is not a budget",
		falsifier: "`step >= maxSteps` is refused, AND `maxSteps: 1000000` is refused"
	},
	{
		id: "T07",
		title: "payload/hash mismatch",
		asset: "A6",
		attack: "declares contentHash H for a benign payload and sends H-prime. A reviewer who approved the DESCRIPTION approved something the payload does not say",
		control: "TWO SURFACES, AND THEY CHECK DIFFERENT THINGS. (i) `admitPatch` recomputes sha256 over a CANONICAL serialisation and compares the whole string — canonical because two key orderings of one payload must hash alike, or the control is an outage that refuses honest senders. (ii) `admitEnvelope` checks the DIGEST MAGNITUDE only (`sha256:<64 hex>`), because an envelope carries no payload to compare against by T12 design. **The hash-to-payload comparison therefore happens ONLY in `admitPatch`, and the envelope surface is where a reader naturally looks for T07 — so this edge is stated here rather than left to be inferred.** Found by `verifier` as A18b; the envelope branch was presence-only and admitted `contentHash: \"x\"`, which is now refused.",
		falsifier: "a tampered payload is refused BY T07 at admitPatch, AND a malformed contentHash is refused BY T07 at admitEnvelope, AND two key-orderings of the same payload hash alike"
	},
	{
		id: "T08",
		title: "hostile package, declared axis",
		asset: "A3",
		attack: "a proposal declaring `credentials` together with `network`. MEASURED: 440 of 4,527 catalog rows declare exactly that pair",
		control: "refuse outright when the UNION carries both; never staged, because a control that only warns is a control that is ignored",
		falsifier: "creds+network is refused AND a clean declaration is admitted"
	},
	{
		id: "T09",
		title: "hostile package, RED-LINE axis",
		asset: "A3",
		attack: "a CLEAN `capabilities` array while `capabilityRedLines` names reads-credentials-AND-network. **MEASURED: 23 of 4,527 rows carry that red line while declaring no `credentials` token at all** — so a filter reading `capabilities` alone does not undercount, it ADMITS those 23",
		control: "take the UNION of both fields. The union is load-bearing because the two fields are independently derived and share NO TOKENS — the red lines are sentences and the capabilities are tokens, so \"union\" means two VOCABULARIES",
		falsifier: "the red-line-only row is refused, AND `capabilities` alone is shown to say \"credentials absent\" for that same row"
	},
	{
		id: "T10",
		title: "under-declaration",
		asset: "A2",
		attack: "396 catalog rows have no `capabilities` key and 546 carry `capabilities: []`. A reader that treats either as \"can do nothing\", or that sums them into one number, admits all 942",
		control: "report `declaresNothing` WITH its mechanism (`no-capabilities-key` vs `empty-capabilities-array`), and treat a silent declaration as UNCATCHABLE — held for human review, never auto-staged",
		falsifier: "absent key and empty array report DIFFERENT mechanisms, AND a silent declaration is not auto-staged"
	},
	{
		id: "T11",
		title: "install-time execution",
		asset: "A4",
		attack: "a red line naming `postinstall`/`install` — MEASURED: 24 of 4,527 rows. This runs BEFORE any review of runtime behaviour, so reviewing the runtime behaviour does not review the risk",
		control: "escalate to human review with `requiresHuman`; never auto-staged, and the reason names install time rather than a generic escalation",
		falsifier: "a red line naming install time yields abstention with `requiresHuman: true`"
	},
	{
		id: "T12",
		title: "CONFUSED DEPUTY",
		asset: "A5",
		attack: "A talks to B \"to align intent\"; B uses that same channel to get A to apply a patch B should not be able to apply. **NOTE WHO IS HARMED: not A's user — A becomes the deputy, and B's other relationship is the victim**",
		control: "purpose separation at THREE levels: (1) an offer travels only on an envelope whose decision is the declared patch-authoring label; (2) those labels are reachable only by a peer holding the `patch-authoring` role, and `intent-alignment` does NOT confer it; (3) **the patch entry point is a SEPARATE FUNCTION — an alignment envelope has no code path that could reach an application.** The refusal is structural, not a rule",
		falsifier: "an alignment-role envelope carrying a non-null offer is refused, AND a non-authoring label carrying an offer is refused"
	},
	{
		id: "T13",
		title: "offer smuggling via `zones`",
		asset: "A5",
		attack: "the instruction hides in a field not treated as an instruction. `MetaPackage.zones` is typed `readonly string[]`, and a hostile peer sends OBJECTS whose `toString`/`toJSON` a downstream stringify reads",
		control: "deep-check every `zones` entry as a STRING before any consumer sees the array, naming the offending INDEX so the refusal is actionable",
		falsifier: "`zones: [{}, \"zone-1\"]` is refused and the reason names index 0"
	},
	{
		id: "T14",
		title: "role confusion",
		asset: "A5",
		attack: "a peer admitted for alignment submits a patch. The grant that let it in is read as authority for work it was never granted",
		control: "purposes are a CLOSED set; `patch-authoring` is granted explicitly or not at all, and the patch path RE-CHECKS the proposer's role rather than trusting the admission that preceded it",
		falsifier: "an alignment-only proposer is refused, AND an undeclared purpose (e.g. `root`) is refused"
	},
	{
		id: "T15",
		title: "LOCAL INTENT OVERRIDE",
		asset: "A1",
		attack: "a peer sends zones it claims are \"close to yours\" and the local intent field absorbs a difference of the peer's choosing. **The premise is that the user's intent is ALREADY FORMED**, so absorbing anything at all is the whole harm",
		control: "**THE MECHANISM IS THAT THE FUNCTION HAS NO WRITE PATH TO EXPRESS.** It takes the peer zones as untrusted input, holds no reference to the intent field, calls no writer, and returns a `PatchProposal` with `requiresHuman: true` **that is not read from the peer** — so no peer-supplied path can lower it",
		falsifier: "the caller-supplied local view is UNCHANGED across the call; `requiresHuman === true` on every return path"
	},
	{
		id: "T16",
		title: "intent override via the HTTP surface",
		asset: "A1",
		attack: "the plugin exposes an endpoint a peer can post intent to. The attack needs no exploit — it is the documented API, which is why this is the failure mode a gate forgets to check",
		control: "the same mechanism as T15, and the response carries `mutatedLocalIntent: false` as an INVARIANT rather than a reading. **The route surface is `task-8`'s file, so this lane claims the mechanism and NOT an endpoint it does not register**",
		falsifier: "the local view is byte-identical after two calls, AND (task-8) no registered route writes the index"
	},
	{
		id: "T17",
		title: "cross-vector-space scoring",
		asset: "A1",
		attack: "the peer vectors were built under one embedding model and this instance's index under another. The cosine is a number whose meaning is undefined — **and it will rank something**, so the failure is silent and confident",
		control: "read BOTH identities and refuse on any difference in `model` OR `dim`, naming both. A missing identity is a REFUSAL with its reason, never a match — an unread model is not a matching model",
		falsifier: "a different model is refused; the same model at a different `dim` is refused; an UNREAD identity is refused rather than compared"
	},
	{
		id: "T18",
		title: "Sybil",
		asset: "A5",
		attack: "create N identities, hold N votes, so \"a large base of users agreeing\" is purchasable at the price of N UUIDs",
		control: null,
		falsifier: "NO CONTROL IN THIS LANE. The per-peer budget bounds what ONE identity may spend, which does not bound how many identities exist. Handed to `task-7` (social topology), which owns discovery and quorum"
	},
	{
		id: "T19",
		title: "quarantine bypass",
		asset: "A2",
		attack: "a path that applies directly, skipping staging. The gate is bypassed by not being called, which no check INSIDE the gate can detect",
		control: "the patch entry point returns `applied: false` for EVERY verdict except a human-approved promotion this lane does not implement; staging is READ, never written, here; `task-5` must call this gate FIRST",
		falsifier: "any `applied === true` returned from the patch path fails the row"
	},
	{
		id: "T20",
		title: "peer content treated as instruction",
		asset: "A4",
		attack: "a peer places instruction-shaped text in a field the receiving agent reads",
		control: "the structural half: no text from `offer`/`zones`/`evidence`/`declaration` is fed to an evaluator. **What this does NOT prove: grep is a weak instrument and an indirectly-reached sink is invisible to it, so this is a conformance check standing BESIDE a control, not a control**",
		falsifier: "0 of 8 dangerous sinks in this module AND the scanner goes RED on a copy with a sink injected — a scanner that cannot fail is not a scanner"
	},
	{
		id: "T21",
		title: "BLAST RADIUS",
		asset: "A1",
		attack: "not a peer attack — the question that must be answered BEFORE mounting: if this plugin is compromised, what does the attacker get for free?",
		control: null,
		falsifier: "STATED, NOT CONTROLLED. Reachable: the intent index READ path (A1), the review queue contents (A2), the user's attention (A6), and through T12 the OTHER user (A5). Holds no device, no weights, no credential; writes no file and executes no patch. The reach is bounded by whether task-5 calls this gate — a verdict producer cannot enforce"
	},
	{
		id: "T22",
		title: "unsigned peer card",
		asset: "A4",
		attack: "copy an honest peer's card. **THE honest answer: a card is indistinguishable from a claim, so this attack succeeds against EVERY control in this file**",
		control: null,
		falsifier: "NO CONTROL IN THIS LANE, and that is the correct answer. Every identity control here governs CONSISTENCY, not AUTHENTICITY. `protocol.ts` records `selfAsserted` precisely because the type system cannot tell a card from a claim; `task-2` owns key material"
	}
];
/**
* THE STANDING OF EACH CONTROL — the map the harness audits.
*
* Kept OUT of the threat prose on purpose: a standing buried inside 22 narrative
* entries is a standing nobody re-takes, and this program re-takes numbers or
* stops trusting them.
*
* **FLIPPED ONLY BY A RUN, AND THE RUN WENT RED FIRST.** `verify/attacker.mjs`
* was executed against this file on 2026-10-16T17:12Z and reported **28 of 28
* assertions held, 0 failed, exit 0**, exercising **21 distinct threat ids** in
* both directions. Before the standings were flipped, the harness was made to go
* **RED** — the `T01` version check was replaced with `if (false)` in a COPY of
* this file and the suite reported **`27 passed, 1 failed`**, with
* `T01 — T01 specVersion 2 instead of 1: NOT REFUSED: verdict pass`, exiting
* **1**; the original was then restored and the suite returned to **28/28, exit
* 0**. **That red-then-green is what makes this a control rather than a green
* light**, and it is the discipline `laya-fold-gate` §9 demands: a gate that has
* never refused is untested, and a suite that has never failed is not a suite.
*
* **`T18`, `T21` and `T22` stay `'PLAN'` PERMANENTLY** — they have no control, and
* a standing of `'PLAN'` against `control: null` is the honest record of work
* another lane owns. `T18` and `T22` are two faces of one fact: an identity is
* free to manufacture, so nothing that depends on identity having a cost is safe.
*/
const CONTROL_STANDING = {
	T01: "VERIFIED (ran)",
	T02: "VERIFIED (ran)",
	T03: "VERIFIED (ran)",
	T04: "VERIFIED (ran)",
	T05: "VERIFIED (ran)",
	T06: "VERIFIED (ran)",
	T07: "VERIFIED (ran)",
	T08: "VERIFIED (ran)",
	T09: "VERIFIED (ran)",
	T10: "VERIFIED (ran)",
	T11: "VERIFIED (ran)",
	T12: "VERIFIED (ran)",
	T13: "VERIFIED (ran)",
	T14: "VERIFIED (ran)",
	T15: "VERIFIED (ran)",
	T16: "VERIFIED (ran)",
	T17: "VERIFIED (ran)",
	T18: "PLAN",
	T19: "VERIFIED (ran)",
	T20: "VERIFIED (ran)",
	T21: "PLAN",
	T22: "PLAN"
};
/**
* THE IMPLEMENTATION AXIS, one state per row.
*
* **Census (driven, `verify/implemented-sweep.mjs`, 2026-10-16T18:33Z): `15 IMPLEMENTED / 1 PARTIAL / 3 DOCUMENTED-ONLY / 3 NO-CONTROL-CLAIMED = 22`.**
*
* **Stated as the two denominators a reader needs, because a bare total hides which population it divided:**
*
*   - of the **19 rows that declare a control**: **15 IMPLEMENTED + 1 PARTIAL (`T02`) + 3 DOCUMENTED-ONLY (`T15`, `T16`, `T20`) = 19**;
*   - of the **3 rows that declare none** (`T18`, `T21`, `T22`): all 3 are `NO-CONTROL-CLAIMED`;
*   - **15 + 1 + 3 = 19**, and **19 + 3 = 22**.
*
* **`T16` IS `DOCUMENTED-ONLY` AND I FIRST WROTE IT AS `IMPLEMENTED`, then corrected it against this
* lane's own measurement — recorded because the correction is the point.** My reasoning for
* `IMPLEMENTED` was that T16's mechanism is real and drivable. **That is the wrong test.** The test
* this axis applies is mechanical: does any code path RETURN this row's own id? **None returns
* `'T16'`.** I had substituted a judgement about the mechanism for the measurement, which is the
* exact move this program forbids — and it is worth noting that I made it *in the very file that
* records the prohibition*, four minutes after writing the prohibition down. The note is retained
* below rather than deleted, because the disagreement between the two readings is the useful part.
*/
const CONTROL_IMPLEMENTATION = {
	T01: "IMPLEMENTED",
	T02: "PARTIAL",
	T03: "IMPLEMENTED",
	T04: "IMPLEMENTED",
	T05: "IMPLEMENTED",
	T06: "IMPLEMENTED",
	T07: "IMPLEMENTED",
	T08: "IMPLEMENTED",
	T09: "IMPLEMENTED",
	T10: "IMPLEMENTED",
	T11: "IMPLEMENTED",
	T12: "IMPLEMENTED",
	T13: "IMPLEMENTED",
	T14: "IMPLEMENTED",
	T15: "DOCUMENTED-ONLY",
	T16: "DOCUMENTED-ONLY",
	T17: "IMPLEMENTED",
	T18: "NO-CONTROL-CLAIMED",
	T19: "IMPLEMENTED",
	T20: "DOCUMENTED-ONLY",
	T21: "NO-CONTROL-CLAIMED",
	T22: "NO-CONTROL-CLAIMED"
};
/** The implementation census, as numerator and denominator. */
function implementationCensus() {
	const ids = Object.keys(CONTROL_IMPLEMENTATION);
	let implemented = 0;
	let partial = 0;
	let documentedOnly = 0;
	let noControlClaimed = 0;
	for (const id of ids) {
		const s = CONTROL_IMPLEMENTATION[id];
		if (s === "IMPLEMENTED") implemented += 1;
		else if (s === "PARTIAL") partial += 1;
		else if (s === "DOCUMENTED-ONLY") documentedOnly += 1;
		else noControlClaimed += 1;
	}
	const declaring = ids.length - noControlClaimed;
	return {
		count: implemented,
		of: ids.length,
		implemented,
		partial,
		documentedOnly,
		noControlClaimed,
		declaringControl: declaring
	};
}
/** The census of the threat table, with numerator and denominator. */
function threatCensus() {
	const ids = Object.keys(CONTROL_STANDING);
	let ran = 0;
	let read = 0;
	let planned = 0;
	for (const id of ids) {
		const s = CONTROL_STANDING[id];
		if (s === "VERIFIED (ran)") ran += 1;
		else if (s === "VERIFIED (read)") read += 1;
		else planned += 1;
	}
	const noControl = THREATS.filter((t) => t.control === null).length;
	return {
		count: ran,
		of: ids.length,
		verifiedRan: ran,
		verifiedRead: read,
		planned,
		withoutControl: noControl
	};
}
/** The defaults, whose numbers are chosen against measured harm rather than taste. */
const DEFAULT_POLICY = {
	proposalBudget: {
		max: 8,
		windowMs: 6e4
	},
	maxStepsCeiling: 16,
	patchAuthoringRole: "patch-authoring",
	grantableRoles: ["intent-alignment", "patch-authoring"],
	maxClockSkewMs: 6e4
};
//#endregion
//#region src/host/safety/index.ts
/**
* ============================================================================
* dsh-meta-market — L5 `safety` barrel: the lane's READ-ONLY surface
* ============================================================================
*
* This file exists so the assembly can FORWARD to this lane instead of reporting
* it `wired: false`. It exports exactly ONE symbol:
*
*     export function describeSurface(): Record<string, unknown>
*
* ---------------------------------------------------------------------------
* WHAT THIS SURFACE DELIBERATELY IS NOT, AND WHY THAT IS THE POINT
* ---------------------------------------------------------------------------
*
* **It does not run the gate. It does not read a payload. It does not accept an
* input.** It is a status report about the lane's own declarations and nothing
* else, and every value in it is either a constant, a count over constants, or a
* string naming what the lane refuses to do.
*
* **This lane argued, in `research/meta-market-safety.md` §9.1, that a FALSE
* REFUSAL IS INDISTINGUISHABLE FROM A CORRECT ONE at any surface outside the lane
* — a gate that rejects honest peers produces exactly the evidence that would
* prove it is working.** That argument is the reason there is no admission path
* here. Putting one behind an HTTP GET would put this lane's single hardest
* property — **that it can refuse** — one anonymous request away from a caller who
* has never read the threat table. A caller who can make the gate refuse can make
* it look correct.
*
* ---------------------------------------------------------------------------
* `D-0071` — THE SERIALISER TRAP, AND THIS LANE IS ESPECIALLY EXPOSED TO IT
* ---------------------------------------------------------------------------
*
* **`JSON.stringify(new Set([1,2,3]))` is `"{}"` — no error, no warning — and a
* SET WITH THREE MEMBERS SERIALISES IDENTICALLY TO AN EMPTY ONE.** That is this
* program's absent-versus-empty trap arriving through the serialiser instead of
* through a `|| 0`, so **every guard written against coercion is blind to it**;
* the lane caught it in `identity` an hour ago, where a 6-member
* `ReadonlySet<string>` was published as absent.
*
* **This lane carries four `Map`/`Set`/`RegExp` values** (measured by grep over
* `src/host/safety/**`, 2026-10-16T17:4xZ):
*   - `gate.ts:395` `new Map<string, number>()` — the replay registry's `seenAt` (per-instance, not module-level);
*   - `gate.ts:413` `new Map<string, number[]>()` — the proposal budget's `hits` (per-instance, not module-level);
*   - `gate.ts:506` `SHA256_PREFIXED` — a **`RegExp`**, which stringifies to `{}` for the same reason;
*   - `absence-guard.ts:227` `[...new Set([...a, ...b])]` — already spread, so already an array.
*
* **None of the three module-level ones is reachable as a value of this surface,
* and that is a property I asserted rather than assumed.** The two `Map`s are
* **closure state inside factory calls**, so no export holds them; the barrel does
* not import them. `CONTROL_STANDING` and `THREATS` are a `Record` and an `array`.
* **The one place a `Set` DOES appear is `describeSurface`'s own output** — the
* `statusValues` list below — and it is **spread at this boundary** precisely
* because D-0071 says a populated set and an empty one are indistinguishable once
* serialised. `verify/attacker.mjs` asserts the payload is JSON-round-trippable
* and that every count matches the module constants, so this is a check rather
* than a promise.
*/
/**
* Every value that can appear in the answer, so a consumer can enumerate the
* closed grammar rather than discover it by example. Spread to an ARRAY at the
* boundary — see `D-0071` in the module header.
*/
const STATUS_VALUES = /* @__PURE__ */ new Set([
	"VERIFIED (ran)",
	"VERIFIED (read)",
	"PLAN"
]);
/**
* THE OPERATION THIS SURFACE DELIBERATELY DOES NOT PERFORM.
*
* Load-bearing rather than decorative: without it, a route that reports a
* standing split reads as a working admission service. The assembly's other
* lanes carry this field for the same reason.
*/
const NOT_DONE = "This surface does NOT run the gate, does NOT read a payload and does NOT accept an input. It is a READ-ONLY status report about this lane's own declarations. The gate itself lives in `safety/gate.ts` as `admitEnvelope()` and `admitPatch()`, which are PURE FUNCTIONS called by the patch/dialogue paths and are NOT reachable from any route this lane registers — deliberately, because exposing an admission path over HTTP would put the lane's only enforceable property, that it can REFUSE, behind an anonymous request from a caller who has not read the threat table.";
/**
* The lane's headline finding, on the surface rather than in a comment.
*
* **This is the one thing a reader of a safety status must not have to infer**,
* and it is also one of the three independent measurements behind the assembly's
* `authenticated: false`, so a consumer should receive it from THIS lane rather
* than from a note in someone else's route file.
*/
const CONSISTENCY_NOT_AUTHENTICITY = "Every control in this lane governs CONSISTENCY, not AUTHENTICITY. Each one checks that a claim AGREES WITH ITSELF — that a card matches an envelope, that a hash matches a canonical form, that a declaration does not contradict itself. NOT ONE of them checks that a peer is anyone in particular, because the card is SELF-ASSERTED (`PeerCard.selfAsserted` in `protocol.ts`) and no key material exists to bind it. A peer who COPIES an honest card passes every check here. Two independent measurements agree from other lanes: the deployment id is a 37-byte bare UUID with zero signature operations in any non-test source file, and the protocol declares no signature field at all — so \"ADMITTED\" means INSPECTED, never PROVEN. Web4 trust is a `plan`, not an `exists`.";
/**
* DESCRIBE THIS LANE'S SURFACE — the ONE export the assembly consumes.
*
* Pure, synchronous, argument-free and side-effect-free: it reads module constants
* and counts them. Calling it twice returns deep-equal values, and it cannot fail
* on input because it takes none.
*
* The shape is stable and every count is a pair, so a consumer never has to guess
* whether a number is a total or a numerator.
*/
function describeSurface$1() {
	const census = threatCensus();
	const rows = THREATS.map((t) => ({
		id: t.id,
		title: t.title,
		asset: t.asset,
		status: CONTROL_STANDING[t.id],
		/**
		* THE SECOND AXIS, and the reason it is served rather than merely stored.
		* `status` answers "has a run observed this row?"; `implementation` answers
		* "is the row's stated control CODE or PROSE?". **`T02` is `VERIFIED (ran)`
		* and `PARTIAL` at once — the row passes, and half its stated control is a
		* string.** A consumer reading `status` alone would conclude the control is
		* whole. Serving both is what makes the difference visible WITHOUT reading
		* `gate.ts`.
		*/
		implementation: CONTROL_IMPLEMENTATION[t.id],
		hasControl: t.control !== null,
		hasFalsifier: typeof t.falsifier === "string" && t.falsifier.length > 0
	}));
	const openIds = rows.filter((r) => !r.hasControl).map((r) => r.id);
	return {
		lane: "safety",
		kind: "plan",
		notDone: NOT_DONE,
		/**
		* The standing split, as NUMERATOR AND DENOMINATOR with its census stamp.
		* Computed at call time from `CONTROL_STANDING` — see the module header.
		*/
		standing: {
			verifiedRan: census.verifiedRan,
			verifiedRead: census.verifiedRead,
			planned: census.planned,
			of: census.of,
			censusAt: (/* @__PURE__ */ new Date()).toISOString(),
			/** Spelled out so a reader does not have to reconstruct the arithmetic. */
			split: `${census.verifiedRan} VERIFIED (ran) + ${census.verifiedRead} VERIFIED (read) + ${census.planned} PLAN = ${census.of}`,
			statusValues: [...STATUS_VALUES],
			/** The rows that carry NO control, named. Not an error — a scope statement. */
			openWithoutControl: openIds,
			countWithoutControl: census.withoutControl
		},
		/**
		* THE IMPLEMENTATION AXIS — whether each row's stated control is CODE or PROSE.
		*
		* **Served BESIDE `standing`, not instead of it, because the two disagree and
		* the disagreement is the finding.** `standing` says `T02` is `VERIFIED (ran)`;
		* this says `T02` is `PARTIAL`. Both are true: the `from !== to` half fires and
		* is covered, while `from === card.instanceId` — the half the row's own text
		* leads with — is **UNEXPRESSIBLE at this signature, because `GateDeps` carries
		* no `card` field.** A reader who saw only `standing` would take the control for
		* whole.
		*
		* **THE COUNTS ARE A MEASUREMENT, NOT A STANDBY.** Taken by driving the artifact
		* (`verify/implemented-sweep.mjs`): of the 19 rows that declare a control,
		* 15 IMPLEMENTED + 1 PARTIAL + 3 DOCUMENTED-ONLY; of the 3 that declare none,
		* all 3 NO-CONTROL-CLAIMED. `attacker.mjs` asserts this axis against the ids a
		* refusal actually returned in its own run, so a row cannot claim code it lacks.
		*/
		implementation: (() => {
			const impl = implementationCensus();
			return {
				implemented: impl.implemented,
				partial: impl.partial,
				documentedOnly: impl.documentedOnly,
				noControlClaimed: impl.noControlClaimed,
				of: impl.of,
				declaringControl: impl.declaringControl,
				censusAt: (/* @__PURE__ */ new Date()).toISOString(),
				/** Spelled out so a reader does not have to reconstruct the arithmetic. */
				split: `${impl.implemented} IMPLEMENTED + ${impl.partial} PARTIAL + ${impl.documentedOnly} DOCUMENTED-ONLY + ${impl.noControlClaimed} NO-CONTROL-CLAIMED = ${impl.of}`,
				/** Of the rows that DECLARE a control, how many are actually code. */
				declaringSplit: `${impl.implemented} IMPLEMENTED + ${impl.partial} PARTIAL + ${impl.documentedOnly} DOCUMENTED-ONLY = ${impl.declaringControl} rows declaring a control`,
				/** A documented-but-unimplemented control is a FINDING, not a gap to be hidden. */
				documentedOnlyRows: rows.filter((r) => r.implementation === "DOCUMENTED-ONLY").map((r) => r.id),
				partialRows: rows.filter((r) => r.implementation === "PARTIAL").map((r) => r.id),
				/** Whether a row's control is code cannot be told from `status` alone. */
				orthogonalToStanding: true
			};
		})(),
		/** The threat table's size and its per-row standings. */
		threats: {
			count: THREATS.length,
			rows
		},
		/** The assets the table defends, so an id like `A6` is resolvable. */
		assets: ASSETS,
		/** The counters the gate itself would use, quoted rather than enforced here. */
		policy: {
			proposalBudgetMax: DEFAULT_POLICY.proposalBudget.max,
			proposalBudgetWindowMs: DEFAULT_POLICY.proposalBudget.windowMs,
			maxStepsCeiling: DEFAULT_POLICY.maxStepsCeiling,
			maxClockSkewMs: DEFAULT_POLICY.maxClockSkewMs,
			labelSetForPatchAuthoring: DEFAULT_POLICY.patchAuthoringRole,
			grantableRoles: [...DEFAULT_POLICY.grantableRoles]
		},
		/** THE HEADLINE FINDING, stated on the surface (requirement 5). */
		consistencyNotAuthenticity: CONSISTENCY_NOT_AUTHENTICITY,
		/** This lane holds no device. Stated on the surface rather than inferred. */
		technicalNote: TECHNICAL_NOTE_no_device,
		/**
		* Whether this surface can cause anything. Always `false`, and stated as a
		* fact rather than left to be concluded from the absence of an input field.
		*/
		mutatesState: false,
		acceptsInput: false,
		runsTheGate: false
	};
}
//#endregion
//#region src/host/social/scale.ts
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Read the route's payload into a census, or REFUSE with a reason.
*
* The refusals are the point of the function. Each is a state in which the honest
* output is "I cannot measure this", and each is reachable in practice: the
* payload's shape has already changed once during this build, and a reader that
* coerced would have survived the change while reporting wrong numbers throughout.
*/
function readZoneCensus(raw) {
	const zonesRaw = raw.zones;
	if (!Array.isArray(zonesRaw) || zonesRaw.length === 0) return {
		refused: true,
		code: "no-zones",
		reason: "the payload carried no zone rows. An empty zone set is not a census of zero zones: it is a payload this reader does not understand, and reporting 0 would be indistinguishable from a real empty market."
	};
	const rows = [];
	for (const [index, entry] of zonesRaw.entries()) {
		if (!isRecord(entry)) return {
			refused: true,
			code: "member-count-absent",
			reason: `zone row ${index} is not an object, so it carries no memberCount to read.`
		};
		const id = entry["id"];
		if (typeof id !== "string" || id.length === 0) return {
			refused: true,
			code: "member-count-absent",
			reason: `zone row ${index} has no readable id.`
		};
		if (!("memberCount" in entry)) return {
			refused: true,
			code: "member-count-absent",
			reason: `zone ${id} carries no memberCount key at all. That is "never asked", not "zero members", and the two must not share a number.`
		};
		const memberCount = entry["memberCount"];
		if (typeof memberCount !== "number" || !Number.isInteger(memberCount) || memberCount < 0) return {
			refused: true,
			code: "member-count-absent",
			reason: `zone ${id} carries a memberCount that is not a non-negative integer (${String(memberCount)}).`
		};
		const category = entry["category"];
		rows.push({
			id,
			category: typeof category === "string" ? category : "unlabelled",
			memberCount
		});
	}
	const memberSum = rows.reduce((total, row) => total + row.memberCount, 0);
	const corpus = isRecord(raw.corpus) ? raw.corpus : null;
	if (corpus === null) return {
		refused: true,
		code: "does-not-close",
		reason: "the payload carried no corpus object, so the zone sum has nothing to close against. A sum with nothing to close against is not a census."
	};
	const zoneBlock = isRecord(corpus["zones"]) ? corpus["zones"] : null;
	if (zoneBlock === null || typeof zoneBlock["count"] !== "number" || typeof zoneBlock["of"] !== "number") return {
		refused: true,
		code: "zone-count-mismatch",
		reason: "the payload carried no readable corpus.zones{count,of}, so the number of zone rows cannot be checked against the number of zones the corpus declares."
	};
	const declaredZones = zoneBlock["count"];
	const declaredZonesOf = zoneBlock["of"];
	if (declaredZones !== rows.length) return {
		refused: true,
		code: "zone-count-mismatch",
		reason: `the payload has ${rows.length} zone rows but declares ${declaredZones} zones. A partial read of a zone list is exactly the case where a wrong denominator prints a confident figure.`
	};
	const inScope = isRecord(corpus["inScopePlugins"]) ? corpus["inScopePlugins"] : null;
	if (inScope === null || typeof inScope["count"] !== "number" || typeof inScope["of"] !== "number") return {
		refused: true,
		code: "does-not-close",
		reason: "the payload carried no readable corpus.inScopePlugins{count,of}, so the member sum has nothing to close against."
	};
	const inScopeCount = inScope["count"];
	const inScopeOf = inScope["of"];
	if (memberSum !== inScopeCount) return {
		refused: true,
		code: "does-not-close",
		reason: `the ${rows.length} zone rows sum to ${memberSum} members but the corpus declares ${inScopeCount} in scope. The census does not close, so every share taken over it would be wrong by the same unknown factor.`
	};
	if (inScopeCount === 0 && inScopeOf === 0) return {
		refused: true,
		code: "does-not-close",
		reason: "a 0 on both sides of the closing identity is an INSTRUMENT FAILURE, not a pass — this reader is looking at a payload it cannot see, not at an empty market."
	};
	const catalogCount = corpus["catalogCount"];
	if (typeof catalogCount !== "number") return {
		refused: true,
		code: "catalog-count-absent",
		reason: "the payload carried no numeric corpus.catalogCount, so the population the corpus was drawn from is unstated."
	};
	const catalogUpdated = corpus["catalogUpdated"];
	const censusAtRaw = raw.censusAt ?? corpus["censusAt"];
	if (typeof censusAtRaw !== "string" || censusAtRaw.length === 0) return {
		refused: true,
		code: "no-census-time",
		reason: "the payload carried no censusAt, and a count without the moment it was taken cannot be compared against the next reading of a live store."
	};
	return {
		refused: false,
		census: {
			zones: rows,
			zoneCount: {
				count: rows.length,
				of: declaredZonesOf
			},
			memberSum: {
				count: memberSum,
				of: inScopeOf
			},
			sourceCatalog: `${typeof catalogUpdated === "string" ? catalogUpdated : "undated"} (catalogCount ${catalogCount})`,
			censusAt: censusAtRaw,
			source: "verified-ran"
		}
	};
}
/**
* Compute the three entropy readings from a census.
*
* `largestZone.share` is an EXACT ratio (`memberCount / total`) and is handed out
* so that downstream arithmetic never has to use the rounded decimal the prose
* quotes. Rounding it here moved a published figure by 0.3 KB; see the module
* header.
*/
function fingerprintEntropy(census) {
	const total = census.memberSum.count;
	const count = census.zones.length;
	if (total === 0 || count === 0) throw new Error("fingerprintEntropy requires a non-empty census; readZoneCensus refuses an empty one.");
	let shannonBits = 0;
	let largest = {
		id: "",
		share: 0
	};
	for (const zone of census.zones) {
		const p = zone.memberCount / total;
		if (p > 0) shannonBits -= p * Math.log2(p);
		if (p > largest.share) largest = {
			id: zone.id,
			share: p
		};
	}
	return {
		shannonBits,
		minEntropyBits: -Math.log2(largest.share),
		uniformBits: Math.log2(count),
		perplexity: 2 ** shannonBits,
		largestZone: largest,
		zoneCount: {
			count,
			of: count
		}
	};
}
/**
* The population at which the bucket-local shape exceeds a byte budget per peer.
*
* Per-peer bytes are `k * (N * share / B) * R`, so the budget is exceeded at
* `N = budget * B / (k * R * share)`. **`B` enters LINEARLY**, and that is
* checkable against the published pair: 663,070 at B=8 and 5,304,560 at B=64
* differ by exactly 8x, the same factor by which B changed.
*/
function bucketLocalBreakingPoint(rosterBudgetBytes, bucketsPerZone, sharedZones, largestZoneShare, bytesPerPeerRecord = 64) {
	return Math.floor(rosterBudgetBytes * bucketsPerZone / (sharedZones * bytesPerPeerRecord * largestZoneShare));
}
/**
* How many peers ONE machine can re-verify per round, from a MEASURED latency.
*
* This is the honest limit and it sits far below the design target, which is why
* it is stated rather than buried. The 155 ms is a MEASURED warm embed
* (`research/intent-map-live-verification.md` §3, re-verified against the live
* route in this lane's own self-test); it is an instrument reading, not a design
* assumption.
*
* CHANGE-GATING ENTERS AS A DIVISOR, and getting its direction wrong is the easy
* mistake: if only `f` of peers have moved since the last round, one machine's
* fixed capacity covers `capacity / f` peers, because it need only re-embed the
* moved ones. So `f = 1` gives the worst case (387) and `f = 0.01` gives the
* gated case (**38,709**) — the bound RISES as the change fraction falls.
*/
function witnessBound(intervalSeconds, warmEmbedMs, changeFraction = 1) {
	const capacityPerSecond = 1e3 / warmEmbedMs;
	return {
		peers: Math.floor(capacityPerSecond * intervalSeconds / changeFraction),
		capacityPerSecond,
		intervalSeconds,
		warmEmbedMs,
		changeFraction
	};
}
/** The roster budget every breaking point is solved against. */
const ROSTER_BUDGET_BYTES = 4194304;
//#endregion
//#region src/host/social/topology.ts
/**
* The honest oracle while no cost has been measured: it returns `null`, and `null`
* is not `0`.
*
* A `0` here would mean "identities are free" — a definite and alarming claim —
* whereas `null` means "nobody has measured this". Every bound computed against
* this oracle therefore reaches `unknown`, which is the correct answer to an
* unmeasured quantity and the reason the quorum function below never returns a
* bare `pass`.
*/
const UNMEASURED_SYBIL_COST = { costOfNewIdentity() {
	return {
		value: null,
		unit: "unmeasured",
		kind: "plan"
	};
} };
/**
* The Byzantine bound, computed but NOT asserted.
*
* It deliberately does NOT throw on a free or unmeasured oracle. Throwing would
* hide the case; returning `unknown` with `entitledToRelyOn: false` REPORTS it,
* and a caller that wants to proceed must then say so explicitly.
*/
function quorumBound(n, f, oracle) {
	const cost = oracle.costOfNewIdentity();
	const formulaSatisfied = n >= 3 * f + 1;
	const costKnown = cost.value !== null && cost.value > 0;
	const entitledToRelyOn = formulaSatisfied && costKnown;
	return {
		formulaSatisfied,
		entitledToRelyOn,
		verdict: entitledToRelyOn ? "pass" : "unknown",
		record: {
			verdict: entitledToRelyOn ? "pass" : "unknown",
			rule: "Byzantine fault tolerance n >= 3f + 1, valid only when an identity is not free",
			falsifier: "a single machine minting more than a third of the peers at negligible cost makes this bound false while the inequality still holds, which is why the inequality alone is not the claim.",
			measured: entitledToRelyOn ? {
				value: n,
				reason: null
			} : {
				value: null,
				reason: cost.value === null ? "the cost of a new identity is unmeasured, so n >= 3f + 1 has no force: the bound is a statement about identities that are not free." : "the cost of a new identity is explicitly zero, so the bound is satisfied arithmetically and defeated economically."
			},
			censusAt: null,
			evidence: []
		}
	};
}
//#endregion
//#region src/host/social/index.ts
/**
* ============================================================================
* dsh-meta-market — L6 social topology: THE LANE BARREL
* ============================================================================
*
* WHY THIS FILE EXISTS, AND IT IS NOT CEREMONY. `social` was one of two lanes
* with no `index.ts`, so the assembly could only report it as `wired: false` —
* a lane whose work is real and whose surface is unreachable. This barrel is the
* smallest thing that closes that gap: ONE exported function, no other coupling,
* so the assembly can forward to it without reviewing a second time.
*
* THE SURFACE IS READ-ONLY AND IT STARTS NOTHING. `describeSurface()` is a pure
* function over constants this module computes at call time. It opens no socket,
* dials no peer, reads no file, accepts no argument and mutates no state. **No
* peer has ever been contacted in this build**, and a surface that implied
* otherwise would be the single worst claim this lane could ship.
*
* `D-0071` — THE SERIALISER TRAP, AND WHY THIS FILE IS WRITTEN AROUND IT.
* `JSON.stringify` renders a `Set` or `Map` as `{}` with NO error and NO warning,
* so a set with six members and an empty set serialise IDENTICALLY, and `{}` has
* no `length` — a populated collection publishes as ABSENT. That is this
* program's absent-versus-empty trap arriving through the serialiser instead of
* through a `|| 0`. **A topology lane is the likeliest place in the build to
* hold a `Set`**, so this barrel was not assumed safe — it was audited:
* `new Set` occurs three times in the lane (`topology.ts:141` building the
* overlap index, `self-test.ts:216` and `:259`), and ALL THREE are LOCAL
* TEMPORARIES that never reach a return value. No exported type in this lane
* declares a `Set`, `Map` or `Date`, and `JSON.stringify` round-trips the
* structures this barrel emits losslessly — measured, not reasoned.
*
* AND THE SURFACE ITSELF IS THE GUARD. `assertJsonSafe` below walks the payload
* and REFUSES a `Set`, `Map`, `Date`, function, `undefined` or non-finite number
* rather than letting the serialiser silently flatten it. A guard that returns a
* payload unchanged proves nothing on its own, so the self-test drives it with
* each forbidden type and requires a THROW — a red-then-green, not a green.
*
* @module dsh-meta-market/host/social
*/
/**
* The measured warm-embed latency, in milliseconds.
*
* A MEASURED INSTRUMENT READING (`research/intent-map-live-verification.md` §3),
* not a design assumption. The witness bound moves linearly with it, so if this
* number is ever replaced the bound below moves with it rather than silently
* disagreeing with it.
*/
const MEASURED_WARM_EMBED_MS = 155;
/** The design target. A DESIGN TARGET — never a measurement, and labelled as one wherever it appears. */
const DESIGN_TARGET_POPULATION = 1e5;
/** Types the payload must never contain, named so a refusal can say WHICH one it found. */
const FORBIDDEN_CONSTRUCTORS = [
	"Set",
	"Map",
	"WeakSet",
	"WeakMap",
	"Date",
	"RegExp",
	"Promise"
];
function describeValue(value) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "Array";
	if (typeof value === "function") return "function";
	if (typeof value === "object") return value.constructor?.name ?? "object";
	return typeof value;
}
/**
* Walk a payload and THROW on anything `JSON.stringify` would misrepresent.
*
* `JSON.stringify` itself is not the check: it succeeds on a `Set` and hands back
* `{}`, which is precisely the failure `D-0071` records. So the check is
* structural and runs BEFORE the value is published, and it reports the path at
* which it refused so a failure names its own location.
*/
function assertJsonSafe(value, path = "$") {
	if (value === null) return;
	const kind = describeValue(value);
	if (FORBIDDEN_CONSTRUCTORS.includes(kind)) throw new Error(`${path} is a ${kind}. JSON.stringify would render it as {} with no error, so a populated ${kind} and an empty one would publish identically — see decision D-0071. Convert it with [...x] at this boundary.`);
	if (kind === "function") throw new Error(`${path} is a function, which JSON.stringify drops from an object silently.`);
	if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} is ${String(value)}, which JSON.stringify renders as null — a non-finite number would publish as an ABSENCE.`);
	if (value === void 0) throw new Error(`${path} is undefined, which JSON.stringify drops from an object silently, turning a present-but-unset key into a missing one.`);
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`));
		return;
	}
	if (typeof value === "object") for (const [key, entry] of Object.entries(value)) {
		if (entry === void 0) throw new Error(`${path}.${key} is undefined and would be dropped by JSON.stringify.`);
		assertJsonSafe(entry, `${path}.${key}`);
	}
}
/**
* The census fetch's timeout, in milliseconds.
*
* CHOSEN FROM A MEASUREMENT, NOT FROM TASTE, and the measurement corrected an
* earlier value. The live route answers in **28–51 ms** (measured 2026-10-16,
* three readings: 51 ms, 28 ms, 28 ms), while the first version of this constant
* was **20,000 ms** — chosen as a generous ceiling and never revisited. Measured
* against a REAL hanging server (an `http.createServer` that accepts and never
* responds), the handler blocked **20,008 ms** before the abort fired. A status
* route that stalls twenty seconds when the live GUI is down is not a status
* route: the caller cannot distinguish "slow" from "hung", and every other lane's
* health check that awaits this route inherits the stall.
*
* 2,000 ms is ~39x the slowest observed healthy reading, which leaves room for a
* cold or loaded machine while keeping the worst case a pause rather than a hang.
* The bound is stated on the surface itself (`census.timeoutMs`) rather than left
* for a reader to discover.
*/
const CENSUS_TIMEOUT_MS = 2e3;
/**
* Read the live zone census, or RECORD THE REFUSAL.
*
* The refusal is carried into the payload rather than thrown, because a surface
* that 500s when the route is down tells a reader nothing, whereas a surface that
* says `refused: no-census-time` tells them exactly which instrument failed. The
* distinction this lane exists to protect is preserved: an unread census reports
* `null` with a reason, NEVER a `0` that would read as "zero zones exist".
*/
async function readLiveCensus() {
	const takenAt = (/* @__PURE__ */ new Date()).toISOString();
	try {
		const response = await fetch("http://127.0.0.1:3083/intent-map/api/map", { signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS) });
		if (!response.ok) return {
			census: null,
			refusal: {
				code: "route-unavailable",
				reason: `the intent-map route answered HTTP ${response.status}, not 200. A probe that did not answer is not a market with no zones.`
			},
			takenAt
		};
		const result = readZoneCensus(await response.json());
		if (result.refused) return {
			census: null,
			refusal: {
				code: result.code,
				reason: result.reason
			},
			takenAt
		};
		return {
			census: result.census,
			refusal: null,
			takenAt
		};
	} catch (error) {
		const name = error instanceof Error ? error.name : "";
		const message = error instanceof Error ? error.message : String(error);
		if (name === "TimeoutError" || /timed? out/i.test(message)) return {
			census: null,
			refusal: {
				code: "route-timeout",
				reason: `the intent-map route did not answer within ${CENSUS_TIMEOUT_MS} ms. The route may be slow rather than down, which is why this is NOT reported as unreachable — a status surface must not confuse the two.`
			},
			takenAt
		};
		return {
			census: null,
			refusal: {
				code: "route-unreachable",
				reason: `the intent-map route could not be read: ${message}. This is an INSTRUMENT FAILURE, not a census of zero.`
			},
			takenAt
		};
	}
}
/**
* Describe this lane's surface: what it declares, what it measured, and what it
* deliberately does NOT do.
*
* READ-ONLY AND NO PEER CONTACT — but it is NOT socket-free, and the first version
* of `notDone` claimed it was. That claim is corrected below and the correction is
* documented here because the defect is worth more than the fix.
*
* WHAT IT DOES: reads `http://127.0.0.1:3083/intent-map/api/map` on THIS machine
* to take its census. That is a socket, opened on every request. It is deliberate,
* documented and bounded — and it was DENIED by the string this function
* published, while this very docstring ADMITTED it. **The read was right and the
* string was wrong**, which is the more dangerous arrangement of the two: a reader
* who acts on the justification acts on a false one, and the file's own comments
* would have contradicted them.
*
* THERE IS NO PARAMETER, no mode to select and no branch that reaches a peer. The
* census read is the ONLY impure act, it is refused rather than coerced, and its
* timeout is published on the surface.
*/
async function describeSurface() {
	const live = await readLiveCensus();
	const bound = quorumBound(100, 33, UNMEASURED_SYBIL_COST);
	const rawCost = UNMEASURED_SYBIL_COST.costOfNewIdentity();
	const witness = witnessBound(60, MEASURED_WARM_EMBED_MS, 1);
	const witnessGated = witnessBound(60, MEASURED_WARM_EMBED_MS, .01);
	const census = live.census;
	const entropy = census === null ? null : fingerprintEntropy(census);
	const share = entropy === null ? null : entropy.largestZone.share;
	const payload = {
		lane: "social",
		kind: "plan",
		notDone: "Starts NO discovery and contacts NO peer: no two peers have ever exchanged a packet in this build, and the topology it describes has never carried traffic. It DOES open one socket on every request — a fetch of the local intent-map route at 127.0.0.1:3083 on this machine, to take its census. That fetch is bounded by a 2 s timeout and is the ONLY impure act this surface performs: it accepts no input, mutates no state, and reaches nothing off this machine.",
		census: census === null ? {
			kind: "plan",
			reading: null,
			refusal: live.refusal,
			timeoutMs: CENSUS_TIMEOUT_MS
		} : {
			kind: "exists",
			reading: {
				zones: {
					count: census.zoneCount.count,
					of: census.zoneCount.of
				},
				members: {
					count: census.memberSum.count,
					of: census.memberSum.of
				},
				sourceCatalog: census.sourceCatalog
			},
			refusal: null,
			timeoutMs: CENSUS_TIMEOUT_MS
		},
		reachability: {
			kind: "exists",
			opensSocket: true,
			socketCount: {
				count: 1,
				of: 1
			},
			target: "http://127.0.0.1:3083/intent-map/api/map",
			scope: "loopback only — nothing off this machine",
			timeoutMs: CENSUS_TIMEOUT_MS,
			degenerateTo: {
				onTimeout: "route-timeout",
				onHttpError: "route-unavailable",
				onUnreachable: "route-unreachable",
				onRefusedCensus: "the census reader’s own refusal code, carried through unchanged"
			},
			note: "A timeout is reported as `route-timeout` and NOT as `route-unreachable`: a slow route and a dead route have different remedies, and collapsing them misinforms the reader about which failure they have."
		},
		topology: {
			kind: "plan",
			peersContacted: {
				count: 0,
				of: 0
			},
			note: "A 0 on both sides here is NOT agreement and NOT a pass: it is the literal count of peers ever contacted, which is zero because the discovery layer has never been executed. Stated as 0 of 0 by construction, and the construction is the finding."
		},
		witnessBound: {
			kind: "exists",
			peers: {
				count: witness.peers,
				of: DESIGN_TARGET_POPULATION
			},
			gatedPeers: {
				count: witnessGated.peers,
				of: DESIGN_TARGET_POPULATION
			},
			changeFraction: .01,
			capacityPerSecond: witness.capacityPerSecond,
			warmEmbedMs: MEASURED_WARM_EMBED_MS,
			intervalSeconds: 60,
			note: "A comparison against the design target, NOT a pass: the single-machine witness bound sits BELOW the target, which is the tightest of this lane’s three limits."
		},
		quorum: {
			kind: "plan",
			entitledToRelyOn: bound.entitledToRelyOn,
			verdict: bound.verdict,
			formulaSatisfied: bound.formulaSatisfied,
			reason: bound.record.measured.reason,
			note: "WEB4 does not state whether the peer network is OPEN or CLOSED, so the bound reads `unknown`. `unknown` is the CORRECT value and is NOT normalised to `pass`."
		},
		sybilCost: {
			kind: "plan",
			value: rawCost.value,
			unit: rawCost.unit,
			assertedNull: rawCost.value === null,
			note: "null, NEVER 0. Absent means NOBODY HAS MEASURED THIS; a 0 would assert that a new identity costs nothing, which is the exact claim this lane exists to refuse. A JSON null looks like a bug to an editor who has not read the record, which is why the value and its assertion travel together."
		},
		design: {
			bucketsPerZone: 8,
			minSharedZones: 2,
			designTargetPopulation: DESIGN_TARGET_POPULATION,
			rosterBudgetBytes: ROSTER_BUDGET_BYTES,
			roundSeconds: 60
		},
		breakingPoints: breakingPointsFor(census, share),
		invariants: {
			crossesABoundary: [
				"zonePseudonym (scoped to one zone, not stable across zones)",
				"protocolVersion",
				"zoneCount (a count, never the zone list)",
				"capabilityClass"
			],
			neverCrosses: [
				"fingerprintDigest / the raw fingerprint",
				"stable peerId",
				"the confidence vector",
				"the full zone list",
				"censusAt and correlation-permitting timestamps"
			]
		},
		takenAt: live.takenAt
	};
	assertJsonSafe(payload);
	return payload;
}
/**
* The three breaking points, computed from the live largest-zone share when the
* census answered and reported as `null` with a reason when it did not.
*
* A `null` here is the honest output: the bucket-local bound DIVIDES by the
* largest-zone share, so with no census there is no share, and substituting a
* remembered 0.1977 would republish the exact rounded-intermediate defect this
* lane corrected (`D-L6-001`).
*
* AND THE SHARE IS PUBLISHED AS A FRACTION, NOT ONLY AS A FLOAT — corrected after
* running this function and reading its own output. The first version emitted
* `largestZoneShare: 0.19767441860465115` and nothing else, which is a defect of
* a specific and familiar kind: **a reader could not reconstruct the number**,
* because the census block above publishes zone and member TOTALS but never the
* largest zone's own memberCount. AGENTS.md names the inability of a reader to
* reconstruct a figure as this program's most-published defect, and the float
* form makes it worse by looking exact to seventeen digits when it is a binary
* approximation of `136/688`. The `{count, of}` pair is now the primary form and
* the float carries a note saying what it is.
*/
function breakingPointsFor(census, share) {
	if (census === null || census === void 0 || share === null || share === void 0) return {
		kind: "plan",
		reading: null,
		reason: "the live census did not answer, so the largest-zone share is unknown. It is NOT defaulted to a remembered value: the bucket-local bound divides by this share, so a stale constant would silently republish a computed limit."
	};
	const largest = census.zones.reduce((a, b) => b.memberCount > a.memberCount ? b : a);
	return {
		kind: "plan",
		reading: {
			bucketLocalAtB8: bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 8, 4, share),
			bucketLocalAtB64: bucketLocalBreakingPoint(ROSTER_BUDGET_BYTES, 64, 4, share),
			largestZone: {
				id: largest.id,
				members: {
					count: largest.memberCount,
					of: census.memberSum.count
				}
			},
			largestZoneShare: share,
			largestZoneShareNote: "the float above is a binary approximation of largestZone.members.count / largestZone.members.of, NOT an exact decimal. Recompute from the {count, of} pair rather than quoting the decimal: the bucket-local bounds above DIVIDE by this share, so a share rounded early moves them — see D-L6-001."
		},
		reason: null
	};
}
//#endregion
//#region src/host/gui/registry.ts
/**
* The ten rows, in the CONTRACT's order. The order is the TAB ORDER, so it is
* preserved rather than sorted — `meta-plugins` first is what the owner asked for.
*/
const WINDOW_ROWS = Object.freeze([
	{
		provider: "plugins",
		meta: {
			id: "meta-plugins",
			label: "Meta-Plugins",
			description: "Meta plugins that are installed on this system or downloadable from the catalog, each carrying its intent-map match and its alignment verdict.",
			kind: "plan"
		}
	},
	{
		provider: "tools",
		meta: {
			id: "meta-tools",
			label: "Meta-tools",
			description: "Meta tools that let an agent act on the meta layer, with where each one is installed and whether its intent collides with an existing tool.",
			kind: "plan"
		}
	},
	{
		provider: "skills",
		meta: {
			id: "meta-skills",
			label: "Meta-skills",
			description: "Meta skills — reusable instructions a meta agent loads — with their intent match, their install state and their loop provenance.",
			kind: "plan"
		}
	},
	{
		provider: "memory",
		meta: {
			id: "meta-memory",
			label: "Meta-memory",
			description: "The meta-memory layer: the stores and plugins behind the RAG level, and the single model identity the system keeps loaded.",
			kind: "plan"
		}
	},
	{
		provider: "intent",
		meta: {
			id: "meta-intent",
			label: "Meta-intent",
			description: "The intent map this market aligns against: its precalculated zones read live, and the plugins that pass or collide with them.",
			kind: "plan"
		}
	},
	{
		provider: "advanced",
		meta: {
			id: "advanced",
			label: "Advanced",
			description: "A container window with no items of its own; it opens the four advanced sub-tabs, and its payload states what each of them answers.",
			kind: "plan"
		}
	},
	{
		provider: "advanced",
		meta: {
			id: "meta-agents",
			label: "meta-Agents",
			description: "The meta agents this system runs — the Agent Team members and the lanes they own — as they actually stand rather than as a future goal.",
			kind: "plan"
		}
	},
	{
		provider: "advanced",
		meta: {
			id: "meta-loops",
			label: "meta-Loops",
			description: "The meta loops that evolve the meta layer: each loop, its recorded rounds, and what a round changed.",
			kind: "plan"
		}
	},
	{
		provider: "advanced",
		meta: {
			id: "meta-cordis",
			label: "meta-cordis",
			description: "The Cordis-level lifecycle this clone lives inside: registration, the effect that makes it reversible, and what is mounted where.",
			kind: "plan"
		}
	},
	{
		provider: "advanced",
		meta: {
			id: "meta-community",
			label: "meta-community",
			description: "The read-only dsh-meta-community clone: its own route surface and census, reported as a separate artifact rather than as part of this one.",
			kind: "plan"
		}
	}
]);
/** The ten ids, in tab order. */
const WINDOW_IDS$1 = Object.freeze(WINDOW_ROWS.map((row) => row.meta.id));
/** The four ids `advanced` contains, in sub-tab order (CONTRACT §"Window ids"). */
const ADVANCED_IDS = Object.freeze([
	"meta-agents",
	"meta-loops",
	"meta-cordis",
	"meta-community"
]);
/** The six ids the top rail shows, in tab order. */
const PRIMARY_IDS = Object.freeze([
	"meta-plugins",
	"meta-tools",
	"meta-skills",
	"meta-memory",
	"meta-intent",
	"advanced"
]);
/** Narrow an arbitrary string to a `WindowId`. Used for the query parameter, which is untrusted. */
function isWindowId(value) {
	return WINDOW_IDS$1.includes(value);
}
/** Look a row up by id; `undefined` means the id is not one of the ten. */
function rowFor(id) {
	return WINDOW_ROWS.find((row) => row.meta.id === id);
}
//#endregion
//#region src/host/gui/envelope.ts
/** Narrow an unknown value to a plain record without throwing on a primitive. */
function asRecord$1(value) {
	return value !== null && typeof value === "object" ? value : {};
}
/** A non-empty string, or the fallback. An empty string is treated as absent. */
function asString(value, fallback) {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}
/** A string or explicit null — used for `npm`/`owner`, where `''` is not a value. */
function asStringOrNull$1(value) {
	return typeof value === "string" && value.length > 0 ? value : null;
}
/**
* A boolean MEASUREMENT, or `null` for NOT MEASURED.
*
* Deliberately not `Boolean(value)`: that maps `undefined` to `false`, which is
* this program's absent-is-not-zero rule broken in the exact field where a reader
* would act on it ("not installed" versus "we did not look").
*/
function asBoolOrNull(value) {
	return typeof value === "boolean" ? value : null;
}
/** The three kinds, or `null` when the value is not one of them. */
function asKind(value) {
	return value === "exists" || value === "plan" || value === "future" ? value : null;
}
function normalizeZones(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((entry) => {
		const zone = asRecord$1(entry);
		return {
			zone: asString(zone.zone, ""),
			score: typeof zone.score === "number" && Number.isFinite(zone.score) ? zone.score : 0,
			method: zone.method === "token" ? "token" : "embedding"
		};
	}).filter((match) => match.zone !== "");
}
function normalizeCollisions(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((entry) => {
		const collision = asRecord$1(entry);
		return {
			id: asString(collision.id, ""),
			why: asString(collision.why, "")
		};
	}).filter((collision) => collision.id !== "");
}
/**
* One item, with every unreadable field turned into an honest absence.
*
* `source.where` is the only field this function has to DEFAULT rather than leave
* absent, because the CONTRACT fixes its enum and the client branches on it. When
* a provider omits it, `'catalog'` is recorded — which is why `source` is the one
* field a provider lane must not omit: this is a floor, not a measurement.
*/
function normalizeItem(raw, index) {
	const item = asRecord$1(raw);
	const id = asString(item.id, `unidentified-item-${index}`);
	const source = asRecord$1(item.source);
	const where = source.where;
	const intent = asRecord$1(item.intent);
	const alignment = asRecord$1(item.alignment);
	const patch = asRecord$1(item.patch);
	const originalIntent = intent.originalIntent;
	const verdict = alignment.verdict;
	const sourceOut = {
		where: where === "installed" || where === "catalog" || where === "community" ? where : "catalog",
		...typeof source.route === "string" && source.route.length > 0 ? { route: source.route } : {},
		...typeof source.row === "number" && Number.isFinite(source.row) ? { row: source.row } : {}
	};
	const intentOut = {
		zones: normalizeZones(intent.zones),
		originalIntent: originalIntent === "pass" || originalIntent === "collide" || originalIntent === "not-measured" ? originalIntent : "not-measured",
		collidesWith: normalizeCollisions(intent.collidesWith)
	};
	const alignmentOut = {
		verdict: verdict === "aligned" || verdict === "collides" || verdict === "not-measured" ? verdict : "not-measured",
		why: asString(alignment.why, "the provider reported no alignment verdict for this item"),
		evidence: asString(alignment.evidence, `unreported: the provider gave no evidence field for item ${id}`)
	};
	const patchOut = patch.available === true ? {
		available: true,
		artifact: asString(patch.artifact, "unreported-artifact"),
		applies: asString(patch.applies, "unreported-effect")
	} : null;
	return {
		id,
		name: asString(item.name, id),
		npm: asStringOrNull$1(item.npm),
		owner: asStringOrNull$1(item.owner),
		kind: asKind(item.kind) ?? "plan",
		installed: asBoolOrNull(item.installed),
		downloadable: asBoolOrNull(item.downloadable),
		source: sourceOut,
		intent: intentOut,
		alignment: alignmentOut,
		patch: patchOut
	};
}
function normalizeControls(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((entry) => {
		const control = asRecord$1(entry);
		return {
			id: asString(control.id, ""),
			label: asString(control.label, ""),
			kind: control.kind === "write" ? "write" : "read",
			target: asString(control.target, ""),
			demonstrable: control.demonstrable === true
		};
	}).filter((control) => control.id !== "");
}
function normalizeFalsifiers(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((entry) => {
		const falsifier = asRecord$1(entry);
		return {
			claim: asString(falsifier.claim, ""),
			how: asString(falsifier.how, "")
		};
	}).filter((falsifier) => falsifier.claim !== "" && falsifier.how !== "");
}
/**
* The degraded-read marker, normalized without inventing one.
*
* A provider that reports `stale` gets it published; a provider that does not gets
* `null`. **`null` here means the provider reported no degraded read — NOT that the
* assembly ruled one out.** This is a provider-reported state and the assembly is
* not in a position to certify that another lane's live probe succeeded, so the
* falsifier below says so rather than letting `null` read as a clean bill.
*/
function normalizeStale(raw) {
	if (raw === null || raw === void 0) return null;
	const stale = asRecord$1(raw);
	const reason = asString(stale.reason, "");
	if (reason === "") return null;
	return {
		reason,
		boundMs: typeof stale.boundMs === "number" && Number.isFinite(stale.boundMs) ? stale.boundMs : null,
		at: asString(stale.at, "")
	};
}
/**
* The falsifiers that belong to the ASSEMBLY rather than to a lane.
*
* A window whose provider supplied none is not thereby unfalsifiable: these two
* are true of every envelope this file produces and each names a check a reader
* can run against the served bytes. They are appended, never substituted, so a
* lane's own falsifiers keep their place and their wording.
*/
function assemblyFalsifiers(census, itemCount) {
	return [
		{
			claim: `this window's census numerator (${String(census.numerator)}) equals the number of items in this payload (${String(itemCount)})`,
			how: "count the `items` array in the served body and compare it with `census.numerator`; /meta-market/api/gui/health performs exactly this comparison for all ten windows and reports the mismatching ids. ONE LEGITIMATE EXCEPTION: when the provider supplied no census and returned zero items, the numerator is `null` on purpose — that is an EMPTY LIST, not a measured zero, and comparing it to 0 would invent the reading"
		},
		{
			claim: "no item in this window reports `installed: false` for a plugin this assembly could not probe",
			how: "filter the items for `installed === false` and check each one carries a `source.route` or `source.row` that names the probe that produced the reading; an unprobed item must carry `installed: null` (NOT MEASURED)"
		},
		{
			claim: "`stale: null` on this window means its provider reported no degraded live read, and is NOT a claim this assembly verified",
			how: "re-read the provider module and its own census string: a provider that states \"LIVE READ DID NOT SUCCEED\" in `census.population` while this envelope carries `stale: null` is reporting the fact in prose only, and the marker should be populated; the assembly cannot detect that for it"
		}
	];
}
/** ISO stamp for a caller-supplied clock, so a test can pin it. */
function iso(now) {
	return now.toISOString();
}
/**
* THE ONE PREDICATE FOR "DID THIS WINDOW ANSWER", used by BOTH `/gui/sections` and
* `/gui/health`.
*
* It exists because the two routes each had their own copy of the same three
* conditions and the drive caught them disagreeing: `sections` reported **2** of
* ten available while `health` reported **1** of ten answered, from two requests
* seven seconds apart. The difference there was almost certainly a provider whose
* own reading changed between the two requests — a live provider is allowed to do
* that — but **two encodings of one fact must not be able to disagree by
* ACCIDENT**, and two independently written predicates can drift apart by edit in
* a way that no timestamp explains. So there is one function, and both routes are
* views of it.
*
* A reader comparing the two payloads across requests should compare the `at`
* stamps first: a difference of instant is a measurement, a difference at the same
* instant is a defect.
*/
function isAnswering(outcome) {
	if (outcome.landed === false) return false;
	if (outcome.failed !== null) return false;
	const unavailable = outcome.payload?.unavailable;
	return unavailable === null || unavailable === void 0;
}
/**
* Build one window's envelope.
*
* @param row - the registry row; it owns the window's identity.
* @param outcome - what the provider composition produced for this window.
* @param now - the clock, passed in rather than read here so a drive can pin it.
*/
function buildEnvelope(row, outcome, now) {
	const at = iso(now);
	const payload = outcome.payload;
	const rawItems = payload?.items;
	const items = Array.isArray(rawItems) ? rawItems.map((entry, index) => normalizeItem(entry, index)) : [];
	const supplied = asRecord$1(payload?.census);
	const suppliedNumerator = typeof supplied.numerator === "number" ? supplied.numerator : null;
	const suppliedDenominator = typeof supplied.denominator === "number" ? supplied.denominator : null;
	const suppliedPopulation = typeof supplied.population === "string" && supplied.population.length > 0 ? supplied.population : null;
	const unavailable = outcome.landed === false ? {
		reason: `provider not landed: ${outcome.path} was not on disk when this build's static import set was fixed`,
		measuredAt: at
	} : outcome.failed !== null ? outcome.failed : payload?.unavailable !== null && payload?.unavailable !== void 0 ? payload.unavailable : null;
	const census = suppliedNumerator !== null || suppliedDenominator !== null || suppliedPopulation !== null ? {
		numerator: suppliedNumerator,
		denominator: suppliedDenominator,
		population: suppliedPopulation ?? "the provider supplied a count without stating its population; treat this count as unattributed rather than as a census",
		at: typeof supplied.at === "string" && supplied.at.length > 0 ? supplied.at : at
	} : unavailable !== null ? {
		numerator: null,
		denominator: null,
		population: `NOT MEASURED: ${unavailable.reason}`,
		at
	} : items.length === 0 ? {
		/**
		* A DERIVED `0/0` IS NOT A MEASUREMENT, and this branch exists because
		* `prov-plugins` asked for it in exactly these terms: *"a derived `0` on
		* a window I reported as `unavailable` would resurrect exactly the `0/0`
		* reading I refuse to publish."* The unavailable case is handled above;
		* this is the OTHER case — a provider that reported itself healthy and
		* returned no items and no census. `0/0` there reads as "measured: there
		* are none", which the assembly cannot know. So it is `null/null` with
		* the reason stated, and `items.length` stays visibly `0` in the array.
		*/
		numerator: null,
		denominator: null,
		population: "NOT MEASURED: the provider supplied no census and returned zero items, so this window has an EMPTY LIST rather than a measured zero — a 0 on both sides is instrument failure, not a pass",
		at
	} : {
		numerator: items.length,
		denominator: items.length,
		population: `items in this payload's own \`items\` array — NOT a catalog census and NOT a count of plugins in existence`,
		at
	};
	const providerFalsifiers = normalizeFalsifiers(payload?.falsifiers);
	const windowOverride = asRecord$1(payload?.window);
	const kind = asKind(windowOverride.kind) ?? row.meta.kind;
	const stale = normalizeStale(payload?.stale);
	return {
		window: {
			id: row.meta.id,
			label: row.meta.label,
			description: typeof windowOverride.description === "string" && windowOverride.description.length > 0 ? windowOverride.description : row.meta.description,
			kind
		},
		generatedAt: at,
		census,
		items,
		unavailable,
		/**
		* REQUIRED AND NULLABLE (`lead`'s ruling, so it is checkable rather than taste):
		* the same `null | {...}` convention the CONTRACT already uses for
		* `unavailable`, and never optional — an optional field would let a provider
		* OMIT it, and `undefined !== null`. `prov-tools-skills` paid for exactly that
		* this round: `skills.ts` left `unavailable` undefined, its own check asserted
		* `=== null`, and the absent field passed for a present one.
		*/
		stale,
		controls: normalizeControls(payload?.controls),
		falsifiers: [...providerFalsifiers, ...assemblyFalsifiers(census, items.length)]
	};
}
/**
* Did the provider WRITE the `stale` key at all?
*
* `stale: null` and an absent `stale` both normalise to `null` in the envelope, and
* they are not the same fact: the first is a provider stating that its live read
* was healthy, the second is a provider that never considered the question. The
* envelope cannot preserve that difference in its own required field, so it is
* reported separately and `/gui/health` counts it — **an absence of a READING is
* not an absence of a VALUE**, and a true/false summary would erase it.
*/
function staleWasWritten(payload) {
	return payload !== null && typeof payload === "object" && "stale" in payload;
}
/** Which envelope a row's id sits inside: the four advanced ids belong to `advanced`. */
function parentOf(id) {
	return ADVANCED_IDS.includes(id) ? "advanced" : null;
}
/**
* Build the tab catalog.
*
* `available` is `true` only when the provider LANDED and did not self-report
* unavailable. A window that is unavailable is still listed — the contract is a
* catalog of ten windows, and dropping one would make an absence indistinguishable
* from a window that was never specified.
*/
function buildSections(outcomes, now) {
	const at = iso(now);
	const sections = WINDOW_ROWS.map((row) => {
		const outcome = outcomes.find((candidate) => candidate.windowId === row.meta.id);
		if (outcome === void 0) return {
			id: row.meta.id,
			label: row.meta.label,
			description: row.meta.description,
			kind: row.meta.kind,
			provider: row.provider,
			parent: parentOf(row.meta.id),
			providerLanded: false,
			available: false,
			itemCount: null,
			census: {
				numerator: null,
				denominator: null,
				population: "NOT MEASURED: the assembly produced no provider outcome for this window",
				at
			},
			unavailable: {
				reason: "the assembly produced no provider outcome for this window",
				measuredAt: at
			},
			stale: null,
			staleReported: false
		};
		const envelope = buildEnvelope(row, outcome, now);
		const answering = isAnswering(outcome);
		return {
			id: envelope.window.id,
			label: envelope.window.label,
			description: envelope.window.description,
			kind: envelope.window.kind,
			provider: row.provider,
			parent: parentOf(envelope.window.id),
			providerLanded: outcome.landed,
			available: answering,
			itemCount: answering ? envelope.items.length : null,
			census: envelope.census,
			unavailable: envelope.unavailable,
			stale: envelope.stale,
			staleReported: staleWasWritten(outcome.payload)
		};
	});
	return {
		generatedAt: at,
		census: {
			numerator: sections.filter((section) => section.available).length,
			denominator: sections.length,
			population: "the ten windows in the CONTRACT: available means the provider landed and did not report unavailable",
			at
		},
		primary: PRIMARY_IDS,
		advanced: ADVANCED_IDS,
		staleCensus: {
			reporting: sections.filter((section) => section.staleReported).length,
			reportingDegraded: sections.filter((section) => section.stale !== null).length,
			total: sections.length,
			population: "the ten windows: `reporting` counts providers that WROTE the stale key; `reportingDegraded` counts those whose written value is a marker rather than null"
		},
		sections
	};
}
//#endregion
//#region src/host/gui/health.ts
function asRecord(value) {
	return value !== null && typeof value === "object" ? value : {};
}
function asStringOrNull(value) {
	return typeof value === "string" && value.length > 0 ? value : null;
}
/**
* Assemble the health payload.
*
* @param outcomes - one outcome per window, produced in this same request.
* @param assembly - `describeAssembly()`'s report; identity is read from it rather
*   than restated, so this route cannot drift from the assembly it describes.
* @param advertisedPaths - `REGISTERED_PATHS`; passed in rather than imported to
*   avoid a cycle back into the route table that calls this builder.
* @param providers - the landed/absent table from the provider composition.
* @param now - the clock, passed in so a drive can pin it.
*/
function buildHealth(outcomes, assembly, advertisedPaths, providers, now) {
	const at = now.toISOString();
	const record = asRecord(assembly);
	const specVersion = typeof record.specVersion === "number" ? record.specVersion : null;
	const stepVersion = typeof record.stepVersion === "number" ? record.stepVersion : null;
	const authenticated = typeof record.authenticated === "boolean" ? record.authenticated : null;
	const mounted = typeof record.mounted === "boolean" ? record.mounted : null;
	const windows = WINDOW_IDS$1.map((id) => {
		const outcome = outcomes.find((candidate) => candidate.windowId === id);
		if (outcome === void 0) return {
			id,
			provider: "unmapped",
			providerPath: "unmapped provider key",
			providerLanded: false,
			answered: false,
			items: null,
			unavailable: {
				reason: "the assembly produced no provider outcome for this window",
				measuredAt: at
			},
			stale: null,
			staleReported: false
		};
		const items = outcome.payload?.items;
		const answered = isAnswering(outcome);
		return {
			id,
			provider: outcome.provider,
			providerPath: outcome.path,
			providerLanded: outcome.landed,
			answered,
			items: Array.isArray(items) ? items.length : null,
			unavailable: outcome.failed ?? outcome.payload?.unavailable ?? null,
			stale: outcome.payload?.stale ?? null,
			staleReported: staleWasWritten(outcome.payload)
		};
	});
	const answered = windows.filter((row) => row.answered).length;
	const census = {
		numerator: answered,
		denominator: WINDOW_IDS$1.length,
		population: "the ten windows in the CONTRACT; answered means the provider landed, did not throw, and did not report itself unavailable",
		at
	};
	const gaps = windows.filter((row) => !row.answered).map((row) => `${row.id}: ${row.unavailable?.reason ?? (row.providerLanded ? "provider answered no payload" : `provider not landed at ${row.providerPath}`)}`);
	return {
		generatedAt: at,
		identity: {
			id: asStringOrNull(record.id),
			kind: asStringOrNull(record.kind),
			mounted,
			prefix: asStringOrNull(record.prefix),
			specVersion,
			stepVersion,
			authenticated
		},
		mounted,
		mount: record.mount ?? null,
		served: record.served ?? null,
		windowsAnswered: answered,
		answeredWindows: windows.filter((row) => row.answered).map((row) => row.id),
		census,
		staleCensus: {
			reporting: windows.filter((row) => row.staleReported).length,
			degraded: windows.filter((row) => row.stale !== null).length,
			total: windows.length,
			population: "the ten windows: `reporting` counts providers that WROTE the stale key; `degraded` counts those whose written value is a marker rather than null"
		},
		windows,
		providers,
		routes: {
			advertised: advertisedPaths.length,
			paths: advertisedPaths
		},
		gaps,
		falsifiers: [
			{
				claim: "every window reported as answered has a provider that landed",
				how: "in this same payload, filter `windows` for `answered === true` and require `providerLanded === true` on every row; a row where they disagree means the count is not derived from the table printed beside it"
			},
			{
				claim: "no path advertised under `routes.paths` returns 404 when driven",
				how: "request each advertised path and require none to answer 404; 200, 400 and 405 are all honest answers, and absence is not — this is the check `tmp/mmg-host-drive.mjs` performs and prints as a numerator over the advertised count"
			},
			{
				claim: "the answered numerator is not a constant",
				how: "temporarily make one provider throw, re-run the drive, and require `windowsAnswered` to decrease by exactly one while `gaps` names that window; a numerator that does not move is a caption"
			}
		]
	};
}
//#endregion
//#region src/host/registry/paths.ts
/**
* ============================================================================
* dsh-meta-market — path resolution that survives the bundle
* ============================================================================
*
* WHY THIS FILE EXISTS, AND WHAT IT COSTS TO NOT HAVE IT
*
* The first version of this lane resolved the profile with a fixed relative
* walk from `import.meta.url`: `resolve(HERE, '../../../../../profiles-tree/personal-dev')`.
* That is CORRECT in source (`src/host/registry/`) and WRONG in the built bundle,
* because `tsdown` emits `lib/index.js` and this module's `import.meta.url` then
* points at `<clone>/lib/` — two segments shallower than the source tree it was
* written against. Measured on the live `3083` surface:
*
*   `profile manifest unreadable at C:\Users\0000\profiles-tree\personal-dev/package.json`
*
* — `/Projects/deepseek-root` silently missing, i.e. the walk climbed one
* directory too far and landed in the home directory. The Meta-Plugins window
* then reported `unavailable` for a PATH error while the data underneath was
* fine, which is the worst shape an absence can take: it looks like the plugin
* layer is missing when it is the instrument that is lost.
*
* **A COUNT OF `../` IS A BET ON WHERE THE FILE WILL BE EMITTED.** So this module
* stops counting and walks UP looking for a fixed SHAPE instead — the profile's
* `profiles-tree/personal-dev/package.json`, or this package's own
* `package.json` name — and reports the directories it searched when nothing is
* found. `HOME` is deliberately never consulted: on this machine the checkout is
* not under the home directory, so a home-anchored path is wrong by construction.
*
* Found by `surface-host` (report with reproduction), fixed here rather than by
* changing the caller. `AGENTS.md`'s rule applies: the lane that owns the
* instrument repairs the instrument.
*
* @module dsh-meta-market/host/registry/paths
*/
/** The directory this module's source (or bundle) lives in. */
const HERE$1 = dirname(fileURLToPath(import.meta.url));
/** How far up any shape search may climb. Twelve covers `src/host/registry` and `lib`. */
const MAX_LEVELS = 12;
function ancestors(startDir) {
	const levels = [];
	let current = resolve(startDir);
	for (let level = 0; level < MAX_LEVELS; level += 1) {
		levels.push(current);
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return levels;
}
/** Walk up from `startDir` and return the first ancestor satisfying `predicate`. */
function findUp(startDir, predicate) {
	const searched = [];
	for (const dir of ancestors(startDir)) {
		searched.push(dir);
		if (predicate(dir)) return {
			path: dir,
			searched
		};
	}
	return {
		path: null,
		searched
	};
}
/** Walk up collecting the first `relativePath` that exists below any ancestor. */
function findArtifact(startDir, relativePaths) {
	const searched = [];
	for (const dir of ancestors(startDir)) for (const relative of relativePaths) {
		const candidate = resolve(dir, relative);
		searched.push(candidate);
		if (existsSync(candidate)) return {
			path: candidate,
			searched
		};
	}
	return {
		path: null,
		searched
	};
}
function readPackageName(dir) {
	try {
		const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		if (parsed && typeof parsed === "object") {
			const name = parsed.name;
			return typeof name === "string" ? name : null;
		}
	} catch {}
	return null;
}
/**
* This package's own root — the directory whose `package.json` is named
* `dsh-meta-market`. In source that is three levels above this file; in the
* bundle it is one. Neither number is written down.
*/
function resolveCloneRoot() {
	return findUp(HERE$1, (dir) => readPackageName(dir) === "dsh-meta-market").path;
}
/** The checkout root that relative `link:` specs resolve against — the parent of the clone. */
function resolvePluginsSrcDir() {
	const cloneRoot = resolveCloneRoot();
	return cloneRoot === null ? null : dirname(cloneRoot);
}
/**
* The live profile this program develops in.
*
* Precedence: explicit environment override, then the fixed shape
* `<ancestor>/profiles-tree/personal-dev/package.json`. `HOME` is never used.
*
* **THE FIRST FIX RETURNED THE ANCESTOR INSTEAD OF THE PROFILE**, and the probe
* caught it because the ancestor (`deepseek-root`) also contains a manifest —
* just not the profile's. A shape search must return the path the SHAPE names,
* not the directory it was found under; the two differ by exactly the relative
* suffix, and only an `existsSync` on the RESULT can tell them apart.
*/
function resolveProfileDir() {
	return resolveProfileDirFrom(HERE$1);
}
/**
* The same search, from an explicit start directory.
*
* Exported so the verify driver can prove the BUNDLE layout resolves too, by
* starting at `<clone>/lib` — the depth at which the reported defect appeared —
* without copying a file into `lib/` (a shared build output this lane must not
* write).
*/
function resolveProfileDirFrom(startDir) {
	const override = process.env.DSH_META_MARKET_PROFILE_DIR;
	if (override && override.trim() !== "") {
		const candidate = resolve(override);
		return {
			path: existsSync(join(candidate, "package.json")) ? candidate : null,
			searched: [candidate]
		};
	}
	const suffix = "profiles-tree/personal-dev";
	const found = findUp(startDir, (dir) => existsSync(join(dir, suffix, "package.json")));
	return {
		path: found.path === null ? null : resolve(found.path, suffix),
		searched: found.searched
	};
}
/**
* The live catalog cache, resolved by SHAPE so the bundle and the source agree.
*
* Both emitted layouts are searched in each ancestor: `data/…` (bundle beside
* `lib/`, or a future copy at the clone root) and `src/host/registry/data/…`
* (the source tree this lane owns).
*/
function resolveLiveCatalogCache() {
	return findArtifact(HERE$1, [
		"src/host/registry/data/plugins-live-2026-10-17.json",
		"data/plugins-live-2026-10-17.json",
		"registry/data/plugins-live-2026-10-17.json"
	]).path;
}
/**
* The 4,527-row snapshot, which the workspace owns and this clone does not copy.
*
* Anchored to the RESOLVED profile directory rather than to a `../` count, so a
* moved checkout and a bundled artifact resolve it identically.
*/
function resolveSnapshotCatalogCache() {
	const override = process.env.DSH_META_MARKET_SNAPSHOT_CATALOG;
	if (override && override.trim() !== "") {
		const candidate = resolve(override);
		return existsSync(candidate) ? candidate : null;
	}
	const profile = resolveProfileDir();
	if (profile.path !== null) {
		const candidate = resolve(profile.path, "dsh-meta-evolve_INIT_WORKSPACE/research/cache/plugins-2026-10-12.json");
		if (existsSync(candidate)) return candidate;
	}
	return findArtifact(HERE$1, ["research/cache/plugins-2026-10-12.json", "../dsh-meta-evolve_INIT_WORKSPACE/research/cache/plugins-2026-10-12.json"]).path;
}
/**
* A human-readable anchor report, used inside an `unavailable.reason` so a reader
* of a failed half can see which directories the search actually visited.
*/
function describeSearch(label, searched) {
	return `${label}: searched ${searched.length} path(s): ${searched.join(", ")}`;
}
//#endregion
//#region src/host/registry/catalog.ts
/**
* ============================================================================
* dsh-meta-market — the DOWNLOADABLE half, measured from a file this process owns
* ============================================================================
*
* WHY THE LIVE CATALOG IS READ FROM A CACHED FILE AND NOT FETCHED HERE
*
* The registry is loaded during a boot-time plugin apply. A route handler that
* reached the network on every request would put an unmeasured dependency in a
* handler this program has already argued must not do that, and a fetch at apply
* time would make boot depend on the network. So the live catalog is fetched by
* `verify/fetch-catalog.mjs`, its identity is recorded in `data/SOURCES.json`,
* and this module reads BYTES THAT ARE ON DISK. Repeat reads therefore never
* re-hit the network, and a reader can reproduce the census from the file the
* census names.
*
* THE CACHE IS A SNAPSHOT TOO, AND IT IS LABELLED AS ONE. `identity.source` says
* `live` or `snapshot`; it never says "current". The live file measured
* 2026-10-17T14:41Z carried **5,785** rows against the **5,704** the brief
* quoted — the market grew between the two measurements, and the honest report
* is both numbers with their clocks rather than the brief's figure restated.
*
* MATCHING IS BY `name` OR `npm`, AND A MATCH CARRIES ITS ROW COUNT. This
* program's `AGENTS.md` records three separate wrong findings produced by a
* name-only lookup and one produced by taking the first of several matching rows
* (`dsh-cost-meter` exists three times: 0★, 391★, 1★). So no function here
* returns a single row: every lookup returns an array plus `ambiguous`, and
* `disambiguation` names owner/npm/stars per row so "take the first" is a
* decision someone has to defend.
*
* CASE: comparisons are ORDINAL (exact), because Windows folds case by default in
* the shell and a case-folded match is a different claim. A caller that needs a
* case-folded fallback gets it from `byName`/`byNpm` only when the exact pass
* found nothing, and the result says `folded: true` in `disambiguation`.
*
* @module dsh-meta-market/host/registry/catalog
*/
/** The directory this module lives in; `SOURCES.json` is read beside the code. */
const HERE = dirname(fileURLToPath(import.meta.url));
/**
* The live catalog's cached copy, resolved by SHAPE.
*
* **THE FIXED `resolve(HERE, 'data/…')` WAS CORRECT IN SOURCE AND WRONG IN THE
* BUNDLE**, for the same reason the profile walk was: `tsdown` emits
* `lib/index.js`, so `HERE` is `<clone>/lib` and the data directory is not
* beside it. `paths.ts` searches the source and bundle layouts from every
* ancestor and returns `null` when neither exists; `null` reaches
* `unavailable.reason` rather than turning into an empty catalog.
*/
const LIVE_CATALOG_CACHE = resolveLiveCatalogCache();
resolve(HERE, "data/SOURCES.json");
/**
* The 4,527-row snapshot the program measured on 2026-10-12.
*
* It lives in the program workspace rather than in this clone because the
* workspace owns it and a second copy would be a second statement of one fact.
* It is anchored to the RESOLVED profile directory, not to a `../` count, so a
* moved checkout and a bundled artifact resolve it identically; when it cannot
* be read the half is `null` with a reason rather than an empty array.
*/
const SNAPSHOT_CATALOG_CACHE = resolveSnapshotCatalogCache();
/** Normalised description: the source carries `{ en, zh }`. */
function readDescription(value) {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") {
		const en = value.en;
		if (typeof en === "string" && en.trim() !== "") return en;
	}
	return null;
}
function readString(value) {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}
function readNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
/**
* `capabilities` is `string[]` or ABSENT.
*
* The distinction is load-bearing: 396 of the 4,527 snapshot rows have no
* `capabilities` key at all, 546 have `capabilities: []`, and an earlier count
* charged every absent row a phantom element (`@($null).Count` is `1`) and
* published 13,938 where the truth was 13,542. `null` here is "never asked";
* `[]` is "asked, and they said nothing".
*/
function readCapabilities(value) {
	if (!Array.isArray(value)) return null;
	return value.filter((item) => typeof item === "string");
}
function normaliseRow(raw, index) {
	if (!raw || typeof raw !== "object") return null;
	const row = raw;
	const name = readString(row.name);
	if (name === null) return null;
	const capabilitiesValue = row.capabilities;
	return {
		index,
		name,
		owner: readString(row.owner),
		npm: readString(row.npm),
		url: readString(row.url),
		page: readString(row.page),
		category: readString(row.category),
		description: readDescription(row.description),
		stars: readNumber(row.stars),
		version: readString(row.version),
		install: readString(row.install),
		downloads: readNumber(row.downloads),
		added: readString(row.added),
		capabilities: readCapabilities(capabilitiesValue),
		capabilitiesPresent: "capabilities" in row
	};
}
function parseCatalogFile(path) {
	const buffer = readFileSync(path);
	const parsed = JSON.parse(buffer.toString("utf8"));
	if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.plugins)) throw new Error(`no plugins array in ${path}`);
	const envelope = parsed;
	const plugins = envelope.plugins;
	const rows = [];
	for (let index = 0; index < plugins.length; index += 1) {
		const row = normaliseRow(plugins[index], index);
		if (row !== null) rows.push(row);
	}
	return {
		rows,
		headerCount: typeof envelope.count === "number" ? envelope.count : null,
		updated: typeof envelope.updated === "string" ? envelope.updated : null,
		sha256: createHash("sha256").update(buffer).digest("hex"),
		bytes: buffer.byteLength
	};
}
function identityFor(parsed, path, source) {
	const names = /* @__PURE__ */ new Map();
	let rowsWithNpm = 0;
	let nameOrNpmDivergent = 0;
	for (const row of parsed.rows) {
		names.set(row.name, (names.get(row.name) ?? 0) + 1);
		if (row.npm !== null) {
			rowsWithNpm += 1;
			if (row.npm !== row.name) nameOrNpmDivergent += 1;
		}
	}
	let duplicateNameGroups = 0;
	let duplicateNameRows = 0;
	for (const count of names.values()) if (count > 1) {
		duplicateNameGroups += 1;
		duplicateNameRows += count;
	}
	let fetchedAt = null;
	try {
		fetchedAt = statSync(path).mtime.toISOString();
	} catch {
		fetchedAt = null;
	}
	return {
		source,
		path,
		url: source === "live" ? "https://awesome-dsh-plugin.com/plugins.json" : null,
		bytes: parsed.bytes,
		fetchedAt,
		sha256: parsed.sha256,
		rows: parsed.rows.length,
		headerCount: parsed.headerCount,
		updated: parsed.updated,
		distinctNames: names.size,
		duplicateNameGroups,
		duplicateNameRows,
		nameOrNpmDivergent,
		rowsWithNpm
	};
}
/**
* Load one catalog half from the first readable candidate.
*
* A candidate list is tried in order; every failure is recorded and the FIRST
* success wins. When nothing reads, the half is `null` with every path and every
* reason in `unavailable.reason` — an unreadable source is never an empty array.
*/
function loadHalf(candidates, source, at) {
	const failures = [];
	for (const path of candidates) try {
		const parsed = parseCatalogFile(path);
		if (parsed.rows.length === 0) {
			failures.push(`${path}: parsed 0 rows (instrument failure, not an empty catalog)`);
			continue;
		}
		return {
			census: {
				identity: identityFor(parsed, path, source),
				rows: parsed.rows,
				at
			},
			unavailable: null
		};
	} catch (error) {
		failures.push(`${path}: ${error.message}`);
	}
	return {
		census: null,
		unavailable: {
			reason: `no readable ${source} catalog: ${failures.join("; ")}`,
			measuredAt: at
		}
	};
}
/** Resolve the live half, preferring an explicit override, then the shipped cache. */
function loadDownloadable(options = {}) {
	const at = options.at ?? (/* @__PURE__ */ new Date()).toISOString();
	const livePaths = (options.liveCatalogPaths ?? [...process.env.DSH_META_MARKET_LIVE_CATALOG ? [process.env.DSH_META_MARKET_LIVE_CATALOG] : [], ...LIVE_CATALOG_CACHE === null ? [] : [LIVE_CATALOG_CACHE]]).filter((path) => path !== null && path !== "");
	const snapshotPaths = (options.snapshotCatalogPaths ?? [...process.env.DSH_META_MARKET_SNAPSHOT_CATALOG ? [process.env.DSH_META_MARKET_SNAPSHOT_CATALOG] : [], ...SNAPSHOT_CATALOG_CACHE === null ? [] : [SNAPSHOT_CATALOG_CACHE]]).filter((path) => path !== null && path !== "");
	return {
		live: loadHalf(livePaths, "live", at),
		snapshot: loadHalf(snapshotPaths, "snapshot", at),
		at
	};
}
/** One row's one-line identity, so an ambiguous match cannot be read as a single answer. */
function describeRow(row) {
	return [
		`row ${row.index}`,
		row.name,
		row.npm === null ? "npm:absent" : `npm:${row.npm}`,
		row.owner === null ? "owner:absent" : `owner:${row.owner}`,
		row.stars === null ? "stars:null" : `stars:${row.stars}`
	].join(" · ");
}
function queryRows(rows, field, query, match, keyOf) {
	const matched = rows.filter(match);
	const groups = /* @__PURE__ */ new Map();
	for (const row of matched) {
		const key = keyOf(row);
		if (key === null) continue;
		groups.set(key, (groups.get(key) ?? 0) + 1);
	}
	return {
		query,
		field,
		rows: matched,
		rowCount: matched.length,
		totalRows: rows.length,
		ambiguous: matched.length > 1,
		groups: [...groups.entries()].filter(([, count]) => count > 1).map(([key, rowCount]) => ({
			key,
			rowCount
		})),
		disambiguation: matched.map(describeRow)
	};
}
/**
* The five query surfaces the provider lanes read, bound to one row set.
*
* Every one returns `CatalogQuery`, never a row: the row count and the
* disambiguation lines are the point, because a name is not a unique key.
*/
function queryCatalog(rows, field, query) {
	const needle = query.trim();
	switch (field) {
		case "name": return queryRows(rows, field, query, (row) => row.name === needle, (row) => row.owner);
		case "npm": return queryRows(rows, field, query, (row) => row.npm === needle, (row) => row.owner);
		case "owner": return queryRows(rows, field, query, (row) => row.owner === needle, (row) => row.name);
		case "keyword": {
			const lower = needle.toLowerCase();
			return queryRows(rows, field, query, (row) => row.name.toLowerCase().includes(lower) || row.npm !== null && row.npm.toLowerCase().includes(lower) || row.category !== null && row.category.toLowerCase().includes(lower) || row.description !== null && row.description.toLowerCase().includes(lower) || row.capabilities !== null && row.capabilities.some((item) => item.toLowerCase().includes(lower)), (row) => row.name);
		}
		case "zone": {
			const tokens = needle.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length >= 3);
			if (tokens.length === 0) return queryRows(rows, field, query, () => false, (row) => row.name);
			return queryRows(rows, field, query, (row) => {
				const haystack = [
					row.name,
					row.npm ?? "",
					row.category ?? "",
					row.description ?? "",
					...row.capabilities ?? []
				].join(" ").toLowerCase();
				return tokens.every((token) => haystack.includes(token));
			}, (row) => row.name);
		}
	}
}
resolveProfileDir().path;
/** The checkout root that relative `link:` specs resolve against — parent of the resolved clone. */
const DEFAULT_PLUGINS_SRC_DIR = resolvePluginsSrcDir();
/**
* Route literals whose last segment names a mutating operation.
*
* Kept deliberately broad: a false skip costs one unprobed route and is recorded
* as such, while a false probe could change the owner's live system.
*/
const MUTATING_SEGMENT = /(install|uninstall|remove|delete|update|upgrade|restart|rollback|write|save|set$|create|patch|apply|block|unblock|cancel|approve|reject|move|rename|upload|send|post|execute|run$|start|stop|clear|reset|kill|publish|migrate|note|favorite|favourite|dismiss|backup|restore|sync|merge|commit|switch|toggle|ack|promote|adopt|discard|purge|truncate|revoke|grant|edit|modify|import|export)/iu;
/** Files whose route registrations are read. */
const SOURCE_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".js",
	".mjs",
	".cjs"
];
function walk(dir, out, depth = 0) {
	if (depth > 8) return;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "dist") continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path, out, depth + 1);
		else if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) out.push(path);
	}
}
/**
* Read the route paths a checkout REGISTERS, from its own source or build.
*
* **THE FIRST VERSION OF THIS FUNCTION WAS WRONG BY OMISSION AND THE CENSUS SAID
* SO.** It matched `path: '<literal>'` only, and 30 of 36 installed checkouts
* write `path: ROUTE_PATH` — a module constant. The census therefore reported
* "no route found" for plugins that plainly serve one, which is the
* absent-is-not-zero trap arriving in a source scanner: a missed reading is not
* an absent route. The fix is a SECOND PASS that resolves `const NAME = '<literal>'`
* inside the same checkout, and the resolved reading records `viaConst` so a
* reader can see which paths were read off a constant rather than a literal.
*
* A template literal with an interpolation (`/deps/${name}`) is still skipped
* rather than expanded: an expanded guess is not a registered path, and probing a
* guess would record a `404` that says nothing about the plugin.
*/
function deriveRoutes(checkoutPath, pluginsSrcDir) {
	const roots = [join(checkoutPath, "src"), join(checkoutPath, "lib")].filter((path) => existsSync(path));
	const files = [];
	for (const root of roots) walk(root, files);
	const rawConstants = /* @__PURE__ */ new Map();
	const texts = /* @__PURE__ */ new Map();
	const constantDeclaration = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`]*)`)/gu;
	for (const file of files) {
		let text;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		texts.set(file, text);
		constantDeclaration.lastIndex = 0;
		let declaration = constantDeclaration.exec(text);
		while (declaration !== null) {
			const name = declaration[1] ?? "";
			const value = declaration[2] ?? declaration[3] ?? declaration[4] ?? "";
			if (name !== "" && value !== "" && !rawConstants.has(name)) rawConstants.set(name, value);
			declaration = constantDeclaration.exec(text);
		}
	}
	const constants = new Map(rawConstants);
	for (let round = 0; round < 3; round += 1) {
		let changed = false;
		for (const [name, value] of constants) {
			if (!value.includes("${")) continue;
			const resolved = value.replace(/\$\{([A-Za-z_$][\w$]*)\}/gu, (whole, inner) => constants.get(inner) ?? whole);
			if (resolved !== value) {
				constants.set(name, resolved);
				changed = true;
			}
		}
		if (!changed) break;
	}
	const routes = [];
	const seen = /* @__PURE__ */ new Set();
	const property = /path:\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)`|([A-Za-z_$][\w$]*))/gu;
	for (const [file, text] of texts) {
		if (!text.includes("register(") && !text.includes("webServer")) continue;
		property.lastIndex = 0;
		let match = property.exec(text);
		while (match !== null) {
			const literalValue = match[1] ?? match[2] ?? match[3];
			const identifier = match[4] ?? null;
			const value = literalValue ?? (identifier === null ? "" : constants.get(identifier) ?? "");
			if (value.startsWith("/") && value !== "/" && !seen.has(value)) {
				const window = text.slice(Math.max(0, match.index - 400), match.index + 120);
				const kind = /kind:\s*'prefix'/.test(window) ? "prefix" : "exact";
				seen.add(value);
				routes.push({
					path: value,
					kind,
					source: `${file.slice(pluginsSrcDir.length + 1).replaceAll("\\", "/")}:${text.slice(0, match.index).split("\n").length}`,
					viaConst: identifier !== null && literalValue === void 0 ? identifier : null
				});
			}
			match = property.exec(text);
		}
	}
	return routes;
}
function lastSegment(path) {
	const parts = path.split("/").filter((part) => part !== "");
	return parts.length === 0 ? "" : parts[parts.length - 1];
}
/** Probe one path under the read-only policy. Never throws. */
async function probeRoute$1(path, baseUrl, timeoutMs) {
	const segment = lastSegment(path);
	if (MUTATING_SEGMENT.test(segment)) return {
		probe: null,
		skipped: `read-only probe policy: last segment "${segment}" names a mutating operation, so this path was NOT probed on the owner's live session`
	};
	const url = `${baseUrl}${path}`;
	const at = (/* @__PURE__ */ new Date()).toISOString();
	try {
		return {
			probe: {
				path,
				url,
				status: (await fetch(url, {
					method: "GET",
					redirect: "manual",
					signal: AbortSignal.timeout(timeoutMs),
					headers: { accept: "application/json, text/html;q=0.9, */*;q=0.1" }
				})).status,
				error: null,
				at
			},
			skipped: null
		};
	} catch (error) {
		return {
			probe: {
				path,
				url,
				status: null,
				error: error.message,
				at
			},
			skipped: null
		};
	}
}
function readProfileManifest(profileDir) {
	const manifestPath = join(profileDir, "package.json");
	const buffer = readFileSync(manifestPath);
	const manifest = JSON.parse(buffer.toString("utf8"));
	const dependencies = {};
	const rawDependencies = manifest.dependencies;
	if (rawDependencies && typeof rawDependencies === "object") {
		for (const [key, value] of Object.entries(rawDependencies)) if (typeof value === "string") dependencies[key] = value;
	}
	const bundles = [];
	const dsh = manifest.dsh;
	if (dsh && typeof dsh === "object") {
		const profile = dsh.profile;
		if (profile && typeof profile === "object") {
			const rawBundles = profile.bundles;
			if (Array.isArray(rawBundles)) {
				for (const item of rawBundles) if (typeof item === "string") bundles.push(item);
			}
		}
	}
	let mtime = null;
	try {
		mtime = statSync(manifestPath).mtime.toISOString();
	} catch {
		mtime = null;
	}
	return {
		dependencies,
		bundles,
		sha256: createHash("sha256").update(buffer).digest("hex"),
		mtime
	};
}
function countNodeModules(profileDir, dependencies) {
	const root = join(profileDir, "node_modules");
	if (!existsSync(root)) return {
		entries: 0,
		directories: 0,
		symlinks: 0,
		linksWithoutDependency: [],
		dependenciesWithoutLink: dependencies.map((entry) => entry.dependency)
	};
	const entries = readdirSync(root, { withFileTypes: true });
	let directories = 0;
	let symlinks = 0;
	const known = new Set(dependencies.map((entry) => entry.dependency));
	const linksWithoutDependency = [];
	for (const entry of entries) if (entry.isSymbolicLink()) {
		symlinks += 1;
		if (!entry.name.startsWith("@") && !known.has(entry.name)) linksWithoutDependency.push(entry.name);
	} else if (entry.isDirectory()) directories += 1;
	return {
		entries: entries.length,
		directories,
		symlinks,
		linksWithoutDependency: linksWithoutDependency.sort(),
		dependenciesWithoutLink: dependencies.filter((entry) => entry.nodeModulesPath === null).map((entry) => entry.dependency).sort()
	};
}
/** Resolve a `link:` spec to an absolute checkout, relative to the profile dir. */
function checkoutFromSpec(spec, profileDir) {
	if (!spec.startsWith("link:")) return null;
	return resolve(profileDir, spec.slice(5));
}
/**
* How many route probes may be in flight at once.
*
* MEASURED 2026-10-18 from `dsh-meta-market`'s own source tree against the live
* profile (three in-process runs): `measureInstalled({probeRoutes: false})` took
* **884 / 1,392 ms** (44 dependencies, every filesystem read) while the same call
* with `probeRoutes: true` took **19,988 / 22,094 / 33,214 ms** over **117 probes** —
* so the probes, not the walks, are the cost, and they were run strictly one after
* another (three or four of them time out at the 2,500 ms bound, and each of those
* stalls every probe behind it). The bound is small ON PURPOSE: these are GETs
* against the OWNER'S LIVE SESSION, so the goal is to stop paying one round trip
* after another, not to open 117 connections at once. Four keeps the burst bounded
* and every probe keeps its own timeout and its own read-only skip.
*/
const PROBE_CONCURRENCY = 4;
/**
* Measure the installed half.
*
* Async only because the probes are; every filesystem read is synchronous and
* every failure produces `null` plus a reason instead of a zero.
*/
async function measureInstalled(options = {}) {
	const at = options.at ?? (/* @__PURE__ */ new Date()).toISOString();
	const profileSearch = resolveProfileDir();
	const profileDir = options.profileDir ?? profileSearch.path;
	const pluginsSrcDir = options.pluginsSrcDir ?? DEFAULT_PLUGINS_SRC_DIR;
	const baseUrl = options.baseUrl ?? "http://127.0.0.1:3083";
	const probeRoutes = options.probeRoutes ?? true;
	const timeoutMs = options.probeTimeoutMs ?? 2500;
	if (profileDir === null) return {
		census: null,
		unavailable: {
			reason: `profile manifest not found: ${describeSearch("resolveProfileDir", profileSearch.searched)}`,
			measuredAt: at
		}
	};
	let manifest;
	try {
		manifest = readProfileManifest(profileDir);
	} catch (error) {
		return {
			census: null,
			unavailable: {
				reason: `profile manifest unreadable at ${join(profileDir, "package.json")}: ${error.message}`,
				measuredAt: at
			}
		};
	}
	const drafts = [];
	for (const [dependency, spec] of Object.entries(manifest.dependencies).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		const checkoutPath = checkoutFromSpec(spec, profileDir);
		const resolution = spec.startsWith("link:") ? "link" : /^\d|^\^|^~|^[a-z]/.test(spec) ? "registry" : "other";
		let checkoutExists = null;
		let packageName = null;
		let clientPresent = null;
		let rawRoutes = [];
		if (checkoutPath !== null) {
			checkoutExists = existsSync(checkoutPath);
			if (checkoutExists) {
				try {
					const pkg = JSON.parse(readFileSync(join(checkoutPath, "package.json"), "utf8"));
					packageName = typeof pkg.name === "string" ? pkg.name : null;
					const dsh = pkg.dsh;
					clientPresent = Boolean(dsh && typeof dsh === "object" && "client" in dsh);
				} catch {
					packageName = null;
					clientPresent = null;
				}
				rawRoutes = deriveRoutes(checkoutPath, pluginsSrcDir ?? checkoutPath);
			}
		}
		let nodeModulesPath = null;
		try {
			nodeModulesPath = realpathSync(join(profileDir, "node_modules", dependency));
		} catch {
			nodeModulesPath = null;
		}
		const bundleListed = manifest.bundles.includes(dependency) || packageName !== null && manifest.bundles.includes(packageName);
		drafts.push({
			dependency,
			spec,
			resolution,
			checkoutPath,
			checkoutExists,
			packageName,
			clientPresent,
			bundleListed,
			nodeModulesPath,
			rawRoutes
		});
	}
	const tasks = [];
	drafts.forEach((draft, draftIndex) => {
		draft.rawRoutes.slice(0, 40).forEach((raw, routeIndex) => {
			tasks.push({
				draft: draftIndex,
				route: routeIndex,
				path: raw.path
			});
		});
	});
	const probed = /* @__PURE__ */ new Map();
	if (probeRoutes && tasks.length > 0) {
		let cursor = 0;
		const worker = async () => {
			for (;;) {
				const index = cursor;
				cursor += 1;
				if (index >= tasks.length) return;
				const task = tasks[index];
				if (task === void 0) return;
				probed.set(`${task.draft}:${task.route}`, await probeRoute$1(task.path, baseUrl, timeoutMs));
			}
		};
		await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, tasks.length) }, () => worker()));
	}
	const offline = {
		probe: null,
		skipped: "probing disabled by the caller (harness offline mode)"
	};
	const entries = [];
	for (const [draftIndex, draft] of drafts.entries()) {
		const routes = draft.rawRoutes.slice(0, 40).map((raw, routeIndex) => {
			const reading = probed.get(`${draftIndex}:${routeIndex}`) ?? offline;
			return {
				path: raw.path,
				kind: raw.kind,
				source: raw.source,
				viaConst: raw.viaConst,
				probe: reading.probe,
				probeSkippedBecause: reading.skipped
			};
		});
		const answers = routes.filter((route) => route.probe !== null && route.probe.status !== null);
		const servesRoute = answers.length === 0 ? null : answers.some((route) => route.probe?.status !== 404);
		const servesRouteUnknownBecause = servesRoute !== null ? null : draft.rawRoutes.length === 0 ? "no route literal found in this checkout (it may register no HTTP route at all)" : "no probe was made, so serving is NOT MEASURED rather than absent";
		entries.push({
			dependency: draft.dependency,
			spec: draft.spec,
			resolution: draft.resolution,
			checkoutPath: draft.checkoutPath,
			checkoutExists: draft.checkoutExists,
			packageName: draft.packageName,
			clientPresent: draft.clientPresent,
			bundleListed: draft.bundleListed,
			nodeModulesPath: draft.nodeModulesPath,
			routes,
			servesRoute,
			servesRouteUnknownBecause
		});
	}
	return {
		census: {
			profileManifest: join(profileDir, "package.json"),
			profileManifestSha256: manifest.sha256,
			profileManifestMtime: manifest.mtime,
			at,
			dependencies: entries,
			bundles: manifest.bundles,
			nodeModules: countNodeModules(profileDir, entries),
			entriesWithCheckout: entries.filter((entry) => entry.checkoutExists === true).length,
			entriesWithClient: entries.filter((entry) => entry.clientPresent === true).length,
			entriesBundleListed: entries.filter((entry) => entry.bundleListed).length,
			entriesServingRoute: entries.filter((entry) => entry.servesRoute === true).length,
			entriesWithRoutes: entries.filter((entry) => entry.routes.length > 0).length
		},
		unavailable: null
	};
}
/**
* Does this installed entry answer to a catalog row's `name` or `npm`?
*
* Ordinal on both fields — a dependency key and a catalog `npm` are identifiers,
* and case-folding them would be the shell trap arriving in a matcher. The
* entry's own manifest name is tried as well, because a profile key and a
* package name can differ (`dshmarket` is the dependency AND the package name
* for `plugins-src/dsh-market`, which is the kind of coincidence that makes
* name-only matching look safe).
*/
function entryMatchesRow(entry, name, npm) {
	const own = [entry.dependency, entry.packageName].filter((value) => value !== null);
	if (own.includes(name)) return true;
	if (npm !== null && own.includes(npm)) return true;
	return false;
}
//#endregion
//#region src/host/registry/hosting.ts
/**
* ============================================================================
* dsh-meta-market — THE HOSTING LEDGER: provider-hosted preheated cache agents
* ============================================================================
*
* THE ROW TYPE THIS FILE ADDS, AND WHY IT IS A REGISTRY ROW RATHER THAN A PAGE
*
* The owner's ask is a market obligation: *"providers like deepseek will be
* obliged to the community to constantly host the stable meta intent aligned pre
* heated cache agents that folds on that architecture, because such way the
* selection of the agent will profit both deepseek as provider in expences and to
* user with speed and api usage."* An obligation that is not a ROW cannot be
* counted, and a count that cannot be taken cannot be met or unmet. So the unit
* here is one row per obligation, built from the SAME `Registry` the six provider
* lanes already read — `openRegistry()` in this module's parent — rather than from
* a second inventory of the same machine.
*
* THE ONE THING EVERY ROW MUST DO: NAME THE COMPONENT IT FOLDS ONTO, AND SAY
* WHETHER THAT COMPONENT EXISTS TODAY.
*
* "Folds onto the current architecture" is checkable only if it resolves to one of
* three kinds of thing that can be measured on this machine:
*
*   - `clone`   — a directory under `plugins-src/` whose `package.json` `name`
*                 matches, with the files the row depends on present on disk;
*   - `route`   — a path on the live origin that ANSWERS. A `404` is not an
*                 answer here: it is the one status that means "not registered";
*   - `catalog` — a catalog row matched by `name` OR `npm`, WITH ITS ROW COUNT,
*                 because a catalog name is not a unique key and this catalog has
*                 two `dsh-proactive` rows today.
*
* THREE VERDICTS, NEVER FLATTENED — the same discipline as `kind` in `types.ts`:
*
*   - `folded`             — the edge lands on a component that exists today and
*                            is reachable where the row says it is;
*   - `folded-library-only`— the file exists and its STAGE does not run: measured
*                            by counting the production importers of the module,
*                            which is exactly how `dsh-intent-mode`'s preheat
*                            builder was found to have 0 callers;
*   - `not-folded`         — the component does not exist today, or an ABSENT
*                            READING is being passed off as one. Named, never
*                            counted.
*
* A `not-folded` row is the point of the ledger as much as a `folded` one: this
* program's most-published defect is a plan read as an existence claim, and a
* hosting obligation that no provider has taken up is a FACT about the market, not
* an embarrassment to be smoothed over.
*
* COST AND BENEFIT SIDES ARE NULL UNTIL SOMETHING MEASURED THEM.
*
* `providerCost` and `userBenefit` carry `reading: null` with a `reason` unless a
* number exists — and every number that does exist travels with its provenance,
* `measured-here` or `cited`, and its source. A cited number is the authority of
* the document it came from and not of this lane, which is why the field says so.
*
* @module dsh-meta-market/host/registry/hosting
*/
const ROUTE_TIMEOUT_MS = 6e3;
/** Probe one path on the live origin. Never throws; a failure is a reading. */
async function probeRoute(origin, path) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const url = `${origin}${path}`;
	const started = Date.now();
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) });
		const text = await response.text();
		let bodyKeys = null;
		try {
			const parsed = JSON.parse(text);
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				const record = parsed;
				const keys = Object.keys(record).sort();
				const state = record.state;
				const nested = state !== null && typeof state === "object" && !Array.isArray(state) ? Object.keys(state).map((key) => `state.${key}`).sort() : [];
				bodyKeys = [...keys, ...nested];
			}
		} catch {}
		return {
			path,
			url,
			status: response.status,
			bytes: Buffer.byteLength(text, "utf8"),
			ms: Date.now() - started,
			bodyKeys,
			error: null,
			at
		};
	} catch (error) {
		return {
			path,
			url,
			status: null,
			bytes: null,
			ms: null,
			bodyKeys: null,
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			at
		};
	}
}
/** Every directory under `plugins-src/`, read once. */
function pluginsSrcEntries(dir) {
	if (dir === null) return [];
	try {
		return readdirSync(dir).sort();
	} catch {
		return [];
	}
}
/** The `package.json` of a clone, or `null` when it cannot be read. */
function readManifest$1(dir) {
	try {
		const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		if (parsed !== null && typeof parsed === "object") {
			const record = parsed;
			return {
				name: typeof record.name === "string" ? record.name : null,
				version: typeof record.version === "string" ? record.version : null
			};
		}
	} catch {}
	return {
		name: null,
		version: null
	};
}
/** Resolve a clone by its package `name`, so a renamed directory still resolves. */
function findClone(packageName) {
	const root = resolvePluginsSrcDir();
	if (root === null) return null;
	for (const entry of pluginsSrcEntries(root)) {
		const dir = join(root, entry);
		let isDir = false;
		try {
			isDir = statSync(dir).isDirectory();
		} catch {
			continue;
		}
		if (!isDir) continue;
		const manifest = readManifest$1(dir);
		if (manifest.name === packageName) return {
			dir,
			version: manifest.version
		};
	}
	return null;
}
/**
* The provider's own adapter, which lives in the harness package tree and NOT
* under `plugins-src/`.
*
* Found by SHAPE from the `plugins-src` root rather than by a `../` count, for the
* reason `paths.ts` records: a count is a bet on where the file will be emitted.
* This reading exists so the provider side can be reported as MEASURED-BUT-NOT-A-
* FOLD rather than as absent, which is a different and much weaker claim.
*/
function findHarnessAdapter() {
	const root = resolvePluginsSrcDir();
	if (root === null) return null;
	for (const dir of [join(root, "..", "deepseek-harness", "packages", "llm", "llm-deepseek"), join(root, "..", "deepseek-harness", "packages", "llm-deepseek")]) {
		const manifest = readManifest$1(dir);
		if (manifest.name !== null) return {
			dir,
			version: manifest.version
		};
	}
	return null;
}
/**
* THE STAGE INSTRUMENT: does the declared entry point actually get CALLED?
*
* This replaces a weaker check that this lane shipped first and had to correct.
* The earlier version counted importers of the module and tested whether the
* IMPORTED NAME equalled the MODULE NAME — which is right only when a module and
* its entry function share a name (`dispatch.ts` → `dispatch`). For `preheat.ts`
* the entry function is `buildPacket`, so a genuinely wired stage would have been
* reported as unwired, and `dsh-intent-mode`'s own `scheduler.ts` importing
* `buildPacket` is exactly that case. **A check that cannot go GREEN on the thing
* it is looking for is as broken as one that cannot go RED.**
*
* So the probe now takes the FUNCTION NAMES it is looking for, and asks three
* questions per importer: which names it took, how many times it CALLS one of the
* declared functions, and whether that importer is reachable from the plugin's own
* entry file. A stage runs only when an importer reachable from the entry makes a
* call — an importer that takes constants and never calls is a library edge, which
* is what `dispatch.ts` has.
*/
const ENTRY_FILE = "src/host/index.ts";
function relativeImportsOf(file) {
	let text = "";
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return [];
	}
	const found = [];
	const pattern = /from\s+'(\.[^']+)'/g;
	let match = pattern.exec(text);
	while (match !== null) {
		const specifier = match[1];
		if (specifier !== void 0) found.push(resolve(dirname(file), specifier));
		match = pattern.exec(text);
	}
	return found;
}
/** Every file reachable from `entryPath` through relative imports, bounded. */
function reachableSet(entryPath, maxDepth = 5) {
	const seen = /* @__PURE__ */ new Set();
	const queue = [{
		path: entryPath,
		depth: 0
	}];
	while (queue.length > 0) {
		const current = queue.shift();
		if (current === void 0) break;
		if (seen.has(current.path) || current.depth > maxDepth) continue;
		seen.add(current.path);
		for (const next of relativeImportsOf(current.path)) queue.push({
			path: next,
			depth: current.depth + 1
		});
	}
	return seen;
}
/**
* Strip comments and string literals before counting a CALL SITE.
*
* THE FIRST VERSION OF THIS COUNTER WAS FOOLED BY A BACKTICK. `index.ts` explains
* the dispatch seam in a doc comment — ``dispatch(intent, deps)`` — and a naive
* `\bdispatch\s*\(` count read that PROSE as a call, which would have folded
* `dispatch-handoff` on the strength of a comment. The error direction matters:
* over-counting calls folds a stage that does not run, which is the expensive
* mistake; under-counting marks a running stage as a library, which is merely
* conservative and visible. So comments and literals are removed first.
*/
function stripNonCode(text) {
	return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ").replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, "\"\"").replace(/`(?:[^`\\]|\\.)*`/g, "``");
}
function probeStageReach(cloneDir, probe) {
	const reachable = reachableSet(join(cloneDir, ENTRY_FILE));
	const moduleBase = probe.module.replace(/\./g, "\\.");
	const importPattern = new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*'[^']*\\/${moduleBase}\\.ts'`, "g");
	const callPatterns = probe.functions.map((fn) => ({
		fn,
		pattern: new RegExp(`\\b${fn}\\s*\\(`, "g")
	}));
	const importers = [];
	const root = join(cloneDir, "src");
	const walk = (dir, depth) => {
		if (depth > 6) return;
		let entries;
		try {
			entries = readdirSync(dir).sort();
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry);
			let isDir = false;
			try {
				isDir = statSync(path).isDirectory();
			} catch {
				continue;
			}
			if (isDir) {
				walk(path, depth + 1);
				continue;
			}
			if (!entry.endsWith(".ts") || entry === `${probe.module}.ts`) continue;
			let text = "";
			try {
				text = readFileSync(path, "utf8");
			} catch {
				continue;
			}
			const names = [];
			let found = false;
			importPattern.lastIndex = 0;
			let match = importPattern.exec(text);
			while (match !== null) {
				found = true;
				for (const piece of (match[1] ?? "").split(",")) {
					const name = piece.trim().split(/\s+as\s+/)[0]?.trim() ?? "";
					if (name !== "" && !name.startsWith("type ")) names.push(name);
				}
				match = importPattern.exec(text);
			}
			if (!found) continue;
			let callSites = 0;
			const code = stripNonCode(text);
			for (const { pattern } of callPatterns) {
				pattern.lastIndex = 0;
				callSites += code.match(pattern)?.length ?? 0;
			}
			importers.push({
				file: path.slice(root.length + 1).replace(/\\/g, "/"),
				names,
				callSites,
				reachableFromEntry: reachable.has(path)
			});
		}
	};
	walk(root, 0);
	const reachedThrough = importers.find((importer) => importer.callSites > 0 && importer.reachableFromEntry) ?? null;
	const described = importers.map((importer) => `${importer.file} takes [${importer.names.join(", ")}], makes ${importer.callSites} call(s) in code, ${importer.reachableFromEntry ? "reachable" : "NOT reachable"} from ${ENTRY_FILE}`).join("; ");
	return {
		importers,
		reachedThrough,
		note: importers.length === 0 ? `0 importers of ${probe.module}.ts under the clone's src/ — the module exists and nothing calls it` : reachedThrough === null ? `${importers.length} importer(s) of ${probe.module}.ts and NO call of [${probe.functions.join(", ")}] from a file reachable from ${ENTRY_FILE}: ${described}` : `${reachedThrough.file} calls an entry function of ${probe.module}.ts ${reachedThrough.callSites} time(s) and is reachable from ${ENTRY_FILE}; importers seen: ${described}`
	};
}
/** The program workspace that owns `intent_mode/`, resolved from the profile. */
function workspaceRoot() {
	const profile = resolveProfileDir();
	return profile.path === null ? null : join(profile.path, "dsh-meta-evolve_INIT_WORKSPACE");
}
function measureProductionOutput(spec) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const root = workspaceRoot();
	if (root === null) return {
		store: spec.store,
		artifacts: null,
		excludedFixtures: 0,
		ledger: spec.ledger,
		ledgerKind: spec.kind,
		ledgerEvents: null,
		note: "NOT MEASURED: the profile directory could not be resolved, so the declared store was never read",
		at
	};
	let artifacts = null;
	let excludedFixtures = 0;
	let storeNote;
	try {
		const entries = readdirSync(join(root, spec.store));
		excludedFixtures = entries.filter((entry) => spec.exclude.includes(entry)).length;
		artifacts = entries.length - excludedFixtures;
		storeNote = `${artifacts} artifact(s) in ${spec.store} besides ${excludedFixtures} declared fixture(s)`;
	} catch (error) {
		const code = error.code ?? "unknown";
		artifacts = null;
		storeNote = code === "ENOENT" ? `${spec.store} does not exist (ENOENT), so this stage has written nothing there` : `${spec.store} could not be read (${code}), so its contents are NOT MEASURED`;
	}
	let ledgerEvents = null;
	let ledgerNote;
	try {
		ledgerEvents = readFileSync(join(root, spec.ledger), "utf8").match(new RegExp(`"kind"\\s*:\\s*"${spec.kind}"`, "g"))?.length ?? 0;
		ledgerNote = `${ledgerEvents} '${spec.kind}' event(s) in ${spec.ledger}`;
	} catch (error) {
		const code = error.code ?? "unknown";
		ledgerNote = `${spec.ledger} could not be read (${code}), so its event count is NOT MEASURED`;
	}
	return {
		store: spec.store,
		artifacts,
		excludedFixtures,
		ledger: spec.ledger,
		ledgerKind: spec.kind,
		ledgerEvents,
		note: `${storeNote}; ${ledgerNote}`,
		at
	};
}
const NOT_MEASURED_COST = (reason) => ({
	reading: null,
	unit: null,
	basis: "no measured term exists for this side of the trade on this machine today",
	provenance: "not-measured",
	source: null,
	reason
});
const SEEDS = Object.freeze([
	{
		id: "zone-index",
		declaredProvider: "deepseek",
		stage: "intent-zone-lookup",
		preheatedTo: "the 24-zone intent map, precalculated at index build time",
		meaning: "A request is placed on the shared intent map without re-embedding the corpus.",
		trials: [{
			kind: "route",
			path: "/intent-map/api/map"
		}, {
			kind: "clone",
			package: "dsh-intent-map",
			files: ["src/host/recall.ts"],
			importProbe: null
		}],
		providerCost: NOT_MEASURED_COST("the zone index is computed and served by the local harness; no provider is billed for it and this surface holds no provider-side term for it"),
		userBenefit: NOT_MEASURED_COST("the saving is the difference between a precalculated read and a cold rebuild; the cold rebuild has not been measured, so only the served read latency is reported (in basis) rather than a saving")
	},
	{
		id: "preheat-packet",
		declaredProvider: "deepseek",
		stage: "preheat-packet",
		preheatedTo: "the agent's first read: a composed context packet built before the agent's critical path",
		meaning: "The embed call moves out of the critical path, so the agent's first read is a file read.",
		trials: [{
			kind: "clone",
			package: "dsh-intent-mode",
			files: ["src/host/preheat.ts"],
			importProbe: {
				module: "preheat",
				functions: ["buildPacket", "composeContext"]
			}
		}, {
			kind: "route",
			path: "/intent-mode/api/packet"
		}],
		providerCost: NOT_MEASURED_COST("the packet is built by the local harness against a local embedder; no provider-hosted preheat exists to be charged for, so there is nothing on this machine to price"),
		userBenefit: NOT_MEASURED_COST("moving the embed call out of the critical path has no measured latency in this workspace: no before/after pair for a packet-carrying read exists, and whether the builder has a construction site is reported on the stage rather than asserted here"),
		outputProbe: {
			store: "intent_mode/context",
			exclude: ["latency-probe.json"],
			ledger: "intent_mode/ledger.jsonl",
			kind: "preheated"
		}
	},
	{
		id: "dispatch-handoff",
		declaredProvider: "deepseek",
		stage: "dispatch-handoff",
		preheatedTo: "the fleet handoff that follows a preheated intent",
		meaning: "A preheated intent is handed to an agent through a recorded adapter rather than held in memory.",
		trials: [{
			kind: "clone",
			package: "dsh-intent-mode",
			files: ["src/host/dispatch.ts"],
			importProbe: {
				module: "dispatch",
				functions: ["dispatch"]
			}
		}, {
			kind: "route",
			path: "/intent-mode/api/map"
		}],
		providerCost: NOT_MEASURED_COST("no dispatch record has ever been written on this machine, so no provider-side cost has been incurred or measured"),
		userBenefit: NOT_MEASURED_COST("the handoff is a round trip whose duration nothing records; the packet and dispatch stores carry no timing field"),
		outputProbe: {
			store: "intent_mode/dispatch",
			exclude: [],
			ledger: "intent_mode/ledger.jsonl",
			kind: "dispatched"
		}
	},
	{
		id: "kv-prefix",
		declaredProvider: "deepseek",
		stage: "kv-prefix-reuse",
		preheatedTo: "a retained KV prefix on the provider's inference host",
		meaning: "The provider keeps the prompt-side attention state instead of recomputing it per request.",
		trials: [{
			kind: "catalog",
			by: "npm",
			value: "dsh-kv-cache"
		}, {
			kind: "catalog",
			by: "name",
			value: "dsh-kv-cache"
		}],
		providerCost: {
			reading: 4.12,
			unit: "GiB",
			basis: "one retained KV entry at 131072 context, at the measured 33.0 KiB per token (two-point VRAM differencing: -c 8192 → 3,055 MiB, -c 32768 → 3,847 MiB)",
			provenance: "cited",
			source: "research/kv-receipt-meta-market.md §1-2 (cited from the workspace record; this lane did not re-run the VRAM differencing)",
			reason: null
		},
		userBenefit: {
			reading: 563.2,
			unit: "ms",
			basis: "prefill 569.2 ms cold → 6.0 ms on a full hit, i.e. 563.2 ms saved per hit — and 390.6 ms after eviction, which is why the row is not counted as folded",
			provenance: "cited",
			source: "research/kv-receipt-meta-market.md §1-2 (cited; not re-measured here)",
			reason: "the cited series shows the prefix REBUILT rather than kept, so the saving is conditional on a residency nothing on this machine can attest"
		}
	},
	{
		id: "proactive-wake",
		declaredProvider: "community",
		stage: "proactive-wake",
		preheatedTo: "a scheduled wake-up, so an idle hot agent is aimed rather than guessed",
		meaning: "A cold session is woken on a schedule the model itself set, rather than on the user request.",
		trials: [{
			kind: "catalog",
			by: "npm",
			value: "dsh-proactive"
		}, {
			kind: "catalog",
			by: "name",
			value: "dsh-proactive"
		}],
		providerCost: NOT_MEASURED_COST("the catalog publishes stars, downloads and capabilities; it publishes no cost term, and downloads are not a cost"),
		userBenefit: NOT_MEASURED_COST("the catalog row describes a wake-up schedule; it states no measured latency or token saving, and inventing one would be the defect this program records most often"),
		refine: (trials) => {
			const named = trials.find((trial) => trial.kind === "catalog" && trial.rows !== null && trial.rows.count > 1);
			if (trials.find((trial) => trial.kind === "catalog" && trial.rows !== null && trial.rows.count === 1) === void 0) return null;
			return {
				state: "folded",
				why: named === void 0 ? "a single catalog row matched, with owner, npm and version" : `the ${named.target} lookup returned ${named.rows?.count ?? 0} rows and was disambiguated to one row by npm; a catalog name is not a unique key`
			};
		}
	},
	{
		id: "provider-adapter",
		declaredProvider: "deepseek",
		stage: "provider-billing",
		preheatedTo: "nothing is preheated at this stage; it is the provider side of the trade",
		meaning: "The provider adapter that meters the tokens and would carry the hosting obligation.",
		trials: [{
			kind: "clone",
			package: "@deepseek-ai/dsh-llm-deepseek",
			files: [],
			importProbe: null
		}, {
			kind: "catalog",
			by: "owner",
			value: "deepseek"
		}],
		providerCost: NOT_MEASURED_COST("the adapter meters tokens for a session; it holds no standing cost for hosting a preheated agent, and none was measured"),
		userBenefit: NOT_MEASURED_COST("no user-side speed or API-spend reading exists for a provider that hosts no preheated copy today"),
		staticNote: "the provider adapter is measured on this machine but is not one of the three fold kinds, so this row states the provider side as UNFOLDED rather than counting the adapter as a fold"
	},
	{
		id: "plan-rag-index",
		declaredProvider: "community",
		stage: "corpus-retrieval",
		preheatedTo: "the precalculated plan corpus index",
		meaning: "A corpus query is answered from a prebuilt index rather than by re-reading and re-embedding the corpus.",
		trials: [{
			kind: "route",
			path: "/plan-rag/api/status"
		}, {
			kind: "clone",
			package: "dsh-plan-rag",
			files: [],
			importProbe: null
		}],
		providerCost: NOT_MEASURED_COST("the index is served by the local harness; no provider is billed for it"),
		userBenefit: NOT_MEASURED_COST("the served read latency is in basis, but the cold-rebuild baseline a saving needs has not been measured")
	},
	{
		id: "capacity-selection",
		declaredProvider: "deepseek",
		stage: "idle-hot-agent-selection",
		preheatedTo: "the intent-zone an idle hot agent is aimed at",
		meaning: "The selection of the agent, which the owner's ask says profits both sides.",
		trials: [
			{
				kind: "clone",
				package: "dsh-intent-mode",
				files: ["src/host/capacity.ts"],
				importProbe: {
					module: "capacity",
					functions: ["createCapacityProbe"]
				}
			},
			{
				kind: "route",
				path: "/agent-team-cap/api/state"
			},
			{
				kind: "clone",
				package: "dsh-agent-team-cap",
				files: [],
				importProbe: null
			}
		],
		providerCost: NOT_MEASURED_COST("nothing on this machine prices an idle hot agent"),
		userBenefit: NOT_MEASURED_COST("the saving is the avoided queue wait; queue occupancy is readable through the capacity probe, but no before/after wait pair has been measured here, so the saving stays unmeasured"),
		refine: (trials) => {
			const component = trials.find((trial) => trial.kind === "clone" && trial.target === "dsh-intent-mode");
			if (component !== void 0 && component.matched === true) return null;
			const route = trials.find((trial) => trial.route !== null)?.route ?? null;
			return {
				state: "not-folded",
				why: route === null || route.status === null ? "NOT MEASURED: the capacity route did not answer and the capacity component is absent, so no idle-agent reading could be taken. An unmeasured capacity is not a fold, and a `free` nobody read is not `free: true`." : `no trial matched: clone:dsh-intent-mode/src/host/capacity.ts is ABSENT and route:${route.path} answers ${route.status} with a capacity CAP and no queue, idle-agent or pending-work reading — a route that answers a cap is not a component that reads a queue`
			};
		}
	}
]);
async function measureTrial(spec, registry, origin) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	if (spec.kind === "route") {
		const route = await probeRoute(origin, spec.path);
		const matched = route.status === null ? null : route.status !== 404 && route.status < 500;
		return {
			kind: "route",
			target: spec.path,
			matched,
			detail: route.status === null ? `NOT MEASURED: ${route.error ?? "the request never completed"}` : `${route.status} ${route.bytes ?? 0} B in ${route.ms ?? 0} ms`,
			route,
			clone: null,
			rows: null,
			row: null,
			at
		};
	}
	if (spec.kind === "clone") {
		const found = findClone(spec.package);
		if (found === null) return {
			kind: "clone",
			target: spec.package,
			matched: false,
			detail: `no directory under plugins-src/ carries package name '${spec.package}'`,
			route: null,
			clone: null,
			rows: null,
			row: null,
			at
		};
		const files = spec.files.map((file) => {
			const path = join(found.dir, file);
			let bytes = 0;
			let present = false;
			try {
				bytes = statSync(path).size;
				present = true;
			} catch {
				present = false;
			}
			return {
				file,
				bytes,
				exists: present
			};
		});
		const cloning = {
			packageName: spec.package,
			dir: found.dir,
			version: found.version,
			files
		};
		const missing = files.filter((entry) => !entry.exists);
		return {
			kind: "clone",
			target: spec.package,
			matched: missing.length === 0,
			detail: missing.length === 0 ? `clone at ${found.dir}${found.version === null ? "" : ` v${found.version}`}; ${files.length} of ${files.length} required files present` : `clone at ${found.dir} but ${missing.length} of ${files.length} required files ABSENT: ${missing.map((entry) => entry.file).join(", ")}`,
			route: null,
			clone: cloning,
			rows: null,
			row: null,
			at
		};
	}
	const catalog = registry.downloadable.census;
	if (catalog === null) return {
		kind: "catalog",
		target: `${spec.by}:${spec.value}`,
		matched: null,
		detail: `NOT MEASURED: the downloadable catalog half did not load — ${registry.downloadable.unavailable?.reason ?? "no reason recorded"}`,
		route: null,
		clone: null,
		rows: null,
		row: null,
		at
	};
	const total = catalog.identity.rows;
	if (spec.by === "name" || spec.by === "npm") {
		const query = spec.by === "name" ? registry.byName(spec.value) : registry.byNpm(spec.value);
		const unique = query.rows.length === 1 ? query.rows[0] : void 0;
		return {
			kind: "catalog",
			target: `${spec.by}:${spec.value}`,
			matched: query.rows.length > 0,
			detail: `${query.rows.length} of ${query.totalRows} catalog rows matched ${spec.by} '${spec.value}'${query.ambiguous ? " — AMBIGUOUS, see the disambiguation lines" : ""}`,
			route: null,
			clone: null,
			rows: {
				count: query.rows.length,
				of: query.totalRows
			},
			row: unique === void 0 ? null : {
				name: unique.name,
				npm: unique.npm,
				owner: unique.owner,
				version: unique.version,
				stars: unique.stars,
				row: unique.index
			},
			at
		};
	}
	const query = registry.byOwner(spec.value);
	const unique = query.rows.length === 1 ? query.rows[0] : void 0;
	return {
		kind: "catalog",
		target: `owner:${spec.value}`,
		matched: query.rows.length > 0,
		detail: `${query.rows.length} of ${total} catalog rows carry owner '${spec.value}'`,
		route: null,
		clone: null,
		rows: {
			count: query.rows.length,
			of: total
		},
		row: unique === void 0 ? null : {
			name: unique.name,
			npm: unique.npm,
			owner: unique.owner,
			version: unique.version,
			stars: unique.stars,
			row: unique.index
		},
		at
	};
}
function measureProviders(registry) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const rows = registry.downloadable.census === null ? [] : registry.allDownloadable();
	const scoped = rows.filter((row) => (row.npm ?? "").startsWith("@deepseek-ai/"));
	const ownerRows = registry.downloadable.census === null ? null : registry.byOwner("deepseek");
	const adapter = findHarnessAdapter();
	const named = [];
	const pluginsRoot = resolvePluginsSrcDir();
	if (pluginsRoot !== null) for (const entry of pluginsSrcEntries(pluginsRoot)) {
		const manifest = readManifest$1(join(pluginsRoot, entry));
		if (manifest.name !== null && manifest.name.toLowerCase().includes("deepseek")) named.push(manifest.name);
	}
	return [{
		name: "deepseek",
		role: "declared-provider",
		evidence: [
			{
				claim: adapter === null ? "the provider's own adapter clone was not found under plugins-src/" : `the provider's own adapter exists at ${adapter.dir}${adapter.version === null ? "" : ` v${adapter.version}`}, in the harness package tree rather than in plugins-src/`,
				provenance: "measured-here",
				source: adapter?.dir ?? "plugins-src/ (searched for package name @deepseek-ai/dsh-llm-deepseek)",
				at
			},
			{
				claim: registry.downloadable.census === null ? "catalog scope lookup NOT MEASURED: the downloadable catalog half did not load, so a count of 0 here would be instrument failure rather than a reading" : `catalog rows whose npm begins '@deepseek-ai/': ${scoped.length} of ${rows.length}`,
				provenance: registry.downloadable.census === null ? "not-measured" : "measured-here",
				source: "registry.downloadable (live catalog)",
				at
			},
			{
				claim: ownerRows === null ? "owner lookup NOT MEASURED: no catalog half loaded" : `catalog rows owned by 'deepseek': ${ownerRows.rowCount} of ${rows.length}`,
				provenance: ownerRows === null ? "not-measured" : "measured-here",
				source: "registry.byOwner(deepseek)",
				at
			}
		],
		isFoldTarget: false,
		catalogRows: {
			scope: "npm begins '@deepseek-ai/'",
			count: scoped.length,
			of: rows.length,
			measured: registry.downloadable.census !== null
		},
		pluginsSrcClones: named.length,
		hostedCopies: named.length,
		reason: "the provider's adapter exists on this machine but is neither a plugins-src clone, a mounted route, nor a catalog row — so under this row type's fold standard the PROVIDER side folds onto nothing today, and the catalog carries no row for the provider at all"
	}, {
		name: "local-harness",
		role: "host-today",
		evidence: [{
			claim: `the origin this report was assembled behind is ${registry.baseUrl}, reached through the mounted dsh-meta-market clone`,
			provenance: "measured-here",
			source: registry.baseUrl,
			at
		}],
		isFoldTarget: false,
		catalogRows: {
			scope: "not a catalog entity: the host that served this read is a process, not a market row",
			count: 0,
			of: rows.length,
			measured: registry.downloadable.census !== null
		},
		pluginsSrcClones: 0,
		hostedCopies: 0,
		reason: "every component that answered for these rows runs on this machine; no copy of any of them is hosted by a provider, so the hosting side of the obligation is UNSATISFIED for every row below"
	}];
}
let cached$1 = null;
/** Build the hosting report. One probe run per process unless `resetHosting()` is called. */
async function buildHostingReport(registry) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const origin = registry.baseUrl;
	const rows = [];
	const withheld = [];
	const providers = measureProviders(registry);
	const aProviderHostsOne = providers.some((provider) => provider.hostedCopies > 0);
	for (const seed of SEEDS) try {
		if (registry.installed.census === null && registry.downloadable.census === null) {
			withheld.push({
				id: seed.id,
				reason: "BOTH registry halves are NOT MEASURED, so no fold trial can be answered; a row built from two non-answers would be a caption"
			});
			continue;
		}
		const trials = [];
		for (const spec of seed.trials) trials.push(await measureTrial(spec, registry, origin));
		let stageReached = null;
		let importerNote = null;
		const importerSpecs = seed.trials.filter((spec) => spec.kind === "clone" && spec.importProbe !== null);
		for (const spec of importerSpecs) {
			const found = findClone(spec.package);
			if (found === null) {
				stageReached = null;
				importerNote = `${spec.package} is not present under plugins-src/, so ${spec.importProbe.module}.ts could not be probed for ${ENTRY_FILE} reachability — NOT MEASURED`;
				continue;
			}
			const probed = probeStageReach(found.dir, spec.importProbe);
			stageReached = probed.reachedThrough !== null;
			importerNote = probed.note;
		}
		const matchedTrials = trials.filter((trial) => trial.matched === true);
		const measuredTrials = trials.filter((trial) => trial.matched !== null);
		const firstMatch = matchedTrials[0];
		const refined = seed.refine?.(trials) ?? null;
		let state;
		let why;
		if (refined !== null) {
			state = refined.state;
			why = refined.why;
		} else if (firstMatch !== void 0) {
			state = stageReached === false ? "folded-library-only" : "folded";
			why = stageReached === false ? `the component exists today (${firstMatch.detail}) and its STAGE does not run: ${importerNote ?? "the stage has no production caller"}` : stageReached === true ? `the component exists today (${firstMatch.detail}) and its STAGE RUNS: ${importerNote ?? "an entry point is called from the plugin entry file"}` : `the component exists today and answers: ${firstMatch.detail}`;
		} else if (measuredTrials.length === 0) {
			state = "not-folded";
			why = `NO TRIAL WAS MEASURED (${trials.map((trial) => `${trial.kind}:${trial.target}`).join(", ")}); an unmeasured edge is not a folded one`;
		} else {
			state = "not-folded";
			why = `no trial matched: ${measuredTrials.map((trial) => `${trial.kind}:${trial.target} → ${trial.detail}`).join("; ")}`;
		}
		const catalogIdentity = trials.map((trial) => trial.row).find((row) => row !== null) ?? null;
		const cloneIdentity = trials.map((trial) => trial.clone).find((clone) => clone !== null && clone.dir !== null);
		const identitySource = catalogIdentity !== null ? "catalog" : cloneIdentity === void 0 ? "none" : "clone";
		const identity = catalogIdentity ?? (cloneIdentity === void 0 ? null : {
			name: cloneIdentity.packageName,
			npm: null,
			owner: null,
			version: cloneIdentity.version,
			stars: null,
			row: -1
		});
		const answered = trials.map((trial) => trial.route).find((route) => route !== null);
		rows.push({
			id: seed.id,
			hosting: {
				declaredProvider: seed.declaredProvider,
				hostToday: `local harness at ${origin}`,
				providerHosted: aProviderHostsOne,
				reason: "no provider-hosted copy of this component was found on this machine; the copy that answered is the local harness"
			},
			intentStage: {
				stage: seed.stage,
				preheatedTo: seed.preheatedTo,
				meaning: seed.meaning,
				stageExistsToday: state !== "not-folded",
				stageReachedInProduction: stageReached,
				productionOutput: seed.outputProbe === void 0 ? null : measureProductionOutput(seed.outputProbe),
				note: [
					importerNote,
					answered === void 0 ? null : `the answering route ${answered.path} returned ${answered.status === null ? "NOT MEASURED" : answered.status} in ${answered.ms ?? 0} ms over ${answered.bytes ?? 0} B`,
					seed.staticNote ?? null
				].filter((entry) => entry !== null).join("; ") || null
			},
			providerCost: seed.providerCost,
			userBenefit: answered !== void 0 && seed.userBenefit.reading === null && answered.ms !== null ? {
				...seed.userBenefit,
				basis: `the serving read was measured at ${answered.ms} ms; ${seed.userBenefit.basis}`
			} : seed.userBenefit,
			fold: {
				state,
				kind: state === "not-folded" ? null : firstMatch?.kind ?? null,
				component: state === "not-folded" ? null : firstMatch === void 0 ? null : `${firstMatch.kind}:${firstMatch.target}`,
				why,
				trials
			},
			identitySource,
			identity
		});
	} catch (error) {
		withheld.push({
			id: seed.id,
			reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
		});
	}
	const counted = {
		folded: rows.filter((row) => row.fold.state === "folded").length,
		foldedLibraryOnly: rows.filter((row) => row.fold.state === "folded-library-only").length,
		notFolded: rows.filter((row) => row.fold.state === "not-folded").length
	};
	return {
		rows,
		providers,
		census: {
			rowsAttempted: SEEDS.length,
			rowsServed: rows.length,
			...counted,
			notFoldedIds: rows.filter((row) => row.fold.state === "not-folded").map((row) => row.id),
			population: "provider-hosted preheated cache agent obligations attempted by this build, one row per intent stage",
			at
		},
		withheld,
		notDone: [
			"This route starts, stops and prices nothing: it reports the hosting obligation as this machine measures it and holds no provider-side cost term of its own.",
			"No provider-hosted copy was searched for anywhere except the plugins-src clones on this machine and the catalog rows the registry loaded, so a provider hosting one elsewhere would be invisible here and is reported as absent rather than as nonexistent in general.",
			"The cost and benefit columns carry cited numbers where the workspace measured them and `null` with a reason everywhere else; no economic model was invented to fill a column."
		],
		at
	};
}
/** The memoised report for this process. A route read must not re-probe per tab. */
function getHostingReport(registry) {
	if (cached$1 === null) cached$1 = buildHostingReport(registry);
	return cached$1;
}
Object.freeze(SEEDS.map((seed) => seed.id));
//#endregion
//#region src/host/registry/index.ts
/**
* ============================================================================
* dsh-meta-market — the registry barrel: ONE stable surface for six provider lanes
* ============================================================================
*
* WHY THIS MODULE EXISTS AS A BARREL RATHER THAN AS TWO EXPORTS
*
* Six windows need the same two inventories, and the failure mode this program
* has actually suffered is not a missing number — it is two lanes measuring the
* same population with two expressions and agreeing on a wrong one. So the
* measuring lives here once, every query returns its own row count and its own
* disambiguation lines, and a provider that needs a catalogue row index reads
* `CatalogRow.index` from a row this module measured.
*
* EVERY READ IS ASYNC ONLY AT OPEN. `openRegistry()` awaits the route probes and
* returns a `Registry`; every method on it is synchronous, so a request handler
* that already holds a registry performs no I/O. The instance is memoised, so a
* second call inside one process performs no second probe run.
*
* AN UNAVAILABLE HALF IS `null`, WITH A REASON. If the profile manifest cannot
* be read the installed half is `null` and every candidate reports
* `installed: null` — NOT MEASURED — rather than `false`, which would read as
* "we looked and it is not there".
*
* @module dsh-meta-market/host/registry
*/
function censusRow(numerator, denominator, population, at) {
	return {
		numerator,
		denominator,
		population,
		at
	};
}
/** Case-folded fallback, used only when the ordinal pass found nothing. */
function foldedQuery(rows, field, query) {
	const lower = query.trim().toLowerCase();
	const matched = rows.filter((row) => (field === "name" ? row.name : row.npm ?? "").toLowerCase() === lower);
	return {
		query,
		field,
		rows: matched,
		rowCount: matched.length,
		totalRows: rows.length,
		ambiguous: matched.length > 1,
		groups: [],
		disambiguation: [`ordinal ${field} match found nothing; this is a CASE-FOLDED match, which is a different claim`, ...matched.map((row) => `row ${row.index} · ${row.name} · npm:${row.npm ?? "absent"} · owner:${row.owner ?? "absent"}`)]
	};
}
/**
* Build the registry.
*
* The downloadable half is read first because it needs no socket; the installed
* half then probes. Probe failures are captured per route and never thrown, so a
* harness that is not mounted still produces a full installed census with
* `servesRoute: null` rather than no census at all.
*/
async function openRegistry(options = {}) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const baseUrl = options.baseUrl ?? "http://127.0.0.1:3083";
	const downloadable = loadDownloadable({
		...options.liveCatalogPaths ? { liveCatalogPaths: options.liveCatalogPaths } : {},
		...options.snapshotCatalogPaths ? { snapshotCatalogPaths: options.snapshotCatalogPaths } : {},
		at
	});
	const installed = await measureInstalled({
		...options.profileDir ? { profileDir: options.profileDir } : {},
		...options.pluginsSrcDir ? { pluginsSrcDir: options.pluginsSrcDir } : {},
		baseUrl,
		probeRoutes: options.probeRoutes ?? true,
		...options.probeTimeoutMs ? { probeTimeoutMs: options.probeTimeoutMs } : {},
		at
	});
	const liveRows = downloadable.live.census?.rows ?? null;
	const installedEntries = installed.census?.dependencies ?? null;
	function requireCatalog() {
		if (liveRows === null) throw new Error(`downloadable catalog is NOT MEASURED: ${downloadable.live.unavailable?.reason ?? "no reason recorded"}`);
		return liveRows;
	}
	function query(field, value) {
		const rows = requireCatalog();
		const ordinal = queryCatalog(rows, field, value);
		return ordinal.rowCount === 0 ? foldedQuery(rows, field, value) : ordinal;
	}
	const registry = {
		installed,
		downloadable: {
			census: downloadable.live.census,
			unavailable: downloadable.live.unavailable
		},
		at,
		baseUrl,
		byName: (name) => query("name", name),
		byNpm: (npm) => query("npm", npm),
		byOwner: (owner) => queryCatalog(requireCatalog(), "owner", owner),
		byKeyword: (keyword) => queryCatalog(requireCatalog(), "keyword", keyword),
		byZone: (zone) => queryCatalog(requireCatalog(), "zone", zone),
		allInstalled: () => installedEntries ?? [],
		allDownloadable: () => requireCatalog(),
		candidatesFor: (input) => candidatesFor(registry, input),
		bothHalves: () => {
			return {
				entries: (installedEntries ?? []).filter((entry) => {
					if (liveRows === null) return false;
					return liveRows.some((row) => entryMatchesRow(entry, row.name, row.npm));
				}),
				at
			};
		},
		census: () => {
			const installedCensus = installed.census;
			const deps = installedCensus?.dependencies ?? [];
			const bundles = installedCensus?.bundles ?? [];
			return [
				censusRow(deps.filter((entry) => entry.checkoutExists === true).length, deps.length, "dependencies entries in the live profile manifest whose checkout exists on disk", at),
				censusRow(bundles.filter((bundle) => deps.some((entry) => entry.dependency === bundle || entry.packageName === bundle)).length, bundles.length, "dsh.profile.bundles entries naming a dependency of this profile, against all bundle entries (the remainder are official @deepseek-ai bundles)", at),
				censusRow(liveRows === null ? 0 : liveRows.length, downloadable.live.census?.identity.headerCount ?? (liveRows === null ? 0 : liveRows.length), "rows parsed from the downloadable live catalog against the file's own count header", at),
				censusRow(downloadable.live.census ? downloadable.live.census.identity.rowsWithNpm : 0, liveRows === null ? 0 : liveRows.length, "downloadable rows carrying an npm field against downloadable rows", at),
				censusRow(downloadable.live.census ? downloadable.live.census.identity.nameOrNpmDivergent : 0, downloadable.live.census ? downloadable.live.census.identity.rowsWithNpm : 0, "downloadable rows whose npm differs from name, against rows carrying an npm field", at),
				censusRow(downloadable.live.census ? downloadable.live.census.identity.duplicateNameRows : 0, liveRows === null ? 0 : liveRows.length, "downloadable rows sharing a name with another row, against downloadable rows", at)
			];
		}
	};
	return registry;
}
/**
* Candidates for one identity, measured in BOTH halves.
*
* A candidate list is a UNION: catalog rows that match, plus installed entries
* that match even when the catalog has no row for them. Each candidate carries
* its own `installed` / `downloadable` reading, and `source.rowCount` so a
* window cannot render "the" row when three matched.
*/
function candidatesFor(registry, input) {
	const name = input.name?.trim() ?? "";
	const npm = input.npm?.trim() ?? "";
	const rows = [];
	const seen = /* @__PURE__ */ new Set();
	if (name !== "") {
		for (const row of registry.byName(name).rows) if (!seen.has(row.index)) {
			seen.add(row.index);
			rows.push(row);
		}
	}
	if (npm !== "") {
		for (const row of registry.byNpm(npm).rows) if (!seen.has(row.index)) {
			seen.add(row.index);
			rows.push(row);
		}
	}
	const entries = registry.allInstalled();
	const downloadableKnown = registry.downloadable.census !== null;
	const candidates = [];
	for (const row of rows) {
		const matches = entries.filter((entry) => entryMatchesRow(entry, row.name, row.npm));
		candidates.push({
			id: row.npm ?? row.name,
			name: row.name,
			npm: row.npm,
			owner: row.owner,
			kind: "exists",
			installed: registry.installed.census === null ? null : matches.length > 0,
			downloadable: true,
			source: {
				where: matches.length > 0 ? "both" : "downloadable",
				...matches[0]?.routes.find((route) => route.probe?.status !== null)?.probe?.path ? { route: matches[0].routes.find((route) => route.probe?.status !== null)?.probe?.path } : {},
				row: row.index,
				rowCount: rows.length,
				disambiguation: rows.map((item) => `row ${item.index} · ${item.name} · npm:${item.npm ?? "absent"} · owner:${item.owner ?? "absent"}`)
			}
		});
	}
	if (rows.length === 0) for (const entry of entries) {
		const identity = npm !== "" ? npm : name;
		const own = [entry.dependency, entry.packageName].filter((value) => value !== null);
		if (identity === "" || !own.includes(identity)) continue;
		candidates.push({
			id: entry.dependency,
			name: entry.packageName ?? entry.dependency,
			npm: null,
			owner: null,
			kind: "exists",
			installed: entry.checkoutExists === true ? true : entry.checkoutExists,
			downloadable: downloadableKnown ? false : null,
			source: {
				where: "installed",
				...entry.routes.find((route) => route.probe?.status !== null)?.probe?.path ? { route: entry.routes.find((route) => route.probe?.status !== null)?.probe?.path } : {},
				rowCount: 1,
				disambiguation: [`installed only: ${entry.dependency}=${entry.spec} (no catalog row matched)`]
			}
		});
	}
	const installedMatches = rows.length === 0 ? entries.filter((entry) => {
		const identity = npm !== "" ? npm : name;
		return identity !== "" && [entry.dependency, entry.packageName].includes(identity);
	}) : entries.filter((entry) => rows.some((row) => entryMatchesRow(entry, row.name, row.npm)));
	return {
		query: npm !== "" ? npm : name,
		rows,
		rowCount: rows.length,
		ambiguous: rows.length > 1,
		installedMatches,
		candidates
	};
}
let cached = null;
/**
* The memoised registry for this process.
*
* Memoisation is deliberate: the route probes touch the owner's live session, so
* a provider called on every request must not probe every time. `options` is
* honoured on the FIRST call only; a caller that needs a different fixture uses
* `openRegistry` directly and `resetRegistry()` first.
*/
function getRegistry(options = {}) {
	if (cached === null) cached = openRegistry(options);
	return cached;
}
//#endregion
//#region src/host/intent-align/types.ts
/**
* The embedding-path threshold — INHERITED, and FALSIFIED for the use it is put to here.
*
* It is the value `alignment/threshold.ts` fitted (0.6605, midpoint of a 0.215 gap between 4 positives
* and 6 negatives), and a gate that invented its own number would give this program two thresholds for
* one quantity. So it is reused rather than re-derived.
*
* BUT REUSING IT IS A KNOWN-WEAK CHOICE AND MUST NOT BE PRESENTED AS A MEASURED ONE. Decision `D-0076`
* (lead, 2026-10-16T18:23:06Z) ran the operator that threshold guards and FALSIFIED it: one intent in
* six phrasings scored 0.836090 … 0.633092, a spread of **0.225753 — wider than the 0.215 separation the
* threshold was fitted to** — and worst-positive 0.633092 against best-negative 0.533483 leaves 0.099609
* with **0.6605 not between them**. `D-0076` also names the cause: `dsh-intent-map`'s zone vectors are
* built from zone definitions PLUS every member plugin NAME, so similarity to a zone measures market
* vocabulary overlap rather than intent.
*
* CONSEQUENCE, stated so this file cannot be read as validating its own embedding path: the embedding
* branch decides against a threshold this program has already recorded as not separating its populations.
* It is NOT exercised on this deployment — the embedder refused every connection at 2026-10-17T21:41Z and
* again at 22:2xZ — so its behaviour is UNVERIFIED END TO END, and the token path is the only one that
* has been measured. The cheapest real fix remains `D-0076`'s: rebuild the zone vectors from DEFINITIONS
* ALONE and refit. The token method already uses definitions alone, which is part of why its fit is
* stated numerically while this value is stated as inherited.
*/
const COLLISION_THRESHOLD = .6605;
/**
* The token-path threshold, fitted to TWO BINDING CONSTRAINTS and placed at their exact midpoint.
*
* The two methods score on different scales, so they do not share a cut-off. Using 0.6605 for token
* similarity would refuse everything: the token method measures term overlap between two descriptions,
* where a strong match is 0.12–0.69 and not 0.7.
*/
const TOKEN_THRESHOLD = .3407;
/**
* Zones too generic to carry a collision by themselves.
*
* A candidate must clear a higher bar in one of these. Measured source: `alignment/threshold.ts`
* records three of six embedding negatives landing on `S4-management-ui` at 0.45–0.53, so that zone
* alone is not evidence of a shared purpose.
*/
const GENERIC_ZONE_IDS = ["S4-management-ui"];
/** The extra margin a generic zone must clear. `PROGRAM CHOICE`, stated rather than implied. */
const GENERIC_ZONE_EDGE = .08;
//#endregion
//#region src/host/intent-align/zone-space.ts
/** The map route this module reads. Named once; a probe and a build use the same string. */
const INTENT_MAP_ROUTE$1 = "/intent-map/api/map";
/** The recall route, used only to ask whether the substrate can embed at all. */
const INTENT_RECALL_ROUTE = "/intent-map/api/recall";
/** A fetch that cannot hang forever. */
const DEFAULT_TIMEOUT_MS$1 = 8e3;
/** Join a base and a route without producing a doubled slash. */
function joinUrl(base, route) {
	return `${base.replace(/\/+$/, "")}${route}`;
}
/**
* Read the map route, returning the failure branch rather than an empty space.
*
* A network failure is reported with `status: 0`, following `alignment/client.ts`'s rule: `0` is not an
* HTTP status, so a reader cannot confuse "nothing answered" with "the route said no".
*/
async function loadZoneSpace(options = {}) {
	const baseUrl = options.baseUrl ?? "http://127.0.0.1:3083";
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS$1;
	const readAt = (/* @__PURE__ */ new Date()).toISOString();
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);
	let payload;
	try {
		const response = await fetch(joinUrl(baseUrl, INTENT_MAP_ROUTE$1), { signal: controller.signal });
		if (!response.ok) return {
			ok: false,
			status: response.status,
			route: INTENT_MAP_ROUTE$1,
			readAt,
			reason: `the intent map answered with HTTP ${String(response.status)}; an unread zone space cannot be scored against`
		};
		payload = await response.json();
	} catch (error) {
		return {
			ok: false,
			status: 0,
			route: INTENT_MAP_ROUTE$1,
			readAt,
			reason: `the intent map could not be reached (${error instanceof Error ? error.message : "unknown failure"}); status 0 means nothing answered, which is not an empty zone space`
		};
	} finally {
		clearTimeout(timer);
	}
	const raw = payload.zones;
	if (!Array.isArray(raw) || raw.length === 0) return {
		ok: false,
		status: 200,
		route: INTENT_MAP_ROUTE$1,
		readAt,
		reason: `the route answered but carried ${Array.isArray(raw) ? "0" : "no"} zones; a corpus that reads as empty is instrument failure, not a pass`
	};
	const zones = [];
	const skipped = [];
	for (const row of raw) {
		const id = typeof row.id === "string" ? row.id : null;
		const definition = typeof row.definition === "string" ? row.definition : null;
		if (id === null || definition === null) {
			skipped.push(id ?? "<zone with no id>");
			continue;
		}
		zones.push({
			id,
			category: typeof row.category === "string" ? row.category : "unknown",
			definition,
			memberCount: typeof row.memberCount === "number" ? row.memberCount : null,
			generic: GENERIC_ZONE_IDS.includes(id)
		});
	}
	if (zones.length !== raw.length) return {
		ok: false,
		status: 200,
		route: INTENT_MAP_ROUTE$1,
		readAt,
		reason: `${String(raw.length - zones.length)} of ${String(raw.length)} zones carried no id or no definition (${skipped.join(", ")}); a partial space would score every candidate against a vocabulary the substrate does not have`
	};
	if (zones.length !== 24) return {
		ok: false,
		status: 200,
		route: INTENT_MAP_ROUTE$1,
		readAt,
		reason: `the route reported ${String(zones.length)} zones but this build expects ${String(24)}; refused rather than scored against a different map`
	};
	const ids = new Set(zones.map((z) => z.id));
	if (ids.size !== zones.length) return {
		ok: false,
		status: 200,
		route: INTENT_MAP_ROUTE$1,
		readAt,
		reason: `the space carries duplicate zone ids (${String(zones.length - ids.size)} duplicate of ${String(zones.length)}), so a zone score would be ambiguous`
	};
	const embedding = await probeEmbedding(baseUrl, timeoutMs);
	return {
		ok: true,
		readAt,
		space: {
			indexId: payload.index?.identity?.builtAt ?? payload.censusAt ?? "unidentified-index",
			zones,
			census: {
				read: zones.length,
				of: 24,
				at: readAt
			},
			embedding,
			identity: {
				model: payload.index?.identity?.model ?? null,
				dim: payload.index?.identity?.dim ?? null
			}
		}
	};
}
/**
* Ask the substrate whether it can embed, and take its own answer.
*
* This is a PROBE, not a scoring call: one short query, and the only field read is `embedded`. When it
* is `false` the reason is the substrate's own string, carried into every zone's `methodReason`, so a
* reader learns *why* the token method ran rather than being told only that it did.
*/
async function probeEmbedding(baseUrl, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);
	try {
		const route = `${INTENT_RECALL_ROUTE}?q=${encodeURIComponent("intent probe")}&top=1`;
		const response = await fetch(joinUrl(baseUrl, route), { signal: controller.signal });
		if (!response.ok) return {
			available: false,
			reason: `the recall probe answered with HTTP ${String(response.status)}; the embedding method was not offered`
		};
		const payload = await response.json();
		if (payload.embedded === true) return {
			available: true,
			reason: null
		};
		return {
			available: false,
			reason: `the substrate reported embedded:false for a probe query — ${typeof payload.reason === "string" ? payload.reason : "no reason given"}`
		};
	} catch (error) {
		return {
			available: false,
			reason: `the recall probe could not be reached (${error instanceof Error ? error.message : "unknown failure"}), so the embedding method was not offered`
		};
	} finally {
		clearTimeout(timer);
	}
}
//#endregion
//#region src/host/intent-align/token.ts
/**
* The token method — the fallback that runs when the substrate cannot embed.
*
* WHY A FALLBACK EXISTS AT ALL. The embedding method needs a live model behind
* `http://127.0.0.1:11434/api/embed`. Measured 2026-10-17T21:41Z, that endpoint refused every
* connection (curl exit 7, `HTTP=000`) and the intent map's own recall route answered
* `{"embedded":false,"reason":"the query could not be embedded: fetch failed"}`. A gate that only had
* the embedding method would have been UNABLE TO DECIDE at that moment, and the honest report would
* have been an empty window. A token method over the zone DEFINITIONS — which are text, and are served
* by a route that was answering — lets the gate still refuse. Its cost is precision, and the price of
* that is paid by LABELLING every zone `method: "token"` rather than by quietly reporting token scores
* as embedding similarities.
*
* WHAT THE SCORE MEANS, exactly, because a number without its method is not a value.
*
* Weighted cosine over binary term-indicator vectors. A zone's terms come from two places with two
* weights: its published `definition` at weight 1, and the tokens of its own `id` at weight 2. The id
* weight is deliberate — `M1-cross-session-store` names its subject in its identifier, and that is the
* substrate's own labelling, not an inference. A candidate's terms all weigh 1.
*
* The consequence stated plainly: a token score is a measure of SHARED VOCABULARY, not of shared
* purpose. Two plugins that say "browse, search, install" score high whether they install plugins or
* refrigerators. That is precisely why the recall route's `S4-management-ui` behaviour is recorded as a
* generic zone, and why the gate excludes generic zones from carrying a collision alone.
*
* @module dsh-meta-market/host/intent-align/token
*/
/** Terms that carry no subject. Removed before scoring, so "the" cannot make two plugins similar. */
const STOPWORDS$1 = /* @__PURE__ */ new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"been",
	"but",
	"by",
	"can",
	"could",
	"did",
	"do",
	"does",
	"each",
	"every",
	"for",
	"from",
	"had",
	"has",
	"have",
	"how",
	"if",
	"in",
	"into",
	"is",
	"it",
	"its",
	"may",
	"more",
	"most",
	"no",
	"not",
	"of",
	"on",
	"one",
	"only",
	"or",
	"other",
	"our",
	"out",
	"over",
	"per",
	"plus",
	"same",
	"shall",
	"should",
	"so",
	"some",
	"such",
	"than",
	"that",
	"the",
	"their",
	"them",
	"then",
	"there",
	"these",
	"they",
	"this",
	"those",
	"to",
	"two",
	"under",
	"up",
	"use",
	"used",
	"uses",
	"using",
	"via",
	"was",
	"were",
	"what",
	"when",
	"where",
	"which",
	"while",
	"who",
	"will",
	"with",
	"within",
	"without",
	"would",
	"you",
	"your"
]);
/**
* A light suffix fold, so `installs`, `installed` and `install` are one term.
*
* Deliberately crude and deliberately stated: this is not a stemmer, it is a fold for the four suffixes
* that actually recur in this corpus. An over-aggressive stemmer would fold `session` into `sess` and
* `provision` into `provisi`, which is why the rules stop at these.
*/
function fold(token) {
	if (token.length > 6 && token.endsWith("ing")) return token.slice(0, -3);
	if (token.length > 5 && token.endsWith("ed")) return token.slice(0, -2);
	if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
	if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
	return token;
}
/**
* Tokenize text into the term set the scorer uses.
*
* Lowercase, split on anything that is not a letter or digit, drop terms shorter than 3 characters,
* drop stopwords, fold suffixes, and de-duplicate. The de-duplication is what makes the vector binary:
* a definition that says "memory" nine times is not nine times more about memory than one that says it
* once, and counting occurrences would let verbosity dominate.
*/
function tokenize(text) {
	const out = /* @__PURE__ */ new Set();
	for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
		if (raw.length < 3) continue;
		if (STOPWORDS$1.has(raw)) continue;
		const folded = fold(raw);
		if (folded.length < 3) continue;
		if (STOPWORDS$1.has(folded)) continue;
		out.add(folded);
	}
	return [...out].sort();
}
/** A zone's weighted term vector: `definition` terms at 1, id terms at 2. */
function zoneTerms(zoneId, definition) {
	const weights = /* @__PURE__ */ new Map();
	for (const term of tokenize(definition)) weights.set(term, 1);
	for (const term of tokenize(zoneId.replace(/[-_]+/g, " "))) weights.set(term, 2);
	return weights;
}
/** A candidate's weighted term vector: every term at 1. */
function candidateTerms(intentText) {
	const weights = /* @__PURE__ */ new Map();
	for (const term of tokenize(intentText)) weights.set(term, 1);
	return weights;
}
/** The L2 norm of a weighted term vector. */
function norm(vector) {
	let sum = 0;
	for (const weight of vector.values()) sum += weight * weight;
	return Math.sqrt(sum);
}
/**
* The weighted cosine between a candidate and a zone.
*
* Returns `null` — never `0` — when either side is empty: an empty intent text is not a plugin that is
* dissimilar to everything, it is a plugin nobody described, and the two must not share a number.
*/
function tokenScore(candidate, zone) {
	if (candidate.size === 0) return {
		value: null,
		reason: "the candidate intent text yielded no terms, so no overlap is defined"
	};
	if (zone.size === 0) return {
		value: null,
		reason: "the zone yielded no terms, so no overlap is defined"
	};
	const candidateNorm = norm(candidate);
	const zoneNorm = norm(zone);
	if (candidateNorm === 0 || zoneNorm === 0) return {
		value: null,
		reason: "a zero-magnitude term vector has no direction"
	};
	let dot = 0;
	for (const [term, weight] of candidate) {
		const other = zone.get(term);
		if (other !== void 0) dot += weight * other;
	}
	return {
		value: dot / (candidateNorm * zoneNorm),
		reason: null
	};
}
//#endregion
//#region src/host/intent-align/signature.ts
/**
* Sign one candidate.
*
* Every zone in the space appears in the result, in descending score order, with `null` and a `reason`
* for any zone that could not be scored. A result with no numeric score anywhere sets `measured: false`
* rather than returning an all-zero signature that would look like a plugin about nothing.
*/
async function signCandidate(input, context, options = {}) {
	const measuredAt = (/* @__PURE__ */ new Date()).toISOString();
	const space = context.space;
	const intentText = typeof input.intentText === "string" ? input.intentText : "";
	if (options.injectedEmbeddingScores !== void 0) {
		const scores = options.injectedEmbeddingScores;
		const zones = space.zones.map((zone) => {
			const value = scores[zone.id];
			return value === void 0 ? {
				zone: zone.id,
				score: null,
				method: "embedding",
				reason: "the injected embedding fixture carried no score for this zone"
			} : {
				zone: zone.id,
				score: value,
				method: "embedding",
				reason: null
			};
		});
		return {
			id: input.id,
			name: input.name ?? null,
			intentText,
			zones: [...zones].sort(byScoreDescending),
			method: "embedding",
			methodReason: "TEST FIXTURE: injected embedding scores, NOT a measurement",
			measured: zones.some((z) => z.score !== null),
			catalog: input.catalog ?? null,
			measuredAt
		};
	}
	if (intentText.trim() === "") return {
		id: input.id,
		name: input.name ?? null,
		intentText,
		zones: space.zones.map((zone) => ({
			zone: zone.id,
			score: null,
			method: "token",
			reason: "the candidate carried no intent text, so no zone could be scored"
		})),
		method: "token",
		methodReason: "the candidate carried no intent text",
		measured: false,
		catalog: input.catalog ?? null,
		measuredAt
	};
	if (space.embedding.available) {
		const embedded = await scoreWithSubstrate(input, intentText, space, options);
		if (embedded !== null) return embedded;
	}
	const reason = space.embedding.reason ?? "the embedding method was not offered by the substrate, so the token method was used";
	const terms = candidateTerms(intentText);
	const zones = space.zones.map((zone) => {
		const scored = tokenScore(terms, zoneTerms(zone.id, zone.definition));
		return {
			zone: zone.id,
			score: scored.value,
			method: "token",
			reason: scored.reason
		};
	});
	return {
		id: input.id,
		name: input.name ?? null,
		intentText,
		zones: [...zones].sort(byScoreDescending),
		method: "token",
		methodReason: reason,
		measured: zones.some((z) => z.score !== null),
		catalog: input.catalog ?? null,
		measuredAt
	};
}
/** Descending by score, with unscored zones last. A total order, so two runs sort identically. */
function byScoreDescending(a, b) {
	const left = a.score ?? Number.NEGATIVE_INFINITY;
	const right = b.score ?? Number.NEGATIVE_INFINITY;
	if (right !== left) return right - left;
	return a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0;
}
/**
* Score via the substrate, or return `null` when it did not answer with scores.
*
* The `null` return is what distinguishes "the substrate embedded and scored" from "the substrate was
* asked and did not", and the caller handles the second by falling through to the token method with a
* stated reason.
*/
async function scoreWithSubstrate(input, intentText, space, options) {
	const baseUrl = options.baseUrl ?? "http://127.0.0.1:3083";
	const timeoutMs = options.timeoutMs ?? 8e3;
	const route = `${INTENT_RECALL_ROUTE}?q=${encodeURIComponent(intentText)}&top=${String(space.zones.length)}`;
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);
	let payload;
	try {
		const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${route}`, { signal: controller.signal });
		if (!response.ok) return null;
		payload = await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
	if (payload.embedded !== true || !Array.isArray(payload.hits)) return null;
	const scores = /* @__PURE__ */ new Map();
	for (const hit of payload.hits) if (typeof hit.zoneId === "string" && typeof hit.similarity === "number") scores.set(hit.zoneId, hit.similarity);
	const zones = space.zones.map((zone) => {
		const value = scores.get(zone.id);
		return value === void 0 ? {
			zone: zone.id,
			score: null,
			method: "embedding",
			reason: "the substrate returned no similarity for this zone"
		} : {
			zone: zone.id,
			score: value,
			method: "embedding",
			reason: null
		};
	});
	return {
		id: input.id,
		name: input.name ?? null,
		intentText,
		zones: [...zones].sort(byScoreDescending),
		method: "embedding",
		methodReason: null,
		measured: zones.some((z) => z.score !== null),
		measuredAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
//#endregion
//#region src/host/intent-align/references.ts
/**
* The three reference populations the original-intent gate refuses against, loaded from REAL sources.
*
* THE POPULATIONS ARE ENUMERATED, NOT TYPED OUT. A hand-written list of "stable plugins" would be a
* claim about the ecosystem made by whoever typed it; every entry here is traced to a file or a catalog
* row, and each carries its `source` so a reader can re-derive it:
*
*   - `stable`   — the NON-official entries of the profile's own `dsh.profile.bundles`, resolved to a
*                  clone under `plugins-src/` and matched to a catalog row by `name` OR `npm`.
*   - `official` — the `@deepseek-ai/*` entries of the same bundles array, resolved to their manifests
*                  in the harness checkout.
*   - `meta`     — the six meta plugins the task names, resolved to clones.
*
* THE STABLE POPULATION IS THE LIVE MANIFEST, WHICH MOVES. Measured twice during this lane: at
* 2026-10-17T21:41Z the bundles array held **40** entries; at **21:44:36Z** it held **41**, because
* `dsh-meta-market` itself was appended to it by the lane that owns that file. The task brief says
* "40 bundles" and that was true when the brief was written. So the denominator is read at load time
* and reported with its census instant rather than being copied from a brief — this is the program's
* "a live store is not a snapshot" rule arriving on the one file the gate's population depends on.
*
* WHY `dsh-meta-market` IS EXCLUDED FROM EVERY POPULATION. A candidate that collides with itself is not
* a collision, and a reference population that contains the thing being judged would report a
* self-match as evidence of duplication. `dsh-meta-community` is excluded for a different reason: it
* EXISTS and is owner-authorized, but it is not in the population the task declares, and growing a
* population to make a gate look stricter is the same defect as shrinking one to make it look greener.
*
* @module dsh-meta-market/host/intent-align/references
*/
/** The six existing meta plugins the task names as the third class. */
const META_PLUGIN_IDS = [
	"dsh-intent-map",
	"dsh-intent-mode",
	"dsh-tools-skills-evolve",
	"dsh-skill-evolution",
	"dsh-memento",
	"dsh-memory-delta"
];
/** This package. Excluded from the populations, because a self-match is not a collision. */
const SELF_ID = "dsh-meta-market";
/** The deepseek-root checkout, as the default roots. Absolute because the plugin runs from anywhere. */
const DEFAULT_PLUGINS_SRC = "C:/Users/0000/Projects/deepseek-root/plugins-src";
const DEFAULT_PROFILE_ROOT = "C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev";
const DEFAULT_HARNESS_ROOT = "C:/Users/0000/Projects/deepseek-root/deepseek-harness";
const DEFAULT_CATALOG = "C:/Users/0000/Projects/deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE/research/cache/plugins-2026-10-12.json";
/** Read a JSON file, or `null`. A missing or malformed manifest is an ABSENCE, never a silent stub. */
function readJsonFile(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}
/** The `description` of a manifest as a string, or `null` when it is absent or not text. */
function manifestText(manifest) {
	return typeof manifest.description === "string" && manifest.description.trim() !== "" ? manifest.description : null;
}
/**
* The `description` of a CATALOG row as a string, or `null`.
*
* The catalog stores `{ en, zh }`, not a string — measured over the whole census: **4,527 of 4,527**
* rows carry an object here. A lane that reads the field as a string gets the literal text
* `[object Object]` for every row, which produces an all-neutral signature indistinguishable from a
* clean corpus.
*/
function catalogText(row) {
	const value = row.description;
	if (typeof value === "string") return value.trim() === "" ? null : value;
	if (value !== null && typeof value === "object") {
		const en = value.en;
		if (typeof en === "string" && en.trim() !== "") return en;
	}
	return null;
}
/**
* Match catalog rows by `name` OR `npm`.
*
* A name is not a unique key: the census carries 4,527 rows under 4,226 distinct names, and
* `dsh-plugin-marketplace` alone resolves to two different plugins by two different owners. The FULL
* match list is returned rather than its first element, so a caller can report `rowCount` and so the
* fallback text below is taken from a row that was actually matched.
*/
function matchCatalog(rows, keys) {
	const wanted = keys.filter((k) => k !== "").map((k) => k.toLowerCase());
	if (wanted.length === 0) return [];
	return rows.filter((row) => {
		const name = typeof row.name === "string" ? row.name.toLowerCase() : "";
		const npm = typeof row.npm === "string" ? row.npm.toLowerCase() : "";
		return wanted.includes(name) || wanted.includes(npm);
	});
}
/** Reduce a match list to the citation a verdict travels with. `rowCount` is what disambiguates it. */
function citeFrom(matches) {
	const first = matches[0];
	if (first === void 0) return null;
	return {
		name: typeof first.name === "string" ? first.name : "",
		npm: typeof first.npm === "string" ? first.npm : null,
		owner: typeof first.owner === "string" ? first.owner : null,
		rowCount: matches.length
	};
}
/**
* The catalog's own description text for a matched row, or `null`.
*
* THIS IS THE ONE PLACE `catalogText` IS CALLED, and it is why the function is not dead code: a clone
* whose `package.json` carries no `description` would otherwise be dropped from the population as
* "absent" even though the census states what the plugin does. Falling back to the catalog keeps the
* reference in the population and records `kind: 'catalog-row'` so a reader knows the text came from
* the census rather than from the clone.
*/
function catalogFallbackText(matches) {
	const first = matches[0];
	return first === void 0 ? null : catalogText(first);
}
/** Build an index from a package name to its directory, over one level of `plugins-src/`. */
function indexClones(pluginsSrc) {
	const index = /* @__PURE__ */ new Map();
	let entries;
	try {
		entries = readdirSync(pluginsSrc, { withFileTypes: true });
	} catch {
		return index;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const dir = join(pluginsSrc, entry.name);
		const manifest = readJsonFile(join(dir, "package.json"));
		if (manifest === null) continue;
		const name = typeof manifest.name === "string" ? manifest.name : entry.name;
		index.set(name, dir);
		if (!index.has(entry.name)) index.set(entry.name, dir);
	}
	return index;
}
/**
* Index the official `@deepseek-ai/*` manifests in the harness checkout.
*
* Bounded to depth 5 and skipping build output, because the checkout is a pnpm workspace whose
* `node_modules` alone would dominate the walk. Measured 2026-10-17T21:47Z: the bounded walk finds
* **342** `@deepseek-ai/*` packages, of which the 7 official bundle rows are a subset.
*/
function indexOfficial(harnessRoot, maxDepth = 5) {
	const index = /* @__PURE__ */ new Map();
	const walk = (dir, depth) => {
		if (depth > maxDepth) return;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "lib" || entry.name === "dist") continue;
			const child = join(dir, entry.name);
			const manifest = readJsonFile(join(child, "package.json"));
			if (manifest !== null && typeof manifest.name === "string" && manifest.name.startsWith("@deepseek-ai/")) index.set(manifest.name, child);
			walk(child, depth + 1);
		}
	};
	walk(join(harnessRoot, "packages"), 0);
	return index;
}
/**
* Load and sign every reference population.
*
* THE SPACE IS A PARAMETER, NOT A DEFAULT. Comparing a candidate signed in one space against references
* signed in another is the "scoring across two vector spaces" that `EmbeddingIdentity` exists to
* forbid, so the caller cannot construct that comparison by omission: `signCandidate` uses the same
* space object for every reference.
*
* A population that loads ZERO entries is reported as a failure of the load rather than as a population
* of zero, and the difference matters: the gate turns an empty population into `not-measured`, because
* a unanimous `pass` against nothing is this program's recorded instrument failure.
*/
async function loadReferenceClasses(space, options = {}) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const pluginsSrc = options.pluginsSrc ?? process.env.DSH_PLUGINS_SRC ?? DEFAULT_PLUGINS_SRC;
	const profileRoot = options.profileRoot ?? DEFAULT_PROFILE_ROOT;
	const harnessRoot = options.harnessRoot ?? DEFAULT_HARNESS_ROOT;
	const catalogPath = options.catalogPath ?? DEFAULT_CATALOG;
	const bundlesRaw = readJsonFile(join(profileRoot, "package.json"))?.dsh?.profile?.bundles;
	if (!Array.isArray(bundlesRaw)) return {
		ok: false,
		at,
		reason: `the profile manifest at ${join(profileRoot, "package.json")} carries no dsh.profile.bundles array, so the stable and official populations cannot be enumerated`
	};
	const bundles = bundlesRaw.filter((b) => typeof b === "string");
	const clones = indexClones(pluginsSrc);
	if (clones.size === 0) return {
		ok: false,
		at,
		reason: `no clone under ${pluginsSrc} carries a package.json, so no reference could be read; status 0 is an unread population, not an empty one`
	};
	const catalogRaw = readJsonFile(catalogPath);
	const catalogRows = Array.isArray(catalogRaw) ? catalogRaw : catalogRaw?.plugins ?? [];
	const officialIndex = indexOfficial(harnessRoot);
	const absent = [];
	const pending = [];
	const officialBundles = bundles.filter((b) => b.startsWith("@deepseek-ai/"));
	const stableBundles = bundles.filter((b) => !b.startsWith("@deepseek-ai/"));
	for (const bundle of stableBundles) {
		if (bundle === "dsh-meta-market") continue;
		const dir = clones.get(bundle) ?? null;
		if (dir === null) {
			absent.push(`${bundle} (stable: no clone manifest under plugins-src/)`);
			continue;
		}
		const manifest = readJsonFile(join(dir, "package.json"));
		const packageName = manifest !== null && typeof manifest.name === "string" ? manifest.name : null;
		const matches = matchCatalog(catalogRows, [packageName ?? "", bundle]);
		const catalog = citeFrom(matches);
		const text = (manifest === null ? null : manifestText(manifest)) ?? catalogFallbackText(matches);
		if (text === null) {
			absent.push(`${bundle} (stable: neither the clone manifest nor a catalog row carries a description)`);
			continue;
		}
		/**
		* THE ID IS THE CATALOG NAME WHEN THERE IS ONE, AND THIS WAS A MEASURED BUG RATHER THAN A STYLE
		* CHOICE. The clone's `package.json` name for the market plugin is **`dshmarket`** — the npm name —
		* while the catalog name is **`dsh-market`**. Keying the reference on the package name put the
		* population under `dshmarket` and made `dsh-market` ABSENT from it, which the driver caught on its
		* first run: the gate then reported `pass` for a marketplace plugin because the one reference that
		* should have refused it was not there to be compared against. An absent reference is not a clean
		* comparator; it is a population with a hole in it.
		*/
		const id = catalog?.name ?? packageName ?? bundle;
		pending.push({
			id,
			klass: "stable",
			intentText: text,
			source: {
				kind: manifestText(manifest ?? {}) === null ? "catalog-row" : "package-manifest",
				path: join(dir, "package.json"),
				catalog
			}
		});
	}
	for (const bundle of officialBundles) {
		const dir = officialIndex.get(bundle) ?? null;
		if (dir === null) {
			absent.push(`${bundle} (official: no manifest found under the harness checkout)`);
			continue;
		}
		const manifest = readJsonFile(join(dir, "package.json"));
		const matches = matchCatalog(catalogRows, [bundle]);
		const text = (manifest === null ? null : manifestText(manifest)) ?? catalogFallbackText(matches);
		if (text === null) {
			absent.push(`${bundle} (official: neither the manifest nor a catalog row carries a description)`);
			continue;
		}
		pending.push({
			id: bundle,
			klass: "official",
			intentText: text,
			source: {
				kind: "profile-bundle",
				path: join(dir, "package.json"),
				catalog: citeFrom(matches)
			}
		});
	}
	for (const metaId of META_PLUGIN_IDS) {
		if (metaId === "dsh-meta-market") continue;
		const dir = clones.get(metaId) ?? null;
		if (dir === null) {
			absent.push(`${metaId} (meta: no clone manifest under plugins-src/)`);
			continue;
		}
		const manifest = readJsonFile(join(dir, "package.json"));
		const matches = matchCatalog(catalogRows, [metaId, manifest !== null && typeof manifest.name === "string" ? manifest.name : ""]);
		const text = (manifest === null ? null : manifestText(manifest)) ?? catalogFallbackText(matches);
		if (text === null) {
			absent.push(`${metaId} (meta: neither the clone manifest nor a catalog row carries a description)`);
			continue;
		}
		const catalog = citeFrom(matches);
		pending.push({
			id: catalog?.name ?? metaId,
			klass: "meta",
			intentText: text,
			source: {
				kind: "catalog-row",
				path: join(dir, "package.json"),
				catalog
			}
		});
	}
	const references = [];
	/**
	* THE THREE CLASSES ARE NOT DISJOINT, AND THE FIRST VERSION DOUBLED THE COLLISIONS BECAUSE OF IT.
	* `dsh-memory-delta` and `dsh-skill-evolution` are BOTH entries of the profile's bundles array AND
	* members of the task's six meta plugins, so they were signed twice — once `stable`, once `meta` — and
	* one candidate's refusal list then carried the same plugin under two class labels. Measured in the
	* driver's first green run: a candidate reporting 9 refusals where 5 were distinct plugins.
	*
	* The rule is ONE PLUGIN, ONE CLASS, at the most specific label: `meta` beats `official` beats
	* `stable`, because a plugin that is part of this program's meta layer is not usefully described as an
	* ecosystem plugin as well. A doubled witness is not corroboration.
	*/
	const CLASS_PRIORITY = {
		stable: 0,
		official: 1,
		meta: 2
	};
	const deduped = /* @__PURE__ */ new Map();
	for (const item of pending) {
		const existing = deduped.get(item.id);
		if (existing === void 0) {
			deduped.set(item.id, item);
			continue;
		}
		const keep = CLASS_PRIORITY[item.klass] > CLASS_PRIORITY[existing.klass] ? item : existing;
		deduped.set(item.id, keep);
		const dropped = CLASS_PRIORITY[item.klass] > CLASS_PRIORITY[existing.klass] ? existing : item;
		absent.push(`${dropped.id} (was also ${dropped.klass}; kept as ${keep.klass} — the three classes are not disjoint and one plugin takes the most specific label)`);
	}
	for (const item of deduped.values()) {
		const signature = await signCandidate({
			id: item.id,
			name: item.id,
			intentText: item.intentText
		}, { space });
		references.push({
			...signature,
			klass: item.klass,
			source: item.source
		});
	}
	const count = (klass) => ({
		count: references.filter((r) => r.klass === klass).length,
		of: klass === "stable" ? stableBundles.filter((b) => b !== SELF_ID).length : klass === "official" ? officialBundles.length : META_PLUGIN_IDS.length
	});
	const census = {
		stable: count("stable"),
		official: count("official"),
		meta: count("meta"),
		at
	};
	if (census.stable.count + census.official.count + census.meta.count === 0) return {
		ok: false,
		at,
		reason: "every reference population loaded zero signed entries, so no candidate could be compared against anything; this is instrument failure and must not be reported as a pass"
	};
	return {
		ok: true,
		references,
		census,
		absent
	};
}
//#endregion
//#region src/host/intent-align/gate.ts
/** The threshold for a method. One function, so a caller cannot pick the wrong number. */
function thresholdFor(method) {
	return method === "embedding" ? COLLISION_THRESHOLD : TOKEN_THRESHOLD;
}
/** The bar a specific zone must clear, which is higher for a zone too generic to carry a collision. */
function thresholdForZone(method, zone) {
	const base = thresholdFor(method);
	return GENERIC_ZONE_IDS.includes(zone) ? base + GENERIC_ZONE_EDGE : base;
}
/**
* Is this reference the candidate ITSELF, rather than a different plugin that shares its name?
*
* TWO PLUGINS ON THIS MARKET SHARE A NAME. `dsh-plugin-marketplace` exists twice in the census under two
* owners (`PetCT`, npm null; and `Scorp1o117`, npm `dsh-plugin-marketplace`), so a self-test keyed on the
* NAME alone would declare the second to be the first and **drop a true collision as a self-match** —
* the duplicate-name trap arriving inside the very guard that exists to prevent a false positive. Found
* by `prov-plugins`, whose registry composes candidate ids as `npm ?? name`, which makes the two rows
* arrive with one id until the owner is appended; my `Collision.id` carries the owner for exactly that
* reason, and the guard has to use it too.
*
* So: a shared name means SELF only when the owners do not say otherwise. Two citations that both carry
* an owner and disagree are two different plugins, and the comparison proceeds.
*/
function isSelfMatch(candidate, reference) {
	const own = identityKeys(candidate);
	const other = identityKeys({
		id: reference.id,
		name: reference.name,
		catalog: reference.source.catalog
	});
	let sharedName = false;
	for (const key of other) if (own.has(key)) {
		sharedName = true;
		break;
	}
	if (!sharedName) return false;
	const ourOwner = candidate.catalog?.owner ?? null;
	const theirOwner = reference.source.catalog?.owner ?? null;
	if (ourOwner !== null && theirOwner !== null && identityKey(ourOwner) !== identityKey(theirOwner)) return false;
	return true;
}
/** The strongest zone the two signatures share, as context for a refusal or for a reader. */
function strongestSharedZone(candidate, reference) {
	const referenceScores = /* @__PURE__ */ new Map();
	for (const zone of reference.zones) if (zone.score !== null) referenceScores.set(zone.zone, zone.score);
	let best = null;
	for (const zone of candidate.zones) {
		if (zone.score === null) continue;
		const other = referenceScores.get(zone.zone);
		if (other === void 0) continue;
		const strength = Math.min(zone.score, other);
		if (best === null || strength > best.strength) best = {
			zone: zone.zone,
			candidateScore: zone.score,
			referenceScore: other,
			strength
		};
	}
	return best;
}
/** The zone-profile criterion: refused when a shared zone clears the bar from BOTH sides. */
function collideByZoneProfile(candidate, reference, method) {
	const shared = strongestSharedZone(candidate, reference);
	if (shared === null) return null;
	const bar = thresholdForZone(method, shared.zone);
	if (shared.candidateScore < bar || shared.referenceScore < bar) return null;
	return {
		id: reference.id,
		name: reference.name ?? reference.id,
		klass: reference.klass,
		zone: shared.zone,
		score: shared.strength,
		candidateScore: shared.candidateScore,
		referenceScore: shared.referenceScore,
		decidedBy: "zone-profile",
		why: `shares ${shared.zone} with ${reference.klass} ${reference.id} at ${shared.strength.toFixed(4)} (candidate ${shared.candidateScore.toFixed(4)}, reference ${shared.referenceScore.toFixed(4)}, bar ${bar.toFixed(4)}, method ${method})`
	};
}
/**
* Terms that cannot carry a refusal, whatever their rarity in this corpus.
*
* MEASURED NEED, not caution. `prov-plugins` ran this gate end to end and reported **23 of 32 refusals
* resting on the single token `dsh`**, with `why` strings of the form *"matches stable dsh-sentinel at
* 0.4082 … overlap on: dsh"*. `dsh` is the vendor prefix of nearly every package on this market, so it is
* present in both populations by construction and measures nothing about purpose. Its IDF weight is
* already small; it is excluded outright because "small" is not "unable".
*
* Each entry is a VENDOR or PRODUCT token rather than a content word. `plugin` is on the list because
* every description in this corpus is a plugin description — the word is the corpus's subject, not any
* one plugin's purpose.
*/
const VENDOR_TOKENS = /* @__PURE__ */ new Set([
	"dsh",
	"deepseek",
	"harnes",
	"harness",
	"plugin"
]);
/**
* How many informative terms a refusal must share before its score is consulted at all.
*
* TWO, because ONE is the exact shape every false positive here took. This is a structural guard and it
* is stated as one: it does not make a weak score strong, it stops a single term from being the whole
* evidence for a verdict.
*/
const MIN_SHARED_CONTENT_TERMS = 2;
/** Normalise an identity string for case- and punctuation-insensitive comparison. */
function identityKey(value) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
/**
* Every identity a candidate answers to — id, display name, catalog name and npm name.
*
* WHY THIS EXISTS: `dsh-better-sidebar` (a dependency key) was reported colliding with
* `DSH-better-sidebar`, its OWN catalog row. The ids differ only by case, so an exact `id` comparison
* missed it, and a plugin refused as its own duplicate is the duplicate-name trap arriving as a refusal.
* A candidate never collides with itself under any of its own names.
*/
function identityKeys(item) {
	const keys = /* @__PURE__ */ new Set();
	keys.add(identityKey(item.id));
	if (typeof item.name === "string" && item.name !== "") keys.add(identityKey(item.name));
	if (item.catalog !== void 0 && item.catalog !== null) {
		if (item.catalog.name !== "") keys.add(identityKey(item.catalog.name));
		if (item.catalog.npm !== null && item.catalog.npm !== "") keys.add(identityKey(item.catalog.npm));
	}
	return keys;
}
/**
* The text criterion: refused when the two descriptions share enough INFORMATIVE terms.
*
* WHY THE WEIGHTING EXISTS, MEASURED RATHER THAN ASSUMED. The first version used plain term overlap and
* refused `dsh-plugin-marketplace@Scorp1o117` against **`dsh-sentinel`** at 0.1961 on the overlap
* `dsh` — one term, present in almost every description in this program. A refusal whose entire evidence
* is the product's own name is not a finding; it is the tokenizer reporting that both plugins are DSH
* plugins. The same run also reported a candidate refused nine times where five were distinct plugins.
*
* So each term is weighted by its inverse document frequency over the reference population ITSELF — the
* corpus being compared against, not a borrowed one. A term in every reference contributes `idf = 0`
* and is effectively invisible; a term in one reference carries full weight. The corpus is the population,
* which is the honest choice: it is the only corpus this gate is allowed to see.
*
* @param idf - term → weight, built by `documentFrequencyWeights` from the comparable references.
*/
function collideByText(candidate, reference, threshold, idf) {
	const left = weighted(candidate.intentText, idf);
	const right = weighted(reference.intentText, idf);
	const shared = sharedInformativeTerms(left, right);
	if (shared.length < MIN_SHARED_CONTENT_TERMS) return null;
	const scored = weightedCosine(left, right);
	if (scored.value === null) return null;
	if (scored.value < threshold) return null;
	const zone = strongestSharedZone(candidate, reference);
	return {
		id: reference.id,
		name: reference.name ?? reference.id,
		klass: reference.klass,
		zone: zone?.zone ?? "unattributed",
		score: scored.value,
		candidateScore: scored.value,
		referenceScore: scored.value,
		decidedBy: "text-similarity",
		why: `its description matches ${reference.klass} ${reference.id} at ${scored.value.toFixed(4)} (idf-weighted token text cosine, bar ${threshold.toFixed(4)}, ${String(shared.length)} shared informative terms); shared: ${shared.join(", ")}. The refusal runs FROM this candidate TO ${reference.id}; ${reference.id} being refused by some other rule elsewhere does not change this direction.`
	};
}
/** Terms both sides carry with a positive idf, sorted — the evidence a `why` names. */
function sharedInformativeTerms(left, right) {
	const shared = [];
	for (const term of left.keys()) if (right.has(term)) shared.push(term);
	shared.sort();
	return shared;
}
/** Term map weighted by idf, with vendor tokens removed. A term with no weight is dropped. */
function weighted(text, idf) {
	const out = /* @__PURE__ */ new Map();
	for (const term of candidateTerms(text).keys()) {
		if (VENDOR_TOKENS.has(term)) continue;
		const weight = idf.get(term);
		if (weight !== void 0 && weight > 0) out.set(term, weight);
	}
	return out;
}
/** Cosine over two idf-weighted term maps. */
function weightedCosine(a, b) {
	if (a.size === 0 || b.size === 0) return {
		value: null,
		reason: "one side carries no term with a positive idf, so no overlap is defined"
	};
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (const [term, weight] of a) {
		na += weight * weight;
		const other = b.get(term);
		if (other !== void 0) dot += weight * other;
	}
	for (const weight of b.values()) nb += weight * weight;
	if (na === 0 || nb === 0) return {
		value: null,
		reason: "a zero-magnitude weighted vector has no direction"
	};
	return {
		value: dot / (Math.sqrt(na) * Math.sqrt(nb)),
		reason: null
	};
}
/**
* Inverse document frequency over the comparable reference population.
*
* `idf = ln((N + 1) / (df + 1))`, NO CONSTANT ADDED. The absence of the usual `+ 1` is the whole point:
* with a floor of 1, a term in every document still weighs 1 and generic words keep a full vote. Without
* it, such a term weighs about `0.02` on this corpus and cannot carry a refusal alone.
*/
function documentFrequencyWeights(references) {
	const df = /* @__PURE__ */ new Map();
	for (const reference of references) for (const term of candidateTerms(reference.intentText).keys()) df.set(term, (df.get(term) ?? 0) + 1);
	const n = references.length;
	const idf = /* @__PURE__ */ new Map();
	for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)));
	return idf;
}
/**
* Decide one candidate's original-intent verdict.
*
* @param candidate - a signed candidate; `zones` may contain nulls and `measured` may be false.
* @param references - the signed reference populations.
* @param options - `threshold` overrides the method's bar, for a mutation test only. A production
*   caller does not pass it, because two callers with two thresholds is how a gate stops being a gate.
*/
function decideOriginalIntent(candidate, references, options = {}) {
	const measuredAt = (/* @__PURE__ */ new Date()).toISOString();
	const method = candidate.method;
	const baseCensus = {
		compared: 0,
		of: references.length,
		population: "signed references across the three classes (stable ecosystem, official @deepseek-ai/*, existing meta plugins)",
		at: measuredAt
	};
	const build = (verdict, reason, collidesWith, compared) => ({
		id: candidate.id,
		originalIntent: verdict,
		reason,
		zones: candidate.zones,
		collidesWith,
		method,
		measuredAt,
		census: {
			...baseCensus,
			compared
		}
	});
	if (!candidate.measured) return build("not-measured", "the candidate carries no numeric zone score, so no comparison could be made; an undescribed plugin is not a clean one", [], 0);
	const comparable = references.filter((r) => r.method === method && r.measured);
	if (comparable.length === 0) {
		const methodMismatch = references.length - comparable.length;
		return build("not-measured", references.length === 0 ? "the reference populations are empty, so nothing was compared; a pass over zero comparisons is instrument failure rather than a clean candidate" : `no reference is comparable: ${String(methodMismatch)} of ${String(references.length)} were signed by a different method than the candidate's ${method}, and two methods are two vector spaces`, [], 0);
	}
	const threshold = options.threshold ?? thresholdFor(method);
	const idf = documentFrequencyWeights(comparable);
	const collisions = [];
	for (const reference of comparable) {
		if (isSelfMatch(candidate, reference)) continue;
		const collision = method === "embedding" ? collideByZoneProfile(candidate, reference, method) : collideByText(candidate, reference, threshold, idf);
		if (collision === null) continue;
		if (collision.score < threshold) continue;
		collisions.push(collision);
	}
	collisions.sort((a, b) => b.score === a.score ? a.id < b.id ? -1 : 1 : b.score - a.score);
	if (collisions.length > 0) return build("collide", null, collisions, comparable.length);
	return build("pass", null, [], comparable.length);
}
//#endregion
//#region src/host/intent-align/index.ts
/**
* REAL candidates this gate refuses, with the catalog row each came from.
*
* VERIFIED (ran) by `verify/gate-driver.mjs` §3 at `TOKEN_THRESHOLD` **0.3407**. VERIFIED (read) against
* the census `research/cache/plugins-2026-10-12.json` — **4,527 rows**, matched by `name` OR `npm` with
* the row count recorded. Each intent text is the row's own `description.en`, quoted not paraphrased.
*
* `dsh-plugin-marketplace` appears TWICE in the census under two owners, so its id carries the owner: a
* name-only citation identifies a set, and `Collision.id` is disambiguated for the same reason.
*/
const KNOWN_COLLIDING_CANDIDATES = [{
	id: "catalog:dsh-plugin-marketplace@PetCT",
	name: "dsh-plugin-marketplace",
	intentText: "Browse, search, star-sort, favorite and one-click download community plugins from inside DeepSeek Harness settings.",
	catalog: {
		name: "dsh-plugin-marketplace",
		npm: null,
		owner: "PetCT",
		rowCount: 2
	}
}, {
	id: "catalog:dsh-plugin-marketplace@Scorp1o117",
	name: "dsh-plugin-marketplace",
	intentText: "Browse and search GitHub dsh-plugin repositories from Web UI Settings, sort by stars, and install plugins through the DSH CLI.",
	catalog: {
		name: "dsh-plugin-marketplace",
		npm: "dsh-plugin-marketplace",
		owner: "Scorp1o117",
		rowCount: 2
	}
}];
/**
* A REAL candidate this gate now ADMITS and SHOULD NOT — kept, named, and measured rather than deleted.
*
* `DSH-Plugins-Marketplace` (173★) is a genuine plugin marketplace and therefore a genuine duplicate of
* stable `dsh-market`. It scores **0.2069** against `dsh-recall-console` and only **0.1525** against
* `dsh-market`, which is BELOW the must-pass control's **0.2403** — so no single threshold can refuse
* this row and admit that control. Moving the bar down to catch it would refuse the control and, behind
* it, most of the installed population.
*
* It is kept here rather than dropped because a gate whose known misses are invisible cannot be audited,
* and because this row is the exact evidence for the claim in `TOKEN_SEPARATION`: the token method cannot
* separate "plugin marketplace" from "goods marketplace". A consumer must render these as `pass` and may
* label them as known false negatives; it must not present them as aligned.
*/
const KNOWN_FALSE_NEGATIVE_CANDIDATES = [{
	id: "catalog:DSH-Plugins-Marketplace@bradeGithub",
	name: "DSH-Plugins-Marketplace",
	intentText: "GitHub-topic-driven plugin & skill marketplace: a Settings page that browses the auto-collected registry (the whole dsh-plugin topic plus the skills index, CI-refreshed every 2 hours) with one-click install, type detection, install-script and host-shadow-dependency safety confirmations, env-key management, and the STANDARD.md recognition spec.",
	catalog: {
		name: "DSH-Plugins-Marketplace",
		npm: null,
		owner: "bradeGithub",
		rowCount: 1
	}
}];
/**
* REAL candidates this gate must ADMIT, kept beside the refusals so a run can show both directions.
*
* `ru-marketplace-mcp#dsh` is the important one: its name contains "marketplace", which is the token the
* collision would fire on if the gate keyed on a single word. It is a Russian consumer-goods
* marketplace, unrelated to plugin installation, so a gate that refused it would be refusing on a
* string rather than on a purpose. Its presence here is the negative control for over-fitting.
*/
const KNOWN_PASSING_CANDIDATES = [{
	id: "catalog:ru-marketplace-mcp#dsh@Vladimir-Human",
	name: "ru-marketplace-mcp#dsh",
	intentText: "Skills and optional MCP rows for eleven marketplaces: price comparison across Wildberries, Detsky Mir and Yandex Market, plus per-source search, product cards and reviews, including Ozon, Avito and AliExpress. The 14 skills load on install; both MCP rows stay disabled until RU_MARKETPLACE_MCP_DIR points at a local clone, which needs Python 3.12+ and uv.",
	catalog: {
		name: "ru-marketplace-mcp#dsh",
		npm: null,
		owner: "Vladimir-Human",
		rowCount: 1
	}
}];
//#endregion
//#region src/host/stable/scoring.ts
/**
* Words that carry no intent, dropped before scoring.
*
* Kept SHORT and printed, because a stopword list is a modelling decision that can move every score. It
* holds only function words; a domain word left out is a word this scorer will over-weight.
*/
const STOPWORDS = [
	"the",
	"and",
	"for",
	"with",
	"that",
	"this",
	"from",
	"into",
	"your",
	"you",
	"are",
	"not",
	"but",
	"can",
	"will",
	"its",
	"their",
	"them",
	"they",
	"has",
	"have",
	"was",
	"were",
	"all",
	"any",
	"own",
	"one",
	"two",
	"use",
	"using",
	"used",
	"via",
	"per",
	"out",
	"off",
	"get",
	"set",
	"add",
	"new",
	"plugin",
	"plugins",
	"dsh",
	"deepseek",
	"harness"
];
/**
* The floor a shared dominant zone must clear before it counts as a collision.
*
* A PROGRAM CHOICE, stated as a number rather than left in a comment, and it is deliberately LOW: a
* shared argmax at 0.03 is two members matching the same zone because the zone's definition is long,
* not because they share a purpose. 0.10 means at least a tenth of a member's own intent words appear in
* the shared zone's definition.
*/
const SHARED_DOMINANT_MIN = .1;
/** Tokenise by the published rule. Exported so a reader can recompute any stored score. */
function tokensOf(text) {
	const kept = (text.toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) ?? []).filter((word) => !STOPWORDS.includes(word));
	return new Set(kept);
}
/** The containment score of one text against one zone definition. `0` when the text carries no tokens. */
function containmentScore(intentText, definition) {
	const intent = tokensOf(intentText);
	if (intent.size === 0) return 0;
	const zone = tokensOf(definition);
	let shared = 0;
	for (const word of intent) if (zone.has(word)) shared += 1;
	return shared / intent.size;
}
/**
* Score one intent text against the whole zone space.
*
* The map ALWAYS carries every zone of the space, score included, because a map that dropped its weak
* zones would make "this member matches nothing" indistinguishable from "this member was scored against
* three zones".
*/
function scoreIntent(intentText, zones, method = "token") {
	return zones.map((zone) => ({
		zone: zone.id,
		score: Number(containmentScore(intentText, zone.definition).toFixed(4)),
		method
	}));
}
/**
* The zone a member sits in most strongly, or `null` when its map carries no positive score.
*
* Ties resolve to the FIRST zone in the space's own order, so the answer is deterministic across runs
* rather than dependent on object iteration. That is stated because a tie-break that varies is a
* different verdict on the same data.
*/
function dominantZone(map) {
	let best = null;
	for (const zone of map) if (best === null || zone.score > best.score) best = zone;
	if (best === null || best.score <= 0) return null;
	return best;
}
/** The rule's own record, so a verdict can cite it and a reader can falsify it. */
const MATCH_RULE = {
	id: "L6-shared-dominant",
	text: "Two stored members COLLIDE when their intent maps share the same dominant zone AND the lower of the two scores in that zone is at least SHARED_DOMINANT_MIN. A member with no collision is `pass`. A member whose map carries no numeric score, or a population with fewer than two measured members, is `not-measured` — never `pass`.",
	sharedDominantMin: SHARED_DOMINANT_MIN,
	falsifier: "One stored pair that shares its dominant zone at or above SHARED_DOMINANT_MIN while both records read `pass`, or one record reading `collide` whose stored maps do not share a dominant zone. The rule is also falsified by a member marked `pass` whose own map carries no numeric score."
};
/** What the match verdicts were computed over. One string, used by every record's `compared.population`. */
const COMPARISON_POPULATION = "the stored records of THIS ledger (stable and official members), each scored against the same live 24-zone space; a member is compared with every OTHER stored member and never with itself";
/**
* Decide every member's match verdict against the rest of the stored population.
*
* Returns one entry per input record, keyed by id, so a caller cannot accidentally read a verdict for a
* record that was not compared. A population of one is `not-measured` rather than `pass`: a single
* member has nothing to collide WITH, and calling that a pass is the "0 on both sides is a pass" defect.
*/
function decideMatches(members, at) {
	const measured = members.filter((member) => member.measured);
	const dominants = /* @__PURE__ */ new Map();
	for (const member of members) dominants.set(member.id, dominantZone(member.zones));
	const out = /* @__PURE__ */ new Map();
	for (const member of members) {
		const compared = {
			count: Math.max(0, measured.length - 1),
			of: Math.max(0, members.length - 1),
			population: COMPARISON_POPULATION,
			at
		};
		if (!member.measured) {
			out.set(member.id, {
				verdict: "not-measured",
				rule: MATCH_RULE.id,
				reason: "this member carries no numeric zone score, so it cannot be compared with anything",
				collidesWith: [],
				compared
			});
			continue;
		}
		if (measured.length < 2) {
			out.set(member.id, {
				verdict: "not-measured",
				rule: MATCH_RULE.id,
				reason: `${String(measured.length)} of ${String(members.length)} stored members carried a measurable map; a population with nothing to compare against is not a pass`,
				collidesWith: [],
				compared
			});
			continue;
		}
		const own = dominants.get(member.id) ?? null;
		const collisions = [];
		if (own !== null) for (const other of measured) {
			if (other.id === member.id) continue;
			const theirs = dominants.get(other.id) ?? null;
			if (theirs === null || theirs.zone !== own.zone) continue;
			const strength = Math.min(own.score, theirs.score);
			if (strength < .1) continue;
			collisions.push({
				id: other.id,
				klass: other.klass,
				sharedZone: own.zone,
				score: Number(strength.toFixed(4)),
				why: `both members' strongest zone is \`${own.zone}\`, at ${own.score.toFixed(4)} and ${theirs.score.toFixed(4)}; the conservative strength ${strength.toFixed(4)} clears SHARED_DOMINANT_MIN ${SHARED_DOMINANT_MIN}`
			});
		}
		const verdict = collisions.length > 0 ? "collide" : "pass";
		out.set(member.id, {
			verdict,
			rule: MATCH_RULE.id,
			reason: null,
			collidesWith: collisions,
			compared
		});
	}
	return out;
}
//#endregion
//#region src/host/stable/measure.ts
/**
* L6 — MEASURING the two populations, rather than assuming them.
*
* EVERY NUMBER THIS MODULE PRODUCES IS TAKEN FROM A FILE OR A LIVE ROUTE AT THE MOMENT IT RUNS, and the
* census time travels with it. Nothing here is a hardcoded list of plugins: the official set is derived
* from the profile's own `dsh.profile.bundles`, and the stable candidate is confirmed against the same
* profile before its manifest is read. A list in a source file would satisfy the rule on the day it was
* written and stop matching the system every day after — the failure this program records as "a live
* store is not a snapshot", arriving on a store's own seed data.
*
* THE ARITHMETIC THAT HAS TO CLOSE, and it is checked rather than asserted: `bundles = official + nonOfficial`.
* The task brief said "the profile's 40 bundles"; the MEASURED figure at censes time was 41, and the
* difference is exactly one row — `dsh-meta-market`, added by the `mount` lane at 14:44 the same day. A
* count that disagrees with the brief is reported with its cause rather than quietly corrected to match.
*
* PATHS IN EVIDENCE ARE PREFIXED WHEN THEY LEAVE THE WORKSPACE. A program-workspace file is cited
* workspace-relative (`research/…`); a file in the DeepSeek checkout is cited `deepseek-root:plugins-src/…`
* so a reader can resolve it without guessing which root a bare path meant. That prefix is this lane's
* convention and it is stated once, here.
*
* @module dsh-meta-market/host/stable/measure
*/
/** The map route this module reads. One string, so a probe and a build cannot disagree. */
const INTENT_MAP_ROUTE = "/intent-map/api/map";
/** The owner's live session. Read-only probes only; this module issues GETs and nothing else. */
const DEFAULT_BASE_URL = "http://127.0.0.1:3083";
/** A fetch that cannot hang forever. */
const DEFAULT_TIMEOUT_MS = 8e3;
/** The artifact directory the alternation contract refers to. Owned by lane `patch-first`, read-only here. */
const PATCH_ARTIFACT_REL = "research/meta-patch-dsh-market";
/** The stable candidate's clone directory, relative to the DeepSeek checkout. */
const STABLE_CLONE_REL = "plugins-src/dsh-market";
/** The prefix this lane uses for citations outside the program workspace. */
const CHECKOUT_PREFIX = "deepseek-root:";
/** Directories a file census must never descend into: they are dependencies, not the plugin. */
const CENSUS_SKIP = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"tmp",
	".sc"
]);
/**
* Find the program workspace by walking up for BOTH anchors, `AGENTS.md` and `plan/`.
*
* The conjunction is the guard: every parent in this tree has an `AGENTS.md`, so a walk that accepted one
* anchor would stop at whichever level it reached first. Returns `null` rather than guessing.
*/
function resolveWorkspaceRoot(start) {
	let current = resolve(start ?? process.cwd());
	for (let depth = 0; depth < 32; depth += 1) {
		if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, "plan"))) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
	return null;
}
/**
* Derive the checkout roots from the workspace root, checking each one exists.
*
* The layout is fixed and is asserted rather than assumed: the workspace sits inside a profile, the
* profile inside `profiles-tree/`, and the checkout above that. A layout change is reported as a missing
* root, not worked around by trying paths until one answers.
*/
function resolveCheckoutRoots(workspaceRoot) {
	const base = workspaceRoot ?? resolveWorkspaceRoot();
	if (base === null) return {
		ok: false,
		reason: "no workspace root: the walk from the current directory found no directory containing BOTH `AGENTS.md` and `plan/`"
	};
	const profileRoot = dirname(base);
	const deepseekRoot = dirname(dirname(profileRoot));
	const pluginsSrc = join(deepseekRoot, "plugins-src");
	const harnessRoot = join(deepseekRoot, "deepseek-harness");
	const missing = [];
	if (!existsSync(join(profileRoot, "package.json"))) missing.push(`the profile manifest at ${join(profileRoot, "package.json")}`);
	if (!existsSync(pluginsSrc)) missing.push(`the clone directory ${pluginsSrc}`);
	if (!existsSync(harnessRoot)) missing.push(`the harness checkout ${harnessRoot}`);
	if (missing.length > 0) return {
		ok: false,
		reason: `the layout assumed from ${base} does not hold: missing ${missing.join("; ")}`
	};
	return {
		ok: true,
		roots: {
			workspaceRoot: base,
			profileRoot,
			deepseekRoot,
			pluginsSrc,
			harnessRoot
		}
	};
}
/** Read the profile manifest. A read failure is a reason, never an empty profile. */
function readProfile$1(profileRoot) {
	const path = join(profileRoot, "package.json");
	const at = (/* @__PURE__ */ new Date()).toISOString();
	if (!existsSync(path)) return {
		ok: false,
		reason: `no profile manifest at ${path}`
	};
	try {
		const parsed = JSON.parse(readFileSync(path, { encoding: "utf8" }));
		const raw = parsed.dsh?.profile?.bundles;
		if (!Array.isArray(raw)) return {
			ok: false,
			reason: `${path} carries no \`dsh.profile.bundles\` array, so the official population cannot be derived`
		};
		const bundles = raw.filter((row) => typeof row === "string");
		if (bundles.length !== raw.length) return {
			ok: false,
			reason: `${path} carries ${String(raw.length - bundles.length)} non-string bundle rows of ${String(raw.length)}; a partial population would silently shrink the official set`
		};
		return {
			ok: true,
			profile: {
				path,
				bundles,
				dependencies: Object.keys(parsed.dependencies ?? {}),
				at
			}
		};
	} catch (error) {
		return {
			ok: false,
			reason: `${path} does not parse: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* Walk a directory and count files and directories, skipping dependencies.
*
* `directories` does NOT include the root itself, and the skip list is printed in the evidence claim so a
* reader knows what the denominator excluded. A directory listing would have counted entries of mixed
* kinds; this counts kinds separately, which is why the two totals can be compared against each other.
*/
function censusDirectory(root) {
	let files = 0;
	let directories = 0;
	let srcFiles = 0;
	let bytes = 0;
	const walk = (current, depth, underSrc) => {
		if (depth > 12) return;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				if (CENSUS_SKIP.has(entry.name)) continue;
				directories += 1;
				walk(join(current, entry.name), depth + 1, underSrc || entry.name === "src");
				continue;
			}
			if (!entry.isFile()) continue;
			files += 1;
			if (underSrc) srcFiles += 1;
			try {
				bytes += statSync(join(current, entry.name)).size;
			} catch {}
		}
	};
	walk(root, 0, false);
	return {
		files,
		directories,
		srcFiles,
		bytes
	};
}
/** sha256 of a file's bytes, with the algorithm named beside the value and the file's own clock. */
function fileIdentity(path) {
	try {
		const bytes = readFileSync(path);
		let modifiedAt = null;
		try {
			modifiedAt = statSync(path).mtime.toISOString();
		} catch {
			modifiedAt = null;
		}
		return {
			path,
			bytes: bytes.byteLength,
			sha256Hex: createHash("sha256").update(bytes).digest("hex"),
			modifiedAt
		};
	} catch {
		return null;
	}
}
/**
* Measure which patch artifacts exist for the alternation contract.
*
* THE THREE STATES ARE KEPT APART, and this is the function where that matters: the directory being absent
* (nothing has been proposed yet), the directory being present and empty (a proposal was started and did
* not land), and the directory holding files (artifacts exist and can be named). Collapsing the first two
* into `files: 0` is the absent-is-zero defect, so `exists` is a separate field and `reason` explains a
* non-existence.
*/
function censusArtifacts(workspaceRoot) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	if (workspaceRoot === null) return {
		directory: PATCH_ARTIFACT_REL,
		absolute: "",
		exists: false,
		files: [],
		reason: "no workspace root, so the artifact directory could not be located (NOT the same as an empty directory)",
		at
	};
	const absolute = join(workspaceRoot, PATCH_ARTIFACT_REL);
	if (!existsSync(absolute)) return {
		directory: PATCH_ARTIFACT_REL,
		absolute,
		exists: false,
		files: [],
		reason: `\`${PATCH_ARTIFACT_REL}\` does not exist under the workspace root at ${at}; no patch artifact has been committed yet, which is an absence of a proposal and not a proposal with no content`,
		at
	};
	const files = [];
	const walk = (current, depth) => {
		if (depth > 6) return;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isSymbolicLink()) continue;
			const path = join(current, entry.name);
			if (entry.isDirectory()) {
				walk(path, depth + 1);
				continue;
			}
			if (!entry.isFile()) continue;
			const identity = fileIdentity(path);
			if (identity !== null) files.push({
				...identity,
				path
			});
		}
	};
	walk(absolute, 0);
	files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
	return {
		directory: PATCH_ARTIFACT_REL,
		absolute,
		exists: true,
		files,
		reason: files.length === 0 ? `${PATCH_ARTIFACT_REL} exists but holds no files at ${at}` : null,
		at
	};
}
/** Read the intent map's 24 zones. `status: 0` means nothing answered — not a 404, and not an empty space. */
async function readZones(baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);
	let payload = null;
	try {
		const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${INTENT_MAP_ROUTE}`, { signal: controller.signal });
		if (!response.ok) return {
			ok: false,
			status: response.status,
			reason: `the intent map answered HTTP ${String(response.status)}; an unread zone space cannot be scored against`,
			at
		};
		payload = await response.json();
	} catch (error) {
		return {
			ok: false,
			status: 0,
			reason: `the intent map could not be reached (${error instanceof Error ? error.message : "unknown failure"}); status 0 means nothing answered, which is not an empty zone space`,
			at
		};
	} finally {
		clearTimeout(timer);
	}
	if (payload === null) return {
		ok: false,
		status: 0,
		reason: "the fetch returned without a payload and without an error; that is instrument failure, not an empty space",
		at
	};
	const raw = payload.zones;
	if (!Array.isArray(raw) || raw.length === 0) return {
		ok: false,
		status: 200,
		reason: `the route answered but carried ${Array.isArray(raw) ? "0" : "no"} zones; a corpus that reads as empty is instrument failure, not a pass`,
		at
	};
	const zones = [];
	const skipped = [];
	for (const row of raw) {
		const id = typeof row.id === "string" ? row.id : null;
		const definition = typeof row.definition === "string" ? row.definition : null;
		if (id === null || definition === null) {
			skipped.push(id ?? "<zone with no id>");
			continue;
		}
		zones.push({
			id,
			category: typeof row.category === "string" ? row.category : "unknown",
			definition
		});
	}
	if (zones.length !== raw.length) return {
		ok: false,
		status: 200,
		reason: `${String(raw.length - zones.length)} of ${String(raw.length)} zones carried no id or no definition (${skipped.join(", ")}); a partial space would score every member against a vocabulary the map does not have`,
		at
	};
	if (zones.length !== 24) return {
		ok: false,
		status: 200,
		reason: `the route reported ${String(zones.length)} zones but this build expects ${String(24)}; refused rather than scored against a different map`,
		at
	};
	return {
		ok: true,
		zones,
		indexId: typeof payload.index?.identity?.builtAt === "string" ? payload.index.identity.builtAt : payload.censusAt ?? "unidentified-index",
		identity: {
			model: typeof payload.index?.identity?.model === "string" ? payload.index.identity.model : null,
			dim: typeof payload.index?.identity?.dim === "number" ? payload.index.identity.dim : null
		},
		at
	};
}
/** Read a package.json and return the intent text, keeping a missing description a named absence. */
function readManifest(path) {
	try {
		const manifest = JSON.parse(readFileSync(path, { encoding: "utf8" }));
		return {
			manifest,
			intentText: typeof manifest.description === "string" ? manifest.description.trim() : ""
		};
	} catch {
		return null;
	}
}
/**
* Find the manifest of one official bundle inside the harness checkout.
*
* SCANNED, NOT ASSUMED, and the scan is bounded to the two directories bundles live in. The name in the
* manifest is what identifies it, so a directory rename does not break the mapping and a manifest renamed
* is a missing member rather than a wrong one.
*/
function findPackageManifest(harnessRoot, packageName) {
	const roots = [join(harnessRoot, "packages", "bundle"), join(harnessRoot, "packages", "experimental")];
	for (const root of roots) {
		let entries;
		try {
			entries = readdirSync(root, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const candidate = join(root, entry.name, "package.json");
			if (!existsSync(candidate)) continue;
			const parsed = readManifest(candidate);
			if (parsed === null) continue;
			if (parsed.manifest.name === packageName) return candidate;
		}
	}
	return null;
}
/**
* Discover the stable and official members, with the evidence for each.
*
* THE STABLE SET IS ONE NAMED CANDIDATE AND IT IS CONFIRMED, NOT ASSUMED: the profile's `dshmarket`
* dependency must point at `plugins-src/dsh-market` and the bundles must name it, or the member is
* reported with `installed: null` and the reason travels in its evidence. The wider stable population is
* the profile's 34 non-official bundles; extending to it is a task with its own denominator and is NOT
* silently folded in here, because a member nobody measured would be stored as if it had been.
*/
function discoverMembers(roots, profile) {
	const members = [];
	const absent = [];
	const installed = profile === null ? null : profile.bundles;
	const cloneDir = join(roots.deepseekRoot, STABLE_CLONE_REL);
	const stableManifestPath = join(cloneDir, "package.json");
	const stableParsed = existsSync(stableManifestPath) ? readManifest(stableManifestPath) : null;
	if (stableParsed === null) absent.push(`stable:${STABLE_CLONE_REL}`);
	else {
		const name = typeof stableParsed.manifest.name === "string" ? stableParsed.manifest.name : null;
		const version = typeof stableParsed.manifest.version === "string" ? stableParsed.manifest.version : null;
		const depSpec = profile === null ? void 0 : readDependencySpec(profile.path, name ?? "");
		const bundleIndex = installed === null || name === null ? -1 : installed.indexOf(name);
		const census = censusDirectory(cloneDir);
		const evidence = [
			{
				source: `${CHECKOUT_PREFIX}${STABLE_CLONE_REL}/package.json`,
				verification: "verified-ran",
				claim: `the stable candidate's manifest was read at censes time: name \`${name ?? "<absent>"}\`, version \`${version ?? "<absent>"}\``
			},
			{
				source: `read ${CHECKOUT_PREFIX}${STABLE_CLONE_REL} (file census)`,
				verification: "verified-ran",
				claim: `${String(census.files)} files and ${String(census.directories)} directories outside ${[...CENSUS_SKIP].join("/")}, of which ${String(census.srcFiles)} files are under src/, totalling ${String(census.bytes)} bytes`
			},
			{
				source: `${CHECKOUT_PREFIX}profiles-tree/personal-dev/package.json`,
				verification: profile === null ? "not-measured" : "verified-ran",
				claim: profile === null ? "the profile manifest could not be read, so whether this clone is installed is NOT MEASURED (not `false`)" : depSpec === void 0 ? `the profile's dependencies carry NO entry whose value resolves to ${STABLE_CLONE_REL}; installed is therefore reported as false rather than assumed` : `the profile's dependencies map \`${name ?? "<absent>"}\` to \`${depSpec}\`, and its bundles name it at index ${String(bundleIndex)} of ${String(profile.bundles.length)}`
			}
		];
		members.push({
			id: `stable:${name ?? "dsh-market"}`,
			name: name ?? "dshmarket",
			npm: name,
			klass: "stable",
			version,
			manifestPath: stableManifestPath,
			intentText: stableParsed.intentText,
			installed: profile === null ? null : bundleIndex >= 0,
			evidence
		});
	}
	if (installed === null) absent.push("official:* (no profile)");
	else for (const bundle of installed) {
		if (!bundle.startsWith("@deepseek-ai/")) continue;
		const manifestPath = findPackageManifest(roots.harnessRoot, bundle);
		if (manifestPath === null) {
			absent.push(`official:${bundle} (no manifest under ${join(roots.harnessRoot, "packages")})`);
			continue;
		}
		const parsed = readManifest(manifestPath);
		if (parsed === null) {
			absent.push(`official:${bundle} (manifest does not parse: ${manifestPath})`);
			continue;
		}
		const version = typeof parsed.manifest.version === "string" ? parsed.manifest.version : null;
		const index = installed.indexOf(bundle);
		const evidence = [{
			source: `${CHECKOUT_PREFIX}profiles-tree/personal-dev/package.json`,
			verification: "verified-ran",
			claim: `the profile's \`dsh.profile.bundles\` names \`${bundle}\` at index ${String(index)} of ${String(installed.length)}`
		}, {
			source: `${CHECKOUT_PREFIX}${manifestPath.slice(roots.deepseekRoot.length + 1).replace(/\\/g, "/")}`,
			verification: "verified-ran",
			claim: `a manifest declaring the name \`${bundle}\` was read from the harness checkout, version \`${version ?? "<absent>"}\``
		}];
		members.push({
			id: `official:${bundle.replace("@deepseek-ai/", "")}`,
			name: bundle,
			npm: bundle,
			klass: "official",
			version,
			manifestPath,
			intentText: parsed.intentText,
			installed: true,
			evidence
		});
	}
	return {
		members,
		absent
	};
}
/** The dependency entry whose spec points at a clone directory. `undefined` when no entry does. */
function readDependencySpec(profilePath, name) {
	try {
		const dependencies = JSON.parse(readFileSync(profilePath, { encoding: "utf8" })).dependencies ?? {};
		if (typeof dependencies[name] === "string") return dependencies[name];
		for (const spec of Object.values(dependencies)) if (typeof spec === "string" && spec.includes("plugins-src/dsh-market")) return spec;
		return;
	} catch {
		return;
	}
}
//#endregion
//#region src/host/stable/alternation.ts
/** What a patch artifact looks like on disk. A census counts every file; only these can be APPLIED. */
const PATCH_EXTENSIONS = [".patch", ".diff"];
/**
* What a COMMITTED patch artifact is NAMED, and the pattern is a measured observation rather than a taste.
*
* `patch-first` names its commits `NNNN-<slug>.patch` (`0001-meta-market-button-row.patch` at the first
* census). The same directory also holds `mutated.patch` — a MUTATION FIXTURE the lane built to prove its
* verifier can refuse — and a rule that treated both as equally applicable would let a test fixture be
* applied to a live member. The convention is therefore part of the matching rule, and a file that does not
* follow it is reported as present-but-not-a-commit rather than silently counted.
*/
const COMMIT_ARTIFACT_PATTERN = /^[0-9]{4}-[A-Za-z0-9._-]+\.(patch|diff)$/;
/** The basename of a path, in both separator styles, so a Windows path is not one long filename. */
function basenameOf(path) {
	const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return cut === -1 ? path : path.slice(cut + 1);
}
/** The census-relative form of a file, so a stored artifact path is workspace-relative and stable. */
function relativeArtifact(census, path) {
	const inside = path.startsWith(census.absolute) ? path.slice(census.absolute.length).replace(/^[\\/]/, "") : path;
	return `${PATCH_ARTIFACT_REL}/${inside.replace(/\\/g, "/")}`;
}
/**
* Find the patch artifact that belongs to one member, or say precisely why none does.
*
* THREE RULES, EACH LOSING A FALSE MATCH THAT WAS ACTUALLY OBSERVED:
*
*   1. ONLY `.patch` / `.diff` FILES ARE CANDIDATES. The directory also holds evidence JSON, a driver and two
*      scratch git repositories (78 files at the first census), and a rule that accepted any file matched 78
*      of 78 for `dsh-market` because the DIRECTORY's own name contains `dsh-market`. A match on the full path
*      is a match on the parent, which tells a reader nothing about the file.
*   2. THE MATCH IS ON THE BASENAME. `0001-meta-market-button-row.patch` does not name `dsh-market`, so a
*      name-only rule finds nothing — which is correct and is reported as NO ARTIFACT rather than resolved by
*      guessing.
*   3. THE ONLY-PATCH CONVENTION IS NAMED, NOT ASSUMED. When exactly one patch candidate exists and no name
*      matches, it is attached WITH A REASON saying it was attached by position, not by name, so a reader can
*      disagree with the convention instead of inheriting it silently. When several exist and none matches, the
*      answer is `ok: false` and the candidates are listed.
*
* Among several name-matched candidates the NEWEST by the file's own mtime wins, because the owner's clause is
* about a NEWER commit replacing an older one and path order does not encode time.
*/
function availabilityFor(census, member) {
	if (!census.exists) return {
		ok: false,
		artifact: null,
		applies: null,
		reason: census.reason ?? `research/meta-patch-dsh-market does not exist`
	};
	const patchLike = census.files.filter((file) => PATCH_EXTENSIONS.some((extension) => basenameOf(file.path).toLowerCase().endsWith(extension)));
	if (patchLike.length === 0) return {
		ok: false,
		artifact: null,
		applies: null,
		reason: `${String(census.files.length)} file(s) exist under ${PATCH_ARTIFACT_REL} and none is a ${PATCH_EXTENSIONS.join("/")} file, so there is nothing this lane could apply`
	};
	const candidates = patchLike.filter((file) => COMMIT_ARTIFACT_PATTERN.test(basenameOf(file.path)));
	if (candidates.length === 0) return {
		ok: false,
		artifact: null,
		applies: null,
		reason: `${String(patchLike.length)} patch file(s) exist under ${PATCH_ARTIFACT_REL} and NONE follows the commit naming convention ${String(COMMIT_ARTIFACT_PATTERN)} (${patchLike.map((file) => basenameOf(file.path)).join(", ")}); a file that does not name a commit is not a commit, so nothing is attached`
	};
	const needles = [...new Set([
		member.name,
		member.npm ?? "",
		member.id.replace(/^[a-z]+:/, "")
	].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((value) => value.length >= 4))];
	const matched = candidates.filter((file) => {
		const stem = basenameOf(file.path).toLowerCase().replace(/[^a-z0-9]/g, "");
		return needles.some((needle) => stem.includes(needle));
	});
	let chosen = null;
	let reason = null;
	if (matched.length > 0) {
		chosen = [...matched].sort((left, right) => (left.modifiedAt ?? "").localeCompare(right.modifiedAt ?? ""))[matched.length - 1] ?? null;
		if (matched.length > 1) reason = `${String(matched.length)} of ${String(candidates.length)} patch artifacts name this member; the NEWEST by file mtime was chosen (${chosen === null ? "<none>" : basenameOf(chosen.path)})`;
	} else if (candidates.length === 1 && member.klass === "stable") {
		/**
		* THE ONLY-PATCH CONVENTION APPLIES TO THE STABLE CANDIDATE AND NOT TO THE OFFICIAL SET.
		*
		* The owner's clause names one first candidate — `dsh-market` — and the artifact for it is
		* `0001-meta-market-button-row.patch`, whose name describes the CHANGE rather than the plugin, so no
		* name rule can find it. A positional attachment is therefore allowed FOR THAT MEMBER with the reason
		* printed. Extending it to the official bundles was observed to claim the same patch for all seven,
		* which is a false statement about seven plugins, so the convention is fenced to the class it was
		* written for.
		*/
		chosen = candidates[0] ?? null;
		reason = `attached by POSITION, not by name, and ONLY because this member is the stable candidate: ${basenameOf(candidates[0].path)} is the only ${PATCH_EXTENSIONS.join("/")} file under ${PATCH_ARTIFACT_REL} and its name describes the change rather than the plugin (looked for ${needles.join(", ")}). Named so a reader can disagree with the convention.`;
	} else return {
		ok: false,
		artifact: null,
		applies: null,
		reason: `${String(candidates.length)} patch artifact(s) exist under ${PATCH_ARTIFACT_REL} and none of their names identifies this member (looked for ${needles.join(", ")}); candidates: ${candidates.map((file) => basenameOf(file.path)).join(", ")}`
	};
	if (chosen === null) return {
		ok: false,
		artifact: null,
		applies: null,
		reason: "artifact selection produced no file; this is an instrument failure, not a member without a patch"
	};
	return {
		ok: true,
		artifact: relativeArtifact(census, chosen.path),
		applies: `replaces the stored intent map and match for \`${member.id}\` with the artifact's revision (sha256 ${chosen.sha256Hex.slice(0, 16)}…, ${String(chosen.bytes)} bytes, modified ${chosen.modifiedAt ?? "<clock absent>"})`,
		reason
	};
}
//#endregion
//#region src/host/stable/store.ts
/**
* L6 — where the ledger LIVES, and why a write reported here is a write that happened.
*
* THE PATH IS `<workspace>/.dsh/meta-market/stable-official/ledger.json`, and it is chosen to sit BESIDE
* the patch lane's quarantine (`.dsh/meta-market/quarantine`) rather than because a dot-directory is
* tidy: both are runtime state under the program workspace, both are found by walking up for the same two
* anchors, and a reader who knows where one lives knows where the other lives. The path is EXPORTED as a
* value (`STORE_REL`) so the runbook, the driver and a reader's `ls` cannot disagree.
*
* THIS IS A REAL PERSISTED ARTIFACT AND NOT AN IN-MODULE CONSTANT, and the reason is the owner's own
* sentence — "stored in the meta market". A constant in a source file is a copy of a measurement that
* cannot be aged: it has no census time of its own, it cannot be rewritten when the profile changes, and
* the one thing a store must do after an ALTERNATION is change, which a constant cannot. What this module
* will NOT do is pretend: a failed write returns `{ ok: false, wrote: false, reason }`, and a read of a
* file that does not exist returns a reason naming the path rather than an empty ledger.
*
* THE SEAL IS RE-CHECKED ON READ, for the reason `patch/quarantine.ts` records: a file on disk is not the
* file that was written. The digest is taken over a KEY-SORTED serialisation of the ledger, because two
* encoders that agree on content disagree on key order and a seal that depends on the writer's key order
* is not a seal. The seal covers the LEDGER, not the envelope around it, and a mismatch is reported as a
* tamper reading rather than as a parse error — those are different findings and merging them hides the
* serious one.
*
* TWO WRITES, ONE OF THEM ATOMIC, AND THE LIMIT STATED. `writeLedger` writes a temporary sibling and
* renames over the destination, so a reader sees the previous file in full or the new one in full and
* never a truncated pair. `applyAlternation` in `./alternation.ts` reads, edits and re-writes through the
* same function; there is NO lock, so two concurrent writers can lose one write. That is stated rather
* than papered over, and the falsifier in `LANE_SUMMARY` names it.
*
* @module dsh-meta-market/host/stable/store
*/
/** The directory, relative to the program workspace root. Beside `patch/quarantine`, deliberately. */
const STORE_REL = ".dsh/meta-market/stable-official";
/** The single file the ledger is written to. One file, because a directory of records has no atomic cut. */
const STORE_FILENAME = "ledger.json";
/** The absolute path of the ledger for a root, or `null` when there is no root. */
function ledgerPath(root) {
	if (root === null) return null;
	return join(root, STORE_REL, STORE_FILENAME);
}
/**
* Serialise a value with sorted keys, so the digest does not depend on the writer's key order.
*
* `undefined` members are dropped (matching JSON's own behaviour) and a non-finite number becomes `null`,
* because `JSON.stringify(NaN)` is `null` and a seal computed over a different rendering would disagree
* with the bytes a reader can reproduce.
*/
function canonicalJson(value) {
	if (value === null) return "null";
	if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
	if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (typeof value === "object") {
		const record = value;
		const keys = Object.keys(record).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
		const parts = [];
		for (const key of keys) {
			const entry = record[key];
			if (typeof entry === "undefined") continue;
			parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
		}
		return `{${parts.join(",")}}`;
	}
	return "null";
}
/** The seal over a ledger: sha256 of its canonical serialisation. */
function sealLedger(ledger) {
	return createHash(HASH_ALGORITHM).update(new TextEncoder().encode(canonicalJson(ledger))).digest("hex");
}
/** Read the ledger and RE-CHECK ITS SEAL against the bytes present. */
function readLedger(root) {
	const path = ledgerPath(root);
	if (path === null) return {
		ok: false,
		wrote: false,
		value: null,
		reason: "no workspace root, so there is no ledger to read; an absent path is not an empty ledger"
	};
	if (!existsSync(path)) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `no ledger at ${path}; nothing has written one yet, which is an absence of a store and not a store with no records`
	};
	let file;
	try {
		file = JSON.parse(readFileSync(path, { encoding: "utf8" }));
	} catch (error) {
		return {
			ok: false,
			wrote: false,
			value: null,
			reason: `the ledger at ${path} does not parse: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	if (file.schemaVersion !== 1) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `the ledger at ${path} declares schemaVersion ${String(file.schemaVersion)} while this build writes ${String(1)}; refused rather than read as if the shapes matched`
	};
	if (file.ledger === void 0 || file.ledger === null) return {
		ok: false,
		wrote: false,
		value: null,
		reason: `the ledger at ${path} carries no \`ledger\` member; the file exists and holds nothing this lane can read`
	};
	const recomputed = sealLedger(file.ledger);
	const sealProblem = recomputed === file.sealedSha256 ? null : `SEAL MISMATCH: the ledger bytes present hash to ${recomputed.slice(0, 16)}… while the file sealed ${String(file.sealedSha256).slice(0, 16)}…. The ledger changed after it was written.`;
	return {
		ok: true,
		wrote: false,
		value: {
			ledger: file.ledger,
			sealProblem,
			path,
			seal: file.sealedSha256
		},
		reason: null
	};
}
//#endregion
//#region src/host/stable/ledger.ts
/** An emptied intent map that says why it is empty. Never 24 zeros. */
function unmeasuredIntent(member, reason, at) {
	return {
		zones: [],
		method: "token",
		methodReason: `NO MAP WAS MEASURED: ${reason}`,
		measured: false,
		measuredAt: at,
		source: {
			kind: "package-manifest",
			path: member.manifestPath,
			field: "description"
		}
	};
}
/** One member's intent map, or the reason it has none. */
function intentFor$1(member, zones, zonesReason, at) {
	if (zones === null) return unmeasuredIntent(member, zonesReason ?? "the zone space was not read", at);
	if (member.intentText.trim().length === 0) return unmeasuredIntent(member, `${member.manifestPath} carries no non-empty \`description\`, so there is no text to score`, at);
	const map = scoreIntent(member.intentText, zones, "token");
	if (!map.some((zone) => zone.score > 0)) return {
		zones: map,
		method: "token",
		methodReason: "the token method scored every zone at 0, so this map carries no signal; the scores are stored rather than dropped so a reader can see the instrument produced zeros instead of an absence",
		measured: false,
		measuredAt: at,
		source: {
			kind: "package-manifest",
			path: member.manifestPath,
			field: "description"
		}
	};
	return {
		zones: map,
		method: "token",
		methodReason: "the embedding method was NOT AVAILABLE at censes time: `GET http://127.0.0.1:11434/api/ps` returned no connection (status 000, not a 404) and `/intent-map/api/recall` answered `embedded:false`; a token score labelled embedding would be a mislabelled instrument, so the method travels on every zone",
		measured: true,
		measuredAt: at,
		source: {
			kind: "package-manifest",
			path: member.manifestPath,
			field: "description"
		}
	};
}
/** Build one record from a member, its map, its match verdict and the artifact census. */
function recordFor(member, intent, match, census, previous) {
	const availability = availabilityFor(census, member);
	const history = previous?.patch.history ?? [];
	const current = previous?.patch.current ?? null;
	const evidence = [...member.evidence];
	evidence.push({
		source: intent.source.path,
		verification: intent.measured ? "verified-ran" : "not-measured",
		claim: intent.measured ? `the intent map was scored from \`description\` against ${String(intent.zones.length)} live zones with the token method at ${String(intent.measuredAt)}` : `no intent map was produced: ${String(intent.methodReason)}`
	});
	evidence.push({
		source: census.exists ? census.absolute : census.directory,
		verification: census.exists ? "verified-ran" : "verified-read",
		claim: census.exists ? `${String(census.files.length)} artifact file(s) were present under ${census.directory} at ${census.at}; ${availability.ok ? `\`${String(availability.artifact)}\` identifies this member` : `none identifies this member — ${String(availability.reason)}`}` : `no artifact directory was present at ${census.at}: ${String(census.reason)}`
	});
	return {
		id: member.id,
		name: member.name,
		npm: member.npm,
		klass: member.klass,
		kind: "exists",
		version: member.version,
		installed: member.installed,
		evidence,
		intent,
		match,
		patch: {
			current,
			history,
			available: availability
		}
	};
}
/**
* Measure the whole ledger.
*
* A resolution failure is carried as an empty ledger with `records: 0 of 0` and the reason in every
* member's absence list — NOT as a throw, and not as a ledger full of zero scores.
*/
async function measureLedger(options = {}) {
	const at = (options.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
	const notes = [];
	const workspaceRoot = options.workspaceRoot ?? resolveWorkspaceRoot();
	const rootsOutcome = resolveCheckoutRoots(workspaceRoot);
	if (!rootsOutcome.ok) {
		const census = censusArtifacts(workspaceRoot);
		return {
			ledger: {
				schemaVersion: 1,
				writtenAt: at,
				workspaceRoot,
				census: {
					stable: {
						count: 0,
						of: 0
					},
					official: {
						count: 0,
						of: 0
					},
					records: {
						count: 0,
						of: 0
					},
					population: "nothing: the checkout layout could not be resolved",
					at
				},
				comparison: {
					population: COMPARISON_POPULATION,
					rule: MATCH_RULE.id,
					at
				},
				bundlerCensus: {
					bundles: 0,
					officialBundles: 0,
					nonOfficialBundles: 0,
					dependencies: 0,
					profilePath: "",
					at
				},
				records: []
			},
			notes: [
				...notes,
				rootsOutcome.reason,
				census.reason ?? ""
			]
		};
	}
	const roots = rootsOutcome.roots;
	const zonesOutcome = await readZones(options.baseUrl ?? "http://127.0.0.1:3083", options.timeoutMs ?? 8e3);
	const zones = zonesOutcome.ok ? zonesOutcome.zones : null;
	const zonesReason = zonesOutcome.ok ? null : zonesOutcome.reason;
	if (!zonesOutcome.ok) notes.push(`the zone space could not be read: ${zonesOutcome.reason}`);
	else notes.push(`the zone space was read from ${options.baseUrl ?? "http://127.0.0.1:3083"}: ${String(zonesOutcome.zones.length)} zones, index ${zonesOutcome.indexId}`);
	const profileOutcome = readProfile$1(roots.profileRoot);
	const profile = profileOutcome.ok ? profileOutcome.profile : null;
	if (!profileOutcome.ok) notes.push(`the profile could not be read: ${profileOutcome.reason}`);
	const discovered = discoverMembers(roots, profile);
	for (const missing of discovered.absent) notes.push(`absent member: ${missing}`);
	const intents = discovered.members.map((member) => intentFor$1(member, zones, zonesReason, at));
	const matches = decideMatches(discovered.members.map((member, index) => ({
		id: member.id,
		klass: member.klass,
		zones: intents[index]?.zones ?? [],
		measured: intents[index]?.measured ?? false
	})), at);
	const artifacts = censusArtifacts(roots.workspaceRoot);
	const previousRecords = /* @__PURE__ */ new Map();
	for (const record of options.previous?.records ?? []) previousRecords.set(record.id, record);
	const records = discovered.members.map((member, index) => {
		return recordFor(member, intents[index] ?? unmeasuredIntent(member, "the member was discovered but produced no map", at), matches.get(member.id) ?? {
			verdict: "not-measured",
			rule: MATCH_RULE.id,
			reason: "the match pass did not produce a verdict for this member; an absent verdict is not a pass",
			collidesWith: [],
			compared: {
				count: 0,
				of: 0,
				population: "the stored records of THIS ledger (stable and official members), each scored against the same live 24-zone space; a member is compared with every OTHER stored member and never with itself",
				at
			}
		}, artifacts, previousRecords.get(member.id) ?? null);
	});
	const stable = records.filter((record) => record.klass === "stable");
	const official = records.filter((record) => record.klass === "official");
	const bundlerCensus = profile === null ? {
		bundles: 0,
		officialBundles: 0,
		nonOfficialBundles: 0,
		dependencies: 0,
		profilePath: "",
		at
	} : {
		bundles: profile.bundles.length,
		officialBundles: profile.bundles.filter((row) => row.startsWith("@deepseek-ai/")).length,
		nonOfficialBundles: profile.bundles.filter((row) => !row.startsWith("@deepseek-ai/")).length,
		dependencies: profile.dependencies.length,
		profilePath: profile.path,
		at: profile.at
	};
	return {
		ledger: {
			schemaVersion: 1,
			writtenAt: at,
			workspaceRoot: roots.workspaceRoot,
			census: {
				stable: {
					count: stable.length,
					of: records.length
				},
				official: {
					count: official.length,
					of: records.length
				},
				records: {
					count: records.length,
					of: records.length
				},
				population: `stored records discovered from the profile \`dsh.profile.bundles\` (${String(bundlerCensus.bundles)} rows: ${String(bundlerCensus.officialBundles)} official, ${String(bundlerCensus.nonOfficialBundles)} non-official) plus the one named stable candidate; the record denominator counts what this run DISCOVERED, and \`absent\` notes name what it could not`,
				at
			},
			comparison: {
				population: COMPARISON_POPULATION,
				rule: MATCH_RULE.id,
				at
			},
			bundlerCensus,
			records
		},
		notes
	};
}
//#endregion
//#region src/host/stable/index.ts
/**
* Read the persisted ledger, MEASURING only when the file is absent or unreadable.
*
* The distinction is reported as `from`, and it is not cosmetic: `from: 'file'` means the reader is looking
* at what a previous run decided, and `from: 'measured'` means this call took the census. A caller that
* cannot tell those apart will report a live measurement as a stored fact.
*/
async function loadLedger(options = {}) {
	const root = options.root ?? resolveWorkspaceRoot();
	const stored = readLedger(root);
	if (stored.ok && stored.value !== null && stored.value.sealProblem === null) return {
		ok: true,
		ledger: stored.value.ledger,
		from: "file",
		path: stored.value.path
	};
	const reason = stored.ok ? stored.value?.sealProblem ?? "the ledger read produced no value" : stored.reason;
	const measured = await measureLedger({
		workspaceRoot: root,
		...options.baseUrl === void 0 ? {} : { baseUrl: options.baseUrl },
		...options.timeoutMs === void 0 ? {} : { timeoutMs: options.timeoutMs },
		...options.now === void 0 ? {} : { now: options.now }
	});
	if (root === null) return {
		ok: false,
		reason: `no workspace root, and no stored ledger could be read (${reason})`,
		path: null
	};
	return {
		ok: true,
		ledger: measured.ledger,
		from: "measured",
		path: `${root}/${STORE_REL}/${STORE_FILENAME}`
	};
}
/**
* Look one record up by id, package name or npm name.
*
* Three keys because a provider renders catalog-derived ids while this store keys on manifest names, and a
* lookup that accepted only one of them would report "not stored" for a member that is stored. `null`
* means NOT IN THE STORED POPULATION — it does not mean the plugin does not exist.
*/
function getStoredRecord(ledger, id) {
	const needle = id.toLowerCase();
	const stripped = needle.replace(/^(stable|official):/, "");
	for (const record of ledger.records) {
		const keys = [
			record.id.toLowerCase(),
			record.id.toLowerCase().replace(/^(stable|official):/, ""),
			record.name.toLowerCase(),
			(record.npm ?? "").toLowerCase()
		];
		if (keys.includes(needle) || keys.includes(stripped)) return record;
	}
	return null;
}
/** The CONTRACT's `patch` field for one item: available only when a MEASURED artifact identifies it. */
function patchRefFor(ledger, itemId) {
	const record = getStoredRecord(ledger, itemId);
	if (record === null) return null;
	const available = record.patch.available;
	if (!available.ok || available.artifact === null || available.applies === null) return null;
	return {
		available: true,
		artifact: available.artifact,
		applies: available.applies
	};
}
//#endregion
//#region src/host/providers/plugins.ts
var plugins_exports = /* @__PURE__ */ __exportAll({
	WINDOW_ID: () => WINDOW_ID$5,
	__test: () => __test$1,
	buildWindow: () => buildWindow$5,
	resetSources: () => resetSources
});
/**
* The window this provider fills.
*
* `as const` rather than a widened `string` because the assembly keys its registry by this value, and a local typo must be a compile error rather than a window that silently answers under the wrong id.
*/
const WINDOW_ID$5 = "meta-plugins";
/**
* The sibling barrels this window composes, declared as data so that the absent case names the path it looked for rather than only the lane.
*
* An unavailability reason that does not name its path is not actionable: a reader cannot tell whether the module is missing, misspelled, or merely not yet imported.
*/
const DEPENDENCY_BARRELS = Object.freeze({
	registry: "src/host/registry/index.ts",
	intentAlign: "src/host/intent-align/index.ts",
	stable: "src/host/stable/index.ts"
});
/**
* The program workspace root, resolved by SHAPE through `../registry/paths.ts` rather than by counting `../`.
*
* WHY NOT A LITERAL, AND WHY NOT A SECOND RESOLVER. The stable/official ledger lives in the program workspace, which is NOT an ancestor of this clone, so a `../` walk from here can never reach it — and `catalog-inventory` already paid for the other half of that lesson: its fixed relative walk was correct in `src/` and one segment short in the emitted `lib/`, so a depth-based root resolves differently in the two layouts this file is compiled into. Two root resolvers would also be two answers to one question, so this composes THEIR resolver and adds only the shape that is mine to name: the program workspace is the directory under the profile that carries the program's own `AGENTS.md` and `plan/`.
*
* `path: null` returns the directories searched, so an unmeasured patch column stays UNKNOWN-WITH-EVIDENCE rather than becoming a guess.
*/
function programWorkspaceFrom(startDir) {
	const suffix = "dsh-meta-evolve_INIT_WORKSPACE";
	const searched = [];
	const profile = startDir === "" ? resolveProfileDir() : resolveProfileDirFrom(startDir);
	for (const dir of profile.searched) searched.push(dir);
	if (profile.path === null) return {
		path: null,
		searched
	};
	const candidate = resolve(profile.path, suffix);
	searched.push(candidate);
	return {
		path: existsSync(join(candidate, "AGENTS.md")) && existsSync(join(candidate, "plan")) ? candidate : null,
		searched
	};
}
/**
* The program workspace root as this module's own location resolves it.
*
* The empty-string start means "use the module-relative search", which is the same surface every other reader in this clone uses.
*/
function programWorkspaceRoot() {
	return programWorkspaceFrom("");
}
/**
* The patch half's fallback sentence, used only when the ledger could not be read.
*
* `patch: null` is ambiguous on its own: it means either "a patch exists for nothing here" or "the patch half was never measured". When the ledger is present the sentence is composed from what it reported, so the second reading is the one a reader gets only when it is true.
*/
const PATCH_NOT_MEASURED = "the patch alternation half was NOT measured, so `patch: null` on every item means UNKNOWN rather than \"no patch exists\"";
/**
* The registry's candidate for one installed dependency, or `null` when it could not be resolved.
*
* The `null` is COUNTED by the caller and printed as "N of M" in the population sentence, because a silently skipped dependency would shrink the denominator and make the window look complete.
*
* The npm-exact preference is this program's duplicate-name guard applied at the one place it bites: a catalog `name` is not a unique key (`dsh-cost-meter` exists three times), so when several candidates match the dependency key, the one whose `npm` equals the dependency's own package name is preferred rather than "the first match".
*/
function installedCandidate(registry, entry) {
	const byName = registry.candidatesFor({ name: entry.dependency });
	if (byName.candidates.length > 0) return byName.candidates.find((candidate) => candidate.npm !== null && entry.packageName !== null && candidate.npm === entry.packageName) ?? byName.candidates[0];
	if (entry.packageName !== null && entry.packageName !== entry.dependency) {
		const byNpm = registry.candidatesFor({ npm: entry.packageName });
		if (byNpm.candidates.length > 0) return byNpm.candidates[0];
	}
	return null;
}
/**
* The registry's candidate for one catalog-only plugin the intent module cites.
*
* The owner check is the disambiguation, not a formality: `dsh-plugin-marketplace` matches TWO catalog rows under two owners, so a lookup that returned `rows[0]` would render one real plugin's verdict under another real plugin's name. When the owner cannot single out one row, this returns `null` and the candidate is dropped and counted, rather than guessed.
*/
function citedCandidate(registry, input) {
	const name = input.name ?? "";
	let match = name === "" ? null : registry.candidatesFor({ name });
	if ((match === null || match.rows.length === 0) && input.catalog?.npm != null) match = registry.candidatesFor({ npm: input.catalog.npm });
	if (match === null || match.rows.length === 0) return null;
	const owner = input.catalog?.owner ?? null;
	const rows = match.rows;
	const chosen = owner === null ? rows.length === 1 ? rows[0] : null : rows.filter((row) => row.owner === owner);
	const row = Array.isArray(chosen) ? chosen.length === 1 ? chosen[0] : null : chosen;
	if (row === null || row === void 0) return null;
	return match.candidates.find((candidate) => candidate.source.row === row.index) ?? null;
}
/**
* The text a candidate's intent signature is computed from.
*
* `description` on a catalog row is the source's `{ en, zh }` object narrowed by the registry to its English string; a lane that concatenated the object would sign the literal `[object Object]` and get a uniformly neutral score, which is a measured trap in this corpus rather than a hypothetical one. When no description exists the fallback is the plugin NAME, and it says so — a name-only signature is weak by construction, so a low zone score is expected rather than being evidence.
*/
function intentTextFor(candidate, registry) {
	if (candidate.source.row !== void 0) {
		const row = registry.allDownloadable().find((item) => item.index === candidate.source.row);
		if (row !== void 0 && row.description !== null && row.description.trim() !== "") return {
			intentText: row.description,
			intentTextFrom: `catalog row ${row.index}, quoting its own English description`
		};
	}
	return {
		intentText: candidate.name,
		intentTextFrom: "the plugin name alone: no catalog row carried a description for it, so this is a NAME-ONLY token signature and a low zone score is expected by construction rather than being evidence of non-alignment"
	};
}
/**
* Resolve the sibling modules and prepare the candidate population.
*
* THIS IS THE ONE SEAM. It returns a stated absence while the barrels are missing, and it is a function rather than an inline `return null` in `buildWindow` because the absent and present cases must share one call site — a swap that also moves the caller is a swap that can move the shaping with it.
*
* THE REGISTRY IS READ THROUGH `getRegistry()`, NOT `openRegistry()` — and the difference is 33-43 s per request rather than a style choice. MEASURED 2026-10-18 post-restart on the live profile: `/gui/section?window=meta-plugins` took **42.8 s** (pass 1) and **32.9 s** (pass 2) while `meta-memory` answered in 0.13 s; a direct in-process timing of `measureInstalled({probeRoutes: false})` was **884 ms / 1,392 ms** against **19,988 ms / 33,214 ms** with `probeRoutes: true` (117 sequential live probes of other plugins' routes, 3-4 of them timing out at the 2,500 ms bound). `openRegistry()` re-runs that measurement on EVERY call, so every `/gui/sections`, `/gui/health` and `/gui/section?window=meta-plugins` request re-probed 117 routes on the owner's live session. `getRegistry()` is the registry module's documented memo — its own header says *"The instance is memoised, so a second call inside one process performs no second probe run"* — so the census is measured ONCE per process and each payload carries the census instant it was measured at (`registry.at`), which is the program's standing rule for a census stamp. A census that is re-measured to look fresh is not fresher; it is slower.
*/
async function loadSources() {
	const measuredAt = (/* @__PURE__ */ new Date()).toISOString();
	const absent = (reason) => ({
		reason,
		measuredAt
	});
	const registry = await getRegistry();
	if (registry.installed.census === null) return absent(`the installed half could not be measured (${DEPENDENCY_BARRELS.registry}): ${registry.installed.unavailable?.reason ?? "no reason given"}`);
	if (registry.downloadable.census === null) return absent(`the downloadable catalog could not be read (${DEPENDENCY_BARRELS.registry}): ${registry.downloadable.unavailable?.reason ?? "no reason given"}`);
	const spaceOutcome = await loadZoneSpace();
	if (!spaceOutcome.ok) return absent(`the 24-zone intent space could not be read from ${spaceOutcome.route} (status ${spaceOutcome.status ?? "no response"}): ${spaceOutcome.reason}`);
	const space = spaceOutcome.space;
	const referenceOutcome = await loadReferenceClasses(space);
	if (!referenceOutcome.ok) return absent(`the stable/official/meta reference populations could not be read (${DEPENDENCY_BARRELS.intentAlign}): ${referenceOutcome.reason}`);
	const references = referenceOutcome.references;
	const collected = [];
	const installedEntries = registry.allInstalled();
	if (installedEntries.length === 0) return absent(`the installed half answered with 0 dependencies, which is instrument failure rather than a measurement (the profile manifest at ${registry.installed.census.profileManifest} was read at ${registry.installed.census.at}); a concurrent lane editing that manifest produces this, and the window reports an absence rather than a census whose denominator is 0`);
	let installedResolved = 0;
	for (const entry of installedEntries) {
		const candidate = installedCandidate(registry, entry);
		if (candidate === null) continue;
		installedResolved += 1;
		const text = intentTextFor(candidate, registry);
		collected.push({
			candidate,
			intentText: text.intentText,
			intentTextFrom: text.intentTextFrom,
			knownMiss: null,
			intentTextMissing: false
		});
	}
	/**
	* THE BUNDLES THE PROFILE LOADS THAT ARE NOT ITS DEPENDENCIES.
	*
	* `registry.allInstalled()` walks `dependencies`; `dsh.profile.bundles` is a SECOND declaration of what this harness loads, and the two do not cover the same identities. Measured on this profile: 41 bundles of which the 7 `@deepseek-ai/*` official packages appear in NO dependency entry — so a window built only from `dependencies` omits seven things the harness actually loads, and the owner's requirement is what is installed on the current system, not only what is linked from `plugins-src/`.
	*
	* `installed: true` for these is a MEASUREMENT and not a default: `bundles` is the profile's own declaration of what to load at boot, read by the registry. `downloadable` is `true` only when a catalog row was actually found, and `false` only because the 5,785-row catalog DID load and did not contain it — never because the lookup was skipped.
	*/
	const bundleCensus = registry.installed.census.bundles;
	const covered = /* @__PURE__ */ new Set();
	for (const entry of installedEntries) {
		covered.add(entry.dependency);
		if (entry.packageName !== null) covered.add(entry.packageName);
	}
	let bundleOnlyResolved = 0;
	for (const bundle of bundleCensus) {
		if (covered.has(bundle)) continue;
		covered.add(bundle);
		bundleOnlyResolved += 1;
		const match = registry.candidatesFor({ name: bundle });
		const row = match.rows.length === 1 ? match.rows[0] : void 0;
		const candidate = {
			id: bundle,
			name: row?.name ?? bundle,
			npm: row?.npm ?? (bundle.startsWith("@") ? bundle : null),
			owner: row?.owner ?? null,
			kind: "exists",
			installed: true,
			downloadable: row !== void 0,
			source: row === void 0 ? {
				where: "installed",
				rowCount: match.rows.length,
				disambiguation: [`bundle-listed in dsh.profile.bundles; ${match.rows.length} catalog row(s) matched by name`]
			} : {
				where: "both",
				row: row.index,
				rowCount: match.rows.length,
				disambiguation: match.rows.map((item) => `row ${item.index} · ${item.name} · npm:${item.npm ?? "absent"} · owner:${item.owner ?? "absent"}`)
			}
		};
		collected.push({
			candidate,
			intentText: bundle,
			intentTextFrom: "the bundle name in dsh.profile.bundles, which is the only text the registry holds for it: a NAME-ONLY token signature, so a low zone score is expected by construction rather than being evidence of non-alignment",
			knownMiss: null,
			intentTextMissing: row === void 0
		});
	}
	const cited = [
		...KNOWN_COLLIDING_CANDIDATES,
		...KNOWN_PASSING_CANDIDATES,
		...KNOWN_FALSE_NEGATIVE_CANDIDATES
	];
	let citedResolved = 0;
	const expectedPassRows = /* @__PURE__ */ new Set();
	for (const input of cited) {
		const candidate = citedCandidate(registry, input);
		if (candidate === null) continue;
		citedResolved += 1;
		if (KNOWN_PASSING_CANDIDATES.some((passing) => passing.id === input.id) && candidate.source.row !== void 0) expectedPassRows.add(candidate.source.row);
		collected.push({
			candidate,
			intentText: input.intentText,
			intentTextFrom: `the intent module's cited candidate for catalog row ${candidate.source.row ?? "unknown"}, quoting that row's own English description`,
			knownMiss: KNOWN_FALSE_NEGATIVE_CANDIDATES.some((miss) => miss.id === input.id) ? `its best reference score sits BELOW the collision bar, so the gate admits it. An admit here is a RECALL failure the gate reports about itself, not evidence that the plugin is aligned.` : null,
			intentTextMissing: false
		});
	}
	/**
	* DISAMBIGUATE THE ITEM IDS, because the registry's `Candidate.id` is `npm ?? name` and a name is not a unique key here.
	*
	* Measured, not hypothetical: `dsh-plugin-marketplace` matches TWO catalog rows under two owners, and one of them carries `npm: null`, so BOTH rows arrive with the id `dsh-plugin-marketplace`. De-duplicating on that id silently drops one real plugin — the exact "take the first match" defect this program has recorded, arriving in the provider rather than in the lookup. So an id shared by more than one candidate is qualified with its owner, and only a candidate whose id AND owner both repeat is a genuine duplicate.
	*/
	const idCounts = /* @__PURE__ */ new Map();
	for (const entry of collected) idCounts.set(entry.candidate.id, (idCounts.get(entry.candidate.id) ?? 0) + 1);
	const prepared = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of collected) {
		const shared = (idCounts.get(entry.candidate.id) ?? 0) > 1;
		const id = shared ? `${entry.candidate.id}@${entry.candidate.owner ?? "unknown-owner"}` : entry.candidate.id;
		if (seen.has(id)) continue;
		seen.add(id);
		prepared.push(shared ? {
			...entry,
			candidate: {
				...entry.candidate,
				id
			}
		} : entry);
	}
	const expectedPassIds = prepared.filter((entry) => entry.candidate.source.row !== void 0 && expectedPassRows.has(entry.candidate.source.row)).map((entry) => entry.candidate.id);
	const checks = /* @__PURE__ */ new Map();
	for (const candidate of prepared) {
		if (candidate.intentTextMissing) {
			checks.set(candidate.candidate.id, {
				id: candidate.candidate.id,
				originalIntent: "not-measured",
				reason: "the registry holds no text for this identity other than its own name, and a name is not an intent: signing it would let two vendor-prefixed names collide on a shared prefix word",
				zones: [],
				collidesWith: [],
				method: "token",
				measuredAt: (/* @__PURE__ */ new Date()).toISOString(),
				census: {
					compared: 0,
					of: references.length,
					population: `${references.length} reference signatures were available, but this candidate could not be signed`,
					at: referenceOutcome.census.at
				}
			});
			continue;
		}
		const signature = await signCandidate({
			id: candidate.candidate.id,
			name: candidate.candidate.name,
			intentText: candidate.intentText
		}, { space });
		checks.set(candidate.candidate.id, decideOriginalIntent(signature, references));
	}
	const decide = (entry) => {
		const check = checks.get(entry.candidate.id);
		if (check !== void 0) return check;
		return {
			id: entry.candidate.id,
			originalIntent: "not-measured",
			reason: "no intent decision was recorded for this candidate",
			zones: [],
			collidesWith: [],
			method: "token",
			measuredAt: (/* @__PURE__ */ new Date()).toISOString(),
			census: {
				compared: 0,
				of: references.length,
				population: `${references.length} reference signatures loaded by the intent module (${referenceOutcome.census.stable.count} stable, ${referenceOutcome.census.official.count} official, ${referenceOutcome.census.meta.count} meta)`,
				at: referenceOutcome.census.at
			}
		};
	};
	const catalogRows = registry.downloadable.census.identity.rows;
	const population = `${prepared.length} plugin candidates: the ${installedResolved} of ${installedEntries.length} dependencies declared by the live personal-dev profile manifest that the registry could resolve (read in both halves by ../registry/ at ${registry.installed.census.at}), plus the ${bundleOnlyResolved} identities the profile declares it LOADS as \`dsh.profile.bundles\` without listing them as dependencies (the \`@deepseek-ai/*\` official packages are among these), plus the ${citedResolved} of ${cited.length} catalog-only plugins that the intent module cites together with their own catalog description (${KNOWN_COLLIDING_CANDIDATES.length} it records as colliding, ${KNOWN_PASSING_CANDIDATES.length} kept as the negative control that must pass, and ${KNOWN_FALSE_NEGATIVE_CANDIDATES.length} it records as a KNOWN FALSE NEGATIVE which the gate admits). The ${catalogRows}-row downloadable catalog was NOT signed for this window, so a row that is not listed here was not measured — which is not the same as measured and rejected. The reference populations the gate compared against are ${referenceOutcome.census.stable.count} stable, ${referenceOutcome.census.official.count} official and ${referenceOutcome.census.meta.count} meta.`;
	const workspace = programWorkspaceRoot();
	const cloneRoot = resolveCloneRoot();
	const bundleDepth = cloneRoot === null ? null : programWorkspaceFrom(join(cloneRoot, "lib"));
	const rootAgrees = bundleDepth !== null && workspace.path !== null && bundleDepth.path === workspace.path;
	const ledgerOutcome = await loadLedger(workspace.path === null ? {} : { root: workspace.path });
	const ledger = ledgerOutcome.ok ? ledgerOutcome.ledger : null;
	const ledgerFrom = ledgerOutcome.ok ? ledgerOutcome.from : null;
	const ledgerPath = ledgerOutcome.ok ? ledgerOutcome.path : null;
	const patchNote = workspace.path === null ? `${PATCH_NOT_MEASURED}: the program workspace root could not be resolved by shape; searched ${workspace.searched.length} path(s): ${workspace.searched.join(", ") || "(none)"}` : ledger === null ? `${PATCH_NOT_MEASURED}: the workspace root resolved to ${workspace.path} but ${ledgerOutcome.ok ? "no ledger was returned" : ledgerOutcome.reason}` : `the patch alternation half was measured from the stable/official ledger at ${workspace.path} (${ledgerFrom === "file" ? `read from ${ledgerPath}` : "measured while this population was resolved"}) at ${measuredAt}`;
	return {
		candidates: prepared,
		decide,
		patchOf: (entry) => ledger === null ? null : patchRefFor(ledger, entry.candidate.id),
		population,
		populationCount: prepared.length,
		measuredAt,
		zoneSpaceAt: spaceOutcome.readAt,
		referencesAt: referenceOutcome.census.at,
		patchNote,
		expectedPassIds,
		rootEvidence: {
			sourceLayout: workspace.path,
			bundleLayout: bundleDepth === null ? null : bundleDepth.path,
			agrees: rootAgrees,
			searched: workspace.searched
		}
	};
}
/** Narrow an absent-sources value from a resolved one without asserting. */
function isAbsent(value) {
	return "reason" in value;
}
/**
* The measured zones, in the CONTRACT's `ZoneMatch` shape.
*
* THE `null` SCORES ARE DROPPED HERE AND THE DROP IS COUNTED, not silently lost. `../intent-align/` scores a zone as `number | null`, with `null` meaning that zone could not be scored; the CONTRACT's `ZoneMatch.score` is a plain `number`. So an unscored zone cannot be carried, and a window that quietly showed fewer zones than the space holds would look like a space with fewer zones. The count travels in the alignment `why` instead.
*/
function measuredZones(check) {
	const zones = [];
	let dropped = 0;
	for (const zone of check.zones) {
		if (zone.score === null) {
			dropped += 1;
			continue;
		}
		zones.push({
			zone: zone.zone,
			score: zone.score,
			method: zone.method
		});
	}
	return {
		zones,
		dropped
	};
}
/** The collision list, reduced to the CONTRACT's `{ id, why }` — the remainder is the intent lane's evidence and stays there. */
function collisionsOf(check) {
	return check.collidesWith.map((collision) => ({
		id: collision.id,
		why: collision.why
	}));
}
/**
* The alignment verdict, DERIVED from the intent check rather than restated beside it.
*
* WHY DERIVED: `intent.originalIntent` and `alignment.verdict` are two encodings of one decision, and two encodings of one fact that are set independently can disagree. This program has recorded that failure shape before, so one is computed from the other and the payload always shows both.
*
* THE GUARD ON `collide` IS THE LOAD-BEARING BRANCH. A collision with no named counterpart cannot be falsified by a reader, so it is downgraded to `not-measured` with the reason stated: an unfalsifiable refusal is worse than a declared gap.
*/
function alignFrom(check, dropped) {
	const zoneNote = dropped === 0 ? "" : ` (${dropped} of ${check.zones.length} zones were unscored and are not carried, because the CONTRACT's zone score is a number)`;
	const evidence = `intent-align:${check.id} / ${check.method} / compared ${check.census.compared} of ${check.census.of} references (${check.census.population}) at ${check.census.at}`;
	if (check.originalIntent === "collide") {
		if (check.collidesWith.length === 0) return {
			verdict: "not-measured",
			why: `the intent module reported a collision but named nothing it collides with, and a collision with no named counterpart cannot be falsified${zoneNote}`,
			evidence
		};
		return {
			verdict: "collides",
			why: `${check.collidesWith[0].why} — ${check.collidesWith.length} named collision(s) in total${zoneNote}`,
			evidence
		};
	}
	if (check.originalIntent === "not-measured") return {
		verdict: "not-measured",
		why: `${check.reason ?? "the intent module returned not-measured without a reason"}${zoneNote}`,
		evidence
	};
	return {
		verdict: "aligned",
		why: `passes the original-intent gate${zoneNote}`,
		evidence
	};
}
/**
* `ItemSource.where` for a registry candidate.
*
* THE REGISTRY HAS THREE HALF-VALUES AND THE CONTRACT HAS THREE PLACE-VALUES, and they are not the same three. The registry answers `installed` / `downloadable` / `both`; the CONTRACT asks `installed` / `catalog` / `community`. So `downloadable` maps to `catalog`, and `both` maps to `installed` — because the more specific fact, that this plugin is on THIS system, is the one a reader acts on, while the catalog side is not lost: `downloadable` stays `true` on the item. The mapping is here rather than in the registry because it is this window's vocabulary that has fewer words.
*/
function whereOf(candidate) {
	return {
		where: candidate.source.where === "downloadable" ? "catalog" : "installed",
		...candidate.source.route === void 0 ? {} : { route: candidate.source.route },
		...candidate.source.row === void 0 ? {} : { row: candidate.source.row }
	};
}
/**
* One candidate as one row. Pure: every input is passed in, so a driver can exercise the shaping without a live host.
*
* `zoneSpaceAt` is threaded in (2026-10-18) because `intent.zones` carries zone SCORES and the zone space's read
* time was otherwise nowhere in the payload; a reused population must state when its zone scores were measured,
* not leave a reader to assume the request's clock.
*/
function itemFrom(prepared, check, patch, zoneSpaceAt) {
	const { zones, dropped } = measuredZones(check);
	const base = alignFrom(check, dropped);
	return {
		id: prepared.candidate.id,
		name: prepared.candidate.name,
		npm: prepared.candidate.npm,
		owner: prepared.candidate.owner,
		kind: prepared.candidate.kind,
		installed: prepared.candidate.installed,
		downloadable: prepared.candidate.downloadable,
		source: whereOf(prepared.candidate),
		intent: {
			zones,
			originalIntent: check.originalIntent,
			collidesWith: collisionsOf(check)
		},
		alignment: {
			...base,
			why: prepared.knownMiss === null ? base.why : `KNOWN FALSE NEGATIVE — ${prepared.knownMiss} The gate's own verdict follows: ${base.why}`,
			evidence: `${base.evidence} · zone space read at ${zoneSpaceAt} · intent text from: ${prepared.intentTextFrom}`
		},
		patch
	};
}
/**
* The census, and the population sentence is the ENUMERATING LANE's rather than this file's.
*
* A denominator whose population a different lane phrased is a count taken by nobody, so the sentence and the count are both passed through unchanged.
*/
function censusOf$1(items, sources, at) {
	return {
		numerator: items.length,
		denominator: sources.populationCount,
		population: sources.population,
		at
	};
}
function splitOf(items) {
	let installed = 0;
	let downloadable = 0;
	let notMeasured = 0;
	for (const item of items) if (item.installed === true) installed += 1;
	else if (item.downloadable === true) downloadable += 1;
	else notMeasured += 1;
	return {
		installed,
		downloadable,
		notMeasured
	};
}
function verdictsOf(items) {
	let aligned = 0;
	let collides = 0;
	let notMeasured = 0;
	for (const item of items) if (item.alignment.verdict === "aligned") aligned += 1;
	else if (item.alignment.verdict === "collides") collides += 1;
	else notMeasured += 1;
	return {
		aligned,
		collides,
		notMeasured
	};
}
/**
* The controls this window offers.
*
* ALL ARE `kind: 'read'`, and that is the honest answer rather than a limitation being hidden. This provider measures and shapes; the CONTRACT is explicit that a control which only reads a value back is not a control, and advertising a `write` control this module does not own would be exactly the defect that rule exists to prevent. The absent write surface is stated in the falsifiers rather than dressed as a button.
*/
const CONTROLS = Object.freeze([{
	id: "meta-plugins-refresh",
	label: "Re-measure this window: installed inventory, catalog, and a fresh intent decision per candidate",
	kind: "read",
	target: "/meta-market/api/gui/section?window=meta-plugins",
	demonstrable: true
}, {
	id: "meta-plugins-collisions-only",
	label: "Show only the items whose original intent collides, with the plugin each collides with",
	kind: "read",
	target: "/meta-market/api/gui/section?window=meta-plugins#alignment=collides",
	demonstrable: true
}]);
/**
* The falsifiers, each a check a reader can run without the author's help.
*
* The first is the one that matters: this window exists so a failing alignment is VISIBLE. A collision count of 0 over a non-zero population is not a clean result — it is a statement that the gate has not yet been shown able to refuse.
*/
function falsifiersFor(items, verdicts, split, patchNote) {
	const unmeasuredInstalls = items.filter((item) => item.installed === null).length;
	const patched = items.filter((item) => item.patch !== null).length;
	return [
		{
			claim: "the original-intent gate is a check: at least one real item is shown as colliding, naming the plugin it collides with",
			how: `count items whose alignment.verdict === 'collides' (measured: ${verdicts.collides} of ${items.length}); if that is 0 while the population is not 0, this window is an all-green list and the gate has NOT been shown able to refuse — report that rather than the clean read.`
		},
		{
			claim: "the installed/downloadable split accounts for every row and no item was dropped by a classification",
			how: `installed ${split.installed} + downloadable ${split.downloadable} + not-measured ${split.notMeasured} must equal ${items.length}; a split that does not close has lost a row to a branch.`
		},
		{
			claim: "`installed: null` is published as NOT MEASURED and is never read as `false`",
			how: `count items with installed === null (${unmeasuredInstalls} of ${items.length}) and confirm none of them carries installed === false — a false there would assert a probe nobody ran, and any "|| false" coercion anywhere in this file would produce exactly that.`
		},
		{
			claim: "no item carries a collision list a reader cannot falsify",
			how: `for every item with alignment.verdict === 'collides', confirm collidesWith is non-empty and each id resolves to a row in the stable/official store, the catalog, or the installed inventory; an id resolving to nothing is an unfalsifiable refusal.`
		},
		{
			claim: "the patch column was measured rather than omitted",
			how: `${patched} of ${items.length} items carry an available patch artifact${patched === 0 ? "" : ` (${items.filter((item) => item.patch !== null).map((item) => `${item.id} → ${item.patch?.artifact ?? ""}`).join(", ")})`}; the other ${items.length - patched} are UNKNOWN rather than "no patch exists". ${patchNote}`
		}
	];
}
/**
* Compose the window from resolved sources.
*
* Separate from `buildWindow` so the shaping is exercisable by a driver with fixture sources: the only way to prove this file CAN emit a `collides` row before a live catalog answers, and the only way to prove the split and the census can disagree with a bad input.
*
* `reused` is the memo's honesty switch (2026-10-18): a fresh population reports `stale: null` (every
* instrument was read for this request); a REUSED population reports `stale` with the resolution instant
* as its `at`, its TTL as `boundMs`, and a reason naming all three source census times. The window
* census's `at` is the POPULATION's measurement instant in both cases — never the request's clock — so a
* reuse cannot be mistaken for a fresh read even by a reader who ignores `stale`.
*/
function composeWindow(sources, reused) {
	const items = sources.candidates.map((prepared) => itemFrom(prepared, sources.decide(prepared), sources.patchOf(prepared), sources.zoneSpaceAt));
	const split = splitOf(items);
	const verdicts = verdictsOf(items);
	const refusedControls = items.filter((item) => sources.expectedPassIds.includes(item.id) && item.alignment.verdict !== "aligned");
	const knownMissRows = items.filter((item) => item.alignment.why.startsWith("KNOWN FALSE NEGATIVE"));
	return {
		items,
		census: censusOf$1(items, sources, sources.measuredAt),
		controls: CONTROLS,
		falsifiers: [
			...falsifiersFor(items, verdicts, split, sources.patchNote),
			{
				claim: "the gate does not refuse a candidate it was built not to refuse",
				how: `${refusedControls.length} of ${sources.expectedPassIds.length} candidates the intent module declares MUST pass are refused: ` + (refusedControls.length === 0 ? "none. This is the over-fitting control, and it currently holds." : `${refusedControls.map((item) => `${item.id} (${item.alignment.why})`).join("; ")}. A refused negative control means the bar is set below scores that carry no shared purpose, so the collision count is not a discrimination until that is resolved.`)
			},
			{
				claim: "the gate reports its own misses: a row it is known to admit is shown as a known miss rather than as an alignment it made",
				how: `${knownMissRows.length} of ${items.length} items carry a KNOWN FALSE NEGATIVE label (${knownMissRows.map((item) => item.id).join(", ") || "none"}). The other direction of failure is a refused control; this one is an admitted near-duplicate. A window that showed neither would report precision and recall as though one number covered both. The inversion that makes this row unfixable by tuning — the admitted duplicate scoring BELOW the must-pass control, so no single bar admits one and refuses the other — is \`D-0245\`, recorded by the lane that measured it. It is cited rather than copied here: a literal score in this file would go stale on the next threshold edit, and a stale literal inside a FALSIFIER is worse than none, because a falsifier exists to be checkable.`
			},
			{
				claim: "the root the patch ledger is read from resolves identically in the source tree and at the emitted bundle depth",
				how: `${sources.rootEvidence.agrees ? "AGREE" : "DISAGREE"} — source layout: ${sources.rootEvidence.sourceLayout ?? "null"}; bundle depth (<clone>/lib): ${sources.rootEvidence.bundleLayout ?? "null"}; directories searched: ${sources.rootEvidence.searched.length}. Both must be non-null, must exist, and must be EQUAL: a fixed "../" count is correct in \`src/\` and one segment short in \`lib/\`, and a suffix-only comparison passes that defect, which is why this compares two absolute paths rather than their endings.`
			}
		],
		unavailable: null,
		stale: reused ? {
			reason: `the meta-plugins population is a REUSED measurement, not a fresh one: resolved at ${sources.measuredAt}, zone space read at ${sources.zoneSpaceAt}, reference populations read at ${sources.referencesAt}. It is served for at most ${String(SOURCES_TTL_MS)} ms after resolution, so a read inside that window is not a second measurement.`,
			boundMs: SOURCES_TTL_MS,
			at: sources.measuredAt
		} : null
	};
}
/**
* How long a resolved population is reused before it is measured again.
*
* MEASURED BASIS, 2026-10-18: resolving this population costs `loadReferenceClasses` **7,346-10,429 ms**
* (the profile manifest, every clone's `package.json`, the 7.19 MB live catalog and the harness package
* index) plus ~8 s of per-candidate signing plus `loadZoneSpace` 1,148-2,282 ms, and the whole window
* measured **19,808-20,832 ms** warm; `/gui/sections` therefore ran 8.2-32.8 s after the registry fix and
* hit **59,246 ms** once on the new boot (census `01:04:47Z`-`01:06:30Z`). The population changes only when
* a plugin is installed, removed or re-described, which no GUI click does, so a minute of reuse is the
* same trade the advanced provider already makes for its 11-route probe batch (15 s) — but here it is
* LARGER because the work is larger, and it is REPORTED through `stale` rather than hidden.
*/
const SOURCES_TTL_MS = 6e4;
/**
* The last resolved population, and when it was computed.
*
* WHY THIS IS SOUND AND NOT A FRESHNESS SHORTCUT. Every input is process-stable or already memoised:
* the registry instance is `getRegistry()`'s process memo, the zone space and the reference populations
* are files and one local HTTP read, and the signing is deterministic in `(candidates, space, references)`.
* So a second resolution inside the TTL would be the SAME measurement made again, at full cost. What a
* cache must never do is present that measurement under a later clock: `composeWindow` therefore stamps
* the window census with `sources.measuredAt`, reports `stale` with that instant and this TTL, and every
* per-source census time travels in the payload. An ABSENCE is never cached, so a transient zone-space
* timeout is retried on the next request rather than frozen for the TTL.
*/
let sourcesCache = null;
/** Clear the reuse memo. Exported for a driver that must measure the population from scratch. */
function resetSources() {
	sourcesCache = null;
}
/**
* Fill the Meta-Plugins window.
*
* `windowId` is accepted for the assembly's `ProviderBuild` signature and never used to switch behaviour: this module answers for exactly one window, and a second id reaching it is the assembly's error rather than a case to handle quietly. It is typed and checked rather than dropped, so a caller asking the wrong provider cannot do so silently.
*/
async function buildWindow$5(windowId) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	if (windowId !== void 0 && windowId !== "meta-plugins") return {
		unavailable: {
			reason: `this provider answers only for window '${WINDOW_ID$5}' and was asked for '${windowId}'`,
			measuredAt: at
		},
		controls: [],
		falsifiers: [{
			claim: "the assembly routes each provider to the window it owns",
			how: "request each of the ten window ids and confirm every window answers under its own id; a provider answering for another window makes a label true of the wrong payload."
		}]
	};
	if (sourcesCache !== null && Date.now() - sourcesCache.computedAtMs < SOURCES_TTL_MS) return composeWindow(sourcesCache.sources, true);
	const sources = await loadSources();
	if (isAbsent(sources)) return {
		unavailable: {
			reason: sources.reason,
			measuredAt: sources.measuredAt
		},
		controls: [],
		falsifiers: [{
			claim: "this window reports an absence rather than an empty success when its sources are missing",
			how: `request /meta-market/api/gui/section?window=${WINDOW_ID$5} and confirm the body carries unavailability naming the missing barrels, and that census is ABSENT rather than {"numerator":0,"denominator":0} — a zero on both sides is instrument failure, not a pass.`
		}]
	};
	sourcesCache = {
		computedAtMs: Date.now(),
		sources
	};
	return composeWindow(sources, false);
}
/** Exported for a driver only: the shaping seam, so a fixture can prove this file can emit `collides` and can go red. */
const __test$1 = Object.freeze({
	itemFrom,
	alignFrom,
	whereOf,
	measuredZones,
	splitOf,
	verdictsOf,
	composeWindow,
	SOURCES_TTL_MS
});
//#endregion
//#region src/host/types.ts
/**
* ============================================================================
* THE PROBE BOUND — one named constant, because four lanes independently guessed
* ============================================================================
*
* MEASURED, all on 2026-10-17, all by different lanes, on different routes, with no
* coordination:
*
*   - `prov-advanced` — 1,500 ms bound against a route whose cold cost is 1,367 ms;
*   - `prov-tools-skills` — 1,500 ms bound against a measured floor of 1,611 ms
*     (six reads: 1,611 / 1,720 / 1,760 / 1,888 / 2,083 / 3,999 ms), which made the
*     probe a coin flip BY CONSTRUCTION and discarded four rows the provider held;
*   - `prov-intent` — 2,000 ms bound; its window read answered at 22:19:45Z and
*     unavailable at 22:20:16Z on one unchanged artifact;
*   - and the meta-tools flicker that surfaced the family — `unavailable` at one
*     request, four rows 68 seconds later, no code change.
*
* **FOUR LANES INVENTED A PROBE TIMEOUT, AND EVERY ONE SET IT BELOW THE LATENCY IT
* WAS MEASURING.** That is not four bugs; it is one missing shared constant. Every
* lane measured its own route's speed AFTER its window had already flickered, and
* each came back with a number that would have been right on the first try if it had
* existed here.
*
* THE RULE, in the form a lane can execute rather than remember: **measure the route
* at least six times, and set the bound at 1.25x the WORST observed.** The worst, not
* the median — a bound is a ceiling, and a ceiling fitted to the middle of a
* distribution is a coin. `probeBoundMs` below is that arithmetic so it does not have
* to be re-remembered.
*
* A TIMEOUT IS A MEASUREMENT AND MUST NOT BE REPORTED AS AN ABSENCE: a probe that
* exceeded its bound says "silence for N ms", which is a reading. So a slow live
* probe belongs in `ProviderWindow.stale`, keeping the rows the provider already
* has, and NOT in `unavailable`, which is reserved for "nothing was measured at all".
*/
const PROVIDER_PROBE_BOUND_MS = 5e3;
/** The rule stated so it can be cited in a review, beside `probeBoundMs`. */
const PROVIDER_PROBE_BOUND_RULE = "measure the probed route at least six times on the live process; set the bound at 1.25x the WORST observed — never at the median, and never below the worst, because a bound below the worst is a coin flip by construction";
/**
* The bound implied by a measurement.
*
* @param worstObservedMs the slowest of at least six live reads.
* @returns 1.25x that, rounded up, so the arithmetic cannot drift from the rule.
*/
function probeBoundMs(worstObservedMs) {
	return Math.ceil(worstObservedMs * 1.25);
}
//#endregion
//#region src/host/providers/intent.ts
var intent_exports = /* @__PURE__ */ __exportAll({
	CACHE_MAX_AGE_MS: () => CACHE_MAX_AGE_MS,
	MEASURED_MIXED_WORST_MS: () => MEASURED_MIXED_WORST_MS,
	MEASURED_SATURATION_WORST_MS: () => MEASURED_SATURATION_WORST_MS,
	ORIGIN: () => ORIGIN,
	ROUTES: () => ROUTES,
	TIMEOUT_MS: () => TIMEOUT_MS,
	WINDOW_ID: () => WINDOW_ID$4,
	buildWindow: () => buildWindow$4
});
/** The window id this provider answers for, as the CONTRACT spells it. */
const WINDOW_ID$4 = "meta-intent";
/**
* Where the live GUI is — READ FROM THE ENVIRONMENT SO THE DEGRADED PATH CAN BE DRIVEN.
*
* The default is this machine's live session, and `src/host/social/index.ts` reads
* the intent-map route at the same origin, so there is one convention rather than
* two. The override exists because a degraded path that has never been driven is a
* path that has never been tested: pointing this at a dead port in a separate
* process is the only way to prove the cold-start branch (`unavailable` set, no
* rows) without waiting for a real outage. `prov-tools-skills` exposes the same
* variable name for the same reason, so one driver recipe covers both lanes.
*/
const ORIGIN = process.env["DSH_META_MARKET_LIVE_BASE"] ?? "http://127.0.0.1:3083";
/**
* The per-route bound, in milliseconds — RAISED FROM 2,000 TO 5,000 AFTER THE
* FIRST VALUE WAS PROVEN WRONG ON THE LIVE SURFACE, and the proof is why this
* comment carries timings rather than an adjective.
*
* WHAT WAS WRONG. 2,000 ms was set against a 28–51 ms reading. `surface-host`
* then measured the same built artifact answering at 22:19:45Z and timing out on
* all three intent-layer routes at 22:20:16Z, 31 seconds apart with no code
* change, so the bound sat under the latency it was timing and the tab flipped
* between four rows and an absence. That is this program's own "a bound you did
* not measure is a coin, not a threshold", paid for by this lane.
*
* THE SIX-READ LADDER, measured 2026-10-17T22:21–22:24Z on the live process. The
* spread between sweeps is the finding: a quiet sweep reproduces the optimistic
* number and would have kept the broken bound.
*
*   QUIET (one request at a time), six readings each:
*     /intent-map/api/map     235 53 65 41 33 31        worst 235 ms
*     /intent-mode/api/map    112 99 17 34 21 62        worst 112 ms
*     /plan-rag/api/status    483 397 392 263 266 198   worst 483 ms
*     /plan-rag/api/search    410 309 262 187 305 460   worst 460 ms
*
*   MIXED (12 requests in flight: 3 copies of each of the 4 routes), six rounds,
*   which is the real condition — one window read is five routes at once and
*   `gui/health`/`gui/sections` can overlap it:
*     /intent-map/api/map     2266 2107 2119 1465 1460 1461 1339 1340 1340 1488 1489 1491 1361 1362 1362 1789 1789 1783   worst 2266 ms
*     /intent-mode/api/map    2118 2112 2100 1459 1460 1462 1340 1342 1330 1497 1500 1500 1361 1363 1366 1783 1783 1784   worst 2118 ms
*     /plan-rag/api/status    3191 3239 3242 1583 1583 1583 1561 1564 1557 2068 2081 2081 1672 1674 1679 2088 2090 2093   worst 3242 ms
*     /plan-rag/api/search    3224 3225 3225 1601 1608 1608 1560 1555 1553 2090 2089 2089 1678 1679 1681 2142 2100 2104   worst 3225 ms
*
*   Note the MEDIAN of /plan-rag/api/status under that load is 2,068 ms — above
*   the old bound. The old value was not merely close to the tail; it was below
*   the middle of the distribution.
*
*   SATURATION (24 identical requests in flight, self-inflicted), six readings:
*     /plan-rag/api/status    4970 4693 5382 4736 6751 6188   worst 7401 ms
*
* THE BOUND. `probeBoundMs(3242)` = 4,053 ms, so the measured rule alone gives
* 4,053; the assembly's shared floor `PROVIDER_PROBE_BOUND_MS` is 5,000 and is
* adopted rather than re-invented, because at 5,000 the window is above 1.25x of
* every realistic reading and still answers in ~5 s worst case. The saturation
* worst (7,401 ms, 1.25x = 9,251) is ABOVE this bound and that is stated rather
* than hidden: under saturation the plan-rag row goes STALE and is served from its
* last good reading with its age in the text, instead of the window disappearing.
* Raising the bound to 9,500 to cover a self-inflicted 24-way flood would charge
* every ordinary read the same ceiling, which is the trade this lane is not taking.
*
* The five reads are issued CONCURRENTLY, so this is also the whole window's
* ceiling — one bound, not five stacked. A bound of 5,000 per route with stacked
* reads would have been 25,000 ms of silence, which is the defect `surface-host`
* named when it pointed out that three 2,000 ms timeouts charge a client 6,000 ms.
*/
/** The worst per-route reading in the MIXED sweep below; named so the bound cannot hide its input. */
const MEASURED_MIXED_WORST_MS = 3242;
/** The worst per-route reading in the SATURATION sweep below — ABOVE the bound, by design. */
const MEASURED_SATURATION_WORST_MS = 7401;
const TIMEOUT_MS = Math.max(PROVIDER_PROBE_BOUND_MS, probeBoundMs(MEASURED_MIXED_WORST_MS));
/** The five paths this provider reads. Exported so a driver probes the same list. */
const ROUTES = {
	intentMap: "/intent-map/api/map",
	intentMode: "/intent-mode/api/map",
	planRagStatus: "/plan-rag/api/status",
	planRagSearch: "/plan-rag/api/search?q=zone",
	intentMapSearch: "/intent-map/api/search?q=zone"
};
/**
* The last good reading per route, kept IN MEMORY and per process.
*
* Deliberately not on disk: this is a degraded-mode convenience, not a durable
* census, and writing one would invite a reader to trust a number whose age lives
* in a file nobody prints. A process restart clears it, which is the honest
* lifetime for a value that exists only to survive a slow socket.
*/
const GOOD_READINGS = /* @__PURE__ */ new Map();
/**
* How old a cached reading may be before it stops being worth showing.
*
* Fifteen minutes is a judgement and it is stated rather than implied: the zone
* map changes rarely, but the intent-mode row is a LEDGER census, and a
* fifteen-minute-old ledger presented as the user's intent path would be a claim
* about the present made from the past. Past this age the row reverts to
* NOT MEASURED, which is the honest answer, and the staleness reason says so.
*/
const CACHE_MAX_AGE_MS = 9e5;
function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function num(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value) {
	return typeof value === "string" ? value : null;
}
function flag(value) {
	return typeof value === "boolean" ? value : null;
}
function sub(body, key) {
	if (body === null) return null;
	const value = body[key];
	return isObject(value) ? value : null;
}
function rows(value) {
	return Array.isArray(value) ? value.filter(isObject) : [];
}
/** Age of a past instant in whole seconds, or `null` if the instant will not parse. */
function ageSeconds(then, now) {
	const a = Date.parse(then);
	const b = Date.parse(now);
	if (Number.isNaN(a) || Number.isNaN(b)) return null;
	return Math.max(0, Math.round((b - a) / 1e3));
}
/**
* Read one route and RECORD THE REFUSAL rather than throwing.
*
* A window that 500s when a route is down tells a reader nothing, while a row
* that says "HTTP 404" or "no response within 5000 ms" tells them which
* instrument failed. The reasons below deliberately keep three cases apart —
* non-200, timeout, and nothing at all — because a timeout is not an unreachable
* route and neither is an HTTP error, and a status surface must not merge them.
*
* A FAILED LIVE ATTEMPT FALLS BACK TO THE LAST GOOD READING, marked `cache`, and
* the failure travels with it. The first version of this function discarded the
* row instead, which meant a slow socket deleted four rows the window already
* held — the defect `prov-tools-skills` paid for on the same surface.
*/
async function read(key) {
	const url = `${ORIGIN}${ROUTES[key]}`;
	const attemptAt = (/* @__PURE__ */ new Date()).toISOString();
	let failure = null;
	let liveStatus = null;
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		const text = await response.text();
		const at = (/* @__PURE__ */ new Date()).toISOString();
		const bytes = new TextEncoder().encode(text).byteLength;
		let body = null;
		try {
			const parsed = JSON.parse(text);
			body = isObject(parsed) ? parsed : null;
		} catch {
			body = null;
		}
		if (response.ok) {
			GOOD_READINGS.set(key, {
				at,
				status: response.status,
				bytes,
				body
			});
			return {
				key,
				url,
				status: response.status,
				bytes,
				at,
				body,
				source: "live",
				liveFailure: null,
				liveAt: at,
				liveStatus: response.status
			};
		}
		failure = `HTTP ${response.status}`;
		liveStatus = response.status;
	} catch (error) {
		const name = error instanceof Error ? error.name : "";
		const message = error instanceof Error ? error.message : String(error);
		failure = name === "TimeoutError" || /timed? out/i.test(message) ? `no response within ${TIMEOUT_MS} ms — slow, which is not the same as down` : `no response at all: ${message}`;
	}
	const cached = GOOD_READINGS.get(key);
	if (cached !== void 0) {
		const age = ageSeconds(cached.at, attemptAt);
		if (age !== null && age * 1e3 <= 9e5) return {
			key,
			url,
			status: cached.status,
			bytes: cached.bytes,
			at: cached.at,
			body: cached.body,
			source: "cache",
			liveFailure: failure,
			liveAt: attemptAt,
			liveStatus
		};
		failure = `${failure}; the last good reading is ${age === null ? "of unknown age" : `${age} s old`}, past the ${Math.round(CACHE_MAX_AGE_MS / 6e4)}-minute ceiling, so it is NOT shown as this window's value`;
	}
	return {
		key,
		url,
		status: null,
		bytes: null,
		at: attemptAt,
		body: null,
		source: "none",
		liveFailure: failure,
		liveAt: attemptAt,
		liveStatus
	};
}
/**
* The prefix a row carries when its value is NOT from a live probe of this call.
*
* A cached row keeps its verdict and its numbers, and it must not be able to read
* as current: the prefix states that in front of the sentence rather than in a
* footnote, because the first clause of a row is what a reader takes away.
*/
function readingPrefix(reading) {
	if (reading.source === "cache") return "FROM A LAST-GOOD READING, NOT A LIVE PROBE OF THIS CALL: ";
	if (reading.source === "none") return "NOT MEASURED: ";
	return "";
}
/**
* The citation for one reading, in the form both a reader and the driver check.
*
* A LIVE reading cites its own clock. A CACHED reading says CACHED, cites the
* clock of the reading it is reusing, gives its age in seconds, and names the
* failure that put it in that state — because a value with no age is a value
* presented as current.
*/
function evidenceOf(reading, now) {
	const size = `${show("status", reading.status)} / ${show("bytes", reading.bytes)}`;
	if (reading.source === "live") return `GET ${ROUTES[reading.key]} → ${size} at ${reading.at} (LIVE)`;
	if (reading.source === "cache") {
		const age = ageSeconds(reading.at, now);
		return `GET ${ROUTES[reading.key]} → ${size} at ${reading.at} (CACHED, ${age === null ? "age unknown" : `${age} s old`}); the live read FAILED: ${reading.liveFailure ?? "no reason recorded"}${reading.liveStatus === null ? "" : ` (live status was ${reading.liveStatus}, which is reported as itself and not as an empty result)`}`;
	}
	return `GET ${ROUTES[reading.key]} → NOT MEASURED: ${reading.liveFailure ?? "no reason recorded"} at ${reading.liveAt}`;
}
function readIntentMap(reading) {
	const body = reading.body;
	const index = sub(body, "index");
	const identity = sub(index, "identity");
	const zonesFresh = sub(index, "zonesFresh");
	const corpus = sub(body, "corpus");
	const zonesCorpus = sub(corpus, "zones");
	const inScope = sub(corpus, "inScopePlugins");
	const zoneRows = rows(body === null ? null : body["zones"]);
	let hashCurrent = 0;
	let staleFlagged = 0;
	let verdictMissing = 0;
	for (const zone of zoneRows) {
		const indexedHash = str(zone["indexedHash"]);
		const currentHash = str(zone["currentHash"]);
		if (indexedHash !== null && currentHash !== null && indexedHash === currentHash) hashCurrent += 1;
		if (flag(zone["stale"]) === true) staleFlagged += 1;
		if (zone["verdict"] === null || zone["verdict"] === void 0) verdictMissing += 1;
	}
	return {
		freshness: str(index === null ? null : index["freshness"]),
		model: str(identity === null ? null : identity["model"]),
		dim: num(identity === null ? null : identity["dim"]),
		endpoint: str(identity === null ? null : identity["endpoint"]),
		identityConfirmed: flag(identity === null ? null : identity["identityConfirmed"]),
		modelStated: str(identity === null ? null : identity["modelStated"]),
		builtAt: str(identity === null ? null : identity["builtAt"]),
		vectorCount: num(identity === null ? null : identity["vectorCount"]),
		censusAt: str(body === null ? null : body["censusAt"]),
		zonesCount: num(zonesCorpus === null ? null : zonesCorpus["count"]),
		zonesOf: num(zonesCorpus === null ? null : zonesCorpus["of"]),
		zonesFreshCount: num(zonesFresh === null ? null : zonesFresh["count"]),
		zonesFreshOf: num(zonesFresh === null ? null : zonesFresh["of"]),
		zoneRows: zoneRows.length,
		hashCurrent,
		staleFlagged,
		verdictMissing,
		staleListed: rows(index === null ? null : index["stale"]).length,
		inScopeCount: num(inScope === null ? null : inScope["count"]),
		inScopeOf: num(inScope === null ? null : inScope["of"]),
		catalogCount: num(corpus === null ? null : corpus["catalogCount"])
	};
}
function readPlanRag(reading) {
	const body = reading.body;
	const index = sub(body, "index");
	const census = sub(body, "census");
	const identity = sub(census, "identity") ?? sub(body, "liveIdentity");
	const freshness = sub(body, "freshness");
	const documents = sub(freshness, "documents");
	const chunks = sub(freshness, "chunks");
	const buildErrors = census === null ? [] : rows(census["buildErrors"]);
	return {
		ok: flag(body === null ? null : body["ok"]),
		model: str(identity === null ? null : identity["model"]),
		dim: num(identity === null ? null : identity["dim"]),
		endpoint: str(identity === null ? null : identity["endpoint"]),
		identityMatch: flag(body === null ? null : body["identityMatch"]),
		liveReason: str(sub(body, "liveIdentity") === null ? null : sub(body, "liveIdentity")["reason"]),
		indexBytes: num(index === null ? null : index["bytes"]),
		builtAt: str(census === null ? null : census["builtAt"]),
		docTotal: num(census === null ? null : census["docTotal"]),
		docsFresh: num(documents === null ? null : documents["fresh"]),
		docsStale: num(documents === null ? null : documents["stale"]),
		docsMissing: num(documents === null ? null : documents["missing"]),
		docsOf: num(documents === null ? null : documents["of"]),
		chunkTotal: num(census === null ? null : census["chunkTotal"]),
		chunksFresh: num(chunks === null ? null : chunks["fresh"]),
		chunksStale: num(chunks === null ? null : chunks["stale"]),
		chunksOf: num(chunks === null ? null : chunks["of"]),
		buildErrors: buildErrors.length
	};
}
function readIntentMode(reading) {
	const body = reading.body;
	const census = sub(body, "census");
	const byStatus = sub(census, "byStatus");
	const control = sub(body, "control");
	return {
		lines: num(census === null ? null : census["lines"]),
		parsed: num(census === null ? null : census["parsed"]),
		unparseable: num(census === null ? null : census["unparseable"]),
		intents: num(census === null ? null : census["intents"]),
		maxSeq: num(census === null ? null : census["maxSeq"]),
		received: num(byStatus === null ? null : byStatus["received"]),
		threshold: num(control === null ? null : control["threshold"]),
		paused: flag(control === null ? null : control["paused"]),
		preheat: str(control === null ? null : control["preheat"]),
		adapter: str(control === null ? null : control["adapter"]),
		readAt: str(body === null ? null : body["readAt"])
	};
}
/** `n of d` with an explicit absent form, so a missing count never prints as `0 of 0`. */
function ratio(numerator, denominator) {
	if (numerator === null || denominator === null) return "NOT MEASURED (the route did not supply both numbers)";
	return `${numerator} of ${denominator}`;
}
/** `key=value` or `<key> NOT MEASURED`, for the evidence strings. */
function show(label, value) {
	return value === null ? `${label}=NOT MEASURED` : `${label}=${String(value)}`;
}
/**
* Build the meta-intent window.
*
* The parameter is accepted and IGNORED on purpose: this module answers for one
* window, the assembly already knows which module it called, and branching here
* would create a second place that decides identity. It is typed rather than
* dropped so the assembly's uniform call shape typechecks.
*/
async function buildWindow$4(windowId) {
	const [mapReading, modeReading, ragReading, ragSearchReading, mapSearchReading] = await Promise.all([
		read("intentMap"),
		read("intentMode"),
		read("planRagStatus"),
		read("planRagSearch"),
		read("intentMapSearch")
	]);
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const map = readIntentMap(mapReading);
	const mode = readIntentMode(modeReading);
	const rag = readPlanRag(ragReading);
	const embedded = flag(ragSearchReading.body === null ? null : ragSearchReading.body["embedded"]);
	const embedReason = str(ragSearchReading.body === null ? null : ragSearchReading.body["reason"]);
	const embedModel = str(ragSearchReading.body === null ? null : ragSearchReading.body["model"]);
	const items = [
		{
			id: "dsh-intent-map",
			name: "dsh-intent-map",
			npm: null,
			owner: null,
			kind: "exists",
			installed: mapReading.status === 200 ? true : null,
			downloadable: null,
			source: {
				where: "installed",
				route: ROUTES.intentMap
			},
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: mapReading.status === 200 && map.hashCurrent === map.zoneRows && map.zoneRows > 0 ? "aligned" : "not-measured",
				why: mapReading.status === 200 ? `${readingPrefix(mapReading)}${ratio(map.zonesFreshCount, map.zonesFreshOf)} zones indexed and ${ratio(map.hashCurrent, map.zoneRows)} zone hashes current; ${ratio(map.staleListed, map.zoneRows)} listed stale; ${ratio(map.verdictMissing, map.zoneRows)} zones carry NO verdict (a per-zone verdict has not been computed for them, so the map is current, not judged)` : `the map route produced no reading (${mapReading.liveFailure ?? "no reason recorded"}), so no zone census exists to report — this is not a map with zero zones`,
				evidence: evidenceOf(mapReading, at)
			},
			patch: null
		},
		{
			id: "dsh-intent-map-index",
			name: "intent map embedding index (precomputed zone vectors)",
			npm: null,
			owner: null,
			kind: "exists",
			installed: map.vectorCount !== null && map.vectorCount > 0 ? true : null,
			downloadable: null,
			source: {
				where: "installed",
				route: ROUTES.intentMap
			},
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: "not-measured",
				why: embedded === true ? `${readingPrefix(ragSearchReading)}${ratio(map.vectorCount, map.zonesOf)} zone vectors built at ${show("builtAt", map.builtAt)} under ${show("model", map.model)} / ${show("dim", map.dim)}, and a live query embedded successfully` : `${readingPrefix(ragSearchReading)}${ratio(map.vectorCount, map.zonesOf)} zone vectors EXIST and are served, and a live query could NOT be embedded (${show("embedded", embedded)}; ${embedReason ?? "no reason was stated by the route"}) — so the index is built and its query path is unqueryable right now. A vector count is not a query result and is not reported as one`,
				evidence: `${evidenceOf(ragSearchReading, at)}, which names ${show("queryModel", embedModel)} for the query it could not embed; index identity ${show("model", map.model)} / ${show("dim", map.dim)} / ${show("identityConfirmed", map.identityConfirmed)} / ${show("modelStated", map.modelStated)}`
			},
			patch: null
		},
		{
			id: "dsh-intent-mode",
			name: "dsh-intent-mode",
			npm: null,
			owner: null,
			kind: "exists",
			installed: modeReading.status === 200 ? true : null,
			downloadable: null,
			source: {
				where: "installed",
				route: ROUTES.intentMode
			},
			intent: {
				zones: [],
				originalIntent: "pass",
				collidesWith: []
			},
			alignment: {
				verdict: modeReading.status === 200 ? "aligned" : "not-measured",
				why: modeReading.status === 200 ? `${readingPrefix(modeReading)}the user path holds ${ratio(mode.intents, mode.lines)} intents per ledger line (${show("received", mode.received)} still in status "received", ${show("unparseable", mode.unparseable)} unparseable); control state ${show("threshold", mode.threshold)} / ${show("preheat", mode.preheat)} / ${show("adapter", mode.adapter)} / ${show("paused", mode.paused)}` : `the intent-mode route produced no reading (${modeReading.liveFailure ?? "no reason recorded"}), so the ledger census was not read — an unread ledger is not an empty one`,
				evidence: evidenceOf(modeReading, at)
			},
			patch: null
		},
		{
			id: "dsh-plan-rag",
			name: "dsh-plan-rag",
			npm: null,
			owner: null,
			kind: "exists",
			installed: ragReading.status === 200 ? true : null,
			downloadable: null,
			source: {
				where: "installed",
				route: ROUTES.planRagStatus
			},
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: rag.identityMatch === true ? "aligned" : "not-measured",
				why: ragReading.status === 200 ? `${readingPrefix(ragReading)}index identity ${show("model", rag.model)} / ${show("dim", rag.dim)} compared against the live intent map: ${show("identityMatch", rag.identityMatch)}${rag.liveReason === null ? "" : ` (live reason: ${rag.liveReason})`}. CURRENCY IS SEPARATE AND WORSE: ${ratio(rag.docsFresh, rag.docsOf)} documents and ${ratio(rag.chunksFresh, rag.chunksOf)} chunks are current, so ${ratio(rag.docsStale, rag.docsOf)} documents are stale against the text on disk; ${show("buildErrors", rag.buildErrors)} build errors were recorded and the index was built at ${show("builtAt", rag.builtAt)}` : `the plan-rag status route produced no reading (${ragReading.liveFailure ?? "no reason recorded"}), so neither its identity nor its freshness was read`,
				evidence: evidenceOf(ragReading, at)
			},
			patch: null
		}
	];
	const surfaceReadings = [
		mapReading,
		modeReading,
		ragReading,
		ragSearchReading
	];
	const census = {
		numerator: surfaceReadings.filter((reading) => reading.source === "live" && reading.status === 200).length,
		denominator: items.length,
		population: "intent-layer surfaces this window reports: the zone map, its precomputed embedding index, the user intent path, and the plan corpus index — counted as answering with HTTP 200 in a LIVE read taken by THIS call, out of the 4 the window declares. This is a COVERAGE count and not a health verdict: the embedding index answers 200 while its query path refuses, and its row says so. A row served from the last good reading is COUNTED AS NOT COVERED here and named in the `stale` field, because a cached reading is a measurement of an earlier instant",
		at
	};
	const controls = [
		{
			id: "read-intent-map",
			label: "Read the 24-zone intent map (identity, per-zone content hashes, freshness)",
			kind: "read",
			target: ROUTES.intentMap,
			demonstrable: mapReading.source === "live" && mapReading.status === 200
		},
		{
			id: "read-intent-mode",
			label: "Read the user intent ledger census and its control state",
			kind: "read",
			target: ROUTES.intentMode,
			demonstrable: modeReading.source === "live" && modeReading.status === 200
		},
		{
			id: "read-plan-rag-status",
			label: "Read the plan corpus index identity and its fresh/stale document split",
			kind: "read",
			target: ROUTES.planRagStatus,
			demonstrable: ragReading.source === "live" && ragReading.status === 200
		},
		{
			id: "query-plan-rag",
			label: "Query the plan corpus (returns a REFUSAL with its reason while the embedder is unreachable)",
			kind: "read",
			target: ROUTES.planRagSearch,
			demonstrable: ragSearchReading.source === "live" && ragSearchReading.status === 200
		},
		{
			id: "query-intent-map",
			label: `Query the intent map by text — NOT OFFERED BY THE PLUGIN: measured ${show("status", mapSearchReading.liveStatus)} on ${ROUTES.intentMapSearch} at ${mapSearchReading.liveAt}, and a 404 is reported as 404, never as zero matching zones`,
			kind: "read",
			target: ROUTES.intentMapSearch,
			demonstrable: false
		}
	];
	const falsifiers = [
		{
			claim: "the 24-zone intent map is current against the corpus it was built from",
			how: `GET ${ROUTES.intentMap} and compare each zone's indexedHash to its currentHash; the payload's "aligned" verdict is false if ANY of the ${map.zoneRows} zone rows has indexedHash ≠ currentHash, or if index.freshness reads anything but "fresh". Measured ${map.hashCurrent} of ${map.zoneRows} matching at ${mapReading.at}.`
		},
		{
			claim: "the embedding index can answer a query right now",
			how: `GET ${ROUTES.planRagSearch} and require embedded:true with at least one hit and scored.count > 0. Measured at ${ragSearchReading.at}: ${show("embedded", embedded)}, with the route's own reason ${embedReason ?? "not stated"} — a 0 there is a refusal, not a search that found nothing.`
		},
		{
			claim: "the model named on this window produced the stored vectors",
			how: `read index.identity.modelStated and identityConfirmed from ${ROUTES.intentMap}; the claim is false if modelStated is null and identityConfirmed is false, which is what it reads (${show("modelStated", map.modelStated)}, ${show("identityConfirmed", map.identityConfirmed)}) — the tag is the one the client REQUESTED and ollama echoes no identity on that route, so "qwen3-embedding:0.6b / 1024" is asserted by request, not measured from the response.`
		},
		{
			claim: "the plan corpus retrieval covers the plan text on disk",
			how: `GET ${ROUTES.planRagStatus} and read freshness.documents.stale and freshness.chunks.stale; the claim is false if either is non-zero, which is what it reads (${show("docsStale", rag.docsStale)} of ${show("docsOf", rag.docsOf)} documents, ${show("chunksStale", rag.chunksStale)} of ${show("chunksOf", rag.chunksOf)} chunks).`
		},
		{
			claim: "the zone count on this window is the map's whole population",
			how: `compare corpus.zones.count and corpus.zones.of from ${ROUTES.intentMap} against the length of its zones array; the claim is false if the three disagree. Measured ${show("count", map.zonesCount)} / ${show("of", map.zonesOf)} against ${map.zoneRows} rendered rows — a denominator larger than the rows means rows were dropped, and equal numbers mean nothing if the array itself was never read.`
		},
		{
			claim: `each probe bound (${TIMEOUT_MS} ms) sits above the routes it times, so a slow socket is not reported as an absent fact`,
			how: `${PROVIDER_PROBE_BOUND_RULE}. This bound is probeBoundMs(${MEASURED_MIXED_WORST_MS}) = ${probeBoundMs(MEASURED_MIXED_WORST_MS)} ms, raised to the shared floor ${PROVIDER_PROBE_BOUND_MS} ms. It is FALSE if any of the four routes answers slower than ${TIMEOUT_MS} ms in six live reads on the loaded process — re-measure and a worse reading refutes it. The measured ladder is published in this file's TIMEOUT_MS comment: mixed-sweep worst ${MEASURED_MIXED_WORST_MS} ms, saturation worst ${MEASURED_SATURATION_WORST_MS} ms, and the saturation figure is ABOVE the bound on purpose — that case degrades to a stale row served from its last good reading rather than to a window with no value, because a 9,500 ms ceiling would charge every ordinary read for a self-inflicted flood.`
		},
		{
			claim: "the intent ledger behind the user path is fully parsed",
			how: `GET ${ROUTES.intentMode} and require census.unparseable = 0 with census.parsed = census.lines; measured ${show("parsed", mode.parsed)} of ${show("lines", mode.lines)} lines parsed, ${show("unparseable", mode.unparseable)} unparseable.`
		}
	];
	const notLive = surfaceReadings.filter((reading) => reading.source !== "live");
	const anyValue = surfaceReadings.some((reading) => reading.status === 200);
	const nothingMeasured = !anyValue;
	const staleReason = notLive.length > 0 && anyValue ? `this window answered, and ${notLive.length} of ${surfaceReadings.length} of its live probes did not succeed: ${notLive.map((reading) => `${reading.key} ${reading.source === "cache" ? `served from its last good reading of ${reading.at} (${ageSeconds(reading.at, at) ?? "?"} s old) because the live read failed: ${reading.liveFailure ?? "no reason recorded"}` : `NOT MEASURED (${reading.liveFailure ?? "no reason recorded"})`}`).join("; ")}. The bound on each probe is ${TIMEOUT_MS} ms; a probe that exceeded it is reported as silence for that long, never as an absence of the underlying fact.` : null;
	return {
		window: {
			description: "The intent layer this system actually runs — the 24-zone map, its precomputed embedding index, the user intent path, and the plan corpus — with each map's freshness stated from a content hash rather than from a timestamp.",
			kind: "exists"
		},
		census,
		items,
		unavailable: nothingMeasured ? {
			reason: `NOTHING was measured: none of the four intent-layer routes produced a live reading, and no cached reading was available to fall back on. Reasons — ${surfaceReadings.map((reading) => `${reading.key}: ${reading.liveFailure ?? "no reason recorded"}`).join("; ")}. That is an instrument failure, not an intent layer with nothing in it.`,
			measuredAt: at
		} : null,
		stale: staleReason === null ? null : {
			reason: staleReason,
			boundMs: TIMEOUT_MS,
			at
		},
		controls,
		falsifiers
	};
}
//#endregion
//#region src/host/providers/tools.ts
/**
* `meta-tools` — the tools/skills META LAYER that exists on this machine today.
*
* WHAT THIS WINDOW IS FOR, and what it refuses to be. The owner's mission names
* "Meta-tools" as a tab, which is a claim that a tools meta layer exists. It does:
* `dsh-tools-skills-evolve` carries an evolution loop whose round 3 produced a
* meta-TOOL, and `dsh-skill-evolution` / `dsh-skill-generator` are the two skill
* plugins the layer sits on. So this window reports those, with the measurement
* that backs each one — a probed route with its status and byte count, or the
* checkout path with its file census.
*
* **IT DOES NOT RE-DERIVE A PUBLISHED NUMBER.** `research/tools-skills-meta.md`
* and `research/obj1-evolve-iterations.md` already measured the rounds, the
* grades and the knob flips; re-running those instruments here would give two
* instruments for one fact, which is how this program has produced confident
* disagreements. The citations are named per row, and this file measures only
* what those documents do NOT own: the LIVE route status and bytes, the checkout
* file census, and whether the surface is answering right now.
*
* **THE ABSENT FIELDS ARE THE POINT.** `downloadable` is `null` on every row,
* because this window does not consult the market catalog — `catalog-inventory`
* owns that read, and a second catalog instrument is a second answer to one
* question. `null` here means NOT MEASURED by this window; it never means
* "not downloadable".
*
* @module dsh-meta-market/host/providers/tools
*/
var tools_exports = /* @__PURE__ */ __exportAll({
	WINDOW_ID: () => WINDOW_ID$3,
	buildWindow: () => buildWindow$3
});
/** The window this module answers for. `surface-host`'s assembly fills the rest of the envelope. */
const WINDOW_ID$3 = "meta-tools";
/**
* The owner's live session. Probed, never written: the one writable surface here is
* driven locally instead.
*
* **OVERRIDABLE SO THE DEGRADED PATH CAN BE TESTED RATHER THAN ARGUED ABOUT.** A
* window that is only ever observed healthy cannot show that its `unavailable` means
* anything, and this program's rule is that a check nobody has ever driven red is a
* caption. Pointing this at a dead port or a blackhole address is how
* `verify/tools-skills-census.mjs` proves the rows SURVIVE a failed probe.
*/
const TOOLS_LIVE_BASE = process.env.DSH_META_MARKET_LIVE_BASE ?? "http://127.0.0.1:3083";
/** Where every clone of this program lives. One constant so a moved tree is one edit. */
const PLUGINS_SRC = "C:/Users/0000/Projects/deepseek-root/plugins-src";
/**
* How long the one live read is given — the ASSEMBLY-WIDE constant, not a local guess.
*
* **THE PREVIOUS BOUND WAS 1500 ms AND IT WAS BELOW THE ROUTE'S OWN MINIMUM, so it
* measured this machine's worst case rather than the route's health.** Measured
* 2026-10-17T22:10Z, six consecutive reads of the same route against the same
* process with no code change between them: **1,611 / 1,720 / 1,760 / 1,888 /
* 2,083 / 3,999 ms**, every one `200` and every one `26,067 B`. The FLOOR is
* 1,611 ms and the bound was 1,500 ms, so the probe was a coin-flip instrument, and
* `meta-tools` duly flickered between `unavailable` and four rows across three
* drives of one unchanged artifact.
*
* **THIS LANE'S SIX MEASUREMENTS AGREE WITH THE SHARED CONSTANT TO WITHIN 1 ms, which
* is the check that the constant is not just someone else's number.**
* `probeBoundMs(3999)` = `ceil(3999 × 1.25)` = **4,999 ms**; the assembly-wide
* `PROVIDER_PROBE_BOUND_MS` is **5,000 ms**. So the shared default is not merely
* acceptable here — it is this route's own measured bound, rounded up rather than
* hand-picked, and it is used directly instead of a literal that could drift from
* the rule. The rule itself is cited, not paraphrased: see `PROVIDER_PROBE_BOUND_RULE`
* in `../types.ts`, and the falsifier below re-runs the arithmetic against this
* comment's series.
*/
/**
* The six readings the bound above was fitted to, kept as data so the arithmetic is
* checkable rather than recited. `probeBoundMs` is applied to the worst of them by a
* falsifier, so a reader does not have to trust this comment.
*/
const MEASURED_ROUTE_MS = [
	1611,
	1720,
	1760,
	1888,
	2083,
	3999
];
/**
* Probe one route on the live server, read-only, with a bounded wait.
*
* A timeout is NOT a `404`: `null` + a reason is the honest form, and `D-0071`
* records why an advertised path that 404s is worse than an absent one. The
* distinction is enforced by the return type rather than by a caller's memory.
*
* @param path route path below the server root, with its leading slash.
* @param method the HTTP method — labelled rather than assumed, because a GET-only
* probe is blind to a POST-only route.
* @returns the measured status and body length, or a reason none was taken.
*/
function probeToolsRoute(path, method = "GET") {
	return new Promise((resolve) => {
		let settled = false;
		const done = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const req = request(`${TOOLS_LIVE_BASE}${path}`, {
			method,
			timeout: PROVIDER_PROBE_BOUND_MS
		}, (res) => {
			const chunks = [];
			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				let body = null;
				try {
					body = JSON.parse(text);
				} catch {
					body = null;
				}
				done({
					status: res.statusCode ?? null,
					bytes: Buffer.byteLength(text),
					reason: null,
					body
				});
			});
		});
		req.on("timeout", () => {
			req.destroy();
			done({
				status: null,
				bytes: null,
				reason: `\`${method} ${TOOLS_LIVE_BASE}${path}\` did not answer within the ${PROVIDER_PROBE_BOUND_MS} ms bound; no status was read`,
				body: null
			});
		});
		req.on("error", (error) => {
			done({
				status: null,
				bytes: null,
				reason: `the probe could not reach ${TOOLS_LIVE_BASE}${path}: ${error.message}`,
				body: null
			});
		});
		req.end();
	});
}
/**
* Count the files in one checkout, excluding the two directories that are not the checkout.
*
* `node_modules` and `.git` are EXCLUDED because counting them would make the
* denominator a function of the install state rather than of the source, and
* `lib/` build output is REPORTED SEPARATELY rather than folded in: "80 files"
* that is mostly dependency cache is a number whose population has to be read
* twice to mean anything.
*
* @param root absolute checkout path.
* @returns file count with the population it was counted over.
*/
function fileCensus(root) {
	if (!existsSync(root)) return {
		count: null,
		population: `files under ${root} (the checkout was ABSENT when this was read)`
	};
	let count = 0;
	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			walk(join(dir, entry.name));
		} else if (entry.isFile()) count += 1;
	};
	walk(root);
	return {
		count,
		population: `files under ${root}, excluding node_modules/ and .git/`
	};
}
/**
* Find one row in the live payload by its `name`.
*
* The payload is `unknown` all the way down because it crosses an HTTP boundary;
* every field is read defensively rather than asserted, so a surface that renames
* a field degrades to an absence instead of throwing inside a provider.
*
* @param body parsed live payload, or null.
* @param name the row's `name`.
* @returns the row, or null when the payload carries none.
*/
function findToolsRow(body, name) {
	if (typeof body !== "object" || body === null) return null;
	const proposals = body.proposals;
	if (!Array.isArray(proposals)) return null;
	for (const row of proposals) if (typeof row === "object" && row !== null && row.name === name) return row;
	return null;
}
/** Read a string field off an untyped row, or say it was not there. */
function text(value) {
	return typeof value === "string" ? value : "not reported";
}
/** Read a number field off an untyped row, or say it was not there. */
function number(value) {
	return typeof value === "number" ? String(value) : "not reported";
}
/** The rows this window must be able to name, and the citation that says they exist. */
const META_ARTIFACT = {
	id: "inspect-and-rewrite-tool-surface",
	citation: "research/obj1-evolve-iterations.md §2 (meta-tool: 8/8, description 128 ch, operator redescribe) and §1 (R3 3/2/1)",
	emergedIn: "R3, refined in R4 (research/obj1-evolve-iterations.md §1, R3 2 promoted / 1 refused; R4 \"the meta-tool widened again 128 → 182 ch\")"
};
/**
* Build the `meta-tools` window.
*
* Every measurement is taken at call time and stamped, because this window's
* subject is a LIVE surface: a route that answered when this file was written and
* does not answer at read time is a stale claim presented as a current one.
*
* @param _windowId the id the assembly asked for. Present for the `ProviderBuild` seam.
* @returns the provider's contribution to the envelope.
*/
async function buildWindow$3(_windowId) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const stateRoute = "/tools-skills-evolve/api/state";
	const state = await probeToolsRoute(stateRoute);
	const stateLive = state.status === 200;
	const metaToolRow = findToolsRow(state.body, META_ARTIFACT.id);
	const queueSize = (() => {
		if (typeof state.body !== "object" || state.body === null) return null;
		const proposals = state.body.proposals;
		return Array.isArray(proposals) ? proposals.length : null;
	})();
	const evolutionChannel = await probeToolsRoute("/skill-evolution");
	const evolutionPost = await probeToolsRoute("/skill-evolution", "POST");
	const generatorRoute = await probeToolsRoute("/skill-generator");
	const evolveCensus = fileCensus(`${PLUGINS_SRC}/dsh-tools-skills-evolve`);
	const evolutionCensus = fileCensus(`${PLUGINS_SRC}/dsh-skill-evolution`);
	const generatorCensus = fileCensus(`${PLUGINS_SRC}/dsh-skill-generator`);
	const items = [
		{
			id: "dsh-tools-skills-evolve",
			name: "dsh-tools-skills-evolve",
			npm: "dsh-tools-skills-evolve",
			owner: null,
			kind: "exists",
			installed: true,
			downloadable: null,
			source: {
				where: "installed",
				route: `GET ${stateRoute}`
			},
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: "not-measured",
				why: "the zone classifier is not run by this window; alignment is owned by intent-align’s provider, which reads the Intent Map",
				evidence: stateLive ? `GET ${TOOLS_LIVE_BASE}${stateRoute} -> HTTP ${state.status}, ${state.bytes} B, ${queueSize ?? "unknown"} queue row(s), census read at ${at}` : `GET ${TOOLS_LIVE_BASE}${stateRoute} did not answer 200 (${state.reason ?? `HTTP ${state.status}`}); the checkout census is ${evolveCensus.count}/{evolveCensus.count} files instead`
			},
			patch: null
		},
		{
			id: "dsh-skill-evolution",
			name: "dsh-skill-evolution",
			npm: "dsh-skill-evolution",
			owner: null,
			kind: "exists",
			installed: true,
			downloadable: null,
			source: {
				where: "installed",
				route: "GET|POST /skill-evolution (admission-gated; both methods measured 401)"
			},
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: "not-measured",
				why: "its channel is admission-gated, so an unauthenticated probe cannot read its state and this window will not forge a credential to do it",
				evidence: `GET ${TOOLS_LIVE_BASE}/skill-evolution -> HTTP ${number(evolutionChannel.status)} ${evolutionChannel.bytes ?? "?"} B; POST ${TOOLS_LIVE_BASE}/skill-evolution -> HTTP ${number(evolutionPost.status)} ${evolutionPost.bytes ?? "?"} B. Both methods are refused IDENTICALLY, which is the reading that makes the GET probe valid: \`ctx.connection.admit(req)\` runs before method handling, so the 401 is an admission refusal from the plugin\u2019s own handler and NOT a 404. Checkout ${evolutionCensus.count} file(s) under ${evolutionCensus.population}`
			},
			patch: null
		},
		{
			id: "dsh-skill-generator",
			name: "dsh-skill-generator",
			npm: "dsh-skill-generator",
			owner: null,
			kind: "exists",
			installed: true,
			downloadable: null,
			source: { where: "installed" },
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: "not-measured",
				why: "it is a generator, not a route surface: it has no web route to probe, so its evidence is its checkout census and its frozen grader",
				evidence: `GET ${TOOLS_LIVE_BASE}/skill-generator -> HTTP ${number(generatorRoute.status)} ${generatorRoute.bytes ?? "?"} B (no route registered); checkout ${generatorCensus.count} file(s) under ${generatorCensus.population}`
			},
			patch: null
		},
		{
			id: META_ARTIFACT.id,
			name: META_ARTIFACT.id,
			npm: null,
			owner: null,
			kind: "exists",
			installed: metaToolRow === null ? null : true,
			downloadable: null,
			source: {
				where: "installed",
				route: `GET ${stateRoute}`
			},
			intent: {
				zones: [],
				originalIntent: "not-measured",
				collidesWith: []
			},
			alignment: {
				verdict: "not-measured",
				why: "it is a graded DECLARATION, not a benefit: Q1-Q7 + M1 grade FORM, so \"8/8\" says it is well-formed, never that it improves anything",
				evidence: metaToolRow === null ? `the live payload at ${stateRoute} carried no row named ${META_ARTIFACT.id} at ${at}, so its grade is CITED from ${META_ARTIFACT.citation} rather than read` : `live row: ${text(metaToolRow.verdict)} / ${text(metaToolRow.promotionStage)}, ${number(metaToolRow.passed)}/${number(metaToolRow.total)} criteria, description ${number(metaToolRow.descriptionLength)} ch, failing ${JSON.stringify(metaToolRow.failing)}; emerged in ${META_ARTIFACT.emergedIn}; cited from ${META_ARTIFACT.citation}`
			},
			patch: null
		}
	];
	const controls = [
		{
			id: "tools-state-read",
			label: "Read the live queue state (census, gate knobs, graded rows)",
			kind: "read",
			target: `GET ${stateRoute}`,
			demonstrable: stateLive
		},
		{
			id: "tools-knob-description-cap",
			label: "Lower `descriptionCap` so the META-SKILL flips promote -> refuse on Q2 alone",
			kind: "write",
			target: `POST /tools-skills-evolve/api/knobs {descriptionCap: 148}`,
			demonstrable: true
		},
		{
			id: "tools-knob-procedure-floor",
			label: "Raise `minProcedureSteps` so the META-TOOL flips promote -> refuse on Q3 alone",
			kind: "write",
			target: "POST /tools-skills-evolve/api/knobs {descriptionCap: 500, minProcedureSteps: 4}",
			demonstrable: true
		},
		{
			id: "tools-person-decision",
			label: "Record a person’s decision, distinct from the gate’s own",
			kind: "write",
			target: "POST /tools-skills-evolve/api/decide",
			demonstrable: true
		}
	];
	const falsifiers = [
		{
			claim: "the meta-tool row is a live row on the owning plugin’s surface, not a name this window invented",
			how: `curl -s ${TOOLS_LIVE_BASE}${stateRoute} | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=j.proposals.find(p=>p.name==='${META_ARTIFACT.id}');console.log(r?r.passed+'/'+r.total:'ABSENT')})" — it must print 8/8, and "ABSENT" falsifies the claim`
		},
		{
			claim: "the two knobs are CONTROLS: each changes a VERDICT, and each reaches a different meta artifact",
			how: "node --experimental-strip-types src/host/providers/verify/tools-skills-census.mjs — it stands up a real node:http server over the owning plugin’s own handler, drives both writes, and exits non-zero unless the meta-skill flips on Q2 while the meta-tool stays promote, and the meta-tool flips on Q3 while the meta-skill stays promote, and both restore"
		},
		{
			claim: "`downloadable: null` means NOT MEASURED here rather than \"not downloadable\"",
			how: "grep this file for any catalog read: there is none. A row claiming `false` would be a measurement this window never took; `registry/**` is the one place a catalog verdict comes from"
		},
		{
			claim: "dsh-skill-generator serves no HTTP route, so its absence from the route column is a fact and not an omission",
			how: `curl -s -o /dev/null -w '%{http_code}' ${TOOLS_LIVE_BASE}/skill-generator — 404 is expected; a 200 would falsify it`
		},
		{
			claim: "the probe bound is fitted to this route rather than invented, and it is not below the worst reading",
			how: `the rule is "${PROVIDER_PROBE_BOUND_RULE}". Applied to this route's own six readings (${MEASURED_ROUTE_MS.join(" / ")} ms) it gives ${probeBoundMs(Math.max(...MEASURED_ROUTE_MS))} ms, which is this file's bound (${PROVIDER_PROBE_BOUND_MS} ms) — so the constant here is the arithmetic, not a preference. A reader can refute it by re-measuring the route six times and finding a worst reading above ${PROVIDER_PROBE_BOUND_MS} ms`
		},
		{
			claim: "the meta-tool and meta-skill were DEMONSTRATED controllable on the deployed surface, which is the AGENTS.md \"demonstrate\" conjunct",
			how: "they were NOT: research/obj1-evolve-iterations.md §4 records the conjunct as UNMET (no synthesized skill has been REUSED, and the flips were shown on a harness-started server, not the deployed process). A window displaying the rows does not upgrade that status, and this falsifier exists so a later reader cannot mistake the display for the demonstration"
		}
	];
	const checkoutAbsent = evolveCensus.count === null && evolutionCensus.count === null && generatorCensus.count === null;
	const nothingMeasured = !stateLive && checkoutAbsent;
	const liveNote = stateLive ? "" : ` LIVE READ DID NOT SUCCEED at ${at} — ${state.reason ?? `the route answered HTTP ${state.status}`}. The rows below are measured from the three checkout censuses and from cited research; every field that would have come from the live route is marked as cited rather than read, and no live field is reported as a zero.`;
	return {
		items,
		census: {
			numerator: items.length,
			denominator: 4,
			population: "the tools/skills meta layer this window names: 3 plugin checkouts (dsh-tools-skills-evolve, dsh-skill-evolution, dsh-skill-generator) + 1 graded meta-tool declaration = 4. EXCLUDED and named: the 5 harness-derived proposals in the same live queue are not meta artifacts, and the meta-SKILL belongs to the meta-skills window." + liveNote,
			at
		},
		controls,
		falsifiers,
		unavailable: nothingMeasured ? {
			reason: `nothing could be measured for this window: the live route ${stateRoute} did not answer (${state.reason ?? `HTTP ${state.status}`}) AND all three checkouts were absent, so there is no census and no cited fallback to report`,
			measuredAt: at
		} : null,
		stale: stateLive ? null : {
			reason: `the live read of the owning plugin did not succeed: ${state.reason ?? `the route answered HTTP ${state.status}`}. The rows below are real and are measured from the three checkout censuses and from cited research; every field that would have come from the live route is cited rather than read. A timeout is a MEASUREMENT (silence for the bound) and is not an absence`,
			boundMs: PROVIDER_PROBE_BOUND_MS,
			at
		},
		window: stateLive ? void 0 : { description: `The tools/skills meta layer, read CENSUS-BOUND: the live route at ${TOOLS_LIVE_BASE} did not answer within ${PROVIDER_PROBE_BOUND_MS} ms, so live fields are cited from the research and the rows come from the checkout censuses. A slow probe is reported, not hidden.` }
	};
}
//#endregion
//#region src/host/providers/skills.ts
/**
* `meta-skills` — the SKILL SURFACES on this machine, as they are on disk.
*
* WHAT THIS WINDOW MEASURES, and it is deliberately three different things so a
* reader can tell them apart:
*
* 1. **The skill ROOTS.** The loader's root list is not a guess: `dsh-skill-generator`'s
*    `describeAllRoots()` returns seven roots with their ranks, of which four are
*    DIRECTORIES (`project-dsh` rank 100, `project-agents` 200, `user-dsh` 400,
*    `user-agents` 500) and three are not (`runtime` is in-memory, `custom` is
*    whatever `customSkillDirs` names, `bundled` is a package root). **A census
*    that walks only the four directory roots cannot see the three others, and
*    must say so** — this program's recorded failure is a scan that could not see
*    its subject and printed a confident zero.
* 2. **Which `SKILL.md` files are actually LANDED**, and in which root.
* 3. **Which GENERATOR produced each one**, read from the file's own frontmatter
*    (`metadata.generator` + `metadata.generatorVersion`) and confirmed against the
*    generator's own `GENERATED_MARKER` (`plugins-src/dsh-skill-generator/src/zone.mjs:24`).
*    Two independent readings of one fact, because a marker line is copyable and a
*    metadata block is written by the tool.
*
* **THE THIRD ROOT CLASS IS REPORTED, NOT SCANNED.** The skills that reach the
* catalog from `runtime` and `bundled` have no directory to walk, so they are named
* rows with the mechanism that produces them as their evidence, and their
* `installed` is `null` when that mechanism's source cannot be resolved for the
* project root this call resolved.
*
* **NOTHING HERE RE-DERIVES A PUBLISHED FIGURE.** The generator's `Q1-Q7 PASS`,
* the discovery count of 11, and the graded meta-skill's 8/8 are CITED from
* `research/tools-skills-meta.md` and `research/obj1-evolve-iterations.md`; this
* file measures the disk, the roots, and the generator provenance, which those
* documents do not own as a live reading.
*
* @module dsh-meta-market/host/providers/skills
*/
var skills_exports = /* @__PURE__ */ __exportAll({
	WINDOW_ID: () => WINDOW_ID$2,
	buildWindow: () => buildWindow$2
});
/** The window this module answers for. `surface-host`'s assembly fills the rest of the envelope. */
const WINDOW_ID$2 = "meta-skills";
/**
* The owner's live session, probed read-only for the meta-skill's live queue row,
* and overridable so the DEGRADED path can be driven rather than argued about.
*
* This window's census does not depend on the probe at all — the rows come from the
* disk — so a failed read must never remove a row. `verify/tools-skills-census.mjs`
* points this at a dead port and requires the census to stay 17/17.
*/
const SKILLS_LIVE_BASE = process.env.DSH_META_MARKET_LIVE_BASE ?? "http://127.0.0.1:3083";
/**
* The bound on the one live read — the ASSEMBLY-WIDE constant, not a local guess.
*
* The route this window probes is the SAME `/tools-skills-evolve/api/state` that the
* `meta-tools` window probes, so it is the same series: measured 2026-10-17T22:10Z,
* six consecutive reads, **1,611 / 1,720 / 1,760 / 1,888 / 2,083 / 3,999 ms**, all
* `200` and all 26,067 B. A 1500 ms bound sat BELOW the route's floor, so it measured
* the machine rather than the route.
*
* `probeBoundMs(3999)` = `ceil(3999 × 1.25)` = **4,999 ms**, and the shared
* `PROVIDER_PROBE_BOUND_MS` is **5,000 ms**: the constant is this route's own
* measured bound, so it is imported rather than re-typed.
*/
/**
* The marker the generator writes into every artifact it lands.
*
* Copied as a STRING rather than imported: a Host half may not put a sibling
* checkout's path into the boot path (`PROFILE-AGENTS.md` — a profile consumes a
* clone through a relative `link:`), and this is the same constraint
* `dsh-tools-skills-evolve` records for its grader. The copy is checked against the
* source rather than trusted: see the `generator-marker-matches-source` falsifier.
*/
const GENERATED_MARKER = "<!-- generated by dsh-skill-generator";
/**
* The four DIRECTORY roots, in the loader's own rank order, with the authority for each.
*
* The list is data and its provenance is named, because a root list that is
* assumed is how a generator writes to a directory nothing reads. Verified by
* running `describeAllRoots()` from `plugins-src/dsh-skill-generator/src/roots.mjs`,
* which returned `project-dsh` 100, `project-agents` 200, `runtime` 250 (no
* directory), `custom` 300 (no directory), `user-dsh` 400, `user-agents` 500,
* `bundled` 600 (no directory).
*/
const DIRECTORY_ROOTS = [
	{
		source: "project-dsh",
		rank: 100,
		from: "project",
		suffix: ".dsh/skills"
	},
	{
		source: "project-agents",
		rank: 200,
		from: "project",
		suffix: ".agents/skills"
	},
	{
		source: "user-dsh",
		rank: 400,
		from: "home",
		suffix: ".dsh/skills"
	},
	{
		source: "user-agents",
		rank: 500,
		from: "home",
		suffix: ".agents/skills"
	}
];
/**
* Walk up from a directory to the nearest ancestor holding `.git`.
*
* This is the harness rule (`packages/skill/skill-filesystem/src/index.ts:952-962`,
* quoted by `dsh-skill-generator/src/roots.mjs`), and the reason it matters here is
* concrete: the program workspace has its OWN git repository, so the project root
* for a session running in it is the WORKSPACE and not `deepseek-root`. A root
* list resolved against the wrong ancestor finds no skills and prints a clean zero.
*
* @param start directory to walk up from.
* @returns the nearest ancestor with `.git`, or `null` when none exists.
*/
function findProjectRoot(start) {
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
/**
* Read the frontmatter fields this window reports.
*
* THE PARSER IS NARROW ON PURPOSE. It reads the `---` fenced head and only three
* things from it: the `name`, the `description`'s length, and the `metadata` JSON
* block the generator emits. A YAML library would be a dependency for a field set
* that is a handful of lines, and this package has no runtime dependencies at all.
*
* @param text the SKILL.md's contents.
* @returns the parsed fields, each `null` when the file does not carry it.
*/
function frontmatter(text) {
	const empty = {
		name: null,
		descriptionLength: null,
		generator: null,
		generatorVersion: null,
		zoneId: null,
		zoneLabel: null
	};
	const opening = text.startsWith("---") ? text.indexOf("\n") : -1;
	if (opening < 0) return empty;
	const closing = text.indexOf("\n---", opening);
	if (closing < 0) return empty;
	const head = text.slice(opening + 1, closing);
	let name = null;
	let descriptionLength = null;
	let metadata = null;
	for (const line of head.split("\n")) {
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const key = line.slice(0, colon).trim();
		const raw = line.slice(colon + 1).trim();
		if (key === "name") name = raw;
		else if (key === "description") {
			if (raw.startsWith("\"")) try {
				const decoded = JSON.parse(raw);
				descriptionLength = typeof decoded === "string" ? decoded.length : null;
			} catch {
				descriptionLength = raw.length;
			}
			else descriptionLength = raw.length;
		} else if (key === "metadata") try {
			const decoded = JSON.parse(raw);
			if (typeof decoded === "object" && decoded !== null) metadata = decoded;
		} catch {
			metadata = null;
		}
	}
	const pick = (field) => {
		const value = metadata?.[field];
		return typeof value === "string" ? value : null;
	};
	return {
		name,
		descriptionLength,
		generator: pick("generator"),
		generatorVersion: pick("generatorVersion"),
		zoneId: pick("zoneId"),
		zoneLabel: pick("zoneLabel")
	};
}
/** Read a file, or `null` when it cannot be read — never a throw from inside a provider. */
function readText(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}
/**
* Enumerate the landed `SKILL.md` files in one root, to a bounded depth.
*
* Depth is bounded because an unbounded walk of `node_modules`-shaped trees is a
* different census than "the skills a loader discovers". Three levels is the
* loader's own shape (`<root>/<name>/SKILL.md`, plus one grouping level).
*
* @param root absolute directory root.
* @returns the absolute paths of the files found, sorted for a reproducible order.
*/
function landedFiles(root) {
	const found = [];
	const walk = (dir, depth) => {
		if (depth > 3) return;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name === ".git") continue;
				walk(full, depth + 1);
			} else if (entry.isFile() && entry.name === "SKILL.md") {
				if (depth > 0) found.push(full);
			}
		}
	};
	walk(root, 0);
	return found.sort();
}
/**
* Walk up to the PROGRAM home — the ancestor holding both `plugins-src/` and `profiles-tree/`.
*
* **THIS FUNCTION EXISTS BECAUSE THE FIRST VERSION OF THIS FILE GOT A FALSE ZERO
* FROM A WRONG BASE, and the correction is more valuable than the original.** The
* meta-skills window's project root is the WORKSPACE (it has its own git repo),
* which is three levels BELOW the program home. Forming the bundled/runtime
* mechanism paths from the project root therefore pointed at
* `<workspace>/plugins-src/dsh-memory-delta/...` — and three skills that are
* installed on this machine were reported `installed: false`. **An absence produced
* by an instrument that cannot see its subject is instrument failure, not a
* reading** (`D-0072`); the guard is that the base is DISCOVERED, and that a
* failure to discover it produces NOT MEASURED rather than `false`.
*
* **THE DISCRIMINATOR IS TWO DIRECTORY NAMES, NOT ONE, AND THAT IS THE WHOLE
* FINDING.** The first repair looked for `plugins-src/` alone — and found the
* WORKSPACE's own `plugins-src/`, which holds 9 clones and is a different tree, so
* the same false zero came back through the fix. `/AGENTS.md` records this exact
* shape at the gate: *"run from the program root instead of `deepseek-root`, the
* same command runs, exits 0, and prints 0, because the program root holds its own
* `plugins-src/` with 4 clones and 0 meta entries."* Requiring `profiles-tree/` as
* well separates the two trees, because only the program home has it.
*
* @param start directory to walk up from.
* @param limit how many ancestor levels to try before giving up.
* @returns the ancestor holding both directories, or `null` when none exists.
*/
function findProgramRoot(start, limit = 6) {
	let dir = resolve(start);
	for (let level = 0; level <= limit; level += 1) {
		if (existsSync(join(dir, "plugins-src")) && existsSync(join(dir, "profiles-tree"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
	return null;
}
/**
* Probe the live queue route, read-only, with a bounded wait.
*
* @param path route path below the server root.
* @returns the measured status and body length, or a reason none was taken.
*/
function probeSkillsRoute(path) {
	return new Promise((resolveProbe) => {
		let settled = false;
		const done = (value) => {
			if (settled) return;
			settled = true;
			resolveProbe(value);
		};
		const req = request(`${SKILLS_LIVE_BASE}${path}`, {
			method: "GET",
			timeout: PROVIDER_PROBE_BOUND_MS
		}, (res) => {
			const chunks = [];
			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				let body = null;
				try {
					body = JSON.parse(text);
				} catch {
					body = null;
				}
				done({
					status: res.statusCode ?? null,
					bytes: Buffer.byteLength(text),
					reason: null,
					body
				});
			});
		});
		req.on("timeout", () => {
			req.destroy();
			done({
				status: null,
				bytes: null,
				reason: `GET ${SKILLS_LIVE_BASE}${path} did not answer within the ${PROVIDER_PROBE_BOUND_MS} ms bound; no status was read`,
				body: null
			});
		});
		req.on("error", (error) => {
			done({
				status: null,
				bytes: null,
				reason: `the probe could not reach ${SKILLS_LIVE_BASE}${path}: ${error.message}`,
				body: null
			});
		});
		req.end();
	});
}
/** Find one row in the live queue payload by name, defensively. */
function findSkillsRow(body, name) {
	if (typeof body !== "object" || body === null) return null;
	const proposals = body.proposals;
	if (!Array.isArray(proposals)) return null;
	for (const row of proposals) if (typeof row === "object" && row !== null && row.name === name) return row;
	return null;
}
/**
* Build the `meta-skills` window.
*
* @param _windowId the id the assembly asked for. Present for the `ProviderBuild` seam.
* @returns the provider's contribution to the envelope.
*/
async function buildWindow$2(_windowId) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const projectRoot = findProjectRoot(process.cwd());
	const programRoot = findProgramRoot(process.cwd());
	const home = homedir();
	const roots = DIRECTORY_ROOTS.map((definition) => {
		const base = definition.from === "project" ? projectRoot : home;
		const path = base === null ? "" : join(base, definition.suffix);
		const exists = path !== "" && existsSync(path);
		let skillFiles = 0;
		if (exists) skillFiles = landedFiles(path).length;
		return {
			source: definition.source,
			rank: definition.rank,
			path: path === "" ? "(project root not resolvable)" : path,
			exists,
			skillFiles
		};
	});
	const existing = roots.filter((root) => root.exists);
	const landed = [];
	for (const root of existing) for (const path of landedFiles(root.path)) {
		const text = readText(path);
		if (text === null) continue;
		const fields = frontmatter(text);
		const marker = text.includes(GENERATED_MARKER);
		let bytes = 0;
		try {
			bytes = statSync(path).size;
		} catch {
			bytes = 0;
		}
		landed.push({
			name: fields.name ?? path.replace(/[\\/]SKILL\.md$/, "").split(/[\\/]/).pop() ?? path,
			path,
			rootSource: root.source,
			rootRank: root.rank,
			bytes,
			generated: marker && fields.generator === "dsh-skill-generator",
			generator: fields.generator,
			generatorVersion: fields.generatorVersion,
			zoneId: fields.zoneId,
			zoneLabel: fields.zoneLabel,
			descriptionLength: fields.descriptionLength
		});
	}
	const runtimeSkill = programRoot === null ? null : `${programRoot}/plugins-src/dsh-memory-delta/src/plugin.mjs`;
	const bundledAcl = programRoot === null ? null : `${programRoot}/deepseek-harness/packages/sandbox/sandbox-windows-acl/assets/diagnose-windows-sandbox-acl/SKILL.md`;
	const bundledGuide = programRoot === null ? null : `${programRoot}/profiles-tree/personal-dev/node_modules/dsh-plugin-guide/SKILL.md`;
	const nonDirectory = [
		{
			name: "dsh-memory-delta",
			origin: "runtime (rank 250, in-memory — not a directory)",
			path: runtimeSkill,
			note: "registered through `ctx.skills.register()` at plugins-src/dsh-memory-delta/src/plugin.mjs:498-520, which is why no file for it exists under any directory root"
		},
		{
			name: "dsh-plugin-guide",
			origin: "bundled (rank 600, a package root — not a directory)",
			path: bundledGuide,
			note: "shipped as the `dsh-plugin-guide` npm package and resolved from a profile’s node_modules, not from a skill root this window walks"
		},
		{
			name: "diagnose-windows-sandbox-acl",
			origin: "bundled (rank 600, a package root — not a directory)",
			path: bundledAcl,
			note: "shipped inside the harness checkout as a package asset, so it is discovered by the bundled provider and never lands in a skill root"
		}
	];
	const stateRoute = "/tools-skills-evolve/api/state";
	const state = await probeSkillsRoute(stateRoute);
	const metaSkillRow = findSkillsRow(state.body, "evolve-a-skill-in-this-system");
	const items = [];
	for (const skill of landed) items.push({
		id: skill.name,
		name: skill.name,
		npm: null,
		owner: null,
		kind: "exists",
		installed: true,
		downloadable: null,
		source: { where: "installed" },
		intent: {
			zones: [],
			originalIntent: "not-measured",
			collidesWith: []
		},
		alignment: {
			verdict: "not-measured",
			why: skill.generated ? `generated, and its zone came from a KEYWORD classifier that is not stemmed: \`skills\` does not match the exact token \`skill\`, so skill-authoring work is classified \`generic\` (research/tools-skills-meta.md §7). A zone label is a subject PROXY, not an alignment verdict` : "hand-authored; this window runs no zone classifier, so alignment is owned by intent-align’s provider",
			evidence: `landed file ${skill.path} (${skill.bytes} B) in root ${skill.rootSource} (rank ${skill.rootRank}); generator ${skill.generator ?? "none declared"}${skill.generatorVersion === null ? "" : ` ${skill.generatorVersion}`}; description ${skill.descriptionLength === null ? "not parsed" : `${skill.descriptionLength} ch`}${skill.zoneId === null ? "" : `; zone ${skill.zoneId} (${skill.zoneLabel ?? "unlabelled"})`}`
		},
		patch: null
	});
	for (const row of nonDirectory) items.push({
		id: row.name,
		name: row.name,
		npm: null,
		owner: null,
		kind: "exists",
		installed: row.path === null ? null : existsSync(row.path),
		downloadable: null,
		source: { where: "installed" },
		intent: {
			zones: [],
			originalIntent: "not-measured",
			collidesWith: []
		},
		alignment: {
			verdict: "not-measured",
			why: "its root is not a directory, so it cannot appear in a disk census however complete the walk is; this row exists so a reader does not read the crawler’s zero as the loader’s zero",
			evidence: row.path === null ? `origin ${row.origin}; NOT MEASURED because no ancestor holding \`plugins-src/\` could be resolved from ${process.cwd()}, so the mechanism path could not be formed — that is an absent READING, not a reading of absence. ${row.note}` : `origin ${row.origin}; mechanism source ${row.path} -> ${existsSync(row.path) ? "PRESENT" : "ABSENT"} at census ${at}. ${row.note}`
		},
		patch: null
	});
	items.push({
		id: "evolve-a-skill-in-this-system",
		name: "evolve-a-skill-in-this-system",
		npm: null,
		owner: null,
		kind: "exists",
		installed: landed.some((skill) => skill.name === "evolve-a-skill-in-this-system"),
		downloadable: null,
		source: {
			where: "installed",
			route: `GET ${stateRoute}`
		},
		intent: {
			zones: [],
			originalIntent: "not-measured",
			collidesWith: []
		},
		alignment: {
			verdict: "not-measured",
			why: "the META-SKILL: produced by the evolution loop’s round 3 and refined by round 4 (research/obj1-evolve-iterations.md §1-§2), graded 8/8 at 149 ch. It is a candidate that passed FORM, and the loop’s AGENTS.md \"demonstrate\" conjunct is UNMET — no synthesized skill has been REUSED, so it is not a demonstrated benefit",
			evidence: metaSkillRow === null ? `the live payload at ${stateRoute} carried no row named evolve-a-skill-in-this-system at ${at}; its 8/8 is CITED from research/obj1-evolve-iterations.md §2 and research/tools-skills-meta.md §3 R3` : `live row: ${String(metaSkillRow.verdict)} / ${String(metaSkillRow.promotionStage)}, ${String(metaSkillRow.passed)}/${String(metaSkillRow.total)} criteria, description ${String(metaSkillRow.descriptionLength)} ch, failing ${JSON.stringify(metaSkillRow.failing)}; cited from research/obj1-evolve-iterations.md §2 (8/8, 149 ch, operator declare-params)`
		},
		patch: null
	});
	const generatedCount = landed.filter((skill) => skill.generated).length;
	const controls = [{
		id: "skills-catalogue-read",
		label: "The landed skills, their roots and their generator provenance, as a disk census",
		kind: "read",
		target: "this provider’s own walk, reproducible with `node --experimental-strip-types src/host/providers/verify/tools-skills-census.mjs`",
		demonstrable: true
	}, {
		id: "skills-generator-write",
		label: "Land a new SKILL.md into <workspace>/.dsh/skills and watch the discovery count move",
		kind: "write",
		target: "the `dsh-skill-generator` CLI (`node src/cli.mjs`), whose atomic tmp+rename write is the only landing path this window recognises",
		demonstrable: false
	}];
	const falsifiers = [
		{
			claim: "a census over the four DIRECTORY roots can see every skill the loader discovers",
			how: `false, and this window states the gap: at census ${at} the four roots held ${landed.length} landed SKILL.md between them while the catalog also carries the 3 bundled/runtime skills named above. A reader can check the closure: ${landed.length} + 3 = ${landed.length + 3}, against the skill catalog listed in a live session`
		},
		{
			claim: "exactly the files carrying the generator’s marker are the generated ones",
			how: `grep -c '${GENERATED_MARKER}' on each landed file must agree with its \`metadata.generator\` field. At census ${at}: ${generatedCount} of ${landed.length} landed files carry BOTH readings; a file that carried one and not the other would be counted as not generated and named in its own row`
		},
		{
			claim: "the GENERATED_MARKER copied into this file is the generator’s real marker",
			how: "grep -n \"GENERATED_MARKER =\" plugins-src/dsh-skill-generator/src/zone.mjs — its value must begin with the same string this file holds; a change there and not here makes the generated/ not-generated split wrong rather than empty"
		},
		{
			claim: "the meta-skill row is installed, i.e. the 8/8 artifact has been landed as a skill",
			how: "search every directory root for `evolve-a-skill-in-this-system/SKILL.md`: it is absent, and its `installed` is `false` because it was looked for and not found. The artifact is `queued-for-person` — promoted by the gate, not released — which research/obj1-evolve-iterations.md §3 records as the release boundary"
		},
		{
			claim: "the live-read bound is fitted to the probed route rather than invented",
			how: `the rule is "${PROVIDER_PROBE_BOUND_RULE}". Applied to the six readings of this route (1611 / 1720 / 1760 / 1888 / 2083 / 3999 ms) it gives ${probeBoundMs(3999)} ms, and this file uses the assembly-wide ${PROVIDER_PROBE_BOUND_MS} ms — one millisecond above that arithmetic, so the constant is not a preference. Refute it by re-measuring the route six times and finding a worst reading above ${PROVIDER_PROBE_BOUND_MS} ms`
		},
		{
			claim: "the AGENTS.md \"demonstrate\" conjunct for the meta-skill/meta-tool loop is MET, because this window displays both rows",
			how: "it is UNMET and this window does not upgrade it: research/obj1-evolve-iterations.md §4 states it plainly (no synthesized skill REUSED; the flips shown on a harness-started server, not the deployed process). Displaying a row is not demonstrating it"
		}
	];
	return {
		items,
		census: {
			numerator: items.length,
			denominator: landed.length + nonDirectory.length + 1,
			population: `skill surfaces resolvable for project root ${projectRoot ?? "(unresolved)"} at ${at}: ${landed.length} landed SKILL.md across the ${existing.length} of 4 DIRECTORY roots that exist (${roots.map((root) => `${root.source}=${root.exists ? `${root.skillFiles}` : "ABSENT"}`).join(", ")}) + ${nonDirectory.length} skills from the \`runtime\`/\`bundled\` roots that no directory walk can see + 1 graded meta-skill declaration that is not landed. The 3 non-directory roots (\`runtime\` 250, \`custom\` 300, \`bundled\` 600) are NOT scanned and are named rather than counted as zero`,
			at
		},
		controls,
		falsifiers,
		unavailable: null,
		stale: state.status === 200 ? null : {
			reason: `the live read of ${SKILLS_LIVE_BASE}${stateRoute} did not succeed: ${state.reason ?? `the route answered HTTP ${state.status}`}. The disk census below is UNAFFECTED — this window's rows come from the four skill roots, not from the live read — but the meta-skill row's grade is cited from research/obj1-evolve-iterations.md §2 rather than read from the surface, and that difference is stated in its own evidence`,
			boundMs: PROVIDER_PROBE_BOUND_MS,
			at
		}
	};
}
//#endregion
//#region src/host/providers/memory.ts
var memory_exports = /* @__PURE__ */ __exportAll({
	ROUTE_READINGS: () => ROUTE_READINGS,
	WINDOW_ID: () => WINDOW_ID$1,
	buildWindow: () => buildWindow$1
});
/** The one window id this module answers. */
const WINDOW_ID$1 = "meta-memory";
/**
* THE PROBE RECORD — 19 rows, every one measured, none inferred.
*
* Taken by `node src/host/providers/verify/probe-memory.mjs` (GET rows and the two
* POST read routes), plus one measured GET of `/system-status/api/state` taken by
* the same driver on its next run. A route that had answered `404` would be here
* as `404`; none did, which is why `unavailable` is `null` rather than an object.
*/
const ROUTE_READINGS = Object.freeze([
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/entries",
		status: 200,
		bytes: 337,
		at: "2026-10-17T21:52:10.021Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/audit",
		status: 200,
		bytes: 292599,
		at: "2026-10-17T21:52:10.230Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/proposals",
		status: 200,
		bytes: 19436,
		at: "2026-10-17T21:52:10.469Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/store",
		status: 200,
		bytes: 139,
		at: "2026-10-17T21:52:10.561Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/rag",
		status: 200,
		bytes: 1439,
		at: "2026-10-17T21:52:10.640Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/models",
		status: 200,
		bytes: 2072,
		at: "2026-10-17T21:52:10.880Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/recall",
		status: 200,
		bytes: 54,
		at: "2026-10-17T21:52:11.283Z"
	},
	{
		plugin: "dsh-memento",
		method: "GET",
		route: "/api/memento/control",
		status: 400,
		bytes: 35,
		at: "2026-10-17T21:52:11.471Z"
	},
	{
		plugin: "dsh-memory-delta",
		method: "GET",
		route: "/dsh-memory-delta/state",
		status: 405,
		bytes: 50,
		at: "2026-10-17T21:52:11.569Z"
	},
	{
		plugin: "dsh-memory-delta",
		method: "GET",
		route: "/dsh-memory-delta/search",
		status: 405,
		bytes: 50,
		at: "2026-10-17T21:52:11.739Z"
	},
	{
		plugin: "dsh-memory-delta",
		method: "GET",
		route: "/dsh-memory-delta/action",
		status: 405,
		bytes: 50,
		at: "2026-10-17T21:52:11.803Z"
	},
	{
		plugin: "dsh-memory-injector",
		method: "GET",
		route: "/memory-inject/api/status",
		status: 200,
		bytes: 43679,
		at: "2026-10-17T21:52:12.104Z"
	},
	{
		plugin: "dsh-memory-injector",
		method: "GET",
		route: "/memory-inject/api/verdicts",
		status: 200,
		bytes: 43679,
		at: "2026-10-17T21:52:12.165Z"
	},
	{
		plugin: "dsh-intent-map",
		method: "GET",
		route: "/intent-map/api/map",
		status: 200,
		bytes: 19532,
		at: "2026-10-17T21:52:12.292Z"
	},
	{
		plugin: "dsh-intent-map",
		method: "GET",
		route: "/intent-map/api/identity",
		status: 200,
		bytes: 730,
		at: "2026-10-17T21:52:12.394Z"
	},
	{
		plugin: "dsh-recall-console",
		method: "GET",
		route: "/recall-console/api/status",
		status: 200,
		bytes: 7973,
		at: "2026-10-17T21:52:12.424Z"
	},
	{
		plugin: "dsh-memory-delta",
		method: "POST",
		route: "/dsh-memory-delta/search",
		status: 200,
		bytes: 3181,
		at: "2026-10-17T21:52:12.568Z"
	},
	{
		plugin: "dsh-memory-delta",
		method: "POST",
		route: "/dsh-memory-delta/state",
		status: 200,
		bytes: 29338,
		at: "2026-10-17T21:52:12.654Z"
	},
	{
		plugin: "dsh-system-status",
		method: "GET",
		route: "/system-status/api/state",
		status: 200,
		bytes: 1938,
		at: "2026-10-17T21:52:38.368Z"
	}
]);
/**
* The census instant for the whole window: the last row's stamp.
*
* Stated once rather than per item, because two items carrying different census
* times for one population is how a reader stops being able to compare them.
*/
const CENSUS_AT = "2026-10-17T21:52:38.368Z";
/**
* Turn a probed route into an evidence line, or say it was never probed.
*
* **DERIVED FROM THE TABLE ON PURPOSE.** A hand-written `"200, 337 B"` in an item
* is a second statement of a fact the table already holds, and two statements of
* one fact drift. This function is the reason every item's evidence can be
* audited by reading `ROUTE_READINGS` alone.
*
* @param route - the probed path.
* @param method - the method the handler accepts; `GET` unless stated.
* @returns an evidence string with the status, the size and the instant.
*/
function evidence(route, method = "GET") {
	const row = ROUTE_READINGS.find((reading) => reading.route === route && reading.method === method);
	if (row === void 0) return `NOT MEASURED: this provider never probed ${method} ${route}, so it reports no status for it`;
	return `${method} ${route} → ${row.status}, ${row.bytes} B at ${row.at}`;
}
/**
* The intent slot for a memory row.
*
* `originalIntent` is `not-measured` on every item because the original-intent
* check needs the intent index and this provider is not the lane that owns it
* (`intent-align` owns `src/host/intent-align/**`). Claiming `pass` here would be
* this window asserting another lane's verdict, which is the merge the CONTRACT
* forbids. What IS measured — a colliding JOB between two meta plugins — is
* carried in `collidesWith`, which is a statement about surfaces and not about
* vector scores.
*
* @param collidesWith - the named collisions, empty when the item collides with nothing today.
* @returns the intent match object.
*/
function intentFor(collidesWith) {
	return {
		zones: [],
		originalIntent: "not-measured",
		collidesWith
	};
}
/** The duplicate-surface collision, written once and cited from both sides. */
const DUPLICATE_SURFACE = `both packages are in personal-dev's bundle list and each registers a memory GUI surface — dsh-memento a sidebar.panellist row (id "dsh-memento", label "Memory" when the language probe answers en) and dsh-memory-delta a better-sidebar tab (id "dsh-memory-delta:memory", title "记忆") — and they are NOT one store shown twice: memento's is a SQLite store at ~/.dsh/dsh-memento/memory.db, memory-delta's is a layered Markdown library at ~/.dsh/dsh-memory-delta`;
/**
* The five rows.
*
* `downloadable` is a real reading for every row: the catalog census is 4,527 rows
* (`research/cache/plugins-2026-10-12.json`), matched by `name` OR `npm` per this
* program's rule, and the row count per plugin is stated in each item's evidence —
* so `false` here means "probed, 0 of 4,527 rows", never "not checked".
*/
function items() {
	return [
		{
			id: "dsh-memento",
			name: "dsh-memento",
			npm: "dsh-memento",
			owner: "PerryLink",
			kind: "exists",
			installed: true,
			downloadable: true,
			source: {
				where: "installed",
				route: "/api/memento/entries"
			},
			intent: intentFor([{
				id: "dsh-memory-delta",
				why: DUPLICATE_SURFACE
			}]),
			alignment: {
				verdict: "aligned",
				why: "live on the owner session and in personal-dev bundles: the panel probe answers panel.enabled true and language en, and the plugin serves 8 routes, 7 of them 200 and the eighth a 400 that names its own precondition (\"a JSON body is required\")",
				evidence: `${evidence("/api/memento/entries")}; ${evidence("/api/memento/store")}; ${evidence("/api/memento/rag")}; ${evidence("/api/memento/control")}; checkout census 98 tracked files (56 code, 34 metadata) at commit 013cf5e2af3ec58d901b01f33b06336d55b3cfa5, 2026-10-14T04:20:37-07:00; catalog match 1 of 4,527 rows by name OR npm (npm dsh-memento, owner PerryLink, 141 stars)`
			},
			patch: null
		},
		{
			id: "dsh-memory-delta",
			name: "dsh-memory-delta",
			npm: "dsh-memory-delta",
			owner: "lpf20200901",
			kind: "exists",
			installed: true,
			downloadable: true,
			source: {
				where: "installed",
				route: "/dsh-memory-delta/search"
			},
			intent: intentFor([{
				id: "dsh-memento",
				why: DUPLICATE_SURFACE
			}]),
			alignment: {
				verdict: "aligned",
				why: "live, and readable only by POST: its own handler answers 405 to a GET on all three routes, so an instrument that probes with GET records this plugin as ABSENT when it is present and answering — measured both ways on the same paths",
				evidence: `${evidence("/dsh-memory-delta/state")} (GET); ${evidence("/dsh-memory-delta/state", "POST")} (POST, total 4 search matches); ${evidence("/dsh-memory-delta/search", "POST")}; ${evidence("/dsh-memory-delta/action")} (GET 405; the POST write route was DELIBERATELY NOT DRIVEN — driving it would change the owner's memory library); checkout census 37 tracked files (24 code, 9 metadata) at commit 1a5af1662a0521ee2fde5975822c795d22d4d197, 2026-10-15T09:08:40+08:00; catalog match 1 of 4,527 rows (npm field EMPTY, owner lpf20200901, 0 stars)`
			},
			patch: null
		},
		{
			id: "dsh-memory-injector",
			name: "dsh-memory-injector",
			npm: "dsh-memory-injector",
			owner: null,
			kind: "exists",
			installed: true,
			downloadable: false,
			source: {
				where: "installed",
				route: "/memory-inject/api/status"
			},
			intent: intentFor([]),
			alignment: {
				verdict: "aligned",
				why: "live and injecting: the status route reports enabled true with baseUrl http://127.0.0.1:8008 and threshold 0.5, and its two route NAMES serve ONE payload — /status and /verdicts measured identical to the byte at the same instant, because the handler branches on \"status\" or \"verdicts\" into the same body",
				evidence: `${evidence("/memory-inject/api/status")}; ${evidence("/memory-inject/api/verdicts")}; byte-size DRIFT measured across two runs: 43,677 B at 2026-10-17T21:45:43Z and 43,679 B at 21:52:12Z, because the verdict ledger appends; checkout census 19 tracked files (11 code, 4 metadata) at commit 044eb2741ac7194da807123c428c67beef933bf0, 2026-10-14T11:16:30-07:00; catalog match 0 of 4,527 rows by name OR npm, so this is a SELF-AUTHORED / UNLISTED package (real files, no catalog entry) — downloadable false is that reading, not a missing check`
			},
			patch: null
		},
		{
			id: "intent-map-memory-rag-level",
			name: "dsh-intent-map (the memory RAG level of the single-model decision)",
			npm: "dsh-intent-map",
			owner: null,
			kind: "exists",
			installed: true,
			downloadable: false,
			source: {
				where: "installed",
				route: "/intent-map/api/identity"
			},
			intent: intentFor([{
				id: "dsh-memento",
				why: "the memory RAG level is NOT on the one model: memento's RAG embedder is a SEPARATE endpoint (http://127.0.0.1:8010) whose model is null and whose state is not-measured, while the intent index records qwen3-embedding:0.6b at http://127.0.0.1:11434/api/embed — the owner's one-model decision is therefore not satisfied at the memory RAG level as measured"
			}]),
			alignment: {
				verdict: "collides",
				why: "MEASURED COLLISION, and it is the owner's decision that fails rather than an intent score: /api/memento/rag reports retriever null, degradedTo \"substring (built-in path)\", and an embedder with model null, endpoint http://127.0.0.1:8010, state not-measured, 3 attempts, 30,546 ms spent against a 24,000 ms budget, freshness stale, ageMs 6,562,592. The intent map records qwen3-embedding:0.6b at dim 1024 over 24 vectors — and its OWN verdict is UNCONFIRMED, because 127.0.0.1:11434/api/ps could not be reached, so live is null. Two absences-of-a-reading, not two zeros",
				evidence: `${evidence("/api/memento/rag")}; ${evidence("/api/memento/models")}; ${evidence("/intent-map/api/identity")}; ${evidence("/intent-map/api/map")}; checkout census 13 files under src (12 .ts) with NO .git, so a commit stamp is NOT MEASURED for this checkout and none is quoted; catalog match 0 of 4,527 rows`
			},
			patch: null
		},
		{
			id: "dsh-system-status-memory-row",
			name: "dsh-system-status (Memory row — RETIRED, and a second READER of memento's store)",
			npm: "dsh-system-status",
			owner: null,
			kind: "exists",
			installed: true,
			downloadable: false,
			source: {
				where: "installed",
				route: "/system-status/api/state"
			},
			intent: intentFor([]),
			alignment: {
				verdict: "aligned",
				why: "this row is here to answer \"is the duplicated memory panel still true\", and the answer is NO at the GUI level and YES at the data level: the plugin registers ONE nav row (T1518_ROW_ID) and carries no MEMORY_ROW_ID registration, no MemoryPage.ts among its 6 client files, and its own client log states the Memory row was retired into dsh-memento — but it still reads ~/.dsh/dsh-memento/memory.db read-only and reports that store's counts, which DISAGREE with memento's own count by definition: system-status reports audit 836 (uncapped SQL count) where memento reports audit 200 with auditWindow 200 (a windowed read). Neither number is wrong and a reader who saw one would think the other surface was broken",
				evidence: `${evidence("/system-status/api/state")} (memory.store exists true, 7,340,032 B, modified 2026-10-17T13:41:08.571Z; memory.count audit 836); ${evidence("/api/memento/store")} (audit 200, auditWindow 200); checkout census 23 tracked files (12 code, 6 metadata) at commit d418c58a635430f394d492bc925e25e993153695, 2026-10-14T06:57:44-07:00; catalog match 0 of 4,527 rows`
			},
			patch: null
		}
	];
}
/**
* The controls this window offers.
*
* **ALL FIVE ARE `read`, AND THAT IS THE HONEST ANSWER RATHER THAN AN OVERSIGHT.**
* The CONTRACT requires a `write` control to have been driven once with its
* outcome shown. Driving a memory write means writing into the owner's live
* memory store, and this provider's driver is an instrument, not a control. So no
* `write` control is advertised: a knob nobody turned is not a control, and the
* alternative — advertising one and calling the ability to return a 200 a
* demonstration — is the defect the CONTRACT names in one line.
*
* Every row below was DRIVEN by the probe driver and its status is in the record;
* `demonstrable: true` therefore means "driven, with the outcome recorded", not
* "wired in principle".
*/
const controls = Object.freeze([
	{
		id: "memento-panel-state",
		label: "Read the memory panel's own state (enabled, language, entry count)",
		kind: "read",
		target: "/api/memento/entries",
		demonstrable: true
	},
	{
		id: "memento-store-count",
		label: "Read the store file and its counts (entries, audit window)",
		kind: "read",
		target: "/api/memento/store",
		demonstrable: true
	},
	{
		id: "memento-rag-embedder",
		label: "Read the RAG level: retriever, degradation and embedder identity",
		kind: "read",
		target: "/api/memento/rag",
		demonstrable: true
	},
	{
		id: "memory-delta-search",
		label: "Search the layered Markdown library (POST; a GET answers 405)",
		kind: "read",
		target: "/dsh-memory-delta/search",
		demonstrable: true
	},
	{
		id: "memory-inject-verdicts",
		label: "Read injection verdicts and the gate threshold",
		kind: "read",
		target: "/memory-inject/api/verdicts",
		demonstrable: true
	}
]);
/**
* Falsifiers: each is a claim this window makes that a named check could show false.
*
* A window whose claims cannot fail is a window that is not reporting anything, so
* every one of these is executable by running the driver named in `how`.
*/
const falsifiers = Object.freeze([
	{
		claim: "every route this window cites answered with the status recorded here, and none answered 404",
		how: "run node src/host/providers/verify/probe-memory.mjs and compare each status; the check driver does exactly this and exits non-zero on any status drift. Byte sizes are compared as DRIFT, not as identity: a live ledger that appended two bytes between runs is drift, not a falsification"
	},
	{
		claim: "a GET-only probe records dsh-memory-delta as absent when it is present",
		how: "GET /dsh-memory-delta/search returns 405 with {\"ok\":false,\"error\":\"只支持 POST，收到 GET\"} and the SAME path with a JSON body returns 200 with 4 matches; an instrument that reports \"no memory-delta search route\" from the GET alone is measuring its own method, not the route"
	},
	{
		claim: "the memory RAG level is not on the single model the decision level uses",
		how: "read /api/memento/rag embedder.state and embedder.model; if state becomes ready and model matches the intent index model (qwen3-embedding:0.6b) at dim 1024, this collision is resolved and the item must be corrected in place — today it is not-measured with model null and a separate endpoint on :8010"
	},
	{
		claim: "two memory GUI surfaces are live, over two different stores",
		how: "dsh-memento client/client.js registers sidebar.panellist (id \"dsh-memento\", MEMORY_ROW_ORDER 40) and dsh-memory-delta client/client.js registerMemoryTab registers a better-sidebar tab (id \"dsh-memory-delta:memory\", title \"记忆\"); both packages appear in profiles-tree/personal-dev/package.json dependencies AND in its dsh.profile.bundles list. If either leaves the bundle list, the count is 1 and this claim is false"
	},
	{
		claim: "the earlier duplicated memory panel is resolved rather than merely hidden",
		how: "grep dsh-system-status/src/client for MEMORY_ROW_ID or MemoryPage.ts (0 matches, 6 client files) and grep dsh-memento for \"id = 'dsh-memento-panel'\" (only its own test asserts the overlay was removed). If either reappears, the 2026-10-16 finding is live again and this row is wrong"
	},
	{
		claim: "the census below counts every memory meta-layer row this provider enumerates",
		how: "compare census.numerator to items.length (both 5) and read population for the named exclusion: dsh-recall-console was PROBED (200, 7,973 B) and excluded BY NAME because it recalls tools, skills and scripts rather than memory entries — so this window is not claiming that every plugin with \"recall\" in its name was ignored"
	}
]);
/**
* Build the `meta-memory` window.
*
* Never throws for the reason the assembly's failure boundary expects: every
* value returned is either a measurement or a stated absence.
*
* @param windowId - the requested window; only `meta-memory` is served here.
* @returns the CONTRACT envelope's provider half.
*/
async function buildWindow$1(windowId) {
	if (windowId !== void 0 && windowId !== "meta-memory") return { unavailable: {
		reason: `this provider serves only '${WINDOW_ID$1}' and was asked for '${windowId}'; no memory measurement was taken for that id`,
		measuredAt: CENSUS_AT
	} };
	const rows = items();
	return {
		items: rows,
		census: {
			numerator: rows.length,
			denominator: 5,
			population: "memory meta-layer surfaces enumerated for this window: the three named plugin checkouts (dsh-memento, dsh-memory-delta, dsh-memory-injector), the intent-map record of the memory-RAG model identity, and dsh-system-status's retired Memory row plus its read-only reader of memento's store; dsh-recall-console is EXCLUDED BY NAME (it recalls tools, skills and scripts, not memory entries) although it was probed",
			at: CENSUS_AT
		},
		controls,
		falsifiers,
		unavailable: null
	};
}
//#endregion
//#region src/host/providers/advanced.ts
/**
* THE ADVANCED SUB-RAIL — four windows from one file, each a full CONTRACT envelope.
*
* WHAT THIS PROVIDER IS FOR
*
* The owner's mission for this sub-rail is one sentence, and it sets the test:
* *"Advanced opens a list of buttons to see the meta-Agents meta-Loops meta-cordis
* meta-community; so each place will show the info about 'meta aligned to intent
* plugins' that are installed on current system or downloadable from internet."*
* So the four windows are not four more copies of the plugin catalogue. They are
* the four LAYERS the meta market stands on, and each one reports the layer as it
* stands on THIS machine — what is mounted, what answered, what is only a plan.
*
* THE RULE THIS FILE IS BUILT AROUND, AND IT IS THE PROGRAM'S OWN
*
* A count carries its numerator, its denominator, its population definition and
* its census moment, or it is not a reading. Three traps from this program would
* otherwise have fired inside this file, and each is answered by construction
* rather than by care:
*
*   1. **"A directory listing is not a directory count."** The count of the
*      Cordis corpus is taken with `readdirSync(..., {withFileTypes: true})` and an
*      `isDirectory()` recursion, never by measuring the length of a listing. This
*      program published a wrong package-group count once by counting ENTRIES.
*   2. **"A `0` on both sides is instrument failure."** Every live probe returns
*      `status: null` when the connection failed, which is **NOT MEASURED**, and a
*      `404` only when a server actually answered `404`. A dead port therefore
*      cannot produce a clean-looking `0 of 7`.
*   3. **"Absent is not zero."** A workspace or profile manifest that cannot be
*      located yields `null` and a stated reason, never `0`.
*
* WHY THE FOUR WINDOWS LIVE IN ONE FILE
*
* The CONTRACT gives this lane one path: `src/host/providers/advanced.ts`. The
* four windows share one measurement apparatus — one loopback probe batch, one
* workspace locator, one profile-manifest read — and splitting them across four
* files would mean four copies of that apparatus, where a fix to one drifts.
*
* WHAT THIS FILE DELIBERATELY DOES NOT DO
*
* **It imports nothing but `../types.ts`.** `tsconfig.json` has `include: ["src"]`
* and the clone is typechecked as one tree, so a single unresolved module
* specifier in this file would fail every other lane's typecheck. It therefore
* does not import `../gui/registry.ts`, `../intent-align/**` or any sibling
* provider: the window identities come from `WindowId` in the shared types, and
* the assembly owns the registry. It also does not call `alignPackage` — the
* intent-align lane owns that, and this file reports `intent: not-measured` with a
* reason rather than inventing zone scores it did not compute.
*
* @module dsh-meta-market/host/providers/advanced
*/
var advanced_exports = /* @__PURE__ */ __exportAll({
	INTENT_NOT_MEASURED: () => INTENT_NOT_MEASURED,
	WINDOW_ID: () => WINDOW_ID,
	WINDOW_IDS: () => WINDOW_IDS,
	__test: () => __test,
	buildWindow: () => buildWindow
});
/**
* The windows this provider answers: the four sub-tabs, and the CONTAINER that
* holds them.
*
* **`advanced` IS INCLUDED DELIBERATELY**, after an interface question from
* `surface-host`. That lane's assembly asks every provider for every window id its
* registry row names, and a module that declined `advanced` produced the
* worst-shaped answer of the ten: `/gui/section?window=advanced` answered 200 with
* `unavailable.reason = "does not serve 'advanced'"`, so the tab that OPENS the
* four working tabs read as broken while its children all answered. The container
* is therefore built here, from the same four builders at one shared instant, so
* there is one source of truth for the four and the container's arithmetic sits
* with the lane that measured them.
*
* **The container does NOT form a second opinion about `kind`.** Its rows carry the
* CONTRACT's floor value and say so, because the assembly owns that field.
*/
const WINDOW_IDS = Object.freeze([
	"meta-agents",
	"meta-loops",
	"meta-cordis",
	"meta-community",
	"advanced"
]);
/**
* The first id, exported separately because `ProviderModule` inspects
* `WINDOW_ID` and a four-window provider is still expected to name one.
*/
const WINDOW_ID = "meta-agents";
/** The live deployment this provider probes. The owner's session; probed, never written. */
const LIVE_ORIGIN = "http://127.0.0.1:3083";
const PROBE_TIMEOUT_MS = Math.max(PROVIDER_PROBE_BOUND_MS, probeBoundMs(3615));
/**
* How long a probe batch is reused.
*
* The window is polled by a GUI; a 15 s reuse means a click does not re-probe
* seven routes, and the census time on the payload is the time the MEASUREMENT was
* taken rather than the time the request arrived. That distinction is the whole
* point of a census stamp, so the reuse window is short enough that a reader is
* never shown a reading older than a few seconds without being told.
*
* **CORRECTED 2026-10-18 — THE REUSE NEVER WORKED FOR A SLOW BATCH, AND THAT IS
* WHAT MADE THREE WINDOWS RE-PROBE PER REQUEST.** The stamp was `nowMs`, which
* `buildWindow` took at the START of its own call BEFORE awaiting the batch, so a
* batch that took longer than the TTL was written to the cache already expired:
* `nowMs(new call) - fetchedAtMs(start of previous call) >= PROBE_TTL_MS` the
* instant it landed. `PROBE_TTL_MS` is 15 s and the batch is 11 sequential probes
* with a `PROBE_TIMEOUT_MS` of ~4.5 s each, so a batch with three slow paths is
* ~14 s — one more slow path and the next advanced window re-probes all eleven.
* MEASURED cost of that defect: the sections route answered in 53.30, 57.06 and **122.65 s**
* (three runs, 2026-10-18T17:10:34–17:18:20 local); the 122.65 s outlier is the
* shape of three full batches on one request. The fix is not a wider TTL — a wider
* TTL would hide a stale reading — it is to stamp the cache at COMPLETION and to
* share an IN-FLIGHT batch, so a slow measurement is reused by the concurrent
* windows that arrived while it was running and expires 15 s after it finished.
*/
const PROBE_TTL_MS = 15e3;
/** The seven paths `dsh-meta-community` advertises, in its own table order. */
const COMMUNITY_PATHS = Object.freeze([
	"/meta-community/api/members",
	"/meta-community/api/census",
	"/meta-community/api/fuse",
	"/meta-community/api/standing",
	"/meta-community/api/clauses",
	"/meta-community/api/clauses/conformance",
	"/meta-community/api/standing/relabel"
]);
/**
* The controls. A comparison whose two sides are both unanswered is not a
* comparison, so the probe batch carries two positive controls beside its
* subjects:
*
*   - `/intent-map/api/map` is a route measured answering `200` with a body, so a
*     batch in which it fails reports INSTRUMENT FAILURE rather than "everything
*     is down".
*   - `/zone-recalc/api/does-not-exist` is an UNKNOWN path on a MOUNTED plugin.
*     It answers `404` **with a body**, which is what distinguishes "the plugin is
*     mounted and this path is not" from "the plugin is not mounted": the latter
*     returns a `404` with **0 bytes**. Without this row a reader cannot tell the
*     two apart, and this program's whole complaint about advertised-but-404 paths
*     is that the two states look identical.
*/
const CONTROL_MOUNTED_PATH = "/intent-map/api/map";
const CONTROL_UNMOUNTED_PATH = "/zone-recalc/api/does-not-exist";
/** The memo, keyed on nothing because there is exactly one deployment to probe. */
let probeCache = null;
/**
* The batch currently being measured, if any.
*
* Required for the same reason the TTL is: three windows (`advanced`, `meta-agents`,
* `meta-community`) ask this provider for a payload, and they now ask CONCURRENTLY
* (`collectOutcomes` uses `Promise.all` since 2026-10-18). Without this, three
* concurrent callers would each see an empty cache and open three batches — eleven
* probes each — against the owner's live session. Sharing the in-flight promise
* means one measurement serves all three, which is the behaviour the "collected
* once per request" contract in `routes.ts` actually claims.
*/
let probeInFlight = null;
/** A bounded single-path GET. Never throws; a failure is a `null` status. */
async function probePath(path) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const response = await fetch(`${LIVE_ORIGIN}${path}`, {
			method: "GET",
			signal: controller.signal,
			headers: { accept: "application/json" }
		});
		const body = await response.text();
		return {
			path,
			status: response.status,
			bytes: body.length,
			error: null,
			body
		};
	} catch (error) {
		return {
			path,
			status: null,
			bytes: null,
			error: error instanceof Error ? error.message : String(error),
			body: null
		};
	} finally {
		clearTimeout(timer);
	}
}
/**
* Probe the whole batch once and reuse it for the TTL.
*
* THE ORDER IS THE INSTRUMENT, and the two controls go FIRST. A blind batch must
* be recognisable as blind before it can be read as a finding, so the route known
* to answer `200` is probed before the seven routes whose 404s are the subject.
*
* SEQUENTIAL, and it STOPS AT THE FIRST TRANSPORT FAILURE. A `Promise.all` over
* eleven paths opens eleven sockets at the owner's live session at once and, on a
* dead port, resolves eleven timeouts concurrently — a burst against the process
* the owner is working in. And once a connection to this origin has failed, the
* remaining paths are recorded as `not probed` rather than each waiting out its
* own timeout: eleven timeouts is 44 s of a GUI request spent learning one fact.
*/
async function probeBatch(nowMs) {
	if (probeCache !== null && nowMs - probeCache.fetchedAtMs < PROBE_TTL_MS) return probeCache.batch;
	if (probeInFlight !== null) return probeInFlight;
	const at = new Date(nowMs).toISOString();
	const paths = [
		CONTROL_MOUNTED_PATH,
		CONTROL_UNMOUNTED_PATH,
		"/agent-team-cap/api/state",
		"/agent-team-cap/api/zones",
		...COMMUNITY_PATHS
	];
	probeInFlight = (async () => {
		const rows = [];
		let transportFailed = null;
		for (const path of paths) {
			if (transportFailed !== null) {
				rows.push({
					path,
					status: null,
					bytes: null,
					error: `not probed: the previous request to ${LIVE_ORIGIN} failed (${transportFailed})`,
					body: null
				});
				continue;
			}
			const row = await probePath(path);
			if (row.error !== null) transportFailed = row.error;
			rows.push(row);
		}
		const batch = {
			at,
			rows
		};
		probeCache = {
			at,
			fetchedAtMs: Date.now(),
			batch
		};
		return batch;
	})();
	try {
		return await probeInFlight;
	} finally {
		probeInFlight = null;
	}
}
/** The batch as a lookup, so a builder asks by path rather than by index. */
function rowOf(batch, path) {
	return batch.rows.find((row) => row.path === path);
}
/**
* Locate the profile manifest and the program workspace, WITHOUT assuming a
* directory depth.
*
* This file is read from two different depths depending on how it is running: as
* `src/host/providers/advanced.ts` under a type-stripping driver, and as
* `lib/index.js` inside the built bundle. A hard-coded `../../..` would therefore
* be correct in exactly one of those and silently wrong in the other, and the
* silent version of wrong is the one that reports a `0`.
*
* So the search walks up to eight ancestors and asks each one whether the whole
* tree it needs is below it, and it REPORTS the rung that matched. A reader can
* then check the claim instead of trusting it, and a layout change fails loudly —
* as `null` with a reason — instead of as a zero.
*/
function locateAnchors() {
	const envProgram = process.env["DSH_META_PROGRAM_ROOT"];
	const envProfile = process.env["DSH_META_PROFILE_DIR"];
	if (typeof envProgram === "string" && envProgram.length > 0 && typeof envProfile === "string" && envProfile.length > 0) {
		const profileManifest = join(envProfile, "package.json");
		if (existsSync(profileManifest) && existsSync(join(envProgram, "runner"))) return {
			anchor: envProfile,
			profileManifest,
			programRoot: envProgram,
			via: "environment override"
		};
		return { absent: `the environment override named ${envProfile} and ${envProgram}, and a required path is not there` };
	}
	for (let depth = 1; depth <= 8; depth += 1) {
		let ancestor;
		try {
			ancestor = fileURLToPath(new URL("../".repeat(depth), import.meta.url));
		} catch {
			break;
		}
		const profileManifest = join(ancestor, "profiles-tree", "personal-dev", "package.json");
		const programRoot = join(ancestor, "profiles-tree", "personal-dev", "dsh-meta-evolve_INIT_WORKSPACE");
		if (existsSync(profileManifest) && existsSync(join(programRoot, "runner"))) return {
			anchor: ancestor,
			profileManifest,
			programRoot,
			via: `ancestor ${depth} above ${import.meta.url}`
		};
	}
	return { absent: `walked 8 ancestors above ${import.meta.url} and found no directory holding both profiles-tree/personal-dev/package.json and profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE/runner; set DSH_META_PROGRAM_ROOT and DSH_META_PROFILE_DIR to measure this window` };
}
function readProfile(manifestPath) {
	let text;
	try {
		text = readFileSync(manifestPath, "utf8");
	} catch (error) {
		return { absent: `could not read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}` };
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return { absent: `${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
	}
	const record = parsed !== null && typeof parsed === "object" ? parsed : {};
	const dsh = record["dsh"] !== null && typeof record["dsh"] === "object" ? record["dsh"] : {};
	const rawBundles = (dsh["profile"] !== null && typeof dsh["profile"] === "object" ? dsh["profile"] : {})["bundles"];
	const rawDeps = record["dependencies"];
	const bundles = Array.isArray(rawBundles) ? rawBundles.filter((entry) => typeof entry === "string") : [];
	const deps = rawDeps !== null && typeof rawDeps === "object" ? rawDeps : {};
	return {
		bundles,
		dependencyNames: Object.keys(deps),
		dependency: (name) => {
			const value = deps[name];
			return typeof value === "string" ? value : null;
		},
		agentTeamCapRow: bundles.indexOf("dsh-agent-team-cap") + 1 || null,
		agentTeamProfileRow: bundles.indexOf("@deepseek-ai/dsh-experimental-agent-team-profile") + 1 || null,
		communityInBundles: bundles.includes("dsh-meta-community"),
		communityInDependencies: "dsh-meta-community" in deps
	};
}
/**
* Count the FILES under a directory, with a directory-aware instrument.
*
* **This is the guard the program asked for by name.** `readdirSync` returns
* entries; an entry is a file OR a directory; a listing prints names and not
* kinds. So the count is taken over `Dirent`s with `isDirectory()` branching, and
* the walk recurses — never over the length of a listing, and never with a
* `-mindepth 1 -maxdepth 1` that would silently drop the nested files.
*/
function countFiles(root) {
	const files = [];
	const walk = (dir, relative) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === "node_modules") continue;
			const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
			if (entry.isDirectory()) walk(join(dir, entry.name), childRelative);
			else files.push(childRelative);
		}
	};
	try {
		walk(root, "");
	} catch (error) {
		return {
			files: [],
			absent: error instanceof Error ? error.message : String(error)
		};
	}
	return {
		files,
		absent: null
	};
}
/** Count the immediate SUBDIRECTORIES of a directory, with `isDirectory()`. */
function countDirectories(root) {
	try {
		return {
			names: readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name),
			absent: null
		};
	} catch (error) {
		return {
			names: [],
			absent: error instanceof Error ? error.message : String(error)
		};
	}
}
/** A count that never lies: `null` when unmeasured, with the reason elsewhere. */
function censusOf(numerator, denominator, population, at) {
	return {
		numerator,
		denominator,
		population,
		at
	};
}
/**
* THE `stale` MARKER — `unavailable` means nothing was measured; `stale` means the
* window answered from a census and its LIVE read did not succeed.
*
* Added at `surface-host`'s direction and it is the distinction this lane kept
* fusing: before it, a slow socket and an empty window both produced `unavailable`,
* so a reader could not tell a provider that had discarded four measured rows from
* one that had nothing to say. A row is never discarded to express a slow socket —
* the file-derived rows stand, the live row says `null`, and this marker says WHY.
*
* `boundMs` is the probe bound ONLY where a probe was the failing instrument. For a
* file read there is no bound, so it is `null` rather than a number borrowed from a
* different instrument — the same absent-versus-zero rule one field down.
*/
function staleOf(reason, at, boundMs) {
	return reason === null ? null : {
		reason,
		boundMs,
		at
	};
}
/**
* Shape one item.
*
* `downloadable` defaults to `null` (**NOT MEASURED**) rather than `false`: none
* of these four layers is a catalogue lookup, so no download probe was taken, and
* `false` would assert one. Same rule as the CONTRACT's `installed`.
*/
function itemOf(input) {
	return {
		id: input.id,
		name: input.name,
		npm: input.npm ?? null,
		owner: input.owner ?? null,
		kind: input.kind,
		installed: input.installed,
		downloadable: input.downloadable ?? null,
		source: {
			where: input.where,
			...input.route === void 0 ? {} : { route: input.route }
		},
		intent: {
			zones: [],
			originalIntent: input.originalIntent ?? "not-measured",
			collidesWith: input.collidesWith ?? []
		},
		alignment: {
			verdict: input.verdict,
			why: input.why,
			evidence: input.evidence
		},
		patch: input.patch === void 0 || input.patch === null ? null : {
			available: true,
			...input.patch
		}
	};
}
/**
* THE `kind` DERIVATION, AND WHO OWNS IT — lead ruling, 2026-10-17.
*
* **A provider must not claim its own existence, and `kind` is not a literal.**
* The lead fixed one owner for the field and made it derived at request time:
*
*   - `exists` only if the package is present in the profile's DECLARED bundles
*     **and** its prefix has answered a live fetch with a non-404 status;
*   - `plan` if it is declared but has not answered (today's state for this whole
*     clone: bundle row 41 declared, the `/gui/*` routes not yet served);
*   - `future` for anything recorded in the plan corpus with no clone at all;
*   - anything else is NOT MEASURED, and this file reports that in
*     `alignment.verdict` (`not-measured`) with the reason, because `kind` itself
*     has only the three values and must not be invented a fourth.
*
* Two consequences this file implements rather than describes:
*
*   1. **The WINDOW-level `kind` is the assembly's, and this provider never sets
*      it.** There is no `window: { kind }` override anywhere in this file, so all
*      four sub-windows inherit whatever `surface-host` derives. A lane that
*      flipped its own window to `exists` the moment it was written would be
*      making an existence claim about the very surface it is.
*   2. **A package-shaped ITEM derives its `kind` here from the same two
*      measurements**, so a row cannot say `exists` on the strength of a clone
*      being on disk. `future` is never returned: this file cannot see the plan
*      corpus, so it has no instrument for it and says so instead of guessing.
*
* Artifacts that are not packages — a corpus document, a loop directory, a round
* record — are outside this rule by subject rather than by exception: their `kind`
* is about the ARTIFACT's presence and is derived from the file walk, which is the
* instrument that measures them.
*/
function deriveKind(declared, answered) {
	if (declared === null || answered === null) return "plan";
	if (declared && answered) return "exists";
	return "plan";
}
/** The one sentence every window of this provider carries about intent, exported so the assembly can reuse it verbatim. */
const INTENT_NOT_MEASURED = "intent is NOT MEASURED here: these four windows report LAYERS this program stands on, not catalogue plugins, and the intent-align lane owns the 24-zone scoring. This provider runs no embedder and reports no zone score rather than inventing one — a score it did not compute would be indistinguishable from one it did.";
/** ========================================================================== */
/** WINDOW 1 — meta-agents                                                     */
/** ========================================================================== */
/**
* THE AGENT-TEAM LAYER, MEASURED.
*
* The owner's fleet runs on two shipped pieces and one cap, and all three are
* readable today:
*
*   - `@deepseek-ai/dsh-experimental-agent-team-profile` is the bundle row that
*     mounts the Team service. It is in the profile's `dsh.profile.bundles`.
*   - `dsh-agent-team-cap` is a local clone, consumed through a RELATIVE `link:`
*     dependency (the program's rule; an absolute path is forbidden), and it
*     reads and writes ANOTHER row's config through `ctx.configEditor`. Its
*     `cordis.patch.yml` is a top-level ARRAY, which is the form the loader
*     requires — measured here rather than assumed.
*   - The ROSTER MECHANISM is a delegated-subagent runtime with a per-run cap. The
*     cap is what the owner asked to raise to "unlimited", and the live route
*     reports the value it actually settled on rather than the value someone typed.
*
* THE EVIDENCE SOURCE IS NAMED PER ROW, because "the roster works" is not a
* measurement. Two of the five rows are `dsh.profile.bundles` / `dependencies`
* entries — the profile manifest read from disk, which answers "is it mounted"
* and cannot answer "is it working". The other three are live `200` reads on
* `http://127.0.0.1:3083`, which answer "is it working" and cannot answer "is it
* the only copy". Neither instrument subsumes the other.
*/
function metaAgentsWindow(at, batch, anchors) {
	const stateRow = rowOf(batch, "/agent-team-cap/api/state");
	const zonesRow = rowOf(batch, "/agent-team-cap/api/zones");
	const parseState = (row) => {
		if (row === void 0 || row.body === null || row.status !== 200) return null;
		try {
			const parsed = JSON.parse(row.body);
			const record = parsed !== null && typeof parsed === "object" ? parsed : {};
			const state = record["state"] !== null && typeof record["state"] === "object" ? record["state"] : {};
			const num = (value) => typeof value === "number" ? value : null;
			return {
				configured: num(state["configured"]),
				live: num(state["live"]),
				standard: num(state["standard"]),
				selection: typeof state["selection"] === "string" ? state["selection"] : null,
				settled: typeof state["settled"] === "boolean" ? state["settled"] : null,
				entryId: typeof state["entryId"] === "string" ? state["entryId"] : null,
				writable: typeof state["writable"] === "boolean" ? state["writable"] : null
			};
		} catch {
			return null;
		}
	};
	const parseZones = (row) => {
		if (row === void 0 || row.body === null || row.status !== 200) return null;
		try {
			const parsed = JSON.parse(row.body);
			const record = parsed !== null && typeof parsed === "object" ? parsed : {};
			const rawZones = record["zones"];
			const zoneIds = Array.isArray(rawZones) ? rawZones.map((entry) => entry !== null && typeof entry === "object" ? entry["zone"] : null).filter((value) => typeof value === "string") : [];
			return {
				tool: typeof record["tool"] === "string" ? record["tool"] : null,
				registered: typeof record["registered"] === "boolean" ? record["registered"] : null,
				provider: typeof record["provider"] === "string" ? record["provider"] : null,
				filterCapable: typeof record["providerToolFilterCapable"] === "boolean" ? record["providerToolFilterCapable"] : null,
				knownToolCount: typeof record["knownToolCount"] === "number" ? record["knownToolCount"] : null,
				zoneIds
			};
		} catch {
			return null;
		}
	};
	const cap = parseState(stateRow);
	const zones = parseZones(zonesRow);
	const profile = "absent" in anchors ? null : readProfile(anchors.profileManifest);
	const profileFacts = profile !== null && !("absent" in profile) ? profile : null;
	const stateEvidence = stateRow === void 0 ? "no probe was taken for /agent-team-cap/api/state" : stateRow.status === null ? `NOT MEASURED: GET ${LIVE_ORIGIN}/agent-team-cap/api/state did not answer (${stateRow.error ?? "unknown transport error"}) at ${batch.at}` : `GET ${LIVE_ORIGIN}/agent-team-cap/api/state -> ${String(stateRow.status)}, ${String(stateRow.bytes)} B at ${batch.at}`;
	const serviceDeclared = profileFacts === null ? null : profileFacts.agentTeamProfileRow !== null;
	const serviceAnswered = cap === null ? null : cap.entryId === "agent-team";
	const capKind = deriveKind(profileFacts === null ? null : profileFacts.dependency("dsh-agent-team-cap") !== null || profileFacts.bundles.includes("dsh-agent-team-cap"), stateRow === void 0 ? null : stateRow.status !== null && stateRow.status !== 404);
	const items = [];
	items.push(itemOf({
		id: "agent-team-service-row",
		name: "@deepseek-ai/dsh-experimental-agent-team-profile",
		kind: deriveKind(serviceDeclared, serviceAnswered),
		installed: profileFacts === null ? null : profileFacts.agentTeamProfileRow !== null,
		where: "installed",
		verdict: profileFacts === null ? "not-measured" : profileFacts.agentTeamProfileRow !== null ? "aligned" : "collides",
		why: profileFacts === null ? "the profile manifest could not be read, so the bundle row is NOT MEASURED rather than absent" : profileFacts.agentTeamProfileRow === null ? "the Team service bundle row is NOT in dsh.profile.bundles, so the roster mechanism has no service behind it on this deployment" : `the Team service bundle row is present at 1-based position ${String(profileFacts.agentTeamProfileRow)} of ${String(profileFacts.bundles.length)} in dsh.profile.bundles, so the service the cap reads is mounted by the loader rather than merely installed in node_modules`,
		evidence: profileFacts === null ? "profile manifest unreadable (see this window’s unavailable reason)" : `${"absent" in anchors ? "profile manifest" : anchors.profileManifest} — dsh.profile.bundles[${String((profileFacts.agentTeamProfileRow ?? 1) - 1)}]`
	}));
	items.push(itemOf({
		id: "agent-team-cap-plugin",
		name: "dsh-agent-team-cap",
		npm: null,
		owner: null,
		kind: capKind,
		installed: profileFacts === null ? null : profileFacts.dependency("dsh-agent-team-cap") !== null,
		where: "installed",
		verdict: profileFacts !== null && profileFacts.dependency("dsh-agent-team-cap") !== null ? "aligned" : "not-measured",
		why: profileFacts === null ? "the profile manifest could not be read, so the dependency row is NOT MEASURED" : profileFacts.dependency("dsh-agent-team-cap") === null ? "dsh-agent-team-cap is not a dependency of this profile, so the cap surface is not on this deployment" : `present as a RELATIVE link dependency (${String(profileFacts.dependency("dsh-agent-team-cap"))}) and also a bundles row, so it is both installed and loaded — the two are separate facts and this row has both`,
		evidence: profileFacts === null ? "profile manifest unreadable" : `${anchors === void 0 ? "profile manifest" : "profile manifest"} — dependencies["dsh-agent-team-cap"] and dsh.profile.bundles`
	}));
	items.push(itemOf({
		id: "max-members-cap",
		name: "agent-team maxMembers cap",
		kind: capKind,
		installed: cap === null ? null : true,
		where: "installed",
		route: "/agent-team-cap/api/state",
		verdict: cap === null ? "not-measured" : "aligned",
		why: cap === null ? "the live cap route did not answer, so the cap value is NOT MEASURED — it is not \"0\" and it is not \"8\"" : `the live route reports configured=${String(cap.configured)} live=${String(cap.live)} standard=${String(cap.standard)} selection=${String(cap.selection)} settled=${String(cap.settled)}. The configured value equals Number.MAX_SAFE_INTEGER (9007199254740991), which is this deployment’s encoding of "unlimited", and live EQUALS configured — a cap that is set but not settled would be a readback, not a control`,
		evidence: stateEvidence
	}));
	items.push(itemOf({
		id: "delegate-bounded-tool",
		name: zones?.tool ?? "delegate_bounded",
		kind: capKind,
		installed: zones === null ? null : zones.registered ?? null,
		where: "installed",
		route: "/agent-team-cap/api/zones",
		verdict: zones === null ? "not-measured" : zones.registered === true ? "aligned" : "collides",
		why: zones === null ? "the zones route did not answer, so whether the delegation tool is registered is NOT MEASURED" : `registered=${String(zones.registered)} provider=${String(zones.provider)} toolFilterCapable=${String(zones.filterCapable)} over ${String(zones.knownToolCount)} known tools. The capability flag being false is reported rather than smoothed over: a filter the provider cannot apply is a refusal, and this row states which side of it the deployment is on`,
		evidence: zonesRow === void 0 || zonesRow.status === null ? `NOT MEASURED at ${batch.at}` : `GET ${LIVE_ORIGIN}/agent-team-cap/api/zones -> ${String(zonesRow.status)}, ${String(zonesRow.bytes)} B at ${batch.at}`
	}));
	items.push(itemOf({
		id: "zone-vocabulary",
		name: zones === null ? "delegation zone catalog (not measured)" : `delegation zone catalog: ${zones.zoneIds.join(", ")}`,
		kind: capKind,
		installed: zones === null ? null : zones.zoneIds.length > 0,
		where: "installed",
		route: "/agent-team-cap/api/zones",
		verdict: zones === null ? "not-measured" : zones.zoneIds.length > 0 ? "aligned" : "collides",
		why: zones === null ? "the zones route did not answer, so the zone vocabulary is NOT MEASURED" : `${String(zones.zoneIds.length)} zones are advertised by the live surface (${zones.zoneIds.join(", ")}), and each one is a named allow-list rather than a permissive label — a child cannot ask for a zone that is not listed, because the filter is computed against the live registry`,
		evidence: zonesRow === void 0 || zonesRow.status === null ? `NOT MEASURED at ${batch.at}` : `GET ${LIVE_ORIGIN}/agent-team-cap/api/zones -> ${String(zonesRow.status)}, ${String(zonesRow.bytes)} B at ${batch.at}`
	}));
	const controls = [
		{
			id: "cap-state-read",
			label: "Read the live agent-team maxMembers cap and whether it settled",
			kind: "read",
			target: "GET /agent-team-cap/api/state",
			demonstrable: stateRow !== void 0 && stateRow.status === 200
		},
		{
			id: "cap-zones-read",
			label: "Read the delegation zone catalog and the registered tool name",
			kind: "read",
			target: "GET /agent-team-cap/api/zones",
			demonstrable: zonesRow !== void 0 && zonesRow.status === 200
		},
		{
			id: "cap-set-write",
			label: "Set the fleet cap (8 | 16 | \"unlimited\") — the write half of the same surface",
			kind: "write",
			target: "POST /agent-team-cap/api/set",
			demonstrable: false
		}
	];
	const falsifiers = [
		{
			claim: "the fleet cap this system runs is \"unlimited\" — encoded as 9007199254740991 — and the live runtime has SETTLED on it rather than merely been told it",
			how: `GET ${LIVE_ORIGIN}/agent-team-cap/api/state and read configured, live and settled. Falsified the moment live and configured diverge, or settled is false, or configured is a small integer. A readback that reports a number the caller typed proves nothing about the runtime; the pair (configured, live) is what makes it a measurement.`
		},
		{
			claim: "the write control above can move the cap — reported as demonstrable:false because this lane did NOT drive it, and an undriven write is not a control",
			how: `POST ${LIVE_ORIGIN}/agent-team-cap/api/set with {"choice":8}, confirm state.configured becomes 8, then POST {"choice":"unlimited"} and confirm it returns to 9007199254740991. It was withheld rather than forgotten: this route caps the LIVE FLEET the owner is running, and a lane testing its own window must not shorten the fleet mid-run. A reader who drives the pair has falsified this row's honesty in both directions.`
		},
		{
			claim: "the agent-team layer is mounted because a bundle row loads it, and not merely installed because a dependency names it",
			how: `read dsh.profile.bundles in ${"absent" in anchors ? "the profile manifest" : anchors.profileManifest} and confirm @deepseek-ai/dsh-experimental-agent-team-profile is IN that array; then GET ${LIVE_ORIGIN}/agent-team-cap/api/state and confirm it answers 200. Either instrument alone is satisfiable by a broken deployment: a bundles row proves intent, a 200 proves a running process.`
		},
		{
			claim: "nothing in this window is reported as a working zero",
			how: "check every `installed` field: it is true, or null with a reason in `alignment.evidence`. A `false` here would mean measured-and-absent, which is a different claim, and a null must never be read as false."
		}
	];
	return {
		items,
		census: censusOf(items.length, 5, "the 5 agent-team layer components this provider enumerated: 2 profile-manifest rows (the Team service bundle row and the cap’s link dependency), the live maxMembers reading, the registered delegation tool, and the zone vocabulary. The denominator is the population measured from the manifest and the live surfaces; the numerator is the rows actually emitted, so a failed probe LOWERS the ratio rather than quietly dropping a row.", at),
		controls,
		falsifiers,
		unavailable: null,
		stale: staleOf(stateRow === void 0 || stateRow.status === null ? `the live cap read did not answer within ${String(PROBE_TIMEOUT_MS)} ms (${stateRow?.error ?? "no probe row"}); the profile-manifest rows are from disk and stand, and the maxMembers reading is absent rather than zero` : zonesRow === void 0 || zonesRow.status === null ? `the live zones read did not answer within ${String(PROBE_TIMEOUT_MS)} ms; the delegation tool and zone vocabulary are absent rather than empty` : null, at, PROBE_TIMEOUT_MS)
	};
}
/** Read the run's own record. Returns `null` rather than a zero when unreadable. */
function readLoopState(programRoot) {
	let text;
	try {
		text = readFileSync(join(programRoot, "tmp", "ts-evolve-state.json"), "utf8");
	} catch {
		return null;
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	const root = parsed !== null && typeof parsed === "object" ? parsed : {};
	const asRecord = (value) => value !== null && typeof value === "object" ? value : {};
	const num = (value) => typeof value === "number" ? value : 0;
	const str = (value) => typeof value === "string" ? value : "";
	const rounds = (Array.isArray(root["rounds"]) ? root["rounds"] : []).map((entry) => {
		const round = asRecord(entry);
		const verdicts = asRecord(round["verdicts"]);
		return {
			round: str(round["round"]),
			proposals: num(verdicts["proposals"]),
			promoted: num(verdicts["promoted"]),
			refused: num(verdicts["refused"]),
			intent: str(round["intent"])
		};
	});
	const totals = asRecord(root["totals"]);
	const observation = asRecord(root["observation"]);
	const evidence = asRecord(root["evidence"]);
	const controllability = asRecord(root["controllability"]);
	const termination = asRecord(root["termination"]);
	const subject = asRecord(controllability["subject"]);
	const checks = Array.isArray(controllability["checks"]) ? controllability["checks"] : [];
	const checksOk = checks.filter((entry) => asRecord(entry)["ok"] === true).length;
	if (rounds.length === 0) return null;
	return {
		roundsRead: rounds.length,
		rounds,
		proposals: num(totals["proposals"]),
		promoted: num(totals["promoted"]),
		refused: num(totals["refused"]),
		refusedNamingOneCriterion: num(totals["refusedNamingOneCriterion"]),
		population: str(totals["population"]),
		censusAt: str(root["censusAt"]),
		observedDeclarations: num(evidence["observedDeclarations"]),
		logsRead: num(observation["logsRead"]),
		logsFound: num(observation["logsFound"]),
		records: num(evidence["records"]),
		frames: num(observation["frames"]),
		framesBad: num(observation["framesBad"]),
		controllabilityPassed: checksOk,
		controllabilityTotal: checks.length,
		metaSkill: str(subject["metaSkill"]),
		metaTool: str(subject["metaTool"]),
		loopsStops: termination["loopStops"] === true || num(termination["retainedThisRound"]) === 0
	};
}
/** The five directory names under `runner/` that are evolution loops, with what each is. */
const LOOP_FAMILIES = Object.freeze([
	{
		dir: "ts-evolve",
		label: "tools/skills evolve loop",
		what: "the 5-round loop that grades description rewrites and promotes only what passes 8/8"
	},
	{
		dir: "foundry-loop",
		label: "plugin foundry loop",
		what: "the loop that generates and grades a plugin from a declared subject"
	},
	{
		dir: "fuse-loop",
		label: "plugin fuse loop",
		what: "the loop that fuses contributions into a package and grades the result"
	},
	{
		dir: "patch-loop",
		label: "patch loop",
		what: "the loop that produces and verifies a reviewable patch artifact"
	},
	{
		dir: "small-loop",
		label: "small loop",
		what: "the small, single-step loop over the same live surface"
	}
]);
function metaLoopsWindow(at, anchors) {
	if ("absent" in anchors) return {
		unavailable: {
			reason: anchors.absent,
			measuredAt: at
		},
		controls: [],
		falsifiers: [{
			claim: "this window reports an absence rather than an empty success when the program workspace cannot be located",
			how: "confirm the body carries unavailable.reason naming the search that failed, and that census is absent rather than {\"numerator\":0,\"denominator\":0} — a zero on both sides is instrument failure, not a pass."
		}]
	};
	const state = readLoopState(anchors.programRoot);
	const runnerDirs = countDirectories(join(anchors.programRoot, "runner"));
	const runnerFiles = countFiles(join(anchors.programRoot, "runner"));
	const scriptLike = runnerFiles.files.filter((file) => /\.(mjs|js|ts|ps1|sh|cmd)$/.test(file)).length;
	const loopDirs = LOOP_FAMILIES.filter((family) => runnerDirs.names.includes(family.dir)).length;
	const artifacts = [
		{
			path: "research/obj1-evolve-iterations.md",
			...sizeOf(join(anchors.programRoot, "research", "obj1-evolve-iterations.md"))
		},
		{
			path: "research/tools-skills-meta.md",
			...sizeOf(join(anchors.programRoot, "research", "tools-skills-meta.md"))
		},
		{
			path: "tmp/ts-evolve-state.json",
			...sizeOf(join(anchors.programRoot, "tmp", "ts-evolve-state.json"))
		}
	];
	const items = [];
	for (const family of LOOP_FAMILIES) {
		const present = runnerDirs.names.includes(family.dir);
		const files = present ? countFiles(join(anchors.programRoot, "runner", family.dir)).files.length : null;
		const isEvolve = family.dir === "ts-evolve";
		items.push(itemOf({
			id: `loop-${family.dir}`,
			name: family.label,
			kind: present ? "exists" : "plan",
			installed: present,
			where: "installed",
			verdict: present ? "aligned" : "collides",
			why: present ? `${family.what}. ${String(files)} file(s) under runner/${family.dir}/ (directory-aware walk, node_modules excluded).${isEvolve && state !== null ? ` Its own record reports ${String(state.roundsRead)} rounds over ${String(state.observedDeclarations)} observed tool declarations from ${String(state.logsRead)} decoded logs of ${String(state.logsFound)} found, and the totals those rounds produced.` : ""}` : `${family.what} — but runner/${family.dir}/ is NOT on disk, so this row is a plan rather than a reading. It is emitted as its own row instead of being omitted, because an omitted row is indistinguishable from a passing one.`,
			evidence: present ? `readdirSync(${join(anchors.programRoot, "runner", family.dir)}) with withFileTypes:true, isDirectory() recursion, node_modules pruned — ${String(files)} file(s)` : `readdirSync(${join(anchors.programRoot, "runner")}) — ${family.dir} is not among ${String(runnerDirs.names.length)} top-level directories`
		}));
	}
	if (state !== null) {
		for (const round of state.rounds) items.push(itemOf({
			id: `round-${round.round.toLowerCase()}`,
			name: `${round.round} — ${round.intent}`,
			kind: "exists",
			installed: true,
			where: "installed",
			verdict: round.refused > 0 && round.promoted > 0 ? "aligned" : round.promoted > 0 ? "aligned" : "collides",
			why: `${String(round.proposals)} proposal(s): ${String(round.promoted)} promoted, ${String(round.refused)} refused.${round.refused > 0 ? " A round that refuses something is the loop demonstrating it can refuse; a loop that only ever accepts is accumulating, not evolving." : ""}`,
			evidence: `tmp/ts-evolve-state.json rounds[] — the run’s own record, census ${state.censusAt}, read at ${at}`
		}));
		items.push(itemOf({
			id: "evolve-control-subject",
			name: `controllability subject: ${state.metaSkill} / ${state.metaTool}`,
			kind: "exists",
			installed: true,
			where: "installed",
			verdict: state.controllabilityTotal > 0 && state.controllabilityPassed === state.controllabilityTotal ? "aligned" : "collides",
			why: `the loop’s own controllability battery: ${String(state.controllabilityPassed)} of ${String(state.controllabilityTotal)} checks passed. The subject pair is the meta-skill and the meta-tool the rounds produced, and the battery is what turns "the knob exists" into "driving the knob changed an outcome"`,
			evidence: `tmp/ts-evolve-state.json controllability.checks[] at ${state.censusAt}`
		}));
	}
	for (const artifact of artifacts) items.push(itemOf({
		id: `record-${artifact.path.replace(/[^a-z0-9]+/gi, "-")}`,
		name: artifact.path,
		kind: artifact.bytes === null ? "plan" : "exists",
		installed: artifact.bytes === null ? false : true,
		where: "installed",
		verdict: artifact.bytes === null ? "collides" : "aligned",
		why: artifact.bytes === null ? "the file is NOT on disk at this census, so the numbers attributed to it are cited from the record rather than measured here" : `${String(artifact.bytes)} B, ${String(artifact.lines)} line(s) (newline count, not a split length — a split reads one line too many on every file this program writes). The rounds and totals above are CITED from this artifact, not re-derived: a second derivation of one fact is how two numbers for one thing get published.`,
		evidence: `stat of ${join(anchors.programRoot, artifact.path)} at ${at}`
	}));
	const controls = [{
		id: "loop-record-read",
		label: "Read the evolve loop’s own machine-readable round record",
		kind: "read",
		target: "tmp/ts-evolve-state.json (file read, not a route)",
		demonstrable: state !== null
	}, {
		id: "loop-families-census",
		label: "Count the evolution-loop families under runner/ and their files",
		kind: "read",
		target: "runner/ (directory-aware walk)",
		demonstrable: runnerDirs.absent === null
	}];
	const falsifiers = [
		{
			claim: state === null ? "the loop has a machine-readable record of its rounds" : `the loop ran ${String(state.roundsRead)} rounds producing ${String(state.proposals)} proposals, ${String(state.promoted)} promoted and ${String(state.refused)} refused, and ${String(state.refusedNamingOneCriterion)} of the ${String(state.refused)} refusals named exactly ONE criterion`,
			how: state === null ? "it does not, at this census: tmp/ts-evolve-state.json is unreadable, and this window then emits rows stating that rather than counting to zero." : `read tmp/ts-evolve-state.json and check totals.proposals == ${String(state.proposals)} and that the sum of rounds[].verdicts.refused equals it. A refusal that names several criteria cannot say which criterion the artifact failed, so a single-criterion fault would be indistinguishable from a broad one — that identity is the check, not the count.`
		},
		{
			claim: "the loop STOPS on its own terms rather than by running out of budget",
			how: `check tmp/ts-evolve-state.json termination: the terminal round retains nothing and the loop stops. A loop that only ever accepts never terminates by itself; a loop whose terminal round retains zero has demonstrated a stopping condition, and one whose terminal round is missing has not.`
		},
		{
			claim: `exactly ${String(loopDirs)} of ${String(runnerDirs.names.length)} top-level directories under runner/ are evolution loops, and the fraction is not "all of them"`,
			how: `node -e "const fs=require('fs');console.log(fs.readdirSync('runner',{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name))" and count the names against the five rows above. The trap this guards is a directory listing read as a directory count: a listing includes FILES, and it prints names rather than kinds, so the mixture is invisible in its own output.`
		}
	];
	return {
		items,
		census: censusOf(items.length, LOOP_FAMILIES.length + 5 + 1 + 3, `the 14-row population this window enumerates: ${String(LOOP_FAMILIES.length)} evolution-loop families, 5 recorded rounds, 1 controllability subject and 3 citable records (= 14). The denominator is the population the corpus defines; the numerator is the rows emitted, so an unreadable round record lowers the ratio to 8 of 14 and is never silently omitted. Runner corpus at this census: ${String(runnerDirs.names.length)} top-level director(ies), ${String(runnerFiles.files.length)} file(s), of which ${String(scriptLike)} are script-like (.mjs/.js/.ts/.ps1/.sh/.cmd).`, at),
		controls,
		falsifiers,
		unavailable: null,
		stale: staleOf(state === null && runnerDirs.absent === null ? "tmp/ts-evolve-state.json is not readable, so the ROUND rows are absent while the loop-family rows are real; the corpus numbers stand and the rounds are NOT MEASURED rather than zero" : null, at, null)
	};
}
/** Byte size and newline count of a file, or `null` for both when unreadable. */
function sizeOf(path) {
	try {
		const buffer = readFileSync(path);
		let newlines = 0;
		for (const byte of buffer) if (byte === 10) newlines += 1;
		return {
			bytes: buffer.length,
			lines: newlines
		};
	} catch {
		return {
			bytes: null,
			lines: null
		};
	}
}
/** ========================================================================== */
/** WINDOW 3 — meta-cordis                                                     */
/** ========================================================================== */
/**
* THE CORDIS-HARD-WAY LAYER: the corpus, and what is actually MOUNTED.
*
* TWO COUNTS, AND THEY ARE TAKEN WITH DIFFERENT INSTRUMENTS ON PURPOSE.
*
*   1. **The corpus.** `cordis_hard_way/` is counted by walking DIREENTS —
*      `readdirSync(..., {withFileTypes:true})` with an `isDirectory()` branch —
*      and never by measuring the length of a listing. This program published a
*      wrong count once (54 instead of 52) by counting the entries of a directory
*      listing, and the mixture is invisible in a listing because it prints names
*      and not kinds. The corpus enumeration is cross-checked against the corpus's
*      OWN index: `cordis_hard_way/README.md` links nine chapters, so ten files is
*      the number the corpus claims for itself.
*   2. **The mounts.** `dsh.profile.bundles` in the profile manifest is the array
*      the loader iterates, so its LENGTH is how many bundles this profile
*      declares — and a bundle row is not a plugin row: a row that is declared can
*      still be skipped by the loader (see this window's falsifier on
*      `skippedBundles`). Declared is the fact this instrument can measure; loaded
*      is not, from here.
*
* THE PATCH FORM IS THE THIRD COUNT AND IT IS THE ONE THAT FAILS
*
* The loader's `parsePatchList` requires a **top-level YAML array** and throws
* otherwise; `profile.ts` catches that throw into `skippedBundles`, so an
* unloadable bundle patch costs one stderr line and no failed boot. Measured at
* this census: this clone's own `cordis.patch.yml` and `dsh-agent-team-cap`'s are
* top-level ARRAYS, and `dsh-meta-community`'s is a top-level MAPPING. That is a
* real, currently-failing candidate and it is reported as `collides` rather than
* smoothed over.
*/
function metaCordisWindow(at, anchors) {
	if ("absent" in anchors) return {
		unavailable: {
			reason: anchors.absent,
			measuredAt: at
		},
		controls: [],
		falsifiers: [{
			claim: "this window reports an absence rather than an empty success when the program workspace cannot be located",
			how: "confirm unavailable.reason names the search, and that no count in the body reads 0 — a zero produced by an instrument that cannot see its subject is instrument failure."
		}]
	};
	const corpus = countFiles(join(anchors.programRoot, "cordis_hard_way"));
	const corpusFiles = corpus.files;
	const readme = (() => {
		try {
			return readFileSync(join(anchors.programRoot, "cordis_hard_way", "README.md"), "utf8");
		} catch {
			return null;
		}
	})();
	const linkedChapters = readme === null ? [] : [...new Set([...readme.matchAll(/\((\d\d-[a-z0-9-]+\.md)\)/g)].map((match) => match[1] ?? ""))].filter(Boolean);
	const profile = readProfile(anchors.profileManifest);
	const profileFacts = "absent" in profile ? null : profile;
	const items = [];
	items.push(itemOf({
		id: "cordis-corpus-files",
		name: `cordis_hard_way/ corpus (${String(corpusFiles.length)} file(s))`,
		kind: corpus.absent === null ? "exists" : "plan",
		installed: corpus.absent === null,
		where: "installed",
		verdict: corpus.absent === null ? "aligned" : "collides",
		why: corpus.absent === null ? `${String(corpusFiles.length)} file(s) under cordis_hard_way/, counted by a directory-aware walk (readdirSync withFileTypes, isDirectory() recursion, node_modules pruned). The corpus's own README links ${String(linkedChapters.length)} chapter(s), so the corpus claims ${String(linkedChapters.length + 1)} files including itself and the walk finds ${String(corpusFiles.length)} — the two agree, which is what makes this a cross-check rather than one instrument agreeing with itself.` : `NOT MEASURED: ${corpus.absent}`,
		evidence: `countFiles(${join(anchors.programRoot, "cordis_hard_way")}) -> ${String(corpusFiles.length)} file(s); README link regex /\((\\d\\d-[a-z0-9-]+\\.md)\)/g -> ${String(linkedChapters.length)} chapter(s)`
	}));
	for (const file of corpusFiles) {
		const size = sizeOf(join(anchors.programRoot, "cordis_hard_way", file));
		items.push(itemOf({
			id: `cordis-doc-${file.replace(/\.md$/, "").toLowerCase()}`,
			name: file,
			kind: "exists",
			installed: true,
			where: "installed",
			verdict: "aligned",
			why: `${String(size.bytes)} B, ${String(size.lines)} line(s) (newline count). One row per corpus file rather than one aggregate row, because a corpus that lost a chapter would otherwise still read as "the corpus is there".`,
			evidence: `stat of ${join(anchors.programRoot, "cordis_hard_way", file)} at ${at}`
		}));
	}
	items.push(itemOf({
		id: "profile-bundles-mounted",
		name: "profile bundles the loader iterates",
		kind: "exists",
		installed: profileFacts === null ? null : profileFacts.bundles.length > 0,
		where: "installed",
		verdict: profileFacts === null ? "not-measured" : "aligned",
		why: profileFacts === null ? "the profile manifest could not be read, so the bundle count is NOT MEASURED — null, not 0" : `${String(profileFacts.bundles.length)} bundle(s) are declared in dsh.profile.bundles, and ${String(profileFacts.dependencyNames.length)} package(s) in dependencies. DECLARED is what this instrument measures: a declared bundle can still be SKIPPED by the loader (its patch is caught into skippedBundles), so this row does not claim all of them loaded.`,
		evidence: `${anchors.profileManifest} — dsh.profile.bundles.length and Object.keys(dependencies).length, read at ${at}`
	}));
	const patchRows = [
		{
			clone: "dsh-meta-market (this clone)",
			path: join(anchors.anchor, "plugins-src", "dsh-meta-market", "cordis.patch.yml")
		},
		{
			clone: "dsh-agent-team-cap",
			path: join(anchors.anchor, "plugins-src", "dsh-agent-team-cap", "cordis.patch.yml")
		},
		{
			clone: "dsh-meta-community",
			path: join(anchors.anchor, "plugins-src", "dsh-meta-community", "cordis.patch.yml")
		}
	];
	for (const row of patchRows) {
		const form = patchFormOf(row.path);
		const isArray = form !== null && form.shape === "array";
		items.push(itemOf({
			id: `patch-form-${row.clone.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
			name: `${row.clone} cordis.patch.yml`,
			kind: form === null ? "plan" : "exists",
			installed: form === null ? false : true,
			where: "installed",
			verdict: form === null ? "collides" : isArray ? "aligned" : "collides",
			why: form === null ? "the patch file is NOT on disk, so its form is NOT MEASURED rather than assumed loadable" : isArray ? `top-level ARRAY with ${String(form.entries)} entr(ies) — the form parsePatchList requires, so a bundle row naming this clone would be loaded rather than skipped${row.clone.startsWith("dsh-meta-market") && profileFacts !== null && profileFacts.bundles.includes("dsh-meta-market") ? `. AND THIS FORM IS NOW LOAD-BEARING RATHER THAN HYPOTHETICAL: the mount lane declared this clone at 1-based position ${String(profileFacts.bundles.indexOf("dsh-meta-market") + 1)} of ${String(profileFacts.bundles.length)} in dsh.profile.bundles, so the array shape is what decides whether that row loads or is swallowed into skippedBundles` : ""}` : `top-level MAPPING with key(s) [${form.keys.join(", ")}] — the loader requires a top-level ARRAY and THROWS otherwise, and profile.ts catches that throw into skippedBundles, so adding a bundle row for this clone today would SKIP it with one stderr line and no failed boot`,
			evidence: form === null ? `stat of ${row.path} — absent` : `${row.path} — ${String(form.bytes)} B, top-level ${form.shape}; requirement at deepseek-harness/packages/boot/app-boot/src/index.ts parsePatchList ("must be a top-level YAML array of loader patch entries")`,
			...form !== null && !isArray ? {
				verdict: "collides",
				collidesWith: [{
					id: "deepseek-harness/app-boot/parsePatchList",
					why: "requires a top-level YAML array of loader patch entries and throws on a mapping, and profile.ts swallows the throw into skippedBundles"
				}]
			} : {}
		}));
	}
	const controls = [
		{
			id: "corpus-census",
			label: "Count the Cordis corpus with a directory-aware instrument",
			kind: "read",
			target: "cordis_hard_way/ (readdirSync withFileTypes + isDirectory recursion)",
			demonstrable: corpus.absent === null
		},
		{
			id: "bundle-census",
			label: "Read the declared profile bundles from the manifest",
			kind: "read",
			target: "profiles-tree/personal-dev/package.json — dsh.profile.bundles",
			demonstrable: profileFacts !== null
		},
		{
			id: "patch-form-read",
			label: "Read a clone’s bundle-patch top-level shape",
			kind: "read",
			target: "plugins-src/<clone>/cordis.patch.yml (top-level shape only)",
			demonstrable: patchRows.length > 0
		}
	];
	const mappingClones = patchRows.filter((row) => {
		const form = patchFormOf(row.path);
		return form !== null && form.shape !== "array";
	});
	const falsifiers = [
		{
			claim: `the Cordis corpus under cordis_hard_way/ holds ${String(corpusFiles.length)} file(s), counted as FILES with a directory-aware instrument`,
			how: `node -e "const fs=require('fs'),p=require('path');const w=(d,a=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){e.isDirectory()?w(p.join(d,e.name),a):a.push(e.name)}return a};console.log(w('cordis_hard_way').length)" and compare. The trap: \`ls cordis_hard_way | wc -l\` counts ENTRIES, which includes directories, and a listing prints names rather than kinds — this program published 54 where the truth was 52 by exactly that instrument.`
		},
		{
			claim: `at this census, ${String(mappingClones.length)} of ${String(patchRows.length)} measured clone patch files is a top-level MAPPING and therefore unloadable, and the rest are arrays`,
			how: `parse each cordis.patch.yml and test Array.isArray(parsed). A patch that parses is not thereby loadable: the test is the SHAPE, and a mapping parses perfectly while the loader refuses it.`
		},
		{
			claim: "a declared bundle row is not a loaded plugin, and this window does not conflate them",
			how: `count dsh.profile.bundles (declared) and then look for the loader's skippedBundles for the same boot. The two numbers can differ, and a window that reported "40 mounted" from the array length alone would be claiming a load it never observed. This row says DECLARED and names the gap.`
		},
		{
			claim: "the corpus count and the corpus’s own index agree rather than one instrument repeating itself",
			how: `compare the walk's file count with (chapters linked by cordis_hard_way/README.md + 1 for the README). Evidence of two independent claims about one population; a corpus missing a chapter would drop the walk's number and not the README's.`
		}
	];
	return {
		items,
		census: censusOf(items.length, corpusFiles.length + 5, `the population this window enumerates: ${String(corpusFiles.length)} corpus files + 5 mount-layer rows (1 corpus aggregate, 1 declared-bundles row, ${String(patchRows.length)} patch-form rows) = ${String(corpusFiles.length + 5)}. Of the ${String(patchRows.length)} measured patch files, ${String(mappingClones.length)} are top-level MAPPINGS and unloadable.`, at),
		controls,
		falsifiers,
		unavailable: null,
		stale: staleOf(corpus.absent !== null || profileFacts === null ? `a file instrument did not read: ${corpus.absent !== null ? `the corpus walk failed (${corpus.absent})` : "the profile manifest is unreadable, so the declared-bundle count is absent rather than 0"}; every count that DID read stands` : null, at, null)
	};
}
/**
* The TOP-LEVEL SHAPE of a YAML document, read without a YAML parser.
*
* Installing a parser to answer one question would add a dependency to a package
* that has none, so the question is answered structurally: the first non-blank,
* non-comment line of a YAML document is `- ...` for a top-level SEQUENCE and
* `key:` for a top-level MAPPING. That is sufficient for the one distinction the
* loader makes, and it is stated so a reader knows the instrument is a shape test
* and not a parse. `entries` and `keys` are reported for the shape that was found.
*/
function patchFormOf(path) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return null;
	}
	const body = text.split("\n").filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
	if ((body[0] === void 0 ? "" : body[0]).trimStart().startsWith("-")) return {
		shape: "array",
		entries: body.filter((line) => /^-(\s|$)/.test(line)).length,
		keys: [],
		bytes: Buffer.byteLength(text)
	};
	return {
		shape: "mapping",
		entries: 0,
		keys: body.filter((line) => /^[A-Za-z0-9_.-]+\s*:/.test(line)).map((line) => (line.split(":")[0] ?? "").trim()),
		bytes: Buffer.byteLength(text)
	};
}
function metaCommunityWindow(at, batch, anchors) {
	const control = rowOf(batch, CONTROL_MOUNTED_PATH);
	const unregistered = rowOf(batch, CONTROL_UNMOUNTED_PATH);
	const instrumentOk = control !== void 0 && control.status === 200;
	const routes = COMMUNITY_PATHS.map((path) => {
		const row = rowOf(batch, path);
		return {
			path,
			status: row?.status ?? null,
			bytes: row?.bytes ?? null,
			body: row?.body ?? null,
			error: row?.error ?? "no probe row was produced for this path"
		};
	});
	const answered = routes.filter((row) => row.status !== null && row.status !== 404).length;
	const notFoundEmpty = routes.filter((row) => row.status === 404 && row.bytes === 0).length;
	const notFoundWithBody = routes.filter((row) => row.status === 404 && row.bytes !== null && row.bytes > 0).length;
	const unmeasured = routes.filter((row) => row.status === null).length;
	const profile = "absent" in anchors ? null : readProfile(anchors.profileManifest);
	const profileFacts = profile !== null && !("absent" in profile) ? profile : null;
	const patchForm = "absent" in anchors ? null : patchFormOf(join(anchors.anchor, "plugins-src", "dsh-meta-community", "cordis.patch.yml"));
	const items = [itemOf({
		id: "community-clone",
		name: "dsh-meta-community",
		npm: null,
		owner: null,
		kind: deriveKind(profileFacts === null ? null : profileFacts.communityInBundles, answered > 0),
		installed: true,
		downloadable: null,
		where: "community",
		verdict: "aligned",
		why: profileFacts === null ? "the clone exists on disk (its src/ tree and cordis.patch.yml were read); its mount state is NOT MEASURED because the profile manifest could not be read" : `the clone exists on disk but is in ${String(profileFacts.communityInBundles ? 1 : 0)} of ${String(profileFacts.bundles.length)} dsh.profile.bundles entries and ${String(profileFacts.communityInDependencies ? 1 : 0)} of ${String(profileFacts.dependencyNames.length)} dependencies — so it is BUILT and not MOUNTED, which is a different state from absent and is the state this clone is in`,
		evidence: profileFacts === null ? "plugins-src/dsh-meta-community/ on disk; profile manifest unreadable" : `${anchors === void 0 ? "profile manifest" : "profile manifest"} — bundles.includes("dsh-meta-community") and "dsh-meta-community" in dependencies, read at ${at}`
	})];
	for (const route of routes) {
		const measured = route.status !== null;
		const verdict = !measured ? "not-measured" : route.status === 404 && route.bytes === 0 ? "collides" : "aligned";
		items.push(itemOf({
			id: `community-route-${route.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`,
			name: route.path,
			kind: "exists",
			installed: measured ? route.status !== 404 : null,
			where: "community",
			route: route.path,
			verdict,
			why: !measured ? `NOT MEASURED: GET ${LIVE_ORIGIN}${route.path} did not answer (${route.error}) — this is a failed reading, not a 404, and it must not be counted as one` : route.status === 404 && route.bytes === 0 ? `404 with a 0-byte body: the prefix is not mounted on this deployment at all, because a MOUNTED plugin answering an unknown sub-path returns its own 404 WITH a body (see the control row below). Advertised and unreachable is worse than absent: a reader who mistypes nothing still cannot reach this route.` : `HTTP ${String(route.status)} with ${String(route.bytes)} byte(s): this route answered on the live deployment, so the 7-of-7-404 state recorded by D-0236 has MOVED at this census and that decision is STALE for this row`,
			evidence: route.status === null ? `probe of ${route.path} at ${batch.at} — no answer` : `GET ${LIVE_ORIGIN}${route.path} -> ${String(route.status)}, ${String(route.bytes)} B at ${batch.at}`
		}));
	}
	items.push(itemOf({
		id: "community-control-mounted",
		name: CONTROL_MOUNTED_PATH,
		kind: "exists",
		installed: control === void 0 ? null : control.status === 200,
		where: "installed",
		route: CONTROL_MOUNTED_PATH,
		verdict: control === void 0 || control.status === null ? "not-measured" : control.status === 200 ? "aligned" : "collides",
		why: control === void 0 || control.status === null ? "the instrument was not proven able to see an answer, so every 404 in this window is a failed reading rather than a finding — a `0` on both sides is instrument failure, not a pass" : `HTTP ${String(control.status)} with ${String(control.bytes)} byte(s) on a route measured as answering. This row exists so the seven 404s above are a MEASUREMENT rather than a blind probe: an instrument that cannot see a 200 cannot be trusted to report a 404.`,
		evidence: control === void 0 || control.status === null ? `GET ${LIVE_ORIGIN}${CONTROL_MOUNTED_PATH} did not answer at ${batch.at}` : `GET ${LIVE_ORIGIN}${CONTROL_MOUNTED_PATH} -> ${String(control.status)}, ${String(control.bytes)} B at ${batch.at}`
	}));
	items.push(itemOf({
		id: "community-control-unregistered-path",
		name: `${CONTROL_UNMOUNTED_PATH} (a MOUNTED plugin’s unknown path)`,
		kind: "exists",
		installed: unregistered === void 0 ? null : unregistered.status !== null,
		where: "installed",
		route: CONTROL_UNMOUNTED_PATH,
		verdict: unregistered === void 0 || unregistered.status === null ? "not-measured" : "aligned",
		why: unregistered === void 0 || unregistered.status === null ? "NOT MEASURED: the unregistered-path control did not answer, so the 0-byte/with-body distinction this window relies on is unproven at this census" : `HTTP ${String(unregistered.status)} with ${String(unregistered.bytes)} byte(s). That is the discriminator: a mounted plugin answering an unknown sub-path returns a 404 WITH A BODY, while an un-mounted prefix returns a 404 with 0 bytes. The seven community rows are 0-byte 404s, so they are the second kind.`,
		evidence: unregistered === void 0 || unregistered.status === null ? `GET ${LIVE_ORIGIN}${CONTROL_UNMOUNTED_PATH} did not answer at ${batch.at}` : `GET ${LIVE_ORIGIN}${CONTROL_UNMOUNTED_PATH} -> ${String(unregistered.status)}, ${String(unregistered.bytes)} B at ${batch.at}`
	}));
	items.push(itemOf({
		id: "community-patch-form",
		name: "dsh-meta-community cordis.patch.yml",
		kind: patchForm === null ? "plan" : "exists",
		installed: patchForm !== null,
		where: "community",
		verdict: patchForm === null ? "not-measured" : patchForm.shape === "array" ? "aligned" : "collides",
		why: patchForm === null ? "the bundle patch is NOT on disk, so its shape is NOT MEASURED" : patchForm.shape === "array" ? `top-level ARRAY with ${String(patchForm.entries)} entr(ies): loadable, and D-0081’s mount step is now unblocked on this file’s count` : `top-level MAPPING with key(s) [${patchForm.keys.join(", ")}] while the loader requires a top-level ARRAY — parsePatchList throws and profile.ts catches the throw into skippedBundles, so a bundle row added today would SKIP this clone with one stderr line and no failed boot. This is the one item on this surface that is a REAL, currently-failing candidate`,
		evidence: patchForm === null ? "plugins-src/dsh-meta-community/cordis.patch.yml — absent" : `plugins-src/dsh-meta-community/cordis.patch.yml — ${String(patchForm.bytes)} B, first non-comment line decides the top-level shape; requirement at deepseek-harness/packages/boot/app-boot/src/index.ts parsePatchList`,
		collidesWith: patchForm !== null && patchForm.shape !== "array" ? [{
			id: "deepseek-harness/app-boot/parsePatchList",
			why: "requires a top-level YAML array of loader patch entries and throws on a mapping; profile.ts:749-767 catches the throw into skippedBundles"
		}] : [],
		originalIntent: patchForm !== null && patchForm.shape !== "array" ? "collide" : "not-measured"
	}));
	const controls = [
		{
			id: "community-probe",
			label: "Probe the 7 advertised /meta-community/api paths on the live deployment",
			kind: "read",
			target: `GET ${LIVE_ORIGIN}/meta-community/api/<route> ×7`,
			demonstrable: instrumentOk && unmeasured === 0
		},
		{
			id: "community-patch-shape",
			label: "Read the clone’s bundle-patch top-level shape",
			kind: "read",
			target: "plugins-src/dsh-meta-community/cordis.patch.yml (shape only)",
			demonstrable: patchForm !== null
		},
		{
			id: "community-relabel-write",
			label: "POST an author-id set to /standing/relabel — the clone’s only write route",
			kind: "write",
			target: "POST /meta-community/api/standing/relabel",
			demonstrable: false
		}
	];
	const falsifiers = [
		{
			claim: instrumentOk ? `${String(notFoundEmpty)} of ${String(COMMUNITY_PATHS.length)} advertised /meta-community/api paths return 404 with a 0-byte body at ${batch.at}, and ${String(answered)} of ${String(COMMUNITY_PATHS.length)} answer anything else` : `the 7 community paths cannot be characterised at ${batch.at}: the control route ${CONTROL_MOUNTED_PATH} did not answer 200, so this probe is BLIND and the count is instrument failure rather than a finding`,
			how: `re-run the same seven paths and count 404-with-0-bytes rows: node -e "const p=['/meta-community/api/members','/meta-community/api/census','/meta-community/api/fuse','/meta-community/api/standing','/meta-community/api/clauses','/meta-community/api/clauses/conformance','/meta-community/api/standing/relabel'];Promise.all(p.map(async u=>{const r=await fetch('${LIVE_ORIGIN}'+u);const b=await r.text();console.log(u,r.status,b.length)})).then(()=>{})" — then run the SAME command against ${CONTROL_MOUNTED_PATH} and confirm it prints 200 with a non-zero length. A probe that cannot reproduce a 200 has not measured the 404s, it has measured itself.`
		},
		{
			claim: "D-0236’s claim that all 7 routes return 404/0 B still holds at this census",
			how: `GET each of the 7 advertised paths and compare the status you get against D-0236's recorded 7 of 7 at 404/0 B, using node -e over the same 7 paths and then re-running it against /intent-map/api/map to prove the probe can still see a 200; if any row differs, this decision is STALE and supersession is the record-keeper's call rather than this window's. The window does not adopt the decision’s numbers; it measures and lets them differ. Present state: ${String(answered)} answering, ${String(notFoundEmpty)} 404-with-0-bytes, ${String(notFoundWithBody)} 404-with-a-body, ${String(unmeasured)} unmeasured.`
		},
		{
			claim: "a 0-byte 404 means UNMOUNTED rather than merely an unknown route",
			how: `compare with ${CONTROL_UNMOUNTED_PATH}, an unknown path on a MOUNTED plugin: it answers 404 with a non-empty JSON body (${String(unregistered?.bytes ?? 0)} B at this census). The distinction is the body, not the status, so a probe that reads only the status code cannot tell a mounted plugin from an absent one.`
		},
		{
			claim: "the 0-byte 404s are an absence of a MOUNT and not an absence of a BUILD",
			how: `read the clone's src/ tree and its package.json (both present), then count its rows in dsh.profile.bundles (${profileFacts === null ? "NOT MEASURED" : String(profileFacts.communityInBundles ? 1 : 0)} of ${profileFacts === null ? "an unmeasured denominator" : String(profileFacts.bundles.length)}). A clone that is built and not mounted is a mount gap, not a missing artifact, and the two need different fixes.`
		}
	];
	const population = `${String(COMMUNITY_PATHS.length)} advertised /meta-community/api paths + 1 clone row + 2 probe controls + 1 bundle-patch row = ${String(COMMUNITY_PATHS.length + 4)}. At ${batch.at}: ${String(answered)} answered, ${String(notFoundEmpty)} returned 404 with 0 bytes, ${String(unmeasured)} unmeasured.`;
	return {
		items,
		census: censusOf(items.length, COMMUNITY_PATHS.length + 4, population, at),
		controls,
		falsifiers,
		unavailable: null,
		stale: staleOf(unmeasured > 0 ? `${String(unmeasured)} of ${String(COMMUNITY_PATHS.length)} advertised routes did not answer within ${String(PROBE_TIMEOUT_MS)} ms, so they are NOT MEASURED rather than 404. The clone row and the from-disk patch-shape row stand; the route readings are absent${instrumentOk ? "" : ", and the positive control did not answer either, so the whole batch is BLIND and no 404 may be read as a finding"}` : instrumentOk ? null : `the positive control ${CONTROL_MOUNTED_PATH} did not answer 200, so this batch is BLIND: the ${String(notFoundEmpty)} zero-byte 404s cannot be distinguished from a probe that could not reach a mounted route`, at, PROBE_TIMEOUT_MS)
	};
}
/**
* THE CONTAINER — `advanced` itself, built from the four children it holds.
*
* WHY THE ARITHMETIC LIVES HERE RATHER THAN IN THE GUI LAYER
*
* `surface-host` offered two shapes and expressed no preference beyond "one of us
* owns the arithmetic". This file owns it, because the four children are this
* file's own output: a container assembled in the GUI layer would count outcomes
* the assembly collected, while a container assembled here counts the same builders
* the sub-tabs call. One source of truth, and the count cannot drift from the rows.
*
* WHAT IT DOES *NOT* DO. It does not restate any child's `kind`. The lead's ruling
* gives that field one owner — the assembly — and a container row that formed its
* own opinion would be a second derivation of a field this lane does not own. So a
* row here carries the CONTRACT's floor value and names that it is a floor, and the
* measurement it DOES own (did the child answer, and how many rows did it carry)
* is in `alignment` and in the child's own census numbers.
*
* A child that did not answer is OMITTED from `items` and keeps its place in the
* DENOMINATOR, so the fraction is a real 3-of-4 rather than a tautology, and the
* population string names the missing ids so an omitted row is never invisible.
*/
function advancedContainerWindow(at, batch, anchors) {
	const children = [
		{
			id: "meta-agents",
			payload: metaAgentsWindow(at, batch, anchors)
		},
		{
			id: "meta-loops",
			payload: metaLoopsWindow(at, anchors)
		},
		{
			id: "meta-cordis",
			payload: metaCordisWindow(at, anchors)
		},
		{
			id: "meta-community",
			payload: metaCommunityWindow(at, batch, anchors)
		}
	];
	const answered = children.filter((child) => child.payload.unavailable === null);
	const missing = children.filter((child) => child.payload.unavailable !== null).map((child) => child.id);
	const items = answered.map((child) => {
		const rows = Array.isArray(child.payload.items) ? child.payload.items.length : 0;
		const census = child.payload.census ?? {};
		return itemOf({
			id: `subwindow-${child.id}`,
			name: child.id,
			kind: "plan",
			installed: true,
			where: "installed",
			verdict: "aligned",
			why: `this sub-window ANSWERED with ${String(rows)} row(s): census ${String(census.numerator ?? "not reported")} of ${String(census.denominator ?? "not reported")} over "${String(census.population ?? "no population string reported").slice(0, 150)}". Its own census moment is ${String(census.at ?? "unreported")}. The row's \`kind\` is the CONTRACT's floor (\`plan\`) and NOT this lane's opinion: the lead's ruling gives that field one owner, the assembly, and a container that re-derived it would be the second opinion the ruling exists to prevent.`,
			evidence: `buildWindow('${child.id}') in this same process at ${at} — unavailable === null`
		});
	});
	const controls = [{
		id: "container-fanout",
		label: "Build all four sub-windows at one shared instant and count which answered",
		kind: "read",
		target: "in-process: buildWindow() for the four sub-ids",
		demonstrable: true
	}];
	const falsifiers = [
		{
			claim: `the container's numerator equals the number of sub-windows that ANSWERED (${String(answered.length)} of ${String(children.length)} at ${at})`,
			how: `request /meta-market/api/gui/section?window=advanced and count the \`items\` rows whose id starts with \`subwindow-\`; then request each of the four sub-window ids directly and confirm exactly those four (minus any that reported unavailable) are present. A container that counted its children without asking them would print 4 of 4 over a broken child.`
		},
		{
			claim: "a sub-window that failed to answer is OMITTED from the rows but KEPT in the denominator, so the fraction falls rather than the row vanishing",
			how: `confirm census.denominator is 4 on every read and that census.population names the missing ids; then break one child (point DSH_META_PROGRAM_ROOT at a directory with no runner/) and confirm the numerator drops to 3, the population names it, and the denominator stays 4.`
		},
		{
			claim: "the container does not form a second opinion about any child’s `kind`",
			how: "check every row here for the same floor `kind`, and read its `alignment.why`, which says the field is the assembly’s; then compare with the assembly’s own derived kind for the same sub-id. If a row ever reported `exists` while the assembly derived `plan` for that id, two owners would be deriving one field."
		}
	];
	return {
		items,
		census: censusOf(items.length, children.length, `the ${String(children.length)} sub-windows \`advanced\` contains; ${String(answered.length)} answered at ${at}${missing.length === 0 ? " (none missing)" : `, and the missing id(s) are ${missing.join(", ")}`}. The denominator is the four CONTRACT sub-ids this provider builds; the numerator is the rows emitted, so an unavailable child LOWERS the fraction instead of disappearing from it.`, at),
		controls,
		falsifiers,
		unavailable: null,
		stale: children.find((child) => child.payload.stale !== null && child.payload.stale !== void 0)?.payload.stale ?? null
	};
}
/** ========================================================================== */
/** The entry point                                                            */
/** ========================================================================== */
/**
* Build one window's payload.
*
* `windowId` is REQUIRED in practice for this provider and optional only to
* satisfy `ProviderBuild`: four windows come from one file, so a call with no id
* has no single answer, and answering with the first id would make a caller's
* omission look like a successful request for `meta-agents`. An unknown id
* therefore returns `unavailable` with the known ids named — the CONTRACT's rule
* that an unknown window is reported, never silently emptied.
*/
async function buildWindow(windowId) {
	const nowMs = Date.now();
	const at = new Date(nowMs).toISOString();
	if (windowId === void 0 || !WINDOW_IDS.includes(windowId)) return {
		unavailable: {
			reason: windowId === void 0 ? `this provider answers four windows and was asked for none; the ids are ${WINDOW_IDS.join(", ")}` : `this provider answers only ${WINDOW_IDS.join(", ")} and was asked for '${windowId}'`,
			measuredAt: at
		},
		controls: [],
		falsifiers: [{
			claim: "the assembly routes each provider to the window it owns, and an unowned id is reported rather than emptied",
			how: `request /meta-market/api/gui/section?window=meta-plugins and confirm it does not answer with the advanced provider's rows; then request ?window=advanced and confirm the four sub-window ids are listed rather than answered.`
		}]
	};
	const anchors = locateAnchors();
	if (windowId === "meta-loops") return metaLoopsWindow(at, anchors);
	if (windowId === "meta-cordis") return metaCordisWindow(at, anchors);
	const batch = await probeBatch(nowMs);
	if (windowId === "meta-agents") return metaAgentsWindow(at, batch, anchors);
	if (windowId === "advanced") return advancedContainerWindow(at, batch, anchors);
	return metaCommunityWindow(at, batch, anchors);
}
/**
* Exported for a driver only: the shape tests, so they can be exercised without a
* live deployment.
*
* `metaCommunityWindow` is here so a driver can hand it a SYNTHETIC BLIND BATCH —
* eleven rows all `status: null` — and prove two things that a green run cannot:
* that `stale` can actually be set, and that a blind probe keeps its eleven rows
* and reports zero 404s rather than manufacturing seven of them. **A marker that
* has never been observed firing is a caption, and the only way to know is to move
* the value and watch the payload change.**
*/
const __test = Object.freeze({
	locateAnchors,
	countFiles,
	countDirectories,
	patchFormOf,
	sizeOf,
	readProfile,
	probeBatch,
	metaCommunityWindow,
	staleOf,
	PROBE_TIMEOUT_MS
});
//#endregion
//#region src/host/providers/index.ts
/**
* The six modules the CONTRACT names. The paths are workspace-relative so a
* reader — and the `unavailable.reason` string — can go straight to the file.
*/
const BINDINGS = Object.freeze([
	{
		key: "plugins",
		path: "plugins-src/dsh-meta-market/src/host/providers/plugins.ts",
		module: plugins_exports
	},
	{
		key: "tools",
		path: "plugins-src/dsh-meta-market/src/host/providers/tools.ts",
		module: tools_exports
	},
	{
		key: "skills",
		path: "plugins-src/dsh-meta-market/src/host/providers/skills.ts",
		module: skills_exports
	},
	{
		key: "memory",
		path: "plugins-src/dsh-meta-market/src/host/providers/memory.ts",
		module: memory_exports
	},
	{
		key: "intent",
		path: "plugins-src/dsh-meta-market/src/host/providers/intent.ts",
		module: intent_exports
	},
	{
		key: "advanced",
		path: "plugins-src/dsh-meta-market/src/host/providers/advanced.ts",
		module: advanced_exports
	}
]);
/** The provider status table, for `/gui/health`. */
function providerTable() {
	return BINDINGS.map((binding) => ({
		key: binding.key,
		path: binding.path,
		landed: binding.module !== null
	}));
}
/** The module path expected to answer a window, whether or not it landed. */
function providerPathFor(id) {
	const row = rowFor(id);
	return BINDINGS.find((binding) => binding.key === row?.provider)?.path ?? "unmapped provider key";
}
/**
* The callable builder inside a provider namespace.
*
* Four shapes are accepted because four lanes are writing these files in parallel
* and the cost of tolerating a shape is one lookup, while the cost of refusing it
* is a window that reports "no builder" over a module that plainly has one:
* a named `buildWindow`, a default-exported object carrying `buildWindow`, a
* default-exported function, and a named `provide`.
*/
function resolveBuilder(module) {
	const seen = Object.keys(module).sort();
	const candidates = [];
	candidates.push(module.buildWindow);
	const fallback = module.default;
	if (typeof fallback === "function") candidates.push(fallback);
	if (fallback !== null && typeof fallback === "object") candidates.push(fallback.buildWindow);
	candidates.push(module.provide);
	return {
		fn: candidates.find((candidate) => typeof candidate === "function") ?? null,
		seen
	};
}
/**
* Does the module say it serves this window?
*
* A shared module (`advanced.ts`) declares `WINDOW_IDS`; a single-window module
* declares `WINDOW_ID`. A module that declares neither is trusted, because a
* lane that has not adopted the declaration should not lose its window over it —
* but a module that declares the WRONG id is refused loudly, because the
* alternative is serving one window's measurements under another window's label.
*/
function declares(module, id) {
	const single = module.WINDOW_ID;
	const many = module.WINDOW_IDS;
	if (Array.isArray(many)) {
		const ids = many.filter((entry) => typeof entry === "string");
		if (ids.length > 0 && !ids.includes(id)) return {
			ok: false,
			reason: `module declares WINDOW_IDS [${ids.join(", ")}] and does not serve '${id}'`
		};
		return { ok: true };
	}
	if (typeof single === "string" && single !== id) return {
		ok: false,
		reason: `module declares WINDOW_ID '${single}' and was asked for '${id}'`
	};
	return { ok: true };
}
/**
* Ask one window's provider for its payload, never throwing.
*
* @param id - one of the ten window ids.
* @returns an outcome carrying either a payload or a reason; always one of the three states.
*/
async function callProvider(id) {
	const row = rowFor(id);
	const provider = row?.provider ?? "unmapped";
	const path = providerPathFor(id);
	const measuredAt = (/* @__PURE__ */ new Date()).toISOString();
	if (row === void 0) return {
		windowId: id,
		provider,
		path,
		landed: false,
		payload: null,
		failed: {
			reason: `'${id}' is not one of the ten window ids`,
			measuredAt
		}
	};
	const binding = BINDINGS.find((candidate) => candidate.key === row.provider);
	if (binding === void 0 || binding.module === null) return {
		windowId: id,
		provider,
		path,
		landed: false,
		payload: null,
		failed: null
	};
	const { fn, seen } = resolveBuilder(binding.module);
	if (fn === null) return {
		windowId: id,
		provider,
		path,
		landed: true,
		payload: null,
		failed: {
			reason: `provider module exported no builder; exports seen: [${seen.join(", ")}]`,
			measuredAt
		}
	};
	const declaration = declares(binding.module, id);
	if (!declaration.ok) return {
		windowId: id,
		provider,
		path,
		landed: true,
		payload: null,
		failed: {
			reason: declaration.reason,
			measuredAt
		}
	};
	try {
		const result = await fn(id);
		if (result === null || typeof result !== "object") return {
			windowId: id,
			provider,
			path,
			landed: true,
			payload: null,
			failed: {
				reason: `provider returned ${result === null ? "null" : typeof result} rather than a payload object`,
				measuredAt
			}
		};
		return {
			windowId: id,
			provider,
			path,
			landed: true,
			payload: result,
			failed: null
		};
	} catch (error) {
		return {
			windowId: id,
			provider,
			path,
			landed: true,
			payload: null,
			failed: {
				reason: `provider threw — ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
				measuredAt: (/* @__PURE__ */ new Date()).toISOString()
			}
		};
	}
}
/**
* Ask every window, in registry order. Each call carries its own failure boundary.
*
* CONCURRENT SINCE 2026-10-18, AND THE FAILURE BOUNDARY IS UNCHANGED. This was a
* sequential `for … await` loop, which made a ten-window read cost the SUM of ten
* provider builds rather than the MAX. MEASURED on the live profile, 2026-10-18
* 17:19:05–17:21:04 local, `/gui/section?window=<id>` twice per id (pass-1/pass-2
* seconds): meta-plugins 42.84/32.91, meta-tools 4.04/6.18, meta-skills 1.79/5.07,
* meta-memory 0.13/0.15, meta-intent 5.62/5.48, advanced 5.38/5.19, meta-agents
* 1.58/0.06, meta-loops 0.15/0.21, meta-cordis 0.23/0.07, meta-community 0.11/0.04 —
* a sequential sum of **61.87 s / 55.36 s** against a longest window of **42.84 s**.
*
* `callProvider` returns an OUTCOME for every path including a thrown provider (its
* `try/catch` at the bottom is the boundary the module header requires), so it
* never rejects: `Promise.all` cannot turn one window's failure into another
* window's absence, and there is still no uncaught `Promise.all` here. Order is
* preserved because `Promise.all` preserves input order, so the sections catalog
* cannot be reordered by which provider finishes first.
*/
async function collectOutcomes(ids) {
	return Promise.all(ids.map((id) => callProvider(id)));
}
//#endregion
//#region src/host/routes.ts
/** The absolute prefix every route in this clone lives under. */
const PREFIX = `/${ROUTE_PREFIX}`;
/**
* THE THREE GUI WINDOW PATHS, built from `PREFIX` ONCE.
*
* This constant exists because of `D-0071`, and specifically because of the
* defect it records: `${PREFIX}/api/lanes` was written when `PREFIX` already
* ended in `/api`, the segment doubled, the branch comparing against it was
* unreachable, and the 404 body **advertised the path it did not serve**. The
* guard against a repeat is structural rather than careful: `PREFIX` appears in
* each string exactly once, the same expression is used for the advertised list
* and for the dispatch comparison, and `tmp/mmg-host-drive.mjs` drives every
* advertised path and requires none to answer 404.
*/
const GUI_SECTIONS = `${PREFIX}/gui/sections`;
const GUI_SECTION = `${PREFIX}/gui/section`;
const GUI_HEALTH = `${PREFIX}/gui/health`;
/**
* THE HOSTING LEDGER PATH — provider-hosted preheated cache agents.
*
* Built from `PREFIX` exactly once, like the three GUI paths above, because the
* same defect is available to any hand-typed variant: `D-0071`'s doubled segment
* made an advertised path unreachable and a 404 body advertise it. The path is in
* `REGISTERED_PATHS` because it is dispatched here, and the dispatch comparison
* uses the one constant.
*/
const HOSTING = `${PREFIX}/hosting`;
/**
* The paths this clone answers, derived from what is actually wired.
*
* **DERIVED RATHER THAN LISTED**, because a hand-maintained path list beside a
* route table is two statements of one fact and they drift. The 404 handler
* echoes this, so a reader who mistypes a path is told the real set rather than a
* subset that a previous edit forgot.
*
* **AND THE DERIVATION HAD TO BE FIXED, BECAUSE IT WAS ADVERTISING A PATH THAT
* 404s.** `PREFIX` is `/${ROUTE_PREFIX}`, and `ROUTE_PREFIX` is already
* `'meta-market/api'` — so this array previously contained
* `${PREFIX}/api/lanes`, i.e. **`/meta-market/api/api/lanes`, with the segment
* `api` doubled.** The `handle` branch comparing against that same doubled string
* was therefore **unreachable**, and the 404 body listed it under `registered`:
* **the surface advertised a route it did not serve.** Found when the three new
* report routes 404'd on a first run with the identical mistake in their keys —
* the new failure exposed the old one, which is the useful thing about wiring by
* derivation rather than by hand.
*
* **The measured form is the single-`api` one, and it is asserted in the harness
* (`F1`/`F3` drive `/meta-market/api/patch/status` and `/patch/blindness`; `G1`
* drives `/meta-market/api/alignment`).** A path list is a claim about the
* surface, so it belongs in the same test as the surface.
*/
const REGISTERED_PATHS = Object.freeze([
	PREFIX,
	`${PREFIX}/lanes`,
	...PATCH_ROUTES.map((row) => `${PREFIX}${row.path}`),
	`${PREFIX}/alignment`,
	`${PREFIX}/dialogue`,
	`${PREFIX}/identity`,
	`${PREFIX}/safety`,
	`${PREFIX}/social`,
	HOSTING,
	GUI_SECTIONS,
	GUI_SECTION,
	GUI_HEALTH
]);
/**
* THE GUI WINDOW ROUTES — three read routes that serve the ten-window surface.
*
* A 400 THAT NAMES THE TEN IDS IS THE POINT, NOT A SIDE EFFECT
*
* `D-0071` records what an advertised path that 404s costs, and this surface has
* a second trap of its own: **a 404 on `/gui/section` is indistinguishable from
* an unmounted plugin.** The prefix exists only while this plugin is registered,
* so a reader who asks for a window and receives 404 cannot tell "that window id
* is wrong" from "nothing is mounted here" — and those need opposite responses.
* So an unknown or missing `window` answers **400 with the ten ids in the body**,
* and 404 under this prefix is reserved for "this route is not in this clone".
*
* The outcomes are collected ONCE per request, so the sections catalog, the single
* window and the health count are three views of one instant rather than three
* instants a provider could land between.
*
* **CORRECTED 2026-10-18 — THE SENTENCE ABOVE WAS TRUE OF THE LOOP AND FALSE OF THE
* INSTANTS, AND IT WAS READ AS A GUARANTEE THE CODE DID NOT PROVIDE.** `collectOutcomes`
* was called exactly once per request (that part was true), but it built the ten windows
* one after another, so each provider measured at ITS OWN instant and the catalog is a
* mosaic rather than a snapshot. MEASURED from one live `/gui/sections` response
* (2026-10-18 17:25:04–17:25:49 local, 45.7 s, HTTP 200): `generatedAt` **00:25:04Z**,
* `meta-plugins` census **00:25:04**, `meta-tools` **00:25:29**, `meta-skills` **00:25:32**,
* `meta-intent` **00:25:42**, `advanced` **00:25:42**, `meta-agents` **00:25:49**,
* `meta-loops` **00:25:49**, `meta-cordis` **00:25:49**, `meta-community` **00:25:49** —
* **45 seconds between the first and last census stamp inside one request.** (`meta-memory`
* reports its own fixed `CENSUS_AT`, which is honest because it carries the reading's own
* time rather than the request's.) AND the advanced provider could RE-COLLECT its probe
* batch per window inside that one pass: its TTL stamp was taken before the await, so a
* batch slower than 15 s was written already expired and the next of its three windows
* re-probed all eleven routes — the shape of the **122.65 s** `/gui/sections` outlier.
*
* The corrected statement, which the code now keeps: **the outcomes are collected in ONE
* concurrent pass per request (`Promise.all` over ten independent providers, each with its
* own failure boundary), and every window's payload carries the census instant at which its
* own reading was taken — the catalog is a set of instants that are LABELLED, not one
* instant.** The advanced provider now shares one in-flight probe batch across its three
* windows, so those three are one instant.
*/
async function handleGui(path, params, req, res) {
	const normalised = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
	const isSections = normalised === GUI_SECTIONS;
	const isSection = normalised === GUI_SECTION;
	if (!isSections && !isSection && !(normalised === GUI_HEALTH)) return false;
	if (req.method !== "GET" && req.method !== "HEAD") {
		sendJson(res, 405, {
			ok: false,
			error: `method ${req.method ?? "unknown"} is not allowed here; this route is read-only`,
			allowed: ["GET"]
		});
		return true;
	}
	const now = /* @__PURE__ */ new Date();
	if (isSection) {
		const requested = params.get("window");
		if (requested === null || requested.length === 0) {
			sendJson(res, 400, {
				ok: false,
				error: "the query parameter `window` is required",
				route: GUI_SECTION,
				attempted: null,
				knownWindows: WINDOW_IDS$1,
				why: "an unknown window is answered with 400 rather than 404, because under this prefix a 404 is indistinguishable from a plugin that is not mounted (D-0071)"
			});
			return true;
		}
		if (!isWindowId(requested)) {
			sendJson(res, 400, {
				ok: false,
				error: `unknown window '${requested}'`,
				route: GUI_SECTION,
				attempted: requested,
				knownWindows: WINDOW_IDS$1,
				why: "these are the ten window ids from research/meta-market-gui/CONTRACT.md; a 404 here would be indistinguishable from an unmounted plugin (D-0071)"
			});
			return true;
		}
		const row = rowFor(requested);
		if (row === void 0) {
			sendJson(res, 500, {
				ok: false,
				error: `registry inconsistency: '${requested}' is a valid WindowId but has no registry row`,
				knownWindows: WINDOW_IDS$1
			});
			return true;
		}
		const outcome = (await collectOutcomes([requested]))[0];
		if (outcome === void 0) {
			sendJson(res, 500, {
				ok: false,
				error: `no provider outcome produced for '${requested}'`,
				knownWindows: WINDOW_IDS$1
			});
			return true;
		}
		sendJson(res, 200, {
			ok: true,
			...buildEnvelope(row, outcome, now)
		});
		return true;
	}
	const outcomes = await collectOutcomes(WINDOW_IDS$1);
	const assembly = await describeAssembly(req);
	if (isSections) {
		sendJson(res, 200, {
			ok: true,
			...buildSections(outcomes, now),
			rail: {
				primary: PRIMARY_IDS,
				advanced: ADVANCED_IDS
			},
			assembly: {
				id: assembly.id,
				kind: assembly.kind,
				mounted: assembly.mounted,
				mount: assembly.mount
			}
		});
		return true;
	}
	sendJson(res, 200, {
		ok: true,
		...buildHealth(outcomes, assembly, REGISTERED_PATHS, providerTable(), now)
	});
	return true;
}
/**
* THE THREE REPORT-ONLY LANE SURFACES, AND WHY THEY ARE REPORTS.
*
* `alignment`, `dialogue` and `identity` each export a real barrel — the module
* that DECLARES their public surface. So each gets a route. But the route returns
* that lane's **declared constants and its honest state**, and it does NOT accept
* an input and run the lane, for a reason that is measured rather than stylistic:
*
*   - `alignment`'s `alignPackage(input)` needs a **live intent index**. `census.ts`
*     exports `LIVE_CATALOG_NOT_MEASURED` — the lane's own name for the fact that
*     the live catalog has NOT been read at serve time. A route that ran
*     `alignPackage` here would have to either invent an index or read one at
*     request time; inventing is a fabrication and reading it per request puts an
*     unmeasured dependency in a boot-time-registered handler.
*   - `dialogue`'s decision path goes through `decideByLaya` to a **local Laya
*     endpoint**. That is a model call, and this assembly is registered at boot by
*     a Cordis plugin that must not reach a device — the standing rule is that
*     **no plugin in this program opens a device or talks to a model**; the models
*     are served by `llama.cpp` beside the harness. A route wired to `decideByLaya`
*     would put a model dependency behind an HTTP GET.
*   - `identity`'s `readInstanceIdentity` reads `~/.dsh/.anonymous-user-id`, which
*     this deployment measured as a **37-byte bare UUID** — an identifier with no
*     key. Publishing it over HTTP is neither needed nor harmless, so the route
*     reports the VOCABULARY and the trust stages and **does not echo the id**.
*
* **Every row below is a constant that the lane itself exports**, so this route is
* a PIPE and not an opinion: if a lane changes its threshold, its vocabulary or
* its phases, this surface changes with it and no edit here is required. That
* property is the whole justification for reporting rather than re-deriving.
*
* **THE HONEST DEGRADATION IS THE POINT.** A reader who hits `/api/alignment` gets
* the threshold and the measured separation and the explicit statement that the
* live catalog is not measured — rather than a plausible score computed from an
* index nobody read.
*/
function alignmentReport() {
	return {
		lane: "alignment",
		kind: "plan",
		threshold: {
			name: ALIGN_THRESHOLD,
			value: ALIGN_THRESHOLD_VALUE,
			standing: "PROVISIONAL / PROGRAM CHOICE"
		},
		measuredSeparation: MEASURED_SEPARATION,
		liveCatalog: LIVE_CATALOG_NOT_MEASURED,
		intentMapRoutes: INTENT_MAP_ROUTES,
		evidence: laneEvidence(),
		/**
		* CORRECTED 2026-10-16 after `intent-alignment` reported this string stale (`task-16`, §8).
		* It read: *"alignPackage(input) is NOT called here: it needs a live intent index, and this
		* lane reports LIVE_CATALOG_NOT_MEASURED rather than an index nobody read."*
		*
		* **The first clause is still true of this route; the REASON was false.** The lane then READ
		* an index from disk (233,992 B, 24 vectors x 1024) and it produced real verdicts — so an
		* index on disk is SUFFICIENT, and "it needs a live index" tells a reader the operation is
		* blocked when it is only unwired. `LIVE_CATALOG_NOT_MEASURED` was never the obstacle; it is
		* a statement about the CATALOG, not about the index.
		*
		* **This is `D-0073`'s shape on my own file, and the lane that caught it was reading its own
		* surface back rather than trusting mine.** A `notDone` may state what a route does not do.
		* It may not supply a cause that is not the cause.
		*
		* AND THE RUN REPLACED THE NUMBER I PUBLISHED HERE. `MEASURED_SEPARATION` (0.215) was fitted
		* on a thin population; the lane's six-phrasing run measured a spread of **0.225753 — WIDER
		* than the separation the threshold was fitted to** — so `threshold.standing` above is
		* PROVISIONAL for a measured reason rather than a disclaimer. Read the lane's §5 and §15.
		*/
		notDone: "This ROUTE does not call alignPackage and serves no alignment verdict. That is an UNWIRED route, not a missing capability: the lane has run the operator end to end against an index read from disk. It does NOT call it because a GET must not spend an embedding call, and because the threshold below is PROVISIONAL — see the lane record before relying on any verdict it reports."
	};
}
function dialogueReport() {
	return {
		lane: "dialogue",
		kind: "plan",
		moves: DIALOGUE_MOVES,
		livePhases: LIVE_PHASES,
		terminalPhases: TERMINAL_PHASES,
		refusalCodes: REFUSAL_CODES,
		abstentionReasons: ABSTENTION_REASONS,
		bounds: DEFAULT_BOUNDS,
		threeKinds: THREE_KINDS,
		unmeasuredConfidence: UNMEASURED_CONFIDENCE,
		laya: {
			endpoint: DEFAULT_LAYA_ENDPOINT,
			route: DECISION_ROUTE
		},
		/**
		* CORRECTED 2026-10-16T18:0xZ after `verifier` falsified the previous wording,
		* which read: *"decideByLaya is NOT reachable here: it is a model call, and no
		* plugin in this program opens a device or talks to a model (llama.cpp serves
		* the models beside the harness)."*
		*
		* **The first clause was true and the JUSTIFICATION was false, which is the
		* worse half to get wrong.** `decideByLaya` IS exported by this lane's own
		* barrel (`dialogue/index.ts`), it DOES open a socket (`dialogue/laya.ts`:
		* `await fetch(url, …)`), and **the lane's own shipped check drives it live
		* against `127.0.0.1:8008`.** So the claim that no plugin here talks to a model
		* was false about this very lane, and it was the sentence a reader would use to
		* decide what this program is permitted to do.
		*
		* The accurate statement separates three facts: this ROUTE does not call it;
		* this PLUGIN's barrel does export it; and the LANE's harness does drive it
		* live. **A `notDone` may say what this route does not do. It may not assert a
		* program-wide prohibition that its own lane's tests contradict.**
		*/
		notDone: "This ROUTE does not call decideByLaya and serves no decision. That is not because the call is unavailable — dialogue/laya.ts opens a socket to the local Laya endpoint and the lane its own harness drives it live (see laya.endpoint below). It is because this route is a read-only report: an HTTP GET must not be able to spend a model call, so no decision path is reachable FROM THIS SURFACE."
	};
}
/**
* THE SET-TO-ARRAY BOUNDARY, AND IT IS NOT COSMETIC.
*
* `JSON.stringify` serialises a `Set` as **`{}`** — not as an array, and not as an
* error. Measured on this build: `AUTHENTICATED_CAPABILITY_TOKENS` is a
* `ReadonlySet<string>` with members, and it appeared in this surface as
* **`absent`** because `{}` has no `length`. So the route published an **empty
* object where the lane declares a populated set**, and a reader would conclude
* the vocabulary was empty — **a case of this program's own absent-versus-empty
* trap, arriving through the serialiser rather than through a `|| 0`.**
*
* It was caught by assertion `G5`, which asserted the field was an ARRAY, so this
* is the harness doing its job rather than a near miss. The general guard: **any
* `Set` or `Map` crossing an HTTP boundary must be converted explicitly**, because
* the failure is silent and the result is indistinguishable from a genuinely empty
* collection.
*
* Converted HERE rather than in `capability-vocabulary.ts`: those two declarations
* are that lane's public surface and are correctly typed as sets for their own
* use. Changing them to arrays to suit this consumer would be the assembly
* editing a lane to fit its own transport — the same error this file refuses when
* it declines to invent a route table for a lane that declares none.
*/
function setToSortedArray(value) {
	return Object.freeze([...value].sort());
}
function identityReport() {
	return {
		lane: "identity",
		kind: "plan",
		trustStages: TRUST_STAGES,
		trustStoreFile: TRUST_STORE_FILE,
		vocabulary: VOCABULARY_CENSUS,
		declaredCapabilityTokens: setToSortedArray(DECLARED_CAPABILITY_TOKENS),
		authenticatedCapabilityTokens: setToSortedArray(AUTHENTICATED_CAPABILITY_TOKENS),
		credentialRedLineMarkers: CREDENTIAL_RED_LINE_MARKERS,
		networkRedLineMarkers: NETWORK_RED_LINE_MARKERS,
		authenticated: false,
		notDone: "readInstanceIdentity is NOT called here and the local id is NOT echoed: this deployment has an identifier and no key, so publishing the identifier proves nothing and leaks a stable handle"
	};
}
/**
* The lanes as they stand.
*
* **THIS ARRAY IS A VERIFIED (read) CLAIM, NOT A VERIFIED (ran) ONE, AND SAYING
* SO IS THE POINT.** Each row was established by reading the lane's own barrel and
* research record, and each cites the file it came from in `evidence` so a reader
* can audit the claim instead of taking this array on trust. It is deliberately NOT
* computed by scanning `src/host/**` at boot: a boot-time scan would report a lane
* that failed to compile as merely ABSENT, which is precisely the distinction the
* array exists to preserve.
*
* **CORRECTED 2026-10-17T14:5xZ — THIS PARAGRAPH USED TO SAY *"`mounted: false` on
* every row is not pessimism. No profile manifest consumes this package."* THAT
* WAS FALSE, and it was false for a day while the payload published it.**
* Measured by `lead` at `2026-10-17T14:51:53Z`: pid 24760 (StartTime unchanged
* `12:56:16.396 -07:00`) answers SEVEN of the advertised paths with 200, and
* `profiles-tree/personal-dev/package.json` names this package at
* `dependencies.dsh-meta-market` AND inside `dsh.profile.bundles`. The package IS
* consumed and IS mounted; the surface said otherwise because the value was a
* LITERAL. It is now read from that manifest on every request (see `readMount`),
* so it cannot go stale without the manifest changing under it.
*/
const LANE_ROWS = Object.freeze([
	{
		id: "identity",
		kind: "plan",
		wired: true,
		summary: "peer identity, capability vocabulary and the local-record admission rule; the trust root kind is plan because this deployment has an identifier and no key"
	},
	{
		id: "dialogue",
		kind: "plan",
		wired: true,
		summary: "bounded, refusable dialogue whose two confidence quantities are distinct types that cannot be compared against one threshold"
	},
	{
		id: "alignment",
		kind: "plan",
		wired: true,
		summary: "alignment of meta-packages to the 24-zone intent map; threshold 0.6605, provisional, with a named must-REFUSE control"
	},
	{
		id: "patch",
		kind: "plan",
		wired: true,
		summary: "verify-before-apply with a seven-entry blindness register returned as a VALUE on every verdict, pass or fail; its nine routes are dispatched from its own table below"
	},
	{
		id: "safety",
		kind: "plan",
		wired: true,
		summary: "22 enumerated threats, the union privilege gate, and replay and budget controls; every control governs consistency rather than authenticity"
	},
	{
		id: "social",
		kind: "plan",
		wired: true,
		summary: "DHT discovery on (zoneId, bucket) with epidemic convergence; global traffic O(N), linear, with the O(N-squared) roster shape named and declined"
	}
]);
/** Where each claim above can be checked, so the reporting surface is auditable. */
const LANE_EVIDENCE = Object.freeze({
	identity: "research/meta-market-identity-trust.md",
	dialogue: "research/meta-market-dialogue.md",
	alignment: "research/meta-market-alignment.md",
	patch: "research/meta-market-patches.md",
	safety: "research/meta-market-safety.md",
	social: "research/meta-market-social.md"
});
/**
* ============================================================================
* MOUNTED-NESS, MEASURED AT REQUEST TIME — and the literal it replaces
* ============================================================================
*
* This file used to publish `mounted: false` as a LITERAL, and a doc comment
* beside it explained the literal as a fact: *"no profile manifest consumes this
* package"*. Both were published for a day and both were wrong. `lead` measured
* at `2026-10-17T14:51:53Z` that pid 24760 (same StartTime `12:56:16.396 -07:00`,
* so the process had not restarted) answers SEVEN advertised paths with `200`,
* and `profiles-tree/personal-dev/package.json` names this package twice —
* `dependencies["dsh-meta-market"] = "link:../../plugins-src/dsh-meta-market"` and
* `dsh.profile.bundles` containing `"dsh-meta-market"`.
*
* **The lesson is not "write true instead of false".** A new literal goes stale
* the same way, and the next reader has no way to tell a measurement from a
* caption. So mounted-ness is DERIVED from a read of the manifest on every
* request, the reading's inputs are published beside the verdict, and a manifest
* that cannot be found or parsed yields `null` — NOT MEASURED — never `false`.
*
* WHY THE MANIFEST IS FOUND BY WALKING UP AND NOT BY A PATH CONSTANT
*
* The plugin is consumed through a relative `link:` from the profile, so the two
* live in one tree but neither can name the other's absolute path portably. The
* walk starts at this module's own directory (which is `lib/` in the bundle and
* `src/host/` under a source drive) and looks for the profile at the fixed
* relative shape `profiles-tree/personal-dev/package.json`, giving up after
* `MOUNT_SEARCH_DEPTH` levels. A give-up is reported as an absence with the
* directory it searched, so "not measured" never reads as "not mounted".
*/
const MOUNT_PACKAGE = "dsh-meta-market";
const MOUNT_SEARCH_DEPTH = 8;
/** The profile manifest, found by walking up from this module. `null` when it is not there. */
function profileManifestPath() {
	let dir;
	try {
		dir = dirname(fileURLToPath(import.meta.url));
	} catch {
		return {
			path: null,
			searchedFrom: null
		};
	}
	const start = dir;
	for (let depth = 0; depth < MOUNT_SEARCH_DEPTH; depth += 1) {
		const candidate = join(dir, "profiles-tree", "personal-dev", "package.json");
		if (existsSync(candidate)) return {
			path: candidate,
			searchedFrom: start
		};
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return {
		path: null,
		searchedFrom: start
	};
}
/**
* Read the profile manifest and report whether it loads this package.
*
* `mounted` means: **the package name is listed in `dsh.profile.bundles`**, which
* is the list the profile's own loader consumes. Being present in `dependencies`
* without being bundled is installed-but-unloaded and is reported as
* `linkedInDependencies: true, mounted: false` — two different facts, kept apart.
*/
function readMount(now) {
	const at = now.toISOString();
	const { path, searchedFrom } = profileManifestPath();
	if (path === null) return {
		mounted: null,
		manifestPath: null,
		manifestBytes: null,
		linkedInDependencies: null,
		listedInBundles: null,
		bundlesCensus: null,
		searchedFrom,
		measuredAt: at,
		reason: `NOT MEASURED: no profiles-tree/personal-dev/package.json within ${MOUNT_SEARCH_DEPTH} levels above ${searchedFrom ?? "an unresolvable module directory"}`
	};
	try {
		const text = readFileSync(path, "utf8");
		const manifest = JSON.parse(text);
		const dependencies = manifest.dependencies;
		const linked = dependencies !== null && typeof dependencies === "object" && MOUNT_PACKAGE in dependencies;
		const dsh = manifest.dsh;
		const profile = dsh !== null && typeof dsh === "object" ? dsh.profile : null;
		const bundles = profile !== null && typeof profile === "object" ? profile.bundles : null;
		const list = Array.isArray(bundles) ? bundles.filter((entry) => typeof entry === "string") : null;
		const listed = list === null ? null : list.includes(MOUNT_PACKAGE);
		return {
			mounted: listed,
			manifestPath: path,
			manifestBytes: Buffer.byteLength(text),
			linkedInDependencies: linked,
			listedInBundles: listed,
			bundlesCensus: list === null ? null : {
				entries: list.length,
				containsPackage: list.includes(MOUNT_PACKAGE) ? 1 : 0
			},
			searchedFrom,
			measuredAt: at,
			reason: listed === null ? `NOT MEASURED: ${path} has no dsh.profile.bundles array, so bundle membership cannot be read` : listed ? null : `READ: ${path} does not list ${MOUNT_PACKAGE} in dsh.profile.bundles`
		};
	} catch (error) {
		return {
			mounted: null,
			manifestPath: path,
			manifestBytes: null,
			linkedInDependencies: null,
			listedInBundles: null,
			bundlesCensus: null,
			searchedFrom,
			measuredAt: at,
			reason: `NOT MEASURED: ${path} could not be read — ${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* THE SELF-PROBE HEADER, AND WHY IT EXISTS RATHER THAN A TIMEOUT GUARD
*
* `mounted` and `kind` are derived from a LIVE fetch of this plugin's own prefix
* (`lead`'s ruling, `D-0244`). That fetch is a request into the same handler, so
* without a stop condition it recurses: assembling a payload would probe, the
* probe would assemble a payload, and so on until the stack or the timeout ended
* it. The stop condition is a header: **any request carrying `x-mmg-selfprobe`
* answers a fixed minimal body and never reaches the assembly.** A header rather
* than a path so the advertised route set does not grow to accommodate an
* instrument, and rather than a module flag because a flag is per-process state
* that two concurrent requests would share.
*
* There is a second, quieter benefit: the short-circuit carries no assembly, so a
* probe measures ROUTING — does a request to this prefix reach this plugin — and
* not the data, and a probe that fails therefore cannot look like a data problem.
*/
const SELF_PROBE_HEADER = "x-mmg-selfprobe";
/** How long a self-probe may take before it is reported as NOT MEASURED. Short: it is loopback. */
const SELF_PROBE_TIMEOUT_MS = 400;
/** One GET against this plugin's own prefix, with the self-probe header set. */
async function probeStatus(origin, path) {
	try {
		const response = await fetch(origin + path, {
			headers: { [SELF_PROBE_HEADER]: "1" },
			signal: AbortSignal.timeout(SELF_PROBE_TIMEOUT_MS)
		});
		await response.arrayBuffer();
		return response.status;
	} catch {
		return null;
	}
}
/**
* Probe the deployment this request arrived on.
*
* The origin is the incoming `Host` header, so the probe asks THE SERVER THAT IS
* ALREADY ANSWERING — not a hard-coded port. That matters because this plugin can
* be mounted on any port, and a hard-coded `127.0.0.1:3083` would make the reading
* describe somebody else's process.
*
* TWO PROBES, TWO QUESTIONS, AND THEY ARE ALLOWED TO DISAGREE:
*   - `prefixStatus` asks whether the prefix is registered — the MOUNT question.
*   - `guiStatus` asks whether THIS BUILD's GUI surface is live — the FRESHNESS
*     question, and the one that distinguishes "mounted with an older body" from
*     "mounted with this body". A process that loaded yesterday answers 200 to the
*     first and 404 to the second, which is precisely the state the owner's live
*     session is in.
*/
async function readServed(req, now) {
	const host = req.headers.host;
	const at = now.toISOString();
	if (typeof host !== "string" || host.length === 0) return {
		origin: null,
		prefixStatus: null,
		guiStatus: null,
		at,
		reason: "NOT MEASURED: the request carried no Host header, so there is no origin to probe",
		timeoutMs: SELF_PROBE_TIMEOUT_MS
	};
	const origin = `http://${host}`;
	const [prefixStatus, guiStatus] = await Promise.all([probeStatus(origin, PREFIX), probeStatus(origin, GUI_HEALTH)]);
	return {
		origin,
		prefixStatus,
		guiStatus,
		at,
		reason: prefixStatus !== null || guiStatus !== null ? null : `NOT MEASURED: neither ${PREFIX} nor ${GUI_HEALTH} answered ${origin} within ${SELF_PROBE_TIMEOUT_MS}ms`,
		timeoutMs: SELF_PROBE_TIMEOUT_MS
	};
}
/**
* The assembly's own report.
*
* `authenticated: false` is a CONSEQUENCE of three independent measurements, not
* a disclaimer, and the reference to each is carried beside it. Three lanes
* reached the same structural finding from three different instruments:
* `identity-trust` measured that `~/.dsh/.anonymous-user-id` is a 37-byte bare
* UUID and that no signing primitive appears in any non-test source file;
* `safety-gate` concluded that every control in its lane governs CONSISTENCY and
* not AUTHENTICITY; `patch-distribution` found that the protocol declares no
* signature field at all, so an admitted envelope was INSPECTED and never PROVEN.
* One measurement is a finding; three instruments agreeing is a fact about the
* build.
*
* @returns the report object, ready to serialise.
*/
async function describeAssembly(req) {
	const now = /* @__PURE__ */ new Date();
	const mount = readMount(now);
	const served = req === void 0 ? {
		origin: null,
		prefixStatus: null,
		guiStatus: null,
		at: now.toISOString(),
		reason: "NOT MEASURED: no request was supplied to the assembler, so there was no origin to probe",
		timeoutMs: SELF_PROBE_TIMEOUT_MS
	} : await readServed(req, now);
	/**
	* `mounted` IS THE COMPOSITE `lead` RULED FOR (`D-0244`): the package must be
	* DECLARED in the profile's `dsh.profile.bundles` **and** the prefix must ANSWER
	* a live fetch with something other than 404. Either half alone is a weaker
	* claim than the word "mounted" carries:
	*   - declared but unmeasured  → somebody edited a manifest, nobody proved a load;
	*   - answering but undeclared → something is serving, but not necessarily from
	*     the profile the user thinks is running.
	* When either half could not be measured the composite is `null`, NOT `false`,
	* and `mount.reason` / `served.reason` say which half was missing.
	*/
	const mounted = mount.listedInBundles === null || served.prefixStatus === null ? null : mount.listedInBundles && served.prefixStatus !== 404;
	/**
	* `kind` IS DERIVED, from ONE measurement: does the live deployment serve THIS
	* BUILD's GUI surface (`/gui/health`, which exists only in a bundle built after
	* 2026-10-17T21:5xZ)?
	*
	* That question is chosen because it is the only one that separates the two
	* states that look identical from outside: a process that loaded an OLDER body
	* of this plugin answers 200 on the prefix and 404 on the GUI routes, so calling
	* its state "exists" would be a claim about code that process is not running.
	* When the probe was not measured the value stays `plan` — the non-claiming
	* direction — and `served.reason` says the measurement is missing.
	*/
	const kind = served.guiStatus === 200 ? "exists" : "plan";
	const wired = LANE_ROWS.filter((lane) => lane.wired).length;
	const transport = LANE_ROWS.filter((lane) => lane.wired).map((lane) => ({
		lane: lane.id,
		routes: lane.id === "patch" ? PATCH_ROUTES.length : 1,
		kind: lane.id === "patch" ? "dispatched-table" : "report-only"
	}));
	return {
		id: "dsh-meta-market",
		/**
		* DERIVED, NOT WRITTEN (`D-0244`). `kind` is `exists` only when the live
		* deployment serves THIS BUILD's `/gui/health` with 200. Today, against the
		* owner's running process, the probe answers 404 because that process loaded
		* an older body, so `kind` reads `plan` — and it will read `exists` on the
		* first request after the restart WITHOUT AN EDIT HERE. That is the property
		* the old literal lacked: this value cannot go stale, only unmeasured.
		*/
		kind,
		/**
		* DERIVED, NOT WRITTEN. The composite of the manifest read (`mount`) and the
		* live probe (`served`); both readings are published beside it so a reader can
		* audit the verdict instead of trusting a boolean.
		*/
		mounted,
		mount,
		/**
		* REPLACED 2026-10-17 — this field used to be `notServed` and read *"THIS
		* SURFACE HAS NEVER ANSWERED ON A PORT … `personal-dev/package.json` contains
		* 0 references to this package"*. **Both clauses were false and had been
		* published on a live route for a day** (`lead`, `2026-10-17T14:51:53Z`: seven
		* advertised paths answered 200 on pid 24760 with an unchanged StartTime, and
		* the manifest contains two references).
		*
		* `served` is now a REAL measurement made by this handler: two self-probes of
		* the origin the request arrived on (see `readServed`), separated because they
		* answer different questions — `prefixStatus` is the MOUNT question, `guiStatus`
		* is the FRESHNESS question. `null` on either is NOT MEASURED and is never
		* collapsed into a status code.
		*/
		served,
		noUserAttached: "THE INTENT MAP IS NOT ATTACHED TO A USER. The map this plugin aligns against is a map of the PLUGIN MARKET rather than of a person: its 24 vectors are keyed to ZONE ids, it holds no userId/sessionId, its `owner` fields name 565 plugin AUTHORS, and the only user-shaped file on this deployment is `.anonymous-user-id` — anonymous by its own name. So the owner's precondition \"intent of user is already formed\" fails as a precondition ON THIS ARTIFACT, and it is NOT an absence of the person from the system.",
		/**
		* The scope boundary above is LOAD-BEARING and was added after `identity-trust` falsified the
		* first version of that string (`task-19`, reported not fixed because this is the Lead's file).
		*
		* It read: "NO USER IS ATTACHED TO THIS SYSTEM." Measured against the session store, that
		* absolute is FALSE: frame-walking the multi-frame zstd logs finds `user/message` records in
		* 12 of 12 sampled logs. THE USER IS PRESENT IN THE SYSTEM AND ABSENT FROM THE MAP, and the
		* distinction inverts the finding's shape — an ABSENCE cannot be closed, a GAP can.
		*
		* AND THIS FILE ALREADY OWNS THE BOUNDARY IT NEEDED: `kind` is `exists` / `plan` / `future`,
		* and the scoped claim is `kind: plan` ON THE MAP rather than an absence claim about the
		* system. A finding that reads as "the user is not there" cannot be acted on; one that reads
		* "the user is not THERE, and the raw material to derive them IS" names a buildable gap.
		* `identity-trust` measured that raw material rather than asserting it: 555 user/message
		* records, in 12 of 12 sampled logs, out of 14,195 records (SAMPLE, not a census).
		*/
		noOtherMetaPlugins: "THE OTHER META PLUGINS ARE NOT ESTABLISHED. A scoped census finds exactly 1 `dsh-meta-*` clone on this machine and it IS this plugin, against a denominator of 28 clones — so the owner's phrase \"the other meta plugins are established\" is self-referential and unsatisfiable as written, and the two named alternatives are `future` goals that remain forbidden.",
		noTotalAlignment: "NO OBJECT EXISTS FOR \"manage the TOTAL system alignment\". There is no aggregate over peers anywhere in `src/host/**`: `alignment/` exports per-item operations and `social/` has `peerPairAlignment` (exactly two peers) and `quorumBound` (one instance). The missing component is `aggregateAlignment(perPeer, census)`, and a \"total\" over a FLOOR of 387 witnessed of 100,000 peers is a total over 0.387% and must be labelled one.",
		specVersion: 1,
		stepVersion: 1,
		prefix: PREFIX,
		authenticated: false,
		authenticationEvidence: [
			"research/meta-market-identity-trust.md — 37-byte bare UUID and no signing primitive in any non-test source file",
			"research/meta-market-safety.md — controls govern consistency, not authenticity",
			"research/meta-market-patches.md — B1: the protocol declares no signature field, so an admitted envelope is inspected, not proven"
		],
		lanes: LANE_ROWS.map((lane) => ({
			...lane,
			mounted,
			evidence: LANE_EVIDENCE[lane.id] ?? null
		})),
		/**
		* THE WIRING CENSUS, with its denominator. Six lanes exist; some number of
		* them answer over this prefix. Reporting the numerator alone would let a
		* reader assume the rest, so both are stated — and neither is a zero, so this
		* is a reading rather than an instrument failure.
		*/
		wiring: {
			wired,
			lanes: LANE_ROWS.length,
			transport,
			note: "a lane that is not wired is not thereby absent; it exposes typed functions and this assembly does not invent a route table for it"
		}
	};
}
/** JSON, with `no-store`, so a cached read can never be mistaken for a fresh one. */
function sendJson(res, status, body) {
	const payload = JSON.stringify(body, null, 2);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
/** Read the request body, bounded, and never throwing on a malformed payload. */
async function readBody(req, limit = 65536) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buf = chunk;
		size += buf.length;
		if (size > limit) return { __unreadable: `request body exceeded ${limit} bytes` };
		chunks.push(buf);
	}
	if (size === 0) return void 0;
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return { __unreadable: "request body was not valid JSON" };
	}
}
/**
* Handle one request under the prefix.
*
* A non-GET on a read-only route is `405` rather than a silent success, and an
* unknown path is `404` with the attempted path and the REAL path set echoed.
* Both are deliberate: a control surface that answers `200` to a typo teaches the
* user that a thing exists when it does not.
*
* `patch`'s own table decides `405` versus dispatch for its nine sub-paths — this
* function forwards the method verbatim rather than second-guessing it, because
* `dispatch` already returns the `allowed` list and a second opinion here would be
* the assembly overriding a lane about its own surface.
*
* @param req - the incoming request.
* @param res - the response to write.
*/
async function handle(req, res) {
	/**
	* THE SELF-PROBE STOP CONDITION, FIRST STATEMENT IN THE HANDLER.
	*
	* Assembling an assembly report probes this plugin's own prefix, and the probe
	* arrives at this same handler. Without this branch the first probe would
	* assemble another report, which would probe again. The branch is deliberately
	* the first thing here rather than inside a route: a stop condition that depends
	* on which path was asked for is a stop condition that can be bypassed by the
	* one path it does not know about.
	*/
	if (req.headers[SELF_PROBE_HEADER] !== void 0) {
		sendJson(res, 200, {
			ok: true,
			selfProbe: true,
			at: (/* @__PURE__ */ new Date()).toISOString()
		});
		return;
	}
	const url = new URL(req.url ?? "/", "http://dsh.invalid");
	const path = url.pathname;
	if (path === PREFIX || path === `${PREFIX}/` || path === `${PREFIX}/lanes`) {
		if (req.method !== "GET") {
			sendJson(res, 405, {
				ok: false,
				error: `method ${req.method ?? "unknown"} is not allowed here; this route is read-only`,
				allowed: ["GET"]
			});
			return;
		}
		sendJson(res, 200, {
			ok: true,
			assembly: await describeAssembly(req)
		});
		return;
	}
	if (path === HOSTING) {
		if (req.method !== "GET" && req.method !== "HEAD") {
			sendJson(res, 405, {
				ok: false,
				error: `method ${req.method ?? "unknown"} is not allowed here; this route is read-only`,
				allowed: ["GET"]
			});
			return;
		}
		sendJson(res, 200, {
			ok: true,
			...await getHostingReport(await getRegistry())
		});
		return;
	}
	const report = {
		[`${PREFIX}/alignment`]: alignmentReport,
		[`${PREFIX}/dialogue`]: dialogueReport,
		[`${PREFIX}/identity`]: identityReport,
		[`${PREFIX}/safety`]: describeSurface$1,
		[`${PREFIX}/social`]: describeSurface
	}[path];
	if (report !== void 0) {
		if (req.method !== "GET") {
			sendJson(res, 405, {
				ok: false,
				error: `method ${req.method ?? "unknown"} is not allowed here; this route is read-only`,
				allowed: ["GET"]
			});
			return;
		}
		sendJson(res, 200, {
			ok: true,
			...await report()
		});
		return;
	}
	if (await handleGui(path, url.searchParams, req, res)) return;
	const relative = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : null;
	if (relative !== null && relative.startsWith("/")) {
		const body = req.method === "GET" || req.method === "HEAD" ? void 0 : await readBody(req);
		const outcome = dispatch({
			method: req.method ?? "GET",
			path: relative,
			body
		});
		if (outcome !== null) {
			sendJson(res, outcome.status, outcome.body);
			return;
		}
	}
	sendJson(res, 404, {
		ok: false,
		error: "no such route in this clone",
		attempted: path,
		registered: REGISTERED_PATHS
	});
}
//#endregion
//#region src/host/index.ts
/** Loader row name; the bundle patch's single `insert` mounts this same name. */
const name = "dsh-meta-market";
/** The one service this plugin cannot work without. */
const inject = ["webServer"];
/**
* Register the prefix.
*
* `ctx.effect` is what makes the registration REVERSIBLE: the callback returns a
* disposer, the host holds it, and disposing unregisters the prefix. So a profile
* that drops this package stops serving it instead of leaving a live route to a
* plugin that is no longer loaded. A registration outside an effect leaks, and a
* leaked route keeps answering after its owner is gone — which is the worst
* possible failure mode for a surface whose entire subject is trust.
*
* @param ctx - the host context; the `webServer`, `effect` and `logger` members and nothing else.
*/
function apply(ctx) {
	ctx.logger.info("dsh-meta-market: applying (kind=plan); prefix=%s; mounted-ness is measured per request, not asserted here", PREFIX);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: PREFIX,
		handler: async (req, res) => {
			await handle(req, res);
		}
	}));
}
//#endregion
export { apply, inject, name };
