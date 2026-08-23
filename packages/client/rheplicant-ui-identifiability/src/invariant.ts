/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-identifiability`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-identifiability'
export const name = 'rheplicant-ui-identifiability-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: a viz occupant reads the selection it is handed
 * through owner props and draws it. It owns no service, no event and no
 * ledger.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
