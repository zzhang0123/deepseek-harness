/**
 * Browser plugin for the rheplicant dark theme. Applies the rheplicant palette
 * as a token override layer over the active base theme — the brand-shading
 * pattern — so the console reads as a dark "radio telescope observatory"
 * regardless of the user's light/dark preference.
 * @module @rheplicant/dsh-rheplicant-ui-theme/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { rheplicantOverrides } from './theme.ts'

/** Override-layer identity; stable across canonical/mirror builds. */
const SOURCE = 'rheplicant'

/** Required services: the DSH theme registry. */
export const inject = ['theme']

/** Stack the rheplicant palette over the active theme for the plugin's lifetime. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const dispose = ctx.theme.overrideTokens(SOURCE, rheplicantOverrides)
    return () => { dispose() }
  }, 'rheplicant-ui-theme: brand token overlay')
}
