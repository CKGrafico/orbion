# Spec: Environment type and persistence

## Shared types (src/shared/ipc.ts)

- `EndpointKind = "direct" | "ssh" | "tailscale"`
- `AccessEndpoint { id, kind, url, lastError, failureCount }`
- `Environment { id, name, endpoints[], activeEndpointId }`
- `EndpointHealth { endpointId, phase, lastError, failureCount }`
- `ConfigBridge` methods for environments instead of instances

## Config store (src/main/config-store.ts)

- `environments` key replaces `instances`
- `selectedEnvironmentId` replaces `selectedInstanceId`
- `ensureMigrated()` auto-migrates on first access
- `addEnvironment()`, `removeEnvironment()`, `addEndpoint()`, `removeEndpoint()`, `setActiveEndpoint()`
- `updateEndpointHealth()` for per-endpoint failure tracking

## Renderer types (src/renderer/src/types.ts)

- Mirrors shared types: `AccessEndpoint`, `Environment`, `EndpointKind`
- `EnvironmentHealth` replaces `InstanceHealth`
