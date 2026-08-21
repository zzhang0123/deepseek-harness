/**
 * Gate/status chip: the small rounded label rheplicant uses for a check's
 * verdict (refuse/warn/report/skip) or a run's terminal status (ok/failed).
 * `off` is the dimmed no-op state for a disabled check; `auto_skip` is `skip`
 * with a dashed border to mark it as automatic rather than declared.
 */
import { memo, type ReactNode } from 'react'
import styles from './badge.module.css'

export type BadgeState = 'refuse' | 'warn' | 'report' | 'skip' | 'off' | 'auto_skip' | 'ok' | 'failed'

export interface BadgeProps {
  readonly state: BadgeState
  readonly reason?: string
  readonly children?: ReactNode
}

// CSS Modules resolve through an index-signature ambient type (arbitrary
// class names), so `noUncheckedIndexedAccess` types every lookup as possibly
// `undefined` even for a class this file's own .module.css always defines —
// `?? ''` documents "known to exist" without a forbidden `!` assertion.
const STATE_CLASS: Record<BadgeState, string> = {
  refuse: styles.error ?? '',
  failed: styles.error ?? '',
  warn: styles.warn ?? '',
  report: styles.report ?? '',
  ok: styles.ok ?? '',
  skip: styles.skip ?? '',
  auto_skip: `${styles.skip} ${styles.dashed}`,
  off: styles.off ?? '',
}

export const Badge = memo(function Badge({ state, reason, children }: BadgeProps) {
  return (
    <span
      className={`${styles.badge} ${STATE_CLASS[state]}`}
      data-badge-state={state}
      data-badge-reason={reason}
      title={reason}
    >
      {children ?? state}
    </span>
  )
})
