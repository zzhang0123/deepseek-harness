import type {
  HeroBrandMarkOwnerProps, HeroHeadlineOwnerProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { BrandKey } from './locales.ts'

type RheplicantBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/** Render the rheplicant mark (a plain diamond glyph). */
export function RheplicantBrandMark({ size, className }: RheplicantBrandMarkProps) {
  return <span className={className} style={{ fontSize: size }}>◆</span>
}

/** Render the rheplicant name wordmark. */
export function RheplicantBrandName() {
  return <span>rheplicant</span>
}

/** What the headline occupant receives: the host's class plus our own `t`. */
type RheplicantHeroHeadlineProps = HeroHeadlineOwnerProps & {
  t: (key: BrandKey) => string
}

/**
 * Render the blank-session headline.
 *
 * **One span, where the shipped fallback renders two.** The second is the
 * `Preview` badge, and it is not omitted for tidiness: it states DSH's own
 * maturity, on a screen that belongs to a different product. A distribution
 * that inherits someone else's release stage and prints it as its own is
 * saying something nobody checked.
 *
 * `className` is the host's — it carries the headline's type scale and its
 * column in the hero grid, both of which belong to a layout this package does
 * not own and should not restate.
 */
export function RheplicantHeroHeadline({ className, t }: RheplicantHeroHeadlineProps) {
  return <span className={className}>{t('hero.headline')}</span>
}
