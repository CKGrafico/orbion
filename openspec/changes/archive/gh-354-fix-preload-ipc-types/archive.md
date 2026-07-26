# Archive: Fix Preload IPC Type Widening

## Change ID
gh-354-fix-preload-ipc-types

## Status
Archived

## Summary
Replaced widened `string` types in `src/preload/index.ts` with strict discriminated unions `EndpointKind` and `AgentRuntime` from `src/shared/ipc.ts`. Three parameter signatures corrected: `addEnvironment(kind?)`, `addEndpoint(kind)`, `updateEnvironment(agentRuntime?)`.

## Tasks Completed
- T1: Added `EndpointKind` and `AgentRuntime` to type imports
- T2: Replaced `string` with `EndpointKind` in `addEnvironment` and `addEndpoint`
- T3: Replaced `string` with `AgentRuntime` in `updateEnvironment`
- T4: Verified — typecheck, test (784/784), build all pass

## Acceptance Criteria
All three Gherkin scenarios satisfied at the type level:
- `addEnvironment` with invalid `kind` produces compile error
- `addEndpoint` with invalid `kind` produces compile error
- `updateEnvironment` with invalid `agentRuntime` produces compile error

## Commits
- `066d7c9` propose: fix preload IPC type widening (gh-354)
- `068945e` fix: use EndpointKind and AgentRuntime in preload bridge (gh-354)
