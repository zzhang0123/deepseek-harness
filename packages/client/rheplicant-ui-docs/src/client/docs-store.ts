/**
 * Which documentation topic is open — remembered, like the section that holds
 * it.
 *
 * A module-level store for the same structural reason `ui-project`'s
 * `home-store` is one: the two halves of this feature sit in DIFFERENT slots
 * (`sidebar.nav` for the row, `section` for the page), so no React context
 * spans them. Both halves live in THIS plugin's single bundle, so they see one
 * module instance — the trick that would be unsafe in `ui-kit`, which is
 * inlined per consumer.
 *
 * **The topic persists and the section does not live here.** Where you are in
 * the app is `ui-project`'s one variable (see `section-bridge.ts`); where you
 * were in the documentation is this one. Keeping them apart is what lets a
 * reader leave for the workbench and come back to the paragraph they were on,
 * and it is why closing the section does not reset the topic.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/docs-store
 */

import { useSyncExternalStore } from 'react'

import { FIRST_TOPIC, locateTopic } from './outline.ts'

/**
 * Where the topic is remembered.
 *
 * The `<product>.<feature>.<thing>` convention the sibling stores already use
 * (`rheplicant.project.section`, `rheplicant.console.layout`).
 */
const TOPIC_KEY = 'rheplicant.docs.topic'

/**
 * Read the remembered topic.
 *
 * Guarded on every access: `localStorage` throws outright in a browser with
 * site data disabled, and a documentation page that failed to mount because it
 * could not remember your place would be worse than one that forgets. An id
 * this build does not know is discarded rather than trusted — storage outlives
 * the code that wrote it.
 *
 * @returns a topic id this build can render.
 */
function rememberedTopic(): string {
  try {
    const stored = globalThis.localStorage?.getItem(TOPIC_KEY)
    if (stored !== null && stored !== undefined && locateTopic(stored) !== undefined) return stored
  } catch {
    // Storage refused; the default is a correct answer, not a degraded one.
  }
  return FIRST_TOPIC
}

/** Remember the topic. A storage failure is not worth a broken page. */
function remember(topic: string): void {
  try {
    globalThis.localStorage?.setItem(TOPIC_KEY, topic)
  } catch {
    // The topic still works for this page load.
  }
}

let topic = rememberedTopic()
const listeners = new Set<() => void>()

/** Subscribe to topic changes; returns the unsubscribe. */
export function subscribeTopic(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Read the open topic without subscribing. */
export function readTopic(): string {
  return topic
}

/**
 * Open one topic.
 *
 * Unknown ids are accepted rather than refused: `resolveTopic` answers them at
 * render time with the first topic, so a stale link lands somewhere readable
 * instead of throwing, and the id is not written back to storage.
 *
 * @param next - the topic id to open.
 */
export function openTopic(next: string): void {
  if (next === topic) return
  topic = next
  if (locateTopic(next) !== undefined) remember(next)
  for (const listener of listeners) listener()
}

/** Reset to the first topic and forget. Exists for tests, which share storage. */
export function resetTopic(): void {
  topic = FIRST_TOPIC
  try {
    globalThis.localStorage?.removeItem(TOPIC_KEY)
  } catch {
    // Nothing to forget.
  }
  for (const listener of listeners) listener()
}

/** Subscribe a component to the open topic. */
export function useTopic(): string {
  // The third argument is the server snapshot: this plugin only runs in a
  // browser, but a pre-render has no storage to have remembered anything.
  return useSyncExternalStore(subscribeTopic, readTopic, () => FIRST_TOPIC)
}
