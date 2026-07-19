# Archive: Poll loops per instance on a 5s interval

## Change ID

gh-101-poll-loops-per-instance

## Status

Completed

## Summary

Replaced the selected-only loop/project polling with per-environment polling that iterates all connected instances every ~5s (loops) and ~10s (projects). Polling pauses for unreachable instances and resumes automatically on recovery. All data flows through the existing `perEnvLoops` / `perEnvProjects` stores.

## What Changed

### Files Modified

- `src/renderer/src/App.tsx` — Replaced two single-environment polling effects with per-environment polling effects that iterate all connected environments on each tick.

### Behavioral Changes

| Before | After |
|--------|-------|
| Only the selected environment's loops polled every 5s | All connected environments' loops polled every 5s |
| Other environments had no loop data in `perEnvLoops` | All connected environments have fresh loop data |
| Cold-start delay when switching to a different environment | No cold-start delay — data already available |
| No explicit pause/resume for unreachable instances | Unreachable instances are skipped on each tick (pause), automatically included when phase changes to "connected" (resume) |

### No New

- No new IPC channels — uses existing `fetchLoops` / `fetchProjects` / `apiRequest` path
- No new services or interfaces
- No changes to the mock adapter — `MockApiService.request` already handles all loop/project paths
- No UI changes — sidebar, loop bar, cards, and rollups already read from `perEnvLoops`

## Verification

- `pnpm typecheck` passes (no new errors introduced)
- Renderer TypeScript (`tsc --noEmit -p tsconfig.web.json`) — no new errors from modified files
- Mock mode (`pnpm dev:web`) continues to work via existing `MockApiService`
