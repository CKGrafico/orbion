# Proposal: Type-safe InfraActionArgs with discriminated union

## Summary

Replace `InfraActionArgs.params?: Record<string, unknown>` with a discriminated union keyed on `action`, eliminating 11+ unsafe `as` casts in infra-handlers and 3 in MockInfraService. Compile-time enforcement links each action to its params type.

## Problem

`InfraActionArgs.params` typed as `Record<string, unknown>`. Every infra handler casts it via `as SomeParams | undefined`. Two sources of truth (type + IPC validation) with no compile-time link. New field added to a params type without updating validation = silent type confusion.

## Fix

Replace with discriminated union:
```ts
export type InfraActionArgs =
  | { action: "machine-status" }
  | { action: "clone-repo"; params: CloneRepoParams }
  | { action: "create-issue"; params: CreateIssueParams }
  // ... etc
```

This makes `args.params` type-safe without casts. Add missing `CloneRepoParams` interface. `machine-status` omits `params` (none needed).

## Scope

- Scope classification: **focused**
- Affected files: `src/shared/ipc.ts`, `src/main/infra-handlers.ts`, `src/main/ipc-validation.ts`, `src/renderer/src/services/mock/MockServices.ts`
- Issue: #402
