/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-loop`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-loop'
export const name = 'rheplicant-ui-loop-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: the `rheplicant-loop` conversation-view projection is
 * a pure fold over durable events with no state to violate, and the
 * `ctx.rheplicantSelection` bridge this package READS is owned — and its
 * invariants held — by ui-project, which publishes it.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
