/** Identifiability panel: rank/nullity and the singular-value spectrum as a log-height bar chart. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  EmptyState,
  Panel,
  type PanelStatus,
  StatRow,
  TOKEN,
  formatDiagnostic,
  selectAnalysisRuns,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

interface IdentifiabilityPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

const BAR_WIDTH = 10
const BAR_GAP = 3
const MAX_BAR_HEIGHT = 64

/**
 * Narrow an untyped diagnostics field down to a numeric array, or `undefined`
 * if it isn't one. `null` entries are legal — the wire spells a non-finite
 * singular value as JSON null — and must not disqualify the whole array.
 */
function asNumberArray(value: unknown): readonly (number | null)[] | undefined {
  // An empty array means "no singular values" — treated the same as an
  // absent field, so the bar chart never computes a negative SVG width.
  if (!Array.isArray(value) || value.length === 0) return undefined
  return value.every((entry): entry is number | null => typeof entry === 'number' || entry === null)
    ? value
    : undefined
}

/** The `singular_values` diagnostic for one run, or `undefined` when the run doesn't carry one. */
function runSingularValues(run: AnalysisRun): readonly (number | null)[] | undefined {
  return asNumberArray(run.diagnostics?.singular_values)
}

const SingularValues = memo(function SingularValues({ values }: { values: readonly (number | null)[] }) {
  // A null (non-finite) singular value draws as the 1px floor bar — keeping
  // its slot so bar i is always singular value i. The explicit <number> type
  // argument keeps the accumulator `number`: reduce over a union-typed array
  // otherwise locks the accumulator to `number | null`.
  const maxLog = values.reduce<number>((m, value) => Math.max(m, Math.log1p(value ?? 0)), 0) || 1
  const width = values.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP
  return (
    <svg width={width} height={MAX_BAR_HEIGHT} role="img" aria-label="Singular values" data-singular-values>
      {values.map((value, i) => {
        const height = Math.max(1, (Math.log1p(value ?? 0) / maxLog) * MAX_BAR_HEIGHT)
        return (
          <rect key={i} x={i * (BAR_WIDTH + BAR_GAP)} y={MAX_BAR_HEIGHT - height} width={BAR_WIDTH} height={height} fill={TOKEN.lit} data-singular-value />
        )
      })}
    </svg>
  )
})

export const IdentifiabilityPanel = memo(function IdentifiabilityPanel({ useSession }: IdentifiabilityPanelProps) {
  const runs = useSession(selectAnalysisRuns).filter(run => runSingularValues(run) !== undefined)
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel id="identifiability" title="Identifiability" status={status}>
      {runs.length === 0 ? (
        <EmptyState message="No identifiability runs yet" hint="Ask the agent for a condition run" />
      ) : (
        runs.map(run => {
          const diagnostics = run.diagnostics
          const singularValues = runSingularValues(run)
          if (singularValues === undefined) return null
          return (
            <div key={run.name} data-identifiability-run data-run-name={run.name}>
              <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
              {diagnostics?.rank !== undefined ? (
                <StatRow statKey="rank" label="rank" value={formatDiagnostic('rank', diagnostics.rank)} />
              ) : null}
              {diagnostics?.nullity !== undefined ? (
                <StatRow statKey="nullity" label="nullity" value={formatDiagnostic('nullity', diagnostics.nullity)} />
              ) : null}
              <SingularValues values={singularValues} />
            </div>
          )
        })
      )}
    </Panel>
  )
})
