/** The task-panel shell: restrained, instrument-like chrome shared by every `task.panel` occupant. */
import { memo, type ReactNode } from 'react'
import styles from './panel.module.css'

export type PanelStatus = 'ok' | 'warn' | 'error' | 'stale' | 'idle'

export interface PanelProps {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly status?: PanelStatus
  /**
   * Span every column of the grid rather than sitting in one.
   *
   * This is `span?: 1 | 2` again, and A3.5's note that a multi-column grid
   * "cannot honour it" was half right: multicol has no "2 of N", but it does
   * have `column-span: all`, which is what a panel that needs the width
   * actually wants. The Reconstruction panel draws two heatmaps side by side
   * for comparison, and 365px does not hold them.
   */
  readonly wide?: boolean
  readonly actions?: ReactNode
  /** Collapsed: header only, body not rendered. Omitted/`false` renders normally — every existing caller is unaffected. */
  readonly collapsed?: boolean
  /** Disclosure toggle callback. Present <=> the collapse affordance renders at all (a caller with nothing to toggle simply omits it). */
  readonly onToggleCollapse?: () => void
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

/**
 * What the dot MEANS, in words.
 *
 * The dot used to carry `data-panel-status` and a colour and nothing else, so
 * it was invisible to a screen reader. `aria-label` closes that half and
 * ONLY that half — a label is not visible, so the mark is still colour-only on
 * a monochrome screen, where the dark palette's ok/warn/idle desaturate to
 * within thirteen grey levels of each other. That is measured and left open
 * rather than claimed shut; the sibling marks that DO survive monochrome
 * (`.definitionMark`, `.exitUsed`, `.staleMark`) survive it by spelling the
 * state as a visible word, and giving six panel headers a word each is a
 * different change from this one.
 */
const STATUS_LABEL: Record<PanelStatus, string> = {
  ok: 'ok',
  warn: 'warning',
  error: 'error',
  stale: 'stale',
  idle: 'idle',
}

/**
 * The disclosure chevron, drawn.
 *
 * It was `▸` / `▾` — TEXT GLYPHS, whose weight, optical size and baseline are
 * whatever font resolved them. That is the defect `docs/project-model.md` §28.8
 * recorded for the sidebar's `◇` / `◈` and `Brand.tsx` records for the `◆` the
 * mark used to be, and §28.8's closing line is "the first fix did not go
 * looking for the others". This is one of the others. Same idiom as
 * `NavIcons.tsx`: a filled path, `0 0 16 16`, `currentColor`, sized by the
 * caller.
 */
const Chevron = memo(function Chevron({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false" fill="currentColor">
      {collapsed
        ? <path d="M6.2 3.4a.9.9 0 0 1 1.28 0l4 4.05a.92.92 0 0 1 0 1.1l-4 4.05a.9.9 0 0 1-1.28-1.27L9.44 8 6.2 4.67a.92.92 0 0 1 0-1.27Z" />
        : <path d="M3.4 6.2a.9.9 0 0 1 1.27 0L8 9.44l3.33-3.24a.9.9 0 0 1 1.27 1.28l-4.05 4a.92.92 0 0 1-1.1 0l-4.05-4a.9.9 0 0 1 0-1.28Z" />}
    </svg>
  )
})

export const Panel = memo(function Panel({ id, title, subtitle, status, wide, actions, collapsed, onToggleCollapse, children }: PanelProps) {
  const isCollapsed = collapsed === true
  const hasActionsRow = actions !== undefined || onToggleCollapse !== undefined
  return (
    <section
      data-panel={id}
      data-panel-collapsed={isCollapsed ? 'true' : undefined}
      data-panel-wide={wide === true ? 'true' : undefined}
      className={styles.panel}
    >
      <header className={styles.header} data-panel-header>
        <div className={styles.heading} data-panel-heading>
          {status !== undefined ? (
            <span
              className={`${styles.dot} ${STATUS_DOT[status]}`}
              data-panel-status={status}
              role="img"
              aria-label={STATUS_LABEL[status]}
            />
          ) : null}
          <span className={styles.title} data-panel-title>{title}</span>
          {subtitle !== undefined ? <span className={styles.subtitle} data-panel-subtitle>{subtitle}</span> : null}
        </div>
        {hasActionsRow ? (
          <div className={styles.actions} data-panel-actions>
            {actions}
            {onToggleCollapse !== undefined ? (
              <button
                type="button"
                className={styles.collapseToggle}
                data-panel-collapse-toggle
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
                onClick={onToggleCollapse}
              >
                <Chevron collapsed={isCollapsed} />
              </button>
            ) : null}
          </div>
        ) : null}
      </header>
      {!isCollapsed ? (
        <div className={styles.body} data-panel-body>
          {children}
        </div>
      ) : null}
    </section>
  )
})
