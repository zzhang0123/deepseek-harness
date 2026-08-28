/**
 * The authoring rules.
 *
 * These pin two different things. The CONTENT assertions exist because each
 * rule encodes a measured failure — a refusal the engine issues, or, in one
 * case, a hang that produces no error at all — so a rule quietly dropped or
 * reworded into advice is a regression that nothing else would catch.
 *
 * The TEMPLATE assertion is the one that would otherwise fail at runtime and
 * far from here: the prompt registry interpolates complete `{{variable}}`
 * groups strictly against registered variables, and these rules are full of
 * YAML braces. A `{{` reaching the registry fails assembly for the whole
 * prompt, not just this section.
 */
import { describe, expect, it } from 'vitest'

import { AUTHORING_RULES, RULES_HEADING, renderRules } from '@rheplicant/dsh-rheplicant-guidance/rules'

describe('the authoring rules', () => {
  it('gives every rule a unique id', () => {
    const ids = AUTHORING_RULES.map(rule => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the measured refusals, each named by its check', () => {
    const byId = new Map(AUTHORING_RULES.map(rule => [rule.id, rule.text]))
    // A29: a literal seed is refused; the fitting kinds require one from
    // `runtime.seeds` and `plan.estimate` refuses one outright.
    expect(byId.get('seed-from-runtime-seeds')).toContain('A29')
    // A30: without `inference.twin: {without: [noise]}` the model's own noise
    // draw becomes one fixed bias shared by the whole fit.
    expect(byId.get('fitting-runs-drop-noise')).toContain('A30')
    expect(byId.get('fitting-runs-drop-noise')).toContain('without: [noise]')
  })

  it('keeps the one rule whose symptom is silence', () => {
    const bar = AUTHORING_RULES.find(rule => rule.id === 'nuts-progress-bar')?.text ?? ''
    // The tqdm bar deadlocks over this harness's stdio channel: no error, no
    // output, the run simply never returns.
    expect(bar).toContain('progress_bar: false')
    expect(bar).toContain('deadlock')
  })

  it('renders the heading and one bullet per rule', () => {
    const lines = renderRules().split('\n')
    expect(lines[0]).toBe(RULES_HEADING)
    expect(lines.length).toBe(AUTHORING_RULES.length + 1)
    for (const line of lines.slice(1)) expect(line.startsWith('- ')).toBe(true)
  })

  it('contains no template group the prompt registry would try to interpolate', () => {
    // `{{` is the only shape that matters: single braces are ordinary YAML and
    // the registry leaves them alone.
    expect(renderRules()).not.toContain('{{')
  })
})
