/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-posterior`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-posterior'
export const name = 'rheplicant-ui-posterior-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: two viz occupants that read the selection they are
 * handed through owner props and draw it. Neither owns a service, an event or
 * a ledger.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
