/**
 * The dependency graph, drawn as it actually is.
 *
 * Split out of `Diagrams.tsx` because it stopped being a three-box picture:
 * `rheplicant` is not a leaf. Its own manifest requires `limTOD[jax]>=1.10`
 * and `bayesmith>=0.4` alongside JAX and Equinox, so the engine has upstreams
 * of its own — and a diagram that showed it depending on nothing was making a
 * claim about the science stack that its `pyproject.toml` contradicts.
 *
 * **The invariant the picture is for survives that.** Every arrow still points
 * the same way and nothing points back: `rheplicant` reaches down into the
 * science stack, `rheplicant-agent` reaches into both `rheplicant` and the
 * harness, and the harness knows about none of it. The gap in the middle row
 * is the load-bearing absence — the engine and the harness have no edge
 * between them in either direction, which is what makes each of them
 * installable without the other.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/RepoDiagram
 */

import type { ReactNode } from 'react'

import { Arrow, Box, INK, MONO } from './Diagrams.tsx'

/** Two upstreams, two peers that share no edge, and the layer that binds them. */
export function RepoDiagram(): ReactNode {
  return (
    <svg
      viewBox="0 0 720 274"
      role="img"
      aria-label="rheplicant depends on limTOD and bayesmith; rheplicant and deepseek-harness have no edge between them; rheplicant-agent depends on both"
    >
      <Arrow id="arrow-repo" color={INK.lit} />

      {/* The science stack rheplicant is built on. */}
      <Box x={24} y={8} w={190} h={54} title="limTOD" sub="TOD simulator · JAX port" />
      <Box x={238} y={8} w={190} h={54} title="bayesmith" sub="Bayesian dispatch layer" />

      {/* The two peers. The gap between them is the point. */}
      <Box
        x={24} y={104} w={404} h={58}
        title="rheplicant" sub="the engine · one differentiable twin · no server"
      />
      <Box
        x={476} y={104} w={220} h={58}
        title="deepseek-harness" sub="the harness · no physics"
      />

      {/* This layer. */}
      <Box
        x={180} y={204} w={360} h={58} accent={INK.lit}
        title="rheplicant-agent" sub="compute service + plugins + distribution"
      />

      {/* rheplicant -> its own upstreams. */}
      <path d="M119 104 L119 68" stroke={INK.line} strokeWidth="1.3" fill="none" markerEnd="url(#arrow-repo)" />
      <path d="M333 104 L333 68" stroke={INK.line} strokeWidth="1.3" fill="none" markerEnd="url(#arrow-repo)" />

      {/* The absence, stated where it happens. */}
      <path d="M428 133 L476 133" stroke={INK.faint} strokeWidth="1.2" strokeDasharray="5 4" fill="none" />
      <text x={452} y={125} textAnchor="middle" fontSize="9.5" fill={INK.faint}>no edge</text>

      {/* rheplicant-agent -> both peers. */}
      <path d="M300 204 L250 168" stroke={INK.lit} strokeWidth="1.4" fill="none" markerEnd="url(#arrow-repo)" />
      <path d="M440 204 L560 168" stroke={INK.lit} strokeWidth="1.4" fill="none" markerEnd="url(#arrow-repo)" />
      <text x={214} y={190} textAnchor="middle" fontSize="10" fill={INK.muted} fontFamily={MONO}>depends on</text>
      <text x={520} y={190} textAnchor="middle" fontSize="10" fill={INK.muted} fontFamily={MONO}>depends on</text>
    </svg>
  )
}
