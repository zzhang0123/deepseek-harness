/** Package-owned invariant companion for `@rheplicant/dsh-rheplicant-transport`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rheplicant/dsh-rheplicant-transport'
export const name = 'rheplicant-transport-invariant'
export const inject = ['invariants']
/** No runtime invariant: a pure stdio JSON-RPC helper with no registry or stream. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
