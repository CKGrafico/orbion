# Spec: SSH tunnel registry

## Overview
The tunnel registry (`src/main/tunnel-registry.ts`) is the sole owner of SSH tunnel lifecycle for SSH-reach environments. It bridges the gap between the raw endpoint URLs stored in config (e.g. `http://hostName:8845`) and the loopback addresses that the main process can actually reach (e.g. `http://127.0.0.1:19000`).

## Key types

- `ResolvedSshTarget` — derived from an `AccessEndpoint`: the `SshHost` and remote daemon port.
- `TunnelEntry` — internal registry entry with `environmentId`, `endpointId`, `tunnelId`, `localPort`, `remotePort`.

## Core operations

| Function | Description |
|---|---|
| `resolveSshTarget(endpoint)` | Parse sshTarget + URL → `{ host, remotePort }` or null |
| `openTunnelForEndpoint(envId, endpoint)` | Open/reuse tunnel; return local port or null |
| `closeTunnelForEndpoint(envId, endpointId)` | Close one tunnel (safe no-op) |
| `closeTunnelsForEnvironment(envId)` | Close all tunnels for an environment |
| `getTunnelLocalPort(envId, endpointId)` | Look up registered local port |
| `resolveEffectiveUrl(envId, endpoint)` | `http://127.0.0.1:<port>` for SSH, raw URL otherwise |
| `openTunnelsForEnvironment(envId, endpoints, activeId)` | Batch-open for all SSH endpoints |
| `closeAllRegistryTunnels()` | Full cleanup (app quit) |

## Port allocation
Auto-assigned from range 19000–19999, wrapping around. This avoids collisions with the default daemon port (8845) and common service ports.

## Security
- All SSH `-L` forwards bind to `127.0.0.1` only (SSH default).
- `resolveSshTarget` validates the `SshHost` via `validateSshHost()` to prevent shell injection.
- The tunnel process inherits the same SSH security options as the wizard: `StrictHostKeyChecking=accept-new`, `ExitOnForwardFailure=yes`, `BatchMode=yes`, server alive probes.
