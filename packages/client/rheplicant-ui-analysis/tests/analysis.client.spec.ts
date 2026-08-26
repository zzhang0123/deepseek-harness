import { describe, expect, it } from 'vitest'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ChatConversationViewNode,
  ConversationEventInput,
  ConversationNodeDefinition,
  ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import { analysisRunDefinition, type AnalysisRunChatData } from '../src/client/analysis-definition.ts'

interface ChatSnapshot {
  readonly nodes: ReadonlyMap<string, ChatConversationViewNode>
}

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] { return [analysisRunDefinition] }
  fallbackEntry(): undefined { return undefined }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] { return [chatViewDefinition] }
}

const chatViewDefinition: ConversationViewDefinition<ChatConversationViewNode, ChatSnapshot> = {
  target: 'chat',
  create: () => {
    let nodes = new Map<string, ChatConversationViewNode>()
    const snapshot = (): ChatSnapshot => ({ nodes })
    return {
      empty: snapshot(),
      replace: ({ nodes: values }) => {
        nodes = new Map(values.map(node => [node.key, node]))
        return snapshot()
      },
      apply: ({ upserts }) => {
        nodes = new Map(nodes)
        for (const node of upserts) nodes.set(node.key, node)
        return snapshot()
      },
    }
  },
}

function at(seq: number, type: string, data: unknown): ConversationEventInput {
  return { event: { seq, time: seq * 100, type, data } as ConversationEventInput['event'], view: undefined }
}

function assembler(entries: readonly ConversationEventInput[]): ConversationNodeAssembler {
  const value = new ConversationNodeAssembler(new TestEventDefinitions(), new TestViewDefinitions())
  value.replaceWindow(entries, false)
  value.flush()
  return value
}

function analysisData(value: ConversationNodeAssembler): AnalysisRunChatData | undefined {
  const snapshot = value.snapshot('chat') as ChatSnapshot
  return [...snapshot.nodes.values()][0]?.data as AnalysisRunChatData | undefined
}

function runEvents(): ConversationEventInput[] {
  return [
    at(1, 'turn/start', { turn: 1 }),
    at(2, 'step/start', { turn: 1, step: 1 }),
    at(3, 'rheplicant/run', {
      document: { schema_version: 1 },
      outcome: {
        runs: [
          { name: 'sim', kind: 'forward', status: 'ok' },
          { name: 'post', kind: 'predict', status: 'failed' },
        ],
        tookMs: 42,
      },
      transport: 'local',
    }),
    at(4, 'step/end', { turn: 1, step: 1 }),
    at(5, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ]
}

describe('rheplicant-analysis Conversation Definition', () => {
  it('folds a rheplicant/run event into one Chat node with the run list', () => {
    const value = assembler(runEvents())
    // Every run carries the PROVENANCE of the one event that produced it —
    // `time`/`transport`/`seq` are folded in from the owning `rheplicant/run`
    // event, not from the wire `RunEntry`, which carries none of them. That is
    // how two runs from different events with a byte-identical outcome (a rerun
    // with the same seed) still read as distinct cards instead of one repeated.
    const provenance = { time: 300, transport: 'local', seq: 3 }
    expect(analysisData(value)).toEqual({
      runs: [
        { name: 'sim', kind: 'forward', status: 'ok', ...provenance },
        { name: 'post', kind: 'predict', status: 'failed', ...provenance },
      ],
      tookMs: 42,
      // Not optional, and false here because this outcome reports no
      // `resultsPath`: an UNPUBLISHED run's event is the only record there is,
      // which is what decides whether the node keeps its arrays (§5).
      published: false,
    })
    const node = [...(value.snapshot('chat') as ChatSnapshot).nodes.values()][0]!
    expect(node.kind).toBe('rheplicant-analysis')
    expect(node.anchorSeq).toBe(3)
  })

  it('matches only rheplicant/run events, keyed by the event that produced them', () => {
    // ONE NODE PER EVENT, keyed by sequence number. A constant id would start
    // the same Context twice and the assembler throws ("received more than one
    // start Match") the moment a session runs a second analysis — which is the
    // normal case, not an edge case. This spec asserted the constant id for
    // months without noticing, because nothing ran it.
    expect(analysisRunDefinition.match(at(3, 'rheplicant/run', {}).event)).toEqual({ id: 'run-3', role: 'start' })
    expect(analysisRunDefinition.match(at(9, 'rheplicant/run', {}).event)).toEqual({ id: 'run-9', role: 'start' })
    expect(analysisRunDefinition.match(at(3, 'tool/result', {}).event)).toBeNull()
    expect(analysisRunDefinition.match(at(3, 'user/message', {}).event)).toBeNull()
  })
})
