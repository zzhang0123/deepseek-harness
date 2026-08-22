/** Muted placeholder for a Panel body with nothing to show yet. */
import { memo } from 'react'
import styles from './empty-state.module.css'

export interface EmptyStateProps {
  readonly message: string
  /**
   * `| undefined` explicitly, not just `?`. Under `exactOptionalPropertyTypes`
   * (the checkout's client build) `hint?: string` means "omit the key or pass
   * a string", and every caller here computes a hint that may be absent —
   * `hint={condition ? text : undefined}`. Widening the prop is one change; the
   * alternative was a conditional spread at each of five call sites.
   */
  readonly hint?: string | undefined
}

export const EmptyState = memo(function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className={styles.emptyState} data-empty-state>
      <p className={styles.message} data-empty-state-message>{message}</p>
      {hint !== undefined ? <p className={styles.hint} data-empty-state-hint>{hint}</p> : null}
    </div>
  )
})
