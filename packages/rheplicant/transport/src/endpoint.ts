/**
 * One endpoint value, with the settings channel winning over the composition.
 *
 * **The order is settings-first, and the code used to be the other way round.**
 * The comment in `http`'s `apply` has always said "the runtime-editable
 * settings channel wins, the composed plugin `url` is the fallback"; the
 * expression under it was `config.url ?? settings`, which is the opposite. With
 * config winning, a composition that sets an endpoint makes the `ui-compute`
 * settings card INERT: the operator edits the field, nothing changes, and
 * nothing says why. A runtime editor a static value can silently override is a
 * broken affordance, so the code moved to meet the comment rather than the
 * other way round.
 *
 * Safe to correct now precisely because it has never been exercised: measured
 * 2026-08-28, no composition in this repo mounts `ssh` or `http` at all — the
 * profile and both agent presets mount only `local` — so nothing can depend on
 * the old order. The `cluster` preset is the first thing to mount them, which
 * is why this is settled before it ships rather than after.
 *
 * An EMPTY string counts as unset. `??` alone would let a field the operator
 * typed into and then cleared win over a working composed default, which reads
 * as "clearing the box broke it".
 *
 * @param fromSettings - the value the settings channel holds, if any.
 * @param fromConfig - the value the composition declared, if any.
 * @returns the effective endpoint, or undefined when neither supplies one.
 */
export function resolveEndpoint(
  fromSettings: string | undefined,
  fromConfig: string | undefined,
): string | undefined {
  const settings = fromSettings?.trim()
  if (settings !== undefined && settings !== '') return settings
  const composed = fromConfig?.trim()
  return composed === undefined || composed === '' ? undefined : composed
}
