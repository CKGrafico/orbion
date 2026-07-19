## 1. TTL-based CLI Availability Cache

- [x] 1.1 Add `cliAvailableCheckedAt` timestamp and `CLI_CHECK_TTL_MS` constant (60 s), update `detectTailscaleCLI()` to respect TTL before short-circuiting <!-- agent: default, depends_on: [], touches: [src/main/tailscale.ts] -->

## 2. Explicit Cache Invalidation

- [x] 2.1 Add `invalidateTailscaleCliCache()` function that resets `cliAvailable` to `null` and `cliAvailableCheckedAt` to `0`; export it alongside existing exports <!-- agent: default, depends_on: [], touches: [src/main/tailscale.ts] -->

## 3. ENOENT Busting in fetchPeers

- [x] 3.1 In `fetchPeers()`, detect ENOENT from `execFile("tailscale", ...)` and call `invalidateTailscaleCliCache()` so the next call re-checks availability <!-- agent: default, depends_on: [2.1], touches: [src/main/tailscale.ts] -->

## 4. Verification

- [x] 4.1 Run `tsc --noEmit` and confirm zero type errors <!-- agent: default, depends_on: [1.1, 2.1, 3.1], touches: [] -->
