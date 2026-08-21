/** Rheplicant occupants for the generic browser-brand slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { RheplicantBrandMark, RheplicantBrandName } from './Brand.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, RheplicantBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, RheplicantBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, RheplicantBrandMark)
      })))
}
