/**
 * Signal-path console panel: the second `console.panel` occupant this
 * package registers (mirrors ui-posterior's two-registrations-one-plugin
 * pattern). Reads the loop projection's latest run graph — never re-runs
 * compute — and renders the SAME `SignalPath` component the
 * `rheplicant-analysis` Chat node uses, plus a legend row naming the four
 * graph node kinds by their token colors.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client/SignalPathPanel
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { EmptyState, Panel, type PanelStatus, TOKEN } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { SignalPath } from './SignalPath.tsx'

interface SignalPathPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

const LEGEND: readonly { readonly kind: string; readonly label: string; readonly color: string }[] = [
  { kind: 'source', label: 'source', color: TOKEN.nodeSource },
  { kind: 'transform', label: 'transform', color: TOKEN.nodeTransform },
  { kind: 'processing', label: 'processing', color: TOKEN.nodeProcessing },
  { kind: 'wire', label: 'wire', color: TOKEN.wire },
]

/** Legend row of node-kind chips, colored from the SAME tokens the signal-path diagram itself uses. */
const Legend = memo(function Legend() {
  return (
    <div data-signal-path-legend>
      {LEGEND.map(entry => (
        <span key={entry.kind} data-legend-node={entry.kind}>
          <span data-legend-swatch style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  )
})

export const SignalPathPanel = memo(function SignalPathPanel({ useSession }: SignalPathPanelProps) {
  const graph = useSession(snapshot => snapshot.views.get('rheplicant-loop')?.run?.outcome.graph)
  const status: PanelStatus = graph === undefined ? 'idle' : 'ok'

  return (
    <Panel id="signal-path" title="Signal path" status={status} span={2}>
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
