/**
 * Part II (second half) — what the browser draws, what mounts it, and how it
 * reaches a machine with none of this checked out.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/chapters/surface
 */

import type { ReactNode } from 'react'

import { C, Cards, Code, Facts, H2, H3, Note, P, T, Table, UL } from '../prose.tsx'

/** L2 · the surfaces. */
export function Surfaces(): ReactNode {
  return (
    <>
      <P>
        Eleven browser plugins. None of them replaces a shipped surface: every one occupies an
        additive seat, or declares a seat of its own.
      </P>

      <Table
        head={['Plugin', 'Draws']}
        rows={[
          ['ui-project', <>Three <C>section</C> occupants and their sidebar rows — the{' '}
            <T>Dashboard</T> (every project at once), the <T>Workbench</T> (one project’s tasks,
            inputs and executions) and the <T>Schedules</T> board (what runs on its own, ordered by
            the clock) — and it declares <C>task.panel</C>, the grid the visualization plugins
            fill.</>],
          ['ui-loop', <>The session-header activity disclosure (one labelled row per task’s
            validate → gates → run cycle) and the gates panel.</>],
          ['ui-analysis', <>The chat result node: the run, its diagnostics, and the signal path with
            the declared operators lit.</>],
          ['ui-posterior', 'Posterior summaries, chain traces, and the reconstruction comparison.'],
          ['ui-spectrum', 'The power-spectrum heatmap.'],
          ['ui-identifiability', 'Rank, nullity and the departure probes.'],
          ['ui-document', 'The read-only document and schema reference.'],
          ['ui-compute', 'The transport and endpoint settings card.'],
          ['ui-theme', 'The observatory palette, as a token override layer.'],
          ['ui-brand', 'The mark and wordmark.'],
          ['ui-docs', 'This section.'],
        ]}
      />

      <H2>Where a plugin can sit</H2>
      <P>
        The slot system is self-extensible: an entry declares child slots in its own registration
        and renders them with the share it is granted. So a whole panel grid is a <em>local</em>
        {' '}declaration — no upstream change, no fork.
      </P>
      <Table
        head={['Slot', 'Kind', 'Who declares it']}
        rows={[
          ['sidebar.nav', 'list, root', <>the harness — destinations, beside New Session</>],
          ['section', 'list, root', <>the harness — a peer of the conversation, in its column</>],
          ['conversation.chat.node', 'keyed', <>the harness — a result node in the transcript</>],
          ['settings.section', 'list', <>the harness — the compute settings card</>],
          ['task.panel', 'list, root', <>this layer, from <C>ui-project</C></>],
        ]}
      />

      <H3>Sections are mutually exclusive by construction</H3>
      <P>
        <C>section</C> is a list slot, and every occupant paints when it decides it is on screen. So
        two pages that each believed they were open would both paint the same column. They do not,
        because one variable holds one section name, and a nav row switches the name.
      </P>
      <Note kind="rule">
        A new nav row costs a member of that union — never a second flag that has to be kept false.
        A page in another bundle joins by reaching the register through a Cordis service, because
        the client build refuses a cross-plugin value import outright: inlining one would give the
        importer a private duplicate of the store, and the two halves would disagree about what is
        on screen.
      </Note>
      <P muted>
        The union has four destinations now, added by two packages, and none of them can paint over
        another. That is the rule doing its job rather than a claim about it: one variable has one
        owner, so a second page claiming the same name would not compile.
      </P>
      <Note kind="quiet">
        The row’s <em>order</em> has no such owner. <C>sidebar.nav</C> position is an integer chosen
        inside each package’s own <C>register()</C> call, so two packages can pick the same one and
        neither sees the other — measured 2026-08-28, when Docs and Schedules both claimed 15.
        Nothing fails: the tie resolves by registration order, which is a profile’s business, so the
        column quietly reorders itself when the profile does. The fix was to move one; the shape is
        the same one that put six copies of a package list out of step.
      </Note>

      <H2>The palette</H2>
      <P>
        Themes are token overrides — <C>--dsw-*</C> custom properties — so the observatory look
        needs no fork. Dark keeps the deep-space navy as the console’s signature; light maps to the
        engine’s own workbench values so it does not break.
      </P>
      <Table
        head={['Token', 'Light', 'Dark', 'Means']}
        rows={[
          ['--dsw-alias-bg-base', '#f4f6f8', '#07131f', 'the base surface'],
          ['--dsw-alias-bg-layer-1 / -2', '#ffffff / #f8fafc', '#0c1f2f / #12293d', 'panel layers'],
          ['--dsw-alias-border-l1 / -l2', '#c5ced8 / #a8b6c4', '#1f3a52 / #2c4d6b', 'borders'],
          ['--dsw-alias-brand-primary', '#BA7517', '#E3B341', 'the lit signal path'],
          ['--dsw-alias-label-primary', '#17212b', '#e8eef3', 'text'],
          ['--dsw-alias-state-*-primary', '#176b38 / #6b4d00 / #8f1d24',
            '#7fd1a8 / #E3B341 / #e0675a', 'converged / warn / fail'],
        ]}
      />
      <Note kind="aside">
        The amber is not a free choice. Those two values are the engine’s own <C>lit</C> colours,
        and the host-rendered signal-path diagram paints with them — any other amber in the chrome
        visibly clashes with the console’s centrepiece. A <C>--dsw-rh-*</C> extension namespace
        carries what the platform vocabulary has no equivalent for: the <C>stale</C> pair, the node-kind
        palette, chart scaffolding and state washes.
      </Note>
      <Note kind="quiet">
        An undefined custom property fails at computed-value time: the declaration is invalid, so a
        colour inherits and a background renders transparent. Nothing throws and nothing logs. Six
        invented names had accumulated across nine stylesheets before a popover you could read the
        transcript through exposed them, so a gate now refuses any bare <C>var(--dsw-…)</C> nothing
        defines. A fallback makes it legal, which is the platform’s own idiom, not a loophole.
      </Note>
    </>
  )
}

/** L3 · composition. */
export function Composition(): ReactNode {
  return (
    <>
      <P>
        Nothing here is wired by imports. A <em>profile</em> is a patch over the harness’s composed
        plugin tree: it says which rows exist, with what configuration, in what order.
      </P>

      <Code caption="harness-profile/cordis.patch.yml — excerpt">
{`# its own port, so this harness never contends with a DSH you are using
- id: webserver
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3099

- insert:
    - id: rheplicant
      name: '@rheplicant/dsh-rheplicant'
    - id: rheplicant-local
      name: '@rheplicant/dsh-rheplicant-local'
    - id: tool-rheplicant-run
      name: '@rheplicant/dsh-rheplicant-tool-run'
      config: {defaultTransport: local}
    - id: client-rheplicant-ui-project
      name: '@deepseek-ai/dsh-client-rheplicant-ui-project'

# the shipped brand is DISABLED, not replaced
- id: ui-brand-official
  disabled: true`}
      </Code>

      <Table
        head={['What the profile does', 'Why']}
        rows={[
          ['pins the web port to 3099', <>The web bundle falls back to 3080 for every profile, so
            this and a harness of your own wanted the same bind and whichever started second
            lost.</>],
          ['raises one logger', <>The trigger loop’s only record of a skipped or failed fire is a
            log line, and this composition mounted no exporter at all.</>],
          ['inserts the host rows', <>The seam, the local provider, the five tools, the project
            API, the firing loop.</>],
          ['inserts the client rows', <>Eleven browser plugins. The profile owns these; the
            harness’s own bundle stays pure.</>],
          ['disables the shipped brand', <>A disable is reversible and a replacement destroys
            information.</>],
        ]}
      />

      <Note kind="quiet">
        A bare <C>{'{ id, name }'}</C> entry <em>patches</em> an existing row and warns-and-skips
        when the id is absent — it never creates one. State a new row outside <C>insert:</C> and the
        harness boots cleanly with that plugin simply not there.
      </Note>

      <H3>Row order</H3>
      <P muted>
        <C>ui-project</C> is listed before <C>ui-loop</C> because it publishes the selection service
        that <C>ui-loop</C> reads. The order is a convenience, not a requirement: the consumer
        re-resolves the service until it answers, and a test holds that property — which is the
        thing to keep green, not the ordering.
      </P>
    </>
  )
}

/** L4 · distribution. */
export function Distribution(): ReactNode {
  return (
    <>
      <P>
        The harness under <C>harness/</C> exists so this project runs without a development
        checkout. That independence is only real on a machine where you are <em>also</em> running a
        DeepSeek Harness of your own — which is the normal case, and where it first broke.
      </P>

      <Table
        head={['Contended resource', 'Who owns it here']}
        rows={[
          ['packages', <><C>harness/node_modules</C>, installed from tarballs</>],
          ['profile', <><C>harness/.dsh/profiles/rheplicant/</C></>],
          ['home', <><C>harness/rheplicant</C> exports <C>DSH_HOME</C> before exec</>],
          ['web port', <>the profile pins <C>3099</C></>],
          ['the harness’s own bundle', <>owned upstream: rheplicant rows live in a test overlay,
            never in the shipped manifests</>],
        ]}
      />

      <Note kind="rule">
        When a document says two things are independent, name every resource they could contend for
        and say who owns each. Three of those five had no owner for months, precisely because
        nobody had written the list down.
      </Note>

      <H2>One package table</H2>
      <P>
        <C>scripts/packages.mjs</C> is the single list every consumer slices. It used to be a{' '}
        <C>const</C> inside one script while five other places restated the slice they needed; a
        package landed, reached five of them, and the sixth went red.
      </P>
      <Cards
        items={[
          { tag: '7', title: 'host', body: <>Built with <C>tsc</C>, mirrored 1:1 into the harness
            checkout so their specs can run.</> },
          { tag: '3', title: 'skip', body: <>Shipped but unmirrored — no runnable spec to place
            there yet.</> },
          { tag: '1', title: 'library', body: <><C>ui-kit</C>: inlined into each consumer’s bundle,
            never a module-table row.</> },
          { tag: '10', title: 'client', body: <>Rescoped to <C>@deepseek-ai/dsh-client-rheplicant-*</C>
            {' '}and bundled for the browser.</> },
        ]}
      />

      <H3>The round trip</H3>
      <Code caption="one command, from source to a booting console">
{`node scripts/install.mjs /path/to/deepseek-harness
#  1. apply local harness patches
#  2. mirror drift gate (read-only)
#  3. build + pack 20 tarballs into dist/npm-rheplicant/
#  4. npm install in harness/
#  5. copy harness-profile/ and pin the resolved python
#  6. smoke: dsh --profile rheplicant --dump-config`}
      </Code>

      <H2>Continuous integration</H2>
      <Table
        head={['Lane', 'Runs on', 'What it proves']}
        rows={[
          ['typecheck-and-drift', 'push / PR', 'Host and client typecheck, plus the mirror and schema drift gates.'],
          ['python-tests', 'push / PR', <>The compute service’s unit tests against a pinned public
            engine checkout.</>],
          ['integration', 'push / PR', <>The only lane running both trees at once: TypeScript host
            packages driving a real Python compute service.</>],
          ['full-pack', 'nightly / manual', <>The real build → patch → pack → install → boot
            pipeline. Expensive, so it does not run per push.</>],
        ]}
      />
      <Facts
        rows={[
          ['Upstream pinning', <>By commit SHA, never by branch name, so a new upstream commit
            cannot silently change what CI exercised.</>],
          ['Why lane 3 exists', <>Those specs need a Python environment beside a harness checkout.
            For months the way to run them was a paragraph of instructions, and one had silently
            not run since the work it covered landed.</>],
        ]}
      />
      <Note kind="rule">
        A paragraph is weaker than a script, and a script is weaker than a gate. The lane runs
        exactly the command a developer runs, so there is no second recipe that can drift from the
        first.
      </Note>

      <H3>Channels</H3>
      <UL>
        <li><T>Container image</T> — the primary channel. One image carries both runtimes and the
          JAX cache, which absorbs the stale-registry, dual-runtime and JAX-wheel problems at once.</li>
        <li><T>PyPI / conda-forge</T> — the engine alone, usable and citable without any of this.</li>
        <li><T>Monorepo bootstrap</T> — for developers: clone, sync, one install command.</li>
      </UL>
    </>
  )
}
