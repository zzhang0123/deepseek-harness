// The two injection points every rheplicant web e2e scenario needs. A row
// EXISTING and its package RESOLVING are separate facts: the overlay supplies
// the rows, the anchor supplies the packages, and a scenario passing one
// without the other fails as an empty surface rather than an error — the
// hardest kind of failure to read. So they are supplied by ONE call rather
// than two constants: a scenario can no longer accidentally import only one
// of the two, the way it could when they were separate exports — an earlier
// version's comment claimed exactly that guarantee and was wrong, since
// nothing bound the pair together. A deliberate
// `const { extraOverlayPath } = rheplicantFixtures()` can still pick the pair
// back apart; the call only closes off the accidental route, not a
// purposeful one.
//
// Shared rather than per-scenario — unlike this directory's other overlays,
// which each belong to one scenario — because all fifteen rheplicant
// scenarios mount the same composition, so fifteen copies of these paths
// would be fifteen chances to mistype a filename that `string` cannot catch.
import { fileURLToPath } from 'node:url'
import type { LaunchOptions } from './scaffold.ts'

const RHEPLICANT_OVERLAY = fileURLToPath(new URL('./rheplicant.overlay.yml', import.meta.url))
const RHEPLICANT_ANCHOR = fileURLToPath(new URL('./rheplicant-anchor/package.json', import.meta.url))

/**
 * Both fields a rheplicant scenario must pass to {@link launchWebScaffold}.
 * Spread this FIRST in the options object passed to `launchWebScaffold`, so
 * a scenario-specific field listed after it still wins — ordinary
 * object-literal precedence, not anything this function enforces. What
 * actually stops a scenario from silently zeroing a field back out is
 * `exactOptionalPropertyTypes: true` (this repo's tsconfig): writing
 * `extraOverlayPath: undefined` after the spread is a compile error, not a
 * silent override, regardless of where the spread sits.
 */
export function rheplicantFixtures(): Required<Pick<LaunchOptions, 'extraOverlayPath' | 'installAnchor'>> {
  return { extraOverlayPath: RHEPLICANT_OVERLAY, installAnchor: RHEPLICANT_ANCHOR }
}
