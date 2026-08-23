/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-brand`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-brand'
export const name = 'rheplicant-ui-brand-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: this package occupies three shipped brand seats
 * (`sidebar.brand.mark`/`name`, `conversation.hero.brand.mark`) and owns no
 * service, no event and no ledger — the slot system's own invariants cover
 * whether a seat is legally occupied.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
