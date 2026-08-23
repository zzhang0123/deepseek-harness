import { describe, expect, it } from 'vitest'
import { formatValidationReport } from '@rheplicant/dsh-rheplicant-tool-validate'
import type { ValidationReport } from '@rheplicant/dsh-rheplicant'

describe('a clean document', () => {
  it('says so in one line', () => {
    expect(formatValidationReport({ valid: true, errors: [], warnings: [] }))
      .toBe('valid: true (no errors or warnings)')
  })
})

describe('a document that pre-flight refused', () => {
  it('names the path and the message', () => {
    const report: ValidationReport = {
      valid: false,
      errors: [{ path: 'model.gain', code: 'A1', message: 'gain is required' }],
      warnings: [],
    }
    expect(formatValidationReport(report))
      .toBe('valid: false\n- [error] model.gain: gain is required')
  })

  it('calls a pathless finding <document> rather than leaving a gap', () => {
    const report: ValidationReport = {
      valid: false,
      errors: [{ path: '', code: 'INVALID_DOCUMENT', message: 'not a mapping' }],
      warnings: [],
    }
    expect(formatValidationReport(report)).toContain('- [error] <document>: not a mapping')
  })

  it('reports warnings alongside the errors', () => {
    const report: ValidationReport = {
      valid: false,
      errors: [{ path: 'a', code: 'A1', message: 'bad' }],
      warnings: [{ path: 'b', code: 'A2', message: 'odd' }],
    }
    expect(formatValidationReport(report)).toContain('- [warning] b: odd')
  })

  it('survives a report carrying no warnings array at all', () => {
    // `ValidationReport.warnings` is optional on the wire.
    const report: ValidationReport = { valid: false, errors: [{ path: 'a', code: 'A1', message: 'bad' }] }
    expect(formatValidationReport(report)).toBe('valid: false\n- [error] a: bad')
  })
})

describe('a document that is valid but not silent', () => {
  it('still shows its warnings', () => {
    // `valid` is `not errors` — a document with warnings and no refusals is
    // VALID and has something to say. Short-circuiting on `valid` dropped
    // every pre-flight warning before it reached the model, under a sentence
    // that claimed there were none.
    const report: ValidationReport = {
      valid: true,
      errors: [],
      warnings: [{ path: 'observation.freq', code: 'A9', message: 'grid is very coarse' }],
    }
    const text = formatValidationReport(report)
    expect(text).toContain('- [warning] observation.freq: grid is very coarse')
    expect(text).not.toContain('no errors or warnings')
  })
})
