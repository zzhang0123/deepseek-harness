/**
 * The config-document `conversation.view` tab: the exact document most
 * recently recorded in the session log (§5 of docs/architecture.md — a panel
 * reads the durable session log and renders, it never calls compute), followed
 * by the generated grammar reference. Read-only: v1 has no editing and no host
 * tool to fetch `document.project` mid-session (that is v2) — it only ever
 * shows what a `rheplicant_run`/`rheplicant_validate`/`rheplicant_gates` call
 * already left in the log.
 *
 * **There is no `<h2>Document</h2>` any more.** The host renders this tab's own
 * label — "Document", in the active-tab accent — directly above this component,
 * so the heading restated it in a weaker weight one pixel larger than the body
 * copy beneath. The block's header names what it holds; the tab names the tab.
 * "Grammar reference" keeps its heading because it is the only one of the two
 * that carries new information, and it now lives inside the section it names so
 * that landmark has an accessible name.
 *
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
      {fact === undefined ? (
        /* Inside the frame the document will occupy, so the inset has a body to
           be inside rather than floating on the tab's own ground. The hint
           names all THREE tools that record one — `rheplicant_gates` was
           missing, and it is one of the three events this view folds. */
        <div className={styles.block}>
          <div className={styles.emptyBody}>
            <EmptyState
              kind="waiting"
              message="No document in this session yet"
              hint="Ask the agent to author one via rheplicant_run, rheplicant_validate or rheplicant_gates"
            />
          </div>
        </div>
      ) : (
        <DocumentSource fact={fact} />
      )}
      <GrammarReference />
    </section>
  )
})
