## Why

The `cliAvailable` variable in `src/main/tailscale.ts` (line 4) is a module-level `boolean | null` that is cached forever after the first check. Once `detectTailscaleCLI()` sets it to `true` or `false`, all subsequent calls short-circuit and never re-check the filesystem. This means:

1. If a user installs the Tailscale CLI while Orbion is running, the app never detects it until restarted.
2. If Tailscale is uninstalled while Orbion runs, the stale `true` cache causes confusing ENOENT errors from `tailscale status --json` calls.

Severity: 5/10 — a working-but-stale feature is more confusing than a missing one.

## What Changes

- Add a TTL (60 seconds) to the CLI availability cache so `detectTailscaleCLI()` re-checks periodically rather than caching forever
- Add an `invalidateTailscaleCliCache()` export for explicit cache invalidation from callers (e.g., VM wizard refresh)
- Wire ENOENT detection into `fetchPeers()` so that if `tailscale status --json` fails with ENOENT, the CLI cache is immediately invalidated — preventing stale `available: true` from persisting

## Capabilities

### Modified Capabilities

- `tailscale-cli-detection`: The `detectTailscaleCLI()` function now uses a 60-second TTL cache instead of a forever cache, and exposes `invalidateTailscaleCliCache()` for on-demand invalidation

## Impact

- `src/main/tailscale.ts` — `detectTailscaleCLI()` gains TTL logic, `invalidateTailscaleCliCache()` added, ENOENT handling in `fetchPeers()` invalidates stale cache
- No changes to IPC contract (`TailscalePeersResponse` unchanged)
- No renderer changes required
