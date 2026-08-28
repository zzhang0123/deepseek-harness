/**
 * The two marks this section draws.
 *
 * Filled paths on a `0 0 16 16` viewBox in `currentColor`, sized by the caller
 * — copied from the sidebar's own icon convention rather than chosen here, so
 * this row does not read as an afterthought beside `IconDashboard` and
 * `IconWorkbench`. `ui-project`'s `NavIcons.tsx` records why these are paths
 * and not text glyphs: a glyph's weight, optical size and baseline come from
 * whichever font resolves it, which made the stack read as one designed
 * control and two strangers.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/DocsIcons
 */

import { memo } from 'react'

/** What the sidebar's own icons take. */
interface IconProps {
  readonly size: number
}

/**
 * Documentation: a page with lines on it.
 *
 * Deliberately not a book or a question mark. A book says "manual", which
 * suggests something separate from the instrument; a question mark says
 * "help", which suggests you are in trouble. This is a page of the same kind
 * the other rows lead to.
 */
export const IconDocs = memo(function IconDocs({ size }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block', flex: 'none' }}
    >
      <path
        d="M3.4 1.5h6.1l3 3v10a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z"
        fill="currentColor"
        opacity="0.35"
      />
      <rect x="4.6" y="6.1" width="6.8" height="1.3" rx="0.65" fill="currentColor" />
      <rect x="4.6" y="8.7" width="6.8" height="1.3" rx="0.65" fill="currentColor" />
      <rect x="4.6" y="11.3" width="4.2" height="1.3" rx="0.65" fill="currentColor" />
    </svg>
  )
})

/**
 * The switch mark: the antenna / cal-load diamond, in outline.
 *
 * The same figure the brand uses, so the documentation is visibly part of the
 * instrument rather than a generic help surface bolted beside it. Outline
 * rather than filled, because the brand's is filled and two identical marks at
 * two sizes would read as one of them being wrong.
 */
export const IconSwitch = memo(function IconSwitch({ size }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block', flex: 'none' }}
    >
      <path d="M8 2.2 13.8 8 8 13.8 2.2 8Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" />
    </svg>
  )
})
