/**
 * Browser plugin for the durable rheplicant analysis-run Conversation Node.
 * Registers the Definition, its keyed `conversation.chat.node` renderer, and
 * a second occupant of ui-console's `console.panel` grid — `signal-path` —
 * mirroring ui-posterior's two-registrations-one-plugin pattern.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { AnalysisRunPanel } from './AnalysisRunPanel.tsx'
import { analysisRunDefinition } from './analysis-definition.ts'
import { SignalPathPanel } from './SignalPathPanel.tsx'

/** Required services for the Definition, the keyed renderer, and the console.panel registration. */
export const inject = ['conversationEvents', 'slots']

/** Register the rheplicant-analysis Definition, its keyed renderer, and the signal-path console panel. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(analysisRunDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'rheplicant-analysis',
    locale: 'conversation',
  }, AnalysisRunPanel))
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'signal-path',
    label: () => 'Signal path',
  }, SignalPathPanel))
}
