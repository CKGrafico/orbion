## Why

`detectPlatform()` in `platform-classifier.ts` and the `detect-platform` case in `infra-handlers.ts` both spawn `execFile("git", ["remote", "-v"])` with identical cwd, timeout, and error handling, then parse the output with the same `parseGitRemoteOutput()`. When `detect-platform` runs, it calls `detectPlatform()` first (one git spawn), then immediately spawns git again to get the remotes list. Two subprocess spawns for the same data, plus drift risk and inconsistent error fallback (`"unknown"` vs `[]`).

## What Changes

- Extend `detectPlatform()` return type from `Promise<PlatformType>` to `Promise<PlatformDetection>` (a new interface carrying both `platform` and `remotes`).
- Remove the duplicate `execFile("git", ["remote", "-v"])` call in `infra-handlers.ts` `detect-platform` case; destructure both values from the single `detectPlatform()` call.
- Update all callers of `detectPlatform()` to destructure the new return shape.
- Update existing tests to match the new return type.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `platform-detection`: `detectPlatform()` now returns `{ platform, remotes }` instead of just `PlatformType`, eliminating the duplicate git spawn in `infra-handlers.ts`.

## Impact

- `src/main/platform-classifier.ts` — signature change to `detectPlatform()`, new `PlatformDetection` interface
- `src/main/infra-handlers.ts` — remove duplicate `execFile` + `parseGitRemoteOutput`, use destructured result from `detectPlatform()`
- `src/main/__tests__/platform-classifier.test.ts` — update `detectPlatform` tests if any exist (currently no tests call `detectPlatform` directly; only `classifyPlatform` and `parseGitRemoteOutput` are tested, so no test changes needed)
- `src/shared/ipc.ts` — no change needed; `PlatformDetectionResult` already exists and carries `{ platform, remotes, cached }`
