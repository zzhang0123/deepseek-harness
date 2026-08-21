/** Compute settings card: transport set + endpoint config over the settings channel. */
import { memo, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'

/** Endpoint configuration (mirrors the SD's `ComputeEndpoints`). */
export interface ComputeEndpoints {
  readonly ssh?: { readonly host?: string; readonly command?: string }
  readonly http?: { readonly baseUrl?: string }
}

/** The transport vocabulary (mirrors the SD's `Transport` union). */
const TRANSPORTS = ['local', 'ssh', 'http'] as const

/** Render the compute settings card: transports + editable endpoints. */
export const ComputeSection = memo(function ComputeSection({ scope }: { scope: SettingsScope<ComputeEndpoints> }) {
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const value = snapshot.value ?? {}
  const [httpBaseUrl, setHttpBaseUrl] = useState(value.http?.baseUrl ?? '')
  const [sshHost, setSshHost] = useState(value.ssh?.host ?? '')

  const save = (): void => {
    void scope.set('http', { ...(value.http ?? {}), baseUrl: httpBaseUrl })
    void scope.set('ssh', { ...(value.ssh ?? {}), host: sshHost })
  }

  return (
    <section data-rheplicant-compute>
      <div>Compute transport</div>
      <ul>
        {TRANSPORTS.map(transport => (
          <li key={transport} data-transport={transport}>{transport}</li>
        ))}
      </ul>
      <p>The transport is chosen per request (the `transport` field), not a global setting.</p>
      <label>
        HTTP endpoint
        <input
          value={httpBaseUrl}
          onChange={event => setHttpBaseUrl(event.target.value)}
          placeholder="http://cluster:8080"
          data-endpoint-http
        />
      </label>
      <label>
        SSH host
        <input
          value={sshHost}
          onChange={event => setSshHost(event.target.value)}
          placeholder="cluster"
          data-endpoint-ssh
        />
      </label>
      <button type="button" onClick={save}>Save</button>
    </section>
  )
})
