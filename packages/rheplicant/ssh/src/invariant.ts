/** Package-owned invariant companion for `@rheplicant/dsh-rheplicant-ssh`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@rheplicant/dsh-rheplicant-ssh'
export const name = 'rheplicant-ssh-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: one transport provider registered into `ctx.rheplicant`
 * under one name. The seam owns the registry and already refuses a duplicate
 * transport (`DUPLICATE_TRANSPORT`); this row owns no service, no event and no
 * ledger of its own.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
