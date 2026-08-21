import { defineConfig } from 'tsdown'

/**
 * Never builds standalone: a pure library (shared panel chrome, chart kit,
 * formatting) inlined by every console-panel client bundle via
 * `@rheplicant/dsh-rheplicant-ui-kit/client`, never a module-table row. The
 * dsh workspace build must skip it rather than apply the root host-face
 * default entry it does not satisfy.
 */
export default defineConfig([{ entry: '' }])
