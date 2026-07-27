# Tasks: Type-safe InfraActionArgs with discriminated union

## Task 1: Add CloneRepoParams and convert InfraActionArgs to discriminated union in ipc.ts
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: none
- **touches**: src/shared/ipc.ts
- **done**: false

## Task 2: Remove unsafe casts in infra-handlers.ts using discriminated union narrowing
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1
- **touches**: src/main/infra-handlers.ts
- **done**: false

## Task 3: Update ipc-validation.ts to use narrowed params from discriminated union
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1
- **touches**: src/main/ipc-validation.ts
- **done**: false

## Task 4: Remove unsafe casts in MockInfraService
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1
- **touches**: src/renderer/src/services/mock/MockServices.ts
- **done**: false

## Task 5: Run typecheck, test, build verification
- **agent**: fullstack-engineer
- **tier**: fast
- **depends_on**: 1, 2, 3, 4
- **touches**: none (CI verification only)
- **done**: false
