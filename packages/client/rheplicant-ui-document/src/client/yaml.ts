/**
 * A small, deterministic YAML serializer for the plain JSON data a
 * `ComputeDocument` carries (§5: the panel renders the durable document
 * exactly as recorded — no re-authoring). Block style throughout, 2-space
 * indent, quotes only where a plain scalar would be ambiguous, no anchors
 * or aliases, no flow style beyond empty collections (`[]`/`{}`). Key order
 * is preserved exactly as parsed off the wire (JS object property order is
 * well-defined for string keys) rather than re-sorted — re-sorting would
 * misrepresent the document exactly as the agent authored it.
 *
 * `ComputeDocument = Record<string, unknown>`, but every value that reaches
 * the client already passed through the wire's own JSON boundary, so in
 * practice it is always null/boolean/number/string/array/plain-object.
 * `serializeDocument` still falls back to pretty JSON (labelled) if this
 * emitter ever throws on a shape it does not expect, so no document can
 * render as a false wall of nothing.
 * @module @rheplicant/dsh-rheplicant-ui-document/client/yaml
 */
import type { ComputeDocument } from '@rheplicant/dsh-rheplicant'

const INDENT = '  '

function pad(depth: number): string {
  return INDENT.repeat(depth)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// YAML 1.1 boolean/null spellings (the "Norway problem") plus YAML 1.2 null —
// quoted defensively so a plain scalar never gets misread as one of these by
// either parser generation.
const RESERVED_SCALARS = new Set([
  'true', 'True', 'TRUE', 'false', 'False', 'FALSE',
  'null', 'Null', 'NULL', '~',
  'yes', 'Yes', 'YES', 'no', 'No', 'NO',
  'on', 'On', 'ON', 'off', 'Off', 'OFF',
])
const NUMBER_LIKE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
const SPECIAL_FLOAT = /^[-+]?\.(inf|Inf|INF|nan|NaN|NAN)$/
const INDICATOR_LEADERS = new Set(['-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', "'", '"', '%', '@', '`'])

/** Whether a plain (unquoted) YAML scalar would be ambiguous or unparsable for this string. */
function needsQuote(value: string): boolean {
  if (value.length === 0) return true
  if (value.trim() !== value) return true
  if (/[\n\t]/.test(value)) return true
  if (RESERVED_SCALARS.has(value)) return true
  if (NUMBER_LIKE.test(value) || SPECIAL_FLOAT.test(value)) return true
  const leader = value[0] as string
  if (INDICATOR_LEADERS.has(leader)) return true
  if (value.includes(': ') || value.endsWith(':')) return true
  if (value.includes(' #')) return true
  return false
}

/** Double-quoted YAML scalars share JSON's escape grammar (`\\`, `\"`, `\n`, `\t`, `\uXXXX`), so JSON.stringify's output is valid YAML content here. */
function quote(value: string): string {
  return JSON.stringify(value)
}

function keyText(key: string): string {
  return needsQuote(key) ? quote(key) : key
}

/** Inline rendering of one non-collection value (null/boolean/number/string, or a defensive fallback). */
function scalarInline(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'string') return needsQuote(value) ? quote(value) : value
  // Unreachable for JSON-sourced data — every ComputeDocument value already
  // crossed the wire's JSON boundary. Render defensively rather than throw.
  return quote(String(value))
}

/** Merge a nested block's first line into its owning `- ` dash marker (same total column width as one more indent level); continuation lines are untouched. */
function emitDashed(block: readonly string[], depth: number): string[] {
  const [first, ...rest] = block
  return [`${pad(depth)}- ${(first ?? '').trimStart()}`, ...rest]
}

function emitMapping(obj: Record<string, unknown>, depth: number): string[] {
  const lines: string[] = []
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const keyStr = keyText(key)
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${pad(depth)}${keyStr}: []`)
      else {
        lines.push(`${pad(depth)}${keyStr}:`)
        lines.push(...emitSequence(value, depth + 1))
      }
    } else if (isPlainObject(value)) {
      if (Object.keys(value).length === 0) lines.push(`${pad(depth)}${keyStr}: {}`)
      else {
        lines.push(`${pad(depth)}${keyStr}:`)
        lines.push(...emitMapping(value, depth + 1))
      }
    } else {
      lines.push(`${pad(depth)}${keyStr}: ${scalarInline(value)}`)
    }
  }
  return lines
}

function emitSequence(items: readonly unknown[], depth: number): string[] {
  const lines: string[] = []
  for (const item of items) {
    if (Array.isArray(item)) {
      if (item.length === 0) lines.push(`${pad(depth)}- []`)
      else lines.push(...emitDashed(emitSequence(item, depth + 1), depth))
    } else if (isPlainObject(item)) {
      if (Object.keys(item).length === 0) lines.push(`${pad(depth)}- {}`)
      else lines.push(...emitDashed(emitMapping(item, depth + 1), depth))
    } else {
      lines.push(`${pad(depth)}- ${scalarInline(item)}`)
    }
  }
  return lines
}

/** Render a config document as deterministic block-style YAML. */
export function toYaml(document: ComputeDocument): string {
  const keys = Object.keys(document)
  if (keys.length === 0) return '{}\n'
  return `${emitMapping(document, 0).join('\n')}\n`
}

export interface SerializedDocument {
  readonly text: string
  readonly format: 'yaml' | 'json'
}

/** Serialize a document as YAML; fall back to pretty JSON (labelled) if the hand-rolled emitter ever throws on an unexpected shape. */
export function serializeDocument(document: ComputeDocument): SerializedDocument {
  try {
    return { text: toYaml(document), format: 'yaml' }
  } catch {
    // The FALLBACK's fallback. This module's header promises that no document
    // can break the panel, and until 2026-08-28 the promise had a hole in it:
    // `JSON.stringify` throws on a cycle and on a BigInt, so a document that
    // defeated the emitter took the whole tab down instead of being shown
    // badly. Nothing off the wire can be cyclic — it arrived as JSON — so this
    // is unreachable in practice and stays anyway, because "unreachable" is
    // exactly what the first fallback was assumed to be.
    try {
      return { text: `${JSON.stringify(document, null, 2)}\n`, format: 'json' }
    } catch {
      return { text: String(document), format: 'json' }
    }
  }
}
