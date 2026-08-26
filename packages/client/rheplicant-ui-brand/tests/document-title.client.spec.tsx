// @vitest-environment jsdom
/**
 * The browser tab title, and the ordering it rests on.
 *
 * `DSH_CLIENT_TITLE` is baked at build time and `--profile official` pins it to
 * "DeepSeek Harness"; `scripts/release/pack.ts` then refuses to pack the dsh
 * family from any other profile. So the tab title is owned at RUNTIME instead,
 * from a seat this package already occupies.
 *
 * **The second describe is the load-bearing one.** It reproduces `app.tsx`'s
 * shape — `<SessionDocumentTitle />` as a sibling BEFORE
 * `renderSlot('root', {})` — because that sibling order is the entire reason
 * this works, and nothing in dsh states it as a contract. If someone moves
 * `<SessionDocumentTitle />` after the slot, the tab silently reverts and only
 * this spec notices.
 */
import { useEffect } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PRODUCT_TITLE, RheplicantDocumentTitle, browserTitle } from '../src/client/Brand.tsx'

afterEach(() => { cleanup(); document.title = '' })

/** A `useSessions` that answers one fixed list state. */
function sessions(current: string | undefined, titles: Record<string, string> = {}) {
  const state = {
    current,
    byId: Object.fromEntries(Object.entries(titles).map(([id, title]) => [id, { title }])),
  }
  return (<T,>(select: (s: typeof state) => T): T => select(state)) as never
}

describe('what the tab says', () => {
  it('is the product alone when no session is current', () => {
    render(<RheplicantDocumentTitle useSessions={sessions(undefined)} />)
    expect(document.title).toBe('rheplicant')
  })

  it('is "<session> — <product>" when one is', () => {
    render(<RheplicantDocumentTitle useSessions={sessions('s1', { s1: 'Test' })} />)
    expect(document.title).toBe('Test — rheplicant')
  })

  it('falls back to the product when the current session has no title yet', () => {
    // A session exists but its durable title has not arrived. dsh's own
    // component treats that as "no title"; a tab reading "undefined —
    // rheplicant" would be the alternative.
    render(<RheplicantDocumentTitle useSessions={sessions('s1')} />)
    expect(document.title).toBe('rheplicant')
  })

  it('composes the way dsh composes, em dash included', () => {
    // Same separator as `DocumentTitle`, because this REPLACES that string
    // rather than competing with it — a tab that changed punctuation as well
    // as product name would read as two different apps.
    expect(browserTitle(undefined)).toBe(PRODUCT_TITLE)
    expect(browserTitle('Run')).toBe(`Run — ${PRODUCT_TITLE}`)
  })
})

describe('the sibling ordering this rests on', () => {
  /** Stand-in for dsh's `<SessionDocumentTitle />`. */
  function DshTitle({ text }: { text: string }) {
    useEffect(() => { document.title = text })
    return null
  }

  it('wins against dsh, because the slot subtree renders after it', () => {
    // `app.tsx`: <SessionDocumentTitle /> then renderSlot('root', {}).
    render(
      <>
        <DshTitle text="Test — DeepSeek Harness" />
        <div>
          <RheplicantDocumentTitle useSessions={sessions('s1', { s1: 'Test' })} />
        </div>
      </>,
    )
    expect(document.title).toBe('Test — rheplicant')
  })

  it('LOSES if that order is ever reversed — which is what this spec is for', () => {
    // Not a curiosity: it is the failure mode. React runs sibling effects in
    // tree order, so moving `<SessionDocumentTitle />` below the slot would
    // hand the tab back with no other symptom.
    render(
      <>
        <div>
          <RheplicantDocumentTitle useSessions={sessions('s1', { s1: 'Test' })} />
        </div>
        <DshTitle text="Test — DeepSeek Harness" />
      </>,
    )
    expect(document.title).toBe('Test — DeepSeek Harness')
  })
})
