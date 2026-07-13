# Environment & Endpoint types

## Environment
- `id: string` — stable unique id
- `name: string` — display name
- `endpoints: AccessEndpoint[]` — ordered list of access endpoints
- `activeEndpointId: string | null` — which endpoint is currently in use
- `fingerprintId?: string` — stable daemon identity (from fingerprint route)

## AccessEndpoint
- `id: string` — unique within the environment
- `kind: EndpointKind` — "direct" | "ssh" | "tailscale"
- `url: string` — base URL to reach the daemon
- `lastError: string | null` — last connection error
- `failureCount: number` — consecutive failure count

## EndpointKind
`"direct" | "ssh" | "tailscale"` — new kinds added without changing renderer code.

## EnvironmentFingerprint
- `id: string` — stable daemon identity
- `label: string` — human-readable name from the daemon

## EndpointHealth (IPC, renderer-boundary)
- `endpointId: string`
- `phase: ConnectionPhase`
- `lastError: string | null`
- `failureCount: number`
