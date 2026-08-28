/**
 * Part I — Orientation: what this is, what it is made of, how it is layered.
 *
 * These three pages assume no prior reading, which is the constraint that
 * shapes them: every later chapter may name `ctx.rheplicant` or `results/`
 * without introducing it, and these may not.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/chapters/orientation
 */

import type { ReactNode } from 'react'

import { LayerDiagram } from '../Diagrams.tsx'
import { RepoDiagram } from '../RepoDiagram.tsx'
import { C, Cards, Facts, Figure, H2, Note, P, T, Table, UL } from '../prose.tsx'

/** What this is. */
export function WhatThisIs(): ReactNode {
  return (
    <>
      <H2>The instrument</H2>
      <P>
        <T>rheplicant</T> is “a REPLICa of an ANTenna”: a JAX model of a radio telescope, run as a
        digital twin. One twin is one pure function — sky and instrument parameters in, raw data
        out — and it is differentiable end to end, so the same object that <em>simulates</em> an
        observation is the one that <em>calibrates</em> against a real one.
      </P>
      <Note kind="rule">
        The calibration you fit is the simulator you trust. Four capabilities read the same twin and
        none of them is a separate mode: forward modelling, Bayesian inference (the noise model
        <em> is</em> the likelihood), neural surrogates, and streaming evidence.
      </Note>
      <P>
        The twin is configured by one YAML document. <C>runs:</C> is an ordered list of exits, and
        rheplicant’s own checks — identifiability, condition number, joint χ², r̂ — are the gates
        between them. Nothing here reimplements that. The agent writes the document.
      </P>

      <H2>What this repository adds</H2>
      <Cards
        items={[
          {
            tag: 'Python',
            title: 'A compute service',
            body: <>A thin JSON-RPC face over <C>rheplicant.config</C>, reachable over stdio or as
              an HTTP daemon. It is the only thing here that parses the grammar.</>,
          },
          {
            tag: 'TypeScript',
            title: 'A set of plugins',
            body: <>A capability seam, five model-facing tools, and eleven browser plugins that turn a
              chat harness into an observation console.</>,
          },
          {
            tag: 'Ops',
            title: 'A distribution',
            body: <>An independent harness, twenty-one packed tarballs, a container image and four CI
              lanes — so none of this needs a development checkout to run.</>,
          },
        ]}
      />

      <H2>What it is not</H2>
      <UL>
        <li>
          <T>Not a pipeline builder.</T> You declare a set of operators and <C>assemble</C> reads
          the canonical signal path to decide what joins to what, so the composition is a
          consequence of the physics you declared rather than something you drew.
        </li>
        <li>
          <T>Not a fork.</T> The harness is consumed read-only; the one change it needed travels as
          a local patch and an upstream proposal.
        </li>
        <li>
          <T>Not a second configuration format.</T> Every surface here is another view of the same
          YAML document.
        </li>
      </UL>
      <Note kind="rule">
        The document is the product; chat is the process. Exact accepted YAML remains the sole
        scientific state, and the recorded input is the input that actually ran.
      </Note>

      <H2>At a glance</H2>
      <Facts
        rows={[
          ['Engine', <><C>rheplicant</C> — core, radio, inference, config; on JAX, Equinox,
            <C>limTOD</C> and <C>bayesmith</C></>],
          ['Harness', <>DeepSeek Harness — TypeScript, Cordis plugins, web console</>],
          ['This layer', <>22 packages — 7 host, 3 host-only, 1 inlined library, 11 browser;
            21 of them ship as tarballs</>],
          ['Console port', <><C>3099</C>, so a DeepSeek Harness of your own keeps 3080</>],
          ['Model', <>whatever your <C>llm-pi-ai</C> settings name — no default is baked in</>],
        ]}
      />
    </>
  )
}

/** The dependency graph. */
export function Repositories(): ReactNode {
  return (
    <>
      <Figure caption="Every arrow points the same way and nothing points back. rheplicant reaches down into the science stack; this layer reaches into rheplicant and the harness; the harness reaches nowhere.">
        <RepoDiagram />
      </Figure>

      <Table
        head={['Repository', 'Role', 'Depends on']}
        rows={[
          ['rheplicant', <>The science engine: <C>core</C> (graph and operator algebra),{' '}
            <C>radio</C> (the physical signal path), <C>inference</C>, <C>config</C> (the YAML
            grammar).</>, <><C>limTOD</C>, <C>bayesmith</C>, JAX, Equinox</>],
          ['limTOD', <>Time-ordered-data simulator for single-dish intensity mapping, with a
            differentiable JAX port.</>, 'the numerical stack'],
          ['bayesmith', <>The Bayesian dispatch layer — a graph of operators is a model, and its
            structure chooses the inference.</>, 'JAX, Equinox, NumPyro'],
          ['deepseek-harness', <>The harness: plugin system, session and persistent log, agent
            loop, slot system, web runtime.</>, 'nothing here'],
          ['rheplicant-agent', <>This repository. The product layer.</>,
            <><C>rheplicant</C> and the harness</>],
        ]}
      />

      <P>
        <T>The engine has upstreams; the harness has none of them.</T> <C>rheplicant</C> requires{' '}
        <C>limTOD[jax]</C> and <C>bayesmith</C> at runtime, so the science stack is three packages
        deep before this layer is reached. What it does <em>not</em> carry is a server, a network
        client, or any reference to a harness — which is what keeps it installable and citable as an
        ordinary scientific library, and why a user who does not want an AI layer never installs
        this one.
      </P>

      <P>
        The absence in the middle of the diagram is the load-bearing part. Neither peer names the
        other in either direction, so each is usable without the other and this repository is the
        only place that knows both.
      </P>

      <Note kind="rule">
        Read-only consumption, never a fork. A change the harness genuinely needs takes one of two
        routes: a general-purpose contribution upstream, or a local patch carried in{' '}
        <C>patches/deepseek-harness/</C> and reapplied before packing. There is no third.
      </Note>

      <H2>Why bayesmith is not a second seam</H2>
      <P muted>
        <C>bayesmith</C> is the engine’s Bayesian layer, split into its own package and required
        back by <C>rheplicant</C> at runtime. That is exactly the arrangement this architecture
        predicted and chose: the fitting exits keep their grammar in <C>rheplicant.config</C> and
        delegate execution, so bayesmith reaches this console only <em>through</em>{' '}
        <C>ctx.rheplicant</C> — a dependency of the engine, invisible from the outside.
      </P>
      <P muted>
        A second seam is designed and deliberately unbuilt. It earns one the day bayesmith publishes
        a document type a person writes directly, with no telescope involved; until then there is
        nothing for it to carry.
      </P>
      <Note kind="aside">
        Nothing is built for it yet, deliberately. Building the seam now would mean extracting the
        shared transport before its second consumer, and fixing a method contract <em>by analogy</em>
        {' '}— which the design’s own open questions forbid by name.
      </Note>
    </>
  )
}

/** The layer stack. */
export function Layers(): ReactNode {
  return (
    <>
      <Figure caption="L1 through L4 are this repository. L0 is consumed as a dependency and never modified in place.">
        <LayerDiagram />
      </Figure>

      <Table
        head={['Layer', 'Owns', 'Lives in']}
        rows={[
          ['L0', <>Plugins, sessions, the agent loop, slots, theme registration, the web
            runtime.</>, <>the harness dependency</>],
          ['L1', <>The compute capability: <C>ctx.rheplicant</C>, three transport providers, five
            tools, and the wire types.</>, <><C>packages/rheplicant/</C> (host) and{' '}
            <C>python/</C></>],
          ['L2', <>Everything the browser draws: sections, panels, theme, brand.</>,
            <><C>packages/rheplicant/ui-*</C></>],
          ['L3', <>Which rows mount, and in what order.</>, <><C>harness-profile/</C>,{' '}
            <C>agent-presets/</C></>],
          ['L4', <>How it reaches a machine that has none of this checked out.</>,
            <><C>scripts/</C>, <C>harness/</C>, <C>Dockerfile</C>, CI</>],
        ]}
      />

      <H2>Why the seam is the middle</H2>
      <P>
        L1 is model-agnostic and transport-agnostic, and everything above it depends on the seam
        rather than on a provider. That is what makes “run this on the cluster instead” a field in a
        request rather than a different build — and it is the same shape the harness already uses
        for language models, where one service fronts many adapters.
      </P>
      <Note kind="rule">
        Visualization is read-only over the log. A panel reads products and diagnostics from
        persistent events and from the published tree; it never runs computation itself. That is
        what makes the console replayable, auditable and deterministic.
      </Note>
    </>
  )
}
