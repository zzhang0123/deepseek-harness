/** Rheplicant occupants for the generic browser-brand slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  RheplicantBrandMark, RheplicantBrandName, RheplicantHeroHeadline, RheplicantSidebarBrand,
} from './Brand.tsx'
import { NS, en, zh } from './locales.ts'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand: dictionaries')
  // ONE CHAIN PER OWNING PACKAGE. The two sidebar seats are declared together
  // by ui-sidebar, so they may gate each other; nothing else may gate them.
  //
  // They used to hang inside `inject('conversation.hero.brand.mark')`, which
  // made the mark, the wordmark AND the browser tab title conditional on a
  // slot owned by ui-conversation — a package the sidebar has nothing to do
  // with. The header of `tests/brand-chain.client.spec.tsx` states that rule
  // and the fix below is what makes it true; the earlier split took the
  // headline out of this chain and left this coupling in place, which an
  // adversarial review found and the spec had not covered.
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      // The sidebar's seat carries the tab title too — see `Brand.tsx`.
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, RheplicantSidebarBrand)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, RheplicantBrandName)
    }))
  // The hero mark, on its own, for the same reason.
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, RheplicantBrandMark))
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
