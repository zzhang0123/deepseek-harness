// @vitest-environment jsdom
/**
 * The panel chrome's two non-cosmetic properties.
 *
 * `docs/superpowers/specs/2026-08-27-panel-chrome.md` §A3.2 and §A3.6. Both
 * are things a screenshot review cannot check and a type cannot either:
 *
 * - the status dot used to be a colour and nothing else, on a surface where
 *   three sibling marks spell their state as a WORD so it survives a
 *   monochrome screen and a screen reader;
 * - the disclosure affordance used to be `▸` / `▾`, text glyphs whose weight
 *   and baseline are whatever font resolves them — §28.8's finding for the
 *   sidebar's `◇` / `◈`, in the place its own closing line predicted
 *   ("the first fix did not go looking for the others").
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Panel } from '../src/client/panel/Panel.tsx'

afterEach(() => { cleanup() })

describe('Panel header', () => {
  it('names the status in words, not only in colour', () => {
    render(<Panel id="p" title="Chains" status="warn">body</Panel>)
    const dot = screen.getByRole('img', { name: 'warning' })
    expect(dot.getAttribute('data-panel-status')).toBe('warn')
  })

  it('draws the disclosure chevron rather than typing it', () => {
    const { container } = render(
      <Panel id="p" title="Chains" onToggleCollapse={() => {}}>body</Panel>,
    )
    const toggle = container.querySelector('[data-panel-collapse-toggle]')
    expect(toggle).not.toBeNull()
    expect(toggle?.querySelector('svg')).not.toBeNull()
    // The glyphs this replaced. Either one reappearing means the fix was undone.
    expect(toggle?.textContent).not.toContain('▸')
    expect(toggle?.textContent).not.toContain('▾')
  })

  it('flips the chevron and the label with the collapsed state, and hides the body', () => {
    const onToggle = vi.fn()
    const open = render(<Panel id="p" title="Chains" onToggleCollapse={onToggle}>body</Panel>)
    expect(screen.getByLabelText('Collapse Chains').getAttribute('aria-expanded')).toBe('true')
    expect(open.container.querySelector('[data-panel-body]')).not.toBeNull()
    const openPath = open.container.querySelector('[data-panel-collapse-toggle] path')?.getAttribute('d')

    cleanup()
    const shut = render(<Panel id="p" title="Chains" collapsed onToggleCollapse={onToggle}>body</Panel>)
    expect(screen.getByLabelText('Expand Chains').getAttribute('aria-expanded')).toBe('false')
    expect(shut.container.querySelector('[data-panel-body]')).toBeNull()
    const shutPath = shut.container.querySelector('[data-panel-collapse-toggle] path')?.getAttribute('d')

    expect(openPath).toBeDefined()
    expect(shutPath).toBeDefined()
    expect(shutPath).not.toBe(openPath)
  })

  it('renders no status mark at all when no status was given — absent is not idle', () => {
    const { container } = render(<Panel id="p" title="Chains">body</Panel>)
    expect(container.querySelector('[data-panel-status]')).toBeNull()
  })
})
