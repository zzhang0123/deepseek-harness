/** Identifiability panel: rank/nullity and the singular-value spectrum as a log-height bar chart. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

interface IdentifiabilityPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** One identifiability run's rank/nullity/singular_values diagnostics. */
interface IdentifiabilityRun {
  readonly name: string
  readonly kind: string
  readonly diagnostics?: {
    readonly rank?: number
    readonly nullity?: number
    readonly singular_values?: number[]
  }
}

const BAR_WIDTH = 10
const BAR_GAP = 3
const MAX_BAR_HEIGHT = 64

const SingularValues = memo(function SingularValues({ values }: { values: number[] }) {
  const maxLog = values.reduce((m, value) => Math.max(m, Math.log1p(value)), 0) || 1
  const width = values.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP
  return (
    <svg width={width} height={MAX_BAR_HEIGHT} role="img" aria-label="Singular values" data-singular-values>
      {values.map((value, i) => {
        const height = Math.max(1, (Math.log1p(value) / maxLog) * MAX_BAR_HEIGHT)
        return (
          <rect key={i} x={i * (BAR_WIDTH + BAR_GAP)} y={MAX_BAR_HEIGHT - height} width={BAR_WIDTH} height={height} fill="#F2A93B" data-singular-value />
        )
      })}
    </svg>
  )
})

export const IdentifiabilityPanel = memo(function IdentifiabilityPanel({ useSession }: IdentifiabilityPanelProps) {
  const runs = useSession(snapshot => snapshot.chat.nodes.values()
    .filter(node => node.kind === 'rheplicant-analysis')
    .flatMap(node => (node.data as { runs: readonly IdentifiabilityRun[] }).runs))

  return (
    <section data-identifiability style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8 }}>
      <h3>Identifiability</h3>
      {runs.map(run => {
        const diagnostics = run.diagnostics
        if (diagnostics === undefined || diagnostics.singular_values === undefined) return null
        return (
          <div key={run.name} data-identifiability-run data-run-name={run.name}>
            <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
            {diagnostics.rank !== undefined ? <div data-identifiability-rank>rank: {diagnostics.rank}</div> : null}
            {diagnostics.nullity !== undefined ? <div data-identifiability-nullity>nullity: {diagnostics.nullity}</div> : null}
            <SingularValues values={diagnostics.singular_values} />
          </div>
        )
      })}
    </section>
  )
})
