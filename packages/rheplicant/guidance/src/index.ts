/**
 * The document-authoring rules, contributed where the tools are.
 *
 * One row, one prompt section. Mount it beside the `rheplicant_*` tools and
 * any agent in that composition is told how to author a document those tools
 * accept — the web console included, which is the case that made this package
 * necessary rather than merely tidy.
 *
 * **What it replaces.** The same six rules were pasted into the `analysis` and
 * `developer` agent presets' persona text, byte-identical (measured
 * 2026-08-28: eleven persona lines, four of them different, the rules all the
 * same). A persona travels with an AGENT PRESET; these rules describe the
 * TOOLS, so in `harness-profile/cordis.patch.yml` — which mounts the seam and
 * all five tools and no persona at all — they were simply absent. The console
 * this product ships had none of them.
 *
 * **Order 120, not 0.** `dsh-system-prompt` documents the bands: `-100` the
 * harness identity, `0` the deployment persona, `100–199` tool guidance. These
 * are tool guidance by that definition, and putting them at 0 is what coupled
 * them to a persona in the first place.
 *
 * **`inject`, not a lazy `ctx.get`.** Registering a section is a one-shot
 * effect, not a value re-read on each use, so the lazy-lookup pattern this repo
 * uses for cross-bundle SERVICES (see `ui-docs`' section bridge) does not apply
 * — there would be nothing to re-call it. A required inject is honest here
 * because contributing that section is this row's only job: a composition
 * without a prompt registry has no use for it and simply does not mount it.
 *
 * @module @rheplicant/dsh-rheplicant-guidance
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

import { renderRules } from './rules.ts'

export { AUTHORING_RULES, RULES_HEADING, renderRules } from './rules.ts'
export type { AuthoringRule } from './rules.ts'

/** Cordis plugin name. */
export const name = 'rheplicant-guidance'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/**
 * The section's name in the registry.
 *
 * Namespaced, because a duplicate name throws within one layer and a scoped
 * section shadows a global one — both of which are the registry working, and
 * neither of which should be reachable by accident from an unrelated package.
 */
export const GUIDANCE_SECTION = 'rheplicant:authoring'

/**
 * Tool guidance renders after the persona and before nothing in particular.
 * 120 leaves 100–119 for anything that should read ahead of it.
 */
export const GUIDANCE_ORDER = 120

/**
 * Register the authoring rules as a prompt section.
 *
 * @param ctx - the context to register in; the section lives in its scope.
 * @returns the disposer, so unmounting the row removes the section.
 */
export function apply(ctx: Context): () => void {
  return ctx.systemPrompt.section({
    name: GUIDANCE_SECTION,
    order: GUIDANCE_ORDER,
    text: renderRules(),
  })
}

// NO `export default`. This module IS the plugin — `name`, `inject` and `apply`
// as named exports — and a default export makes the loader treat the module as
// a BARE FUNCTION plugin instead, which carries no `inject`. The boot then dies
// with `cannot get property "systemPrompt" without inject`, from a line that
// looks correct. Every sibling host package here has zero default exports;
// this one had one, and it is the only reason the harness would not start.
//
// Worth stating because three layers of verification missed it and one caught
// it: the unit specs cover `rules.ts` and never mount; `harness/probe.mjs`
// mounts with `ctx.plugin(namespace)`, which reads the named exports and
// passes; and `check-composition.mjs` runs `--dump-config`, which COMPOSES
// without applying. Only a real boot fails.
