/**
 * The document-authoring rules, as data.
 *
 * Every one of these is a MEASURED refusal or a measured hang, not a style
 * preference — a document that breaks one either fails validation before it
 * runs or runs and produces a plausible wrong number. They are kept as an
 * array rather than a paragraph so a test can pin them and so the rendered
 * section has exactly one definition of its own order.
 *
 * **They are tool guidance, not persona.** `dsh-system-prompt`'s own
 * convention names the bands — `-100` the harness identity, `0` the deployment
 * persona, `100–199` tool guidance — and these describe how to author a
 * document the `rheplicant_*` tools will accept. Living in a persona is what
 * made them travel with the AGENT PRESET instead of with the TOOLS, which is
 * why they were byte-identical in two presets and absent from the shipped web
 * console entirely (measured 2026-08-28: `harness-profile/cordis.patch.yml`
 * mounts the seam and all five tools and no persona at all).
 *
 * @module @rheplicant/dsh-rheplicant-guidance/rules
 */

/** One rule: what to do, and the refusal or failure it avoids. */
export interface AuthoringRule {
  /** Stable id, so a test names a rule rather than an array index. */
  readonly id: string
  /** The rule, as one line of the rendered section. */
  readonly text: string
}

/**
 * The rules, in the order they render.
 *
 * Ordered cheapest-refusal-first, matching how the engine itself rejects: the
 * shape errors a pre-flight catches in milliseconds come before the ones that
 * need a built model, and the one that is not a refusal at all — the deadlock
 * — comes last because it is the only one whose symptom is silence.
 */
export const AUTHORING_RULES: readonly AuthoringRule[] = [
  {
    id: 'schema-version',
    text: 'Top level needs `schema_version: 1`.',
  },
  {
    id: 'unit-on-the-value-node',
    text: '`observation.freq.grid`\'s value node carries `unit:` '
      + '(e.g. `grid: {linspace: {...}, unit: MHz}`) — `unit:` never sits on `freq:` itself.',
  },
  {
    id: 'kind-keys-are-flat',
    text: '`runs:` entries carry kind-specific keys (`num_warmup`, `num_samples`, `seed`, '
      + '`target_accept_prob`, `progress_bar`, ...) FLAT on the run entry, siblings of '
      + '`kind:`/`name:` — never nested under an `options:` key.',
  },
  {
    id: 'seed-from-runtime-seeds',
    text: '`seed:` is `{from: runtime.seeds.<name>}`, an entry declared under `runtime.seeds:` — '
      + 'never a literal. `nuts`/`plan.sample`/`conjugate.gcr`/`npe` require one; '
      + '`plan.estimate` refuses one (check A29).',
  },
  {
    id: 'fitting-runs-drop-noise',
    text: 'A fitting run (`nuts`, `plan.sample`, `npe`, `conjugate.gcr`) needs '
      + '`inference.twin: {without: [noise]}` — otherwise the model\'s own noise draw becomes one '
      + 'fixed bias shared by the whole fit (check A30).',
  },
  {
    id: 'nuts-progress-bar',
    text: '`kind: nuts` runs: always set `progress_bar: false` — the default tqdm bar deadlocks '
      + 'over this harness\'s stdio channel. Start from `num_warmup: 500` with '
      + '`target_accept_prob: 0.9`; shorter warmup has been measured to leave divergences and a '
      + 'posterior drifting into a flat region.',
  },
]

/** The heading the section renders under. */
export const RULES_HEADING =
  'Authoring a rheplicant document. A document that violates any of these fails validation '
  + 'before it runs:'

/**
 * The section body: the heading, then one bullet per rule.
 *
 * A plain string with no `{{…}}` in it. The prompt registry interpolates
 * complete `{{variable}}` groups strictly against registered variables, so a
 * stray brace here would fail assembly rather than render literally — and
 * these rules are full of YAML braces. They are all inside backticks, which
 * the interpolator does not treat specially, so the shape to avoid is
 * `{{` specifically; `RULES_HAVE_NO_TEMPLATE` is the test that keeps it that
 * way.
 *
 * @returns the rendered section text.
 */
export function renderRules(): string {
  return [RULES_HEADING, ...AUTHORING_RULES.map(rule => `- ${rule.text}`)].join('\n')
}
