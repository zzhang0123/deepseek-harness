/**
 * sha256 of the authored task document, so staleness can be a DIGEST
 * comparison.
 *
 * `docs/project-model.md` §4.2 is explicit that staleness is content-based —
 * "Content digest, not revision number" — and it is inherited from
 * rheplicant's own `gui/jobs.py`. Comparing modification times instead would
 * be a weaker claim wearing the same word, and would call a task stale for a
 * touch that changed nothing.
 *
 * Answers `undefined` rather than throwing when it cannot hash. `crypto.subtle`
 * exists only in a secure context, which `localhost` is and a plain-http
 * deployment on another host is not — and "we could not compare" is a state
 * the rail already renders differently from "they differ".
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-document-digest
 */

import { useEffect, useState } from 'react'

/** Hex sha256 of one string, or undefined where the platform cannot. */
async function sha256Hex(text: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) return undefined
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return undefined
  }
}

/**
 * Digest one document's text.
 *
 * @param text - the document, or undefined when none is loaded.
 * @returns the hex digest, or undefined while hashing or when it is impossible.
 */
export function useDocumentDigest(text: string | undefined): string | undefined {
  const [digest, setDigest] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (text === undefined) {
      setDigest(undefined)
      return
    }
    let live = true
    // Cleared before hashing, not after: holding the previous document's
    // digest across a change of task would compare the NEW document against
    // the OLD one's hash and report a stale that is not there.
    setDigest(undefined)
    void sha256Hex(text).then((found) => { if (live) setDigest(found) })
    return () => { live = false }
  }, [text])

  return digest
}
