/**
 * The program roots, COMPUTED rather than hard-coded.
 *
 * WHY THIS FILE EXISTS: these values used to be machine-local string literals
 * (an absolute home-directory path), which published one developer's
 * home directory inside a public package and made every harness pin to that
 * machine. A literal cannot be right on two machines, and a placeholder cannot be
 * right on any: this resolves from the ENVIRONMENT first, then from the OS home
 * directory, so behaviour on the machine the package was built on is unchanged and
 * the same code runs elsewhere.
 *
 * Precedence, highest first, and each override is a single variable so a caller can
 * be explicit rather than special-casing a path:
 *   DSH_META_PROGRAM_ROOT      — the directory that holds `plugins-src/` and `profiles-tree/`
 *   DSH_META_PLUGINS_SRC       — the clones
 *   DSH_META_PROFILE_ROOT      — the profile whose `dsh.profile.bundles` is the official population
 *   DSH_META_HARNESS_ROOT      — the harness checkout
 *   DSH_META_PROGRAM_WORKSPACE — the program workspace (plan, research, runner)
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PROGRAM_ROOT =
  process.env.DSH_META_PROGRAM_ROOT ?? join(homedir(), 'Projects', 'deepseek-root')

export const PLUGINS_SRC = process.env.DSH_META_PLUGINS_SRC ?? join(PROGRAM_ROOT, 'plugins-src')

export const PROFILE_ROOT =
  process.env.DSH_META_PROFILE_ROOT ?? join(PROGRAM_ROOT, 'profiles-tree', 'personal-dev')

export const HARNESS_ROOT =
  process.env.DSH_META_HARNESS_ROOT ?? join(PROGRAM_ROOT, 'deepseek-harness')

export const PROGRAM_WORKSPACE =
  process.env.DSH_META_PROGRAM_WORKSPACE ?? join(PROFILE_ROOT, 'dsh-meta-evolve_INIT_WORKSPACE')
