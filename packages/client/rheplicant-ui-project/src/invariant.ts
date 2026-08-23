/** Package-owned invariant companion for `@deepseek-ai/dsh-client-rheplicant-ui-project`. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-rheplicant-ui-project'
export const name = 'rheplicant-ui-project-invariant'
export const inject = ['invariants']
/**
 * No runtime invariant: this package does publish two services
 * (`rheplicantSelection`, `rheplicantWorkbench`), but both are browser-half
 * registrations made by `src/client/index.ts` — this node half mounts nothing,
 * so there is nothing on THIS plane to hold.
 */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
