/**
 * The documentation section: a navigation rail and one chapter.
 *
 * A `section` occupant, so it is a PEER of the conversation inside the
 * conversation's own column rather than an overlay floating above every
 * column. `ui-project`'s stylesheet records what the overlay seat cost: an
 * occupant there has to reconstruct where the sidebar ends, the frame publishes
 * its track widths only as an inline `gridTemplateColumns`, and the guess was
 * wrong at every width. Here the column is the geometry.
 *
 * **It renders nothing unless it is the section on screen.** That is the whole
 * contract of a `section` entry — the slot is a list and every occupant paints
 * when it decides to — and it is why the register it reads lives in one place
 * for all of them (`section-bridge.ts`).
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/DocsPage
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { CHAPTERS } from './chapters/index.ts'
import { DOCS_SECTION, goToSection, useSection } from './section-bridge.ts'
import { IconSwitch } from './DocsIcons.tsx'
import { openTopic, useTopic } from './docs-store.ts'
import { PARTS, TOPICS, filterTopics, resolveTopic } from './outline.ts'
import { cx } from './prose.tsx'
import styles from './docs.module.css'

/** One row of the navigation rail. */
const Row = memo(function Row(
  {
    id, title, layer, current,
  }: {
    readonly id: string; readonly title: string
    readonly layer: string | undefined; readonly current: boolean
  },
) {
  return (
    <button
      type="button"
      className={cx(styles.row, current && styles.rowOn)}
      data-docs-row={id}
      // `aria-current="page"` rather than `aria-pressed`: these are not
      // toggles, they are the places this document has, and exactly one of
      // them is the one being read.
      aria-current={current ? 'page' : undefined}
      onClick={() => { openTopic(id) }}
    >
      {layer !== undefined && <span className={cx(styles.rowLayer)}>{layer}</span>}
      <span>{title}</span>
    </button>
  )
})

/** The previous/next footer. */
function Pager({ index }: { readonly index: number }): ReactNode {
  const previous = index > 0 ? TOPICS[index - 1] : undefined
  const next = index < TOPICS.length - 1 ? TOPICS[index + 1] : undefined
  if (previous === undefined && next === undefined) return null
  return (
    <nav className={cx(styles.pager)} aria-label="Chapter">
      {previous !== undefined && (
        <button
          type="button"
          className={cx(styles.pagerLink)}
          data-docs-prev={previous.id}
          onClick={() => { openTopic(previous.id) }}
        >
          <span className={cx(styles.pagerDir)}>Previous</span>
          <span className={cx(styles.pagerTitle)}>{previous.title}</span>
        </button>
      )}
      {next !== undefined && (
        <button
          type="button"
          className={cx(styles.pagerLink, styles.pagerNext)}
          data-docs-next={next.id}
          onClick={() => { openTopic(next.id) }}
        >
          <span className={cx(styles.pagerDir)}>Next</span>
          <span className={cx(styles.pagerTitle)}>{next.title}</span>
        </button>
      )}
    </nav>
  )
}

/** The documentation page. */
export const DocsPage = memo(function DocsPage(): ReactNode {
  const section = useSection()
  const topicId = useTopic()
  const [query, setQuery] = useState('')
  const article = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => filterTopics(query), [query])
  const { part, topic, index } = resolveTopic(topicId)
  const chapter = CHAPTERS[topic.id]

  // A new chapter starts at its own beginning. Without this the reader keeps
  // the previous chapter's scroll offset and lands in the middle of a table.
  //
  // `scrollTop`, not `scrollTo({top: 0})`: the optional chain guards a null
  // ref, never a missing METHOD, and `Element.scrollTo` is absent in jsdom —
  // so the smooth-looking call threw inside a passive effect and took every
  // render of this component down with it. The plain property exists on every
  // Element and is what actually resets a scroll container.
  useEffect(() => {
    const box = article.current
    if (box !== null) box.scrollTop = 0
  }, [topic.id])

  // Not the section on screen: paint nothing, so the transcript underneath is
  // the thing the reader sees. This is the `section` slot's whole contract.
  if (section !== DOCS_SECTION) return null

  return (
    <div className={cx(styles.layer)} data-docs-section="">
      <div className={cx(styles.page)}>
        <header className={cx(styles.head)}>
          <span className={cx(styles.mark)}><IconSwitch size={18} /></span>
          <div className={cx(styles.headText)}>
            <h1 className={cx(styles.headTitle)}>Documentation</h1>
            <span className={cx(styles.headSub)}>
              rheplicant-agent — the analysis layer over the telescope twin
            </span>
          </div>
          <button
            type="button"
            className={cx(styles.headAction)}
            data-docs-leave=""
            onClick={() => { goToSection('conversation') }}
          >
            Conversation
          </button>
        </header>

        <div className={cx(styles.body)}>
          <nav className={cx(styles.rail)} aria-label="Documentation">
            <input
              type="search"
              className={cx(styles.filter)}
              data-docs-filter=""
              placeholder="Filter topics"
              aria-label="Filter topics"
              value={query}
              onChange={event => { setQuery(event.target.value) }}
            />
            {PARTS.map(group => {
              const rows = group.topics.filter(entry => visible.has(entry.id))
              if (rows.length === 0) return null
              return (
                <div key={group.id} className={cx(styles.part)} data-docs-part={group.id}>
                  <div className={cx(styles.partHead)}>
                    <span className={cx(styles.partTitle)}>{group.title}</span>
                  </div>
                  {rows.map(entry => (
                    <Row
                      key={entry.id}
                      id={entry.id}
                      title={entry.title}
                      layer={entry.layer}
                      current={entry.id === topic.id}
                    />
                  ))}
                </div>
              )
            })}
            {visible.size === 0 && (
              <p className={cx(styles.railEmpty)} data-docs-no-match="">
                No topic matches “{query}”.
              </p>
            )}
          </nav>

          <div className={cx(styles.article)} ref={article}>
            <article className={cx(styles.articleInner)} data-docs-topic={topic.id}>
              <div className={cx(styles.crumb)}>
                <span className={cx(styles.crumbPart)}>{part.title}</span>
                <span aria-hidden="true">›</span>
                <span>{part.question}</span>
              </div>
              <h2 className={cx(styles.topicTitle)}>{topic.title}</h2>
              {chapter !== undefined && (
                <>
                  <p className={cx(styles.lede)}>{chapter.lede}</p>
                  <chapter.Body />
                </>
              )}
              <Pager index={index} />
            </article>
          </div>
        </div>
      </div>
    </div>
  )
})
