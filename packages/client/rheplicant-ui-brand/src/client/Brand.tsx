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
 * A rhinoceros head whose trailing edge breaks into a mosaic and scatters —
 * the logo's own motif, the animal digitizing into data. Inscribed in a
 * 50-unit box, and the same path the favicon draws, so the tab and the sidebar
 * are the same shape rather than two drawings that resemble each other.
 *
 * **It is TRACED, not drawn** — `scripts/brand/derive-mark.py` reads
 * e-RHINO's `docs/_static/rheplicant-logo.png` and emits exactly this string
 * (variant `b`). The mark has to be the same animal as the logo, because the
 * two sit side by side on the Sphinx docs and this app; a hand-drawn rhino is
 * a different rhino. That script is the provenance and carries the tuning
 * facts; it is not a gate, and it says why not.
 *
 * **Two scattered cells, not five, and the reason is arithmetic rather than
 * taste.** Both seats pass one `size`, so the mark is fitted into a SQUARE
 * box — every unit of width the scatter adds shrinks the head. Measured
 * 2026-08-26: five cells put the mark at aspect 1.68 and the head at 8.5px
 * inside a 16px favicon; two put it at 1.25 and 10.5px. Below about 24px a
 * one-pixel cell stops reading as data and starts reading as dirt.
 *
 * **The diamond this replaced was a placeholder**, put in when the mark first
 * became an SVG and the real logo had not been vectorised yet.
 */
const MARK_PATH = 'M 20.16 12.23 C 19.42 12.62 19.06 13.08 18.75 14.13 C 18.27 15.69 17.5 15.86 15.98 14.73 C 13.91 13.19 13.26 13.63 13.92 16.09 C 14.28 17.4 14.62 17.91 15.69 18.65 C 16.78 19.4 16.9 20.03 16.42 22.47 C 15.91 25.07 15.58 25.91 14.68 26.88 C 13.56 28.07 12.77 28.05 10.85 26.77 C 9.47 25.84 9.25 25.98 9.25 27.78 C 9.25 28.38 9.28 29.15 9.33 29.48 C 9.42 30.25 9.36 30.5 9.04 30.66 C 7.38 31.52 3.95 28.17 2.34 24.13 C 1.96 23.16 1.77 22.88 1.54 22.91 C 1.2 22.96 1.11 23.32 1.08 25.02 C 1 28.94 2.81 33.51 5.71 36.71 C 6.69 37.78 6.75 37.89 6.83 39.06 C 6.91 40.07 6.91 40.08 7.69 41.85 C 8.44 43.56 9.48 44.18 11.19 43.95 C 11.9 43.85 12.09 43.86 12.82 43.99 C 14.26 44.25 14.89 44.09 16.16 43.15 C 16.56 42.85 17.29 42.35 17.78 42.03 C 18.54 41.53 21.34 39.4 23.12 37.97 C 24.21 37.1 24.1 38.28 24.13 26.16 C 24.15 20.32 24.13 15.38 24.1 15.18 C 24.01 14.54 23.76 14.37 22.99 14.44 C 21.94 14.53 21.6 14.26 21.43 13.18 C 21.27 12.17 20.85 11.86 20.16 12.23 Z M 24.15 10.84 L 28.36 10.84 L 28.36 15.05 L 24.15 15.05 Z M 24.15 15.93 L 28.36 15.93 L 28.36 20.14 L 24.15 20.14 Z M 24.15 21.03 L 28.36 21.03 L 28.36 25.24 L 24.15 25.24 Z M 24.15 26.12 L 28.36 26.12 L 28.36 30.33 L 24.15 30.33 Z M 24.15 31.21 L 28.36 31.21 L 28.36 35.42 L 24.15 35.42 Z M 29.24 10.84 L 33.45 10.84 L 33.45 15.05 L 29.24 15.05 Z M 29.24 15.93 L 33.45 15.93 L 33.45 20.14 L 29.24 20.14 Z M 29.24 21.03 L 33.45 21.03 L 33.45 25.24 L 29.24 25.24 Z M 29.24 26.12 L 33.45 26.12 L 33.45 30.33 L 29.24 30.33 Z M 34.33 10.84 L 38.54 10.84 L 38.54 15.05 L 34.33 15.05 Z M 41.46 5.75 L 44.86 5.75 L 44.86 9.14 L 41.46 9.14 Z M 46.56 8.8 L 49 8.8 L 49 11.25 L 46.56 11.25 Z'

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
