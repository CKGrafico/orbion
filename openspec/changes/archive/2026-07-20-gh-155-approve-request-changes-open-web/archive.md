# Archive — gh-155: Approve / request changes from review mode, plus open on web

## Change Summary

Added approve and request-changes actions to PR review mode so users can submit reviews without leaving the overlay, plus an "Open on web" button on both the review mode header and inbox PR items that launches the PR URL in the system browser.

## Acceptance Criteria Met

1. **Approve submits an approving review via the platform CLI** - The `submit-pr-review` infra action runs `gh pr review --approve` (GitHub) or `az repos pr set-vote --vote approve` (ADO). On success, the PR is marked disposed in the review queue and the inbox item is resolved with reason `pr-resolved`.

2. **Request changes prompts for a comment and submits it** - The Request Changes button toggles an inline comment textarea in the review mode header. Submitting calls `submit-pr-review` with `event: REQUEST_CHANGES` and optional body text.

3. **Results reflect on the queue strip and resolve the inbox item** - After successful submission, `markDisposed()` updates the queue strip (check icon appears), and the corresponding inbox item is auto-resolved with `pr-resolved` reason.

4. **Platform differences handled by the platform adapter** - GitHub uses `gh pr review`, ADO uses `az repos pr set-vote`. The main process resolves the platform CLI dynamically. If the resolved CLI is unsupported, the handler returns an error.

5. **Unsupported operations are hidden, not faked** - If no supported platform CLI is available, the handler returns an error. The UI displays the error message; no fake success is emitted.

6. **Open on web launches the PR URL in the default browser** - Both the review mode header and inbox PR items have an "Open on web" button. The review mode uses the `open-pr-in-browser` infra action (which calls `shell.openExternal` with URL protocol validation). Inbox items use `window.open` directly.

## Implementation Details

- **Shared types**: Added `submit-pr-review` and `open-pr-in-browser` to `InfraAction` union. Added `SubmitPrReviewParams`, `SubmitPrReviewResult`, `PrReviewEvent`, and `OpenPrInBrowserParams` interfaces in `src/shared/ipc.ts`.
- **Main process**: Two new infra action handlers in `src/main/index.ts`. `handleSubmitPrReview` runs `gh pr review` (GitHub) or `az repos pr set-vote` (ADO). `handleOpenPrInBrowser` validates URL protocol and calls `shell.openExternal`.
- **Renderer service**: `IReviewModeService` gained `submitReview()` and `openOnWeb()` methods. The `submitReview` implementation calls the infra action, marks the PR as disposed, and resolves the inbox item.
- **Review mode UI**: Approve and Request Changes buttons in the header, with an inline comment textarea for request-changes. After successful review, a "Reviewed" badge appears.
- **Inbox UI**: "Open on web" (ExternalLink icon) button on PR-awaiting-review items in both InboxView and InboxPanel.
- **i18n**: Added keys for approve, request-changes, comment placeholder, submit, cancel, disposed badge, and open-on-web actions.
- **Mock adapter**: MockInfraService handles `submit-pr-review` and `open-pr-in-browser`. MockReviewModeService implements `submitReview` and `openOnWeb`.
- **CSS**: Styles for approve/request-changes buttons, comment bar, disposed badge, submit error display.

## Files Changed

- `src/shared/ipc.ts`
- `src/main/index.ts`
- `src/main/ipc-validation.ts`
- `src/renderer/src/services/interfaces.ts`
- `src/renderer/src/services/impl/ReviewModeService.ts`
- `src/renderer/src/features/review/ReviewModeOverlay.tsx`
- `src/renderer/src/features/inbox/InboxView.tsx`
- `src/renderer/src/features/inbox/InboxPanel.tsx`
- `src/renderer/src/i18n/en.json`
- `src/renderer/src/services/mock/MockServices.ts`
- `src/renderer/src/theme.css`
