/** Package-owned invariant companion for `@rheplicant/dsh-rheplicant-local`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rheplicant/dsh-rheplicant-local'
export const name = 'rheplicant-local-invariant'
export const inject = ['invariants']
/** No runtime invariant: registers one provider; the seam's registry owns disposal. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
