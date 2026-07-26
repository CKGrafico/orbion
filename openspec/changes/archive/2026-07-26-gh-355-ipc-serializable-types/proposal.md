# Proposal: IPC Serializable Types

## Issue

#355 — LogEntry.context, McpToolInfo.inputSchema, and ApiResponse.data use unbounded `unknown` over IPC, allowing non-structured-clone-serializable values to silently corrupt when crossing the Electron IPC boundary.

## Problem

Three shared types use `unknown` or `Record<string, unknown>` for fields that cross Electron process boundaries:

1. **`LogEntry.context: Record<string, unknown>`** — values may be functions, Symbols, circular refs, or BigInt. The `log:write` IPC channel is fire-and-forget; serialization failures are silently swallowed. Current validator only checks shape (is-object), not value serializability.

2. **`McpToolInfo.inputSchema: unknown`** — MCP tool schemas are always JSON Schema objects. `unknown` permits non-serializable values. Should be `Record<string, unknown>` at minimum.

3. **`ApiResponse<T = unknown>` / `McpToolCallResult.data?: unknown`** — default `unknown` allows any type to cross IPC without constraint.

## Approach

1. Create a `SerializableValue` recursive type in `src/shared/log.ts` that constrains context values to structured-clone-safe primitives (string, number, boolean, null, plus recursive arrays/records of the same).

2. Change `LogEntry.context` from `Record<string, unknown>` to `Record<string, SerializableValue>`.

3. Change `McpToolInfo.inputSchema` from `unknown` to `Record<string, unknown>`.

4. Add runtime validation in the `log:write` IPC validator to check context values are JSON-serializable (via `JSON.stringify` round-trip, matching the pattern already used in `api:request` body validation).

5. Add tests for the new context value validation.

6. Leave `ApiResponse<T = unknown>` default as-is — changing it would cascade to every caller. The generic `T` lets callers specify their own serializable type. Document the constraint in a comment.

## Acceptance Criteria

- `LogEntry.context` type only accepts structured-clone-serializable values
- `McpToolInfo.inputSchema` is typed as `Record<string, unknown>`
- `log:write` IPC validator rejects context with non-serializable values
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm build` passes
