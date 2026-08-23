/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-analysis`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-analysis'
export const name = 'rheplicant-ui-analysis-invariant'
export const inject = ['invariants']
/** No runtime invariant: the node definition is registered by the browser half. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
