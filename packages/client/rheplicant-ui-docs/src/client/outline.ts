/**
 * The table of contents: four parts, nineteen topics, as DATA.
 *
 * Pure data with no React in it, for two reasons that are the same reason. The
 * navigation rail, the breadcrumb, the previous/next footer and the filter all
 * need to know the same shape, and a component tree cannot be asked what comes
 * after chapter seven. And a reader arriving at a topic id that no longer
 * exists — a remembered one, a stale link — has to be answered rather than
 * shown a blank column, which is a lookup, not a render.
 *
 * **Order here IS the reading order.** `TOPICS` is the flattened sequence the
 * footer steps through, derived from `PARTS` rather than restated beside it:
 * two lists of the same nineteen names is the shape every drift in this repo
 * has taken (see `scripts/packages.mjs`, which exists because six copies of
 * one package list had gone out of step).
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/outline
 */

/** One topic: a page of the documentation. */
export interface Topic {
  /** Stable id — remembered in storage and used as the heading anchor. */
  readonly id: string
  /** The rail's label, and the page's own heading. */
  readonly title: string
  /** One line under the title in the rail, and the search text. */
  readonly blurb: string
  /** The layer this topic describes, when it describes exactly one. */
  readonly layer?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
}

/** One part: a group of topics with a shared question. */
export interface Part {
  readonly id: string
  readonly title: string
  /** What this part answers, shown once above its rows. */
  readonly question: string
  readonly topics: readonly Topic[]
}

/** The whole outline. */
export const PARTS: readonly Part[] = [
  {
    id: 'orientation',
    title: 'Orientation',
    question: 'What is this, and what is it made of?',
    topics: [
      {
        id: 'what-this-is',
        title: 'What this is',
        blurb: 'A radio-telescope digital twin, driven from a chat console.',
      },
      {
        id: 'repositories',
        title: 'The dependency graph',
        blurb: 'The science stack, the harness, and the one layer that knows both.',
      },
      {
        id: 'layers',
        title: 'The layer stack',
        blurb: 'L0 to L4, and which one owns what.',
      },
    ],
  },
  {
    id: 'anatomy',
    title: 'Anatomy',
    question: 'How does each layer actually work?',
    topics: [
      {
        id: 'l0-harness',
        title: 'L0 · The harness',
        blurb: 'What DeepSeek Harness supplies, and why it is never forked.',
        layer: 'L0',
      },
      {
        id: 'l1-seam',
        title: 'L1 · The compute seam',
        blurb: 'ctx.rheplicant, three transports, one routing rule.',
        layer: 'L1',
      },
      {
        id: 'l1-tools',
        title: 'L1 · The tools',
        blurb: 'The five verbs a model may use, and what each refuses.',
        layer: 'L1',
      },
      {
        id: 'l1-compute',
        title: 'L1 · The compute service',
        blurb: 'Eight JSON-RPC methods over rheplicant.config, and the wire rules.',
        layer: 'L1',
      },
      {
        id: 'l2-surfaces',
        title: 'L2 · The surfaces',
        blurb: 'Sections, panels, slots — everything the browser draws.',
        layer: 'L2',
      },
      {
        id: 'l3-composition',
        title: 'L3 · Composition',
        blurb: 'The profile: which rows mount, in which order, and why.',
        layer: 'L3',
      },
      {
        id: 'l4-distribution',
        title: 'L4 · Distribution',
        blurb: 'An independent harness, twenty-one tarballs, four CI lanes.',
        layer: 'L4',
      },
    ],
  },
  {
    id: 'contracts',
    title: 'Contracts',
    question: 'What travels, and what is written down?',
    topics: [
      {
        id: 'dataflow',
        title: 'The path of one run',
        blurb: 'From a sentence in chat to a directory on disk.',
      },
      {
        id: 'wire',
        title: 'The wire contract',
        blurb: 'RunOutcome, the three products, and the diagnostics that gate them.',
      },
      {
        id: 'entities',
        title: 'Projects, tasks, executions',
        blurb: 'Four entities, and what identifies each.',
      },
      {
        id: 'on-disk',
        title: 'What lands on disk',
        blurb: 'The results tree, the marker, and the state directory.',
      },
    ],
  },
  {
    id: 'working',
    title: 'Working with it',
    question: 'How do I run it, and how do I extend it?',
    topics: [
      {
        id: 'operating',
        title: 'Running the harness',
        blurb: 'Its own home, its own port, its own packages — from source or from the container.',
      },
      {
        id: 'analysis',
        title: 'Running an analysis',
        blurb: 'Write a document, check the gates, run it, read the panels.',
      },
      {
        id: 'triggers',
        title: 'Scheduling',
        blurb: 'The board, what a trigger is, and the limitation it states first.',
      },
      {
        id: 'plugin-guide',
        title: 'Building a panel',
        blurb: 'Three rules, one slot, and the packaging round trip.',
      },
      {
        id: 'rules',
        title: 'The design rules',
        blurb: 'The nine that decide arguments here.',
      },
    ],
  },
]

/** Every topic in reading order, derived from {@link PARTS}. */
export const TOPICS: readonly Topic[] = PARTS.flatMap(part => part.topics)

/** The topic a reader lands on with nothing remembered. */
export const FIRST_TOPIC = 'what-this-is'

/** One topic and the part holding it. */
export interface TopicLocation {
  readonly part: Part
  readonly topic: Topic
  /** Index into {@link TOPICS}, so the footer can step. */
  readonly index: number
}

/**
 * Find a topic by id.
 *
 * @param id - the topic id, possibly stale or invented.
 * @returns its location, or undefined when this build has no such topic.
 */
export function locateTopic(id: string): TopicLocation | undefined {
  for (const part of PARTS) {
    for (const topic of part.topics) {
      if (topic.id !== id) continue
      return { part, topic, index: TOPICS.indexOf(topic) }
    }
  }
  return undefined
}

/**
 * Resolve a possibly-unknown id to one this build can render.
 *
 * Storage outlives the code that wrote it and a shared link outlives the
 * heading it names, so an unknown id is ORDINARY rather than exceptional. It
 * resolves to the first topic, which is the one page that assumes no prior
 * reading.
 *
 * @param id - the requested topic id.
 * @returns a location that always exists.
 */
export function resolveTopic(id: string): TopicLocation {
  const found = locateTopic(id)
  if (found !== undefined) return found
  // FIRST_TOPIC is a member of PARTS by construction; the test pins it.
  return locateTopic(FIRST_TOPIC) as TopicLocation
}

/**
 * The topics whose title or blurb contains every whitespace-separated term.
 *
 * Every term, not any: typing two words narrows, which is what a reader
 * filtering nineteen rows means by adding one. Matching is case-insensitive
 * and substring-based — there are nineteen rows, so nothing here needs to be
 * cleverer than that.
 *
 * @param query - the raw filter text; blank matches everything.
 * @returns the matching topic ids.
 */
export function filterTopics(query: string): ReadonlySet<string> {
  const terms = query.toLowerCase().split(/\s+/u).filter(term => term !== '')
  if (terms.length === 0) return new Set(TOPICS.map(topic => topic.id))
  const hits = new Set<string>()
  for (const topic of TOPICS) {
    const hay = `${topic.title} ${topic.blurb} ${topic.layer ?? ''}`.toLowerCase()
    if (terms.every(term => hay.includes(term))) hits.add(topic.id)
  }
  return hits
}
