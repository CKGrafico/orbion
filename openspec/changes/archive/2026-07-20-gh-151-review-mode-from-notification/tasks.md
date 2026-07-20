# Tasks -- gh-151-review-mode-from-notification

## 1 -- Shared types

- [x] 1.1 Add `ReviewModeItem` type to `src/shared/ipc.ts` carrying `repo`, `number`, `title`, `author`, `url`, `headSha`, `verdict` fields <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->

## 2 -- Renderer services & DI

- [x] 2.1 Add `IReviewModeService` interface to `src/renderer/src/services/interfaces.ts` with `enter(item: ReviewModeItem): void`, `exit(): void`, `activeItem` observable, `isActive` observable <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/interfaces.ts] -->
- [x] 2.2 Implement `ReviewModeService` in `src/renderer/src/services/impl/ReviewModeService.ts` with `enter()`, `exit()`, `onStateChange()` callbacks <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/impl/ReviewModeService.ts] -->
- [x] 2.3 Implement `MockReviewModeService` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [x] 2.4 Register both implementations in `src/renderer/src/services/container.ts` <!-- agent: frontend-engineer.build, depends_on: [2.2, 2.3], touches: [src/renderer/src/services/container.ts] -->

## 3 -- UI: ReviewModeOverlay component

- [x] 3.1 Create `src/renderer/src/features/review/ReviewModeOverlay.tsx` -- full-screen overlay with header (PR identity + verdict chip + action placeholder + close button) and body placeholder, Esc key handler <!-- agent: frontend-engineer.build, depends_on: [1.1, 2.1], touches: [src/renderer/src/features/review/ReviewModeOverlay.tsx] -->
- [x] 3.2 Add CSS for `review-mode-overlay`, `review-mode-header`, `review-mode-body` etc. to `src/renderer/src/theme.css` <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/theme.css] -->

## 4 -- Wiring in App.tsx

- [x] 4.1 Add `reviewModeItem` state in `AppInner`, inject `IReviewModeService`, render `ReviewModeOverlay` conditionally over the main panel <!-- agent: frontend-engineer.build, depends_on: [2.1, 3.1], touches: [src/renderer/src/App.tsx] -->
- [x] 4.2 Wire `onClickItem` in InboxView and InboxPanel: when item kind is `pr-awaiting-review`, call `reviewModeService.enter()` with the PR data instead of navigating <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/App.tsx] -->

## 5 -- i18n

- [x] 5.1 Add i18n keys for review mode header strings to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [src/renderer/src/i18n/en.json] -->

## 6 -- Verification

- [x] 6.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [1.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 5.1], touches: [] -->
