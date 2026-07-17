# Inbox surface above projects, with an unread badge entry point

## Summary

Add a fleet-wide inbox view that appears above/outside project scope in the sidebar, with a sidebar entry that shows an unread count badge (hidden at zero) and opens the inbox view. The empty state says "The fleet is quiet."

## Motivation

Users need a single place where everything that happened while they weren't looking lands — reachable from the sidebar with a visible indicator of how much needs their attention.

## Acceptance criteria

- [x] An inbox view exists above/outside project scope, listing notification items newest-first
- [x] Each item has an envelope (icon by type, title, short description, source project/instance, timestamp)
- [x] A sidebar Inbox entry above the projects list shows an unread count badge (hidden at zero) and opens the view
- [x] Empty state says "the fleet is quiet"

## Design

### Inbox sidebar entry

A new entry rendered at the top of the `<Sidebar>` component (above the search input and projects tree). It consists of:
- An Inbox icon (amber `--accent-infra` color)
- An "Inbox" label
- A count badge (visible only when count > 0, using the same amber accent style)
- A thin divider separating it from the projects section below

Clicking navigates to `{ kind: "inbox" }` view.

### InboxView component

A dedicated full-panel view (`InboxView`) rendered in the main panel when `view.kind === "inbox"`. Features:
- Header with Inbox icon, title, count badge, and Active/Done tabs
- Description subtitle ("Fleet-wide notifications — things that happened while you weren't looking.")
- Notification item list (newest-first), each showing:
  - Type-specific icon (failed-loop: XCircle/red, finished-loop: CheckCircle2/green, breach: AlertTriangle/amber, offline: WifiOff/blue)
  - Title (loop description or environment name)
  - Detail line (exit code, run count, duration)
  - Source label (project name on instance name)
  - Timestamp (relative, e.g. "5m ago")
  - Inline action buttons (Run now, Pause, Resume, Restart, Dismiss) 
  - Chevron indicating click-through navigation
- Conversational fleet query composer at the bottom
- Empty state with Inbox icon and "The fleet is quiet — nothing needs you right now."
- Done tab showing auto-resolved items

### Navigation

- Added `{ kind: "inbox" }` to the View discriminated union
- Inbox view bypasses instance/detail header rendering
- Inbox view has its own header built into the component
- InfraChatPanel is hidden when inbox view is active
- Deep-link navigation for inbox-item notifications now navigates to inbox view

## Files changed

- `src/renderer/src/features/inbox/InboxView.tsx` — New component (full inbox view for main panel)
- `src/renderer/src/App.tsx` — Added inbox view kind, InboxView import/rendering, inbox item count computation, removed InboxPanel from sidebar
- `src/renderer/src/components/Sidebar.tsx` — Added inbox entry with badge, View kind update, inboxItemCount prop
- `src/renderer/src/i18n/en.json` — Added sidebar.inbox, inbox.viewTitle, inbox.viewDescription, inbox.emptyMessage update, inbox.itemSourceProject
- `src/renderer/src/theme.css` — CSS for sidebar inbox entry, divider, inbox view, inbox items, empty state
