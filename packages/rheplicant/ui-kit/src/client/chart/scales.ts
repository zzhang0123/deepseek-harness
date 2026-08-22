/**
 * Hand-rolled, dependency-free chart scales and tick math (no d3): pure,
 * total functions over `number | null` data. Every export tolerates NaN,
 * ±Infinity, and `null` (the wire's spelling of a non-finite draw) without
 * ever throwing — a degenerate or empty dataset gets a sensible fallback
 * rather than a crash, so a chart component never needs its own guard
 * clause before handing data to a scale.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/scales
 */

/** A scale maps one finite (or non-finite, tolerated) domain value to a pixel. */
export type Scale = (v: number) => number

type Pair = readonly [number, number]

/** Smallest positive floor a log scale/ticks will ever clamp down to. */
const LOG_FLOOR = 1e-12

function finiteOr<T extends number>(v: number, fallback: T): number {
  return Number.isFinite(v) ? v : fallback
}

/**
 * Linear scale: `domain` → `range`, both `[lo, hi]` pairs (reversed pairs are
 * fine, e.g. a y-range of `[height, 0]`). A degenerate or non-finite domain
 * collapses to a constant function returning the midpoint of `range`, rather
 * than dividing by zero.
 */
export function linearScale(domain: Pair, range: Pair): Scale {
  const d0 = finiteOr(domain[0], 0)
  const d1 = finiteOr(domain[1], d0)
  const [r0, r1] = range
  const span = d1 - d0
  if (span === 0 || !Number.isFinite(span)) {
    const mid = (r0 + r1) / 2
    return () => mid
  }
  return (v: number) => {
    const value = finiteOr(v, d0)
    return r0 + ((value - d0) / span) * (r1 - r0)
  }
}

function clampPositive(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : LOG_FLOOR
}

/**
 * Log10 scale: `domain` → `range`. Non-positive or non-finite domain edges
 * clamp to the smallest positive value the caller can supply (a caller
 * building the domain from data should already have floored it at the
 * smallest positive value present); `LOG_FLOOR` (1e-12) is the last-resort
 * fallback when nothing better is available. A degenerate resulting span
 * collapses to a constant function, same as {@link linearScale}.
 */
export function logScale(domain: Pair, range: Pair): Scale {
  const [r0, r1] = range
  const lo = clampPositive(domain[0])
  const hiClamped = clampPositive(domain[1])
  const hi = hiClamped > lo ? hiClamped : lo * 10
  const logLo = Math.log10(lo)
  const logHi = Math.log10(hi)
  const span = logHi - logLo
  if (span === 0 || !Number.isFinite(span)) {
    const mid = (r0 + r1) / 2
    return () => mid
  }
  return (v: number) => {
    const value = clampPositive(v)
    const t = (Math.log10(value) - logLo) / span
    return r0 + t * (r1 - r0)
  }
}

/** Round `value` to a decimal precision derived from `step`'s magnitude, to erase FP noise like `0.30000000000000004`. */
function roundToStep(value: number, step: number): number {
  if (step === 0 || !Number.isFinite(step)) return value
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** The classic "nice number" rounding (Heckbert): snap to 1, 2, 5, or 10 × 10^n. */
function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range))
  const fraction = range / 10 ** exponent
  let niceFraction: number
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else {
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
  }
  return niceFraction * 10 ** exponent
}

/**
 * Evenly spaced "nice" tick values (1/2/5 stepping) covering `[min, max]`,
 * targeting roughly `count` ticks. A degenerate domain (`min === max`, or
 * either bound non-finite) returns a single sensible tick rather than an
 * empty or infinite array.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const finiteMin = Number.isFinite(min) ? min : undefined
  const finiteMax = Number.isFinite(max) ? max : undefined
  if (finiteMin === undefined && finiteMax === undefined) return [0]
  if (finiteMin === undefined || finiteMax === undefined || finiteMin === finiteMax) {
    return [finiteMin ?? finiteMax ?? 0]
  }
  const lo = Math.min(finiteMin, finiteMax)
  const hi = Math.max(finiteMin, finiteMax)
  const safeCount = Number.isFinite(count) && count > 0 ? Math.max(1, Math.round(count)) : 5
  const range = niceNum(hi - lo, false)
  const spacing = niceNum(range / Math.max(1, safeCount - 1), true)
  if (!Number.isFinite(spacing) || spacing <= 0) return [lo]
  const niceMin = Math.floor(lo / spacing) * spacing
  const niceMax = Math.ceil(hi / spacing) * spacing
  const ticks: number[] = []
  const MAX_ITERATIONS = 1000
  for (let v = niceMin, i = 0; v <= niceMax + spacing * 1e-9 && i < MAX_ITERATIONS; v += spacing, i++) {
    ticks.push(roundToStep(v, spacing))
  }
  return ticks.length > 0 ? ticks : [lo]
}

const MAX_LOG_TICKS = 8

/**
 * Power-of-10 tick values covering `[min, max]`. A degenerate or invalid
 * domain returns a single sensible tick, same as {@link niceTicks}. More
 * than `MAX_LOG_TICKS` decades thins by stepping whole decades, always
 * keeping the lowest one.
 */
export function logTicks(min: number, max: number): number[] {
  const lo = clampPositive(Math.min(min, max))
  const hi = clampPositive(Math.max(min, max))
  if (hi <= lo) return [lo]
  const startExp = Math.floor(Math.log10(lo))
  const endExp = Math.ceil(Math.log10(hi))
  const decades: number[] = []
  for (let e = startExp; e <= endExp; e++) decades.push(10 ** e)
  if (decades.length <= MAX_LOG_TICKS) return decades
  const step = Math.ceil(decades.length / MAX_LOG_TICKS)
  return decades.filter((_, i) => i % step === 0)
}

/** Finite-only `[min, max]` of `values`, or `null` when nothing finite remains. */
export function extentOf(values: readonly (number | null)[]): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null
}

export interface HistogramBin {
  readonly x0: number
  readonly x1: number
  readonly count: number
}

/**
 * Equal-width histogram bins over the finite values in `values`. Non-finite
 * and `null` entries are dropped before binning. Fewer than one finite value
 * degrades to a single empty (`[0, 1)`, count 0) bin; a single distinct
 * finite value degrades to one bin covering `[v, v + 1)` holding every
 * occurrence, so a caller always gets at least one bin to render.
 */
export function binValues(values: readonly (number | null)[], binCount: number): HistogramBin[] {
  const finite: number[] = []
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) finite.push(v)
  }
  if (finite.length === 0) return [{ x0: 0, x1: 1, count: 0 }]

  let lo = finite[0] ?? 0
  let hi = finite[0] ?? 0
  for (const v of finite) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo === hi) return [{ x0: lo, x1: lo + 1, count: finite.length }]

  const n = Math.max(1, Math.floor(Number.isFinite(binCount) ? binCount : 1))
  const width = (hi - lo) / n
  const counts = new Array<number>(n).fill(0)
  for (const v of finite) {
    const raw = Math.floor((v - lo) / width)
    const idx = Math.min(Math.max(raw, 0), n - 1)
    counts[idx] = (counts[idx] ?? 0) + 1
  }
  return counts.map((count, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count }))
}

export interface LinePoint {
  readonly x: number
  readonly y: number | null
}

/**
 * SVG path `d` strings for a polyline through `points`, one string per
 * contiguous run of finite `(x, y)` pairs — a `null` or non-finite `y` (or
 * non-finite `x`) breaks the line rather than interpolating across it or
 * throwing. `xScale`/`yScale` map data coordinates to plot pixels.
 */
export function linePathSegments(points: readonly LinePoint[], xScale: Scale, yScale: Scale): string[] {
  const segments: string[] = []
  let current: string[] = []
  for (const p of points) {
    const yOk = p.y !== null && Number.isFinite(p.y)
    const xOk = Number.isFinite(p.x)
    if (!yOk || !xOk) {
      if (current.length > 0) segments.push(current.join(''))
      current = []
      continue
    }
    const cmd = current.length === 0 ? 'M' : 'L'
    current.push(`${cmd}${xScale(p.x).toFixed(2)},${yScale(p.y as number).toFixed(2)}`)
  }
  if (current.length > 0) segments.push(current.join(''))
  return segments
}
