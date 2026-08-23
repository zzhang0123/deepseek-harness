/**
 * The exact config document, verbatim: a scrollable code block (YAML when
 * the hand-rolled serializer can render it faithfully, pretty JSON as a
 * labelled fallback otherwise — see `yaml.ts`), a caption naming which
 * durable event it came from and its transport, and a copy-to-clipboard
 * action. Used by the `conversation.view` tab, which adds the grammar
 * reference below it.
 * @module @rheplicant/dsh-rheplicant-ui-document/client/DocumentSource
 */
import { memo, useCallback, useMemo, useState } from 'react'
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

  const onCopy = useCallback(() => {
    const clipboard = readClipboard()
    if (clipboard === undefined) return // graceful no-op when the Clipboard API is unavailable
    void clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, COPY_RESET_MS)
    }).catch(() => {
      // Write refused (permissions, insecure context, …) — silent no-op, same contract as "unavailable".
    })
  }, [text])

  return (
    <div className={styles.source}>
      <div className={styles.sourceHeader}>
        <p
          className={styles.sourceCaption}
          data-document-source
          data-source-kind={fact.kind}
          data-transport={fact.transport}
        >
          {SOURCE_LABEL[fact.kind]} · {fact.transport} transport · seq {fact.seq} · {format === 'yaml' ? 'YAML' : 'JSON (YAML serializer fell back)'}
        </p>
        <button type="button" className={styles.copyButton} data-document-copy onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={styles.pre} data-document-text data-document-format={format}>
        <code>{text}</code>
      </pre>
    </div>
  )
})
