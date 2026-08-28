/**
 * The diagrams, as inline SVG. (`RepoDiagram` lives in its own file: it
 * outgrew a three-box picture once the engine's own upstreams were drawn.)
 *
 * Inline rather than image files for two reasons. They must follow the THEME —
 * every fill and stroke reads a `--dsw-*` custom property, so the same markup
 * is correct on the observatory dark palette and on upstream's light one, which
 * a raster asset cannot be. And they carry text a reader can select and a
 * screen reader can reach, which is the difference between a diagram and a
 * picture of one.
 *
 * Each drawing has its own marker ids (`arrow-<name>`), because SVG defs are
 * document-scoped: two diagrams on one page sharing the id `arrow` would have
 * the second silently take the first's marker. Only one chapter renders at a
 * time in the app, but the test that renders every chapter is exactly where
 * that would surface.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/Diagrams
 */

import type { ReactNode } from 'react'

/** Every colour these drawings use, so a palette change is one edit. */
export const INK = {
  line: 'var(--dsw-alias-border-l2)',
  fill: 'var(--dsw-alias-bg-layer-2)',
  fillDeep: 'var(--dsw-alias-bg-base)',
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary)',
  lit: 'var(--dsw-rh-lit, var(--dsw-alias-brand-primary))',
  source: 'var(--dsw-rh-node-source, var(--dsw-alias-label-secondary))',
  transform: 'var(--dsw-rh-node-transform, var(--dsw-alias-label-secondary))',
  processing: 'var(--dsw-rh-node-processing, var(--dsw-alias-label-secondary))',
} as const

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** An arrowhead definition, scoped to one drawing. */
export function Arrow({ id, color = INK.line }: { readonly id: string; readonly color?: string }): ReactNode {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L8 4 L0 8 z" fill={color} />
      </marker>
    </defs>
  )
}

/** A labelled box. `accent` paints the left edge, marking the load-bearing one. */
export function Box(
  {
    x, y, w, h, title, sub, accent, dashed,
  }: {
    readonly x: number; readonly y: number; readonly w: number; readonly h: number
    readonly title: string; readonly sub?: string
    readonly accent?: string; readonly dashed?: boolean
  },
): ReactNode {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx="6"
        fill={INK.fill} stroke={accent ?? INK.line} strokeWidth="1"
        strokeDasharray={dashed === true ? '4 3' : undefined}
      />
      {accent !== undefined && <rect x={x} y={y + 1} width="3" height={h - 2} rx="1.5" fill={accent} />}
      <text
        x={x + w / 2} y={sub === undefined ? y + h / 2 + 4 : y + h / 2 - 3}
        textAnchor="middle" fontSize="12.5" fontWeight="600" fill={INK.text} fontFamily={MONO}
      >
        {title}
      </text>
      {sub !== undefined && (
        <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize="10.5" fill={INK.faint}>
          {sub}
        </text>
      )}
    </g>
  )
}

/** One band per layer, and the bracket marking which are this repo's. */
export function LayerDiagram(): ReactNode {
  const bands: readonly (readonly [string, string, string])[] = [
    ['L4', 'Distribution', 'container image · tarballs · independent harness · CI'],
    ['L3', 'Composition', 'the profile: which rows mount, in which order'],
    ['L2', 'Product surface', 'eleven client plugins — sections, panels, theme, brand'],
    ['L1', 'Core seam', 'ctx.rheplicant · three providers · five tools · wire types'],
    ['L0', 'Harness', 'DSH: plugins, session, agent loop, slots, web runtime'],
  ]
  return (
    <svg viewBox="0 0 720 296" role="img" aria-label="Five layers, L4 down to L0; L1 through L4 are this repository">
      {bands.map(([code, name, detail], index) => {
        const y = 8 + index * 56
        const ours = code !== 'L0'
        return (
          <g key={code}>
            <rect
              x="24" y={y} width="600" height="46" rx="6"
              fill={ours ? INK.fill : INK.fillDeep} stroke={INK.line}
              strokeDasharray={ours ? undefined : '4 3'}
            />
            <rect x="24" y={y + 1} width="3" height="44" rx="1.5" fill={ours ? INK.lit : INK.faint} />
            <text x="46" y={y + 20} fontSize="11.5" fontWeight="700" fill={ours ? INK.lit : INK.faint} fontFamily={MONO}>
              {code}
            </text>
            <text x="84" y={y + 20} fontSize="12.5" fontWeight="600" fill={INK.text}>{name}</text>
            <text x="84" y={y + 36} fontSize="10.5" fill={INK.faint}>{detail}</text>
          </g>
        )
      })}
      <path d="M640 12 L654 12 L654 218 L640 218" stroke={INK.lit} strokeWidth="1.3" fill="none" />
      <text x="662" y="108" fontSize="11" fill={INK.lit} fontWeight="600">this</text>
      <text x="662" y="122" fontSize="11" fill={INK.lit} fontWeight="600">repo</text>
      <path d="M640 236 L654 236 L654 278 L640 278" stroke={INK.faint} strokeWidth="1.3" fill="none" />
      <text x="662" y="253" fontSize="11" fill={INK.faint}>consumed,</text>
      <text x="662" y="267" fontSize="11" fill={INK.faint}>never forked</text>
    </svg>
  )
}

/** The seam: five tools above one service, three providers below it. */
export function SeamDiagram(): ReactNode {
  const providers: readonly (readonly [string, string, number])[] = [
    ['local', 'spawns a process', 40],
    ['ssh', 'spawns it remotely', 268],
    ['http', 'talks to a daemon', 496],
  ]
  return (
    <svg viewBox="0 0 720 254" role="img" aria-label="Five tools call one service, which routes by transport to one of three providers">
      <Arrow id="arrow-seam" />
      <rect x="24" y="8" width="672" height="42" rx="6" fill={INK.fillDeep} stroke={INK.line} strokeDasharray="4 3" />
      <text x="360" y="27" textAnchor="middle" fontSize="11.5" fontWeight="600" fill={INK.muted} fontFamily={MONO}>
        rheplicant_validate · rheplicant_gates · rheplicant_run · rheplicant_schema · rheplicant_trigger
      </text>
      <text x="360" y="42" textAnchor="middle" fontSize="10.5" fill={INK.faint}>
        consumers depend on the service, never on a provider
      </text>
      <path d="M360 50 L360 74" stroke={INK.line} strokeWidth="1.3" markerEnd="url(#arrow-seam)" />
      <Box
        x={180} y={80} w={360} h={52} accent={INK.lit}
        title="ctx.rheplicant" sub="routes by the request's transport field"
      />
      {providers.map(([name, note, x]) => (
        <g key={name}>
          <path d={`M360 132 L${x + 92} 178`} stroke={INK.line} strokeWidth="1.2" fill="none" markerEnd="url(#arrow-seam)" />
          <Box x={x} y={184} w={184} h={52} title={name} sub={note} />
        </g>
      ))}
      <text x="248" y="166" textAnchor="end" fontSize="10" fill={INK.faint} fontFamily={MONO}>transport:</text>
    </svg>
  )
}

/** The path one run takes, from a sentence to a directory, and back to a screen. */
export function FlowDiagram(): ReactNode {
  const stages: readonly (readonly [string, string, string])[] = [
    ['the model', 'calls rheplicant_run with task:', INK.source],
    ['tool-run', 'reads bytes · confines the path · mints the id', INK.source],
    ['ctx.rheplicant', 'picks the provider named by transport', INK.lit],
    ['rheplicant_compute', 'JSON-RPC over stdio or HTTP', INK.transform],
    ['rheplicant.config', 'the only owner of the grammar', INK.transform],
    ['publishTaskRun', 'writes results/<task>/<id>/', INK.processing],
  ]
  return (
    <svg viewBox="0 0 720 424" role="img" aria-label="A run passes through the tool, the seam, the compute service and the engine, is published to disk, and is read back by two independent surfaces">
      <Arrow id="arrow-flow" />
      {stages.map(([name, note, color], index) => {
        const y = 8 + index * 52
        return (
          <g key={name}>
            <rect x="120" y={y} width="480" height="40" rx="6" fill={INK.fill} stroke={INK.line} />
            <rect x="120" y={y + 1} width="3" height="38" rx="1.5" fill={color} />
            <text x="142" y={y + 18} fontSize="12" fontWeight="600" fill={INK.text} fontFamily={MONO}>{name}</text>
            <text x="142" y={y + 32} fontSize="10.5" fill={INK.faint}>{note}</text>
            {index < stages.length - 1 && (
              <path d={`M360 ${y + 40} L360 ${y + 50}`} stroke={INK.line} strokeWidth="1.3" markerEnd="url(#arrow-flow)" />
            )}
          </g>
        )
      })}
      <path d="M240 320 L240 344 L188 344 L188 366" stroke={INK.line} strokeWidth="1.3" fill="none" markerEnd="url(#arrow-flow)" />
      <path d="M480 320 L480 344 L532 344 L532 366" stroke={INK.line} strokeWidth="1.3" fill="none" markerEnd="url(#arrow-flow)" />
      <Box x={24} y={372} w={328} h={46} title="the session log" sub="rheplicant/run event → chat node + panels" />
      <Box x={368} y={372} w={328} h={46} title="a directory read" sub="project-api → the workbench" />
      <text x="360" y="348" textAnchor="middle" fontSize="10" fill={INK.faint}>two readers, one truth</text>
    </svg>
  )
}
