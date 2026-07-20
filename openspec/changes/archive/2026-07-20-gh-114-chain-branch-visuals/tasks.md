# gh-114 Tasks

## Task 1: Restructure resolveTaskChain to track branch semantics

- [ ] Rewrite `resolveTaskChain` to mark each ChainStep with explicit `branchType` and `parentHasBranch` fields; ensure linear chains produce no branch markers <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/TaskChainView.tsx] -->

## Task 2: Render ok marker and distinct failure branch visuals

- [ ] Update `TaskChainView` and `TaskChainStep` to render "ok" markers on on-success connectors and distinct on-failure visuals; suppress branch markers/labels when chain is linear <!-- agent: frontend-engineer.build, depends_on: [1], touches: [src/renderer/src/components/TaskChainView.tsx] -->

## Task 3: Add CSS styles for ok markers and branch connectors

- [ ] Add `.task-chain-connector--ok` with accent color and ok badge; add `.task-chain-connector--fail` with danger color; update branch-label; hide markers when chain is linear <!-- agent: frontend-engineer.build, depends_on: [2], touches: [src/renderer/src/theme.css] -->

## Task 4: Add i18n key for ok marker and fix en.json

- [ ] Add `taskChain.ok` = "ok" to en.json <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->

## Task 5: Verify typecheck passes

- [ ] Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [1,2,3,4], touches: [] -->
