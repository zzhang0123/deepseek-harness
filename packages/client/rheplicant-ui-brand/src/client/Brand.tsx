import { useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  HeroBrandMarkOwnerProps, HeroHeadlineOwnerProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { BrandKey } from './locales.ts'

type RheplicantBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * The mark's geometry, in one place.
 *
 * A square on its point, inscribed in a 50-unit box — the same path the
 * favicon draws, so the tab and the sidebar are the same shape rather than two
 * drawings that resemble each other. `2.5` of padding on each side keeps the
 * points off the edge at 16px, where a favicon spends most of its life.
 */
const MARK_PATH = 'M25 2.5 L47.5 25 L25 47.5 L2.5 25 Z'

/**
 * Render the rheplicant mark.
 *
 * **An SVG, where this was a `◆` text glyph.** The glyph came from whichever
 * font resolved it, so its weight and its exact proportions were the browser's
 * choice rather than ours, and it could not be the favicon. It also took
 * `color` from the surrounding text, which is why the mark rendered in
 * `label-primary` — the brand had a brand colour and was not using it.
 *
 * `currentColor` keeps the host's `className` in charge, because that class is
 * what carries the hero's hover motion; the colour is set here, in the brand
 * token, and a host that wants to override it still can.
 */
export function RheplicantBrandMark({ size, className }: RheplicantBrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 50 50"
      role="img"
      aria-label="rheplicant"
      style={{ color: 'var(--dsw-alias-brand-primary, currentColor)', display: 'block' }}
    >
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  )
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

/** The product name in the browser tab, and the only place it is written. */
export const PRODUCT_TITLE = 'rheplicant'

/**
 * Compose the browser title the way dsh composes it.
 *
 * Same shape as `DocumentTitle`'s — `<session> — <product>`, em dash — because
 * this REPLACES that string rather than competing with it, and a tab that
 * changed punctuation as well as product name would look like two apps.
 *
 * @param session - the current session's durable title, absent when none is.
 * @returns the full document title.
 */
export function browserTitle(session: string | undefined): string {
  return session === undefined ? PRODUCT_TITLE : `${session} — ${PRODUCT_TITLE}`
}

/**
 * Own the browser tab title.
 *
 * **Why this is a plugin and not a build flag.** `DSH_CLIENT_TITLE` is baked
 * at build time, and `--profile official` pins it to "DeepSeek Harness" and
 * refuses any other value; `scripts/release/pack.ts`'s `DshFamily
 * .verifyBuildArtifacts` then refuses to pack the dsh family from a build that
 * used any other profile. That gate is right — a tarball published as
 * `@deepseek-ai/dsh-*` should be DeepSeek's build — and this route agrees with
 * it rather than relaxing it: the artifacts ARE their build, and a plugin says
 * the last word at runtime.
 *
 * **Why it works, structurally rather than by luck.** `ui-renderer`'s
 * `app.tsx` renders `<SessionDocumentTitle />` as a SIBLING BEFORE
 * `renderSlot('root', {})`, and React runs sibling effects in tree order — so
 * every plugin, living inside that slot's subtree, has its effects run after
 * dsh's. Both effects land in the same commit, before paint, so there is no
 * flash of the other name. The selector below is character-for-character the
 * one `app.tsx` uses, which is what guarantees the two re-render on the same
 * store change rather than on merely similar ones.
 *
 * The seat is `sidebar.brand.mark` because it is the one seat this package
 * owns that is mounted in BOTH sidebar states — `SidebarRoot` renders it in
 * the wide branch and again in the collapsed rail, where `sidebar.brand.name`
 * exists only in the wide one.
 */
export function RheplicantDocumentTitle({ useSessions }: Pick<SidebarBrandProps, 'useSessions'>) {
  const session = useSessions((state) => {
    const id = state.current
    return id === undefined ? undefined : state.byId[id]?.title
  })
  useEffect(() => { document.title = browserTitle(session) })
  return null
}

/**
 * What the sidebar's brand seat receives — derived from the slot rather than
 * restated, so `useSessions` arrives with the shape the runtime actually
 * supplies and a change upstream is a type error here rather than a surprise.
 */
type SidebarBrandProps = PropsRuntime<'sidebar.brand.mark'>

/**
 * The sidebar's brand occupant: the mark, plus the tab title.
 *
 * The title rides HERE rather than in its own plugin, and rather than in the
 * hero's copy of the mark, for one reason each. Its own plugin would be a
 * whole composition row, a module-table entry and a mirror for one `useEffect`
 * — the tab title is brand, and this is the brand package. The hero's mark
 * mounts only on a blank session, so a title hung there would hand the tab
 * back to dsh the moment a conversation opened.
 */
export function RheplicantSidebarBrand(props: SidebarBrandProps) {
  return (
    <>
      <RheplicantDocumentTitle useSessions={props.useSessions} />
      {/* The sidebar seat supplies only `size`; `className` is the hero's. */}
      <RheplicantBrandMark size={props.size} />
    </>
  )
}
