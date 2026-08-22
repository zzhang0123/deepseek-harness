/**
 * The config-document `conversation.view` tab: the exact document most
 * recently recorded in the session log (§5 of docs/architecture.md — a
 * panel reads the durable session log and renders, it never calls compute),
 * followed by the generated grammar reference. Read-only: v1 has no editing
 * and no host tool to fetch `document.project` mid-session (that is v2) — it
 * only ever shows what a `rheplicant_run`/`rheplicant_validate`/
 * `rheplicant_gates` call already left in the log.
 * @module @rheplicant/dsh-rheplicant-ui-document/client/DocumentView
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { EmptyState } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { DocumentSource } from './DocumentSource.tsx'
import { GrammarReference } from './GrammarReference.tsx'
import styles from './document.module.css'

interface DocumentViewProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

export const DocumentView = memo(function DocumentView({ useSession }: DocumentViewProps) {
  const fact = useSession(snapshot => snapshot.views.get('rheplicant-document')?.latest)

  return (
    <section data-rheplicant-document className={styles.view}>
      <h2 className={styles.heading}>Document</h2>
      {fact === undefined ? (
        <EmptyState
          message="No document in this session yet"
          hint="Ask the agent to author one via rheplicant_run or rheplicant_validate"
        />
      ) : (
        <DocumentSource fact={fact} />
      )}
      <h2 className={styles.heading}>Grammar reference</h2>
      <GrammarReference />
    </section>
  )
})
