/** One labelled stat inside a Panel body: label left, mono value right, optional verdict dot. */
import { memo, type ReactNode } from 'react'
import styles from './panel.module.css'

export type StatVerdict = 'ok' | 'warn' | 'error' | 'stale'

export interface StatRowProps {
  readonly label: string
  readonly value: ReactNode
  readonly verdict?: StatVerdict
  readonly statKey: string
}

// See Badge.tsx: `noUncheckedIndexedAccess` types every CSS Module lookup as
// possibly `undefined`; `?? ''` documents "known to exist" without `!`.
const VERDICT_DOT: Record<StatVerdict, string> = {
  ok: styles.dotOk ?? '',
  warn: styles.dotWarn ?? '',
  error: styles.dotError ?? '',
  stale: styles.dotStale ?? '',
}

export const StatRow = memo(function StatRow({ label, value, verdict, statKey }: StatRowProps) {
  return (
    <div className={styles.statRow} data-stat={statKey}>
      <span className={styles.statLabel} data-stat-label>{label}</span>
      <span className={styles.statValue} data-stat-value>
        {verdict !== undefined ? (
          <span className={`${styles.dot} ${styles.statDot} ${VERDICT_DOT[verdict]}`} data-stat-verdict={verdict} />
        ) : null}
        {value}
      </span>
    </div>
  )
})
