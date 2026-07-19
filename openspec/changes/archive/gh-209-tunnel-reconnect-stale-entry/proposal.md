# proposal.md

## Change: gh-209-tunnel-reconnect-stale-entry

### Problem

In `tunnel-registry.ts`, `scheduleTunnelReconnect()` captures a `TunnelEntry` object by reference and mutates it in a `setTimeout` callback. When `openTunnelForEndpoint()` is called inside that callback, it deletes the stale entry from `registry` (line 167) and creates a **new** `TunnelEntry` (line 203). The callback then sets `entry.reconnect = null` on the **old stale object**, not the fresh registry entry. This causes:

1. The new registry entry may retain `reconnect` state from a previously dead tunnel indefinitely
2. `isTunnelReconnecting()` returns `true` for a tunnel that is actually connected
3. The reconnect `failureCount` and `backoffMs` accumulate across reconnect cycles without proper reset on the canonical entry

### Fix

In `scheduleTunnelReconnect`, after calling `openTunnelForEndpoint()`, look up the **fresh** entry from the registry instead of mutating the captured `entry`. Apply the same pattern in the failure and catch paths.

### Affected files

- `src/main/tunnel-registry.ts` -- `scheduleTunnelReconnect()`
- `tests/tunnel-reconnect.test.ts` -- add regression test
