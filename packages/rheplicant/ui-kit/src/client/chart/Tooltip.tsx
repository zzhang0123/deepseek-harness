/**
 * Shared hover tooltip for the chart kit: `useChartPointer` tracks a
 * pointer over a chart's wrap div in two coordinate spaces at once — the
 * SVG viewBox's user units (for a chart form to hit-test its own data, e.g.
 * "which draw index is this") and CSS pixels relative to the same wrap div
 * (for positioning the HTML tip, since `width="100%"` on the `<svg>` means
 * its rendered pixel size is not the viewBox size). `ChartTip` renders the
 * absolutely positioned tip and clamps it inside the wrap after layout, so
 * it never spills past the chart's edge.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/Tooltip
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import styles from './chart.module.css'

export interface ChartPointer {
  /** Pointer x in the surface's SVG viewBox units (0..viewBox width), or `null` when not hovering. */
  readonly x: number | null
  /** Pointer y in the surface's SVG viewBox units (0..viewBox height), or `null` when not hovering. */
  readonly y: number | null
  /** Pointer x in CSS pixels relative to the wrap div — feed straight into `ChartTip`'s `x`. */
  readonly clientX: number | null
  /** Pointer y in CSS pixels relative to the wrap div — feed straight into `ChartTip`'s `y`. */
  readonly clientY: number | null
  readonly active: boolean
}

const IDLE_POINTER: ChartPointer = { x: null, y: null, clientX: null, clientY: null, active: false }

/**
 * Track a pointer over `ref`'s element (a `ChartSurface`'s forwarded wrap
 * div), converting its position into both viewBox-space and CSS-pixel-space
 * coordinates via the element's current rendered size vs. `viewBox`. Never
 * throws: a zero-size element (not yet laid out) simply reports no pointer.
 */
export function useChartPointer(
  ref: RefObject<HTMLElement | null>,
  viewBox: { readonly width: number; readonly height: number },
): ChartPointer {
  const [pointer, setPointer] = useState<ChartPointer>(IDLE_POINTER)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const handleMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const clientX = event.clientX - rect.left
      const clientY = event.clientY - rect.top
      const scaleX = viewBox.width / rect.width
      const scaleY = viewBox.height / rect.height
      setPointer({ x: clientX * scaleX, y: clientY * scaleY, clientX, clientY, active: true })
    }
    const handleLeave = () => setPointer(IDLE_POINTER)
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerleave', handleLeave)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerleave', handleLeave)
    }
  }, [ref, viewBox.width, viewBox.height])

  return pointer
}

export interface ChartTipProps {
  /** CSS pixels relative to the wrap div — `pointer.clientX`. */
  readonly x: number
  /** CSS pixels relative to the wrap div — `pointer.clientY`. */
  readonly y: number
  readonly visible: boolean
  readonly children: ReactNode
}

const TIP_OFFSET = 10
const EDGE_PAD = 4

/**
 * Absolutely positioned HTML tooltip, meant to render via `ChartSurface`'s
 * `overlay` prop (a sibling of the `<svg>`, inside the same positioned wrap
 * div). Placed near `(x, y)` and then clamped inside the wrap's own bounds
 * after layout, so it never spills past the chart's edge regardless of
 * where the pointer is.
 */
export const ChartTip = memo(function ChartTip({ x, y, visible, children }: ChartTipProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !visible) return
    const parent = el.parentElement
    if (!parent) return
    const bounds = parent.getBoundingClientRect()
    const tip = el.getBoundingClientRect()
    let left = x + TIP_OFFSET
    let top = y - tip.height - TIP_OFFSET
    if (left + tip.width > bounds.width) left = x - tip.width - TIP_OFFSET
    if (left < 0) left = EDGE_PAD
    if (top < 0) top = y + TIP_OFFSET
    if (top + tip.height > bounds.height) top = Math.max(EDGE_PAD, bounds.height - tip.height - EDGE_PAD)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [x, y, visible])

  if (!visible) return null
  return (
    <div ref={ref} className={styles.tip} data-chart-tip>
      {children}
    </div>
  )
})
