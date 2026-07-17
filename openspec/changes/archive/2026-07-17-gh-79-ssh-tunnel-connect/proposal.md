# Open SSH tunnel to remote loop-task daemon from the main process

## Change ID
gh-79-ssh-tunnel-connect

## Summary
For SSH-reach instances, the main process automatically opens a local port forward to the daemon's API port on connect. The instance's effective API base URL becomes the forwarded local port so existing `api:request` / `stream:subscribe` plumbing works unchanged. Tunnels close cleanly on instance removal or app quit.

## Problem
SSH-reach environments store a `baseUrl` like `http://hostName:8845` which is unreachable from the desktop because loop-task binds its HTTP API to `127.0.0.1` on the VM. The VM wizard opens a tunnel during setup, but once the app restarts, there is no mechanism to re-open tunnels for existing SSH environments. The connection supervisor probes the unreachable URL, the environment appears offline, and all API requests fail.

## Solution
- Create a `tunnel-registry.ts` module that manages SSH port-forward tunnels for SSH-reach environments. It resolves the endpoint's `sshTarget` + URL to derive the `SshHost` and remote port, opens a local forward via the existing `ssh-tunnel.ts` `openTunnel()` function, and tracks active tunnels keyed by `environmentId:endpointId`.
- Expose a `resolveEffectiveUrl()` function that returns `http://127.0.0.1:<localPort>` for SSH endpoints with active tunnels, or the original URL for all other cases.
- Integrate with the main process lifecycle:
  - **Startup** (`seedSupervisors`): open tunnels for all SSH endpoints before creating connection supervisors and health trackers.
  - **Add environment** (`config:addEnvironment`): open tunnel after persisting.
  - **Add endpoint** (`config:addEndpoint`): open tunnel for new SSH endpoints.
  - **Remove endpoint** (`config:removeEndpoint`): close tunnel before removing.
  - **Remove environment** (`config:removeEnvironment`): close all tunnels for the environment.
  - **Switch active endpoint** (`config:setActiveEndpoint`): re-open tunnels after supervisor rebuild.
  - **Wizard complete** (`vmWizard:start`): open tunnel for the newly created environment.
  - **App quit** (`window-all-closed`): close all tunnels.
- Wire `resolveEffectiveUrl` into the `handleApiRequest` and `handleStreamSubscribe` functions so HTTP/SSE requests use the tunneled local port for SSH environments.
- Update `EndpointHealthTracker` to accept an optional URL resolver so per-endpoint health probes also go through the tunnel.
- All forwarded ports bind to `127.0.0.1` only (SSH `-L` default), keeping the security boundary intact.

## Acceptance criteria mapping
- [x] For SSH-reach instances, the main process opens a local forward to the daemon's API port on connect
- [x] The instance's effective API base URL becomes the forwarded local port; existing api:request plumbing works unchanged
- [x] Tunnel closes cleanly on instance removal or app quit

## Affected files
- `src/main/tunnel-registry.ts` -- new: tunnel registry with open/close/resolve helpers
- `src/main/index.ts` -- integrate tunnel lifecycle with environment CRUD, effective URL resolution in HTTP/SSE handlers, tunnel cleanup on quit
- `src/main/connection-supervisor.ts` -- accept optional URL resolver in EndpointHealthTracker constructor
- `src/main/__tests__/tunnel-registry.test.ts` -- unit tests for the tunnel registry
