// The two injection points every rheplicant web e2e scenario needs. A row
// EXISTING and its package RESOLVING are separate facts: the overlay supplies
// the rows, the anchor supplies the packages, and a scenario passing one
// without the other fails as an empty surface rather than an error — the
// hardest kind of failure to read. So they are supplied by ONE call rather
// than two constants: spreading `...rheplicantFixtures()` cannot deliver half
// of the pair, where two exports could and an earlier version's comment
// wrongly claimed otherwise.
//
// Shared rather than per-scenario — unlike this directory's other overlays,
// which each belong to one scenario — because all fifteen rheplicant
// scenarios mount the same composition, so fifteen copies of these paths
// would be fifteen chances to mistype a filename that `string` cannot catch.
import { fileURLToPath } from 'node:url'
import type { LaunchOptions } from './scaffold.ts'

const RHEPLICANT_OVERLAY = fileURLToPath(new URL('./rheplicant.overlay.yml', import.meta.url))
const RHEPLICANT_ANCHOR = fileURLToPath(new URL('./rheplicant-anchor/package.json', import.meta.url))

/** Both fields a rheplicant scenario must pass to {@link launchWebScaffold}. */
export function rheplicantFixtures(): Pick<LaunchOptions, 'extraOverlayPath' | 'installAnchor'> {
  return { extraOverlayPath: RHEPLICANT_OVERLAY, installAnchor: RHEPLICANT_ANCHOR }
}
