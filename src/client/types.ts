/**
 * The Client half's structural types, and the ONE place the view contract is
 * re-exported from.
 *
 * TWO KINDS OF TYPE LIVE HERE, and keeping them apart is the point:
 *
 *  1. **The view contract** — `WindowEnvelope`, `Item`, `Control`, `Falsifier`,
 *     `Census`, `WindowId`, `WindowViewProps` — is OWNED by `windows-client` in
 *     `./windows/types.ts` and only RE-EXPORTED here. This file is the client
 *     half's single import site for it, so the shell has one dependency and a
 *     rename in the view layer fails in one place rather than ten.
 *  2. **The transport types** — the discriminated state a fetch can be in — are
 *     the SHELL's, because the shell owns loading, network failure, non-200 and
 *     unparseable bodies. The views never see those states: they are called only
 *     with a parsed envelope.
 *
 * The re-export is `export type`, not `export`, because the clone sets
 * `verbatimModuleSyntax: true` and a value-form re-export of a type is a build
 * error rather than a warning.
 *
 * There is no `@deepseek-ai/*` import here. The Client plugin context is declared
 * STRUCTURALLY, exactly as the Host half declares its own, so this half needs no
 * dependency on the Harness checkout to typecheck.
 *
 * @module dsh-meta-market/client/types
 */

import type { ReactElement } from 'react'
import type { WindowEnvelope, WindowId } from './windows/types.ts'

/** The view contract, re-exported from the layer that owns it. */
export type {
  Census,
  Control,
  Falsifier,
  Item,
  WindowEnvelope,
  WindowId,
  WindowViewProps,
} from './windows/types.ts'

/** Translate one key from this plugin's namespace. */
export type Translator = (key: string) => string

/** A locale service, as this half uses it. */
export interface ClientLocale {
  register(ns: string, lang: 'en', dict: Record<string, string>): () => void
  bind(ns: string): Translator
}

/** A slot registration, as this half uses it. */
export interface ClientSlots {
  inject(name: string, callback: () => () => void): void
  register(
    options: Record<string, unknown>,
    component: (props: Record<string, unknown>) => ReactElement | null,
  ): () => void
}

/** The Client plugin context. */
export interface ClientContext {
  readonly slots: ClientSlots
  readonly locale: ClientLocale
  /**
   * The `ui-layout` panel-action face (`ctx.layout`), DECLARED STRUCTURALLY and
   * OPTIONALLY.
   *
   * Optional because this half must still load if the layout service is absent —
   * the open channel then falls back to clicking its own sidebar row, and records
   * which path it took. Declared structurally rather than imported for the same
   * reason as everything else in this file: no `@deepseek-ai/*` type dependency.
   * The method and its throw-on-unregistered-key behaviour are read from
   * `ui-layout/src/client/service.ts:36,72-78`.
   */
  readonly layout?: { selectPanel(key: string): void }
  effect(callback: () => (() => void) | void, label?: string): void
  readonly logger: { info(...args: unknown[]): void }
}

/** The properties every page receives from the shell. */
export interface PageProps extends Record<string, unknown> {
  readonly t: Translator
}

/**
 * Why one section fetch produced no envelope.
 *
 * The vocabulary is CLOSED and each member is a DISTINCT sentence in the panel,
 * because a collapsed boolean renders "not mounted", "refused" and "server is not
 * there" as the same user-visible claim — and this program has a rule about
 * comparisons whose two sides are non-answers printing a pass.
 */
export type SectionFailure = 'unreachable' | 'unmounted' | 'rejected' | 'malformed'

/** The panel's state machine. Exactly one of these holds at any moment. */
export type SectionState =
  | { readonly kind: 'loading'; readonly window: WindowId }
  | { readonly kind: 'error'; readonly window: WindowId; readonly failure: SectionFailure; readonly message: string; readonly status: number | null }
  | { readonly kind: 'ready'; readonly window: WindowId; readonly envelope: WindowEnvelope }

/** A typed failure from this plugin's section route. */
export class SectionError extends Error {
  /**
   * Fields are declared and assigned LONGHAND rather than as constructor
   * parameter properties, because a parameter property is TypeScript syntax that
   * `node --experimental-strip-types` REFUSES (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`,
   * measured): strip-only mode erases annotations, and a shorthand that both
   * declares and assigns is not an annotation. Every lane harness in this program
   * runs under strip-types, so the shorthand would make this file unloadable to
   * the very instruments that verify it.
   */
  readonly failure: SectionFailure
  readonly status: number | null

  constructor(failure: SectionFailure, message: string, status: number | null = null) {
    super(message)
    this.name = 'SectionError'
    this.failure = failure
    this.status = status
  }
}
