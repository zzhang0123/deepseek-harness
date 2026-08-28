/**
 * The chapter registry: every topic id in the outline, bound to what renders
 * it.
 *
 * One record rather than a switch, so "does every topic have a chapter" is a
 * key comparison a test can make rather than a branch a reader has to walk.
 * The outline owns the order and the titles; this owns the opening sentence
 * and the body. Splitting them that way is what lets the navigation rail, the
 * filter and the pager exist without importing a single component.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/chapters
 */

import type { ReactNode } from 'react'

import { Layers, Repositories, WhatThisIs } from './orientation.tsx'
import { Compute, Harness, Seam, Tools } from './anatomy.tsx'
import { Composition, Distribution, Surfaces } from './surface.tsx'
import { Dataflow, Entities, OnDisk, Wire } from './contracts.tsx'
import { Analysis, Operating, PluginGuide, Rules, Triggers } from './working.tsx'

/** One chapter: the sentence that opens it, and the body under that. */
export interface Chapter {
  /** Shown large under the title. One sentence — it is the whole page's claim. */
  readonly lede: string
  /** The body, as a component so nothing renders until its topic is chosen. */
  readonly Body: () => ReactNode
}

/** Every topic id in `outline.ts`, bound to its chapter. */
export const CHAPTERS: Readonly<Record<string, Chapter>> = {
  'what-this-is': {
    lede: 'A radio-telescope digital twin, driven from a chat console. The agent writes one '
      + 'configuration document and runs it; every product of every step arrives as an auditable panel.',
    Body: WhatThisIs,
  },
  'repositories': {
    lede: 'The engine sits on a science stack of its own and the harness sits on nothing here. '
      + 'They share no edge, and the direction never reverses.',
    Body: Repositories,
  },
  'layers': {
    lede: 'Five layers. The bottom one is a dependency; the four above it are this repository, and '
      + 'each owns one question.',
    Body: Layers,
  },
  'l0-harness': {
    lede: 'DeepSeek Harness supplies the plugin system, the session log, the agent loop and the '
      + 'surfaces a plugin can occupy. It is consumed read-only.',
    Body: Harness,
  },
  'l1-seam': {
    lede: 'One service fronts three transports. Moving a computation to another machine is a field '
      + 'in a request, not a different build.',
    Body: Seam,
  },
  'l1-tools': {
    lede: 'Five verbs the model may use — and the two refusals every one of them that takes a task '
      + 'file shares.',
    Body: Tools,
  },
  'l1-compute': {
    lede: 'A thin JSON-RPC service over the engine’s configuration layer: eight methods, two '
      + 'transports, and exactly one wire encoder.',
    Body: Compute,
  },
  'l2-surfaces': {
    lede: 'Eleven browser plugins, none of which replaces anything the harness ships.',
    Body: Surfaces,
  },
  'l3-composition': {
    lede: 'Nothing is wired by imports. A profile patches the composed plugin tree, and says which '
      + 'rows exist with what configuration.',
    Body: Composition,
  },
  'l4-distribution': {
    lede: 'A harness that shares nothing with a development checkout — its own packages, profile, '
      + 'home and port — built from one package table by four CI lanes.',
    Body: Distribution,
  },
  'dataflow': {
    lede: 'Six stages from a sentence in chat to a directory on disk, and two readers of that '
      + 'directory that never consult each other.',
    Body: Dataflow,
  },
  'wire': {
    lede: 'What comes back from a run: an outcome, one of three products per exit, and the '
      + 'diagnostics that decide whether any of it is an answer.',
    Body: Wire,
  },
  'entities': {
    lede: 'Four entities and what identifies each — the model that answers "several workspaces, '
      + 'several sessions, several runs: what am I looking at?"',
    Body: Entities,
  },
  'on-disk': {
    lede: 'The workspace directory is the project, and the tree under results/ is the record.',
    Body: OnDisk,
  },
  'operating': {
    lede: 'Four steps to a running console on port 3099, and the one variable that must never '
      + 'default.',
    Body: Operating,
  },
  'analysis': {
    lede: 'Write a document, price the gates, run the exits, read the panels.',
    Body: Analysis,
  },
  'triggers': {
    lede: 'A project can ask to run on its own, and a board says what will happen next — within '
      + 'one limitation stated first, because it decides whether the feature is worth having.',
    Body: Triggers,
  },
  'plugin-guide': {
    lede: 'Three rules, one slot, one row in one package table, and a round trip that ends in a '
      + 'booting harness.',
    Body: PluginGuide,
  },
  'rules': {
    lede: 'Nine rules that settle arguments here. Each was paid for once.',
    Body: Rules,
  },
}
