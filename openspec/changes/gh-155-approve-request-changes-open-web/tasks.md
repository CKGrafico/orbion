# Tasks — gh-155: Approve / request changes from review mode, plus open on web

## 1 — Shared types & IPC contracts

- [ ] 1.1 Add `"submit-pr-review"` and `"open-pr-in-browser"` to `InfraAction` union in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add `SubmitPrReviewParams` and `SubmitPrReviewResult` interfaces to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.3 Add `OpenPrInBrowserParams` interface to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->
- [ ] 1.4 Update `INFRA_ACTIONS` exhaustive check in `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->

## 2 — Main process: infra action handlers

- [ ] 2.1 Add `submit-pr-review` case to `infra:executeAction` handler in `src/main/index.ts` — resolve platform CLI (gh/az), for GitHub run `gh pr review <number> --repo <repo> --approve|--request-changes [--body <comment>]`, for ADO run `az repos pr set-vote`, validate inputs, return `SubmitPrReviewResult` <!-- agent: frontend-engineer.build, depends_on: [1.2, 1.4], touches: [src/main/index.ts] -->
- [ ] 2.2 Add `open-pr-in-browser` case to `infra:executeAction` handler — call `shell.openExternal(url)` to open URL in system browser, validate URL protocol <!-- agent: frontend-engineer.build, depends_on: [1.3, 1.4], touches: [src/main/index.ts] -->

## 3 — Renderer services: review mode review submission

- [ ] 3.1 Add `submitReview(params: { repo: string; number: number; event: "APPROVE" | "REQUEST_CHANGES"; body?: string }): Promise<{ ok: boolean; error?: string }>` method to `IReviewModeService` interface in `src/renderer/src/services/interfaces.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 3.2 Implement `submitReview` in `ReviewModeService` — call `IInfraService.executeAction({ action: "submit-pr-review", params })`, on success call `markDisposed(repo, number)`, resolve the inbox item, return result <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/services/impl/ReviewModeService.ts] -->
- [ ] 3.3 Add `openOnWeb(url: string): void` method to `IReviewModeService` interface <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 3.4 Implement `openOnWeb` in `ReviewModeService` — call `IInfraService.executeAction({ action: "open-pr-in-browser", params: { url } })` <!-- agent: frontend-engineer.build, depends_on: [3.3], touches: [src/renderer/src/services/impl/ReviewModeService.ts] -->

## 4 — UI: Review mode approve/request-changes buttons

- [ ] 4.1 Add Approve and Request Changes buttons to `ReviewModeOverlay.tsx` header actions area, wired to `reviewModeService.submitReview()`; Request Changes toggles an inline comment input <!-- agent: frontend-engineer.build, depends_on: [3.2], touches: [src/renderer/src/features/review/ReviewModeOverlay.tsx] -->
- [ ] 4.2 Replace existing `window.open(item.url, "_blank")` call in ReviewModeOverlay with `reviewModeService.openOnWeb(item.url)` <!-- agent: frontend-engineer.build, depends_on: [3.4], touches: [src/renderer/src/features/review/ReviewModeOverlay.tsx] -->
- [ ] 4.3 Add CSS styles for review action buttons and comment input to `src/renderer/src/theme.css` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/theme.css] -->

## 5 — UI: "Open on web" on inbox PR items

- [ ] 5.1 Add "Open on web" button/link to PR inbox items in `InboxView.tsx` — calls `window.open(item.prUrl, "_blank")` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/features/inbox/InboxView.tsx] -->
- [ ] 5.2 Add "Open on web" button/link to PR inbox items in `InboxPanel.tsx` — same behavior <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/features/inbox/InboxPanel.tsx] -->

## 6 — i18n

- [ ] 6.1 Add i18n keys for approve, request-changes, comment prompt, and "Open on web" to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->

## 7 — Mock adapter

- [ ] 7.1 Add `submit-pr-review` mock handler in `MockInfraService.executeAction()` returning success with mock review state <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 7.2 Add `open-pr-in-browser` mock handler in `MockInfraService.executeAction()` (no-op in browser, just returns ok) <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 7.3 Add `submitReview` and `openOnWeb` mock implementations to `MockReviewModeService` in `MockServices.ts` <!-- agent: frontend-engineer.build, depends_on: [3.1, 3.3], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 8 — Verification

- [ ] 8.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [2.1, 2.2, 3.2, 3.4, 4.1, 4.2, 5.1, 5.2, 6.1, 7.1, 7.2, 7.3], touches: [] -->
