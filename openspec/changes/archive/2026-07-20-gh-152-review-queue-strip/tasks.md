# Tasks — Review queue strip for PR batches

## 1 — Extend ReviewModeService with batch support

- [ ] 1.1 Add `enterBatch(items: ReviewModeItem[], selectedIndex?: number)` and `markDisposed(repo: string, number: number)` and `getDisposedPrs()` and `getBatchItems()` methods to `IReviewModeService` in `src/renderer/src/services/interfaces.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 1.2 Implement `enterBatch`, `markDisposed`, `getDisposedPrs`, `getBatchItems` in `ReviewModeService` (real) in `src/renderer/src/services/impl/ReviewModeService.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/impl/ReviewModeService.ts] -->
- [ ] 1.3 Implement the same methods in `MockReviewModeService` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

## 2 — Update review mode overlay with queue strip

- [ ] 2.1 Create `ReviewQueueStrip` component in `src/renderer/src/features/review/ReviewQueueStrip.tsx` — renders a scrollable list of PR rows, each showing number, truncated title, verdict chip, and tick-off indicator for disposed PRs <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/features/review/ReviewQueueStrip.tsx] -->
- [ ] 2.2 Refactor `ReviewModeOverlay.tsx` to use two-column layout (queue strip left, main area right), wire `ReviewQueueStrip`, and pass `prAwaitingReview`/`prVerdicts` through the service <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2], touches: [src/renderer/src/features/review/ReviewModeOverlay.tsx] -->

## 3 — Wire batch entry from inbox

- [ ] 3.1 Update `App.tsx` inbox `onClickItem` handler for `pr-awaiting-review` to call `reviewModeService.enterBatch(...)` with all PRs from the same batch context instead of `reviewModeService.enter(singleItem)` <!-- agent: frontend-engineer.build, depends_on: [1.2, 2.2], touches: [src/renderer/src/App.tsx] -->

## 4 — CSS styling

- [ ] 4.1 Add CSS for review queue strip layout and components to `src/renderer/src/theme.css` (queue strip sidebar, strip row, active highlight, disposed muted style, two-column grid) <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/theme.css] -->

## 5 — i18n

- [ ] 5.1 Add i18n keys for review queue strip strings to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/en.json] -->

## 6 — Verification

- [ ] 6.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [1.3, 2.2, 3.1, 4.1, 5.1], touches: [] -->
