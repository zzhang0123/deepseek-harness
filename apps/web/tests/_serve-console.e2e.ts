// TEMPORARY: boot a long-lived web scaffold with a seeded rheplicant session,
// print the URL, keep serving until killed. This is the hand-driving surface
// for console UI work, so its fixture is deliberately the UNION of what every
// panel reads: a document (Document), validate + gates reports (Loop rail,
// Gates), a signal-path graph (Signal path), sampler chains exercising the
// whole key grammar (Chains, Posterior), singular values (Identifiability)
// and an m-mode spectrum (Spectrum).
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { launchWebScaffold, realizeSeedFixture, seedSession } from './scaffold.ts'

const SEED_ID = 'rheplicant-console-demo'
const URL_FILE = '/Users/zzhang/projects/rheplicant-agent/.build/demo-url.txt'

const SKIP_REASON = 'The dense Jacobian SVD costs more than this nightly fit can pay.'

/** A RHINO-shaped document: what the agent authored and ran. */
const DOCUMENT = {
  schema_version: 1,
  runtime: { seed: 20260822 },
  observation: {
    meta: { telescope: 'RHINO' },
    freq: { grid: { linspace: { start: 60.0, stop: 85.0, num: 64, endpoint: true } }, unit: 'MHz' },
    time: { grid: { arange: { start: 0.0, step: 2.0, num: 128 } }, unit: 's' },
    environment: { temperature: { value: 280.0, unit: 'K' } },
  },
  model: {
    global_signal: {
      depth: { value: 0.5, unit: 'K' },
      centre: { value: 75.0, unit: 'MHz' },
      width: { value: 5.0, unit: 'MHz' },
    },
    gain: { gain: { value: 1.1, unit: 'dimensionless' } },
    noise: { type: 'NoiseOperator', sigma: { value: 0.05, unit: 'K' } },
  },
  inference: {
    parameters: {
      g: { init: 1.0, linear: true, into: 'gain.gain', prior: { normal: { loc: 1.0, scale: 0.2 } } },
    },
    noise: { kind: 'homoscedastic', sigma: { value: 0.05, unit: 'K' } },
    checks: { identifiability: { mode: 'skip', reason: SKIP_REASON } },
  },
  runs: [
    { name: 'fit', kind: 'nuts' },
    { name: 'ident', kind: 'identifiability' },
    { name: 'mmode', kind: 'mmodes' },
  ],
}

/** A small stand-in for rheplicant's own `Assembly.to_svg(theme="dark")`. */
const GRAPH_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="96" viewBox="0 0 520 96">',
  '<rect width="520" height="96" fill="#07131f"/>',
  '<rect x="16" y="28" width="120" height="34" rx="4" fill="#241E3D" stroke="#E3B341" stroke-width="2"/>',
  '<text x="76" y="49" fill="#D2A8FF" font-size="11" text-anchor="middle">global_signal</text>',
  '<line x1="136" y1="45" x2="196" y2="45" stroke="#E3B341" stroke-width="2"/>',
  '<rect x="196" y="28" width="120" height="34" rx="4" fill="#0D2137" stroke="#E3B341" stroke-width="2"/>',
  '<text x="256" y="49" fill="#A5D6FF" font-size="11" text-anchor="middle">gain</text>',
  '<line x1="316" y1="45" x2="376" y2="45" stroke="#E3B341" stroke-width="2"/>',
  '<rect x="376" y="28" width="120" height="34" rx="4" fill="#1C1F24" stroke="#E3B341" stroke-width="2"/>',
  '<text x="436" y="49" fill="#C9D1D9" font-size="11" text-anchor="middle">noise</text>',
  '<text x="16" y="82" fill="#6E7681" font-size="9">astro_sum, beam_spill traversed as identity</text>',
  '</svg>',
].join('')

/**
 * Per-draw traces: two scalars, one component fan-out, one credible band.
 * Deterministic (a small LCG, so the demo is reproducible) but drawn from a
 * roughly normal density — a sine wave would pile every draw at the turning
 * points and make the posterior marginals read as bimodal, which is a lie
 * about what a converged sampler looks like.
 */
function draws(n: number, mean: number, sd: number, seed: number): number[] {
  let state = seed
  const next = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  return Array.from({ length: n }, () => {
    // Irwin–Hall (sum of 6 uniforms) approximates a normal closely enough here.
    let sum = 0
    for (let k = 0; k < 6; k += 1) sum += next()
    return Number((mean + sd * (sum - 3) * 0.707).toFixed(4))
  })
}

/** A smooth per-draw band: a slow drift the credible interval brackets. */
function band(n: number, offset: number, amp: number, width: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Number((offset + amp * Math.sin((i / n) * Math.PI * 2 + 0.2) + width).toFixed(4)),
  )
}

const CHAINS = {
  g: draws(96, 1.1, 0.06, 12345),
  amp: draws(96, 0.5, 0.011, 987),
  'beam[0]': draws(96, 2.0, 0.05, 5150),
  'beam[1]': draws(96, 0.35, 0.04, 424242),
  'wide.mean': band(40, 11.0, 1.4, 0),
  'wide.q05': band(40, 11.0, 1.4, -1.6),
  'wide.q95': band(40, 11.0, 1.4, 1.6),
}

const OUTCOME = {
  runs: [
    {
      name: 'fit',
      kind: 'nuts',
      status: 'ok',
      diagnostics: { rhat: 1.004, n_eff: 980, divergences: 0, converged: true, notes: [] },
      chains: CHAINS,
    },
    {
      name: 'ident',
      kind: 'identifiability',
      status: 'ok',
      diagnostics: { rank: 3, nullity: 2, singular_values: [120, 80, 30, 4, 0.5], weakest_identified: 0.25, notes: [] },
    },
    {
      name: 'mmode',
      kind: 'mmodes',
      status: 'ok',
      spectrum: [
        [0.1, 0.5, 0.3, 0.2],
        [0.4, null, 0.6, 0.3],
        [0.2, 0.6, 1.6, 0.2],
        [0.1, 0.3, 0.2, 0.1],
      ],
      diagnostics: { notes: [] },
    },
  ],
  tookMs: 8420,
  graph: {
    graph: 'RADIO_GRAPH',
    lit: ['global_signal', 'gain', 'noise'],
    skipped: ['astro_sum', 'beam_spill'],
    svg: GRAPH_SVG,
  },
  gates: [
    { check: 'C12', severity: 'report', where: 'inference.checks.linearity', message: 'relative departure 6.7e-13' },
  ],
}

const GATES_REPORT = {
  checks: [
    { check: 'linearity', mode: 'refuse', id: 'C12', state: 'refuse', record: true, reason: null, where: 'inference.checks.linearity', rtol: null },
    { check: 'identifiability', mode: 'skip', id: 'C13', state: 'skip', record: false, reason: SKIP_REASON, where: 'inference.checks.identifiability', rtol: 0.01 },
    { check: 'prior_sensitivity', mode: 'skip', id: 'C19', state: 'off', record: false, reason: null, where: 'inference.checks.prior_sensitivity', rtol: null },
  ],
  runs: [],
  warnings: [],
}

const DOC = JSON.stringify(DOCUMENT)

const SEED_FIXTURE = [
  '{"type":"session","version":0,"id":"{{sessionId}}","createdAt":1784974100747,"cwd":"{{cwd}}"}',
  '{"type":"turn/start","seq":0,"time":1784974100758,"data":{"turn":1,"trigger":{"kind":"message","source":{"kind":"user","rpcId":"{{rpcId}}"}}}}',
  '{"type":"user/message","seq":1,"time":1784974100759,"data":{"content":[{"type":"text","text":"Fit the global signal, check identifiability, and show me the m-modes."}],"source":{"kind":"user","rpcId":"{{rpcId}}"}},"surfaceOp":"append"}',
  '{"type":"step/start","seq":2,"time":1784974100827,"data":{"turn":1,"step":1}}',
  `{"type":"rheplicant/validate","seq":3,"time":1784974100828,"ignorable":true,"data":{"document":${DOC},"transport":"local","report":{"valid":true,"errors":[],"warnings":[]}}}`,
  `{"type":"rheplicant/gates","seq":4,"time":1784974100829,"ignorable":true,"data":{"document":${DOC},"transport":"local","report":${JSON.stringify(GATES_REPORT)}}}`,
  `{"type":"rheplicant/run","seq":5,"time":1784974100830,"ignorable":true,"data":{"document":${DOC},"transport":"local","executionId":"20260822T090000Z-3f9ac2b1-aaaaaa","taskDigest":"3f9ac2b1","taskPath":"tasks/global-signal-fit.yaml","outcome":${JSON.stringify({ ...OUTCOME, resultsPath: '/home/z/rhino-2026/results/tasks/global-signal-fit/20260822T090000Z-3f9ac2b1-aaaaaa' })}}}`,
  // A second execution of the same task, so the header's picker has something
  // to pick between and the current/stale badge means something on screen.
  `{"type":"rheplicant/run","seq":9,"time":1784974100834,"ignorable":true,"data":{"document":${DOC},"transport":"local","executionId":"20260822T134501Z-3f9ac2b1-k7m2xq","taskDigest":"3f9ac2b1","taskPath":"tasks/global-signal-fit.yaml","outcome":${JSON.stringify({ ...OUTCOME, resultsPath: '/home/z/rhino-2026/results/tasks/global-signal-fit/20260822T134501Z-3f9ac2b1-k7m2xq' })}}}`,
  '{"type":"assistant/message","seq":6,"time":1784974100831,"data":{"turn":1,"step":1,"content":[{"type":"text","text":"The fit converged (r_hat 1.004, no divergences). Identifiability leaves two blind directions — the weakest identified sits at 0.25 of the best."}],"provenance":{"provider":"deepseek-official","model":"deepseek-v4-flash"}},"surfaceOp":"append"}',
  '{"type":"step/end","seq":7,"time":1784974100832,"data":{"turn":1,"step":1}}',
  '{"type":"turn/end","seq":8,"time":1784974100833,"data":{"turn":1,"reason":{"kind":"completed"}}}',
  '',
].join('\n')

describe('serve rheplicant console demo', () => {
  it('boots and keeps serving', async () => {
    const scaffold = await launchWebScaffold({})
    await seedSession(scaffold, realizeSeedFixture(scaffold, SEED_FIXTURE, SEED_ID), SEED_ID)
    writeFileSync(URL_FILE, `${scaffold.baseUrl}\n${SEED_ID}\n`)
    console.log(`\n\nRHEPLICANT_DEMO_URL=${scaffold.baseUrl}\n\n`)
    await new Promise(() => {})
  }, 60 * 60 * 1000)
})
