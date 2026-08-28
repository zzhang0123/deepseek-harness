/** Package-owned invariant companion for `@rheplicant/dsh-rheplicant-guidance`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rheplicant/dsh-rheplicant-guidance'
export const name = 'rheplicant-guidance-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: one row that registers one prompt section from static
 * text and disposes it on unmount. It owns no service, no event and no ledger.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
