/**
 * The three primary-navigation icons, in dsh's own icon idiom.
 *
 * **They replace `◇` and `◈`, which were text glyphs.** A glyph comes from
 * whichever font resolves it, so its weight, its optical size and its baseline
 * were the browser's choice rather than ours — beside `IconNewChatOutline16`
 * one row up, which is a 16-unit filled path at a size the sidebar chooses.
 * The stack read as one designed control and two afterthoughts, which is what
 * a user report called it. This is the same fix `Brand.tsx` records for the
 * `◆` the mark used to be, in a second place.
 *
 * Filled paths on a `0 0 16 16` viewBox, `currentColor`, sized by the caller —
 * every one of those is copied from `ui-primitives`' icons rather than chosen
 * here, so the two rows and the button above them share a drawing convention
 * rather than merely a colour.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/NavIcons
 */

import { memo } from 'react'

/** What the sidebar's own icons take. */
interface NavIconProps {
  readonly size: number
}

/**
 * Dashboard: four tiles.
 *
 * The surface IS a grid of projects, so the icon is the layout rather than a
 * metaphor for it — and four equal tiles say "all of them", which is the one
 * thing that distinguishes this destination from the workbench beside it.
 */
export const IconDashboard = memo(function IconDashboard({ size }: NavIconProps) {
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
      <rect x="1.5" y="1.5" width="5.6" height="5.6" rx="1.4" fill="currentColor" />
      <rect x="8.9" y="1.5" width="5.6" height="5.6" rx="1.4" fill="currentColor" />
      <rect x="1.5" y="8.9" width="5.6" height="5.6" rx="1.4" fill="currentColor" />
      <rect x="8.9" y="8.9" width="5.6" height="5.6" rx="1.4" fill="currentColor" />
    </svg>
  )
})

/**
 * Workbench: one panelled surface.
 *
 * A frame with its header bar — ONE project's surface, where the dashboard is
 * every project's. Deliberately not a second grid: at the 14px the sidebar
 * renders these, two grids differing only in cell count are the same icon.
 */
export const IconWorkbench = memo(function IconWorkbench({ size }: NavIconProps) {
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
      {/* The frame, as a RING rather than a stroke: a stroked icon reads
          lighter than the filled ones beside it at this size, and the whole
          point is that the three match. */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 1.5h10A1.5 1.5 0 0114.5 3v10a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 13V3A1.5 1.5 0 013 1.5zm0 1.35a.15.15 0 00-.15.15v10c0 .083.067.15.15.15h10a.15.15 0 00.15-.15V3a.15.15 0 00-.15-.15H3z"
        fill="currentColor"
      />
      {/* The header bar, which is what makes it a panel rather than a box. */}
      <rect x="2.85" y="4.9" width="10.3" height="1.3" fill="currentColor" />
    </svg>
  )
})

/**
 * Schedules: a clock.
 *
 * The one place in this set where the obvious metaphor is the right one. The
 * two icons above draw their SURFACE — a grid of projects, one panelled
 * project — because both surfaces are layouts and drawing a layout says which
 * one. This surface's subject is not a layout, it is TIME, and there is no
 * arrangement of tiles that says "when". A clock is not a metaphor for a
 * schedule; it is the instrument the schedule is written in.
 *
 * A ring rather than a stroked circle, and the hands as rounded bars, so it
 * carries the same weight as the filled paths beside it at 14px — the rule
 * `IconWorkbench` records, applied again.
 */
export const IconSchedules = memo(function IconSchedules({ size }: NavIconProps) {
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
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 1.35a5.15 5.15 0 110 10.3 5.15 5.15 0 010-10.3z"
        fill="currentColor"
      />
      {/* Reading three o'clock: two hands at a right angle are legible at 14px
          where a near-vertical pair collapses into one bar. */}
      <rect x="7.35" y="4.2" width="1.3" height="4.45" rx="0.65" fill="currentColor" />
      <rect x="7.35" y="7.35" width="3.95" height="1.3" rx="0.65" fill="currentColor" />
    </svg>
  )
})
