// @vitest-environment jsdom
/**
 * The outline's invariants.
 *
 * These are the assertions a reader cannot make for themselves: a topic with
 * no chapter renders a title, a lede-shaped hole and nothing else, and no
 * error anywhere says so. The same silence covers a duplicated id (two rows,
 * one of which can never be reached) and a reading order that has drifted from
 * the rail.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { CHAPTERS } from '../src/client/chapters/index.ts'
import {
  FIRST_TOPIC, PARTS, TOPICS, filterTopics, locateTopic, resolveTopic,
} from '../src/client/outline.ts'
import { openTopic, readTopic, resetTopic } from '../src/client/docs-store.ts'

describe('the outline', () => {
  it('gives every topic a chapter', () => {
    const missing = TOPICS.filter(topic => CHAPTERS[topic.id] === undefined).map(t => t.id)
    expect(missing).toEqual([])
  })

  it('has no chapter for a topic the outline dropped', () => {
    const ids = new Set(TOPICS.map(topic => topic.id))
    expect(Object.keys(CHAPTERS).filter(id => !ids.has(id))).toEqual([])
  })

  it('gives every topic a unique id', () => {
    expect(new Set(TOPICS.map(topic => topic.id)).size).toBe(TOPICS.length)
  })

  it('derives the reading order from the parts, in part order', () => {
    expect(TOPICS.map(topic => topic.id))
      .toEqual(PARTS.flatMap(part => part.topics.map(topic => topic.id)))
  })

  it('starts at a topic that exists', () => {
    expect(locateTopic(FIRST_TOPIC)).toBeDefined()
  })

  it('locates a topic with its part and its place in the order', () => {
    const found = locateTopic('l1-seam')
    expect(found?.part.id).toBe('anatomy')
    expect(TOPICS[found?.index ?? -1]?.id).toBe('l1-seam')
  })

  it('answers an unknown id with the first topic rather than throwing', () => {
    // Storage outlives the code that wrote it and a shared link outlives the
    // heading it names, so this path is ordinary rather than exceptional.
    expect(resolveTopic('a-topic-from-an-older-build').topic.id).toBe(FIRST_TOPIC)
  })
})

describe('the filter', () => {
  it('matches everything when blank', () => {
    expect(filterTopics('   ').size).toBe(TOPICS.length)
  })

  it('matches a title', () => {
    expect(filterTopics('trigger')).toContain('triggers')
  })

  it('matches a blurb, not only a title', () => {
    // "transport" appears in l1-seam's blurb and in no topic title.
    expect(filterTopics('transports')).toContain('l1-seam')
  })

  it('matches a layer tag, and the overview that names the layer', () => {
    // Two hits, and both are wanted: the L4 chapter carries the tag, and the
    // layer-stack overview says "L0 to L4" in its blurb. Someone typing L4 is
    // looking for either.
    expect(filterTopics('L4')).toEqual(new Set(['layers', 'l4-distribution']))
  })

  it('narrows on a second term rather than widening', () => {
    const one = filterTopics('the')
    const two = filterTopics('the harness')
    expect(two.size).toBeLessThan(one.size)
    for (const id of two) expect(one).toContain(id)
  })

  it('is case-insensitive', () => {
    expect(filterTopics('SCHEDULING')).toEqual(filterTopics('scheduling'))
  })
})

describe('the remembered topic', () => {
  beforeEach(() => { resetTopic() })

  it('starts at the first topic', () => {
    expect(readTopic()).toBe(FIRST_TOPIC)
  })

  it('remembers an opened topic across a read', () => {
    openTopic('wire')
    expect(readTopic()).toBe('wire')
    expect(globalThis.localStorage.getItem('rheplicant.docs.topic')).toBe('wire')
  })

  it('does not persist an id this build cannot render', () => {
    openTopic('not-a-topic')
    // Held for this page load — `resolveTopic` answers it — but never written
    // back, so the next load is not pinned to a page that does not exist.
    expect(readTopic()).toBe('not-a-topic')
    expect(globalThis.localStorage.getItem('rheplicant.docs.topic')).toBeNull()
  })
})
