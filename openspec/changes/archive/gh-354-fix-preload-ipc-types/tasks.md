# Tasks

## T1: Import EndpointKind and AgentRuntime in preload

- **Agent**: fullstack-engineer
- **Tier**: build
- **Depends on**: —
- **Touches**: `src/preload/index.ts`
- **Description**: Add `EndpointKind` and `AgentRuntime` to the existing type import block from `../shared/ipc.js`.

## T2: Replace string with EndpointKind in addEnvironment and addEndpoint

- **Agent**: fullstack-engineer
- **Tier**: build
- **Depends on**: T1
- **Touches**: `src/preload/index.ts`
- **Description**: Change `kind?: string` to `kind?: EndpointKind` in `addEnvironment`, and `kind: string` to `kind: EndpointKind` in `addEndpoint`.

## T3: Replace string with AgentRuntime in updateEnvironment

- **Agent**: fullstack-engineer
- **Tier**: build
- **Depends on**: T1
- **Touches**: `src/preload/index.ts`
- **Description**: Change `agentRuntime?: string` to `agentRuntime?: AgentRuntime` in the `updateEnvironment` parameter type.

## T4: Verify

- **Agent**: fullstack-engineer
- **Tier**: build
- **Depends on**: T2, T3
- **Touches**: —
- **Description**: Run `rtk pnpm typecheck`, `rtk pnpm test`, `rtk pnpm build`. All must pass.
