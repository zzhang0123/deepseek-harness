/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-docs`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-docs'
export const name = 'rheplicant-ui-docs-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: the documentation section reads nothing and writes
 * nothing outside its own remembered topic. It owns no service, no event and
 * no ledger — the section register it coordinates with belongs to `ui-project`,
 * which carries the invariant for it.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
