/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-document`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-document'
export const name = 'rheplicant-ui-document-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: this package folds durable events into a private
 * projection and renders it. It publishes no service and calls no compute, so
 * there is no cross-call state for an invariant to hold.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
