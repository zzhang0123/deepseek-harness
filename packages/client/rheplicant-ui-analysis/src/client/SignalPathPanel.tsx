/**
 * Signal-path panel: the second `task.panel` occupant this
 * package registers (mirrors ui-posterior's two-registrations-one-plugin
 * pattern). Reads the loop projection's latest run graph — never re-runs
 * compute — and renders the SAME `SignalPath` component the
 * `rheplicant-analysis` Chat node uses, plus a legend row naming the four
 * graph node kinds by their token colors. Self-applies the grid layout
 * (owner prop — see ui-console's ConsoleView doc comment), the same way
 * `PosteriorPanel`/`ChainsPanel`/`GatesPanel` do.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client/SignalPathPanel
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: loads the `rheplicant-loop` ConversationViewSnapshotMap merge, so
// `views.get('rheplicant-loop')` narrows. Erased at build, so it never reaches
// the bundle purity gate — unlike the VALUE import of `soleTask` that used to
// sit beside it, which made this package's client bundle refuse to build.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import {
  type ConsoleExecutionView, type PanelLayoutView, EmptyState, Panel,
  type PanelStatus, TOKEN, graphToRender, soleTask,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { SignalPath } from './SignalPath.tsx'
import styles from './signal-path-panel.module.css'

/** This panel's own `task.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'signal-path'

interface SignalPathPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /**
   * The execution being shown (owner prop), so this panel draws the SELECTED
   * execution's model rather than the open conversation's. Absent outside the
   * console shell, where the session log is the only source there is.
   */
  execution?: ConsoleExecutionView
  /** Panel layout state (owner prop — see ui-project's ProjectHome doc comment). Absent when not rendered through a panel grid (e.g. a unit test): renders un-collapsed, always visible. */
  layout?: PanelLayoutView
}

const LEGEND: readonly { readonly kind: string; readonly label: string; readonly color: string }[] = [
  { kind: 'source', label: 'source', color: TOKEN.nodeSource },
  { kind: 'transform', label: 'transform', color: TOKEN.nodeTransform },
  { kind: 'processing', label: 'processing', color: TOKEN.nodeProcessing },
  { kind: 'wire', label: 'wire', color: TOKEN.wire },
]

/**
 * Legend row of node-kind chips, colored from the SAME tokens the signal-path
 * diagram itself uses. `styles.legend` puts a flex gap between chips —
 * without it the chips have no separating whitespace in the DOM and render
 * as one run of concatenated text.
 */
const Legend = memo(function Legend() {
  return (
    <div data-signal-path-legend className={styles.legend}>
      {LEGEND.map(entry => (
        <span key={entry.kind} data-legend-node={entry.kind} className={styles.chip}>
          <span data-legend-swatch className={styles.swatch} style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  )
})

export const SignalPathPanel = memo(function SignalPathPanel({ useSession, layout, execution }: SignalPathPanelProps) {
  // The SELECTED execution's graph, with the session log as the fallback only
  // where nothing has been claimed about an execution. Reading the log alone
  // — which this did until a real end-to-end run exposed it — draws the open
  // conversation's model under a foreign execution's header, and renders
  // nothing at all in the workbench, which has no conversation.
  // The log fallback, and only when the log is UNAMBIGUOUS. A conversation
  // that touched several tasks has several loops, and the log cannot say
  // which one's model this is — a diagram is the most confidently-read thing
  // on the page, so guessing here is the most expensive guess available.
  const fromLog = useSession(
    snapshot => soleTask(snapshot.views.get('rheplicant-loop'))?.run?.outcome.graph,
  )
  const graph = graphToRender(execution, fromLog) as typeof fromLog
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const status: PanelStatus = graph === undefined ? 'idle' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Signal path"
      status={status}
      span={2}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
      {graph === undefined ? (
        <EmptyState message="No signal path yet" hint="Ask the agent to run a document that declares a model:" />
      ) : (
        <>
          <Legend />
          <SignalPath graph={graph} />
        </>
      )}
    </Panel>
  )
})
