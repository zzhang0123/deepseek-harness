/** Muted placeholder for a Panel body with nothing to show. */
import { memo } from 'react'
import styles from './empty-state.module.css'

/**
 * WHICH absence this is. Three, not two, and the third is the point.
 *
 * `docs/project-model.md` §27.3 is the discipline: the trigger surface holds
 * `absent` / `ok` / `unreadable` at three separate seams, and the whole section
 * is about what collapsing them would say — *"a corrupt file reads as 'this
 * project has no schedules'"*. This component collapsed all three into one
 * rendering.
 *
 * Measured 2026-08-27 across its call sites: it rendered *"No spectrum runs
 * yet"* — a fact about the project that will not change on its own — and
 * *"Reading the exits…"* — a fetch in flight — and *"This project would not
 * serve that document"* — a refusal — identically. Something DID produce the
 * bytes behind that third one; calling it "not yet" is a surface asserting a
 * fact nobody measured, which is §28.7's defect.
 */
export type EmptyStateKind =
  /** Nothing has produced this yet. It stays this way until someone runs something. */
  | 'waiting'
  /** A fetch is in flight. It will change on its own, in a moment. */
  | 'arriving'
  /** It exists, or existed, and could not be had: refused, unreadable, pruned, or past a bound. */
  | 'unavailable'

export interface EmptyStateProps {
  /**
   * No default, on purpose. A default lets a caller silently claim one of the
   * three, and "silently claiming" is the failure this prop exists to end.
   */
  readonly kind: EmptyStateKind
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

export const EmptyState = memo(function EmptyState({ kind, message, hint }: EmptyStateProps) {
  return (
    <div className={styles.emptyState} data-empty-state data-empty-state-kind={kind}>
      <p className={styles.message} data-empty-state-message>{message}</p>
      {hint !== undefined ? <p className={styles.hint} data-empty-state-hint>{hint}</p> : null}
    </div>
  )
})
