# Enter review mode from a PR notification

## Issue

GitHub Issue #151 -- As a user, I want clicking a PR item to open a focused review surface I enter and leave.

## Summary

Add a "PR review mode" that opens as an overlay over the main pane when the user clicks a `pr-awaiting-review` inbox item. The review mode presents a header with the PR identity and an action area, plus a body for content. Pressing Esc or the back button returns exactly to the previous view state. This is the shell/navigation layer only; the queue, diff view, and approve/request-changes actions are separate issues.

## Acceptance Criteria

1. Clicking a PR inbox item (in either InboxView or InboxPanel) opens review mode as a layer over the main pane.
2. Review mode renders a header area showing PR identity (repo, #number, title, author, risk verdict) and an action area placeholder.
3. Review mode renders a body/content area placeholder.
4. Esc key or a back/close button exits review mode and returns to exactly the view the user was in before entering it (same View state, scroll position preserved naturally by React's reconciliation).
5. Review mode is a transient surface, not a new top-level navigation pillar. It does not appear in the sidebar.
6. The mock adapter provides a working review mode experience in browser-only dev mode.

## Design Decisions

- **Overlay pattern, not a new View kind**: Review mode is a React component rendered as a fixed overlay on top of the main panel, driven by a `reviewModeItem` state variable in App.tsx. It is not added to the `View` union type because it is not a navigation destination; it is a mode entered from and returned to the current view.
- **PR identity header**: The header shows the PR repo, number, title, author, and the existing `PrVerdict` risk chip. The action area is a placeholder row (approve / request-changes / open-on-platform buttons that are wired in a separate issue).
- **Body placeholder**: The body is a placeholder section (agent briefing + raw diff toggle) that will be filled by a separate issue. This keeps the current change scoped to the shell/navigation behavior.
- **Esc/back exits**: A `useEffect` registers a `keydown` listener for Escape. A close button in the header also exits. Both set `reviewModeItem` to null, which unmounts the overlay and returns the user to the previous view state (which was never changed).
- **Previous view preserved**: Because review mode does not call `setView`, the underlying view state remains unchanged. When review mode closes, the main panel simply becomes visible again.
- **Single-PR entry**: This issue covers clicking a single PR item and opening review mode for that PR. The queue strip (left sidebar of PRs) is a separate issue.
- **No new IPC channels**: Review mode is purely a renderer-side concern. It reads data already available in the inbox item structure and the PR verdict service.

## Scope

This change does NOT implement:
- PR queue strip (left sidebar of PRs in review mode)
- Diff viewing (agent briefing, raw diff, file tree)
- Approve / request-changes actions (chat-style verbs)
- Cross-PR conflict/duplicate detection
