// @vitest-environment jsdom
/**
 * The Model section's authored / as-it-ran switch (§28.1).
 *
 * **Written because a review found the switch had no coverage at all**, and
 * the defect it found is the first case below: the panel fell back to the
 * AUTHORED diagram whenever the as-run projection was not yet in hand, while
 * every label around it said as-it-ran. The code's own comment claimed that
 * was safe "because the switch says which is on screen, in both directions,
 * including while the fetch is in flight". It did not.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskModel, type ModelSourceView } from '../src/client/TaskModel.tsx'
import type { DocumentModel } from '@rheplicant/dsh-rheplicant'

afterEach(() => { cleanup() })

const AUTHORED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" data-which="authored"></svg>'
const MODEL = {
  nodes: [{
    nodeId: 'gain', label: 'gain', kind: 'transform', selectedType: 'GainOperator',
    description: 'time-dependent gain', fields: [],
  }],
  totalNodes: 33,
} as unknown as DocumentModel

function draw(source?: Partial<ModelSourceView>): void {
  render(
    <TaskModel
      svg={AUTHORED_SVG}
      model={MODEL}
      {...(source === undefined
        ? {}
        : { source: { showing: 'authored', ...source } as ModelSourceView })}
    />,
  )
}

/** The one query that matters: is the authored picture on screen? */
function authoredDiagramShown(): boolean {
  return document.querySelector('[data-model-diagram] [data-which="authored"]') !== null
}

describe('the switch never mislabels which diagram is on screen', () => {
  it('draws NO diagram while the as-run projection is still being read', () => {
    draw({ showing: 'as-run', state: 'loading', onShow: () => {}, executionId: 'E1' })
    expect(authoredDiagramShown()).toBe(false)
    expect(document.querySelector('[data-model-pending]')?.getAttribute('data-model-pending'))
      .toBe('loading')
  })

  it('draws NO diagram when the as-run projection could not be read at all', () => {
    draw({ showing: 'as-run', state: 'unavailable', onShow: () => {}, executionId: 'E1' })
    expect(authoredDiagramShown()).toBe(false)
    expect(document.body.textContent).toContain('could not be read back')
  })

  it('says the task file is still on the other side, rather than only failing', () => {
    draw({ showing: 'as-run', state: 'unavailable', onShow: () => {}, executionId: 'E1' })
    expect(document.body.textContent).toContain('the file now')
  })

  it('draws the diagram once the as-run projection is ready', () => {
    // Whatever `svg` it is handed — the CALLER chooses which projection that
    // is, and `state: 'ready'` is the caller saying the as-run one arrived.
    draw({ showing: 'as-run', state: 'ready', onShow: () => {}, executionId: 'E1' })
    expect(document.querySelector('[data-model-diagram]')).toBeTruthy()
  })

  it('draws the authored diagram with no ceremony when that is what is showing', () => {
    draw({ showing: 'authored', onShow: () => {}, executionId: 'E1' })
    expect(authoredDiagramShown()).toBe(true)
    expect(document.querySelector('[data-model-pending]')).toBeNull()
  })
})

describe('the words on the switch', () => {
  it('says it in plain words, and the same words the document panel uses', () => {
    // Not "as declared / as run": one idea with two names on one page reads as
    // two features, and "declared" already means the lit/dim encoding inside
    // this very panel.
    draw({ onShow: () => {}, executionId: 'E1' })
    expect(document.querySelector('[data-model-source-pick="authored"]')?.textContent)
      .toBe('the file now')
    expect(document.querySelector('[data-model-source-pick="as-run"]')?.textContent)
      .toBe('what this run used')
  })

  it('marks the active side with aria-pressed, not aria-expanded', () => {
    draw({ showing: 'as-run', state: 'ready', onShow: () => {}, executionId: 'E1' })
    expect(document.querySelector('[data-model-source-pick="as-run"]')?.getAttribute('aria-pressed'))
      .toBe('true')
    expect(document.querySelector('[data-model-source-pick="authored"]')?.getAttribute('aria-pressed'))
      .toBe('false')
  })

  it('shortens the execution id in the running sentence', () => {
    // `shortExecutionId` strips the TIMESTAMP segment and keeps the pair that
    // identifies the execution — checked against the helper's actual
    // behaviour rather than against what "shorten" sounded like it meant.
    draw({
      showing: 'as-run', state: 'ready', onShow: () => {},
      executionId: '20260826T084336Z-9d643d56-bcs4zs',
    })
    const note = document.querySelector('[data-model-source-note]')?.textContent ?? ''
    expect(note).not.toContain('20260826T084336Z')
    expect(note).toContain('9d643d56-bcs4zs')
  })

  it('makes no position claim about where the task file is rendered', () => {
    // "the document above" was written when the document panel was above, and
    // it is below. §28.6 exists because a caption outlived its layout.
    draw({ showing: 'as-run', state: 'ready', onShow: () => {}, executionId: 'E1', identical: true })
    expect(document.querySelector('[data-model-source]')?.textContent)
      .not.toMatch(/above/i)
  })
})

describe('whether the two documents differ', () => {
  it('marks them the same when the digests matched', () => {
    draw({ showing: 'authored', onShow: () => {}, executionId: 'E1', identical: true })
    expect(document.querySelector('[data-model-source-same]')?.textContent?.trim())
      .toBe('unchanged')
    expect(document.querySelector('[data-model-source-differs]')).toBeNull()
  })

  it('marks them different when they did not', () => {
    draw({ showing: 'authored', onShow: () => {}, executionId: 'E1', identical: false })
    expect(document.querySelector('[data-model-source-differs]')?.textContent?.trim())
      .toBe('the file has changed')
    expect(document.querySelector('[data-model-source-same]')).toBeNull()
  })

  it('says NOTHING when the comparison could not be made', () => {
    // `unknown` is not `unchanged`, and the silent case must not read as
    // either verdict.
    draw({ showing: 'authored', onShow: () => {}, executionId: 'E1' })
    expect(document.querySelector('[data-model-source-same]')).toBeNull()
    expect(document.querySelector('[data-model-source-differs]')).toBeNull()
  })

  it('shows the mark BEFORE the switch is pressed, which is the point of it', () => {
    // The reason to press "what this run used" is that there is something
    // to look at.
    // Withholding that until after the press made the control a mode toggle
    // you had to be curious about; the sidecar digest costs no fetch, so the
    // answer is available while "the file now" is still showing.
    draw({ showing: 'authored', onShow: () => {}, executionId: 'E1', identical: false })
    expect(document.querySelector('[data-model-source]')?.getAttribute('data-model-source'))
      .toBe('authored')
    expect(document.querySelector('[data-model-source-differs]')).toBeTruthy()
  })

  it('keeps the mark while the as-run projection is still loading', () => {
    // It does not depend on the projection at all, so a fetch in flight has
    // no bearing on it.
    draw({ showing: 'as-run', state: 'loading', onShow: () => {}, executionId: 'E1', identical: false })
    expect(document.querySelector('[data-model-source-differs]')).toBeTruthy()
  })
})

describe('the prose follows the switch', () => {
  it('attributes the lit operators to the DOCUMENT when authored is showing', () => {
    draw({ showing: 'authored', onShow: () => {}, executionId: 'E1' })
    expect(document.body.textContent).toContain('lit by this document')
  })

  it('attributes them to the EXECUTION when as-it-ran is showing', () => {
    // One panel, two scopes: the subtitle moved and the body did not, until a
    // review said so.
    draw({ showing: 'as-run', state: 'ready', onShow: () => {}, executionId: 'E1' })
    expect(document.body.textContent).toContain('lit by the document this execution ran')
    expect(document.body.textContent).not.toContain('lit by this document')
  })

  it('drops the word "yet" from the empty case for a historical artifact', () => {
    render(
      <TaskModel
        svg={AUTHORED_SVG}
        model={{ nodes: [], totalNodes: 33 } as unknown as DocumentModel}
        source={{ showing: 'as-run', state: 'ready', onShow: () => {}, executionId: 'E1' }}
      />,
    )
    expect(document.body.textContent).toContain('declared no operators')
    expect(document.body.textContent).not.toContain('no operators yet')
  })
})

describe('the catalogue and the diagram agree about what a node is called', () => {
  // `data-node-id` is upstream's own handle (`core/render.py` writes it on
  // every node group, and upstream's canvas finds a clicked node with
  // `closest('[data-node-id]')`). This keyed on a REGEX over each group's
  // `<title>` for one build, which needed a trailing colon that exists only
  // while every canonical node has a non-empty description — and a miss lights
  // nothing and says nothing, so there was no way to notice.
  const NODES_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" data-which="authored">',
    '<g class="lit" data-node-id="gain"><title>transform node gain</title></g>',
    '<g class="dim" data-node-id="noise.thermal"><title>sink node noise.thermal</title></g>',
    '</svg>',
  ].join('')

  function drawNodes(): void {
    render(<TaskModel svg={NODES_SVG} model={MODEL} />)
  }

  it('marks the hovered node through the handle upstream provides', () => {
    drawNodes()
    const card = document.querySelector('[data-model-node="gain"]')
    expect(card).toBeTruthy()
    fireEvent.mouseEnter(card!)
    expect(document.querySelector('[data-node-id="gain"]')?.hasAttribute('data-model-node-hover'))
      .toBe(true)
    // …and only that one.
    expect(document.querySelector('[data-node-id="noise.thermal"]')
      ?.hasAttribute('data-model-node-hover')).toBe(false)
  })

  it('clears the mark when the pointer leaves, so no node stays lit', () => {
    drawNodes()
    const card = document.querySelector('[data-model-node="gain"]')!
    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)
    expect(document.querySelector('[data-model-node-hover]')).toBeNull()
  })
})

describe('outside the workbench', () => {
  it('renders no switch at all when there is nothing to compare with', () => {
    draw(undefined)
    expect(document.querySelector('[data-model-source]')).toBeNull()
    expect(authoredDiagramShown()).toBe(true)
  })

  it('renders no switch when an execution is named but no handler is', () => {
    // `onShow` absent is the caller saying "this execution is not this task's"
    // — the guard that stops one document's bytes being diffed against
    // another's.
    draw({ executionId: 'E1' })
    expect(document.querySelector('[data-model-source]')).toBeNull()
  })
})
