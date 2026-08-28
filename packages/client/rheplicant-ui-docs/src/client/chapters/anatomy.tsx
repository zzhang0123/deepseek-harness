/**
 * Part II (first half) — the harness we consume, and the three pieces of the
 * seam that sit on top of it.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/chapters/anatomy
 */

import type { ReactNode } from 'react'

import { SeamDiagram } from '../Diagrams.tsx'
import { C, Code, Facts, Figure, H2, H3, Note, P, Pills, T, Table, UL } from '../prose.tsx'

/** L0 · the harness. */
export function Harness(): ReactNode {
  return (
    <>
      <P>
        DeepSeek Harness is a Cordis application: everything in it is a plugin mounted into a
        context, including its own web console. This layer supplies the parts a product would
        otherwise have to build, and none of them is specific to radio astronomy.
      </P>

      <Table
        head={['What it supplies', 'What this layer does with it']}
        rows={[
          ['plugin system', 'Every package here is a Cordis plugin; nothing is a special case.'],
          ['session + persistent log', <>Carries the durable <C>rheplicant/run</C> event a panel
            reads back after a page reload.</>],
          ['agent loop', 'Runs the model turn that calls the tools.'],
          ['tool registry', 'Where the five model-facing tools register.'],
          ['slot system', <>The seats a browser plugin occupies — and, because it is
            self-extensible, the mechanism by which this layer declares a seat of its own.</>],
          ['theme registration', <>Third-party themes are token overrides; the observatory palette
            needs no fork.</>],
          ['workspace registry', <>A workspace is already a project: a stable id over a canonical
            path, and the sessions that belong to it.</>],
          ['web runtime + jobs', 'Serves the console, and runs a long analysis in the background.'],
        ]}
      />

      <H2>Never forked</H2>
      <P>
        The harness is a pinned dependency, resolved from packed tarballs. It is never edited in
        place, and the discipline has a cost that is paid on purpose: when the harness genuinely
        lacked something, the fix went upstream <em>and</em> was carried locally rather than
        vendored into a private copy.
      </P>
      <Facts
        rows={[
          ['The one patch', <><C>patches/deepseek-harness/append-ignorable.patch</C></>],
          ['What it does', <>Lets <C>Session.append</C> accept an <C>ignorable</C> marker, so a
            run’s event survives a cold session reload instead of being dropped.</>],
          ['Why it is upstream-shaped', <>Nothing in it mentions rheplicant: any plugin emitting a
            durable event of its own needs the same thing.</>],
        ]}
      />

      <Note kind="quiet">
        Independence has to hold in both directions, and the reverse leak is the one a developer
        notices. Rheplicant rows once reached the harness’s own bundle manifests, so a plain{' '}
        <C>dsh web</C> from a development checkout booted this product. It was three separate
        sites, and a fix that had moved only the composition rows would have left two of them. The
        property — not the row count — is now pinned by a test.
      </Note>
    </>
  )
}

/** L1 · the compute seam. */
export function Seam(): ReactNode {
  return (
    <>
      <Figure caption="One service, three providers. A request names a transport; the service routes by that key, never by registration order.">
        <SeamDiagram />
      </Figure>

      <P>
        <C>ctx.rheplicant</C> is a Cordis <C>Service</C>. Providers register under transport names
        and a request selects one by its <C>transport</C> field, which mirrors how the harness
        already fronts many model adapters behind one <C>ctx.llm</C>.
      </P>

      <Table
        head={['Transport', 'How it reaches the service', 'Notes']}
        rows={[
          ['local', <>Spawns <C>python -m rheplicant_compute.server</C> and speaks
            newline-delimited JSON-RPC over its stdio.</>, 'Fully verified; the profile default.'],
          ['ssh', <>The same stdio protocol, through an <C>ssh</C> command.</>,
            <>Needs the service installed on the remote.</>],
          ['http', <>Posts to the daemon in <C>http_server.py</C>.</>,
            <>Endpoint is editable at runtime in Settings.</>],
        ]}
      />

      <H3>A transport name is validated, not guessed</H3>
      <P>
        Transport names arrive from outside this layer — three of them are model-supplied tool
        arguments, one is a browser query parameter — so they pass through one validator with one
        list behind it.
      </P>
      <Note kind="rule">
        A misspelled transport is refused, never silently replaced with <C>local</C>. A caller that
        names a transport has an intention, and quietly running somewhere else is the worst
        available answer: the run succeeds, on the wrong machine, and says nothing.
      </Note>

      <H3>Endpoints</H3>
      <P muted>
        The seam owns the endpoint vocabulary and publishes it through the harness’s own settings
        surface, so the browser edits <C>ssh.host</C>, <C>ssh.command</C> and <C>http.baseUrl</C>
        {' '}without any client-to-host RPC of its own. Providers read them back through the
        service.
      </P>
    </>
  )
}

/** L1 · the tools. */
export function Tools(): ReactNode {
  return (
    <>
      <P>
        Five verbs are exposed to the model. Four of them project the compute service; the fifth
        writes a file and deliberately runs nothing.
      </P>

      <Table
        head={['Tool', 'Asks', 'Notable refusal']}
        rows={[
          ['rheplicant_schema', <>The grammar: exit kinds, the operator catalog, the checks — read
            from the engine’s source rather than from a copy.</>,
            <>Nothing; it takes no document.</>],
          ['rheplicant_validate', <>Whether a document is acceptable, and <em>which pass</em>
            {' '}rejected it.</>, <>A cheap pre-flight refusal never reaches an expensive pass.</>],
          ['rheplicant_gates', <>What the costly checks would cost, and what they say.</>,
            <>A <C>skip</C> needs a reason; an <C>off</C> does not.</>],
          ['rheplicant_run', <>Runs the ordered exits, publishes the tree, emits the durable
            event.</>, <>A task path that escapes the session’s directory.</>],
          ['rheplicant_trigger', <>Writes the project’s trigger registry.</>,
            <>It never fires anything — the firing loop is a separate plugin.</>],
        ]}
      />

      <H2>The four-pass validation</H2>
      <P>
        The engine rejects in stages, cheapest first, and the tool reports which stage refused —
        because “this is malformed” and “this ran and disagreed with itself” are different answers
        to the operator.
      </P>
      <UL>
        <li><T>pre-flight</T> — plain text, milliseconds. Rejects everything rejectable before
          opening a file or touching a beam.</li>
        <li><T>axes</T> — before resources are allocated. This is where the money is spent.</li>
        <li><T>built</T> — a shape trace over each operator.</li>
        <li><T>post-flight</T> — actually runs the model. The pass you can decline.</li>
      </UL>

      <H2>Two rules every task-taking tool shares</H2>
      <Note kind="rule">
        <T>A task is a file, and the file must be what runs.</T> A tool naming <C>task:</C> reads
        that file’s exact bytes and sends them unparsed. The grammar has exactly one owner, and the
        execution id is minted from the digest of the bytes that travelled — parsing here would put
        a second owner on the grammar and a second meaning on the digest.
      </Note>
      <Note kind="rule">
        <T>Path confinement, with no fallback.</T> The path comes from a model, so it is resolved
        against the session’s own working directory and refused if it escapes — lexically first,
        then again after canonicalization, so a symlink pointing out is caught too. There is no
        fallback to the host process’s <C>cwd</C>: a session with no directory cannot name a task
        at all.
      </Note>
    </>
  )
}

/** L1 · the compute service. */
export function Compute(): ReactNode {
  return (
    <>
      <P>
        <C>rheplicant_compute</C> is a thin JSON-RPC service over <C>rheplicant.config</C>. It is
        the only component in this repository that parses a task document, and it is one of the two
        projections of the wire contract — the other being the TypeScript types the seam publishes.
      </P>

      <Table
        head={['Method', 'Answers']}
        rows={[
          ['validate', 'Is this document acceptable, and which pass says otherwise?'],
          ['gates', 'What do the costly checks cost, and what do they report?'],
          ['run', 'Execute the ordered exits and return products and diagnostics.'],
          ['schema', 'The grammar: 18 exit kinds, the operator catalog, the checks.'],
          ['graph', 'The canonical signal path, with the declared operators marked lit.'],
          ['document.project', 'The document as the UI reads it: model, runs, parameters.'],
          ['document.definition', 'What is decided, what is undecided, which files it references.'],
          ['execution.read', 'A published execution, read back from its directory.'],
        ]}
      />

      <H2>Two transports, one encoder</H2>
      <P>
        The stdio server and the HTTP daemon both serialize through a single function, so the
        wire policy cannot drift between them.
      </P>
      <Note kind="quiet">
        JSON has no <C>NaN</C> or <C>Infinity</C> token, and the TypeScript consumer’s strict{' '}
        <C>JSON.parse</C> throws on either — so one stray non-finite number (the r̂ of a constant
        chain, a masked map pixel) would take down the whole response rather than one field. Every
        non-finite float is mapped to <C>null</C> recursively, bare NumPy scalars are unwrapped and
        re-checked, and an encode failure degrades that <em>one</em> response to a well-formed
        internal error instead of killing the loop that serves every later request.
      </Note>

      <H3>Talking to it directly</H3>
      <Code caption="stdio — one request per line">
{`cd python/src
python -m rheplicant_compute.server

{"jsonrpc":"2.0","id":1,"method":"validate","params":{"document":{"schema_version":1}}}`}
      </Code>

      <Note kind="quiet">
        Install the service editable (<C>pip install -e python/</C>). Every panel is only as complete
        as what this service serialized, so an old <C>site-packages</C> copy from a previous
        checkout renders <em>empty panels with no error anywhere</em> — nothing is wrong except the
        data the browser was handed.
      </Note>

      <H3>The vocabulary it projects</H3>
      <P muted>The 18 exit kinds, read from the engine rather than restated:</P>
      <Pills
        items={[
          'forward', 'fisher', 'optimize', 'plan.estimate', 'plan.sample', 'conjugate.wiener',
          'conjugate.gcr', 'conjugate.gls', 'identifiability', 'condition', 'score_directions',
          'gradient', 'mmodes', 'predict', 'nuts', 'npe', 'compare', 'benchmark',
        ]}
      />
    </>
  )
}
