/**
 * Reconstruction panel: the quantity a posterior implies, as a waterfall.
 *
 * A `predict` run pushes every posterior draw through the forward model and
 * reduces ACROSS the draws. This panel draws that reduction — pixel-wise mean
 * or pixel-wise median over `(n_draw, n_time, n_freq)`.
 *
 * **The order is the content, and it is why this is not a one-line panel.**
 * `mean(model(draw))` is not `model(mean(draw))` for a nonlinear model, and
 * this package checks linearity (`check_linearity`, `LinearityRefused`,
 * `Finding.departure`) rather than assuming it — so a surface that quietly
 * plotted the model at the posterior mean would be asserting the assumption
 * the whole apparatus exists to test. The wire never carries that shortcut;
 * `python/tests/test_reconstruction.py` pins the difference.
 *
 * **It lives in ui-posterior rather than in a package of its own** because it
 * is a posterior-derived view of one run and this package already reads
 * per-run derived fields. "Adding a package" prices the alternative; one panel
 * does not pay for it.
 *
 * @module @rheplicant/dsh-rheplicant-ui-posterior/client/ReconstructionPanel
 */
import { memo, useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  formatNumber,
  type AnalysisRun,
  type AnalysisRunReconstruction,
  type PanelLayoutView,
  EmptyState,
  HeatMap,
  Panel,
  type PanelStatus,
  selectAnalysisRuns,
  runsToRender,
  executionEmptyReason,
  executionEmptyKind,
  type LoopExecutionView,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'
import styles from './posterior.module.css'

/** This panel's own `task.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'reconstruction'

/** Which reduction is on screen. Two grids ship, so the toggle is free. */
type Statistic = 'median' | 'mean'

interface ReconstructionPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Panel layout state (owner prop — see ui-project's ProjectHome doc comment). Absent when not rendered through a panel grid (e.g. a unit test): renders un-collapsed, always visible. */
  layout?: PanelLayoutView
  /** The execution the workbench is showing (owner prop). Absent outside the workbench shell. */
  execution?: LoopExecutionView
}

type ReconstructedRun = AnalysisRun & { readonly reconstruction: AnalysisRunReconstruction }

/**
 * A run carrying a reconstruction with at least one grid to draw.
 *
 * `!= null` on purpose, for the reason `SpectrumPanel.hasSpectrum` records:
 * events written before the service stopped emitting explicit nulls carry
 * `null`, and an `undefined`-only guard lets one through and takes the slot
 * down with it.
 *
 * The grid check is not belt-and-braces either. A `predict` run that reused a
 * `fisher` product legitimately has a reconstruction-shaped absence: it
 * propagated a covariance by the delta method, so it has standard deviations
 * and no central tendency at all. That is a run with nothing for THIS panel,
 * not a broken one.
 */
function hasReconstruction(run: AnalysisRun): run is ReconstructedRun {
  const reconstruction = run.reconstruction
  if (reconstruction === undefined || reconstruction === null) return false
  return gridOf(reconstruction, 'median') !== undefined || gridOf(reconstruction, 'mean') !== undefined
}

/** One statistic's grid, or nothing. Never an empty grid — absent is not empty. */
function gridOf(reconstruction: AnalysisRunReconstruction, statistic: Statistic): (number | null)[][] | undefined {
  const grid = statistic === 'median' ? reconstruction.medianGrid : reconstruction.meanGrid
  if (grid === undefined || grid === null || grid.length === 0) return undefined
  return grid
}

/**
 * Frequencies reach the wire in Hz (upstream's `Coordinates.freq` is SI).
 * MHz is what a 21-cm axis is read in, so the panel converts for DISPLAY and
 * says which unit it is showing — it never rewrites the payload.
 */
function axisForDisplay(values: readonly number[] | undefined, unit: string | undefined): {
  readonly values: readonly number[] | undefined
  readonly label: string | undefined
} {
  if (values === undefined || values.length === 0) return { values: undefined, label: unit }
  if (unit === 'Hz') return { values: values.map(hz => hz / 1e6), label: 'MHz' }
  return { values, label: unit }
}

/** The largest magnitude in one grid, ignoring cells that are not readings. */
function peak(grid: (number | null)[][] | undefined): number {
  let max = 0
  if (grid === undefined) return max
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null && Number.isFinite(cell)) max = Math.max(max, Math.abs(cell))
    }
  }
  return max
}

/**
 * The magnitude BOTH grids are drawn against.
 *
 * `HeatMap` normalises against its own largest by default, which is right for
 * a grid drawn alone and wrong for two drawn side by side: a fit that is 30%
 * low would render identically to the data it is being compared with. That is
 * the whole reason the pair is worth showing.
 *
 * **Anchored to the DATA when there is data, not to the larger of the two.**
 * The data is the reference; a fit that overshoots by 10x should make itself
 * look wrong, not flatten the thing it is being judged against. Taking the max
 * of both let the quantity under test move the reference — and made the left
 * figure render differently for every fit of the same task, which is the one
 * picture that should be identical every time.
 *
 * The fit's own peak is the fallback, for a payload with no comparison, and
 * for the degenerate case of data that is all zero or all null.
 */
function sharedScale(observed: (number | null)[][] | undefined, fit: (number | null)[][]): number {
  const anchor = peak(observed)
  return anchor > 0 ? anchor : peak(fit)
}

/** `1` means full resolution, so it is worth saying only when it is not `1`. */
function downsampleNote(reconstruction: AnalysisRunReconstruction): string | undefined {
  const rows = reconstruction.downsample?.rows ?? 1
  const cols = reconstruction.downsample?.cols ?? 1
  if (rows <= 1 && cols <= 1) return undefined
  return `showing 1 of every ${rows} samples × 1 of every ${cols} channels`
}

export const ReconstructionPanel = memo(function ReconstructionPanel({ useSession, layout, execution }: ReconstructionPanelProps) {
  // Median first, and it is a decision rather than an alphabetical accident:
  // a median is robust to a heavy-tailed posterior, which is the posterior a
  // reconstruction most often has something to say about.
  const [statistic, setStatistic] = useState<Statistic>('median')
  const runs = runsToRender(execution, useSession(selectAnalysisRuns)).filter(hasReconstruction)
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Reconstruction"
      // The run's name lives HERE, not as a heading inside the body: a panel
      // says what it is in its own header, and the body then gets on with the
      // picture. `runs.length` is 1 in every real document seen so far; with
      // more than one the subtitle counts them and each keeps its own figure.
      subtitle={runs.length === 1
        ? `${runs[0]?.name ?? ''} · each draw through the model, then reduced`
        : `${runs.length} runs · each draw through the model, then reduced`}
      // Two heatmaps side by side is the point, and one column of the panel
      // grid does not hold them.
      wide
      status={status}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
      {runs.length === 0 ? (
        <EmptyState
          kind={executionEmptyKind(execution)}
          message={executionEmptyReason(execution) ?? 'No reconstruction yet'}
          hint={executionEmptyReason(execution) === undefined
            ? 'Ask the agent for a predict run reusing a sampler run'
            : undefined}
        />
      ) : (
        runs.map((run) => {
          const reconstruction = run.reconstruction
          const shown = gridOf(reconstruction, statistic) ?? gridOf(reconstruction, statistic === 'median' ? 'mean' : 'median')
          // Which statistic is ACTUALLY on screen, which is not always the one
          // the control says: a payload can carry one grid and not the other.
          const showing: Statistic = gridOf(reconstruction, statistic) !== undefined
            ? statistic
            : statistic === 'median' ? 'mean' : 'median'
          if (shown === undefined) return null
          const freq = axisForDisplay(reconstruction.axes?.freq, reconstruction.axes?.units?.freq)
          const time = axisForDisplay(reconstruction.axes?.time, reconstruction.axes?.units?.time)
          const thinned = downsampleNote(reconstruction)
          const observed = reconstruction.observedGrid !== undefined && reconstruction.observedGrid !== null
            && reconstruction.observedGrid.length > 0
            ? reconstruction.observedGrid
            : undefined
          // Both grids against one maximum, so the two pictures are the same
          // picture at different values rather than two pictures.
          const scale = sharedScale(observed, shown)
          return (
            <div key={run.name} data-reconstruction-run data-run-name={run.name} data-reconstruction-showing={showing}>
              {/* NO heading here. The panel is called Reconstruction and its
                  subtitle names the run — a second title inside a titled box is
                  the thing a reader reads twice and learns nothing from. What
                  the run is called still travels, on the panel's own subtitle
                  where a panel's identity belongs. */}
              {/* SIDE BY SIDE, ON ONE SCALE. The comparison is whether the
                  fit reproduces the data, and two independently-normalised
                  heatmaps cannot answer it — see `sharedScale`. The pair
                  collapses to one column below the split's breakpoint, where
                  stacked-and-comparable beats side-by-side-and-cramped. */}
              <div className={styles.gridPair} data-reconstruction-grids>
                {observed !== undefined && (
                  <figure className={styles.gridFigure} data-reconstruction-observed>
                    <figcaption className={styles.gridCaption}>
                      data
                      {/* WHOSE data. It is a `forward` run's, and the heading
                          above this pair belongs to the `predict` run — so
                          without the name a reader assumes one run published
                          both. Every other panel here names its evidence. */}
                      <span className={styles.gridCaptionNote}>
                        {reconstruction.observedFrom !== undefined
                          ? `published by ${reconstruction.observedFrom}`
                          : 'what the run was given'}
                      </span>
                    </figcaption>
                    <HeatMap
                      grid={observed}
                      xLabel={freq.label}
                      yLabel={time.label}
                      xValues={freq.values}
                      yValues={time.values}
                      scaleMax={scale}
                      ramp={false}
                    />
                  </figure>
                )}
                <figure className={styles.gridFigure} data-reconstruction-fit>
                  <figcaption className={styles.gridCaption}>
                    posterior {showing}
                    <span className={styles.gridCaptionNote}>
                      across {reconstruction.nDrawUsed !== undefined ? `${reconstruction.nDrawUsed} draws` : 'the draws'}
                    </span>
                    {/* THE CONTROL SITS ON THE FIGURE IT CHANGES. It was above
                        the pair, which put it nearest the DATA — the one grid
                        it has no effect on. */}
                    <span className={styles.statisticRow} data-reconstruction-toggle>
                      {(['median', 'mean'] as const).map(option => (
                        <button
                          key={option}
                          type="button"
                          className={styles.statisticButton}
                          aria-pressed={statistic === option}
                          disabled={gridOf(reconstruction, option) === undefined}
                          onClick={() => { setStatistic(option) }}
                        >
                          {option}
                        </button>
                      ))}
                    </span>
                    {/* The case the control cannot say: this payload carries
                        one grid and not the other, so what is drawn is not
                        what was asked for. */}
                    {showing !== statistic && (
                      <span className={styles.statisticLabel} data-reconstruction-statistic>
                        no {statistic} was published
                      </span>
                    )}
                  </figcaption>
                  <HeatMap
                    grid={shown}
                    xLabel={freq.label}
                    yLabel={time.label}
                    xValues={freq.values}
                    yValues={time.values}
                    scaleMax={scale}
                    ramp={observed === undefined}
                  />
                </figure>
              </div>
              {/* ONE bar for the pair, because there is one scale. Two figures
                  with identical legends under them is the same legend twice —
                  and a shared ramp is also what makes "on one scale" something
                  a reader can check rather than take on trust. A figure drawn
                  ALONE keeps its own (`ramp` above), since a plot with no
                  scale is not a reading. */}
              {observed !== undefined && (
                <div className={styles.sharedRamp} data-reconstruction-ramp>
                  <span>0</span>
                  <span className={styles.sharedRampBar} />
                  <span>{formatNumber(scale)}</span>
                  <span className={styles.sharedRampNote}>both grids, one scale</span>
                </div>
              )}
              <p className={styles.reconstructionNote}>
                {/* Upstream says this twice and in full, because "predictive"
                    usually means the opposite: the likelihood's own scatter is
                    NOT added back. A panel that called this a posterior
                    predictive would be claiming something the numbers do not
                    carry. */}
                Noiseless: the model's own prediction at each draw, with the likelihood's
                scatter not added back.
                {thinned !== undefined ? ` ${thinned}.` : ''}
              </p>
            </div>
          )
        })
      )}
    </Panel>
  )
})
