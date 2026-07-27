# Proposal: Centralized IPC Channel Registry

## Problem

IPC channel names are scattered as inline string literals across three layers (preload, shared types, main process). There is no single source of truth. A typo in any channel name silently breaks the IPC call with no compile-time error. GR-SEC-002 requires all IPC channels to be defined in `src/shared/ipc.ts`, but only TypeScript interfaces exist there — no channel name constants.

## Solution

Add `src/shared/ipc-channels.ts` with a single `IPC_CHANNELS` const object containing every channel name. Preload, main process handlers, validators, and `webContents.send` callers all import from this single source. A typo becomes a compile-time error.

## Scope

- New file: `src/shared/ipc-channels.ts`
- Modified files: `src/preload/index.ts`, `src/main/index.ts`, `src/main/ipc-validation.ts`, `src/main/agent-client.ts`, `src/main/vm-wizard.ts`, `src/main/notification-service.ts`, `src/main/mcp-client.ts`, `src/main/opencode-client.ts`

## Acceptance Criteria

1. All IPC channel string literals replaced with `IPC_CHANNELS.XXX` constants
2. No inline channel string literals remain in any `src/` file
3. `pnpm typecheck` passes
4. `pnpm test` passes
5. `pnpm build` passes
6. Comment ratio under 10% on the new file

## References

- Issue #387
- GR-SEC-002
