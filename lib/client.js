window.__ModuleLoader__.load({
	id: "dsh-meta-market",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/shell/locales.ts
		/**
		* The Client half's locale namespace and dictionary.
		*
		* ONE LANGUAGE, DELIBERATELY. The sibling `dsh-intent-map` registers `en` and
		* `zh`; this half registers `en` only, and the gap is stated rather than hidden.
		* A dictionary whose keys exist in one language and not the other is a silent
		* half-translation, and the program's own gate binds its deliverables to English
		* (`D-ENGLISH-GATE-1`), so a second dictionary is a decision for whoever owns that
		* gate and not a guess by this lane. When the locale service serves a `zh` UI, an
		* unregistered namespace falls back to the key, which is visibly wrong rather
		* than plausibly wrong — the failure mode this file prefers.
		*
		* Every visible string lives here, including the ten tab labels, because the tab
		* rail's label is a function of the active locale; a literal in the component
		* would render in one language and nobody would see it as a defect.
		*
		* @module dsh-meta-market/client/shell/locales
		*/
		/** The namespace this plugin's keys live under. Namespaced so it cannot collide. */
		const LOCALE_NS = "meta-market";
		/** The English dictionary. */
		const en = {
			row: "Meta-market",
			title: "Meta-market — meta plugins aligned to intent",
			subtitle: "Installed on this system or downloadable, per window. Every count carries its denominator and its census time; an unmeasurable count reads NOT MEASURED, never 0.",
			"tab.meta-plugins": "Meta-Plugins",
			"tab.meta-tools": "Meta-tools",
			"tab.meta-skills": "Meta-skills",
			"tab.meta-memory": "Meta-memory",
			"tab.meta-intent": "Meta-intent",
			"tab.advanced": "Advanced",
			"tab.meta-agents": "meta-Agents",
			"tab.meta-loops": "meta-Loops",
			"tab.meta-cordis": "meta-cordis",
			"tab.meta-community": "meta-community",
			primaryRail: "Meta-market windows",
			advancedRail: "Advanced windows",
			refresh: "Refresh",
			loading: "Reading the section…",
			notMeasured: "NOT MEASURED",
			census: "Census",
			censusAt: "read at",
			generatedAt: "payload generated",
			falsifiers: "Falsifiers",
			noFalsifiers: "This window declares no falsifier. A check with nothing that could fail it is a caption rather than a check, so its absence is reported here rather than rendered as a clean row.",
			"fail.unreachable": "The section route could not be reached.",
			"fail.unmounted": "The meta-market route prefix is not mounted on this host.",
			"fail.rejected": "The section route refused this window.",
			"fail.malformed": "The section route answered, and the answer was not an envelope.",
			retry: "Retry"
		};
		//#endregion
		//#region src/client/types.ts
		/** A typed failure from this plugin's section route. */
		var SectionError = class extends Error {
			/**
			* Fields are declared and assigned LONGHAND rather than as constructor
			* parameter properties, because a parameter property is TypeScript syntax that
			* `node --experimental-strip-types` REFUSES (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`,
			* measured): strip-only mode erases annotations, and a shorthand that both
			* declares and assigns is not an annotation. Every lane harness in this program
			* runs under strip-types, so the shorthand would make this file unloadable to
			* the very instruments that verify it.
			*/
			failure;
			status;
			constructor(failure, message, status = null) {
				super(message);
				this.name = "SectionError";
				this.failure = failure;
				this.status = status;
			}
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
		//#region src/client/api.ts
		/**
		* The Client half's transport.
		*
		* ONE route: `GET /meta-market/api/gui/section?window=<id>`. The prefix is NOT
		* re-declared here — it is read from the frozen `src/shared/protocol.ts`, so the
		* browser and the host cannot disagree about where the route lives. (A second
		* literal for the prefix is two encodings of one fact, and this program has paid
		* for that class already: a route table that advertised a doubled path segment.)
		*
		* THREE DISTINCT NON-ANSWERS, which is the whole reason this file types failures
		* instead of returning `null`:
		*
		*  - the fetch THREW → `unreachable` (no server, DNS, offline),
		*  - HTTP 404 → `unmounted` (the plugin's prefix is not registered on this host —
		*    the same confusion `D-0071` records between an absent route and a 404),
		*  - HTTP 400 → `rejected`, and the body NAMES THE KNOWN IDS, which is surfaced
		*    rather than summarised (the contract requires 400 with the id list instead
		*    of a silent empty payload),
		*  - a 2xx body that does not carry the envelope's required keys → `malformed`.
		*
		* A 404 is NOT `unavailable`: `unavailable` is a FIELD of a real envelope
		* (`payload.unavailable`), meaning the surface answered and the underlying
		* measurement could not be taken. The two are reported separately because they
		* mean opposite things about the system's health.
		*
		* @module dsh-meta-market/client/api
		*/
		/** Placeholder origin for the non-DOM case (specs, SSR): URL resolution needs a base. */
		const PLACEHOLDER_ORIGIN = "http://dsh.invalid/";
		/**
		* Resolve one route against the page base, without a query and without a hash.
		*
		* Resolving against `location.href` keeps the plugin working behind a
		* reverse-proxy prefix; dropping the query is also what strips a launch token.
		*
		* @param path - the slash-less route path, e.g. `meta-market/api/gui/section`.
		* @returns the absolute URL to fetch.
		*/
		function routeUrl(path) {
			const base = typeof location === "undefined" ? PLACEHOLDER_ORIGIN : location.href;
			const url = new URL(path, base);
			url.search = "";
			url.hash = "";
			return url.toString();
		}
		/**
		* The one section URL, built so the query survives resolution.
		*
		* `routeUrl` deliberately CLEARS the query (it is what strips a launch token), so
		* the `window` parameter is set on the resolved URL afterwards rather than being
		* written into the path and silently dropped.
		*
		* @param window - the window id to ask for.
		* @returns the absolute URL to fetch.
		*/
		function sectionUrl(window) {
			const url = new URL(routeUrl(`${ROUTE_PREFIX}/gui/section`));
			url.searchParams.set("window", window);
			return url.toString();
		}
		/** The envelope keys this client REQUIRES before it will render a payload. */
		const REQUIRED_KEYS = [
			"window",
			"generatedAt",
			"census",
			"items",
			"unavailable",
			"controls",
			"falsifiers"
		];
		/**
		* Check that a parsed body really is an envelope.
		*
		* The check is on the KEYS, and `unavailable` must be PRESENT even when its value
		* is `null` — an absent key means the route did not answer the absence question,
		* which is a different statement from "the route answered, nothing was absent".
		* Reading the two the same way is how `|| 0` turns "not measured" into a measured
		* zero.
		*
		* @param raw - the parsed body, of unknown provenance.
		* @param window - the window that was asked for, named in the failure message.
		* @returns the body, narrowed to the envelope shape.
		* @throws SectionError `malformed` when a required key is missing.
		*/
		function assertEnvelope(raw, window) {
			if (raw === null || typeof raw !== "object") throw new SectionError("malformed", `the ${window} section payload was not an object`);
			const record = raw;
			const missing = REQUIRED_KEYS.filter((key) => !(key in record));
			if (missing.length > 0) throw new SectionError("malformed", `the ${window} section payload is missing ${missing.join(", ")} — absent is not zero, so nothing is rendered as one`);
			if (!Array.isArray(record["items"])) throw new SectionError("malformed", `the ${window} section payload's items is not an array`);
			const id = record["window"]?.id;
			if (id !== window) throw new SectionError("malformed", `asked for ${JSON.stringify(window)} and the payload answered for ${JSON.stringify(id)} — a cross-wired payload is refused rather than rendered`);
			return raw;
		}
		/**
		* Read one window's payload envelope.
		*
		* @param window - one of the ten window ids from CONTRACT.
		* @param signal - an abort signal, so a tab switch cannot be answered by the previous tab's request.
		* @returns the parsed envelope.
		* @throws SectionError with one of the four typed failures.
		*/
		async function loadSection(window, signal) {
			let response;
			try {
				response = await fetch(sectionUrl(window), {
					cache: "no-store",
					headers: { accept: "application/json" },
					...signal === void 0 ? {} : { signal }
				});
			} catch (error) {
				throw new SectionError("unreachable", error instanceof Error && error.name === "AbortError" ? "the section request was superseded by a newer one" : error instanceof Error ? error.message : String(error));
			}
			if (response.status === 404) throw new SectionError("unmounted", "the meta-market route prefix is not mounted on this host", 404);
			if (!response.ok) {
				const detail = await response.text().catch(() => "");
				throw new SectionError("rejected", `HTTP ${response.status}${detail === "" ? "" : `: ${detail.slice(0, 400)}`}`, response.status);
			}
			let parsed;
			try {
				parsed = await response.json();
			} catch (error) {
				throw new SectionError("malformed", error instanceof Error ? error.message : String(error), response.status);
			}
			return assertEnvelope(parsed, window);
		}
		//#endregion
		//#region src/client/shell/TabRail.tsx
		/**
		* One tab button.
		*
		* `aria-selected` and the `mm-tab-active` class are both set from ONE `active`
		* value, so what a screen reader announces and what a stylesheet paints cannot
		* disagree.
		*
		* @param props - the tab's identity, its label and its selected state.
		* @returns the button element.
		*/
		function TabButton(props) {
			const className = props.active ? "mm-tab mm-tab-active" : "mm-tab";
			if (props.attribute === "data-mm-tab") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "tab",
				"data-mm-tab": props.id,
				className,
				"aria-selected": props.active,
				onClick: () => props.onSelect(props.id),
				children: props.label
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "tab",
				"data-mm-subtab": props.id,
				className,
				"aria-selected": props.active,
				onClick: () => props.onSelect(props.id),
				children: props.label
			});
		}
		/**
		* `#dsh-meta-market-tabs`, the primary rail.
		* @param props - the six ids, the active one, and the selection callback.
		* @returns the rail element.
		*/
		function PrimaryTabRail(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				id: "dsh-meta-market-tabs",
				className: "mm-tabs mm-tabs-primary",
				role: "tablist",
				"aria-label": props.ariaLabel,
				children: props.tabs.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabButton, {
					id,
					label: props.label(id),
					active: id === props.active,
					attribute: "data-mm-tab",
					onSelect: props.onSelect
				}, id))
			});
		}
		/**
		* `#dsh-meta-market-advanced-tabs`, the sub-rail under `advanced`.
		* @param props - the four ids, the active one, and the selection callback.
		* @returns the sub-rail element.
		*/
		function AdvancedTabRail(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				id: "dsh-meta-market-advanced-tabs",
				className: "mm-tabs mm-tabs-advanced",
				role: "tablist",
				"aria-label": props.ariaLabel,
				children: props.tabs.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabButton, {
					id,
					label: props.label(id),
					active: id === props.active,
					attribute: "data-mm-subtab",
					onSelect: props.onSelect
				}, id))
			});
		}
		/**
		* Is this value a converted React node rather than a bare string or number?
		*
		* `toElement` is typed `unknown`; a string child is legitimate React output (a
		* view may render text), so it is NOT counted as a defect — only `null`,
		* `undefined` and a non-elements array are.
		*
		* @param value - the converted node.
		* @returns true when the value is something React would render.
		*/
		function renderable(value) {
			if (value === null || value === void 0) return false;
			if (typeof value === "string" || typeof value === "number") return true;
			if (Array.isArray(value)) return value.some(renderable);
			return typeof value === "object";
		}
		/**
		* Walk a React node and count the rows it carries.
		*
		* The walk follows `props.children` because react elements keep their children in
		* props rather than in a child array of their own. It is deliberately a small
		* structural walk and not a DOM query: it has to work before anything is mounted,
		* including in a node-side harness with no document.
		*
		* @param node - the converted React node.
		* @returns how many `data-mm-item` nodes it contains, and whether it has a tree.
		*/
		function auditRows(node) {
			let rows = 0;
			const walk = (value) => {
				if (value === null || value === void 0) return;
				if (Array.isArray(value)) {
					for (const child of value) walk(child);
					return;
				}
				if (typeof value !== "object") return;
				const props = value.props;
				if (props === null || props === void 0) return;
				if ("data-mm-item" in props) rows += 1;
				walk(props["children"]);
			};
			walk(node);
			return {
				rows,
				hasTree: renderable(node)
			};
		}
		/**
		* Read a census number WITHOUT coercing it.
		*
		* `null`, `undefined`, `NaN` and a non-number all return `null` — NOT MEASURED.
		* A `0` returns `0`, because a measured zero is a value and the two are different
		* statements. This is the one place the shell is allowed to look at a count.
		*
		* @param value - the value as it arrived over the wire.
		* @returns the number, or `null` when it was not measured.
		*/
		function measuredCount(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : null;
		}
		//#endregion
		//#region src/client/shell/CensusStrip.tsx
		/**
		* Render one count honestly.
		*
		* @param value - the raw value from the payload.
		* @param t - the translator, for the NOT MEASURED label.
		* @returns the count as a string, never coercing an absence to a zero.
		*/
		function countText(value, t) {
			const measured = measuredCount(value);
			return measured === null ? t("notMeasured") : String(measured);
		}
		/**
		* The census strip.
		* @param props - the census, the payload time, the availability field and the translator.
		* @returns the strip element.
		*/
		function CensusStrip(props) {
			const { census, t } = props;
			const unavailable = props.unavailable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mm-census",
				"data-mm-census": "strip",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "mm-census-count",
						"data-mm-census-count": "items",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: countText(census.numerator, t) }),
							" / ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: countText(census.denominator, t) })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "mm-census-population",
						"data-mm-census-population": "text",
						children: census.population
					}),
					typeof census.at === "string" && census.at !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "mm-muted",
						children: [
							t("censusAt"),
							" ",
							census.at
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "mm-warn",
						children: t("notMeasured")
					}),
					typeof props.generatedAt === "string" && props.generatedAt !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "mm-muted",
						children: [
							t("generatedAt"),
							" ",
							props.generatedAt
						]
					}) : null,
					unavailable === null || unavailable === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "mm-chip mm-chip-idle",
						"data-mm-unavailable": "chip",
						title: `${unavailable.reason} (measured ${unavailable.measuredAt})`,
						children: t("notMeasured")
					})
				]
			});
		}
		//#endregion
		//#region src/client/shell/FalsifierDrawer.tsx
		/**
		* The falsifier drawer.
		* @param props - the window's falsifiers and the translator.
		* @returns the drawer element.
		*/
		function FalsifierDrawer(props) {
			const count = props.falsifiers.length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "mm-falsifiers",
				"data-mm-falsifiers": count,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
					props.t("falsifiers"),
					" (",
					count,
					")"
				] }), count === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mm-warnp",
					"data-mm-falsifiers-empty": "true",
					children: props.t("noFalsifiers")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "mm-falsifier-list",
					children: props.falsifiers.map((falsifier) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: "mm-falsifier",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mm-falsifier-claim",
							children: falsifier.claim
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mm-falsifier-how",
							children: falsifier.how
						})]
					}, falsifier.claim))
				})]
			});
		}
		//#endregion
		//#region src/client/windows/types.ts
		/** The six primary tabs, in the order CONTRACT.md gives. */
		const PRIMARY_WINDOW_IDS = [
			"meta-plugins",
			"meta-tools",
			"meta-skills",
			"meta-memory",
			"meta-intent",
			"advanced"
		];
		/** The four sub-windows of `advanced`, in the order CONTRACT.md gives. */
		const ADVANCED_WINDOW_IDS = [
			"meta-agents",
			"meta-loops",
			"meta-cordis",
			"meta-community"
		];
		/** All ten, primary first then advanced. */
		const WINDOW_IDS = [...PRIMARY_WINDOW_IDS, ...ADVANCED_WINDOW_IDS];
		//#endregion
		//#region src/client/windows/parts.ts
		/** The two literal tokens this file reserves, so "absent" is never spelled as a value. */
		const NOT_MEASURED = "NOT MEASURED";
		const NOT_RECORDED = "not recorded";
		/** Build an element. `null`/`false`/`undefined` children are skipped rather than rendered. */
		function el(tag, attrs, ...children) {
			return elOn(tag, attrs, [], ...children);
		}
		/**
		* Build an element with event bindings.
		*
		* Events travel beside the attributes, never inside them: `domFactory` subscribes with
		* `addEventListener` and `reactFactory` passes the handler as React's `onClick`, so one launcher
		* definition works in both hosts. An element with no handler has no `events` key at all, which keeps
		* a rendered row free of functions and therefore serialisable — the property the verifier relies on.
		*/
		function elOn(tag, attrs, events, ...children) {
			const out = [];
			for (const child of children) {
				if (child === null || child === void 0 || child === false) continue;
				if (typeof child === "string") out.push({
					kind: "text",
					text: child
				});
				else if (typeof child === "number") out.push({
					kind: "text",
					text: String(child)
				});
				else out.push(child);
			}
			const node = {
				kind: "element",
				tag,
				attrs: attrs ?? {},
				children: out
			};
			if (events.length > 0) node.events = events;
			return node;
		}
		/** A count as text: a non-finite number is an absent reading, not a number. */
		function num(value) {
			return Number.isFinite(value) ? String(value) : NOT_MEASURED;
		}
		/** A required string, but defended: an empty or missing field says so instead of rendering blank. */
		function textOr(value, fallback) {
			return typeof value === "string" && value.length > 0 ? value : fallback;
		}
		/** Whether a time is a real time. An unparseable stamp is an absent freshness reading. */
		function parseableTime(value) {
			if (typeof value !== "string" || value.length === 0) return false;
			return Number.isFinite(Date.parse(value));
		}
		/** A time, or an explicit statement that the stamp is unusable. */
		function timeText(value) {
			return parseableTime(value) ? String(value) : `${NOT_MEASURED} (unparseable time: ${JSON.stringify(value ?? null)})`;
		}
		/** `exists` / `plan` / `future`, never flattened. */
		function kindBadge(kind) {
			return el("span", {
				class: `mm-kind mm-kind-${kind}`,
				"data-mm-kind": kind,
				title: "The three kinds are never flattened: exists = measured on this system, plan = this program will build it, future = a tagged goal."
			}, kind);
		}
		/**
		* A tri-state measurement cell.
		*
		* `null` is NOT a falsy boolean here: it renders NOT MEASURED with a title that says why, because
		* the difference between "probed and absent" and "never probed" is the whole point of the field.
		*/
		function flagCell(value, what) {
			if (value === null) return el("span", {
				class: "mm-flag mm-flag-absent",
				title: `${what} is null in the payload. The contract defines null as NOT MEASURED — an absent reading, not a false one, and not a zero.`
			}, NOT_MEASURED);
			return value ? el("span", {
				class: "mm-flag mm-flag-yes",
				title: `${what} was measured true.`
			}, "true") : el("span", {
				class: "mm-flag mm-flag-no",
				title: `${what} was measured false.`
			}, "false");
		}
		/** A score, or an explicit statement that the score is not a number. */
		function scoreText$1(score) {
			return Number.isFinite(score) ? score.toFixed(3) : "score NOT MEASURED";
		}
		/** Where a row came from, so a reader can re-derive it. */
		function sourceText(source) {
			if (source === null || source === void 0) return "source NOT RECORDED";
			const parts = [source.where];
			if (source.route !== void 0) parts.push(`route ${source.route}`);
			if (source.row !== void 0) parts.push(`catalog row ${String(source.row)}`);
			return parts.join(", ");
		}
		function headerBlock(env) {
			return el("header", {
				class: "mm-header",
				"data-mm-component": "header"
			}, el("h3", { class: "mm-title" }, textOr(env.window?.label, NOT_MEASURED), " ", kindBadge(textOr(env.window?.kind, NOT_MEASURED))), el("p", { class: "mm-description" }, textOr(env.window?.description, "description NOT STATED")), el("p", { class: "mm-generated" }, `generated at ${timeText(env.generatedAt)}`));
		}
		/** The census, as numerator of denominator plus the population it counts and the time it was taken. */
		function censusBlock(env) {
			const c = env.census;
			return el("p", {
				class: "mm-census",
				"data-mm-component": "census"
			}, el("strong", { class: "mm-census-count" }, `${num(c.numerator)} of ${num(c.denominator)}`), el("span", { class: "mm-census-population" }, ` — ${textOr(c.population, "population NOT STATED")}`), el("span", { class: "mm-census-at" }, ` · census at ${timeText(c.at)}`));
		}
		/**
		* Self-checks between the envelope's own numbers. Each returns a sentence a reader can act on.
		*
		* These exist because the failure this window is most likely to be shown is a payload whose parts
		* disagree — a numerator that does not match its rows, a denominator of 0, a stamp that will not
		* parse — and in every one of those cases the honest render is a visible warning beside the number,
		* not a clean number.
		*/
		function censusWarnings(env) {
			const out = [];
			const c = env.census;
			const itemCount = Array.isArray(env.items) ? env.items.length : -1;
			if (itemCount < 0) out.push("items is not an array in this payload — the row population cannot be counted, so NOT MEASURED");
			else if (c.numerator !== itemCount) out.push(`census.numerator is ${num(c.numerator)} but the payload carries ${itemCount} items — the stated numerator and the rendered rows disagree, so one of them is wrong`);
			if (!Number.isFinite(c.numerator) || !Number.isFinite(c.denominator)) out.push("the census carries a non-finite count — NOT MEASURED");
			if (Number.isFinite(c.numerator) && Number.isFinite(c.denominator) && c.denominator < c.numerator) out.push(`census.denominator ${num(c.denominator)} is smaller than numerator ${num(c.numerator)} — a numerator larger than its population cannot be right`);
			if (c.denominator === 0) out.push("census.denominator is 0 — a 0 on both sides of a comparison is INSTRUMENT FAILURE, not a pass; treat this window as UNMEASURED rather than empty");
			if (!parseableTime(c.at)) out.push("census.at is not a parseable time — freshness NOT MEASURED");
			if (!parseableTime(env.generatedAt)) out.push("generatedAt is not a parseable time — freshness NOT MEASURED");
			return out;
		}
		function warningBlock(warnings, heading) {
			return el("div", {
				class: "mm-warnings",
				"data-mm-component": "warnings",
				role: "status"
			}, el("p", { class: "mm-warnings-heading" }, heading), el("ul", { class: "mm-warnings-list" }, ...warnings.map((w) => el("li", null, w))));
		}
		/**
		* A failed reading, rendered where the rows would be.
		*
		* The sentence about "not a zero" is not decoration. An empty table and a failed read look the same
		* to a reader scrolling a panel, and the whole reason `unavailable` carries a `reason` is to keep
		* them apart.
		*/
		function unavailableBlock(reason, measuredAt, windowLabel) {
			return el("div", {
				class: "mm-unavailable",
				"data-mm-component": "unavailable",
				role: "status"
			}, el("p", { class: "mm-unavailable-heading" }, `READING UNAVAILABLE — NOT A ZERO`), el("p", { class: "mm-unavailable-reason" }, el("strong", null, "reason: "), textOr(reason, "reason NOT STATED")), el("p", { class: "mm-unavailable-at" }, `measured at ${timeText(measuredAt)}`), el("p", { class: "mm-unavailable-note" }, `No rows are rendered for ${windowLabel}. An empty table would read as "zero plugins"; this is an absent reading with a stated reason, which is a different thing.`));
		}
		const COLUMNS = [
			"name",
			"npm",
			"owner",
			"kind",
			"installed",
			"downloadable",
			"aligned zones (score, method)",
			"collides with",
			"alignment",
			"patch"
		];
		/** A catalog-shaped string field: the payload gives `null` for "no value recorded", and the window
		* must not upgrade that into "none exists", because it cannot tell the two apart. */
		function optionalString(value, column) {
			if (value === null) return el("span", {
				class: "mm-absent",
				title: `${column} is null in the payload. This window cannot tell "no ${column} is recorded" from "not measured", so it claims neither.`
			}, NOT_RECORDED);
			return el("span", { class: "mm-value" }, value);
		}
		/** Zones with their scores AND the method that produced each score: an embedding cosine and a token
		* match are not the same measurement and are not presented as if they were. */
		function zonesCell(intent) {
			const zones = intent.zones ?? [];
			const original = intent.originalIntent;
			const originalNode = original === "not-measured" ? el("span", { class: "mm-absent" }, `original intent: ${NOT_MEASURED}`) : el("span", { class: `mm-original mm-original-${original}` }, `original intent: ${original}`);
			if (zones.length === 0) return el("div", { class: "mm-zones mm-zones-empty" }, el("span", {
				class: "mm-absent",
				title: "No zone scored this item. That is an absent match, not a score of 0."
			}, "no zones measured"), el("br", null), originalNode);
			const lines = [];
			for (const zone of zones) lines.push(el("span", {
				class: "mm-zone",
				"data-mm-zone": zone.zone,
				title: `method: ${zone.method}`
			}, `${zone.zone} ${scoreText$1(zone.score)} (${zone.method})`), " ");
			return el("div", { class: "mm-zones" }, ...lines, el("br", null), originalNode);
		}
		/**
		* The collision cell.
		*
		* A visible badge, and the plugin it collides with named. When the payload says `collide` but names
		* no counterpart, that is stated rather than softened: an unnamed collision cannot be checked.
		*/
		function collidesCell(intent) {
			const collisions = intent.collidesWith ?? [];
			const original = intent.originalIntent;
			if (collisions.length === 0) {
				if (original === "collide") return el("span", { class: "mm-collide mm-collide-unproven" }, el("span", { class: "mm-badge mm-badge-collides" }, "COLLIDES"), " ", el("span", { class: "mm-warn" }, `counterpart ${NOT_MEASURED} (collidesWith is empty)`));
				if (original === "not-measured") return el("span", {
					class: "mm-absent",
					title: "The intent check did not run for this row, so there is nothing to call a collision and nothing to call a pass."
				}, NOT_MEASURED);
				return el("span", { class: "mm-none" }, "no collision recorded");
			}
			return el("div", { class: "mm-collide" }, el("span", {
				class: "mm-badge mm-badge-collides",
				title: "This row fails the original-intent check: it must not carry another plugin's intent."
			}, "COLLIDES"), el("ul", { class: "mm-collide-list" }, ...collisions.map((c) => el("li", { "data-mm-collides-with": c.id }, el("strong", null, c.id), " — ", textOr(c.why, "why NOT STATED")))));
		}
		function alignmentCell(alignment) {
			if (alignment === null || alignment === void 0) return el("span", { class: "mm-absent" }, NOT_MEASURED);
			const verdict = alignment.verdict;
			return el("div", { class: "mm-alignment" }, el("span", {
				class: `mm-badge mm-badge-${verdict}`,
				"data-mm-verdict": verdict
			}, verdict), " ", el("span", { class: "mm-alignment-why" }, textOr(alignment.why, "why NOT STATED")), el("br", null), el("span", { class: "mm-alignment-evidence" }, `evidence: ${textOr(alignment.evidence, NOT_MEASURED)}`));
		}
		/** Patch availability. `null` is a recorded absence of a patch artifact, and the title says exactly
		* that, because "no patch recorded" is not the same claim as "no patch can exist". */
		function patchCell(patch) {
			if (patch === null || patch === void 0) return el("span", {
				class: "mm-none",
				title: "patch is null in the payload: no patch artifact is recorded for this row. That is not a measurement that no patch could exist."
			}, "none recorded");
			return el("div", { class: "mm-patch" }, el("span", { class: "mm-badge mm-badge-patch" }, "PATCH"), el("br", null), el("code", { class: "mm-patch-artifact" }, textOr(patch.artifact, NOT_MEASURED)), el("br", null), el("span", { class: "mm-patch-applies" }, textOr(patch.applies, "what it changes NOT STATED")));
		}
		/** A row. Every row carries `data-mm-item`, so a verifier can count rows against the census without
		* reading this code. */
		function itemRow(item) {
			return el("tr", {
				class: `mm-row mm-row-${item.kind}`,
				"data-mm-item": item.id,
				"data-mm-kind": item.kind,
				"data-mm-source": item.source?.where ?? "not-recorded"
			}, el("th", {
				class: "mm-cell mm-cell-name",
				scope: "row"
			}, el("span", { class: "mm-item-name" }, textOr(item.name, NOT_MEASURED)), el("br", null), el("span", { class: "mm-item-id" }, item.id), el("br", null), el("span", { class: "mm-item-source" }, sourceText(item.source))), el("td", null, optionalString(item.npm, "npm")), el("td", null, optionalString(item.owner, "owner")), el("td", null, kindBadge(item.kind)), el("td", null, flagCell(item.installed, "installed")), el("td", null, flagCell(item.downloadable, "downloadable")), el("td", { class: "mm-cell-zones" }, zonesCell(item.intent)), el("td", { class: "mm-cell-collides" }, collidesCell(item.intent)), el("td", null, alignmentCell(item.alignment)), el("td", null, patchCell(item.patch)));
		}
		/**
		* The rows table, scrolling inside the panel.
		*
		* The scroll container is `.mm-rows-scroll` (styled in `windows.css`). The header is sticky, so a
		* long table can be read without losing the column names, which is what makes "installed" and
		* "downloadable" distinguishable at row 40.
		*/
		function rowsTable(items) {
			return el("div", {
				class: "mm-rows-scroll",
				"data-mm-component": "rows"
			}, el("table", { class: "mm-rows" }, el("thead", null, el("tr", null, ...COLUMNS.map((name) => el("th", {
				class: "mm-col",
				scope: "col"
			}, name)))), el("tbody", null, ...items.map((item) => itemRow(item)))));
		}
		/**
		* What would disprove this window.
		*
		* An empty list renders a visible finding rather than nothing: a window that states claims it never
		* says how to refute cannot be checked, and silence would read as "nothing to see".
		*/
		function falsifiersBlock(list) {
			const falsifiers = list ?? [];
			if (falsifiers.length === 0) return el("div", {
				class: "mm-falsifiers mm-falsifiers-empty",
				"data-mm-component": "falsifiers"
			}, el("p", { class: "mm-heading" }, "What would disprove this window"), el("p", { class: "mm-warn" }, "no falsifier is registered in this payload — the window states claims here that nothing in it can refute, which is itself a finding."));
			return el("div", {
				class: "mm-falsifiers",
				"data-mm-component": "falsifiers"
			}, el("p", { class: "mm-heading" }, "What would disprove this window"), el("ul", { class: "mm-falsifier-list" }, ...falsifiers.map((f) => el("li", null, el("strong", null, textOr(f.claim, "claim NOT STATED")), el("br", null), el("span", { class: "mm-falsifier-how" }, `would be shown by: ${textOr(f.how, "how NOT STATED")}`)))));
		}
		/**
		* The controls, each marked read or write.
		*
		* A `write` control that has never been driven is flagged UNPROVEN WRITE rather than listed beside
		* the read controls as though it were the same kind of thing. The contract says a write control must
		* have changed an outcome once; the flag says whether this payload claims that happened.
		*/
		function controlsBlock(list) {
			const controls = list ?? [];
			if (controls.length === 0) return el("div", {
				class: "mm-controls mm-controls-empty",
				"data-mm-component": "controls"
			}, el("p", { class: "mm-heading" }, "Controls"), el("p", { class: "mm-absent" }, "no controls are registered in this payload."));
			return el("div", {
				class: "mm-controls",
				"data-mm-component": "controls"
			}, el("p", { class: "mm-heading" }, "Controls"), el("ul", { class: "mm-control-list" }, ...controls.map((c) => controlItem(c))));
		}
		function controlItem(control) {
			const isWrite = control.kind === "write";
			const proven = control.demonstrable === true;
			return el("li", {
				class: "mm-control",
				"data-mm-control": control.id,
				"data-mm-control-kind": control.kind
			}, el("span", { class: `mm-badge mm-control-kind mm-control-${control.kind}` }, isWrite ? "WRITE" : "READ"), " ", el("strong", { class: "mm-control-label" }, textOr(control.label, NOT_MEASURED)), " ", el("code", { class: "mm-control-target" }, textOr(control.target, NOT_MEASURED)), isWrite && !proven ? el("span", { class: "mm-warn mm-control-unproven" }, " — UNPROVEN WRITE: no outcome change is recorded, and a control that only reads a value back is not a control") : null, !isWrite && !proven ? el("span", { class: "mm-control-note" }, " — read-only; nothing is claimed to change") : null, proven && isWrite ? el("span", { class: "mm-control-proven" }, " — outcome change recorded") : null);
		}
		/** The row area: rows when the reading succeeded, the reason when it did not, and an explicit
		* statement when the population itself is empty. Exported so a view with its own middle block (the
		* `advanced` launcher) still renders rows through the same honest path. */
		function bodyBlock(env) {
			if (env.unavailable !== null && env.unavailable !== void 0) return unavailableBlock(env.unavailable.reason, env.unavailable.measuredAt, textOr(env.window?.label, textOr(env.window?.id, "this window")));
			const items = Array.isArray(env.items) ? env.items : [];
			if (items.length === 0) {
				const denominator = env.census?.denominator;
				if (denominator === 0) return warningBlock(["0 of 0 is not evidence of an empty population: a zero on both sides of a comparison is instrument failure, so this window is UNMEASURED."], "No rows, and a denominator of 0 — INSTRUMENT FAILURE");
				return warningBlock([`0 of ${num(denominator ?? NaN)} items matched. With a non-zero denominator this is a measured zero — "nothing in the population matched this window" — and it is NOT evidence that no plugin of this kind exists anywhere.`], "No rows matched");
			}
			return rowsTable(items);
		}
		/**
		* The window frame every view shares: header, census, self-checks, then whatever the view puts in
		* the middle, then the falsifiers and the controls.
		*
		* The order is fixed here rather than in each view so that all ten windows answer "what is this",
		* "how many of how many", "is this payload self-consistent", "what are the rows", "what would
		* disprove it", "what can I do" in the same places on screen.
		*/
		function windowFrame(props, middle) {
			const env = props.envelope;
			const warnings = censusWarnings(env);
			return el("section", {
				class: `mm-window mm-window-${env.window.id}`,
				"data-mm-view": env.window.id,
				"data-mm-kind": env.window.kind
			}, headerBlock(env), censusBlock(env), warnings.length > 0 ? warningBlock(warnings, "This payload disagrees with itself — read these before the numbers above") : null, ...middle, falsifiersBlock(env.falsifiers), controlsBlock(env.controls));
		}
		/**
		* The standard window: the frame, an optional note, an optional view-specific extra block, and the
		* row area.
		*
		* The note is per-window copy that explains how to READ the table rather than what the table
		* currently says, so a note cannot drift into an unmeasured claim about the payload.
		*/
		function standardWindow(props, note, extra) {
			return windowFrame(props, [
				note ?? null,
				extra ?? null,
				bodyBlock(props.envelope)
			]);
		}
		/** A short explanatory paragraph, used for the per-window notes. */
		function note(text) {
			return el("p", {
				class: "mm-note",
				"data-mm-component": "note"
			}, text);
		}
		//#endregion
		//#region src/client/windows/meta-plugins.ts
		function metaPluginsWindow(props) {
			return standardWindow(props, note("Every row is a meta plugin that is either installed on this system or downloadable. \"installed\" and \"downloadable\" are two separate three-state readings, and a cell that says NOT MEASURED is an absent reading — it is not false and not zero, so it must not be read as \"not installed\". The source line under each name says where the row came from: an installed row was read from a live route, a catalog row is list-only evidence that the plugin exists in the market."));
		}
		//#endregion
		//#region src/client/windows/meta-tools.ts
		function metaToolsWindow(props) {
			return standardWindow(props, note("Every row is a meta tool. Read the kind column before the name: exists means measured on this system, plan means this program will build it, and future is a tagged goal — the three are never flattened into \"available\". The zone column gives the intent zones the tool scores against plus the method that produced each score, because a token match and an embedding cosine are different measurements and are not compared here."));
		}
		//#endregion
		//#region src/client/windows/meta-skills.ts
		function metaSkillsWindow(props) {
			return standardWindow(props, note("Every row is a meta skill. A plan row describes a skill this program will build and a future row a tagged goal, so neither is evidence that the skill is installed today; only an exists row with a live source line is. The alignment column carries the verdict and the evidence that produced it, so a reader can check the verdict instead of taking it."));
		}
		//#endregion
		//#region src/client/windows/meta-memory.ts
		function metaMemoryWindow(props) {
			return standardWindow(props, note("Every row is a memory-layer component. The source line under each name is load-bearing here: an installed row was read from a live route on this machine, while a catalog row is list-only evidence that the entry exists in the market and was NOT probed here. Two rows that look alike can therefore be very different strengths of evidence, so read the source before comparing them."));
		}
		//#endregion
		//#region src/client/windows/meta-intent.ts
		function zoneAggregates(items) {
			const byZone = /* @__PURE__ */ new Map();
			for (const item of items) for (const zone of item.intent?.zones ?? []) {
				const entry = byZone.get(zone.zone) ?? {
					items: 0,
					best: null,
					methods: /* @__PURE__ */ new Set()
				};
				entry.items += 1;
				entry.methods.add(zone.method);
				if (Number.isFinite(zone.score)) entry.best = entry.best === null ? zone.score : Math.max(entry.best, zone.score);
				byZone.set(zone.zone, entry);
			}
			return [...byZone.entries()].map(([zone, entry]) => ({
				zone,
				items: entry.items,
				best: entry.best,
				methods: [...entry.methods].sort()
			})).sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.zone.localeCompare(b.zone));
		}
		function scoreText(score) {
			return score === null ? "score NOT MEASURED" : score.toFixed(3);
		}
		function zoneSummary(items) {
			const total = items.length;
			if (total === 0) return el("div", {
				class: "mm-zonesummary mm-zonesummary-empty",
				"data-mm-component": "zone-summary"
			}, el("p", { class: "mm-heading" }, "Intent zones, aggregated"), el("p", { class: "mm-warn" }, "zone scores NOT MEASURED — this payload carries 0 items, so there is no denominator to summarise and a \"0 of 0\" summary would be instrument failure rather than a result."));
			const withZones = items.filter((item) => (item.intent?.zones ?? []).length > 0).length;
			const aggregates = zoneAggregates(items);
			const mixed = aggregates.filter((entry) => entry.methods.length > 1);
			return el("div", {
				class: "mm-zonesummary",
				"data-mm-component": "zone-summary"
			}, el("p", { class: "mm-heading" }, "Intent zones, aggregated over the rows above"), el("p", { class: "mm-zonesummary-count" }, `${num(withZones)} of ${num(total)} items carry at least one zone score — a count of ROWS, not of zones.`), aggregates.length === 0 ? el("p", { class: "mm-absent" }, "no zone scored any row: that is an absent match, not a score of zero, and it is not evidence that the rows have no intent.") : el("table", { class: "mm-zonetable" }, el("thead", null, el("tr", null, ...[
				"zone",
				"rows in this zone",
				"best score",
				"method(s)"
			].map((label) => el("th", { scope: "col" }, label)))), el("tbody", null, ...aggregates.map((entry) => el("tr", { "data-mm-zone-summary": entry.zone }, el("td", null, entry.zone), el("td", null, num(entry.items)), el("td", null, scoreText(entry.best)), el("td", null, entry.methods.length === 0 ? "NOT MEASURED" : entry.methods.join(", ")))))), mixed.length === 0 ? null : el("p", { class: "mm-warn" }, `${mixed.length} zone(s) scored by more than one method (${mixed.map((entry) => entry.zone).join(", ")}). Their "best score" mixes an embedding cosine with a token overlap, so those two numbers are not comparable and the max is a convenience, not a ranking.`));
		}
		function metaIntentWindow(props) {
			const items = Array.isArray(props.envelope.items) ? props.envelope.items : [];
			return standardWindow(props, note("Every row is a thing whose intent was matched against the 24-zone map. The collides-with column is the original-intent check: a row is admitted only if its intent does not collide with a stable, official or already-installed meta plugin, and when it does collide the counterpart is named so the claim can be checked. A row whose original intent is NOT MEASURED was not checked at all, which is different from passing."), zoneSummary(items));
		}
		//#endregion
		//#region src/client/windows/advanced.ts
		/**
		* What each advanced window is ABOUT.
		*
		* These sentences name the subject and nothing else. They are not measurements and the window does
		* not present them as ones: what each sub-window actually contains is carried by that sub-window's own
		* payload, and this launcher never speaks for it.
		*/
		const SUBJECTS = {
			"meta-agents": "The agent-team window: the members of this meta layer and what each one operates.",
			"meta-loops": "The meta-loops window: the repeating improvement loops and the state each one is in.",
			"meta-cordis": "The meta-cordis window: the Cordis-side components this layer depends on and how they are mounted.",
			"meta-community": "The meta-community window: the sibling meta layer this program reads but must not write to."
		};
		function launcherList(props) {
			const open = props.onOpenWindow;
			const wired = typeof open === "function";
			return el("div", {
				class: "mm-launchers",
				"data-mm-component": "launchers"
			}, el("p", { class: "mm-heading" }, "The four advanced windows"), el("ul", { class: "mm-launcher-list" }, ...ADVANCED_WINDOW_IDS.map((id) => el("li", {
				class: "mm-launcher",
				"data-mm-launcher": id
			}, elOn("button", {
				type: "button",
				class: "mm-launcher-button",
				"data-mm-open": id,
				"aria-disabled": wired ? null : "true",
				disabled: wired ? null : "disabled",
				title: wired ? `Open the ${id} window` : "This launcher is not connected to the window switcher, so it cannot change the window. The shell's own sub-rail still opens it."
			}, wired ? [{
				type: "click",
				handler: () => {
					open?.(id);
				}
			}] : [], id), el("p", { class: "mm-launcher-subject" }, SUBJECTS[id] ?? "subject NOT STATED")))), wired ? null : el("p", { class: "mm-warn" }, "These launchers are shown disabled because the shell did not connect them: the window switcher was not supplied, so a press here could not change the window. They are rendered with the reason rather than as buttons that silently do nothing, and the shell's own sub-rail still opens all four."), el("p", { class: "mm-note" }, "The advanced sub-rail belongs to the shell. These buttons are a second, in-content way to reach the same four windows; they are a shortcut to the rail, not a second copy of it, so the two cannot disagree about which window is open."));
		}
		function advancedWindow(props) {
			return windowFrame(props, [launcherList(props), bodyBlock(props.envelope)]);
		}
		//#endregion
		//#region src/client/windows/meta-agents.ts
		function metaAgentsWindow(props) {
			return standardWindow(props, note("Every row is a member of the meta agent team. Read the source line under each name before treating two rows as alike: a row read from a live route describes this machine, while a catalog or community row is evidence that the entry exists and not that it is running here. The controls section below is where a member can be acted on — a read control changes nothing, and it says so."));
		}
		//#endregion
		//#region src/client/windows/meta-loops.ts
		function metaLoopsWindow(props) {
			return standardWindow(props, note("Every row is a repeating improvement loop. The falsifier list at the bottom of this window matters more here than anywhere else on the surface: a loop reported as passing is a report that nothing that ran disagreed with its expectation, which is not the same claim as \"the loop works\". Read what would disprove each loop before reading its state."));
		}
		//#endregion
		//#region src/client/windows/meta-cordis.ts
		function metaCordisWindow(props) {
			return standardWindow(props, note("Every row is a Cordis-side component: a plugin, a bundle row, or a context service this layer depends on. One reading needs care here — per the workspace rules a dsh.profile.bundles change hot-reloads while everything else needs a restart, so an \"installed\" cell can describe a newer state than the process that served this page is running. Where that distinction matters, the row source and the census time are the two fields to compare."));
		}
		//#endregion
		//#region src/client/windows/meta-community.ts
		const READ_ONLY_NOTICE = el("p", {
			class: "mm-readonly",
			"data-mm-component": "readonly",
			role: "note"
		}, "READ-ONLY: the community meta layer is authorized read-only to this program (D-0080). This window reads it; nothing on this surface writes to it, and a row describing a change is describing a patch, not an applied write.");
		function metaCommunityWindow(props) {
			return standardWindow(props, note("Every row is an entry in the community meta layer, read from it and never written back. The source line distinguishes a row that was read from the live community surface from one that came from a catalog listing, and the two carry different weight: the first is a reading of that layer today, the second is evidence that the entry is listed somewhere."), READ_ONLY_NOTICE);
		}
		//#endregion
		//#region src/client/windows/dom.ts
		/**
		* Convert a render tree.
		*
		* The return value is whatever the factory returns: a DOM node for `domFactory`, a React element
		* for `reactFactory`. `text` is optional on the factory so a host that renders bare strings as
		* children (React) does not need a text-node constructor.
		*/
		function toElement(node, create) {
			if (node.kind === "text") return create.text !== void 0 ? create.text(node.text) : node.text;
			const children = [];
			for (const child of node.children) children.push(toElement(child, create));
			return create(node.tag, node.attrs, children, node.events);
		}
		/** Attribute names React spells differently. Everything else, including every `data-*` name, is
		* passed through unchanged. */
		const REACT_ATTR_RENAMES = {
			class: "className",
			for: "htmlFor"
		};
		/** DOM event name to React prop name: `click` becomes `onClick`. */
		function reactEventProp(type) {
			return `on${type.charAt(0).toUpperCase()}${type.slice(1)}`;
		}
		/**
		* Wrap a `createElement`-shaped function (react's, or a compatible one) into a `CreateElement`.
		*
		* The parameter is typed `unknown` ON PURPOSE. React's `createElement` is overloaded and its
		* generic prop parameter does not unify with a concrete factory alias under `strictFunctionTypes`,
		* so a nominal parameter would force every host to write a cast at the call site. Taking `unknown`
		* and validating the shape at the first call keeps the host's call site honest and cast-free.
		*
		* `class` is renamed to `className`; `null`/`undefined` attributes are dropped; events become the
		* camelCase handler props React expects; children are spread, because a `CreateElement` receives
		* them as one array and React wants a rest list; and `text` returns the bare string, which React
		* renders as a text child.
		*/
		function reactFactory(create) {
			const build = create;
			if (typeof build !== "function") throw new TypeError("reactFactory expected a createElement-shaped function");
			const factory = ((tag, attrs, children, events) => {
				const props = {};
				for (const [name, value] of Object.entries(attrs ?? {})) {
					if (value === null || value === void 0) continue;
					props[REACT_ATTR_RENAMES[name] ?? name] = value;
				}
				for (const event of events ?? []) props[reactEventProp(event.type)] = event.handler;
				return build(tag, props, ...children);
			});
			factory.text = (text) => text;
			return factory;
		}
		//#endregion
		//#region src/client/windows/index.ts
		/** One view per window id. The type is total, so an id cannot be added to the contract and forgotten here. */
		const VIEWS = {
			"meta-plugins": metaPluginsWindow,
			"meta-tools": metaToolsWindow,
			"meta-skills": metaSkillsWindow,
			"meta-memory": metaMemoryWindow,
			"meta-intent": metaIntentWindow,
			advanced: advancedWindow,
			"meta-agents": metaAgentsWindow,
			"meta-loops": metaLoopsWindow,
			"meta-cordis": metaCordisWindow,
			"meta-community": metaCommunityWindow
		};
		/**
		* An unknown id renders a VISIBLE message naming itself and the ten known ids.
		*
		* A blank panel is the one failure mode this surface cannot afford: it is indistinguishable from a
		* window whose population is empty, which is exactly the confusion the whole `unavailable` contract
		* exists to prevent.
		*/
		function unknownWindowView(id) {
			return el("section", {
				class: "mm-window mm-window-unknown",
				"data-mm-view": "unknown",
				"data-mm-unknown-window": id
			}, el("header", { class: "mm-header" }, el("h3", { class: "mm-title" }, `Unknown window id: ${id}`)), el("p", { class: "mm-warn" }, `No view is registered for "${id}". The ten known ids are: ${WINDOW_IDS.join(", ")}. This is a visible refusal, not an empty window — an empty window would read as "no plugins".`));
		}
		/** Render one window. The root is always an element; an unknown id is a rendered message, never null. */
		function renderView(id, props) {
			const view = VIEWS[id];
			if (view === void 0) return unknownWindowView(typeof id === "string" ? id : String(id));
			return view(props);
		}
		//#endregion
		//#region src/client/shell/views.ts
		/**
		* The one place the shell touches the view layer.
		*
		* `windows-client` owns `src/client/windows/**`; this file is the shell's single
		* import site for it, so the seam is one module wide. That matters twice: the ten
		* window ids come FROM the view layer (one encoding of the list, not two that can
		* disagree), and the render call is the one function the two lanes negotiated.
		*
		* THE NEGOTIATED SHAPE, as `windows-client` published it: the views return a
		* plain serializable `VElement` rather than a React component, so the same view
		* code serves a DOM host and this React shell. `toElement(view, reactFactory(h))`
		* walks that tree into React elements; `h` is react's own `createElement`, passed
		* through unchanged because `reactFactory` takes `unknown` on purpose — react's
		* `createElement` overloads do not unify with a nominal factory alias under
		* `strictFunctionTypes`, and a nominal parameter would only force a cast here.
		*
		* The cast on the return value is `as ReactNode` because `toElement` is declared
		* `unknown`: it is a DOM-or-React seam and its output type depends on which
		* factory was handed to it. `renderView` guarantees an ELEMENT root (never a
		* string, array or fragment), so this is a narrowing of a value the view layer
		* has already constrained.
		*
		* @module dsh-meta-market/client/shell/views
		*/
		/**
		* The primary rail's ids, in CONTRACT order.
		*
		* Re-exported from the view layer rather than re-declared: two literals for one
		* ordering is exactly the class of defect this program has paid for (a `54` that
		* no instrument could reproduce), and a rail that disagrees with the view map
		* would render a button whose panel does not exist.
		*/
		const PRIMARY_TABS = PRIMARY_WINDOW_IDS;
		/** The advanced rail's ids, in CONTRACT order. */
		const ADVANCED_TABS = ADVANCED_WINDOW_IDS;
		/** The primary tab that opens the sub-rail. A named constant, not a scattered literal. */
		const ADVANCED_TAB = "advanced";
		/**
		* Is this a primary id or an advanced one?
		* @param id - any window id.
		* @returns true when the id belongs to the advanced rail.
		*/
		function isAdvancedWindow(id) {
			return ADVANCED_WINDOW_IDS.includes(id);
		}
		/**
		* Render one window's view into a React node.
		*
		* @param id - the window to render.
		* @param envelope - the parsed payload. Required: the shell renders its own
		*   loading/error states and calls this only with a real envelope.
		* @param onOpenWindow - lets a view ask the shell to switch windows (the
		*   `advanced` view's four launcher buttons).
		* @returns a React node, ready to be placed in the panel.
		*/
		function renderWindow(id, envelope, onOpenWindow) {
			return toElement(renderView(id, onOpenWindow === void 0 ? { envelope } : {
				envelope,
				onOpenWindow
			}), reactFactory(react.createElement));
		}
		//#endregion
		//#region src/client/shell/PanelFrame.tsx
		/**
		* The loading branch.
		* @returns the element.
		*/
		function LoadingView() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mm-state mm-state-loading",
				"data-mm-state": "loading",
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "mm-spinner",
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "…" })]
			});
		}
		/**
		* The error branch, one sentence per failure.
		* @param props - the failure, its message and the status when there was one.
		* @returns the element.
		*/
		function ErrorView(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mm-state mm-state-error",
				"data-mm-state": "error",
				"data-mm-failure": props.failure,
				role: "alert",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mm-err",
						children: props.t(`fail.${props.failure}`)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "mm-muted",
						children: [props.status === null ? "no HTTP status — the request never completed" : `HTTP ${props.status}`, props.message === "" ? "" : ` · ${props.message}`]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "mm-btn mm-btn-primary",
						onClick: props.onRetry,
						children: props.t("retry")
					})
				]
			});
		}
		/**
		* The ready branch, including the row audit.
		* @param props - the parsed envelope, the renderer's output and the callbacks.
		* @returns the element.
		*/
		function ReadyView(props) {
			const audit = auditRows(props.node);
			const envelope = props.envelope;
			const denominator = measuredCount(envelope.census?.denominator);
			const numerator = measuredCount(envelope.census?.numerator);
			if (!audit.hasTree) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mm-state mm-state-defect",
				"data-mm-state": "render-defect",
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mm-err",
					children: "This window's view converted to NO TREE. An empty panel is indistinguishable from \"nothing installed\", so this is reported as a defect rather than rendered as an empty result."
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: "mm-muted",
					children: [
						"window ",
						envelope.window?.id ?? "unknown",
						" · rows in the payload ",
						numerator === null ? props.t("notMeasured") : numerator
					]
				})]
			});
			const rows = audit.rows;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CensusStrip, {
					census: envelope.census,
					generatedAt: envelope.generatedAt,
					unavailable: envelope.unavailable,
					t: props.t
				}),
				rows > 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: denominator !== null && denominator > 0 ? "mm-note" : "mm-warnp",
					"data-mm-empty": denominator !== null && denominator > 0 ? "genuine" : "instrument-failure",
					children: denominator === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						"The view produced 0 rows and the census denominator is ",
						props.t("notMeasured"),
						" — so this is \"cannot say\", not \"nothing exists\"."
					] }) : denominator === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						"The view produced 0 rows and the census denominator is 0. ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "0 of 0 is instrument failure, not a pass" }),
						" — the census could not see its population, so nothing here is a measured empty result."
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						"The view produced 0 rows against a measured population of ",
						denominator,
						" — this is a GENUINE empty result for this window, not a failure to render."
					] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "mm-rows",
					children: props.node
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FalsifierDrawer, {
					falsifiers: envelope.falsifiers ?? [],
					t: props.t
				})
			] });
		}
		/**
		* The panel frame.
		* @param props - which window is shown, the state, and the callbacks.
		* @returns the panel element.
		*/
		function PanelFrame(props) {
			const { state, t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				id: "dsh-meta-market-panel",
				className: "mm-panel",
				role: "tabpanel",
				"data-mm-window": props.window,
				"data-mm-primary": props.primary,
				"data-mm-state": state.kind === "ready" ? "ready" : state.kind,
				"data-mm-unavailable": state.kind === "ready" && state.envelope.unavailable !== null ? state.envelope.unavailable.reason : void 0,
				children: [
					state.kind === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingView, {}) : null,
					state.kind === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorView, {
						failure: state.failure,
						message: state.message,
						status: state.status,
						t,
						onRetry: props.onRetry
					}) : null,
					state.kind === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReadyView, {
						envelope: state.envelope,
						node: renderWindow(props.window, state.envelope, props.onOpenWindow),
						t
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/shell/openChannel.ts
		/**
		* The open channel: how `dsh-market`'s "Meta-Market" button reaches this window.
		*
		* THE SHAPE OF THE PROBLEM. Another plugin's button dispatches a cancelable
		* `CustomEvent('dsh-meta-market:open')` and treats `dispatchEvent(...) === false`
		* as "somebody took it". `dispatchEvent` returns false exactly when a listener
		* called `preventDefault()`, so the ONLY way to answer that button is to
		* `preventDefault()` — and the only honest way to call it is to have actually done
		* something. So the order in {@link handle} is: ACTIVATE, then preventDefault on
		* success. A listener that preventDefaults first and then fails would tell the
		* dispatcher "handled" about a request nothing handled, which is this program's
		* absent-versus-zero defect one level up: a `false` from `dispatchEvent` cannot
		* distinguish a working handler from a lying one.
		*
		* THERE IS NO `/meta-market` URL, and that is why this file exists rather than a
		* redirect. `index.tsx` registers a `sidebar.panellist` row whose `id` equals the
		* `main` panel's `key` (both `dsh-meta-market:market`), and the panel is
		* `scope: 'root'`, `kind: 'keyed'` with no route of its own. Navigation therefore
		* has to go through the layout service, exactly as the sidebar's own row does:
		* `ui-sidebar/src/client/index.ts:70-72` calls `ctx.layout.selectPanel(id)` on
		* click, and `ui-layout/src/client/service.ts:72-78` is the implementation. THIS
		* FILE CALLS THE SAME API, which is the whole point — not a DOM scrape that would
		* silently rot when the sidebar's markup changes.
		*
		* ONE FALLBACK, NAMED AND MEASURED. If `ctx.layout` is absent, or if
		* `selectPanel` throws (it throws when the key is not registered), the channel
		* falls back to clicking this plugin's OWN row button in the sidebar, located by
		* its `aria-label`. That is the weaker path — it depends on markup and on a
		* locale-resolved label — so which path was taken is recorded in
		* `data-mm-open-via` rather than left to be inferred from the fact that it worked.
		*
		* THE DISPOSER IS THE POINT OF THE `ctx.effect` WRAP IN `index.tsx`. A hot reload
		* re-runs `apply`; without removal each reload would stack one more listener, and
		* the visible symptom would be a click that opens the window N times with no error
		* anywhere. {@link OpenChannel.dispose} removes the SAME function reference it
		* added, and the harness drives install → dispose → install and asserts one
		* activation per dispatch.
		*
		* @module dsh-meta-market/client/shell/openChannel
		*/
		/** The event name `dsh-market`'s button dispatches. One spelling, used by both sides. */
		const OPEN_EVENT = "dsh-meta-market:open";
		/**
		* The key the LIVE channel is recorded under, on the event target (`window`).
		*
		* This is this plugin's own namespaced slot on `window` — nothing else is written
		* there, and in particular nothing is written into the host's DOM (which is why the
		* DOM fallback click has to go through `aria-label`). It exists so a second
		* evaluation of this module can find and dispose its predecessor, and so a verifier
		* can ask the live page WHICH evaluation is answering.
		*/
		const REGISTRY_KEY = "__dshMetaMarketOpenChannel";
		/**
		* The last request, kept at MODULE scope so the window can mirror it when it
		* mounts after the dispatch. A dispatch can arrive before this plugin's panel has
		* ever been rendered (that is the common case: the user clicks a button on another
		* plugin's panel), so the record has to survive the gap.
		*/
		let lastOpen = null;
		/**
		* Re-publish the most recent request onto the CURRENT document and window root.
		*
		* Needed because the usual order is dispatch-then-mount: the click arrives while
		* this plugin's panel has never been rendered, so {@link publish} wrote the record
		* to `document.documentElement` and found no `#dsh-meta-market-window` to write it
		* on. The window calls this from its mount effect so the root carries the same
		* state, and a verifier can read the attribute on either element.
		*
		* @param doc - the document, or `null` in a non-DOM run.
		*/
		function mirrorLastOpen(doc) {
			if (lastOpen === null) return;
			publish(lastOpen, doc);
		}
		/**
		* Write the request onto the document and, when it exists, onto the window root.
		*
		* The attributes are the instrument: a verifier asserts the TRANSITION
		* (`data-mm-open` absent -> `accepted`) rather than reading a caption. They are
		* put on `document.documentElement` as well as on `#dsh-meta-market-window`,
		* because the window root may not exist yet at the moment of the dispatch.
		*
		* @param record - what happened.
		* @param doc - the document, or `null` in a non-DOM run.
		*/
		function publish(record, doc) {
			if (doc === null) return;
			const root = doc.documentElement;
			if (root === null) return;
			root.setAttribute("data-mm-open", record.outcome);
			root.setAttribute("data-mm-open-via", record.via);
			root.setAttribute("data-mm-open-at", record.at);
			root.setAttribute("data-mm-open-mainkey", record.mainKey ?? "");
			const windowRoot = doc.getElementById?.("dsh-meta-market-window") ?? null;
			if (windowRoot !== null) {
				windowRoot.setAttribute("data-mm-open", record.outcome);
				windowRoot.setAttribute("data-mm-open-via", record.via);
				windowRoot.setAttribute("data-mm-open-at", record.at);
			}
		}
		/**
		* Install the listener.
		* @param deps - the main key, the layout face, the event target and the document.
		* @returns the channel handle, whose `dispose` removes the exact listener added.
		*/
		function installOpenChannel(deps) {
			let count = 0;
			let disposed = false;
			/**
			* Activate this plugin's keyed `main` panel.
			* @returns which mechanism worked, and why when neither did.
			*/
			const activate = () => {
				if (deps.selectPanel !== void 0) try {
					deps.selectPanel(deps.mainKey);
					return {
						via: "layout",
						reason: null
					};
				} catch (error) {
					deps.logger.info(`dsh-meta-market: layout.selectPanel refused ${deps.mainKey} (${error instanceof Error ? error.message : String(error)}); falling back to the sidebar row`);
				}
				const doc = deps.doc;
				if (doc !== null) {
					const row = doc.querySelector(`button[aria-label="${deps.rowLabel()}"]`);
					if (row !== null) {
						row.click();
						return {
							via: "row-click",
							reason: null
						};
					}
				}
				return {
					via: "none",
					reason: deps.selectPanel === void 0 ? "no layout service and no sidebar row found" : "layout refused the key and no sidebar row found"
				};
			};
			/**
			* One dispatch.
			* @param event - the cancelable CustomEvent the other plugin dispatched.
			*/
			const handle = (event) => {
				count += 1;
				const detail = event.detail;
				const mainKey = typeof detail?.mainKey === "string" ? detail.mainKey : null;
				if (mainKey !== null && mainKey !== deps.mainKey) {
					const record = {
						outcome: "refused",
						via: "none",
						at: (/* @__PURE__ */ new Date()).toISOString(),
						mainKey,
						reason: `the request named ${JSON.stringify(mainKey)} and this window registers only ${JSON.stringify(deps.mainKey)}`
					};
					lastOpen = record;
					publish(record, deps.doc);
					deps.logger.info(`dsh-meta-market: open request REFUSED — ${record.reason ?? "key mismatch"}`);
					return;
				}
				const activation = activate();
				if (activation.via === "none") {
					const record = {
						outcome: "refused",
						via: "none",
						at: (/* @__PURE__ */ new Date()).toISOString(),
						mainKey,
						reason: activation.reason
					};
					lastOpen = record;
					publish(record, deps.doc);
					deps.logger.info(`dsh-meta-market: open request REFUSED — ${activation.reason ?? "unknown"}`);
					return;
				}
				if (typeof event.preventDefault === "function") event.preventDefault();
				const record = {
					outcome: "accepted",
					via: activation.via,
					at: (/* @__PURE__ */ new Date()).toISOString(),
					mainKey,
					reason: null
				};
				lastOpen = record;
				publish(record, deps.doc);
				deps.logger.info(`dsh-meta-market: open request accepted via ${activation.via}`);
			};
			const registry = deps.target;
			const previous = registry[REGISTRY_KEY];
			if (previous !== void 0 && previous !== null && typeof previous.dispose === "function") {
				previous.dispose();
				deps.logger.info("dsh-meta-market: a previous open-channel listener was still installed; disposed it before installing this one");
			}
			deps.target.addEventListener(OPEN_EVENT, handle);
			const channel = {
				dispose() {
					if (disposed) return;
					disposed = true;
					deps.target.removeEventListener(OPEN_EVENT, handle);
					if (registry["__dshMetaMarketOpenChannel"] === channel) delete registry[REGISTRY_KEY];
				},
				handled() {
					return count;
				},
				last() {
					return lastOpen;
				}
			};
			registry[REGISTRY_KEY] = channel;
			return channel;
		}
		//#endregion
		//#region src/client/shell/WindowShell.tsx
		/**
		* The window shell: two rails, one panel, one fetch, and the state machine that
		* sits between the route and the view.
		*
		* `#dsh-meta-market-window` is the root. The advanced sub-rail is rendered ONLY
		* while `advanced` is the active primary tab, and the panel's `data-mm-window`
		* names the window whose view is actually on screen — so under `advanced` the
		* panel says `meta-agents`, not `advanced`. Both identities are stated
		* (`data-mm-window` for the view, `data-mm-primary` for the tab that opened it)
		* because collapsing them would make "advanced selected, no sub-window chosen yet"
		* and "meta-cordis selected" the same rendered claim.
		*
		* THE FETCH IS CANCELLED, NOT MERELY IGNORED. A tab switch aborts the in-flight
		* request and the aborted rejection never reaches `setState`, which is what stops
		* a slow answer for the previous tab from painting over the current one. Ignoring
		* the result without aborting would leave the request running and the race would
		* still be decided by arrival order on a slower network.
		*
		* A FAILED REQUEST IS NOT RETRIED AUTOMATICALLY. There is a visible `Refresh`
		* button, and the error branch has its own `Retry`; a surface that silently
		* re-requests makes "the route is down" look like "the surface is slow".
		*
		* @module dsh-meta-market/client/shell/WindowShell
		*/
		/**
		* The full window.
		* @param props - the injected translator.
		* @returns the window element.
		*/
		function WindowShell(props) {
			const { t } = props;
			const [primary, setPrimary] = (0, react.useState)(PRIMARY_TABS[0]);
			const [advancedWindow, setAdvancedWindow] = (0, react.useState)(ADVANCED_TABS[0]);
			const [attempt, setAttempt] = (0, react.useState)(0);
			const effective = primary === "advanced" ? advancedWindow : primary;
			const [state, setState] = (0, react.useState)({
				kind: "loading",
				window: effective
			});
			(0, react.useEffect)(() => {
				mirrorLastOpen(typeof document === "undefined" ? null : document);
			}, []);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				setState({
					kind: "loading",
					window: effective
				});
				loadSection(effective, controller.signal).then((envelope) => {
					if (controller.signal.aborted) return;
					setState({
						kind: "ready",
						window: effective,
						envelope
					});
				}).catch((error) => {
					if (controller.signal.aborted) return;
					if (error instanceof SectionError) {
						setState({
							kind: "error",
							window: effective,
							failure: error.failure,
							message: error.message,
							status: error.status
						});
						return;
					}
					setState({
						kind: "error",
						window: effective,
						failure: "malformed",
						message: error instanceof Error ? error.message : String(error),
						status: null
					});
				});
				return () => {
					controller.abort();
				};
			}, [effective, attempt]);
			/**
			* Switch window on a view's request (the `advanced` view's four launchers).
			* @param id - the window the view wants opened.
			*/
			const openWindow = (id) => {
				if (id === "advanced") {
					setPrimary(ADVANCED_TAB);
					return;
				}
				if (isAdvancedWindow(id)) {
					setPrimary(ADVANCED_TAB);
					setAdvancedWindow(id);
					return;
				}
				setPrimary(id);
			};
			const label = (id) => t(`tab.${id}`);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				id: "dsh-meta-market-window",
				className: "mm-window",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "mm-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mm-head-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
								className: "mm-h1",
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "mm-btn",
								onClick: () => setAttempt((current) => current + 1),
								disabled: state.kind === "loading",
								children: t("refresh")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "mm-sub",
							children: t("subtitle")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PrimaryTabRail, {
						tabs: PRIMARY_TABS,
						active: primary,
						label,
						ariaLabel: t("primaryRail"),
						onSelect: setPrimary
					}),
					primary === "advanced" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdvancedTabRail, {
						tabs: ADVANCED_TABS,
						active: advancedWindow,
						label,
						ariaLabel: t("advancedRail"),
						onSelect: setAdvancedWindow
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelFrame, {
						window: effective,
						primary,
						state,
						t,
						onRetry: () => setAttempt((current) => current + 1),
						onOpenWindow: openWindow
					})
				]
			});
		}
		//#endregion
		//#region src/client/shell/Page.tsx
		/** A translator that returns its own key, so a missing dictionary is visible. */
		const KEY_AS_LABEL = (key) => key;
		/**
		* The page the `main` slot renders.
		* @param props - the injected props; `t` when the locale service answered.
		* @returns the window element.
		*/
		function MarketPage(props) {
			const injected = props["t"];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WindowShell, { t: typeof injected === "function" ? injected : KEY_AS_LABEL });
		}
		//#endregion
		//#region \0dsh-css:<home>\Projects\deepseek-root\plugins-src\dsh-meta-market\src\client\styles.css.mjs
		const css$1 = "/**\n * The window's stylesheet — shell chrome only. The view layer owns its own\n * `windows/windows.css`, which the client entry imports separately.\n *\n * PLAIN CSS RATHER THAN CSS MODULES, following `dsh-intent-map`: every class is\n * namespaced `mm-`, so there is nothing to hash and a module map would add a\n * lookup for no benefit. The build inlines this as ONE `<style data-plugin=\"dsh-meta-market\">`\n * tag at factory execution.\n *\n * THE SCROLLING IS THE PART THIS FILE EXISTS FOR. The owner has an open complaint\n * about a sibling plugin whose output is unscrollable, and the cause of that class\n * is always the same: a flex child with `overflow: auto` and no `min-height: 0`,\n * so the child reports its CONTENT height and the overflow never engages. So:\n *\n *   .mm-window  is a fixed-height flex COLUMN (`height: 100%`, `min-height: 0`);\n *   .mm-panel   is the flex child that takes the remaining height and may shrink;\n *   .mm-rows    is the box that actually overflows (`overflow-y: auto`) and it\n *               carries `min-height: 0` so the browser does not floor it at its\n *               content height.\n *\n * The chrome (header, rails, census strip) does not scroll away with the rows,\n * which is what makes the rail usable on a window with 4,500 rows in it.\n *\n * Colours are declared against `currentColor` and rgba neutrals so the window\n * follows the shell's light/dark switch rather than pinning one theme.\n */\n\n.mm-window {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  height: 100%;\n  padding: 14px 16px 0;\n  font-size: 13px;\n  line-height: 1.5;\n  color: inherit;\n  overflow: hidden;\n  box-sizing: border-box;\n}\n\n.mm-head { flex: 0 0 auto; margin-bottom: 10px; }\n.mm-head-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }\n.mm-h1 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }\n.mm-sub { margin: 0; opacity: 0.72; max-width: 92ch; }\n\n/* ---- rails ------------------------------------------------------------- */\n\n.mm-tabs {\n  flex: 0 0 auto;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 6px 0;\n}\n.mm-tabs-primary { border-bottom: 1px solid rgba(128, 128, 128, 0.26); }\n.mm-tabs-advanced {\n  padding-left: 14px;\n  border-left: 2px solid rgba(128, 128, 128, 0.26);\n  margin-left: 2px;\n}\n\n.mm-tab {\n  padding: 4px 11px;\n  border-radius: 6px;\n  border: 1px solid rgba(128, 128, 128, 0.34);\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n  font-size: 12.5px;\n  font-weight: 500;\n}\n.mm-tab:hover { background: rgba(128, 128, 128, 0.14); }\n.mm-tab-active {\n  border-color: rgba(80, 140, 220, 0.85);\n  background: rgba(80, 140, 220, 0.18);\n  font-weight: 600;\n}\n\n/* ---- the panel and the ONE scroll container ---------------------------- */\n\n.mm-panel {\n  flex: 1 1 auto;\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  padding-top: 8px;\n  overflow: hidden;\n}\n\n.mm-rows {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: auto;\n  padding-bottom: 24px;\n}\n\n/* A belt-and-braces scroll for the case the page gives the window no height at\n   all: then `.mm-panel` is not height-constrained, `.mm-rows` cannot shrink, and\n   the window's own box must scroll instead of clipping silently. */\n.mm-window > .mm-panel { overscroll-behavior: contain; }\n\n/* ---- census strip ------------------------------------------------------ */\n\n.mm-census {\n  flex: 0 0 auto;\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 10px;\n  padding: 4px 0 8px;\n  margin-bottom: 6px;\n  border-bottom: 1px solid rgba(128, 128, 128, 0.18);\n  font-size: 12px;\n}\n.mm-census-count { font-variant-numeric: tabular-nums; }\n.mm-census-population { opacity: 0.8; max-width: 62ch; }\n\n.mm-muted { opacity: 0.62; }\n.mm-note { opacity: 0.86; margin: 6px 0; }\n.mm-err { color: #d9534f; margin: 6px 0; }\n.mm-warn { color: #c8860d; margin: 6px 0; }\n.mm-warnp { color: #c8860d; margin: 6px 0; }\n\n/* ---- chips ------------------------------------------------------------- */\n\n.mm-chip {\n  display: inline-block;\n  padding: 1px 8px;\n  border-radius: 10px;\n  font-weight: 600;\n  font-size: 11.5px;\n}\n.mm-chip-idle { background: rgba(128, 128, 128, 0.24); }\n\n/* ---- states ------------------------------------------------------------ */\n\n.mm-state {\n  flex: 0 0 auto;\n  padding: 14px 12px;\n  border: 1px dashed rgba(128, 128, 128, 0.4);\n  border-radius: 8px;\n}\n.mm-state-loading { display: flex; align-items: center; gap: 10px; opacity: 0.8; }\n.mm-state-error { border-color: rgba(217, 83, 79, 0.6); }\n.mm-state-defect { border-color: rgba(217, 83, 79, 0.9); background: rgba(217, 83, 79, 0.08); }\n\n.mm-spinner {\n  width: 12px;\n  height: 12px;\n  border-radius: 50%;\n  border: 2px solid rgba(128, 128, 128, 0.3);\n  border-top-color: rgba(80, 140, 220, 0.9);\n  animation: mm-spin 900ms linear infinite;\n}\n@keyframes mm-spin { to { transform: rotate(360deg); } }\n\n/* ---- buttons ----------------------------------------------------------- */\n\n.mm-btn {\n  padding: 3px 11px;\n  border-radius: 6px;\n  border: 1px solid rgba(128, 128, 128, 0.4);\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n  font-size: 12px;\n}\n.mm-btn:disabled { opacity: 0.45; cursor: default; }\n.mm-btn-primary { border-color: rgba(80, 140, 220, 0.75); }\n\n/* ---- falsifiers -------------------------------------------------------- */\n\n.mm-falsifiers {\n  flex: 0 0 auto;\n  margin-top: 10px;\n  padding-top: 6px;\n  border-top: 1px solid rgba(128, 128, 128, 0.2);\n  font-size: 12px;\n}\n.mm-falsifiers > summary { cursor: pointer; opacity: 0.8; }\n.mm-falsifier-list { margin: 6px 0 0; padding-left: 18px; }\n.mm-falsifier { margin-bottom: 6px; }\n.mm-falsifier-claim { display: block; font-weight: 600; }\n.mm-falsifier-how { display: block; opacity: 0.78; }\n";
		const tagId$1 = "dsh-meta-market/styles.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-meta-market";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region \0dsh-css:<home>\Projects\deepseek-root\plugins-src\dsh-meta-market\src\client\windows\windows.css.mjs
		const css = "/*\n * dsh-meta-market window styles. Owner: windows-client (src/client/windows/**).\n *\n * Every selector is under `mm-` so nothing here can reach the shell's own chrome. The shell supplies\n * the panel and the tab rail; this file supplies only what is inside a window.\n *\n * TWO RULES ARE LOAD-BEARING, and both are about honesty rather than looks:\n * 1. `.mm-rows-scroll` is the scroll container. The rows table is wide and long, and a table that\n *    overflows a panel without its own scrollbar is the \"unscrollable output\" failure this program\n *    has already paid for once. `max-height` plus `overflow: auto` keeps the panel fixed and scrolls\n *    the rows inside it, and the sticky header means the column names survive the scroll.\n * 2. `.mm-absent` and `.mm-warn` must stay VISUALLY DISTINCT from `.mm-value` and `.mm-flag-no`.\n *    \"NOT MEASURED\" is not a value, and a reader who cannot tell it apart at a glance will read an\n *    absent reading as a measurement. The absent token is therefore italic, dimmed and letter-spaced\n *    rather than merely grey.\n *\n * Nothing in this file is required for correctness: the views render every field and every honest\n * token with no stylesheet at all. This file changes how a reader SEES the difference, not what the\n * window SAYS.\n */\n\n.mm-window {\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n  padding: 0.75rem;\n  min-width: 0;\n  font-size: 0.875rem;\n  line-height: 1.45;\n}\n\n.mm-header {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 0.5rem;\n}\n\n.mm-title {\n  margin: 0;\n  font-size: 1rem;\n  font-weight: 600;\n}\n\n.mm-description,\n.mm-generated,\n.mm-note {\n  margin: 0;\n  opacity: 0.85;\n}\n\n.mm-generated,\n.mm-item-id,\n.mm-item-source,\n.mm-alignment-evidence,\n.mm-falsifier-how {\n  font-size: 0.78rem;\n  opacity: 0.7;\n}\n\n.mm-note {\n  border-left: 2px solid currentColor;\n  padding-left: 0.5rem;\n}\n\n.mm-kind {\n  display: inline-block;\n  padding: 0 0.35rem;\n  border: 1px solid currentColor;\n  border-radius: 0.25rem;\n  font-size: 0.72rem;\n  letter-spacing: 0.03em;\n  text-transform: uppercase;\n  white-space: nowrap;\n}\n\n.mm-kind-exists {\n  font-weight: 700;\n}\n\n.mm-kind-plan {\n  font-style: italic;\n}\n\n.mm-kind-future {\n  font-style: italic;\n  opacity: 0.75;\n}\n\n.mm-census {\n  margin: 0;\n  padding: 0.35rem 0.5rem;\n  border: 1px solid currentColor;\n  border-radius: 0.25rem;\n}\n\n.mm-census-count {\n  font-variant-numeric: tabular-nums;\n}\n\n.mm-warnings {\n  border: 1px solid currentColor;\n  border-radius: 0.25rem;\n  padding: 0.4rem 0.6rem;\n  background: color-mix(in srgb, currentColor 8%, transparent);\n}\n\n.mm-warnings-heading,\n.mm-heading {\n  margin: 0 0 0.25rem;\n  font-weight: 600;\n}\n\n.mm-warnings-list {\n  margin: 0;\n  padding-left: 1.1rem;\n}\n\n.mm-warn {\n  font-weight: 600;\n  text-decoration: underline dotted;\n}\n\n.mm-absent {\n  font-style: italic;\n  opacity: 0.7;\n  letter-spacing: 0.04em;\n}\n\n.mm-value {\n  font-variant-numeric: tabular-nums;\n}\n\n/* The scroll container: the one rule the \"unscrollable panel\" finding requires. */\n.mm-rows-scroll {\n  max-height: 32rem;\n  overflow: auto;\n  border: 1px solid currentColor;\n  border-radius: 0.25rem;\n}\n\n.mm-rows {\n  border-collapse: collapse;\n  width: max-content;\n  min-width: 100%;\n  font-size: 0.8rem;\n}\n\n.mm-rows .mm-col,\n.mm-rows thead th {\n  position: sticky;\n  top: 0;\n  z-index: 1;\n  text-align: left;\n  white-space: nowrap;\n  padding: 0.35rem 0.5rem;\n  border-bottom: 1px solid currentColor;\n  background: Canvas;\n  background: color-mix(in srgb, canvas 92%, currentColor 8%);\n}\n\n.mm-rows td,\n.mm-rows th.mm-cell {\n  vertical-align: top;\n  padding: 0.35rem 0.5rem;\n  border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);\n}\n\n.mm-cell-name {\n  text-align: left;\n  min-width: 12rem;\n  max-width: 20rem;\n}\n\n.mm-cell-zones,\n.mm-cell-collides {\n  min-width: 12rem;\n}\n\n.mm-row-exists {\n  background: transparent;\n}\n\n.mm-row-plan,\n.mm-row-future {\n  background: color-mix(in srgb, currentColor 4%, transparent);\n}\n\n.mm-item-name {\n  font-weight: 600;\n}\n\n.mm-flag {\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.mm-flag-absent {\n  font-style: italic;\n  opacity: 0.7;\n  letter-spacing: 0.04em;\n}\n\n.mm-flag-yes {\n  font-weight: 700;\n}\n\n.mm-flag-no {\n  opacity: 0.85;\n}\n\n.mm-zone {\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.mm-original {\n  font-size: 0.78rem;\n  opacity: 0.8;\n}\n\n.mm-badge {\n  display: inline-block;\n  padding: 0 0.3rem;\n  border: 1px solid currentColor;\n  border-radius: 0.2rem;\n  font-size: 0.7rem;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  white-space: nowrap;\n}\n\n.mm-badge-collides {\n  text-decoration: underline double;\n}\n\n.mm-collide-list {\n  margin: 0.2rem 0 0;\n  padding-left: 1rem;\n  font-size: 0.78rem;\n}\n\n.mm-alignment-why {\n  font-size: 0.78rem;\n}\n\n.mm-patch code,\n.mm-patch-artifact {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 0.75rem;\n  word-break: break-all;\n}\n\n.mm-none {\n  opacity: 0.7;\n}\n\n.mm-unavailable {\n  border: 2px solid currentColor;\n  border-radius: 0.25rem;\n  padding: 0.6rem 0.75rem;\n}\n\n.mm-unavailable-heading {\n  margin: 0 0 0.35rem;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n}\n\n.mm-unavailable-reason,\n.mm-unavailable-at,\n.mm-unavailable-note {\n  margin: 0.2rem 0;\n}\n\n.mm-falsifiers,\n.mm-controls {\n  border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent);\n  padding-top: 0.4rem;\n}\n\n.mm-falsifier-list,\n.mm-control-list {\n  margin: 0;\n  padding-left: 1.1rem;\n}\n\n.mm-falsifier-list li,\n.mm-control-list li {\n  margin-bottom: 0.3rem;\n}\n\n.mm-control-target {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 0.75rem;\n  word-break: break-all;\n}\n\n.mm-control-proven {\n  font-size: 0.78rem;\n  opacity: 0.8;\n}\n\n.mm-control-note {\n  font-size: 0.78rem;\n  opacity: 0.7;\n}\n\n.mm-zonesummary {\n  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);\n  border-radius: 0.25rem;\n  padding: 0.4rem 0.6rem;\n}\n\n.mm-zonetable {\n  border-collapse: collapse;\n  font-size: 0.78rem;\n  margin-top: 0.3rem;\n  width: max-content;\n  max-width: 100%;\n}\n\n.mm-zonetable th,\n.mm-zonetable td {\n  padding: 0.2rem 0.5rem;\n  border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);\n  text-align: left;\n  font-variant-numeric: tabular-nums;\n}\n\n.mm-launchers {\n  display: flex;\n  flex-direction: column;\n  gap: 0.4rem;\n}\n\n.mm-launcher-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.5rem;\n}\n\n.mm-launcher {\n  flex: 1 1 16rem;\n  border: 1px solid currentColor;\n  border-radius: 0.25rem;\n  padding: 0.5rem;\n  display: flex;\n  flex-direction: column;\n  gap: 0.3rem;\n}\n\n.mm-launcher-button {\n  font: inherit;\n  font-weight: 700;\n  letter-spacing: 0.03em;\n  text-align: left;\n  padding: 0.35rem 0.5rem;\n  border: 1px solid currentColor;\n  border-radius: 0.2rem;\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n}\n\n.mm-launcher-button:disabled {\n  cursor: not-allowed;\n  opacity: 0.6;\n}\n\n.mm-launcher-subject {\n  margin: 0;\n  font-size: 0.78rem;\n  opacity: 0.85;\n}\n\n.mm-readonly {\n  margin: 0;\n  padding: 0.35rem 0.5rem;\n  border: 1px dashed currentColor;\n  border-radius: 0.25rem;\n  font-size: 0.8rem;\n}\n";
		const tagId = "dsh-meta-market/windows.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-meta-market";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* Client half of `dsh-meta-market`.
		*
		* THREE REGISTRATIONS, and the pairing is the point:
		*
		*  1. this plugin's dictionary in the shared locale service;
		*  2. **one nav row** in `sidebar.panellist`;
		*  3. **one keyed `main` panel** behind that row, because a row whose panel does
		*     not exist throws on the first click.
		*
		* THE TRAP THIS FILE IS WRITTEN AROUND, copied from `dsh-intent-map` because it is
		* a property of the SEAM and not of that plugin:
		*
		*   **the row's `id` in `sidebar.panellist` must equal the panel's `key` in `main`.**
		*
		* The two slots spell identity differently. `sidebar.panellist` is a LIST and
		* builds its rows from `options.id`; `main` is `kind: 'keyed'` and `ui-layout`
		* matches `entry.options.key`. Registering `{ id: X }` in both slots looks
		* correct, satisfies a naive "same identity" review, and still throws on the first
		* click — the worst failure shape available here, because the row RENDERS and the
		* user's own click looks broken. {@link MARKET_ROW_ID} and {@link MARKET_MAIN_KEY}
		* are therefore two separate declarations of one value.
		*
		* **`main` is `scope: 'root'`, so the page gets no `useProjection` and no
		* `sessionId`** — it reads its own route over `fetch`, and this file passes it
		* nothing but the injected translator.
		*
		* The registrations go through `ctx.slots.inject`, not a bare `register`: both
		* slots are declared by OTHER packages, and a bare `register` into an undeclared
		* slot throws at load.
		*
		* WHAT THIS FILE DELIBERATELY DOES NOT DO: it does not render the panel's body.
		* The ten windows live under `src/client/windows/**`, owned by another lane, and
		* the shell reaches them through exactly one module (`./shell/views.ts`). Nor does
		* it decide that the plugin is mounted — `cordis.patch.yml` carries the row and no
		* profile consumes it yet, so the window exists as a `plan` until the owner
		* restarts their session.
		*
		* @module dsh-meta-market/client
		*/
		/** Loader row name; the Client bundle registers itself under this same id. */
		const name = "dsh-meta-market";
		/** The three Client services this half reads. `layout` is the panel-selection face. */
		const inject = [
			"slots",
			"locale",
			"layout"
		];
		/**
		* The panel's identity, declared once per spelling.
		*
		* {@link MARKET_ROW_ID} is the `sidebar.panellist` row's `id`; {@link MARKET_MAIN_KEY}
		* is the `main` panel's `key`. They hold the same string ON PURPOSE — see the
		* module header — and both are namespaced so they cannot collide with a shipped
		* panel id.
		*/
		const MARKET_ROW_ID = "dsh-meta-market:market";
		/** The `main` key the row selects. MUST equal {@link MARKET_ROW_ID}. */
		const MARKET_MAIN_KEY = "dsh-meta-market:market";
		/** Position among the global panel rows, ascending. Sits after the siblings' rows. */
		const MARKET_ROW_ORDER = 6.6;
		/**
		* The row's glyph, drawn inline so the bundle needs no asset fetch.
		* @returns the svg element.
		*/
		function MarketRowIcon() {
			return (0, react.createElement)("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, (0, react.createElement)("path", { d: "M2 6.5 8 3l6 3.5-6 3.5-6-3.5Z" }), (0, react.createElement)("path", { d: "M2 10.5 8 14l6-3.5" }), (0, react.createElement)("path", { d: "M2 8.5 8 12l6-3.5" }));
		}
		/**
		* Register the dictionary, the nav row and the keyed main panel.
		* @param ctx - the Client plugin context (`slots`, `locale`, `effect`, `logger`).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, "en", en), "dsh-meta-market: en dictionary");
			const t = ctx.locale.bind(LOCALE_NS);
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: MARKET_MAIN_KEY,
				locale: LOCALE_NS,
				registrant: "dsh-meta-market",
				inject: () => ({ t })
			}, MarketPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: MARKET_ROW_ID,
				order: MARKET_ROW_ORDER,
				label: () => t("row"),
				locale: LOCALE_NS,
				registrant: "dsh-meta-market",
				inject: () => ({ t })
			}, MarketRowIcon));
			if (typeof window !== "undefined") ctx.effect(() => {
				const channel = installOpenChannel({
					mainKey: MARKET_MAIN_KEY,
					rowLabel: () => t("row"),
					selectPanel: (key) => {
						const face = ctx.layout;
						if (face === void 0) throw new Error("the layout service is not available, so no keyed main panel can be selected");
						face.selectPanel(key);
					},
					target: window,
					doc: document,
					logger: ctx.logger
				});
				return () => channel.dispose();
			}, "dsh-meta-market: open channel");
			ctx.logger.info(`dsh-meta-market: client active; nav row ${MARKET_ROW_ID}@${MARKET_ROW_ORDER} with keyed main twin ${MARKET_MAIN_KEY}, plus the en dictionary`);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map