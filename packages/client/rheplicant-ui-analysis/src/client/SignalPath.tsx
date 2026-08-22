/**
 * The lit/dim signal-path rendering: rheplicant's own `Assembly.to_svg()` — the
 * canonical graph in full, with the declared operators lit, identity-traversed
 * junctions half-lit, and everything else dim. This is the authoritative answer
 * to "what does my model actually contain", rendered separately from prose.
 * Shared between the `rheplicant-analysis` Chat node (`AnalysisRunPanel.tsx`)
 * and the console's `signal-path` panel (`SignalPathPanel.tsx`) — one
 * component, never duplicated.
 *
 * The embedded markup is first-party, server-rendered output
 * (`Assembly.to_svg(theme="dark")` in the trusted Python compute service —
 * never user- or model-authored text); see `docs/rheplicant-philosophy.md`
 * and `python/rheplicant_compute/server.py`'s `_graph`.
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
