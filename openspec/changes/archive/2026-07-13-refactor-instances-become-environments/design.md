# Design: Environments with access endpoints

## Type model

- `Environment`: id, name, endpoints[], activeEndpointId
- `AccessEndpoint`: id, kind (direct|ssh|tailscale), url, lastError, failureCount
- `EndpointKind` type: "direct" | "ssh" | "tailscale"

## Persistence

- electron-store key `environments` replaces `instances`
- `instancesMigrated` flag prevents re-migration
- Migration: each `Instance` becomes an `Environment` with one `AccessEndpoint` of kind "direct"
- LocalStorage migration: `lta.instances.v1` -> `lta.environments.v1`

## Connection

- Supervisor keyed by environment ID, probes active endpoint
- `resolveActiveUrl()` finds the active endpoint's URL
- `fetchFingerprint()` probes `/.well-known/orbion/environment` for daemon identity
- Endpoint switching: destroy old supervisor, create new one for the new active endpoint

## IPC

- `ConfigBridge`: getEnvironments, addEnvironment, removeEnvironment, addEndpoint, removeEndpoint, setActiveEndpoint, getSelectedEnvironmentId, setSelectedEnvironmentId, migrateFromLocalStorage
- `ConnectionBridge`: getStatus, getEndpointHealth, retry, onStatusChange, onEndpointHealthChange, notifyNetworkChanged

## UI

- Sidebar lists environments with endpoint kind labels
- Endpoint switcher shown when environment has >1 endpoint and is selected
- AddInstanceModal -> AddEnvironmentModal terminology
- All views accept `Environment` prop, use `resolveBaseUrl()` for API base URL
