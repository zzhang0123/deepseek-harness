/**
 * The small icons that sit ON a row or a card, as opposed to the three that
 * name a destination in the sidebar (`NavIcons.tsx`).
 *
 * One of them, for now. It held an `IconSession` too, for a Schedules-card
 * control removed 2026-08-28 — see `Schedules.tsx` for why that control could
 * not be honest. The icon went with it rather than waiting here for a caller.
 *
 * Same drawing convention as those — filled paths on a `0 0 16 16` viewBox in
 * `currentColor`, sized by the caller — because the alternative is a surface
 * where the navigation is drawn and the actions are glyphs, which is the exact
 * mismatch `NavIcons.tsx` records a user report about.
 *
 * A SECOND module rather than more exports on the first, because the two sets
 * answer to different rules: a nav icon is 16/18px and picked to distinguish
 * one destination from another, an action icon is 14px and picked to be
 * recognisable at a glance beside text. Merging them would put one file under
 * two constraints.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/ActionIcons
 */

import { memo } from 'react'

/** Every icon here takes the size its caller decided. */
interface ActionIconProps {
  /** Edge length in px. */
  readonly size: number
}

/**
 * A folder — "show this directory in the file manager".
 *
 * The one metaphor on these surfaces that is not a drawing of the thing
 * itself, and it is the right one for the same reason `IconSchedules` is a
 * clock: the destination is not a layout this app controls, it is the
 * operating system's own idea of a folder, and a folder is what that idea
 * looks like everywhere a person has seen it.
 */
export const IconFolder = memo(function IconFolder({ size }: ActionIconProps) {
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
      {/* The tab and the body as one path, so the notch reads at 14px where a
          separate rectangle would just look like a seam. */}
      <path
        d="M1.75 3.75A1.25 1.25 0 013 2.5h3.09c.33 0 .64.13.88.36l.92.89H13a1.25 1.25 0 011.25 1.25v7.25A1.25 1.25 0 0113 13.5H3a1.25 1.25 0 01-1.25-1.25V3.75z"
        fill="currentColor"
      />
    </svg>
  )
})
