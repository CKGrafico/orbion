# Tasks: Agent risk verdict on each PR

## 1. Shared types & IPC contract
- [ ] 1.1 Add `headSha` field to `PrAwaitingReviewItem` and `PrRiskLevel`, `PrVerdict`, `GetPrVerdictParams`, `GetPrVerdictResult` types to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add `"get-pr-verdict"` to `InfraAction` in `src/shared/ipc.ts` and update `INFRA_ACTIONS` in `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts, src/main/ipc-validation.ts] -->

## 2. Main process: diff analyzer module
- [ ] 2.1 Create `src/main/diff-analyzer.ts` with `analyzeDiff()` pure function implementing the heuristic risk analysis <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/diff-analyzer.ts] -->
- [ ] 2.2 Add unit tests for `analyzeDiff` in `tests/diff-analyzer.test.ts` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [tests/diff-analyzer.test.ts] -->

## 3. Main process: infra action handler
- [ ] 3.1 Update `GhPrJson` to include `headRefOid` and update `--json` flag list; map to `headSha` in `PrAwaitingReviewItem` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 3.2 Add `get-pr-verdict` infra action handler that runs `gh pr diff` and delegates to `analyzeDiff` <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2], touches: [src/main/index.ts] -->

## 4. Renderer services: verdict service + inbox integration
- [ ] 4.1 Add `IPrVerdictService` interface, `PrVerdictService` implementation, `MockPrVerdictService`, and register in DI container <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/interfaces.ts, src/renderer/src/services/impl/PrVerdictService.ts, src/renderer/src/services/mock/MockServices.ts, src/renderer/src/services/container.ts] -->
- [ ] 4.2 Extend `InboxBuildParams` with `prVerdicts`, update `deriveItems()` to attach verdicts to PR items, add `prVerdict` field to `InboxItem` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts, src/renderer/src/services/interfaces.ts, src/renderer/src/services/impl/InboxService.ts] -->

## 5. UI: verdict display on inbox items
- [ ] 5.1 Add i18n keys for verdict UI strings <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 5.2 Add risk-level chip CSS + verdict display to `InboxPanel.tsx` and `InboxView.tsx` <!-- agent: frontend-engineer.build, depends_on: [4.2, 5.1], touches: [src/renderer/src/features/inbox/InboxPanel.tsx, src/renderer/src/features/inbox/InboxView.tsx, src/renderer/src/theme.css] -->

## 6. Verification
- [ ] 6.1 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [3.2, 4.2, 5.2], touches: [] -->
