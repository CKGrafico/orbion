# connection-supervisor

Connection health supervisor per instance with phases (offline/connecting/connected/backoff/blocked), exponential backoff, error classification, and wakeup triggers. Replaces the raw 5s poll model. Implements #10.

## Problem

Connection health today is "did the last 5s poll succeed". A dropped VPN looks identical to a dead daemon, a dead daemon keeps getting hammered at full rate forever, and the sidebar dot can't tell "connecting for the first time" from "was fine, lost it, retrying". Everything we want to build on top (chat, streaming) needs a connection layer that tells the truth.

## Solution

One supervisor per environment, living in the main process, owning the whole lifecycle:

- **Phases:** `offline`, `connecting`, `connected`, `backoff`, `blocked`
- **Retries with exponential backoff:** 1s doubling up to a 16s cap. A connection that stays up for 30s resets the failure counter.
- **Error classification:** Network errors and timeouts are transient (retry forever). Auth and bad-config errors are blocking (stop retrying, surface the reason, wait for the user or a config change).
- **Wakeups:** Network came back, app window focused, user pressed retry — all skip the backoff wait.
- **`connected` means a real API request succeeded**, not just that a socket opened.

## Implementation

1. **`ConnectionSupervisor` class** (`src/main/connection-supervisor.ts`): Core supervisor with phase state machine, probe execution, backoff scheduling, stability tracking, and error classification.
2. **Main process integration** (`src/main/index.ts`): Supervisor registry, IPC handlers (`connection:getStatus`, `connection:retry`, `connection:networkChanged`), window focus wakeup, supervisor lifecycle tied to instance add/remove.
3. **IPC contract** (`src/shared/ipc.ts`): New `ConnectionPhase`, `ConnectionStatus`, `ConnectionBridge` types. Added `connection` sub-bridge to `LoopTaskBridge`.
4. **Preload bridge** (`src/preload/index.ts`): Exposed `connection.getStatus`, `connection.retry`, `connection.onStatusChange`, `connection.notifyNetworkChanged`.
5. **Renderer health** (`src/renderer/src/App.tsx`): Replaced raw poll-based health with supervisor-driven status. Mock-mode fallback preserved.
6. **Sidebar** (`src/renderer/src/components/Sidebar.tsx`): Health dot colors for all phases, tooltip with backoff timing and error info, retry button for blocked/backoff states.
7. **Types** (`src/renderer/src/types.ts`): Expanded `InstanceHealth` to include `connecting`, `backoff`, `blocked`.

## Acceptance Criteria

- [x] Kill the daemon: the app moves to `backoff` and retries at 1/2/4/8/16s instead of every 5s
- [x] Restart it: reconnects within one backoff step; counter resets after 30s stable
- [x] Disable the network adapter: `offline` with zero retry spam; re-enable: reconnects without user action
- [x] A 401 (once auth exists) shows `blocked` with a reason instead of an infinite retry loop
