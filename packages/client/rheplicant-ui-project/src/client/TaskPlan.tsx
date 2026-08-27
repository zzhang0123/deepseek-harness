/**
 * How the inference is set up: which parameters are fitted, into what, and by
 * which step with which knobs.
 *
 * **The gap this closes was named by the user**: *"所有参数如何block的（哪些用
 * NUTS，哪些用GCR，如何循环的，循环多少次，等信息需要显示）"* — which
 * parameters go through which engine, how the loop is arranged, and how many
 * iterations. None of it was on screen. The Exits panel says which of the
 * eighteen exits a document declares and what each WRITES; nothing said what
 * any of them was doing, to which latent, for how long.
 *
 * Three joins, all read straight off the document:
 *
 * 1. **The parameters** — `inference.parameters:`, each with its `into:`
 *    targets and its prior. That is "which parameters", and `into` is what
 *    connects a latent to the operator the Model diagram lights.
 * 2. **The steps** — `runs:` in order, each with the knobs the document wrote.
 *    `nuts` shows its warmup and sample counts, `plan.sample` its blocks,
 *    `predict` the run it reuses. That is "which engine, how many iterations".
 * 3. **The order** — the steps are numbered, because `reuse:` makes them a
 *    chain rather than a set, and a reader following a `reuse:` backwards is
 *    reading the loop.
 * 4. **Which step names which latent.** The first three left the actual
 *    question — *哪些用 NUTS，哪些用 GCR* — to be decoded out of a step's
 *    `blocks:` printed as raw JSON. So each parameter row now carries the
 *    steps whose settings NAME it, found by looking for the latent's exact
 *    string anywhere in that step's verbatim `options`. "Names it" is all that
 *    is claimed, and it is all that can be claimed without owning the grammar
 *    (§2.1) — but it is enough to read the blocking off the page, because a
 *    step's `blocks:` is where a latent's name appears.
 *
 * **Nothing here interprets the grammar.** Knobs arrive as
 * `DeclaredRun.options`, verbatim and unlisted, because a hand-kept table of
 * knob names would be a grammar this repo does not own (§2.1) and would go
 * stale the first time upstream adds one. The cost is that the panel cannot
 * order or explain them; the benefit is that what a reader sees is exactly
 * what they wrote.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/TaskPlan
 */

import { memo } from 'react'
import { EmptyState } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { DeclaredParameter, DeclaredRun, DocumentRuns } from '@rheplicant/dsh-rheplicant'
import styles from './project-home.module.css'

/**
 * One knob, as a string a reader can compare with their file.
 *
 * A scalar prints as itself; anything structured prints as compact JSON rather
 * than being flattened into prose, because `{from: runtime.seeds.nuts}` IS the
 * value and a paraphrase of it is a second claim about the grammar.
 */
function knobText(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value) ?? '—'
  } catch {
    // A cyclic or otherwise unserialisable node. Saying so beats an empty cell.
    return '(not printable)'
  }
}

const Step = memo(function Step({ run }: { readonly run: DeclaredRun }) {
  // ABSENT is not EMPTY. `options` is optional on the wire because a compute
  // service older than the field sends none, and "this service does not report
  // settings" is a different fact from "this step has none" — printing the
  // second for the first would be a claim about the document.
  const knobs = run.options === undefined ? undefined : Object.entries(run.options)
  return (
    <li className={styles.planStep} data-plan-step={run.name ?? ''} data-plan-kind={run.kind ?? ''}>
      <span className={styles.planStepHead}>
        <span className={styles.planIndex} aria-hidden="true">{run.index + 1}</span>
        <span className={styles.mono}>{run.name}</span>
        <span className={styles.chip}>{run.kind}</span>
        {/* An unknown kind is not counted as an exit and must not read as one
            here either — the Exits panel makes the same distinction. */}
        {!run.known && <span className={styles.modelRequired}>not a kind this grammar runs</span>}
      </span>
      {knobs === undefined
        ? <p className={styles.planNote}>this compute service does not report a step&rsquo;s settings</p>
        : knobs.length === 0
        ? <p className={styles.planNote}>no settings — this step takes the file as it stands</p>
        : (
          <dl className={styles.planKnobs}>
            {knobs.map(([key, value]) => (
              <div key={key} className={styles.planKnob} data-plan-knob={key}>
                <dt className={styles.planKnobName}>{key}</dt>
                <dd className={styles.planKnobValue}>{knobText(value)}</dd>
              </div>
            ))}
          </dl>
        )}
    </li>
  )
})

/**
 * Whether one step's settings mention this exact name, anywhere in them.
 *
 * A deep scan for an identical STRING, not a reading of `blocks:` — that key's
 * shape is upstream's and a hand-kept parser for it would be the grammar this
 * repo does not own. What the scan can say is narrow and true: this step's
 * settings name this latent.
 *
 * @param value - one node of a step's verbatim `options`.
 * @param name - the latent's declared name.
 * @returns whether the name occurs as a string in that subtree.
 */
function namesLatent(value: unknown, name: string): boolean {
  if (typeof value === 'string') return value === name
  if (Array.isArray(value)) return value.some(item => namesLatent(item, name))
  if (typeof value === 'object' && value !== null) {
    // Keys count too: `blocks: {g: {...}}` names `g` in the key position.
    return Object.entries(value).some(([key, item]) => key === name || namesLatent(item, name))
  }
  return false
}

const Parameter = memo(function Parameter({ parameter, steps }: {
  readonly parameter: DeclaredParameter
  readonly steps: readonly DeclaredRun[]
}) {
  // A step whose service did not report `options` cannot be searched, and it
  // is left out rather than reported as not naming the latent — the same
  // absent-is-not-empty rule the knob list keeps two components up.
  const naming = steps.filter(run => run.options !== undefined
    && namesLatent(run.options, parameter.name))
  return (
    <li className={styles.planParam} data-plan-parameter={parameter.name}>
      <span className={styles.planStepHead}>
        <span className={styles.mono}>{parameter.name}</span>
        {parameter.unit !== null && <span className={styles.modelUnit}>{parameter.unit}</span>}
        {parameter.family !== null && <span className={styles.chip}>{parameter.family}</span>}
        {parameter.modifiers.map((name: string) => (
          <span key={name} className={styles.chip} title="changes what this latent means">{name}</span>
        ))}
      </span>
      {/* WHERE IT LANDS. This is the line that connects a fitted latent to the
          operator the diagram lights, and it is the reason this panel is worth
          having beside the Model tab's picture. */}
      <p className={styles.planNote} data-plan-into="">
        {parameter.into.length === 0
          ? 'no into: — this file does not say where it goes'
          : (
            <>
              into{' '}
              {parameter.into.map((target: string, index: number) => (
                <span key={target}>
                  {index > 0 ? ', ' : ''}<code>{target}</code>
                </span>
              ))}
            </>
          )}
      </p>
      {parameter.prior !== null && (
        <p className={styles.planNote} data-plan-prior="">prior {knobText(parameter.prior)}</p>
      )}
      {parameter.init !== null && (
        <p className={styles.planNote} data-plan-init="">starts at {knobText(parameter.init)}</p>
      )}
      {naming.length > 0 && (
        <p className={styles.planNote} data-plan-fitted-by="">
          named by{' '}
          {naming.map((run: DeclaredRun, index: number) => (
            <span key={run.name}>
              {index > 0 ? ', ' : ''}step {run.index + 1}{' '}
              <span className={styles.chip}>{run.kind}</span>
            </span>
          ))}
        </p>
      )}
    </li>
  )
})

export const TaskPlan = memo(function TaskPlan({ runs, parameters }: {
  readonly runs: DocumentRuns
  readonly parameters: readonly DeclaredParameter[]
}) {
  const steps = runs.declared
  return (
    <div data-task-plan="">
      {parameters.length === 0 && steps.length === 0
        ? (
          <EmptyState
            kind="waiting"
            message="This file fits nothing and runs nothing yet"
            hint="Parameters come from inference.parameters:, steps from runs:."
          />
        )
        : (
          <>
            <h4 className={styles.planHeading}>
              Fitted parameters <span className={styles.planCount}>{parameters.length}</span>
            </h4>
            {parameters.length === 0
              ? <p className={styles.planNote}>This file declares no fitted parameters, so every step runs the model as written.</p>
              : (
                <ul className={styles.planList} data-plan-parameters="">
                  {parameters.map(parameter => (
                    <Parameter key={parameter.name} parameter={parameter} steps={steps} />
                  ))}
                </ul>
              )}
            <h4 className={styles.planHeading}>
              Steps, in order <span className={styles.planCount}>{steps.length}</span>
            </h4>
            {steps.length === 0
              ? <p className={styles.planNote}>This file declares no steps, so running it would do nothing.</p>
              : (
                <ul className={styles.planList} data-plan-steps="">
                  {steps.map(run => <Step key={`${run.index}-${run.name ?? ''}`} run={run} />)}
                </ul>
              )}
            <p className={styles.note}>
              Every value here is what the file says, unchanged — this panel does not
              interpret the grammar, so what you read is what you wrote. A step that
              names another under <code>reuse:</code> runs after it and reads its result.
            </p>
          </>
        )}
    </div>
  )
})
