/** Browser plugin for the config-document reference view: one conversation.view tab. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DocumentView } from './DocumentView.tsx'

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'document',
    order: 20,
    label: () => 'Document',
  }, DocumentView))
}
