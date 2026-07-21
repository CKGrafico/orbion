## Context

`platform-classifier.ts` exports `detectPlatform(directory)` which spawns `git remote -v` once and returns `PlatformType`. `infra-handlers.ts` `detect-platform` case calls `detectPlatform()` then spawns `git remote -v` again to get the remotes list. Same command, same directory, two subprocesses.

## Goals / Non-Goals

**Goals:**
- Single `git remote -v` spawn per `detect-platform` call
- Consistent error handling: both `platform` and `remotes` come from one execution
- Maintain existing `PlatformDetectionResult` IPC shape (no IPC contract change)

**Non-Goals:**
- Changing the cache strategy or cache key
- Changing the `PlatformType` enum values
- Adding new platform classifiers

## Decisions

1. **Return struct from `detectPlatform()`** instead of `PlatformType`. New `PlatformDetection` interface: `{ platform: PlatformType; remotes: string[] }`. The function already has the remotes internally; returning them eliminates the second spawn.

2. **`platformCache` stores only `PlatformType`** (not the full `PlatformDetection`). The cache is for the platform classification; remotes are cheap to re-derive if needed elsewhere, and bloating the cache with URL lists is unnecessary.

3. **Error case returns `{ platform: "unknown", remotes: [] }`** — consistent state, no partial-failure mismatch.

## Risks / Trade-offs

- **Breaking change for `detectPlatform()` callers.** Any code calling `detectPlatform()` and expecting `PlatformType` must destructure. Current callers: `infra-handlers.ts` only. Low risk.
- **No remotes caching.** Remotes are not cached between calls. Acceptable: the primary cache concern is the platform classification, and the whole point is eliminating the double-spawn within a single `detect-platform` invocation.
