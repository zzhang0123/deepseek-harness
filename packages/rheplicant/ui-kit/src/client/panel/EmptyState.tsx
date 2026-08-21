/** Muted placeholder for a Panel body with nothing to show yet. */
import { memo } from 'react'
import styles from './empty-state.module.css'

export interface EmptyStateProps {
  readonly message: string
  readonly hint?: string
}

export const EmptyState = memo(function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className={styles.emptyState} data-empty-state>
      <p className={styles.message} data-empty-state-message>{message}</p>
      {hint !== undefined ? <p className={styles.hint} data-empty-state-hint>{hint}</p> : null}
    </div>
  )
})
