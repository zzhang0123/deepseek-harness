/**
 * Console panel occupant for the exact config document: the same read-only
 * block the Document tab renders, without the grammar reference (that stays
 * tab-only — a reference, not an at-a-glance instrument reading). Reads only
 * this package's own `rheplicant-document` conversation-view projection;
 * never calls compute (§5 of docs/architecture.md).
 * @module @rheplicant/dsh-rheplicant-ui-document/client/DocumentPanel
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { EmptyState, Panel, type PanelStatus } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { DocumentSource } from './DocumentSource.tsx'

interface DocumentPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

export const DocumentPanel = memo(function DocumentPanel({ useSession }: DocumentPanelProps) {
  const fact = useSession(snapshot => snapshot.views.get('rheplicant-document')?.latest)
  const status: PanelStatus = fact === undefined ? 'idle' : 'ok'

  return (
    <Panel id="document" title="Document" status={status} span={2}>
      {fact === undefined ? (
        <EmptyState
          message="No document in this session yet"
          hint="Ask the agent to author one via rheplicant_run or rheplicant_validate"
        />
      ) : (
        <DocumentSource fact={fact} />
      )}
    </Panel>
  )
})
