# Runtime health chip on the instance

## Change ID
gh-86-runtime-health-chip

## Summary
Add a compact runtime-state chip to the instance detail header so users can see whether an instance's agent runtime is usable (server up, credentials valid) before they chat. The chip shows one of five states (ok / not running / not installed / auth problem / unreachable) with a short reason on hover or tap. State refreshes on connect and on a 30-second interval via existing runtime signals.

## Problem
When a user selects an instance, the header shows the daemon connection dot, HTTP/MCP chips, and the instance name, but gives no indication whether the agent runtime (OpenCode or Claude Code) is actually ready to accept a chat. A user might open a chat only to discover the runtime is not running, not installed, or has an authentication problem — requiring a round trip to diagnose.

## Solution
- Create a `deriveRuntimeHealth()` utility that composes existing signals (reachability, daemon health, OpenCode connection status, stored runtime state) into a single `RuntimeHealthState` with five distinct values and a human-readable reason string.
- Create a `RuntimeHealthChip` component that renders the derived state as a chip (colored dot + label, reason on hover/title), matching the existing chip design pattern in the instance header.
- Wire the chip into the instance detail header after the HTTP/MCP chips.
- Add a periodic 30-second OpenCode status refresh for the selected environment so the chip stays fresh (matching the main-process cache TTL).
- Surface `agentRuntime` and `runtimeState` fields on the renderer's `Environment` type (they already exist in the shared IPC `Environment` type but were not mirrored to the renderer's local type).
- Add i18n messages for all five states and their reason strings.
- Update mock OpenCode service to return differentiated statuses for environments named 'no-runtime', 'auth-problem', 'rejected' so the chip can be tested in browser-only dev mode.

## Acceptance criteria mapping
- [x] Instance shows a compact runtime state: ok / not running / not installed / auth problem, with a short reason on hover or tap
- [x] State refreshes on connect and on a reasonable interval via the runtime adapter

## Affected files
- `src/renderer/src/runtime-health.ts` -- new: deriveRuntimeHealth utility + state/color definitions
- `src/renderer/src/components/RuntimeHealthChip.tsx` -- new: chip component
- `src/renderer/src/App.tsx` -- wire chip into header, add periodic refresh
- `src/renderer/src/types.ts` -- add agentRuntime, runtimeState fields
- `src/renderer/src/i18n/en.json` -- state labels + reason strings
- `src/renderer/src/services/mock/MockServices.ts` -- realistic mock OpenCode statuses
