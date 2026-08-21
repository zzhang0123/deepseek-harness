/** The console panel shell: restrained, instrument-like chrome shared by every `console.panel` occupant. */
import { memo, type ReactNode } from 'react'
import styles from './panel.module.css'

export type PanelStatus = 'ok' | 'warn' | 'error' | 'stale' | 'idle'

export interface PanelProps {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly status?: PanelStatus
  /** Grid-column span within the `console.panel` host grid. Defaults to 1. */
  readonly span?: 1 | 2
  readonly actions?: ReactNode
  readonly children: ReactNode
}

// See Badge.tsx: `noUncheckedIndexedAccess` types every CSS Module lookup as
// possibly `undefined`; `?? ''` documents "known to exist" without `!`.
const STATUS_DOT: Record<PanelStatus, string> = {
  ok: styles.dotOk ?? '',
  warn: styles.dotWarn ?? '',
  error: styles.dotError ?? '',
  stale: styles.dotStale ?? '',
  idle: styles.dotIdle ?? '',
}

export const Panel = memo(function Panel({ id, title, subtitle, status, span, actions, children }: PanelProps) {
  return (
    <section
      data-panel={id}
      className={styles.panel}
      style={span === 2 ? { gridColumn: 'span 2' } : undefined}
    >
      <header className={styles.header} data-panel-header>
        <div className={styles.heading} data-panel-heading>
          {status !== undefined ? (
            <span className={`${styles.dot} ${STATUS_DOT[status]}`} data-panel-status={status} />
          ) : null}
          <span className={styles.title} data-panel-title>{title}</span>
          {subtitle !== undefined ? <span className={styles.subtitle} data-panel-subtitle>{subtitle}</span> : null}
        </div>
        {actions !== undefined ? <div className={styles.actions} data-panel-actions>{actions}</div> : null}
      </header>
      <div className={styles.body} data-panel-body>
        {children}
      </div>
    </section>
  )
})
