# feat: connection supervisor — backoff, retries and real status

## Summary
Connection health today is "did the last 5s poll succeed". A dropped VPN looks identical to a dead daemon, a dead daemon keeps getting hammered at full rate forever, and the sidebar dot can't tell "connecting for the first time" from "was fine, lost it, retrying". Everything we want to build on top (chat, streaming) needs a connection layer that tells the truth.

## What changed
- Added `osOffline` guard to `ConnectionSupervisor`: when OS reports no network, supervisor parks in `offline` phase without consuming retry attempts
- Fixed `EndpointHealthTracker` to use actual `phase` from supervisor instead of simplified `failureCount > 0` heuristic  
- Propagated `osOffline` state to all supervisors and trackers from main process
- Exported `classifyError` and `isNetworkDownError` for testability
- 24 unit tests covering all acceptance criteria

## Acceptance criteria met
- [x] Kill the daemon: the app moves to `backoff` and retries at 1/2/4/8/16s instead of every 5s
- [x] Restart it: reconnects within one backoff step; counter resets after 30s stable
- [x] Disable the network adapter: `offline` with zero retry spam; re-enable: reconnects without user action
- [x] A 401 shows `blocked` with a reason instead of an infinite retry loop

## Files modified
- `src/main/connection-supervisor.ts` — `setOsOffline()`, export helper functions, `EndpointHealthTracker` phase fix
- `src/main/index.ts` — propagate `osOffline` to supervisors/trackers, remove unused import
- `tests/connection-supervisor.test.ts` — 24 unit tests
