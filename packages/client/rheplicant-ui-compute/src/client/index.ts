/**
 * Browser plugin for the rheplicant compute settings card. Registers one
 * `settings.section` entry that reads/writes the `rheplicant-endpoints`
 * settings section through the seam's settings channel (no client→host RPC).
 * @module @rheplicant/dsh-rheplicant-ui-compute/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ComputeSection, type ComputeEndpoints } from './ComputeSection.tsx'

export const inject = ['slots', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<ComputeEndpoints>({ namespace: 'rheplicant-endpoints' })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'rheplicant-compute',
    order: 20,
    label: () => 'Compute',
    inject: () => ({ scope }),
  }, ComputeSection))
}
