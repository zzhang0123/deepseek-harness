/**
 * Pins the rule that DSH's own product artifacts carry no rheplicant.
 *
 * This is an invariant, not a snapshot. The counts below are zero because the
 * property holds, and the assertions name the property so a future shortcut
 * fails here rather than surfacing months later when a developer's own
 * `pnpm dsh web` boots somebody else's product — which is exactly how the leak
 * this guards was found.
 *
 * What leaked, and why it went unnoticed: getting a client plugin into the
 * browser needs two independent facts, that its composition ROW exists and
 * that its package RESOLVES. `launchWebScaffold` had a parameter for the first
 * (`extraOverlayPath`) and none for the second, so rheplicant's rows went into
 * `packages/bundle/web-app/cordis.patch.yml` and its packages into that
 * bundle's and `apps/cli`'s `dependencies` — the only route by which
 * `healProfilesModuleFallback`'s BFS could reach them. All three are clean now:
 * the rows live in `./rheplicant.overlay.yml` and the packages in
 * `./rheplicant-anchor/package.json`, reached through the scaffold's
 * `installAnchor` option, so nothing here has to relax for the rheplicant
 * scenarios to pass.
 *
 * It matches on the substring `rheplicant` rather than on a list of package
 * names: a list needs updating every time that family gains a member, and a
 * guard nobody updates is a guard that stops guarding.
 *
 * NO BROWSER, despite the `.e2e.ts` name. It reads files and asserts on their
 * contents. It sits in this lane because that is the suite which owns the web
 * bundle's composition — the artifact it guards — and `apps/web/tests/**` is
 * where a change to that composition gets tested. The name follows this
 * directory's convention rather than describing a browser session.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Three levels up from apps/web/tests/ is the checkout root. `new URL` with a
// bare `..` segment yields a directory URL, so this ends in a separator and
// the concatenations below are correct — do not "fix" it by adding one.
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

const WEB_BUNDLE_PATCH = 'packages/bundle/web-app/cordis.patch.yml'
const WEB_BUNDLE_MANIFEST = 'packages/bundle/web-app/package.json'
const CLI_MANIFEST = 'apps/cli/package.json'
const ROOT_MANIFEST = 'package.json'

function read(relativePath: string): string {
  return readFileSync(REPO_ROOT + relativePath, 'utf8')
}

/**
 * Dependency names a manifest DECLARES. `devDependencies` is deliberately out
 * of scope: `healProfilesModuleFallback` walks `dependencies` and
 * `peerDependencies` only, so those are the two that can put a package on a
 * profile's module-resolution surface, and they are what "this product depends
 * on it" means here.
 */
function declaredDependencies(relativePath: string): string[] {
  const manifest = JSON.parse(read(relativePath)) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  return Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
}

describe('web e2e: DSH product artifacts carry no rheplicant', () => {
  it('the web bundle composition names no rheplicant row', () => {
    const offending = read(WEB_BUNDLE_PATCH)
      .split('\n')
      .filter(line => line.includes('rheplicant'))
    expect(offending).toEqual([])
  })

  it('the web bundle keeps its own brand rows', () => {
    // The leak REPLACED these rather than disabling them, so their absence is
    // the same defect wearing different clothes: a bundle with no brand row is
    // a bundle waiting for somebody else's.
    const patch = read(WEB_BUNDLE_PATCH)
    expect(patch).toContain('- id: ui-brand-official')
    expect(patch).toContain("name: '@deepseek-ai/dsh-client-ui-brand-official'")
  })

  it('the web bundle manifest declares no rheplicant package', () => {
    expect(declaredDependencies(WEB_BUNDLE_MANIFEST).filter(name => name.includes('rheplicant'))).toEqual([])
  })

  it('the web bundle manifest still declares its own brand package', () => {
    // Restoring the row without the package leaves the row unresolvable, which
    // took down seven unrelated scenarios when it happened.
    expect(declaredDependencies(WEB_BUNDLE_MANIFEST)).toContain('@deepseek-ai/dsh-client-ui-brand-official')
  })

  it('the CLI manifest declares no rheplicant package', () => {
    expect(declaredDependencies(CLI_MANIFEST).filter(name => name.includes('rheplicant'))).toEqual([])
  })

  it('the workspace root keeps its rheplicant packages OUT of the resolving blocks', () => {
    // The root manifest is the one place a rheplicant name legitimately
    // appears, and the rule here is about WHICH block rather than whether.
    //
    // Four @rheplicant host packages sit in its `devDependencies`, and they
    // have to: `rheplicant-tools-mount.e2e.ts` and `rheplicant-task-file.e2e.ts`
    // import them by bare specifier, and the link under the root
    // `node_modules/@rheplicant/` that makes those imports resolve is created
    // by exactly that declaration. Deleting them was tried and reverted —
    // `tsc -b tsconfig.host.json` immediately produced six TS2307s.
    //
    // Promoting any of them to `dependencies` or `peerDependencies` WOULD be a
    // leak of the audited kind, because those are the two blocks
    // `healProfilesModuleFallback`'s BFS walks. So this asserts the promotion
    // cannot happen, and deliberately says nothing about `devDependencies`.
    expect(declaredDependencies(ROOT_MANIFEST).filter(name => name.includes('rheplicant'))).toEqual([])
  })
})
