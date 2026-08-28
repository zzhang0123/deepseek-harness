/**
 * The block vocabulary every chapter is written in.
 *
 * A fixed set of forms rather than free JSX per chapter, for the reason a
 * design system exists at all: nineteen pages written by hand drift into
 * nineteen looks, and the reader pays for it by having to re-learn where the
 * information is on every page. Each form here means ONE thing — a table is a
 * closed set of named things, `Steps` is a sequence you perform, `Note kind
 *="rule"` is a decision that settles arguments, `kind="quiet"` is a failure
 * that produces no error — so the shape of a page is already a claim about
 * what is on it.
 *
 * The primitives are presentational and take no state: a chapter is a pure
 * function of nothing, which is what lets the whole set be rendered in a test
 * without a session, a service or a compute call.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/prose
 */

import type { ReactNode } from 'react'

import styles from './docs.module.css'

/**
 * Join class names, dropping the absent ones.
 *
 * `noUncheckedIndexedAccess` types every CSS Module lookup as possibly
 * `undefined`, so the alternative is `?? ''` on every single read (the idiom
 * `ui-kit`'s `Badge.tsx` records). One helper says "known to exist" once.
 *
 * @param names - class names, or nothing.
 * @returns the space-joined class attribute.
 */
export function cx(...names: readonly (string | undefined | false)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')
}

/** A section heading with the hairline that closes it. */
export function H2({ children }: { readonly children: ReactNode }): ReactNode {
  return <h2 className={cx(styles.h2)}>{children}</h2>
}

/** A subheading inside a section. */
export function H3({ children }: { readonly children: ReactNode }): ReactNode {
  return <h3 className={cx(styles.h3)}>{children}</h3>
}

/** A paragraph. `muted` drops it to the secondary label colour. */
export function P(
  { children, muted }: { readonly children: ReactNode; readonly muted?: boolean },
): ReactNode {
  return <p className={cx(styles.p, muted === true && styles.pMuted)}>{children}</p>
}

/** A bulleted list. */
export function UL({ children }: { readonly children: ReactNode }): ReactNode {
  return <ul className={cx(styles.list)}>{children}</ul>
}

/** Inline code — an identifier, a path, a flag. */
export function C({ children }: { readonly children: ReactNode }): ReactNode {
  return <code className={cx(styles.code)}>{children}</code>
}

/** A term being defined, emphasised without italics. */
export function T({ children }: { readonly children: ReactNode }): ReactNode {
  return <strong className={cx(styles.term)}>{children}</strong>
}

/** A code block, captioned with what it is. */
export function Code(
  { caption, children }: { readonly caption?: string; readonly children: string },
): ReactNode {
  return (
    <div className={cx(styles.block)} data-docs-code="">
      {caption !== undefined && <div className={cx(styles.blockHead)}>{caption}</div>}
      <pre className={cx(styles.pre)}>{children}</pre>
    </div>
  )
}

/** A file tree, drawn as preformatted text with no panel chrome. */
export function Tree({ children }: { readonly children: string }): ReactNode {
  return <div className={cx(styles.tree)} data-docs-tree="">{children}</div>
}

/** A table of a closed set of named things. */
export function Table(
  {
    head, rows,
  }: {
    readonly head: readonly string[]
    readonly rows: readonly (readonly ReactNode[])[]
  },
): ReactNode {
  return (
    <div className={cx(styles.tableWrap)}>
      <table className={cx(styles.table)} data-docs-table="">
        <thead>
          <tr>{head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            // Row order is the content and never reorders, so the index is a
            // stable key here — there is no list to add to or sort.
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cx(cellIndex === 0 && styles.tableKey)}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** What a callout is claiming. */
export type NoteKind = 'rule' | 'quiet' | 'aside'

const NOTE_CLASS: Record<NoteKind, string | undefined> = {
  rule: styles.noteRule,
  quiet: styles.noteQuiet,
  aside: styles.noteAside,
}

const NOTE_MARK: Record<NoteKind, string> = {
  rule: 'Rule',
  // Named for the failure mode rather than for a severity: what makes these
  // worth a callout is that nothing throws and nothing logs.
  quiet: 'Quiet failure',
  aside: 'Note',
}

/** A callout. `rule` settles arguments; `quiet` is a failure with no error. */
export function Note(
  {
    kind = 'aside', children,
  }: { readonly kind?: NoteKind; readonly children: ReactNode },
): ReactNode {
  return (
    <div className={cx(styles.note, NOTE_CLASS[kind])} data-docs-note={kind}>
      <span className={cx(styles.noteMark)}>{NOTE_MARK[kind]}</span>
      <div className={cx(styles.noteBody)}>{children}</div>
    </div>
  )
}

/** One card in a {@link Cards} grid. */
export interface CardItem {
  readonly tag?: string
  readonly title: string
  readonly body: ReactNode
}

/** A grid of peers — things of one kind, none of them first. */
export function Cards({ items }: { readonly items: readonly CardItem[] }): ReactNode {
  return (
    <div className={cx(styles.cards)} data-docs-cards="">
      {items.map(item => (
        <div key={item.title} className={cx(styles.card)}>
          {item.tag !== undefined && <span className={cx(styles.cardTag)}>{item.tag}</span>}
          <span className={cx(styles.cardTitle)}>{item.title}</span>
          <div className={cx(styles.cardBody)}>{item.body}</div>
        </div>
      ))}
    </div>
  )
}

/** One step in a {@link Steps} sequence. */
export interface StepItem {
  readonly title: string
  readonly body: ReactNode
}

/** A sequence you perform, in order. */
export function Steps({ items }: { readonly items: readonly StepItem[] }): ReactNode {
  return (
    <ol className={cx(styles.steps)} data-docs-steps="">
      {items.map(item => (
        <li key={item.title} className={cx(styles.step)}>
          <p className={cx(styles.stepTitle)}>{item.title}</p>
          <div className={cx(styles.stepBody)}>{item.body}</div>
        </li>
      ))}
    </ol>
  )
}

/** A diagram with the sentence it is making. */
export function Figure(
  { caption, children }: { readonly caption: ReactNode; readonly children: ReactNode },
): ReactNode {
  return (
    <figure className={cx(styles.figure)} data-docs-figure="">
      <div className={cx(styles.figureCanvas)}>{children}</div>
      <figcaption className={cx(styles.figureCaption)}>{caption}</figcaption>
    </figure>
  )
}

/** A short list of settled facts — the answer, before the explanation. */
export function Facts(
  { rows }: { readonly rows: readonly (readonly [string, ReactNode])[] },
): ReactNode {
  return (
    <div className={cx(styles.facts)} data-docs-facts="">
      {rows.map(([key, value]) => (
        <div key={key} style={{ display: 'contents' }}>
          <span className={cx(styles.factKey)}>{key}</span>
          <span className={cx(styles.factValue)}>{value}</span>
        </div>
      ))}
    </div>
  )
}

/** An unordered set of short literal names. */
export function Pills({ items }: { readonly items: readonly string[] }): ReactNode {
  return (
    <div className={cx(styles.pills)} data-docs-pills="">
      {items.map(item => <span key={item} className={cx(styles.pill)}>{item}</span>)}
    </div>
  )
}
