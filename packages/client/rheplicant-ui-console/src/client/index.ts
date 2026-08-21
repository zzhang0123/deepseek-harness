/**
 * Browser plugin for the rheplicant console. Registers a "Console"
 * conversation.view tab and DECLARES a child slot `console.panel` (a list grid)
 * that other plugins — posterior, spectrum, … — inject into. This is the
 * self-extensible slot mechanism: no DSH change, the slot is claimed here.
 * @module @rheplicant/dsh-rheplicant-ui-console/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ConsoleView } from './ConsoleView.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'console.panel': { kind: 'list'; scope: 'session' }
  }
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'console',
    order: 5,
    label: () => 'Console',
    children: {
      'console.panel': { kind: 'list', scope: 'session' },
    },
  }, ConsoleView))
}
