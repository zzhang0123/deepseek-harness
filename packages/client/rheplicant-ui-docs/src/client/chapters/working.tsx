/**
 * Part IV — running it, and extending it.
 *
 * The one part written in the imperative. Everything before it describes what
 * is true; this describes what to do.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/chapters/working
 */

import type { ReactNode } from 'react'

import { C, Cards, Code, Facts, H2, H3, Note, P, Steps, T, Table, UL } from '../prose.tsx'

/** Running the harness. */
export function Operating(): ReactNode {
  return (
    <>
      <Steps
        items={[
          {
            title: 'Install the compute service editable',
            body: (
              <>
                <P muted>Into the environment that already has the engine.</P>
                <Code>{`pip install -e python/`}</Code>
              </>
            ),
          },
          {
            title: 'Build, pack and install the harness',
            body: (
              <>
                <P muted>One command runs the whole chain and ends with a composition smoke test.</P>
                <Code>{`node scripts/install.mjs /path/to/deepseek-harness`}</Code>
              </>
            ),
          },
          {
            title: 'Boot the console',
            body: (
              <>
                <Code>{`cd harness
./rheplicant --no-open      # the web console on 3099
./rheplicant --dump-config  # the composed tree, no boot`}</Code>
                <P muted>
                  Flags pass straight through, so <C>--port</C>, <C>--no-open</C> and the rest work
                  unchanged.
                </P>
              </>
            ),
          },
          {
            title: 'Point it at a model',
            body: <>The profile bakes in no default. Open Settings and fill the <C>llm-pi-ai</C>
              {' '}document. Until then the harness boots fine and a model call fails with{' '}
              <C>MISSING_CREDENTIAL</C>, which is the expected behaviour: a key is needed only when
              a model runs.</>,
          },
        ]}
      />

      <H2>Why the wrapper exists</H2>
      <Facts
        rows={[
          ['Port', <><C>3099</C> — the web bundle falls back to 3080 for every profile, so this and
            a harness of your own wanted the same bind.</>],
          ['Home', <><C>harness/.dsh</C>, exported by the wrapper before it execs.</>],
          ['Override', <>An explicit <C>DSH_HOME</C> in the environment still wins, for the rare
            case where you mean it.</>],
        ]}
      />
      <Note kind="quiet">
        Run <C>./rheplicant</C>, not <C>./node_modules/.bin/dsh</C>. <C>$DSH_HOME</C> defaults to{' '}
        <C>~/.dsh</C>, which on a developer machine is a <em>real</em> harness home holding your own
        profiles, settings and credentials. Every documented command sets it; a command typed from
        memory does not, and the result is the wrong home rather than an error. The wrapper removes
        the choice.
      </Note>

      <H2>Or from the container</H2>
      <P>
        The image carries both runtimes — Node for the harness and console, a Python venv holding
        the engine and JAX — so it needs neither installed. CI builds it and checks that it serves;
        it is not published anywhere, so building it needs this repository and a harness checkout.
      </P>
      <Code caption="the only supported way to reach it">
{`docker run --rm --network host rheplicant-agent
# then http://localhost:3099`}
      </Code>

      <Note kind="rule">
        <T>Not <C>-p 3099:3099</C>.</T> The harness refuses <C>--host 0.0.0.0</C> outright —
        “intentionally not supported yet for safety: it would expose remote code execution to the
        network” — and publishing a container port <em>is</em> that exposure. So the server keeps
        binding loopback and the container shares the host’s instead. The bind’s nature is
        unchanged; only which loopback. There is no supported way to reach this console from another
        machine, by design.
      </Note>
      <P muted>
        <C>--network host</C> is native on Linux and an opt-in on Docker Desktop elsewhere. The
        image’s <C>EXPOSE 3099</C> documents the port rather than promising that publishing it
        works.
      </P>
    </>
  )
}

/** Running an analysis. */
export function Analysis(): ReactNode {
  return (
    <>
      <P>
        A task is an ordinary YAML file anywhere in the project. Nothing enforces a directory
        convention — the workbench walks the whole workspace, and the layout stays your business.
      </P>

      <Code caption="forward_sim.yaml — a complete task">
{`schema_version: 1
runtime:
  seed: 20260806
observation:
  meta: {telescope: RHINO}
  freq:
    grid:
      linspace: {start: 60.0, stop: 85.0, num: 8, endpoint: true}
      unit: MHz
  time:
    grid: {arange: {start: 0.0, step: 2.0, num: 16}, unit: s}
  environment:
    temperature: {value: 280.0, unit: K}
model:
  global_signal:
    depth:  {value: 0.5,  unit: K}
    centre: {value: 75.0, unit: MHz}
    width:  {value: 5.0,  unit: MHz}
  gain:
    gain: {value: 1.1, unit: dimensionless}
  noise:
    type: NoiseOperator
    sigma: {value: 0.05, unit: K}
runs:
  - {name: simulate, kind: forward}`}
      </Code>

      <H2>The loop</H2>
      <P>
        A loop belongs to a task: the validate → gates → run cycle, rendered as one labelled row of
        the session’s activity rail. Ask for it in words — the model calls the tools.
      </P>
      <Steps
        items={[
          { title: 'validate', body: <>Cheapest first. The refusal says <em>which pass</em> caught
            it, so “malformed” and “ran and disagreed with itself” do not read alike.</> },
          { title: 'gates', body: <>What the costly checks cost, and what they say. Decline any of
            them explicitly, with a reason.</> },
          { title: 'run', body: <>The exits execute in declaration order. Products, diagnostics and
            the lit signal path come back together.</> },
          { title: 'read', body: <>The result node appears in the transcript; the same execution is
            in the Workbench, beside every other run of that project.</> },
        ]}
      />

      <H2>Reproducibility is enforced, not encouraged</H2>
      <UL>
        <li>One seed reproduces an entire run.</li>
        <li><C>runtime.seed: null</C> is <em>rejected</em> — with no root, nothing is derivable.</li>
        <li>Literal seeds inside value nodes are rejected.</li>
      </UL>
      <Note kind="aside">
        Two executions of one document with one seed are byte-identical <em>by design</em>. They are
        still two executions, and the workbench distinguishes them by identity rather than by
        content — which is exactly why the identity is minted rather than derived from the output.
      </Note>
    </>
  )
}

/** Scheduling. */
export function Triggers(): ReactNode {
  return (
    <>
      <Note kind="rule">
        A trigger fires only while this harness is running. A “nightly” trigger on a sleeping laptop
        does not fire. This is stated first rather than last, because a schedule that silently does
        not run is worse than no schedule.
      </Note>

      <P>
        Ask for one in words and <C>rheplicant_trigger</C> writes the registry. It never fires
        anything — the firing loop is a separate plugin, so that “run it now” and “run it every ten
        minutes” cannot become the same gesture.
      </P>

      <Table
        head={['Rule', 'Behaviour']}
        rows={[
          ['no system state', <>No cron entry, no launchd plist, no systemd timer. A scheduler that
            edits your machine is a trespass this layer refuses at any size.</>],
          ['skip, never queue', <>A missed window is recorded as skipped. There is no catch-up
            burst when the harness comes back.</>],
          ['failure does not disable', <>A failed fire is logged and the schedule stands.</>],
          ['cadence verbatim', <>The UI shows <C>PT10M</C>, never rewritten as prose — it is what
            you wrote and what the tool takes back.</>],
          ['resolution, not cadence', <>The loop polls. A trigger fires at the first tick at or
            after it is due: never early, at most one tick late.</>],
        ]}
      />

      <P muted>
        A fired run produces an ordinary execution through the same publisher a chat run uses, with
        no session and no durable event — appending one would put a conversation in a transcript
        that no person had.
      </P>

      <H2>The board</H2>
      <P>
        <T>Schedules</T> is the third destination in the sidebar, and it answers a different question
        from the two beside it: not <em>what does this project have set up</em>, which the workbench
        answers by ordering on project and task, but <em>what is going to happen next</em>, which it
        answers by ordering on the clock. Neither ordering can serve the other question without
        becoming the wrong list, which is why they are two surfaces rather than one with a tab.
      </P>
      <P>
        Cards rather than rows, because of what a schedule is. There are five of them, not five
        hundred, so this is not a log to scan — it is a small standing intention, and the three
        things a person asks of one are what it is called, what it does, and whether it is on. A
        card can put those in a reading order; a row can only put them in columns.
      </P>
      <Note kind="rule">
        The board holds <em>triggers</em>, and says so on the board. The harness’s own reminder
        schedules live inside a session’s event log with no host-side registry, and a session-local
        reminder only fires while that session is live — so folding every persisted log to find them
        would produce a list whose rows mostly cannot fire. A partial list under a heading that
        claims all of them is worse than a complete list under a narrower one.
      </Note>
      <Note kind="quiet">
        A registry that cannot be read is reported as <em>unreadable</em>, distinctly from{' '}
        <em>absent</em>. A corrupt file rendered as “no schedules” is the failure the whole design
        leads with.
      </Note>
    </>
  )
}

/** Building a panel. */
export function PluginGuide(): ReactNode {
  return (
    <>
      <P>
        A visualization plugin is an ordinary browser plugin that obeys three rules. Nothing else
        about it is special.
      </P>
      <Cards
        items={[
          { tag: 'one', title: 'Inject one slot',
            body: <><C>task.panel</C> — the workbench’s grid. There is exactly one seat, so a new
              panel cannot end up in the wrong one.</> },
          { tag: 'two', title: 'Read only the log',
            body: <>Products and diagnostics, from the persistent event and the published tree.</> },
          { tag: 'three', title: 'Render, never compute',
            body: <>A panel that called the service would make the console non-deterministic and
              unreplayable.</> },
        ]}
      />

      <Code caption="src/client/index.ts — the whole registration">
{`export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'rheplicant-my-panel',
  }, MyPanel))
}`}
      </Code>

      <H2>The round trip</H2>
      <Steps
        items={[
          { title: 'Add the package',
            body: <>Copy the shape of an existing <C>ui-*</C>: a manifest, <C>src/index.ts</C>,{' '}
              <C>src/invariant.ts</C>, and <C>src/client/</C>.</> },
          { title: 'Add one row to the package table',
            body: <><C>scripts/packages.mjs</C>, kind <C>client</C>. Every consumer — build, pack,
              mirror, CI — slices that one list, so this is the only list to edit.</> },
          { title: 'Add the composition row and the dependency',
            body: <>An entry under <C>insert:</C> in the profile, and the rescoped name in{' '}
              <C>harness/package.json</C>. A row whose package does not resolve reaches nobody.</> },
          { title: 'Build, pack, install',
            body: <Code>{`node scripts/install.mjs /path/to/deepseek-harness`}</Code> },
        ]}
      />

      <Note kind="quiet">
        A client plugin reaches the browser only if its composition <em>row</em> exists <em>and</em>
        {' '}its package <em>resolves</em>. Those are two facts with two mechanisms, and each fails
        silently on its own: a missing row boots cleanly with nothing rendered, and an unresolvable
        package is skipped with a warning nobody reads.
      </Note>

      <H3>Two conventions worth knowing before the first build</H3>
      <UL>
        <li>
          <T>Never import a value from a sibling plugin.</T> The client build refuses it: inlining
          would give you a private duplicate of that module’s state. Type-only imports are fine, and
          Cordis services are the channel for anything else.
        </li>
        <li>
          <T>Give every <C>--dsw-rh-*</C> read a fallback.</T> Those tokens come from this repo’s
          theme, so a composition on the stock palette has none of them — and an undefined custom
          property fails silently. <C>var(--dsw-rh-lit, var(--dsw-alias-brand-primary))</C> is the
          idiom.
        </li>
      </UL>
    </>
  )
}

/** The design rules. */
export function Rules(): ReactNode {
  return (
    <>
      <P>
        These are the ones that settle arguments here. They are collected rather than invented: each
        was paid for once.
      </P>

      <Cards
        items={[
          { tag: 'contract', title: 'One schema, two projections',
            body: 'The grammar has one home. No hand-maintained copy may exist in the UI or in a tool prompt.' },
          { tag: 'contract', title: 'The host never parses a document',
            body: 'It reads bytes and digests them. A parser here would be a second, drifting reading of the same file.' },
          { tag: 'state', title: 'There is no ledger',
            body: 'Listing executions is a directory read, so nothing can drift from the tree.' },
          { tag: 'state', title: 'A reference is not a key',
            body: 'An entity keyed by what it points at becomes unrepresentable the moment that thing is renamed.' },
          { tag: 'ui', title: 'Read-only over the log',
            body: 'A panel renders; it never computes. That is what makes the console replayable and auditable.' },
          { tag: 'ui', title: 'One variable, one section',
            body: 'A new destination costs a member of the union, never a second flag kept false.' },
          { tag: 'design', title: 'Prefer the detectable option',
            body: 'Where two options differ in whether a wrong configuration can be detected, take the detectable one — every named failure mode returns a finite, correctly-shaped, plausible, wrong number.' },
          { tag: 'process', title: 'Name every contended resource',
            body: 'When a document says two things are independent, list what they could contend for and say who owns each.' },
          { tag: 'process', title: 'A gate beats a script beats a paragraph',
            body: 'Instructions decay. A gate runs the same command a developer runs, so there is no second recipe to drift.' },
        ]}
      />

      <Note kind="rule">
        And one that governs the rest: <T>waiting is the discipline, not the delay.</T> The second
        engine’s seam is designed and deliberately unbuilt, because building it now would mean
        extracting a shared abstraction before its second consumer and fixing a contract by analogy
        — which the design’s own open questions forbid by name.
      </Note>
    </>
  )
}
