/**
 * Browser plugin for the posterior panel. Injects into the `console.panel` slot
 * declared by ui-console — the separate-viz-plugin contract: this package reads
 * nothing but the log, and does not re-run compute.
 * @module @rheplicant/dsh-rheplicant-ui-posterior/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { PosteriorPanel } from './PosteriorPanel.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'posterior',
    label: () => 'Posterior',
  }, PosteriorPanel))
}
