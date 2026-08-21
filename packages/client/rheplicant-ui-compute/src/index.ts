/**
 * Node half of the rheplicant ui-compute client plugin. The browser half owns
 * the settings card; this half carries no runtime API, but must export an
 * `apply()` (the loader rejects a row whose node half is an empty module).
 * @module @rheplicant/dsh-rheplicant-ui-compute
 */

/** Host plugin body; the feature is entirely browser-side. */
export function apply(): void {}
