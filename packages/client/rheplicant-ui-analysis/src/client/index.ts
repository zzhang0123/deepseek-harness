/**
 * Browser plugin for the durable rheplicant analysis-run Conversation Node.
 * Registers the Definition and its keyed `conversation.chat.node` renderer.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { AnalysisRunPanel } from './AnalysisRunPanel.tsx'
import { analysisRunDefinition } from './analysis-definition.ts'

/** Required services for the Definition and the keyed renderer. */
export const inject = ['conversationEvents', 'slots']

/** Register the rheplicant-analysis Definition and its keyed renderer. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(analysisRunDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'rheplicant-analysis',
    locale: 'conversation',
  }, AnalysisRunPanel))
}
