/**
 * Gates panel: one card per priced check from the loop's latest
 * `rheplicant/gates` report (linearity/identifiability/prior_sensitivity —
 * mode, effective state, where to edit it, whether it records, and a
 * verbatim reason for a skip/auto_skip), the run's post-flight gate findings
 * (`RunOutcome.gates`), and the two always-on informational checks — C16
 * (ADC saturation) and C18 (the two-sigma cross-check) — that are never
 * gated by `inference.checks` at all (docs/rheplicant-philosophy.md §2.4/§7,
 * python/rheplicant_compute/server.py's `_GATE_CHECKS` comment, and the
 * e-RHINO source docstrings for `config/postflight/digitising.py` (C16) and
 * `config/postflight/noise.py` / `config/gating.py` (C18)). Reads only the
 * `rheplicant-loop` conversation-view projection — never re-runs compute.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/GatesPanel
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CheckCost, GateFinding } from '@rheplicant/dsh-rheplicant'
import { Badge, EmptyState, Panel, type PanelStatus, StatRow, formatDiagnostic } from '@rheplicant/dsh-rheplicant-ui-kit/client'

interface GatesPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

const CHECK_LABEL: Record<CheckCost['check'], string> = {
  linearity: 'Linearity',
  identifiability: 'Identifiability',
  prior_sensitivity: 'Prior sensitivity',
}

/** Prefer `state` (the effective, defaults-applied value) over `mode` — see `CheckCost`'s own doc comment. */
function effectiveState(check: CheckCost): NonNullable<CheckCost['state']> {
  return check.state ?? check.mode
}

function isSkipLike(state: string): boolean {
  return state === 'skip' || state === 'auto_skip'
}

const CheckCard = memo(function CheckCard({ check }: { check: CheckCost }) {
  const state = effectiveState(check)
  const hasReason = isSkipLike(state) && typeof check.reason === 'string'
  return (
    <div data-gate-check data-check={check.check} data-check-state={state}>
      <div>
        <strong>{CHECK_LABEL[check.check]}</strong>
        {check.id !== undefined ? <span data-check-id> ({check.id})</span> : null}
        {' '}
        {/* `exactOptionalPropertyTypes` forbids passing `reason={undefined}` explicitly
          * (BadgeProps declares `reason?: string`, not `string | undefined`) — spread the
          * prop in only when there is an actual string, matching the codebase's own
          * `?? {}` convention for optional-field passthrough. */}
        <Badge state={state} {...(typeof check.reason === 'string' ? { reason: check.reason } : {})} />
      </div>
      {check.where !== undefined ? (
        <div data-check-where>
          <code>{check.where}</code>
        </div>
      ) : null}
      <div data-check-record>{check.record === true ? 'numbers recorded' : 'not recorded'}</div>
      {hasReason ? <blockquote data-gate-reason>{check.reason}</blockquote> : null}
      {check.rtol !== null && check.rtol !== undefined ? (
        <StatRow statKey={`rtol-${check.check}`} label="rtol" value={formatDiagnostic('rtol', check.rtol)} />
      ) : null}
    </div>
  )
})

const FindingRow = memo(function FindingRow({ finding }: { finding: GateFinding }) {
  return (
    <div data-gate-finding data-check={finding.check} data-severity={finding.severity}>
      <strong>{finding.check}</strong> <Badge state={finding.severity} />
      <div data-finding-where>
        <code>{finding.where}</code>
      </div>
      <div data-finding-message>{finding.message}</div>
    </div>
  )
})

/**
 * The two informational checks that run unconditionally and are never routed
 * through `inference.checks`' refuse/warn/report/skip gating — quoted
 * faithfully from the compute service and the e-RHINO check modules, not
 * invented wording.
 */
const ALWAYS_ON_CHECKS: readonly { readonly id: string; readonly note: string }[] = [
  {
    id: 'C16',
    note:
      'ADC saturation — what the digitiser clipped, and what that costs a fit. '
      + 'Ungated: adc_saturation is not one of the three inference.checks names, '
      + 'so this check always runs and is never subject to refuse/warn/report/skip.',
  },
  {
    id: 'C18',
    note:
      'The two-sigma cross-check — does the twin’s own drawn sigma agree with '
      + 'the likelihood’s own weighed sigma? Belongs to no gate: like C16, it '
      + 'is not one of the three inference.checks names.',
  },
]

const AlwaysOnRow = memo(function AlwaysOnRow({ id, note }: { id: string; note: string }) {
  return (
    <div data-always-on-check={id}>
      <strong>{id}</strong> <span data-always-on-note>{note}</span>
    </div>
  )
})

export const GatesPanel = memo(function GatesPanel({ useSession }: GatesPanelProps) {
  const gates = useSession(snapshot => snapshot.views.get('rheplicant-loop')?.gates)
  const findings = useSession(snapshot => snapshot.views.get('rheplicant-loop')?.run?.outcome.gates)
  const checks = gates?.report.checks ?? []
  const hasEvidence = gates !== undefined || (findings !== undefined && findings.length > 0)
  const anyRefuse = checks.some(check => effectiveState(check) === 'refuse') || (findings ?? []).some(f => f.severity === 'refuse')
  const anyWarnLike = checks.some(check => effectiveState(check) === 'warn' || isSkipLike(effectiveState(check)))
    || (findings ?? []).some(f => f.severity === 'warn')
  const status: PanelStatus = !hasEvidence ? 'idle' : anyRefuse ? 'error' : anyWarnLike ? 'warn' : 'ok'

  return (
    <Panel id="gates" title="Gates" status={status}>
      {!hasEvidence ? (
        <EmptyState message="No gates evidence yet" hint="Ask the agent for a rheplicant_gates or rheplicant_run call" />
      ) : (
        <>
          {checks.length > 0 ? (
            <div data-gate-checks>
              {checks.map(check => <CheckCard key={check.check} check={check} />)}
            </div>
          ) : null}
          {findings !== undefined && findings.length > 0 ? (
            <div data-gate-findings>
              {findings.map((finding, index) => <FindingRow key={index} finding={finding} />)}
            </div>
          ) : null}
          <div data-always-on-checks>
            {ALWAYS_ON_CHECKS.map(entry => <AlwaysOnRow key={entry.id} id={entry.id} note={entry.note} />)}
          </div>
        </>
      )}
    </Panel>
  )
})
