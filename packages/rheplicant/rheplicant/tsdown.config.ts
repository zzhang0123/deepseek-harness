import { defineConfig } from 'tsdown'

/**
 * Pre-built by rheplicant-agent's own build (`scripts/build.mjs`): flat `lib/`
 * output (`index.js`, `invariant.js`, `types.js`) with no
 * `lib/types/{index,invariant,startup}.js`. The dsh workspace build must skip
 * this package — a falsey entry removes it before entry resolution — rather
 * than apply the root host-face default entry it does not satisfy.
 */
export default defineConfig([{ entry: '' }])
