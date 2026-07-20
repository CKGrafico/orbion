# Tasks — PR-awaiting-review inbox type

## 1 — Shared types & contracts

- [ ] 1.1 Add `pr-awaiting-review` to `InboxItemKind` union in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add `pr-awaiting-review` case to `kindToNotificationType` mapping → `"watch"` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.3 Add `"pr-resolved"` to `InboxItemResolutionReason` union <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.4 Add `PrAwaitingReviewItem`, `ListPrsAwaitingReviewParams`, `ListPrsAwaitingReviewResult` types to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.5 Add optional PR fields (`prNumber`, `prRepo`, `prAuthor`, `prUrl`) to `InboxItem` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.6 Add `"list-prs-awaiting-review"` to `InfraAction` union <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.7 Update `INFRA_ACTIONS` exhausting check in `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [1.6], touches: [src/main/ipc-validation.ts] -->

## 2 — Main process: infra action for listing PRs

- [ ] 2.1 Add `list-prs-awaiting-review` case to `infra:executeAction` handler in `src/main/index.ts` — execute `gh pr list --search review-required --json number,title,author,url,createdAt,updatedAt,headRepository` with optional `--repo`/`--limit` flags, parse JSON, return `ListPrsAwaitingReviewResult` <!-- agent: frontend-engineer.build, depends_on: [1.4, 1.6, 1.7], touches: [src/main/index.ts] -->

## 3 — Renderer services: PR polling & inbox integration

- [ ] 3.1 Add `IPrPollingService` interface to `src/renderer/src/services/interfaces.ts` <!-- agent: frontend-engineer.build, depends_on: [1.4], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 3.2 Add `prAwaitingReview: PrAwaitingReviewItem[]` field to `InboxBuildParams` <!-- agent: frontend-engineer.build, depends_on: [1.4], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 3.3 Implement `PrPollingService` in `src/renderer/src/services/impl/PrPollingService.ts` — 60s interval, calls `infra.executeAction({ action: "list-prs-awaiting-review" })`, only when main VM connected <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/services/impl/PrPollingService.ts] -->
- [ ] 3.4 Register `PrPollingService` in DI container `src/renderer/src/services/container.ts` <!-- agent: frontend-engineer.build, depends_on: [3.3], touches: [src/renderer/src/services/container.ts] -->
- [ ] 3.5 Add `pr-awaiting-review` derivation to `deriveItems()` in `src/renderer/src/services/impl/InboxService.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.5, 3.2], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 3.6 Add `pr-awaiting-review` case to `getAvailableActions()` → `["dismiss", "open-in-chat"]` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 3.7 Add `pr-awaiting-review` case to `getResolutionReasonForItem()` → `"pr-resolved"` <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/renderer/src/services/impl/InboxService.ts] -->
- [ ] 3.8 Add `pr-awaiting-review` case to `answerFleetQuery()` — recognize "PR", "pull request", "review" queries <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/impl/InboxService.ts] -->

## 4 — UI: InboxView & i18n

- [ ] 4.1 Add `GitPullRequest` lucide icon + `pr-awaiting-review` case to `KindIcon` and `kindColor` in `InboxView.tsx` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/features/inbox/InboxView.tsx] -->
- [ ] 4.2 Add `pr-awaiting-review` case to `InboxPanel.tsx` item rendering (dot style class) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/features/inbox/InboxPanel.tsx] -->
- [ ] 4.3 Add i18n keys for PR inbox items to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 4.4 Wire `PrPollingService` into `App.tsx` — start/stop polling, pass `prAwaitingReview` to `InboxBuildParams` and `InboxView` <!-- agent: frontend-engineer.build, depends_on: [3.3, 3.5, 4.1], touches: [src/renderer/src/App.tsx] -->

## 5 — Mock adapter

- [ ] 5.1 Add `MockPrPollingService` to `src/renderer/src/services/mock/MockServices.ts` with 2-3 sample PRs <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 5.2 Register `MockPrPollingService` in mock DI container <!-- agent: frontend-engineer.build, depends_on: [5.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 5.3 Add mock `pr-awaiting-review` items in `MockInboxService.buildItems()` <!-- agent: frontend-engineer.build, depends_on: [3.2], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 6 — Verification

- [ ] 6.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [2.1, 3.5, 4.4, 5.3], touches: [] -->
