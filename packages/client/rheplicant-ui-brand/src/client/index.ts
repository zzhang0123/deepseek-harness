/** Rheplicant occupants for the generic browser-brand slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { RheplicantBrandMark, RheplicantBrandName, RheplicantHeroHeadline } from './Brand.tsx'
import { NS, en, zh } from './locales.ts'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand: dictionaries')
  // The three marks, in one chain because they have always shipped together.
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, RheplicantBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, RheplicantBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, RheplicantBrandMark)
      })))
  // The headline is a SEPARATE chain, and that is the whole point of this
  // comment. `inject` WAITS for a slot to be declared, so a chain is only as
  // available as its least available link — and this link is the newest thing
  // in the composition, declared by a `ui-conversation` that a stale bundle or
  // an older harness may not have. Nested with the three above, its absence
  // took all four registrations down: no headline, and no brand mark anywhere
  // either, silently, because waiting for a slot that never arrives is a legal
  // state rather than an error. Measured 2026-08-26 against a cached bundle.
  //
  // `locale: NS` is what makes the renderer synthesize a `t` bound to OUR
  // namespace; without it the occupant has no route to the strings, since a
  // component cannot reach the plugin context.
  ctx.slots.inject('conversation.hero.headline', () => ctx.slots.register(
    { name: 'conversation.hero.headline', locale: NS },
    RheplicantHeroHeadline,
  ))
}
