/**
 * Pure, total number formatting for run diagnostics and timings. Every
 * function here returns a string for any finite or non-finite input — never
 * throws, never returns `NaN`/`undefined` — so a panel can format a value
 * straight off the wire without a guard clause of its own.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/format/number
 */

const NOT_FINITE = '—'

/** Strip trailing fractional zeros (and a bare trailing `.`) from a decimal string. */
function trimTrailingZeros(digits: string): string {
  if (!digits.includes('.')) return digits
  return digits.replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * Format a plain number for display: scientific notation with 3 significant
 * digits outside `[1e-3, 1e4)` (e.g. `2.6e+16`), otherwise up to 4
 * significant digits with trailing zeros trimmed (e.g. `3.142`, `2.5`, `100`).
 * `null` is the wire's spelling of a non-finite value and renders the same
 * `—` a NaN would.
 */
export function formatNumber(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return NOT_FINITE
  if (x === 0) return '0'
  const abs = Math.abs(x)
  if (abs >= 1e4 || abs < 1e-3) {
    const [mantissa, exponent] = x.toExponential(2).split('e')
    return `${trimTrailingZeros(mantissa ?? '')}e${exponent ?? ''}`
  }
  return trimTrailingZeros(x.toPrecision(4))
}

const THREE_DECIMAL_KEYS = new Set(['rhat'])
const INTEGER_KEYS = new Set(['n_eff', 'rank', 'nullity', 'divergences', 'iterations'])

/**
 * Format one named `RunDiagnostics` field using rheplicant's per-key
 * convention: `rhat` to 3 decimal places, the count-like fields as
 * thousands-separated integers, everything else (`chi2`, `kappa`, `delta`,
 * and any key this kit doesn't recognize yet) through {@link formatNumber}.
 * `null` (the wire's non-finite spelling) renders `—`, like a NaN.
 */
export function formatDiagnostic(key: string, x: number | null): string {
  if (x === null || !Number.isFinite(x)) return NOT_FINITE
  if (THREE_DECIMAL_KEYS.has(key)) return x.toFixed(3)
  if (INTEGER_KEYS.has(key)) return Math.round(x).toLocaleString('en-US')
  return formatNumber(x)
}

/**
 * Format a millisecond duration the way an operator reads it: `"842 ms"`
 * below one second, `"3.2 s"` below one minute, `"2 min 05 s"` beyond that.
 */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return NOT_FINITE
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  if (abs < 1000) return `${sign}${Math.round(abs)} ms`
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(1)} s`
  const totalSeconds = Math.round(abs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${sign}${minutes} min ${seconds.toString().padStart(2, '0')} s`
}
