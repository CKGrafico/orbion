# Proposal: Fix Preload IPC Type Widening

## Summary

The preload bridge (`src/preload/index.ts`) widens `EndpointKind` and `AgentRuntime` to bare `string`, allowing invalid enum values to pass at compile time. Fix: import and use the strict discriminated-union types from `src/shared/ipc.ts`.

## Motivation

TypeScript should catch invalid enum values at compile time. The shared contract defines `EndpointKind = "direct" | "ssh" | "tailscale"` and `AgentRuntime = "opencode" | "claude"`, but the preload uses `string` for three parameters. Runtime validation in `ipc-validation.ts` catches bad values, but the contract should also be enforced at the type level.

## Approach

1. Add `EndpointKind` and `AgentRuntime` to the type import block in `src/preload/index.ts`
2. Replace `kind?: string` with `kind?: EndpointKind` in `addEnvironment`
3. Replace `kind: string` with `kind: EndpointKind` in `addEndpoint`
4. Replace `agentRuntime?: string` with `agentRuntime?: AgentRuntime` in `updateEnvironment`

No new IPC channels, no new files, no runtime behavior change.

## Acceptance Criteria

- Preload `addEnvironment` rejects non-EndpointKind `kind` at compile time
- Preload `addEndpoint` rejects non-EndpointKind `kind` at compile time
- Preload `updateEnvironment` rejects non-AgentRuntime `agentRuntime` at compile time
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm build` passes

## Affected Files

- `src/preload/index.ts` — lines 76-77, 79-80, 81-82

## References

- GitHub Issue #354
- Parent Issue #356
