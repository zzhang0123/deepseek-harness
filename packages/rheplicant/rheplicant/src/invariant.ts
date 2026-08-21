/** Package-owned invariant companion for `@rheplicant/dsh-rheplicant`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rheplicant/dsh-rheplicant'
export const name = 'rheplicant-invariant'
export const inject = ['invariants']
/** No runtime invariant: provider maps are private and routing is enforced per call. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
