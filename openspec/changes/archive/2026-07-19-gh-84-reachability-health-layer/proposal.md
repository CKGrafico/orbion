# Reachability as its own health layer, separate from loop status

## Issue
GitHub #84

## Summary
Add a first-class reachability state per instance (`connected` / `reconnecting` / `unreachable`), derived from tunnel + API health — never from loop exit codes. Loops on an unreachable instance render as "unknown" (greyed), not "failed", and are excluded from failure tallies.

## Design
- **ReachabilityState** type in shared/ipc.ts: `"connected" | "reconnecting" | "unreachable"`
- **ReachabilityTracker** (main process): observes ConnectionStatus phase changes and derives reachability
  - `connected` ← phase `"connected"`
  - `reconnecting` ← phase `"connecting"` | `"backoff"`
  - `unreachable` ← phase `"offline"` | `"blocked"`
- **IPC bridge**: `reachability:getStatus`, `reachability:getAll`, `reachability:status` push event
- **Renderer service**: `IReachabilityService` with real + mock implementations
- **Consumer updates**: App.tsx, Sidebar, FleetHealthFooter, fleet-mapping.ts all use reachability to gate loop failure logic

## Acceptance Criteria
- [x] Each instance carries reachability: connected / reconnecting / unreachable, derived from tunnel + API health, never from loop exit codes
- [x] The state is exposed to the renderer as a first-class field, distinct from loop data
- [x] Loops on unreachable instances show as "unknown" (greyed)
- [x] Unreachable loops are excluded from failure tallies in FleetHealthFooter
