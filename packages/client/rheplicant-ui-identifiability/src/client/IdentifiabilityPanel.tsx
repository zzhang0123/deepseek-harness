/**
 * Identifiability panel: rank/nullity and the singular-value spectrum as a
 * log-height bar chart. Self-applies the grid layout (owner prop — see
 * ui-loop's ConsoleView doc comment), the same way
 * `PosteriorPanel`/`ChainsPanel`/`GatesPanel`/`SignalPathPanel` do.
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  BarChart,
  type PanelLayoutView,
  EmptyState,
  Panel,
  RunHeading,
  type PanelStatus,
  StatRow,
  formatDiagnostic,
  selectAnalysisRuns,
  runsToRender,
  executionEmptyReason,
  executionEmptyKind,
  type LoopExecutionView,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'identifiability'

interface IdentifiabilityPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Panel layout state (owner prop — see ui-project's ProjectHome doc comment). Absent when not rendered through a panel grid (e.g. a unit test): renders un-collapsed, always visible. */
  layout?: PanelLayoutView
  /** The execution the console is showing (owner prop). Absent outside the console shell. */
  execution?: LoopExecutionView
}

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

/**
 * Narrow the untyped `weakest_identified` diagnostic to `number | null`.
 *
 * Checked against the source of truth,
 * `rheplicant.inference.identifiability.IdentifiabilityReport.weakest_identified`
 * (installed package, `inference/identifiability.py:308`): it is a computed
 * `@property` returning `float(singular_values[rank - 1] / singular_values[0])`
 * — the ratio between the worst- and best-identified directions, `0.0` when
 * nothing is identified. It is NOT a latent name and NOT an index into
 * `singular_values`, despite the generic `unknown` this field carries on the
 * wire type (`RunDiagnostics.weakest_identified`, `packages/rheplicant/
 * rheplicant/src/types.ts`). `server.py`'s `_wire_safe` spells a non-finite
 * float as JSON `null`, same convention as every other diagnostic here, so
 * this narrows to `number | null` — never a string, never used as
 * `BarChart`'s `highlightIndex`.
 */
function asWeakestIdentified(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return typeof value === 'number' ? value : undefined
}

export const IdentifiabilityPanel = memo(function IdentifiabilityPanel({ useSession, layout, execution }: IdentifiabilityPanelProps) {
  // Prefer the execution the console selected, read off its published
  // tree; fall back to this session's log when there is none (outside
  // the console shell, or an older harness with no project route).
  const runs = runsToRender(execution, useSession(selectAnalysisRuns)).filter(run => runSingularValues(run) !== undefined)
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Identifiability"
      status={status}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
      {runs.length === 0 ? (
        <EmptyState
          kind={executionEmptyKind(execution)}
          message={executionEmptyReason(execution) ?? 'No identifiability runs yet'}
          hint={executionEmptyReason(execution) === undefined ? 'Ask the agent for a condition run' : undefined}
        />
      ) : (
        runs.map(run => {
          const diagnostics = run.diagnostics
          const singularValues = runSingularValues(run)
          if (singularValues === undefined) return null
          const rank = diagnostics?.rank
          const weakestIdentified = asWeakestIdentified(diagnostics?.weakest_identified)
          return (
            <div key={run.name} data-identifiability-run data-run-name={run.name}>
              <RunHeading name={run.name} kind={run.kind} />
              {rank !== undefined ? (
                <StatRow statKey="rank" label="rank" value={formatDiagnostic('rank', rank)} />
              ) : null}
              {diagnostics?.nullity !== undefined ? (
                <StatRow statKey="nullity" label="nullity" value={formatDiagnostic('nullity', diagnostics.nullity)} />
              ) : null}
              {weakestIdentified !== undefined ? (
                <StatRow
                  statKey="weakest_identified"
                  label="weakest identified"
                  value={formatDiagnostic('weakest_identified', weakestIdentified)}
                />
              ) : null}
              <div data-singular-values>
                <BarChart
                  values={singularValues}
                  logY
                  {...typeof rank === 'number' ? { cutoffIndex: rank } : {}}
                />
              </div>
            </div>
          )
        })
      )}
    </Panel>
  )
})
