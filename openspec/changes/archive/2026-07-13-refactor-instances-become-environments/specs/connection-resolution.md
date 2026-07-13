# Spec: Connection resolution and fingerprint

## Connection supervisor (src/main/connection-supervisor.ts)

- Unchanged core supervisor logic
- `makeEndpointProbe()` wraps `makeProbe()` for per-endpoint probing
- `fetchFingerprint(baseUrl)` probes `GET /.well-known/orbion/environment`
- `resolveActiveUrl(endpoints, activeEndpointId)` returns the URL of the active endpoint

## Main process (src/main/index.ts)

- Supervisors keyed by environment ID
- `seedSupervisors()` on startup resolves active URL per environment
- `setActiveEndpoint` IPC handler: destroys old supervisor, creates new one for new active URL
- `connection:getEndpointHealth` IPC returns per-endpoint health array
- `connection:fetchFingerprint` IPC for daemon identity discovery
