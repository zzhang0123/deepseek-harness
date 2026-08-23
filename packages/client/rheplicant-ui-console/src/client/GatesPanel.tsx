/**
 * Gates panel: one card per priced check from the loop's latest
 * `rheplicant/gates` report (linearity/identifiability/prior_sensitivity —
 * mode, effective state, where to edit it, whether it records, and a
 * verbatim reason for a skip/auto_skip), the run's post-flight gate findings
 * (`RunOutcome.gates`), and the two always-on informational checks — C16
 * (ADC saturation) and C18 (the two-sigma cross-check) — that are never
 * gated by `inference.checks` at all (docs/rheplicant-philosophy.md §2.4/§7,
 * python/src/rheplicant_compute/server.py's `_GATE_CHECKS` comment, and the
 * e-RHINO source docstrings for `config/postflight/digitising.py` (C16) and
 * `config/postflight/noise.py` / `config/gating.py` (C18)). Reads only the
 * `rheplicant-loop` conversation-view projection — never re-runs compute.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/GatesPanel
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { CheckCost, GateFinding } from '@rheplicant/dsh-rheplicant'
import {
  Badge, type ConsolePanelLayoutView, EmptyState, Panel, type PanelStatus, StatRow, formatDiagnostic,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'
import styles from './gates-panel.module.css'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'gates'

interface GatesPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Console layout state (owner prop — see ConsoleView's doc comment). Absent when not rendered through the console shell (e.g. a unit test): renders un-collapsed, always visible. */
  layout?: ConsolePanelLayoutView
}

const CHECK_LABEL: Record<CheckCost['check'], string> = {
  linearity: 'Linearity',
  identifiability: 'Identifiability',
  prior_sensitivity: 'Prior sensitivity',
}

/**
 * The effective, defaults-applied state of one check.
 *
 * `state ?? mode` is a BACK-COMPAT read, not a workaround. This selector folds
 * DURABLE EVENTS out of the session log, and an event written before
 * 2026-08-23 carries the effective state under `mode` — the service filled it
 * from `state` back then. Since that date `mode` carries only what the
 * document DECLARED and is absent when it declared nothing, so a live answer
 * has the two meaning different things and only `state` governs.
 *
 * A surface reading a LIVE `gates` answer must therefore read `state` alone;
 * the fallback belongs here, where old events do.
 */
function effectiveState(check: CheckCost): NonNullable<CheckCost['state']> {
  return check.state ?? check.mode ?? 'off'
}

function isSkipLike(state: string): boolean {
  return state === 'skip' || state === 'auto_skip'
}

/**
 * One check's card: title row (name + id + state Badge), the mono `where`
 * path, the record line, then the reason blockquote when present — each
 * card visually delimited (a top rule + its own padding) so three checks
 * read as three cards, not one run-together paragraph block.
 */
const CheckCard = memo(function CheckCard({ check }: { check: CheckCost }) {
  const state = effectiveState(check)
  const hasReason = isSkipLike(state) && typeof check.reason === 'string'
  return (
    <div data-gate-check data-check={check.check} data-check-state={state} className={styles.card}>
      <div className={styles.titleRow}>
        <strong className={styles.checkName}>{CHECK_LABEL[check.check]}</strong>
        {check.id !== undefined ? <span data-check-id className={styles.checkId}>({check.id})</span> : null}
        {/* `exactOptionalPropertyTypes` forbids passing `reason={undefined}` explicitly
          * (BadgeProps declares `reason?: string`, not `string | undefined`) — spread the
          * prop in only when there is an actual string, matching the codebase's own
          * `?? {}` convention for optional-field passthrough. */}
        <Badge state={state} {...(typeof check.reason === 'string' ? { reason: check.reason } : {})} />
      </div>
      {check.where !== undefined ? (
        <div data-check-where>
          <code className={styles.where}>{check.where}</code>
        </div>
      ) : null}
      <div data-check-record className={styles.record}>{check.record === true ? 'numbers recorded' : 'not recorded'}</div>
      {hasReason ? <blockquote data-gate-reason className={styles.reason}>{check.reason}</blockquote> : null}
      {check.rtol !== null && check.rtol !== undefined ? (
        <StatRow statKey={`rtol-${check.check}`} label="rtol" value={formatDiagnostic('rtol', check.rtol)} />
      ) : null}
    </div>
  )
})

const FindingRow = memo(function FindingRow({ finding }: { finding: GateFinding }) {
  return (
    <div data-gate-finding data-check={finding.check} data-severity={finding.severity} className={styles.card}>
      <div className={styles.titleRow}>
        <strong className={styles.checkName}>{finding.check}</strong> <Badge state={finding.severity} />
      </div>
      <div data-finding-where>
        <code className={styles.where}>{finding.where}</code>
      </div>
      <div data-finding-message>{finding.message}</div>
    </div>
  )
})

/**
 * The two informational checks that run unconditionally and are never routed
 * through `inference.checks`' refuse/warn/report/skip gating — quoted
 * faithfully from the compute service and the e-RHINO check modules, not
 * invented wording. `summary` is a one-line paraphrase of `detail` (the
 * original, unmodified wording) so the panel can show a short line by
 * default and put the fuller explanation behind a disclosure.
 */
const ALWAYS_ON_CHECKS: readonly { readonly id: string; readonly summary: string; readonly detail: string }[] = [
  {
    id: 'C16',
    summary: 'ADC saturation — always runs; never gated.',
    detail:
      'ADC saturation — what the digitiser clipped, and what that costs a fit. '
      + 'Ungated: adc_saturation is not one of the three inference.checks names, '
      + 'so this check always runs and is never subject to refuse/warn/report/skip.',
  },
  {
    id: 'C18',
    summary: 'The two-sigma cross-check — always runs; never gated.',
    detail:
      'The two-sigma cross-check — does the twin’s own drawn sigma agree with '
      + 'the likelihood’s own weighed sigma? Belongs to no gate: like C16, it '
      + 'is not one of the three inference.checks names.',
  },
]

/**
 * One always-on row: a compressed one-line summary, with the full original
 * wording behind a `<details data-always-on-details>` disclosure — the same
 * plain-`<details>` idiom `PosteriorPanel`'s corner plot and `PanelsMenu`
 * already use for exactly this shape (a summary line plus more beneath it).
 */
const AlwaysOnRow = memo(function AlwaysOnRow({ id, summary, detail }: { id: string; summary: string; detail: string }) {
  return (
    <div data-always-on-check={id}>
      <strong>{id}</strong> <span data-always-on-summary className={styles.alwaysOnSummary}>{summary}</span>
      <details data-always-on-details className={styles.alwaysOnDetails}>
        <summary>Details</summary>
        <p data-always-on-note className={styles.alwaysOnNote}>{detail}</p>
      </details>
    </div>
  )
})

export const GatesPanel = memo(function GatesPanel({ useSession, layout }: GatesPanelProps) {
  // Hooks run unconditionally (React's rules) — the hidden check happens
  // AFTER, at the return, so a panel toggled hidden/shown never skips a hook
  // call between renders.
  const gates = useSession(snapshot => snapshot.views.get('rheplicant-loop')?.gates)
  const findings = useSession(snapshot => snapshot.views.get('rheplicant-loop')?.run?.outcome.gates)
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const checks = gates?.report.checks ?? []
  const hasEvidence = gates !== undefined || (findings !== undefined && findings.length > 0)
  const anyRefuse = checks.some(check => effectiveState(check) === 'refuse') || (findings ?? []).some(f => f.severity === 'refuse')
  const anyWarnLike = checks.some(check => effectiveState(check) === 'warn' || isSkipLike(effectiveState(check)))
    || (findings ?? []).some(f => f.severity === 'warn')
  const status: PanelStatus = !hasEvidence ? 'idle' : anyRefuse ? 'error' : anyWarnLike ? 'warn' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Gates"
      status={status}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
      {!hasEvidence ? (
        <EmptyState message="No gates evidence yet" hint="Ask the agent for a rheplicant_gates or rheplicant_run call" />
      ) : (
        <>
          {checks.length > 0 ? (
            <div data-gate-checks className={styles.checks}>
              {checks.map(check => <CheckCard key={check.check} check={check} />)}
            </div>
          ) : null}
          {findings !== undefined && findings.length > 0 ? (
            <div data-gate-findings className={styles.findings}>
              {findings.map((finding, index) => <FindingRow key={index} finding={finding} />)}
            </div>
          ) : null}
          <div data-always-on-checks className={styles.alwaysOn}>
            {ALWAYS_ON_CHECKS.map(entry => <AlwaysOnRow key={entry.id} id={entry.id} summary={entry.summary} detail={entry.detail} />)}
          </div>
        </>
      )}
    </Panel>
  )
})
