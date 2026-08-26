/** Package-owned invariant companion for `@rheplicant/dsh-rheplicant-tool-trigger`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rheplicant/dsh-rheplicant-tool-trigger'
export const name = 'rheplicant-tool-trigger-invariant'
export const inject = ['invariants']
/** No runtime invariant: registers one tool; the tools registry owns disposal. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
