/**
 * The lit/dim signal-path rendering: rheplicant's own `Assembly.to_svg()` — the
 * canonical graph in full, with the declared operators lit, identity-traversed
 * junctions half-lit, and everything else dim. This is the authoritative answer
 * to "what does my model actually contain", rendered separately from prose.
 * **It used to be shared with a `signal-path` workbench panel**, and
 * `docs/project-model.md` §28.1 removed that seat: the workbench's Model
 * section already drew the same graph, so one page carried the picture twice.
 * This component now has ONE caller — the `rheplicant-analysis` chat node
 * (`AnalysisRunPanel.tsx`) — and that is not a leftover copy of the workbench's
 * diagram but a different scope: the node answers "what did THIS conversation
 * just run", the section answers "what does this task's model contain", and
 * §28.3 keeps the same pair apart for the gates.
 *
 * One consequence worth stating where somebody will hit it: this draws the SVG
 * the run stored, which `server.py`'s `_graph` renders `theme="dark"`. The
 * Model section projects instead, and gets `to_svg`'s `"light"` default. The
 * two are no longer side by side, so the mismatch no longer shows on one
 * screen — but it is not fixed, and a scheme-aware diagram is still owed.
 *
 * The embedded markup is first-party, server-rendered output
 * (`Assembly.to_svg(theme="dark")` in the trusted Python compute service —
 * never user- or model-authored text); see `docs/rheplicant-philosophy.md`
 * and `python/src/rheplicant_compute/server.py`'s `_graph`.
 */
import { memo } from 'react'
import type { SignalPathGraph } from '@rheplicant/dsh-rheplicant'

export const SignalPath = memo(function SignalPath({ graph }: { graph: SignalPathGraph }) {
  return (
    <figure data-signal-path>
      {graph.svg !== undefined ? (
        <div
          data-signal-path-svg
          style={{ maxHeight: '26rem', overflow: 'auto', background: 'var(--dsw-alias-bg-base)', borderRadius: 8 }}
          dangerouslySetInnerHTML={{ __html: graph.svg }}
        />
      ) : null}
      <figcaption data-signal-path-lit>
        lit: {graph.lit.length > 0 ? graph.lit.join(', ') : '(none)'}
        {' · '}
        identity: {graph.skipped.length > 0 ? graph.skipped.join(', ') : '(none)'}
      </figcaption>
    </figure>
  )
})
