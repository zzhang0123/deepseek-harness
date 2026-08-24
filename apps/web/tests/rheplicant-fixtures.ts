// The two injection points every rheplicant web e2e scenario needs, resolved
// once. A row EXISTING and its package RESOLVING are separate facts: the
// overlay supplies the rows, the anchor supplies the packages, and a scenario
// passing one without the other fails as an empty surface rather than an
// error. They are exported as a pair so that is hard to do by accident.
//
// Shared rather than per-scenario — unlike this directory's other overlays,
// which each belong to one scenario — because all fifteen rheplicant
// scenarios mount the same composition. Fifteen copies of these paths would
// be fifteen chances to mistype a filename that `string` cannot catch.
import { fileURLToPath } from 'node:url'

export const RHEPLICANT_OVERLAY = fileURLToPath(new URL('./rheplicant.overlay.yml', import.meta.url))
export const RHEPLICANT_ANCHOR = fileURLToPath(new URL('./rheplicant-anchor/package.json', import.meta.url))
