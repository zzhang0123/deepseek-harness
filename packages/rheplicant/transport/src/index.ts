/**
 * Shared newline-delimited JSON-RPC-over-stdio transport for the local and ssh
 * compute providers. A library, not a plugin: providers call {@link stdioRequest}
 * and differ only in the process they spawn.
 * @module @rheplicant/dsh-rheplicant-transport
 */

import { spawn } from 'node:child_process'
import { ComputeError } from '@rheplicant/dsh-rheplicant'

/** Budgets and cancellation for one request. */
export interface StdioRequestOptions {
  /** Per-request wall-clock budget in milliseconds. */
  readonly timeoutMs: number
  /** Caller-owned cancellation forwarded to the child. */
  readonly signal?: AbortSignal
}

interface RpcMessage<T> {
  readonly id?: unknown
  readonly result?: T
  readonly error?: { readonly code?: string; readonly message?: string }
}

/**
 * Spawn `command args`, write one JSON-RPC request on stdin, and resolve with
 * the matching response on stdout. One spawn per request; the caller owns the
 * lifecycle policy (P3 replaces this with a managed daemon).
 */
export function stdioRequest<T>(
  command: string,
  args: readonly string[],
  method: string,
  params: unknown,
  options: StdioRequestOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    const id = 1
    let buffer = ''
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined

    function fail(error: unknown): void {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      child.kill()
      reject(error)
    }
    function settle(result: T): void {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(result)
      child.kill()
    }

    timer = setTimeout(
      () => fail(new ComputeError('rheplicant compute request timed out', 'TIMEOUT')),
      options.timeoutMs,
    )

    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk: string) => {
      buffer += chunk
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim() === '') continue
        let message: RpcMessage<T>
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        if (message.id !== id) continue
        if (message.error !== undefined) {
          fail(new ComputeError(message.error.message ?? 'rheplicant compute error', message.error.code ?? 'INTERNAL'))
        } else {
          settle(message.result as T)
        }
      }
    })
    child.stderr!.setEncoding('utf8')
    child.stderr!.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      fail(new ComputeError(`failed to spawn ${command}: ${error.message}`, 'TRANSPORT'))
    })
    child.on('exit', (code) => {
      if (!settled) {
        const detail = stderr.trim() ? `: ${stderr.trim()}` : ''
        fail(new ComputeError(`rheplicant compute exited ${code ?? ''}${detail}`, 'TRANSPORT'))
      }
    })
    options.signal?.addEventListener('abort', () => {
      fail(new ComputeError('rheplicant compute request aborted', 'ABORTED'))
    }, { once: true })

    child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    // The server's `main()` reads newline-delimited requests with
    // `for line in sys.stdin:`, which keeps blocking on the next `read()`
    // until stdin actually reaches EOF -- one JSON-RPC line does not imply
    // EOF on its own. This is a one-shot client (one request per spawn), so
    // there is never a second line to send; ending stdin here tells the
    // server exactly that, instead of leaving it to `child.kill()` (SIGTERM)
    // to interrupt the blocked read once `settle()`/`fail()` runs.
    child.stdin!.end()
  })
}
