# Archive: gh-151-review-mode-from-notification

## Change

Enter review mode from a PR notification

## Summary

Added PR review mode overlay that opens when the user clicks a `pr-awaiting-review` inbox item. The overlay presents a header with PR identity (repo, #number, title, author, risk verdict chip) and an action area placeholder, plus a body placeholder for future diff/briefing content. Esc or close button exits review mode and returns to the previous view state unchanged.

## Acceptance criteria mapping

- [x] Review mode opens over the main pane for the selected PR(s): header with PR identity + action area, body for content.
- [x] Esc/back returns exactly where I was.

## Implementation details

### New types
- `ReviewModeItem` in `src/shared/ipc.ts`: carries `repo`, `number`, `title`, `author`, `url`, `headSha`, `verdict?`.

### New services
- `IReviewModeService` interface in `src/renderer/src/services/interfaces.ts`: `enter()`, `exit()`, `getActiveItem()`, `onStateChange()`.
- `ReviewModeService` in `src/renderer/src/services/impl/ReviewModeService.ts`: manages active review item state and notifies listeners.
- `MockReviewModeService` in `src/renderer/src/services/mock/MockServices.ts`: mock counterpart for browser-only dev.
- Both registered in `src/renderer/src/services/container.ts` via DI.

### New UI components
- `ReviewModeOverlay` in `src/renderer/src/features/review/ReviewModeOverlay.tsx`: full-screen overlay with:
  - Header: PR icon, repo, number, title, author, risk chip, "Open on GitHub" button, close button.
  - Body: placeholder for future agent briefing / diff viewer.
  - Esc key handler to exit.
  - CSS classes in `src/renderer/src/theme.css` with fade-in animation.

### Wiring
- App.tsx: `reviewModeItem` state, subscribes to `IReviewModeService.onStateChange()`, renders `ReviewModeOverlay` conditionally over main panel.
- InboxView `onClickItem`: when item kind is `pr-awaiting-review`, resolves the PR data from `prAwaitingReview` state and calls `reviewModeService.enter()`.
- i18n keys added to `src/renderer/src/i18n/en.json` under `reviewMode.*`.

### Visual evidence
- Scenario registered in `src/visual-evidence/scenario-registry.ts` for `gh-151-review-mode-from-notification`.
- Scenario exercises: click PR item, verify overlay opens, verify PR identity, press Esc, verify overlay closes.
- evidence.json stored in the change folder with assertion results and PR-ready markdown.

## Scope exclusions

This change does NOT implement:
- PR queue strip (left sidebar of PRs in review mode)
- Diff viewing (agent briefing, raw diff, file tree)
- Approve / request-changes actions (chat-style verbs)
- Cross-PR conflict/duplicate detection

## Archival date

2026-07-20
