/**
 * The exact config document, verbatim: a framed code block (YAML when the
 * hand-rolled serializer can render it faithfully, pretty JSON as a labelled
 * fallback otherwise — see `yaml.ts`), a header naming which durable event it
 * came from and its transport, and a copy-to-clipboard action. Used by the
 * `conversation.view` tab, which adds the grammar reference below it.
 *
 * **The caption is a phrase run and stays one.** It used to be four
 * heterogeneous facts joined by middots at one size, one weight and one
 * colour — `rheplicant/run · local transport · seq 3 · JSON (YAML serializer
 * fell back)` — with the fallback STATE buried in it as a parenthetical. The
 * fix is emphasis and placement, not a key/value grid:
 * `apps/web/tests/rheplicant-ui-document-load.e2e.ts` reads this element's
 * innerText for `rheplicant/run` and for `local transport`, and a grid would
 * split the second across two cells. So the event name takes the weight, the
 * rest recedes, the format becomes a chip on the block, and the fallback gets
 * a row of its own.
 *
 * @module @rheplicant/dsh-rheplicant-ui-document/client/DocumentSource
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentFact } from './document-contract.ts'
import { serializeDocument } from './yaml.ts'
import styles from './document.module.css'

const SOURCE_LABEL: Record<DocumentFact['kind'], string> = {
  validate: 'rheplicant/validate',
  gates: 'rheplicant/gates',
  run: 'rheplicant/run',
}

const COPY_RESET_MS = 1500

export interface DocumentSourceProps {
  readonly fact: DocumentFact
}

/** The Clipboard API when available; `navigator.clipboard` is `undefined` in some insecure contexts even though lib.dom.d.ts types it as always present. */
function readClipboard(): Clipboard | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.clipboard
}

export const DocumentSource = memo(function DocumentSource({ fact }: DocumentSourceProps) {
  const { text, format } = useMemo(() => serializeDocument(fact.document), [fact.document])
  const [copied, setCopied] = useState(false)
  // Held so unmount can clear it. The old code called `window.setTimeout` and
  // never cleared, so a tab closed inside the reset window set state on a
  // component that was gone.
  const resetTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => {
    if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current)
  }, [])

  const onCopy = useCallback(() => {
    const clipboard = readClipboard()
    if (clipboard === undefined) return // graceful no-op when the Clipboard API is unavailable
    void clipboard.writeText(text).then(() => {
      setCopied(true)
      if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => { setCopied(false) }, COPY_RESET_MS)
    }).catch(() => {
      // Write refused (permissions, insecure context, …) — silent no-op, same contract as "unavailable".
    })
  }, [text])

  return (
    <div className={styles.block}>
      <div
        className={styles.blockHead}
        data-document-source
        data-source-kind={fact.kind}
        data-transport={fact.transport}
      >
        <span className={styles.sourceEvent}>{SOURCE_LABEL[fact.kind]}</span>
        <span className={styles.sourceDot} aria-hidden="true">·</span>
        {/* One phrase, not two cells — see the module note. */}
        <span className={styles.sourceMeta}>{fact.transport} transport</span>
        <span className={styles.sourceDot} aria-hidden="true">·</span>
        <span className={styles.sourceMeta}>seq {fact.seq}</span>
        <span className={styles.formatTag}>{format === 'yaml' ? 'YAML' : 'JSON'}</span>
        <button
          type="button"
          className={styles.copyButton}
          data-document-copy
          onClick={onCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {/* Announced, not merely relabelled: a button that reports its result
            by changing its own text tells a screen reader nothing. */}
        <span className={styles.srOnly} role="status" aria-live="polite">
          {copied ? 'Document copied to the clipboard' : ''}
        </span>
      </div>

      {/* A STATE, on its own row. It was a parenthetical inside the caption. */}
      {format !== 'yaml' && (
        <p className={styles.fallbackNote} data-document-fallback>
          Shown as JSON: this document holds something the YAML serializer will not
          render faithfully, so it is printed in the form that round-trips.
        </p>
      )}

      {/* Focusable, named, and it does not chain its scroll to the page. A
          scrollport with no focusable descendant is content a keyboard user
          cannot reach — and every line below the fold was exactly that. */}
      <pre
        className={styles.pre}
        data-document-text
        data-document-format={format}
        tabIndex={0}
        role="region"
        aria-label={`Config document from ${SOURCE_LABEL[fact.kind]}, sequence ${fact.seq}`}
      >
        <code>{text}</code>
      </pre>
    </div>
  )
})
