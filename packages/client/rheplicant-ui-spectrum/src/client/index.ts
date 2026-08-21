/**
 * Browser plugin for the spectrum panel. Injects into the `console.panel` slot
 * declared by ui-console — the separate-viz-plugin contract: this package reads
 * nothing but the log, and does not re-run compute.
 * @module @rheplicant/dsh-rheplicant-ui-spectrum/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { SpectrumPanel } from './SpectrumPanel.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'spectrum',
    label: () => 'Spectrum',
  }, SpectrumPanel))
}
