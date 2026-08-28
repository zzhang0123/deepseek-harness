/**
 * Part III — what travels between the layers, and what is written down.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/chapters/contracts
 */

import type { ReactNode } from 'react'

import { FlowDiagram } from '../Diagrams.tsx'
import { C, Facts, Figure, H2, H3, Note, P, Steps, T, Table, Tree, UL } from '../prose.tsx'

/** The path of one run. */
export function Dataflow(): ReactNode {
  return (
    <>
      <Figure caption="One run, end to end. The tree on disk is written once and read back by two surfaces that never consult each other.">
        <FlowDiagram />
      </Figure>

      <Steps
        items={[
          {
            title: 'The model calls rheplicant_run',
            body: <>With a <C>task:</C> path, or an inline <C>document:</C> for scratch work. The
              two branches differ in one way that matters: an inline run has no file, so it has no
              place in the published tree.</>,
          },
          {
            title: 'The tool reads bytes and mints an identity',
            body: <>The file is read unparsed, its path confined to the session’s directory, and
              the execution id minted from the digest of exactly those bytes.</>,
          },
          {
            title: 'The seam routes by transport',
            body: <>Local, ssh or http. The consumer named a transport; the service picks the
              provider that owns it.</>,
          },
          {
            title: 'The compute service runs the exits',
            body: <>It parses the grammar — the only component here that does — and calls the
              engine, which executes <C>runs:</C> in declaration order with <C>reuse:</C> looking
              only backwards.</>,
          },
          {
            title: 'The publisher writes the tree',
            body: <>One publisher, so there is exactly one definition of what an execution is. A
              chat run and a scheduled run call the same function.</>,
          },
          {
            title: 'Two independent readers',
            body: <>A durable session event feeds the chat node and the panels; a directory read
              feeds the workbench, which is the only way to see executions <em>this</em> session
              did not produce.</>,
          },
        ]}
      />

      <Note kind="rule">
        The event that reaches the transcript is marked <T>ignorable</T>, which is what lets it
        survive a cold session reload. Without it a page refresh silently lost the panel — the run
        had happened, the tree was on disk, and the transcript no longer mentioned it.
      </Note>

      <H2>What crosses to the browser, and what does not</H2>
      <P>
        The workspace path never crosses the wire. A request names a session, or a workspace by the
        id the host minted for it; the handler resolves the directory from a host record and
        confines every read to it. Nor does a path come back — a summary carries the
        project-relative path, and an artifact is asked for by execution id.
      </P>
      <Note kind="rule">
        The identity triple <C>(marker_id, device, inode)</C> is captured host-side and checked
        host-side. The browser never holds it, so it can never present a stale one — and a client
        that could name a directory could name any directory.
      </Note>
    </>
  )
}

/** The wire contract. */
export function Wire(): ReactNode {
  return (
    <>
      <P>
        The contract has one home — a design document in the engine’s repository — and two
        projections: the Python service and the TypeScript types the seam publishes.
      </P>
      <Note kind="rule">
        One schema, two projections. No hand-maintained copy of the grammar may exist in the UI or
        in tool prompts.
      </Note>

      <H2>RunOutcome</H2>
      <Facts
        rows={[
          ['runs', 'One entry per declared exit, in declaration order.'],
          ['graph', <>The canonical signal path, present when the document declares a{' '}
            <C>model:</C> — declared operators lit, passed-through ones half-lit, the rest
            dimmed.</>],
          ['gates', 'Post-flight verdicts, read off the engine’s own report ledger.'],
          ['resultsPath', <>Where the tree landed — <em>not</em> necessarily the directory that was
            asked for: a refused or errored execution publishes to a sibling carrying a{' '}
            <C>.refused-</C> or <C>.error-</C> suffix, and this names the one that exists.</>],
        ]}
      />

      <H2>The three products</H2>
      <P>
        Every exit produces exactly one of these, which is what lets a panel be written against the
        product rather than against a list of exit names.
      </P>
      <Table
        head={['Product', 'Covers', 'Carries']}
        rows={[
          ['estimate', <><C>plan.estimate</C>, <C>conjugate.wiener</C></>,
            <><C>values</C> — one array or scalar per name</>],
          ['draws', <><C>plan.sample</C>, <C>conjugate.gcr</C>, <C>nuts</C>, <C>npe</C></>,
            <><C>samples</C> per name, plus optional <C>nDraw</C>, <C>mean</C>, <C>std</C></>],
          ['report', <><C>fisher</C>, <C>identifiability</C>, <C>predict</C>, <C>forward</C>, …</>,
            <><C>fields</C> — an open record</>],
        ]}
      />
      <P muted>
        So an MCMC panel reads <C>draws.samples</C>, a corner plot reads <C>draws.mean</C> and{' '}
        <C>std</C>, and a diagnostics panel reads <C>diagnostics</C>. The three share one log and
        depend on nothing of each other’s.
      </P>

      <H2>Diagnostics come first</H2>
      <P>
        The engine’s position, which this console follows: an approximate posterior is only
        trustworthy where an exact one exists, and a gradient sampler’s output is not an answer
        until its diagnostics say so. The rank test, the condition number and the linearity check
        are <em>gates</em>, not after-the-fact patches.
      </P>
      <Table
        head={['Signal', 'From', 'Reads as']}
        rows={[
          ['rhat', 'nuts', 'convergence; per-latent when the sampler reports several'],
          ['n_eff', 'nuts', 'effective sample size'],
          ['divergences', 'nuts', 'divergent transitions — an integer, never non-finite'],
          ['rank / nullity', 'identifiability', 'what the data can and cannot constrain'],
          ['kappa', 'condition', 'conditioning number κ'],
          ['chi2', 'gates', 'joint goodness of fit'],
          ['delta', 'linearity', 'departure from the linear model'],
        ]}
      />
      <Note kind="aside">
        Every float-valued signal may be <C>null</C>: the r̂ of a zero-variance chain is <C>NaN</C>
        {' '}and a delta can be infinite, and both map to JSON <C>null</C> at the wire boundary. The
        integer counts cannot be non-finite and stay plain numbers.
      </Note>

      <H2>Gates, and the price of a check</H2>
      <P>
        Three costly checks — linearity, identifiability, prior sensitivity — each carry a mode:{' '}
        <C>refuse</C>, <C>warn</C>, <C>report</C> or <C>skip</C>. The purpose is stated plainly
        upstream: you can see the price and decline to pay it.
      </P>
      <Note kind="rule">
        A <C>skip</C> needs a reason because somebody chose it; an <C>off</C> does not, because
        nobody did.
      </Note>
    </>
  )
}

/** Projects, tasks, executions, triggers. */
export function Entities(): ReactNode {
  return (
    <>
      <P>
        The question this model answers: you have several workspaces, several sessions and several
        runs — what exactly are you looking at?
      </P>

      <Table
        head={['Entity', 'Identified by', 'State lives in']}
        rows={[
          ['Project', <>the workspace id — a stable id over a canonical path</>,
            <>the harness’s workspace registry</>],
          ['Task', <>its workspace-relative path, minus the extension</>,
            <>the YAML document you wrote</>],
          ['Execution', <>(task, execution id), minted from the document’s digest</>,
            <><C>results/&lt;task&gt;/&lt;id&gt;/</C></>],
          ['Trigger', <>(workspace, trigger name)</>, <><C>.rheplicant-agent/triggers.json</C></>],
        ]}
      />

      <Note kind="rule">
        <T>There is no ledger.</T> Listing a project’s executions is a directory read, so nothing
        can drift from the tree. Any index added later is a cache rebuildable by scanning.
      </Note>
      <Note kind="rule">
        <T>A reference is not a key.</T> A trigger is keyed by its own name and merely <em>names</em>
        {' '}a task — because a trigger keyed by task path would silently become a trigger for
        nothing the moment the task was renamed, where one that names a task can say “the task this
        names is gone”.
      </Note>

      <H3>Why the session is not an axis</H3>
      <P muted>
        A conversation view is scoped to one session and folds only the chat nodes the browser has
        loaded, and that window resets to the tail on every reconnect. So a project’s results were
        scattered across the sessions that produced them and no surface showed the project. Two
        executions of one document with one seed are byte-identical, and nothing on screen
        distinguished them — three identical charts were once three genuine runs. The workbench is
        the answer: it addresses by project, and a run with no conversation at all is an ordinary
        execution.
      </P>
    </>
  )
}

/** What lands on disk. */
export function OnDisk(): ReactNode {
  return (
    <>
      <P>
        The workspace directory <em>is</em> the project, and the tree under <C>results/</C> is the
        record.
      </P>

      <Tree>
{`my-project/
├── forward_sim.yaml            the task — anything you wrote, anywhere
├── inputs/                     data the document may reference
├── results/
│   └── forward_sim/            one segment per task (path, not basename)
│       └── k7m2qr8x/           one execution
│           ├── config.input.yaml       the bytes that ran
│           ├── config.resolved.yaml    after defaults and derivations
│           ├── provenance.json
│           ├── diagnostics.json
│           ├── products.json
│           ├── report.json / report.txt
│           ├── .rheplicant-results.json   the engine's ownership marker
│           └── .rheplicant-agent.json     this layer's sidecar
└── .rheplicant-agent/
    └── triggers.json           the schedules this project asked for`}
      </Tree>

      <Table
        head={['File', 'Written by', 'Says']}
        rows={[
          ['config.input.yaml', 'the engine', 'the document exactly as it ran'],
          ['config.resolved.yaml', 'the engine', 'the same document with everything derived'],
          ['provenance.json', 'the engine', 'what produced this, and from what'],
          ['.rheplicant-results.json', 'the engine', <>the ownership marker, carrying a{' '}
            <C>run_directory_id</C> UUID</>],
          ['.rheplicant-agent.json', 'this layer', 'the execution identity, task and digest'],
        ]}
      />

      <Note kind="rule">
        The readable set is an <T>allow-list</T>, fixed in source and not derived from the request,
        so no request can name its way to a file this layer did not intend to serve. Every read is
        confined to the workspace’s own <C>results/</C> tree and passes the identity check before a
        byte is served.
      </Note>

      <H3>Two names that look alike and never collide</H3>
      <UL>
        <li><C>.rheplicant-agent.json</C> — a <em>file</em>, inside one execution’s directory.</li>
        <li><C>.rheplicant-agent/</C> — a <em>directory</em>, at the project root, holding
          project-level state.</li>
      </UL>
      <P muted>
        The layout is owned by one module — the same one the managed <C>.gitignore</C> block is
        written from, because a path that block must ignore cannot be owned by a module it does not
        import.
      </P>
      <Note kind="aside">
        The agent never runs <C>git</C>. It writes a file, inside a delimited block it owns, in a{' '}
        <C>.gitignore</C> it does not.
      </Note>
    </>
  )
}
